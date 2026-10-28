/* Mancala (Kalah) — game.it
 * Mancala contra la compu (cinco niveles, piensa en un worker), de a dos en la misma pantalla y online con reloj y revancha.
 * La siembra se anima semilla por semilla con una "mano" que va repartiendo. Las reglas están en shared/rules.js (las comparte
 * el servidor) y la compu en shared/engine.js.
 */
import { Position, P0, P1, STORE, pitOf, fromStr, moveStr, replay, sideOf } from './shared/rules.js';
import { OnlineRoom, netText, defaultName, share as shareRoom, roomFromUrl } from '/shared/online.js';
import { pickLobby } from '/shared/race-lobby.js';
import { tone, noise, notes, unlock } from '/shared/sfx.js';

const G = window.GameIt;
const ID = 'mancala';
const DEBUG = /[?&]debug\b/.test(location.search);
const $ = (id) => document.getElementById(id);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- textos
const TXT = {
  title: { es: 'Mancala', en: 'Mancala' },
  tagline: { es: 'Sembrá semillas, encadená turnos extra y capturá las del rival.', en: 'Sow seeds, chain extra turns and capture your rival’s.' },
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
  seeds: { es: 'Semillas por hoyo', en: 'Seeds per pit' },
  seedsHelp: { es: 'Con 4 es el Kalah clásico; con 3 es más rápido y con 6 más largo.', en: '4 is classic Kalah; 3 is faster and 6 is longer.' },
  level: { es: 'Nivel', en: 'Level' },
  levels: { es: ['Novato', 'Fácil', 'Medio', 'Difícil', 'Experto'], en: ['Rookie', 'Easy', 'Medium', 'Hard', 'Expert'] },
  levelHelp: {
    es: ['Siembra casi al azar. Para aprender las reglas.', 'Mira una jugada adelante y se pierde turnos extra.', 'Aprovecha los turnos extra y las capturas que le dejás.', 'Calcula varias jugadas: cuesta sacarle semillas.', 'Piensa a fondo y casi no regala nada. Suerte.'],
    en: ['Sows almost at random. To learn the rules.', 'Looks one move ahead and misses extra turns.', 'Takes the extra turns and captures you leave.', 'Calculates many moves: hard to take seeds from.', 'Thinks deep and gives almost nothing away. Good luck.'],
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
  showMoves: { es: 'Mostrar dónde cae la última semilla', en: 'Show where the last seed lands' },
  continue: { es: 'Continuar partida', en: 'Continue game' },
  contSub: { es: 'vs compu {l} · jugada {n}', en: 'vs CPU {l} · move {n}' },
  contSubLocal: { es: 'de a dos · jugada {n}', en: 'two players · move {n}' },
  rulesTitle: { es: 'Cómo se juega', en: 'How to play' },
  gotIt: { es: '¡Entendido!', en: 'Got it!' },
  moves: { es: 'Jugadas', en: 'Moves' },
  live: { es: 'En vivo', en: 'Live' },
  you: { es: 'Vos', en: 'You' },
  p1: { es: 'Jugador 1', en: 'Player 1' },
  p2: { es: 'Jugador 2', en: 'Player 2' },
  cpuName: { es: 'Compu · {l}', en: 'CPU · {l}' },
  yourTurn: { es: 'Tu turno', en: 'Your turn' },
  yourTurnAgain: { es: '¡Jugás otra vez!', en: 'You go again!' },
  turnLocal: { es: 'Le toca jugar', en: 'To move' },
  thinking: { es: 'Pensando…', en: 'Thinking…' },
  waitMove: { es: 'Esperando su jugada…', en: 'Waiting for the move…' },
  away: { es: 'Se desconectó…', en: 'Disconnected…' },
  turnAgain: { es: '¡Juega otra vez!', en: 'Goes again!' },
  extra: { es: '¡Otra vez! Juega {n}', en: 'Again! {n} goes again' },
  extraYou: { es: '¡Turno extra! Jugás otra vez', en: 'Extra turn! You go again' },
  capture: { es: '¡Captura de {n} semillas!', en: 'Captured {n} seeds!' },
  emptyHole: { es: 'Ese hoyo está vacío', en: 'That pit is empty' },
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
  youWin: { es: '¡Ganaste!', en: 'You won!' },
  youLose: { es: 'Perdiste', en: 'You lost' },
  drawn: { es: 'Empate', en: 'Draw' },
  winP1: { es: 'Gana el jugador 1', en: 'Player 1 wins' },
  winP2: { es: 'Gana el jugador 2', en: 'Player 2 wins' },
  endCount: { es: '{a} a {b}', en: '{a} to {b}' },
  endTimeout: { es: 'Se acabó el tiempo de {n}', en: '{n} ran out of time' },
  endResign: { es: '{n} se rindió', en: '{n} resigned' },
  endResignYou: { es: 'Te rendiste', en: 'You resigned' },
  endAbandon: { es: '{n} abandonó la partida', en: '{n} left the game' },
  endAborted: { es: 'Partida anulada: nadie jugó a tiempo', en: 'Game aborted: nobody moved in time' },
  wins: { es: 'Ganadas', en: 'Won' },
  losses: { es: 'Perdidas', en: 'Lost' },
  draws: { es: 'Empates', en: 'Draws' },
  rules: {
    es: `<p><b>Objetivo:</b> juntar más semillas que el rival en tu depósito (el hoyo grande de tu derecha).</p>
<h3>Cómo se juega</h3>
<ul>
<li>Cada uno tiene seis hoyos y un depósito. Empiezan con la misma cantidad de semillas en cada hoyo.</li>
<li>En tu turno elegís <b>uno de tus hoyos con semillas</b>, las levantás todas y las sembrás de a una en los hoyos siguientes, en sentido contrario a las agujas del reloj. También se siembra tu depósito, pero <b>no el del rival</b>.</li>
<li><b>Turno extra:</b> si la última semilla cae en tu depósito, jugás otra vez.</li>
<li><b>Captura:</b> si la última semilla cae en un hoyo tuyo que estaba vacío y el de enfrente tiene semillas, te llevás esas semillas y la tuya a tu depósito.</li>
<li>La partida termina cuando a un lado no le quedan semillas: el otro lado se guarda las que tiene en sus hoyos. Gana el depósito más grande.</li>
</ul>
<h3>Para tener en cuenta</h3>
<ul>
<li>Tocá y mantené un hoyo para ver dónde caería la última semilla: si es tu depósito, se ilumina de verde.</li>
<li>Los hoyos más cercanos a tu depósito dan turnos extra con pocas semillas: con 1 semilla en el último hoyo, 2 en el anterior, y así.</li>
<li>Dejar semillas en tus hoyos de la izquierda las protege, pero también las deja lejos de tu depósito.</li>
</ul>`,
    en: `<p><b>Goal:</b> collect more seeds than your rival in your store (the big pit on your right).</p>
<h3>How to play</h3>
<ul>
<li>Each player has six pits and a store. All pits start with the same number of seeds.</li>
<li>On your turn you choose <b>one of your pits with seeds</b>, pick them all up and sow them one by one into the following pits, counter-clockwise. Your own store gets a seed too, but <b>your rival’s doesn’t</b>.</li>
<li><b>Extra turn:</b> if your last seed lands in your store, you play again.</li>
<li><b>Capture:</b> if your last seed lands in one of your pits that was empty and the pit opposite has seeds, you take those seeds and yours to your store.</li>
<li>The game ends when one side has no seeds: the other side keeps the seeds in its pits. The bigger store wins.</li>
</ul>
<h3>Good to know</h3>
<ul>
<li>Press and hold a pit to see where the last seed would land: if it is your store, it glows green.</li>
<li>Pits closest to your store give extra turns with few seeds: 1 seed in the last pit, 2 in the one before, and so on.</li>
<li>Keeping seeds in your leftmost pits protects them, but also leaves them far from your store.</li>
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
const OPTS = load(KEY.prefs, { level: 3, first: 0, seeds: 4, hints: 1, tc: '5+0' });
if (![3, 4, 6].includes(OPTS.seeds)) OPTS.seeds = 4;
const savePrefs = () => store(KEY.prefs, OPTS);

// ---------------------------------------------------------------- estado
const S = {
  mode: null, // 'cpu' | 'local' | 'online'
  level: 3,
  me: P0,
  seeds: 4,
  pos: null,
  moves: [],
  made: [],
  legal: [],
  busy: false,
  thinking: false,
  over: null,
  view: null, // índice del repaso (null = en vivo)
  viewPos: null,
  last: -1, // casilla donde cayó la última semilla de la última jugada
  names: ['', ''],
  clock: null,
  req: 0,
  paused: false,
  arm: null,
  salt: 0,
  n: 0,
  again: [],
  away: false,
  u: 46,
  bottom: P0,
};
const shown = new Int8Array(14);
let online = null;
let quick = false;
let quickHost = false;

// ---------------------------------------------------------------- sonidos
const sfx = {
  pick: () => {
    noise(0.06, { freq: 700, q: 2, vol: 0.1 });
    tone(260, 200, 0.08, { type: 'triangle', vol: 0.06 });
  },
  drop: (k) => {
    noise(0.035, { freq: 1800 + k * 90, q: 3, vol: 0.09 });
    tone(420 + k * 30, 380 + k * 26, 0.05, { type: 'triangle', vol: 0.05 });
  },
  store: () => notes([659.25, 880], { step: 0.05, dur: 0.12, type: 'triangle', vol: 0.07 }),
  capture: () => notes([392, 523.25, 659.25, 783.99], { step: 0.07, dur: 0.18, type: 'triangle', vol: 0.09 }),
  extra: () => notes([523.25, 659.25, 880], { step: 0.07, dur: 0.15, type: 'triangle', vol: 0.08 }),
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
  // se apoya justo arriba de la barra del rival para no tapar los hoyos; si ahí no hay lugar (escritorio), va abajo de la barra
  const g = $('game').getBoundingClientRect();
  const b = $('bar-top').getBoundingClientRect();
  const above = b.top - g.top - el.offsetHeight - 10;
  el.style.left = `${b.left - g.left + b.width / 2}px`;
  el.style.top = `${above >= 6 ? above : $('moves').offsetParent ? b.bottom - g.top + 10 : 6}px`;
  clearTimeout(toast.tm);
  toast.tm = setTimeout(() => (el.hidden = true), ms);
}

// ---------------------------------------------------------------- tablero
const el = new Array(14).fill(null);
// lugar de cada semilla dentro de un hoyo (espiral de girasol, de -1 a 1): la semilla k siempre cae en el mismo punto
const SEEDS_MAX = 40;
const SPOTS = Array.from({ length: SEEDS_MAX }, (_, k) => {
  const r = Math.sqrt((k + 0.5) / SEEDS_MAX);
  const a = k * 2.39996;
  return [r * Math.cos(a), r * Math.sin(a)];
});
/** Dónde va cada casilla en la pantalla, según de quién es la fila de abajo: { col: 1…8, row: 1|2 (hoyos) | 0 (depósito) }. */
function slot(i) {
  const v = (i + 7 * S.bottom) % 14;
  if (v < 6) return { col: v + 2, row: 2 };
  if (v === 6) return { col: 8, row: 0 };
  if (v === 13) return { col: 1, row: 0 };
  return { col: 14 - v, row: 1 };
}
function buildBoard() {
  const board = $('board');
  board.innerHTML = '';
  for (let i = 0; i < 14; i++) {
    const s = slot(i);
    const d = document.createElement('div');
    const isSt = i === 6 || i === 13;
    d.className = isSt ? `store ${s.col === 8 ? 'b' : 't'}` : `pit ${s.row === 2 ? 'b' : 't'}`;
    d.dataset.i = i;
    d.style.gridColumn = s.col;
    if (!isSt) d.style.gridRow = s.row;
    d.innerHTML = '<div class="seeds"></div><span class="num"></span>';
    board.appendChild(d);
    el[i] = d;
  }
  setShownFrom(S.pos ? displayPos().b : new Position(S.seeds).b, false);
}
function renderPit(i, bump = false) {
  const n = shown[i];
  const d = el[i];
  const seeds = d.firstChild;
  const have = seeds.children.length;
  const store = i === 6 || i === 13;
  const want = Math.min(n, store ? SEEDS_MAX : 28);
  for (let k = have; k < want; k++) {
    const s = document.createElement('i');
    s.className = `c${(i * 5 + k * 3) % 6}${bump && k === want - 1 ? ' pop' : ''}`;
    const [x, y] = SPOTS[k];
    // el depósito es alto y angosto (el número va arriba, por eso las semillas se juntan más abajo); los hoyos, casi redondos
    s.style.left = `${50 + x * (store ? 30 : 34)}%`;
    s.style.top = `${(store ? 58 : 50) + y * 34}%`;
    seeds.appendChild(s);
  }
  for (let k = have; k > want; k--) seeds.lastChild.remove();
  d.lastChild.textContent = n ? String(n) : store ? '0' : '';
  if (bump) {
    d.classList.remove('bump');
    d.offsetWidth;
    d.classList.add('bump');
  }
}
function setShownFrom(b, bump = false) {
  for (let i = 0; i < 14; i++) {
    if (shown[i] !== b[i] || !el[i].lastChild.textContent) {
      shown[i] = b[i];
      renderPit(i, bump);
    }
  }
  setScores();
}
const bottomColor = () => (S.mode === 'local' || S.mode === null ? P0 : S.me);
const slotColor = (sl) => (sl === 'bot' ? S.bottom : S.bottom ^ 1);
function setScores() {
  for (const sl of ['top', 'bot']) {
    const c = slotColor(sl);
    const e = $(`sc-${sl}`);
    const v = String(shown[STORE[c]]);
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
const sowMs = () => (document.documentElement.classList.contains('reduced') ? 1 : 150);
function handAt(i, instant = false) {
  const h = $('hand');
  const r = el[i].getBoundingClientRect();
  const b = $('board-box').getBoundingClientRect();
  if (instant) h.style.transition = 'none';
  h.style.transform = `translate(${r.left - b.left + r.width / 2}px, ${r.top - b.top + r.height / 2}px)`;
  if (instant) {
    h.offsetWidth;
    h.style.transition = '';
  }
}

/** Anima una jugada: la mano levanta las semillas del hoyo y las va soltando de a una; después, la captura y el barrido final. */
async function animateMove(rec, fast = false) {
  clearLand();
  const final = S.pos.b;
  if (fast) return setShownFrom(final, true);
  const hand = $('hand');
  shown[rec.m] = 0;
  renderPit(rec.m, true);
  handAt(rec.m, true);
  hand.textContent = String(rec.seeds);
  hand.hidden = false;
  sfx.pick();
  await sleep(180);
  let left = rec.seeds;
  let k = 0;
  for (const i of rec.path) {
    handAt(i);
    await sleep(sowMs());
    shown[i]++;
    left--;
    hand.textContent = String(left);
    renderPit(i, true);
    if (i === 6 || i === 13) sfx.store();
    else sfx.drop(k);
    k++;
    setScores();
  }
  hand.hidden = true;
  if (rec.capture) {
    const { pit, opp, amount } = rec.capture;
    el[pit].classList.add('flash');
    el[opp].classList.add('flash');
    sfx.capture();
    toast(t('capture', { n: amount }), 1500);
    await sleep(700);
    el[pit].classList.remove('flash');
    el[opp].classList.remove('flash');
    shown[STORE[rec.by]] += amount;
    shown[pit] = 0;
    shown[opp] = 0;
    renderPit(pit);
    renderPit(opp);
    renderPit(STORE[rec.by], true);
    setScores();
  }
  if (rec.sweep) {
    await sleep(450);
    setShownFrom(final, true);
    sfx.store();
  }
  setShownFrom(final);
}

// ---------------------------------------------------------------- marcas
const displayPos = () => (S.view === null ? S.pos : S.viewPos);
function markLast() {
  for (const e of el) e?.classList.remove('last');
  const l = S.view === null ? S.last : S.view > 0 ? lastOf(S.made[S.view - 1]) : -1;
  if (l >= 0) el[l].classList.add('last');
}
const lastOf = (rec) => (rec.path.length ? rec.path[rec.path.length - 1] : rec.m);
const humanTurn = () => !S.over && S.view === null && S.pos && S.legal.length > 0 && (S.mode === 'local' || ((S.mode === 'cpu' || S.mode === 'online') && S.pos.turn === S.me));
const canInput = () => humanTurn() && !S.busy && !S.thinking && !screenOpen();
function markMoves() {
  for (const e of el) e?.classList.remove('can');
  if (!canInput()) return;
  for (const m of S.legal) el[m].classList.add('can');
}
function clearLand() {
  for (const e of el) e?.classList.remove('land', 'extra');
}
function showLand(i) {
  clearLand();
  if (!OPTS.hints || !canInput() || !S.legal.includes(i)) return;
  const to = S.pos.landing(i);
  el[to].classList.add('land');
  if (to === STORE[S.pos.turn]) el[to].classList.add('extra');
}
function clearHint() {
  clearTimeout(clearHint.tm);
  for (const e of el) e?.classList.remove('hint');
}
function showHint(m) {
  clearHint();
  el[m].classList.add('hint');
  clearHint.tm = setTimeout(clearHint, 6000);
}

// ---------------------------------------------------------------- entrada
$('board').addEventListener('pointerover', (e) => {
  const p = e.target.closest('.pit');
  if (p) showLand(Number(p.dataset.i));
});
$('board').addEventListener('pointerleave', clearLand);
$('board').addEventListener('pointerdown', (e) => {
  const p = e.target.closest('.pit');
  if (p && e.pointerType !== 'mouse') showLand(Number(p.dataset.i));
});
$('board').addEventListener('pointerup', (e) => e.pointerType !== 'mouse' && clearLand());
$('board').addEventListener('click', (e) => {
  unlock();
  const p = e.target.closest('.pit');
  if (!p) return;
  clearHint();
  if (!canInput()) return;
  const i = Number(p.dataset.i);
  if (!S.legal.includes(i)) {
    if (sideOf(i) === S.pos.turn || S.mode === 'local') {
      sfx.err();
      if (shown[i] === 0 && sideOf(i) === S.pos.turn) toast(t('emptyHole'), 1100);
    }
    return;
  }
  if (S.mode === 'online') online?.send({ t: 'move', m: moveStr(i) });
  playMove(i);
});

// ---------------------------------------------------------------- jugar
async function playMove(m, { quick: fast = false } = {}) {
  S.busy = true;
  clearHint();
  clearLand();
  const pre = S.pos.turn;
  const rec = S.pos.make(m);
  S.moves.push(moveStr(m));
  S.made.push(rec);
  S.last = lastOf(rec);
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
  refresh();
  await animateMove(rec, fast);
  markLast();
  S.busy = false;
  S.legal = S.pos.moves();
  void pre;
  afterMove(true);
}
function afterMove(animated) {
  const over = S.legal.length === 0 || S.pos.over;
  saveGame();
  refresh();
  markMoves();
  const last = S.made[S.made.length - 1];
  if (!over && last && last.extra && animated) {
    sfx.extra();
    const who = S.pos.turn;
    const sto = el[STORE[who]];
    sto.classList.remove('flash');
    sto.offsetWidth;
    sto.classList.add('flash');
    setTimeout(() => sto.classList.remove('flash'), 1100);
    toast(S.mode !== 'local' && who === S.me ? t('extraYou') : t('extra', { n: playerName(who) }), 1700);
  }
  if (S.mode === 'online') {
    if (!over && S.pos.turn === S.me && animated && !(last && last.extra && last.by === S.me)) sfx.turn();
    if (!pulling) pullMoves();
    return;
  }
  if (over) return endGame(S.pos.status());
  if (S.mode === 'cpu' && S.pos.turn !== S.me) cpuMove();
  else if (S.mode === 'cpu' && animated && !(last && last.extra)) sfx.turn();
}
const playerName = (c) => S.names[c] || '';

function resetGame() {
  S.pos = new Position(S.seeds);
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
  clearHint();
  S.bottom = bottomColor();
  buildBoard();
  markLast();
  markMoves();
}
function startGame(mode, opts = {}) {
  S.mode = mode;
  S.level = opts.level || 3;
  S.seeds = opts.seeds || 4;
  S.me = mode === 'local' ? P0 : (opts.me ?? P0);
  S.salt = (Math.random() * 1e9) | 0;
  nameBars();
  resetGame();
  setPlaying(true);
  show(null);
  refresh();
  renderMoves();
  markMoves();
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
  startGame('cpu', { level: OPTS.level, me, seeds: OPTS.seeds });
}
const startLocal = () => startGame('local', { seeds: OPTS.seeds });

function saveGame() {
  if (S.mode !== 'cpu' && S.mode !== 'local') return;
  if (S.over || !S.moves.length) {
    try {
      localStorage.removeItem(KEY.save);
    } catch {}
    return;
  }
  store(KEY.save, { mode: S.mode, level: S.level, me: S.me, seeds: S.seeds, moves: S.moves, salt: S.salt });
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
  const r = replay(s.moves, s.seeds || 4);
  if (!r) return localStorage.removeItem(KEY.save);
  S.mode = s.mode;
  S.level = s.level || 3;
  S.me = s.me ?? P0;
  S.seeds = s.seeds || 4;
  S.salt = s.salt || 0;
  nameBars();
  S.pos = r.pos;
  S.moves = s.moves.slice();
  S.made = r.made;
  S.legal = S.pos.moves();
  S.last = r.made.length ? lastOf(r.made[r.made.length - 1]) : -1;
  S.over = null;
  S.view = null;
  S.req++;
  S.bottom = bottomColor();
  buildBoard();
  markLast();
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
      w.postMessage({ id, seeds: S.seeds, ...payload });
    });
    if (res) return res;
  }
  engineLib ||= await import('./shared/engine.js');
  const r = replay(payload.moves, S.seeds);
  if (!r) return { move: null };
  const eng = (ask.eng ||= new engineLib.Engine());
  const o = payload.hint ? { depth: 14, time: 900, noise: 0 } : { ...engineLib.LEVELS[payload.level] };
  await sleep(20);
  const res = eng.think(r.pos, o);
  return { move: res.move >= 0 ? moveStr(res.move) : null, score: res.score, depth: res.depth };
}
async function cpuMove() {
  if (S.mode !== 'cpu' || S.over || S.pos.turn === S.me || S.thinking || !S.legal.length) return;
  const my = ++S.req;
  S.thinking = true;
  refresh();
  markMoves();
  const t0 = performance.now();
  const r = await ask({ moves: S.moves.slice(), level: S.level, salt: S.salt });
  await sleep(Math.max(0, 600 - (performance.now() - t0)));
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
      const [a, b] = res.counts || [S.pos.b[6], S.pos.b[13]];
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
  const [a, b] = res.counts || [S.pos.b[6], S.pos.b[13]];
  const box = (c, n) => `<div class="${res.winner === c ? 'win' : ''}"><i class="disc${c === P1 ? ' b' : ''}"></i><span class="n">${n}</span><span class="who">${esc(S.names[c] || '')}</span></div>`;
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
    i = Math.max(0, Math.min(n, i));
    S.view = i;
    S.viewPos = replay(S.moves.slice(0, i), S.seeds).pos;
  }
  clearHint();
  setShownFrom(displayPos().b);
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
function setBar(sl) {
  const c = slotColor(sl);
  $(`nm-${sl}`).textContent = S.names[c] || '';
  $(`disc-${sl}`).className = `disc${c === P1 ? ' b' : ''}`;
  const turn = !S.over && S.view === null && S.pos.turn === c && S.legal.length > 0;
  $(`bar-${sl}`).classList.toggle('turn', turn);
  let st = '';
  const again = S.made.length && S.made[S.made.length - 1].extra && S.made[S.made.length - 1].by === c;
  if (turn) {
    if (S.mode === 'cpu') st = S.pos.turn === S.me ? (again ? t('yourTurnAgain') : t('yourTurn')) : t('thinking');
    else if (S.mode === 'online') st = S.pos.turn === S.me ? (again ? t('yourTurnAgain') : t('yourTurn')) : S.away ? t('away') : t('waitMove');
    else st = again ? t('turnAgain') : t('turnLocal');
  }
  $(`st-${sl}`).textContent = st;
}
function refresh() {
  if (!S.pos) return;
  setBar('top');
  setBar('bot');
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
  l.innerHTML = S.moves.map((m, i) => `<li class="mv${S.made[i]?.by === P1 ? ' w' : ''}${cur === i + 1 ? ' cur' : ''}" data-i="${i + 1}">${(Number(m) % 7) + 1}${S.made[i]?.extra ? '↻' : ''}${S.made[i]?.capture ? '✦' : ''}</li>`).join('');
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
    else endGame({ over: true, winner: (S.mode === 'cpu' ? S.me : S.pos.turn) ^ 1, reason: 'resign', counts: [S.pos.b[6], S.pos.b[13]] });
  }
}
async function doHint() {
  if (S.thinking || S.busy || !humanTurn()) return;
  S.thinking = true;
  const my = ++S.req;
  refresh();
  const r = await ask({ moves: S.moves.slice(), hint: true });
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
  const r = replay(keep, S.seeds);
  if (!r) return;
  S.req++;
  S.thinking = false;
  S.pos = r.pos;
  S.moves = keep;
  S.made = r.made;
  S.legal = S.pos.moves();
  S.last = r.made.length ? lastOf(r.made[r.made.length - 1]) : -1;
  S.over = null;
  clearHint();
  setShownFrom(S.pos.b);
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
    syncOpts();
    cb?.();
  });
}
function syncSeg(id, v) {
  for (const b of $$('button', $(id))) b.classList.toggle('on', String(b.dataset.v) === String(v));
}
const helpLevel = () => ($('o-level-help').textContent = G.t(TXT.levelHelp)[OPTS.level - 1] || '');
const levelLabels = () => $$('#o-level button').forEach((b, i) => (b.textContent = `${i + 1} ${levelName(i + 1)}`));
bindSeg('o-level', 'level', helpLevel);
bindSeg('o-first', 'first');
bindSeg('o-seeds', 'seeds');
bindSeg('l-seeds', 'seeds');
bindSeg('p-hints', 'hints', () => markMoves());
function syncOpts() {
  syncSeg('o-level', OPTS.level);
  syncSeg('o-first', OPTS.first);
  syncSeg('o-seeds', OPTS.seeds);
  syncSeg('l-seeds', OPTS.seeds);
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
  const g = online?.room?.mancala;
  if (!g) return;
  const r = replay(g.moves, g.seeds);
  if (!r) return;
  S.pos = r.pos;
  S.moves = g.moves.slice();
  S.made = r.made;
  S.legal = S.pos.moves();
  S.last = r.made.length ? lastOf(r.made[r.made.length - 1]) : -1;
  S.busy = false;
  setShownFrom(S.pos.b);
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
      const g = online?.room?.mancala;
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
  if (room.state === 'lobby' || !room.mancala) {
    if (S.mode === 'online') {
      S.mode = null;
      S.pos = null;
      setPlaying(false);
    }
    applyLobby(room);
    return;
  }
  const g = room.mancala;
  const myId = online.myId;
  const nameOf = (id) => room.players.find((p) => p.id === id)?.name || '';
  if (S.mode !== 'online' || S.n !== g.n) {
    // partida nueva (o reconexión): se arma desde cero con las jugadas que ya hay
    S.mode = 'online';
    S.n = g.n;
    S.seeds = g.seeds;
    S.me = g.first === myId ? P0 : P1;
    S.names = [nameOf(g.first), nameOf(g.second)];
    S.again = [];
    S.over = null;
    S.view = null;
    S.thinking = false;
    S.arm = null;
    const r = replay(g.moves, g.seeds);
    S.pos = r ? r.pos : new Position(g.seeds);
    S.moves = r ? g.moves.slice() : [];
    S.made = r ? r.made : [];
    S.legal = S.pos.moves();
    S.last = S.made.length ? lastOf(S.made[S.made.length - 1]) : -1;
    S.busy = false;
    S.bottom = S.me;
    clearHint();
    buildBoard();
    markLast();
    setPlaying(true);
    show(null);
    renderMoves();
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
  else if (/^[1-6]$/.test(k) && canInput()) {
    // los hoyos se cuentan de izquierda a derecha según como se ve el tablero
    const target = $$('.pit.b')[Number(k) - 1];
    const m = target ? Number(target.dataset.i) : -1;
    if (S.legal.includes(m)) {
      if (S.mode === 'online') online?.send({ t: 'move', m: moveStr(m) });
      playMove(m);
    }
  } else if (S.view !== null && k === 'arrowleft') setView(S.view - 1);
  else if (S.view !== null && k === 'arrowright') setView(S.view + 1);
});

// ---------------------------------------------------------------- tamaño
function measure() {
  const g = $('game');
  const W = g.clientWidth;
  const H = g.clientHeight;
  const land = matchMedia('(min-width: 820px) and (min-aspect-ratio: 13/10)').matches;
  // el ancho del tablero son 8,4 hoyos + el marco; en horizontal la columna de al lado ocupa 310 px
  const avail = land ? W - 310 - 22 - 20 : W - 16;
  let u = Math.floor(avail / (8.4 + 0.56));
  if (land) u = Math.min(u, Math.floor((H - 40) / 3.2));
  u = Math.max(28, Math.min(u, 96));
  if (u !== S.u) {
    S.u = u;
    g.style.setProperty('--u', `${u}px`);
  }
}
new ResizeObserver(measure).observe($('game'));
G.onPause?.(() => (S.paused = true));
G.onResume?.(() => (S.paused = screenOpen() && !!document.querySelector('#s-pause.on')));

// ---------------------------------------------------------------- logo y arranque
const drawLogo = () => ($('logo').innerHTML = '<div class="lb"><s class="st a"></s><s class="a"></s><s></s><s class="c"></s><s class="c"></s><s class="a"></s><s></s><s class="st c"></s></div>');
G.onPrefs((p) => {
  document.documentElement.lang = p.lang;
  document.documentElement.classList.toggle('reduced', !!p.reducedMotion);
  $$('[data-t]').forEach((e) => (e.textContent = t(e.dataset.t)));
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
  window.__mancala = {
    S,
    OPTS,
    get online() {
      return online;
    },
    startCpu,
    startLocal,
    startGame,
    playMove: (i) => playMove(i),
    click: (i) => el[i].dispatchEvent(new MouseEvent('click', { bubbles: true })),
    setView,
    toMenu,
    refresh,
    renderMoves,
    /** Partida ya jugada (sin animar): lista de hoyos jugados. */
    load(list, mode = 'cpu', me = P0, seeds = 4) {
      S.mode = mode;
      S.me = me;
      S.level = 4;
      S.seeds = seeds;
      nameBars();
      const r = replay(list, seeds);
      S.pos = r.pos;
      S.moves = list.slice();
      S.made = r.made;
      S.legal = S.pos.moves();
      S.over = null;
      S.view = null;
      S.last = r.made.length ? lastOf(r.made[r.made.length - 1]) : -1;
      S.busy = false;
      S.thinking = false;
      S.bottom = bottomColor();
      buildBoard();
      markLast();
      setPlaying(true);
      show(null);
      refresh();
      renderMoves();
      markMoves();
    },
  };
G.ready();
