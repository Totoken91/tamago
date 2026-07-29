// ============================================================================
//  hearts.js — Système de particules de cœurs (pool de sprites réutilisés).
//  Les textures (cœur plein / cœur brisé) sont dessinées au runtime sur un
//  <canvas> : aucun asset externe requis.
// ============================================================================
import * as THREE from 'three';

const POOL_SIZE = 160;

/** Dessine un cœur doux et lumineux sur un canvas → THREE.Texture. */
function makeHeartTexture(broken = false) {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.translate(s / 2, s / 2 + 6);
  ctx.scale(1, 1);

  // halo doux
  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, s / 2);
  glow.addColorStop(0, 'rgba(255,255,255,0.55)');
  glow.addColorStop(0.4, 'rgba(255,255,255,0.12)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-s / 2, -s / 2 - 6, s, s);

  // silhouette du cœur (dessinée en blanc → teintée par le sprite)
  ctx.beginPath();
  const k = 34;
  ctx.moveTo(0, k * 0.9);
  ctx.bezierCurveTo(k * 1.7, -k * 0.4, k * 0.9, -k * 1.7, 0, -k * 0.5);
  ctx.bezierCurveTo(-k * 0.9, -k * 1.7, -k * 1.7, -k * 0.4, 0, k * 0.9);
  ctx.closePath();

  const g = ctx.createLinearGradient(0, -k, 0, k);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#e9e9e9');
  ctx.fillStyle = g;
  ctx.fill();

  // reflet
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(-k * 0.45, -k * 0.35, k * 0.28, k * 0.18, -0.5, 0, Math.PI * 2);
  ctx.fill();

  if (broken) {
    // fissure en zig-zag
    ctx.strokeStyle = 'rgba(40,40,50,0.85)';
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -k * 0.5);
    ctx.lineTo(-8, -6);
    ctx.lineTo(9, 6);
    ctx.lineTo(-4, k * 0.9);
    ctx.stroke();
  }

  const tex = new THREE.Texture(c);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Hearts {
  constructor(scene) {
    this.heartTex = makeHeartTexture(false);
    this.brokenTex = makeHeartTexture(true);
    this.pool = [];
    this.group = new THREE.Group();
    this.group.position.z = 0.6; // devant la créature
    scene.add(this.group);

    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.heartTex,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NormalBlending,
      });
      const sp = new THREE.Sprite(mat);
      sp.visible = false;
      sp.userData.life = 0;
      this.pool.push(sp);
      this.group.add(sp);
    }
  }

  _acquire() {
    for (const sp of this.pool) if (!sp.visible) return sp;
    return null; // pool plein : on saute (rare)
  }

  /**
   * Émet une bouffée de cœurs depuis un point monde.
   * @param {THREE.Vector3} origin
   * @param {object} spec { count, color:[r,g,b], size, spread }
   * @param {boolean} broken utilise la texture cœur brisé
   */
  burst(origin, spec, broken = false) {
    for (let i = 0; i < spec.count; i++) {
      const sp = this._acquire();
      if (!sp) return;
      sp.visible = true;
      sp.material.map = broken ? this.brokenTex : this.heartTex;
      sp.material.color.setRGB(spec.color[0], spec.color[1], spec.color[2]);
      sp.material.opacity = 0;

      const size = spec.size * (0.75 + Math.random() * 0.5);
      sp.scale.set(size, size, 1);
      sp.position.set(
        origin.x + (Math.random() - 0.5) * spec.spread,
        origin.y + (Math.random() - 0.5) * spec.spread * 0.4,
        origin.z
      );

      const d = sp.userData;
      d.life = 0;
      d.max = 1.1 + Math.random() * 0.8;
      d.vx = (Math.random() - 0.5) * 0.5;
      d.vy = 0.9 + Math.random() * 0.7;
      d.rot = (Math.random() - 0.5) * 2.5;
      d.baseSize = size;
      d.sway = Math.random() * Math.PI * 2;
    }
  }

  update(dt) {
    for (const sp of this.pool) {
      if (!sp.visible) continue;
      const d = sp.userData;
      d.life += dt;
      const t = d.life / d.max;
      if (t >= 1) { sp.visible = false; continue; }

      d.sway += dt * 3;
      sp.position.x += (d.vx + Math.sin(d.sway) * 0.35) * dt;
      sp.position.y += d.vy * dt;
      d.vy *= (1 - dt * 0.35); // léger ralentissement en montant

      // fondu : pop puis disparition
      const fadeIn = Math.min(1, t / 0.15);
      const fadeOut = Math.min(1, (1 - t) / 0.35);
      sp.material.opacity = fadeIn * fadeOut;

      // petit pop de taille au début
      const pop = 1 + Math.max(0, 0.25 - t) * 1.5;
      sp.scale.set(d.baseSize * pop, d.baseSize * pop, 1);
      sp.material.rotation += d.rot * dt;
    }
  }
}
