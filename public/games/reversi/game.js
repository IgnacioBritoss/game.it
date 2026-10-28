/* Reversi — game.it
 * Reversi contra la compu (cinco niveles, piensa en un worker), de a dos en la misma pantalla y online con reloj y revancha.
 * Las reglas están en shared/rules.js (las comparte el servidor) y la compu en shared/engine.js.
 */
import { Position, BLACK, WHITE, sqName, fromStr, replay, flipsAt, moveStr } from './shared/rules.js';
import { OnlineRoom, netText, defaultName, share as shareRoom, roomFromUrl } from '/shared/online.js';
import { pickLobby } from '/shared/race-lobby.js';
import { tone, noise, notes, unlock } from '/shared/sfx.js';

const G = window.GameIt;
const ID = 'reversi';
const DEBUG = /[?&]debug\b/.test(location.search);
const $ = (id) => document.getElementById(id);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- textos
const TXT = {
  title: { es: 'Reversi', en: 'Reversi' },
  tagline: { es: 'Encerrá fichas rivales para darlas vuelta y quedate con el tablero.', en: 'Trap your rival’s discs to flip them and take over the board.' },
  vsCpu: { es: 'Contra la compu', en: 'Against the computer' },
  vsCpuSub: { es: 'cinco niveles y pistas', en: 'five levels and hints' },
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
  level: { es: 'Nivel', en: 'Level' },
  levels: { es: ['Novato', 'Fácil', 'Medio', 'Difícil', 'Experto'], en: ['Rookie', 'Easy', 'Medium', 'Hard', 'Expert'] },
  levelHelp: {
    es: ['Juega casi al azar. Para aprender las reglas.', 'Mira una jugada adelante y todavía regala esquinas.', 'Cuida las esquinas y cuenta las jugadas que te deja.', 'Calcula varias jugadas y resuelve el final a la perfección.', 'Piensa a fondo y juega el final sin errores. Suerte.'],
    en: ['Plays almost at random. To learn the rules.', 'Looks one move ahead and still gives corners away.', 'Guards the corners and counts the moves it leaves you.', 'Calculates many moves and plays the endgame perfectly.', 'Thinks deep and never errs in the endgame. Good luck.'],
  },
  color: { es: 'Tus fichas', en: 'Your discs' },
  colorHelp: { es: 'Las negras mueven primero.', en: 'Black moves first.' },
  white: { es: 'Blancas', en: 'White' },
  black: { es: 'Negras', en: 'Black' },
  random: { es: 'Al azar', en: 'Random' },
  yes: { es: 'Sí', en: 'Yes' },
  no: { es: 'No', en: 'No' },
  go: { es: '¡A jugar!', en: 'Let’s play!' },
  back: { es: '← volver', en: '← back' },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'Seguir', en: 'Resume' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  menu: { es: 'Menú', en: 'Menu' },
  showMoves: { es: 'Mostrar jugadas posibles', en: 'Show possible moves' },
  continue: { es: 'Continuar partida', en: 'Continue game' },
  contSub: { es: 'vs compu {l} · jugada {n}', en: 'vs CPU {l} · move {n}' },
  contSubLocal: { es: 'de a dos · jugada {n}', en: 'two players · move {n}' },
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
  away: { es: 'Se desconectó…', en: 'Disconnected…' },
  pass: { es: '{n} no tiene jugadas: pasa', en: '{n} has no moves: pass' },
  passColor: { es: 'Las {c} no tienen jugadas: pasan', en: '{c} has no moves: pass' },
  passYou: { es: 'No tenés jugadas: pasás', en: 'You have no moves: you pass' },
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
  // fin
  youWin: { es: '¡Ganaste!', en: 'You won!' },
  youLose: { es: 'Perdiste', en: 'You lost' },
  drawn: { es: 'Empate', en: 'Draw' },
  winWhite: { es: 'Ganan las blancas', en: 'White wins' },
  winBlack: { es: 'Ganan las negras', en: 'Black wins' },
  endCount: { es: '{a} a {b}', en: '{a} to {b}' },
  endTimeout: { es: 'Se acabó el tiempo de {c}', en: '{c} ran out of time' },
  endResign: { es: '{n} se rindió', en: '{n} resigned' },
  endResignYou: { es: 'Te rendiste', en: 'You resigned' },
  endAbandon: { es: '{n} abandonó la partida', en: '{n} left the game' },
  endAborted: { es: 'Partida anulada: nadie jugó a tiempo', en: 'Game aborted: nobody moved in time' },
  wins: { es: 'Ganadas', en: 'Won' },
  losses: { es: 'Perdidas', en: 'Lost' },
  draws: { es: 'Empates', en: 'Draws' },
  rules: {
    es: `<p><b>Objetivo:</b> terminar con más fichas de tu color que el rival cuando se llene el tablero o ya nadie pueda mover.</p>
<h3>Cómo se juega</h3>
<ul>
<li>Cada uno tiene fichas negras o blancas. <b>Empiezan las negras.</b> La partida arranca con cuatro fichas en el centro.</li>
<li>En tu turno ponés una ficha en una casilla vacía que <b>encierre</b> una o más fichas rivales en línea recta (horizontal, vertical o diagonal) contra otra ficha tuya.</li>
<li>Todas las fichas encerradas <b>se dan vuelta</b> y pasan a ser tuyas. Se pueden dar vuelta varias líneas a la vez.</li>
<li>Si no tenés ninguna jugada que encierre algo, <b>pasás</b> y juega el otro. Si ninguno puede jugar, se termina.</li>
</ul>
<h3>Para tener en cuenta</h3>
<ul>
<li>Las <b>esquinas</b> son las mejores casillas: nadie las puede encerrar, y desde ellas se arman bordes que no se pierden.</li>
<li>Las casillas pegadas a una esquina vacía suelen regalársela al rival.</li>
<li>A veces conviene tener pocas fichas: así dejás menos jugadas al otro. Contá las jugadas posibles, no las fichas.</li>
</ul>`,
    en: `<p><b>Goal:</b> end up with more discs of your colour than your rival when the board is full or nobody can move.</p>
<h3>How to play</h3>
<ul>
<li>One player has black discs, the other white. <b>Black moves first.</b> The game starts with four discs in the centre.</li>
<li>On your turn you place a disc on an empty square that <b>traps</b> one or more enemy discs in a straight line (row, column or diagonal) against another disc of yours.</li>
<li>All trapped discs are <b>flipped</b> and become yours. Several lines can flip at once.</li>
<li>If you have no move that traps anything you <b>pass</b> and your rival plays. If neither can move, the game ends.</li>
</ul>
<h3>Good to know</h3>
<ul>
<li><b>Corners</b> are the best squares: nobody can trap them, and edges built from them are safe.</li>
<li>Squares next to an empty corner often hand it to your rival.</li>
<li>Sometimes fewer discs is better: you leave your rival fewer moves. Count the possible moves, not the discs.</li>
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
const cap = (s) => s.replace(/^./, (c) => c.toUpperCase());
const colorName = (c) => cap(t(c === BLACK ? 'cBlack' : 'cWhite'));

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
const OPTS = load(KEY.prefs, { level: 3, color: 0, hints: 1, tc: '5+0' });
const savePrefs = () => store(KEY.prefs, OPTS);

// ---------------------------------------------------------------- estado
const S = {
  mode: null, // 'cpu' | 'local' | 'online'
  level: 3,
  me: BLACK,
  pos: null,
  moves: [],
  made: [],
  legal: [],
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
  n: 0,
  again: [],
  away: false,
  cell: 44,
  shown: [2, 2],
};
let online = null;
let quick = false;
let quickHost = false;

// ---------------------------------------------------------------- sonidos
const sfx = {
  place: () => {
    noise(0.05, { freq: 1100, q: 3, vol: 0.14 });
    tone(300, 190, 0.07, { type: 'triangle', vol: 0.09 });
  },
  flip: (i) => {
    noise(0.035, { freq: 2200 + i * 160, q: 2, vol: 0.07 });
    tone(520 + i * 40, 420 + i * 30, 0.05, { type: 'triangle', vol: 0.04 });
  },
  pass: () => tone(420, 300, 0.2, { type: 'triangle', vol: 0.05 }),
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
  if (S.pos) markMoves();
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
const discEl = new Array(64).fill(null);
const STARS = new Set([18, 21, 42, 45]); // c3, f3, c6, f6: los puntos del tablero

function buildBoard() {
  const box = $('cells');
  box.innerHTML = '';
  for (let s = 0; s < 64; s++) {
    const el = document.createElement('div');
    el.className = `sq${STARS.has(s) ? ' star' : ''}`;
    el.dataset.s = s;
    if (s >> 3 === 7) el.insertAdjacentHTML('beforeend', `<span class="co f">${'abcdefgh'[s & 7]}</span>`);
    if ((s & 7) === 0) el.insertAdjacentHTML('beforeend', `<span class="co r">${(s >> 3) + 1}</span>`);
    box.appendChild(el);
    sqEl[s] = el;
  }
}
function makeDisc(color) {
  const d = document.createElement('div');
  d.className = `d${color === WHITE ? ' w' : ''}`;
  return d;
}
/** Dibuja las fichas de una posición de cero (sin animación). */
function renderDiscs(pos) {
  for (let s = 0; s < 64; s++) {
    discEl[s]?.remove();
    discEl[s] = null;
    const v = pos.b[s];
    if (v < 0) continue;
    const d = makeDisc(v);
    sqEl[s].appendChild(d);
    discEl[s] = d;
  }
  setScores(pos.cnt, false);
}
const dist = (a, b) => Math.max(Math.abs((a >> 3) - (b >> 3)), Math.abs((a & 7) - (b & 7)));
const flipMs = () => (document.documentElement.classList.contains('reduced') ? 1 : 520);

/** Anima una jugada: cae la ficha nueva y las encerradas se dan vuelta en cadena, de la más cercana a la más lejana. */
async function animateMove(rec, fast = false) {
  const d = makeDisc(rec.by);
  discEl[rec.sq] = d;
  sqEl[rec.sq].appendChild(d);
  if (fast) {
    for (const f of rec.flips) discEl[f].classList.toggle('w', rec.by === WHITE);
    setScores(S.pos.cnt);
    return;
  }
  d.classList.add('drop');
  sfx.place();
  const order = rec.flips.slice().sort((a, b) => dist(a, rec.sq) - dist(b, rec.sq));
  let maxDelay = 0;
  order.forEach((f, i) => {
    const el = discEl[f];
    const delay = 170 + (dist(f, rec.sq) - 1) * 95;
    maxDelay = Math.max(maxDelay, delay);
    el.style.animationDelay = `${delay}ms`;
    el.classList.remove('w');
    el.classList.toggle('w', rec.by === BLACK); // estado de partida: el color anterior
    el.classList.add(rec.by === WHITE ? 'tow' : 'tob');
    setTimeout(() => sfx.flip(Math.min(i, 8)), delay + flipMs() * 0.45);
  });
  await sleep(maxDelay + flipMs() + 40);
  for (const f of order) {
    const el = discEl[f];
    el.classList.remove('tow', 'tob');
    el.style.animationDelay = '';
    el.classList.toggle('w', rec.by === WHITE);
  }
  d.classList.remove('drop');
  setScores(S.pos.cnt);
}
function setScores(cnt, bump = true) {
  for (const slot of ['top', 'bot']) {
    const c = slotColor(slot);
    const el = $(`sc-${slot}`);
    if (el.textContent !== String(cnt[c])) {
      el.textContent = cnt[c];
      if (bump && S.shown[c] !== cnt[c]) {
        el.classList.remove('bump');
        el.offsetWidth;
        el.classList.add('bump');
      }
    }
    S.shown[c] = cnt[c];
  }
}
const bottomColor = () => (S.mode === 'local' || S.mode === null ? BLACK : S.me);
const slotColor = (slot) => (slot === 'bot' ? bottomColor() : bottomColor() ^ 1);

// ---------------------------------------------------------------- marcas
const displayPos = () => (S.view === null ? S.pos : S.viewPos);
const displayLast = () => (S.view === null ? S.last : S.view > 0 ? S.made[S.view - 1].sq : -1);
function markLast() {
  for (const s of $$('.sq.last')) s.classList.remove('last');
  const l = displayLast();
  if (l >= 0) sqEl[l].classList.add('last');
}
const humanTurn = () => !S.over && S.view === null && S.pos && S.legal.length > 0 && (S.mode === 'local' || ((S.mode === 'cpu' || S.mode === 'online') && S.pos.turn === S.me));
const canInput = () => humanTurn() && !S.busy && !S.thinking && !screenOpen();
function markMoves() {
  for (const s of $$('.sq.ok')) s.classList.remove('ok', 'white');
  if (!OPTS.hints || !canInput()) return;
  for (const s of S.legal) sqEl[s].classList.add('ok', ...(S.pos.turn === WHITE ? ['white'] : []));
}
function clearHint() {
  clearTimeout(clearHint.tm);
  for (const s of $$('.sq.hint')) s.classList.remove('hint');
}
function showHint(sq) {
  clearHint();
  sqEl[sq].classList.add('hint');
  clearHint.tm = setTimeout(clearHint, 6000);
}

// ---------------------------------------------------------------- entrada
$('cells').addEventListener('click', (e) => {
  unlock();
  const el = e.target.closest('.sq');
  if (!el) return;
  clearHint();
  if (!canInput()) return;
  const s = Number(el.dataset.s);
  if (!S.legal.includes(s)) {
    if (S.pos.b[s] < 0) {
      sfx.err();
      toast(lang() === 'es' ? 'Ahí no encierra ninguna ficha' : 'That square traps nothing', 1300);
    }
    return;
  }
  if (S.mode === 'online') online?.send({ t: 'move', m: moveStr(s) });
  playMove(s);
});

// ---------------------------------------------------------------- jugar
async function playMove(sq, { quick: fast = false } = {}) {
  S.busy = true;
  clearHint();
  const by = S.pos.turn;
  const rec = { sq, by, flips: flipsAt(S.pos.b, sq, by) };
  S.pos.make(sq);
  S.moves.push(moveStr(sq));
  S.made.push(rec);
  S.last = sq;
  if (S.view !== null) {
    // se está repasando: la partida sigue por detrás, sin animar
    S.busy = false;
    S.legal = S.pos.moves();
    renderMoves();
    return afterMove(false);
  }
  markLast();
  markMoves();
  renderMoves();
  refresh(true);
  await animateMove(rec, fast);
  S.busy = false;
  S.legal = S.pos.moves();
  afterMove(true);
}
function afterMove(animated) {
  const over = S.legal.length === 0;
  saveGame();
  refresh();
  markMoves();
  const last = S.made[S.made.length - 1];
  if (!over && last && S.pos.turn === last.by && animated) {
    // el rival no tiene jugadas: pasa
    sfx.pass();
    const who = S.pos.turn ^ 1;
    toast(S.mode === 'local' ? t('passColor', { c: t(who === BLACK ? 'cBlack' : 'cWhite') }) : who === S.me ? t('passYou') : t('pass', { n: S.names[who] }), 2200);
  }
  if (S.mode === 'online') {
    if (!over && S.pos.turn === S.me && animated && !(last && last.by === S.me && S.pos.turn === last.by)) sfx.turn();
    if (!pulling) pullMoves();
    return;
  }
  if (over) return endGame(S.pos.status(S.legal));
  if (S.mode === 'cpu' && S.pos.turn !== S.me) cpuMove();
  else if (S.mode === 'cpu' && animated) sfx.turn();
}

function resetGame() {
  S.pos = new Position();
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
  S.shown = [2, 2];
  clearHint();
  renderDiscs(S.pos);
  markLast();
  markMoves();
}
function startGame(mode, opts = {}) {
  S.mode = mode;
  S.level = opts.level || 3;
  S.me = mode === 'local' ? BLACK : (opts.me ?? BLACK);
  S.salt = (Math.random() * 1e9) | 0;
  nameBars();
  resetGame();
  setPlaying(true);
  show(null);
  refresh();
  renderMoves();
  markMoves();
  if (mode === 'cpu' && S.me === WHITE) cpuMove();
  saveGame();
}
function nameBars() {
  if (S.mode === 'cpu') {
    const cpu = t('cpuName', { l: levelName(S.level) });
    S.names = S.me === BLACK ? [t('you'), cpu] : [cpu, t('you')];
  } else if (S.mode === 'local') S.names = [colorName(BLACK), colorName(WHITE)];
}
function startCpu() {
  const color = OPTS.color === 2 ? (Math.random() < 0.5 ? BLACK : WHITE) : OPTS.color;
  startGame('cpu', { level: OPTS.level, me: color });
}
const startLocal = () => startGame('local');

function saveGame() {
  if (S.mode !== 'cpu' && S.mode !== 'local') return;
  if (S.over || !S.moves.length) {
    try {
      localStorage.removeItem(KEY.save);
    } catch {}
    return;
  }
  store(KEY.save, { mode: S.mode, level: S.level, me: S.me, moves: S.moves, salt: S.salt });
}
function readSave() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY.save));
    return s && Array.isArray(s.moves) && s.moves.length ? s : null;
  } catch {
    return null;
  }
}
function resumeSaved() {
  const s = readSave();
  if (!s) return;
  const r = replay(s.moves);
  if (!r) return localStorage.removeItem(KEY.save);
  S.mode = s.mode;
  S.level = s.level || 3;
  S.me = s.me ?? BLACK;
  S.salt = s.salt || 0;
  nameBars();
  S.pos = r.pos;
  S.moves = s.moves.slice();
  S.made = r.made;
  S.legal = S.pos.moves();
  S.last = r.made.length ? r.made[r.made.length - 1].sq : -1;
  S.over = null;
  S.view = null;
  S.req++;
  renderDiscs(S.pos);
  markLast();
  markMoves();
  setPlaying(true);
  show(null);
  refresh();
  renderMoves();
  markMoves();
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
      w.postMessage({ id, ...payload });
    });
    if (res) return res;
  }
  engineLib ||= await import('./shared/engine.js');
  const r = replay(payload.moves);
  if (!r) return { move: null };
  const eng = (ask.eng ||= new engineLib.Engine());
  const o = payload.hint ? { depth: 10, time: 900, noise: 0, solve: 13 } : payload.eval ? { depth: 8, time: 500, noise: 0, solve: 11 } : { ...engineLib.LEVELS[payload.level] };
  await sleep(20);
  const res = eng.think(r.pos, { ...o, salt: payload.salt });
  return { move: res.move >= 0 ? sqName(res.move) : null, score: res.score, depth: res.depth };
}
async function cpuMove() {
  if (S.mode !== 'cpu' || S.over || S.pos.turn === S.me || S.thinking || !S.legal.length) return;
  const my = ++S.req;
  S.thinking = true;
  refresh();
  markMoves();
  const t0 = performance.now();
  const r = await ask({ moves: S.moves.slice(), level: S.level, salt: S.salt });
  await sleep(Math.max(0, 520 - (performance.now() - t0)));
  while (S.paused || screenOpen() || S.busy) {
    if (my !== S.req) return;
    await sleep(120);
  }
  if (my !== S.req || S.mode !== 'cpu' || S.over) return;
  S.thinking = false;
  let sq = r && r.move ? fromStr(S.legal, r.move) : -1;
  if (sq < 0) sq = S.legal[Math.floor(Math.random() * S.legal.length)];
  await playMove(sq);
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
  markMoves();
  refresh();
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
      const [b, w] = res.counts || S.pos.cnt;
      const hi = Math.max(b, w);
      return t('endCount', { a: hi, b: Math.min(b, w) });
    }
    case 'timeout':
      return t('endTimeout', { c: t(loser === BLACK ? 'cBlack' : 'cWhite') });
    case 'resign':
      return S.mode === 'cpu' && loser === S.me ? t('endResignYou') : t('endResign', { n: S.mode === 'local' ? colorName(loser) : S.names[loser] });
    case 'abandon':
      return t('endAbandon', { n: S.names[loser] });
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
  else if (S.mode === 'local') title = t(res.winner === BLACK ? 'winBlack' : 'winWhite');
  else title = res.winner === mine ? t('youWin') : t('youLose');
  $('over-kicker').textContent = S.mode === 'cpu' ? levelName(S.level) : '';
  $('over-title').textContent = title;
  const [nb, nw] = S.pos.cnt;
  const box = (c, n) => `<div class="${res.winner === c ? 'win' : ''}"><i class="disc${c === BLACK ? ' b' : ''}"></i><span class="n">${n}</span><span class="who">${esc(S.names[c] || colorName(c))}</span></div>`;
  $('over-final').innerHTML = box(BLACK, nb) + box(WHITE, nw);
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
    renderDiscs(S.pos);
  } else {
    i = Math.max(0, Math.min(n, i));
    S.view = i;
    S.viewPos = replay(S.moves.slice(0, i)).pos;
    renderDiscs(S.viewPos);
  }
  clearHint();
  markLast();
  markMoves();
  renderMoves();
  refresh();
}
function exitReview() {
  setView(null);
  if (S.over) showOver();
}

// ---------------------------------------------------------------- barras, jugadas y acciones
function setBar(slot) {
  const c = slotColor(slot);
  const p = displayPos();
  $(`nm-${slot}`).textContent = S.names[c] || '';
  $(`disc-${slot}`).className = `disc${c === BLACK ? ' b' : ''}`;
  const turn = !S.over && S.view === null && S.pos.turn === c && S.legal.length > 0;
  $(`bar-${slot}`).classList.toggle('turn', turn);
  let st = '';
  if (turn) {
    if (S.mode === 'cpu') st = S.pos.turn === S.me ? t('yourTurn') : t('thinking');
    else if (S.mode === 'online') st = S.pos.turn === S.me ? t('yourTurn') : S.away ? t('away') : t('waitMove');
    else st = t('turnOf', { c: t(c === BLACK ? 'cBlack' : 'cWhite') });
  } else if (S.mode !== 'local') st = colorName(c);
  $(`st-${slot}`).textContent = st;
  void p;
}
function refresh(skipScore = false) {
  if (!S.pos) return;
  setBar('top');
  setBar('bot');
  if (!skipScore) setScores(displayPos().cnt, S.view === null);
  $('busy').hidden = !S.thinking;
  $('mcount').textContent = S.moves.length ? String(S.moves.length) : '';
  const showClock = S.mode === 'online' && !!S.clock;
  $('clk-top').hidden = !showClock;
  $('clk-bot').hidden = !showClock;
  renderActions();
  tickClocks();
}
function renderMoves() {
  const l = $('mlist');
  const cur = S.view === null ? S.moves.length : S.view;
  l.innerHTML = S.moves.map((m, i) => `<li class="mv${S.made[i]?.by === WHITE ? ' w' : ''}${cur === i + 1 ? ' cur' : ''}" data-i="${i + 1}">${m}</li>`).join('');
  l.querySelector('.cur')?.scrollIntoView({ block: 'nearest' });
}
$('mlist').addEventListener('click', (e) => {
  const li = e.target.closest('.mv[data-i]');
  if (!li || screenOpen()) return;
  const i = Number(li.dataset.i);
  if (S.mode === 'cpu' && S.thinking) return;
  setView(i === S.moves.length && !S.over ? null : i);
});

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
/** Cuántas jugadas hay que sacar para que vuelva a tocarle a quien juega contra la compu (0 si no se puede). */
function undoCount() {
  if (!S.made.length) return 0;
  if (S.mode === 'local') return 1;
  for (let i = S.made.length - 1; i >= 0; i--) if (S.made[i].by === S.me) return S.made.length - i;
  return 0;
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
    else endGame({ over: true, winner: (S.mode === 'cpu' ? S.me : S.pos.turn) ^ 1, reason: 'resign', counts: S.pos.cnt.slice() });
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
  const sq = r?.move ? fromStr(S.legal, r.move) : -1;
  if (sq >= 0) showHint(sq);
  else toast(t('hintNone'));
}
function undo() {
  const drop = undoCount();
  if (!drop || S.busy) return;
  const keep = S.moves.slice(0, S.moves.length - drop);
  const r = replay(keep);
  if (!r) return;
  S.req++;
  S.thinking = false;
  S.pos = r.pos;
  S.moves = keep;
  S.made = r.made;
  S.legal = S.pos.moves();
  S.last = r.made.length ? r.made[r.made.length - 1].sq : -1;
  S.over = null;
  clearHint();
  renderDiscs(S.pos);
  markLast();
  markMoves();
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
  for (const slot of ['top', 'bot']) {
    const c = slotColor(slot);
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
    $('cont-s').textContent = t(s.mode === 'cpu' ? 'contSub' : 'contSubLocal', { l: levelName(s.level || 3), n: Math.ceil(s.moves.length / 2) });
  }
}
function bindSeg(id, key, cb) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    OPTS[key] = isNaN(b.dataset.v) || key === 'tc' ? b.dataset.v : Number(b.dataset.v);
    savePrefs();
    syncSeg(id, OPTS[key]);
    cb?.();
  });
}
function syncSeg(id, v) {
  for (const b of $$('button', $(id))) b.classList.toggle('on', String(b.dataset.v) === String(v));
}
const helpLevel = () => ($('o-level-help').textContent = G.t(TXT.levelHelp)[OPTS.level - 1] || '');
const levelLabels = () => $$('#o-level button').forEach((b, i) => (b.textContent = `${i + 1} ${levelName(i + 1)}`));
bindSeg('o-level', 'level', helpLevel);
bindSeg('o-color', 'color');
bindSeg('p-hints', 'hints', () => markMoves());
function syncOpts() {
  syncSeg('o-level', OPTS.level);
  syncSeg('o-color', OPTS.color);
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
  const g = online?.room?.reversi;
  if (!g) return;
  const r = replay(g.moves);
  if (!r) return;
  S.pos = r.pos;
  S.moves = g.moves.slice();
  S.made = r.made;
  S.legal = S.pos.moves();
  S.last = r.made.length ? r.made[r.made.length - 1].sq : -1;
  S.busy = false;
  renderDiscs(S.pos);
  markLast();
  markMoves();
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
      const g = online?.room?.reversi;
      if (!g || S.n !== g.n) return;
      if (g.moves.length < S.moves.length || g.moves.slice(0, S.moves.length).join() !== S.moves.join()) return resyncOnline();
      if (g.moves.length === S.moves.length || S.busy) return;
      const sq = fromStr(S.pos.moves(), g.moves[S.moves.length]);
      if (sq < 0) return resyncOnline();
      await playMove(sq, { quick: g.moves.length - S.moves.length > 1 });
    }
  } finally {
    pulling = false;
  }
}
function applyRoom(room) {
  if (room.state === 'lobby' || !room.reversi) {
    if (S.mode === 'online') {
      S.mode = null;
      S.pos = null;
      setPlaying(false);
    }
    applyLobby(room);
    return;
  }
  const g = room.reversi;
  const myId = online.myId;
  const nameOf = (id) => room.players.find((p) => p.id === id)?.name || '';
  if (S.mode !== 'online' || S.n !== g.n) {
    // partida nueva (o reconexión): se arma desde cero con las jugadas que ya hay
    S.mode = 'online';
    S.n = g.n;
    S.me = g.black === myId ? BLACK : WHITE;
    S.names = [nameOf(g.black), nameOf(g.white)];
    S.again = [];
    S.over = null;
    S.view = null;
    S.thinking = false;
    S.arm = null;
    const r = replay(g.moves);
    S.pos = r ? r.pos : new Position();
    S.moves = r ? g.moves.slice() : [];
    S.made = r ? r.made : [];
    S.legal = S.pos.moves();
    S.last = S.made.length ? S.made[S.made.length - 1].sq : -1;
    S.busy = false;
    S.shown = [2, 2];
    clearHint();
    renderDiscs(S.pos);
    markLast();
    setPlaying(true);
    show(null);
    renderMoves();
    if (!g.moves.length) sfx.turn();
  } else pullMoves();
  S.away = !room.players.find((p) => p.id !== myId)?.connected;
  S.clock = { c: g.clock.slice(), running: g.running, since: g.since };
  const prevAgain = S.again;
  S.again = g.again || [];
  if (S.again.some((id) => id !== myId && !prevAgain.includes(id))) toast(t('rematchAsked'), 2600);
  if (g.result && !S.over) {
    S.over = { over: true, winner: g.result.winner, reason: g.result.reason, counts: g.result.counts };
    clearHint();
    markMoves();
    (S.over.winner === null ? sfx.draw : S.over.winner === S.me ? sfx.win : sfx.lose)();
    setTimeout(showOver, 800);
  } else if (!g.result && S.over) S.over = null;
  if (S.over && document.querySelector('#s-over.on')) renderOverButtons();
  refresh();
  markMoves();
}

// ---------------------------------------------------------------- reglas
const renderRules = () => ($('rules-body').innerHTML = G.t(TXT.rules));

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
  const c = Math.max(26, Math.floor(px / 8.6));
  if (c !== S.cell) {
    S.cell = c;
    g.style.setProperty('--c', `${c}px`);
  }
}
new ResizeObserver(measure).observe($('game'));
G.onPause?.(() => (S.paused = true));
G.onResume?.(() => (S.paused = screenOpen() && !!document.querySelector('#s-pause.on')));

// ---------------------------------------------------------------- logo y arranque
const drawLogo = () => ($('logo').innerHTML = '<i class="lb"></i><i class="lp"></i><i class="lp b"></i><i class="lp b"></i><i class="lp"></i>');
G.onPrefs((p) => {
  document.documentElement.lang = p.lang;
  document.documentElement.classList.toggle('reduced', !!p.reducedMotion);
  $$('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t)));
  levelLabels();
  renderRules();
  syncOpts();
  refreshHome();
  if (S.pos) {
    if (S.mode === 'cpu' || S.mode === 'local') nameBars();
    refresh();
    renderMoves();
  }
  if (online?.room && document.querySelector('#s-lobby.on')) applyLobby(online.room);
}, true);

drawLogo();
buildBoard();
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
  window.__reversi = {
    S,
    OPTS,
    get online() {
      return online;
    },
    startCpu,
    startLocal,
    startGame,
    playMove: (name) => playMove(fromStr(S.legal, name)),
    click: (name) => {
      const s = name.charCodeAt(0) - 97 + (name.charCodeAt(1) - 49) * 8;
      sqEl[s].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    },
    setView,
    toMenu,
    refresh,
    renderMoves,
    /** Partida ya jugada (sin animar): lista de jugadas como "d3". */
    load(list, mode = 'cpu', me = BLACK, names) {
      S.mode = mode;
      S.me = me;
      S.level = 4;
      nameBars();
      if (names) S.names = names;
      const r = replay(list);
      S.pos = r.pos;
      S.moves = list.slice();
      S.made = r.made;
      S.legal = S.pos.moves();
      S.over = null;
      S.view = null;
      S.last = r.made.length ? r.made[r.made.length - 1].sq : -1;
      S.busy = false;
      S.thinking = false;
      renderDiscs(S.pos);
      markLast();
      markMoves();
      setPlaying(true);
      show(null);
      refresh();
      renderMoves();
    },
    /** Mesa armada a mano para escenas de prueba: rows como en Position.parse. */
    setup(rows, turn = BLACK, mode = 'local') {
      S.mode = mode;
      S.me = BLACK;
      S.names = [colorName(BLACK), colorName(WHITE)];
      S.pos = Position.parse(rows, turn);
      S.moves = [];
      S.made = [];
      S.legal = S.pos.moves();
      S.over = null;
      S.view = null;
      S.last = -1;
      S.busy = false;
      S.thinking = false;
      renderDiscs(S.pos);
      markLast();
      markMoves();
      setPlaying(true);
      show(null);
      refresh();
      renderMoves();
    },
  };
G.ready();
