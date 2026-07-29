// ============================================================================
//  creature.js — La créature : plane texturé + shader d'humeur (teinte /
//  saturation / luminosité), animation idle (respiration, clignement, bob),
//  squash & stretch élastique, tremblement, et mode « jeu » (suit le curseur).
// ============================================================================
import * as THREE from 'three';
import { MOOD_STYLE } from './config.js';

// Shader minimal : échantillonne la texture puis applique teinte, saturation
// et luminosité. Permet des couleurs vraiment « ternes » sur les états tristes.
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

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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
  constructor(scene, texture) {
    const w = 1;
    const h = texture.image.height / texture.image.width; // conserve le ratio
    const geo = new THREE.PlaneGeometry(w, h);

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: texture },
        uTint: { value: new THREE.Vector3(1, 1, 1) },
        uSaturation: { value: 1 },
        uBrightness: { value: 1 },
        uAlpha: { value: 1 },
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

  /** Impulsion de squash (rebond jelly). amount>0. */
  pop(amount) {
    this.squashVel += amount;
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
  }

  /** Taille de référence en unités monde (largeur du plane). */
  setScale(worldWidth) {
    this._worldWidth = worldWidth;
  }

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

    // ombre au sol : suit x, reste au niveau des « pieds », s'élargit au squash
    const footY = this.home.y - ww * this.baseAspect * 0.5 + ww * 0.04;
    this.shadow.position.set(this.pivot.position.x, footY, -0.05);
    this.shadow.scale.set(ww * 1.5 * (1 + sq * 0.5), ww * 0.34, 1);
    this.shadow.material.opacity = 0.22 * (1 - Math.min(0.6, this.playT > 0 ? 0.3 : 0));

    // --- lissage des uniforms du shader (transitions de palier fluides) ------
    const u = this.mat.uniforms;
    u.uTint.value.lerp(this._tint, Math.min(1, dt * 3));
    u.uSaturation.value += (this._sat - u.uSaturation.value) * Math.min(1, dt * 3);
    u.uBrightness.value += (this._bri - u.uBrightness.value) * Math.min(1, dt * 3);
  }

  /** Position monde approximative du « cœur » de la créature (pour émettre). */
  get worldCenter() {
    return new THREE.Vector3(
      this.pivot.position.x,
      this.pivot.position.y + (this._worldWidth || 1) * this.baseAspect * 0.15,
      this.pivot.position.z
    );
  }
}
