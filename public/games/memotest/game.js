/* Memotest — game.it
 * Dar vuelta cartas y encontrar las parejas: solo (con intentos, tiempo y récord), del día (las mismas cartas para todos), contra la
 * compu (con memoria de tres niveles), de a varios en la misma pantalla y online de 2 a 4 (el servidor guarda el reparto: solo
 * llega la cara de las cartas que se dan vuelta). El mazo está en shared/deck.js y la memoria de la compu en shared/brain.js.
 */
import { FACES, SIZES, RANGE, deal, fit, stars, isSize, isTheme } from './shared/deck.js';
import { Brain } from './shared/brain.js';
import { today, dayNumber, msUntilNext, fmtClock, loadDay, saveDay, record, loadStats, markPortal, share, shareLink, rng } from '/shared/daily.js';
import { OnlineRoom, netText, defaultName, share as shareRoom, roomFromUrl } from '/shared/online.js';
import { pickLobby } from '/shared/race-lobby.js';
import { tone, noise, notes, unlock } from '/shared/sfx.js';

const G = window.GameIt;
const ID = 'memotest';
const EPOCH = '2026-10-28';
const DAILY = { size: 'l', theme: 'mix' };
const DEBUG = /[?&]debug\b/.test(location.search);
const $ = (id) => document.getElementById(id);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- textos
const TXT = {
  title: { es: 'Memotest', en: 'Memory' },
  tagline: { es: 'Dale vuelta a las cartas y encontrá las parejas.', en: 'Flip the cards and find the pairs.' },
  solo: { es: 'Solo', en: 'Solo' },
  soloSub: { es: 'a tu ritmo, con récord', en: 'at your pace, with a best score' },
  soloBest: { es: 'tu récord: {m} intentos · {t}', en: 'your best: {m} tries · {t}' },
  daily: { es: 'Memotest del día', en: 'Daily Memory' },
  dailySub: { es: 'n.º {n} · las mismas cartas para todos', en: '#{n} · the same cards for everyone' },
  dailyDone: { es: 'n.º {n} · ✓ {m} intentos', en: '#{n} · ✓ {m} tries' },
  dailyGo: { es: 'n.º {n} · seguí tu partida de hoy', en: '#{n} · continue today’s game' },
  vsCpu: { es: 'Contra la compu', en: 'Against the computer' },
  vsCpuSub: { es: 'tres niveles de memoria', en: 'three memory levels' },
  local: { es: 'De a varios', en: 'Pass and play' },
  localSub: { es: '2 a 4 en la misma pantalla', en: '2 to 4 on one screen' },
  online: { es: 'Online', en: 'Online' },
  onlineSub: { es: 'hasta 4 jugadores', en: 'up to 4 players' },
  onlineLong: { es: 'Partida rápida con quien esté buscando, o creá una sala y pasale el código a tus amigos.', en: 'Quick game with whoever is looking, or create a room and send the code to your friends.' },
  quick: { es: 'Partida rápida', en: 'Quick game' },
  quickSub: { es: 'te junta con otros', en: 'finds you opponents' },
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
  needPlayers: { es: 'Faltan jugadores: con 2 ya se puede empezar.', en: 'Waiting for players: 2 is enough to start.' },
  foundRival: { es: '¡Encontramos jugadores! Empieza enseguida…', en: 'Players found! Starting soon…' },
  searching: { es: 'Buscando una sala…', en: 'Looking for a room…' },
  publicRoom: { es: 'Sala pública', en: 'Public room' },
  yes: { es: 'Sí', en: 'Yes' },
  no: { es: 'No', en: 'No' },
  level: { es: 'Nivel de la compu', en: 'Computer level' },
  levels: { es: ['Despistado', 'Atento', 'Memorión'], en: ['Forgetful', 'Sharp', 'Elephant'] },
  levelHelp: {
    es: ['Se olvida de muchas cartas y a veces ni aprovecha las que sabe.', 'Se acuerda de la mayoría. Hay que andar rápido.', 'Casi no se olvida de nada. Solo se le gana con suerte y buena memoria.'],
    en: ['Forgets a lot of cards and sometimes misses pairs it knows.', 'Remembers most cards. You have to be quick.', 'Almost never forgets. You need luck and a great memory.'],
  },
  players: { es: 'Jugadores', en: 'Players' },
  size: { es: 'Cartas', en: 'Cards' },
  sizePairs: { es: '{n} pares', en: '{n} pairs' },
  theme: { es: 'Dibujos', en: 'Pictures' },
  themes: { es: { fruits: 'Frutas', animals: 'Animales', food: 'Comida', things: 'Cosas', mix: 'Mezcla' }, en: { fruits: 'Fruit', animals: 'Animals', food: 'Food', things: 'Things', mix: 'Mix' } },
  go: { es: '¡A jugar!', en: 'Let’s play!' },
  back: { es: '← volver', en: '← back' },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'Seguir', en: 'Resume' },
  restart: { es: 'Empezar de nuevo', en: 'Start over' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  menu: { es: 'Menú', en: 'Menu' },
  rulesTitle: { es: 'Cómo se juega', en: 'How to play' },
  gotIt: { es: '¡Entendido!', en: 'Got it!' },
  moves: { es: 'Intentos', en: 'Tries' },
  time: { es: 'Tiempo', en: 'Time' },
  pairsLbl: { es: 'Pares', en: 'Pairs' },
  record: { es: 'Récord', en: 'Best' },
  streakLbl: { es: 'Racha', en: 'Streak' },
  you: { es: 'Vos', en: 'You' },
  cpuName: { es: 'Compu', en: 'CPU' },
  playerN: { es: 'Jugador {n}', en: 'Player {n}' },
  yourTurn: { es: 'Tu turno', en: 'Your turn' },
  turnLocal: { es: 'Le toca jugar', en: 'To play' },
  thinking: { es: 'Pensando…', en: 'Thinking…' },
  waiting: { es: 'Esperando…', en: 'Waiting…' },
  away: { es: 'Se desconectó…', en: 'Disconnected…' },
  outSeat: { es: 'Afuera', en: 'Out' },
  outToast: { es: 'Quedaste afuera por no jugar a tiempo. Podés seguir mirando.', en: 'You’re out for not playing in time. You can keep watching.' },
  yourTurnToast: { es: '¡Te toca!', en: 'Your turn!' },
  streakToast: { es: '¡Racha de {n}!', en: '{n} in a row!' },
  doneSolo: { es: '¡Lo lograste!', en: 'You did it!' },
  newBest: { es: '¡Nuevo récord!', en: 'New best!' },
  youWin: { es: '¡Ganaste!', en: 'You won!' },
  youLose: { es: 'Perdiste', en: 'You lost' },
  drawn: { es: 'Empate', en: 'Draw' },
  winner: { es: 'Gana {n}', en: '{n} wins' },
  dailyKicker: { es: 'Memotest del día n.º {n}', en: 'Daily Memory #{n}' },
  dailyAlready: { es: 'Ya jugaste el de hoy', en: 'You already played today’s' },
  nextDaily: { es: 'Próximo desafío en', en: 'Next challenge in' },
  share: { es: 'Compartir resultado', en: 'Share result' },
  shared: { es: '¡Copiado!', en: 'Copied!' },
  again: { es: 'Otra partida', en: 'Play again' },
  rematch: { es: 'Revancha', en: 'Rematch' },
  waitHost: { es: 'Esperando al anfitrión…', en: 'Waiting for the host…' },
  rivalsLeft: { es: 'Los demás se fueron: ganás vos', en: 'Everyone else left: you win' },
  rivalLeftOther: { es: 'Los demás se fueron', en: 'Everyone else left' },
  wins: { es: 'Ganadas', en: 'Won' },
  losses: { es: 'Perdidas', en: 'Lost' },
  draws: { es: 'Empates', en: 'Draws' },
  shareText: { es: 'game.it · Memotest #{n}\n{s} · {m} intentos · {t}\n{u}', en: 'game.it · Memory #{n}\n{s} · {m} tries · {t}\n{u}' },
  rules: {
    es: `<p><b>Objetivo:</b> encontrar todas las parejas de cartas iguales. Solo, con la menor cantidad de intentos; con otros, juntando más parejas que ellos.</p>
<h3>Cómo se juega</h3>
<ul>
<li>Todas las cartas empiezan boca abajo. En tu turno das vuelta <b>dos cartas</b>.</li>
<li>Si son iguales, <b>te llevás la pareja</b> y jugás de nuevo.</li>
<li>Si no, se vuelven a tapar: acordate dónde estaban. Y pasa el turno.</li>
<li>Termina cuando no quedan cartas. Gana quien tiene más parejas (si empatan, ganan los dos).</li>
</ul>
<h3>Modos</h3>
<ul>
<li><b>Solo:</b> cuenta intentos (cada par de cartas dadas vuelta) y tiempo. Ganás hasta 3 estrellas según cuántos intentos necesitaste, y se guarda tu récord por tamaño.</li>
<li><b>Del día:</b> las mismas cartas para todos, un solo intento por día. Compartí tu resultado y compará con tus amigos.</li>
<li><b>Contra la compu:</b> tiene memoria como una persona: el Despistado se olvida de mucho; el Memorión, de casi nada.</li>
<li><b>De a varios y online:</b> de 2 a 4. Online cada turno dura 25 segundos: si no jugás dos veces seguidas quedás afuera (seguís mirando).</li>
</ul>
<h3>Para tener en cuenta</h3>
<ul>
<li>En solo podés tocar otra carta sin esperar a que se tapen las dos que erraste.</li>
<li>Mirá también las cartas que dan vuelta los demás: te sirven para acordarte.</li>
</ul>`,
    en: `<p><b>Goal:</b> find all the pairs of matching cards. Solo, in as few tries as possible; with others, by collecting more pairs than they do.</p>
<h3>How to play</h3>
<ul>
<li>All cards start face down. On your turn you flip <b>two cards</b>.</li>
<li>If they match, <b>you keep the pair</b> and play again.</li>
<li>If not, they flip back: remember where they were. Then it’s the next player’s turn.</li>
<li>It ends when no cards are left. Whoever has more pairs wins (a tie means everyone tied wins).</li>
</ul>
<h3>Modes</h3>
<ul>
<li><b>Solo:</b> counts tries (every two flipped cards) and time. You earn up to 3 stars depending on how many tries you needed, and your best is saved per size.</li>
<li><b>Daily:</b> the same cards for everyone, one try a day. Share your result and compare with friends.</li>
<li><b>Against the computer:</b> it has a human-like memory: Forgetful forgets a lot; Elephant forgets almost nothing.</li>
<li><b>Pass and play and online:</b> 2 to 4 players. Online every turn lasts 25 seconds: if you don’t play twice in a row you’re out (you keep watching).</li>
</ul>
<h3>Good to know</h3>
<ul>
<li>In solo you can tap another card without waiting for your two missed cards to flip back.</li>
<li>Watch the cards others flip too: they help you remember.</li>
</ul>`,
  },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (typeof s === 'string' && v) for (const x in v) s = s.replaceAll(`{${x}}`, v[x]);
  return s;
};
const lang = () => (G.prefs?.lang === 'en' ? 'en' : 'es');
const levelName = (l) => TXT.levels[lang()][l - 1];
const themeName = (k) => TXT.themes[lang()][k];

// ---------------------------------------------------------------- preferencias y récords
const KEY = { prefs: `gameit:${ID}:prefs`, best: `gameit:${ID}:best`, stats: `gameit:${ID}:stats`, dsave: `gameit:${ID}:dailysave` };
const load = (k, d) => {
  try {
    const v = JSON.parse(localStorage.getItem(k));
    return v && typeof v === 'object' ? { ...d, ...v } : d;
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
const OPTS = load(KEY.prefs, { size: 'm', theme: 'mix', level: 2, players: 2 });
if (!isSize(OPTS.size)) OPTS.size = 'm';
if (!isTheme(OPTS.theme)) OPTS.theme = 'mix';
if (![1, 2, 3].includes(OPTS.level)) OPTS.level = 2;
if (![2, 3, 4].includes(OPTS.players)) OPTS.players = 2;
const savePrefs = () => store(KEY.prefs, OPTS);
const bestOf = (size) => load(KEY.best, {})[size] || null;

const COLORS = ['#3fd0c0', '#ff7a59', '#ffd23f', '#a08cff'];
const THEME_ICON = { fruits: '🍓', animals: '🐱', food: '🍕', things: '🚀', mix: '🎲' };
const MATCH_MS = 700;
const MISS_MS = 1150;

// ---------------------------------------------------------------- estado
const S = {
  mode: null, // 'solo' | 'daily' | 'cpu' | 'local' | 'online'
  size: 'm',
  theme: 'mix',
  level: 2,
  pairs: 0,
  count: 0,
  faces: [], // el reparto (online: -1 hasta que se da vuelta)
  st: [], // 0 boca abajo · 1 a la vista · 2 llevada
  own: [], // asiento que se llevó cada carta
  up: [], // cartas a la vista ahora
  found: 0,
  seats: [], // { name, color, pairs, out, id? }
  turn: 0,
  me: 0,
  moves: 0,
  ms: 0,
  started: false,
  clockOn: false,
  t0: 0,
  resolving: null, // 'match' | 'miss' mientras se ven las dos cartas
  tm: 0,
  over: null,
  paused: false,
  brain: null,
  cpuRun: 0,
  streak: 0,
  n: 0, // online: número de partida
  busyNet: false,
  deadline: 0,
  turnMs: 25000,
  date: '',
  dayN: 0,
  rec: null, // resultado ya calculado de la partida terminada
  setupMode: 'solo',
  rulesBack: 'home',
};
let online = null;
let quick = false;
let quickHost = false;
let quickTimer = 0;
const cards = [];
const pending = new Set();

// ---------------------------------------------------------------- sonidos
const sfx = {
  flip: () => {
    noise(0.04, { freq: 2600, q: 2, vol: 0.06 });
    tone(520, 700, 0.07, { type: 'triangle', vol: 0.07 });
  },
  back: () => tone(420, 300, 0.09, { type: 'triangle', vol: 0.045 }),
  match: () => notes([659.25, 880, 1174.66], { step: 0.07, dur: 0.16, type: 'triangle', vol: 0.09 }),
  miss: () => tone(240, 170, 0.16, { type: 'sawtooth', vol: 0.035 }),
  turn: () => notes([660, 880], { step: 0.07, dur: 0.1, vol: 0.05 }),
  win: () => notes([523.25, 659.25, 783.99, 1046.5, 1318.5], { step: 0.1, dur: 0.3, type: 'triangle', vol: 0.09 }),
  lose: () => notes([440, 370, 294], { step: 0.12, dur: 0.24, type: 'triangle', vol: 0.05 }),
  draw: () => notes([523.25, 523.25], { step: 0.14, dur: 0.22, type: 'triangle', vol: 0.06 }),
  err: () => tone(200, 150, 0.12, { type: 'square', vol: 0.04 }),
  ui: () => tone(900, 640, 0.045, { type: 'square', vol: 0.035 }),
};

// ---------------------------------------------------------------- pantallas
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  G.gameplay(!id && !!S.mode);
}
const screenOpen = () => $$('.screen.on').length > 0;
const setPlaying = (on) => document.body.classList.toggle('playing', on);
function toast(text, ms = 1800) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast.tm);
  toast.tm = setTimeout(() => (el.hidden = true), ms);
}
function confetti() {
  const c = $('confetti');
  c.innerHTML = '';
  const cols = ['#ffc93c', '#ff7a59', '#4fd1a5', '#6fb7ff', '#a08cff', '#ff5d8f'];
  for (let k = 0; k < 70; k++) {
    const i = document.createElement('i');
    i.style.cssText = `--x:${Math.random() * 100}%;--c:${cols[k % cols.length]};--r:${Math.random() * 360}deg;--dx:${(Math.random() - 0.5) * 180}px;--d:${1.9 + Math.random() * 1.6}s;animation-delay:${Math.random() * 0.5}s`;
    c.appendChild(i);
  }
  clearTimeout(confetti.tm);
  confetti.tm = setTimeout(() => (c.innerHTML = ''), 4500);
}

// ---------------------------------------------------------------- tablero
function buildBoard() {
  const board = $('board');
  board.innerHTML = '';
  cards.length = 0;
  for (let i = 0; i < S.count; i++) {
    const b = document.createElement('button');
    b.className = 'card can';
    b.dataset.i = i;
    b.style.setProperty('--k', i);
    b.setAttribute('aria-label', `${i + 1}`);
    b.innerHTML = '<span class="in"><span class="face back"></span><span class="face front"><b></b></span></span>';
    board.appendChild(b);
    cards.push(b);
    renderCard(i);
  }
  pending.clear();
}
function renderCard(i, extra = '') {
  const b = cards[i];
  if (!b) return;
  const st = S.st[i];
  b.classList.toggle('up', st === 1);
  b.classList.toggle('done', st === 2);
  b.classList.toggle('can', st === 0);
  b.disabled = st === 2;
  if (st === 2) b.style.setProperty('--own', S.seats[S.own[i]]?.color || '#ffd23f');
  const f = S.faces[i];
  const face = b.querySelector('b');
  const txt = f >= 0 && f !== undefined ? FACES[f] : '';
  if (face.textContent !== txt) face.textContent = txt;
  if (extra === 'pop') {
    b.classList.remove('pop');
    b.offsetWidth;
    b.classList.add('pop');
  }
}
function wobble(list) {
  for (const i of list) {
    const b = cards[i];
    if (!b || S.st[i] !== 1) continue;
    b.classList.remove('miss');
    b.offsetWidth;
    b.classList.add('miss');
    setTimeout(() => b.classList.remove('miss'), 450);
  }
}
function floatText(i, text, color) {
  const g = $('game').getBoundingClientRect();
  const r = cards[i]?.getBoundingClientRect();
  if (!r) return;
  const f = document.createElement('span');
  f.className = 'float';
  f.textContent = text;
  f.style.setProperty('--c', color);
  f.style.left = `${r.left - g.left + r.width / 2}px`;
  f.style.top = `${r.top - g.top + r.height / 2}px`;
  $('game').appendChild(f);
  setTimeout(() => f.remove(), 950);
}
function measure() {
  const g = $('game');
  const actH = $('actions').offsetHeight;
  document.documentElement.style.setProperty('--act-h', `${actH}px`);
  if (!S.count) return;
  const W = Math.min(g.clientWidth - 16, 1100);
  const H = g.clientHeight - 16 - $('hud').offsetHeight - actH - 16;
  const gap = clamp(Math.round(Math.min(W, H) / 46), 5, 12);
  const f = fit(S.count, W, Math.max(H, 80), gap, 0.78);
  const cw = Math.max(28, Math.floor(Math.min(f.cw, 132)));
  const s = document.documentElement.style;
  s.setProperty('--cols', f.cols);
  s.setProperty('--cw', `${cw}px`);
  s.setProperty('--ch', `${Math.round(cw / 0.78)}px`);
  s.setProperty('--gap', `${gap}px`);
}
new ResizeObserver(measure).observe($('game'));

// ---------------------------------------------------------------- HUD
const setText = (id, v) => {
  const e = $(id);
  if (e && e.textContent !== String(v)) e.textContent = v;
};
const fmtT = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const soloLike = () => S.mode === 'solo' || S.mode === 'daily';
function buildHud() {
  const hud = $('hud');
  hud.classList.toggle('grid', !soloLike() && S.seats.length > 2);
  if (soloLike()) {
    const stat = (k, lab) => `<div class="chip stat"><b class="pts" id="hv-${k}">0</b><span class="lab">${esc(lab)}</span></div>`;
    hud.innerHTML = stat('moves', t('moves')) + stat('time', t('time')) + stat('pairs', t('pairsLbl'));
  } else {
    hud.innerHTML = S.seats.map((s, k) => `<div class="chip" data-k="${k}" style="--c:${esc(s.color)}"><i class="dot"></i><div class="who"><b class="nm"></b><small class="st"></small></div><b class="pts">0</b><span class="tbar" hidden><i></i></span></div>`).join('');
  }
  updateHud();
  requestAnimationFrame(measure);
}
function statusOf(k) {
  const s = S.seats[k];
  if (S.over) return '';
  if (s.out) return t('outSeat');
  if (S.turn !== k) return S.mode === 'cpu' && k !== S.me ? levelName(S.level) : '';
  if (S.mode === 'cpu') return k === S.me ? t('yourTurn') : t('thinking');
  if (S.mode === 'local') return t('turnLocal');
  if (k === S.me) return t('yourTurn');
  return s.away ? t('away') : t('waiting');
}
function elapsed() {
  return S.ms + (S.clockOn ? performance.now() - S.t0 : 0);
}
function updateHud() {
  if (soloLike()) {
    setText('hv-moves', S.moves);
    setText('hv-time', fmtT(elapsed()));
    setText('hv-pairs', `${S.found}/${S.pairs}`);
    return;
  }
  $$('#hud .chip').forEach((c, k) => {
    const s = S.seats[k];
    if (!s) return;
    c.querySelector('.nm').textContent = s.name;
    c.classList.toggle('turn', !S.over && S.turn === k && !s.out);
    c.classList.toggle('out', !!s.out);
    c.querySelector('.st').textContent = statusOf(k);
    const pts = c.querySelector('.pts');
    if (pts.textContent !== String(s.pairs)) {
      const had = pts.textContent !== '0' || s.pairs > 0;
      pts.textContent = s.pairs;
      if (had) {
        pts.classList.remove('bump');
        pts.offsetWidth;
        pts.classList.add('bump');
      }
    }
  });
}
function tickTimer() {
  if (S.mode === 'online' && !S.over) {
    const bars = $$('#hud .tbar');
    const left = S.deadline ? S.deadline - (online ? online.serverNow() : Date.now()) : 0;
    bars.forEach((bar, k) => {
      const on = S.deadline > 0 && S.turn === k && !S.seats[k]?.out;
      bar.hidden = !on;
      if (on) {
        bar.style.setProperty('--p', clamp(left / S.turnMs, 0, 1));
        bar.classList.toggle('low', left < 7000);
      }
    });
  } else if (soloLike()) updateHud();
}
setInterval(tickTimer, 120);

// ---------------------------------------------------------------- reloj (solo y del día)
function startClock() {
  if (!soloLike() || S.clockOn || S.over) return;
  S.clockOn = true;
  S.t0 = performance.now();
}
function stopClock() {
  if (!S.clockOn) return;
  S.ms += performance.now() - S.t0;
  S.clockOn = false;
}

// ---------------------------------------------------------------- partida
function seatsFor(mode) {
  if (mode === 'cpu') return [{ name: t('you'), color: COLORS[0], pairs: 0 }, { name: t('cpuName'), color: COLORS[1], pairs: 0 }];
  if (mode === 'local') return Array.from({ length: S.players }, (_, k) => ({ name: t('playerN', { n: k + 1 }), color: COLORS[k], pairs: 0 }));
  return [{ name: t('you'), color: COLORS[0], pairs: 0 }];
}
function newGame(mode, o = {}) {
  clearTimeout(S.tm);
  S.cpuRun++;
  S.mode = mode;
  S.size = o.size || OPTS.size;
  S.theme = o.theme || OPTS.theme;
  S.level = o.level || OPTS.level;
  S.players = o.players || OPTS.players;
  S.pairs = SIZES[S.size];
  S.count = S.pairs * 2;
  S.faces = o.faces || deal(Math.random, S.pairs, S.theme);
  S.st = new Array(S.count).fill(0);
  S.own = new Array(S.count).fill(-1);
  S.up = [];
  S.found = 0;
  S.moves = 0;
  S.ms = 0;
  S.started = false;
  S.clockOn = false;
  S.resolving = null;
  S.over = null;
  S.rec = null;
  S.streak = 0;
  S.paused = false;
  S.seats = seatsFor(mode);
  S.me = 0;
  S.turn = mode === 'cpu' ? (Math.random() < 0.5 ? 0 : 1) : 0;
  S.brain = mode === 'cpu' ? new Brain(S.level, Math.random) : null;
  S.date = o.date || '';
  S.dayN = o.dayN || 0;
  buildBoard();
  buildHud();
  measure();
  setPlaying(true);
  show(null);
  if (mode === 'cpu' && S.turn !== S.me) cpuTurn();
}
const startSolo = () => newGame('solo');
function startCpu() {
  newGame('cpu');
}
function startLocal() {
  newGame('local');
}
const dailyFaces = (date) => deal(rng(`memotest-daily-${date}`), SIZES[DAILY.size], DAILY.theme);
function startDaily() {
  const date = today();
  const n = dayNumber(EPOCH, date);
  const done = loadDay(ID, 'all', date);
  if (done) {
    S.mode = 'daily';
    S.date = date;
    S.dayN = n;
    S.size = DAILY.size;
    S.pairs = SIZES[DAILY.size];
    S.rec = done;
    return showDailyResult(done, true);
  }
  newGame('daily', { ...DAILY, faces: dailyFaces(date), date, dayN: n });
  const sv = load(KEY.dsave, null);
  if (sv && sv.date === date && Array.isArray(sv.done)) {
    for (const i of sv.done) if (i >= 0 && i < S.count) {
      S.st[i] = 2;
      S.own[i] = 0;
    }
    S.found = S.st.filter((x) => x === 2).length / 2;
    S.moves = sv.moves | 0;
    S.ms = Math.max(0, +sv.ms || 0);
    S.started = S.moves > 0;
    cards.forEach((_, i) => renderCard(i));
    updateHud();
  }
}
function saveDaily() {
  if (S.mode !== 'daily') return;
  if (S.over) return store(KEY.dsave, null);
  store(KEY.dsave, { date: S.date, done: S.st.map((x, i) => (x === 2 ? i : -1)).filter((i) => i >= 0), moves: S.moves, ms: Math.round(elapsed()) });
}

// ---------------------------------------------------------------- jugar (sin servidor)
board_click: {
  $('board').addEventListener('click', (e) => {
    const c = e.target.closest('.card');
    if (!c) return;
    unlock();
    onTap(Number(c.dataset.i));
  });
}
function onTap(i) {
  if (S.over || S.paused || screenOpen() || !S.mode) return;
  if (S.mode === 'online') return tapOnline(i);
  if (S.mode === 'cpu' && S.turn !== S.me) return;
  if (S.st[i] !== 0) return;
  if (S.resolving === 'miss' && soloLike()) {
    // en solo no hace falta esperar a que se tapen las dos que erraste
    clearTimeout(S.tm);
    finishMiss();
  } else if (S.resolving) return;
  flipCard(i);
}
function flipCard(i) {
  if (!S.started) {
    S.started = true;
    startClock();
  } else startClock();
  S.st[i] = 1;
  S.up.push(i);
  renderCard(i);
  sfx.flip();
  S.brain?.see(i, S.faces[i]);
  if (S.up.length < 2) return;
  S.moves++;
  const [a, b] = S.up;
  const match = S.faces[a] === S.faces[b];
  S.resolving = match ? 'match' : 'miss';
  updateHud();
  S.tm = setTimeout(match ? finishMatch : finishMiss, match ? MATCH_MS : MISS_MS);
  if (!match) setTimeout(() => S.resolving === 'miss' && S.up[0] === a && wobble([a, b]), 620);
}
function finishMatch() {
  const [a, b] = S.up;
  const seat = S.turn;
  for (const i of [a, b]) {
    S.st[i] = 2;
    S.own[i] = seat;
    renderCard(i, 'pop');
  }
  S.up = [];
  S.resolving = null;
  S.seats[seat].pairs++;
  S.found++;
  S.streak++;
  S.brain?.taken(a, b);
  sfx.match();
  if (!soloLike()) floatText(b, '+1', S.seats[seat].color);
  else if (S.streak >= 3 && S.streak % 1 === 0 && S.found < S.pairs) toast(t('streakToast', { n: S.streak }), 1100);
  updateHud();
  saveDaily();
  if (S.found === S.pairs) return endGame();
  S.brain?.endTurn();
  if (S.mode === 'cpu' && S.turn !== S.me) cpuTurn();
}
function finishMiss() {
  for (const i of S.up) {
    S.st[i] = 0;
    renderCard(i);
  }
  S.up = [];
  S.resolving = null;
  S.streak = 0;
  sfx.back();
  S.brain?.endTurn();
  if (S.mode === 'local' || S.mode === 'cpu') {
    S.turn = (S.turn + 1) % S.seats.length;
    if (S.mode === 'local') sfx.turn();
  }
  updateHud();
  saveDaily();
  if (S.mode === 'cpu' && S.turn !== S.me) cpuTurn();
}

// ---------------------------------------------------------------- la compu
async function cpuTurn() {
  const run = ++S.cpuRun;
  const alive = () => run === S.cpuRun && !S.over && S.mode === 'cpu';
  const hold = async () => {
    while (alive() && (S.paused || screenOpen())) await sleep(150);
    return alive();
  };
  await sleep(650);
  if (!(await hold())) return;
  const down = S.st.map((x, i) => (x === 0 ? i : -1)).filter((i) => i >= 0);
  if (down.length < 2) return;
  const f = S.brain.first(down);
  flipCard(f.i);
  await sleep(780);
  if (!(await hold())) return;
  const j = f.pair >= 0 ? f.pair : S.brain.second(f.i, S.faces[f.i], down);
  flipCard(j);
}

// ---------------------------------------------------------------- fin de la partida
function endGame() {
  if (S.over) return;
  stopClock();
  S.over = { reason: 'done' };
  S.cpuRun++;
  const solo = soloLike();
  if (solo) {
    const ms = Math.round(elapsed());
    const st = stars(S.moves, S.pairs);
    S.rec = { moves: S.moves, ms, stars: st, size: S.size };
    if (S.mode === 'solo') {
      const all = load(KEY.best, {});
      const cur = all[S.size];
      const isBest = !cur || S.moves < cur.moves || (S.moves === cur.moves && ms < cur.ms);
      S.rec.wasBest = cur || null;
      S.rec.isBest = isBest;
      if (isBest) {
        all[S.size] = { moves: S.moves, ms };
        store(KEY.best, all);
      }
    } else {
      const stats = record(ID, 'all', { date: S.date, won: true, score: st });
      saveDay(ID, 'all', { moves: S.moves, ms, stars: st, won: true }, S.date);
      markPortal(ID, { date: S.date, done: true, won: true, streak: stats.streak });
      store(KEY.dsave, null);
    }
    sfx.win();
    confetti();
    setTimeout(() => (S.mode === 'daily' ? showDailyResult(S.rec, false) : showOver()), 1100);
    return;
  }
  const best = Math.max(...S.seats.map((s) => s.pairs));
  const winners = S.seats.map((s, k) => (s.pairs === best ? k : -1)).filter((k) => k >= 0);
  S.over = { reason: 'done', winners };
  if (S.mode === 'cpu') {
    const all = load(KEY.stats, {});
    const cur = all[S.level] || { w: 0, l: 0, d: 0 };
    if (winners.length > 1) cur.d++;
    else if (winners[0] === S.me) cur.w++;
    else cur.l++;
    all[S.level] = cur;
    store(KEY.stats, all);
  }
  const mineWon = winners.includes(S.me) && winners.length === 1;
  (winners.length > 1 ? sfx.draw : S.mode === 'local' || mineWon ? sfx.win : sfx.lose)();
  if (S.mode === 'local' || mineWon) confetti();
  setTimeout(showOver, 1100);
}
function rankRows(rows) {
  return rows
    .map((r, k) => ({ ...r, k }))
    .sort((a, b) => b.pairs - a.pairs || a.k - b.k)
    .map((r, i, arr) => ({ ...r, rank: i > 0 && arr[i - 1].pairs === r.pairs ? arr[i - 1].rank : i + 1 }));
}
function showOver() {
  if (!S.over) return;
  const m = S.mode;
  $('over-kicker').textContent = '';
  $('over-sub').textContent = '';
  $('over-stars').hidden = true;
  $('over-stats').hidden = true;
  $('over-next').hidden = true;
  $('over-share').hidden = true;
  $('over-final').innerHTML = '';
  if (m === 'solo') {
    const r = S.rec;
    $('over-title').textContent = r.isBest ? t('newBest') : t('doneSolo');
    renderStars(r.stars);
    const best = r.isBest ? { moves: r.moves, ms: r.ms } : r.wasBest;
    $('over-stats').innerHTML = `<span><b>${r.moves}</b><small>${t('moves')}</small></span><span><b>${fmtT(r.ms)}</b><small>${t('time')}</small></span><span><b>${best ? best.moves : '–'}</b><small>${t('record')}</small></span>`;
    $('over-stats').hidden = false;
    $('over-sub').textContent = `${t('sizePairs', { n: S.pairs })} · ${themeName(S.theme)}`;
  } else {
    const rows = rankRows(S.seats.map((s) => ({ name: s.name, color: s.color, pairs: s.pairs })));
    const winners = S.over.winners || [];
    const top = rows[0].pairs;
    $('over-final').innerHTML = rows.map((r) => `<div class="row${r.pairs === top ? ' win' : ''}"><span class="rk">${r.rank}</span><i class="dot" style="--c:${esc(r.color)}"></i><span class="nm">${esc(r.name)}</span><b class="pr">${r.pairs}</b></div>`).join('');
    let title;
    if (S.over.reason === 'abandon') {
      title = winners.includes(S.me) ? t('youWin') : t('winner', { n: S.seats[winners[0]]?.name || '' });
      $('over-sub').textContent = winners.includes(S.me) ? t('rivalsLeft') : t('rivalLeftOther');
    } else if (winners.length > 1) title = t('drawn');
    else if (m === 'local') title = t('winner', { n: S.seats[winners[0]].name });
    else if (winners[0] === S.me) title = t('youWin');
    else title = m === 'cpu' ? t('youLose') : S.seats.length > 2 ? t('winner', { n: S.seats[winners[0]].name }) : t('youLose');
    $('over-title').textContent = title;
    if (m === 'cpu') {
      $('over-kicker').textContent = levelName(S.level);
      const c = load(KEY.stats, {})[S.level] || { w: 0, l: 0, d: 0 };
      $('over-stats').innerHTML = `<span><b>${c.w}</b><small>${t('wins')}</small></span><span><b>${c.l}</b><small>${t('losses')}</small></span><span><b>${c.d}</b><small>${t('draws')}</small></span>`;
      $('over-stats').hidden = false;
    }
  }
  renderOverButtons();
  show('over');
}
function renderStars(n) {
  const el = $('over-stars');
  el.innerHTML = [1, 2, 3].map((k) => `<i class="${k <= n ? 'on' : ''}" style="--k:${k}">★</i>`).join('');
  el.hidden = false;
}
function renderOverButtons() {
  const btn = $('over-again');
  const lab = $('over-again-t');
  btn.hidden = false;
  btn.disabled = false;
  if (S.mode === 'daily') btn.hidden = true;
  else if (S.mode === 'online') {
    const host = !!online?.isHost;
    lab.textContent = host ? t('rematch') : t('waitHost');
    btn.disabled = !host || (online?.room?.players || []).filter((p) => p.connected).length < 2;
  } else lab.textContent = t('again');
}
function showDailyResult(rec, already) {
  S.mode = 'daily';
  const stats = loadStats(ID, 'all');
  $('over-kicker').textContent = t('dailyKicker', { n: S.dayN });
  $('over-title').textContent = already ? t('dailyAlready') : t('doneSolo');
  $('over-sub').textContent = '';
  $('over-final').innerHTML = '';
  renderStars(rec.stars);
  $('over-stats').innerHTML = `<span><b>${rec.moves}</b><small>${t('moves')}</small></span><span><b>${fmtT(rec.ms)}</b><small>${t('time')}</small></span><span><b>${stats.streak}</b><small>${t('streakLbl')}</small></span>`;
  $('over-stats').hidden = false;
  $('over-next').hidden = false;
  $('over-share').hidden = false;
  $('over-again').hidden = true;
  show('over');
  const tick = () => ($('over-clock').textContent = fmtClock(msUntilNext()));
  tick();
  clearInterval(showDailyResult.iv);
  showDailyResult.iv = setInterval(() => (document.querySelector('#s-over.on') ? tick() : clearInterval(showDailyResult.iv)), 500);
}
$('over-share').onclick = async () => {
  const r = S.rec;
  if (!r) return;
  const txt = t('shareText', { n: S.dayN, s: '⭐'.repeat(r.stars), m: r.moves, t: fmtT(r.ms), u: shareLink(ID) });
  const res = await share(txt);
  if (res === 'copied') toast(t('shared'), 1400);
};
$('over-again').onclick = () => {
  if (S.mode === 'online') {
    if (online?.isHost) online.send({ t: 'again' });
    return;
  }
  clearInterval(showDailyResult.iv);
  if (S.mode === 'cpu') startCpu();
  else if (S.mode === 'local') startLocal();
  else startSolo();
};
$('over-menu').onclick = () => toMenu();

// ---------------------------------------------------------------- acciones, pausa y menús
const ICON = {
  menu: '<path d="M5 6h14M5 12h14M5 18h14"/>',
  again: '<path d="M21 12a9 9 0 11-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
};
function renderActions() {
  const list = [];
  if (S.mode === 'solo' || S.mode === 'cpu' || S.mode === 'local') list.push({ k: 'restart', icon: 'again', label: t('restart') });
  list.push({ k: 'menu', icon: 'menu', label: t('menu') });
  $('actions').innerHTML = list.map((a) => `<button class="act" data-k="${a.k}" aria-label="${esc(a.label)}"><svg viewBox="0 0 24 24">${ICON[a.icon]}</svg><span>${esc(a.label)}</span></button>`).join('');
  requestAnimationFrame(measure);
}
$('actions').addEventListener('click', (e) => {
  const b = e.target.closest('.act');
  if (!b) return;
  unlock();
  sfx.ui();
  if (b.dataset.k === 'menu') pause();
  else if (b.dataset.k === 'restart') restart();
});
function restart() {
  if (S.mode === 'cpu') startCpu();
  else if (S.mode === 'local') startLocal();
  else if (S.mode === 'solo') startSolo();
}
function pause() {
  if (!S.mode || screenOpen()) return;
  stopClock();
  S.paused = true;
  $('b-restart').hidden = !(S.mode === 'solo' || S.mode === 'cpu' || S.mode === 'local');
  show('pause');
}
function resume() {
  S.paused = false;
  if (S.started && soloLike() && !S.over) startClock();
  show(null);
}
$('b-resume').onclick = resume;
$('b-restart').onclick = () => {
  S.paused = false;
  restart();
};
$('b-p-rules').onclick = () => {
  S.rulesBack = 'pause';
  show('rules');
};
$('b-quit').onclick = () => toMenu();
function toMenu() {
  S.paused = false;
  clearTimeout(S.tm);
  S.cpuRun++;
  stopClock();
  clearInterval(showDailyResult.iv);
  if (S.mode === 'online') {
    online?.leave();
    online = null;
  }
  if (S.mode === 'daily' && !S.over) saveDaily();
  S.mode = null;
  S.over = null;
  setPlaying(false);
  refreshHome();
  show('home');
}
function refreshHome() {
  const b = bestOf(OPTS.size);
  $('solo-s').textContent = b ? t('soloBest', { m: b.moves, t: fmtT(b.ms) }) : t('soloSub');
  const date = today();
  const n = dayNumber(EPOCH, date);
  const done = loadDay(ID, 'all', date);
  const sv = load(KEY.dsave, null);
  $('daily-s').textContent = done ? t('dailyDone', { n, m: done.moves }) : sv && sv.date === date ? t('dailyGo', { n }) : t('dailySub', { n });
}
$('b-solo').onclick = () => openSetup('solo');
$('b-cpu').onclick = () => openSetup('cpu');
$('b-local').onclick = () => openSetup('local');
$('b-daily').onclick = () => {
  unlock();
  startDaily();
};
$('b-rules').onclick = () => {
  S.rulesBack = 'home';
  show('rules');
};
$('b-rules-ok').onclick = () => show(S.rulesBack === 'pause' ? 'pause' : 'home');
for (const b of $$('.btn, .link, .seg button, .themes button')) b.addEventListener('click', () => sfx.ui());

// ---------------------------------------------------------------- ajustes de una partida
function openSetup(mode) {
  S.setupMode = mode;
  $('setup-title').textContent = t(mode === 'solo' ? 'solo' : mode === 'cpu' ? 'vsCpu' : 'local');
  for (const row of $$('#s-setup [data-for]')) row.hidden = row.dataset.for !== mode;
  syncOpts();
  show('setup');
}
function syncSeg(id, v) {
  for (const b of $$('button', $(id))) b.classList.toggle('on', String(b.dataset.v) === String(v));
}
function syncOpts() {
  syncSeg('o-level', OPTS.level);
  syncSeg('o-players', OPTS.players);
  syncSeg('o-size', OPTS.size);
  syncSeg('o-theme', OPTS.theme);
  $('o-level-help').textContent = G.t(TXT.levelHelp)?.[OPTS.level - 1] || '';
  const b = S.setupMode === 'solo' ? bestOf(OPTS.size) : null;
  $('o-size-help').textContent = `${t('sizePairs', { n: SIZES[OPTS.size] })}${b ? ` · ${t('soloBest', { m: b.moves, t: fmtT(b.ms) })}` : ''}`;
  refreshHome();
}
function bindSeg(id, key, num = false) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled) return;
    OPTS[key] = num ? Number(b.dataset.v) : b.dataset.v;
    savePrefs();
    syncOpts();
  });
}
bindSeg('o-level', 'level', true);
bindSeg('o-players', 'players', true);
bindSeg('o-size', 'size');
bindSeg('o-theme', 'theme');
$('b-setup-back').onclick = () => show('home');
$('b-setup-go').onclick = () => {
  unlock();
  if (S.setupMode === 'cpu') startCpu();
  else if (S.setupMode === 'local') startLocal();
  else startSolo();
};
function labelThemes() {
  for (const box of [$('o-theme'), $('k-theme')])
    for (const b of $$('button', box)) b.innerHTML = `<i>${THEME_ICON[b.dataset.v]}</i><span>${esc(themeName(b.dataset.v))}</span>`;
  $$('#o-level button').forEach((b, i) => (b.textContent = `${i + 1} ${levelName(i + 1)}`));
}

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
        const name = myName();
        if (code) {
          quickHost = false;
          online.join(code, name);
        } else {
          quickHost = true;
          online.create(name, { public: true, size: OPTS.size, theme: OPTS.theme });
        }
      } else if (m.t === 'error') {
        quick = false;
        const txt = m.code === 'need_players' ? t('needPlayers') : netText(m.code);
        $('on-status').textContent = txt;
        $('lobby-status').textContent = txt;
      } else if (m.t === 'closed' || m.t === 'kicked') {
        $('on-status').textContent = netText(m.t === 'kicked' ? 'kicked' : `closed_${m.reason}`);
        clearTimeout(quickTimer);
        quickTimer = 0;
        S.mode = null;
        S.over = null;
        setPlaying(false);
        online = null;
        show('online');
      }
    },
  });
  return online;
}
const myName = () => $('on-name').value.trim() || defaultName();
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
  ensureOnline().create(myName(), { size: OPTS.size, theme: OPTS.theme, public: false });
};
$('on-join').onclick = () => {
  unlock();
  const code = $('on-code').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  quick = false;
  if (code.length === 5) ensureOnline().join(code, myName());
};
$('on-code').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)));
$('on-code').addEventListener('keydown', (e) => e.key === 'Enter' && $('on-join').click());
$('on-name').addEventListener('keydown', (e) => e.key === 'Enter' && $('on-quick').click());
$('lobby-start').onclick = () => online?.send({ t: 'start' });
$('lobby-leave').onclick = () => {
  clearTimeout(quickTimer);
  quickTimer = 0;
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
for (const seg of $$('#lobby-host [data-k]'))
  seg.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || !online?.isHost) return;
    const k = seg.dataset.k;
    online.send({ t: 'settings', settings: { [k]: k === 'public' ? b.dataset.v === '1' : b.dataset.v } });
  };

function applyLobby(room) {
  $('lobby-code').textContent = room.code;
  const st = room.settings || {};
  const people = room.players.filter((p) => p.connected);
  $('lobby-players').innerHTML = room.players
    .map((p) => `<li><i style="background:${esc(p.color)}"></i><span>${esc(p.name)}</span><small>${[p.id === online.myId ? t('youLower') : '', p.id === room.host ? t('host') : ''].filter(Boolean).join(' · ')}</small></li>`)
    .join('');
  for (const seg of $$('#lobby-host [data-k]')) {
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
  // en la partida rápida, el que armó la sala empieza solo: enseguida si ya son 4, o unos segundos después de que entra alguien
  if (online.isHost && quickHost) {
    if (need) {
      clearTimeout(quickTimer);
      quickTimer = 0;
    } else {
      clearTimeout(quickTimer);
      quickTimer = setTimeout(() => {
        quickTimer = 0;
        quickHost = false;
        if (online?.room?.state === 'lobby') online.send({ t: 'start' });
      }, people.length >= 4 ? 1200 : 5000);
    }
  }
}
function tapOnline(i) {
  if (S.over || S.me < 0) return;
  if (S.turn !== S.me) return sfx.err();
  if (S.busyNet || S.st[i] !== 0 || S.up.length >= 2 || S.seats[S.me]?.out || pending.has(i)) return;
  pending.add(i);
  cards[i].classList.add('press');
  online.send({ t: 'flip', i });
}
function applyRoom(room) {
  if (room.state === 'lobby' || !room.memotest) {
    if (S.mode === 'online') {
      S.mode = null;
      S.over = null;
      setPlaying(false);
    }
    applyLobby(room);
    return;
  }
  clearTimeout(quickTimer);
  quickTimer = 0;
  quickHost = false;
  applyGame(room);
}
function applyGame(room) {
  const g = room.memotest;
  const myId = online.myId;
  const prevTurn = S.turn;
  const fresh = S.mode !== 'online' || S.n !== g.n;
  if (fresh) {
    clearTimeout(S.tm);
    S.cpuRun++;
    stopClock();
    S.mode = 'online';
    S.n = g.n;
    S.size = g.size;
    S.theme = g.theme;
    S.count = g.count;
    S.pairs = g.count / 2;
    S.faces = new Array(S.count).fill(-1);
    S.st = new Array(S.count).fill(0);
    S.own = new Array(S.count).fill(-1);
    S.up = [];
    S.found = 0;
    S.moves = 0;
    S.over = null;
    S.rec = null;
    S.paused = false;
    S.resolving = null;
    S.seats = g.seats.map((s) => ({ id: s.id, name: s.name, color: s.color, pairs: 0, out: false, away: false }));
    S.me = g.seats.findIndex((s) => s.id === myId);
    S.turn = g.turn;
    S.turnMs = g.turnMs || 25000;
    pending.clear();
    buildBoard();
    buildHud();
    measure();
    setPlaying(true);
    show(null);
    confetti.tm && ($('confetti').innerHTML = '');
  }
  S.seats.forEach((s, k) => {
    s.pairs = g.scores[k];
    s.out = !!g.out[k];
    const pl = room.players.find((p) => p.id === s.id);
    s.away = !pl || !pl.connected;
  });
  S.turn = g.turn;
  S.busyNet = g.busy;
  S.deadline = g.deadline || 0;
  S.moves = g.moves;
  S.found = g.taken.length / 2;
  // las cartas: lo que dice el servidor
  const nextSt = new Array(S.count).fill(0);
  const nextOwn = new Array(S.count).fill(-1);
  for (const [i, f] of g.up) {
    nextSt[i] = 1;
    S.faces[i] = f;
  }
  for (const [i, f, o] of g.taken) {
    nextSt[i] = 2;
    nextOwn[i] = o;
    S.faces[i] = f;
  }
  let flipped = 0;
  let matched = [];
  let unflipped = 0;
  for (let i = 0; i < S.count; i++) {
    if (S.st[i] === nextSt[i] && S.own[i] === nextOwn[i]) continue;
    const prev = S.st[i];
    S.st[i] = nextSt[i];
    S.own[i] = nextOwn[i];
    if (nextSt[i] === 1 && prev === 0) flipped++;
    if (nextSt[i] === 2 && prev !== 2) matched.push(i);
    if (nextSt[i] === 0 && prev === 1) unflipped++;
    pending.delete(i);
    cards[i].classList.remove('press');
    renderCard(i, nextSt[i] === 2 && prev !== 2 ? 'pop' : '');
  }
  S.up = g.up.map(([i]) => i);
  for (const i of [...pending]) if (S.st[i] !== 0) pending.delete(i);
  if (!g.busy) {
    pending.clear();
    cards.forEach((c) => c.classList.remove('press'));
  }
  if (flipped) sfx.flip();
  if (S.up.length === 2 && S.faces[S.up[0]] !== S.faces[S.up[1]]) {
    const [a, b] = S.up;
    setTimeout(() => S.up[0] === a && S.up[1] === b && wobble([a, b]), 620);
  }
  if (matched.length) {
    sfx.match();
    const o = nextOwn[matched[0]];
    floatText(matched[matched.length - 1], '+1', S.seats[o]?.color || '#fff');
  } else if (unflipped && S.up.length === 0) sfx.back();
  updateHud();
  if (S.me >= 0 && S.seats[S.me].out && !fresh && !S.warnedOut) {
    S.warnedOut = true;
    toast(t('outToast'), 3500);
  }
  if (fresh) S.warnedOut = false;
  if (!fresh && S.me >= 0 && S.turn === S.me && prevTurn !== S.me && !g.result) {
    sfx.turn();
    toast(t('yourTurnToast'), 1100);
  }
  if (g.result && !S.over) {
    S.over = { reason: g.result.reason, winners: g.result.winners };
    updateHud();
    const mine = g.result.winners.includes(S.me);
    (g.result.winners.length > 1 ? sfx.draw : mine ? sfx.win : sfx.lose)();
    if (mine) confetti();
    setTimeout(showOver, 1100);
  } else if (!g.result && S.over) S.over = null;
  if (S.over && document.querySelector('#s-over.on')) renderOverButtons();
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
});
G.onPause?.(() => {
  stopClock();
  S.paused = true;
});
G.onResume?.(() => {
  S.paused = !!document.querySelector('#s-pause.on');
  if (!S.paused && S.started && soloLike() && !S.over && !screenOpen()) startClock();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopClock();
  else if (S.started && soloLike() && !S.over && !S.paused && !screenOpen()) startClock();
});

const drawLogo = () => {
  const f = (e) => `<s class="f">${e}</s>`;
  const b = '<s class="b">?</s>';
  $('logo').innerHTML = `<div class="lg">${f('🍓')}${b}${f('🐱')}${b}${f('🍓')}${b}</div>`;
};
G.onPrefs(
  (p) => {
    document.documentElement.lang = p.lang;
    document.documentElement.classList.toggle('reduced', !!p.reducedMotion);
    $$('[data-t]').forEach((e) => (e.textContent = t(e.dataset.t)));
    labelThemes();
    renderRules();
    renderActions();
    syncOpts();
    refreshHome();
    if (S.mode && S.mode !== 'online' && S.seats.length) {
      const fresh = seatsFor(S.mode);
      S.seats.forEach((s, k) => fresh[k] && (s.name = fresh[k].name));
    }
    if (S.mode) updateHud();
    if (online?.room && document.querySelector('#s-lobby.on')) applyLobby(online.room);
  },
  true,
);

drawLogo();
renderActions();
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
  window.__memotest = {
    S,
    OPTS,
    cards,
    get online() {
      return online;
    },
    startSolo,
    startCpu,
    startLocal,
    startDaily,
    newGame,
    tap: (i) => onTap(i),
    toMenu,
    /** Pone el estado de una partida ya empezada (sin animar): `done` = posiciones llevadas (o [posición, asiento]), `up` = a la vista. */
    set({ done = [], up = [] } = {}) {
      done.forEach((d) => {
        const [i, o] = Array.isArray(d) ? d : [d, 0];
        S.st[i] = 2;
        S.own[i] = o;
      });
      up.forEach((i) => {
        S.st[i] = 1;
        S.up.push(i);
      });
      S.found = S.st.filter((x) => x === 2).length / 2;
      S.seats.forEach((seat, k) => (seat.pairs = S.own.filter((o, i) => o === k && S.st[i] === 2).length / 2));
      cards.forEach((_, i) => renderCard(i));
      updateHud();
    },
  };
G.ready();
