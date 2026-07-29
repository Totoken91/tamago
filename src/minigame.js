// ============================================================================
//  minigame.js — Mini-jeu « attrape les cœurs » (overlay DOM) + cœur doré.
//  DOM plutôt que WebGL : hit-test tactile fiable, mobile compris.
// ============================================================================
import { MINIGAME, GOLDEN } from './config.js';

export class CatchGame {
  constructor(layerEl, audio) {
    this.layer = layerEl;
    this.audio = audio;
    this.active = false;
  }

  /** Démarre une partie. onScore() à chaque cœur, onFinish(score) à la fin. */
  start(onScore, onFinish) {
    if (this.active) return;
    this.active = true;
    this.score = 0;
    this.time = 0;
    this.spawnT = 0;
    this.hearts = [];
    this.layer.classList.add('playing');
    this.layer.innerHTML = `
      <div class="mg-hud">
        <div class="mg-title">Attrape les cœurs 💗</div>
        <div class="mg-bar"><i></i></div>
        <div class="mg-score">0</div>
      </div>`;
    this.barFill = this.layer.querySelector('.mg-bar i');
    this.scoreEl = this.layer.querySelector('.mg-score');
    this._onScore = onScore;
    this._onFinish = onFinish;
    this.last = performance.now();
    this._raf = requestAnimationFrame(this._loop.bind(this));
  }

  _spawn() {
    const el = document.createElement('button');
    el.className = 'fall-heart';
    el.textContent = ['💗', '💖', '💓', '💕'][(Math.random() * 4) | 0];
    const x = 20 + Math.random() * (window.innerWidth - 60);
    const h = { el, x, y: -50, vy: 150 + Math.random() * 170, rot: (Math.random() - 0.5) * 120 };
    el.style.left = x + 'px';
    el.style.top = '-50px';
    const grab = (e) => { e.preventDefault(); e.stopPropagation(); this._catch(h); };
    el.addEventListener('pointerdown', grab);
    this.layer.appendChild(el);
    this.hearts.push(h);
  }

  _catch(h) {
    if (h.caught) return;
    h.caught = true;
    this.score++;
    this.scoreEl.textContent = this.score;
    if (this.audio) this.audio.catch_();
    this._onScore && this._onScore();
    h.el.classList.add('pop');
    setTimeout(() => h.el.remove(), 180);
    this.hearts = this.hearts.filter((x) => x !== h);
  }

  _loop(now) {
    if (!this.active) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;

    // apparition tant que le temps n'est pas écoulé
    if (this.time < MINIGAME.DURATION) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this._spawn(); this.spawnT = MINIGAME.SPAWN_EVERY; }
    }
    this.barFill.style.transform = `scaleX(${Math.max(0, 1 - this.time / MINIGAME.DURATION)})`;

    // chute
    const limit = window.innerHeight + 60;
    for (const h of this.hearts) {
      if (h.caught) continue;
      h.y += h.vy * dt;
      h.el.style.transform = `translateY(${h.y + 50}px) rotate(${h.rot * (h.y / 400)}deg)`;
    }
    this.hearts = this.hearts.filter((h) => {
      if (h.y > limit) { h.el.remove(); return false; }
      return true;
    });

    // fin : temps écoulé et plus de cœurs à l'écran
    if (this.time >= MINIGAME.DURATION && this.hearts.length === 0) return this._finish();
    this._raf = requestAnimationFrame(this._loop.bind(this));
  }

  _finish() {
    this.active = false;
    cancelAnimationFrame(this._raf);
    this.layer.classList.remove('playing');
    this.layer.innerHTML = '';
    this._onFinish && this._onFinish(this.score);
  }
}

/**
 * Fait apparaître un cœur doré qui dérive et disparaît après GOLDEN.LIFETIME.
 * onCaught() si le joueur le tape à temps. Retourne une fonction d'annulation.
 */
export function spawnGolden(layerEl, audio, onCaught) {
  const el = document.createElement('button');
  el.className = 'golden-heart';
  el.textContent = '💛';
  const fromLeft = Math.random() < 0.5;
  const y = 20 + Math.random() * (window.innerHeight * 0.5);
  el.style.top = y + 'px';
  el.style.setProperty('--from', fromLeft ? '-12vw' : '112vw');
  el.style.setProperty('--to', fromLeft ? '112vw' : '-12vw');
  el.style.animation = `golddrift ${GOLDEN.LIFETIME}s linear forwards`;
  let done = false;
  const finish = (caught) => {
    if (done) return; done = true;
    if (caught) {
      if (audio) audio.golden();
      el.classList.add('pop');
      onCaught && onCaught();
      setTimeout(() => el.remove(), 250);
    } else { el.remove(); }
  };
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); finish(true); });
  el.addEventListener('animationend', () => finish(false));
  layerEl.appendChild(el);
  return () => finish(false);
}
