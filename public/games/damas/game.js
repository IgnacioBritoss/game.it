/* Damas — game.it
 * Damas con tres reglamentos (clásicas, españolas e inglesas): contra la compu (cinco niveles, piensa en un worker), de a dos
 * en la misma pantalla y online con reloj, tablas y revancha. Las reglas están en shared/rules.js (las comparte el servidor)
 * y la compu en shared/engine.js.
 */
import { Position, WHITE, BLACK, RULE_IDS, sideOf, isKing, sqName, fromStr, withPrefix, replay, moveStr, rowOf, colOf, isDark } from './shared/rules.js';
import { OnlineRoom, netText, defaultName, share as shareRoom, roomFromUrl } from '/shared/online.js';
import { pickLobby } from '/shared/race-lobby.js';
import { tone, noise, notes, unlock } from '/shared/sfx.js';

const G = window.GameIt;
const ID = 'damas';
const DEBUG = /[?&]debug\b/.test(location.search);
const $ = (id) => document.getElementById(id);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- textos
const TXT = {
  title: { es: 'Damas', en: 'Checkers' },
  tagline: { es: 'El clásico de fichas en diagonal. Comé, coroná y dejá al rival sin jugadas.', en: 'The classic diagonal game. Capture, crown and leave your rival without moves.' },
  vsCpu: { es: 'Contra la compu', en: 'Against the computer' },
  vsCpuSub: { es: 'cinco niveles y pistas', en: 'five levels and hints' },
  local: { es: 'De a dos', en: 'Two players' },
  localSub: { es: 'en la misma pantalla', en: 'on the same screen' },
  online: { es: 'Online', en: 'Online' },
  onlineSub: { es: 'con reloj, tablas y revancha', en: 'with clock, draws and rematch' },
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
  ruleset: { es: 'Reglamento', en: 'Ruleset' },
  rClasicas: { es: 'Clásicas', en: 'Classic' },
  rEspanolas: { es: 'Españolas', en: 'Spanish' },
  rInglesas: { es: 'Inglesas', en: 'English' },
  rHelp: {
    clasicas: { es: 'Dama voladora, los peones comen también para atrás y hay que comer la mayor cantidad de fichas (damas brasileñas).', en: 'Flying kings, men also capture backwards and you must take the most pieces (Brazilian draughts).' },
    espanolas: { es: 'Dama voladora, los peones comen solo hacia adelante y hay que comer la mayor cantidad de fichas.', en: 'Flying kings, men capture forward only and you must take the most pieces.' },
    inglesas: { es: 'La dama avanza de a un paso, los peones comen solo hacia adelante y, si hay varias capturas, elegís cuál.', en: 'Kings move one step, men capture forward only and you choose among captures.' },
  },
  level: { es: 'Nivel', en: 'Level' },
  levels: { es: ['Novato', 'Fácil', 'Medio', 'Difícil', 'Experto'], en: ['Rookie', 'Easy', 'Medium', 'Hard', 'Expert'] },
  levelHelp: {
    es: ['Se distrae seguido y se deja comer. Para aprender.', 'Mira un par de jugadas y todavía comete errores.', 'Juega ordenado: aprovecha lo que regalás.', 'Calcula varias jugadas por delante. Hay que pensar.', 'Piensa a fondo y no perdona. Suerte.'],
    en: ['Gets distracted and gives pieces away. To learn.', 'Looks a couple of moves ahead and still slips.', 'Plays soundly: punishes what you give.', 'Calculates many moves ahead. Think carefully.', 'Thinks deep and never forgives. Good luck.'],
  },
  color: { es: 'Tus fichas', en: 'Your pieces' },
  white: { es: 'Blancas', en: 'White' },
  black: { es: 'Negras', en: 'Black' },
  random: { es: 'Al azar', en: 'Random' },
  autoFlip: { es: 'Girar el tablero en cada turno', en: 'Flip the board each turn' },
  yes: { es: 'Sí', en: 'Yes' },
  no: { es: 'No', en: 'No' },
  go: { es: '¡A jugar!', en: 'Let’s play!' },
  back: { es: '← volver', en: '← back' },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'Seguir', en: 'Resume' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  menu: { es: 'Menú', en: 'Menu' },
  showMoves: { es: 'Mostrar jugadas posibles', en: 'Show possible moves' },
  mustHint: { es: 'Marcar las fichas que deben comer', en: 'Mark pieces that must capture' },
  continue: { es: 'Continuar partida', en: 'Continue game' },
  contSub: { es: '{r} · vs compu {l} · jugada {n}', en: '{r} · vs CPU {l} · move {n}' },
  contSubLocal: { es: '{r} · de a dos · jugada {n}', en: '{r} · two players · move {n}' },
  rulesTitle: { es: 'Cómo se juega', en: 'How to play' },
  gotIt: { es: '¡Entendido!', en: 'Got it!' },
  moves: { es: 'Jugadas', en: 'Moves' },
  live: { es: 'En vivo', en: 'Live' },
  // partida
  you: { es: 'Vos', en: 'You' },
  cpuName: { es: 'Compu · {l}', en: 'CPU · {l}' },
  yourTurn: { es: 'Tu turno', en: 'Your turn' },
  turnOf: { es: 'Juegan las {c}', en: '{c} to move' },
  cWhite: { es: 'blancas', en: 'White' },
  cBlack: { es: 'negras', en: 'Black' },
  thinking: { es: 'Pensando…', en: 'Thinking…' },
  waitMove: { es: 'Esperando su jugada…', en: 'Waiting for the move…' },
  mustCapture: { es: '¡Tenés que comer!', en: 'You must capture!' },
  mustToast: { es: 'Hay que comer: elegí una ficha marcada', en: 'You must capture: pick a marked piece' },
  noMoves: { es: 'Esa ficha no tiene jugadas', en: 'That piece has no moves' },
  pieces: { es: '{n} fichas', en: '{n} pieces' },
  piece1: { es: '1 ficha', en: '1 piece' },
  king1: { es: '1 dama', en: '1 king' },
  away: { es: 'Se desconectó…', en: 'Disconnected…' },
  piecesK: { es: '{n} fichas · {k} damas', en: '{n} pieces · {k} kings' },
  piecesK1: { es: '{n} fichas · 1 dama', en: '{n} pieces · 1 king' },
  undo: { es: 'Deshacer', en: 'Undo' },
  hint: { es: 'Pista', en: 'Hint' },
  flip: { es: 'Girar', en: 'Flip' },
  draw: { es: 'Tablas', en: 'Draw' },
  acceptDraw: { es: 'Aceptar tablas', en: 'Accept draw' },
  drawSent: { es: 'Tablas ofrecidas', en: 'Draw offered' },
  resign: { es: 'Rendirse', en: 'Resign' },
  confirm: { es: 'Tocá de nuevo para confirmar', en: 'Tap again to confirm' },
  review: { es: 'Repasar la partida', en: 'Review the game' },
  again: { es: 'Otra partida', en: 'Play again' },
  rematch: { es: 'Revancha', en: 'Rematch' },
  acceptRematch: { es: 'Aceptar revancha', en: 'Accept rematch' },
  rivalLeft: { es: 'Tu rival se fue', en: 'Your rival left' },
  rematchSent: { es: 'Esperando a tu rival…', en: 'Waiting for your rival…' },
  rematchAsked: { es: '¡Tu rival quiere la revancha!', en: 'Your rival wants a rematch!' },
  drawAsked: { es: '{n} ofrece tablas', en: '{n} offers a draw' },
  drawDeclined: { es: 'Tu rival rechazó las tablas', en: 'Your rival declined the draw' },
  cpuDeclines: { es: 'La compu no acepta: todavía ve cómo ganar', en: 'The computer declines: it still sees a way to win' },
  cpuAccepts: { es: 'La compu acepta las tablas', en: 'The computer accepts the draw' },
  hintNone: { es: 'No encuentro nada mejor', en: 'Nothing better to suggest' },
  // fin
  youWin: { es: '¡Ganaste!', en: 'You won!' },
  youLose: { es: 'Perdiste', en: 'You lost' },
  drawn: { es: 'Tablas', en: 'Draw' },
  winWhite: { es: 'Ganan las blancas', en: 'White wins' },
  winBlack: { es: 'Ganan las negras', en: 'Black wins' },
  nameWins: { es: 'Gana {n}', en: '{n} wins' },
  endWiped: { es: '{c} se quedó sin fichas', en: '{c} has no pieces left' },
  endBlocked: { es: '{c} no tiene jugadas', en: '{c} has no moves' },
  endTimeout: { es: 'Se acabó el tiempo de {c}', en: '{c} ran out of time' },
  endResign: { es: '{n} se rindió', en: '{n} resigned' },
  endResignYou: { es: 'Te rendiste', en: 'You resigned' },
  endAbandon: { es: '{n} abandonó la partida', en: '{n} left the game' },
  endAgreement: { es: 'Tablas por acuerdo', en: 'Draw by agreement' },
  endRepetition: { es: 'Tablas: la misma posición tres veces', en: 'Draw: same position three times' },
  endFifty: { es: 'Tablas: 20 jugadas de cada uno sin captura ni avance de peones', en: 'Draw: 20 moves each without a capture or a man move' },
  endMaterial: { es: 'Tablas: una dama contra una no alcanza para ganar', en: 'Draw: king against king cannot win' },
  endAborted: { es: 'Partida anulada: nadie jugó a tiempo', en: 'Game aborted: nobody moved in time' },
  wins: { es: 'Ganadas', en: 'Won' },
  losses: { es: 'Perdidas', en: 'Lost' },
  draws: { es: 'Tablas', en: 'Draws' },
  // rutas
  rules: {
    es: `<p><b>Objetivo:</b> capturar todas las fichas del rival o dejarlo sin jugadas posibles.</p>
<h3>Cómo se mueven</h3>
<ul>
<li>Se juega sobre las casillas oscuras. Empiezan las blancas.</li>
<li>Los <b>peones</b> avanzan una casilla en diagonal hacia adelante.</li>
<li>Al llegar a la última fila el peón se <b>corona</b> y pasa a ser dama.</li>
<li>La <b>dama</b> se mueve en diagonal hacia adelante y hacia atrás: todas las casillas que quiera en las clásicas y las españolas, de a una en las inglesas.</li>
</ul>
<h3>Capturas</h3>
<ul>
<li>Se come saltando una ficha rival que está pegada, hacia la casilla vacía de atrás. La dama voladora salta desde lejos y puede caer en cualquier casilla libre después de la ficha.</li>
<li><b>Comer es obligatorio.</b> Si con la misma ficha podés seguir comiendo, tenés que seguir: toda la cadena es una sola jugada.</li>
<li>Las fichas comidas salen del tablero al terminar la jugada, y no se puede saltar dos veces la misma.</li>
<li>Si hay varias formas de comer, en las clásicas y las españolas tenés que elegir la que se lleva más fichas.</li>
<li>Si un peón llega al fondo comiendo y puede seguir, en las clásicas sigue como peón; en las otras la jugada termina y se corona.</li>
</ul>
<h3>Fin de la partida</h3>
<ul>
<li>Ganás si el rival se queda sin fichas o sin jugadas.</li>
<li>Son tablas por acuerdo, si se repite tres veces la misma posición, si pasan 20 jugadas de cada uno sin captura ni avance de peones, o si quedan una dama contra una.</li>
</ul>
<h3>Los reglamentos</h3>
<table><tr><th></th><th>Clásicas</th><th>Españolas</th><th>Inglesas</th></tr>
<tr><td>Dama voladora</td><td class="y">sí</td><td class="y">sí</td><td class="n">no</td></tr>
<tr><td>El peón come para atrás</td><td class="y">sí</td><td class="n">no</td><td class="n">no</td></tr>
<tr><td>Hay que comer más fichas</td><td class="y">sí</td><td class="y">sí</td><td class="n">no</td></tr></table>`,
    en: `<p><b>Goal:</b> capture all of your rival’s pieces or leave them without a legal move.</p>
<h3>Moving</h3>
<ul>
<li>You play on the dark squares. White moves first.</li>
<li><b>Men</b> move one square diagonally forward.</li>
<li>A man that reaches the far row is <b>crowned</b> and becomes a king.</li>
<li><b>Kings</b> move diagonally forward and backward: any distance in Classic and Spanish, one step in English.</li>
</ul>
<h3>Captures</h3>
<ul>
<li>You capture by jumping an adjacent enemy piece onto the empty square behind it. A flying king jumps from a distance and may land on any free square past the piece.</li>
<li><b>Capturing is mandatory.</b> If the same piece can keep capturing it must: the whole chain is a single move.</li>
<li>Captured pieces leave the board when the move ends, and no piece can be jumped twice.</li>
<li>When there are several ways to capture, in Classic and Spanish you must take the one that wins the most pieces.</li>
<li>If a man reaches the far row while capturing and can go on, in Classic it carries on as a man; in the others the move ends and it is crowned.</li>
</ul>
<h3>End of the game</h3>
<ul>
<li>You win when your rival has no pieces or no legal move.</li>
<li>It is a draw by agreement, by threefold repetition, after 20 moves each without a capture or a man move, or with king against king.</li>
</ul>
<h3>The rulesets</h3>
<table><tr><th></th><th>Classic</th><th>Spanish</th><th>English</th></tr>
<tr><td>Flying king</td><td class="y">yes</td><td class="y">yes</td><td class="n">no</td></tr>
<tr><td>Men capture backwards</td><td class="y">yes</td><td class="n">no</td><td class="n">no</td></tr>
<tr><td>Must take the most pieces</td><td class="y">yes</td><td class="y">yes</td><td class="n">no</td></tr></table>`,
  },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (typeof s === 'string' && v) for (const x in v) s = s.replaceAll(`{${x}}`, v[x]);
  return s;
};
const lang = () => G.prefs?.lang || 'es';
const levelName = (l) => TXT.levels[lang()]?.[l - 1] || TXT.levels.es[l - 1];
const ruleName = (r) => t({ clasicas: 'rClasicas', espanolas: 'rEspanolas', inglesas: 'rInglesas' }[r]);
const ruleHelp = (r) => G.t(TXT.rHelp[r]);

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
const OPTS = load(KEY.prefs, { rules: 'clasicas', level: 3, color: 2, autoFlip: 0, hints: 1, must: 1, tc: '5+0' });
if (!RULE_IDS.includes(OPTS.rules)) OPTS.rules = 'clasicas';
const savePrefs = () => store(KEY.prefs, OPTS);

// ---------------------------------------------------------------- estado
const S = {
  mode: null, // 'cpu' | 'local' | 'online'
  rules: 'clasicas',
  level: 3,
  me: WHITE, // mi color (compu y online)
  flip: false, // negras abajo
  autoFlip: false,
  pos: null,
  moves: [],
  legal: [],
  sel: -1,
  prefix: [],
  busy: false,
  thinking: false,
  over: null,
  view: null, // índice del repaso (null = en vivo)
  viewPos: null,
  last: null, // última jugada hecha
  hint: null,
  names: ['', ''],
  clock: null,
  req: 0,
  paused: false,
  arm: null,
  salt: 0,
  n: 0, // número de partida online
  again: [],
  draw: null,
  away: false,
  cell: 44,
};
let online = null;
let quick = false;
let quickHost = false;

// ---------------------------------------------------------------- sonidos
const sfx = {
  move: () => {
    noise(0.05, { freq: 900, q: 3, vol: 0.13 });
    tone(240, 150, 0.07, { type: 'triangle', vol: 0.09 });
  },
  capture: () => {
    noise(0.08, { freq: 600, q: 2, vol: 0.17 });
    tone(190, 90, 0.14, { type: 'triangle', vol: 0.11 });
  },
  crown: () => notes([523.25, 659.25, 783.99, 1046.5], { step: 0.07, dur: 0.2, type: 'triangle', vol: 0.08 }),
  select: () => tone(700, 840, 0.04, { type: 'square', vol: 0.025 }),
  err: () => tone(200, 150, 0.14, { type: 'square', vol: 0.05 }),
  turn: () => notes([660, 880], { step: 0.07, dur: 0.1, vol: 0.05 }),
  win: () => notes([523.25, 659.25, 783.99, 1046.5, 1318.5], { step: 0.1, dur: 0.3, type: 'triangle', vol: 0.09 }),
  lose: () => notes([440, 370, 294], { step: 0.12, dur: 0.24, type: 'triangle', vol: 0.05 }),
  draw: () => notes([523.25, 523.25], { step: 0.14, dur: 0.22, type: 'triangle', vol: 0.06 }),
  ui: () => tone(900, 640, 0.045, { type: 'square', vol: 0.035 }),
};

// ---------------------------------------------------------------- pantallas
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  G.gameplay(!id && !!S.mode);
}
const screenOpen = () => $$('.screen.on').length > 0;
const setPlaying = (on) => document.body.classList.toggle('playing', on);
function toast(text, ms = 1700) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast.tm);
  toast.tm = setTimeout(() => (el.hidden = true), ms);
}

// ---------------------------------------------------------------- tablero
const sqEl = new Array(64).fill(null);
let pieceEls = new Array(64).fill(null);
const CROWN = '<svg class="crown" viewBox="0 0 24 24"><path d="M3 18 2 7l5.2 4.2L12 3.5l4.8 7.7L22 7l-1 11z" fill="#ffc93c" stroke="#7a4a00" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 20.5h16" stroke="#7a4a00" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="3.5" r="1.4" fill="#fff3b0" stroke="#7a4a00" stroke-width="1"/></svg>';

/** Posición en pantalla (x a la derecha, y hacia abajo) de una casilla, según hacia dónde mira el tablero. */
const xy = (s) => (S.flip ? { x: 7 - colOf(s), y: rowOf(s) } : { x: colOf(s), y: 7 - rowOf(s) });
const sqAt = (x, y) => (S.flip ? y * 8 + (7 - x) : (7 - y) * 8 + x);

function buildSquares() {
  const box = $('squares');
  box.innerHTML = '';
  for (let i = 0; i < 64; i++) {
    const el = document.createElement('div');
    const x = i % 8;
    const y = i >> 3;
    el.className = `sq${(x + y) % 2 ? ' d' : ''}`;
    box.appendChild(el);
  }
  labelSquares();
}
function labelSquares() {
  const els = $('squares').children;
  for (let i = 0; i < 64; i++) {
    const x = i % 8;
    const y = i >> 3;
    const s = sqAt(x, y);
    const el = els[i];
    el.dataset.s = s;
    sqEl[s] = el;
    el.querySelectorAll('.co').forEach((n) => n.remove());
    if (y === 7) el.insertAdjacentHTML('beforeend', `<span class="co f">${'abcdefgh'[colOf(s)]}</span>`);
    if (x === 0) el.insertAdjacentHTML('beforeend', `<span class="co r">${rowOf(s) + 1}</span>`);
  }
}
function place(el, s, instant = false) {
  const { x, y } = xy(s);
  if (instant) el.classList.add('fast');
  el.style.transform = `translate(${x * S.cell}px, ${y * S.cell}px)`;
  if (instant) {
    el.offsetWidth; // fuerza el estilo antes de volver a animar
    el.classList.remove('fast');
  }
}
function makePiece(v) {
  const el = document.createElement('div');
  el.className = `pc ${sideOf(v) === WHITE ? 'w' : 'b'}`;
  el.innerHTML = `<div class="p">${isKing(v) ? CROWN : ''}</div>`;
  if (isKing(v)) el.classList.add('k');
  return el;
}
/** Dibuja las fichas de una posición de cero (sin animación). */
function buildPieces(pos) {
  const layer = $('pieces');
  layer.innerHTML = '';
  pieceEls = new Array(64).fill(null);
  for (let s = 0; s < 64; s++) {
    const v = pos.b[s];
    if (!v) continue;
    const el = makePiece(v);
    layer.appendChild(el);
    place(el, s, true);
    pieceEls[s] = el;
  }
}
function layoutPieces() {
  for (let s = 0; s < 64; s++) if (pieceEls[s]) place(pieceEls[s], s, true);
}
function removePiece(s, from) {
  const el = pieceEls[s];
  if (!el) return;
  pieceEls[s] = null;
  const a = xy(from ?? s);
  const b = xy(s);
  el.style.setProperty('--ox', `${Math.sign(b.x - a.x) * S.cell * 0.5}px`);
  el.style.setProperty('--oy', `${Math.sign(b.y - a.y) * S.cell * 0.5}px`);
  el.classList.remove('ghost', 'must', 'sel');
  el.classList.add('out');
  setTimeout(() => el.remove(), 320);
}
function crownPiece(el) {
  el.classList.add('k', 'crowned');
  el.querySelector('.p').insertAdjacentHTML('beforeend', CROWN);
  sfx.crown();
  setTimeout(() => el.classList.remove('crowned'), 800);
}
const hopMs = () => (document.documentElement.classList.contains('reduced') ? 1 : 270);

/** Anima una jugada: la ficha salta casilla por casilla y las comidas desaparecen al ser saltadas. `from`: saltos que ya se vieron (selección en curso). */
async function animateMove(m, { quick: fast = false, from = 1 } = {}) {
  const el = pieceEls[m.path[from - 1]] || pieceEls[m.from];
  if (!el) return;
  if (fast) {
    for (const c of m.caps) removePiece(c);
    pieceEls[m.path[from - 1]] = null;
    pieceEls[m.to] = el;
    place(el, m.to, true);
    if (m.crown) el.classList.add('k'), el.querySelector('.p').insertAdjacentHTML('beforeend', CROWN);
    return;
  }
  pieceEls[m.path[from - 1]] = null;
  for (let i = 0; i < from - 1; i++) removePiece(m.caps[i], m.path[i]);
  el.classList.remove('sel');
  el.style.zIndex = 3;
  for (let i = from; i < m.path.length; i++) {
    place(el, m.path[i]);
    m.caps.length ? setTimeout(sfx.move, hopMs() * 0.7) : sfx.move();
    await sleep(hopMs());
    if (m.caps.length) {
      removePiece(m.caps[i - 1], m.path[i]);
      sfx.capture();
      await sleep(70);
    }
  }
  el.style.zIndex = '';
  pieceEls[m.to] = el;
  if (m.crown) crownPiece(el);
}

// ---------------------------------------------------------------- marcas del tablero
function clearMarks(...cls) {
  for (const s of DARK_SQ) sqEl[s]?.classList.remove(...cls);
}
const DARK_SQ = Array.from({ length: 64 }, (_, i) => i).filter(isDark);
function markLast() {
  clearMarks('last');
  if (S.view === null) {
    if (S.last) for (const s of [S.last.from, ...S.last.path.slice(1)]) sqEl[s].classList.add('last');
  } else if (S.view > 0) {
    const r = replay(S.moves.slice(0, S.view), S.rules);
    const m = r && fromPrev(S.view);
    if (m) for (const s of m.path) sqEl[s].classList.add('last');
  }
}
/** Camino de la jugada número n (1…), para resaltarla al repasar. */
function fromPrev(n) {
  const r = replay(S.moves.slice(0, n - 1), S.rules);
  return r ? fromStr(r.pos.moves(), S.moves[n - 1]) : null;
}
function mustSet() {
  const set = new Set();
  if (S.legal.length && S.legal[0].caps.length) for (const m of S.legal) set.add(m.from);
  return set;
}
/** Resalta fichas obligadas, la selección y los destinos. */
function markSelection() {
  clearMarks('sel', 'dest', 'cap');
  for (const s of DARK_SQ) pieceEls[s]?.classList.remove('sel', 'must');
  if (!canInput()) return;
  if (S.sel < 0) {
    if (OPTS.must) for (const s of mustSet()) pieceEls[s]?.classList.add('must');
    return;
  }
  const cur = S.prefix[S.prefix.length - 1];
  sqEl[S.sel].classList.add('sel');
  pieceEls[cur]?.classList.add('sel');
  if (!OPTS.hints) return;
  const cand = withPrefix(S.legal, S.prefix);
  const isCap = cand[0]?.caps.length > 0;
  for (const next of new Set(cand.map((m) => m.path[S.prefix.length]))) {
    sqEl[next].classList.add('dest');
    if (isCap) sqEl[next].classList.add('cap');
  }
}
function clearHint() {
  clearTimeout(clearHint.tm);
  clearMarks('hintA', 'hintB');
  S.hint = null;
}
function showHint(m) {
  clearHint();
  S.hint = m;
  m.path.forEach((s, i) => sqEl[s].classList.add(i === 0 ? 'hintA' : 'hintB'));
  clearHint.tm = setTimeout(clearHint, 6000);
}

// ---------------------------------------------------------------- entrada
const displayPos = () => (S.view === null ? S.pos : S.viewPos);
const humanTurn = () => !S.over && S.view === null && S.pos && (S.mode === 'local' || ((S.mode === 'cpu' || S.mode === 'online') && S.pos.turn === S.me));
function canInput() {
  return humanTurn() && !S.busy && !S.thinking && !screenOpen();
}
function squareFromEvent(e) {
  const r = $('squares').getBoundingClientRect();
  const x = Math.floor(((e.clientX - r.left) / r.width) * 8);
  const y = Math.floor(((e.clientY - r.top) / r.height) * 8);
  return x < 0 || y < 0 || x > 7 || y > 7 ? -1 : sqAt(x, y);
}
function resetSelectionVisual() {
  // vuelve la ficha a su casilla si había una captura a medias
  if (S.sel >= 0 && S.prefix.length > 1) {
    const cur = S.prefix[S.prefix.length - 1];
    const el = pieceEls[cur];
    if (el) {
      pieceEls[cur] = null;
      pieceEls[S.sel] = el;
      place(el, S.sel);
    }
    for (const s of DARK_SQ) pieceEls[s]?.classList.remove('ghost');
  }
  S.sel = -1;
  S.prefix = [];
}
function select(s) {
  resetSelectionVisual();
  S.sel = s;
  S.prefix = [s];
  sfx.select();
  markSelection();
}
function advance(s) {
  S.prefix.push(s);
  const cand = withPrefix(S.legal, S.prefix);
  if (cand.length === 1) return commitHuman(cand[0], S.prefix.length - 1);
  // todavía hay caminos distintos: la ficha salta y se sigue eligiendo
  const prev = S.prefix[S.prefix.length - 2];
  const el = pieceEls[prev];
  pieceEls[prev] = null;
  pieceEls[s] = el;
  place(el, s);
  sfx.move();
  const hops = S.prefix.length - 1;
  cand[0].caps.slice(0, hops).forEach((c) => pieceEls[c]?.classList.add('ghost'));
  markSelection();
}
async function commitHuman(m, from) {
  S.sel = -1;
  S.prefix = [];
  if (S.mode === 'online') online?.send({ t: 'move', m: moveStr(m) });
  await playMove(m, { from });
}
function onBoardClick(e) {
  unlock();
  if (S.view !== null || S.over || screenOpen()) return;
  clearHint();
  if (!canInput()) return;
  const s = squareFromEvent(e);
  if (s < 0) return;
  if (S.sel >= 0) {
    const cand = withPrefix(S.legal, S.prefix);
    if (cand.some((m) => m.path[S.prefix.length] === s)) return advance(s);
  }
  const v = S.pos.b[s];
  if (v && sideOf(v) === S.pos.turn) {
    if (S.legal.some((m) => m.from === s)) return select(s);
    sfx.err();
    toast(mustSet().size ? t('mustToast') : t('noMoves'));
    return;
  }
  if (S.sel >= 0) {
    resetSelectionVisual();
    markSelection();
  }
}
$('board').addEventListener('click', onBoardClick);

// ---------------------------------------------------------------- jugar
async function playMove(m, { quick: fast = false, from = 1 } = {}) {
  S.busy = true;
  clearHint();
  S.pos.make(m);
  S.moves.push(moveStr(m));
  S.last = m;
  if (S.view !== null) {
    // se está repasando: la partida sigue por detrás, sin animar
    S.busy = false;
    S.legal = S.pos.moves();
    afterMove(false);
    return;
  }
  markLast();
  renderMoves();
  refresh();
  await animateMove(m, { quick: fast, from });
  S.busy = false;
  S.legal = S.pos.moves();
  afterMove(true);
}
function afterMove(animated) {
  const st = S.pos.status(S.legal);
  saveGame();
  refresh();
  if (S.mode === 'online') {
    if (S.moves.length && S.pos.turn === S.me && animated) sfx.turn();
    if (!pulling) pullMoves();
    return;
  }
  if (st.over) return endGame(st);
  if (S.mode === 'local' && S.autoFlip) setTimeout(() => S.mode === 'local' && !S.over && setFlip(S.pos.turn === BLACK), 350);
  if (S.mode === 'cpu' && S.pos.turn !== S.me) cpuMove();
  else if (S.mode === 'cpu') sfx.turn();
}
function setFlip(f) {
  if (S.flip === f) return;
  S.flip = f;
  labelSquares();
  layoutPiecesAnimated();
  markLast();
  markSelection();
  refresh();
}
function layoutPiecesAnimated() {
  for (let s = 0; s < 64; s++) if (pieceEls[s]) place(pieceEls[s], s);
}

function newPosition() {
  S.pos = new Position(S.rules, true);
  S.moves = [];
  S.legal = S.pos.moves();
  S.sel = -1;
  S.prefix = [];
  S.over = null;
  S.view = null;
  S.viewPos = null;
  S.last = null;
  S.busy = false;
  S.thinking = false;
  S.clock = null;
  S.draw = null;
  S.req++;
  clearHint();
  buildPieces(S.pos);
  markLast();
  markSelection();
}

function startGame(mode, opts) {
  S.mode = mode;
  S.rules = opts.rules;
  S.level = opts.level || 3;
  S.me = mode === 'local' ? WHITE : (opts.me ?? WHITE);
  S.autoFlip = !!opts.autoFlip;
  S.salt = (Math.random() * 1e9) | 0;
  S.flip = mode !== 'local' && S.me === BLACK;
  S.names = mode === 'cpu' ? (S.me === WHITE ? [t('you'), t('cpuName', { l: levelName(S.level) })] : [t('cpuName', { l: levelName(S.level) }), t('you')]) : [t('white').replace(/^./, (c) => c.toUpperCase()), t('black').replace(/^./, (c) => c.toUpperCase())];
  labelSquares();
  newPosition();
  setPlaying(true);
  show(null);
  refresh();
  renderMoves();
  if (mode === 'cpu' && S.me === BLACK) cpuMove();
  saveGame();
}
function startCpu() {
  const color = OPTS.color === 2 ? (Math.random() < 0.5 ? WHITE : BLACK) : OPTS.color;
  startGame('cpu', { rules: OPTS.rules, level: OPTS.level, me: color });
}
function startLocal() {
  startGame('local', { rules: OPTS.rules, autoFlip: OPTS.autoFlip });
}

function saveGame() {
  if (S.mode !== 'cpu' && S.mode !== 'local') return;
  if (S.over || !S.moves.length) {
    try {
      localStorage.removeItem(KEY.save);
    } catch {}
    return;
  }
  store(KEY.save, { mode: S.mode, rules: S.rules, level: S.level, me: S.me, autoFlip: S.autoFlip, flip: S.flip, moves: S.moves, salt: S.salt });
}
function readSave() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY.save));
    if (!s || !Array.isArray(s.moves) || !s.moves.length || !RULE_IDS.includes(s.rules)) return null;
    return s;
  } catch {
    return null;
  }
}
function resumeSaved() {
  const s = readSave();
  if (!s) return;
  const r = replay(s.moves, s.rules);
  if (!r) return localStorage.removeItem(KEY.save);
  S.mode = s.mode;
  S.rules = s.rules;
  S.level = s.level || 3;
  S.me = s.me ?? WHITE;
  S.autoFlip = !!s.autoFlip;
  S.salt = s.salt || 0;
  S.flip = !!s.flip;
  S.names = s.mode === 'cpu' ? (S.me === WHITE ? [t('you'), t('cpuName', { l: levelName(S.level) })] : [t('cpuName', { l: levelName(S.level) }), t('you')]) : [t('white').replace(/^./, (c) => c.toUpperCase()), t('black').replace(/^./, (c) => c.toUpperCase())];
  S.pos = r.pos;
  S.moves = s.moves.slice();
  S.legal = S.pos.moves();
  S.last = r.made[r.made.length - 1] || null;
  S.sel = -1;
  S.prefix = [];
  S.over = null;
  S.view = null;
  S.req++;
  labelSquares();
  buildPieces(S.pos);
  markLast();
  markSelection();
  setPlaying(true);
  show(null);
  refresh();
  renderMoves();
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
/** Le pide una jugada al worker; si no hay worker, piensa acá (con el mismo motor). */
async function ask(payload) {
  const w = ensureWorker();
  if (w) {
    const id = ++reqId;
    const res = await new Promise((resolve) => {
      pending.set(id, resolve);
      w.postMessage({ id, rules: S.rules, ...payload });
    });
    if (res) return res;
  }
  engineLib ||= await import('./shared/engine.js');
  const r = replay(payload.moves, S.rules);
  if (!r) return { move: null };
  const eng = (ask.eng ||= new engineLib.Engine());
  const o = payload.hint ? { depth: 12, time: 900, noise: 0 } : payload.eval ? { depth: 9, time: 500, noise: 0 } : { ...engineLib.LEVELS[payload.level] };
  await sleep(20);
  const res = eng.think(r.pos, { ...o, salt: payload.salt });
  return { move: res.move ? moveStr(res.move) : null, score: res.score, depth: res.depth };
}
async function cpuMove() {
  if (S.mode !== 'cpu' || S.over || S.pos.turn === S.me || S.thinking) return;
  const my = ++S.req;
  S.thinking = true;
  refresh();
  const t0 = performance.now();
  const r = await ask({ moves: S.moves.slice(), level: S.level, salt: S.salt });
  await sleep(Math.max(0, 480 - (performance.now() - t0)));
  while (S.paused || screenOpen() || S.busy) {
    if (my !== S.req) return;
    await sleep(120);
  }
  if (my !== S.req || S.mode !== 'cpu' || S.over) return;
  S.thinking = false;
  let m = r && r.move ? fromStr(S.legal, r.move) : null;
  if (!m) m = S.legal[Math.floor(Math.random() * S.legal.length)];
  await playMove(m);
}

// ---------------------------------------------------------------- fin de la partida
const statsKey = () => `${S.rules}:${S.level}`;
function endGame(res) {
  if (S.over) return;
  S.over = res;
  S.sel = -1;
  S.prefix = [];
  S.thinking = false;
  S.req++;
  localStorage.removeItem(KEY.save);
  clearHint();
  markSelection();
  refresh();
  const mine = S.mode === 'local' ? -2 : S.me;
  const win = res.winner !== null && res.winner === mine;
  const lose = res.winner !== null && mine >= 0 && res.winner !== mine;
  if (S.mode === 'cpu') {
    const all = load(KEY.stats, {});
    const k = statsKey();
    const cur = all[k] || { w: 0, l: 0, d: 0 };
    if (win) cur.w++;
    else if (lose) cur.l++;
    else cur.d++;
    all[k] = cur;
    store(KEY.stats, all);
  }
  (win ? sfx.win : lose ? sfx.lose : sfx.draw)();
  // los perdedores quedan apagados
  if (res.winner !== null) {
    const loser = res.winner ^ 1;
    for (const s of DARK_SQ) if (S.pos.b[s] && sideOf(S.pos.b[s]) === loser) pieceEls[s]?.classList.add('end');
  }
  setTimeout(showOver, S.mode === 'online' ? 700 : 1100);
}
function endText(res) {
  const nm = (c) => S.names[c];
  const cn = (c) => t(c === WHITE ? 'cWhite' : 'cBlack');
  const loser = res.winner === null ? -1 : res.winner ^ 1;
  switch (res.reason) {
    case 'wiped':
      return t('endWiped', { c: cn(loser).replace(/^./, (x) => x.toUpperCase()) });
    case 'blocked':
      return t('endBlocked', { c: cn(loser).replace(/^./, (x) => x.toUpperCase()) });
    case 'timeout':
      return t('endTimeout', { c: cn(loser) });
    case 'resign':
      return S.mode === 'cpu' && loser === S.me ? t('endResignYou') : t('endResign', { n: S.mode === 'local' ? cn(loser).replace(/^./, (x) => x.toUpperCase()) : nm(loser) });
    case 'abandon':
      return t('endAbandon', { n: nm(loser) });
    case 'agreement':
      return t('endAgreement');
    case 'repetition':
      return t('endRepetition');
    case 'fifty':
      return t('endFifty');
    case 'material':
      return t('endMaterial');
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
  let kicker = '';
  if (res.winner === null) title = t('drawn');
  else if (S.mode === 'local') title = t(res.winner === WHITE ? 'winWhite' : 'winBlack');
  else if (res.winner === mine) title = t('youWin');
  else title = t('youLose');
  if (S.mode === 'cpu') kicker = `${ruleName(S.rules)} · ${levelName(S.level)}`;
  else kicker = ruleName(S.rules);
  $('over-kicker').textContent = kicker;
  $('over-title').textContent = title;
  $('over-sub').textContent = endText(res);
  const stats = $('over-stats');
  if (S.mode === 'cpu') {
    const c = load(KEY.stats, {})[statsKey()] || { w: 0, l: 0, d: 0 };
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
    buildPieces(S.pos);
    if (S.over) for (const s of DARK_SQ) if (S.pos.b[s] && S.over.winner !== null && sideOf(S.pos.b[s]) === (S.over.winner ^ 1)) pieceEls[s]?.classList.add('end');
  } else {
    i = Math.max(0, Math.min(n, i));
    S.view = i;
    const r = replay(S.moves.slice(0, i), S.rules);
    S.viewPos = r.pos;
    buildPieces(S.viewPos);
  }
  clearHint();
  markLast();
  markSelection();
  renderMoves();
  refresh();
}
function exitReview() {
  if (S.over) {
    setView(null);
    showOver();
  } else setView(null);
}

// ---------------------------------------------------------------- barras, jugadas y acciones
const miniDisc = (c, k) => `<i class="${c === BLACK ? 'b' : ''}${k ? ' k' : ''}"></i>`;
function setBar(slot, c) {
  const p = displayPos();
  const me = p.count(c);
  const opp = p.count(c ^ 1);
  const lost = 12 - opp.total;
  $(`nm-${slot}`).textContent = S.names[c] || '';
  $(`disc-${slot}`).className = `disc${c === BLACK ? ' b' : ''}`;
  $(`cap-${slot}`).innerHTML = Array.from({ length: Math.min(12, lost) }, () => miniDisc(c ^ 1)).join('');
  const turn = !S.over && S.view === null && S.pos.turn === c && !!S.moves.length + 1;
  $(`bar-${slot}`).classList.toggle('turn', !!turn);
  let st = me.total === 1 ? (me.kings ? t('king1') : t('piece1')) : me.kings ? (me.kings === 1 ? t('piecesK1', { n: me.total }) : t('piecesK', { n: me.total, k: me.kings })) : t('pieces', { n: me.total });
  if (turn) {
    if (S.mode === 'cpu') st = S.pos.turn === S.me ? (S.legal[0]?.caps.length ? t('mustCapture') : t('yourTurn')) : t('thinking');
    else if (S.mode === 'online') st = S.pos.turn === S.me ? (S.legal[0]?.caps.length ? t('mustCapture') : t('yourTurn')) : S.away ? t('away') : t('waitMove');
    else st = S.legal[0]?.caps.length ? t('mustCapture') : t('turnOf', { c: t(c === WHITE ? 'cWhite' : 'cBlack') });
  }
  $(`st-${slot}`).textContent = st;
}
function refresh() {
  if (!S.pos) return;
  const topC = S.flip ? WHITE : BLACK;
  setBar('top', topC);
  setBar('bot', topC ^ 1);
  $('busy').hidden = !S.thinking;
  $('rule-tag').textContent = ruleName(S.rules);
  const showClock = S.mode === 'online' && !!S.clock;
  $('clk-top').hidden = !showClock;
  $('clk-bot').hidden = !showClock;
  renderActions();
  tickClocks();
}
function renderMoves() {
  const l = $('mlist');
  let html = '';
  const cur = S.view === null ? S.moves.length : S.view;
  for (let i = 0; i < S.moves.length; i += 2) {
    html += `<li class="n">${i / 2 + 1}.</li>`;
    for (const k of [i, i + 1]) {
      if (k >= S.moves.length) html += '<li class="mv"></li>';
      else html += `<li class="mv${S.moves[k].includes('x') ? ' x' : ''}${cur === k + 1 ? ' cur' : ''}" data-i="${k + 1}">${S.moves[k]}</li>`;
    }
  }
  l.innerHTML = html;
  l.querySelector('.cur')?.scrollIntoView({ block: 'nearest' });
  if (!l.querySelector('.cur')) l.scrollTop = l.scrollHeight;
}
$('mlist').addEventListener('click', (e) => {
  const li = e.target.closest('.mv[data-i]');
  if (!li) return;
  const i = Number(li.dataset.i);
  if (screenOpen()) return;
  if (S.mode === 'cpu' && S.thinking && i < S.moves.length) return;
  setView(i === S.moves.length ? (S.over ? i : null) : i);
});

const ICON = {
  undo: '<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/>',
  hint: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  flip: '<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  draw: '<path d="M5 9h14M5 15h14"/>',
  resign: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  menu: '<path d="M5 6h14M5 12h14M5 18h14"/>',
  again: '<path d="M21 12a9 9 0 11-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  review: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  first: '<path d="M6 5v14M19 5l-9 7 9 7z"/>',
  prev: '<path d="M16 5l-9 7 9 7z"/>',
  next: '<path d="M8 5l9 7-9 7z"/>',
  last: '<path d="M18 5v14M5 5l9 7-9 7z"/>',
  back: '<path d="M4 12h16M10 6l-6 6 6 6"/>',
};
function actionList() {
  const over = !!S.over;
  if (S.view !== null) {
    const n = S.moves.length;
    return [
      { k: 'first', dis: S.view <= 0 },
      { k: 'prev', dis: S.view <= 0 },
      { k: 'pos', label: `${S.view}/${n}` },
      { k: 'next', dis: S.view >= n },
      { k: 'last', dis: S.view >= n },
      { k: 'live', icon: 'back', label: over ? t('menu') : t('live') },
    ];
  }
  const list = [];
  const noMoves = S.moves.length < 1;
  if (S.mode === 'cpu') list.push({ k: 'undo', dis: noMoves || over || (S.me === BLACK && S.moves.length === 1) }, { k: 'hint', dis: over || S.thinking || S.busy || S.pos.turn !== S.me });
  if (S.mode === 'local') list.push({ k: 'undo', dis: noMoves || over });
  if (S.mode === 'online') {
    const offered = S.draw && S.draw === online?.myId;
    const asked = S.draw && S.draw !== online?.myId;
    list.push({ k: 'draw', dis: over || S.moves.length < 2 || offered, hot: asked, label: asked ? t('acceptDraw') : offered ? t('drawSent') : t('draw') });
  } else list.push({ k: 'draw', dis: over || noMoves });
  if (over) list.push({ k: 'again', icon: 'again', label: S.mode === 'online' ? t('rematch') : t('again') }, { k: 'review', dis: false });
  else list.push({ k: 'resign' });
  list.push({ k: 'flip' }, { k: 'menu', label: t('menu') });
  return list;
}
function renderActions() {
  const box = $('actions');
  const labels = { undo: t('undo'), hint: t('hint'), flip: t('flip'), draw: t('draw'), resign: t('resign'), menu: t('menu'), again: t('again'), review: t('review').split(' ')[0], first: '', prev: '', next: '', last: '' };
  box.innerHTML = actionList()
    .map((a) => {
      if (a.k === 'pos') return `<div class="act pos">${esc(a.label)}</div>`;
      const label = a.label ?? labels[a.k];
      const arm = S.arm === a.k;
      return `<button class="act${a.hot ? ' hot' : ''}${arm ? ' arm' : ''}" data-k="${a.k}"${a.dis ? ' disabled' : ''} aria-label="${esc(label || a.k)}"><svg viewBox="0 0 24 24">${ICON[a.icon || a.k] || ''}</svg>${label ? `<span>${esc(label)}</span>` : ''}</button>`;
    })
    .join('');
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
async function doAction(k) {
  if (k === 'menu') return pause();
  if (k === 'flip') return setFlip(!S.flip);
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
    else endGame({ winner: S.mode === 'cpu' ? S.me ^ 1 : S.pos.turn ^ 1, reason: 'resign' });
    return;
  }
  if (k === 'draw') {
    if (S.mode === 'online') {
      if (S.draw && S.draw !== online?.myId) online.send({ t: 'draw', a: 'accept' });
      else if (confirmTwice('draw')) online.send({ t: 'draw', a: 'offer' });
      return;
    }
    if (!confirmTwice('draw')) return;
    if (S.mode === 'local') return endGame({ winner: null, reason: 'agreement' });
    // la compu acepta si no se ve ganando
    const my = S.req;
    toast(t('thinking'), 900);
    const r = await ask({ moves: S.moves.slice(), eval: true, salt: S.salt });
    if (my !== S.req || S.over) return;
    const cpu = S.me ^ 1;
    const score = r?.score ?? 0; // desde el punto de vista de quien mueve
    const cpuScore = S.pos.turn === cpu ? score : -score;
    if (cpuScore <= 12 && S.moves.length >= 16) {
      toast(t('cpuAccepts'));
      endGame({ winner: null, reason: 'agreement' });
    } else toast(t('cpuDeclines'), 2400);
  }
}
async function doHint() {
  if (S.thinking || S.busy || !humanTurn()) return;
  S.thinking = true;
  const my = ++S.req;
  refresh();
  const r = await ask({ moves: S.moves.slice(), hint: true, salt: 0 });
  if (my !== S.req) return;
  S.thinking = false;
  refresh();
  const m = r?.move ? fromStr(S.legal, r.move) : null;
  if (m) {
    resetSelectionVisual();
    markSelection();
    showHint(m);
  } else toast(t('hintNone'));
}
function undo() {
  if (S.moves.length < 1 || S.busy) return;
  let drop = 1;
  if (S.mode === 'cpu') drop = S.pos.turn === S.me ? 2 : 1;
  drop = Math.min(drop, S.moves.length);
  const keep = S.moves.slice(0, S.moves.length - drop);
  const r = replay(keep, S.rules);
  if (!r) return;
  S.req++;
  S.thinking = false;
  S.pos = r.pos;
  S.moves = keep;
  S.legal = S.pos.moves();
  S.last = r.made[r.made.length - 1] || null;
  S.sel = -1;
  S.prefix = [];
  S.over = null;
  clearHint();
  buildPieces(S.pos);
  markLast();
  markSelection();
  renderMoves();
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
  const topC = S.flip ? WHITE : BLACK;
  for (const [slot, c] of [['top', topC], ['bot', topC ^ 1]]) {
    const el = $(`clk-${slot}`);
    const ms = clockOf(c);
    el.textContent = fmtClock(ms);
    el.classList.toggle('run', S.clock.running === c);
    el.classList.toggle('low', S.clock.running === c && ms < 15000);
  }
}
setInterval(tickClocks, 100);

// ---------------------------------------------------------------- pausa y menús
function pause() {
  if (!S.mode && !screenOpen()) return;
  syncSeg('p-hints', OPTS.hints);
  syncSeg('p-must', OPTS.must);
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
    $('cont-t').textContent = t('continue');
    $('cont-s').textContent = t(s.mode === 'cpu' ? 'contSub' : 'contSubLocal', { r: ruleName(s.rules), l: levelName(s.level || 3), n: Math.ceil(s.moves.length / 2) });
  }
}

function bindSeg(id, key, cb) {
  const seg = $(id);
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    OPTS[key] = isNaN(b.dataset.v) || key === 'rules' || key === 'tc' ? b.dataset.v : Number(b.dataset.v);
    savePrefs();
    syncSeg(id, OPTS[key]);
    cb?.();
  });
}
function syncSeg(id, v) {
  for (const b of $$('button', $(id))) b.classList.toggle('on', String(b.dataset.v) === String(v));
}
const helpRules = () => {
  $('o-rules-help').textContent = ruleHelp(OPTS.rules);
  $('l-rules-help').textContent = ruleHelp(OPTS.rules);
};
const helpLevel = () => ($('o-level-help').textContent = G.t(TXT.levelHelp)[OPTS.level - 1] || '');
const levelLabels = () => $$('#o-level button').forEach((b, i) => (b.textContent = `${i + 1} · ${levelName(i + 1)}`.replace(/^(\d) · /, '$1 ')));
bindSeg('o-rules', 'rules', helpRules);
bindSeg('o-level', 'level', helpLevel);
bindSeg('o-color', 'color');
bindSeg('l-rules', 'rules', helpRules);
bindSeg('l-flip', 'autoFlip');
bindSeg('p-hints', 'hints', () => markSelection());
bindSeg('p-must', 'must', () => markSelection());
function syncOpts() {
  syncSeg('o-rules', OPTS.rules);
  syncSeg('l-rules', OPTS.rules);
  syncSeg('o-level', OPTS.level);
  syncSeg('o-color', OPTS.color);
  syncSeg('l-flip', OPTS.autoFlip);
  helpRules();
  helpLevel();
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
          online.create(name, { public: true });
        }
      } else if (m.t === 'error') {
        quick = false;
        const txt = m.code === 'need_players' ? t('needPlayers') : netText(m.code);
        $('on-status').textContent = txt;
        $('lobby-status').textContent = txt;
        if (m.code === 'not_your_turn' && S.mode === 'online') resyncOnline();
      } else if (m.t === 'declined') toast(t('drawDeclined'), 2200);
      else if (m.t === 'closed' || m.t === 'kicked') {
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
  ensureOnline().create(myName());
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
  const g = online?.room?.damas;
  if (!g) return;
  const r = replay(g.moves, g.rules);
  if (!r) return;
  S.pos = r.pos;
  S.moves = g.moves.slice();
  S.legal = S.pos.moves();
  S.last = r.made[r.made.length - 1] || null;
  S.sel = -1;
  S.prefix = [];
  S.busy = false;
  buildPieces(S.pos);
  markLast();
  markSelection();
  renderMoves();
  refresh();
}
let pulling = false;
/** Pone al día las jugadas del rival (con animación) a partir de lo que dice el servidor. */
async function pullMoves() {
  if (pulling || S.mode !== 'online') return;
  pulling = true;
  try {
    for (;;) {
      const g = online?.room?.damas;
      if (!g || S.n !== g.n) return;
      if (g.moves.length < S.moves.length || g.moves.slice(0, S.moves.length).join() !== S.moves.join()) return resyncOnline();
      if (g.moves.length === S.moves.length || S.busy) return;
      const m = fromStr(S.pos.moves(), g.moves[S.moves.length]);
      if (!m) return resyncOnline();
      await playMove(m, { quick: g.moves.length - S.moves.length > 1 });
    }
  } finally {
    pulling = false;
  }
}
function applyRoom(room) {
  if (room.state === 'lobby' || !room.damas) {
    if (S.mode === 'online') {
      S.mode = null;
      S.pos = null;
      setPlaying(false);
    }
    applyLobby(room);
    return;
  }
  const g = room.damas;
  const myId = online.myId;
  const iAmWhite = g.white === myId;
  const nameOf = (id) => room.players.find((p) => p.id === id)?.name || '';
  if (S.mode !== 'online' || S.n !== g.n) {
    // partida nueva (o reconexión): se arma desde cero con las jugadas que ya hay
    S.mode = 'online';
    S.n = g.n;
    S.rules = g.rules;
    S.me = iAmWhite ? WHITE : BLACK;
    S.flip = S.me === BLACK;
    S.names = [nameOf(g.white), nameOf(g.black)];
    S.again = [];
    S.over = null;
    S.view = null;
    S.thinking = false;
    S.arm = null;
    labelSquares();
    const r = replay(g.moves, g.rules);
    S.pos = r ? r.pos : new Position(g.rules, true);
    S.moves = r ? g.moves.slice() : [];
    S.legal = S.pos.moves();
    S.last = r && r.made.length ? r.made[r.made.length - 1] : null;
    S.sel = -1;
    S.prefix = [];
    S.busy = false;
    clearHint();
    buildPieces(S.pos);
    markLast();
    setPlaying(true);
    show(null);
    renderMoves();
    if (!g.moves.length) sfx.turn();
  } else pullMoves();
  S.draw = g.draw;
  S.away = !room.players.find((p) => p.id !== myId)?.connected;
  S.clock = { c: g.clock.slice(), running: g.running, since: g.since };
  if (g.draw && g.draw !== myId && !S.over) toast(t('drawAsked', { n: nameOf(g.draw) }), 2600);
  const prevAgain = S.again;
  S.again = g.again || [];
  if (S.again.some((id) => id !== myId && !prevAgain.includes(id))) toast(t('rematchAsked'), 2600);
  if (g.result && !S.over) {
    S.over = { winner: g.result.winner, reason: g.result.reason, by: g.result.by };
    S.sel = -1;
    S.prefix = [];
    clearHint();
    markSelection();
    const mine = S.me;
    (S.over.winner === null ? sfx.draw : S.over.winner === mine ? sfx.win : sfx.lose)();
    if (S.over.winner !== null) for (const s of DARK_SQ) if (S.pos.b[s] && sideOf(S.pos.b[s]) === (S.over.winner ^ 1)) pieceEls[s]?.classList.add('end');
    setTimeout(showOver, 800);
  } else if (!g.result && S.over) {
    S.over = null;
  }
  if (S.over && document.querySelector('#s-over.on')) renderOverButtons();
  refresh();
  markSelection();
}

// ---------------------------------------------------------------- reglas
function renderRules() {
  $('rules-body').innerHTML = G.t(TXT.rules);
}

// ---------------------------------------------------------------- teclado
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
  else if (k === 'f') setFlip(!S.flip);
  else if (S.view !== null && k === 'arrowleft') setView(S.view - 1);
  else if (S.view !== null && k === 'arrowright') setView(S.view + 1);
  else if (S.view === null && S.over && k === 'arrowleft') setView(S.moves.length - 1);
});

// ---------------------------------------------------------------- tamaño
function measure() {
  const g = $('game');
  const W = g.clientWidth;
  const H = g.clientHeight;
  const land = matchMedia('(min-width: 820px) and (min-aspect-ratio: 13/10)').matches;
  const px = land ? Math.min(H - 14, W - 310 - 22 - 20) : Math.min(W - 16, H - 52 * 2 - 54 - 8 * 3 - 14);
  const c = Math.max(26, Math.floor(px / 8.52));
  if (c !== S.cell) {
    S.cell = c;
    g.style.setProperty('--c', `${c}px`);
    layoutPieces();
  }
}
new ResizeObserver(measure).observe($('game'));
G.onPause?.(() => (S.paused = true));
G.onResume?.(() => (S.paused = screenOpen() && !!document.querySelector('#s-pause.on')));

// ---------------------------------------------------------------- logo y arranque
function drawLogo() {
  $('logo').innerHTML = `<i class="lb"></i><i class="lp"></i><i class="lp b"></i><i class="lp">${CROWN}</i>`;
}
G.onPrefs((p) => {
  document.documentElement.lang = p.lang;
  document.documentElement.classList.toggle('reduced', !!p.reducedMotion);
  $$('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t)));
  levelLabels();
  renderRules();
  syncOpts();
  refreshHome();
  if (S.pos) {
    if (S.mode === 'cpu') S.names = S.me === WHITE ? [t('you'), t('cpuName', { l: levelName(S.level) })] : [t('cpuName', { l: levelName(S.level) }), t('you')];
    refresh();
  }
  if (online?.room && document.querySelector('#s-lobby.on')) applyLobby(online.room);
}, true);

drawLogo();
buildSquares();
measure();
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

if (DEBUG)
  window.__damas = {
    S,
    OPTS,
    get online() {
      return online;
    },
    startCpu,
    startLocal,
    startGame,
    playMove: (str) => playMove(fromStr(S.legal, str)),
    click: (name) => {
      const s = name.length === 2 ? name.charCodeAt(0) - 97 + (name.charCodeAt(1) - 49) * 8 : -1;
      const r = sqEl[s].getBoundingClientRect();
      onBoardClick({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
    },
    setView,
    toMenu,
    sqName,
    refresh,
    renderMoves,
    rules: RULE_IDS,
    /** Mesa armada a mano para escenas de prueba: rows como en Position.parse. */
    setup(rows, turn = WHITE, rules = 'clasicas', mode = 'local') {
      S.mode = mode;
      S.rules = rules;
      S.me = WHITE;
      S.flip = false;
      S.names = ['Blancas', 'Negras'];
      labelSquares();
      S.pos = Position.parse(rows, turn, rules, true);
      S.moves = [];
      S.legal = S.pos.moves();
      S.sel = -1;
      S.prefix = [];
      S.over = null;
      S.view = null;
      S.last = null;
      S.busy = false;
      S.thinking = false;
      buildPieces(S.pos);
      markLast();
      markSelection();
      setPlaying(true);
      show(null);
      refresh();
      renderMoves();
    },
  };
G.ready();
