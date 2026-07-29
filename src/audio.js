// ============================================================================
//  audio.js — Petits sons doux générés en WebAudio (aucun fichier requis).
//  Le contexte se débloque au premier geste utilisateur (politique navigateur).
// ============================================================================

const MUTE_KEY = 'tamalove.muted';

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = localStorage.getItem(MUTE_KEY) === '1';
  }

  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  /** À appeler sur le premier geste (pointerdown) pour autoriser le son. */
  unlock() { this._ensure(); }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    return this.muted;
  }

  // note douce (oscillateur + enveloppe)
  _tone(freq, t0, dur, { type = 'sine', gain = 0.25, glideTo = null } = {}) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  _play(fn) {
    if (this.muted || !this._ensure()) return;
    fn(this.ctx.currentTime);
  }

  // --- sons de jeu ---------------------------------------------------------
  caress() { this._play((t) => this._tone(520 + Math.random() * 80, t, 0.12, { type: 'sine', gain: 0.14, glideTo: 720 })); }
  hug()    { this._play((t) => { [392, 523, 659].forEach((f, i) => this._tone(f, t + i * 0.05, 0.4, { type: 'triangle', gain: 0.16 })); }); }
  compliment() { this._play((t) => { this._tone(880, t, 0.14, { type: 'sine', gain: 0.12, glideTo: 1320 }); this._tone(1320, t + 0.09, 0.18, { type: 'sine', gain: 0.08 }); }); }
  sparkle() { this._play((t) => { for (let i = 0; i < 4; i++) this._tone(1200 + i * 260, t + i * 0.04, 0.12, { type: 'sine', gain: 0.06 }); }); }
  catch_()  { this._play((t) => this._tone(660, t, 0.09, { type: 'square', gain: 0.06, glideTo: 990 })); }
  golden()  { this._play((t) => { [659, 988, 1319].forEach((f, i) => this._tone(f, t + i * 0.06, 0.3, { type: 'triangle', gain: 0.12 })); }); }
  levelUp() { this._play((t) => { [523, 659, 784, 1047].forEach((f, i) => this._tone(f, t + i * 0.09, 0.35, { type: 'triangle', gain: 0.16 })); }); }
}
