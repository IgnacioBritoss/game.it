/* Fusión — game.it
 * Deslizá las fichas con el dedo, el mouse o el teclado: las iguales se fusionan y llegás al 2048 (y más allá). Modos: clásico
 * (tableros de 3×3, 4×4 y 5×5, con récord, deshacer y partida guardada), diario (las mismas fichas nuevas para todos, un intento
 * por día) y carrera online (mismas fichas, tiempo elegido, gana el que más puntos junta; el servidor rehace cada partida para
 * validar el puntaje). El motor está en shared/engine.js y lo comparte el servidor.
 */
import { Fusion, DIRS } from './shared/engine.js';
import { RaceLobby } from '/shared/race-lobby.js';
import { tone, noise, notes, unlock } from '/shared/sfx.js';
import { today, dayNumber, msUntilNext, fmtClock, loadDay, saveDay, record, markPortal, share, shareLink } from '/shared/daily.js';

const G = window.GameIt;
const ID = 'fusion';
const EPOCH = '2026-10-28';
const DEBUG = /[?&]debug\b/.test(location.search);
const $ = (id) => document.getElementById(id);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtN = (n) => Math.round(n).toLocaleString(G.prefs?.lang === 'en' ? 'en-US' : 'es-AR');
const val = (k) => 2 ** k;

// ---------------------------------------------------------------- textos
const TXT = {
  title: { es: 'Fusión', en: 'Merge' },
  tagline: { es: 'Deslizá las fichas y fusioná las iguales hasta llegar al 2048. ¿Y más allá?', en: 'Slide the tiles and merge the equal ones up to 2048. And beyond?' },
  play: { es: 'Jugar', en: 'Play' },
  playSub: { es: 'récord: {n}', en: 'best: {n}' },
  playSubNone: { es: 'sin fin, a tu ritmo', en: 'endless, at your pace' },
  board: { es: 'Tablero', en: 'Board' },
  daily: { es: 'Fusión del día', en: 'Daily Merge' },
  dailySub: { es: 'n.º {n} · las mismas fichas para todos', en: '#{n} · the same tiles for everyone' },
  dailyDone: { es: 'n.º {n} · ✓ {s} puntos', en: '#{n} · ✓ {s} points' },
  dailyGo: { es: 'n.º {n} · seguí tu partida de hoy', en: '#{n} · continue today’s game' },
  online: { es: 'Carrera online', en: 'Online race' },
  onlineSub: { es: 'mismas fichas, gana quien más puntos junta', en: 'same tiles, most points wins' },
  onlineLong: { es: 'Hasta 6 jugadores reciben las mismas fichas nuevas: gana el que más puntos junta antes de que se acabe el tiempo o se quede sin movimientos.', en: 'Up to 6 players get the same new tiles: the one with the most points before time runs out (or moves do) wins.' },
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
  durationHelp: { es: 'Termina cuando se acaba el tiempo o cuando no te quedan movimientos.', en: 'Ends when time runs out or you have no moves left.' },
  back: { es: '← volver', en: '← back' },
  continue: { es: 'Continuar partida', en: 'Continue game' },
  contSub: { es: '{s} puntos · {n}×{n}', en: '{s} points · {n}×{n}' },
  rulesTitle: { es: 'Cómo se juega', en: 'How to play' },
  gotIt: { es: '¡Entendido!', en: 'Got it!' },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'Seguir', en: 'Resume' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  menu: { es: 'Menú', en: 'Menu' },
  score: { es: 'Puntos', en: 'Score' },
  best: { es: 'Récord', en: 'Best' },
  tile: { es: 'Ficha', en: 'Tile' },
  leader: { es: 'Líder', en: 'Leader' },
  undo: { es: 'Deshacer', en: 'Undo' },
  newGame: { es: 'Nueva', en: 'New' },
  confirm: { es: '¿Segura? Tocá otra vez', en: 'Sure? Tap again' },
  keys: { es: 'Flechas o WASD para deslizar · U deshace', en: 'Arrow keys or WASD to slide · U undoes' },
  modeClassic: { es: 'Clásico {n}×{n}', en: 'Classic {n}×{n}' },
  modeDaily: { es: 'Del día n.º {n}', en: 'Daily #{n}' },
  modeRace: { es: 'Carrera', en: 'Race' },
  noMoves: { es: 'Sin movimientos', en: 'No moves left' },
  gameOver: { es: 'Se acabó', en: 'Game over' },
  newBest: { es: '¡Nuevo récord!', en: 'New best!' },
  bestWas: { es: 'Tu récord: {n}', en: 'Your best: {n}' },
  stMoves: { es: 'Movimientos', en: 'Moves' },
  stTile: { es: 'Mejor ficha', en: 'Best tile' },
  stSize: { es: 'Tablero', en: 'Board' },
  again: { es: 'Jugar de nuevo', en: 'Play again' },
  share: { es: 'Compartir', en: 'Share' },
  copied: { es: '¡Copiado!', en: 'Copied!' },
  nextDaily: { es: 'Próximo desafío en', en: 'Next challenge in' },
  dailyKicker: { es: 'Fusión del día n.º {n}', en: 'Daily Merge #{n}' },
  dailyDoneAlready: { es: 'Ya jugaste el de hoy', en: 'You already played today’s' },
  winKicker: { es: '¡Lo lograste!', en: 'You made it!' },
  winTitle: { es: 'Llegaste al 2048', en: 'You reached 2048' },
  winSub: { es: 'Podés seguir fusionando para sumar más puntos.', en: 'You can keep merging to score even more.' },
  keepGoing: { es: 'Seguir jugando', en: 'Keep going' },
  ready: { es: 'Preparados…', en: 'Get ready…' },
  go: { es: '¡Ya!', en: 'Go!' },
  timeUp: { es: '¡Tiempo!', en: 'Time!' },
  waitOthers: { es: 'Esperando a los demás…', en: 'Waiting for the others…' },
  win: { es: '¡Ganaste!', en: 'You won!' },
  place: { es: 'Puesto {n}', en: 'Place {n}' },
  raceOver: { es: 'Carrera terminada', en: 'Race finished' },
  you: { es: 'vos', en: 'you' },
  dnf: { es: '{s} (sin entregar)', en: '{s} (not submitted)' },
  rules: {
    es: `<p><b>Objetivo:</b> fusionar fichas iguales para armar la del <b>2048</b>, y seguir sumando puntos.</p>
<h3>Cómo se juega</h3>
<ul>
<li>Deslizá con el dedo (o el mouse), o usá las flechas o WASD: <b>todas las fichas</b> se mueven hasta donde puedan en esa dirección.</li>
<li>Cuando dos fichas con el mismo número chocan, <b>se fusionan</b> en una con la suma (2 + 2 = 4) y esa suma son tus puntos.</li>
<li>Cada vez que movés aparece una ficha nueva (casi siempre un 2, a veces un 4). Un movimiento que no cambia nada no cuenta.</li>
<li>La partida termina cuando el tablero se llena y ya no hay fusiones posibles.</li>
</ul>
<h3>Consejos</h3>
<ul>
<li>Guardá la ficha más alta en una esquina y armá una fila ordenada hacia ella.</li>
<li>Elegí dos direcciones principales (por ejemplo izquierda y abajo) y usá la tercera solo cuando haga falta.</li>
</ul>
<h3>Los modos</h3>
<ul>
<li><b>Jugar:</b> sin fin, con récord por tablero (3×3, 4×4 o 5×5) y 3 deshacer por partida.</li>
<li><b>Fusión del día:</b> todos reciben las mismas fichas nuevas ese día y hay un solo intento.</li>
<li><b>Carrera online:</b> hasta 6 jugadores con las mismas fichas y el mismo tiempo; gana el que más puntos junta. El servidor rehace tu partida para comprobar el puntaje.</li>
</ul>`,
    en: `<p><b>Goal:</b> merge equal tiles to build the <b>2048</b> tile, and keep scoring.</p>
<h3>How to play</h3>
<ul>
<li>Swipe with your finger (or mouse), or use the arrow keys or WASD: <b>all tiles</b> slide as far as they can in that direction.</li>
<li>When two tiles with the same number collide they <b>merge</b> into one with the sum (2 + 2 = 4), and that sum is your score.</li>
<li>Every move a new tile appears (usually a 2, sometimes a 4). A move that changes nothing doesn’t count.</li>
<li>The game ends when the board is full and no merges are possible.</li>
</ul>
<h3>Tips</h3>
<ul>
<li>Keep your highest tile in a corner and build an ordered row towards it.</li>
<li>Pick two main directions (say left and down) and use the third only when you must.</li>
</ul>
<h3>Modes</h3>
<ul>
<li><b>Play:</b> endless, with a best score per board (3×3, 4×4 or 5×5) and 3 undos per game.</li>
<li><b>Daily Merge:</b> everyone gets the same new tiles that day and you only get one try.</li>
<li><b>Online race:</b> up to 6 players with the same tiles and the same time; most points wins. The server replays your game to verify the score.</li>
</ul>`,
  },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (typeof s === 'string' && v) for (const x in v) s = s.replaceAll(`{${x}}`, v[x]);
  return s;
};

// ---------------------------------------------------------------- guardado
const KEY = { prefs: `gameit:${ID}:prefs`, best: (n) => `gameit:${ID}:best${n}`, save: `gameit:${ID}:save`, dsave: `gameit:${ID}:dailysave` };
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
const OPTS = { size: 4, ...load(KEY.prefs, {}) };
if (![3, 4, 5].includes(OPTS.size)) OPTS.size = 4;
const bestOf = (n) => Number(load(KEY.best(n), 0)) || 0;

// ---------------------------------------------------------------- estado
const S = {
  mode: null, // 'classic' | 'daily' | 'race'
  phase: 'menu', // menu | countdown | play | over | done
  game: null,
  size: 4,
  log: '',
  undos: [], // pilas de estados para deshacer
  undosLeft: 3,
  busy: false,
  queued: null,
  best: 0,
  cell: 80,
  shownScore: 0,
  date: today(),
  dayN: 1,
  startAt: 0,
  limit: 180,
  finishMs: 0,
  results: null,
  rulesBack: 'home',
  winShown: false,
};
let tiles = []; // índice de casilla → { el, v }
let paused = false;
let lastTick = 0;

// ---------------------------------------------------------------- sonidos
const buzz = (ms) => {
  try {
    navigator.vibrate?.(ms);
  } catch {}
};
const sfx = {
  slide: () => noise(0.05, { freq: 900, q: 1.2, vol: 0.05, sweep: 500 }),
  merge: (v) => tone(300 + v * 38, 380 + v * 46, 0.1, { type: 'triangle', vol: 0.08 }),
  big: (v) => notes([523.25, 659.25, 783.99, 1046.5].slice(0, v >= 9 ? 4 : 3), { step: 0.06, dur: 0.18, type: 'triangle', vol: 0.09 }),
  win: () => notes([523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98], { step: 0.09, dur: 0.3, type: 'triangle', vol: 0.1 }),
  over: () => notes([440, 370, 311, 261], { step: 0.14, dur: 0.3, type: 'triangle', vol: 0.07 }),
  nope: () => tone(180, 140, 0.08, { type: 'square', vol: 0.03 }),
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

// ---------------------------------------------------------------- tablero
const xyOf = (i) => ({ x: i % S.size, y: Math.floor(i / S.size) });
function buildGrid(size) {
  S.size = size;
  const grid = $('grid');
  grid.innerHTML = '';
  for (let i = 0; i < size * size; i++) grid.appendChild(document.createElement('i'));
  $('game').style.setProperty('--n', size);
  measure();
}
function tileEl(v) {
  const el = document.createElement('div');
  const n = String(val(v)).length;
  el.className = `tile t${Math.min(v, 17)}${n >= 3 ? ` d${Math.min(n, 6)}` : ''}`;
  el.innerHTML = `<b>${val(v)}</b>`;
  return el;
}
function place(el, i, instant = false) {
  const { x, y } = xyOf(i);
  if (instant) el.classList.add('fast');
  el.style.transform = `translate(${x * S.cell}px, ${y * S.cell}px)`;
  if (instant) {
    el.offsetWidth;
    el.classList.remove('fast');
  }
}
function renderTiles() {
  $('tiles').innerHTML = '';
  tiles = new Array(S.size * S.size).fill(null);
  const g = S.game;
  if (!g) return;
  for (let i = 0; i < g.b.length; i++) {
    if (!g.b[i]) continue;
    const el = tileEl(g.b[i]);
    $('tiles').appendChild(el);
    place(el, i, true);
    tiles[i] = { el, v: g.b[i] };
  }
}
function popAt(i, text) {
  const { x, y } = xyOf(i);
  const el = document.createElement('div');
  el.className = 'pop';
  el.textContent = text;
  el.style.left = `${x * S.cell + S.cell / 2}px`;
  el.style.top = `${y * S.cell + S.cell / 3}px`;
  $('pops').appendChild(el);
  setTimeout(() => el.remove(), 950);
}
const reduced = () => document.documentElement.classList.contains('reduced');
const slideMs = () => (reduced() ? 1 : 115);

/** Anima el movimiento: las fichas deslizan, las que se fusionan se juntan y se reemplazan por la suma, y aparece la nueva. */
async function animateMove(res) {
  const next = new Array(tiles.length).fill(null);
  const mergeTo = new Set(res.slides.filter((s) => s.merge).map((s) => s.to));
  const groups = new Map(); // destino de fusión → fichas que llegan
  for (const s of res.slides) {
    const cur = tiles[s.from];
    if (!cur) continue;
    place(cur.el, s.to);
    if (mergeTo.has(s.to)) {
      if (!groups.has(s.to)) groups.set(s.to, []);
      groups.get(s.to).push(cur);
    } else next[s.to] = cur;
  }
  sfx.slide();
  await sleep(slideMs());
  for (const [to, list] of groups) {
    for (const c of list) c.el.remove();
    const m = res.merged.find((x) => x.i === to);
    const el = tileEl(m.v);
    el.classList.add('merged');
    $('tiles').appendChild(el);
    place(el, to, true);
    next[to] = { el, v: m.v };
    setTimeout(() => el.classList.remove('merged'), 260);
  }
  tiles = next;
  if (res.spawned) {
    const el = tileEl(res.spawned.v);
    el.classList.add('spawn');
    $('tiles').appendChild(el);
    place(el, res.spawned.i, true);
    tiles[res.spawned.i] = { el, v: res.spawned.v };
    setTimeout(() => el.classList.remove('spawn'), 260);
  }
  const top = res.merged.reduce((a, m) => Math.max(a, m.v), 0);
  if (res.merged.length) {
    const big = res.merged.reduce((a, m) => (m.v > a.v ? m : a), res.merged[0]);
    popAt(big.i, `+${fmtN(res.gained)}`);
    top >= 7 ? sfx.big(top) : sfx.merge(top);
    if (top >= 9 && !reduced()) {
      const w = $('board-wrap');
      w.classList.remove('shake');
      w.offsetWidth;
      w.classList.add('shake');
    }
    buzz(top >= 7 ? 30 : 10);
  }
}

// ---------------------------------------------------------------- HUD
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
    const k = Math.min(1, (now - t0) / 300);
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
    $('mode-tag').textContent = t('modeClassic', { n: S.size });
  } else if (S.mode === 'daily') {
    $('best-l').textContent = t('tile');
    $('best').textContent = fmtN(val(g.best));
    $('mode-tag').textContent = t('modeDaily', { n: S.dayN });
  } else {
    $('best-l').textContent = t('leader');
    $('best').textContent = fmtN(Math.max(g.score, ...[...others.values()].map((o) => o.score || 0)));
    $('mode-tag').textContent = t('modeRace');
  }
  $('t-undo').hidden = S.mode !== 'classic';
  $('t-new').hidden = S.mode !== 'classic';
  $('undo-n').textContent = S.undosLeft > 0 ? String(S.undosLeft) : '';
  $('t-undo').disabled = S.undosLeft <= 0 || !S.undos.length || S.busy || S.phase !== 'play';
  $('timebar').hidden = S.mode !== 'race';
  $('b-pause').hidden = S.mode === 'race';
}

// ---------------------------------------------------------------- jugar
const canPlay = () => S.game && S.phase === 'play' && !paused && !screenOpen();
async function doMove(dir) {
  if (!canPlay()) return;
  if (S.busy) {
    S.queued = dir;
    return;
  }
  const g = S.game;
  const before = S.mode === 'classic' ? g.snapshot() : null;
  const res = g.move(dir);
  if (!res) {
    sfx.nope();
    return;
  }
  if (before) {
    S.undos.push(before);
    if (S.undos.length > 12) S.undos.shift();
  }
  S.log += DIRS[dir];
  S.busy = true;
  setScore(g.score);
  renderHud();
  await animateMove(res);
  S.busy = false;
  renderHud();
  if (S.mode === 'race') sendScore(true);
  save();
  if (res.reached && S.mode !== 'race') {
    S.winShown = true;
    sfx.win();
    $('win-tile').textContent = '2048';
    show('win');
    return;
  }
  if (g.over) return endGame();
  if (S.queued !== null) {
    const d = S.queued;
    S.queued = null;
    doMove(d);
  }
}
function save() {
  const g = S.game;
  if (!g) return;
  if (S.mode === 'classic') store(KEY.save, g.over ? null : { snap: g.snapshot(), log: S.log, undosLeft: S.undosLeft });
  else if (S.mode === 'daily') store(KEY.dsave, g.over ? null : { date: S.date, snap: g.snapshot(), log: S.log });
}
function undo() {
  if (S.mode !== 'classic' || S.busy || S.phase !== 'play' || S.undosLeft <= 0 || !S.undos.length) return;
  const snap = S.undos.pop();
  S.game.undoTo(snap);
  S.log = S.log.slice(0, -1);
  S.undosLeft--;
  S.queued = null;
  renderTiles();
  setScore(S.game.score, false);
  renderHud();
  save();
}
$('t-undo').onclick = () => {
  unlock();
  undo();
};
$('t-new').onclick = () => {
  unlock();
  if (S.game && S.game.moves > 0 && !confirmNew()) return;
  startClassic(false);
};
let armed = 0;
function confirmNew() {
  const now = performance.now();
  if (now - armed < 2500) return true;
  armed = now;
  const el = $('t-new');
  const label = el.querySelector('span');
  el.classList.add('arm');
  label.textContent = t('confirm');
  setTimeout(() => {
    el.classList.remove('arm');
    label.textContent = t('newGame');
  }, 2500);
  return false;
}

function reset(mode, size) {
  S.mode = mode;
  S.phase = 'menu';
  S.log = '';
  S.undos = [];
  S.undosLeft = 3;
  S.busy = false;
  S.queued = null;
  S.finishMs = 0;
  S.results = null;
  S.shownScore = 0;
  S.winShown = false;
  $('cover').hidden = true;
  $('race').hidden = true;
  $('pops').innerHTML = '';
  buildGrid(size);
}
function begin() {
  S.phase = 'play';
  setPlaying(true);
  show(null);
  measure();
  renderTiles();
  setScore(S.game.score, false);
  renderHud();
}
function startClassic(resume = false) {
  const saved = resume ? load(KEY.save, null) : null;
  const size = saved?.snap ? saved.snap.size : OPTS.size;
  reset('classic', size);
  S.best = bestOf(size);
  if (saved?.snap) {
    S.game = Fusion.restore(saved.snap);
    S.log = saved.log || '';
    S.undosLeft = saved.undosLeft ?? 3;
    S.winShown = S.game.won;
  } else S.game = new Fusion({ size, seed: `c${Date.now()}${Math.random()}` });
  if (!resume) store(KEY.save, null);
  begin();
  if (S.game.over) endGame();
}
const dailySeed = (date) => `fusion-daily-${date}`;
function startDaily() {
  S.date = today();
  S.dayN = dayNumber(EPOCH, S.date);
  const done = loadDay(ID, 'all', S.date);
  reset('daily', 4);
  if (done) {
    S.game = new Fusion({ size: 4, seed: dailySeed(S.date) });
    S.phase = 'over';
    setPlaying(false);
    showOver({ daily: done, already: true });
    return;
  }
  const sv = load(KEY.dsave, null);
  if (sv && sv.date === S.date && sv.snap) {
    S.game = Fusion.restore(sv.snap);
    S.log = sv.log || '';
    S.winShown = S.game.won;
  } else S.game = new Fusion({ size: 4, seed: dailySeed(S.date) });
  begin();
  if (S.game.over) endGame();
}

// ---------------------------------------------------------------- fin
async function endGame() {
  const g = S.game;
  if (!g || S.phase === 'over' || S.phase === 'done') return;
  if (S.mode === 'race') return finishRace(false);
  S.phase = 'over';
  store(KEY.save, null);
  store(KEY.dsave, null);
  sfx.over();
  buzz([60, 40, 90]);
  $('cover').hidden = false;
  $('cover-t').textContent = '';
  $('cover-s').textContent = t('noMoves');
  await sleep(900);
  $('cover').hidden = true;
  if (S.mode === 'daily') {
    const rec = { score: g.score, moves: g.moves, tile: g.best };
    const stats = record(ID, 'all', { date: S.date, won: true, score: Math.max(0, Math.min(9, g.best - 5)) });
    saveDay(ID, 'all', rec, S.date);
    markPortal(ID, { date: S.date, done: true, won: true, streak: stats.streak });
    showOver({ daily: rec });
  } else {
    const wasBest = bestOf(S.size);
    const isBest = g.score > wasBest;
    if (isBest) {
      S.best = g.score;
      store(KEY.best(S.size), g.score);
    }
    showOver({ isBest, wasBest });
  }
}
let stopClock = null;
function showOver({ isBest = false, wasBest = 0, daily = null, already = false } = {}) {
  const g = S.game;
  const d = daily;
  const score = d ? d.score : g.score;
  $('over-kicker').textContent = d ? t('dailyKicker', { n: S.dayN }) : t('noMoves');
  $('over-title').textContent = already ? t('dailyDoneAlready') : t('gameOver');
  $('over-score').textContent = fmtN(score);
  const rec = $('over-record');
  rec.hidden = !(isBest || (!d && wasBest > 0));
  rec.textContent = isBest ? t('newBest') : t('bestWas', { n: fmtN(wasBest) });
  const moves = d ? d.moves : g.moves;
  const tile = d ? d.tile : g.best;
  $('over-stats').innerHTML = `<span><b>${moves}</b><small>${t('stMoves')}</small></span><span><b>${fmtN(val(tile))}</b><small>${t('stTile')}</small></span><span><b>${S.mode === 'daily' ? '4×4' : `${S.size}×${S.size}`}</b><small>${t('stSize')}</small></span>`;
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
  const r = await share(`game.it · ${t('title')} #${S.dayN} · ${fmtN(val(rec.tile))}\n▦ ${fmtN(rec.score)} ${t('score').toLowerCase()} · ${rec.moves} ${t('stMoves').toLowerCase()}\n${shareLink(ID)}`);
  $('over-status').textContent = r === 'copied' ? t('copied') : '';
};
$('b-win-go').onclick = () => show(null);
$('b-win-menu').onclick = () => toMenu();

// ---------------------------------------------------------------- pausa y menús
function pause() {
  if (!S.mode || S.phase !== 'play' || S.mode === 'race' || screenOpen()) return;
  paused = true;
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
$('o-size').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  OPTS.size = Number(b.dataset.v);
  store(KEY.prefs, OPTS);
  syncSeg('o-size', OPTS.size);
  refreshHome();
});
function refreshHome() {
  syncSeg('o-size', OPTS.size);
  const best = bestOf(OPTS.size);
  $('b-play-sub').textContent = best ? t('playSub', { n: fmtN(best) }) : t('playSubNone');
  const saved = load(KEY.save, null);
  const c = $('b-continue');
  c.hidden = !saved?.snap;
  if (saved?.snap) {
    $('cont-t').textContent = t('continue');
    $('cont-s').textContent = t('contSub', { s: fmtN(saved.snap.score), n: saved.snap.size });
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
  reset('race', 4);
  S.game = new Fusion({ size: 4, seed: room.race.seed });
  S.limit = room.race.limit || 180;
  S.startAt = room.race.startAt;
  others.clear();
  for (const p of room.players) if (p.id !== lobby.net.myId) others.set(p.id, { name: p.name, color: p.color, score: 0, done: false });
  S.phase = 'countdown';
  lastTick = 0;
  setPlaying(true);
  show(null);
  measure();
  renderTiles();
  setScore(0, false);
  $('race').hidden = false;
  $('cover').hidden = false;
  renderHud();
  renderRace();
}
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
  S.phase = 'done';
  S.queued = null;
  S.finishMs = Math.max(1, Math.round(lobby.net.serverNow() - S.startAt));
  lobby.net.send({ t: 'finish', moves: S.log });
  $('cover').hidden = false;
  $('cover-t').textContent = timeUp ? t('timeUp') : '';
  $('cover-s').textContent = timeUp ? '' : t('noMoves');
  sfx.over();
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
        renderHud();
      }
    } else if (S.phase === 'play') {
      const remain = S.limit - (now - S.startAt) / 1000;
      $('timefill').style.transform = `scaleX(${Math.max(0, Math.min(1, remain / S.limit))})`;
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

// ---------------------------------------------------------------- entrada: deslizar, teclado y mando
let sw = null;
$('stage').addEventListener('pointerdown', (e) => {
  if (e.target.closest('.tool')) return;
  unlock();
  sw = { x: e.clientX, y: e.clientY, pid: e.pointerId, done: false };
});
$('stage').addEventListener('pointermove', (e) => {
  if (!sw || sw.done || e.pointerId !== sw.pid) return;
  const dx = e.clientX - sw.x;
  const dy = e.clientY - sw.y;
  const min = Math.max(22, S.cell * 0.3);
  if (Math.max(Math.abs(dx), Math.abs(dy)) < min) return;
  sw.done = true;
  doMove(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 0 : 1) : dy < 0 ? 2 : 3);
});
const endSwipe = () => (sw = null);
$('stage').addEventListener('pointerup', endSwipe);
$('stage').addEventListener('pointercancel', endSwipe);
const KEYDIR = { arrowleft: 0, a: 0, arrowright: 1, d: 1, arrowup: 2, w: 2, arrowdown: 3, s: 3 };
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (document.querySelector('#s-pause.on')) {
    if (k === 'escape' || k === 'p') resume();
    return;
  }
  if (screenOpen()) return;
  if (k in KEYDIR) {
    e.preventDefault();
    doMove(KEYDIR[k]);
  } else if (k === 'u') undo();
  else if (k === 'escape' || k === 'p') pause();
});
const padPrev = [];
function pollPad() {
  const gp = navigator.getGamepads?.()?.find((g) => g && g.connected);
  if (gp) {
    const b = (i) => !!gp.buttons[i]?.pressed;
    const pressed = (i) => b(i) && !padPrev[i];
    if (pressed(14)) doMove(0);
    else if (pressed(15)) doMove(1);
    else if (pressed(12)) doMove(2);
    else if (pressed(13)) doMove(3);
    else if (pressed(9)) pause();
    gp.buttons.forEach((x, i) => (padPrev[i] = x.pressed));
  }
}
setInterval(pollPad, 30);

// ---------------------------------------------------------------- tamaño
function measure() {
  const g = $('game');
  const W = g.clientWidth;
  const H = g.clientHeight;
  const strip = S.mode === 'race' ? 36 : 0;
  const px = Math.min(W - 24, H - 52 - 8 - 46 - 26 - strip - 24);
  const c = Math.max(30, Math.floor(px / (S.size + 0.16)));
  if (c !== S.cell) {
    S.cell = c;
    g.style.setProperty('--cell', `${c}px`);
    for (let i = 0; i < tiles.length; i++) if (tiles[i]) place(tiles[i].el, i, true);
  }
}
new ResizeObserver(measure).observe($('game'));
G.onPause?.(() => (paused = true));
G.onResume?.(() => (paused = screenOpen() && !!document.querySelector('#s-pause.on')));
addEventListener('blur', () => S.mode && S.mode !== 'race' && S.phase === 'play' && pause());

// ---------------------------------------------------------------- logo y arranque
const drawLogo = () => ($('logo').innerHTML = '<i>2</i><i>4</i><i>8</i><i>2048</i>');
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
buildGrid(OPTS.size);
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
  window.__fusion = {
    S,
    lobby,
    others,
    Fusion,
    startClassic,
    startDaily,
    doMove,
    undo,
    endGame,
    toMenu,
    renderTiles,
    renderHud,
    setScore,
    /** Tablero armado a mano (exponentes por fila) para escenas de prueba. */
    scene(rows, seed = 'scene') {
      const size = rows.length;
      reset('classic', size);
      S.best = 0;
      S.game = new Fusion({ size, seed });
      S.game.b.fill(0);
      rows.forEach((row, r) => row.forEach((v, c) => (S.game.b[r * size + c] = v)));
      S.game.best = Math.max(...S.game.b);
      begin();
    },
  };
G.ready();
