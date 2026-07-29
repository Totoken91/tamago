// ============================================================================
//  storage.js — Persistance dans localStorage + calcul du temps écoulé.
// ============================================================================
import { LOVE, STORAGE_KEY } from './config.js';

/**
 * Charge la sauvegarde et applique la décroissance hors-ligne.
 * @returns {{ love:number, name:string, elapsed:number, isNew:boolean }}
 */
export function loadState() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (_) {}

  if (!raw || typeof raw.love !== 'number') {
    return { love: LOVE.START, name: 'Mochi', elapsed: 0, isNew: true };
  }

  const now = Date.now();
  const elapsed = Math.max(0, (now - (raw.ts || now)) / 1000); // secondes absentes

  // Décroissance douce et plafonnée pendant l'absence.
  let loss = elapsed * LOVE.OFFLINE_DECAY_PER_SEC;
  loss = Math.min(loss, LOVE.OFFLINE_MAX_LOSS);
  let love = raw.love - loss;
  if (raw.love > LOVE.OFFLINE_FLOOR) love = Math.max(love, LOVE.OFFLINE_FLOOR);
  love = clamp(love, LOVE.MIN, LOVE.MAX);

  return {
    love,
    name: (raw.name || 'Mochi').slice(0, 16),
    elapsed,
    isNew: false,
  };
}

/** Sauvegarde l'état courant avec un timestamp. */
export function saveState(love, name) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      love: Math.round(love * 100) / 100,
      name,
      ts: Date.now(),
    }));
  } catch (_) { /* stockage indisponible : on ignore silencieusement */ }
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
