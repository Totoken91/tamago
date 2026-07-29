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

export const STORAGE_KEY = 'tamalove.save.v1';
