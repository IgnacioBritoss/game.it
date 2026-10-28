/* 5 en línea (Gomoku) — game.it
 * Armá una fila de cinco piedras antes que tu rival. Contra la compu (cinco niveles que piensan en un worker), de a dos en la misma
 * pantalla y online con reloj y revancha. Las reglas están en shared/rules.js (las comparte el servidor) y la compu en
 * shared/engine.js. Con el mouse se juega haciendo clic; con el dedo se toca la cruz y se confirma (así no se pone una piedra por error).
 */
import { Position, SIZES, fromStr, moveStr, replay, xy } from './shared/rules.js';
import { OnlineRoom, netText, defaultName, share as shareRoom, roomFromUrl } from '/shared/online.js';
import { pickLobby } from '/shared/race-lobby.js';
import { tone, noise, notes, unlock } from '/shared/sfx.js';

const G = window.GameIt;
const ID = 'gomoku';
const DEBUG = /[?&]debug\b/.test(location.search);
const $ = (id) => document.getElementById(id);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const P0 = 0; // negras
const P1 = 1; // blancas

// ---------------------------------------------------------------- textos
const TXT = {
  title: { es: '5 en línea', en: 'Gomoku' },
  tagline: { es: 'Armá una fila de cinco antes que tu rival.', en: 'Get five in a row before your rival.' },
  vsCpu: { es: 'Contra la compu', en: 'Against the computer' },
  vsCpuSub: { es: 'cinco niveles, pistas y deshacer', en: 'five levels, hints and undo' },
  local: { es: 'De a dos', en: 'Two players' },
  localSub: { es: 'en la misma pantalla', en: 'on the same screen' },
  online: { es: 'Online', en: 'Online' },
  onlineSub: { es: 'con reloj y revancha', en: 'with clock and rematch' },
  onlineLong: { es: 'Partida rápida con alguien al azar, o creá una sala y pasale el código a un amigo.', en: 'Quick game with a random opponent, or create a room and send the code to a friend.' },
  quick: { es: 'Partida rápida', en: 'Quick game' },
  quickSub: { es: 'te junta con alguien', en: 'finds you an opponent' },
  create: { es: 'Crear sala', en: 'Create room' },
  createSub: { es: 'y compartir el código', en: 'and share the code' },
  join: { es: 'Entrar', en: 'Join' },
  room: { es: 'Sala', en: 'Room' },
  tapToCopy: { es: 'Tocá el código para copiar el link', en: 'Tap the code to copy the link' },
  copied: { es: '¡Link copiado!', en: 'Link copied!' },
  host: { es: 'anfitrión', en: 'host' },
  youLower: { es: 'vos', en: 'you' },
  start: { es: '¡Empezar!', en: 'Start!' },
  leave: { es: 'Salir de la sala', en: 'Leave room' },
  waitingHost: { es: 'Esperando que el anfitrión empiece…', en: 'Waiting for the host to start…' },
  needPlayers: { es: 'Falta un rival para empezar.', en: 'You need an opponent to start.' },
  foundRival: { es: '¡Encontramos rival!', en: 'Opponent found!' },
  searching: { es: 'Buscando una sala…', en: 'Looking for a room…' },
  publicRoom: { es: 'Sala pública', en: 'Public room' },
  clock: { es: 'Reloj (minutos + incremento)', en: 'Clock (minutes + increment)' },
  size: { es: 'Tamaño del tablero', en: 'Board size' },
  sizeHelp: { es: '{n}×{n} cruces · {m} para empezar', en: '{n}×{n} points · {m} to start' },
  level: { es: 'Nivel', en: 'Level' },
  levels: { es: ['Novato', 'Fácil', 'Medio', 'Difícil', 'Experto'], en: ['Rookie', 'Easy', 'Medium', 'Hard', 'Expert'] },
  levelHelp: {
    es: ['Juega casi a ojo, cerca de las piedras. Para aprender.', 'Ataca y tapa lo que ve, pero se le escapan las jugadas dobles.', 'Mira tres jugadas: arma trampas simples y tapa tus tres.', 'Mira cinco jugadas y arma dobles amenazas.', 'Calcula a fondo mientras te toca pensar a vos. Suerte.'],
    en: ['Plays almost by eye, near the stones. To learn.', 'Attacks and blocks what it sees, but misses double threats.', 'Looks three moves ahead: sets simple traps and blocks your threes.', 'Looks five moves ahead and builds double threats.', 'Calculates in depth while you think. Good luck.'],
  },
  first: { es: 'Con qué piedras jugás', en: 'Which stones you play' },
  meFirst: { es: 'Negras (empezás)', en: 'Black (you start)' },
  cpuFirst: { es: 'Blancas', en: 'White' },
  random: { es: 'Al azar', en: 'Random' },
  yes: { es: 'Sí', en: 'Yes' },
  no: { es: 'No', en: 'No' },
  go: { es: '¡A jugar!', en: 'Let’s play!' },
  back: { es: '← volver', en: '← back' },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'Seguir', en: 'Resume' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  menu: { es: 'Menú', en: 'Menu' },
  showLast: { es: 'Marcar la última jugada', en: 'Mark the last move' },
  continue: { es: 'Continuar partida', en: 'Continue game' },
  contSub: { es: 'vs compu {l} · {s} · {n} piedras', en: 'vs CPU {l} · {s} · {n} stones' },
  contSubLocal: { es: 'de a dos · {s} · {n} piedras', en: 'two players · {s} · {n} stones' },
  rulesTitle: { es: 'Cómo se juega', en: 'How to play' },
  gotIt: { es: '¡Entendido!', en: 'Got it!' },
  you: { es: 'Vos', en: 'You' },
  p1: { es: 'Negras', en: 'Black' },
  p2: { es: 'Blancas', en: 'White' },
  cpuName: { es: 'Compu · {l}', en: 'CPU · {l}' },
  yourTurn: { es: 'Tu turno', en: 'Your turn' },
  turnOf: { es: 'Juegan las {n}', en: '{n} to play' },
  thinking: { es: 'Pensando…', en: 'Thinking…' },
  waitMove: { es: 'Esperando su jugada…', en: 'Waiting for the move…' },
  away: { es: 'Se desconectó…', en: 'Disconnected…' },
  place: { es: 'Colocar', en: 'Place' },
  tapAgain: { es: 'Tocá de nuevo la cruz (o “Colocar”) para jugar', en: 'Tap the point again (or “Place”) to play' },
  undo: { es: 'Deshacer', en: 'Undo' },
  hint: { es: 'Pista', en: 'Hint' },
  resign: { es: 'Rendirse', en: 'Resign' },
  confirm: { es: 'Tocá de nuevo para confirmar', en: 'Tap again to confirm' },
  review: { es: 'Repasar la partida', en: 'Review the game' },
  again: { es: 'Otra partida', en: 'Play again' },
  rematch: { es: 'Revancha', en: 'Rematch' },
  acceptRematch: { es: 'Aceptar revancha', en: 'Accept rematch' },
  rematchSent: { es: 'Esperando a tu rival…', en: 'Waiting for your rival…' },
  rematchAsked: { es: '¡Tu rival quiere la revancha!', en: 'Your rival wants a rematch!' },
  rivalLeft: { es: 'Tu rival se fue', en: 'Your rival left' },
  hintNone: { es: 'No encuentro nada mejor', en: 'Nothing better to suggest' },
  live: { es: 'En vivo', en: 'Live' },
  youWin: { es: '¡Ganaste!', en: 'You won!' },
  youLose: { es: 'Perdiste', en: 'You lost' },
  drawn: { es: 'Empate', en: 'Draw' },
  winBlack: { es: 'Ganan las negras', en: 'Black wins' },
  winWhite: { es: 'Ganan las blancas', en: 'White wins' },
  endFive: { es: 'Fila de cinco', en: 'Five in a row' },
  endFull: { es: 'Tablero lleno', en: 'Board full' },
  endTimeout: { es: 'Se acabó el tiempo de {n}', en: '{n} ran out of time' },
  endResign: { es: '{n} se rindió', en: '{n} resigned' },
  endResignYou: { es: 'Te rendiste', en: 'You resigned' },
  endAbandon: { es: '{n} abandonó la partida', en: '{n} left the game' },
  endAborted: { es: 'Partida anulada: nadie jugó a tiempo', en: 'Game aborted: nobody moved in time' },
  wins: { es: 'Ganadas', en: 'Won' },
  losses: { es: 'Perdidas', en: 'Lost' },
  draws: { es: 'Empates', en: 'Draws' },
  rules: {
    es: `<p><b>Objetivo:</b> armar una fila de <b>cinco piedras</b> (o más) de tu color, seguidas en horizontal, vertical o diagonal.</p>
<h3>Cómo se juega</h3>
<ul>
<li>Juegan por turnos: las <b>negras</b> empiezan y cada uno pone una piedra en una cruz libre.</li>
<li>Las piedras no se mueven ni se sacan.</li>
<li>Gana quien arma primero cinco seguidas. Si se llena el tablero, es empate.</li>
</ul>
<h3>Para tener en cuenta</h3>
<ul>
<li>Un <b>cuatro</b> (cuatro seguidas con un lado libre) obliga al rival a taparlo ya mismo.</li>
<li>Un <b>tres abierto</b> (tres seguidas con los dos lados libres) amenaza con convertirse en un cuatro abierto, que ya no se puede tapar: hay que frenarlo a tiempo.</li>
<li>Se gana con una <b>doble amenaza</b>: una jugada que arma dos cuatros (o un cuatro y un tres abierto) a la vez.</li>
<li>Con el dedo: tocá una cruz para ver dónde caería la piedra y tocala otra vez (o apretá “Colocar”) para jugarla. Con el mouse, un clic.</li>
</ul>`,
    en: `<p><b>Goal:</b> make a row of <b>five stones</b> (or more) of your colour, in a straight line: horizontal, vertical or diagonal.</p>
<h3>How to play</h3>
<ul>
<li>Take turns: <b>black</b> goes first and each player puts a stone on a free point.</li>
<li>Stones never move and are never removed.</li>
<li>Whoever makes five in a row first wins. If the board fills up, it’s a draw.</li>
</ul>
<h3>Good to know</h3>
<ul>
<li>A <b>four</b> (four in a row with one open end) forces your rival to block it right away.</li>
<li>An <b>open three</b> (three in a row with both ends free) threatens to become an open four, which can’t be blocked: stop it in time.</li>
<li>You win with a <b>double threat</b>: one move that makes two fours (or a four and an open three) at once.</li>
<li>With your finger: tap a point to see where the stone would land and tap it again (or press “Place”) to play it. With a mouse, just click.</li>
</ul>`,
  },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (typeof s === 'string' && v) for (const x in v) s = s.replaceAll(`{${x}}`, v[x]);
  return s;
};
const lang = () => G.prefs?.lang || 'es';
const levelName = (l) => TXT.levels[lang()]?.[l - 1] || TXT.levels.es[l - 1];

// ---------------------------------------------------------------- preferencias y partida guardada
const KEY = { prefs: `gameit:${ID}:prefs`, save: `gameit:${ID}:save`, stats: `gameit:${ID}:stats` };
const load = (k, d) => {
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(k)) };
  } catch {
    return d;
  }
};
const store = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};
const OPTS = load(KEY.prefs, { level: 3, first: 0, size: 'm', last: 1, tc: '5+0' });
if (!Object.hasOwn(SIZES, OPTS.size)) OPTS.size = 'm';
const savePrefs = () => store(KEY.prefs, OPTS);

// ---------------------------------------------------------------- estado
const S = {
  mode: null, // 'cpu' | 'local' | 'online'
  level: 3,
  me: P0,
  size: 'm',
  side: 13,
  pos: null,
  moves: [],
  made: [],
  busy: false,
  thinking: false,
  over: null,
  view: null, // índice del repaso (null = en vivo)
  viewPos: null,
  last: -1,
  names: ['', ''],
  clock: null,
  req: 0,
  paused: false,
  arm: null,
  salt: 0,
  gn: 0, // online: número de partida
  again: [],
  away: false,
  bottom: P0,
  hover: -1,
  pending: -1, // cruz elegida con el dedo, a la espera de confirmación
  bs: 340,
};
let online = null;
let quick = false;
let quickHost = false;
let pulling = false;

// ---------------------------------------------------------------- sonidos
const sfx = {
  place: () => {
    tone(150, 90, 0.08, { type: 'sine', vol: 0.16 });
    noise(0.05, { freq: 1400, q: 1.5, vol: 0.07 });
  },
  win: () => notes([523.25, 659.25, 783.99, 1046.5, 1318.5], { step: 0.1, dur: 0.3, type: 'triangle', vol: 0.09 }),
  lose: () => notes([440, 370, 294], { step: 0.12, dur: 0.24, type: 'triangle', vol: 0.05 }),
  draw: () => notes([523.25, 523.25], { step: 0.14, dur: 0.22, type: 'triangle', vol: 0.06 }),
  err: () => tone(200, 150, 0.14, { type: 'square', vol: 0.05 }),
  turn: () => notes([660, 880], { step: 0.07, dur: 0.1, vol: 0.05 }),
  pick: () => tone(700, 760, 0.04, { type: 'triangle', vol: 0.05 }),
  ui: () => tone(900, 640, 0.045, { type: 'square', vol: 0.035 }),
};

// ---------------------------------------------------------------- pantallas
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  G.gameplay(!id && !!S.mode);
  if (S.pos) refreshBoardState();
}
const screenOpen = () => $$('.screen.on').length > 0;
const setPlaying = (on) => document.body.classList.toggle('playing', on);
function toast(text, ms = 1700) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  // se apoya justo arriba de la barra del rival, donde no tapa el tablero
  const b = $('bar-top').getBoundingClientRect();
  el.style.top = `${Math.max(62, b.top - el.offsetHeight - 10)}px`;
  el.style.bottom = 'auto';
  clearTimeout(toast.tm);
  toast.tm = setTimeout(() => (el.hidden = true), ms);
}

// ---------------------------------------------------------------- tablero (SVG)
const NS = 'http://www.w3.org/2000/svg';
const SP = 40; // separación entre cruces (unidades del dibujo)
const PAD = 27;
const R = 17; // radio de una piedra
const layer = {};
const stoneEls = new Map();
const svgEl = (name, attrs = {}) => {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
};
const cellXY = (i) => {
  const [x, y] = xy(S.side, i);
  return [PAD + x * SP, PAD + y * SP];
};
const STARS = { 9: [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]], 13: [[3, 3], [3, 9], [9, 3], [9, 9], [6, 6]], 15: [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]] };
function buildBoard() {
  const svg = $('board');
  svg.innerHTML = '';
  stoneEls.clear();
  const n = S.side;
  const W = (n - 1) * SP + PAD * 2;
  svg.setAttribute('viewBox', `0 0 ${W} ${W}`);
  const defs = svgEl('defs');
  defs.innerHTML = `<linearGradient id="wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3d594"/><stop offset=".55" stop-color="#e4b96d"/><stop offset="1" stop-color="#cf9b4c"/></linearGradient>
<radialGradient id="gb" cx=".34" cy=".3" r=".8"><stop offset="0" stop-color="#8c8c8c"/><stop offset=".45" stop-color="#262626"/><stop offset="1" stop-color="#000"/></radialGradient>
<radialGradient id="gw" cx=".34" cy=".3" r=".85"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#ece7da"/><stop offset="1" stop-color="#b5ae9c"/></radialGradient>`;
  svg.appendChild(defs);
  svg.appendChild(svgEl('rect', { x: 0, y: 0, width: W, height: W, rx: 14, fill: 'url(#wood)', stroke: '#1c0d04', 'stroke-width': 3 }));
  svg.appendChild(svgEl('rect', { x: 5, y: 5, width: W - 10, height: W - 10, rx: 10, fill: 'none', stroke: 'rgba(255,245,215,.55)', 'stroke-width': 1.5 }));
  const grid = svgEl('g');
  for (let k = 0; k < n; k++) {
    const p = PAD + k * SP;
    grid.appendChild(svgEl('line', { class: 'gl', x1: PAD, y1: p, x2: PAD + (n - 1) * SP, y2: p }));
    grid.appendChild(svgEl('line', { class: 'gl', x1: p, y1: PAD, x2: p, y2: PAD + (n - 1) * SP }));
  }
  for (const [x, y] of STARS[n] || []) grid.appendChild(svgEl('circle', { class: 'star', cx: PAD + x * SP, cy: PAD + y * SP, r: 3.6 }));
  svg.appendChild(grid);
  for (const k of ['stones', 'win', 'marks', 'hint', 'ghost']) {
    const g = svgEl('g');
    svg.appendChild(g);
    layer[k] = g;
  }
  measure();
}
function drawStone(i, by, animate) {
  const [x, y] = cellXY(i);
  const g = svgEl('g', { class: `stn${animate ? ' new' : ''}` });
  g.appendChild(svgEl('circle', { class: 'sh', cx: x + 1.6, cy: y + 2.6, r: R }));
  g.appendChild(svgEl('circle', { cx: x, cy: y, r: R, fill: by === P0 ? 'url(#gb)' : 'url(#gw)', stroke: by === P0 ? '#000' : 'rgba(80,70,50,.55)', 'stroke-width': 0.8 }));
  layer.stones.appendChild(g);
  stoneEls.set(i, g);
}
/** Dibuja de cero una posición. */
function drawAll(pos) {
  layer.stones.innerHTML = '';
  layer.win.innerHTML = '';
  layer.marks.innerHTML = '';
  layer.hint.innerHTML = '';
  layer.ghost.innerHTML = '';
  stoneEls.clear();
  // el color de cada piedra sale de quién la jugó: la 1.ª, 3.ª… son negras
  const order = pos === S.pos ? S.moves : S.view !== null ? S.moves.slice(0, S.view) : S.moves;
  order.forEach((m, k) => drawStone(Number(m), k % 2, false));
  setScores(pos);
}
const displayPos = () => (S.view === null ? S.pos : S.viewPos);
function markLast() {
  layer.marks.innerHTML = '';
  if (!OPTS.last) return;
  const k = S.view === null ? S.moves.length : S.view;
  if (k <= 0) return;
  const [x, y] = cellXY(Number(S.moves[k - 1]));
  layer.marks.appendChild(svgEl('circle', { class: 'lastdot', cx: x, cy: y, r: 4.6 }));
}
function showWin(line) {
  layer.win.innerHTML = '';
  if (!line) return;
  for (const i of line) {
    const [x, y] = cellXY(i);
    layer.win.appendChild(svgEl('circle', { class: 'winring', cx: x, cy: y, r: R + 3 }));
  }
  for (const [i, el] of stoneEls) el.classList.toggle('dimmed', !line.includes(i));
}
function setScores(pos = displayPos()) {
  for (const sl of ['top', 'bot']) {
    const c = slotColor(sl);
    const v = String(pos ? S.moves.slice(0, S.view ?? S.moves.length).filter((_, k) => k % 2 === c).length : 0);
    const e = $(`sc-${sl}`);
    if (e.textContent !== v) e.textContent = v;
  }
}
const bottomColor = () => (S.mode === 'local' || S.mode === null ? P0 : S.me);
const slotColor = (sl) => (sl === 'bot' ? S.bottom : S.bottom ^ 1);
function measure() {
  const g = $('game');
  const barsH = $('bar-top').offsetHeight + $('bar-bot').offsetHeight;
  const actH = $('actions').offsetHeight;
  const availH = g.clientHeight - barsH - actH - 8 * 3 - 12 - 30;
  const availW = g.clientWidth - 16;
  const bs = Math.floor(clamp(Math.min(availW, availH, 720), 220, 720));
  if (bs !== S.bs) {
    S.bs = bs;
    document.documentElement.style.setProperty('--bs', `${bs}px`);
  }
}
new ResizeObserver(measure).observe($('game'));

// ---------------------------------------------------------------- entrada
const humanTurn = () => !S.over && S.view === null && S.pos && !S.pos.over && (S.mode === 'local' || ((S.mode === 'cpu' || S.mode === 'online') && S.pos.turn === S.me));
const canInput = () => humanTurn() && !S.busy && !S.thinking && !screenOpen();
function toBoard(e) {
  const r = $('board').getBoundingClientRect();
  const vb = $('board').viewBox.baseVal;
  return [((e.clientX - r.left) / r.width) * vb.width, ((e.clientY - r.top) / r.height) * vb.height];
}
/** La cruz libre más cercana al punto, o -1. */
function cellAt(e) {
  const [x, y] = toBoard(e);
  const n = S.side;
  const cx = Math.round((x - PAD) / SP);
  const cy = Math.round((y - PAD) / SP);
  if (cx < 0 || cy < 0 || cx >= n || cy >= n) return -1;
  if (Math.hypot(x - (PAD + cx * SP), y - (PAD + cy * SP)) > SP * 0.62) return -1;
  const i = cy * n + cx;
  return S.pos.b[i] ? -1 : i;
}
function setGhost(i, pending = false) {
  layer.ghost.innerHTML = '';
  if (i < 0) return;
  const [x, y] = cellXY(i);
  const who = S.pos.turn;
  const g = svgEl('g', { class: 'ghost' });
  g.appendChild(svgEl('circle', { cx: x, cy: y, r: R, fill: who === P0 ? 'url(#gb)' : 'url(#gw)', stroke: who === P0 ? '#000' : 'rgba(80,70,50,.55)', 'stroke-width': 0.8 }));
  layer.ghost.appendChild(g);
  if (pending) layer.ghost.appendChild(svgEl('circle', { class: 'pend', cx: x, cy: y, r: R + 4 }));
}
function refreshBoardState() {
  $('board').classList.toggle('can', canInput());
  if (!canInput()) {
    S.hover = -1;
    S.pending = -1;
    layer.ghost && (layer.ghost.innerHTML = '');
  }
}
const svgBoard = $('board');
svgBoard.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || !canInput()) return;
  const i = cellAt(e);
  if (i === S.hover) return;
  S.hover = i;
  setGhost(i);
});
svgBoard.addEventListener('pointerleave', (e) => {
  if (e.pointerType !== 'mouse') return;
  S.hover = -1;
  if (S.pending < 0) layer.ghost && (layer.ghost.innerHTML = '');
});
svgBoard.addEventListener('pointerup', (e) => {
  unlock();
  if (!canInput()) return;
  const i = cellAt(e);
  if (i < 0) return;
  clearHint();
  if (e.pointerType === 'mouse') return commit(i);
  // con el dedo: el primer toque elige la cruz y el segundo, en la misma, la juega
  if (S.pending === i) return commit(i);
  S.pending = i;
  setGhost(i, true);
  sfx.pick();
  renderActions();
  if (!commit.told) {
    commit.told = true;
    toast(t('tapAgain'), 2600);
  }
});
function commit(i) {
  if (!canInput() || S.pos.b[i]) return;
  S.pending = -1;
  S.hover = -1;
  layer.ghost.innerHTML = '';
  if (S.mode === 'online') online?.send({ t: 'move', m: moveStr(i) });
  playMove(i);
}

// ---------------------------------------------------------------- pista
function clearHint() {
  clearTimeout(clearHint.tm);
  layer.hint && (layer.hint.innerHTML = '');
}
function showHint(m) {
  clearHint();
  const [x, y] = cellXY(m);
  layer.hint.appendChild(svgEl('circle', { class: 'hintring', cx: x, cy: y, r: R + 3 }));
  clearHint.tm = setTimeout(clearHint, 6000);
}

// ---------------------------------------------------------------- jugar
async function playMove(i, { quick: fast = false } = {}) {
  S.busy = true;
  clearHint();
  S.pending = -1;
  layer.ghost.innerHTML = '';
  const rec = S.pos.play(i);
  S.moves.push(moveStr(i));
  S.made.push(rec);
  S.last = i;
  if (S.view !== null) {
    // se está repasando: la partida sigue por detrás, sin animar
    S.busy = false;
    refresh();
    return afterMove(false);
  }
  drawStone(i, rec.by, !fast);
  markLast();
  if (!fast) sfx.place();
  refresh();
  if (rec.win) showWin(rec.win);
  await sleep(fast ? 0 : 150);
  S.busy = false;
  afterMove(true, rec);
}
function afterMove(animated, rec = S.made[S.made.length - 1]) {
  const over = S.pos.over;
  saveGame();
  refresh();
  refreshBoardState();
  if (S.mode === 'online') {
    if (!over && S.pos.turn === S.me && animated) sfx.turn();
    if (!pulling) pullMoves();
    return;
  }
  if (over) return endGame(S.pos.status());
  if (S.mode === 'cpu' && S.pos.turn !== S.me) cpuMove();
  else if (S.mode === 'cpu' && animated) sfx.turn();
  void rec;
}
const playerName = (c) => S.names[c] || '';

function resetGame() {
  S.pos = new Position(S.side);
  S.moves = [];
  S.made = [];
  S.over = null;
  S.view = null;
  S.viewPos = null;
  S.last = -1;
  S.busy = false;
  S.thinking = false;
  S.clock = null;
  S.pending = -1;
  S.req++;
  S.bottom = bottomColor();
  clearHint();
  buildBoard();
  drawAll(S.pos);
  markLast();
}
function startGame(mode, opts = {}) {
  S.mode = mode;
  S.level = opts.level || 3;
  S.size = opts.size || OPTS.size;
  S.side = SIZES[S.size];
  S.me = mode === 'local' ? P0 : (opts.me ?? P0);
  S.salt = (Math.random() * 1e9) | 0;
  nameBars();
  resetGame();
  setPlaying(true);
  show(null);
  refresh();
  if (mode === 'cpu' && S.me === P1) cpuMove();
  saveGame();
}
function nameBars() {
  if (S.mode === 'cpu') {
    const cpu = t('cpuName', { l: levelName(S.level) });
    S.names = S.me === P0 ? [t('you'), cpu] : [cpu, t('you')];
  } else if (S.mode === 'local') S.names = [t('p1'), t('p2')];
}
function startCpu() {
  const me = OPTS.first === 2 ? (Math.random() < 0.5 ? P0 : P1) : OPTS.first === 0 ? P0 : P1;
  startGame('cpu', { level: OPTS.level, me, size: OPTS.size });
}
const startLocal = () => startGame('local', { size: OPTS.size });

function saveGame() {
  if (S.mode !== 'cpu' && S.mode !== 'local') return;
  if (S.over || !S.moves.length) {
    try {
      localStorage.removeItem(KEY.save);
    } catch {}
    return;
  }
  store(KEY.save, { mode: S.mode, level: S.level, me: S.me, size: S.size, moves: S.moves, salt: S.salt });
}
function readSave() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY.save));
    return s && Array.isArray(s.moves) && s.moves.length && Object.hasOwn(SIZES, s.size) ? s : null;
  } catch {
    return null;
  }
}
function resumeSaved() {
  const s = readSave();
  if (!s) return;
  const side = SIZES[s.size];
  const r = replay(s.moves, side);
  if (!r) return localStorage.removeItem(KEY.save);
  S.mode = s.mode;
  S.level = s.level || 3;
  S.me = s.me ?? P0;
  S.size = s.size;
  S.side = side;
  S.salt = s.salt || 0;
  nameBars();
  S.pos = r.pos;
  S.moves = s.moves.slice();
  S.made = r.made;
  S.last = r.made.length ? r.made[r.made.length - 1].i : -1;
  S.over = null;
  S.view = null;
  S.pending = -1;
  S.req++;
  S.bottom = bottomColor();
  buildBoard();
  drawAll(S.pos);
  markLast();
  setPlaying(true);
  show(null);
  refresh();
  if (S.mode === 'cpu' && S.pos.turn !== S.me) cpuMove();
}

// ---------------------------------------------------------------- la compu
let worker = null;
let engineLib = null;
const pending = new Map();
let reqId = 0;
function ensureWorker() {
  if (worker || worker === false) return worker;
  try {
    worker = new Worker('./ai.js', { type: 'module' });
    worker.onmessage = ({ data }) => {
      const f = pending.get(data.id);
      if (f) {
        pending.delete(data.id);
        f(data);
      }
    };
    worker.onerror = () => {
      worker = false;
      for (const f of pending.values()) f(null);
      pending.clear();
    };
  } catch {
    worker = false;
  }
  return worker;
}
/** Le pide una cruz al worker; si no hay worker, piensa acá (con el mismo motor). */
async function ask(payload) {
  const w = ensureWorker();
  if (w) {
    const id = ++reqId;
    const res = await new Promise((resolve) => {
      pending.set(id, resolve);
      w.postMessage({ id, side: S.side, ...payload });
    });
    if (res) return res;
  }
  engineLib ||= await import('./shared/engine.js');
  const r = replay(payload.moves, S.side);
  if (!r) return { move: null };
  const eng = (ask.eng ||= new engineLib.Engine());
  await sleep(20);
  const res = eng.think(r.pos, { level: payload.level, hint: payload.hint });
  return { move: res.move >= 0 ? moveStr(res.move) : null };
}
async function cpuMove() {
  if (S.mode !== 'cpu' || S.over || S.pos.turn === S.me || S.thinking || S.pos.over) return;
  const my = ++S.req;
  S.thinking = true;
  refresh();
  refreshBoardState();
  const t0 = performance.now();
  const r = await ask({ moves: S.moves.slice(), level: S.level });
  await sleep(Math.max(0, 600 - (performance.now() - t0)));
  while (S.paused || screenOpen() || S.busy) {
    if (my !== S.req) return;
    await sleep(120);
  }
  if (my !== S.req || S.mode !== 'cpu' || S.over) return;
  S.thinking = false;
  let m = r && r.move ? fromStr(S.side, r.move) : -1;
  if (m < 0 || S.pos.b[m]) {
    const free = S.pos.moves();
    m = free[Math.floor(Math.random() * free.length)];
  }
  await playMove(m);
}

// ---------------------------------------------------------------- fin de la partida
function endGame(res) {
  if (S.over) return;
  S.over = res;
  S.thinking = false;
  S.req++;
  try {
    localStorage.removeItem(KEY.save);
  } catch {}
  clearHint();
  if (res.line) showWin(res.line);
  refresh();
  refreshBoardState();
  const mine = S.mode === 'local' ? -2 : S.me;
  const win = res.winner !== null && res.winner === mine;
  const lose = res.winner !== null && mine >= 0 && res.winner !== mine;
  if (S.mode === 'cpu') {
    const all = load(KEY.stats, {});
    const cur = all[S.level] || { w: 0, l: 0, d: 0 };
    if (win) cur.w++;
    else if (lose) cur.l++;
    else cur.d++;
    all[S.level] = cur;
    store(KEY.stats, all);
  }
  (win ? sfx.win : lose ? sfx.lose : sfx.draw)();
  setTimeout(showOver, S.mode === 'online' ? 900 : 1400);
}
function endText(res) {
  const loser = res.winner === null ? -1 : res.winner ^ 1;
  switch (res.reason) {
    case 'five':
      return t('endFive');
    case 'full':
      return t('endFull');
    case 'timeout':
      return t('endTimeout', { n: playerName(loser) });
    case 'resign':
      return S.mode === 'cpu' && loser === S.me ? t('endResignYou') : t('endResign', { n: playerName(loser) });
    case 'abandon':
      return t('endAbandon', { n: playerName(loser) });
    case 'aborted':
      return t('endAborted');
    default:
      return '';
  }
}
function showOver() {
  if (!S.over || S.view !== null || document.querySelector('#s-over.on')) return;
  const res = S.over;
  const mine = S.mode === 'local' ? -2 : S.me;
  let title;
  if (res.winner === null) title = t('drawn');
  else if (S.mode === 'local') title = t(res.winner === P0 ? 'winBlack' : 'winWhite');
  else title = res.winner === mine ? t('youWin') : t('youLose');
  $('over-kicker').textContent = S.mode === 'cpu' ? levelName(S.level) : '';
  $('over-title').textContent = title;
  const count = (c) => S.moves.filter((_, k) => k % 2 === c).length;
  const box = (c) => `<div class="${res.winner === c ? 'win' : ''}"><i class="stone${c === P1 ? ' w' : ''}"></i><span class="n">${count(c)}</span><span class="who">${esc(S.names[c] || '')}</span></div>`;
  $('over-final').innerHTML = box(P0) + box(P1);
  $('over-sub').textContent = endText(res);
  const stats = $('over-stats');
  if (S.mode === 'cpu') {
    const c = load(KEY.stats, {})[S.level] || { w: 0, l: 0, d: 0 };
    stats.innerHTML = `<span><b>${c.w}</b><small>${t('wins')}</small></span><span><b>${c.l}</b><small>${t('losses')}</small></span><span><b>${c.d}</b><small>${t('draws')}</small></span>`;
    stats.hidden = false;
  } else stats.hidden = true;
  renderOverButtons();
  show('over');
}
function renderOverButtons() {
  const b = $('over-again-t');
  const btn = $('over-again');
  btn.disabled = false;
  if (S.mode === 'online') {
    const gone = (online?.room?.players || []).filter((p) => p.connected).length < 2;
    const sent = S.again.includes(online?.myId);
    const asked = S.again.length && !sent;
    b.textContent = gone ? t('rivalLeft') : sent ? t('rematchSent') : asked ? t('acceptRematch') : t('rematch');
    btn.disabled = gone;
  } else b.textContent = t('again');
}
$('over-again').onclick = () => {
  if (S.mode === 'online') {
    if (!online || S.again.includes(online.myId)) return;
    online.send({ t: 'again' });
    S.again = [...S.again, online.myId];
    renderOverButtons();
    return;
  }
  if (S.mode === 'cpu') startCpu();
  else startLocal();
};
$('over-review').onclick = () => {
  show(null);
  setView(S.moves.length);
};
$('over-menu').onclick = () => toMenu();

// ---------------------------------------------------------------- repaso
function setView(i) {
  const n = S.moves.length;
  if (i === null) {
    S.view = null;
    S.viewPos = null;
  } else {
    i = clamp(i, 0, n);
    S.view = i;
    S.viewPos = replay(S.moves.slice(0, i), S.side).pos;
  }
  clearHint();
  drawAll(displayPos());
  markLast();
  const dp = displayPos();
  if (dp.win) showWin(dp.win);
  refresh();
  refreshBoardState();
}
function exitReview() {
  setView(null);
  if (S.over) showOver();
}

// ---------------------------------------------------------------- barras y acciones
function setBar(sl) {
  const c = slotColor(sl);
  $(`nm-${sl}`).textContent = S.names[c] || '';
  $(`pen-${sl}`).className = `stone${c === P1 ? ' w' : ''}`;
  const turn = !S.over && S.view === null && S.pos.turn === c && !S.pos.over;
  $(`bar-${sl}`).classList.toggle('turn', turn);
  let st = '';
  if (turn) {
    if (S.mode === 'cpu') st = S.pos.turn === S.me ? t('yourTurn') : t('thinking');
    else if (S.mode === 'online') st = S.pos.turn === S.me ? t('yourTurn') : S.away ? t('away') : t('waitMove');
    else st = t('turnOf', { n: S.names[c] });
  }
  $(`st-${sl}`).textContent = st;
}
function refresh() {
  if (!S.pos) return;
  setBar('top');
  setBar('bot');
  setScores();
  $('busy').hidden = !S.thinking;
  const showClock = S.mode === 'online' && !!S.clock;
  $('clk-top').hidden = !showClock;
  $('clk-bot').hidden = !showClock;
  renderActions();
  tickClocks();
  refreshBoardState();
}
const ICON = {
  undo: '<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/>',
  hint: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  resign: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  menu: '<path d="M5 6h14M5 12h14M5 18h14"/>',
  again: '<path d="M21 12a9 9 0 11-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  review: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  first: '<path d="M6 5v14M19 5l-9 7 9 7z"/>',
  prev: '<path d="M16 5l-9 7 9 7z"/>',
  next: '<path d="M8 5l9 7-9 7z"/>',
  last: '<path d="M18 5v14M5 5l9 7-9 7z"/>',
  back: '<path d="M4 12h16M10 6l-6 6 6 6"/>',
  place: '<path d="M5 13l4 4L19 7"/>',
};
/** Cuántas piedras hay que sacar para volver a tu última jugada (contra la compu se saca también la respuesta); 0 si no se puede. */
function undoCount() {
  if (!S.made.length) return 0;
  if (S.mode === 'local') return 1;
  let i = S.made.length - 1;
  while (i >= 0 && S.made[i].by !== S.me) i--;
  return i < 0 ? 0 : S.made.length - i;
}
function actionList() {
  const over = !!S.over;
  if (S.view !== null) {
    const n = S.moves.length;
    return [{ k: 'first', dis: S.view <= 0 }, { k: 'prev', dis: S.view <= 0 }, { k: 'pos', label: `${S.view}/${n}` }, { k: 'next', dis: S.view >= n }, { k: 'last', dis: S.view >= n }, { k: 'live', icon: 'back', label: over ? t('menu') : t('live') }];
  }
  const list = [];
  if (S.pending >= 0 && canInput()) list.push({ k: 'place', icon: 'place', label: t('place'), cls: ' go' });
  if (S.mode === 'cpu') list.push({ k: 'undo', dis: over || !undoCount() || S.busy }, { k: 'hint', dis: over || S.thinking || S.busy || S.pos.turn !== S.me });
  if (S.mode === 'local') list.push({ k: 'undo', dis: over || !undoCount() || S.busy });
  if (over) list.push({ k: 'again', icon: 'again', label: S.mode === 'online' ? t('rematch') : t('again') }, { k: 'review' });
  else list.push({ k: 'resign' });
  list.push({ k: 'menu', label: t('menu') });
  return list;
}
function renderActions() {
  const labels = { undo: t('undo'), hint: t('hint'), resign: t('resign'), menu: t('menu'), again: t('again'), review: t('review').split(' ')[0], first: '', prev: '', next: '', last: '' };
  $('actions').innerHTML = actionList()
    .map((a) => {
      if (a.k === 'pos') return `<div class="act pos">${esc(a.label)}</div>`;
      const label = a.label ?? labels[a.k];
      return `<button class="act${a.cls || ''}${S.arm === a.k ? ' arm' : ''}" data-k="${a.k}"${a.dis ? ' disabled' : ''} aria-label="${esc(label || a.k)}"><svg viewBox="0 0 24 24">${ICON[a.icon || a.k] || ''}</svg>${label ? `<span>${esc(label)}</span>` : ''}</button>`;
    })
    .join('');
  measure();
}
function confirmTwice(k) {
  if (S.arm === k) {
    S.arm = null;
    return true;
  }
  S.arm = k;
  toast(t('confirm'), 2200);
  renderActions();
  clearTimeout(confirmTwice.tm);
  confirmTwice.tm = setTimeout(() => {
    S.arm = null;
    renderActions();
  }, 2400);
  return false;
}
$('actions').addEventListener('click', (e) => {
  const b = e.target.closest('.act');
  if (!b || b.disabled || !b.dataset.k) return;
  unlock();
  sfx.ui();
  doAction(b.dataset.k);
});
function doAction(k) {
  if (k === 'menu') return pause();
  if (k === 'place') return S.pending >= 0 && commit(S.pending);
  if (k === 'first') return setView(0);
  if (k === 'prev') return setView(S.view - 1);
  if (k === 'next') return setView(S.view + 1);
  if (k === 'last') return setView(S.moves.length);
  if (k === 'live') return exitReview();
  if (k === 'again') return $('over-again').click();
  if (k === 'review') return setView(S.moves.length);
  if (S.over) return;
  if (k === 'undo') return undo();
  if (k === 'hint') return doHint();
  if (k === 'resign') {
    if (!confirmTwice('resign')) return;
    if (S.mode === 'online') online?.send({ t: 'resign' });
    else endGame({ over: true, winner: (S.mode === 'cpu' ? S.me : S.pos.turn) ^ 1, reason: 'resign' });
  }
}
async function doHint() {
  if (S.thinking || S.busy || !humanTurn()) return;
  S.thinking = true;
  const my = ++S.req;
  refresh();
  const r = await ask({ moves: S.moves.slice(), hint: true, level: 5 });
  if (my !== S.req) return;
  S.thinking = false;
  refresh();
  const m = r?.move ? fromStr(S.side, r.move) : -1;
  if (m >= 0 && !S.pos.b[m]) showHint(m);
  else toast(t('hintNone'));
}
function undo() {
  const drop = undoCount();
  if (!drop || S.busy) return;
  const keep = S.moves.slice(0, S.moves.length - drop);
  const r = replay(keep, S.side);
  if (!r) return;
  S.req++;
  S.thinking = false;
  S.pos = r.pos;
  S.moves = keep;
  S.made = r.made;
  S.last = r.made.length ? r.made[r.made.length - 1].i : -1;
  S.over = null;
  S.pending = -1;
  clearHint();
  drawAll(S.pos);
  markLast();
  refresh();
  saveGame();
  if (S.mode === 'cpu' && S.pos.turn !== S.me) cpuMove();
}

// ---------------------------------------------------------------- relojes
const fmtClock = (ms) => {
  ms = Math.max(0, ms);
  if (ms < 10000) return `${Math.floor(ms / 1000)}.${Math.floor((ms % 1000) / 100)}`;
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
function clockOf(c) {
  const k = S.clock;
  if (!k) return 0;
  let ms = k.c[c];
  if (k.running === c) ms -= (online ? online.serverNow() : Date.now()) - k.since;
  return Math.max(0, ms);
}
function tickClocks() {
  if (S.mode !== 'online' || !S.clock) return;
  for (const sl of ['top', 'bot']) {
    const c = slotColor(sl);
    const e = $(`clk-${sl}`);
    const ms = clockOf(c);
    e.textContent = fmtClock(ms);
    e.classList.toggle('run', S.clock.running === c);
    e.classList.toggle('low', S.clock.running === c && ms < 15000);
  }
}
setInterval(tickClocks, 100);

// ---------------------------------------------------------------- pausa y menús
function pause() {
  if (!S.mode && !screenOpen()) return;
  syncSeg('p-last', OPTS.last);
  S.paused = true;
  show('pause');
}
function resume() {
  S.paused = false;
  show(null);
}
$('b-resume').onclick = () => resume();
$('b-p-rules').onclick = () => {
  S.rulesBack = 'pause';
  show('rules');
};
$('b-quit').onclick = () => toMenu();
function toMenu() {
  S.paused = false;
  S.req++;
  if (S.mode === 'online') {
    online?.leave();
    online = null;
  }
  if (S.mode === 'cpu' || S.mode === 'local') saveGame();
  S.mode = null;
  S.thinking = false;
  S.pos = null;
  S.over = null;
  S.view = null;
  setPlaying(false);
  refreshHome();
  show('home');
}
function refreshHome() {
  const s = readSave();
  const b = $('b-continue');
  b.hidden = !s;
  if (s) {
    const side = SIZES[s.size];
    $('cont-t').textContent = t('continue');
    $('cont-s').textContent = t(s.mode === 'cpu' ? 'contSub' : 'contSubLocal', { l: levelName(s.level || 3), s: `${side}×${side}`, n: s.moves.length });
  }
}
function bindSeg(id, key, cb) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    OPTS[key] = isNaN(b.dataset.v) || key === 'tc' || key === 'size' ? b.dataset.v : Number(b.dataset.v);
    savePrefs();
    syncOpts();
    cb?.();
  });
}
function syncSeg(id, v) {
  for (const b of $$('button', $(id))) b.classList.toggle('on', String(b.dataset.v) === String(v));
}
const sizeHelp = () => t('sizeHelp', { n: SIZES[OPTS.size], m: lang() === 'es' ? 'negras' : 'black' });
const helpLevel = () => ($('o-level-help').textContent = G.t(TXT.levelHelp)[OPTS.level - 1] || '');
const levelLabels = () => $$('#o-level button').forEach((b, i) => (b.textContent = `${i + 1} ${levelName(i + 1)}`));
bindSeg('o-level', 'level');
bindSeg('o-first', 'first');
bindSeg('o-size', 'size');
bindSeg('l-size', 'size');
bindSeg('p-last', 'last', () => markLast());
function syncOpts() {
  syncSeg('o-level', OPTS.level);
  syncSeg('o-first', OPTS.first);
  syncSeg('o-size', OPTS.size);
  syncSeg('l-size', OPTS.size);
  helpLevel();
  $('o-size-help').textContent = sizeHelp();
  $('l-size-help').textContent = sizeHelp();
}
$('b-cpu').onclick = () => {
  syncOpts();
  show('cpu');
};
$('b-cpu-back').onclick = () => show('home');
$('b-cpu-go').onclick = () => {
  unlock();
  startCpu();
};
$('b-local').onclick = () => {
  syncOpts();
  show('local');
};
$('b-local-back').onclick = () => show('home');
$('b-local-go').onclick = () => {
  unlock();
  startLocal();
};
$('b-continue').onclick = () => {
  unlock();
  resumeSaved();
};
$('b-rules').onclick = () => {
  S.rulesBack = 'home';
  show('rules');
};
$('b-rules-ok').onclick = () => show(S.rulesBack === 'pause' ? 'pause' : 'home');
for (const b of $$('.btn, .link, .seg button')) b.addEventListener('click', () => sfx.ui());

// ---------------------------------------------------------------- online
function ensureOnline() {
  if (online) return online;
  online = new OnlineRoom(ID, {
    onStatus: (st) => {
      const txt = { connecting: netText('connecting'), reconnecting: netText('reconnecting'), netError: netText('netError'), wakeup: netText('wakeup'), rate: netText('rate'), open: '' }[st];
      if (txt !== undefined && !(st === 'open' && quick)) $('on-status').textContent = txt;
    },
    onRoom: applyRoom,
    onMessage: (m) => {
      if (m.t === 'list') {
        if (!quick) return;
        quick = false;
        const code = pickLobby(m.rooms);
        const name = $('on-name').value.trim() || defaultName();
        if (code) {
          quickHost = false;
          online.join(code, name);
        } else {
          quickHost = true;
          online.create(name, { public: true, size: OPTS.size });
        }
      } else if (m.t === 'error') {
        quick = false;
        const txt = m.code === 'need_players' ? t('needPlayers') : netText(m.code);
        $('on-status').textContent = txt;
        $('lobby-status').textContent = txt;
        if (m.code === 'not_your_turn' && S.mode === 'online') resyncOnline();
      } else if (m.t === 'closed' || m.t === 'kicked') {
        $('on-status').textContent = netText(m.t === 'kicked' ? 'kicked' : `closed_${m.reason}`);
        S.mode = null;
        S.pos = null;
        setPlaying(false);
        online = null;
        show('online');
      }
    },
  });
  return online;
}
$('b-online').onclick = () => {
  $('on-name').value ||= defaultName();
  $('on-status').textContent = '';
  show('online');
};
$('on-back').onclick = () => {
  quick = false;
  if (online) {
    online.leave();
    online = null;
  }
  show('home');
};
const myName = () => $('on-name').value.trim() || defaultName();
$('on-quick').onclick = () => {
  unlock();
  quick = true;
  $('on-status').textContent = t('searching');
  ensureOnline().send({ t: 'list', game: ID });
};
$('on-create').onclick = () => {
  unlock();
  quick = false;
  quickHost = false;
  ensureOnline().create(myName(), { size: OPTS.size });
};
$('on-join').onclick = () => {
  unlock();
  const code = $('on-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  quick = false;
  if (code.length === 5) ensureOnline().join(code, myName());
};
$('on-code').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)));
$('on-name').addEventListener('keydown', (e) => e.key === 'Enter' && $('on-quick').click());
$('lobby-start').onclick = () => online?.send({ t: 'start' });
$('lobby-leave').onclick = () => {
  online?.leave();
  online = null;
  quick = false;
  S.mode = null;
  show('online');
};
$('lobby-code').onclick = async () => {
  if (!online?.room) return;
  const r = await shareRoom(ID, online.room.code);
  $('lobby-status').textContent = r === 'copied' ? t('copied') : '';
};
for (const seg of $$('#lobby-host .seg'))
  seg.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || !online?.isHost) return;
    const k = seg.dataset.k;
    const st = { ...(online.room.settings || {}) };
    st[k] = k === 'public' ? b.dataset.v === '1' : b.dataset.v;
    online.send({ t: 'settings', settings: st });
  };

function applyLobby(room) {
  $('lobby-code').textContent = room.code;
  const st = room.settings || {};
  const people = room.players.filter((p) => p.connected);
  $('lobby-players').innerHTML = room.players
    .map((p) => `<li><i style="background:${esc(p.color)}"></i><span>${esc(p.name)}</span><small>${[p.id === online.myId ? t('youLower') : '', p.id === room.host ? t('host') : ''].filter(Boolean).join(' · ')}</small></li>`)
    .join('');
  for (const seg of $$('#lobby-host .seg')) {
    const k = seg.dataset.k;
    const cur = k === 'public' ? (st.public ? '1' : '0') : st[k];
    $$('button', seg).forEach((b) => {
      b.classList.toggle('on', b.dataset.v === String(cur));
      b.disabled = !online.isHost;
    });
  }
  $('lobby-start').hidden = !online.isHost;
  const need = people.length < 2;
  $('lobby-start').disabled = need;
  $('lobby-status').textContent = online.isHost ? (need ? t('needPlayers') : quickHost ? t('foundRival') : '') : t('waitingHost');
  $('lobby-status').style.color = online.isHost && !need ? '#1d8a63' : online.isHost ? '' : 'var(--ink2)';
  show('lobby');
  // en la partida rápida el que armó la sala empieza solo cuando entra alguien
  if (online.isHost && quickHost && !need) {
    quickHost = false;
    setTimeout(() => online?.room?.state === 'lobby' && online.send({ t: 'start' }), 1300);
  }
}
function resyncOnline() {
  const g = online?.room?.gomoku;
  if (!g) return;
  const side = SIZES[g.size] || SIZES.m;
  const r = replay(g.moves, side);
  if (!r) return;
  S.pos = r.pos;
  S.moves = g.moves.slice();
  S.made = r.made;
  S.last = r.made.length ? r.made[r.made.length - 1].i : -1;
  S.busy = false;
  drawAll(S.pos);
  markLast();
  if (S.pos.win) showWin(S.pos.win);
  refresh();
}
/** Pone al día las piedras del rival (con animación) a partir de lo que dice el servidor. */
async function pullMoves() {
  if (pulling || S.mode !== 'online') return;
  pulling = true;
  try {
    for (;;) {
      const g = online?.room?.gomoku;
      if (!g || S.gn !== g.n) return;
      if (g.moves.length < S.moves.length || g.moves.slice(0, S.moves.length).join() !== S.moves.join()) return resyncOnline();
      if (g.moves.length === S.moves.length || S.busy) return;
      const m = fromStr(S.side, g.moves[S.moves.length]);
      if (m < 0 || S.pos.b[m]) return resyncOnline();
      await playMove(m, { quick: g.moves.length - S.moves.length > 1 });
    }
  } finally {
    pulling = false;
  }
}
function applyRoom(room) {
  if (room.state === 'lobby' || !room.gomoku) {
    if (S.mode === 'online') {
      S.mode = null;
      S.pos = null;
      setPlaying(false);
    }
    applyLobby(room);
    return;
  }
  const g = room.gomoku;
  const myId = online.myId;
  const nameOf = (id) => room.players.find((p) => p.id === id)?.name || '';
  if (S.mode !== 'online' || S.gn !== g.n) {
    // partida nueva (o reconexión): se arma desde cero con las piedras que ya hay
    S.mode = 'online';
    S.gn = g.n;
    S.size = Object.hasOwn(SIZES, g.size) ? g.size : 'm';
    S.side = SIZES[S.size];
    S.me = g.first === myId ? P0 : P1;
    S.names = [nameOf(g.first), nameOf(g.second)];
    S.again = [];
    S.over = null;
    S.view = null;
    S.thinking = false;
    S.pending = -1;
    S.arm = null;
    const r = replay(g.moves, S.side);
    S.pos = r ? r.pos : new Position(S.side);
    S.moves = r ? g.moves.slice() : [];
    S.made = r ? r.made : [];
    S.last = S.made.length ? S.made[S.made.length - 1].i : -1;
    S.busy = false;
    S.bottom = S.me;
    clearHint();
    buildBoard();
    drawAll(S.pos);
    markLast();
    setPlaying(true);
    show(null);
    if (S.pos.win) showWin(S.pos.win);
    if (!g.moves.length && S.me === P0) sfx.turn();
  } else pullMoves();
  S.away = !room.players.find((p) => p.id !== myId)?.connected;
  S.clock = { c: g.clock.slice(), running: g.running, since: g.since };
  const prevAgain = S.again;
  S.again = g.again || [];
  if (S.again.some((id) => id !== myId && !prevAgain.includes(id))) toast(t('rematchAsked'), 2600);
  if (g.result && !S.over) {
    S.over = { over: true, winner: g.result.winner, reason: g.result.reason, line: g.result.line };
    clearHint();
    if (g.result.line) showWin(g.result.line);
    (S.over.winner === null ? sfx.draw : S.over.winner === S.me ? sfx.win : sfx.lose)();
    setTimeout(showOver, 1000);
  } else if (!g.result && S.over) S.over = null;
  if (S.over && document.querySelector('#s-over.on')) renderOverButtons();
  refresh();
}

// ---------------------------------------------------------------- reglas, teclado y arranque
const renderRules = () => ($('rules-body').innerHTML = G.t(TXT.rules));
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (document.querySelector('#s-pause.on')) {
    if (k === 'escape' || k === 'p') resume();
    return;
  }
  if (screenOpen() || !S.mode) return;
  if (k === 'escape' || k === 'p') pause();
  else if (k === 'u' && !S.over && S.mode !== 'online') undo();
  else if (k === 'h' && S.mode === 'cpu') doHint();
  else if (k === 'enter' && S.pending >= 0) commit(S.pending);
  else if (S.view !== null && k === 'arrowleft') setView(S.view - 1);
  else if (S.view !== null && k === 'arrowright') setView(S.view + 1);
});
G.onPause?.(() => (S.paused = true));
G.onResume?.(() => (S.paused = screenOpen() && !!document.querySelector('#s-pause.on')));

const drawLogo = () => {
  // un pedacito de tablero con cinco piedras en diagonal (negras) y tres blancas que no alcanzan
  const lines = [];
  for (let k = 0; k < 6; k++) {
    lines.push(`<line class="gl" x1="14" y1="${14 + k * 16}" x2="134" y2="${14 + k * 16}"/>`, `<line class="gl" x1="${14 + k * 24}" y1="14" x2="${14 + k * 24}" y2="94"/>`);
  }
  const st = (x, y, c, d) => `<circle class="s" style="animation-delay:${d}s" cx="${x}" cy="${y}" r="9" fill="${c === 'b' ? 'url(#lgb)' : 'url(#lgw)'}" stroke="${c === 'b' ? '#000' : 'rgba(80,70,50,.6)'}" stroke-width=".8"/>`;
  $('logo').innerHTML = `<svg viewBox="0 0 148 108"><defs><radialGradient id="lgb" cx=".34" cy=".3" r=".8"><stop offset="0" stop-color="#8c8c8c"/><stop offset=".45" stop-color="#262626"/><stop offset="1" stop-color="#000"/></radialGradient><radialGradient id="lgw" cx=".34" cy=".3" r=".85"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#ece7da"/><stop offset="1" stop-color="#b5ae9c"/></radialGradient></defs>
<rect x="2" y="2" width="144" height="104" rx="12" fill="#e4b96d" stroke="#1c0d04" stroke-width="3"/>${lines.join('')}
${st(38, 14, 'w', 0.6)}${st(62, 46, 'w', 0.7)}${st(110, 78, 'w', 0.8)}
${[0, 1, 2, 3, 4].map((k) => st(14 + 24 * k + 0, 14 + 16 * k + 0, 'b', k * 0.1)).join('')}</svg>`;
};
G.onPrefs(
  (p) => {
    document.documentElement.lang = p.lang;
    $$('[data-t]').forEach((e) => (e.textContent = t(e.dataset.t)));
    levelLabels();
    renderRules();
    syncOpts();
    refreshHome();
    if (S.pos) {
      if (S.mode === 'cpu' || S.mode === 'local') nameBars();
      refresh();
    }
    if (online?.room && document.querySelector('#s-lobby.on')) applyLobby(online.room);
  },
  true,
);

drawLogo();
{
  const code = roomFromUrl();
  if (code) {
    $('on-code').value = code;
    $('on-name').value = defaultName();
    show('online');
  } else if (ensureOnline().resume()) show('online');
  else {
    online = null;
    refreshHome();
    show('home');
  }
}
G.gameplay(false);
measure();

if (DEBUG)
  window.__gomoku = {
    S,
    OPTS,
    get online() {
      return online;
    },
    startCpu,
    startLocal,
    startGame,
    playMove: (m) => playMove(m),
    commit,
    setView,
    toMenu,
    refresh,
    cellXY,
    /** Partida ya jugada (sin animar): lista de cruces jugadas. */
    load(list, mode = 'cpu', me = P0, size = 'm') {
      S.mode = mode;
      S.me = me;
      S.level = 4;
      S.size = size;
      S.side = SIZES[size];
      nameBars();
      const r = replay(list, S.side);
      S.pos = r.pos;
      S.moves = list.slice();
      S.made = r.made;
      S.over = null;
      S.view = null;
      S.last = r.made.length ? r.made[r.made.length - 1].i : -1;
      S.busy = false;
      S.thinking = false;
      S.pending = -1;
      S.bottom = bottomColor();
      buildBoard();
      drawAll(S.pos);
      markLast();
      setPlaying(true);
      show(null);
      refresh();
    },
  };
G.ready();
