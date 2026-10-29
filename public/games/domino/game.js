/* Dominó — game.it
 * El doble seis de toda la vida: pegás tus fichas por los números iguales, robás del pozo si no tenés con qué jugar y ganás
 * la ronda quedándote sin fichas. Contra la compu (de a dos, tres o cuatro en parejas), online de 2 a 4 (el servidor reparte)
 * y el dominó del día, con las mismas fichas para todos. Reglas en shared/rules.js, la compu en shared/bot.js, la mesa
 * (turnos, pozo, tranque, puntos) en shared/table.js, dónde va cada ficha de la cadena en shared/layout.js y el dibujo de
 * las fichas en shared/tiles.js.
 */
import { lo, hi, isDouble, pips, teamOf, shuffled, TILES, seatOrder } from './shared/rules.js';
import { Table, PACE } from './shared/table.js';
import { decide } from './shared/bot.js';
import { layout, fitLimit, fitBox } from './shared/layout.js';
import { tileSvg } from './shared/tiles.js';
import { OnlineRoom, netText, defaultName, share as shareRoom, roomFromUrl } from '/shared/online.js';
import { tone, noise, notes, unlock } from '/shared/sfx.js';
import { today, dayNumber, msUntilNext, fmtClock, loadDay, saveDay, record, loadStats, markPortal, share, shareLink, rng as seeded } from '/shared/daily.js';

const G = window.GameIt;
const ID = 'domino';
const EPOCH = '2026-10-29';
const DEBUG = /[?&]debug\b/.test(location.search);
const $ = (id) => document.getElementById(id);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------------------------------------------------------------- textos
const TXT = {
  title: { es: 'Dominó', en: 'Dominoes' },
  tagline: { es: 'Pegá tus fichas por los números iguales y quedate sin ninguna: ¡dominó!', en: 'Match the numbers, play your tiles and go out first: domino!' },
  vsCpu: { es: 'Contra la compu', en: 'Against the computer' },
  vsCpuSub: { es: 'de a dos, tres o en parejas', en: 'two, three or in pairs' },
  online: { es: 'Online', en: 'Online' },
  onlineSub: { es: 'de 2 a 4 con amigos', en: '2 to 4 with friends' },
  onlineLong: { es: 'Creá una sala y compartí el código, o entrá con el de un amigo. Reparte el servidor: nadie ve las fichas de nadie.', en: 'Create a room and share the code, or join a friend’s room. The server deals: nobody sees anyone else’s tiles.' },
  daily: { es: 'Dominó del día', en: 'Daily Dominoes' },
  dailySub: { es: 'n.º {n} · una ronda, las mismas fichas para todos', en: '#{n} · one round, the same tiles for everyone' },
  dailyDoneW: { es: 'n.º {n} · ✓ ganaste {a} a {b}', en: '#{n} · ✓ won {a}–{b}' },
  dailyDoneL: { es: 'n.º {n} · ✗ perdiste {a} a {b}', en: '#{n} · ✗ lost {a}–{b}' },
  dailyDoneT: { es: 'n.º {n} · empate {a} a {b}', en: '#{n} · tie {a}–{b}' },
  rulesTitle: { es: 'Cómo se juega', en: 'How to play' },
  format: { es: 'Partida', en: 'Game' },
  f2: { es: 'De a 2', en: '2 players' },
  f3: { es: 'De a 3', en: '3 players' },
  f4: { es: 'De a 4', en: '4 players' },
  fHelp2: { es: 'Mano a mano contra la compu.', en: 'One on one against the computer.' },
  fHelp3: { es: 'Cada uno por su cuenta: vos contra dos de la compu.', en: 'Everyone for themselves: you against two computers.' },
  fHelp4: { es: 'En parejas: vos y la compu de enfrente contra otros dos.', en: 'In pairs: you and the computer across from you against two more.' },
  level: { es: 'Nivel', en: 'Level' },
  cpuLevel: { es: 'Compu', en: 'CPU' },
  lv1: { es: 'Fácil', en: 'Easy' },
  lv2: { es: 'Normal', en: 'Normal' },
  lv3: { es: 'Difícil', en: 'Hard' },
  target: { es: 'A cuántos', en: 'Points' },
  pozoOpt: { es: 'Pozo', en: 'Boneyard' },
  drawYes: { es: 'Robando', en: 'Draw' },
  drawNo: { es: 'Sin robar', en: 'No draw' },
  pairs: { es: 'Parejas', en: 'Teams' },
  pairMix: { es: 'Mezclados', en: 'Mixed' },
  pairTogether: { es: 'Juntos', en: 'Together' },
  go: { es: '¡A jugar!', en: 'Let’s play!' },
  back: { es: '← volver', en: '← back' },
  create: { es: 'Crear sala', en: 'Create room' },
  createSub: { es: 'y compartir el código', en: 'and share the code' },
  join: { es: 'Entrar', en: 'Join' },
  room: { es: 'Sala', en: 'Room' },
  tapToCopy: { es: 'Tocá el código para copiar el link', en: 'Tap the code to copy the link' },
  start: { es: 'Empezar', en: 'Start' },
  leave: { es: 'Salir de la sala', en: 'Leave room' },
  host: { es: 'anfitrión', en: 'host' },
  cpu: { es: 'compu', en: 'CPU' },
  you: { es: 'Vos', en: 'You' },
  youLower: { es: 'vos', en: 'you' },
  teamA: { es: 'equipo A', en: 'team A' },
  teamB: { es: 'equipo B', en: 'team B' },
  needPlayers: { es: 'Hacen falta al menos 2 personas.', en: 'You need at least 2 people.' },
  tooMany: { es: 'Son más de las que entran: subí la cantidad de jugadores.', en: 'Too many people for that game: raise the player count.' },
  waitingHost: { es: 'Esperando que el anfitrión empiece…', en: 'Waiting for the host to start…' },
  copied: { es: '¡Link copiado!', en: 'Link copied!' },
  gotIt: { es: '¡Entendido!', en: 'Got it!' },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'Seguir', en: 'Resume' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  menu: { es: 'Menú', en: 'Menu' },
  us: { es: 'Nosotros', en: 'Us' },
  them: { es: 'Ellos', en: 'Them' },
  usShort: { es: 'Nos', en: 'Us' },
  themShort: { es: 'Ellos', en: 'Them' },
  roundN: { es: 'Ronda {n}', en: 'Round {n}' },
  // botones y estado
  b_play: { es: 'Jugar', en: 'Play' },
  b_draw: { es: 'Robar', en: 'Draw' },
  b_hint: { es: 'Pista', en: 'Hint' },
  b_left: { es: 'Izquierda', en: 'Left' },
  b_right: { es: 'Derecha', en: 'Right' },
  st_pick: { es: 'Elegí una ficha de tu mano', en: 'Pick a tile from your hand' },
  st_pickEnd: { es: 'Elegí de qué lado la ponés', en: 'Pick which end to play it on' },
  st_sel1: { es: 'Tocá la ficha otra vez (o Jugar)', en: 'Tap the tile again (or Play)' },
  st_none: { es: 'Esa no entra: mirá los números de las puntas', en: 'That one doesn’t fit: check the open ends' },
  st_open: { es: 'Salís vos: poné la ficha que quieras', en: 'You lead: play any tile' },
  st_forced: { es: 'Sale {name} con el {t}', en: '{name} leads with the {t}' },
  st_forcedMe: { es: 'Salís vos con el {t}', en: 'You lead with the {t}' },
  st_draw: { es: 'No tenés con qué jugar: robá del pozo', en: 'Nothing to play: draw from the boneyard' },
  st_pass: { es: 'No tenés con qué jugar: pasás', en: 'Nothing to play: you pass' },
  st_wait: { es: 'Juega {name}…', en: '{name} to play…' },
  st_think: { es: '{name} está pensando…', en: '{name} is thinking…' },
  st_away: { es: '{name} se desconectó: juega la compu por ahora', en: '{name} disconnected: the CPU plays for now' },
  st_deal: { es: 'Se reparten las fichas…', en: 'Dealing…' },
  st_hint: { es: 'La compu sugiere esta jugada', en: 'The computer suggests this move' },
  bubPass: { es: '¡Paso!', en: 'Pass!' },
  bubDraw: { es: 'Roba', en: 'Draws' },
  passYou: { es: '¡Pasás!', en: 'You pass!' },
  // anuncios
  domino: { es: '¡DOMINÓ!', en: 'DOMINO!' },
  tranque: { es: '¡TRANQUE!', en: 'BLOCKED!' },
  tranqueSub: { es: 'nadie puede seguir', en: 'nobody can move' },
  // resultado de la ronda
  rsKicker: { es: 'Fin de la ronda {n}', en: 'End of round {n}' },
  rsDomino: { es: '¡Dominó de {name}!', en: '{name} goes out!' },
  rsDominoYou: { es: '¡Dominó tuyo!', en: 'You go out!' },
  rsBlock: { es: 'Tranque: gana {name}', en: 'Blocked: {name} wins' },
  rsBlockYou: { es: 'Tranque: ganás vos', en: 'Blocked: you win' },
  rsBlockUs: { es: 'Tranque: ganamos nosotros', en: 'Blocked: we win' },
  rsBlockThem: { es: 'Tranque: ganan ellos', en: 'Blocked: they win' },
  rsDominoUs: { es: '¡Dominó de {name}! Ganamos la ronda', en: '{name} goes out! We win the round' },
  rsDominoThem: { es: '¡Dominó de {name}! Gana el otro equipo', en: '{name} goes out! The other team wins' },
  rsTie: { es: 'Tranque empatado', en: 'Blocked: a tie' },
  rsTieSub: { es: 'Nadie suma en esta ronda', en: 'Nobody scores this round' },
  rsPips: { es: '{n} pts', en: '{n} pts' },
  rsRound: { es: 'Esta ronda', en: 'This round' },
  rsTotal: { es: 'Total', en: 'Total' },
  rsEmpty: { es: 'sin fichas', en: 'no tiles' },
  next: { es: 'Siguiente ronda', en: 'Next round' },
  nextFinal: { es: 'Ver el resultado', en: 'See the result' },
  nextWait: { es: 'Esperando a los demás…', en: 'Waiting for the others…' },
  // fin
  youWin: { es: '¡Ganaste!', en: 'You win!' },
  youLose: { es: 'Perdiste', en: 'You lose' },
  usWin: { es: '¡Ganamos!', en: 'We win!' },
  usLose: { es: 'Perdimos', en: 'We lose' },
  winner: { es: '¡Ganó {name}!', en: '{name} wins!' },
  overKicker: { es: 'Fin de la partida', en: 'Game over' },
  rematch: { es: 'Revancha', en: 'Rematch' },
  again: { es: 'Otra partida', en: 'Play again' },
  waitAgain: { es: 'Esperando al anfitrión', en: 'Waiting for the host' },
  roundsWon: { es: 'rondas', en: 'rounds' },
  dailyKicker: { es: 'Dominó del día · n.º {n}', en: 'Daily Dominoes · #{n}' },
  dailyWon: { es: '¡Ganaste {a} a {b}!', en: 'You won {a}–{b}!' },
  dailyLost: { es: 'Perdiste {a} a {b}', en: 'You lost {a}–{b}' },
  dailyTie: { es: 'Empate {a} a {b}', en: 'Tie {a}–{b}' },
  stPlayed: { es: 'jugadas', en: 'played' },
  stStreak: { es: 'racha', en: 'streak' },
  stBest: { es: 'mejor', en: 'best' },
  nextDaily: { es: 'La próxima, en', en: 'Next one in' },
  share: { es: 'Compartir', en: 'Share' },
  sharedOk: { es: '¡Listo para pegar!', en: 'Ready to paste!' },
  donMate: { es: 'Don Mate', en: 'Don Mate' },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (v) for (const x in v) s = s.replaceAll(`{${x}}`, v[x]);
  return s;
};

const RULES = {
  es: `<p>Se juega con las <b>28 fichas del doble seis</b>, del blanco-blanco al seis doble. Cada uno recibe <b>7</b>. Las que sobran (de a 2 y de a 3) forman el <b>pozo</b> (o quedan dormidas si se juega sin robar). De a 4 se juega en <b>parejas</b>: tu compañero es el de enfrente.</p>
<h3>Quién sale</h3>
<p>En la primera ronda abre el que tiene el <b>doble más alto</b>, con ese doble. En las siguientes sale el que ganó la ronda anterior, con la ficha que quiera.</p>
<h3>Tu turno</h3>
<p>Poné una ficha en cualquiera de las dos puntas de la cadena: <b>el número tiene que ser igual</b> al de la punta. Los dobles se cruzan. Si no tenés ninguna que entre, <b>robás del pozo</b> hasta tener una (si se juega “robando”) o <b>pasás</b>.</p>
<h3>Cómo termina la ronda</h3>
<p>Gana el primero que se queda <b>sin fichas</b>: ¡dominó! Si nadie puede seguir es un <b>tranque</b>: gana el que se quedó con menos puntos en la mano (en parejas se suman los dos compañeros).</p>
<h3>Los puntos</h3>
<table><tr><td><b>Dominó o tranque</b></td><td>los puntos de las fichas rivales</td></tr><tr><td><b>Tranque empatado</b></td><td>nadie suma</td></tr></table>
<p>Cada ficha vale lo que suman sus dos mitades (el seis doble vale 12, el blanco-blanco 0). Gana el primero en llegar a 100 (o a 50 o 150). En el dominó del día se juega una sola ronda.</p>`,
  en: `<p>Played with the <b>28 double-six tiles</b>, from blank-blank to double six. Everyone gets <b>7</b>. The rest (with 2 or 3 players) is the <b>boneyard</b> (or stays asleep in “no draw” games). With 4 players you play in <b>pairs</b>: your partner sits across from you.</p>
<h3>Who leads</h3>
<p>In the first round the player with the <b>highest double</b> opens with it. In later rounds whoever won the last round leads with any tile.</p>
<h3>Your turn</h3>
<p>Play a tile on either end of the chain: <b>the number must match</b> the open end. Doubles go across. If nothing fits you <b>draw from the boneyard</b> until something does (in “draw” games) or you <b>pass</b>.</p>
<h3>How a round ends</h3>
<p>The first to run out of tiles wins: <b>domino!</b> If nobody can move it is <b>blocked</b>: the player with the fewest points left in hand wins (in pairs, both partners are added up).</p>
<h3>Scoring</h3>
<table><tr><td><b>Domino or block</b></td><td>the pips left in rivals’ hands</td></tr><tr><td><b>Blocked tie</b></td><td>nobody scores</td></tr></table>
<p>A tile is worth the sum of its two halves (double six is 12, blank-blank is 0). First to 100 (or 50 or 150) wins. The daily game is a single round.</p>`,
};

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
const OPTS = { n: 2, level: 2, target: 100, draw: 1, ...load('opts', {}) };

const BOT_NAMES = ['Cacho', 'Pocha', 'Tito', 'Rosa', 'Beto', 'Chela', 'Ñato', 'Mirta', 'Coco', 'Tota'];
const COLORS = ['#ffc93c', '#ff7a59', '#4fd1a5', '#6fb7ff', '#d9a6ff', '#ff9ec7'];
const TEAM_CLS = ['t0', 't1', 't2'];

// ---------------------------------------------------------------- temporizadores que se pausan
class Timers {
  constructor() {
    this.m = new Map();
    this.paused = false;
    this.speed = 1; // las pruebas lo suben para jugar rápido
  }
  set(name, ms, fn) {
    this.clear(name);
    const tm = { fn, due: 0, left: ms / this.speed, h: 0 };
    this.m.set(name, tm);
    if (!this.paused) this.arm(name, tm);
  }
  arm(name, tm) {
    tm.due = performance.now() + tm.left;
    tm.h = setTimeout(() => {
      if (this.m.get(name) === tm) this.m.delete(name);
      tm.fn();
    }, tm.left);
  }
  clear(name) {
    const tm = this.m.get(name);
    if (tm) clearTimeout(tm.h);
    this.m.delete(name);
  }
  clearAll() {
    for (const k of [...this.m.keys()]) this.clear(k);
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    const now = performance.now();
    for (const tm of this.m.values()) {
      clearTimeout(tm.h);
      tm.left = Math.max(0, tm.due - now);
    }
  }
  resume() {
    if (!this.paused) return;
    this.paused = false;
    for (const [name, tm] of this.m) this.arm(name, tm);
  }
}
const timers = new Timers();
/** Efectos que se cancelan juntos (al salir o al empezar otra partida). */
const fx = new Set();
const later = (ms, fn) => {
  const h = setTimeout(() => {
    fx.delete(h);
    fn();
  }, ms / (timers.speed || 1));
  fx.add(h);
  return h;
};
const cancelFx = () => {
  for (const h of fx) clearTimeout(h);
  fx.clear();
};

// ---------------------------------------------------------------- estado
const S = {
  mode: null, // cpu | online | daily
  v: null,
  gid: -1,
  lastEv: 0,
  hand: -1,
  sel: null, // ficha de mi mano elegida
  endSel: 0, // punta elegida (0 izquierda, 1 derecha) cuando entra en las dos
  focus: -1,
  daily: null,
  overShown: -1,
  roundShown: -1,
  lastRound: null,
  roundWins: [],
  rects: new Map(), // dónde estaba cada ficha de mi mano (para animar la jugada)
  origin: new Map(), // de dónde sale una ficha nueva de la mesa
  fresh: new Set(),
  statusLock: false,
  hinted: false,
};
let table = null;
let online = null;

const rootEl = document.documentElement;
const tableEl = $('table');
const boardEl = $('board');
const ghostsEl = $('ghosts');
const handEl = $('hand');
const seatsEl = $('seats');
/** ficha → elemento de la mesa */
const els = new Map();
const L = { W: 0, H: 0, bw: 0, bh: 0, hcs: 44, limit: 6, narrow: false, wide: false, sideY: 200, topY: 10, seatsX: [], cap: 56, f: { cs: 30, ox: 0, oy: 0 } };

// ---------------------------------------------------------------- sonidos
const sfx = {
  clack() {
    noise(0.05, { freq: 1700, q: 1.7, vol: 0.17, sweep: -800 });
    tone(210, 130, 0.07, { type: 'triangle', vol: 0.08 });
  },
  deal(k) {
    for (let i = 0; i < k; i++) noise(0.04, { freq: 2200 + Math.random() * 900, q: 1.3, vol: 0.06, at: i * 0.06, sweep: -1200 });
  },
  shuffle() {
    for (let i = 0; i < 16; i++) noise(0.03, { freq: 1500 + Math.random() * 1500, q: 1.6, vol: 0.05, at: i * 0.026 });
  },
  draw() {
    noise(0.14, { freq: 900, q: 0.8, vol: 0.09, sweep: 800 });
  },
  pass: () => notes([330, 247], { step: 0.09, dur: 0.14, type: 'triangle', vol: 0.06 }),
  domino() {
    noise(0.3, { freq: 1500, q: 0.7, vol: 0.1, sweep: 1500 });
    notes([523.25, 659.25, 783.99, 1046.5, 1318.5], { step: 0.07, dur: 0.22, type: 'square', vol: 0.055, at: 0.1 });
  },
  block() {
    tone(160, 60, 0.45, { type: 'sawtooth', vol: 0.07 });
    noise(0.2, { freq: 300, q: 0.9, vol: 0.12, sweep: -200 });
  },
  point: () => notes([659.25, 783.99, 1046.5], { step: 0.07, dur: 0.18, type: 'triangle', vol: 0.07 }),
  lose: () => notes([440, 370, 294], { step: 0.12, dur: 0.24, type: 'triangle', vol: 0.05 }),
  win: () => notes([523.25, 659.25, 783.99, 1046.5, 1318.5], { step: 0.1, dur: 0.3, type: 'triangle', vol: 0.09 }),
  turn: () => notes([660, 880], { step: 0.07, dur: 0.1, vol: 0.05 }),
  pick: () => tone(820, 1100, 0.05, { type: 'triangle', vol: 0.05 }),
  ui: () => tone(900, 640, 0.045, { type: 'square', vol: 0.035 }),
  bad: () => tone(260, 200, 0.12, { type: 'sawtooth', vol: 0.04 }),
};

// ---------------------------------------------------------------- pantallas
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  G.gameplay(!id && !!S.mode);
}
function setPlaying(on) {
  document.body.classList.toggle('playing', on);
}
const reduced = () => rootEl.classList.contains('reduced') || matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- fichas
/** Una ficha dibujada: `a` y `b` son lo que se ve a la izquierda/arriba y a la derecha/abajo. */
function tileEl(a, b, vertical, extra = '') {
  const el = document.createElement('div');
  el.className = `dm${vertical ? ' v' : ''} ${extra}`.trim();
  el.innerHTML = tileSvg(a, b, vertical);
  return el;
}
const tileName = (tl) => `${lo(tl)}-${hi(tl)}`;

// ---------------------------------------------------------------- empezar
function localIo() {
  return {
    emit: (i, view) => onView(view),
    timer: (k, ms, fn) => timers.set(k, ms, fn),
    clear: (k) => timers.clear(k),
    over: () => {},
  };
}
function resetGame(mode) {
  timers.clearAll();
  timers.resume();
  cancelFx();
  if (online && mode !== 'online') {
    online.leave();
    online = null;
  }
  S.mode = mode;
  S.gid = -1;
  S.v = null;
  S.overShown = -1;
  S.roundShown = -1;
  S.sel = null;
  S.focus = -1;
  S.roundWins = [];
  clearBoard();
}
function begin(mode, seats, opts, extra = {}) {
  resetGame(mode);
  table = new Table({ seats, opts, io: localIo(), rng: Math.random, ...extra });
  setPlaying(true);
  show(null);
  table.start();
}
function cpuSeats(n, level) {
  const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
  const seats = [{ id: 'me', name: t('you'), color: COLORS[0], bot: 0 }];
  for (let i = 1; i < n; i++) seats.push({ id: `b${i}`, name: names[i - 1], color: COLORS[i], bot: level });
  return seats;
}
function startCpu() {
  begin('cpu', cpuSeats(OPTS.n, OPTS.level), { target: OPTS.target, draw: !!OPTS.draw });
}
function dailyInfo() {
  const date = today();
  return { date, n: dayNumber(EPOCH, date), rec: loadDay(ID, 'all', date) };
}
function startDaily() {
  const d = dailyInfo();
  if (d.rec) return showDailyResult(d);
  S.daily = d;
  markPortal(ID, { date: d.date, done: false, won: false });
  // la ronda del día sale de la fecha: todos reciben las mismas fichas, y la compu decide con la misma suerte
  const dealFn = (k) => shuffled(TILES, seeded(`domino:${d.date}:${k}`));
  const seats = [
    { id: 'me', name: t('you'), color: COLORS[0], bot: 0 },
    { id: 'b', name: t('donMate'), color: '#4fd1a5', bot: 3 },
  ];
  begin('daily', seats, { target: 99999, rounds: 1, draw: true }, { dealFn, botRng: seeded(`domino:${d.date}:compu`) });
}

// ---------------------------------------------------------------- lugares y medidas
const relOf = (v, seat) => (seat - v.me + v.n) % v.n;
const mineTeam = (v) => teamOf(v.me, v.n);
const narrowMQ = matchMedia('(max-width: 599px)');
const landscapeMQ = matchMedia('(min-width: 820px) and (min-aspect-ratio: 13/10)');
for (const mq of [narrowMQ, landscapeMQ])
  mq.addEventListener?.('change', () => {
    measure();
    if (S.v) render(S.v);
  });
/** Los rivales de izquierda a derecha, tal como se ven. */
function opponents(v) {
  const o = [];
  for (let r = v.n - 1; r >= 1; r--) o.push((v.me + r) % v.n);
  return o;
}
/** Dónde se sienta cada uno: arriba (todos, en pantallas angostas), o a los costados de la mesa. */
function placeOf(v, seat) {
  if (seat === v.me) return 'me';
  if (L.narrow || v.n === 2) return 'top';
  const r = relOf(v, seat);
  return v.n === 3 ? (r === 1 ? 'right' : 'left') : r === 1 ? 'right' : r === 2 ? 'top' : 'left';
}

function measure() {
  const vh = innerHeight - 56;
  L.narrow = narrowMQ.matches;
  L.wide = landscapeMQ.matches;
  const W = tableEl.clientWidth || innerWidth;
  const H = tableEl.clientHeight || vh * 0.6;
  const byW = (innerWidth - 36) / 7.8;
  const byH = L.wide ? vh * 0.125 : vh * 0.098;
  const hcs = Math.round(clamp(Math.min(byW, byH), 28, 62));
  rootEl.style.setProperty('--hcs', `${hcs}px`);
  L.hcs = hcs;
  L.W = W;
  L.H = H;
  const n = S.v?.n || 2;
  const hud = $('hud');
  let bl = 16, br = 16, bt = 12;
  if (L.narrow) {
    // arriba: el tanteador y la pausa; debajo, todos los rivales en fila
    const hudBottom = (hud.offsetHeight || 40) + 10;
    L.topY = hudBottom + 2;
    bt = L.topY + 84;
  } else if (L.wide || W >= 600) {
    const side = n > 2 ? 124 : 8;
    bl = br = Math.max(side, 142);
    bt = n === 3 ? 14 : 104;
    L.topY = 10;
    L.sideY = Math.max(H * 0.5, (hud.offsetHeight || 100) + 14 + 56);
  }
  L.cap = L.wide ? 60 : 50;
  boardEl.style.setProperty('--bl', `${bl}px`);
  boardEl.style.setProperty('--br', `${br}px`);
  boardEl.style.setProperty('--bt', `${bt}px`);
  boardEl.style.setProperty('--bb', '8px');
  L.bw = Math.max(120, W - bl - br);
  L.bh = Math.max(80, H - bt - 8);
  L.limit = fitLimit(L.bw, L.bh);
}
function seatPoint(v, seat) {
  const place = placeOf(v, seat);
  const { W } = L;
  let x = W / 2, y = L.topY;
  if (place === 'top') {
    if (L.narrow || v.n > 4) {
      const opp = opponents(v);
      x = (W * (opp.indexOf(seat) + 0.5)) / opp.length;
    } else x = W / 2;
  } else if (place === 'right') [x, y] = [W - 62, L.sideY];
  else if (place === 'left') [x, y] = [62, L.sideY];
  else if (place === 'me') [x, y] = [W / 2, L.H + L.hcs];
  return { x, y, place };
}
/** Un rectángulo de la pantalla, en coordenadas del tablero. */
function toBoard(r) {
  const br = boardEl.getBoundingClientRect();
  return { x: r.left + r.width / 2 - br.left, y: r.top + r.height / 2 - br.top };
}
/** Un punto de la mesa (coordenadas de `table`) en las del tablero. */
function tableToBoard(p) {
  const br = boardEl.getBoundingClientRect();
  const tr = tableEl.getBoundingClientRect();
  return { x: p.x + tr.left - br.left, y: p.y + tr.top - br.top };
}

// ---------------------------------------------------------------- lo que llega de la mesa
function clearBoard() {
  for (const el of els.values()) el.remove();
  els.clear();
  S.origin.clear();
  S.fresh.clear();
  boardEl.querySelectorAll('.dm').forEach((e) => e.remove());
  ghostsEl.innerHTML = '';
  ghostEls[0] = ghostEls[1] = null;
  handEl.innerHTML = '';
  seatsEl.innerHTML = '';
  seatsEl.dataset.sig = '';
}
function onView(v) {
  if (v.gid !== S.gid) {
    // otra partida (o la primera vista): nada de animar lo viejo
    S.gid = v.gid;
    S.lastEv = v.ev.length ? v.ev[v.ev.length - 1].id : 0;
    S.hand = -1;
    S.overShown = -1;
    S.roundShown = -1;
    S.roundWins = [];
    S.sel = null;
    clearBoard();
    hideRound();
  }
  const prev = S.v;
  S.v = v;
  if (!prev || prev.n !== v.n) measure();
  // las fichas de mi mano antes de cambiar (para que la jugada salga de ahí)
  for (const el of handEl.children) S.rects.set(el.dataset.tile, el.getBoundingClientRect());
  const fresh = v.ev.filter((e) => e.id > S.lastEv);
  if (fresh.length) S.lastEv = fresh[fresh.length - 1].id;
  const newRound = !!v.hand && v.hand.num !== S.hand;
  if (newRound) {
    S.hand = v.hand.num;
    S.sel = null;
    S.focus = -1;
    S.hinted = false;
    clearBoard();
    hideRound();
  }
  // si dejó de ser mi turno (o cambió lo que hay), la selección ya no vale
  if (S.sel && !(v.can.moves && v.can.moves[S.sel])) S.sel = null;
  else if (S.sel && !v.can.moves[S.sel].includes(S.endSel)) S.endSel = v.can.moves[S.sel][0];
  fresh.forEach((e) => prepEvent(e, v));
  render(v, { dealing: newRound || fresh.some((e) => e.k === 'deal') });
  fresh.forEach((e) => playEvent(e, v));
  if (v.phase === 'over' && S.overShown !== v.gid) {
    S.overShown = v.gid;
    later(S.mode === 'daily' ? 3000 : 3600, () => S.v === v && S.overShown === v.gid && !$('s-round').classList.contains('on') && showOver(v));
  }
}

function seatName(v, i) {
  return v.seats[i]?.name ?? '';
}
function teamLabel(v, team, short = false) {
  if (v.n === 4) return team === mineTeam(v) ? t(short ? 'usShort' : 'us') : t(short ? 'themShort' : 'them');
  return team === mineTeam(v) ? t('you') : seatName(v, team);
}

/** Antes de dibujar: de dónde sale cada ficha nueva de la mesa. */
function prepEvent(e, v) {
  if (e.k === 'play') {
    const from = e.seat === v.me && S.rects.get(e.tile) ? toBoard(S.rects.get(e.tile)) : tableToBoard(seatPoint(v, e.seat));
    S.origin.set(e.tile, from);
    S.fresh.add(e.tile);
  }
}

function playEvent(e, v) {
  switch (e.k) {
    case 'deal':
      sfx.shuffle();
      later(350, () => sfx.deal(v.n * 7));
      break;
    case 'play':
      sfx.clack();
      if (e.seat === v.me) S.hinted = false;
      break;
    case 'draw':
      sfx.draw();
      if (e.seat !== v.me) bubble(v, e.seat, t('bubDraw'));
      break;
    case 'pass':
      sfx.pass();
      if (e.seat === v.me) callout(t('passYou'), '');
      else bubble(v, e.seat, t('bubPass'));
      break;
    case 'round':
      S.lastRound = e;
      S.roundWins.push(e.pts.map((p) => p));
      later(350, () => {
        if (e.kind === 'domino') {
          sfx.domino();
          callout(t('domino'), e.out === v.me ? t('you') : seatName(v, e.out));
        } else {
          sfx.block();
          callout(t('tranque'), t('tranqueSub'));
        }
      });
      later(2400, () => S.v?.gid === v.gid && showRound(S.v, e));
      break;
    case 'over':
      break;
  }
}

let bubT = new Map();
function bubble(v, seat, text) {
  const el = seatsEl.querySelector(`[data-seat="${seat}"] .bubble`);
  if (!el) return;
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(bubT.get(seat));
  bubT.set(seat, setTimeout(() => el.classList.remove('on'), 1400));
}

// ---------------------------------------------------------------- dibujo
function render(v, { dealing = false } = {}) {
  if (!v.hand) return;
  renderScore(v);
  measure();
  renderSeats(v, dealing);
  renderBoard(v);
  renderHand(v, dealing);
  renderSelection();
  renderChips(v);
  $('b-pause').hidden = false;
}

function renderSeats(v, dealing) {
  const h = v.hand;
  const others = opponents(v);
  const sig = `${v.gid}|${others.join()}|${L.narrow}`;
  if (seatsEl.dataset.sig !== sig) {
    seatsEl.dataset.sig = sig;
    seatsEl.innerHTML = others
      .map((i) => {
        const s = v.seats[i];
        const pl = placeOf(v, i);
        const mate = v.n === 4 && teamOf(i, v.n) === mineTeam(v);
        return `<div class="seat ${pl === 'top' ? 'top' : 'side'} ${pl}" data-seat="${i}">
          <div class="av" style="--c:${esc(s.color)}">${esc([...s.name][0] || '?')}${v.n === 4 ? `<i class="team-dot t${mate ? 0 : 1}"></i>` : ''}</div>
          <div class="nm">${esc(s.name)}${s.bot ? ` <small>${t('cpu')}</small>` : ''}</div>
          <div class="backs"><span class="fan"></span><b>0</b></div>
          <div class="bubble"></div>
        </div>`;
      })
      .join('');
  }
  for (const el of seatsEl.children) {
    const i = +el.dataset.seat;
    const s = v.seats[i];
    const p = seatPoint(v, i);
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    el.classList.toggle('turn', h.actor === i && !h.over);
    el.classList.toggle('away', !!s.away);
    const fan = el.querySelector('.fan');
    const k = s.hand;
    el.querySelector('.backs b').textContent = k;
    if (fan.children.length !== k || dealing) {
      fan.innerHTML = '';
      for (let j = 0; j < k; j++) {
        const d = document.createElement('i');
        d.className = 'dm v back';
        const off = j - (k - 1) / 2;
        d.style.setProperty('--r', `${off * 4}deg`);
        if (dealing && !reduced()) d.animate([{ opacity: 0, transform: 'translateY(26px) scale(.6)' }, { opacity: 1 }], { duration: 260, delay: 250 + (j * v.n + relOf(v, i)) * 60, fill: 'backwards', easing: 'ease-out' });
        fan.append(d);
      }
    }
  }
}

function ensureBoardTile(rec, from) {
  let el = els.get(rec.t);
  if (el) return el;
  el = tileEl(rec.a, rec.b, rec.v);
  el.dataset.tile = rec.t;
  el.dataset.key = `${rec.a}${rec.b}${rec.v}`;
  el.setAttribute('aria-label', tileName(rec.t));
  boardEl.insertBefore(el, ghostsEl);
  els.set(rec.t, el);
  if (from) {
    el.style.transition = 'none';
    el.style.left = `${from.x}px`;
    el.style.top = `${from.y}px`;
    void el.offsetWidth;
    el.style.transition = '';
  }
  return el;
}

function renderBoard(v) {
  const chain = v.hand.chain;
  const lay = layout(chain, L.limit);
  const f = (L.f = fitBox(lay.box, L.bw, L.bh, L.cap));
  boardEl.style.setProperty('--bcs', `${f.cs.toFixed(2)}px`);
  const last = v.hand.last?.tile;
  const seen = new Set();
  for (const rec of lay.tiles) {
    seen.add(rec.t);
    const isNew = !els.has(rec.t);
    const el = ensureBoardTile(rec, S.origin.get(rec.t) || null);
    S.origin.delete(rec.t);
    const key = `${rec.a}${rec.b}${rec.v}`;
    if (el.dataset.key !== key) {
      // por ejemplo, el doble de la vuelta: cambia de lado
      el.dataset.key = key;
      el.className = `dm${rec.v ? ' v' : ''}`;
      el.innerHTML = tileSvg(rec.a, rec.b, rec.v);
    }
    el.style.left = `${f.ox + rec.x * f.cs}px`;
    el.style.top = `${f.oy + rec.y * f.cs}px`;
    el.style.zIndex = String(2 + (rec.root ? 0 : 1));
    el.classList.toggle('last', rec.t === last && !v.hand.over);
    if (isNew && S.fresh.has(rec.t)) {
      el.classList.add('fresh');
      setTimeout(() => el.classList.remove('fresh'), 520);
    }
    S.fresh.delete(rec.t);
  }
  for (const [tl, el] of els) {
    if (seen.has(tl)) continue;
    el.remove();
    els.delete(tl);
  }
  renderGhosts(v);
}

/** Los lugares donde puede ir la ficha elegida (tocar uno la juega ahí). Son siempre los mismos dos botones: así un toque no se pierde si se redibuja justo en ese momento. */
const ghostEls = [null, null];
function renderGhosts(v) {
  const sel = iCanAct() ? S.sel : null;
  const ends = sel ? v.can.moves[sel] || [] : [];
  boardEl.classList.toggle('picking', !!sel && ends.length > 0);
  const chain = v.hand.chain;
  const lay = sel && ends.length ? layout(chain, L.limit, isDouble(sel) ? 'double' : 'normal') : null;
  const f = L.f;
  for (const end of [0, 1]) {
    const g = lay && ends.includes(end) ? (chain.root ? lay.ghosts[end] : lay.ghosts[0]) : null;
    let b = ghostEls[end];
    if (!g) {
      if (b) {
        b.remove();
        ghostEls[end] = null;
      }
      continue;
    }
    if (!b) {
      b = ghostEls[end] = document.createElement('button');
      b.onclick = () => S.sel && playTile(S.sel, end);
      ghostsEl.append(b);
    }
    b.className = `slot${ends.length === 1 || S.endSel === end ? ' best' : ''}`;
    b.style.width = `${(g.v ? 1 : 2) * f.cs}px`;
    b.style.height = `${(g.v ? 2 : 1) * f.cs}px`;
    b.style.left = `${f.ox + g.x * f.cs}px`;
    b.style.top = `${f.oy + g.y * f.cs}px`;
    b.setAttribute('aria-label', end === 0 ? t('b_left') : t('b_right'));
    b.innerHTML = chain.root ? `<b>${chain.ends[end]}</b>` : '';
  }
}

const sortedHand = (mine) => mine.slice().sort((a, b) => lo(a) - lo(b) || hi(a) - hi(b));

function renderHand(v, dealing) {
  const h = v.hand;
  const mine = sortedHand(h.mine);
  const live = iCanAct();
  handEl.classList.toggle('idle', !v.can.play && !v.can.draw);
  for (const el of [...handEl.children]) if (!mine.includes(el.dataset.tile)) el.remove();
  let prevEl = null;
  mine.forEach((tl, i) => {
    let el = handEl.querySelector(`[data-tile="${tl}"]`);
    const isNew = !el;
    if (!el) {
      el = document.createElement('button');
      el.className = 'dm v';
      el.dataset.tile = tl;
      el.setAttribute('aria-label', tileName(tl));
      el.innerHTML = tileSvg(lo(tl), hi(tl), true);
      el.onclick = () => selectTile(tl);
    }
    // en orden
    if (el.parentNode !== handEl || el.previousElementSibling !== prevEl) handEl.insertBefore(el, prevEl ? prevEl.nextSibling : handEl.firstChild);
    prevEl = el;
    const can = !!v.can.moves?.[tl];
    el.classList.toggle('live', live && can);
    el.classList.toggle('dim', live && !can && !!v.can.play);
    if (isNew && (dealing || h.over === false) && !reduced()) {
      const pr = $('pozo').getBoundingClientRect();
      const er = el.getBoundingClientRect();
      const dx = pr.left + pr.width / 2 - (er.left + er.width / 2);
      const dy = pr.top + pr.height / 2 - (er.top + er.height / 2);
      const base = dealing ? 350 + (i * v.n + ((v.me - h.lead + v.n) % v.n)) * 70 : 0;
      el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(.4) rotate(-20deg)`, opacity: 0.3 }, { transform: 'none', opacity: 1 }], { duration: dealing ? 420 : 380, delay: base, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
    }
  });
}

// ---------------------------------------------------------------- elegir la jugada
function iCanAct() {
  const v = S.v;
  return !!v && v.phase === 'play' && !!v.hand && !v.hand.over && (!!v.can.play || !!v.can.draw);
}
function selectTile(tl) {
  const v = S.v;
  if (!v?.hand || v.phase !== 'play' || v.hand.over) return;
  unlock();
  if (!iCanAct() || !v.can.play) {
    if (v.hand.actor === v.me) {
      sfx.bad();
      status(v.can.draw ? t('st_draw') : t('st_pass'));
    }
    return;
  }
  const ends = v.can.moves[tl];
  if (!ends) {
    sfx.bad();
    const el = handEl.querySelector(`[data-tile="${tl}"]`);
    if (el && !reduced()) {
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
    }
    status(t('st_none'));
    return;
  }
  if (S.sel === tl) {
    // segundo toque: la juega (si hay dos lados, juega el elegido)
    return playTile(tl, ends.length === 1 ? ends[0] : S.endSel);
  }
  S.sel = tl;
  S.endSel = ends.includes(S.endSel) ? S.endSel : ends[0];
  sfx.pick();
  renderSelection();
  renderGhosts(v);
}
function chooseEnd(end) {
  const v = S.v;
  if (!S.sel || !v?.can.moves?.[S.sel]?.includes(end)) return;
  S.endSel = end;
  renderSelection();
  renderGhosts(v);
}
function cancelSel() {
  if (!S.sel) return;
  S.sel = null;
  renderSelection();
  if (S.v) renderGhosts(S.v);
}
function playTile(tl, end) {
  const v = S.v;
  if (!v || !v.can.moves?.[tl]?.includes(end)) return;
  S.sel = null;
  renderGhosts(v);
  send({ t: 'play', tile: tl, end });
}
function drawTile() {
  const v = S.v;
  if (!v?.can.draw) return;
  unlock();
  S.sel = null;
  send({ t: 'draw' });
}
function send(msg) {
  unlock();
  if (S.mode === 'online') online?.send(msg);
  else if (table) table.act(table.seats.findIndex((s) => !s.bot), msg);
}
function hint() {
  const v = S.v;
  if (!v?.can.play || S.mode === 'online' || S.mode === 'daily') return;
  const d = decide(v, 3, Math.random);
  if (!d || d.t !== 'play') return;
  unlock();
  S.sel = d.tile;
  S.endSel = d.end;
  S.hinted = true;
  sfx.ui();
  renderSelection();
  renderGhosts(v);
  status(t('st_hint'));
}

/** Marca en pantalla lo elegido: la ficha de la mano, los lugares donde puede ir, los botones y el estado. */
function renderSelection() {
  const v = S.v;
  if (!v?.hand) return;
  const live = iCanAct();
  for (const el of handEl.children) {
    el.classList.toggle('sel', live && S.sel === el.dataset.tile);
    el.classList.toggle('focus', S.focus >= 0 && sortedHand(v.hand.mine)[S.focus] === el.dataset.tile);
  }
  renderBar(v);
  renderStatus(v);
}
function btn(label, cls, fn, disabled = false) {
  const b = document.createElement('button');
  b.className = `act ${cls}`;
  b.textContent = label;
  b.disabled = disabled;
  b.onclick = () => {
    sfx.ui();
    fn();
  };
  return b;
}
function renderBar(v) {
  const bar = $('bar');
  const items = [];
  if (iCanAct()) {
    if (v.can.draw) items.push(btn(`${t('b_draw')} (${v.hand.pozo})`, 'draw', drawTile));
    else if (S.sel) {
      const ends = v.can.moves[S.sel] || [];
      if (ends.length > 1) {
        items.push(btn(`◀ ${v.hand.chain.ends[0]}`, 'end', () => playTile(S.sel, 0)));
        items.push(btn(`${v.hand.chain.ends[1]} ▶`, 'end', () => playTile(S.sel, 1)));
      } else items.push(btn(t('b_play'), 'go', () => playTile(S.sel, ends[0])));
      items.push(btn('✕', 'x', cancelSel));
    } else if (S.mode === 'cpu') items.push(btn(t('b_hint'), 'hint', hint));
  }
  const sig = items.map((b) => b.textContent + b.className + b.disabled).join('|');
  if (bar.dataset.sig === sig) return;
  bar.dataset.sig = sig;
  bar.replaceChildren(...items);
}
function renderStatus(v) {
  const h = v.hand;
  const a = h.actor;
  let st = '';
  if (v.phase !== 'play' || h.over) st = '';
  else if (h.forced && h.turn === v.me && !h.wait) st = t('st_forcedMe', { t: tileName(h.forced) });
  else if (h.forced && !h.wait) st = t('st_forced', { name: seatName(v, h.turn), t: tileName(h.forced) });
  else if (a === v.me) {
    if (v.can.draw) st = t('st_draw');
    else if (v.can.pass) st = t('st_pass');
    else if (!S.sel) st = h.chain.root ? t('st_pick') : t('st_open');
    else st = (v.can.moves[S.sel] || []).length > 1 ? t('st_pickEnd') : t('st_sel1');
  } else if (a >= 0) {
    const s = v.seats[a];
    st = s.away ? t('st_away', { name: s.name }) : s.bot ? t('st_think', { name: s.name }) : t('st_wait', { name: s.name });
  } else if (h.wait) st = t('st_deal');
  if (!S.statusLock) $('status').textContent = st;
}
function status(txt) {
  $('status').textContent = txt;
  S.statusLock = true;
  clearTimeout(S.statusT);
  S.statusT = setTimeout(() => {
    S.statusLock = false;
    if (S.v) renderSelection();
  }, 1800);
}

function renderScore(v) {
  const el = $('score');
  const me = mineTeam(v);
  const teams = [me, ...Array.from({ length: v.nt }, (_, i) => i).filter((i) => i !== me)];
  const daily = v.rounds > 0;
  const html = teams
    .map((tm, k) => {
      const pct = daily ? 0 : Math.min(100, (v.scores[tm] / v.target) * 100);
      return `<span class="h">${esc(teamLabel(v, tm, true))}</span><span class="n ${TEAM_CLS[k]}" data-team="${tm}">${v.scores[tm]}${daily ? '' : `<small>/${v.target}</small>`}</span>${daily ? '' : `<span class="pg ${TEAM_CLS[k]}"><i style="width:${pct}%"></i></span>`}`;
    })
    .join('');
  const rd = `<span class="rd">${esc(daily ? t('daily') : t('roundN', { n: v.hand.num + 1 }))}</span>`;
  const sig = `${html}|${rd}|${G.prefs.lang}`;
  if (el.dataset.sig === sig) return;
  const old = el.dataset.sig ? [...el.querySelectorAll('.n')].map((x) => x.textContent) : null;
  el.dataset.sig = sig;
  el.innerHTML = html + rd;
  if (old) el.querySelectorAll('.n').forEach((x, i) => x.textContent !== old[i] && flashScore(+x.dataset.team));
}
function flashScore(team) {
  const el = $('score').querySelector(`[data-team="${team}"]`);
  if (!el) return;
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}
function renderChips(v) {
  const h = v.hand;
  const pz = $('pozo');
  pz.hidden = !v.draw;
  $('pozo-n').textContent = h.pozo;
  pz.classList.toggle('pulse', !!v.can.draw);
  const ends = $('ends');
  const e = h.chain.root ? h.chain.ends : null;
  ends.hidden = !e;
  if (e) {
    for (const [id, n] of [['end0', e[0]], ['end1', e[1]]]) {
      $(id).textContent = n;
      $(id).className = `n${n}`;
    }
  }
}
$('pozo').onclick = () => drawTile();

let calloutT = 0;
function callout(big, small) {
  const el = $('callout');
  $('callout-t').textContent = big;
  $('callout-s').textContent = small || '';
  $('callout-s').hidden = !small;
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
  clearTimeout(calloutT);
  calloutT = setTimeout(() => el.classList.remove('on'), 1900);
}

// ---------------------------------------------------------------- resultado de la ronda y fin de la partida
let rsTimer = 0;
function hideRound() {
  clearTimeout(rsTimer);
  if ($('s-round').classList.contains('on')) show(null);
}
function miniTiles(list) {
  if (!list.length) return `<em>${esc(t('rsEmpty'))}</em>`;
  return list.map((tl) => tileEl(lo(tl), hi(tl), false).outerHTML).join('');
}
function showRound(v, e) {
  if (S.roundShown === e.id || !$('s-round')) return;
  S.roundShown = e.id;
  const me = mineTeam(v);
  const teams = [me, ...Array.from({ length: v.nt }, (_, i) => i).filter((i) => i !== me)];
  const over = v.phase === 'over';
  $('rs-kicker').textContent = t('rsKicker', { n: e.num + 1 });
  let title;
  if (e.kind === 'tie') title = t('rsTie');
  else if (e.kind === 'domino') {
    const nm = e.out === v.me ? '' : seatName(v, e.out);
    title = v.n === 4 ? t(e.winner === me ? 'rsDominoUs' : 'rsDominoThem', { name: e.out === v.me ? t('you') : nm }) : e.out === v.me ? t('rsDominoYou') : t('rsDomino', { name: nm });
  } else title = v.n === 4 ? t(e.winner === me ? 'rsBlockUs' : 'rsBlockThem') : e.winner === me ? t('rsBlockYou') : t('rsBlock', { name: teamLabel(v, e.winner) });
  $('rs-title').textContent = title;
  // quién muestra qué: yo primero, y después los demás en el orden de la mesa
  const order = [v.me, ...Array.from({ length: v.n - 1 }, (_, k) => (v.me + k + 1) % v.n)];
  let idx = 0;
  const rows = order
    .map((s) => {
      const tm = teamOf(s, v.n);
      const sum = e.hands[s].reduce((a, tl) => a + pips(tl), 0);
      const win = e.winner >= 0 && tm === e.winner;
      const nm = s === v.me ? t('you') : seatName(v, s);
      return `<div class="rsr ${win ? 'win' : ''}" style="animation-delay:${(idx++ * 0.06).toFixed(2)}s"><div class="who"><span>${esc(nm)}</span><small>${esc(t('rsPips', { n: sum }))}</small></div><div class="tl">${miniTiles(e.hands[s])}</div><div class="pt">${win && (v.n < 4 || s === order.find((o) => teamOf(o, v.n) === tm)) ? `+${e.pts[tm]}` : ''}</div></div>`;
    })
    .join('');
  const daily = v.rounds > 0;
  const head = `<span class="h"></span>${teams.map((tm) => `<span class="h">${esc(teamLabel(v, tm, true))}</span>`).join('')}`;
  const r1 = `<span class="l">${t('rsRound')}</span>${teams.map((tm) => `<b>${e.pts[tm] ? `+${e.pts[tm]}` : '–'}</b>`).join('')}`;
  const r2 = `<span class="l">${t('rsTotal')}</span>${teams.map((tm) => `<b>${e.totals[tm]}${daily ? '' : `<small>/${v.target}</small>`}</b>`).join('')}`;
  const sub = e.kind === 'tie' ? `<p class="sub small">${esc(t('rsTieSub'))}</p>` : '';
  $('rs-table').innerHTML = `${rows}<div class="rst" style="--nt:${teams.length}">${head}${r1}${r2}</div>${sub}`;
  const nb = $('b-next');
  nb.disabled = false;
  $('b-next-t').textContent = over ? t('nextFinal') : t('next');
  nb.dataset.over = over ? '1' : '';
  const cd = $('rs-count');
  cd.hidden = over;
  if (!over) {
    cd.classList.remove('run');
    void cd.offsetWidth;
    cd.style.setProperty('--cd', `${Math.max(2, PACE.ROUND / 1000 - 2.4)}s`);
    cd.classList.add('run');
  }
  show('round');
  (e.winner === me || e.winner < 0 ? sfx.point : sfx.lose)();
}
$('b-next').onclick = () => {
  const v = S.v;
  if (!v) return;
  if ($('b-next').dataset.over) {
    show(null);
    return showOver(v);
  }
  if (S.mode === 'online') {
    online?.send({ t: 'next' });
    $('b-next').disabled = true;
    $('b-next-t').textContent = t('nextWait');
  } else {
    show(null);
    table?.skip();
  }
};

function showOver(v) {
  const res = v.result;
  if (!res) return;
  if (S.mode === 'daily') return finishDaily(v);
  const me = mineTeam(v);
  const won = res.winner === me;
  $('over-kicker').textContent = t('overKicker');
  const lbl = v.n === 4 ? t(won ? 'usWin' : 'usLose') : won ? t('youWin') : t('winner', { name: res.winner >= 0 ? seatName(v, res.winner) : '' });
  $('over-title').textContent = lbl;
  renderFinal(v);
  $('over-stats').hidden = true;
  $('over-next').hidden = true;
  $('b-share').hidden = true;
  $('over-status').textContent = '';
  const again = $('b-again');
  if (S.mode === 'online') {
    const host = online?.isHost;
    $('b-again-t').textContent = host ? t('again') : t('waitAgain');
    again.disabled = !host;
  } else {
    $('b-again-t').textContent = t('rematch');
    again.disabled = false;
  }
  again.hidden = false;
  (won ? sfx.win : sfx.lose)();
  show('over');
}
function renderFinal(v) {
  const me = mineTeam(v);
  const w = v.result?.winner;
  const teams = [me, ...Array.from({ length: v.nt }, (_, i) => i).filter((i) => i !== me)];
  const who = (tm) =>
    v.seats
      .map((s, i) => (teamOf(i, v.n) === tm ? (i === v.me ? t('you') : s.name) : null))
      .filter(Boolean)
      .join(' y ');
  $('over-final').innerHTML = teams
    .map((tm) => {
      const rounds = S.roundWins.filter((p) => p[tm] > 0 && p[tm] === Math.max(...p)).length;
      return `<div class="${tm === w ? 'win' : ''}"><span class="h">${esc(teamLabel(v, tm))}</span><span class="n">${v.scores[tm]}</span>${v.n === 4 ? `<span class="who">${esc(who(tm))}</span>` : ''}<span class="who">${rounds} ${t('roundsWon')}</span></div>`;
    })
    .join('');
}

function finishDaily(v) {
  const d = S.daily || dailyInfo();
  const a = v.scores[0], b = v.scores[1];
  const won = a > b;
  const stats = record(ID, 'all', { date: d.date, won, score: clamp(Math.floor((a - b) / 10), 0, 9) });
  saveDay(ID, 'all', { won, a, b }, d.date);
  markPortal(ID, { date: d.date, done: true, won, streak: stats.streak });
  (won ? sfx.win : sfx.lose)();
  showDailyResult(dailyInfo(), stats);
}
let dayTimer = 0;
function showDailyResult(d, stats = null) {
  const rec = d.rec;
  if (!rec) return;
  const st = stats || loadStats(ID, 'all');
  const k = rec.a > rec.b ? 'dailyWon' : rec.a < rec.b ? 'dailyLost' : 'dailyTie';
  $('over-kicker').textContent = t('dailyKicker', { n: d.n });
  $('over-title').textContent = t(k, { a: rec.a, b: rec.b });
  $('over-final').innerHTML = `<div class="${rec.won ? 'win' : ''}"><span class="h">${esc(t('you'))}</span><span class="n">${rec.a}</span></div><div><span class="h">${esc(t('donMate'))}</span><span class="n">${rec.b}</span></div>`;
  $('over-stats').hidden = false;
  $('over-stats').innerHTML = [
    [st.played, t('stPlayed')],
    [st.streak, t('stStreak')],
    [Math.max(st.best || 0, st.streak), t('stBest')],
  ]
    .map(([x, kk]) => `<span><b>${x}</b><small>${kk}</small></span>`)
    .join('');
  $('over-next').hidden = false;
  clearInterval(dayTimer);
  const tick = () => {
    $('over-clock').textContent = fmtClock(msUntilNext());
    if (today() !== d.date) {
      clearInterval(dayTimer);
      refreshHome();
    }
  };
  tick();
  dayTimer = setInterval(tick, 1000);
  $('b-share').hidden = false;
  $('b-again').hidden = true;
  $('over-status').textContent = '';
  show('over');
}
$('b-share').onclick = async () => {
  const d = dailyInfo();
  if (!d.rec) return;
  const k = d.rec.a > d.rec.b ? 'dailyWon' : d.rec.a < d.rec.b ? 'dailyLost' : 'dailyTie';
  const r = await share(`game.it · ${t('title')} #${d.n}\n🁣 ${t(k, { a: d.rec.a, b: d.rec.b })}\n${shareLink(ID)}`);
  $('over-status').textContent = r === 'failed' ? '' : t('sharedOk');
};
$('b-again').onclick = async () => {
  if (S.mode === 'online') {
    if (online?.isHost) online.send({ t: 'again' });
    return;
  }
  try {
    await G.commercialBreak('revancha');
  } catch {}
  startCpu();
};
$('b-over-menu').onclick = () => toMenu();

// ---------------------------------------------------------------- menú
function toMenu() {
  timers.clearAll();
  cancelFx();
  clearInterval(dayTimer);
  if (online) {
    online.leave();
    online = null;
  }
  table = null;
  S.mode = null;
  S.v = null;
  S.gid = -1;
  clearBoard();
  setPlaying(false);
  refreshHome();
  show('home');
}
function refreshHome() {
  const d = dailyInfo();
  const k = !d.rec ? 'dailySub' : d.rec.a > d.rec.b ? 'dailyDoneW' : d.rec.a < d.rec.b ? 'dailyDoneL' : 'dailyDoneT';
  $('b-daily-sub').textContent = t(k, { n: d.n, a: d.rec?.a, b: d.rec?.b });
  $('logo').replaceChildren(tileEl(2, 5, true), tileEl(6, 6, true), tileEl(3, 0, true));
}
function syncSeg(id, val2) {
  $$(`#${id} button`).forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === Number(val2)));
}
function bindSeg(id, key, after) {
  for (const b of $$(`#${id} button`))
    b.onclick = () => {
      OPTS[key] = Number(b.dataset.v);
      save('opts', OPTS);
      syncSeg(id, OPTS[key]);
      after?.();
    };
}
const nHelp = () => {
  $('o-n-help').textContent = t(OPTS.n === 4 ? 'fHelp4' : OPTS.n === 3 ? 'fHelp3' : 'fHelp2');
  $('o-draw-row').hidden = OPTS.n === 4;
};
bindSeg('o-n', 'n', nHelp);
bindSeg('o-level', 'level');
bindSeg('o-target', 'target');
bindSeg('o-draw', 'draw');
function syncOpts() {
  syncSeg('o-n', OPTS.n);
  syncSeg('o-level', OPTS.level);
  syncSeg('o-target', OPTS.target);
  syncSeg('o-draw', OPTS.draw);
  nHelp();
}
$('b-cpu').onclick = () => {
  syncOpts();
  show('cpu');
};
$('b-cpu-go').onclick = () => {
  unlock();
  startCpu();
};
$('b-cpu-back').onclick = () => show('home');
$('b-daily').onclick = () => {
  unlock();
  startDaily();
};
$('b-rules').onclick = () => {
  S.rulesBack = 'home';
  show('rules');
};
$('b-rules-ok').onclick = () => (S.rulesBack === 'pause' ? show('pause') : show('home'));
function renderRules() {
  $('rules-body').innerHTML = G.t(RULES);
}

// pausa (en línea no se pausa la mesa: es solo el menú)
function pause() {
  if (!S.mode || $$('.screen.on').length) return;
  if (S.mode !== 'online') timers.pause();
  show('pause');
}
function resume() {
  show(null);
  timers.resume();
}
$('b-pause').onclick = () => pause();
$('b-resume').onclick = () => resume();
$('b-p-rules').onclick = () => {
  S.rulesBack = 'pause';
  show('rules');
};
$('b-quit').onclick = () => toMenu();
for (const b of $$('.btn, .link, .seg button')) b.addEventListener('click', () => sfx.ui());

// ---------------------------------------------------------------- online
function ensureOnline() {
  if (online) return online;
  online = new OnlineRoom(ID, {
    onStatus: (st) => {
      const txt = { connecting: netText('connecting'), reconnecting: netText('reconnecting'), netError: netText('netError'), wakeup: netText('wakeup'), rate: netText('rate'), open: '' }[st];
      if (txt !== undefined) $('on-status').textContent = txt;
    },
    onRoom: applyRoom,
    onMessage: (m) => {
      if (m.t === 'g') {
        if (S.mode !== 'online') {
          resetGame('online');
          setPlaying(true);
        }
        if ($$('.screen.on').some((s) => ['s-lobby', 's-online', 's-over'].includes(s.id))) show(null);
        onView(m.s);
      } else if (m.t === 'error') {
        const txt = m.code === 'need_players' ? t('needPlayers') : m.code === 'too_many' ? t('tooMany') : netText(m.code);
        $('on-status').textContent = txt;
        $('lobby-status').textContent = txt;
      } else if (m.t === 'closed' || m.t === 'kicked') {
        $('on-status').textContent = netText(m.t === 'kicked' ? 'kicked' : `closed_${m.reason}`);
        S.mode = null;
        S.v = null;
        setPlaying(false);
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
  if (online) {
    online.leave();
    online = null;
  }
  show('home');
};
$('on-create').onclick = () => {
  unlock();
  ensureOnline().create($('on-name').value.trim() || defaultName());
};
$('on-join').onclick = () => {
  unlock();
  const code = $('on-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length === 5) ensureOnline().join(code, $('on-name').value.trim() || defaultName());
};
$('on-code').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)));
$('lobby-start').onclick = () => online?.send({ t: 'start' });
$('lobby-leave').onclick = () => {
  online?.leave();
  online = null;
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
    const st = { ...(online.room.settings || {}) };
    st[seg.dataset.k] = Number(b.dataset.v);
    online.send({ t: 'settings', settings: st });
  };
function applyRoom(room) {
  if (room.state !== 'lobby') return;
  if (S.mode === 'online') {
    S.mode = null;
    S.v = null;
    setPlaying(false);
  }
  $('lobby-code').textContent = room.code;
  const st = room.settings || {};
  const n = st.n || 2;
  const people = room.players.filter((p) => p.connected);
  const seats = seatOrder(people.length, n, st.pair);
  const tag = (seat) => (n === 4 ? `<span class="tm t${seat % 2}">${t(seat % 2 ? 'teamB' : 'teamA')}</span>` : '');
  let html = room.players
    .map((p) => {
      const k = people.indexOf(p);
      const seat = k >= 0 && k < seats.length ? seats[k] : -1;
      return `<li><i style="background:${esc(p.color)}"></i><span>${esc(p.name)}</span>${seat >= 0 ? tag(seat) : ''}<small>${[p.id === online.myId ? t('youLower') : '', p.id === room.host ? t('host') : ''].filter(Boolean).join(' · ')}</small></li>`;
    })
    .join('');
  const used = new Set(seats);
  const free = [0, 1, 2, 3].slice(0, n).filter((s) => !used.has(s));
  html += free.map((s, i) => `<li><i style="background:#cfc3ad"></i><span>${BOT_NAMES[i]}</span>${tag(s)}<small>${t('cpu')}</small></li>`).join('');
  $('lobby-players').innerHTML = html;
  for (const seg of $$('#lobby-host .seg')) {
    const k = seg.dataset.k;
    $$('button', seg).forEach((b) => {
      b.classList.toggle('on', Number(b.dataset.v) === Number(st[k]));
      b.disabled = !online.isHost;
    });
  }
  $('lobby-pair').hidden = n !== 4;
  $('lobby-draw').hidden = n === 4;
  $('lobby-start').hidden = !online.isHost;
  const err = people.length < 2 ? t('needPlayers') : people.length > n ? t('tooMany') : '';
  $('lobby-status').textContent = online.isHost ? err : t('waitingHost');
  $('lobby-status').style.color = online.isHost ? '' : 'var(--ink2)';
  show('lobby');
}

// ---------------------------------------------------------------- teclado y mando
/** Pasa a la ficha jugable siguiente (o anterior) de la mano. */
function stepTile(dir) {
  const v = S.v;
  if (!v?.can.play) return;
  const list = sortedHand(v.hand.mine).filter((tl) => v.can.moves[tl]);
  if (!list.length) return;
  const at = S.sel ? list.indexOf(S.sel) : -1;
  const next = list[(at < 0 ? (dir > 0 ? 0 : list.length - 1) : at + dir + list.length) % list.length];
  S.sel = next;
  S.endSel = v.can.moves[next].includes(S.endSel) ? S.endSel : v.can.moves[next][0];
  sfx.pick();
  renderSelection();
  renderGhosts(v);
}
function confirmSel() {
  const v = S.v;
  if (!S.sel || !v?.can.moves?.[S.sel]) return;
  const ends = v.can.moves[S.sel];
  playTile(S.sel, ends.length === 1 ? ends[0] : S.endSel);
}
function toggleEnd() {
  const v = S.v;
  const ends = S.sel && v?.can.moves?.[S.sel];
  if (!ends || ends.length < 2) return;
  chooseEnd(S.endSel === 0 ? 1 : 0);
}
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (document.querySelector('#s-pause.on')) {
    if (k === 'escape' || k === 'p') resume();
    return;
  }
  if (document.querySelector('#s-round.on')) {
    if (k === 'enter' || k === ' ') {
      e.preventDefault();
      $('b-next').click();
    }
    return;
  }
  const v = S.v;
  if (!v || $$('.screen.on').length) return;
  if (/^[1-7]$/.test(k)) {
    const tl = sortedHand(v.hand.mine)[+k - 1];
    if (tl) selectTile(tl);
  } else if (k === 'arrowleft' || k === 'arrowright') {
    e.preventDefault();
    stepTile(k === 'arrowleft' ? -1 : 1);
  } else if (k === 'arrowup' || k === 'arrowdown' || k === 'tab') {
    e.preventDefault();
    toggleEnd();
  } else if (k === 'l' || k === 'q') chooseEnd(0);
  else if (k === 'r' || k === 'e') chooseEnd(1);
  else if (k === ' ' || k === 'enter') {
    e.preventDefault();
    if (S.sel) confirmSel();
    else if (v.can.draw) drawTile();
  } else if (k === 'd') drawTile();
  else if (k === 'h') hint();
  else if (k === 'escape') {
    if (S.sel) cancelSel();
    else pause();
  } else if (k === 'p') pause();
});
const padPrev = [];
function pollPad() {
  const gp = navigator.getGamepads?.()?.find((g) => g && g.connected);
  if (!gp) return;
  const b = (i) => !!gp.buttons[i]?.pressed;
  const pressed = (i) => b(i) && !padPrev[i];
  const v = S.v;
  const live = v && !$$('.screen.on').length;
  if (live && iCanAct()) {
    const dir = pressed(15) || pressed(5) ? 1 : pressed(14) || pressed(4) ? -1 : 0;
    if (dir) stepTile(dir);
    if (pressed(12) || pressed(13)) toggleEnd();
    if (pressed(0)) {
      if (S.sel) confirmSel();
      else if (v.can.draw) drawTile();
      else stepTile(1);
    }
    if (pressed(2)) drawTile();
    if (pressed(1)) cancelSel();
    if (pressed(3)) hint();
    if (pressed(9)) pause();
  } else if (document.querySelector('#s-pause.on') && pressed(9)) resume();
  gp.buttons.forEach((x, i) => (padPrev[i] = x.pressed));
}

// ---------------------------------------------------------------- bucle
function loop() {
  pollPad();
  const v = S.v;
  const showClock = S.mode === 'online' && v && v.phase === 'play' && v.turnMs && v.hand?.actor === v.me && v.left > 0;
  $('clock').hidden = !showClock;
  if (showClock) {
    const at = v._at || (v._at = performance.now());
    const left = Math.max(0, (v.left || 0) - (performance.now() - at));
    $('clock-t').textContent = `⏱ ${Math.ceil(left / 1000)}`;
    $('clock').classList.toggle('low', left < 8000);
  }
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- tamaño, pausa automática y arranque
new ResizeObserver(() => {
  measure();
  if (S.v) render(S.v);
}).observe(tableEl);
addEventListener('blur', () => S.mode && S.mode !== 'online' && pause());
document.addEventListener('visibilitychange', () => document.hidden && S.mode && S.mode !== 'online' && pause());
G.onPause?.(() => timers.pause());
G.onResume?.(() => {
  if (!$$('.screen.on').length) timers.resume();
});

G.onPrefs((p) => {
  document.documentElement.lang = p.lang;
  rootEl.classList.toggle('reduced', !!p.reducedMotion);
  $$('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t)));
  renderRules();
  refreshHome();
  nHelp();
  if (S.v) {
    seatsEl.dataset.sig = '';
    render(S.v);
  }
  if (online?.room && document.querySelector('#s-lobby.on')) applyRoom(online.room);
}, true);

measure();
requestAnimationFrame(loop);
const code = roomFromUrl();
if (code) {
  $('on-code').value = code;
  $('on-name').value = defaultName();
  show('online');
} else if (ensureOnline().resume()) show('online');
else {
  online = null;
  show('home');
}
G.gameplay(false);

if (DEBUG)
  window.__domino = {
    S,
    get table() {
      return table;
    },
    get online() {
      return online;
    },
    startCpu,
    startDaily,
    toMenu,
    send,
    selectTile,
    playTile,
    drawTile,
    hint,
    timers,
    OPTS,
    L,
    /** Una partida contra la compu con las fichas de cada ronda ya elegidas (para armar escenas): deck = lista de 28 fichas. */
    startDeck(deck, n = 2, opts = {}) {
      begin('cpu', cpuSeats(n, OPTS.level), { target: 100, draw: n < 4, ...opts }, { dealFn: () => deck });
    },
    /** La compu juega por mí (como si estuviera ausente) hasta el final. */
    autoplay() {
      if (!table) return;
      table.seats.forEach((s, i) => !s.bot && table.setAway(i, true));
    },
  };
G.ready();
