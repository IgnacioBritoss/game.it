/* Escoba de 15 — game.it
 * El clásico de la baraja española: tirás una carta y te llevás las de la mesa que con la tuya suman 15; si dejás la mesa
 * limpia, es escoba. Al final de cada ronda se cuentan escobas, cartas, oros, sietes y el siete de oros. Contra la compu
 * (de a dos, tres o cuatro en parejas), online de 2 a 4 (el servidor reparte) y la escoba del día, con las mismas cartas
 * para todos. Reglas en shared/rules.js, la compu en shared/bot.js, la mesa (turnos, reparto, puntos) en shared/table.js
 * y la baraja dibujada en /shared/spanish-deck.js.
 */
import { captures, val, teamOf, teamCount, shuffled, seatOrder, DECK } from './shared/rules.js';
import { Table, PACE } from './shared/table.js';
import { decide } from './shared/bot.js';
import { cardURL } from '/shared/spanish-deck.js';
import { OnlineRoom, netText, defaultName, share as shareRoom, roomFromUrl } from '/shared/online.js';
import { tone, noise, notes, unlock } from '/shared/sfx.js';
import { today, dayNumber, msUntilNext, fmtClock, loadDay, saveDay, record, loadStats, markPortal, share, shareLink, rng as seeded } from '/shared/daily.js';

const G = window.GameIt;
const ID = 'escoba';
const EPOCH = '2026-10-27';
const DEBUG = /[?&]debug\b/.test(location.search);
const $ = (id) => document.getElementById(id);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------------------------------------------------------------- textos
const TXT = {
  title: { es: 'Escoba de 15', en: 'Escoba' },
  tagline: { es: 'Sumá 15 con las cartas de la mesa y barrela toda: ¡escoba!', en: 'Make 15 with the cards on the table and sweep it clean: escoba!' },
  vsCpu: { es: 'Contra la compu', en: 'Against the computer' },
  vsCpuSub: { es: 'de a dos, tres o en parejas', en: 'two, three or in pairs' },
  online: { es: 'Online', en: 'Online' },
  onlineSub: { es: 'de 2 a 4 con amigos', en: '2 to 4 with friends' },
  onlineLong: { es: 'Creá una sala y compartí el código, o entrá con el de un amigo. Reparte el servidor: nadie ve las cartas de nadie.', en: 'Create a room and share the code, or join a friend’s room. The server deals: nobody sees anyone else’s cards.' },
  daily: { es: 'Escoba del día', en: 'Daily Escoba' },
  dailySub: { es: 'n.º {n} · una ronda, las mismas cartas para todos', en: '#{n} · one round, the same cards for everyone' },
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
  fHelp4: { es: 'En parejas: vos y un compañero de la compu contra otros dos.', en: 'In pairs: you and a computer partner against two more.' },
  level: { es: 'Nivel', en: 'Level' },
  cpuLevel: { es: 'Compu', en: 'CPU' },
  lv1: { es: 'Fácil', en: 'Easy' },
  lv2: { es: 'Normal', en: 'Normal' },
  lv3: { es: 'Difícil', en: 'Hard' },
  target: { es: 'A cuántos', en: 'Points' },
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
  dealer: { es: 'reparte', en: 'dealer' },
  escoba: { es: '¡ESCOBA!', en: 'ESCOBA!' },
  // botones y estado
  b_take: { es: 'Llevar', en: 'Take' },
  b_drop: { es: 'Dejar en la mesa', en: 'Leave on table' },
  b_hint: { es: 'Pista', en: 'Hint' },
  st_pick: { es: 'Elegí una carta de tu mano', en: 'Pick a card from your hand' },
  st_sel1: { es: 'Tocá Llevar (o la carta otra vez)', en: 'Tap Take (or the card again)' },
  st_selN: { es: 'Elegí las cartas que suman 15', en: 'Pick the cards that make 15' },
  st_selNone: { es: 'No suma 15: dejala en la mesa', en: 'No 15 possible: leave it' },
  st_must: { es: 'Tenés que levantar: sumá 15', en: 'You must take: make 15' },
  st_wait: { es: 'Juega {name}…', en: '{name} to play…' },
  st_think: { es: '{name} está pensando…', en: '{name} is thinking…' },
  st_away: { es: '{name} se desconectó: juega la compu por ahora', en: '{name} disconnected: the CPU plays for now' },
  st_deal: { es: 'Se reparten las cartas…', en: 'Dealing…' },
  st_hint: { es: 'La compu sugiere esta jugada', en: 'The computer suggests this move' },
  // resultado de la ronda
  rsKicker: { es: 'Fin de la ronda {n}', en: 'End of round {n}' },
  rsTitle: { es: 'Así quedó', en: 'Round result' },
  rsEscobas: { es: 'Escobas', en: 'Escobas' },
  rsCartas: { es: 'Más cartas', en: 'Most cards' },
  rsOros: { es: 'Más oros', en: 'Most coins' },
  rsSietes: { es: 'Más sietes', en: 'Most sevens' },
  rsVelo: { es: 'Siete de oros', en: 'Seven of coins' },
  mkCartas: { es: 'Cartas', en: 'Cards' },
  mkOros: { es: 'Oros', en: 'Coins' },
  mkSietes: { es: 'Sietes', en: 'Sevens' },
  mkVelo: { es: 'Velo', en: 'Velo' },
  rsRound: { es: 'Esta ronda', en: 'This round' },
  rsTotal: { es: 'Total', en: 'Total' },
  rsLeft: { es: 'Las cartas que quedaron en la mesa van para {name}', en: 'The cards left on the table go to {name}' },
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
  dailyKicker: { es: 'Escoba del día · n.º {n}', en: 'Daily Escoba · #{n}' },
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
  es: `<p>Se juega con la <b>baraja española</b> de 40 cartas. Cada carta vale su número y la <b>sota vale 8, el caballo 9 y el rey 10</b>.</p>
<h3>Tu turno</h3>
<p>Tirás una carta de tu mano. Si con ella y <b>algunas cartas de la mesa suman justo 15</b>, te las llevás todas (con la tuya). Si no, la carta queda en la mesa. <b>Si se puede levantar, hay que levantar</b> (pero elegís con qué carta jugar y cuáles levantás si hay más de una forma).</p>
<p>Si con lo que levantás <b>dejás la mesa vacía</b>, hacés una <b>escoba</b> y sumás 1 punto (menos en la última jugada de la ronda).</p>
<h3>La ronda</h3>
<p>Arrancan con 4 cartas en la mesa y 3 en la mano de cada uno. Cuando se acaban las cartas de las manos se reparten 3 más, hasta terminar el mazo. Lo que queda en la mesa al final se lo lleva el último que levantó.</p>
<h3>Los puntos</h3>
<table><tr><td><b>Escoba</b> · cada una</td><td>1</td></tr><tr><td><b>Más cartas</b> levantadas</td><td>1</td></tr><tr><td><b>Más oros</b></td><td>1</td></tr><tr><td><b>Más sietes</b></td><td>1</td></tr><tr><td><b>El siete de oros</b> (el velo)</td><td>1</td></tr></table>
<p>Si hay empate arriba en cartas, oros o sietes, nadie se lleva ese punto. Se juega a 21 (o a 11): gana el primero que llega al final de una ronda. En parejas, los puntos se suman entre compañeros.</p>`,
  en: `<p>Played with the 40-card <b>Spanish deck</b>. Each card is worth its number, and the <b>jack counts 8, the knight 9 and the king 10</b>.</p>
<h3>Your turn</h3>
<p>Play one card from your hand. If it and <b>some table cards add up to exactly 15</b>, you take them all (with yours). Otherwise your card stays on the table. <b>If you can capture, you must</b> (but you choose which card to play and, if there are several ways, which cards to take).</p>
<p>If your capture <b>leaves the table empty</b>, that’s an <b>escoba</b> worth 1 point (except on the very last play of the round).</p>
<h3>The round</h3>
<p>You start with 4 cards on the table and 3 in each hand. When hands run out, 3 more are dealt, until the deck is gone. Whatever is left on the table goes to the last player who captured.</p>
<h3>Scoring</h3>
<table><tr><td><b>Escoba</b> · each</td><td>1</td></tr><tr><td><b>Most cards</b> captured</td><td>1</td></tr><tr><td><b>Most coins</b> (oros)</td><td>1</td></tr><tr><td><b>Most sevens</b></td><td>1</td></tr><tr><td><b>Seven of coins</b> (velo)</td><td>1</td></tr></table>
<p>A tie at the top for cards, coins or sevens means nobody gets that point. Games go to 21 (or 11): the first to reach it at the end of a round wins. In pairs, partners’ points add up.</p>`,
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
const OPTS = { n: 2, level: 2, target: 21, ...load('opts', {}) };

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
  sel: null, // carta de mi mano elegida
  pick: new Set(), // cartas de la mesa elegidas
  focus: -1, // carta de la mesa con foco (teclado)
  daily: null,
  overShown: -1,
  roundShown: -1,
  lastRound: null,
  roundWins: [],
  rects: new Map(), // dónde estaba cada carta de mi mano (para animar la jugada)
  origin: new Map(), // de dónde sale una carta nueva de la mesa
  statusLock: false,
  hinted: false,
};
let table = null;
let online = null;

const tableEl = $('table');
const boardEl = $('board');
const handEl = $('hand');
const seatsEl = $('seats');
/** carta → elemento de la mesa; y las que se están yendo (levantadas) y no hay que sacar todavía */
const els = new Map();
const leaving = new Set();
const L = { W: 0, H: 0, tw: 60, hw: 92, bw: 0, bh: 0, bl: 8, bt: 120, sideY: 200, narrow: false };

// ---------------------------------------------------------------- sonidos
const sfx = {
  card() {
    noise(0.05, { freq: 2600, q: 1.2, vol: 0.13, sweep: -1200 });
    noise(0.03, { freq: 900, q: 2, vol: 0.06, at: 0.04 });
  },
  take(k) {
    noise(0.06, { freq: 2200, q: 1.1, vol: 0.1, sweep: -900 });
    notes([587.33, 783.99].slice(0, k > 2 ? 2 : 1), { step: 0.06, dur: 0.12, type: 'triangle', vol: 0.06, at: 0.05 });
  },
  deal(k) {
    for (let i = 0; i < k; i++) noise(0.035, { freq: 3000 + Math.random() * 800, q: 1.4, vol: 0.07, at: i * 0.07, sweep: -1500 });
  },
  shuffle() {
    for (let i = 0; i < 14; i++) noise(0.03, { freq: 2200 + Math.random() * 1400, q: 1.8, vol: 0.05, at: i * 0.028 });
  },
  escoba() {
    noise(0.35, { freq: 1500, q: 0.7, vol: 0.12, sweep: 1500 });
    notes([523.25, 659.25, 783.99, 1046.5, 1318.5], { step: 0.07, dur: 0.22, type: 'square', vol: 0.06, at: 0.1 });
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
const reduced = () => document.documentElement.classList.contains('reduced') || matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  S.pick = new Set();
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
  begin('cpu', cpuSeats(OPTS.n, OPTS.level), { target: OPTS.target });
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
  // la ronda del día sale de la fecha: todos reciben las mismas cartas, y la compu decide con la misma suerte
  const dealFn = (k) => shuffled(DECK, seeded(`escoba:${d.date}:${k}`));
  const seats = [
    { id: 'me', name: t('you'), color: COLORS[0], bot: 0 },
    { id: 'b', name: t('donMate'), color: '#4fd1a5', bot: 2 },
  ];
  begin('daily', seats, { target: 99, rounds: 1, first: 1 }, { dealFn, botRng: seeded(`escoba:${d.date}:compu`) });
}

// ---------------------------------------------------------------- lugares y medidas
const relOf = (v, seat) => (seat - v.me + v.n) % v.n;
/** Dónde se sienta cada uno respecto de mí: 'me' abajo; los demás arriba y a los costados. */
const placeOf = (v, seat) => (v.n === 2 ? ['me', 'top'] : v.n === 3 ? ['me', 'right', 'left'] : ['me', 'right', 'top', 'left'])[relOf(v, seat)];
const mineTeam = (v) => teamOf(v.me, v.n);

const landscapeMQ = matchMedia('(min-width: 820px) and (min-aspect-ratio: 13/10)');
landscapeMQ.addEventListener?.('change', () => {
  measure();
  if (S.v) render(S.v);
});
function measure() {
  const vh = innerHeight - 56;
  const hw = Math.round(clamp(landscapeMQ.matches ? vh * 0.185 : Math.min(innerWidth * 0.24, vh * 0.165), 70, 130));
  document.documentElement.style.setProperty('--hw', `${hw}px`);
  const W = tableEl.clientWidth || innerWidth;
  const H = tableEl.clientHeight || vh * 0.6;
  const n = S.v?.n || 2;
  const tw = Math.round(clamp(Math.min(W * 0.14, H * 0.14), 44, 78));
  document.documentElement.style.setProperty('--tw', `${tw}px`);
  L.W = W;
  L.H = H;
  L.tw = tw;
  L.hw = hw;
  L.narrow = W < 600;
  // el tablero queda debajo del asiento de arriba (si hay) y del tanteador, y entre los asientos de los costados
  const side = n > 2 ? (L.narrow ? 64 : 120) : 8;
  const hud = $('hud');
  const hudBottom = hud.offsetHeight ? hud.offsetTop + hud.offsetHeight + 10 : 0;
  const topSeat = n === 3 ? 0 : Math.round(96 + tw * 0.63);
  L.bl = side;
  L.bt = Math.max(topSeat, hudBottom, 12);
  // los asientos de los costados quedan debajo del tanteador y del mazo
  L.sideY = Math.max(H * 0.42, hudBottom + 52);
  L.bw = Math.max(120, W - 2 * side);
  L.bh = Math.max(80, H - L.bt - 8);
  boardEl.style.setProperty('--bl', `${side}px`);
  boardEl.style.setProperty('--br', `${side}px`);
  boardEl.style.setProperty('--bt', `${L.bt}px`);
  boardEl.style.setProperty('--bb', '8px');
}

/** Acomoda `N` cartas en el tablero: filas parejas y centradas; si son muchas, se achican. */
function boardLayout(N) {
  const W = L.bw, H = L.bh, gap = 9;
  let tw = Math.round(clamp(Math.min(W * 0.19, H * 0.4, landscapeMQ.matches ? 112 : 90), 40, 112));
  let cols = 1;
  for (; tw >= 38; tw -= 2) {
    cols = Math.max(1, Math.floor((W + gap) / (tw + gap)));
    const rows = Math.max(1, Math.floor((H + gap) / (tw * 1.5 + gap)));
    if (cols * rows >= Math.max(N, 1)) break;
  }
  const th = tw * 1.5;
  const rowsUsed = Math.max(1, Math.ceil(N / cols));
  const per = Math.max(1, Math.ceil(N / rowsUsed));
  const pos = [];
  for (let i = 0; i < N; i++) {
    const row = Math.floor(i / per);
    const inRow = Math.min(per, N - row * per);
    const col = i % per;
    const x = (W - (inRow * (tw + gap) - gap)) / 2 + col * (tw + gap) + tw / 2;
    const y = H / 2 - (rowsUsed * (th + gap) - gap) / 2 + row * (th + gap) + th / 2;
    // un poquito torcidas, como cayeron
    pos.push({ x, y, r: (((hashCard(i) % 7) - 3) * 0.7).toFixed(2) });
  }
  return { tw, pos };
}
function hashCard(i) {
  return (i * 2654435761) % 997;
}
/** Centro de un lugar de la mesa, en coordenadas del tablero. */
function seatPoint(v, place) {
  const { W, H } = L;
  let x = W / 2, y = 40;
  if (place === 'right') [x, y] = [W - (L.narrow ? 32 : 60), L.sideY];
  else if (place === 'left') [x, y] = [L.narrow ? 32 : 60, L.sideY];
  else if (place === 'me') [x, y] = [W / 2, H + L.hw * 0.7];
  return { x: x - L.bl, y: y - L.bt };
}
/** Un rectángulo de la pantalla, en coordenadas del tablero. */
function toBoard(r) {
  const br = boardEl.getBoundingClientRect();
  return { x: r.left + r.width / 2 - br.left, y: r.top + r.height / 2 - br.top };
}

// ---------------------------------------------------------------- lo que llega de la mesa
function clearBoard() {
  for (const el of els.values()) el.remove();
  els.clear();
  leaving.clear();
  S.origin.clear();
  boardEl.innerHTML = '';
  handEl.innerHTML = '';
  seatsEl.innerHTML = '';
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
    S.pick = new Set();
    clearBoard();
    hideRound();
  }
  const prev = S.v;
  S.v = v;
  if (!prev || prev.n !== v.n) measure();
  // las cartas de mi mano antes de cambiar (para que la jugada salga de ahí)
  for (const el of handEl.children) S.rects.set(el.dataset.card, el.getBoundingClientRect());
  const fresh = v.ev.filter((e) => e.id > S.lastEv);
  if (fresh.length) S.lastEv = fresh[fresh.length - 1].id;
  const newRound = !!v.hand && v.hand.num !== S.hand;
  if (newRound) {
    S.hand = v.hand.num;
    S.sel = null;
    S.pick = new Set();
    S.focus = -1;
    S.hinted = false;
    hideRound();
  }
  // si dejó de ser mi turno (o cambió lo que hay), la selección ya no vale
  if (S.sel && !v.can.combos[S.sel]) {
    S.sel = null;
    S.pick = new Set();
  } else if (S.sel) S.pick = new Set([...S.pick].filter((c) => v.hand.table.includes(c)));
  fresh.forEach((e) => prepEvent(e, v));
  render(v, { dealing: newRound || fresh.some((e) => e.k === 'deal') });
  fresh.forEach((e) => playEvent(e, v));
  if (v.phase === 'over' && S.overShown !== v.gid) {
    S.overShown = v.gid;
    later(S.mode === 'daily' ? 3000 : 3300, () => S.v === v && S.overShown === v.gid && !$('s-round').classList.contains('on') && showOver(v));
  }
}

function seatName(v, i) {
  return v.seats[i]?.name ?? '';
}
function teamLabel(v, team, short = false) {
  if (v.n === 4) return team === mineTeam(v) ? t(short ? 'usShort' : 'us') : t(short ? 'themShort' : 'them');
  return team === mineTeam(v) ? t('you') : seatName(v, team);
}

/** Antes de dibujar: de dónde sale cada carta nueva y qué cartas se van (levantadas). */
function prepEvent(e, v) {
  if (e.k === 'deal' && e.first) {
    const p = deckPoint();
    e.table.forEach((c) => S.origin.set(c, p));
  } else if (e.k === 'drop') {
    S.origin.set(e.card, playOrigin(v, e.seat, e.card));
  } else if (e.k === 'take') {
    const el = ensureBoardCard(e.card, playOrigin(v, e.seat, e.card));
    const taken = e.take.map((c) => els.get(c)).filter(Boolean);
    leaving.add(e.card);
    for (const c of e.take) leaving.add(c);
    // la carta que se tiró va junto a las que se levantan, se ve la suma un instante y se van todas al montón
    const pts = taken.map(posOf);
    const cx = pts.length ? pts.reduce((a, p) => a + p.x, 0) / pts.length : L.bw / 2;
    const cy = pts.length ? pts.reduce((a, p) => a + p.y, 0) / pts.length : L.bh / 2;
    setPos(el, { x: cx, y: cy + L.tw * 0.55, r: 0 });
    el.style.zIndex = '41';
    for (const c of [...taken, el]) c.classList.add('out');
    const dest = pileTarget(v, e.seat);
    const gid = S.gid;
    later(e.escoba ? 800 : 520, () => {
      if (S.gid !== gid) return;
      for (const c of [e.card, ...e.take]) {
        const x = els.get(c);
        if (!x) continue;
        x.style.left = `${dest.x}px`;
        x.style.top = `${dest.y}px`;
        x.style.transform = 'scale(0.35)';
        x.style.opacity = '0';
      }
      later(430, () => {
        for (const c of [e.card, ...e.take]) {
          els.get(c)?.remove();
          els.delete(c);
          leaving.delete(c);
        }
        if (S.gid === gid && S.v?.hand) renderBoard(S.v);
      });
    });
  } else if (e.k === 'round') {
    // lo que queda en la mesa se lo lleva el último que levantó
    const dest = e.to >= 0 ? pileTargetTeam(v, e.to) : null;
    for (const c of e.left) leaving.add(c);
    const gid = S.gid;
    later(900, () => {
      if (S.gid !== gid) return;
      for (const c of e.left) {
        const x = els.get(c);
        if (!x) continue;
        if (dest) {
          x.style.left = `${dest.x}px`;
          x.style.top = `${dest.y}px`;
          x.style.transform = 'scale(0.35)';
        }
        x.style.opacity = '0';
      }
      later(450, () => {
        for (const c of e.left) {
          els.get(c)?.remove();
          els.delete(c);
          leaving.delete(c);
        }
      });
    });
  }
}
function deckPoint() {
  const r = $('deckchip').getBoundingClientRect();
  return toBoard(r);
}
/** De dónde sale la carta que tira alguien: de mi mano o del lugar de ese jugador. */
function playOrigin(v, seat, card) {
  if (seat === v.me) {
    const r = S.rects.get(card);
    if (r) return toBoard(r);
  }
  return seatPoint(v, placeOf(v, seat));
}
function pileTarget(v, seat) {
  return pileTargetTeam(v, teamOf(seat, v.n), seat);
}
/** Hacia dónde se van las cartas que levanta un equipo: mi montón o el lugar de quien las levantó. */
function pileTargetTeam(v, team, seat = -1) {
  if (team === mineTeam(v)) return toBoard($('mypile').getBoundingClientRect());
  const s = seat >= 0 && teamOf(seat, v.n) === team ? seat : v.seats.findIndex((x, i) => x.team === team && i !== v.me);
  return seatPoint(v, placeOf(v, s < 0 ? (v.me + 1) % v.n : s));
}

function playEvent(e, v) {
  switch (e.k) {
    case 'deal':
      if (e.first) {
        sfx.shuffle();
        later(300, () => sfx.deal(v.n * 3 + 4));
      } else sfx.deal(v.n * 3);
      break;
    case 'drop':
      sfx.card();
      break;
    case 'take':
      sfx.card();
      later(250, () => sfx.take(e.take.length));
      if (e.escoba) {
        later(350, () => {
          sfx.escoba();
          callout(t('escoba'), e.seat === v.me && v.n !== 4 ? t('you') : teamOf(e.seat, v.n) === mineTeam(v) && v.n === 4 ? t('us') : seatName(v, e.seat));
          flashScore(teamOf(e.seat, v.n));
        });
      }
      if (e.seat === v.me) S.hinted = false;
      break;
    case 'round':
      S.lastRound = e;
      S.roundWins.push(e.score.pts.map((p) => p));
      later(2100, () => S.v?.gid === v.gid && showRound(S.v, e));
      break;
    case 'over':
      break;
  }
}

// ---------------------------------------------------------------- dibujo
function render(v, { dealing = false } = {}) {
  if (!v.hand) return;
  renderSeats(v, dealing);
  renderBoard(v);
  renderHand(v, dealing);
  renderSelection();
  renderScore(v);
  renderChips(v);
  $('b-pause').hidden = false;
}

function renderSeats(v, dealing) {
  const h = v.hand;
  const others = v.seats.map((s, i) => i).filter((i) => i !== v.me);
  if (seatsEl.dataset.gid !== String(v.gid) || seatsEl.children.length !== others.length) {
    seatsEl.dataset.gid = String(v.gid);
    seatsEl.innerHTML = others
      .map((i) => {
        const s = v.seats[i];
        const pl = placeOf(v, i);
        const mate = v.n === 4 && teamOf(i, v.n) === mineTeam(v);
        return `<div class="seat ${pl === 'top' ? '' : 'side'} ${pl}" data-seat="${i}">
          <div class="av" style="--c:${esc(s.color)}">${esc([...s.name][0] || '?')}${v.n === 4 ? `<i class="team-dot t${mate ? 0 : 1}"></i>` : ''}<i class="chip-dealer" hidden>${t('dealer')}</i></div>
          <div class="nm">${esc(s.name)}${s.bot ? ` <small>${t('cpu')}</small>` : ''}</div>
          <div class="backs"></div>
          <div class="pilebadge"${mate ? ' hidden' : ''}><img alt="" src="${cardURL(null)}"><b class="pc">0</b><span class="esc" hidden><svg viewBox="0 0 120 60"><use href="#i-broom"/></svg><b>0</b></span></div>
          <div class="bubble"></div>
        </div>`;
      })
      .join('');
  }
  for (const el of seatsEl.children) {
    const i = +el.dataset.seat;
    const s = v.seats[i];
    const pl = placeOf(v, i);
    const p = pl === 'top' ? { x: L.W / 2, y: 10 } : { x: pl === 'right' ? L.W - (L.narrow ? 32 : 60) : L.narrow ? 32 : 60, y: L.sideY };
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    el.classList.toggle('turn', h.actor === i && !h.over);
    el.classList.toggle('away', !!s.away);
    el.querySelector('.chip-dealer').hidden = h.dealer !== i;
    const team = s.team;
    el.querySelector('.pc').textContent = h.piles[team];
    const esc2 = el.querySelector('.esc');
    esc2.hidden = !h.escobas[team];
    esc2.querySelector('b').textContent = h.escobas[team];
    const backs = el.querySelector('.backs');
    const k = s.hand;
    if (backs.children.length !== k || dealing) {
      backs.innerHTML = '';
      for (let j = 0; j < k; j++) {
        const img = document.createElement('img');
        img.src = cardURL(null);
        img.alt = '';
        const off = j - (k - 1) / 2;
        img.style.transform = `translateX(${off * L.tw * 0.28}px) rotate(${off * 9}deg)`;
        if (dealing && !reduced()) img.animate([{ opacity: 0, transform: 'translateY(30px) scale(.6)' }, { opacity: 1 }], { duration: 260, delay: 200 + (j * v.n + relOf(v, i)) * 70, fill: 'backwards', easing: 'ease-out' });
        backs.append(img);
      }
    }
  }
}

function ensureBoardCard(card, from) {
  let el = els.get(card);
  if (el) return el;
  el = document.createElement('div');
  el.className = 'naipe';
  el.dataset.card = card;
  el.innerHTML = `<img alt="" src="${cardURL(card)}">`;
  el.onclick = () => pickTable(card);
  boardEl.append(el);
  els.set(card, el);
  if (from) {
    el.style.transition = 'none';
    setPos(el, { ...from, r: 0 });
    void el.offsetWidth;
    el.style.transition = '';
  }
  return el;
}
function setPos(el, p) {
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
  el.style.transform = `rotate(${p.r}deg)`;
  el.style.opacity = '';
}
const posOf = (el) => ({ x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0 });

function renderBoard(v) {
  const tb = v.hand.table;
  const lay = boardLayout(tb.length);
  const hold = leaving.size > 0; // mientras se van las levantadas, las que quedan esperan en su lugar
  if (!hold) boardEl.style.setProperty('--bw', `${lay.tw}px`);
  const fromDeck = S.origin;
  tb.forEach((c, i) => {
    const isNew = !els.has(c);
    const el = ensureBoardCard(c, fromDeck.get(c) || null);
    fromDeck.delete(c);
    if (leaving.has(c) || (hold && !isNew)) return;
    setPos(el, lay.pos[i]);
    el.style.zIndex = String(2 + i);
    el.classList.remove('out');
  });
  for (const [c, el] of els) {
    if (tb.includes(c) || leaving.has(c)) continue;
    el.remove();
    els.delete(c);
  }
}

function renderHand(v, dealing) {
  const h = v.hand;
  const mine = h.mine;
  const live = !!v.can.play;
  handEl.classList.toggle('idle', !live);
  for (const el of [...handEl.children]) if (!mine.includes(el.dataset.card)) el.remove();
  const k = mine.length;
  const W = handEl.clientWidth || innerWidth;
  const spread = Math.min(L.hw * 0.86, (W - L.hw) / Math.max(1, k - 1));
  mine.forEach((c, i) => {
    let el = handEl.querySelector(`[data-card="${c}"]`);
    const isNew = !el;
    if (!el) {
      el = document.createElement('button');
      el.className = 'naipe';
      el.dataset.card = c;
      el.setAttribute('aria-label', c);
      el.innerHTML = `<img alt="" src="${cardURL(c)}">`;
      el.onclick = () => selectHand(c);
      handEl.append(el);
    }
    const off = i - (k - 1) / 2;
    el.style.left = `${W / 2 + off * spread}px`;
    el.style.setProperty('--tf', `translateY(${Math.abs(off) * 7}px) rotate(${off * 6}deg)`);
    el.style.transform = 'var(--tf)';
    el.style.zIndex = String(i + 1);
    el.classList.toggle('live', live);
    if (isNew && dealing && !reduced()) {
      const dp = deckPoint();
      const br = boardEl.getBoundingClientRect(), hr = handEl.getBoundingClientRect();
      const dx = dp.x + br.left - (hr.left + W / 2 + off * spread), dy = dp.y + br.top - (hr.top + L.hw * 0.75);
      el.animate([{ transform: `translate(${dx}px, ${dy}px) rotate(${-20 + off * 10}deg) scale(.4)`, opacity: 0.4 }, { transform: `translateY(${Math.abs(off) * 7}px) rotate(${off * 6}deg)`, opacity: 1 }], {
        duration: 380,
        delay: 150 + (i * v.n + ((v.me - h.dealer - 1 + v.n) % v.n)) * 80,
        easing: 'cubic-bezier(.2,.8,.3,1)',
        fill: 'backwards',
      });
    }
  });
}

// ---------------------------------------------------------------- elegir lo que se levanta
const combosFor = (card) => S.v?.can.combos[card] || [];
function iCanAct() {
  const v = S.v;
  return !!v && v.phase === 'play' && !!v.can.play && !v.hand.over;
}
/** Las cartas de la mesa que todavía pueden ser parte de la jugada (de alguna forma de levantar que incluya lo ya elegido). */
function candidates() {
  const out = new Set();
  if (!S.sel) return out;
  for (const combo of combosFor(S.sel)) if ([...S.pick].every((c) => combo.includes(c))) for (const c of combo) out.add(c);
  return out;
}
function complete() {
  return combosFor(S.sel).some((cmb) => cmb.length === S.pick.size && cmb.every((c) => S.pick.has(c)));
}
function selectHand(card) {
  if (!iCanAct() || !S.v.hand.mine.includes(card)) return;
  unlock();
  if (S.sel === card) return confirm();
  S.sel = card;
  S.pick = new Set();
  S.focus = -1;
  const cs = combosFor(card);
  if (cs.length === 1) S.pick = new Set(cs[0]);
  sfx.ui();
  renderSelection();
}
function pickTable(card) {
  if (!iCanAct() || !S.sel) return;
  if (!combosFor(S.sel).length) return;
  const el = els.get(card);
  if (S.pick.has(card)) S.pick.delete(card);
  else if (candidates().has(card)) S.pick.add(card);
  else {
    sfx.bad();
    if (el && !reduced()) {
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
    }
    return;
  }
  sfx.pick();
  renderSelection();
}
function cancelSel() {
  if (!S.sel) return;
  S.sel = null;
  S.pick = new Set();
  S.focus = -1;
  renderSelection();
}
function confirm() {
  if (!S.sel || !iCanAct()) return;
  const cs = combosFor(S.sel);
  if (cs.length && !complete()) {
    sfx.bad();
    status(t('st_must'));
    return;
  }
  const msg = { t: 'play', card: S.sel, take: cs.length ? [...S.pick] : [] };
  S.sel = null;
  S.pick = new Set();
  S.focus = -1;
  send(msg);
}
function send(msg) {
  unlock();
  if (S.mode === 'online') online?.send(msg);
  else if (table) table.act(table.seats.findIndex((s) => !s.bot), msg);
}
function hint() {
  const v = S.v;
  if (!iCanAct() || S.mode === 'online' || S.mode === 'daily') return;
  const d = decide(v, 3, Math.random);
  if (!d) return;
  unlock();
  S.sel = d.card;
  S.pick = new Set(d.take);
  S.hinted = true;
  sfx.ui();
  renderSelection();
  status(t('st_hint'));
}

/** Marca en pantalla lo elegido: la carta de la mano, las de la mesa, la suma y los botones. */
function renderSelection() {
  const v = S.v;
  if (!v?.hand) return;
  const live = iCanAct();
  const cs = S.sel ? combosFor(S.sel) : [];
  const cand = S.sel ? candidates() : new Set();
  const focusCards = [...cand];
  for (const [c, el] of els) {
    el.classList.toggle('cand', live && !!S.sel && cand.has(c) && !S.pick.has(c));
    el.classList.toggle('pick', live && !!S.sel && S.pick.has(c));
    el.classList.toggle('focus', S.focus >= 0 && focusCards[S.focus] === c);
  }
  boardEl.classList.toggle('picking', live && !!S.sel && cs.length > 0);
  for (const el of handEl.children) el.classList.toggle('sel', live && S.sel === el.dataset.card);
  // la suma
  const sum = $('sum');
  if (live && S.sel && cs.length && S.pick.size) {
    const parts = [val(S.sel), ...[...S.pick].map(val)];
    const total = parts.reduce((a, b) => a + b, 0);
    sum.textContent = `${parts.join(' + ')} = ${total}${total === 15 ? ' ✓' : ''}`;
    sum.classList.toggle('ok', total === 15);
    sum.hidden = false;
  } else sum.hidden = true;
  renderBar(v);
  renderStatus(v, cs);
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
    if (S.sel) {
      const cs = combosFor(S.sel);
      if (cs.length) items.push(btn(t('b_take'), 'take', confirm, !complete()));
      else items.push(btn(t('b_drop'), 'drop', confirm));
      items.push(btn('✕', 'x', cancelSel));
    } else if (S.mode === 'cpu') items.push(btn(t('b_hint'), 'hint', hint));
  }
  const sig = items.map((b) => b.textContent + b.className + b.disabled).join('|');
  if (bar.dataset.sig === sig) return;
  bar.dataset.sig = sig;
  bar.replaceChildren(...items);
}
function renderStatus(v, cs) {
  const h = v.hand;
  const a = h.actor;
  let st = '';
  if (v.phase !== 'play' || h.over) st = '';
  else if (iCanAct()) {
    if (!S.sel) st = t('st_pick');
    else if (!cs.length) st = t('st_selNone');
    else st = cs.length === 1 ? t('st_sel1') : t('st_selN');
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
  el.dataset.sig = sig;
  el.innerHTML = html + rd;
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
  $('deckn').textContent = h.deck;
  const me = mineTeam(v);
  $('mypile-n').textContent = h.piles[me];
  const esc2 = $('mypile-esc');
  esc2.hidden = !h.escobas[me];
  esc2.innerHTML = h.escobas[me] ? `<svg viewBox="0 0 120 60"><use href="#i-broom"/></svg>${h.escobas[me]}` : '';
}

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
  calloutT = setTimeout(() => el.classList.remove('on'), 1800);
}

// ---------------------------------------------------------------- resultado de la ronda y fin de la partida
let rsTimer = 0;
function hideRound() {
  clearTimeout(rsTimer);
  if ($('s-round').classList.contains('on')) show(null);
}
function showRound(v, e) {
  if (S.roundShown === e.id || !$('s-round')) return;
  S.roundShown = e.id;
  const sc = e.score;
  const me = mineTeam(v);
  const teams = [me, ...Array.from({ length: v.nt }, (_, i) => i).filter((i) => i !== me)];
  const over = v.phase === 'over';
  $('rs-kicker').textContent = t('rsKicker', { n: e.num + 1 });
  $('rs-title').textContent = t('rsTitle');
  const cell = (val2, win, cls = '') => `<span class="c ${cls} ${win ? 'win' : ''}">${val2}</span>`;
  const row = (label, cells, cls = '') => `<div class="row ${cls}" style="--nt:${teams.length};animation-delay:${(rowIdx++ * 0.06).toFixed(2)}s"><span>${label}</span>${cells}</div>`;
  let rowIdx = 0;
  const heads = `<div class="row head" style="--nt:${teams.length}"><span></span>${teams.map((tm) => `<span>${esc(teamLabel(v, tm, true))}</span>`).join('')}</div>`;
  const rows = [
    row(t('rsEscobas'), teams.map((tm) => cell(sc.escobas[tm] ? `+${sc.escobas[tm]}` : '–', sc.escobas[tm] > 0, 'esc')).join('')),
    row(t('rsCartas'), teams.map((tm) => cell(sc.cards[tm], sc.win.cards === tm)).join('')),
    row(t('rsOros'), teams.map((tm) => cell(sc.oros[tm], sc.win.oros === tm)).join('')),
    row(t('rsSietes'), teams.map((tm) => cell(sc.sietes[tm], sc.win.sietes === tm)).join('')),
    row(t('rsVelo'), teams.map((tm) => cell(sc.velo === tm ? '✓' : '–', sc.velo === tm)).join('')),
    row(t('rsRound'), teams.map((tm) => cell(`+${sc.pts[tm]}`, false)).join(''), 'total'),
    row(t('rsTotal'), teams.map((tm) => cell(e.totals[tm] + (v.rounds ? '' : ` <small>/${v.target}</small>`), false)).join(''), 'grand'),
  ];
  let extra = '';
  if (e.left.length && e.to >= 0) extra = `<p class="sub small">${esc(t('rsLeft', { name: teamLabel(v, e.to) }))}</p>`;
  $('rs-table').innerHTML = heads + rows.join('') + extra;
  const nb = $('b-next');
  nb.disabled = false;
  $('b-next-t').textContent = over ? t('nextFinal') : t('next');
  nb.dataset.over = over ? '1' : '';
  const cd = $('rs-count');
  cd.hidden = over;
  if (!over) {
    cd.classList.remove('run');
    void cd.offsetWidth;
    cd.style.setProperty('--cd', `${PACE.ROUND / 1000}s`);
    cd.classList.add('run');
  }
  show('round');
  (sc.pts[me] >= Math.max(...sc.pts) ? sfx.point : sfx.lose)();
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
      const rounds = S.roundWins.filter((p) => p[tm] === Math.max(...p)).length;
      return `<div class="${tm === w ? 'win' : ''}"><span class="h">${esc(teamLabel(v, tm))}</span><span class="n">${v.scores[tm]}</span>${v.n === 4 ? `<span class="who">${esc(who(tm))}</span>` : ''}<span class="who">${rounds} ${t('roundsWon')}</span></div>`;
    })
    .join('');
}

function finishDaily(v) {
  const d = S.daily || dailyInfo();
  const sc = S.lastRound?.score;
  const a = v.scores[0], b = v.scores[1];
  const won = a > b;
  const stats = record(ID, 'all', { date: d.date, won, score: clamp(a - b, 0, 9) });
  const marks = sc ? ['cards', 'oros', 'sietes', 'velo'].map((k) => (sc.win[k] === 0 ? 1 : sc.win[k] === 1 ? -1 : 0)) : [];
  saveDay(ID, 'all', { won, a, b, esc: sc ? sc.escobas[0] : 0, marks }, d.date);
  markPortal(ID, { date: d.date, done: true, won, streak: stats.streak });
  (won ? sfx.win : sfx.lose)();
  showDailyResult(dailyInfo(), stats);
}
let dayTimer = 0;
const markRow = (marks) => (marks || []).map((m) => (m > 0 ? '🟩' : m < 0 ? '🟥' : '⬜')).join('');
function showDailyResult(d, stats = null) {
  const rec = d.rec;
  if (!rec) return;
  const st = stats || loadStats(ID, 'all');
  const k = rec.a > rec.b ? 'dailyWon' : rec.a < rec.b ? 'dailyLost' : 'dailyTie';
  $('over-kicker').textContent = t('dailyKicker', { n: d.n });
  $('over-title').textContent = t(k, { a: rec.a, b: rec.b });
  const labels = ['mkCartas', 'mkOros', 'mkSietes', 'mkVelo'];
  $('over-final').innerHTML = `<div class="${rec.won ? 'win' : ''} marks">${(rec.marks || []).map((m, i) => `<span><i>${m > 0 ? '🟩' : m < 0 ? '🟥' : '⬜'}</i><small>${esc(t(labels[i]))}</small></span>`).join('')}${rec.esc ? `<em>${esc(t('rsEscobas'))}: ${rec.esc}</em>` : ''}</div>`;
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
  const r = await share(`game.it · ${t('title')} #${d.n}\n🧹 ${t(k, { a: d.rec.a, b: d.rec.b })}\n${markRow(d.rec.marks)}${d.rec.esc ? ` +${d.rec.esc}🧹` : ''}\n${shareLink(ID)}`);
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
  $('logo').innerHTML = [`1o`, `7o`, `1b`].map((c) => `<img alt="" src="${cardURL(c)}">`).join('') + `<svg class="logo-broom" viewBox="0 0 120 60"><use href="#i-broom"/></svg>`;
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
const nHelp = () => ($('o-n-help').textContent = t(OPTS.n === 4 ? 'fHelp4' : OPTS.n === 3 ? 'fHelp3' : 'fHelp2'));
bindSeg('o-n', 'n', nHelp);
bindSeg('o-level', 'level');
bindSeg('o-target', 'target');
function syncOpts() {
  syncSeg('o-n', OPTS.n);
  syncSeg('o-level', OPTS.level);
  syncSeg('o-target', OPTS.target);
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
  $('lobby-start').hidden = !online.isHost;
  const err = people.length < 2 ? t('needPlayers') : people.length > n ? t('tooMany') : '';
  $('lobby-status').textContent = online.isHost ? err : t('waitingHost');
  $('lobby-status').style.color = online.isHost ? '' : 'var(--ink2)';
  show('lobby');
}

// ---------------------------------------------------------------- teclado y mando
/** Mueve el foco entre las cartas de la mesa que se pueden elegir (teclado y mando). */
function moveFocus(dir) {
  const c = [...candidates()];
  if (!c.length) return;
  S.focus = S.focus < 0 ? (dir > 0 ? 0 : c.length - 1) : (S.focus + dir + c.length) % c.length;
  renderSelection();
}
function toggleFocused() {
  const c = [...candidates()];
  if (S.focus >= 0 && c[S.focus]) pickTable(c[S.focus]);
  else if (S.sel && complete()) confirm();
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
  if (/^[1-3]$/.test(k)) {
    const c = v.hand.mine[+k - 1];
    if (c) selectHand(c);
  } else if (k === 'arrowleft' || k === 'arrowright') {
    e.preventDefault();
    if (!S.sel) {
      const m = v.hand.mine;
      if (m.length && iCanAct()) selectHand(m[k === 'arrowleft' ? 0 : m.length - 1]);
    } else moveFocus(k === 'arrowleft' ? -1 : 1);
  } else if (k === ' ') {
    e.preventDefault();
    if (S.sel) toggleFocused();
  } else if (k === 'enter') {
    e.preventDefault();
    if (S.sel) confirm();
  } else if (k === 'h') hint();
  else if (k === 'escape') {
    if (S.sel) cancelSel();
    else pause();
  } else if (k === 'p') pause();
});
const padPrev = [];
let padHand = 0;
function pollPad() {
  const gp = navigator.getGamepads?.()?.find((g) => g && g.connected);
  if (!gp) return;
  const b = (i) => !!gp.buttons[i]?.pressed;
  const pressed = (i) => b(i) && !padPrev[i];
  const v = S.v;
  const live = v && !$$('.screen.on').length;
  if (live && iCanAct()) {
    const m = v.hand.mine;
    const dir = pressed(15) || pressed(5) ? 1 : pressed(14) || pressed(4) ? -1 : 0;
    if (dir) {
      if (!S.sel) {
        padHand = (padHand + dir + m.length) % m.length;
        selectHand(m[padHand]);
      } else moveFocus(dir);
    }
    if (pressed(0)) {
      if (!S.sel) selectHand(m[padHand] || m[0]);
      else if (S.focus >= 0) toggleFocused();
      else confirm();
    }
    if (pressed(2) && S.sel) confirm();
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
  const showClock = S.mode === 'online' && v && v.phase === 'play' && v.turnMs && v.hand?.actor === v.me;
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
  document.documentElement.classList.toggle('reduced', !!p.reducedMotion);
  $$('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t)));
  renderRules();
  refreshHome();
  nHelp();
  if (S.v) render(S.v);
  if (online?.room && document.querySelector('#s-lobby.on')) applyRoom(online.room);
}, true);

$('deckimg').src = cardURL(null);
$('mypile-img').src = cardURL(null);
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
  window.__escoba = {
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
    selectHand,
    pickTable,
    confirm,
    hint,
    timers,
    OPTS,
    L,
    /** Una partida contra la compu con la baraja de cada ronda ya elegida (para armar escenas): deck = lista de 40 cartas. */
    startDeck(deck, n = 2, opts = {}) {
      begin('cpu', cpuSeats(n, OPTS.level), { target: 21, first: n - 1, ...opts }, { dealFn: () => deck });
    },
    /** La compu juega por mí (como si estuviera ausente) hasta el final. */
    autoplay() {
      if (!table) return;
      table.seats.forEach((s, i) => !s.bot && table.setAway(i, true));
    },
  };
G.ready();
