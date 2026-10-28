/* Puntos y cajas — game.it
 * El de los cuadernos: se unen puntos con rayas y quien cierra una caja se la queda y juega de nuevo. Contra la compu (cinco niveles
 * que piensan en un worker), de a dos en la misma pantalla y online con reloj y revancha. Las reglas están en shared/rules.js (las
 * comparte el servidor) y la compu en shared/engine.js.
 */
import { Position, SIZES, geometry, fromStr, moveStr, replay } from './shared/rules.js';
import { OnlineRoom, netText, defaultName, share as shareRoom, roomFromUrl } from '/shared/online.js';
import { pickLobby } from '/shared/race-lobby.js';
import { tone, noise, notes, unlock } from '/shared/sfx.js';

const G = window.GameIt;
const ID = 'puntos';
const DEBUG = /[?&]debug\b/.test(location.search);
const $ = (id) => document.getElementById(id);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const P0 = 0;
const P1 = 1;

// ---------------------------------------------------------------- textos
const TXT = {
  title: { es: 'Puntos y cajas', en: 'Dots and Boxes' },
  tagline: { es: 'Uní los puntos, cerrá cajas y jugá otra vez.', en: 'Join the dots, close boxes and go again.' },
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
  sizeHelp: { es: '{b} cajas · {l} rayas', en: '{b} boxes · {l} lines' },
  level: { es: 'Nivel', en: 'Level' },
  levels: { es: ['Novato', 'Fácil', 'Medio', 'Difícil', 'Experto'], en: ['Rookie', 'Easy', 'Medium', 'Hard', 'Expert'] },
  levelHelp: {
    es: ['Traza rayas casi al azar y deja pasar cajas. Para aprender.', 'Cierra las cajas que puede y casi siempre evita regalarte.', 'No te regala si puede evitarlo y, cuando no hay opción, regala lo menos posible.', 'Cuida cuántas rayas seguras quedan para que seas vos quien tenga que abrir, y resuelve el final.', 'Calcula el final a fondo, incluso dejar dos cajas para quedarse con el control. Suerte.'],
    en: ['Draws lines almost at random and lets boxes slip. To learn.', 'Closes the boxes it can and almost always avoids giving you any.', 'Won’t give you boxes if it can avoid it and gives as little as possible otherwise.', 'Counts the safe lines left so that you are the one who has to open, and solves the endgame.', 'Calculates the endgame in depth, even leaving two boxes to keep control. Good luck.'],
  },
  first: { es: 'Quién empieza', en: 'Who starts' },
  meFirst: { es: 'Vos', en: 'You' },
  cpuFirst: { es: 'La compu', en: 'CPU' },
  random: { es: 'Al azar', en: 'Random' },
  yes: { es: 'Sí', en: 'Yes' },
  no: { es: 'No', en: 'No' },
  go: { es: '¡A jugar!', en: 'Let’s play!' },
  back: { es: '← volver', en: '← back' },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'Seguir', en: 'Resume' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  menu: { es: 'Menú', en: 'Menu' },
  showGuide: { es: 'Mostrar las rayas guía', en: 'Show guide lines' },
  continue: { es: 'Continuar partida', en: 'Continue game' },
  contSub: { es: 'vs compu {l} · {s} · {n} rayas', en: 'vs CPU {l} · {s} · {n} lines' },
  contSubLocal: { es: 'de a dos · {s} · {n} rayas', en: 'two players · {s} · {n} lines' },
  rulesTitle: { es: 'Cómo se juega', en: 'How to play' },
  gotIt: { es: '¡Entendido!', en: 'Got it!' },
  you: { es: 'Vos', en: 'You' },
  p1: { es: 'Jugador 1', en: 'Player 1' },
  p2: { es: 'Jugador 2', en: 'Player 2' },
  cpuName: { es: 'Compu · {l}', en: 'CPU · {l}' },
  yourTurn: { es: 'Tu turno', en: 'Your turn' },
  yourTurnAgain: { es: '¡Jugás otra vez!', en: 'You go again!' },
  turnOf: { es: 'Le toca a {n}', en: '{n} to play' },
  turnAgain: { es: '¡{n} juega otra vez!', en: '{n} goes again!' },
  thinking: { es: 'Pensando…', en: 'Thinking…' },
  waitMove: { es: 'Esperando su jugada…', en: 'Waiting for the move…' },
  away: { es: 'Se desconectó…', en: 'Disconnected…' },
  boxMine: { es: '¡Cerraste una caja!', en: 'You closed a box!' },
  boxMany: { es: '¡Cerraste {n} cajas!', en: 'You closed {n} boxes!' },
  boxTheirs: { es: '{who} cerró {n}', en: '{who} closed {n}' },
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
  winP1: { es: 'Gana el jugador 1', en: 'Player 1 wins' },
  winP2: { es: 'Gana el jugador 2', en: 'Player 2 wins' },
  endCount: { es: '{a} cajas a {b}', en: '{a} boxes to {b}' },
  endTimeout: { es: 'Se acabó el tiempo de {n}', en: '{n} ran out of time' },
  endResign: { es: '{n} se rindió', en: '{n} resigned' },
  endResignYou: { es: 'Te rendiste', en: 'You resigned' },
  endAbandon: { es: '{n} abandonó la partida', en: '{n} left the game' },
  endAborted: { es: 'Partida anulada: nadie jugó a tiempo', en: 'Game aborted: nobody moved in time' },
  wins: { es: 'Ganadas', en: 'Won' },
  losses: { es: 'Perdidas', en: 'Lost' },
  draws: { es: 'Empates', en: 'Draws' },
  rules: {
    es: `<p><b>Objetivo:</b> cerrar más cajas que tu rival.</p>
<h3>Cómo se juega</h3>
<ul>
<li>El tablero es una grilla de puntos. En tu turno unís <b>dos puntos vecinos</b> con una raya, horizontal o vertical.</li>
<li>Si con tu raya <b>cerrás una caja</b> (le ponés la cuarta raya), la caja es tuya y <b>jugás otra vez</b>. Una sola raya puede cerrar dos cajas a la vez.</li>
<li>Si no cerraste ninguna caja, pasa el turno.</li>
<li>Cuando no quedan rayas, gana quien tiene más cajas.</li>
</ul>
<h3>Para tener en cuenta</h3>
<ul>
<li>Cuidado con la <b>tercera raya</b> de una caja: se la regalás al rival, que la cierra y sigue jugando.</li>
<li>Al final nadie tiene más rayas seguras y hay que "abrir" filas de cajas. Si una fila es larga, quien la abre se la regala entera; conviene que sea el rival el primero en abrir.</li>
<li>Una jugada útil de los que saben: en vez de llevarte las últimas dos cajas de una fila, dejalas (con una raya en la punta) para que el rival las tome y te devuelva el turno.</li>
<li>En la pantalla: acercá el dedo a una raya (se marca) y soltalo para trazarla. Si te equivocás de raya, deslizá sin soltar hasta la correcta.</li>
</ul>`,
    en: `<p><b>Goal:</b> close more boxes than your rival.</p>
<h3>How to play</h3>
<ul>
<li>The board is a grid of dots. On your turn you join <b>two neighbouring dots</b> with a horizontal or vertical line.</li>
<li>If your line <b>closes a box</b> (the fourth side), the box is yours and <b>you play again</b>. One line can close two boxes at once.</li>
<li>If you didn’t close any box, the turn passes.</li>
<li>When no lines are left, whoever has more boxes wins.</li>
</ul>
<h3>Good to know</h3>
<ul>
<li>Beware of the <b>third side</b> of a box: you’re giving it to your rival, who closes it and keeps going.</li>
<li>At the end nobody has safe lines left and you must "open" rows of boxes. If a row is long, whoever opens it gives it all away; you want your rival to open first.</li>
<li>A trick the experts use: instead of taking the last two boxes of a row, leave them (with a line at the end) so your rival takes them and hands the turn back to you.</li>
<li>On screen: bring your finger near a line (it lights up) and let go to draw it. If you picked the wrong one, slide without lifting to the right one.</li>
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
const OPTS = load(KEY.prefs, { level: 3, first: 0, size: 'm', guide: 1, tc: '5+0' });
if (!Object.hasOwn(SIZES, OPTS.size)) OPTS.size = 'm';
const savePrefs = () => store(KEY.prefs, OPTS);

// ---------------------------------------------------------------- estado
const S = {
  mode: null, // 'cpu' | 'local' | 'online'
  level: 3,
  me: P0,
  size: 'm',
  rows: 4,
  cols: 4,
  pos: null,
  moves: [],
  made: [],
  by: null, // quién trazó cada raya (-1 libre)
  legal: [],
  busy: false,
  thinking: false,
  over: null,
  view: null, // índice del repaso (null = en vivo)
  viewPos: null,
  last: -1, // última raya trazada
  names: ['', ''],
  clock: null,
  req: 0,
  paused: false,
  arm: null,
  salt: 0,
  n: 0,
  again: [],
  away: false,
  bottom: P0,
  pv: -1, // raya que se está por trazar (vista previa)
  down: false,
  bs: 340,
};
let online = null;
let quick = false;
let quickHost = false;
let pulling = false;

// ---------------------------------------------------------------- sonidos
const sfx = {
  pen: () => {
    noise(0.11, { freq: 3200, q: 1.2, vol: 0.07 });
    tone(310, 250, 0.07, { type: 'triangle', vol: 0.04 });
  },
  box: (k = 0) => notes([587.33 + k * 40, 783.99 + k * 40], { step: 0.06, dur: 0.14, type: 'triangle', vol: 0.09 }),
  extra: () => notes([523.25, 659.25, 880], { step: 0.07, dur: 0.15, type: 'triangle', vol: 0.07 }),
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
  if (S.pos) refreshBoardState();
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

// ---------------------------------------------------------------- tablero (SVG)
const NS = 'http://www.w3.org/2000/svg';
const SP = 100; // separación entre puntos (unidades del dibujo)
const PAD = 40;
const TOL = 38; // a qué distancia de una raya se la elige
const layer = {};
const lineEls = new Map();
const svgEl = (name, attrs = {}) => {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
};
const geo = () => geometry(S.rows, S.cols);
const dotXY = (r, c) => [PAD + c * SP, PAD + r * SP];
function coords(m) {
  const g = geo();
  const r = g.at[m * 2];
  const c = g.at[m * 2 + 1];
  const [x1, y1] = dotXY(r, c);
  return g.kind[m] === 0 ? [x1, y1, x1 + SP, y1] : [x1, y1, x1, y1 + SP];
}
/** Una curvita pareja para cada raya, como trazada a mano (siempre la misma para la misma raya). */
function penPath(m) {
  const [x1, y1, x2, y2] = coords(m);
  const j = (((m * 2654435761) >>> 0) % 1000) / 1000 - 0.5; // -0,5…0,5
  const nx = y2 - y1;
  const ny = x1 - x2;
  const k = (j * 7) / SP;
  return `M${x1} ${y1} Q${(x1 + x2) / 2 + nx * k} ${(y1 + y2) / 2 + ny * k} ${x2} ${y2}`;
}
function buildBoard() {
  const svg = $('board');
  svg.innerHTML = '';
  lineEls.clear();
  svg.setAttribute('viewBox', `0 0 ${S.cols * SP + PAD * 2} ${S.rows * SP + PAD * 2}`);
  for (const k of ['boxes', 'ghost', 'last', 'lines', 'hint', 'pv', 'marks', 'dots']) {
    const g = svgEl('g');
    svg.appendChild(g);
    layer[k] = g;
  }
  const g = geo();
  for (let m = 0; m < g.nLines; m++) layer.ghost.appendChild(svgEl('path', { class: 'ghost', d: penPath(m) }));
  for (let r = 0; r <= S.rows; r++)
    for (let c = 0; c <= S.cols; c++) {
      const [x, y] = dotXY(r, c);
      layer.dots.appendChild(svgEl('circle', { class: 'dot', cx: x, cy: y, r: 6 }));
    }
  svg.classList.toggle('noguide', !OPTS.guide);
  measure();
}
function drawLine(m, by, animate) {
  const d = penPath(m);
  const el = svgEl('path', { class: `ln p${by}${animate ? ' new' : ''}`, d });
  if (animate) el.style.setProperty('--len', String(SP + 6));
  layer.lines.appendChild(el);
  lineEls.set(m, el);
}
function drawBox(b, by, animate = true) {
  const r = Math.floor(b / S.cols);
  const c = b % S.cols;
  const [x, y] = dotXY(r, c);
  const rect = svgEl('rect', { class: `box p${by}`, x: x + 9, y: y + 9, width: SP - 18, height: SP - 18, rx: 12 });
  const mark = svgEl('text', { class: `mark p${by}`, x: x + SP / 2 + 3, y: y + SP / 2 + 4 });
  mark.textContent = by === P0 ? 'X' : 'O';
  if (!animate) {
    rect.style.animation = 'none';
    mark.style.animation = 'none';
  }
  layer.boxes.appendChild(rect);
  layer.marks.appendChild(mark);
}
/** Dibuja de cero una posición (con quién trazó cada raya). */
function drawAll(pos, by) {
  layer.lines.innerHTML = '';
  layer.boxes.innerHTML = '';
  layer.marks.innerHTML = '';
  layer.last.innerHTML = '';
  layer.hint.innerHTML = '';
  lineEls.clear();
  const g = geo();
  for (let m = 0; m < g.nLines; m++) if (pos.drawn[m]) drawLine(m, by[m] >= 0 ? by[m] : 0, false);
  for (let b = 0; b < g.nBoxes; b++) if (pos.owner[b] >= 0) drawBox(b, pos.owner[b], false);
  setScores(pos);
}
const displayPos = () => (S.view === null ? S.pos : S.viewPos);
function markLast() {
  layer.last.innerHTML = '';
  const m = S.view === null ? S.last : S.view > 0 ? S.made[S.view - 1].m : -1;
  if (m >= 0) layer.last.appendChild(svgEl('path', { class: 'lastmark', d: penPath(m) }));
}
function setScores(pos = displayPos()) {
  for (const sl of ['top', 'bot']) {
    const c = slotColor(sl);
    const e = $(`sc-${sl}`);
    const v = String(pos.score[c]);
    if (e.textContent !== v) {
      const had = e.textContent !== '';
      e.textContent = v;
      if (had) {
        e.classList.remove('bump');
        e.offsetWidth;
        e.classList.add('bump');
      }
    }
  }
}
const bottomColor = () => (S.mode === 'local' || S.mode === null ? P0 : S.me);
const slotColor = (sl) => (sl === 'bot' ? S.bottom : S.bottom ^ 1);
function measure() {
  const g = $('game');
  const barsH = $('bar-top').offsetHeight + $('bar-bot').offsetHeight;
  const actH = $('actions').offsetHeight;
  const availH = g.clientHeight - barsH - actH - 8 * 3 - 12 - 30;
  const availW = g.clientWidth - 24;
  const bs = Math.floor(clamp(Math.min(availW, availH, 720), 200, 720));
  if (bs !== S.bs) {
    S.bs = bs;
    document.documentElement.style.setProperty('--bs', `${bs}px`);
  }
}
new ResizeObserver(measure).observe($('game'));

// ---------------------------------------------------------------- vista previa y entrada
const humanTurn = () => !S.over && S.view === null && S.pos && S.legal.length > 0 && (S.mode === 'local' || ((S.mode === 'cpu' || S.mode === 'online') && S.pos.turn === S.me));
const canInput = () => humanTurn() && !S.busy && !S.thinking && !screenOpen();
function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function toBoard(e) {
  const r = $('board').getBoundingClientRect();
  const vb = $('board').viewBox.baseVal;
  return [((e.clientX - r.left) / r.width) * vb.width, ((e.clientY - r.top) / r.height) * vb.height];
}
function nearest(x, y) {
  let best = -1;
  let bd = TOL;
  for (const m of S.legal) {
    const [x1, y1, x2, y2] = coords(m);
    const d = distSeg(x, y, x1, y1, x2, y2);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}
function setPreview(m) {
  if (m === S.pv) return;
  S.pv = m;
  layer.pv.innerHTML = '';
  if (m >= 0) layer.pv.appendChild(svgEl('path', { class: `pv p${S.pos.turn}`, d: penPath(m) }));
}
function refreshBoardState() {
  $('board').classList.toggle('can', canInput());
  if (!canInput()) setPreview(-1);
}
const svgBoard = $('board');
svgBoard.addEventListener('pointermove', (e) => {
  if (!canInput()) return;
  if (e.pointerType !== 'mouse' && !S.down) return;
  const [x, y] = toBoard(e);
  setPreview(nearest(x, y));
});
svgBoard.addEventListener('pointerdown', (e) => {
  unlock();
  if (!canInput()) return;
  S.down = true;
  clearHint();
  try {
    svgBoard.setPointerCapture(e.pointerId);
  } catch {}
  const [x, y] = toBoard(e);
  setPreview(nearest(x, y));
});
svgBoard.addEventListener('pointerup', (e) => {
  if (!S.down) return;
  S.down = false;
  if (!canInput()) return setPreview(-1);
  const [x, y] = toBoard(e);
  const m = nearest(x, y);
  setPreview(-1);
  if (m < 0) return;
  if (S.mode === 'online') online?.send({ t: 'move', m: moveStr(m) });
  playMove(m);
});
svgBoard.addEventListener('pointercancel', () => {
  S.down = false;
  setPreview(-1);
});
svgBoard.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'mouse' && !S.down) setPreview(-1);
});

// ---------------------------------------------------------------- pista
function clearHint() {
  clearTimeout(clearHint.tm);
  layer.hint && (layer.hint.innerHTML = '');
}
function showHint(m) {
  clearHint();
  layer.hint.appendChild(svgEl('path', { class: 'hintln', d: penPath(m) }));
  clearHint.tm = setTimeout(clearHint, 6000);
}

// ---------------------------------------------------------------- jugar
async function playMove(m, { quick: fast = false } = {}) {
  S.busy = true;
  clearHint();
  setPreview(-1);
  const rec = S.pos.make(m);
  S.moves.push(moveStr(m));
  S.made.push(rec);
  S.by[m] = rec.by;
  S.last = m;
  if (S.view !== null) {
    // se está repasando: la partida sigue por detrás, sin animar
    S.busy = false;
    S.legal = S.pos.moves();
    refresh();
    return afterMove(false);
  }
  markLast();
  drawLine(m, rec.by, !fast);
  if (!fast) sfx.pen();
  refresh();
  await sleep(fast ? 0 : 230);
  for (let k = 0; k < rec.boxes.length; k++) {
    drawBox(rec.boxes[k], rec.by, !fast);
    if (!fast) sfx.box(k);
  }
  setScores(S.pos);
  if (rec.boxes.length && !fast) await sleep(260);
  S.busy = false;
  S.legal = S.pos.moves();
  afterMove(true, rec);
}
function afterMove(animated, rec = S.made[S.made.length - 1]) {
  const over = S.legal.length === 0 || S.pos.over;
  saveGame();
  refresh();
  refreshBoardState();
  if (rec && rec.boxes.length && animated && !over) {
    const who = rec.by;
    if (S.mode === 'local') toast(t('turnAgain', { n: S.names[who] }), 1300);
    else if (who === S.me) toast(rec.boxes.length > 1 ? t('boxMany', { n: rec.boxes.length }) : t('boxMine'), 1100);
    else if (S.mode === 'online') toast(t('boxTheirs', { who: S.names[who], n: rec.boxes.length }), 1100);
    sfx.extra();
  }
  if (S.mode === 'online') {
    if (!over && S.pos.turn === S.me && animated && !(rec && rec.boxes.length && rec.by === S.me)) sfx.turn();
    if (!pulling) pullMoves();
    return;
  }
  if (over) return endGame(S.pos.status());
  if (S.mode === 'cpu' && S.pos.turn !== S.me) cpuMove();
  else if (S.mode === 'cpu' && animated && !(rec && rec.boxes.length)) sfx.turn();
}
const playerName = (c) => S.names[c] || '';

function resetGame() {
  S.pos = new Position(S.rows, S.cols);
  S.by = new Int8Array(geo().nLines).fill(-1);
  S.moves = [];
  S.made = [];
  S.legal = S.pos.moves();
  S.over = null;
  S.view = null;
  S.viewPos = null;
  S.last = -1;
  S.busy = false;
  S.thinking = false;
  S.clock = null;
  S.req++;
  S.bottom = bottomColor();
  clearHint();
  buildBoard();
  drawAll(S.pos, S.by);
  markLast();
}
function startGame(mode, opts = {}) {
  S.mode = mode;
  S.level = opts.level || 3;
  S.size = opts.size || OPTS.size;
  [S.rows, S.cols] = SIZES[S.size];
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
function byFrom(made, n) {
  const by = new Int8Array(n).fill(-1);
  for (const r of made) by[r.m] = r.by;
  return by;
}
function resumeSaved() {
  const s = readSave();
  if (!s) return;
  const [rows, cols] = SIZES[s.size];
  const r = replay(s.moves, rows, cols);
  if (!r) return localStorage.removeItem(KEY.save);
  S.mode = s.mode;
  S.level = s.level || 3;
  S.me = s.me ?? P0;
  S.size = s.size;
  S.rows = rows;
  S.cols = cols;
  S.salt = s.salt || 0;
  nameBars();
  S.pos = r.pos;
  S.moves = s.moves.slice();
  S.made = r.made;
  S.by = byFrom(r.made, geo().nLines);
  S.legal = S.pos.moves();
  S.last = r.made.length ? r.made[r.made.length - 1].m : -1;
  S.over = null;
  S.view = null;
  S.req++;
  S.bottom = bottomColor();
  buildBoard();
  drawAll(S.pos, S.by);
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
/** Le pide una raya al worker; si no hay worker, piensa acá (con el mismo motor). */
async function ask(payload) {
  const w = ensureWorker();
  if (w) {
    const id = ++reqId;
    const res = await new Promise((resolve) => {
      pending.set(id, resolve);
      w.postMessage({ id, rows: S.rows, cols: S.cols, ...payload });
    });
    if (res) return res;
  }
  engineLib ||= await import('./shared/engine.js');
  const r = replay(payload.moves, S.rows, S.cols);
  if (!r) return { move: null };
  const eng = (ask.eng ||= new engineLib.Engine());
  await sleep(20);
  const res = eng.think(r.pos, { level: payload.level, hint: payload.hint });
  return { move: res.move >= 0 ? moveStr(res.move) : null };
}
async function cpuMove() {
  if (S.mode !== 'cpu' || S.over || S.pos.turn === S.me || S.thinking || !S.legal.length) return;
  const my = ++S.req;
  S.thinking = true;
  refresh();
  refreshBoardState();
  const t0 = performance.now();
  const r = await ask({ moves: S.moves.slice(), level: S.level });
  await sleep(Math.max(0, 650 - (performance.now() - t0)));
  while (S.paused || screenOpen() || S.busy) {
    if (my !== S.req) return;
    await sleep(120);
  }
  if (my !== S.req || S.mode !== 'cpu' || S.over) return;
  S.thinking = false;
  let m = r && r.move ? fromStr(S.legal, r.move) : -1;
  if (m < 0) m = S.legal[Math.floor(Math.random() * S.legal.length)];
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
  setTimeout(showOver, S.mode === 'online' ? 700 : 1100);
}
function endText(res) {
  const loser = res.winner === null ? -1 : res.winner ^ 1;
  switch (res.reason) {
    case 'count': {
      const [a, b] = res.counts || S.pos.score;
      return t('endCount', { a: Math.max(a, b), b: Math.min(a, b) });
    }
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
  else if (S.mode === 'local') title = t(res.winner === P0 ? 'winP1' : 'winP2');
  else title = res.winner === mine ? t('youWin') : t('youLose');
  $('over-kicker').textContent = S.mode === 'cpu' ? levelName(S.level) : '';
  $('over-title').textContent = title;
  const [a, b] = res.counts || S.pos.score;
  const box = (c, n) => `<div class="${res.winner === c ? 'win' : ''}"><i class="pen${c === P1 ? ' b' : ''}"></i><span class="n">${n}</span><span class="who">${esc(S.names[c] || '')}</span></div>`;
  $('over-final').innerHTML = box(P0, a) + box(P1, b);
  $('over-sub').textContent = res.reason === 'count' ? '' : endText(res);
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
    S.viewPos = replay(S.moves.slice(0, i), S.rows, S.cols).pos;
  }
  clearHint();
  setPreview(-1);
  drawAll(displayPos(), S.by && S.view !== null ? byFrom(S.made.slice(0, S.view), geo().nLines) : S.by);
  markLast();
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
  $(`pen-${sl}`).className = `pen${c === P1 ? ' b' : ''}`;
  const turn = !S.over && S.view === null && S.pos.turn === c && S.legal.length > 0;
  $(`bar-${sl}`).classList.toggle('turn', turn);
  let st = '';
  const last = S.made[S.made.length - 1];
  const again = last && last.boxes.length && last.by === c;
  if (turn) {
    if (S.mode === 'cpu') st = S.pos.turn === S.me ? (again ? t('yourTurnAgain') : t('yourTurn')) : t('thinking');
    else if (S.mode === 'online') st = S.pos.turn === S.me ? (again ? t('yourTurnAgain') : t('yourTurn')) : S.away ? t('away') : t('waitMove');
    else st = again ? t('turnAgain', { n: S.names[c] }) : t('turnOf', { n: S.names[c] });
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
};
/** Cuántas rayas hay que sacar para volver al comienzo del último turno de quien juega contra la compu (0 si no se puede). */
function undoCount() {
  if (!S.made.length) return 0;
  if (S.mode === 'local') return 1;
  let i = S.made.length - 1;
  while (i >= 0 && S.made[i].by !== S.me) i--;
  if (i < 0) return 0;
  while (i > 0 && S.made[i - 1].by === S.me) i--;
  return S.made.length - i;
}
function actionList() {
  const over = !!S.over;
  if (S.view !== null) {
    const n = S.moves.length;
    return [{ k: 'first', dis: S.view <= 0 }, { k: 'prev', dis: S.view <= 0 }, { k: 'pos', label: `${S.view}/${n}` }, { k: 'next', dis: S.view >= n }, { k: 'last', dis: S.view >= n }, { k: 'live', icon: 'back', label: over ? t('menu') : t('live') }];
  }
  const list = [];
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
      return `<button class="act${S.arm === a.k ? ' arm' : ''}" data-k="${a.k}"${a.dis ? ' disabled' : ''} aria-label="${esc(label || a.k)}"><svg viewBox="0 0 24 24">${ICON[a.icon || a.k] || ''}</svg>${label ? `<span>${esc(label)}</span>` : ''}</button>`;
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
    else endGame({ over: true, winner: (S.mode === 'cpu' ? S.me : S.pos.turn) ^ 1, reason: 'resign', counts: S.pos.score.slice() });
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
  const m = r?.move ? fromStr(S.legal, r.move) : -1;
  if (m >= 0) showHint(m);
  else toast(t('hintNone'));
}
function undo() {
  const drop = undoCount();
  if (!drop || S.busy) return;
  const keep = S.moves.slice(0, S.moves.length - drop);
  const r = replay(keep, S.rows, S.cols);
  if (!r) return;
  S.req++;
  S.thinking = false;
  S.pos = r.pos;
  S.moves = keep;
  S.made = r.made;
  S.by = byFrom(r.made, geo().nLines);
  S.legal = S.pos.moves();
  S.last = r.made.length ? r.made[r.made.length - 1].m : -1;
  S.over = null;
  clearHint();
  setPreview(-1);
  drawAll(S.pos, S.by);
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
  syncSeg('p-guide', OPTS.guide);
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
    const [r, c] = SIZES[s.size];
    $('cont-t').textContent = t('continue');
    $('cont-s').textContent = t(s.mode === 'cpu' ? 'contSub' : 'contSubLocal', { l: levelName(s.level || 3), s: `${r}×${c}`, n: s.moves.length });
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
const sizeHelp = () => {
  const [r, c] = SIZES[OPTS.size];
  const g = geometry(r, c);
  return t('sizeHelp', { b: g.nBoxes, l: g.nLines });
};
const helpLevel = () => ($('o-level-help').textContent = G.t(TXT.levelHelp)[OPTS.level - 1] || '');
const levelLabels = () => $$('#o-level button').forEach((b, i) => (b.textContent = `${i + 1} ${levelName(i + 1)}`));
bindSeg('o-level', 'level');
bindSeg('o-first', 'first');
bindSeg('o-size', 'size');
bindSeg('l-size', 'size');
bindSeg('p-guide', 'guide', () => $('board').classList.toggle('noguide', !OPTS.guide));
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
  const g = online?.room?.puntos;
  if (!g) return;
  const [rows, cols] = SIZES[g.size] || SIZES.m;
  const r = replay(g.moves, rows, cols);
  if (!r) return;
  S.pos = r.pos;
  S.moves = g.moves.slice();
  S.made = r.made;
  S.by = byFrom(r.made, geo().nLines);
  S.legal = S.pos.moves();
  S.last = r.made.length ? r.made[r.made.length - 1].m : -1;
  S.busy = false;
  drawAll(S.pos, S.by);
  markLast();
  refresh();
}
/** Pone al día las rayas del rival (con animación) a partir de lo que dice el servidor. */
async function pullMoves() {
  if (pulling || S.mode !== 'online') return;
  pulling = true;
  try {
    for (;;) {
      const g = online?.room?.puntos;
      if (!g || S.n !== g.n) return;
      if (g.moves.length < S.moves.length || g.moves.slice(0, S.moves.length).join() !== S.moves.join()) return resyncOnline();
      if (g.moves.length === S.moves.length || S.busy) return;
      const m = fromStr(S.pos.moves(), g.moves[S.moves.length]);
      if (m < 0) return resyncOnline();
      await playMove(m, { quick: g.moves.length - S.moves.length > 1 });
    }
  } finally {
    pulling = false;
  }
}
function applyRoom(room) {
  if (room.state === 'lobby' || !room.puntos) {
    if (S.mode === 'online') {
      S.mode = null;
      S.pos = null;
      setPlaying(false);
    }
    applyLobby(room);
    return;
  }
  const g = room.puntos;
  const myId = online.myId;
  const nameOf = (id) => room.players.find((p) => p.id === id)?.name || '';
  if (S.mode !== 'online' || S.n !== g.n) {
    // partida nueva (o reconexión): se arma desde cero con las rayas que ya hay
    S.mode = 'online';
    S.n = g.n;
    S.size = Object.hasOwn(SIZES, g.size) ? g.size : 'm';
    [S.rows, S.cols] = SIZES[S.size];
    S.me = g.first === myId ? P0 : P1;
    S.names = [nameOf(g.first), nameOf(g.second)];
    S.again = [];
    S.over = null;
    S.view = null;
    S.thinking = false;
    S.arm = null;
    const r = replay(g.moves, S.rows, S.cols);
    S.pos = r ? r.pos : new Position(S.rows, S.cols);
    S.moves = r ? g.moves.slice() : [];
    S.made = r ? r.made : [];
    S.by = byFrom(S.made, geo().nLines);
    S.legal = S.pos.moves();
    S.last = S.made.length ? S.made[S.made.length - 1].m : -1;
    S.busy = false;
    S.bottom = S.me;
    clearHint();
    buildBoard();
    drawAll(S.pos, S.by);
    markLast();
    setPlaying(true);
    show(null);
    if (!g.moves.length && S.me === P0) sfx.turn();
  } else pullMoves();
  S.away = !room.players.find((p) => p.id !== myId)?.connected;
  S.clock = { c: g.clock.slice(), running: g.running, since: g.since };
  const prevAgain = S.again;
  S.again = g.again || [];
  if (S.again.some((id) => id !== myId && !prevAgain.includes(id))) toast(t('rematchAsked'), 2600);
  if (g.result && !S.over) {
    S.over = { over: true, winner: g.result.winner, reason: g.result.reason, counts: g.result.counts };
    clearHint();
    (S.over.winner === null ? sfx.draw : S.over.winner === S.me ? sfx.win : sfx.lose)();
    setTimeout(showOver, 800);
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
  else if (S.view !== null && k === 'arrowleft') setView(S.view - 1);
  else if (S.view !== null && k === 'arrowright') setView(S.view + 1);
});
G.onPause?.(() => (S.paused = true));
G.onResume?.(() => (S.paused = screenOpen() && !!document.querySelector('#s-pause.on')));

const drawLogo = () => {
  // un tablerito de 2×2 con rayas azules y rojas, tres cajas cerradas y una raya a medio trazar
  const d = (x, y) => `<circle class="d" cx="${x}" cy="${y}" r="5"/>`;
  const ln = (c, x1, y1, x2, y2, delay) => `<path class="ln ${c}" d="M${x1} ${y1} L${x2} ${y2}" style="animation-delay:${delay}s"/>`;
  $('logo').innerHTML = `<svg viewBox="0 0 150 108"><rect class="bx" fill="#2456d8" x="24" y="14" width="46" height="38" rx="6"/><rect class="bx" fill="#e03b3b" x="80" y="14" width="46" height="38" rx="6"/>
${ln('a', 20, 10, 75, 10, 0)}${ln('b', 75, 10, 130, 10, 0.12)}${ln('a', 20, 10, 20, 56, 0.24)}${ln('b', 75, 10, 75, 56, 0.36)}${ln('a', 130, 10, 130, 56, 0.48)}${ln('b', 20, 56, 75, 56, 0.6)}${ln('a', 75, 56, 130, 56, 0.72)}${ln('b', 20, 56, 20, 102, 0.84)}${ln('a', 20, 102, 75, 102, 0.96)}
<text class="mk" fill="#2456d8" x="47" y="35">X</text><text class="mk" fill="#e03b3b" x="103" y="35">O</text>
${[10, 56, 102].map((y) => [20, 75, 130].map((x) => d(x, y)).join('')).join('')}</svg>`;
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
  window.__puntos = {
    S,
    OPTS,
    get online() {
      return online;
    },
    startCpu,
    startLocal,
    startGame,
    playMove: (m) => playMove(m),
    nearest,
    coords,
    setView,
    toMenu,
    refresh,
    /** Partida ya jugada (sin animar): lista de rayas jugadas. */
    load(list, mode = 'cpu', me = P0, size = 'm') {
      S.mode = mode;
      S.me = me;
      S.level = 4;
      S.size = size;
      [S.rows, S.cols] = SIZES[size];
      nameBars();
      const r = replay(list, S.rows, S.cols);
      S.pos = r.pos;
      S.moves = list.slice();
      S.made = r.made;
      S.by = byFrom(r.made, geo().nLines);
      S.legal = S.pos.moves();
      S.over = null;
      S.view = null;
      S.last = r.made.length ? r.made[r.made.length - 1].m : -1;
      S.busy = false;
      S.thinking = false;
      S.bottom = bottomColor();
      buildBoard();
      drawAll(S.pos, S.by);
      markLast();
      setPlaying(true);
      show(null);
      refresh();
    },
  };
G.ready();
