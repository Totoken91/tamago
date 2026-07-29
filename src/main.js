// ============================================================================
//  main.js — Point d'entrée. Met en place la scène Three.js, le post-process
//  (bloom + vignette), la boucle de rendu (delta time), les interactions et
//  l'UI. « TamaLove » : une créature qui se nourrit de l'amour qu'on lui porte.
// ============================================================================
import * as THREE from 'three';
import { LOVE, ACTIONS, MOODS, MOOD_STYLE, HEARTS, SWEET_WORDS, MOOD_TEXTS } from './config.js';
import { loadState, saveState } from './storage.js';
import { Creature } from './creature.js';
import { Hearts } from './hearts.js';
import { FloatingText } from './floatingText.js';

// ---------------------------------------------------------------------------
//  Éléments DOM
// ---------------------------------------------------------------------------
const canvas   = document.getElementById('scene');
const loaderEl = document.getElementById('loader');
const loaderBar = document.getElementById('loader-bar');
const wordsLayer = document.getElementById('words');
const gaugeFill = document.getElementById('gauge-fill');
const gaugePct = document.getElementById('gauge-pct');
const nameInput = document.getElementById('pet-name');
const moodLabel = document.getElementById('mood-label');
const moodText = document.getElementById('mood-text');
const toastEl = document.getElementById('toast');
const hint = document.getElementById('hint');

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
manager.onProgress = (_url, loaded, total) => {
  loaderBar.style.width = Math.round((loaded / total) * 100) + '%';
};
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

manager.onLoad = () => {
  buildScene();
  wireUI();
  resize();
  welcomeBack();
  // fondu de l'écran de chargement
  loaderEl.classList.add('hidden');
  requestAnimationFrame(loop);
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
  updatePointer(e);
  isPointerDown = true;
  if (hitCreature()) doCaress(true);
}, { passive: false });
window.addEventListener('pointermove', (e) => {
  updatePointer(e);
  if (isPointerDown && creature && hitCreature()) { e.preventDefault(); doCaress(false); }
  if (creature && creature.playT > 0) creature.setCursorWorld(worldAtPointer());
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
  creature.pop(strong ? 0.13 : 0.08);
  hearts.burst(creature.worldCenter, HEARTS.caress);
  if (hint) hint.classList.add('gone');
}

function doHug() {
  if (state.clock < state.cooldowns.hug) return;
  state.cooldowns.hug = state.clock + ACTIONS.hug.cd;
  addLove(ACTIONS.hug.gain);
  creature.pop(0.28);
  hearts.burst(creature.worldCenter, HEARTS.hug);
}

function doCompliment() {
  if (state.clock < state.cooldowns.compliment) return;
  state.cooldowns.compliment = state.clock + ACTIONS.compliment.cd;
  addLove(ACTIONS.compliment.gain);
  creature.pop(0.14);
  hearts.burst(creature.worldCenter, HEARTS.compliment);

  // mot doux flottant, positionné au-dessus de la créature (projeté écran)
  const word = SWEET_WORDS[(Math.random() * SWEET_WORDS.length) | 0];
  const p = creature.worldCenter.clone();
  p.y += creature._worldWidth * creature.baseAspect * 0.45;
  p.project(camera);
  floating.spawn(word, {
    x: (p.x * 0.5 + 0.5) * window.innerWidth,
    y: (-p.y * 0.5 + 0.5) * window.innerHeight,
  });
}

let playGainAcc = 0;
function doPlay() {
  if (state.clock < state.cooldowns.play) return;
  state.cooldowns.play = state.clock + ACTIONS.play.cd + ACTIONS.play.duration;
  creature.startPlay(ACTIONS.play.duration);
  creature.setCursorWorld(worldAtPointer());
  creature.pop(0.12);
  hearts.burst(creature.worldCenter, HEARTS.play);
  playGainAcc = 0;
}

// ---------------------------------------------------------------------------
//  UI — boutons, cooldowns, nom, humeur
// ---------------------------------------------------------------------------
function wireUI() {
  document.getElementById('btn-hug').addEventListener('click', doHug);
  document.getElementById('btn-compliment').addEventListener('click', doCompliment);
  document.getElementById('btn-play').addEventListener('click', doPlay);

  nameInput.addEventListener('input', () => {
    state.name = nameInput.value.slice(0, 16) || 'Mochi';
    saveState(state.love, state.name);
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
    const total = ACTIONS[key].cd + (ACTIONS[key].duration || 0);
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
  if (!saved.isNew && saved.elapsed > 120) {
    const mins = Math.round(saved.elapsed / 60);
    const human = mins < 60 ? `${mins} min` : `${Math.round(mins / 60)} h`;
    showToast(`${state.name} t'attendait depuis ${human} 💚`);
  } else if (saved.isNew) {
    showToast(`Voici ${state.name}. Prends soin de lui avec de l'amour 💚`);
  }
}

let toastTimer = 0;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  toastTimer = 5;
}

// ---------------------------------------------------------------------------
//  Boucle de rendu — delta time
// ---------------------------------------------------------------------------
let last = performance.now();
let ambientTimer = 0;
let saveTimer = 0;

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); // clamp anti-saut d'onglet
  last = now;
  state.clock += dt;

  // --- décroissance lente de l'amour ---------------------------------------
  state.love = Math.max(LOVE.MIN, state.love - LOVE.DECAY_PER_SEC * dt);

  // --- gain continu pendant le mode jeu ------------------------------------
  if (creature.playT > 0) {
    const perSec = ACTIONS.play.gain / ACTIONS.play.duration;
    addLove(perSec * dt);
    playGainAcc += dt;
    if (playGainAcc > 0.4) { hearts.burst(creature.worldCenter, HEARTS.play); playGainAcc = 0; }
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

  // cœurs d'ambiance quand la créature est heureuse
  const amb = MOOD_STYLE[state.currentMood].ambientHearts;
  if (amb > 0) {
    ambientTimer -= dt;
    if (ambientTimer <= 0) {
      const c = creature.worldCenter.clone();
      c.x += (Math.random() - 0.5) * creature._worldWidth;
      hearts.burst(c, HEARTS.ambient);
      ambientTimer = 1.4 / amb;
    }
  }
  // cœur brisé occasionnel quand en manque d'affection
  if (state.currentMood === 'needy') {
    ambientTimer -= dt;
    if (ambientTimer <= 0) {
      hearts.burst(creature.worldCenter, HEARTS.broken, true);
      ambientTimer = 3 + Math.random() * 2;
    }
  }

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
  if (saveTimer <= 0) { saveState(state.love, state.name); saveTimer = 5; }

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// sauvegarde à la fermeture / mise en veille
window.addEventListener('beforeunload', () => saveState(state.love, state.name));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveState(state.love, state.name);
});
