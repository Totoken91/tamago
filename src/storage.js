// ============================================================================
//  storage.js — Persistance dans localStorage + calcul du temps écoulé,
//  des jours passés ensemble et de la série de visites (streak).
// ============================================================================
import { LOVE, STORAGE_KEY } from './config.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Index de jour local (minuit local) pour comparer les visites. */
function dayIndex(ts) {
  const d = new Date(ts);
  return Math.floor((ts - d.getTimezoneOffset() * 60000) / DAY_MS);
}

/**
 * Charge la sauvegarde, applique la décroissance hors-ligne et met à jour
 * les jours ensemble / la série de visites.
 */
export function loadState() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (_) {}

  const now = Date.now();
  const today = dayIndex(now);

  if (!raw || typeof raw.love !== 'number') {
    // toute nouvelle créature
    return {
      love: LOVE.START, name: 'Mochi', elapsed: 0, isNew: true,
      bondXp: 0, daysTogether: 1, streak: 1, newDay: true,
      achievements: [], stats: emptyStats(),
    };
  }

  const elapsed = Math.max(0, (now - (raw.ts || now)) / 1000);

  // décroissance douce et plafonnée pendant l'absence
  let loss = Math.min(elapsed * LOVE.OFFLINE_DECAY_PER_SEC, LOVE.OFFLINE_MAX_LOSS);
  let love = raw.love - loss;
  if (raw.love > LOVE.OFFLINE_FLOOR) love = Math.max(love, LOVE.OFFLINE_FLOOR);
  love = clamp(love, LOVE.MIN, LOVE.MAX);

  // jours ensemble + série (streak) basés sur le jour local
  const lastDay = typeof raw.lastDay === 'number' ? raw.lastDay : today;
  let daysTogether = raw.daysTogether || 1;
  let streak = raw.streak || 1;
  let newDay = false;
  if (today > lastDay) {
    newDay = true;
    daysTogether += 1;
    streak = today - lastDay === 1 ? streak + 1 : 1; // consécutif ?
  }

  return {
    love,
    name: (raw.name || 'Mochi').slice(0, 16),
    elapsed,
    isNew: false,
    bondXp: raw.bondXp || 0,
    daysTogether,
    streak,
    newDay,
    achievements: Array.isArray(raw.achievements) ? raw.achievements : [],
    stats: Object.assign(emptyStats(), raw.stats || {}),
  };
}

/** Sauvegarde l'état courant (objet snapshot). */
export function saveState(snap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      love: Math.round(snap.love * 100) / 100,
      name: snap.name,
      bondXp: Math.round(snap.bondXp || 0),
      daysTogether: snap.daysTogether || 1,
      streak: snap.streak || 1,
      lastDay: dayIndex(Date.now()),
      achievements: snap.achievements || [],
      stats: snap.stats || emptyStats(),
      ts: Date.now(),
    }));
  } catch (_) { /* stockage indisponible : on ignore */ }
}

function emptyStats() {
  return { hugs: 0, compliments: 0, minigames: 0, goldenCaught: 0 };
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
