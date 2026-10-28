/* Bloques — game.it
 * Puzzle de piezas sobre un tablero de 8×8: arrastrá las tres piezas, completá filas y columnas, encadená combos y no
 * te quedes sin lugar. Modos: clásico (sin fin, con récord y partida guardada), diario (las mismas manos para todos, un
 * intento por día) y carrera online (mismas manos, tiempo elegido, gana el que más puntos junta; el servidor rehace cada
 * partida para validar el puntaje). El motor está en shared/engine.js y lo comparte el servidor.
 */
import { SIZE, shapeOf, Game, encodeMove, suggest, fullLines, SHAPES } from './shared/engine.js';
import { RaceLobby } from '/shared/race-lobby.js';
import { tone, noise, notes, unlock } from '/shared/sfx.js';
import { today, dayNumber, msUntilNext, fmtClock, loadDay, saveDay, record, loadStats, markPortal, share, shareLink } from '/shared/daily.js';

const G = window.GameIt;
const ID = 'bloques';
const EPOCH = '2026-10-28';
const DEBUG = /[?&]debug\b/.test(location.search);
const $ = (id) => document.getElementById(id);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtN = (n) => Math.round(n).toLocaleString(G.prefs?.lang === 'en' ? 'en-US' : 'es-AR');

// ---------------------------------------------------------------- textos
const TXT = {
  title: { es: 'Bloques', en: 'Blocks' },
  tagline: { es: 'Acomodá las piezas, completá filas y columnas y no te quedes sin lugar.', en: 'Fit the pieces, complete rows and columns, and don’t run out of room.' },
  play: { es: 'Jugar', en: 'Play' },
  playSub: { es: 'récord: {n}', en: 'best: {n}' },
  playSubNone: { es: 'sin fin, a tu ritmo', en: 'endless, at your pace' },
  daily: { es: 'Bloques del día', en: 'Daily Blocks' },
  dailySub: { es: 'n.º {n} · las mismas piezas para todos', en: '#{n} · the same pieces for everyone' },
  dailyDone: { es: 'n.º {n} · ✓ {s} puntos', en: '#{n} · ✓ {s} points' },
  dailyGo: { es: 'n.º {n} · seguí tu partida de hoy', en: '#{n} · continue today’s game' },
  online: { es: 'Carrera online', en: 'Online race' },
  onlineSub: { es: 'mismas piezas, gana quien más puntos junta', en: 'same pieces, most points wins' },
  onlineLong: { es: 'Hasta 6 jugadores reciben las mismas piezas: gana el que más puntos junta antes de que se acabe el tiempo o se quede sin lugar.', en: 'Up to 6 players get the same pieces: the one with the most points before time runs out (or room does) wins.' },
  quick: { es: 'Partida rápida', en: 'Quick race' },
  quickSub: { es: 'te suma a una sala abierta', en: 'joins an open room' },
  create: { es: 'Crear sala', en: 'Create room' },
  createSub: { es: 'y compartir el código', en: 'and share the code' },
  join: { es: 'Entrar', en: 'Join' },
  room: { es: 'Sala', en: 'Room' },
  tapToCopy: { es: 'Tocá el código para copiar el link', en: 'Tap the code to copy the link' },
  leave: { es: 'Salir de la sala', en: 'Leave room' },
  startRace: { es: '¡Largar!', en: 'Start!' },
  duration: { es: 'Duración', en: 'Duration' },
  durationHelp: { es: 'Termina cuando se acaba el tiempo o cuando no te queda lugar.', en: 'Ends when time runs out or you have no room left.' },
  back: { es: '← volver', en: '← back' },
  continue: { es: 'Continuar partida', en: 'Continue game' },
  contSub: { es: '{s} puntos', en: '{s} points' },
  rulesTitle: { es: 'Cómo se juega', en: 'How to play' },
  gotIt: { es: '¡Entendido!', en: 'Got it!' },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'Seguir', en: 'Resume' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  menu: { es: 'Menú', en: 'Menu' },
  shake: { es: 'Sacudir el tablero', en: 'Shake the board' },
  yes: { es: 'Sí', en: 'Yes' },
  no: { es: 'No', en: 'No' },
  score: { es: 'Puntos', en: 'Score' },
  best: { es: 'Récord', en: 'Best' },
  lines: { es: 'Líneas', en: 'Lines' },
  leader: { es: 'Líder', en: 'Leader' },
  hint: { es: 'Pista', en: 'Hint' },
  modeClassic: { es: 'Clásico', en: 'Classic' },
  modeDaily: { es: 'Del día n.º {n}', en: 'Daily #{n}' },
  modeRace: { es: 'Carrera', en: 'Race' },
  combo: { es: 'Combo ×{n}', en: 'Combo ×{n}' },
  perfect: { es: '¡Tablero limpio!', en: 'Board clear!' },
  nice: { es: ['', '', '¡Doble!', '¡Triple!', '¡Cuádruple!', '¡Increíble!', '¡Locura!'], en: ['', '', 'Double!', 'Triple!', 'Quad!', 'Amazing!', 'Insane!'] },
  noRoom: { es: 'Sin lugar', en: 'No room left' },
  gameOver: { es: 'Se acabó', en: 'Game over' },
  newBest: { es: '¡Nuevo récord!', en: 'New best!' },
  bestWas: { es: 'Tu récord: {n}', en: 'Your best: {n}' },
  stLines: { es: 'Líneas', en: 'Lines' },
  stCombo: { es: 'Mejor combo', en: 'Best combo' },
  stPieces: { es: 'Piezas', en: 'Pieces' },
  again: { es: 'Jugar de nuevo', en: 'Play again' },
  share: { es: 'Compartir', en: 'Share' },
  copied: { es: '¡Copiado!', en: 'Copied!' },
  nextDaily: { es: 'Próximo desafío en', en: 'Next challenge in' },
  dailyKicker: { es: 'Bloques del día n.º {n}', en: 'Daily Blocks #{n}' },
  dailyDoneAlready: { es: 'Ya jugaste el de hoy', en: 'You already played today’s' },
  ready: { es: 'Preparados…', en: 'Get ready…' },
  go: { es: '¡Ya!', en: 'Go!' },
  timeUp: { es: '¡Tiempo!', en: 'Time!' },
  waitOthers: { es: 'Esperando a los demás…', en: 'Waiting for the others…' },
  rematch: { es: 'Revancha', en: 'Rematch' },
  waitRematch: { es: 'Esperando la revancha…', en: 'Waiting for a rematch…' },
  win: { es: '¡Ganaste!', en: 'You won!' },
  place: { es: 'Puesto {n}', en: 'Place {n}' },
  raceOver: { es: 'Carrera terminada', en: 'Race finished' },
  you: { es: 'vos', en: 'you' },
  dnf: { es: '{s} (sin entregar)', en: '{s} (not submitted)' },
  hintNone: { es: 'No encuentro jugadas', en: 'No moves found' },
  rules: {
    es: `<p><b>Objetivo:</b> juntar la mayor cantidad de puntos acomodando piezas en el tablero de 8×8.</p>
<h3>Cómo se juega</h3>
<ul>
<li>Abajo aparecen <b>tres piezas</b>. Arrastralas al tablero con el dedo o el mouse y soltalas donde entren. Las podés usar en el orden que quieras.</li>
<li>Cada vez que completás una <b>fila o columna</b>, se limpia y te da puntos. Si limpiás varias a la vez, valen mucho más.</li>
<li><b>Combo:</b> si limpiás líneas en jugadas seguidas, el puntaje se multiplica (hasta ×4). Tenés hasta dos jugadas sin limpiar antes de perder el combo.</li>
<li>Dejar el tablero completamente vacío da un bonus de <b>¡Tablero limpio!</b>.</li>
<li>Cuando usás las tres piezas llegan otras tres. <b>Las piezas no se pueden girar.</b></li>
<li>La partida termina cuando ninguna de las piezas que te quedan entra en el tablero.</li>
</ul>
<h3>Los modos</h3>
<ul>
<li><b>Jugar:</b> sin fin, con récord. Las piezas se eligen para que siempre haya una forma de ubicarlas.</li>
<li><b>Bloques del día:</b> todos reciben las mismas piezas ese día y hay un solo intento. Compará tu puntaje con el de tus amigos.</li>
<li><b>Carrera online:</b> hasta 6 jugadores con las mismas piezas y el mismo tiempo; gana el que más puntos junta. El servidor rehace tu partida para comprobar el puntaje.</li>
</ul>`,
    en: `<p><b>Goal:</b> score as many points as you can by fitting pieces on the 8×8 board.</p>
<h3>How to play</h3>
<ul>
<li><b>Three pieces</b> appear below. Drag them onto the board with your finger or mouse and drop them where they fit. Use them in any order.</li>
<li>Each time you complete a <b>row or column</b> it clears and scores. Clearing several at once is worth much more.</li>
<li><b>Combo:</b> clear lines on consecutive moves and the score is multiplied (up to ×4). You have up to two moves without clearing before the combo is lost.</li>
<li>Leaving the board completely empty gives a <b>Board clear!</b> bonus.</li>
<li>When you use all three pieces, three new ones arrive. <b>Pieces can’t be rotated.</b></li>
<li>The game ends when none of your remaining pieces fits on the board.</li>
</ul>
<h3>Modes</h3>
<ul>
<li><b>Play:</b> endless, with a best score. Pieces are chosen so there is always a way to place them.</li>
<li><b>Daily Blocks:</b> everyone gets the same pieces that day and you only get one try. Compare scores with your friends.</li>
<li><b>Online race:</b> up to 6 players with the same pieces and the same time; most points wins. The server replays your game to verify the score.</li>
</ul>`,
  },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (typeof s === 'string' && v) for (const x in v) s = s.replaceAll(`{${x}}`, v[x]);
  return s;
};

// ---------------------------------------------------------------- guardado
const KEY = { prefs: `gameit:${ID}:prefs`, best: `gameit:${ID}:best`, save: `gameit:${ID}:save`, dsave: `gameit:${ID}:dailysave` };
const load = (k, d) => {
  try {
    const v = JSON.parse(localStorage.getItem(k));
    return v ?? d;
  } catch {
    return d;
  }
};
const store = (k, v) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};
const OPTS = { shake: 1, ...load(KEY.prefs, {}) };

// ---------------------------------------------------------------- estado
const S = {
  mode: null, // 'classic' | 'daily' | 'race'
  phase: 'menu', // menu | countdown | play | over | done
  game: null,
  log: '',
  drag: null,
  hintsLeft: 3,
  best: Number(load(KEY.best, 0)) || 0,
  cell: 44,
  shownScore: 0,
  date: today(),
  dayN: 1,
  startAt: 0,
  limit: 180,
  finishMs: 0,
  results: null,
  rulesBack: 'home',
};
const shown = new Array(SIZE * SIZE).fill(0);
const cellEl = [];
let paused = false;

// ---------------------------------------------------------------- sonidos y vibración
const buzz = (ms) => {
  try {
    navigator.vibrate?.(ms);
  } catch {}
};
const sfx = {
  pick: () => tone(520, 640, 0.05, { type: 'triangle', vol: 0.05 }),
  put: () => {
    noise(0.05, { freq: 500, q: 2, vol: 0.14 });
    tone(220, 150, 0.08, { type: 'triangle', vol: 0.08 });
  },
  back: () => tone(300, 220, 0.1, { type: 'triangle', vol: 0.05 }),
  clear: (lines, streak) => {
    const base = [523.25, 587.33, 659.25, 783.99, 880, 987.77, 1046.5];
    const n = Math.min(lines + 1, 5);
    notes(base.slice(Math.min(streak, 3), Math.min(streak, 3) + n), { step: 0.06, dur: 0.18, type: 'triangle', vol: 0.09 });
    noise(0.18, { freq: 3000, q: 0.8, vol: 0.06, sweep: 6000 });
  },
  perfect: () => notes([523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98], { step: 0.07, dur: 0.3, type: 'triangle', vol: 0.1 }),
  over: () => notes([440, 370, 311, 261], { step: 0.14, dur: 0.3, type: 'triangle', vol: 0.07 }),
  win: () => notes([523.25, 659.25, 783.99, 1046.5, 1318.5], { step: 0.1, dur: 0.3, type: 'triangle', vol: 0.09 }),
  tick: () => tone(880, 880, 0.06, { type: 'square', vol: 0.04 }),
  go: () => notes([660, 880, 1320], { step: 0.07, dur: 0.16, type: 'square', vol: 0.05 }),
  ui: () => tone(900, 640, 0.045, { type: 'square', vol: 0.035 }),
};

// ---------------------------------------------------------------- pantallas
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  G.gameplay(!id && !!S.mode && S.phase !== 'menu');
}
const screenOpen = () => $$('.screen.on').length > 0;
const setPlaying = (on) => document.body.classList.toggle('playing', on);

// ---------------------------------------------------------------- tablero y bandeja
function buildBoard() {
  const b = $('board');
  b.innerHTML = '';
  for (let i = 0; i < SIZE * SIZE; i++) {
    const el = document.createElement('div');
    el.className = 'cell';
    b.appendChild(el);
    cellEl[i] = el;
  }
}
const baseClass = (v) => (v ? `cell f k${v}` : 'cell');
function renderBoard(fresh = []) {
  const g = S.game;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const v = g ? g.b[i] : 0;
    if (shown[i] !== v || fresh.includes(i)) {
      cellEl[i].className = baseClass(v) + (fresh.includes(i) ? ' drop' : '');
      shown[i] = v;
    }
  }
}
function pieceEl(shape) {
  const el = document.createElement('div');
  el.className = 'piece';
  el.style.gridTemplateColumns = `repeat(${shape.w}, var(--pcs))`;
  el.style.gridTemplateRows = `repeat(${shape.h}, var(--pcs))`;
  for (const [r, c] of shape.cells) {
    const d = document.createElement('div');
    d.className = `pc k${shape.color}`;
    d.style.gridArea = `${r + 1} / ${c + 1}`;
    el.appendChild(d);
  }
  return el;
}
function renderTray(animate = false) {
  const g = S.game;
  $$('#tray .slot').forEach((slot, k) => {
    slot.innerHTML = '';
    slot.classList.remove('grab', 'hintslot', 'in', 'nofit');
    const id = g ? g.hand[k] : -1;
    slot.classList.toggle('taken', id < 0);
    if (id < 0) return;
    const shape = shapeOf(id);
    slot.appendChild(pieceEl(shape));
    if (animate) slot.classList.add('in');
    if (!g.moves().some((m) => m.slot === k)) slot.classList.add('nofit');
  });
}
function setScore(n, bump = true) {
  const el = $('score');
  const from = S.shownScore;
  S.shownScore = n;
  if (from === n) {
    el.textContent = fmtN(n);
    return;
  }
  if (bump) {
    el.classList.remove('bump');
    el.offsetWidth;
    el.classList.add('bump');
  }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 380);
    el.textContent = fmtN(from + (n - from) * (1 - (1 - k) ** 3));
    if (k < 1 && S.shownScore === n) requestAnimationFrame(step);
    else el.textContent = fmtN(S.shownScore);
  };
  requestAnimationFrame(step);
}
function renderHud() {
  const g = S.game;
  if (!g) return;
  if (S.mode === 'classic') {
    $('best-l').textContent = t('best');
    $('best').textContent = fmtN(Math.max(S.best, g.score));
    $('mode-tag').textContent = t('modeClassic');
  } else if (S.mode === 'daily') {
    $('best-l').textContent = t('lines');
    $('best').textContent = String(g.lines);
    $('mode-tag').textContent = t('modeDaily', { n: S.dayN });
  } else {
    $('best-l').textContent = t('leader');
    const top = Math.max(g.score, ...[...others.values()].map((o) => o.score || 0));
    $('best').textContent = fmtN(top);
    $('mode-tag').textContent = t('modeRace');
  }
  $('t-hint').hidden = S.mode !== 'classic';
  $('hint-n').textContent = S.hintsLeft > 0 ? String(S.hintsLeft) : '';
  $('t-hint').disabled = S.hintsLeft <= 0 || S.phase !== 'play';
  $('timebar').hidden = S.mode !== 'race';
  $('b-pause').hidden = S.mode === 'race';
}
function renderCombo(streak) {
  const el = $('combo');
  if (streak >= 2) {
    el.hidden = false;
    el.textContent = t('combo', { n: streak });
    el.classList.remove('pulse');
    el.offsetWidth;
    el.classList.add('pulse');
  } else el.hidden = true;
}

// ---------------------------------------------------------------- efectos
const spark = { ctx: null, parts: [], raf: 0, w: 0, h: 0, dpr: 1 };
function sizeSpark() {
  const cv = $('spark');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(cv.clientWidth);
  const h = Math.round(cv.clientHeight);
  if (!w || (spark.w === w && spark.h === h && spark.dpr === dpr)) return;
  spark.w = w;
  spark.h = h;
  spark.dpr = dpr;
  cv.width = w * dpr;
  cv.height = h * dpr;
  spark.ctx = cv.getContext('2d');
  spark.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
const COLORS = ['#000', '#46c2ff', '#7fe05f', '#ffd23f', '#ff8a3d', '#ff5d8f', '#a76bff', '#2fd8c4', '#e6edf7'];
function burst(x, y, color, n) {
  sizeSpark();
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (1.5 + Math.random() * 4.5) * (S.cell / 44);
    spark.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, s: (2 + Math.random() * 4) * (S.cell / 44), life: 1, d: 0.025 + Math.random() * 0.025, color, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4 });
  }
  if (!spark.raf) spark.raf = requestAnimationFrame(sparkLoop);
}
function sparkLoop() {
  const { ctx } = spark;
  if (!ctx) return (spark.raf = 0);
  ctx.clearRect(0, 0, spark.w, spark.h);
  spark.parts = spark.parts.filter((p) => p.life > 0);
  for (const p of spark.parts) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.22 * (S.cell / 44);
    p.vx *= 0.985;
    p.life -= p.d;
    p.rot += p.vr;
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s);
    ctx.restore();
  }
  spark.raf = spark.parts.length ? requestAnimationFrame(sparkLoop) : 0;
  if (!spark.parts.length) ctx.clearRect(0, 0, spark.w, spark.h);
}
/** Posición (en px, dentro de #board-wrap) del centro de una casilla. */
function cellCenter(i) {
  const c = S.cell;
  const fr = c * 0.16;
  return { x: fr + (i % SIZE) * c + c / 2, y: fr + Math.floor(i / SIZE) * c + c / 2 };
}
function popText(text, x, y, cls = '') {
  const el = document.createElement('div');
  el.className = `pop ${cls}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  $('board-wrap').appendChild(el);
  setTimeout(() => el.remove(), 1050);
}
const reduced = () => document.documentElement.classList.contains('reduced');
function showClear(res) {
  const c = S.cell;
  const layer = $('fxl');
  const mid = res.cells[Math.floor(res.cells.length / 2)];
  const mp = cellCenter(mid);
  res.cleared.forEach(({ i, color }) => {
    const r = Math.floor(i / SIZE);
    const col = i % SIZE;
    const g = document.createElement('div');
    g.className = `ghost cell f k${color}`;
    g.style.cssText = `left:${col * c + 1}px;top:${r * c + 1}px;width:${c - 2}px;height:${c - 2}px;animation-delay:${Math.round(Math.hypot(mp.x - cellCenter(i).x, mp.y - cellCenter(i).y) / c * 28)}ms`;
    layer.appendChild(g);
    setTimeout(() => g.remove(), 800);
    if (!reduced()) {
      const p = cellCenter(i);
      setTimeout(() => burst(p.x + (c * 0.16) * 0, p.y, COLORS[color] || '#fff', 4 + Math.min(4, res.rows.length + res.cols.length)), Math.round(Math.hypot(mp.x - p.x, mp.y - p.y) / c * 28));
    }
  });
  const lines = res.rows.length + res.cols.length;
  const label = lines >= 2 ? G.t(TXT.nice)[Math.min(lines, 6)] : '';
  popText(`+${fmtN(res.gained)}`, mp.x, mp.y - c * 0.3, lines >= 3 ? 'big' : '');
  if (label) popText(label, mp.x, mp.y - c * 1.25, 'big');
  if (res.perfect) setTimeout(() => popText(t('perfect'), cellCenter(27).x, cellCenter(27).y, 'perfect'), 250);
  if (OPTS.shake && lines >= 3 && !reduced()) {
    const b = $('board');
    b.classList.remove('shake');
    b.offsetWidth;
    b.classList.add('shake');
  }
}

// ---------------------------------------------------------------- arrastrar
const canPlay = () => S.game && S.phase === 'play' && !S.game.over && !paused && !screenOpen();
let pvCells = [];
function clearPreview() {
  for (const i of pvCells) cellEl[i].className = baseClass(shown[i]);
  pvCells = [];
}
function showPreview(target, k) {
  clearPreview();
  if (!target) return;
  const g = S.game;
  const shape = shapeOf(g.hand[k]);
  const cells = shape.cells.map(([dr, dc]) => (target.r + dr) * SIZE + target.c + dc);
  // qué líneas se completarían: se simula sobre una copia
  const nb = g.b.slice();
  for (const i of cells) nb[i] = shape.color;
  const { rows, cols } = fullLines(nb);
  const will = new Set();
  for (const r of rows) for (let c = 0; c < SIZE; c++) will.add(r * SIZE + c);
  for (const c of cols) for (let r = 0; r < SIZE; r++) will.add(r * SIZE + c);
  for (const i of will) {
    cellEl[i].className = `cell f k${nb[i]} will`;
    pvCells.push(i);
  }
  for (const i of cells) {
    cellEl[i].className = `cell pv k${shape.color}${will.has(i) ? ' will' : ''}`;
    if (!pvCells.includes(i)) pvCells.push(i);
  }
}
function moveDrag(e) {
  const d = S.drag;
  if (!d) return;
  const c = S.cell;
  const sh = d.shape;
  const lift = d.touch ? c * (0.85 + sh.h / 2) : 0;
  const left = e.clientX - (sh.w * c) / 2;
  const top = e.clientY - lift - (sh.h * c) / 2;
  $('drag').style.transform = `translate(${left}px, ${top}px)`;
  const rect = $('board').getBoundingClientRect();
  const fr = c * 0.16;
  const colF = (left - rect.left - fr) / c;
  const rowF = (top - rect.top - fr) / c;
  let best = null;
  let bestD = 1e9;
  for (const r of [Math.floor(rowF), Math.ceil(rowF)])
    for (const cc of [Math.floor(colF), Math.ceil(colF)]) {
      if (!S.game.canPlace(d.k, r, cc)) continue;
      const dist = Math.hypot(r - rowF, cc - colF);
      if (dist < bestD) {
        bestD = dist;
        best = { r, c: cc };
      }
    }
  if (best && bestD > 1.1) best = null;
  const same = best && d.target && best.r === d.target.r && best.c === d.target.c;
  d.target = best;
  if (!same) showPreview(best, d.k);
  d.left = left;
  d.top = top;
}
function startDrag(e, slotEl) {
  if (!canPlay()) return;
  const k = Number(slotEl.dataset.slot);
  const id = S.game.hand[k];
  if (id < 0) return;
  e.preventDefault();
  unlock();
  clearHint();
  const shape = shapeOf(id);
  const dragEl = $('drag');
  dragEl.classList.remove('back');
  dragEl.innerHTML = '';
  dragEl.appendChild(pieceEl(shape));
  dragEl.hidden = false;
  S.drag = { k, shape, touch: e.pointerType !== 'mouse', pid: e.pointerId, target: null, slotEl };
  slotEl.classList.add('grab');
  try {
    slotEl.setPointerCapture(e.pointerId);
  } catch {}
  sfx.pick();
  moveDrag(e);
}
function endDrag(e, cancel = false) {
  const d = S.drag;
  if (!d) return;
  S.drag = null;
  const target = cancel ? null : d.target;
  clearPreview();
  d.slotEl.classList.remove('grab');
  try {
    d.slotEl.releasePointerCapture(d.pid);
  } catch {}
  const dragEl = $('drag');
  if (target && canPlay()) {
    dragEl.hidden = true;
    placePiece(d.k, target.r, target.c);
    return;
  }
  // vuelve a su lugar
  if (!cancel) sfx.back();
  const r = d.slotEl.getBoundingClientRect();
  const c = S.cell;
  dragEl.classList.add('back');
  dragEl.style.transform = `translate(${r.left + r.width / 2 - (d.shape.w * c) / 2}px, ${r.top + r.height / 2 - (d.shape.h * c) / 2}px) scale(0.4)`;
  setTimeout(() => {
    if (!S.drag) {
      dragEl.hidden = true;
      dragEl.classList.remove('back');
    }
  }, 210);
}
$('tray').addEventListener('pointerdown', (e) => {
  const slot = e.target.closest('.slot');
  if (slot) startDrag(e, slot);
});
$('tray').addEventListener('pointermove', (e) => S.drag && e.pointerId === S.drag.pid && moveDrag(e));
$('tray').addEventListener('pointerup', (e) => S.drag && e.pointerId === S.drag.pid && endDrag(e));
$('tray').addEventListener('pointercancel', (e) => S.drag && endDrag(e, true));
addEventListener('blur', () => S.drag && endDrag(null, true));

// ---------------------------------------------------------------- jugar
function placePiece(k, r, c) {
  const g = S.game;
  const res = g.place(k, r, c);
  if (!res) return;
  S.log += encodeMove(k, r, c);
  clearHint();
  renderBoard(res.cells);
  sfx.put();
  buzz(res.cleared.length ? 24 : 8);
  if (res.cleared.length) {
    showClear(res);
    sfx.clear(res.rows.length + res.cols.length, res.streak);
    if (res.perfect) sfx.perfect();
  }
  setScore(g.score);
  renderCombo(res.streak);
  renderTray(res.dealt);
  renderHud();
  if (S.mode === 'race') sendScore(true);
  save();
  if (g.over) setTimeout(() => endGame(), res.cleared.length ? 900 : 500);
}
function save() {
  const g = S.game;
  if (!g) return;
  if (S.mode === 'classic') store(KEY.save, g.over ? null : { snap: g.snapshot(), log: S.log, hints: S.hintsLeft });
  else if (S.mode === 'daily') store(KEY.dsave, g.over ? null : { date: S.date, snap: g.snapshot(), log: S.log });
}

function reset(mode) {
  S.mode = mode;
  S.phase = 'menu';
  S.log = '';
  S.drag = null;
  S.finishMs = 0;
  S.results = null;
  S.hintsLeft = 3;
  S.shownScore = 0;
  $('combo').hidden = true;
  $('fxl').innerHTML = '';
  $('cover').hidden = true;
  $('race').hidden = true;
  shown.fill(-1);
}
function begin() {
  S.phase = 'play';
  setPlaying(true);
  show(null);
  measure();
  renderBoard();
  renderTray(true);
  setScore(S.game.score, false);
  renderCombo(S.game.streak);
  renderHud();
}
function startClassic(resume = false) {
  reset('classic');
  const saved = resume ? load(KEY.save, null) : null;
  if (saved?.snap) {
    S.game = Game.restore(saved.snap);
    S.log = saved.log || '';
    S.hintsLeft = saved.hints ?? 3;
  } else S.game = new Game({ seed: `c${Date.now()}${Math.random()}`, adaptive: true });
  store(KEY.save, resume ? saved : null);
  begin();
  if (S.game.over) endGame();
}
function dailySeed(date) {
  return `bloques-daily-${date}`;
}
function startDaily() {
  S.date = today();
  S.dayN = dayNumber(EPOCH, S.date);
  const done = loadDay(ID, 'all', S.date);
  reset('daily');
  if (done) {
    // ya jugó: se muestra el resultado
    S.game = new Game({ seed: dailySeed(S.date) });
    S.phase = 'over';
    setPlaying(false);
    showOver({ daily: done, already: true });
    return;
  }
  const sv = load(KEY.dsave, null);
  if (sv && sv.date === S.date && sv.snap) {
    S.game = Game.restore(sv.snap);
    S.log = sv.log || '';
  } else S.game = new Game({ seed: dailySeed(S.date), adaptive: false });
  begin();
  if (S.game.over) endGame();
}

// ---------------------------------------------------------------- fin
async function endGame() {
  const g = S.game;
  if (!g || S.phase === 'over' || S.phase === 'done') return;
  S.drag && endDrag(null, true);
  if (S.mode === 'race') return finishRace(false);
  S.phase = 'over';
  store(KEY.save, null);
  store(KEY.dsave, null);
  $('combo').hidden = true;
  sfx.over();
  buzz([60, 40, 90]);
  // los casilleros se apagan en ola
  g.b.forEach((v, i) => v && setTimeout(() => cellEl[i].classList.add('dead'), (i % SIZE) * 30 + Math.floor(i / SIZE) * 22));
  await sleep(1000);
  if (S.mode === 'daily') {
    const rec = { score: g.score, lines: g.lines, combo: g.maxStreak, placed: g.placed };
    const stats = record(ID, 'all', { date: S.date, won: true, score: Math.min(9, Math.floor(g.score / 400)) });
    saveDay(ID, 'all', rec, S.date);
    markPortal(ID, { date: S.date, done: true, won: true, streak: stats.streak });
    showOver({ daily: rec });
  } else {
    const wasBest = S.best;
    const isBest = g.score > wasBest;
    if (isBest) {
      S.best = g.score;
      store(KEY.best, g.score);
    }
    showOver({ isBest, wasBest });
  }
}
let stopClock = null;
function showOver({ isBest = false, wasBest = 0, daily = null, already = false } = {}) {
  const g = S.game;
  const d = daily;
  const score = d ? d.score : g.score;
  $('over-kicker').textContent = d ? t('dailyKicker', { n: S.dayN }) : t('noRoom');
  $('over-title').textContent = already ? t('dailyDoneAlready') : t('gameOver');
  $('over-score').textContent = fmtN(score);
  const rec = $('over-record');
  rec.hidden = !(isBest || (!d && wasBest > 0));
  rec.textContent = isBest ? t('newBest') : t('bestWas', { n: fmtN(wasBest) });
  const lines = d ? d.lines : g.lines;
  const combo = d ? d.combo : g.maxStreak;
  const placed = d ? d.placed : g.placed;
  $('over-stats').innerHTML = `<span><b>${lines}</b><small>${t('stLines')}</small></span><span><b>×${comboLabel(combo)}</b><small>${t('stCombo')}</small></span><span><b>${placed}</b><small>${t('stPieces')}</small></span>`;
  $('b-share').hidden = !d;
  $('over-next').hidden = !d;
  $('over-status').textContent = '';
  $('b-again').hidden = !!d;
  $('b-again-t').textContent = t('again');
  stopClock?.();
  if (d) {
    const upd = () => ($('over-clock').textContent = fmtClock(msUntilNext()));
    upd();
    const iv = setInterval(upd, 500);
    stopClock = () => clearInterval(iv);
  }
  S.phase = 'over';
  show('over');
  if (!d && isBest) sfx.win();
}
const comboLabel = (streak) => {
  const m = Math.min(4, 1 + 0.5 * Math.max(0, streak - 1));
  return m % 1 ? m.toFixed(1) : String(m);
};
$('b-again').onclick = async () => {
  unlock();
  await G.commercialBreak?.('otra-partida');
  stopClock?.();
  startClassic(false);
};
$('b-over-menu').onclick = () => toMenu();
$('b-share').onclick = async () => {
  const rec = loadDay(ID, 'all', S.date);
  if (!rec) return;
  const r = await share(`game.it · ${t('title')} #${S.dayN} · ${fmtN(rec.score)}\n▦ ${rec.lines} ${t('stLines').toLowerCase()} · ×${comboLabel(rec.combo)}\n${shareLink(ID)}`);
  $('over-status').textContent = r === 'copied' ? t('copied') : '';
};

// ---------------------------------------------------------------- pista
function clearHint() {
  clearTimeout(clearHint.tm);
  for (const i of $$('.cell.hint')) i.classList.remove('hint');
  $$('#tray .slot.hintslot').forEach((s) => s.classList.remove('hintslot'));
}
function doHint() {
  if (S.mode !== 'classic' || S.hintsLeft <= 0 || !canPlay()) return;
  const m = suggest(S.game);
  if (!m) return;
  S.hintsLeft--;
  clearHint();
  const shape = shapeOf(S.game.hand[m.slot]);
  $$('#tray .slot')[m.slot].classList.add('hintslot');
  for (const [dr, dc] of shape.cells) cellEl[(m.r + dr) * SIZE + m.c + dc].classList.add('hint');
  clearHint.tm = setTimeout(clearHint, 4000);
  renderHud();
  save();
}
$('t-hint').onclick = () => {
  unlock();
  doHint();
};

// ---------------------------------------------------------------- pausa y menús
function pause() {
  if (!S.mode || S.phase !== 'play' || S.mode === 'race' || screenOpen()) return;
  paused = true;
  syncSeg('p-shake', OPTS.shake);
  show('pause');
}
function resume() {
  paused = false;
  show(null);
}
$('b-pause').onclick = () => pause();
$('b-resume').onclick = () => resume();
$('b-p-rules').onclick = () => {
  S.rulesBack = 'pause';
  show('rules');
};
$('b-quit').onclick = () => toMenu();
function toMenu() {
  paused = false;
  stopClock?.();
  S.drag && endDrag(null, true);
  if (S.mode === 'race') lobby.leave();
  S.mode = null;
  S.phase = 'menu';
  setPlaying(false);
  refreshHome();
  show('home');
}
function syncSeg(id, v) {
  for (const b of $$('button', $(id))) b.classList.toggle('on', String(b.dataset.v) === String(v));
}
$('p-shake').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  OPTS.shake = Number(b.dataset.v);
  store(KEY.prefs, OPTS);
  syncSeg('p-shake', OPTS.shake);
});
function refreshHome() {
  $('b-play-sub').textContent = S.best ? t('playSub', { n: fmtN(S.best) }) : t('playSubNone');
  const saved = load(KEY.save, null);
  const c = $('b-continue');
  c.hidden = !saved?.snap;
  if (saved?.snap) {
    $('cont-t').textContent = t('continue');
    $('cont-s').textContent = t('contSub', { s: fmtN(saved.snap.score) });
  }
  const date = today();
  const n = dayNumber(EPOCH, date);
  const done = loadDay(ID, 'all', date);
  const sv = load(KEY.dsave, null);
  $('b-daily-sub').textContent = done ? t('dailyDone', { n, s: fmtN(done.score) }) : sv && sv.date === date ? t('dailyGo', { n }) : t('dailySub', { n });
}
$('b-play').onclick = () => {
  unlock();
  startClassic(false);
};
$('b-continue').onclick = () => {
  unlock();
  startClassic(true);
};
$('b-daily').onclick = () => {
  unlock();
  startDaily();
};
$('b-online').onclick = () => {
  unlock();
  lobby.open();
};
$('on-back').onclick = () => {
  lobby.leave();
  toMenu();
};
$('b-rules').onclick = () => {
  S.rulesBack = 'home';
  show('rules');
};
$('b-rules-ok').onclick = () => show(S.rulesBack === 'pause' ? 'pause' : 'home');
for (const b of $$('.btn, .link, .seg button')) b.addEventListener('click', () => sfx.ui());

// ---------------------------------------------------------------- carrera online
const others = new Map(); // id → { name, color, score, done }
let lastSent = 0;
let sentVal = -1;
const lobby = new RaceLobby({
  game: ID,
  settings: ['time'],
  defaults: { time: '180' },
  show: (id) => {
    S.mode = 'race';
    S.phase = 'menu';
    show(id);
  },
  onRace: beginRace,
  onLobby: () => {
    $('race').hidden = true;
    S.phase = 'menu';
    setPlaying(false);
  },
  onMessage: onNet,
  onRoom: (room) => room.state === 'finished' && document.querySelector('#s-results.on') && showResults(),
  onClosed: () => {
    toMenu();
    show('online');
  },
});
function beginRace(room) {
  reset('race');
  S.game = new Game({ seed: room.race.seed, adaptive: false });
  S.limit = room.race.limit || 180;
  S.startAt = room.race.startAt;
  others.clear();
  for (const p of room.players) if (p.id !== lobby.net.myId) others.set(p.id, { name: p.name, color: p.color, score: 0, done: false });
  S.phase = 'countdown';
  lastTick = 0;
  setPlaying(true);
  show(null);
  measure();
  renderBoard();
  renderTray(true);
  setScore(0, false);
  renderCombo(0);
  $('race').hidden = false;
  $('cover').hidden = false;
  renderHud();
  renderRace();
}
let lastTick = 0;
function sendScore(force = false) {
  const now = performance.now();
  if (!force && now - lastSent < 700) return;
  const v = S.game.score;
  if (!force && v === sentVal) return;
  lastSent = now;
  sentVal = v;
  lobby.net.raw({ t: 'state', s: [v] });
}
function finishRace(timeUp) {
  if (S.phase === 'done') return;
  S.drag && endDrag(null, true);
  S.phase = 'done';
  S.finishMs = Math.max(1, Math.round(lobby.net.serverNow() - S.startAt));
  lobby.net.send({ t: 'finish', moves: S.log });
  if (timeUp) {
    $('cover').hidden = false;
    $('cover-t').textContent = t('timeUp');
    $('cover-s').textContent = '';
    sfx.over();
  } else sfx.over();
  setTimeout(showResults, timeUp ? 1200 : 900);
}
function onNet(m) {
  if (m.t === 'state') {
    const o = others.get(m.id);
    if (o) o.score = Math.max(o.score || 0, Number(m.s[0]) || 0);
    return;
  }
  if (m.t === 'finished') {
    const o = others.get(m.id);
    if (o) {
      o.done = true;
      o.score = m.score;
    }
    if (S.phase === 'done') showResults();
    return;
  }
  if (m.t === 'end') {
    S.results = m.results;
    if (S.mode === 'race') {
      if (S.phase !== 'done') S.phase = 'done';
      showResults();
    }
  }
}
function renderRace() {
  if (S.mode !== 'race' || $('race').hidden) return;
  const me = { id: lobby.net.myId, name: lobby.name, color: '#6fb7ff', score: S.game?.score || 0, done: S.phase === 'done', me: true };
  const all = [me, ...[...others.entries()].map(([id, o]) => ({ id, ...o }))].sort((a, b) => b.score - a.score);
  $('race').innerHTML = all.map((p) => `<span class="rp${p.me ? ' me' : ''}${p.done ? ' done' : ''}" style="--c2:${esc(p.color)}"><i></i>${esc(p.name)}${p.me ? ` (${esc(t('you'))})` : ''} <b>${fmtN(p.score)}</b></span>`).join('');
}
function showResults() {
  const final = S.results;
  const me = lobby.net.myId;
  let rows;
  if (final) rows = final.map((r) => ({ id: r.id, name: r.name, color: r.color, score: r.score || 0, val: r.dnf ? t('dnf', { s: fmtN(r.score || 0) }) : fmtN(r.score || 0) }));
  else {
    const all = [{ id: me, name: lobby.name, color: '#fff', score: S.game.score, done: true }, ...[...others.entries()].map(([id, o]) => ({ id, ...o }))];
    all.sort((a, b) => b.score - a.score);
    rows = all.map((r) => ({ id: r.id, name: r.name, color: r.color, score: r.score, val: r.done ? fmtN(r.score) : `${fmtN(r.score)} …` }));
  }
  const place = rows.findIndex((r) => r.id === me) + 1;
  $('res-title').textContent = !final ? t('waitOthers') : place === 1 ? t('win') : place ? t('place', { n: place }) : t('raceOver');
  $('res-rank').innerHTML = rows.map((r, i) => `<li class="${r.id === me ? 'me' : ''}"><span>${i + 1}.</span><i style="background:${esc(r.color)}"></i><span>${esc(r.name)}${r.id === me ? ` (${esc(t('you'))})` : ''}</span><b>${esc(r.val)}</b></li>`).join('');
  const a = lobby.againState(!!final);
  $('res-again').disabled = !a.enabled;
  $('res-again').querySelector('span').textContent = a.text;
  if (final && place === 1) sfx.win();
  show('results');
}
$('res-leave').onclick = () => toMenu();

// ---------------------------------------------------------------- bucle (cuenta regresiva y reloj de la carrera)
function loop() {
  if (S.mode === 'race' && S.game) {
    const now = lobby.net.serverNow();
    const left = (S.startAt - now) / 1000;
    if (S.phase === 'countdown') {
      if (left > 0) {
        const n = Math.ceil(left);
        if (n !== lastTick) {
          lastTick = n;
          $('cover-t').textContent = String(n);
          $('cover-s').textContent = t('ready');
          sfx.tick();
        }
      } else {
        S.phase = 'play';
        $('cover-t').textContent = t('go');
        $('cover-s').textContent = '';
        sfx.go();
        setTimeout(() => S.phase === 'play' && ($('cover').hidden = true), 600);
        renderTray(false);
        renderHud();
      }
    } else if (S.phase === 'play') {
      const remain = S.limit - (now - S.startAt) / 1000;
      const frac = Math.max(0, Math.min(1, remain / S.limit));
      $('timefill').style.transform = `scaleX(${frac})`;
      $('timeleft').textContent = fmtClock(remain * 1000).slice(3);
      $('timebar').classList.toggle('low', remain < 15);
      if (remain <= 0) finishRace(true);
    }
  }
  requestAnimationFrame(loop);
}
setInterval(() => {
  if (S.mode === 'race' && (S.phase === 'play' || S.phase === 'done')) {
    renderRace();
    renderHud();
    if (S.phase === 'play') sendScore();
  }
}, 400);

// ---------------------------------------------------------------- teclado
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (document.querySelector('#s-pause.on')) {
    if (k === 'escape' || k === 'p') resume();
    return;
  }
  if (screenOpen()) return;
  if (k === 'escape' || k === 'p') pause();
  else if (k === 'h') doHint();
});

// ---------------------------------------------------------------- tamaño
function measure() {
  const g = $('game');
  const W = g.clientWidth;
  const H = g.clientHeight;
  const land = matchMedia('(min-width: 820px) and (min-aspect-ratio: 13/10)').matches;
  const strip = S.mode === 'race' ? 36 : 0;
  let c;
  if (land) c = Math.min((H - 74 - strip) / 8.32, (W - 60) / 11.5);
  else c = Math.min((W - 20) / 8.32, (H - 150 - strip) / 11.12);
  c = Math.max(24, Math.floor(c));
  if (c !== S.cell) {
    S.cell = c;
    g.style.setProperty('--c', `${c}px`);
  }
  const bw = c * 8.32;
  const tc = land ? c * 0.43 : Math.min(c * 0.56, (bw - 16) / 3 / 5.3);
  g.style.setProperty('--tc', `${tc}px`);
  sizeSpark();
}
new ResizeObserver(measure).observe($('game'));
G.onPause?.(() => {
  paused = true;
  S.drag && endDrag(null, true);
});
G.onResume?.(() => (paused = screenOpen() && !!document.querySelector('#s-pause.on')));
addEventListener('blur', () => S.mode && S.mode !== 'race' && S.phase === 'play' && pause());

// ---------------------------------------------------------------- logo y arranque
const drawLogo = () => ($('logo').innerHTML = '<i class="a"></i><i class="b"></i><i class="c"></i><i class="d"></i><i class="e"></i>');
G.onPrefs((p) => {
  document.documentElement.lang = p.lang;
  document.documentElement.classList.toggle('reduced', !!p.reducedMotion);
  $$('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t)));
  $('rules-body').innerHTML = G.t(TXT.rules);
  refreshHome();
  if (S.game && S.mode) {
    renderHud();
    setScore(S.game.score, false);
  }
}, true);

drawLogo();
buildBoard();
measure();
requestAnimationFrame(loop);
if (lobby.pending) {
  S.mode = 'race';
  show('online');
} else {
  refreshHome();
  show('home');
}
G.gameplay(false);

if (DEBUG)
  window.__bloques = {
    S,
    lobby,
    others,
    Game,
    startClassic,
    startDaily,
    placePiece,
    toMenu,
    renderBoard,
    renderTray,
    renderHud,
    setScore,
    /** Pone un tablero armado a mano (filas de '#' y '.') y una mano de formas por patrón. */
    scene(rows, hand, seed = 'scene') {
      reset('classic');
      S.game = new Game({ seed, adaptive: false });
      rows.forEach((row, r) => [...row].forEach((ch, c) => (S.game.b[r * SIZE + c] = ch === '#' ? 1 + ((r + c) % 7) : 0)));
      if (hand) S.game.hand = hand.slice();
      begin();
    },
    SHAPES,
  };
G.ready();
