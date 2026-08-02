// ============================================================================
//  config.js — Toutes les constantes de gameplay & direction artistique.
//  Un seul endroit à toucher pour équilibrer le jeu.
// ============================================================================

export const LOVE = {
  MIN: 0,
  MAX: 100,
  START: 70,               // amour de départ pour une toute nouvelle créature

  // Décroissance lente « en direct » : l'affection s'estompe si on l'ignore.
  // ~100 points en 2h de jeu continu.
  DECAY_PER_SEC: 100 / (60 * 60 * 2),

  // Décroissance hors-ligne (au retour) : plus douce, et plafonnée pour ne
  // jamais retrouver une créature complètement vide → « il t'attendait ».
  OFFLINE_DECAY_PER_SEC: 100 / (60 * 60 * 4),
  OFFLINE_MAX_LOSS: 55,    // ne peut pas perdre plus que ça pendant l'absence
  OFFLINE_FLOOR: 8,        // ne descend jamais sous ce seuil hors-ligne
};

// Gains & cooldowns par action. cd = cooldown en secondes (0 = aucun).
export const ACTIONS = {
  caress:     { gain: 3,  cd: 0 },     // clic / drag sur la créature
  hug:        { gain: 18, cd: 12 },    // gros gain
  compliment: { gain: 9,  cd: 5 },     // gain moyen + mot doux
  play:       { gain: 14, cd: 10, duration: 5 }, // suit le curseur qq secondes
};

// Paliers émotionnels : [seuil min, clé d'état]. Trié du plus haut au plus bas.
export const MOODS = [
  { min: 80, key: 'radiant' },
  { min: 50, key: 'content' },
  { min: 20, key: 'melancholic' },
  { min: 0,  key: 'needy' },
];

// Réglages visuels par état émotionnel (pilotent le shader de la créature,
// la vitesse d'animation, le bloom et l'ambiance de particules).
// `glow` = intensité du halo doux derrière la créature (0..1), rendu par un
// simple sprite additif — pas de post-process coûteux.
export const MOOD_STYLE = {
  radiant:     { tint: [1.02, 1.03, 1.0], saturation: 1.05, brightness: 1.03, idle: 1.15, glow: 0.55, ambientHearts: 1.0,  label: 'Rayonnant ✨' },
  content:     { tint: [1.0, 1.0, 1.0],   saturation: 1.0,  brightness: 1.0,  idle: 1.0,  glow: 0.16, ambientHearts: 0.15, label: 'Tout va bien 🙂' },
  melancholic: { tint: [0.88, 0.92, 0.9], saturation: 0.6,  brightness: 0.9,  idle: 0.62, glow: 0.04, ambientHearts: 0.0,  label: 'Un peu triste 🌧️' },
  needy:       { tint: [0.82, 0.86, 0.86], saturation: 0.42, brightness: 0.82, idle: 0.5,  glow: 0.0,  ambientHearts: 0.0,  label: "En manque d'amour 💔" },
};

// Couleurs & quantités de cœurs par action (r,g,b en 0..1).
export const HEARTS = {
  caress:     { count: 3,  color: [1.0, 0.55, 0.72], size: 0.22, spread: 0.5 },
  hug:        { count: 16, color: [1.0, 0.32, 0.45], size: 0.34, spread: 1.1 },
  compliment: { count: 8,  color: [1.0, 0.62, 0.4],  size: 0.28, spread: 0.8 },
  play:       { count: 6,  color: [0.68, 0.86, 0.42], size: 0.26, spread: 0.7 },
  ambient:    { count: 1,  color: [1.0, 0.6, 0.75],   size: 0.24, spread: 1.4 },
  broken:     { count: 1,  color: [0.7, 0.72, 0.78],  size: 0.3,  spread: 0.4 },
};

// Petits mots doux affichés par l'action « Complimenter ».
export const SWEET_WORDS = [
  'Tu es adorable', 'Je t\'aime', 'Tu comptes pour moi', 'Reste avec moi',
  'Tu brilles', 'Mon petit trésor', 'Tu es parfait', 'Câlin ?',
  'Tu me rends heureux', 'Coucou toi', 'Tu es unique', 'Merci d\'être là',
];

// Textes d'humeur (choisis aléatoirement dans l'état courant).
export const MOOD_TEXTS = {
  radiant:     ['déborde de bonheur !', 'se sent tout plein d\'amour 💚', 'rayonne de joie', 'flotte sur un petit nuage'],
  content:     ['passe une bonne journée', 'se sent bien', 'aime ta présence', 'ronronne doucement'],
  melancholic: ['réclame un peu d\'attention…', 'se sent un peu seul', 'aimerait un câlin', 'te fait de grands yeux'],
  needy:       ['a vraiment besoin de toi 💔', 'se sent oublié…', 'tremblote un peu…', 'attend ton amour'],
};

// ============================================================================
//  Lien (bond) permanent + évolution
// ============================================================================
export const BOND = {
  // XP de lien gagné par action (ne descend jamais).
  XP: { caress: 1, hug: 6, compliment: 4, play: 5, ask: 10, golden: 8, minigame: 12 },
  XP_PER_MIN_PRESENT: 2,          // petit gain passif tant qu'on est là
  // Paliers de niveau : XP cumulé requis pour atteindre le niveau (index+1).
  LEVELS: [
    0, 40, 110, 220, 380, 600, 900, 1300, 1800, 2500,             // 1–10
    3400, 4500, 5800, 7300, 9000, 11000, 13300, 16000, 19200, 23000, // 11–20
    27400, 32400, 38100, 44600, 52000,                             // 21–25
  ],
};

// Stades d'évolution selon le niveau de lien. scale = taille relative,
// tint = multiplicateur couleur RVB appliqué sur le sprite (pas de nouvel
// asset : on teinte celui qu'on a), glowBonus = halo permanent, label
// affiché au moment de l'évolution.
export const EVOLUTION = [
  { minLevel: 1,  scale: 0.86, tint: [1.0, 1.0, 1.0],   glowBonus: 0.0,  label: 'Bébé 🌱' },
  { minLevel: 3,  scale: 1.0,  tint: [1.0, 1.0, 1.0],   glowBonus: 0.04, label: 'Jeune ✨' },
  { minLevel: 6,  scale: 1.12, tint: [1.0, 1.0, 1.0],   glowBonus: 0.12, label: 'Épanoui 🌟' },
  { minLevel: 9,  scale: 1.22, tint: [0.8, 1.05, 1.3],  glowBonus: 0.16, label: 'Radieux 💠' },   // bleu-cyan
  { minLevel: 12, scale: 1.30, tint: [0.65, 0.9, 1.45], glowBonus: 0.20, label: 'Céleste 🔵' },   // bleu profond
  { minLevel: 15, scale: 1.38, tint: [1.05, 0.75, 1.4], glowBonus: 0.24, label: 'Onirique 💜' },  // violet
  { minLevel: 18, scale: 1.45, tint: [1.5, 0.8, 0.6],   glowBonus: 0.28, label: 'Incandescent 🔥' }, // rouge-orangé
  { minLevel: 22, scale: 1.52, tint: [1.5, 1.3, 0.55],  glowBonus: 0.34, label: 'Doré 👑' },       // or
  { minLevel: 25, scale: 1.58, tint: [1.35, 1.15, 1.6], glowBonus: 0.4,  label: 'Légendaire 🌌' }, // irisé
];

// ============================================================================
//  Créature vivante : demandes, regard, sommeil
// ============================================================================
export const LIVING = {
  ASK_MIN: 35, ASK_MAX: 70,       // intervalle (s) entre deux demandes de câlin
  ASK_WINDOW: 9,                  // temps (s) pour répondre
  ASK_BONUS_LOVE: 10,             // bonus si on répond à temps
  LOOK_STRENGTH: 0.5,             // intensité du suivi du regard/corps vers le curseur
};

// Cycle jour/nuit basé sur l'heure locale réelle.
export const DAYNIGHT = {
  SLEEP_START: 22,                // heure de coucher
  SLEEP_END: 7,                   // heure de réveil
};

// ============================================================================
//  Mini-jeu « attrape-cœurs » + cœurs dorés
// ============================================================================
export const MINIGAME = {
  DURATION: 18,                   // durée d'une partie (s)
  SPAWN_EVERY: 0.62,              // intervalle d'apparition d'un cœur (s)
  LOVE_PER_CATCH: 1.2,            // amour par cœur attrapé
  cd: 8,                          // cooldown après la partie
};
export const GOLDEN = {
  EVERY_MIN: 55, EVERY_MAX: 120,  // intervalle d'apparition d'un cœur doré (s)
  LIFETIME: 7,                    // temps visible avant de disparaître (s)
  BONUS_LOVE: 12,
};

// ============================================================================
//  Petits succès
// ============================================================================
export const ACHIEVEMENTS = [
  { id: 'first_hug',    label: 'Premier câlin 🤗',        test: (s) => s.hugs >= 1 },
  { id: 'sweet_talker', label: 'Beau parleur 💬',          test: (s) => s.compliments >= 10 },
  { id: 'max_love',     label: 'Amour au maximum 💖',      test: (s) => s.love >= 99.5 },
  { id: 'bond_3',       label: 'Complices — niveau 3 🔗',  test: (s) => s.bondLevel >= 3 },
  { id: 'bond_6',       label: 'Âmes sœurs — niveau 6 🌟', test: (s) => s.bondLevel >= 6 },
  { id: 'week',         label: '7 jours ensemble 📅',      test: (s) => s.daysTogether >= 7 },
  { id: 'streak_3',     label: 'Fidèle — série de 3 🔥',   test: (s) => s.streak >= 3 },
  { id: 'player',       label: 'On a bien joué 🎈',        test: (s) => s.minigames >= 3 },
  { id: 'golden',       label: 'Chasseur de cœur d\'or 🥇', test: (s) => s.goldenCaught >= 1 },
];

export const STORAGE_KEY = 'tamalove.save.v1';
