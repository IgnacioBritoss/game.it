/* Generala — game.it
 * El juego de dados de toda la vida: cinco dados y tres tiradas por turno para armar escalera, full, póker o
 * generala, y una planilla que se va llenando. Contra la compu (tres niveles), de a varios en la misma pantalla,
 * online de 2 a 6 (el servidor tira los dados) y la generala del día con los mismos dados para todos.
 * Reglas en shared/rules.js, la compu en shared/bot.js, la mesa (turnos, tiempo, lo que ve cada uno) en
 * shared/table.js y la mesa 3D con el cubilete en scene.js.
 */
import { CATS, ROUNDS, MAX_ROLLS, scoreFor, counts, isStraight, isFull, isPoker, isGenerala } from './shared/rules.js';
import { Table } from './shared/table.js';
import { DiceTable } from './scene.js';
import { OnlineRoom, netText, defaultName, share as shareRoom, roomFromUrl } from '/shared/online.js';
import { tone, noise, notes, unlock } from '/shared/sfx.js';
import { today, dayNumber, msUntilNext, fmtClock, loadDay, saveDay, record, loadStats, markPortal, share, shareLink, rng as seeded } from '/shared/daily.js';

const G = window.GameIt;
const ID = 'generala';
const EPOCH = '2026-10-27';
const DEBUG = /[?&]debug\b/.test(location.search);
const $ = (id) => document.getElementById(id);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------------------------------------------------------------- textos
const TXT = {
  title: { es: 'Generala', en: 'Generala' },
  tagline: { es: 'Cinco dados, tres tiradas y una planilla. ¿Sale la generala?', en: 'Five dice, three rolls and a score sheet. Will you roll a Generala?' },
  vsCpu: { es: 'Contra la compu', en: 'Against the computer' },
  vsCpuSub: { es: 'de 1 a 3 rivales', en: '1 to 3 opponents' },
  local: { es: 'Misma pantalla', en: 'Pass and play' },
  localSub: { es: 'de 2 a 6, pasando el celu', en: '2 to 6 on one device' },
  localHelp: { es: 'Se juega en este dispositivo: cada uno tira en su turno.', en: 'Everyone plays on this device, taking turns.' },
  online: { es: 'Online', en: 'Online' },
  onlineSub: { es: 'de 2 a 6 jugadores', en: '2 to 6 players' },
  onlineLong: { es: 'Creá una sala y compartí el código, o entrá con el código de un amigo. Los dados los tira el servidor.', en: 'Create a room and share the code, or join a friend’s room. The server rolls the dice.' },
  daily: { es: 'Generala del día', en: 'Daily Generala' },
  dailySub: { es: 'n.º {n} · los mismos dados para todos', en: '#{n} · the same dice for everyone' },
  dailyDone: { es: 'n.º {n} · ✓ {p} puntos', en: '#{n} · ✓ {p} points' },
  rulesTitle: { es: 'Cómo se juega', en: 'How to play' },
  rivals: { es: 'Rivales', en: 'Opponents' },
  level: { es: 'Nivel', en: 'Level' },
  lv1: { es: 'Fácil', en: 'Easy' },
  lv2: { es: 'Normal', en: 'Normal' },
  lv3: { es: 'Difícil', en: 'Hard' },
  servidaOpt: { es: 'Generala servida gana', en: 'Natural Generala wins' },
  yes: { es: 'Sí', en: 'Yes' },
  no: { es: 'No', en: 'No' },
  players: { es: 'Jugadores', en: 'Players' },
  playerN: { es: 'Jugador {n}', en: 'Player {n}' },
  go: { es: '¡A jugar!', en: 'Let’s play!' },
  back: { es: '← volver', en: '← back' },
  create: { es: 'Crear sala', en: 'Create room' },
  createSub: { es: 'y compartir el código', en: 'and share the code' },
  join: { es: 'Entrar', en: 'Join' },
  room: { es: 'Sala', en: 'Room' },
  tapToCopy: { es: 'Tocá el código para copiar el link', en: 'Tap the code to copy the link' },
  addCpu: { es: 'Sumar compus', en: 'Add CPUs' },
  start: { es: 'Empezar', en: 'Start' },
  leave: { es: 'Salir de la sala', en: 'Leave room' },
  host: { es: 'anfitrión', en: 'host' },
  cpu: { es: 'compu', en: 'CPU' },
  you: { es: 'Vos', en: 'You' },
  youLower: { es: 'vos', en: 'you' },
  needPlayers: { es: 'Hacen falta al menos 2 (podés sumar compus).', en: 'You need at least 2 (you can add CPUs).' },
  waitingHost: { es: 'Esperando que el anfitrión empiece…', en: 'Waiting for the host to start…' },
  copied: { es: '¡Link copiado!', en: 'Link copied!' },
  gotIt: { es: '¡Entendido!', en: 'Got it!' },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'Seguir', en: 'Resume' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  menu: { es: 'Menú', en: 'Menu' },
  roll: { es: 'Tirar', en: 'Roll' },
  rollAgain: { es: 'Tirar de nuevo', en: 'Roll again' },
  rollDone: { es: 'Anotá', en: 'Score it' },
  waitFor: { es: 'Juega {name}…', en: '{name} is playing…' },
  stRoll: { es: 'Tocá Tirar o el cubilete', en: 'Tap Roll or the dice cup' },
  stHold: { es: 'Tocá los dados que querés guardar, o anotá', en: 'Tap the dice you want to keep, or score' },
  stWrite: { es: 'Elegí dónde anotar en la planilla', en: 'Pick where to score on the sheet' },
  stAllHeld: { es: 'Soltá algún dado para tirar', en: 'Release a die to roll' },
  stThinking: { es: '{name} está pensando…', en: '{name} is thinking…' },
  stAway: { es: '{name} se desconectó: juega la compu por ahora', en: '{name} disconnected: the CPU plays for now' },
  turnOf: { es: 'Turno de {name}', en: '{name}’s turn' },
  yourTurn: { es: '¡Tu turno!', en: 'Your turn!' },
  sheetOf: { es: 'Planilla de', en: 'Score sheet:' },
  totalW: { es: 'Total', en: 'Total' },
  play: { es: 'Jugada', en: 'Category' },
  write: { es: 'Anotar {p} en {c}', en: 'Score {p} in {c}' },
  scratch: { es: 'Tachar {c}', en: 'Scratch {c}' },
  servida: { es: 'servida', en: 'natural' },
  scratched: { es: '{name} tachó {c}', en: '{name} scratched {c}' },
  generalaServida: { es: '¡Generala servida!', en: 'Natural Generala!' },
  winsGame: { es: 'gana la partida', en: 'wins the game' },
  youWin: { es: '¡Ganaste!', en: 'You win!' },
  winner: { es: '¡Ganó {name}!', en: '{name} wins!' },
  tie: { es: '¡Empate!', en: 'It’s a tie!' },
  overKicker: { es: 'Fin de la partida', en: 'Game over' },
  rematch: { es: 'Revancha', en: 'Rematch' },
  again: { es: 'Otra partida', en: 'Play again' },
  waitAgain: { es: 'Esperando al anfitrión', en: 'Waiting for the host' },
  pts: { es: 'puntos', en: 'points' },
  dailyKicker: { es: 'Generala del día · n.º {n}', en: 'Daily Generala · #{n}' },
  dailyTitle: { es: '{p} puntos', en: '{p} points' },
  stPlayed: { es: 'jugadas', en: 'played' },
  stStreak: { es: 'racha', en: 'streak' },
  stBest: { es: 'mejor', en: 'best' },
  nextDaily: { es: 'La próxima, en', en: 'Next one in' },
  share: { es: 'Compartir', en: 'Share' },
  sharedOk: { es: '¡Listo para pegar!', en: 'Ready to paste!' },
  rules: {
    es: [
      'Cada turno tenés hasta <b>tres tiradas</b>. Después de cada una podés guardar los dados que quieras (tocándolos) y volver a tirar el resto.',
      'Al final del turno anotás la jugada en un casillero libre de tu planilla. Si no te sirve ninguno, tachás uno (vale 0).',
      'Si la jugada sale en la primera tirada es <b>servida</b> y vale 5 más. La generala servida gana la partida en el acto (se puede desactivar).',
      'La <b>doble</b> es una segunda generala con la primera ya anotada (si la tachaste, no vale). Gana el que suma más al llenar los once casilleros.',
    ],
    en: [
      'Each turn you get up to <b>three rolls</b>. After each one you can keep any dice (tap them) and roll the rest again.',
      'At the end of your turn, write the result in a free box of your sheet. If nothing fits, scratch one (it scores 0).',
      'A hand rolled on the first throw is <b>natural</b> and scores 5 more. A natural Generala wins the game on the spot (you can turn this off).',
      'The <b>double</b> is a second Generala once the first one is written (not if you scratched it). Highest total after the eleven boxes wins.',
    ],
  },
};
const CATNAME = {
  1: { es: 'Unos', en: 'Ones' },
  2: { es: 'Doses', en: 'Twos' },
  3: { es: 'Treses', en: 'Threes' },
  4: { es: 'Cuatros', en: 'Fours' },
  5: { es: 'Cincos', en: 'Fives' },
  6: { es: 'Seises', en: 'Sixes' },
  E: { es: 'Escalera', en: 'Straight' },
  F: { es: 'Full', en: 'Full house' },
  P: { es: 'Póker', en: 'Four of a kind' },
  G: { es: 'Generala', en: 'Generala' },
  D: { es: 'Doble', en: 'Double' },
};
const CATHINT = { E: '20/25', F: '30/35', P: '40/45', G: '50', D: '100' };
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (v) for (const x in v) s = s.replaceAll(`{${x}}`, v[x]);
  return s;
};
const cname = (c) => G.t(CATNAME[c]);

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
const OPTS = { rivals: 1, level: 2, servida: 1, count: 2, names: [], ...load('opts', {}) };

const COLORS = ['#ffc93c', '#ff7a59', '#4fd1a5', '#6fb7ff', '#d9a6ff', '#ff9ec7'];
const BOT_NAMES = ['Coco', 'Tota', 'Pocho', 'Lula', 'Beto', 'Chiqui', 'Nico', 'Mimí'];

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

// ---------------------------------------------------------------- estado
const S = {
  mode: null, // cpu | local | online | daily
  v: null,
  gid: -1,
  evn: -1,
  rolling: false,
  held: [false, false, false, false, false],
  sel: null,
  viewSeat: 0,
  daily: null,
  overShown: -1,
  idleT: 2,
  padDie: -1,
};
let table = null;
let online = null;

const scene = new DiceTable($('stage'));
scene.onHit = (v) => sfx.hit(v);
new ResizeObserver(() => scene.resize($('stage').clientWidth || 1, $('stage').clientHeight || 1)).observe($('stage'));

// ---------------------------------------------------------------- sonidos
const sfx = {
  shake() {
    for (let i = 0; i < 8; i++) noise(0.045, { freq: 1300 + Math.random() * 1600, q: 2.2, vol: 0.12, at: i * 0.05 });
  },
  hit(v) {
    noise(0.03, { freq: 2400 + Math.random() * 1200, q: 3, vol: 0.16 * v });
    tone(950, 700, 0.035, { type: 'triangle', vol: 0.035 * v });
  },
  hold: (on) => (on ? tone(700, 1050, 0.06, { type: 'triangle', vol: 0.06 }) : tone(850, 540, 0.06, { type: 'triangle', vol: 0.05 })),
  write() {
    noise(0.14, { freq: 3400, q: 1.1, vol: 0.06, sweep: -1400 });
    noise(0.08, { freq: 2800, q: 1.4, vol: 0.05, at: 0.12, sweep: 900 });
  },
  turn: () => notes([660, 880], { step: 0.08, dur: 0.13, vol: 0.07 }),
  big: () => notes([523.25, 659.25, 783.99, 1046.5], { step: 0.08, dur: 0.28, type: 'square', vol: 0.06 }),
  generala: () => notes([523.25, 659.25, 783.99, 1046.5, 1318.5, 1568], { step: 0.085, dur: 0.42, type: 'square', vol: 0.075 }),
  zero: () => tone(320, 170, 0.28, { type: 'sawtooth', vol: 0.045 }),
  win: () => notes([523.25, 659.25, 783.99, 1046.5, 1318.5], { step: 0.1, dur: 0.3, type: 'triangle', vol: 0.09 }),
  lose: () => notes([440, 370, 294], { step: 0.14, dur: 0.3, type: 'triangle', vol: 0.06 }),
  ui: () => tone(900, 640, 0.045, { type: 'square', vol: 0.035 }),
};

// ---------------------------------------------------------------- pantallas
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  const playing = !id && !!S.mode;
  G.gameplay(playing);
}
function setPlaying(on) {
  document.body.classList.toggle('playing', on);
}

// ---------------------------------------------------------------- empezar
function localIo(viewOf) {
  return {
    emit: (i) => {
      // en esta pantalla se dibuja una sola vez por cambio (el primer humano recibe y se arma la vista)
      if (i === table.seats.findIndex((s) => !s.bot)) onView(viewOf());
    },
    timer: (k, ms, fn) => timers.set(k, ms, fn),
    clear: (k) => timers.clear(k),
    over: () => {},
  };
}
function begin(mode, seats, opts, dieFn = null) {
  timers.clearAll();
  timers.resume();
  if (online && mode !== 'online') {
    online.leave();
    online = null;
  }
  S.mode = mode;
  S.gid = -1;
  S.evn = -1;
  S.sel = null;
  S.overShown = -1;
  S.held = [false, false, false, false, false];
  const viewOf = mode === 'local' ? () => table.view(table.t ? table.t.seat : 0) : () => table.view(0);
  table = new Table({ seats, opts, io: localIo(viewOf), rng: Math.random, dieFn });
  setPlaying(true);
  show(null);
  table.start();
}
function startCpu() {
  const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
  const seats = [{ id: 'me', name: t('you'), color: COLORS[0], bot: 0 }];
  for (let i = 0; i < OPTS.rivals; i++) seats.push({ id: `b${i}`, name: names[i], color: COLORS[i + 1], bot: OPTS.level });
  begin('cpu', seats, { servida: !!OPTS.servida });
}
function startLocal() {
  const seats = [];
  for (let i = 0; i < OPTS.count; i++) seats.push({ id: `p${i}`, name: (OPTS.names[i] || '').trim() || t('playerN', { n: i + 1 }), color: COLORS[i], bot: 0 });
  begin('local', seats, { servida: !!OPTS.servida });
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
  // cada dado de cada tirada de cada turno sale de la fecha: todos ven los mismos dados
  const dieFn = (turn, roll, die) => 1 + Math.floor(seeded(`generala:${d.date}:${turn}:${roll}:${die}`)() * 6);
  begin('daily', [{ id: 'me', name: t('you'), color: COLORS[0], bot: 0 }], { servida: false, first: 0 }, dieFn);
}

// ---------------------------------------------------------------- lo que llega de la mesa
function onView(v) {
  if (v.gid !== S.gid) {
    S.gid = v.gid;
    S.evn = -1;
    S.rolling = false;
    S.sel = null;
    S.overShown = -1;
    scene.set(v.dice, [false, false, false, false, false], false);
  }
  S.v = v;
  if (v.evn !== S.evn) {
    S.evn = v.evn;
    playEvent(v.ev, v);
  } else if (!S.rolling && !iCanAct()) {
    // los demás marcan dados para guardar
    v.held.forEach((h, i) => scene.setHeld(i, h));
  }
  render();
  if (v.phase === 'over' && S.overShown !== v.gid) {
    S.overShown = v.gid;
    setTimeout(() => S.v === v && showOver(v), v.result?.servida >= 0 ? 2600 : 1700);
  }
}

function seatName(v, i) {
  return v.seats[i]?.name ?? '';
}
function isMine(v, seat) {
  if (!v) return false;
  if (S.mode === 'local') return !v.seats[seat]?.bot;
  return seat === v.me;
}

function playEvent(ev, v) {
  if (!ev) return;
  if (ev.k === 'start' || ev.k === 'turn') {
    S.held = [false, false, false, false, false];
    S.sel = null;
    scene.mark(null);
    scene.gather();
    if (S.mode === 'local' || isMine(v, ev.seat)) S.viewSeat = ev.seat;
    else if (S.mode !== 'local') S.viewSeat = v.me;
    banner(v, ev.seat);
    if (isMine(v, ev.seat)) sfx.turn();
  } else if (ev.k === 'roll') {
    S.rolling = true;
    S.sel = null;
    scene.mark(null);
    S.held = ev.held.slice();
    sfx.shake();
    const gid = S.gid;
    scene.roll(ev.dice, ev.held, () => {
      if (S.gid !== gid) return;
      S.rolling = false;
      announceRoll(ev, S.v);
      render();
    });
  } else if (ev.k === 'score') {
    S.sel = null;
    scene.mark(null);
    sfx.write();
    flashCell(ev.seat, ev.cat);
    const who = seatName(v, ev.seat);
    if (ev.pts === 0) {
      sfx.zero();
      callout(t('scratched', { name: isMine(v, ev.seat) && S.mode !== 'local' ? t('you') : who, c: cname(ev.cat) }), '', 'grey', true);
    } else if (ev.cat === 'G' && v.result?.servida === ev.seat) {
      sfx.generala();
      scene.celebrate();
      callout(t('generalaServida'), `${who} ${t('winsGame')}`, 'gold');
    } else if ('EFPGD'.includes(ev.cat)) {
      if (ev.cat === 'G' || ev.cat === 'D') {
        sfx.generala();
        scene.celebrate();
      } else sfx.big();
      callout(`¡${cname(ev.cat)}${ev.servida ? ' ' + t('servida') : ''}!`, `${who} +${ev.pts}`, ev.cat === 'G' || ev.cat === 'D' ? 'gold' : '');
    }
  }
}

/** Después de una tirada propia: si salió algo grande, se festeja antes de anotar. */
function announceRoll(ev, v) {
  if (!v) return;
  const c = counts(ev.dice);
  const first = ev.roll === 1;
  if (isGenerala(c)) {
    scene.celebrate();
    sfx.generala();
    callout(first ? t('generalaServida') : `¡${cname('G')}!`, '', 'gold');
  } else if (first && (isPoker(c) || isFull(c) || isStraight(ev.dice))) {
    const cat = isPoker(c) ? 'P' : isFull(c) ? 'F' : 'E';
    sfx.big();
    callout(`¡${cname(cat)} ${t('servida')}!`, '', '');
  }
}

// ---------------------------------------------------------------- acciones
function iCanAct() {
  const v = S.v;
  return !!v && v.phase === 'play' && !v.done && isMine(v, v.turn) && !(S.mode === 'online' && v.seats[v.turn]?.away);
}
function send(msg) {
  if (S.mode === 'online') online?.send(msg);
  else table?.act(table.t?.seat ?? 0, msg);
}
function doRoll() {
  const v = S.v;
  if (!iCanAct() || S.rolling || v.roll >= MAX_ROLLS) return;
  if (v.roll > 0 && S.held.every(Boolean)) {
    status(t('stAllHeld'));
    return;
  }
  unlock();
  send({ t: 'roll', hold: S.held.slice() });
}
function toggleHold(i) {
  const v = S.v;
  if (!iCanAct() || S.rolling || v.roll === 0 || v.roll >= MAX_ROLLS) return;
  S.held[i] = !S.held[i];
  scene.setHeld(i, S.held[i]);
  sfx.hold(S.held[i]);
  if (S.mode === 'online') online.send({ t: 'hold', hold: S.held.slice() });
  else table.hold(S.held.slice());
  render();
}
function canWrite() {
  const v = S.v;
  return iCanAct() && !S.rolling && v.roll >= 1;
}
function selectCat(cat) {
  const v = S.v;
  if (!canWrite() || v.seats[v.turn].sheet[cat] !== undefined) return;
  S.sel = S.sel === cat ? null : cat;
  scene.mark(S.sel ? markFor(S.sel, v.dice) : null);
  sfx.ui();
  render();
}
function confirmWrite() {
  if (!S.sel || !canWrite()) return;
  const cat = S.sel;
  S.sel = null;
  send({ t: 'score', cat });
}
/** Qué dados cuentan para una categoría (para resaltarlos). */
function markFor(cat, dice) {
  const c = counts(dice);
  if (cat >= '1' && cat <= '6') return dice.map((d) => d === +cat);
  if (cat === 'P') {
    const n = c.findIndex((k) => k >= 4);
    return dice.map((d) => d === n);
  }
  const ok = cat === 'E' ? isStraight(dice) : cat === 'F' ? isFull(c) : isGenerala(c);
  return dice.map(() => ok);
}

// ---------------------------------------------------------------- dibujo de la interfaz
function render() {
  const v = S.v;
  if (!v) return;
  renderPlayers(v);
  renderAction(v);
  renderSheet(v);
  $('b-pause').hidden = false;
}

function renderPlayers(v) {
  const box = $('players');
  const html = v.seats
    .map((s, i) => {
      const cls = ['chip', v.turn === i && v.phase === 'play' ? 'turn' : '', S.viewSeat === i && !wide() ? 'view' : '', s.away ? 'away' : ''].join(' ');
      const tag = s.bot ? `<small>${t('cpu')}</small>` : isMine(v, i) && S.mode === 'online' ? `<small>(${t('youLower')})</small>` : '';
      return `<button class="${cls}" data-seat="${i}"><i style="background:${esc(s.color)}"></i>${esc(s.name)} ${tag}<b>${s.total}</b></button>`;
    })
    .join('');
  if (box.innerHTML !== html) {
    box.innerHTML = html;
    for (const b of $$('.chip', box))
      b.onclick = () => {
        S.viewSeat = +b.dataset.seat;
        render();
      };
    box.querySelector('.turn')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }
}

function renderAction(v) {
  const btn = $('b-roll');
  const mine = iCanAct();
  const left = MAX_ROLLS - v.roll;
  $$('#roll-dots b').forEach((b, i) => b.classList.toggle('used', i < v.roll));
  let label, st = '';
  if (v.phase !== 'play') label = t('roll');
  else if (!isMine(v, v.turn) || (S.mode === 'online' && v.seats[v.turn]?.away)) {
    label = t('waitFor', { name: seatName(v, v.turn) });
    const s = v.seats[v.turn];
    st = s.away ? t('stAway', { name: s.name }) : s.bot ? t('stThinking', { name: s.name }) : '';
  } else if (v.roll === 0) {
    label = t('roll');
    st = t('stRoll');
  } else if (left > 0) {
    label = t('rollAgain');
    st = S.held.every(Boolean) ? t('stAllHeld') : t('stHold');
  } else {
    label = t('rollDone');
    st = t('stWrite');
  }
  $('roll-t').textContent = label;
  btn.disabled = !mine || S.rolling || v.done || left <= 0 || (v.roll > 0 && S.held.every(Boolean));
  btn.classList.toggle('pulse', mine && v.roll === 0 && !S.rolling);
  if (!S.statusLock) $('status').textContent = S.rolling ? '' : st;
  scene.cup.hover = mine && v.roll === 0 && !S.rolling ? 1 : 0;
}
function status(txt) {
  $('status').textContent = txt;
  S.statusLock = true;
  clearTimeout(S.statusT);
  S.statusT = setTimeout(() => {
    S.statusLock = false;
    render();
  }, 1600);
}

const wideMQ = matchMedia('(min-width: 860px) and (min-aspect-ratio: 1/1)');
const wide = () => wideMQ.matches;
wideMQ.addEventListener?.('change', () => render());

/** Puntos que daría anotar ahora cada categoría libre del jugador de turno (solo si lo controla esta pantalla). */
function previews(v) {
  if (!canWrite()) return null;
  const sheet = v.seats[v.turn].sheet;
  const out = {};
  for (const c of CATS) if (sheet[c] === undefined) out[c] = scoreFor(c, v.dice, v.roll === 1, sheet);
  return out;
}

function renderSheet(v) {
  const pv = previews(v);
  const body = $('sheet-body');
  if (wide()) {
    $('sheet-head').innerHTML = `<span>${t('play')}</span><b>${t('title')}</b>`;
    const head = `<tr><th></th>${v.seats.map((s, i) => `<th class="${v.turn === i && v.phase === 'play' ? 'turn' : ''}"><i style="background:${esc(s.color)}"></i>${esc(s.name)}</th>`).join('')}</tr>`;
    const rows = CATS.map((c) => {
      const cells = v.seats
        .map((s, i) => {
          const val = s.sheet[c];
          if (val !== undefined) return `<td class="v ${val === 0 ? 'zero' : ''} ${v.turn === i ? 'turncol' : ''}" data-flash="${i}:${c}">${val === 0 ? '✗' : val}</td>`;
          if (pv && i === v.turn) return `<td class="v can ${pv[c] === 0 ? 'nil' : ''} ${S.sel === c ? 'sel' : ''}" data-cat="${c}" data-flash="${i}:${c}">${pv[c] === 0 ? '✗' : pv[c]}</td>`;
          return `<td class="v ${v.turn === i ? 'turncol' : ''}" data-flash="${i}:${c}"></td>`;
        })
        .join('');
      return `<tr><td class="k">${cname(c)}${CATHINT[c] ? `<small>${CATHINT[c]}</small>` : ''}</td>${cells}</tr>`;
    }).join('');
    const tot = `<tr class="total"><td class="k">${t('totalW')}</td>${v.seats.map((s) => `<td class="v">${s.total}</td>`).join('')}</tr>`;
    const html = `<table class="full"><thead>${head}</thead><tbody>${rows}${tot}</tbody></table>`;
    if (body.dataset.html !== html) {
      body.innerHTML = html;
      body.dataset.html = html;
    }
  } else {
    const seat = clamp(S.viewSeat, 0, v.seats.length - 1);
    const s = v.seats[seat];
    const usePv = pv && seat === v.turn;
    $('sheet-head').innerHTML = `<span>${t('sheetOf')}</span><b style="color:${esc(s.color)};-webkit-text-stroke:.6px #2b1306">${esc(s.name)}</b>`;
    const cell = (c) => {
      const val = s.sheet[c];
      let cls = 'cell', txt = '';
      if (val !== undefined) txt = val === 0 ? '✗' : val;
      else if (usePv) {
        cls += ` can ${pv[c] === 0 ? 'nil' : ''} ${S.sel === c ? 'sel' : ''}`;
        txt = pv[c] === 0 ? '✗' : pv[c];
      }
      return `<button class="${cls}" ${usePv && val === undefined ? `data-cat="${c}"` : ''} data-flash="${seat}:${c}"><span class="k">${cname(c)}${CATHINT[c] ? `<small>${CATHINT[c]}</small>` : ''}</span><span class="v ${val === 0 ? 'zero' : ''}">${txt}</span></button>`;
    };
    const left = ['1', '2', '3', '4', '5', '6'], right = ['E', 'F', 'P', 'G', 'D'];
    let html = '<div class="grid2">';
    for (let r = 0; r < 6; r++) {
      html += cell(left[r]);
      html += r < 5 ? cell(right[r]) : `<div class="cell total"><span class="k">${t('totalW')}</span><span class="v">${s.total}</span></div>`;
    }
    html += '</div>';
    if (body.dataset.html !== html) {
      body.innerHTML = html;
      body.dataset.html = html;
    }
  }
  for (const el of $$('[data-cat]', body)) {
    el.onclick = () => selectCat(el.dataset.cat);
    el.onmouseenter = () => !S.sel && scene.mark(markFor(el.dataset.cat, v.dice));
    el.onmouseleave = () => !S.sel && scene.mark(null);
  }
  // confirmar
  const cf = $('confirm');
  if (S.sel && pv && pv[S.sel] !== undefined) {
    const p = pv[S.sel];
    $('b-write').textContent = p === 0 ? t('scratch', { c: cname(S.sel) }) : t('write', { p, c: cname(S.sel) });
    $('b-write').classList.toggle('nil', p === 0);
    cf.hidden = false;
  } else cf.hidden = true;
}

function flashCell(seat, cat) {
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-flash="${seat}:${cat}"]`);
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  });
}

let bannerT = 0;
function banner(v, seat) {
  const el = $('banner');
  const s = v.seats[seat];
  const mine = isMine(v, seat) && S.mode !== 'local';
  el.innerHTML = `<i style="background:${esc(s.color)}"></i>${esc(mine ? t('yourTurn') : t('turnOf', { name: s.name }))}`;
  el.classList.add('on');
  clearTimeout(bannerT);
  bannerT = setTimeout(() => el.classList.remove('on'), 1800);
}
let calloutT = 0;
function callout(big, small, kind, quiet = false) {
  const el = $('callout');
  $('callout-t').textContent = big;
  $('callout-s').textContent = small;
  $('callout-s').hidden = !small;
  el.className = `callout ${kind || ''}`;
  if (quiet) el.querySelector('b').style.fontSize = 'clamp(22px, 4.4vw, 34px)';
  else el.querySelector('b').style.fontSize = '';
  void el.offsetWidth;
  el.classList.add('on');
  clearTimeout(calloutT);
  calloutT = setTimeout(() => el.classList.remove('on'), 1800);
}

// ---------------------------------------------------------------- fin de la partida
function showOver(v) {
  const res = v.result;
  if (!res) return;
  const st = res.standings;
  const top = st[0];
  const tie = res.servida < 0 && st.length > 1 && st[1].score === top.score;
  if (S.mode === 'daily') return finishDaily(v);
  $('over-kicker').textContent = res.servida >= 0 ? t('generalaServida') : t('overKicker');
  const meWon = S.mode !== 'local' && top.seat === v.me && !tie;
  $('over-title').textContent = tie ? t('tie') : meWon ? t('youWin') : t('winner', { name: top.name });
  if (S.mode !== 'local') (meWon ? sfx.win : sfx.lose)();
  else sfx.win();
  $('over-rank').innerHTML = st
    .map((r, k) => `<li class="${k === 0 ? 'first' : ''}"><span class="pos">${k === 0 ? '👑' : k + 1}</span><i style="background:${esc(r.color)}"></i><span>${esc(r.name)}${r.seat === v.me && S.mode === 'online' ? ` <small>(${t('youLower')})</small>` : ''}</span><b>${r.score}</b></li>`)
    .join('');
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
  show('over');
}

function finishDaily(v) {
  const d = S.daily || dailyInfo();
  const s = v.seats[0];
  const score = s.total;
  const stats = record(ID, 'all', { date: d.date, won: true, score: Math.min(9, Math.floor(score / 40)) });
  saveDay(ID, 'all', { score, sheet: s.sheet }, d.date);
  markPortal(ID, { date: d.date, done: true, won: true, streak: stats.streak });
  sfx.win();
  showDailyResult(dailyInfo(), stats);
}
let dayTimer = 0;
function showDailyResult(d, stats = null) {
  const rec = d.rec;
  if (!rec) return;
  const st = stats || loadStats(ID, 'all');
  $('over-kicker').textContent = t('dailyKicker', { n: d.n });
  $('over-title').textContent = t('dailyTitle', { p: rec.score });
  $('over-rank').innerHTML = `<li class="first sheetline">${CATS.map((c) => `<span title="${cname(c)}">${rec.sheet[c] ? '🟩' : '⬛'}</span>`).join('')}</li>`;
  $('over-stats').hidden = false;
  $('over-stats').innerHTML = [
    [st.played, t('stPlayed')],
    [st.streak, t('stStreak')],
    [Math.max(st.best || 0, st.streak), t('stBest')],
  ]
    .map(([v, k]) => `<span><b>${v}</b><small>${k}</small></span>`)
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
  const row = CATS.map((c) => (d.rec.sheet[c] ? '🟩' : '⬛')).join('');
  const r = await share(`game.it · ${t('title')} #${d.n}\n🎲 ${d.rec.score} ${t('pts')}\n${row}\n${shareLink(ID)}`);
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
  if (S.mode === 'local') startLocal();
  else startCpu();
};
$('b-over-menu').onclick = () => toMenu();

// ---------------------------------------------------------------- menú
function toMenu() {
  timers.clearAll();
  clearInterval(dayTimer);
  if (online) {
    online.leave();
    online = null;
  }
  table = null;
  S.mode = null;
  S.v = null;
  S.gid = -1;
  S.rolling = false;
  setPlaying(false);
  scene.mark(null);
  refreshHome();
  show('home');
}
function refreshHome() {
  const d = dailyInfo();
  $('b-daily-sub').textContent = d.rec ? t('dailyDone', { n: d.n, p: d.rec.score }) : t('dailySub', { n: d.n });
}
function syncSeg(id, val) {
  $$(`#${id} button`).forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === Number(val)));
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
bindSeg('o-rivals', 'rivals');
bindSeg('o-level', 'level');
bindSeg('o-servida', 'servida', () => syncSeg('o-servida2', OPTS.servida));
bindSeg('o-servida2', 'servida', () => syncSeg('o-servida', OPTS.servida));
bindSeg('o-count', 'count', renderNames);
function renderNames() {
  const box = $('names');
  box.innerHTML = '';
  for (let i = 0; i < OPTS.count; i++) {
    const inp = document.createElement('input');
    inp.className = 'field';
    inp.maxLength = 14;
    inp.placeholder = t('playerN', { n: i + 1 });
    inp.value = OPTS.names[i] || '';
    inp.style.borderColor = COLORS[i];
    inp.oninput = () => {
      OPTS.names[i] = inp.value;
      save('opts', OPTS);
    };
    box.append(inp);
  }
}
function syncOpts() {
  syncSeg('o-rivals', OPTS.rivals);
  syncSeg('o-level', OPTS.level);
  syncSeg('o-servida', OPTS.servida);
  syncSeg('o-servida2', OPTS.servida);
  syncSeg('o-count', OPTS.count);
  renderNames();
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
$('b-local').onclick = () => {
  syncOpts();
  show('local');
};
$('b-local-go').onclick = () => {
  unlock();
  startLocal();
};
$('b-local-back').onclick = () => show('home');
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
  const lines = G.t(TXT.rules).map((l) => `<p>${l}</p>`);
  const rows = CATS.map((c) => {
    const val = c <= '6' ? `${c} × ${G.prefs.lang === 'en' ? 'count' : 'cantidad'}` : c === 'D' ? '100' : c === 'G' ? '50' : `${{ E: 20, F: 30, P: 40 }[c]} / ${{ E: 25, F: 35, P: 45 }[c]}`;
    const what = {
      E: { es: '1-2-3-4-5, 2-3-4-5-6 o 3-4-5-6-1', en: '1-2-3-4-5, 2-3-4-5-6 or 3-4-5-6-1' },
      F: { es: 'tres iguales y dos iguales', en: 'three of a kind plus a pair' },
      P: { es: 'cuatro iguales', en: 'four of a kind' },
      G: { es: 'cinco iguales', en: 'five of a kind' },
      D: { es: 'otra generala', en: 'another Generala' },
    }[c];
    return `<tr><td><b>${cname(c)}</b>${what ? ` · ${G.t(what)}` : ''}</td><td>${val}</td></tr>`;
  }).join('');
  $('rules-body').innerHTML = lines.slice(0, 3).join('') + `<table>${rows}</table>` + lines.slice(3).join('');
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
$('b-roll').onclick = () => doRoll();
$('b-write').onclick = () => confirmWrite();
$('b-cancel').onclick = () => {
  S.sel = null;
  scene.mark(null);
  render();
};
for (const b of $$('.btn, .link, .seg button')) b.addEventListener('click', () => sfx.ui());

// tocar la mesa: dados (guardar) y cubilete (tirar)
scene.canvas.addEventListener('pointerdown', (e) => {
  if (!S.v || $$('.screen.on').length) return;
  const r = scene.canvas.getBoundingClientRect();
  const hit = scene.pick(e.clientX - r.left, e.clientY - r.top);
  if (hit === 'cup') doRoll();
  else if (hit >= 0) toggleHold(hit);
});

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
          S.mode = 'online';
          S.gid = -1;
          setPlaying(true);
        }
        if ($$('.screen.on').some((s) => ['s-lobby', 's-online', 's-over'].includes(s.id))) show(null);
        onView(m.s);
      } else if (m.t === 'error') {
        $('on-status').textContent = netText(m.code);
        $('lobby-status').textContent = m.code === 'need_players' ? t('needPlayers') : netText(m.code);
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
  const bots = Math.max(0, Math.min(st.bots ?? 0, 6 - room.players.length));
  $('lobby-players').innerHTML =
    room.players.map((p) => `<li><i style="background:${esc(p.color)}"></i><span>${esc(p.name)}</span><small>${[p.id === online.myId ? t('youLower') : '', p.id === room.host ? t('host') : ''].filter(Boolean).join(' · ')}</small></li>`).join('') +
    Array.from({ length: bots }, (_, i) => `<li><i style="background:${['#ff8a5c', '#7ad3ff', '#b8f06a', '#d9a6ff', '#ffd166'][i]}"></i><span>${['Coco', 'Tota', 'Pocho', 'Lula', 'Beto'][i]}</span><small>${t('cpu')}</small></li>`).join('');
  for (const seg of $$('#lobby-host .seg')) {
    const k = seg.dataset.k;
    $$('button', seg).forEach((b) => {
      b.classList.toggle('on', Number(b.dataset.v) === Number(st[k]));
      b.disabled = !online.isHost;
    });
  }
  $('lobby-start').hidden = !online.isHost;
  const people = room.players.filter((p) => p.connected).length;
  $('lobby-status').textContent = online.isHost ? (people + bots < 2 ? t('needPlayers') : '') : t('waitingHost');
  $('lobby-status').style.color = online.isHost ? '' : 'var(--ink2)';
  show('lobby');
}

// ---------------------------------------------------------------- teclado y mando
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key;
  if (document.querySelector('#s-pause.on')) {
    if (k === 'Escape' || k === 'p' || k === 'P') resume();
    return;
  }
  if (!S.v || $$('.screen.on').length) return;
  if (k === ' ' || k === 'Enter') {
    e.preventDefault();
    if (S.sel) confirmWrite();
    else doRoll();
  } else if (/^[1-5]$/.test(k)) toggleHold(+k - 1);
  else if (k === 'ArrowUp' || k === 'ArrowDown') {
    e.preventDefault();
    moveSel(k === 'ArrowUp' ? -1 : 1);
  } else if (k === 'Escape') {
    if (S.sel) {
      S.sel = null;
      scene.mark(null);
      render();
    } else pause();
  } else if (k === 'p' || k === 'P') pause();
});
/** Mueve la categoría elegida entre las libres (teclado y mando). */
function moveSel(dir) {
  const v = S.v;
  if (!canWrite()) return;
  const free = CATS.filter((c) => v.seats[v.turn].sheet[c] === undefined);
  if (!free.length) return;
  const i = S.sel ? free.indexOf(S.sel) : dir > 0 ? -1 : free.length;
  S.sel = free[(i + dir + free.length) % free.length];
  scene.mark(markFor(S.sel, v.dice));
  render();
}
const padPrev = [];
let padRep = 0;
function pollPad(dt) {
  const gp = navigator.getGamepads?.()?.find((g) => g && g.connected);
  if (!gp) return;
  const b = (i) => !!gp.buttons[i]?.pressed;
  const pressed = (i) => b(i) && !padPrev[i];
  const live = S.v && !$$('.screen.on').length;
  if (live) {
    const ay = gp.axes[1] || 0;
    const up = b(12) || ay < -0.6, down = b(13) || ay > 0.6;
    if (up || down) {
      if ((padRep -= dt) <= 0) {
        moveSel(up ? -1 : 1);
        padRep = 0.22;
      }
    } else padRep = 0;
    if (pressed(14) || pressed(4)) S.padDie = (S.padDie + 4) % 5;
    if (pressed(15) || pressed(5)) S.padDie = (S.padDie + 1) % 5;
    if ((pressed(14) || pressed(15) || pressed(4) || pressed(5)) && S.v) scene.mark(S.v.dice.map((_, i) => i === S.padDie));
    if (pressed(2) && S.padDie >= 0) toggleHold(S.padDie);
    if (pressed(0)) S.sel ? confirmWrite() : doRoll();
    if (pressed(1) && S.sel) {
      S.sel = null;
      scene.mark(null);
      render();
    }
    if (pressed(9)) pause();
  } else if (document.querySelector('#s-pause.on') && pressed(9)) resume();
  gp.buttons.forEach((x, i) => (padPrev[i] = x.pressed));
}

// ---------------------------------------------------------------- bucle
let last = performance.now();
function loop(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  pollPad(dt);
  // en el menú, la mesa tira sola de vez en cuando
  if (!S.mode && !G.paused) {
    S.idleT -= dt;
    if (S.idleT <= 0) {
      S.idleT = 4.5;
      const vals = Array.from({ length: 5 }, () => 1 + Math.floor(Math.random() * 6));
      scene.roll(vals, [false, false, false, false, false], () => {});
    }
  }
  // tiempo del turno online
  const v = S.v;
  const showClock = S.mode === 'online' && v && v.phase === 'play' && v.turnMs && iCanAct();
  $('clock').hidden = !showClock;
  if (showClock) {
    const left = Math.max(0, (v.left || 0) - (performance.now() - (v._at || (v._at = performance.now()))));
    $('clock-t').textContent = `⏱ ${Math.ceil(left / 1000)}`;
    $('clock').classList.toggle('low', left < 10000);
  }
  scene.frame(dt);
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- pausa automática y arranque
addEventListener('blur', () => S.mode && S.mode !== 'online' && pause());
document.addEventListener('visibilitychange', () => document.hidden && S.mode && S.mode !== 'online' && pause());
G.onPause?.(() => timers.pause());
G.onResume?.(() => {
  if (!$$('.screen.on').length) timers.resume();
});

G.onPrefs((p) => {
  document.documentElement.lang = p.lang;
  document.documentElement.classList.toggle('reduced', !!p.reducedMotion);
  scene.reduced = !!p.reducedMotion;
  $$('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t)));
  renderRules();
  refreshHome();
  if (S.v) render();
  if (online?.room && document.querySelector('#s-lobby.on')) applyRoom(online.room);
}, true);

scene.resize($('stage').clientWidth || innerWidth, $('stage').clientHeight || innerHeight - 56);
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
  window.__generala = {
    S,
    get table() {
      return table;
    },
    get online() {
      return online;
    },
    scene,
    startCpu,
    startLocal,
    startDaily,
    toMenu,
    doRoll,
    toggleHold,
    selectCat,
    confirmWrite,
    timers,
    OPTS,
    /** La compu juega por las personas (como si estuvieran ausentes) hasta el final. */
    autoplay() {
      if (!table) return;
      table.seats.forEach((s, i) => !s.bot && table.setAway(i, true));
      table.schedule();
    },
  };
G.ready();
