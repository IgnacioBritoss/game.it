/* Prisma — game.it
 * Rompecabezas de luz en un museo: rayos de colores salen de los emisores y hay que girar y acomodar espejos,
 * divisores, prismas y filtros para que cada cristal reciba justo su color (la luz se suma: rojo + verde = amarillo).
 * Cinco capítulos de ocho niveles con la menor cantidad de jugadas calculada por el resolvedor, pistas, y "Luz del
 * día": un rompecabezas nuevo por día, igual para todos. Óptica en shared/optics.js, niveles en shared/levels.js,
 * resolvedor y pistas en shared/solver.js, generador del diario en shared/generator.js y dibujo en render.js.
 */
import { Game, STATES, DX, DY, parse, trace, replay } from './shared/optics.js';
import { CHAPTERS, LEVELS, ALL } from './shared/levels.js';
import { hint as findHint } from './shared/solver.js';
import { dailyLevel, DAILY_EPOCH } from './shared/generator.js';
import * as R from './render.js';
import { tone, noise, notes } from '/shared/sfx.js';
import { today, dayNumber, msUntilNext, fmtClock, loadDay, saveDay, record, markPortal, share, shareLink } from '/shared/daily.js';

const G = window.GameIt;
const ID = 'prisma';
const TOP = 56;
const DEBUG = /[?&]debug\b/.test(location.search);
const $ = (id) => document.getElementById(id);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const TAU = Math.PI * 2;
const STEP = 0.022; // segundos que tarda la luz en cruzar una casilla
const MAX_HINTS = 9;
const UNLOCK = 6; // niveles resueltos de un capítulo para abrir el siguiente

// ---------------------------------------------------------------- textos
const TXT = {
  title: { es: 'Prisma', en: 'Prism' },
  museum: { es: 'Museo de la luz', en: 'Museum of light' },
  tagline: { es: 'Girá espejos y prismas para que cada cristal reciba justo su color.', en: 'Turn mirrors and prisms so every crystal gets exactly its color.' },
  play: { es: 'Jugar', en: 'Play' },
  playSub: { es: '{c} · nivel {i}', en: '{c} · level {i}' },
  playAll: { es: 'todo encendido · elegí un nivel', en: 'all lit · pick a level' },
  levels: { es: 'Niveles', en: 'Levels' },
  levelsSub: { es: '{s} de {m} ★', en: '{s} of {m} ★' },
  daily: { es: 'Luz del día', en: 'Daily light' },
  dailySub: { es: 'n.º {n} · nuevo cada día', en: '#{n} · new every day' },
  dailyDone: { es: 'n.º {n} · ✓ en {m}', en: '#{n} · ✓ in {m}' },
  back: { es: '← volver', en: '← back' },
  totalStars: { es: '{s} de {m} estrellas', en: '{s} of {m} stars' },
  locked: { es: 'Resolvé {k} niveles de «{c}» para abrir', en: 'Solve {k} levels of “{c}” to unlock' },
  newIdea: { es: 'Idea nueva', en: 'New idea' },
  gotIt: { es: '¡Entendido!', en: 'Got it!' },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'Seguir', en: 'Resume' },
  reset: { es: 'Reiniciar', en: 'Reset' },
  undo: { es: 'Deshacer', en: 'Undo' },
  hint: { es: 'Pista', en: 'Hint' },
  toLevels: { es: 'Niveles', en: 'Levels' },
  toHome: { es: 'Volver al inicio', en: 'Back to start' },
  moves: { es: ' jugadas', en: ' moves' },
  move1: { es: ' jugada', en: ' move' },
  par: { es: 'mínimo {p}', en: 'best {p}' },
  chapLevel: { es: '{i} de {m} · {c}', en: '{i} of {m} · {c}' },
  dailyKicker: { es: 'Luz del día · n.º {n}', en: 'Daily light · #{n}' },
  dailyName: { es: 'Luz del día', en: 'Daily light' },
  win: { es: '¡Encendido!', en: 'All lit!' },
  winPerfect: { es: '¡Perfecto!', en: 'Perfect!' },
  winText: { es: 'Lo resolviste en {m} jugadas. Se puede en {p}.', en: 'You solved it in {m} moves. It can be done in {p}.' },
  winTextPar: { es: 'Lo resolviste en {m}: ¡el mínimo posible!', en: 'Solved in {m}: the fewest possible!' },
  winTextBest: { es: ' Tu mejor: {b}.', en: ' Your best: {b}.' },
  gift: { es: '+1 pista por las tres estrellas', en: '+1 hint for three stars' },
  next: { es: 'Siguiente', en: 'Next' },
  again: { es: 'Otra vez', en: 'Again' },
  allDone: { es: '¡Encendiste todo el museo! Ahora, a buscar las tres estrellas en cada sala.', en: 'You lit up the whole museum! Now go for three stars in every room.' },
  unlocked: { es: 'Se abrió «{c}»', en: '“{c}” is now open' },
  nextDaily: { es: 'La próxima luz, en', en: 'Next light in' },
  share: { es: 'Compartir', en: 'Share' },
  copied: { es: '¡Copiado! Pegalo donde quieras.', en: 'Copied! Paste it anywhere.' },
  shared: { es: '¡Compartido!', en: 'Shared!' },
  dailyWin: { es: '¡Luz del día encendida!', en: 'Daily light done!' },
  dailyText: { es: '{m} jugadas · el mínimo es {p}', en: '{m} moves · the best is {p}' },
  stPlayed: { es: 'resueltos', en: 'solved' },
  stStreak: { es: 'racha', en: 'streak' },
  stBest: { es: 'mejor racha', en: 'best streak' },
  noHints: { es: 'Sin pistas', en: 'No hints left' },
  noHintsText: { es: 'Ganás una pista cada vez que resolvés un nivel con tres estrellas por primera vez.', en: 'You earn a hint every time you get three stars on a level for the first time.' },
  watchAd: { es: 'Ver un anuncio: +1 pista', en: 'Watch an ad: +1 hint' },
  trayLabel: { es: 'BANDEJA', en: 'TRAY' },
  keysDesk: { es: 'Clic: girar · clic derecho: al revés · arrastrar: mover · Z deshacer · R reiniciar · H pista', en: 'Click: turn · right-click: turn back · drag: move · Z undo · R reset · H hint' },
  keysTouch: { es: 'Tocá una pieza para girarla (mantené para el otro lado) y arrastrá las de vidrio', en: 'Tap a piece to turn it (hold to turn back) and drag the glass ones' },
  bolted: { es: 'Está atornillada: no se mueve', en: 'It’s bolted down: it won’t move' },
  hintBusy: { es: 'Buscando una pista…', en: 'Looking for a hint…' },
  hintTray: { es: 'Esta pieza va de vuelta a la bandeja', en: 'This piece goes back to the tray' },
  preparing: { es: 'Preparando la luz del día…', en: 'Preparing today’s light…' },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (v) for (const x in v) s = s.replaceAll(`{${x}}`, v[x]);
  return s;
};
const tl = (o) => (o ? G.t(o) : '');

// ---------------------------------------------------------------- guardado
const load = (k, d) => {
  try {
    const v = JSON.parse(localStorage.getItem(`gameit:${ID}:${k}`));
    return v ?? d;
  } catch {
    return d;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(`gameit:${ID}:${k}`, JSON.stringify(v));
  } catch {}
};
const P = {
  best: load('best', {}), // mejor cantidad de jugadas por nivel
  tips: load('tips', []), // capítulos cuya idea ya se mostró
  hints: load('hints', 3),
  last: load('last', null), // último nivel jugado
};

const slackFor = (par) => Math.max(2, Math.ceil(par * 0.5));
const starsFor = (par, moves) => (moves == null ? 0 : moves <= par ? 3 : moves <= par + slackFor(par) ? 2 : 1);
const levelStars = (lv) => starsFor(lv.par, P.best[lv.key]);
const solvedIn = (chap) => LEVELS[chap].filter((l, i) => P.best[`${chap}-${i + 1}`] != null).length;
const chapterOpen = (ci) => ci === 0 || solvedIn(CHAPTERS[ci - 1].id) >= Math.min(UNLOCK, LEVELS[CHAPTERS[ci - 1].id].length);
/** Un nivel se abre si antes en su capítulo queda como mucho uno sin resolver (se puede saltear uno). */
function levelOpen(lv) {
  if (P.best[lv.key] != null) return true;
  const ci = CHAPTERS.findIndex((c) => c.id === lv.chapter);
  if (!chapterOpen(ci)) return false;
  let miss = 0;
  for (let i = 0; i < lv.i; i++) if (P.best[`${lv.chapter}-${i + 1}`] == null) miss++;
  return miss <= 1;
}
const totalStars = () => ALL.reduce((s, l) => s + levelStars(l), 0);
function nextLevel(after = null) {
  const start = after ? ALL.findIndex((l) => l.key === after.key) + 1 : 0;
  for (let k = 0; k < ALL.length; k++) {
    const lv = ALL[(start + k) % ALL.length];
    if (P.best[lv.key] == null && levelOpen(lv)) return lv;
  }
  return null;
}

// ---------------------------------------------------------------- estado
const cv = $('c');
const ctx = cv.getContext('2d');
const layer = document.createElement('canvas'); // fondo + tablero (lo que no cambia)
const lctx = layer.getContext('2d');
let W = 0, H = 0, dpr = 1;

const S = {
  phase: 'menu', // menu | play | won
  mode: null, // level | daily
  level: null,
  game: null,
  n: 0,
  L: null,
  theme: 'espejos',
  vis: [], // dibujo de cada pieza: x, y, a (ángulo), ta (ángulo objetivo), size, lift
  born: null, // cuándo nace cada tramo de luz (para que avance)
  prevSeg: null,
  cry: [], // cristales: { shown, want, at, k, pop }
  portalKey: null,
  press: null,
  drag: null,
  hover: -1,
  cursor: { x: 0, y: 0, on: false },
  held: -1, // pieza levantada con el teclado
  hint: null,
  hintBusy: false,
  flood: 0,
  winAt: 0,
  boost: 0,
  sparks: [],
  bubbleT: 0,
  daily: null,
  dailyCache: null,
  wiggle: new Map(),
  reduced: false,
  touch: false,
};
let clock = 0; // segundos desde que arrancó

// ---------------------------------------------------------------- sonidos
const NOTE = [0, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];
const sfx = {
  turn: () => {
    noise(0.03, { freq: 2600, q: 3, vol: 0.1 });
    tone(880, 1240, 0.05, { type: 'triangle', vol: 0.05 });
  },
  pick: () => tone(620, 900, 0.07, { type: 'sine', vol: 0.08 }),
  drop: () => {
    tone(1320, 1180, 0.12, { type: 'sine', vol: 0.09 });
    noise(0.025, { freq: 4200, q: 4, vol: 0.08 });
  },
  nope: () => tone(220, 170, 0.12, { type: 'square', vol: 0.035 }),
  undo: () => tone(700, 420, 0.09, { type: 'triangle', vol: 0.07 }),
  crystal: (c) => {
    const f = NOTE[c] || 660;
    tone(f, f, 0.9, { type: 'sine', vol: 0.09 });
    tone(f * 2, f * 2, 0.5, { type: 'sine', vol: 0.03, at: 0.01 });
  },
  win: () => notes([523.25, 659.25, 783.99, 1046.5, 1318.5, 1568], { step: 0.075, dur: 0.6, type: 'triangle', vol: 0.11 }),
  hint: () => notes([880, 1174.66], { step: 0.08, dur: 0.3, type: 'sine', vol: 0.09 }),
  click: () => tone(1000, 1100, 0.03, { type: 'triangle', vol: 0.04 }),
};

// ---------------------------------------------------------------- pantallas
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
}
function setHud(on) {
  $('hud').hidden = !on;
}

// ---------------------------------------------------------------- tamaño y ubicación del tablero
function measure() {
  W = innerWidth;
  H = innerHeight;
  dpr = Math.min(2, devicePixelRatio || 1);
  for (const c of [cv, layer]) {
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
  }
  if (S.game) layoutLevel();
  else paintLayer();
}

/** Ubica el tablero y la bandeja en el espacio libre entre la barra de arriba y la de abajo. */
function layoutLevel() {
  const n = S.n;
  const top = Math.max(TOP + 50, $('hud-top').getBoundingClientRect().bottom) + 10;
  const barTop = $('hud-bar').getBoundingClientRect().top;
  const bottom = (barTop > 0 ? barTop : H - 70) - 10;
  const moveIds = S.game.pieces.filter((p) => p.mode === 'move').map((p) => p.id);
  const k = moveIds.length;
  const pad = 14;
  const availW = W - pad * 2, availH = bottom - top;
  const side = k > 0 && W > H * 1.02;
  const fr = 0.75; // el marco de bronce (dos lados) en casillas
  let T;
  if (!k) T = Math.min(availW / (n + fr), availH / (n + fr));
  else if (side) T = Math.min(availW / (n + fr + 1.7), availH / (n + fr), (availH - 34) / (k * 1.12));
  else T = Math.min(availW / (n + fr), (availH - 40) / (n + fr + 1.12), (availW - 24) / (k * 1.12));
  T = Math.floor(clamp(T, 22, 96));
  const S0 = n * T;
  const F = clamp(T * 0.3, 8, 20);
  const s = Math.round(Math.min(T, 70) * 0.94); // casillero de la bandeja
  const gap = Math.max(16, T * 0.35);
  let ox, oy, tray = null;
  if (!k) {
    ox = Math.round((W - S0) / 2);
    oy = Math.round(top + (availH - S0) / 2);
  } else if (side) {
    const tw = Math.max(s + 24, 76), th = k * (s + 10) + 30;
    const total = S0 + F * 2 + gap + tw;
    ox = Math.round((W - total) / 2 + F);
    oy = Math.round(top + (availH - S0) / 2);
    const tx = ox + S0 + F + gap, ty = Math.round(oy + (S0 - th) / 2);
    tray = { x: tx, y: ty, w: tw, h: th, vertical: true, slots: moveIds.map((id, i) => ({ id, x: tx + tw / 2, y: ty + 28 + i * (s + 10) + s / 2, s })) };
  } else {
    const tw = k * (s + 10) + 14, th = s + 32;
    const total = S0 + F * 2 + gap + th;
    ox = Math.round((W - S0) / 2);
    oy = Math.round(top + (availH - total) / 2 + F);
    const tx = Math.round((W - tw) / 2), ty = Math.round(oy + S0 + F + gap);
    tray = { x: tx, y: ty, w: tw, h: th, vertical: false, slots: moveIds.map((id, i) => ({ id, x: tx + 12 + i * (s + 10) + s / 2, y: ty + 24 + s / 2, s })) };
  }
  S.L = { ox, oy, T, n, F, tray };
  paintLayer();
  // las piezas van derecho a su lugar nuevo
  for (const p of S.game.pieces) {
    const v = S.vis[p.id];
    const [x, y, size] = homeOf(p);
    Object.assign(v, { x, y, size });
  }
}

function paintLayer() {
  const g = lctx;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!S.game || S.phase === 'menu') {
    R.drawBackground(g, W, H, 'diario', { x: W * 0.5, y: H * 0.42 });
    return;
  }
  const L = S.L;
  const c = { x: L.ox + (L.n * L.T) / 2, y: L.oy + (L.n * L.T) / 2 };
  R.drawBackground(g, W, H, S.theme, c);
  R.drawBoard(g, L, S.game.b.cells, S.theme);
  if (L.tray) R.drawTray(g, L.tray, t('trayLabel'));
}

const cx = (c) => S.L.ox + ((c % S.n) + 0.5) * S.L.T;
const cy = (c) => S.L.oy + (((c / S.n) | 0) + 0.5) * S.L.T;
/** Dónde va una pieza cuando nadie la arrastra: su casilla o su casillero de la bandeja. */
function homeOf(p) {
  if (p.cell >= 0) return [cx(p.cell), cy(p.cell), S.L.T];
  const slot = S.L.tray?.slots.find((s) => s.id === p.id);
  return slot ? [slot.x, slot.y, slot.s] : [W / 2, H + 80, S.L.T];
}
/** Casilla del tablero bajo un punto de la pantalla (−1 si cae afuera). */
function cellAt(x, y) {
  const { ox, oy, T, n } = S.L;
  const gx = Math.floor((x - ox) / T), gy = Math.floor((y - oy) / T);
  return gx >= 0 && gy >= 0 && gx < n && gy < n ? gy * n + gx : -1;
}
/** Pieza bajo un punto (de la bandeja o del tablero), o −1. */
function pieceAt(x, y) {
  const tray = S.L.tray;
  if (tray) for (const sl of tray.slots) if (Math.abs(x - sl.x) <= sl.s / 2 + 4 && Math.abs(y - sl.y) <= sl.s / 2 + 4 && S.game.pieces[sl.id].cell < 0) return sl.id;
  const c = cellAt(x, y);
  return c >= 0 ? S.game.at[c] : -1;
}
const inTray = (x, y) => {
  const tr = S.L.tray;
  return !!tr && x >= tr.x - 10 && x <= tr.x + tr.w + 10 && y >= tr.y - 10 && y <= tr.y + tr.h + 10;
};

// ---------------------------------------------------------------- empezar un nivel
function startLevel(lv, mode = 'level') {
  S.mode = mode;
  S.level = lv;
  S.game = new Game(lv);
  S.n = S.game.n;
  S.theme = mode === 'level' ? lv.chapter : 'diario';
  S.phase = 'play';
  S.hint = null;
  S.hintBusy = false;
  S.drag = null;
  S.press = null;
  S.held = -1;
  S.flood = 0;
  S.boost = 0;
  S.sparks = [];
  S.wiggle.clear();
  S.cursor = { x: Math.floor(S.n / 2), y: Math.floor(S.n / 2), on: S.cursor.on };
  const b = S.game.b;
  S.portalKey = new Array(S.n * S.n).fill(null);
  for (const k in b.ends) for (const c of b.ends[k]) S.portalKey[c] = k;
  S.vis = S.game.pieces.map((p) => {
    const a = R.pieceAngle(p.kind, p.o);
    return { x: 0, y: 0, a, ta: a, size: 0, lift: 0, pop: 0 };
  });
  S.born = new Float64Array(S.n * S.n * 4).fill(clock);
  S.prevSeg = new Uint8Array(S.n * S.n * 4);
  S.cry = b.targets.map(() => ({ shown: 0, want: 0, at: 0, k: 0, pop: 0 }));
  if (mode === 'level') {
    P.last = lv.key;
    save('last', P.last);
  }
  show(null);
  setHud(true);
  refreshHud();
  measure();
  // la luz arranca desde los emisores
  S.prevSeg.fill(0);
  afterChange(true);
  G.gameplay(true);
  const intro = mode === 'level' ? (S.touch ? lv.intro : lv.introDesk || lv.intro) : null;
  bubble(intro ? tl(intro) : '', 25);
}

/** Después de cada cambio: la luz nueva avanza desde donde cambió y los cristales esperan a que llegue. */
function afterChange(first = false) {
  const r = S.game.r;
  const N4 = S.n * S.n * 4;
  let minD = Infinity;
  for (let s = 0; s < N4; s++) if (r.seg[s] && r.seg[s] !== S.prevSeg[s]) minD = Math.min(minD, r.depth[s]);
  const step = S.reduced ? 0 : STEP;
  const t0 = clock + (first ? 0.25 : 0);
  for (let s = 0; s < N4; s++) if (r.seg[s] && r.seg[s] !== S.prevSeg[s]) S.born[s] = t0 + (r.depth[s] - minD) * step;
  S.prevSeg.set(r.seg);
  const { n, targets } = S.game.b;
  targets.forEach((tg, k) => {
    const c = S.cry[k];
    if (r.hit[k] === c.want) return;
    c.want = r.hit[k];
    // llega cuando termina de avanzar el tramo que entra al cristal
    let at = clock;
    const x = tg.cell % n, y = (tg.cell / n) | 0;
    for (let d = 0; d < 4; d++) {
      const px = x - DX[d], py = y - DY[d];
      if (px < 0 || py < 0 || px >= n || py >= n) continue;
      const s = (py * n + px) * 4 + d;
      if (r.seg[s]) at = Math.max(at, S.born[s] + step);
    }
    c.at = at;
  });
  if (S.hint && hintDone()) S.hint = null;
}

// ---------------------------------------------------------------- jugadas
function doTurn(id, dir) {
  if (S.phase !== 'play') return false;
  const p = S.game.pieces[id];
  if (!S.game.canTurn(id)) {
    if (p && p.mode === 'fixed') {
      S.wiggle.set(id, clock);
      sfx.nope();
      bubble(t('bolted'), 2.2);
    }
    return false;
  }
  S.game.turn(id, dir);
  S.vis[id].ta += (dir * Math.PI) / 2;
  sfx.turn();
  moved();
  return true;
}
function doPlace(id, cell) {
  if (S.phase !== 'play') return false;
  if (!S.game.place(id, cell)) return false;
  sfx.drop();
  S.vis[id].pop = 1;
  moved();
  return true;
}
function doUndo() {
  if (S.phase !== 'play' || !S.game.hist.length) return;
  const h = S.game.undo();
  if (h) syncAngle(h.id);
  sfx.undo();
  S.held = -1;
  moved();
}
function doReset() {
  if (S.phase !== 'play' || !S.game.hist.length) return;
  S.game.reset();
  S.game.pieces.forEach((p) => syncAngle(p.id));
  S.hint = null;
  S.held = -1;
  sfx.undo();
  moved();
}
/** Lleva el ángulo dibujado al de la orientación actual por el camino más corto. */
function syncAngle(id) {
  const p = S.game.pieces[id], v = S.vis[id];
  const base = R.pieceAngle(p.kind, p.o);
  const per = p.kind === 'prism' ? TAU : Math.PI;
  v.ta = base + Math.round((v.a - base) / per) * per;
}
function moved() {
  afterChange();
  refreshHud();
  bubble('', 0);
}

// ---------------------------------------------------------------- pistas
function hintDone() {
  const h = S.hint;
  if (!h || h.busy) return false;
  const p = S.game.pieces[h.id];
  if (p.cell !== h.cell) return false;
  return h.cell < 0 || STATES[p.kind] < 2 || p.o === h.o;
}
function askHint() {
  if (S.phase !== 'play' || S.hintBusy) return;
  if (S.hint) return; // la que está a la vista todavía vale
  if (P.hints <= 0) return openNoHint();
  S.hintBusy = true;
  bubble(t('hintBusy'), 3);
  const lv = S.level;
  setTimeout(() => {
    let h = null;
    try {
      const stored = lv.sol != null ? replay(lv, lv.sol).config() : null;
      h = findHint(lv, S.game.config(), { stored, maxNodes: 120000 });
    } catch (e) {
      if (DEBUG) console.warn(e);
    }
    S.hintBusy = false;
    if (S.phase !== 'play' || S.level !== lv) return;
    if (!h) return bubble('', 0);
    P.hints--;
    save('hints', P.hints);
    S.hint = { ...h, t0: clock };
    sfx.hint();
    bubble(h.cell < 0 ? t('hintTray') : '', h.cell < 0 ? 3 : 0);
    refreshHud();
  }, 40);
}
function openNoHint() {
  S.phase = 'menu-hint';
  G.gameplay(false);
  $('nh-text').textContent = t('noHintsText');
  $('b-reward').hidden = true;
  Promise.resolve(G.rewardAvailable?.('pista'))
    .then((ok) => {
      if (ok && document.querySelector('#s-nohint.on')) $('b-reward').hidden = false;
    })
    .catch(() => {});
  show('nohint');
}
$('b-reward').onclick = async () => {
  $('b-reward').hidden = true;
  let ok = false;
  try {
    ok = await G.showReward();
  } catch {}
  if (ok) {
    P.hints = Math.min(MAX_HINTS, P.hints + 1);
    save('hints', P.hints);
  }
  backToPlay();
  if (ok) askHint();
};
$('b-nh-back').onclick = () => backToPlay();
function backToPlay() {
  show(null);
  S.phase = 'play';
  G.gameplay(true);
  refreshHud();
}

// ---------------------------------------------------------------- HUD
function refreshHud() {
  if (!S.game) return;
  const lv = S.level;
  const m = S.game.moves;
  if (S.mode !== 'level') {
    $('h-chap').textContent = t('dailyKicker', { n: S.daily.n });
    $('h-name').textContent = t('dailyName');
  } else {
    const ch = CHAPTERS.find((c) => c.id === lv.chapter);
    $('h-chap').textContent = t('chapLevel', { c: tl(ch.name), i: lv.i + 1, m: LEVELS[lv.chapter].length });
    $('h-name').textContent = tl(lv.name);
  }
  $('h-moves').textContent = m;
  $('h-moves-l').textContent = m === 1 ? t('move1') : t('moves');
  $('h-par').textContent = t('par', { p: lv.par });
  const st = starsFor(lv.par, m);
  $$('#h-stars i').forEach((el, i) => el.classList.toggle('on', i < st));
  $('h-hints').textContent = P.hints;
  $('b-hint').classList.toggle('empty', P.hints <= 0);
  $('b-undo').disabled = !m;
  $('b-reset').disabled = !m;
}

function bubble(txt, secs) {
  const el = $('bubble');
  if (!txt) {
    if (S.bubbleT > 0 && secs === 0 && el.dataset.sticky === '1' && S.game?.moves === 0) return;
    el.classList.remove('on');
    S.bubbleT = 0;
    return;
  }
  el.textContent = txt;
  el.classList.add('on');
  el.dataset.sticky = secs > 5 ? '1' : '0';
  S.bubbleT = secs;
}

// ---------------------------------------------------------------- ganar
function checkWin() {
  if (S.phase !== 'play' || !S.game.won()) return;
  if (S.drag || S.cry.some((c, k) => c.shown !== S.game.b.targets[k].color)) return;
  S.phase = 'won';
  S.winAt = clock;
  S.held = -1;
  S.hint = null;
  G.gameplay(false);
  sfx.win();
  bubble('', 0);
  // destellos que salen de cada cristal
  if (!S.reduced)
    for (const tg of S.game.b.targets)
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * TAU, v = (0.6 + Math.random()) * S.L.T * 2.2;
        S.sparks.push({ x: cx(tg.cell), y: cy(tg.cell), vx: Math.cos(a) * v, vy: Math.sin(a) * v, c: tg.color, life: 0.7 + Math.random() * 0.5 });
      }
  const moves = S.game.moves;
  const lv = S.level;
  if (S.mode === 'daily') finishDaily(moves);
  else if (S.mode === 'practice')
    setTimeout(() => {
      if (S.phase !== 'won' || S.level !== lv) return;
      setHud(false);
      showDailyResult(dailyInfo());
    }, S.reduced ? 500 : 1500);
  else finishLevel(lv, moves);
}

function finishLevel(lv, moves) {
  const prev = P.best[lv.key];
  const prevStars = starsFor(lv.par, prev);
  const ci = CHAPTERS.findIndex((c) => c.id === lv.chapter);
  const wasOpen = CHAPTERS.map((c, i) => chapterOpen(i));
  if (prev == null || moves < prev) {
    P.best[lv.key] = moves;
    save('best', P.best);
  }
  const stars = starsFor(lv.par, moves);
  let gift = false;
  if (stars === 3 && prevStars < 3 && P.hints < MAX_HINTS) {
    P.hints++;
    save('hints', P.hints);
    gift = true;
  }
  const opened = CHAPTERS.findIndex((c, i) => i > ci - 1 && !wasOpen[i] && chapterOpen(i));
  setTimeout(() => {
    if (S.phase !== 'won' || S.level !== lv) return;
    setHud(false);
    const ch = CHAPTERS[ci];
    $('w-kicker').textContent = t('chapLevel', { c: tl(ch.name), i: lv.i + 1, m: LEVELS[lv.chapter].length });
    $('w-title').textContent = moves <= lv.par ? t('winPerfect') : t('win');
    renderStars($('w-stars'), stars);
    const best = P.best[lv.key];
    $('w-text').textContent = (moves <= lv.par ? t('winTextPar', { m: moves }) : t('winText', { m: moves, p: lv.par })) + (best < moves ? t('winTextBest', { b: best }) : '');
    $('w-gift').hidden = !gift;
    $('w-gift').textContent = t('gift');
    const nx = nextLevel(lv);
    $('b-next').hidden = !nx;
    $('b-next-sub').textContent = nx ? (opened >= 0 ? t('unlocked', { c: tl(CHAPTERS[opened].name) }) : tl(nx.name)) : '';
    $('w-all').hidden = !!nx;
    $('w-all').textContent = t('allDone');
    S.nextLv = nx;
    show('win');
  }, S.reduced ? 500 : 1500);
}

function renderStars(el, n) {
  el.innerHTML = [0, 1, 2].map((i) => `<i class="${i < n ? 'on' : ''}" style="--d:${i * 0.16}s">★</i>`).join('');
}

// ---------------------------------------------------------------- luz del día
function dailyInfo() {
  const date = today();
  const n = dayNumber(DAILY_EPOCH, date);
  const rec = loadDay(ID, 'all', date);
  return { date, n, rec };
}
function getDailyLevel(date) {
  if (S.dailyCache?.date === date) return S.dailyCache.lv;
  const lv = { ...dailyLevel(date), key: `dia-${date}` };
  S.dailyCache = { date, lv };
  return lv;
}
function startDaily() {
  const d = dailyInfo();
  if (d.rec?.done) return showDailyResult(d);
  $('b-daily-sub').textContent = t('preparing');
  setTimeout(() => {
    const lv = getDailyLevel(d.date);
    S.daily = { ...d };
    markPortal(ID, { date: d.date, done: false, won: false, streak: 0 });
    startLevel(lv, 'daily');
    refreshHome();
  }, 30);
}
function finishDaily(moves) {
  const d = S.daily;
  const lv = S.level;
  const stars = starsFor(lv.par, moves);
  const st = record(ID, 'all', { date: d.date, won: true, score: Math.min(9, moves - lv.par) });
  saveDay(ID, 'all', { done: true, moves, par: lv.par, stars, crystals: lv.map.join(' ').match(/\*[rgbymcw]/g)?.map((x) => x[1]) || [] }, d.date);
  markPortal(ID, { date: d.date, done: true, won: true, streak: st.streak });
  setTimeout(() => {
    if (S.phase !== 'won' || S.level !== lv) return;
    setHud(false);
    showDailyResult(dailyInfo(), st);
  }, S.reduced ? 500 : 1500);
}
let clockTimer = 0;
function showDailyResult(d, st = null) {
  const rec = d.rec;
  if (!rec) return;
  // recién resuelto: el tablero queda encendido detrás; si no, el decorado del inicio
  if (!(S.game && S.phase === 'won')) {
    S.phase = 'menu';
    S.game = null;
    paintLayer();
  }
  G.gameplay(false);
  $('d-kicker').textContent = t('dailyKicker', { n: d.n });
  $('d-title').textContent = t('dailyWin');
  renderStars($('d-stars'), rec.stars);
  $('d-text').textContent = t('dailyText', { m: rec.moves, p: rec.par });
  const stats = st || JSON.parse(localStorage.getItem(`gameit:${ID}:stats:all`) || 'null') || { won: 1, streak: 1, best: 1 };
  $('d-stats').innerHTML = [
    [stats.won, t('stPlayed')],
    [stats.streak, t('stStreak')],
    [stats.best, t('stBest')],
  ]
    .map(([v, k]) => `<span><b>${v}</b><small>${k}</small></span>`)
    .join('');
  $('d-status').textContent = '';
  clearInterval(clockTimer);
  const tick = () => {
    $('d-clock').textContent = fmtClock(msUntilNext());
    if (today() !== d.date) {
      clearInterval(clockTimer);
      refreshHome();
    }
  };
  tick();
  clockTimer = setInterval(tick, 1000);
  show('daily');
}
const SQ = { r: '🟥', g: '🟩', b: '🟦', y: '🟨', m: '🟪', c: '🩵', w: '⬜' };
$('b-share').onclick = async () => {
  const d = dailyInfo();
  const rec = d.rec;
  if (!rec) return;
  const gems = (rec.crystals || []).map((c) => SQ[c] || '💎').join('');
  const text = `game.it · ${t('title')} #${d.n}\n${gems} ${'⭐'.repeat(rec.stars)}\n${t('dailyText', { m: rec.moves, p: rec.par })}\n${shareLink(ID)}`;
  const r = await share(text);
  $('d-status').textContent = r === 'copied' ? t('copied') : r === 'shared' ? t('shared') : '';
};
$('b-d-again').onclick = () => {
  // práctica: se vuelve a jugar sin tocar el resultado del día
  const d = dailyInfo();
  clearInterval(clockTimer);
  S.daily = { ...d, practice: true };
  startLevel(getDailyLevel(d.date), 'practice');
};
$('b-d-home').onclick = () => toHome();

// ---------------------------------------------------------------- menús
function refreshHome() {
  const lv = nextLevel();
  if (lv) {
    const ch = CHAPTERS.find((c) => c.id === lv.chapter);
    $('b-play-sub').textContent = t('playSub', { c: tl(ch.name), i: lv.i + 1 });
  } else $('b-play-sub').textContent = t('playAll');
  $('b-levels-sub').textContent = t('levelsSub', { s: totalStars(), m: ALL.length * 3 });
  const d = dailyInfo();
  $('b-daily-sub').textContent = d.rec?.done ? t('dailyDone', { n: d.n, m: d.rec.moves }) : t('dailySub', { n: d.n });
  $('b-daily').classList.toggle('done', !!d.rec?.done);
  $('home-keys').textContent = S.touch ? t('keysTouch') : t('keysDesk');
}
function toHome() {
  clearInterval(clockTimer);
  S.phase = 'menu';
  S.game = null;
  S.mode = null;
  setHud(false);
  G.gameplay(false);
  paintLayer();
  refreshHome();
  show('home');
}
function renderLevels() {
  $('lv-total').textContent = t('totalStars', { s: totalStars(), m: ALL.length * 3 });
  const html = CHAPTERS.map((ch, ci) => {
    const open = chapterOpen(ci);
    const list = LEVELS[ch.id];
    if (!list.length) return '';
    const stars = list.reduce((s, l, i) => s + starsFor(l.par, P.best[`${ch.id}-${i + 1}`]), 0);
    const prev = CHAPTERS[ci - 1];
    const lock = !open ? `<p class="lock">🔒 ${t('locked', { k: Math.min(UNLOCK, LEVELS[prev.id].length), c: tl(prev.name) })}</p>` : '';
    const btns = list
      .map((l, i) => {
        const lv = ALL.find((x) => x.key === `${ch.id}-${i + 1}`);
        const ok = open && levelOpen(lv);
        const st = starsFor(l.par, P.best[lv.key]);
        const cls = ['lv', !ok ? 'locked' : '', P.best[lv.key] != null ? 'done' : '', P.last === lv.key ? 'cur' : ''].join(' ');
        return `<button class="${cls}" data-key="${lv.key}" ${ok ? '' : 'disabled'} aria-label="${tl(l.name)}"><b>${i + 1}</b><span class="st">${[0, 1, 2].map((k) => `<i class="${k < st ? 'on' : ''}">★</i>`).join('')}</span></button>`;
      })
      .join('');
    return `<div class="chap ${open ? '' : 'locked'}" style="--tint:${R.THEMES[ch.id].tint.join(',')}"><div class="ch-head"><b>${tl(ch.name)}</b><small>★ ${stars}/${list.length * 3}</small></div>${lock}<div class="lv-grid">${btns}</div></div>`;
  }).join('');
  $('chapters').innerHTML = html;
  for (const b of $$('#chapters .lv')) b.onclick = () => openLevel(ALL.find((l) => l.key === b.dataset.key));
}
/** Abre un nivel: si su capítulo trae una idea nueva que no se vio, primero se muestra. */
function openLevel(lv) {
  if (!lv) return;
  const ch = CHAPTERS.find((c) => c.id === lv.chapter);
  if (ch.tip && !P.tips.includes(ch.id)) {
    P.tips.push(ch.id);
    save('tips', P.tips);
    S.tipLevel = lv;
    $('tip-title').textContent = tl(ch.tip.title);
    $('tip-text').textContent = tl(ch.tip.text);
    S.tip = { level: { map: ch.tip.demo, tray: [] }, theme: ch.id };
    show('tip');
    return;
  }
  startLevel(lv);
}
$('b-tip-go').onclick = () => {
  S.tip = null;
  startLevel(S.tipLevel);
};

$('b-play').onclick = () => {
  const lv = nextLevel();
  if (lv) openLevel(lv);
  else {
    renderLevels();
    show('levels');
  }
};
$('b-levels').onclick = () => {
  renderLevels();
  show('levels');
};
$('b-levels-back').onclick = () => toHome();
$('b-daily').onclick = () => startDaily();

// pausa
function pause() {
  if (S.phase !== 'play') return;
  S.phase = 'paused';
  S.drag = null;
  S.press = null;
  G.gameplay(false);
  $('p-kicker').textContent = S.mode === 'daily' || S.mode === 'practice' ? t('dailyKicker', { n: S.daily.n }) : $('h-chap').textContent;
  $('b-p-levels').hidden = S.mode !== 'level';
  show('pause');
}
function resume() {
  if (S.phase !== 'paused') return;
  show(null);
  S.phase = 'play';
  G.gameplay(true);
}
$('b-pause').onclick = () => pause();
$('b-resume').onclick = () => resume();
$('b-p-reset').onclick = () => {
  resume();
  doReset();
};
$('b-p-levels').onclick = () => {
  setHud(false);
  S.phase = 'menu';
  renderLevels();
  show('levels');
};
$('b-p-home').onclick = () => toHome();
$('b-undo').onclick = () => doUndo();
$('b-reset').onclick = () => doReset();
$('b-hint').onclick = () => askHint();

// ganar
$('b-next').onclick = async () => {
  const nx = S.nextLv;
  try {
    await G.commercialBreak('siguiente');
  } catch {}
  if (nx) openLevel(nx);
};
$('b-again').onclick = async () => {
  try {
    await G.commercialBreak('otra');
  } catch {}
  startLevel(S.level);
};
$('b-w-levels').onclick = () => {
  setHud(false);
  S.phase = 'menu';
  S.game = null;
  paintLayer();
  renderLevels();
  show('levels');
};
for (const b of $$('.btn, .link')) b.addEventListener('click', () => sfx.click());

// ---------------------------------------------------------------- mouse y pantalla táctil
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('pointerdown', (e) => {
  if (S.phase !== 'play' || !S.game) return;
  if (S.press) return;
  try {
    cv.setPointerCapture(e.pointerId);
  } catch {}
  S.cursor.on = false;
  if (S.held >= 0) S.held = -1;
  const id = pieceAt(e.clientX, e.clientY);
  const pr = { pid: e.pointerId, x: e.clientX, y: e.clientY, id, button: e.button, handled: false, timer: 0 };
  S.press = pr;
  if (id >= 0 && e.pointerType !== 'mouse' && S.game.canTurn(id))
    pr.timer = setTimeout(() => {
      if (S.press === pr && !S.drag) {
        pr.handled = true;
        doTurn(id, -1);
      }
    }, 460);
});
cv.addEventListener('pointermove', (e) => {
  if (!S.game || S.phase !== 'play') return;
  if (e.pointerType === 'mouse') {
    const id = pieceAt(e.clientX, e.clientY);
    S.hover = id;
    cv.style.cursor = id >= 0 && S.game.pieces[id].mode !== 'fixed' ? (S.game.pieces[id].mode === 'move' ? 'grab' : 'pointer') : 'default';
  }
  const pr = S.press;
  if (!pr || pr.pid !== e.pointerId) return;
  if (S.drag) {
    S.drag.x = e.clientX;
    S.drag.y = e.clientY;
    return;
  }
  const p = pr.id >= 0 ? S.game.pieces[pr.id] : null;
  if (p && p.mode === 'move' && !pr.handled && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > 8) {
    clearTimeout(pr.timer);
    S.drag = { id: p.id, x: e.clientX, y: e.clientY, dx: S.vis[p.id].x - pr.x, dy: S.vis[p.id].y - pr.y };
    cv.style.cursor = 'grabbing';
    sfx.pick();
  }
});
function endPress(e, cancel = false) {
  const pr = S.press;
  if (!pr || pr.pid !== e.pointerId) return;
  clearTimeout(pr.timer);
  S.press = null;
  if (S.drag) {
    const d = S.drag;
    S.drag = null;
    cv.style.cursor = 'default';
    if (cancel || S.phase !== 'play') return;
    const p = S.game.pieces[d.id];
    const x = d.x + d.dx * 0.4, y = d.y + d.dy * 0.4;
    const cell = cellAt(x, y);
    if (cell >= 0) {
      if (cell === p.cell) return;
      if (!doPlace(d.id, cell)) {
        sfx.nope();
        S.wiggle.set(d.id, clock);
      }
    } else if (p.cell >= 0 && (inTray(x, y) || cell < 0)) doPlace(d.id, -1);
    return;
  }
  if (cancel || pr.handled || pr.id < 0) return;
  const p = S.game.pieces[pr.id];
  if (pr.button === 2) doTurn(pr.id, -1);
  else if (S.game.canTurn(pr.id)) doTurn(pr.id, 1);
  else if (p.mode === 'fixed') doTurn(pr.id, 1);
  else S.wiggle.set(pr.id, clock); // un filtro no gira: solo se arrastra
}
cv.addEventListener('pointerup', (e) => endPress(e));
cv.addEventListener('pointercancel', (e) => endPress(e, true));
cv.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'mouse') S.hover = -1;
});

// ---------------------------------------------------------------- teclado y mando
/** Celdas por las que se mueve el cursor: el tablero y, debajo, la bandeja (fila n). */
function cursorTarget() {
  const c = S.cursor;
  if (c.y >= S.n) {
    const slots = S.L.tray?.slots || [];
    const sl = slots[clamp(c.x, 0, slots.length - 1)];
    return sl ? { tray: true, id: S.game.pieces[sl.id].cell < 0 ? sl.id : -1, slot: sl } : null;
  }
  const cell = c.y * S.n + c.x;
  return { tray: false, cell, id: S.game.at[cell] };
}
function moveCursor(dx, dy) {
  const c = S.cursor;
  if (!c.on) {
    c.on = true;
    return;
  }
  const hasTray = !!S.L.tray;
  if (c.y >= S.n) {
    if (dy < 0) {
      c.y = S.n - 1;
      c.x = clamp(Math.round(((c.x + 0.5) / S.L.tray.slots.length) * S.n - 0.5), 0, S.n - 1);
    } else c.x = clamp(c.x + dx, 0, S.L.tray.slots.length - 1);
  } else {
    c.x = clamp(c.x + dx, 0, S.n - 1);
    if (dy > 0 && c.y === S.n - 1 && hasTray) {
      c.y = S.n;
      c.x = clamp(Math.floor((c.x / S.n) * S.L.tray.slots.length), 0, S.L.tray.slots.length - 1);
    } else c.y = clamp(c.y + dy, 0, S.n - 1);
  }
  sfx.click();
}
function keyAction(rot = 1) {
  const c = S.cursor;
  if (!c.on) {
    c.on = true;
    return;
  }
  const tg = cursorTarget();
  if (!tg) return;
  if (S.held >= 0) {
    const id = S.held;
    if (rot !== 1 || (!tg.tray && tg.id === id)) {
      if (rot !== 1) doTurn(id, rot);
      else S.held = -1;
      return;
    }
    S.held = -1;
    if (tg.tray) {
      if (S.game.pieces[id].cell >= 0) doPlace(id, -1);
    } else if (!doPlace(id, tg.cell)) {
      sfx.nope();
      S.wiggle.set(id, clock);
    }
    return;
  }
  if (tg.id < 0) return;
  const p = S.game.pieces[tg.id];
  if (rot === 1 && p.mode === 'move') {
    S.held = tg.id;
    sfx.pick();
    return;
  }
  doTurn(tg.id, rot);
}
addEventListener('keydown', (e) => {
  const k = e.key;
  if (S.phase === 'paused') {
    if (k === 'Escape' || k === 'p' || k === 'P') resume();
    return;
  }
  if (S.phase !== 'play' || !S.game) {
    if (S.phase === 'menu' && document.querySelector('#s-tip.on') && (k === 'Enter' || k === ' ')) $('b-tip-go').click();
    return;
  }
  const dir = G.dir?.(e);
  if (dir) {
    e.preventDefault();
    const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir] || [0, 0];
    moveCursor(dx, dy);
    return;
  }
  if (k === ' ' || k === 'Enter') {
    e.preventDefault();
    keyAction(1);
  } else if (k === 'q' || k === 'Q' || k === 'x' || k === 'X') keyAction(-1);
  else if (k === 'e' || k === 'E') {
    const tg = S.cursor.on ? cursorTarget() : null;
    const id = S.held >= 0 ? S.held : tg?.id ?? -1;
    if (id >= 0) doTurn(id, 1);
  } else if (k === 'z' || k === 'Z' || k === 'Backspace') doUndo();
  else if (k === 'r' || k === 'R') doReset();
  else if (k === 'h' || k === 'H') askHint();
  else if (k === 'Escape') {
    if (S.held >= 0) S.held = -1;
    else pause();
  } else if (k === 'p' || k === 'P') pause();
});

const pad = { prev: [], rep: 0, dir: null };
function pollPad(dt) {
  const gp = navigator.getGamepads?.()?.find((g) => g && g.connected);
  if (!gp) return;
  const b = (i) => !!gp.buttons[i]?.pressed;
  const pressed = (i) => b(i) && !pad.prev[i];
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  let dir = null;
  if (b(12) || ay < -0.6) dir = [0, -1];
  else if (b(13) || ay > 0.6) dir = [0, 1];
  else if (b(14) || ax < -0.6) dir = [-1, 0];
  else if (b(15) || ax > 0.6) dir = [1, 0];
  if (S.phase === 'play') {
    if (dir) {
      const key = dir.join();
      if (pad.dir !== key) {
        moveCursor(...dir);
        pad.rep = 0.32;
      } else if ((pad.rep -= dt) <= 0) {
        moveCursor(...dir);
        pad.rep = 0.11;
      }
      pad.dir = key;
    } else pad.dir = null;
    if (pressed(0)) keyAction(1);
    if (pressed(2)) keyAction(-1);
    if (pressed(1)) {
      if (S.held >= 0) S.held = -1;
      else doUndo();
    }
    if (pressed(3)) askHint();
    if (pressed(9)) pause();
  } else if (S.phase === 'paused' && pressed(9)) resume();
  pad.prev = gp.buttons.map((x) => x.pressed);
}

// ---------------------------------------------------------------- dibujo
/** Tramos de luz a dibujar (los nuevos, hasta donde llegaron). */
function beamSegs(r, b, T, ccx, ccy, born, now) {
  const segs = [];
  const N4 = b.n * b.n * 4;
  for (let s = 0; s < N4; s++) {
    const m = r.seg[s];
    if (!m) continue;
    const c = s >> 2, d = s & 3;
    const st = r.stop[s];
    const p0 = b.cells[c] === 2 ? T * 0.36 : 0;
    const p1 = st === 1 ? T * 0.5 : st === 2 ? T * 0.6 : T;
    let k = 1;
    if (born) {
      k = clamp((now - born[s]) / STEP, 0, 1);
      if (k <= 0) continue;
    }
    const x = ccx(c), y = ccy(c);
    const e = p0 + (p1 - p0) * k;
    segs.push({ x1: x + DX[d] * p0, y1: y + DY[d] * p0, x2: x + DX[d] * e, y2: y + DY[d] * e, c: m, d0: r.depth[s] });
  }
  return segs;
}

/** Dibuja un nivel entero (para el juego y para los ejemplos de las ideas nuevas). */
function drawScene(g, v, now) {
  const { b, pieces, at, r, T } = v;
  const ccx = v.cx, ccy = v.cy;
  const n = b.n;
  // bases de las piezas del tablero
  for (const p of pieces) {
    if (p.cell < 0) continue;
    const vs = v.vis?.[p.id];
    if (S.drag && S.drag.id === p.id && v.live) continue;
    const x = vs ? vs.x : ccx(p.cell), y = vs ? vs.y : ccy(p.cell);
    const hv = v.live && (S.hover === p.id || S.held === p.id) ? 1 : 0;
    R.drawBase(g, p.mode, x, y, vs ? vs.size : T, { hover: hv, spin: vs ? vs.a * 0.25 : 0, lift: vs ? vs.lift : 0 });
  }
  // portales y emisores
  for (let c = 0; c < n * n; c++) {
    if (b.cells[c] !== 4) continue;
    let act = false;
    for (let d = 0; d < 4; d++) if (r.seg[c * 4 + d]) act = true;
    R.drawPortal(g, ccx(c), ccy(c), T, v.portalKey?.[c] || 'a', now, act, S.reduced);
  }
  for (const e of b.emitters) R.drawEmitter(g, ccx(e.cell), ccy(e.cell), T, e.d, e.color, now, S.reduced ? 1 : 0.5 + 0.5 * Math.sin(now * 3 + e.cell));
  // luz
  R.drawBeams(g, beamSegs(r, b, T, ccx, ccy, v.born, now), T, now, { reduced: S.reduced, boost: v.boost || 0 });
  // piezas
  for (const p of pieces) {
    if (p.cell < 0 && !v.live) continue;
    if (v.live && S.drag?.id === p.id) continue;
    const vs = v.vis?.[p.id];
    let x = vs ? vs.x : ccx(p.cell), y = vs ? vs.y : ccy(p.cell);
    const size = vs ? vs.size : T;
    const a = vs ? vs.a : R.pieceAngle(p.kind, p.o);
    const wg = S.wiggle.get(p.id);
    if (wg != null && now - wg < 0.4) x += Math.sin((now - wg) * 40) * size * 0.05 * (1 - (now - wg) / 0.4);
    if (p.cell < 0) R.drawBase(g, 'move', x, y, size, { hover: v.live && S.hover === p.id ? 1 : 0 });
    const sc = vs ? 1 + (vs.pop || 0) * 0.12 : 1;
    R.drawPiece(g, p, x, y, size * sc, a, 1, now);
  }
  // cristales
  b.targets.forEach((tg, k) => {
    const c = v.cry ? v.cry[k] : { shown: r.hit[k], k: r.hit[k] === tg.color ? 1 : 0, pop: 0 };
    R.drawCrystal(g, ccx(tg.cell), ccy(tg.cell), T, tg.color, c.shown, c.k, now, c.pop, S.reduced);
  });
}

function drawGame(g, now) {
  const L = S.L, T = L.T;
  const v = { b: S.game.b, pieces: S.game.pieces, at: S.game.at, r: S.game.r, T, cx, cy, vis: S.vis, cry: S.cry, born: S.born, portalKey: S.portalKey, live: true, boost: S.boost };
  // casilla de destino mientras se arrastra
  if (S.drag) {
    const d = S.drag;
    const cell = cellAt(d.x + d.dx * 0.4, d.y + d.dy * 0.4);
    if (cell >= 0) {
      const ok = S.game.canDrop(d.id, cell);
      g.fillStyle = ok ? 'rgba(255,214,130,.13)' : 'rgba(255,90,90,.12)';
      g.strokeStyle = ok ? 'rgba(255,214,130,.7)' : 'rgba(255,110,110,.55)';
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(cx(cell) - T / 2 + 3, cy(cell) - T / 2 + 3, T - 6, T - 6, T * 0.12);
      g.fill();
      g.stroke();
    }
  }
  drawScene(g, v, now);
  // pista: silueta dorada de dónde va la pieza
  if (S.hint && !S.hint.busy) {
    const h = S.hint;
    const p = S.game.pieces[h.id];
    const k = 0.5 + 0.5 * Math.sin(now * 5);
    const a = R.pieceAngle(p.kind, h.o);
    if (h.cell >= 0) R.drawGhost(g, p, cx(h.cell), cy(h.cell), T, a, k, now);
    else {
      const sl = L.tray?.slots.find((s) => s.id === h.id);
      if (sl) R.drawGhost(g, p, sl.x, sl.y, sl.s, a, k, now);
    }
    // la pieza que hay que tocar, con un aro que late
    const vs = S.vis[h.id];
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = `rgba(255,214,120,${0.35 + 0.4 * k})`;
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(vs.x, vs.y, vs.size * (0.52 + 0.05 * k), 0, TAU);
    g.stroke();
    g.restore();
  }
  // cursor del teclado
  if (S.cursor.on && S.phase === 'play') {
    const tg = cursorTarget();
    if (tg?.tray) R.drawCursor(g, tg.slot.x, tg.slot.y, tg.slot.s + 8, now, S.held >= 0);
    else if (tg) R.drawCursor(g, cx(tg.cell), cy(tg.cell), T, now, S.held >= 0);
  }
  // pieza levantada (con el dedo, el mouse o el teclado)
  const lifted = S.drag ? S.drag.id : S.held;
  if (lifted >= 0) {
    const p = S.game.pieces[lifted];
    const vs = S.vis[lifted];
    let x = vs.x, y = vs.y;
    if (S.drag) {
      x = S.drag.x + S.drag.dx;
      y = S.drag.y + S.drag.dy - (S.touch ? T * 0.55 : 0);
      vs.x = x;
      vs.y = y;
      vs.size = T;
    }
    R.drawBase(g, 'move', x, y, T * 1.08, { lift: 1, hover: 1 });
    R.drawPiece(g, p, x, y, T * 1.08, vs.a, 1, now);
  }
  // destellos y luz al ganar
  if (S.sparks.length) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const s of S.sparks) R.blot(g, s.c, s.x, s.y, T * 0.22 * (0.4 + s.life), Math.min(1, s.life * 1.4));
    g.restore();
  }
  if (S.flood > 0.01) {
    const bx = L.ox + (L.n * T) / 2, by = L.oy + (L.n * T) / 2;
    const gr = g.createRadialGradient(bx, by, 0, bx, by, L.n * T * 0.9);
    gr.addColorStop(0, `rgba(255,246,220,${0.45 * S.flood})`);
    gr.addColorStop(1, 'rgba(255,240,200,0)');
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.restore();
  }
}

/** Decorado del inicio: un rayo blanco entra a un prisma grande y sale abierto en rojo, verde y azul. */
function drawHome(g, now) {
  const portrait = H > W;
  const px = portrait ? W * 0.5 : W * 0.2, py = portrait ? TOP + (H - TOP) * 0.13 : H * 0.55;
  const T = Math.min(W, H) * (portrait ? 0.22 : 0.2);
  const a = portrait ? 0 : -0.25;
  const wob = S.reduced ? 0 : Math.sin(now * 0.5) * 0.03;
  R.drawRay(g, -40, py + Math.tan(a) * (px + 40), px - T * 0.25, py, 7, T * 0.5, now, S.reduced);
  const out = [-0.35, 0, 0.35];
  [1, 2, 4].forEach((c, i) => {
    const ang = a + out[i] + wob;
    const L = Math.hypot(W, H);
    R.drawRay(g, px + T * 0.2, py, px + Math.cos(ang) * L, py + Math.sin(ang) * L, c, T * 0.42, now, S.reduced);
  });
  R.drawPrism(g, px, py, T, a, 1, now);
}

let last = performance.now();
function frame(nowMs) {
  const real = clamp((nowMs - last) / 1000, 0, 0.05);
  last = nowMs;
  clock += real;
  pollPad(real);
  const g = ctx;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(layer, 0, 0);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (S.game && S.L && S.phase !== 'menu') {
    update(real);
    drawGame(g, clock);
  } else if (S.tip && document.querySelector('#s-tip.on')) {
    drawHome(g, clock);
    drawTip(clock);
  } else drawHome(g, clock);
  requestAnimationFrame(frame);
}

function update(dt) {
  // piezas: posición, tamaño y ángulo hacia donde tienen que estar
  for (const p of S.game.pieces) {
    const v = S.vis[p.id];
    if (S.drag?.id === p.id) continue;
    const [x, y, size] = homeOf(p);
    v.x = damp(v.x, x, 18, dt);
    v.y = damp(v.y, y, 18, dt);
    v.size = damp(v.size, size, 14, dt);
    v.a = S.reduced ? v.ta : damp(v.a, v.ta, 20, dt);
    v.pop = Math.max(0, v.pop - dt * 4);
    v.lift = damp(v.lift, S.held === p.id ? 1 : 0, 12, dt);
  }
  // cristales: se prenden cuando les llega la luz
  S.game.b.targets.forEach((tg, i) => {
    const c = S.cry[i];
    if (clock >= c.at && c.shown !== c.want) {
      c.shown = c.want;
      if (c.shown === tg.color) {
        c.pop = 1;
        sfx.crystal(tg.color);
      }
    }
    c.k = damp(c.k, c.shown === tg.color ? 1 : 0, 6, dt);
    c.pop = Math.max(0, c.pop - dt * 2.2);
  });
  if (S.phase === 'play') checkWin();
  if (S.phase === 'won') {
    const e = clock - S.winAt;
    S.flood = S.reduced ? 0 : clamp(e < 0.3 ? e / 0.3 : 1 - (e - 0.3) / 1.1, 0, 1);
    S.boost = clamp(1.4 - e, 0, 1.2);
  }
  for (const s of S.sparks) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vx *= 1 - dt * 2;
    s.vy *= 1 - dt * 2;
    s.life -= dt;
  }
  S.sparks = S.sparks.filter((s) => s.life > 0);
  if (S.bubbleT > 0 && S.phase === 'play') {
    S.bubbleT -= dt;
    if (S.bubbleT <= 0) $('bubble').classList.remove('on');
  }
}

/** Ejemplo animado de la idea nueva (en su propio canvas). */
const tipCv = $('tip-c');
const tipCtx = tipCv.getContext('2d');
function drawTip(now) {
  const tip = S.tip;
  const size = tipCv.clientWidth || 260;
  const dp = Math.min(2, devicePixelRatio || 1);
  if (tipCv.width !== Math.round(size * dp)) {
    tipCv.width = tipCv.height = Math.round(size * dp);
    tip.cache = null;
  }
  if (!tip.cache) {
    const b = parse(tip.level);
    const at = new Int16Array(b.n * b.n).fill(-1);
    for (const p of b.pieces) at[p.cell] = p.id;
    const r = trace(b, at, b.pieces);
    const T = Math.floor((size - 24) / b.n);
    const ox = Math.round((size - T * b.n) / 2);
    const pk = new Array(b.n * b.n).fill(null);
    for (const k in b.ends) for (const c of b.ends[k]) pk[c] = k;
    tip.cache = { b, at, r, T, ox, pk };
  }
  const { b, at, r, T, ox, pk } = tip.cache;
  const g = tipCtx;
  g.setTransform(dp, 0, 0, dp, 0, 0);
  g.clearRect(0, 0, size, size);
  R.drawBoard(g, { ox, oy: ox, T, n: b.n }, b.cells, tip.theme);
  const ccx = (c) => ox + ((c % b.n) + 0.5) * T, ccy = (c) => ox + (((c / b.n) | 0) + 0.5) * T;
  drawScene(g, { b, pieces: b.pieces, at, r, T, cx: ccx, cy: ccy, portalKey: pk }, now);
}

// ---------------------------------------------------------------- pausa automática y arranque
addEventListener('blur', () => pause());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
G.onPause?.(() => pause());
addEventListener('resize', () => measure());

G.onPrefs((p) => {
  document.documentElement.lang = p.lang;
  S.reduced = !!p.reducedMotion;
  S.touch = !!p.touch;
  document.documentElement.classList.toggle('touch', S.touch);
  document.documentElement.classList.toggle('reduced', S.reduced);
  $$('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t)));
  refreshHome();
  if (S.game) {
    refreshHud();
    paintLayer();
  }
  if (document.querySelector('#s-levels.on')) renderLevels();
}, true);

measure();
refreshHome();
show('home');
requestAnimationFrame(frame);

if (DEBUG) {
  window.__prisma = {
    S,
    P,
    ALL,
    LEVELS,
    CHAPTERS,
    startLevel: (key) => startLevel(ALL.find((l) => l.key === key) || ALL[0]),
    startDaily,
    toHome,
    /** Juega la solución guardada del nivel en curso (una jugada cada `ms`). */
    async solve(ms = 0) {
      const lv = S.level;
      const n = S.n;
      const trayIds = S.game.pieces.filter((p) => p.mode === 'move').map((p) => p.id);
      for (const a of String(lv.sol).trim().split(/\s+/).filter(Boolean)) {
        const m = /^(R|L|T(\d+)):(\d+),(\d+)$/.exec(a);
        const cell = +m[4] * n + +m[3];
        if (m[1] === 'R' || m[1] === 'L') doTurn(S.game.at[cell], m[1] === 'R' ? 1 : -1);
        else doPlace(trayIds[+m[2]], cell);
        if (ms) await new Promise((r) => setTimeout(r, ms));
      }
    },
    doTurn,
    doPlace,
    doUndo,
    doReset,
    askHint,
    pause,
    resume,
  };
}
G.ready();
