// ============================================================================
//  main.js — Point d'entrée. Met en place la scène Three.js, le post-process
//  (bloom + vignette), la boucle de rendu (delta time), les interactions et
//  l'UI. « TamaLove » : une créature qui se nourrit de l'amour qu'on lui porte.
// ============================================================================
import * as THREE from 'three';
import { LOVE, ACTIONS, MOODS, MOOD_STYLE, HEARTS, SWEET_WORDS, MOOD_TEXTS,
  BOND, EVOLUTION, LIVING, DAYNIGHT, MINIGAME, GOLDEN, ACHIEVEMENTS } from './config.js';
import { loadState, saveState } from './storage.js';
import { Creature } from './creature.js';
import { Hearts } from './hearts.js';
import { FloatingText } from './floatingText.js';
import { Audio } from './audio.js';
import { CatchGame, spawnGolden } from './minigame.js';

// ---------------------------------------------------------------------------
//  Éléments DOM
// ---------------------------------------------------------------------------
const canvas   = document.getElementById('scene');
const loaderEl = document.getElementById('loader');
const wordsLayer = document.getElementById('words');
const gaugeFill = document.getElementById('gauge-fill');
const gaugePct = document.getElementById('gauge-pct');
const nameInput = document.getElementById('pet-name');
const moodLabel = document.getElementById('mood-label');
const moodText = document.getElementById('mood-text');
const toastEl = document.getElementById('toast');
const hint = document.getElementById('hint');
const bondLvlEl = document.getElementById('bond-lvl');
const bondFillEl = document.getElementById('bond-fill');
const daysEl = document.getElementById('days');
const streakEl = document.getElementById('streak');
const thoughtEl = document.getElementById('thought');
const zzzEl = document.getElementById('zzz');
const daynightEl = document.getElementById('daynight');
const minigameEl = document.getElementById('minigame');
const soundBtn = document.getElementById('btn-sound');

// ---------------------------------------------------------------------------
//  Systèmes (son, mini-jeu)
// ---------------------------------------------------------------------------
const audio = new Audio();
const catchGame = new CatchGame(minigameEl, audio);
soundBtn.textContent = audio.muted ? '🔇' : '🔊';

// ---------------------------------------------------------------------------
//  État de jeu
// ---------------------------------------------------------------------------
const saved = loadState();
const state = {
  love: saved.love,
  displayLove: saved.love,   // valeur lissée affichée dans la jauge
  name: saved.name,
  cooldowns: { hug: 0, compliment: 0, play: 0 }, // timestamps de fin (s)
  clock: 0,
  currentMood: moodFor(saved.love),
  // lien / progression
  bondXp: saved.bondXp,
  bondLevel: 1,
  daysTogether: saved.daysTogether,
  streak: saved.streak,
  achievements: saved.achievements,
  stats: saved.stats,
  // vie
  asleep: false,
  asking: false,
  askDeadline: 0,
};
nameInput.value = state.name;

// ---------------------------------------------------------------------------
//  Three.js — renderer, scène, caméra
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.position.set(0, 0, 6);

const BG_Z = -3; // plan de fond (chambre)

// ---------------------------------------------------------------------------
//  Chargement des textures (écran de chargement)
// ---------------------------------------------------------------------------
const manager = new THREE.LoadingManager();
const texLoader = new THREE.TextureLoader(manager);

let bgMesh, creature, hearts, floating;

function configureTexture(t) {
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter; // net en réduction
  t.magFilter = THREE.LinearFilter;             // pas de flou, pas de pixel art
  t.generateMipmaps = true;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

const roomTex = texLoader.load('./assets/room.png', configureTexture);
const petTex = texLoader.load('./assets/tamagogo.png', configureTexture);

/**
 * Mesure la boîte englobante du corps opaque d'un sprite (ignore la marge
 * transparente et le halo). Rend l'échelle/pose robustes à n'importe quel PNG.
 * @returns {{L,R,T,B,cx,cy,w,h}} fractions 0..1, y depuis le haut
 */
function computeContentBox(image, threshold = 40) {
  const W = image.width, H = image.height;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const d = ctx.getImageData(0, 0, W, H).data;
  let minx = W, miny = H, maxx = 0, maxy = 0, found = false;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] >= threshold) {
        found = true;
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
      }
    }
  }
  if (!found) return { L: 0, R: 1, T: 0, B: 1, cx: 0.5, cy: 0.5, w: 1, h: 1 };
  const L = minx / W, R = (maxx + 1) / W, T = miny / H, B = (maxy + 1) / H;
  return { L, R, T, B, cx: (L + R) / 2, cy: (T + B) / 2, w: R - L, h: B - T };
}

const bootStart = performance.now();
manager.onLoad = () => {
  buildScene();
  wireUI();
  resize();
  welcomeBack();
  requestAnimationFrame(loop);
  // garde le splash visible un court instant (évite un flash sur chargement rapide)
  const wait = Math.max(0, 850 - (performance.now() - bootStart));
  setTimeout(() => loaderEl.classList.add('hidden'), wait);
};

// ---------------------------------------------------------------------------
//  Construction de la scène
// ---------------------------------------------------------------------------
function buildScene() {
  // Fond : chambre (plane, ajusté en « cover » au resize)
  const bgMat = new THREE.MeshBasicMaterial({ map: roomTex });
  bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bgMat);
  bgMesh.position.z = BG_Z;
  scene.add(bgMesh);

  // Créature — mesure du corps visible pour un cadrage/pose corrects
  const contentBox = computeContentBox(petTex.image);
  creature = new Creature(scene, petTex, contentBox);
  creature.applyMood(state.currentMood);

  // Particules de cœurs + calque des mots doux
  hearts = new Hearts(scene);
  floating = new FloatingText(wordsLayer);

  // petit hook de debug (utilisé par le smoke-test, sans effet en prod)
  window.__debugHearts = () => hearts.pool.filter((s) => s.visible).length;
}

// ---------------------------------------------------------------------------
//  Mise en page « responsive » (cover du fond, échelle & position créature)
// ---------------------------------------------------------------------------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  // pixelRatio plafonné à 1.75 : net sans surcharger les écrans très denses
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  if (!bgMesh) return;

  // --- cover-fit du fond au plan BG_Z --------------------------------------
  const distBg = camera.position.z - BG_Z;
  const vhBg = 2 * Math.tan((camera.fov * Math.PI / 180) / 2) * distBg;
  const vwBg = vhBg * camera.aspect;
  const texAspect = roomTex.image.width / roomTex.image.height;
  let pw = vwBg, ph = vwBg / texAspect;
  if (ph < vhBg) { ph = vhBg; pw = vhBg * texAspect; }
  bgMesh.scale.set(pw * 1.12, ph * 1.12, 1); // marge pour le parallaxe

  // --- échelle & position de la créature (plan z=0) ------------------------
  const distC = camera.position.z;
  const vhC = 2 * Math.tan((camera.fov * Math.PI / 180) / 2) * distC;

  // hauteur cible du CORPS VISIBLE + marge basse selon le format
  // (portrait mobile = plus de place sous la créature pour les boutons).
  const portrait = h > w;
  const heightFrac = w < 640 ? (portrait ? 0.30 : 0.40) : 0.46;
  const targetHeight = vhC * heightFrac;
  creature.setContentHeight(targetHeight);

  // posée sur le tapis : bas VISIBLE du corps au-dessus de la barre d'action.
  const bottomMargin = vhC * (w < 640 ? 0.22 : 0.16);
  const contentBottomY = -vhC / 2 + bottomMargin;      // où poser les « pieds »
  creature.home.y = contentBottomY - creature.contentBottomOffset;
  creature.home.x = -creature.contentXOffset;          // centre le corps visible
}
window.addEventListener('resize', resize);
// mobile : recadrer quand l'orientation change ou que la barre d'URL apparaît/disparaît
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resize);
  window.visualViewport.addEventListener('scroll', resize);
}
// évite le menu contextuel / la sélection lors d'un appui long sur la créature
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------------------
//  Interactions — parallaxe, caresse (raycast), jeu (suivi curseur)
// ---------------------------------------------------------------------------
const pointer = new THREE.Vector2(0, 0);        // normalisé -1..1 (parallaxe)
const ndc = new THREE.Vector2();                // pour le raycaster
const parallax = new THREE.Vector2(0, 0);
const raycaster = new THREE.Raycaster();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // z=0
let isPointerDown = false;
let lastCaress = 0;

function updatePointer(e) {
  const x = (e.touches ? e.touches[0].clientX : e.clientX);
  const y = (e.touches ? e.touches[0].clientY : e.clientY);
  pointer.set((x / window.innerWidth) * 2 - 1, -((y / window.innerHeight) * 2 - 1));
  ndc.copy(pointer);
}

function worldAtPointer() {
  raycaster.setFromCamera(ndc, camera);
  const p = new THREE.Vector3();
  raycaster.ray.intersectPlane(dragPlane, p);
  return p;
}

function hitCreature() {
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObject(creature.mesh, false).length > 0;
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();                       // pas de sélection/scroll sur tactile
  audio.unlock();                           // débloque le son au 1er geste
  updatePointer(e);
  isPointerDown = true;
  if (hitCreature()) doCaress(true);
}, { passive: false });
window.addEventListener('pointermove', (e) => {
  updatePointer(e);
  if (creature) creature.setLook(pointer.x, pointer.y);   // suivi du regard
  if (isPointerDown && creature && hitCreature()) { e.preventDefault(); doCaress(false); }
}, { passive: false });
window.addEventListener('pointerup', () => { isPointerDown = false; });
window.addEventListener('pointercancel', () => { isPointerDown = false; });

// ---------------------------------------------------------------------------
//  Actions de jeu
// ---------------------------------------------------------------------------
function addLove(amount) {
  state.love = Math.max(LOVE.MIN, Math.min(LOVE.MAX, state.love + amount));
}

function emitHearts(spec, big = false) {
  const c = creature.worldCenter;
  hearts.burst(c, spec, false);
  if (big) creature.pop(0.16);
}

function doCaress(strong) {
  const now = performance.now();
  if (now - lastCaress < 120) return;     // limite le débit pendant le drag
  lastCaress = now;
  addLove(ACTIONS.caress.gain);
  addBond(BOND.XP.caress);
  creature.pop(strong ? 0.13 : 0.08);
  hearts.burst(creature.worldCenter, HEARTS.caress);
  audio.caress();
  fulfillAsk();                            // caresser compte comme réponse
  if (hint) hint.classList.add('gone');
}

function doHug() {
  if (state.clock < state.cooldowns.hug) return;
  state.cooldowns.hug = state.clock + ACTIONS.hug.cd;
  addLove(ACTIONS.hug.gain);
  addBond(BOND.XP.hug);
  state.stats.hugs++;
  creature.pop(0.28);
  hearts.burst(creature.worldCenter, HEARTS.hug);
  audio.hug();
  if (navigator.vibrate) navigator.vibrate(30);   // haptique mobile
  fulfillAsk();
  checkAchievements();
}

function doCompliment() {
  if (state.clock < state.cooldowns.compliment) return;
  state.cooldowns.compliment = state.clock + ACTIONS.compliment.cd;
  addLove(ACTIONS.compliment.gain);
  addBond(BOND.XP.compliment);
  state.stats.compliments++;
  creature.pop(0.14);
  hearts.burst(creature.worldCenter, HEARTS.compliment);
  audio.compliment();

  // mot doux flottant, positionné au-dessus de la créature (projeté écran)
  const word = SWEET_WORDS[(Math.random() * SWEET_WORDS.length) | 0];
  const p = creature.worldCenter.clone();
  p.y += creature._worldWidth * creature.baseAspect * 0.45;
  p.project(camera);
  floating.spawn(word, {
    x: (p.x * 0.5 + 0.5) * window.innerWidth,
    y: (-p.y * 0.5 + 0.5) * window.innerHeight,
  });
  checkAchievements();
}

// « Jouer » lance désormais le mini-jeu attrape-cœurs.
function doPlay() {
  if (state.clock < state.cooldowns.play || catchGame.active) return;
  if (state.asleep) { showToast(`${state.name} dort… 💤`); return; }
  state.cooldowns.play = state.clock + MINIGAME.cd + MINIGAME.DURATION;
  creature.pop(0.14);
  catchGame.start(
    () => { addLove(MINIGAME.LOVE_PER_CATCH); hearts.burst(creature.worldCenter, HEARTS.play); },
    (score) => {
      addBond(BOND.XP.minigame);
      state.stats.minigames++;
      showToast(`Bien joué ! ${score} cœur${score > 1 ? 's' : ''} attrapé${score > 1 ? 's' : ''} 🎈`);
      audio.sparkle();
      checkAchievements();
    }
  );
}

// ---------------------------------------------------------------------------
//  UI — boutons, cooldowns, nom, humeur
// ---------------------------------------------------------------------------
function wireUI() {
  document.getElementById('btn-hug').addEventListener('click', doHug);
  document.getElementById('btn-compliment').addEventListener('click', doCompliment);
  document.getElementById('btn-play').addEventListener('click', doPlay);

  soundBtn.addEventListener('click', () => {
    audio.unlock();
    const muted = audio.toggleMute();
    soundBtn.textContent = muted ? '🔇' : '🔊';
    if (!muted) audio.sparkle();
  });

  nameInput.addEventListener('input', () => {
    state.name = nameInput.value.slice(0, 16) || 'Mochi';
    saveState(snapshot());
  });
  nameInput.addEventListener('blur', () => {
    if (!nameInput.value.trim()) { nameInput.value = state.name = 'Mochi'; }
  });
}

const btnEls = {
  hug: () => document.getElementById('btn-hug'),
  compliment: () => document.getElementById('btn-compliment'),
  play: () => document.getElementById('btn-play'),
};

function updateCooldownUI() {
  for (const key of ['hug', 'compliment', 'play']) {
    const btn = btnEls[key]();
    const remaining = state.cooldowns[key] - state.clock;
    const total = key === 'play'
      ? MINIGAME.cd + MINIGAME.DURATION
      : ACTIONS[key].cd + (ACTIONS[key].duration || 0);
    const fill = btn.querySelector('.cd-fill');
    if (remaining > 0) {
      btn.classList.add('cooling');
      fill.style.transform = `scaleY(${Math.max(0, remaining / total)})`;
      btn.querySelector('.cd-num').textContent = Math.ceil(remaining) + 's';
    } else {
      btn.classList.remove('cooling');
      fill.style.transform = 'scaleY(0)';
      btn.querySelector('.cd-num').textContent = '';
    }
  }
}

// ---------------------------------------------------------------------------
//  Humeur
// ---------------------------------------------------------------------------
function moodFor(love) {
  for (const m of MOODS) if (love >= m.min) return m.key;
  return 'needy';
}

let moodTextTimer = 0;
function refreshMoodText(force) {
  const arr = MOOD_TEXTS[state.currentMood];
  const phrase = arr[(Math.random() * arr.length) | 0];
  moodText.textContent = `${state.name} ${phrase}`;
}

function updateMood() {
  const m = moodFor(state.love);
  if (m !== state.currentMood) {
    state.currentMood = m;
    creature.applyMood(m);
    moodLabel.textContent = MOOD_STYLE[m].label;
    document.body.dataset.mood = m;
    refreshMoodText(true);
    // petite réaction visuelle au changement de palier
    creature.pop(m === 'radiant' ? 0.2 : 0.1);
  }
}

// ---------------------------------------------------------------------------
//  Message « il t'attendait »
// ---------------------------------------------------------------------------
function welcomeBack() {
  moodLabel.textContent = MOOD_STYLE[state.currentMood].label;
  document.body.dataset.mood = state.currentMood;
  refreshMoodText(true);
  applyBond(true);        // fixe niveau + évolution sans célébration
  updateDayNight(true);
  if (saved.isNew) {
    showToast(`Voici ${state.name}. Prends soin de lui avec de l'amour 💚`);
  } else if (saved.newDay) {
    const s = state.streak > 1 ? ` · série de ${state.streak} 🔥` : '';
    showToast(`Jour ${state.daysTogether} ensemble${s} 💚`);
  } else if (saved.elapsed > 120) {
    const mins = Math.round(saved.elapsed / 60);
    const human = mins < 60 ? `${mins} min` : `${Math.round(mins / 60)} h`;
    showToast(`${state.name} t'attendait depuis ${human} 💚`);
  }
  checkAchievements(true);  // silencieux au boot (marque les déjà acquis)
}

let toastTimer = 0;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  toastTimer = 5;
}

// ---------------------------------------------------------------------------
//  Lien (bond) permanent + évolution
// ---------------------------------------------------------------------------
function bondLevelForXp(xp) {
  let lvl = 1;
  for (let i = 0; i < BOND.LEVELS.length; i++) if (xp >= BOND.LEVELS[i]) lvl = i + 1;
  return lvl;
}
function evoForLevel(level) {
  let e = EVOLUTION[0];
  for (const s of EVOLUTION) if (level >= s.minLevel) e = s;
  return e;
}
/** Recalcule niveau/évolution ; célèbre les montées sauf si silent. */
function applyBond(silent) {
  const newLevel = bondLevelForXp(state.bondXp);
  const prevEvo = evoForLevel(state.bondLevel);
  if (newLevel !== state.bondLevel) {
    const leveledUp = newLevel > state.bondLevel;
    state.bondLevel = newLevel;
    const evo = evoForLevel(newLevel);
    creature.setEvolution(evo.scale, evo.glowBonus, evo.tint);
    resize();  // reposition (la taille a changé)
    if (leveledUp && !silent) {
      showToast(`Niveau de lien ${newLevel} ! ${evo !== prevEvo ? evo.label : '🔗'}`);
      audio.levelUp();
      creature.pop(0.26);
      for (let i = 0; i < 3; i++) setTimeout(() => hearts.burst(creature.worldCenter, HEARTS.hug), i * 120);
      checkAchievements();
    }
  } else {
    // s'assure que l'évolution est appliquée au boot
    const evo = evoForLevel(newLevel);
    creature.setEvolution(evo.scale, evo.glowBonus, evo.tint);
  }
  updateBondUI();
}
function addBond(xp) {
  state.bondXp += xp;
  applyBond(false);
}
function updateBondUI() {
  bondLvlEl.textContent = `Niv ${state.bondLevel}`;
  daysEl.textContent = `Jour ${state.daysTogether}`;
  streakEl.textContent = state.streak > 1 ? `série ${state.streak} 🔥` : '';
  // progression vers le niveau suivant
  const cur = BOND.LEVELS[state.bondLevel - 1] ?? 0;
  const next = BOND.LEVELS[state.bondLevel] ?? (cur + 1);
  const frac = Math.max(0, Math.min(1, (state.bondXp - cur) / (next - cur)));
  bondFillEl.style.transform = `scaleX(${state.bondLevel >= BOND.LEVELS.length ? 1 : frac})`;
}

// ---------------------------------------------------------------------------
//  Cycle jour / nuit (heure locale réelle) + sommeil
// ---------------------------------------------------------------------------
function updateDayNight(force) {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  const night = h >= DAYNIGHT.SLEEP_START || h < DAYNIGHT.SLEEP_END;
  if (night !== state.asleep || force) {
    state.asleep = night;
    creature.setSleep(night);
    zzzEl.classList.toggle('show', night);
    daynightEl.style.backgroundColor = night ? 'rgba(24,34,86,0.42)' : 'rgba(255,244,205,0.05)';
  }
}

// ---------------------------------------------------------------------------
//  Créature vivante : elle réclame un câlin
// ---------------------------------------------------------------------------
let askTimer = LIVING.ASK_MIN + Math.random() * (LIVING.ASK_MAX - LIVING.ASK_MIN);
function triggerAsk() {
  if (state.asking || state.asleep || catchGame.active) return;
  state.asking = true;
  state.askDeadline = state.clock + LIVING.ASK_WINDOW;
  const msgs = ['un câlin ? 🥺', 'coucou… 👀', 'tu me caresses ? 💗', 'joue avec moi ? 🎈'];
  thoughtEl.textContent = msgs[(Math.random() * msgs.length) | 0];
  thoughtEl.classList.add('show');
}
function fulfillAsk() {
  if (!state.asking) return;
  state.asking = false;
  thoughtEl.classList.remove('show');
  addLove(LIVING.ASK_BONUS_LOVE);
  addBond(BOND.XP.ask);
  creature.pop(0.2);
  hearts.burst(creature.worldCenter, HEARTS.hug);
  audio.sparkle();
  showToast('Merci ! 💞');
}
function updateAsk(dt) {
  if (state.asking && state.clock > state.askDeadline) {
    state.asking = false;
    thoughtEl.classList.remove('show');
  }
  if (!state.asking) {
    askTimer -= dt;
    if (askTimer <= 0) { triggerAsk(); askTimer = LIVING.ASK_MIN + Math.random() * (LIVING.ASK_MAX - LIVING.ASK_MIN); }
  }
  // position de la bulle au-dessus de la créature
  if (state.asking) positionAbove(thoughtEl, 0.5);
}
function positionAbove(el, extra) {
  const p = creature.worldCenter.clone();
  p.y += creature._worldWidth * creature.baseAspect * (0.42 + (extra || 0) * 0.1) * creature.evoScale;
  p.project(camera);
  el.style.left = (p.x * 0.5 + 0.5) * window.innerWidth + 'px';
  el.style.top = (-p.y * 0.5 + 0.5) * window.innerHeight + 'px';
}

// ---------------------------------------------------------------------------
//  Cœur doré surprise
// ---------------------------------------------------------------------------
let goldenTimer = GOLDEN.EVERY_MIN + Math.random() * (GOLDEN.EVERY_MAX - GOLDEN.EVERY_MIN);
function updateGolden(dt) {
  if (state.asleep || catchGame.active) return;
  goldenTimer -= dt;
  if (goldenTimer <= 0) {
    goldenTimer = GOLDEN.EVERY_MIN + Math.random() * (GOLDEN.EVERY_MAX - GOLDEN.EVERY_MIN);
    spawnGolden(minigameEl, audio, () => {
      addLove(GOLDEN.BONUS_LOVE);
      addBond(BOND.XP.golden);
      state.stats.goldenCaught++;
      showToast(`Cœur d'or ! +${GOLDEN.BONUS_LOVE} amour 🥇`);
      checkAchievements();
    });
  }
}

// ---------------------------------------------------------------------------
//  Petits succès
// ---------------------------------------------------------------------------
function achievementSnapshot() {
  return {
    hugs: state.stats.hugs, compliments: state.stats.compliments,
    minigames: state.stats.minigames, goldenCaught: state.stats.goldenCaught,
    love: state.love, bondLevel: state.bondLevel,
    daysTogether: state.daysTogether, streak: state.streak,
  };
}
let achievementQueue = [];
function checkAchievements(silent) {
  const snap = achievementSnapshot();
  for (const a of ACHIEVEMENTS) {
    if (state.achievements.includes(a.id)) continue;
    if (a.test(snap)) {
      state.achievements.push(a.id);
      if (!silent) achievementQueue.push(a.label);
    }
  }
}

// ---------------------------------------------------------------------------
//  Snapshot de sauvegarde
// ---------------------------------------------------------------------------
function snapshot() {
  return {
    love: state.love, name: state.name, bondXp: state.bondXp,
    daysTogether: state.daysTogether, streak: state.streak,
    achievements: state.achievements, stats: state.stats,
  };
}

// ---------------------------------------------------------------------------
//  Boucle de rendu — delta time
// ---------------------------------------------------------------------------
let last = performance.now();
let ambientTimer = 0;
let saveTimer = 0;
let bondPassive = 0;
let dayNightTimer = 15;
let achievementCooldown = 0;

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); // clamp anti-saut d'onglet
  last = now;
  state.clock += dt;

  // --- décroissance lente de l'amour (moins vite la nuit, elle dort) -------
  state.love = Math.max(LOVE.MIN, state.love - LOVE.DECAY_PER_SEC * (state.asleep ? 0.4 : 1) * dt);

  // --- lien passif : petit gain tant qu'on est présent ---------------------
  bondPassive += dt;
  if (bondPassive >= 60) { bondPassive -= 60; addBond(BOND.XP_PER_MIN_PRESENT); }

  // --- systèmes de vie -----------------------------------------------------
  updateAsk(dt);
  updateGolden(dt);
  dayNightTimer -= dt;
  if (dayNightTimer <= 0) { updateDayNight(false); dayNightTimer = 15; }

  // --- succès en attente (affichés un par un) ------------------------------
  achievementCooldown -= dt;
  if (achievementQueue.length && achievementCooldown <= 0) {
    showToast(`Succès : ${achievementQueue.shift()}`);
    audio.levelUp();
    achievementCooldown = 5.5;
  }

  updateMood();

  // --- parallaxe (fond + créature se décalent différemment) ----------------
  parallax.lerp(pointer, Math.min(1, dt * 4));
  camera.position.x = parallax.x * 0.28;
  camera.position.y = parallax.y * 0.2;
  camera.lookAt(0, parallax.y * 0.05, 0);
  bgMesh.position.x = -parallax.x * 0.22;
  bgMesh.position.y = -parallax.y * 0.16;

  // --- animations ----------------------------------------------------------
  creature.update(dt);
  hearts.update(dt);

  // cœurs d'ambiance quand la créature est heureuse (pas la nuit : elle dort)
  const amb = state.asleep ? 0 : MOOD_STYLE[state.currentMood].ambientHearts;
  if (amb > 0) {
    ambientTimer -= dt;
    if (ambientTimer <= 0) {
      const c = creature.worldCenter.clone();
      c.x += (Math.random() - 0.5) * creature._worldWidth;
      hearts.burst(c, HEARTS.ambient);
      ambientTimer = 1.4 / amb;
    }
  }
  // cœur brisé occasionnel quand en manque d'affection (éveillée)
  if (state.currentMood === 'needy' && !state.asleep) {
    ambientTimer -= dt;
    if (ambientTimer <= 0) {
      hearts.burst(creature.worldCenter, HEARTS.broken, true);
      ambientTimer = 3 + Math.random() * 2;
    }
  }

  // z z z suit la créature pendant le sommeil
  if (state.asleep) positionAbove(zzzEl, 0.2);

  // (le glow des états heureux est géré par la créature — sprite additif)

  // --- jauge lissée (lerp, pas de saut sec) --------------------------------
  state.displayLove += (state.love - state.displayLove) * Math.min(1, dt * 4);
  const pct = state.displayLove / LOVE.MAX;
  gaugeFill.style.transform = `scaleY(${pct})`;
  gaugePct.textContent = Math.round(state.displayLove) + '%';

  updateCooldownUI();

  // --- texte d'humeur qui tourne doucement ---------------------------------
  moodTextTimer -= dt;
  if (moodTextTimer <= 0) { refreshMoodText(); moodTextTimer = 6 + Math.random() * 4; }

  // --- toast ---------------------------------------------------------------
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) toastEl.classList.remove('show'); }

  // --- sauvegarde périodique -----------------------------------------------
  saveTimer -= dt;
  if (saveTimer <= 0) { saveState(snapshot()); saveTimer = 5; }

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// sauvegarde à la fermeture / mise en veille
window.addEventListener('beforeunload', () => saveState(snapshot()));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveState(snapshot());
});
