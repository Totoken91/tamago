// ============================================================================
//  creature.js — La créature : plane texturé + shader d'humeur (teinte /
//  saturation / luminosité), animation idle (respiration, clignement, bob),
//  squash & stretch élastique, tremblement, et mode « jeu » (suit le curseur).
// ============================================================================
import * as THREE from 'three';
import { MOOD_STYLE } from './config.js';

// Shader minimal : échantillonne la texture puis applique teinte, saturation
// et luminosité. Permet des couleurs vraiment « ternes » sur les états tristes.
/** Halo radial doux (blanc → transparent) pour le glow des états heureux. */
function makeGlowTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.35, 'rgba(232,255,168,0.55)');
  g.addColorStop(0.7, 'rgba(180,236,74,0.18)');
  g.addColorStop(1, 'rgba(180,236,74,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const t = new THREE.Texture(c);
  t.needsUpdate = true;
  return t;
}

/** Petite texture radiale sombre pour l'ombre de contact au sol. */
function makeShadowTexture() {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.9)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const t = new THREE.Texture(c);
  t.needsUpdate = true;
  return t;
}

// Vertex shader « jelly » : le haut du sprite (le cou + l'antenne-bulbe)
// ballotte tout seul → l'antenne gigote. Amplitude pilotée par uWobble.
const VERT = /* glsl */`
  uniform float uTime;
  uniform float uWobble;   // amplitude (idle + impulsions d'interaction)
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // poids qui monte vers le sommet : 0 en bas, ~1 au niveau de l'antenne
    float top = smoothstep(0.5, 1.0, uv.y);
    // ballant horizontal (deux fréquences → mouvement organique, pas mécanique)
    float sway = sin(uTime * 5.0 + uv.y * 6.0) * 0.62
               + sin(uTime * 8.3 + 1.7) * 0.38;
    pos.x += top * top * uWobble * sway;
    // léger sursaut vertical du bulbe
    pos.y += top * uWobble * 0.18 * sin(uTime * 4.2);
    // très léger balancement global (jelly) sur toute la hauteur
    pos.x += (uv.y - 0.5) * uWobble * 0.25 * sin(uTime * 1.3);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const FRAG = /* glsl */`
  uniform sampler2D uMap;
  uniform vec3  uTint;
  uniform float uSaturation;
  uniform float uBrightness;
  uniform float uAlpha;
  varying vec2 vUv;

  void main() {
    vec4 tex = texture2D(uMap, vUv);
    vec3 col = tex.rgb;
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(luma), col, uSaturation);   // désaturation
    col *= uTint * uBrightness;                // teinte + luminosité
    gl_FragColor = vec4(col, tex.a * uAlpha);
    #include <colorspace_fragment>
  }
`;

export class Creature {
  /**
   * @param {THREE.Texture} texture  sprite du perso (PNG transparent)
   * @param {object} contentBox  boîte englobante du corps visible en fractions
   *   {L,R,T,B,cx,cy,w,h} (0..1, y depuis le haut). Permet de dimensionner /
   *   poser n'importe quel PNG (avec marge transparente) correctement.
   */
  constructor(scene, texture, contentBox) {
    const w = 1;
    const h = texture.image.height / texture.image.width; // conserve le ratio
    // subdivisé pour que la déformation « jelly » de l'antenne soit fluide
    const geo = new THREE.PlaneGeometry(w, h, 18, 26);

    // boîte du contenu (par défaut : tout le cadre)
    this.content = contentBox || { L: 0, R: 1, T: 0, B: 1, cx: 0.5, cy: 0.5, w: 1, h: 1 };

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: texture },
        uTint: { value: new THREE.Vector3(1, 1, 1) },
        uSaturation: { value: 1 },
        uBrightness: { value: 1 },
        uAlpha: { value: 1 },
        uTime: { value: 0 },
        uWobble: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geo, this.mat);
    this.baseAspect = h; // hauteur pour un largeur=1
    this.pivot = new THREE.Group();       // porte position/scale globale
    this.pivot.add(this.mesh);
    scene.add(this.pivot);

    // halo doux derrière la créature (glow des états heureux) — additif, léger
    this.glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(), transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0,
    }));
    this.glowSprite.position.z = -0.1;    // derrière le corps
    scene.add(this.glowSprite);
    this.glow = 0;         // intensité courante (lissée)
    this._glowTarget = 0;  // intensité cible (selon l'humeur)

    // ombre de contact douce (ancre la créature au sol)
    this.shadow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeShadowTexture(), transparent: true, depthTest: false, depthWrite: false,
      opacity: 0.22, color: 0x3a5018,
    }));
    this.shadow.position.z = -0.05;
    scene.add(this.shadow);

    // état d'animation
    this.time = Math.random() * 10;
    this.home = new THREE.Vector3(0, 0, 0);
    this.target = this.home.clone();      // cible de déplacement (mode jeu)
    this.idleSpeed = 1;

    // squash & stretch élastique (ressort amorti autour de 0)
    this.squash = 0;
    this.squashVel = 0;

    // énergie de ballant de l'antenne (décroît ; relancée par les interactions)
    this.wobbleEnergy = 0;

    // clignement
    this.nextBlink = 1.5 + Math.random() * 3;
    this.blink = 0; // 0 = ouvert, 1 = fermé

    // tremblement (état « en manque »)
    this.tremble = 0;

    // mode jeu
    this.playT = 0;
    this.cursorWorld = new THREE.Vector3();

    // cibles lissées pour le shader (transitions douces entre paliers)
    this._tint = new THREE.Vector3(1, 1, 1);
    this._sat = 1;
    this._bri = 1;
  }

  /** Impulsion de squash (rebond jelly) + secousse de l'antenne. amount>0. */
  pop(amount) {
    this.squashVel += amount;
    this.wobbleEnergy += amount * 0.7;
  }

  /** Active le mode jeu : la créature suit le curseur pendant `duration` s. */
  startPlay(duration) {
    this.playT = duration;
  }

  setCursorWorld(v) { this.cursorWorld.copy(v); }

  /** Applique le style de l'humeur courante (cible lissée). */
  applyMood(moodKey) {
    const s = MOOD_STYLE[moodKey];
    this._tint.set(s.tint[0], s.tint[1], s.tint[2]);
    this._sat = s.saturation;
    this._bri = s.brightness;
    this.idleSpeed = s.idle;
    this.tremble = moodKey === 'needy' ? 1 : 0;
    this._glowTarget = s.glow;
  }

  /**
   * Dimensionne pour que le CORPS VISIBLE (pas le cadre transparent) fasse
   * `worldHeight` unités de haut.
   */
  setContentHeight(worldHeight) {
    this._worldWidth = worldHeight / (this.baseAspect * this.content.h);
  }

  // --- ancrages (monde) dérivés de la boîte du contenu ----------------------
  get _ww() { return this._worldWidth || 1; }
  /** décalage vertical centre-pivot → bas visible du corps (négatif = dessous). */
  get contentBottomOffset() { return this.baseAspect * (0.5 - this.content.B) * this._ww; }
  /** décalage vertical centre-pivot → centre visible du corps. */
  get contentCenterOffset() { return this.baseAspect * (0.5 - this.content.cy) * this._ww; }
  /** décalage horizontal centre-pivot → centre visible du corps. */
  get contentXOffset() { return (this.content.cx - 0.5) * this._ww; }

  update(dt) {
    this.time += dt * this.idleSpeed;

    // --- ressort de squash ---------------------------------------------------
    const stiffness = 90, damping = 11;
    this.squashVel += (-stiffness * this.squash - damping * this.squashVel) * dt;
    this.squash += this.squashVel * dt;

    // --- clignement (bref pincement vertical) --------------------------------
    this.nextBlink -= dt;
    if (this.nextBlink <= 0 && this.blink === 0) this.blink = 0.0001;
    if (this.blink > 0) {
      this.blink += dt * 8;
      if (this.blink >= Math.PI) { this.blink = 0; this.nextBlink = 2 + Math.random() * 3.5; }
    }
    const blinkSquash = this.blink > 0 ? Math.sin(this.blink) * 0.12 : 0;

    // --- respiration (scale sinusoïdal doux) ---------------------------------
    const breathe = Math.sin(this.time * 1.6) * 0.025;
    const breatheX = Math.sin(this.time * 1.6 + 0.6) * 0.018;

    // squash & stretch conserve ~ le volume : X et Y s'opposent
    const sq = this.squash;
    let sx = 1 + breatheX + sq * 0.6;
    let sy = 1 + breathe - sq * 0.6 - blinkSquash;

    // --- mode jeu : suit le curseur ------------------------------------------
    if (this.playT > 0) {
      this.playT -= dt;
      this.target.lerp(this.cursorWorld, Math.min(1, dt * 6));
    } else {
      this.target.lerp(this.home, Math.min(1, dt * 4));
    }

    // --- bob idle + suivi -----------------------------------------------------
    const bob = Math.sin(this.time * 1.6) * 0.02;
    const sway = Math.sin(this.time * 0.9) * 0.015;

    // --- tremblement (needy) --------------------------------------------------
    let tx = 0, ty = 0;
    if (this.tremble > 0) {
      tx = (Math.random() - 0.5) * 0.02 * this.tremble;
      ty = (Math.random() - 0.5) * 0.02 * this.tremble;
    }

    const ww = this._worldWidth || 1;
    this.pivot.position.set(
      (this.target.x + sway + tx) ,
      (this.target.y + bob + ty),
      this.target.z
    );
    this.pivot.scale.set(ww * sx, ww * sy, 1);
    this.mesh.rotation.z = Math.sin(this.time * 0.8) * 0.02;

    // ombre au sol : sous les « pieds » visibles du corps, s'élargit au squash
    const footY = this.home.y + this.baseAspect * (0.5 - this.content.B) * ww + ww * 0.02;
    this.shadow.position.set(this.pivot.position.x + this.contentXOffset, footY, -0.05);
    this.shadow.scale.set(ww * this.content.w * 1.2 * (1 + sq * 0.5), ww * this.content.w * 0.34, 1);
    this.shadow.material.opacity = 0.22 * (1 - Math.min(0.6, this.playT > 0 ? 0.3 : 0));

    // --- halo (glow) : intensité lissée + douce pulsation, centré sur le corps
    this.glow += (this._glowTarget - this.glow) * Math.min(1, dt * 2.5);
    const pulse = 1 + Math.sin(this.time * 1.8) * 0.06;
    const gs = ww * this.content.w * 2.5 * pulse;
    this.glowSprite.scale.set(gs, gs, 1);
    this.glowSprite.position.set(
      this.pivot.position.x + this.contentXOffset,
      this.pivot.position.y + this.contentCenterOffset,
      -0.1
    );
    this.glowSprite.material.opacity = this.glow * (0.9 + Math.sin(this.time * 1.8) * 0.1);

    // --- antenne « jelly » : ballant permanent + secousses d'interaction -----
    this.wobbleEnergy *= Math.max(0, 1 - dt * 3.5);      // décroissance douce
    const idleWobble = 0.03 * this.idleSpeed;            // gigote moins si triste
    const u = this.mat.uniforms;
    u.uTime.value = this.time;
    u.uWobble.value = idleWobble + this.wobbleEnergy;

    // --- lissage des uniforms du shader (transitions de palier fluides) ------
    u.uTint.value.lerp(this._tint, Math.min(1, dt * 3));
    u.uSaturation.value += (this._sat - u.uSaturation.value) * Math.min(1, dt * 3);
    u.uBrightness.value += (this._bri - u.uBrightness.value) * Math.min(1, dt * 3);
  }

  /** Position monde du « cœur » du corps visible (pour émettre les particules). */
  get worldCenter() {
    return new THREE.Vector3(
      this.pivot.position.x + this.contentXOffset,
      this.pivot.position.y + this.contentCenterOffset,
      this.pivot.position.z
    );
  }
}
