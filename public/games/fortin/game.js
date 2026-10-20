/* Fortín — game.it
 * Defensa de torres en un claro del bosque: los bichos salen de sus cuevas y caminan por el sendero hasta el tocón
 * donde viven los hongos. Se plantan hongos en el pasto (seis clases, tres niveles y dos especialidades cada una),
 * se llaman las oleadas antes de tiempo para ganar semillas, y hay dos poderes: lluvia y raíces. Cinco mapas con
 * estrellas y un modo infinito.
 * Simulación en shared/sim.js y datos en shared/data.js (puros, probados en tests/fortin.test.mjs); dibujos en art.js
 * y la vista en render.js.
 */
import { Game, T as TILE, makeWave, WAVE_GAP, EARLY_BONUS } from './shared/sim.js';
import { TOWERS, TOWER_IDS, ENEMIES, POWERS, MAPS, COLS, ROWS, LIVES } from './shared/data.js';
import { View } from './render.js';
import { towerIcon, bugIcon, paintGround, drawTower } from './art.js';
import { buildMap } from './shared/sim.js';
import { tone, noise, notes } from '/shared/sfx.js';

const G = window.GameIt;
const ID = 'fortin';
const $ = (id) => document.getElementById(id);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TOP = 56;
const FIXED = /[?&]fixed\b/.test(location.search);

const TXT = {
  title: { es: 'Fortín', en: 'Mushroom Fort' },
  tagline: { es: 'Los bichos vienen por el sendero. Plantá hongos y defendé el tocón.', en: 'Bugs are marching down the trail. Plant mushrooms and defend the stump.' },
  play: { es: 'Jugar', en: 'Play' },
  help: { es: 'Cómo se juega', en: 'How to play' },
  modeCamp: { es: 'Campaña', en: 'Campaign' },
  modeEndless: { es: 'Infinito', en: 'Endless' },
  campSub: { es: '{n} oleadas · estrellas según las vidas que te queden', en: '{n} waves · stars by lives left' },
  endlessSub: { es: 'Oleadas sin fin, cada vez más duras. Récord: {n} oleadas', en: 'Endless waves, harder and harder. Best: {n} waves' },
  endlessSub1: { es: 'Oleadas sin fin, cada vez más duras. Récord: 1 oleada', en: 'Endless waves, harder and harder. Best: 1 wave' },
  endlessLocked: { es: 'Ganá este mapa para jugarlo en modo infinito.', en: 'Win this map to play it in endless mode.' },
  locked: { es: 'Ganá el mapa anterior para abrirlo.', en: 'Win the previous map to unlock it.' },
  playSub: { es: '{m}', en: '{m}' },
  waveOf: { es: 'Oleada {n}/{t}', en: 'Wave {n}/{t}' },
  waveN: { es: 'Oleada {n}', en: 'Wave {n}' },
  start: { es: '¡Que vengan!', en: 'Bring them!' },
  callEarly: { es: 'Ya +{n}', en: 'Now +{n}' },
  incoming: { es: 'Vienen…', en: 'Incoming…' },
  pRain: { es: 'Lluvia', en: 'Rain' },
  pRoots: { es: 'Raíces', en: 'Roots' },
  aimRain: { es: 'Tocá donde querés que llueva', en: 'Tap where you want it to rain' },
  aimRoots: { es: 'Tocá donde querés las raíces (no atrapan a los que vuelan)', en: 'Tap where the roots should burst (they can’t catch flyers)' },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'Seguir', en: 'Resume' },
  restart: { es: 'Empezar el mapa de nuevo', en: 'Restart the map' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  won: { es: '¡El tocón está a salvo!', en: 'The stump is safe!' },
  lost: { es: 'Los bichos entraron al tocón', en: 'The bugs got into the stump' },
  wonSub: { es: 'Te quedaron {n} vidas.', en: 'You kept {n} lives.' },
  wonSub1: { es: 'Te quedó 1 vida.', en: 'You kept 1 life.' },
  lostSub: { es: 'Llegaste a la oleada {n} de {t}.', en: 'You reached wave {n} of {t}.' },
  endlessEnd: { es: 'Aguantaste {n} oleadas', en: 'You held out for {n} waves' },
  endlessEnd1: { es: 'Aguantaste 1 oleada', en: 'You held out for 1 wave' },
  endlessBest: { es: '¡Nuevo récord!', en: 'New record!' },
  endlessPrev: { es: 'Récord: {n}', en: 'Best: {n}' },
  next: { es: 'Siguiente mapa', en: 'Next map' },
  retry: { es: 'Jugar de nuevo', en: 'Play again' },
  menu: { es: 'Menú', en: 'Menu' },
  back: { es: '← volver', en: '← back' },
  sKills: { es: 'bichos', en: 'bugs' },
  sWaves: { es: 'oleadas', en: 'waves' },
  sTowers: { es: 'hongos', en: 'mushrooms' },
  lv: { es: 'Nivel {n}', en: 'Level {n}' },
  lvSpec: { es: 'Especialidad: {s}', en: 'Specialty: {s}' },
  upgrade: { es: 'Mejorar', en: 'Upgrade' },
  choose: { es: 'Elegí una especialidad', en: 'Pick a specialty' },
  maxed: { es: 'Al máximo', en: 'Maxed out' },
  sell: { es: 'Vender +{n}', en: 'Sell +{n}' },
  sellSure: { es: '¿Seguro? +{n}', en: 'Sure? +{n}' },
  target: { es: 'Apunta: {m}', en: 'Aims: {m}' },
  tFirst: { es: 'al primero', en: 'first' },
  tLast: { es: 'al último', en: 'last' },
  tStrong: { es: 'al más fuerte', en: 'strongest' },
  tClose: { es: 'al más cercano', en: 'closest' },
  stDmg: { es: 'daño', en: 'damage' },
  stRate: { es: 'por seg', en: 'per sec' },
  stRange: { es: 'alcance', en: 'range' },
  stSlow: { es: 'frena', en: 'slow' },
  stPoison: { es: 'veneno/s', en: 'poison/s' },
  stChain: { es: 'saltos', en: 'jumps' },
  noAir: { es: 'No le pega a lo que vuela.', en: 'Can’t hit flyers.' },
  needCoins: { es: 'Te faltan {n} semillas', en: 'You need {n} more seeds' },
  needCoins1: { es: 'Te falta 1 semilla', en: 'You need 1 more seed' },
  buildHint: { es: 'Elegí qué hongo plantar acá.', en: 'Pick a mushroom to plant here.' },
  hTowers: { es: 'Hongos', en: 'Mushrooms' },
  hBugs: { es: 'Bichos', en: 'Bugs' },
  aSpeed: { es: 'Velocidad', en: 'Speed' },
  aPause: { es: 'Pausa', en: 'Pause' },
  aClose: { es: 'Cerrar', en: 'Close' },
  newBug: { es: '¡Bicho nuevo!', en: 'New bug!' },
  bossComing: { es: '¡Se viene un jefe!', en: 'A boss is coming!' },
  waveToast: { es: 'Oleada {n}', en: 'Wave {n}' },
  lastWave: { es: '¡Última oleada!', en: 'Final wave!' },
  livesLost: { es: '−{n}', en: '−{n}' },
  tip1: { es: 'Tocá el <b>pasto</b> al lado del sendero para plantar un hongo.', en: 'Tap the <b>grass</b> next to the trail to plant a mushroom.' },
  tip2: { es: 'Cuando estés listo, tocá <b>¡Que vengan!</b> arriba a la derecha.', en: 'When you’re ready, tap <b>Bring them!</b> at the top right.' },
  tip3: { es: 'Las semillas se ganan con cada bicho. Tocá un hongo para <b>mejorarlo</b>.', en: 'You earn seeds from every bug. Tap a mushroom to <b>upgrade</b> it.' },
  tip4: { es: 'Llamar la oleada antes de tiempo da <b>semillas extra</b>.', en: 'Calling a wave early gives <b>bonus seeds</b>.' },
  howto: [
    { es: 'Los bichos salen de las <b>cuevas</b> y caminan por el sendero hasta el <b>tocón</b>. Cada uno que llega te saca vidas (los grandes, más).', en: 'Bugs come out of the <b>burrows</b> and walk the trail to the <b>stump</b>. Each one that gets in costs lives (big ones, more).' },
    { es: 'Tocá un casillero de <b>pasto</b> para plantar un hongo. Cada bicho que cae da <b>semillas</b> para plantar y mejorar.', en: 'Tap a <b>grass</b> tile to plant a mushroom. Every bug that falls gives <b>seeds</b> to plant and upgrade.' },
    { es: 'Tocá un hongo para mejorarlo (tres niveles y después <b>una de dos especialidades</b>), cambiar a quién apunta o venderlo.', en: 'Tap a mushroom to upgrade it (three levels, then <b>one of two specialties</b>), change its target or sell it.' },
    { es: 'Las <b>esporas</b> pierden fuerza contra las corazas; el veneno, el frío y los rayos no.', en: '<b>Spores</b> lose power against shells; poison, frost and bolts don’t.' },
    { es: '<b>Lluvia</b> y <b>raíces</b> son poderes que se recargan solos. Llamar la oleada antes de tiempo da semillas extra.', en: '<b>Rain</b> and <b>roots</b> are powers that recharge on their own. Calling a wave early gives bonus seeds.' },
    { es: 'Teclado: <kbd>1</kbd>–<kbd>6</kbd> eligen hongo, <kbd>U</kbd> mejora, <kbd>V</kbd> vende, <kbd>Espacio</kbd> llama la oleada, <kbd>F</kbd> velocidad, <kbd>Q</kbd>/<kbd>W</kbd> poderes, flechas + <kbd>Enter</kbd> para moverse sin mouse.', en: 'Keyboard: <kbd>1</kbd>–<kbd>6</kbd> pick a mushroom, <kbd>U</kbd> upgrade, <kbd>V</kbd> sell, <kbd>Space</kbd> calls the wave, <kbd>F</kbd> speed, <kbd>Q</kbd>/<kbd>W</kbd> powers, arrows + <kbd>Enter</kbd> to play without a mouse.' },
  ],
};
const t = (k, v) => {
  let s = G.t(TXT[k] || { es: k });
  if (v) for (const x in v) s = s.replace(`{${x}}`, v[x]);
  return s;
};
/** Variante en singular (`clave1`) cuando n es 1. */
const tn = (k, n, v = {}) => (n === 1 && TXT[k + '1'] ? t(k + '1', v) : t(k, { n, ...v }));
const lang = () => (G.prefs.lang === 'en' ? 'en' : 'es');
const TARGETS = ['first', 'last', 'strong', 'close'];
const TARGET_TXT = { first: 'tFirst', last: 'tLast', strong: 'tStrong', close: 'tClose' };

// ---------------------------------------------------------------- guardado
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(`gameit:${ID}:${k}`);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`gameit:${ID}:${k}`, JSON.stringify(v));
    } catch {}
  },
};
let progress = store.get('progress', {});
const tipsSeen = store.get('tips', {});
const unlocked = (i) => i === 0 || (progress[MAPS[i - 1].id]?.stars || 0) > 0;

// ---------------------------------------------------------------- estado
const S = {
  phase: 'menu', // menu, help, play, pause, end
  game: null,
  mapIdx: store.get('lastMap', 0),
  endless: false,
  speed: 1,
  hover: null, // casillero bajo el puntero
  cursor: null, // casillero del teclado / joystick
  buildAt: null, // casillero con el menú de plantar abierto
  armed: null, // opción tocada una vez (pantallas táctiles)
  sel: null, // hongo elegido
  placing: null, // tipo elegido con el teclado (fantasma que sigue al puntero)
  aim: null, // poder apuntando
  pointer: null, // posición del puntero en el mundo
  acc: 0,
  helpFrom: 'menu',
  tip: 0,
  lastLives: LIVES,
  ended: false,
};
const cv = $('c');
const view = new View(cv);

// ---------------------------------------------------------------- disposición
function layout() {
  const vw = innerWidth, vh = innerHeight;
  const top = TOP + (vw < 560 ? 42 : 54);
  view.layout(vw, vh, { x: 4, y: top, w: vw - 8, h: vh - top - 6 });
  hudKey = '';
  view.reduced = !!G.prefs.reducedMotion;
  if (S.buildAt) placeMenu($('build-menu'), S.buildAt[0] + 0.5, S.buildAt[1] + 0.5);
  if (S.sel) placeMenu($('tower-menu'), S.sel.x, S.sel.y);
}

/** Pone un menú al lado del casillero, sin taparlo; en pantallas angostas va abajo como hoja. */
function placeMenu(el, wx, wy) {
  const sheet = innerWidth < 560;
  el.classList.toggle('sheet', sheet);
  if (sheet) return;
  const [X, Y] = view.w2s(wx, wy);
  const r = el.getBoundingClientRect();
  const w = r.width || 300, h = r.height || 160;
  const s = view.s;
  let x = X - w / 2;
  let y = Y - s * 0.9 - h;
  if (y < TOP + 54) y = Y + s * 0.8;
  x = clamp(x, 6, innerWidth - w - 6);
  y = clamp(y, TOP + 54, innerHeight - h - 6);
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

// ---------------------------------------------------------------- sonidos
const sfx = {
  build() {
    noise(0.08, { freq: 300, type: 'lowpass', vol: 0.3 });
    tone(320, 520, 0.12, { type: 'triangle', vol: 0.12, at: 0.04 });
  },
  upgrade() {
    notes([523, 659, 784, 1046], { step: 0.06, dur: 0.16, type: 'triangle', vol: 0.1 });
  },
  sell() {
    for (let i = 0; i < 4; i++) tone(1300 + i * 120, 1500 + i * 120, 0.06, { type: 'square', vol: 0.035, at: i * 0.05 });
  },
  shoot(type) {
    switch (type) {
      case 'champi':
        noise(0.05, { freq: 1600, q: 2, vol: 0.06 });
        tone(600, 380, 0.05, { type: 'sine', vol: 0.03 });
        break;
      case 'bejin':
        tone(180, 90, 0.18, { type: 'sine', vol: 0.12 });
        noise(0.12, { freq: 500, type: 'lowpass', vol: 0.1 });
        break;
      case 'amanita':
        noise(0.04, { freq: 4000, q: 3, vol: 0.05 });
        break;
      case 'colmenilla':
        noise(0.09, { freq: 900, q: 1, vol: 0.18 });
        tone(220, 70, 0.12, { type: 'square', vol: 0.05 });
        break;
    }
  },
  pulse() {
    tone(1800, 2400, 0.25, { type: 'sine', vol: 0.035 });
    noise(0.2, { freq: 6000, q: 0.8, type: 'highpass', vol: 0.03 });
  },
  zap(big) {
    noise(big ? 0.25 : 0.12, { freq: 2500, sweep: 400, q: 2, vol: big ? 0.16 : 0.08 });
    tone(big ? 200 : 400, 60, big ? 0.25 : 0.1, { type: 'square', vol: 0.04 });
  },
  boom() {
    noise(0.22, { freq: 260, type: 'lowpass', vol: 0.18 });
  },
  kill(boss) {
    if (boss) {
      noise(0.6, { freq: 200, type: 'lowpass', vol: 0.35 });
      notes([392, 523, 659, 784], { step: 0.1, dur: 0.3, type: 'triangle', vol: 0.12 });
      return;
    }
    tone(700 + Math.random() * 300, 250, 0.08, { type: 'triangle', vol: 0.05 });
  },
  leak() {
    tone(330, 110, 0.4, { type: 'square', vol: 0.06 });
    noise(0.2, { freq: 150, type: 'lowpass', vol: 0.3 });
  },
  wave(last) {
    notes(last ? [392, 392, 523, 659] : [392, 523], { step: 0.14, dur: 0.3, type: 'sawtooth', vol: 0.05 });
  },
  boss() {
    tone(90, 60, 1.2, { type: 'sawtooth', vol: 0.12 });
    tone(135, 90, 1.2, { type: 'square', vol: 0.05 });
  },
  rain() {
    noise(1.6, { freq: 3000, q: 0.5, vol: 0.12 });
    noise(0.4, { freq: 120, type: 'lowpass', vol: 0.3 });
  },
  roots() {
    noise(0.5, { freq: 200, sweep: 600, q: 2, vol: 0.25 });
    tone(80, 140, 0.5, { type: 'triangle', vol: 0.1 });
  },
  won() {
    notes([523, 659, 784, 1046, 784, 1046, 1318], { step: 0.11, dur: 0.3, type: 'triangle', vol: 0.12 });
  },
  lost() {
    notes([392, 330, 262, 196], { step: 0.22, dur: 0.45, type: 'triangle', vol: 0.12 });
  },
  click() {
    tone(900, 700, 0.04, { type: 'sine', vol: 0.04 });
  },
  denied() {
    tone(200, 160, 0.12, { type: 'square', vol: 0.05 });
  },
};

// ---------------------------------------------------------------- partida
function start(idx = S.mapIdx, endless = S.endless) {
  S.mapIdx = idx;
  S.endless = endless;
  store.set('lastMap', idx);
  S.game = new Game({ map: idx, endless });
  S.speed = 1;
  S.acc = 0;
  S.sel = S.buildAt = S.placing = S.aim = S.armed = null;
  S.lastLives = LIVES;
  S.ended = false;
  view.parts = [];
  view.texts = [];
  view.rings = [];
  view.segs.clear();
  layout();
  closeMenus();
  show('play');
  S.tip = idx === 0 && !tipsSeen.basic ? 1 : 0;
  showTip();
  refreshHud(true);
}

function showTip() {
  const el = $('tip');
  // no tapa el aviso de los poderes ni la hoja de los menús en pantallas angostas
  const busy = S.aim || ((S.buildAt || S.sel) && innerWidth < 560);
  if (!S.tip || S.phase !== 'play' || busy) {
    el.hidden = true;
    return;
  }
  el.innerHTML = t(`tip${S.tip}`);
  el.hidden = false;
}
function advanceTip(to) {
  if (S.tip && to > S.tip) {
    S.tip = to;
    S.tipT = 0;
    if (to > 4) {
      S.tip = 0;
      tipsSeen.basic = true;
      store.set('tips', tipsSeen);
    }
    showTip();
  }
}
/** El último consejo se va solo al rato. */
function updateTip(dt) {
  if (S.tip !== 4) return;
  S.tipT = (S.tipT || 0) + dt;
  if (S.tipT > 9) advanceTip(5);
}

function step(dt) {
  const g = S.game;
  const ev = g.step(dt);
  for (const e of ev) onEvent(e);
}

/** Corre una acción del jugador sobre la simulación y reparte los eventos que deja (oleada, poder, venta…). */
function act(fn) {
  const g = S.game;
  const n0 = g.ev.length;
  const r = fn(g);
  for (const e of g.ev.splice(n0)) onEvent(e);
  return r;
}

function onEvent(e) {
  const g = S.game;
  view.event(e, g);
  switch (e.t) {
    case 'shoot':
      sfx.shoot(e.tower.type);
      break;
    case 'pulse':
      if (e.n) sfx.pulse();
      break;
    case 'chain':
      sfx.zap(e.big);
      break;
    case 'snipe':
      sfx.shoot('colmenilla');
      break;
    case 'boom':
      if (!e.small) sfx.boom();
      break;
    case 'kill':
      sfx.kill(ENEMIES[e.en.e].boss);
      bump('coins');
      break;
    case 'leak':
      sfx.leak();
      bump('lives');
      vibrate(60);
      break;
    case 'wave':
      sfx.wave(!g.endless && e.n === g.total);
      if (!g.endless && e.n === g.total) toast({ title: t('lastWave'), big: true });
      else toast({ title: t('waveToast', { n: e.n }), big: true, dur: 1.4 });
      if (e.n === 1) advanceTip(3);
      if (e.n === 2) advanceTip(4);
      break;
    case 'newEnemy':
      queueToast({ icon: bugIcon(e.e), title: `${t('newBug')} ${G.t(ENEMIES[e.e].name)}`, text: G.t(ENEMIES[e.e].desc), dur: 4 });
      break;
    case 'boss':
      sfx.boss();
      queueToast({ icon: bugIcon(e.e), title: `${t('bossComing')} ${G.t(ENEMIES[e.e].name)}`, text: G.t(ENEMIES[e.e].desc), dur: 5, cls: 'boss' });
      break;
    case 'power':
      if (e.kind === 'lluvia') sfx.rain();
      else sfx.roots();
      break;
    case 'won':
    case 'lost': {
      // la pantalla final es de esta partida: si el jugador ya empezó otra, no aparece
      const g0 = g;
      setTimeout(() => S.game === g0 && endGame(), 900);
      if (e.t === 'won') sfx.won();
      else sfx.lost();
      break;
    }
  }
}

function vibrate(ms) {
  if (G.prefs.touch && navigator.vibrate)
    try {
      navigator.vibrate(ms);
    } catch {}
}

// ---------------------------------------------------------------- avisos
let toastQ = [];
let toastT = 0;
let toastCur = null;
/** Aviso urgente: se muestra ya y el que estaba en pantalla vuelve después. */
function toast(o) {
  if (toastT > 0 && toastCur && !toastCur.big) toastQ.unshift(toastCur);
  toastQ.unshift(o);
  toastT = 0;
  nextToast();
}
function queueToast(o) {
  toastQ.push(o);
  if (toastT <= 0) nextToast();
}
function nextToast() {
  const el = $('toast');
  const o = toastQ.shift();
  toastCur = o || null;
  if (!o) {
    el.hidden = true;
    return;
  }
  toastT = o.dur || 2.4;
  el.className = `toast${o.cls ? ' ' + o.cls : ''}${o.big ? ' big' : ''}`;
  el.innerHTML = `${o.icon ? `<img src="${o.icon}" alt="">` : ''}<div><b>${o.title}</b>${o.text ? `<span>${o.text}</span>` : ''}</div>`;
  el.hidden = false;
  // reinicia la animación
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
}
function updateToast(dt) {
  if (toastT <= 0) return;
  toastT -= dt;
  if (toastT <= 0) nextToast();
}

function bump(id) {
  const el = $(id).parentElement;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

// ---------------------------------------------------------------- barra de arriba
let hudKey = '';
function refreshHud(force = false) {
  const g = S.game;
  if (!g) return;
  const nextIn = g.nextT;
  const bonus = nextIn == null ? -1 : Math.ceil(nextIn * EARLY_BONUS);
  const key = [g.coins, g.lives, g.wave, g.phase, bonus, S.speed, g.queue.length > 0, innerWidth < 430].join('|');
  if (!force && key === hudKey) return updateRing();
  hudKey = key;
  $('coins').textContent = g.coins;
  $('lives').textContent = g.lives;
  const narrow = innerWidth < 430;
  const wn = Math.max(1, g.wave);
  $('wave-lbl').textContent = narrow ? (g.endless ? `#${wn}` : `${wn}/${g.total}`) : g.endless ? t('waveN', { n: wn }) : t('waveOf', { n: wn, t: g.total });
  const wb = $('b-wave');
  const canCall = g.phase === 'build' || (g.phase === 'run' && nextIn != null && g.wave < g.total);
  wb.disabled = !canCall;
  wb.classList.toggle('go', g.phase === 'build');
  $('wave-txt').textContent = g.phase === 'build' ? t('start') : canCall ? t('callEarly', { n: bonus }) : t('incoming');
  $('speed-lbl').textContent = `${S.speed}×`;
  // próxima oleada
  const pv = $('preview');
  if (canCall) {
    const list = g.preview();
    pv.innerHTML = list.map((x) => `<span><img src="${bugIcon(x.e, 52)}" alt="">×${x.n}</span>`).join('');
    pv.hidden = !list.length;
  } else pv.hidden = true;
  updateRing();
  refreshMenus();
}
function updateRing() {
  const g = S.game;
  const ring = $('wave-ring');
  const k = g.nextT != null ? 1 - g.nextT / WAVE_GAP : g.phase === 'build' ? 1 : 0;
  ring.style.strokeDashoffset = String(106.8 * (1 - clamp(k, 0, 1)));
  for (const k2 of Object.keys(POWERS)) {
    const b = $(`p-${k2}`);
    const cd = g.powers[k2].cd / POWERS[k2].cd;
    b.style.setProperty('--cd', String(cd * 100));
    b.classList.toggle('ready', cd <= 0 && g.phase === 'run');
    b.classList.toggle('aim', S.aim === k2);
  }
}

// ---------------------------------------------------------------- menús de plantar y de hongo
function openBuild(tx, ty) {
  closeMenus();
  S.buildAt = [tx, ty];
  const g = S.game;
  const el = $('build-menu');
  $('build-opts').innerHTML = TOWER_IDS.map((id, i) => {
    const avail = g.def.towers.includes(id);
    const cost = TOWERS[id].levels[0].cost;
    return `<button class="opt${avail ? '' : ' lock'}${g.coins < cost ? ' poor' : ''}" data-tw="${id}" ${avail ? '' : 'disabled'}><kbd>${i + 1}</kbd><img src="${towerIcon(id)}" alt=""><b><i class="ic-seed"></i>${cost}</b></button>`;
  }).join('');
  setBuildInfo(null);
  el.hidden = false;
  showTip();
  placeMenu(el, tx + 0.5, ty + 0.5);
  for (const b of $$('#build-opts .opt')) {
    b.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && hoverOpt(b.dataset.tw));
    b.addEventListener('focus', () => hoverOpt(b.dataset.tw));
    b.addEventListener('click', (e) => pickOpt(b.dataset.tw, e));
  }
  if (!G.prefs.touch) setTimeout(() => $$('#build-opts .opt:not(.lock)')[0]?.focus({ preventScroll: true }), 30);
}
function hoverOpt(id) {
  S.ghostType = id;
  setBuildInfo(id);
}
function setBuildInfo(id) {
  const el = $('build-info');
  if (!id) {
    el.textContent = t('buildHint');
    return;
  }
  const D = TOWERS[id];
  const L = D.levels[0];
  const g = S.game;
  const lack = L.cost - g.coins;
  el.innerHTML = `<b>${G.t(D.name)}</b> · ${G.t(D.desc)}${D.air ? '' : ` <i>${t('noAir')}</i>`}${lack > 0 ? `<br><span style="color:#b03020">${tn('needCoins', lack)}</span>` : ''}`;
}
function pickOpt(id, e) {
  const g = S.game;
  if (!S.buildAt) return;
  const cost = TOWERS[id].levels[0].cost;
  // en pantallas táctiles: primer toque muestra, segundo planta
  const touch = e?.pointerType === 'touch' || (G.prefs.touch && e?.pointerType !== 'mouse');
  if (touch && S.armed !== id) {
    S.armed = id;
    hoverOpt(id);
    $$('#build-opts .opt').forEach((b) => b.classList.toggle('armed', b.dataset.tw === id));
    return;
  }
  if (g.coins < cost) {
    sfx.denied();
    return;
  }
  const [tx, ty] = S.buildAt;
  if (doBuild(tx, ty, id)) closeMenus();
}
/** Planta y reparte los eventos (el sonido, la nube de tierra, el consejo siguiente). */
function doBuild(tx, ty, id) {
  const g = S.game;
  if (g.coins < TOWERS[id].levels[0].cost || !g.canBuild(tx, ty, id)) {
    sfx.denied();
    return null;
  }
  const tw = act(() => g.build(tx, ty, id));
  if (!tw) return null;
  sfx.build();
  advanceTip(2);
  refreshHud(true);
  return tw;
}

function openTower(tw) {
  closeMenus();
  S.sel = tw;
  renderTowerMenu();
  const el = $('tower-menu');
  el.hidden = false;
  placeMenu(el, tw.x, tw.y);
  advanceTip(4);
  showTip();
  if (!G.prefs.touch) setTimeout(() => ($('#tw-up .up') || $('tw-target'))?.focus?.({ preventScroll: true }), 30);
}

function statCells(S0, S1, D) {
  const cells = [];
  const fmtN = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(v < 2 ? 2 : 1).replace('.', lang() === 'es' ? ',' : '.'));
  const diff = (k, mult = 1, suf = '') => {
    const a = S0[k] * mult, b = S1 ? S1[k] * mult : null;
    if (b != null && Math.abs(b - a) > 1e-9) return `${fmtN(+a.toFixed(2))}${suf} <em>→ ${fmtN(+b.toFixed(2))}${suf}</em>`;
    return `${fmtN(+a.toFixed(2))}${suf}`;
  };
  if (D.kind === 'aura') {
    cells.push([t('stSlow'), diff('slow', 100, '%')]);
    cells.push([t('stDmg'), diff('dmg')]);
  } else if (D.kind === 'dart') {
    cells.push([t('stPoison'), diff('poison')]);
    cells.push([t('stRate'), diff('rate')]);
  } else if (D.kind === 'chain') {
    cells.push([t('stDmg'), diff('dmg')]);
    cells.push([t('stChain'), diff('chain')]);
  } else {
    cells.push([t('stDmg'), diff('dmg')]);
    cells.push([t('stRate'), diff('rate')]);
  }
  cells.push([t('stRange'), diff('range')]);
  return cells.map(([k, v]) => `<div><b>${v}</b>${k}</div>`).join('');
}

function renderTowerMenu(preview = null) {
  const tw = S.sel;
  if (!tw) return;
  const g = S.game;
  const D = TOWERS[tw.type];
  const cur = g.stats_(tw);
  $('tw-icon').src = towerIcon(tw.type, tw.lv, tw.spec);
  $('tw-name').textContent = G.t(D.name);
  $('tw-lv').textContent = tw.spec ? t('lvSpec', { s: G.t(D.specs[tw.spec].name) }) : t('lv', { n: tw.lv });
  const next = preview ? (preview === 'up' ? D.levels[tw.lv] : D.specs[preview]) : null;
  $('tw-stats').innerHTML = statCells(cur, next, D);
  const up = $('tw-up');
  if (tw.spec) up.innerHTML = `<div class="maxed">${t('maxed')}</div>`;
  else if (tw.lv < 3) {
    const L = D.levels[tw.lv];
    up.innerHTML = `<button class="up${g.coins < L.cost ? ' poor' : ''}${S.armed === 'up' ? ' armed' : ''}" data-up="up"><img src="${towerIcon(tw.type, tw.lv + 1)}" alt=""><div><b>${t('upgrade')}</b><span>${t('lv', { n: tw.lv + 1 })}</span></div><span class="cost"><i class="ic-seed"></i>${L.cost}</span></button>`;
  } else {
    up.innerHTML =
      `<div class="maxed">${t('choose')}</div>` +
      ['a', 'b']
        .map((k) => {
          const sp = D.specs[k];
          return `<button class="up${g.coins < sp.cost ? ' poor' : ''}${S.armed === k ? ' armed' : ''}" data-up="${k}"><img src="${towerIcon(tw.type, 4, k)}" alt=""><div><b>${G.t(sp.name)}</b><span>${G.t(sp.desc)}</span></div><span class="cost"><i class="ic-seed"></i>${sp.cost}</span></button>`;
        })
        .join('');
  }
  for (const b of $$('#tw-up .up')) {
    b.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && renderStatsPreview(b.dataset.up));
    b.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && renderStatsPreview(null));
    b.addEventListener('focus', () => renderStatsPreview(b.dataset.up));
    b.addEventListener('click', (e) => doUpgrade(b.dataset.up, e));
  }
  $('tw-target').textContent = t('target', { m: t(TARGET_TXT[tw.target]) });
  $('tw-target').hidden = D.kind === 'aura';
  const v = g.sellValue(tw);
  $('tw-sell').textContent = S.armed === 'sell' ? t('sellSure', { n: v }) : t('sell', { n: v });
  $('tw-sell').classList.toggle('armed', S.armed === 'sell');
}
function renderStatsPreview(k) {
  const tw = S.sel;
  if (!tw) return;
  const D = TOWERS[tw.type];
  const next = k ? (k === 'up' ? D.levels[tw.lv] : D.specs[k]) : null;
  $('tw-stats').innerHTML = statCells(S.game.stats_(tw), next, D);
}
function doUpgrade(k, e) {
  const g = S.game, tw = S.sel;
  if (!tw) return;
  const touch = e?.pointerType === 'touch' || (G.prefs.touch && e?.pointerType !== 'mouse');
  if (touch && S.armed !== k) {
    S.armed = k;
    renderTowerMenu(k);
    return;
  }
  const ok = act(() => g.upgrade(tw, k === 'up' ? null : k));
  if (!ok) {
    sfx.denied();
    return;
  }
  sfx.upgrade();
  S.armed = null;
  renderTowerMenu();
  placeMenu($('tower-menu'), tw.x, tw.y);
  refreshHud(true);
}
function doSell(e) {
  const g = S.game, tw = S.sel;
  if (!tw) return;
  const touch = e?.pointerType === 'touch' || (G.prefs.touch && e?.pointerType !== 'mouse') || e === 'key';
  if (touch && S.armed !== 'sell') {
    S.armed = 'sell';
    renderTowerMenu();
    return;
  }
  act(() => g.sell(tw));
  sfx.sell();
  closeMenus();
  refreshHud(true);
}
function cycleTarget() {
  const tw = S.sel;
  if (!tw || TOWERS[tw.type].kind === 'aura') return;
  tw.target = TARGETS[(TARGETS.indexOf(tw.target) + 1) % TARGETS.length];
  sfx.click();
  renderTowerMenu();
}

function closeMenus() {
  S.buildAt = null;
  S.sel = null;
  S.armed = null;
  S.ghostType = null;
  $('build-menu').hidden = true;
  $('tower-menu').hidden = true;
  showTip();
}
function refreshMenus() {
  if (S.buildAt) {
    const g = S.game;
    for (const b of $$('#build-opts .opt')) b.classList.toggle('poor', g.coins < TOWERS[b.dataset.tw].levels[0].cost);
    if (S.ghostType) setBuildInfo(S.ghostType);
  }
  if (S.sel) {
    if (!S.game.towers.includes(S.sel)) closeMenus();
    else {
      for (const b of $$('#tw-up .up')) {
        const D = TOWERS[S.sel.type];
        const cost = b.dataset.up === 'up' ? D.levels[S.sel.lv]?.cost : D.specs[b.dataset.up].cost;
        b.classList.toggle('poor', S.game.coins < cost);
      }
      // la devolución baja al 70 % cuando empieza la primera oleada
      const v = S.game.sellValue(S.sel);
      $('tw-sell').textContent = S.armed === 'sell' ? t('sellSure', { n: v }) : t('sell', { n: v });
    }
  }
}

// ---------------------------------------------------------------- tocar el mapa
function tapWorld(wx, wy) {
  const g = S.game;
  if (!g || S.phase !== 'play') return;
  if (S.aim) {
    const kind = S.aim;
    if (act(() => g.usePower(kind, wx, wy))) {
      S.aim = null;
      $('aim-hint').hidden = true;
      showTip();
    } else sfx.denied();
    refreshHud(true);
    return;
  }
  const tx = Math.floor(wx), ty = Math.floor(wy);
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return closeMenus();
  const tw = g.towerAt(tx, ty);
  if (tw) {
    if (S.sel === tw) return closeMenus();
    sfx.click();
    return openTower(tw);
  }
  if (S.placing) {
    if (doBuild(tx, ty, S.placing) && !S.keepPlacing) S.placing = null;
    return;
  }
  if (g.canBuild(tx, ty)) {
    if (S.buildAt && S.buildAt[0] === tx && S.buildAt[1] === ty) return closeMenus();
    sfx.click();
    return openBuild(tx, ty);
  }
  closeMenus();
}

function setAim(kind) {
  const g = S.game;
  if (!g || S.phase !== 'play') return;
  if (S.aim === kind) {
    S.aim = null;
    $('aim-hint').hidden = true;
    updateRing();
    showTip();
    return;
  }
  if (g.powers[kind].cd > 0 || g.phase !== 'run') {
    sfx.denied();
    return;
  }
  closeMenus();
  S.aim = kind;
  $('aim-hint').textContent = t(kind === 'lluvia' ? 'aimRain' : 'aimRoots');
  $('aim-hint').hidden = false;
  updateRing();
  showTip();
}

function callWave() {
  const g = S.game;
  if (!g || S.phase !== 'play') return;
  const wasRun = g.phase === 'run';
  const bonus = act(() => g.callWave());
  if (bonus > 0) {
    view.text(g.map.paths[0].pts[1][0], g.map.paths[0].pts[1][1], `+${bonus}`, '#ffe08a', true);
    sfx.sell();
    // el último consejo era justamente este
    if (S.tip === 4) advanceTip(5);
  }
  if (!wasRun) advanceTip(3);
  refreshHud(true);
}

// ---------------------------------------------------------------- fin
function endGame() {
  const g = S.game;
  if (!g || S.ended) return;
  S.ended = true;
  const p = (progress[g.def.id] ||= { stars: 0, endless: 0 });
  const won = g.phase === 'won';
  const info = { won, waves: Math.max(0, g.wave - 1), prevEndless: p.endless || 0, stars: g.stars() };
  if (g.endless) p.endless = Math.max(p.endless || 0, info.waves);
  else p.stars = Math.max(p.stars || 0, info.stars);
  store.set('progress', progress);
  S.endInfo = info;
  renderEnd();
  show('end');
}

/** Textos de la pantalla final (se rehacen si cambia el idioma). */
function renderEnd() {
  const g = S.game, info = S.endInfo;
  if (!g || !info) return;
  let title, sub;
  if (g.endless) {
    title = tn('endlessEnd', info.waves);
    sub = info.waves > info.prevEndless ? t('endlessBest') : t('endlessPrev', { n: info.prevEndless });
    $('end-stars').innerHTML = '';
  } else {
    title = info.won ? t('won') : t('lost');
    sub = info.won ? tn('wonSub', g.lives) : t('lostSub', { n: g.wave, t: g.total });
    $('end-stars').innerHTML = info.won ? [1, 2, 3].map((i) => `<i class="${i <= info.stars ? 'on' : ''}">★</i>`).join('') : '';
  }
  $('end-kicker').textContent = G.t(g.def.name);
  $('end-title').textContent = title;
  $('end-sub').textContent = sub;
  $('end-stats').innerHTML = [
    [g.stats.kills, 'sKills'],
    [g.endless ? info.waves : g.wave, 'sWaves'],
    [g.towers.length, 'sTowers'],
  ]
    .map(([v, k]) => `<div class="stat"><b>${v}</b><span>${t(k)}</span></div>`)
    .join('');
  $('b-next').hidden = !(info.won && !g.endless && S.mapIdx < MAPS.length - 1);
  $('next-lbl').textContent = t('next');
}

// ---------------------------------------------------------------- pantallas
function show(id) {
  S.phase = id;
  const sid = id === 'menu' ? 'home' : id;
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${sid}`));
  $('hud').hidden = !(id === 'play' || id === 'pause' || id === 'end');
  G.gameplay(id === 'play');
  if (id !== 'play') {
    closeMenus();
    S.aim = null;
    $('aim-hint').hidden = true;
  }
  showTip();
  if (id === 'menu') renderHome();
  const first = document.querySelector(`#s-${sid} .btn:not([hidden])`);
  if (first && !G.prefs.touch && id !== 'play') setTimeout(() => first.focus({ preventScroll: true }), 50);
}

const mapThumbs = new Map();
function mapThumb(i) {
  if (mapThumbs.has(i)) return mapThumbs.get(i);
  const cv2 = document.createElement('canvas');
  const k = 16;
  cv2.width = COLS * k;
  cv2.height = ROWS * k;
  const c = cv2.getContext('2d');
  c.scale(k, k);
  const m = buildMap(MAPS[i]);
  paintGround(c, m, MAPS[i].theme);
  // tocón y cuevas, en chiquito
  c.fillStyle = '#7a4f2a';
  c.beginPath();
  c.arc(m.base.x, m.base.y, 0.8, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#e2bd86';
  c.beginPath();
  c.arc(m.base.x, m.base.y - 0.1, 0.55, 0, Math.PI * 2);
  c.fill();
  const url = cv2.toDataURL();
  mapThumbs.set(i, url);
  return url;
}

function renderHome() {
  $('maps').innerHTML = MAPS.map((m, i) => {
    const p = progress[m.id] || {};
    const lock = !unlocked(i);
    const st = [1, 2, 3].map((k) => (k <= (p.stars || 0) ? '★' : '<i>★</i>')).join('');
    return `<button class="map${i === S.mapIdx ? ' on' : ''}${lock ? ' locked' : ''}" data-i="${i}" ${lock ? 'aria-disabled="true"' : ''}><img src="${mapThumb(i)}" alt="" style="width:100%;display:block;aspect-ratio:20/12"><span class="st">${st}</span><b>${i + 1}. ${G.t(m.name)}</b><small>${G.t(m.sub)}</small></button>`;
  }).join('');
  for (const b of $$('#maps .map'))
    b.addEventListener('click', () => {
      const i = +b.dataset.i;
      if (!unlocked(i)) {
        sfx.denied();
        $('mode-sub').textContent = t('locked');
        return;
      }
      S.mapIdx = i;
      sfx.click();
      renderHome();
    });
  if (!unlocked(S.mapIdx)) S.mapIdx = 0;
  const m = MAPS[S.mapIdx];
  const p = progress[m.id] || {};
  const canEndless = (p.stars || 0) > 0;
  if (!canEndless) S.endless = false;
  $('m-endless').disabled = !canEndless;
  $('m-camp').classList.toggle('on', !S.endless);
  $('m-endless').classList.toggle('on', S.endless);
  $('mode-sub').textContent = S.endless ? tn('endlessSub', p.endless || 0) : t('campSub', { n: m.waves });
  $('m-endless').title = canEndless ? '' : t('endlessLocked');
  $('play-sub').textContent = `${S.mapIdx + 1}. ${G.t(m.name)}${S.endless ? ` · ${t('modeEndless')}` : ''}`;
}

function renderHelp() {
  $('howto').innerHTML = TXT.howto.map((x) => `<li>${G.t(x)}</li>`).join('');
  $('dex-towers').innerHTML = TOWER_IDS.map((id) => {
    const D = TOWERS[id];
    return `<div class="dex-row"><img src="${towerIcon(id, 3)}" alt=""><div><b>${G.t(D.name)}</b><span>${G.t(D.desc)}</span><small>${G.t(D.specs.a.name)} · ${G.t(D.specs.b.name)}</small></div></div>`;
  }).join('');
  $('dex-bugs').innerHTML = Object.keys(ENEMIES)
    .map((e) => {
      const E = ENEMIES[e];
      return `<div class="dex-row"><img src="${bugIcon(e)}" alt=""><div><b>${G.t(E.name)}</b><span>${G.t(E.desc)}</span></div></div>`;
    })
    .join('');
}

function drawLogo() {
  const c = $('logo').getContext('2d');
  c.clearRect(0, 0, 160, 160);
  const g = c.createRadialGradient(80, 90, 10, 80, 90, 78);
  g.addColorStop(0, '#9be07a');
  g.addColorStop(1, 'rgba(155,224,122,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 160, 160);
  drawTower(c, 56, 98, 74, { type: 'amanita', lv: 3, t: 1, look: [0.4, 0.3], id: 2 });
  drawTower(c, 104, 104, 64, { type: 'champi', lv: 2, t: 1, look: [-0.4, 0.3], id: 5 });
}

function pause() {
  if (S.phase !== 'play') return;
  renderPauseSub();
  show('pause');
}
function renderPauseSub() {
  const g = S.game;
  if (!g) return;
  const n = Math.max(1, g.wave);
  $('pause-sub').textContent = `${G.t(g.def.name)} · ${g.endless ? t('waveN', { n }) : t('waveOf', { n, t: g.total })}`;
}
function resume() {
  if (S.phase !== 'pause') return;
  last = performance.now();
  show('play');
}

// ---------------------------------------------------------------- bucle
let last = performance.now();
let padT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;
  if (FIXED) dt = 1 / 60;
  pollPad(dt);
  const g = S.game;
  if (S.phase === 'play' && g) {
    S.acc += dt * S.speed;
    let n = 0;
    while (S.acc >= 1 / 60 && n < 12) {
      step(1 / 60);
      S.acc -= 1 / 60;
      n++;
    }
    if (n >= 12) S.acc = 0;
    view.update(dt * Math.min(S.speed, 2));
    updateToast(dt);
    updateTip(dt);
    refreshHud();
  }
  if (g && S.phase !== 'menu' && S.phase !== 'help') {
    const hoverTile = S.pointer && !S.aim ? [Math.floor(S.pointer[0]), Math.floor(S.pointer[1])] : S.cursor;
    let ghost = null;
    const gt = S.placing || S.ghostType;
    if (gt) {
      const at = S.buildAt || hoverTile;
      if (at) ghost = { type: gt, tx: at[0], ty: at[1], ok: g.canBuild(at[0], at[1], gt) };
    }
    const aim = S.aim && (S.pointer || S.cursor) ? { kind: S.aim, x: S.pointer ? S.pointer[0] : S.cursor[0] + 0.5, y: S.pointer ? S.pointer[1] : S.cursor[1] + 0.5 } : null;
    view.draw(g, { hoverTile: S.cursor || (G.prefs.touch ? null : hoverTile), sel: S.sel, ghost, aim }, g.def.theme);
  } else drawMenuBg(dt);
}

/** Fondo del menú: el mapa elegido, quieto, con algunos bichos paseando. */
let menuGame = null;
let menuIdx = -1;
function drawMenuBg(dt) {
  if (menuIdx !== S.mapIdx || !menuGame) {
    menuIdx = S.mapIdx;
    // en modo infinito: los bichos no se terminan nunca
    menuGame = new Game({ map: S.mapIdx, endless: true });
    // unos hongos de adorno
    const spots = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (menuGame.tile(x, y) === TILE.GRASS) spots.push([x, y]);
    let k = 7;
    menuGame.coins = 99999;
    for (let i = 0; i < 6; i++) {
      k = (k * 48271) % 2147483647;
      const [x, y] = spots[k % spots.length];
      const type = menuGame.def.towers[i % menuGame.def.towers.length];
      const tw = menuGame.build(x, y, type);
      if (tw) tw.lv = 1 + (i % 3);
    }
    menuGame.callWave();
  }
  menuGame.lives = 99;
  menuGame.coins = 99999;
  for (let i = 0; i < 2; i++) menuGame.step(1 / 60);
  if (menuGame.nextT != null) menuGame.callWave();
  view.update(dt);
  view.draw(menuGame, {}, menuGame.def.theme);
}

// ---------------------------------------------------------------- controles
cv.addEventListener('pointermove', (e) => {
  if (S.phase !== 'play') return;
  if (e.pointerType === 'mouse') {
    S.pointer = view.s2w(e.clientX, e.clientY);
    S.cursor = null;
  }
});
cv.addEventListener('pointerleave', () => (S.pointer = null));
cv.addEventListener('pointerdown', (e) => {
  if (S.phase !== 'play') return;
  e.preventDefault();
  const [wx, wy] = view.s2w(e.clientX, e.clientY);
  S.cursor = null;
  if (e.pointerType !== 'mouse') S.pointer = null;
  if (e.button === 2) {
    S.placing = null;
    S.aim = null;
    $('aim-hint').hidden = true;
    closeMenus();
    return;
  }
  tapWorld(wx, wy);
});
cv.addEventListener('contextmenu', (e) => e.preventDefault());

addEventListener('keydown', (e) => {
  if (S.phase === 'play') {
    const g = S.game;
    const d = G.dir(e);
    if (e.code === 'Escape') {
      e.preventDefault();
      if (S.aim || S.placing || S.buildAt || S.sel) {
        S.aim = S.placing = null;
        $('aim-hint').hidden = true;
        closeMenus();
      } else pause();
      return;
    }
    if (e.code === 'KeyP') return pause();
    if (e.code === 'Space' || e.code === 'KeyN') {
      e.preventDefault();
      return callWave();
    }
    if (e.code === 'KeyF') return toggleSpeed();
    if (e.code === 'KeyQ') return setAim('lluvia');
    if (e.code === 'KeyW' && !(d && G.prefs.keys !== 'arrows' && S.cursor)) return setAim('raices');
    if (/^Digit[1-6]$/.test(e.code)) {
      const id = TOWER_IDS[+e.code.slice(5) - 1];
      if (!g.def.towers.includes(id)) return sfx.denied();
      if (S.buildAt) return pickOpt(id, { pointerType: 'mouse' });
      closeMenus();
      S.placing = S.placing === id ? null : id;
      S.keepPlacing = e.shiftKey;
      return;
    }
    if (e.code === 'KeyU' && S.sel) {
      const tw = S.sel;
      if (tw.lv < 3) doUpgrade('up', { pointerType: 'mouse' });
      return;
    }
    if ((e.code === 'KeyV' || e.code === 'Delete' || e.code === 'Backspace') && S.sel) return doSell('key');
    if (e.code === 'KeyT' && S.sel) return cycleTarget();
    // dentro de un menú, las flechas pasan de botón en botón
    if (d && document.activeElement?.closest?.('.menu')) {
      e.preventDefault();
      menuNav(d);
      return;
    }
    // cursor por teclado
    if (d && !document.activeElement?.closest?.('.menu')) {
      e.preventDefault();
      const c = S.cursor || (S.pointer ? [Math.floor(S.pointer[0]), Math.floor(S.pointer[1])] : [Math.floor(COLS / 2), Math.floor(ROWS / 2)]);
      // en la vista girada, las flechas siguen a la pantalla
      let dx = d === 'left' ? -1 : d === 'right' ? 1 : 0, dy = d === 'up' ? -1 : d === 'down' ? 1 : 0;
      if (view.rot) [dx, dy] = [dy, -dx];
      S.cursor = [clamp(c[0] + dx, 0, COLS - 1), clamp(c[1] + dy, 0, ROWS - 1)];
      S.pointer = null;
      return;
    }
    if (e.code === 'Enter' && S.cursor && !document.activeElement?.closest?.('.menu')) {
      e.preventDefault();
      tapWorld(S.cursor[0] + 0.5, S.cursor[1] + 0.5);
      return;
    }
  } else if (S.phase === 'pause' && (e.code === 'Escape' || e.code === 'KeyP')) {
    e.preventDefault();
    resume();
  } else if (S.phase === 'help' && e.code === 'Escape') backFromHelp();
});

/** Mueve el foco entre los botones del menú abierto (teclado y joystick). */
function menuNav(d) {
  const menu = document.activeElement?.closest?.('.menu');
  if (!menu) return;
  const list = [...menu.querySelectorAll('button')].filter((b) => !b.disabled && !b.hidden && b.offsetParent);
  const i = list.indexOf(document.activeElement);
  const step = d === 'left' || d === 'up' ? -1 : 1;
  list[(i + step + list.length) % list.length]?.focus({ preventScroll: true });
}

function toggleSpeed() {
  S.speed = S.speed === 1 ? 2 : S.speed === 2 ? 3 : 1;
  sfx.click();
  refreshHud(true);
}

const padPrev = {};
function pollPad(dt) {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  padT -= dt;
  for (const gp of pads) {
    const b = (i) => !!gp.buttons[i]?.pressed;
    const press = (i) => b(i) && !padPrev[`${gp.index}:${i}`];
    if (S.phase === 'play') {
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      let dx = (b(15) ? 1 : 0) - (b(14) ? 1 : 0) + (Math.abs(ax) > 0.5 ? Math.sign(ax) : 0);
      let dy = (b(13) ? 1 : 0) - (b(12) ? 1 : 0) + (Math.abs(ay) > 0.5 ? Math.sign(ay) : 0);
      if ((dx || dy) && padT <= 0 && document.activeElement?.closest?.('.menu')) {
        padT = 0.18;
        menuNav(dx < 0 || dy < 0 ? 'left' : 'right');
      } else if ((dx || dy) && padT <= 0) {
        padT = 0.14;
        if (view.rot) [dx, dy] = [dy, -dx];
        const c = S.cursor || [Math.floor(COLS / 2), Math.floor(ROWS / 2)];
        S.cursor = [clamp(c[0] + Math.sign(dx), 0, COLS - 1), clamp(c[1] + Math.sign(dy), 0, ROWS - 1)];
        S.pointer = null;
      }
      if (press(0)) {
        if (document.activeElement?.closest?.('.menu')) document.activeElement.click();
        else if (S.cursor) tapWorld(S.cursor[0] + 0.5, S.cursor[1] + 0.5);
      }
      if (press(1)) {
        S.aim = S.placing = null;
        $('aim-hint').hidden = true;
        closeMenus();
      }
      if (press(2)) callWave();
      if (press(3)) toggleSpeed();
      if (press(4)) setAim('lluvia');
      if (press(5)) setAim('raices');
      if (press(9)) pause();
    } else if (S.phase === 'pause' && press(9)) resume();
    else if (press(0) && document.activeElement?.click && document.activeElement !== document.body) document.activeElement.click();
    for (let i = 0; i < gp.buttons.length; i++) padPrev[`${gp.index}:${i}`] = b(i);
  }
}

addEventListener('blur', () => pause());
document.addEventListener('visibilitychange', () => document.hidden && pause());
G.onPause?.(() => pause());

// botones
$('b-wave').onclick = () => callWave();
$('b-speed').onclick = () => toggleSpeed();
$('b-pause').onclick = () => pause();
$('p-lluvia').onclick = () => setAim('lluvia');
$('p-raices').onclick = () => setAim('raices');
$('tw-close').onclick = () => closeMenus();
$('tw-target').onclick = () => cycleTarget();
$('tw-sell').onclick = (e) => doSell(e);
$('b-play').onclick = () => {
  if (!unlocked(S.mapIdx)) return;
  start(S.mapIdx, S.endless);
};
$('m-camp').onclick = () => {
  S.endless = false;
  renderHome();
};
$('m-endless').onclick = () => {
  S.endless = true;
  renderHome();
};
$('b-help').onclick = () => {
  S.helpFrom = 'menu';
  renderHelp();
  show('help');
};
$('b-pause-help').onclick = () => {
  S.helpFrom = 'pause';
  renderHelp();
  show('help');
};
function backFromHelp() {
  if (S.helpFrom === 'pause' && S.game) {
    show('pause');
  } else show('menu');
}
$('b-help-back').onclick = () => backFromHelp();
$('b-resume').onclick = () => resume();
$('b-restart').onclick = () => start();
$('b-quit').onclick = () => toMenu();
$('b-retry').onclick = () => G.commercialBreak('otra-vez').catch(() => {}).then(() => start());
$('b-next').onclick = () => G.commercialBreak('siguiente').catch(() => {}).then(() => start(S.mapIdx + 1, false));
$('b-menu').onclick = () => toMenu();

function toMenu() {
  S.game = null;
  show('menu');
}

// ---------------------------------------------------------------- arranque
G.onPrefs((p) => {
  document.documentElement.lang = p.lang;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  $$('[data-t-aria]').forEach((n) => n.setAttribute('aria-label', t(n.dataset.tAria)));
  view.reduced = !!p.reducedMotion;
  if (S.phase === 'menu') renderHome();
  if (S.phase === 'help') renderHelp();
  if (S.phase === 'pause') renderPauseSub();
  if (S.phase === 'end') renderEnd();
  if (S.sel) renderTowerMenu();
  if (S.buildAt) setBuildInfo(S.ghostType);
  if (S.aim) $('aim-hint').textContent = t(S.aim === 'lluvia' ? 'aimRain' : 'aimRoots');
  showTip();
  if (S.game) refreshHud(true);
}, true);
addEventListener('resize', layout);
layout();
drawLogo();
document.fonts?.ready.then(() => drawLogo());
show('menu');
requestAnimationFrame(frame);
if (/[?&]debug\b/.test(location.search)) window.__fortin = { S, view, start, endGame, toMenu, tapWorld, callWave, makeWave };
G.ready();
