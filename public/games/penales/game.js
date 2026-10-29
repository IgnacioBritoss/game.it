/* Penales — game.it
 * Una tanda de penales en 3D: elegís a dónde apuntar y con cuánta fuerza (más fuerza, menos puntería y menos tiempo para el
 * arquero) o, cuando ataja la compu o un amigo, a qué zona tirarte: los dos eligen a ciegas y recién ahí se ve el remate. Contra
 * la compu (tres niveles, que aprende lo que hacés) u online 1 contra 1 (el servidor sortea el error y valida todo). Las reglas
 * están en shared/rules.js, la tanda en shared/match.js, la compu en shared/cpu.js y la cancha en scene.js.
 */
import { Pitch } from './scene.js';
import { Shootout } from './shared/match.js';
import { judge, makeNoise, sigma, AIM, COLS, ROWS, clamp } from './shared/rules.js';
import { aimShot, pickDive } from './shared/cpu.js';
import { OnlineRoom, netText, defaultName, share as shareRoom, roomFromUrl } from '/shared/online.js';
import { tone, noise, notes, unlock } from '/shared/sfx.js';

const G = window.GameIt;
const ID = 'penales';
const DEBUG = /[?&]debug\b/.test(location.search);
const $ = (id) => document.getElementById(id);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------------------------------------------------------------- textos
const TXT = {
  title: { es: 'Penales', en: 'Penalty Shootout' },
  tagline: { es: 'Elegí el ángulo, cargá la fuerza y metela. Y cuando ataja, tirate al lado correcto.', en: 'Pick your angle, charge the power and score. And when you keep, dive the right way.' },
  vsCpu: { es: 'Contra la compu', en: 'Against the computer' },
  vsCpuSub: { es: 'una tanda, tres niveles', en: 'a shootout, three levels' },
  online: { es: 'Online', en: 'Online' },
  onlineSub: { es: '1 contra 1, a ciegas', en: '1 vs 1, blind picks' },
  onlineLong: { es: 'Creá una sala y compartí el código, o entrá con el de un amigo. Cada uno elige a ciegas y el servidor resuelve el penal.', en: 'Create a room and share the code, or join a friend’s. Each of you picks blind and the server settles the kick.' },
  rulesTitle: { es: 'Cómo se juega', en: 'How to play' },
  level: { es: 'Nivel', en: 'Level' },
  lv1: { es: 'Fácil', en: 'Easy' },
  lv2: { es: 'Normal', en: 'Normal' },
  lv3: { es: 'Difícil', en: 'Hard' },
  lvHelp1: { es: 'Patea y se tira al azar.', en: 'Shoots and dives at random.' },
  lvHelp2: { es: 'Patea a los ángulos y, a veces, se tira al lado que más usaste.', en: 'Shoots at the corners and sometimes dives to the side you use most.' },
  lvHelp3: { es: 'Anota lo que hacés y se tira (o patea) contra tus costumbres.', en: 'Tracks what you do and dives (or shoots) against your habits.' },
  kicks: { es: 'Penales por lado', en: 'Kicks each' },
  first: { es: 'Patea primero', en: 'Shoots first' },
  firstMe: { es: 'Vos', en: 'You' },
  firstCpu: { es: 'Compu', en: 'CPU' },
  firstRand: { es: 'Al azar', en: 'Random' },
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
  you: { es: 'Vos', en: 'You' },
  youLower: { es: 'vos', en: 'you' },
  cpu: { es: 'Compu', en: 'CPU' },
  needPlayers: { es: 'Hace falta un rival: compartí el código.', en: 'You need an opponent: share the code.' },
  waitingHost: { es: 'Esperando que el anfitrión empiece…', en: 'Waiting for the host to start…' },
  copied: { es: '¡Link copiado!', en: 'Link copied!' },
  gotIt: { es: '¡Entendido!', en: 'Got it!' },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'Seguir', en: 'Resume' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  menu: { es: 'Menú', en: 'Menu' },
  // juego
  shoot: { es: '¡PATEAR!', en: 'SHOOT!' },
  dive: { es: '¡TIRARSE!', en: 'DIVE!' },
  tipAim: { es: 'Tocá el arco para apuntar · mantené PATEAR: más fuerza, menos puntería', en: 'Tap the goal to aim · hold SHOOT: more power, less accuracy' },
  tipAimKey: { es: 'Flechas para apuntar · mantené Espacio para cargar', en: 'Arrows to aim · hold Space to charge' },
  tipKeep: { es: 'Elegí hacia dónde tirarte', en: 'Pick where to dive' },
  tipConfirm: { es: 'Tocá otra vez la zona (o TIRARSE)', en: 'Tap the zone again (or DIVE)' },
  tipWait: { es: 'Esperando al rival…', en: 'Waiting for the opponent…' },
  tipCharge: { es: 'Soltá para patear', en: 'Release to shoot' },
  youShoot: { es: '¡Patea vos!', en: 'Your kick!' },
  youKeep: { es: '¡Atajá!', en: 'Save it!' },
  theyShoot: { es: 'Patea {name}', en: '{name} shoots' },
  rGoal: { es: '¡GOOOL!', en: 'GOAL!' },
  rSaved: { es: '¡ATAJÓ!', en: 'SAVED!' },
  rPost: { es: '¡AL PALO!', en: 'OFF THE POST!' },
  rWide: { es: '¡AFUERA!', en: 'WIDE!' },
  rOver: { es: '¡POR ARRIBA!', en: 'OVER THE BAR!' },
  rSub: { es: '{name} {s}', en: '{name} {s}' },
  sbKick: { es: 'Penal {n} de {k}', en: 'Kick {n} of {k}' },
  sbSudden: { es: 'Muerte súbita', en: 'Sudden death' },
  sbFinal: { es: 'Final', en: 'Final' },
  clockTip: { es: '¡Elegí rápido!', en: 'Pick quickly!' },
  // fin
  youWin: { es: '¡Ganaste la tanda!', en: 'You win the shootout!' },
  youLose: { es: 'Perdiste la tanda', en: 'You lose the shootout' },
  winner: { es: '¡Ganó {name}!', en: '{name} wins!' },
  overKicker: { es: 'Fin de la tanda', en: 'Shootout over' },
  rematch: { es: 'Revancha', en: 'Rematch' },
  again: { es: 'Otra tanda', en: 'Play again' },
  waitAgain: { es: 'Esperando a tu rival…', en: 'Waiting for your opponent…' },
  abandon: { es: 'Tu rival se fue: ganás vos.', en: 'Your opponent left: you win.' },
  shGoal: { es: 'gol', en: 'goal' },
  shSaved: { es: 'atajado', en: 'saved' },
  shPost: { es: 'palo', en: 'post' },
  shWide: { es: 'afuera', en: 'wide' },
  shOver: { es: 'por arriba', en: 'over' },
  oppLeft: { es: 'Tu rival se fue de la sala.', en: 'Your opponent left the room.' },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (v) for (const x in v) s = s.replaceAll(`{${x}}`, v[x]);
  return s;
};

const RULES = {
  es: `<p>Una <b>tanda de penales</b>: cada lado patea 5 veces, alternando. Gana el que más goles hace; si empatan, sigue la <b>muerte súbita</b> de a un penal por lado. Si uno ya no puede ser alcanzado, la tanda termina antes.</p>
<h3>Cuando pateás</h3>
<p><b>Tocá el arco</b> (o arrastrá) para poner la mira y <b>mantené PATEAR</b>: la barra sube y baja y soltás para patear. Más fuerza significa que el arquero llega menos, pero la puntería se abre: el círculo punteado de la mira es el error posible. Si apuntás a un ángulo con mucha fuerza, la pelota puede irse <b>afuera</b>, <b>por arriba</b> o pegar en el <b>palo</b>.</p>
<h3>Cuando atajás</h3>
<p>El arco tiene seis zonas (izquierda, centro y derecha, arriba y abajo). Elegí hacia dónde tirarte <b>sin ver</b> el remate: el rival también elige a ciegas. Alcanzás lo que está cerca de tu zona, y menos si el remate viene fuerte.</p>
<h3>La compu</h3>
<p>En <b>Difícil</b> anota a dónde pateás y a dónde te tirás, y juega en contra de tus costumbres: no repitas siempre lo mismo.</p>`,
  en: `<p>A <b>penalty shootout</b>: each side takes 5 kicks, taking turns. Most goals wins; on a tie it goes to <b>sudden death</b>, one kick each. If one side can no longer be caught, the shootout ends early.</p>
<h3>When you shoot</h3>
<p><b>Tap the goal</b> (or drag) to place the aim and <b>hold SHOOT</b>: the bar rises and falls and you release to kick. More power means the keeper reaches less, but your aim spreads: the dashed circle shows the possible error. Aim at a corner with lots of power and the ball can go <b>wide</b>, <b>over</b> or hit the <b>post</b>.</p>
<h3>When you keep</h3>
<p>The goal has six zones (left, centre and right, high and low). Pick where to dive <b>without seeing</b> the shot: your opponent picks blind too. You reach what is near your zone, and less if the shot is hard.</p>
<h3>The computer</h3>
<p>On <b>Hard</b> it records where you shoot and where you dive, and plays against your habits: don’t repeat yourself.</p>`,
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
const OPTS = { level: 2, kicks: 5, first: 0, ...load('opts', {}) };
const COLORS = ['#ff7a59', '#4aa8ff'];

// ---------------------------------------------------------------- estado
const S = {
  mode: null, // cpu | online
  epoch: 0, // cambia al salir: las promesas viejas se descartan
  paused: false,
  so: null,
  me: 0, // mi asiento
  names: ['', ''],
  colors: COLORS.slice(),
  role: null, // shoot | keep
  ready: false, // puedo elegir
  aim: { x: 0, y: 0.42 },
  aimed: false,
  charging: false,
  chargeAt: 0,
  power: 0,
  sel: null, // zona elegida al atajar
  resolve: null,
  anim: false,
  hist: { humanShots: [], humanDives: [], cpuShots: [] },
  board: null,
  over: false,
  last: null, // el último remate animado (para el cartel)
  ol: null,
};
let online = null;
let pitch = null;

// ---------------------------------------------------------------- tiempo pausable
const waiters = [];
const wait = (ms) => new Promise((res) => waiters.push({ left: ms / 1000, res }));
function tickWaiters(dt) {
  for (let i = waiters.length - 1; i >= 0; i--) {
    const w = waiters[i];
    w.left -= dt;
    if (w.left <= 0) {
      waiters.splice(i, 1);
      w.res();
    }
  }
}
const stale = (ep) => ep !== S.epoch;

// ---------------------------------------------------------------- sonidos
const sfx = {
  whistle() {
    tone(2300, 2300, 0.18, { type: 'sine', vol: 0.07 });
    tone(2050, 2050, 0.32, { type: 'sine', vol: 0.07, at: 0.2 });
  },
  kick() {
    noise(0.07, { freq: 220, q: 0.9, vol: 0.28, sweep: -120 });
    tone(150, 60, 0.12, { type: 'triangle', vol: 0.16 });
  },
  net() {
    noise(0.55, { freq: 1700, q: 0.7, vol: 0.14, sweep: -900 });
    noise(0.3, { freq: 600, q: 1, vol: 0.1, at: 0.05 });
  },
  cheer() {
    noise(1.4, { freq: 1100, q: 0.5, vol: 0.12, sweep: 500 });
    notes([523.25, 659.25, 783.99, 1046.5], { step: 0.09, dur: 0.22, type: 'triangle', vol: 0.06, at: 0.1 });
  },
  save() {
    noise(0.1, { freq: 500, q: 1.2, vol: 0.22, sweep: -250 });
    tone(220, 120, 0.14, { type: 'square', vol: 0.05 });
  },
  post() {
    tone(1400, 1250, 0.5, { type: 'sine', vol: 0.12 });
    tone(2100, 1900, 0.35, { type: 'sine', vol: 0.05 });
  },
  groan() {
    noise(0.9, { freq: 520, q: 0.6, vol: 0.08, sweep: -250 });
    notes([392, 330, 262], { step: 0.14, dur: 0.26, type: 'triangle', vol: 0.05, at: 0.1 });
  },
  win: () => notes([523.25, 659.25, 783.99, 1046.5, 1318.5], { step: 0.1, dur: 0.3, type: 'triangle', vol: 0.09 }),
  lose: () => notes([440, 370, 294], { step: 0.14, dur: 0.28, type: 'triangle', vol: 0.05 }),
  ui: () => tone(900, 640, 0.045, { type: 'square', vol: 0.035 }),
  pick: () => tone(820, 1100, 0.05, { type: 'triangle', vol: 0.05 }),
  turn: () => notes([660, 880], { step: 0.07, dur: 0.1, vol: 0.05 }),
};

// ---------------------------------------------------------------- pantallas
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  G.gameplay(!id && !!S.mode);
}
function setPlaying(on) {
  document.body.classList.toggle('playing', on);
  $('hud').hidden = !on;
  $('controls').hidden = !on;
}
const reduced = () => document.documentElement.classList.contains('reduced') || matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- carteles
let bannerT = 0;
function banner(big, small = '', cls = '', long = false) {
  const el = $('banner');
  $('banner-t').textContent = big;
  $('banner-s').textContent = small;
  $('banner-s').hidden = !small;
  el.className = `banner ${cls} ${long ? 'long' : ''}`;
  void el.offsetWidth;
  el.classList.add('on');
  clearTimeout(bannerT);
  bannerT = setTimeout(() => el.classList.remove('on'), long ? 2700 : 1800);
}
function confetti() {
  if (reduced()) return;
  const box = $('confetti');
  const cols = ['#ffd23c', '#ff7a59', '#4fd1a5', '#6fb7ff', '#fff', '#ff9ec7'];
  let html = '';
  for (let i = 0; i < 46; i++) {
    const x = (Math.random() - 0.5) * 520, y = 160 + Math.random() * 360, r = (Math.random() - 0.5) * 900;
    html += `<i style="--x:${x.toFixed(0)}px;--y:${y.toFixed(0)}px;--r:${r.toFixed(0)}deg;--c:${cols[i % cols.length]};--d:${(Math.random() * 0.25).toFixed(2)}s;left:${40 + Math.random() * 20}%"></i>`;
  }
  box.innerHTML = html;
  setTimeout(() => (box.innerHTML = ''), 2400);
}

// ---------------------------------------------------------------- marcador
/** S.board: { names, colors, marks: [[true|false|null]], score, shooter, n, kicks, sudden } */
function renderSb() {
  const b = S.board;
  const el = $('sb');
  if (!b) {
    el.innerHTML = '';
    return;
  }
  const row = (i) => {
    const marks = b.marks[i];
    const next = marks.indexOf(null);
    const dots = marks.map((m, k) => `<i class="${m === true ? 'g' : m === false ? 'x' : k === next && b.shooter === i && !b.done ? 'n' : ''}"></i>`).join('');
    return `<div class="row ${b.shooter === i && !b.done ? 'act' : ''}"><span class="nm" style="color:${i === S.me ? '#fff' : '#dfe8f7'}">${esc(i === S.me ? t('you') : b.names[i])}</span><span class="dots">${dots}</span><b>${b.score[i]}</b></div>`;
  };
  const head = b.done ? t('sbFinal') : b.sudden ? t('sbSudden') : t('sbKick', { n: Math.min(b.n, b.kicks), k: b.kicks });
  const order = [S.me, 1 - S.me];
  el.innerHTML = `<div class="hd">${esc(head)}</div>${order.map(row).join('')}`;
}
/** Arma el marcador a partir de los penales ya pateados: [{ seat, result }]. */
function boardFrom(log, kicks, first, names) {
  const marks = [[], []];
  const score = [0, 0];
  for (const k of log) {
    const g = k.result === 'goal';
    marks[k.seat].push(g);
    if (g) score[k.seat]++;
  }
  for (const s of [0, 1]) while (marks[s].length < kicks) marks[s].push(null);
  const taken = [log.filter((k) => k.seat === 0).length, log.filter((k) => k.seat === 1).length];
  const sudden = taken[0] >= kicks && taken[1] >= kicks;
  const shooter = (first + log.length) % 2;
  // la fila actual cuenta el penal que viene (en muerte súbita aparece un punto más)
  if (sudden) for (const s of [0, 1]) if (marks[s].length <= taken[s]) marks[s].push(null);
  return { names, colors: S.colors, marks, score, shooter, n: Math.max(taken[shooter] + 1, 1), kicks, sudden, done: false };
}

// ---------------------------------------------------------------- mira, zonas y fuerza
const overlay = { reticle: $('reticle'), err: $('reticle-err'), zones: $('zones'), power: $('power'), fill: $('power-fill') };
const ARROWS = { '-1,1': '↖', '0,1': '↑', '1,1': '↗', '-1,0': '↙', '0,0': '↓', '1,0': '↘' };
for (const b of $$('#zones button')) b.dataset.g = ARROWS[`${b.dataset.c},${b.dataset.r}`];

/** Puntería: de un toque (o mouse) en la pantalla al punto del arco. */
function setAimFromPointer(e) {
  if (!pitch || S.role !== 'shoot' || !S.ready) return;
  const r = $('cv').getBoundingClientRect();
  const p = pitch.aimAt(e.clientX - r.left, e.clientY - r.top);
  if (!p) return;
  S.aim = { x: clamp(p.x, -AIM.x, AIM.x), y: clamp(p.y, AIM.yMin, AIM.yMax) };
  S.aimed = true;
}
const cv = $('cv');
cv.addEventListener('pointerdown', (e) => {
  unlock();
  if (S.anim) {
    // tocar durante la jugada la acelera
    pitch.timeScale = 2.6;
    return;
  }
  setAimFromPointer(e);
});
cv.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' || e.buttons) setAimFromPointer(e);
});

function updateOverlay() {
  const shooting = S.role === 'shoot' && S.ready && !S.anim;
  overlay.reticle.hidden = !shooting;
  if (shooting) {
    const c = pitch.project(S.aim.x, S.aim.y);
    overlay.reticle.style.transform = `translate(${c.x}px, ${c.y}px)`;
    // el círculo de error: cuánto se abre la puntería con la fuerza (con la fuerza que se está cargando, o una media)
    const p = S.charging ? S.power : 0.55;
    const s = sigma(p) * 1.7;
    const a = pitch.project(S.aim.x + s, S.aim.y), b = pitch.project(S.aim.x, S.aim.y + s * 0.85);
    overlay.err.style.width = `${Math.max(26, Math.abs(a.x - c.x) * 2)}px`;
    overlay.err.style.height = `${Math.max(26, Math.abs(b.y - c.y) * 2)}px`;
    overlay.reticle.classList.toggle('hot', Math.abs(S.aim.x) + s > 1.02 || S.aim.y + s * 0.85 > 1.04);
  }
  const keeping = S.role === 'keep' && S.ready && !S.anim;
  overlay.zones.hidden = !keeping;
  if (keeping) {
    const g = pitch.goalRect();
    const z = overlay.zones.style;
    z.left = `${g.left}px`;
    z.top = `${g.top}px`;
    z.width = `${g.width}px`;
    z.height = `${g.height}px`;
  }
  // barra de fuerza
  overlay.power.hidden = !(shooting && S.charging);
  if (S.charging) overlay.fill.style.width = `${(S.power * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------- patear
function startCharge() {
  if (S.role !== 'shoot' || !S.ready || S.charging || S.anim || S.paused) return;
  unlock();
  S.charging = true;
  S.chargeAt = performance.now();
  S.power = 0;
  $('b-shoot').classList.add('hold');
  setTip('tipCharge');
}
function releaseCharge() {
  if (!S.charging) return;
  S.charging = false;
  $('b-shoot').classList.remove('hold');
  const p = clamp(S.power, 0.06, 1);
  const shot = { x: S.aim.x, y: S.aim.y, p };
  S.ready = false;
  $('b-shoot').hidden = true;
  setTip('');
  S.resolve?.({ shot });
}
$('b-shoot').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  $('b-shoot').setPointerCapture?.(e.pointerId);
  startCharge();
});
$('b-shoot').addEventListener('pointerup', releaseCharge);
$('b-shoot').addEventListener('pointercancel', releaseCharge);

function powerTick(now) {
  if (!S.charging) return;
  const ph = ((now - S.chargeAt) / 1000) / 0.95;
  const m = ph % 2;
  S.power = m < 1 ? m : 2 - m;
}

// ---------------------------------------------------------------- atajar
function selectZone(c, r, confirm = false) {
  if (S.role !== 'keep' || !S.ready || S.anim) return;
  unlock();
  const same = S.sel && S.sel.c === c && S.sel.r === r;
  S.sel = { c, r };
  for (const b of $$('#zones button')) b.classList.toggle('sel', +b.dataset.c === c && +b.dataset.r === r);
  $('b-dive').hidden = false;
  setTip('tipConfirm');
  sfx.pick();
  if (same || confirm) confirmDive();
}
function confirmDive() {
  if (!S.sel || S.role !== 'keep' || !S.ready) return;
  const dive = { ...S.sel };
  S.ready = false;
  $('b-dive').hidden = true;
  setTip(S.mode === 'online' ? 'tipWait' : '');
  for (const b of $$('#zones button')) b.classList.remove('sel');
  S.resolve?.({ dive });
}
for (const b of $$('#zones button')) b.addEventListener('click', () => selectZone(+b.dataset.c, +b.dataset.r));
$('b-dive').addEventListener('click', () => confirmDive());

function setTip(k) {
  $('tip').textContent = k ? t(k) : '';
  S.tipKey = k;
}

/** Prepara la pantalla para que el humano elija (patear o atajar) y devuelve lo que eligió. */
function ask(role) {
  S.role = role;
  S.ready = true;
  S.sel = null;
  S.charging = false;
  const kb = !matchMedia('(hover: none)').matches;
  $('b-shoot').hidden = role !== 'shoot';
  $('b-dive').hidden = true;
  setTip(role === 'shoot' ? (kb ? 'tipAimKey' : 'tipAim') : 'tipKeep');
  if (role === 'shoot' && !S.aimed) S.aim = { x: 0, y: 0.42 };
  sfx.turn();
  return new Promise((res) => (S.resolve = res));
}

// ---------------------------------------------------------------- una jugada
const SHIRTS = ['#ff7a59', '#4aa8ff'];
function dress(shooterSeat) {
  pitch.setColors(S.colors[shooterSeat] || SHIRTS[shooterSeat], S.colors[1 - shooterSeat] || SHIRTS[1 - shooterSeat]);
}

/** Anima un penal ya resuelto y avisa los momentos (sonidos y carteles). */
async function playKick(info, shooterSeat, ep) {
  S.anim = true;
  S.last = { ...info, shooterSeat };
  pitch.timeScale = 1;
  pitch.on((ev, data) => {
    if (stale(ep)) return;
    const who = shooterSeat === S.me ? t('you') : S.names[shooterSeat];
    if (ev === 'run') sfx.whistle();
    else if (ev === 'kick') sfx.kick();
    else if (ev === 'goal') {
      sfx.net();
      sfx.cheer();
      banner(t('rGoal'), who, '');
      confetti();
    } else if (ev === 'save') {
      sfx.save();
      banner(t('rSaved'), 1 - shooterSeat === S.me ? t('you') : S.names[1 - shooterSeat], 'save');
    } else if (ev === 'post') {
      sfx.post();
      banner(t('rPost'), '', 'miss');
    } else if (ev === 'miss') {
      sfx.groan();
      banner(data?.result === 'over' ? t('rOver') : t('rWide'), '', 'miss');
    }
  });
  dress(shooterSeat);
  await pitch.kick(info);
  S.anim = false;
  pitch.timeScale = 1;
}

// ---------------------------------------------------------------- contra la compu
function newCpuMatch() {
  S.epoch++;
  const ep = S.epoch;
  waiters.length = 0;
  S.mode = 'cpu';
  S.me = 0;
  S.names = [t('you'), t('cpu')];
  S.colors = COLORS.slice();
  const first = OPTS.first === 2 ? (Math.random() < 0.5 ? 0 : 1) : OPTS.first;
  S.so = new Shootout({ kicks: OPTS.kicks, first });
  S.hist = { humanShots: [], humanDives: [], cpuShots: [] };
  S.over = false;
  S.aimed = false;
  S.board = boardFrom([], OPTS.kicks, first, S.names);
  setPlaying(true);
  show(null);
  pitch.reset();
  renderSb();
  playCpuKick(ep);
}

async function playCpuKick(ep) {
  const so = S.so;
  if (stale(ep)) return;
  const shooter = so.shooter;
  dress(shooter);
  pitch.reset();
  S.board = boardFrom(so.log, so.kicks, so.first, S.names);
  renderSb();
  const meShoot = shooter === S.me;
  banner(meShoot ? t('youShoot') : t('youKeep'), so.sudden ? t('sbSudden') : '', 'role');
  await wait(900);
  if (stale(ep)) return;
  const pick = await ask(meShoot ? 'shoot' : 'keep');
  if (stale(ep)) return;
  let shot, dive;
  if (meShoot) {
    shot = pick.shot;
    dive = pickDive(OPTS.level, { shots: S.hist.humanShots }, Math.random);
    S.hist.humanShots.push(shot);
  } else {
    dive = pick.dive;
    shot = aimShot(OPTS.level, { dives: S.hist.humanDives, shots: S.hist.cpuShots }, Math.random);
    S.hist.humanDives.push(dive);
    S.hist.cpuShots.push(shot);
  }
  S.role = null;
  const j = judge(shot, makeNoise(Math.random), dive, (Math.random() - 0.5) * 0.24);
  await playKick({ shot, land: { x: j.x, y: j.y }, result: j.result, dive }, shooter, ep);
  if (stale(ep)) return;
  so.record(j.result === 'goal', j.result);
  S.board = boardFrom(so.log, so.kicks, so.first, S.names);
  S.board.done = so.over;
  renderSb();
  await wait(1200);
  if (stale(ep)) return;
  if (so.over) return showOver();
  playCpuKick(ep);
}

// ---------------------------------------------------------------- fin
function summary(log, seat) {
  const mine = log.filter((k) => k.seat === seat);
  const names = { goal: 'shGoal', saved: 'shSaved', post: 'shPost', wide: 'shWide', over: 'shOver' };
  const cls = { goal: 'g', saved: 's', post: 'm', wide: 'm', over: 'm' };
  return mine.map((k) => `<i class="${cls[k.result]}">${esc(t(names[k.result]))}</i>`).join('');
}
function showOver() {
  S.over = true;
  S.role = null;
  S.ready = false;
  $('b-shoot').hidden = true;
  $('b-dive').hidden = true;
  setTip('');
  overlay.reticle.hidden = true;
  overlay.zones.hidden = true;
  let log, score, winner;
  if (S.mode === 'online') {
    const v = S.ol.v;
    log = v.log;
    score = v.score;
    winner = v.winner;
  } else {
    log = S.so.log;
    score = S.so.score;
    winner = S.so.winner;
  }
  const won = winner === S.me;
  $('over-kicker').textContent = t('overKicker');
  $('over-title').textContent = won ? t('youWin') : t('winner', { name: S.names[winner] });
  if (!won && S.mode !== 'online') $('over-title').textContent = t('youLose');
  if (!won && S.mode === 'online') $('over-title').textContent = t('winner', { name: S.names[winner] });
  const order = [S.me, 1 - S.me];
  $('over-final').innerHTML = order.map((s) => `<div class="${s === winner ? 'win' : ''}"><span class="h">${esc(s === S.me ? t('you') : S.names[s])}</span><span class="n">${score[s]}</span></div>`).join('');
  $('over-shots').innerHTML = order.map((s) => `<div class="row"><b>${esc(s === S.me ? t('you') : S.names[s])}</b><span>${summary(log, s)}</span></div>`).join('');
  $('over-status').textContent = S.ol?.abandon ? t('abandon') : '';
  const again = $('b-again');
  again.disabled = false;
  $('b-again-t').textContent = S.mode === 'online' ? t('rematch') : t('rematch');
  (won ? sfx.win : sfx.lose)();
  if (won) confetti();
  show('over');
}
$('b-again').onclick = () => {
  if (S.mode === 'online') {
    online?.send({ t: 'again' });
    $('b-again').disabled = true;
    $('b-again-t').textContent = t('waitAgain');
    return;
  }
  newCpuMatch();
};
$('b-over-menu').onclick = () => toMenu();

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
      if (m.t === 'error') {
        const txt = m.code === 'need_players' ? t('needPlayers') : netText(m.code);
        $('on-status').textContent = txt;
        $('lobby-status').textContent = txt;
      } else if (m.t === 'closed' || m.t === 'kicked') {
        $('on-status').textContent = netText(m.t === 'kicked' ? 'kicked' : `closed_${m.reason}`);
        leaveOnlineGame();
        online = null;
        show('online');
      }
    },
  });
  return online;
}
function leaveOnlineGame() {
  S.epoch++;
  waiters.length = 0;
  S.mode = null;
  S.ol = null;
  S.role = null;
  S.ready = false;
  S.anim = false;
  setPlaying(false);
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
  leaveOnlineGame();
  show('online');
};
$('lobby-code').onclick = async () => {
  if (!online?.room) return;
  const r = await shareRoom(ID, online.room.code);
  $('lobby-status').textContent = r === 'copied' ? t('copied') : '';
};

function applyRoom(room) {
  if (room.state === 'lobby' || !room.penales) {
    if (S.mode === 'online') leaveOnlineGame();
    $('lobby-code').textContent = room.code;
    const people = room.players.filter((p) => p.connected);
    $('lobby-players').innerHTML = room.players
      .map((p) => `<li><i style="background:${esc(p.color)}"></i><span>${esc(p.name)}</span><small>${[p.id === online.myId ? t('youLower') : '', p.id === room.host ? t('host') : ''].filter(Boolean).join(' · ')}</small></li>`)
      .join('');
    $('lobby-start').hidden = !online.isHost;
    const need = people.length < 2;
    $('lobby-status').textContent = online.isHost ? (need ? t('needPlayers') : '') : t('waitingHost');
    $('lobby-status').style.color = online.isHost ? '' : 'var(--ink2)';
    show('lobby');
    return;
  }
  olSync(room.penales);
}

function startOnlineGame(v, me) {
  S.epoch++;
  waiters.length = 0;
  S.mode = 'online';
  S.me = me;
  S.names = v.seats.map((s) => s.name);
  S.colors = v.seats.map((s, i) => s.color || COLORS[i]);
  S.over = false;
  S.aimed = false;
  S.role = null;
  S.ready = false;
  S.anim = false;
  // si entramos con la tanda empezada, no se anima lo que ya pasó
  const first = v.first;
  S.ol = { game: v.game, v, shown: v.log.length, choosing: -1, pumping: false, first, overShown: false, abandon: false, sentAt: 0 };
  S.board = boardFrom(v.log, v.kicks, first, S.names);
  setPlaying(true);
  show(null);
  pitch.reset();
  renderSb();
}

function olSync(v) {
  const me = v.seats.findIndex((s) => s.id === online.myId);
  if (me < 0) return;
  if (S.mode !== 'online' || !S.ol || S.ol.game !== v.game) startOnlineGame(v, me);
  S.ol.v = v;
  S.ol.deadline = performance.now() + (v.left || 0);
  // se pasó el tiempo (o el rival ya mandó y el servidor resolvió por mí): lo que estaba por elegir ya no vale
  if (S.ready && v.log.length > S.ol.shown) {
    S.ready = false;
    S.charging = false;
    $('b-shoot').classList.remove('hold');
    $('b-shoot').hidden = true;
    $('b-dive').hidden = true;
    setTip('');
    S.resolve?.({ cancelled: true });
  }
  S.ol.abandon = !!online.room.players && online.room.players.filter((p) => p.connected).length < 2 && v.phase === 'over';
  // al reconectar o si la tanda se terminó mientras estábamos mirando, no hace falta animar lo viejo
  olPump();
}

async function olPump() {
  const ol = S.ol;
  if (!ol || ol.pumping) return;
  ol.pumping = true;
  const ep = S.epoch;
  try {
    for (;;) {
      if (stale(ep) || !S.ol) return;
      const v = S.ol.v;
      // un penal nuevo para mostrar
      if (v.log.length > S.ol.shown) {
        const k = v.last;
        const idx = S.ol.shown;
        S.ol.shown = v.log.length;
        S.role = null;
        S.ready = false;
        $('b-shoot').hidden = true;
        $('b-dive').hidden = true;
        setTip('');
        if (k && v.log.length - idx === 1) {
          await playKick({ shot: k.shot, land: k.land, result: k.result, dive: k.dive }, k.seat, ep);
          if (stale(ep)) return;
        }
        S.board = boardFrom(v.log.slice(0, S.ol.shown), v.kicks, S.ol.first, S.names);
        S.board.done = v.phase === 'over' && S.ol.shown >= v.log.length;
        renderSb();
        await wait(900);
        if (stale(ep)) return;
        pitch.reset();
        continue;
      }
      if (v.phase === 'over') {
        if (!S.ol.overShown) {
          S.ol.overShown = true;
          showOver();
        }
        return;
      }
      if (v.phase === 'choose' && S.ol.choosing !== v.n) {
        S.ol.choosing = v.n;
        S.board = boardFrom(v.log, v.kicks, S.ol.first, S.names);
        renderSb();
        dress(v.shooter);
        pitch.reset();
        const meShoot = v.shooter === S.me;
        banner(meShoot ? t('youShoot') : t('youKeep'), v.sudden ? t('sbSudden') : '', 'role');
        const nGame = v.game;
        // si ya mandé lo mío (por ejemplo, recargué la página), solo queda esperar
        if (meShoot ? v.ready.shot : v.ready.dive) {
          setTip('tipWait');
          return;
        }
        const pick = await ask(meShoot ? 'shoot' : 'keep');
        if (stale(ep) || !S.ol || S.ol.game !== nGame) return;
        if (pick.cancelled) continue;
        online?.send(pick.shot ? { t: 'aim', x: pick.shot.x, y: pick.shot.y, p: pick.shot.p } : { t: 'dive', c: pick.dive.c, r: pick.dive.r });
        S.role = meShoot ? 'shoot' : 'keep';
        S.ready = false;
        setTip('tipWait');
        // la respuesta llega por la sala: se sigue desde acá
        if (S.ol.v.log.length > S.ol.shown) continue;
      }
      return;
    }
  } finally {
    if (S.ol === ol) ol.pumping = false;
  }
}

// ---------------------------------------------------------------- menú
function toMenu() {
  S.epoch++;
  waiters.length = 0;
  if (online) {
    online.leave();
    online = null;
  }
  S.mode = null;
  S.ol = null;
  S.so = null;
  S.role = null;
  S.ready = false;
  S.anim = false;
  S.paused = false;
  S.board = null;
  setPlaying(false);
  pitch?.reset();
  show('home');
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
const lvHelp = () => ($('o-level-help').textContent = t(`lvHelp${OPTS.level}`));
bindSeg('o-level', 'level', lvHelp);
bindSeg('o-kicks', 'kicks');
bindSeg('o-first', 'first');
function syncOpts() {
  syncSeg('o-level', OPTS.level);
  syncSeg('o-kicks', OPTS.kicks);
  syncSeg('o-first', OPTS.first);
  lvHelp();
}
$('b-cpu').onclick = () => {
  syncOpts();
  show('cpu');
};
$('b-cpu-back').onclick = () => show('home');
$('b-cpu-go').onclick = () => {
  unlock();
  newCpuMatch();
};
$('b-rules').onclick = () => {
  S.rulesBack = 'home';
  show('rules');
};
$('b-rules-ok').onclick = () => (S.rulesBack === 'pause' ? show('pause') : show('home'));
function renderRules() {
  $('rules-body').innerHTML = G.t(RULES);
}

function pause() {
  if (!S.mode || $$('.screen.on').length) return;
  if (S.mode !== 'online') S.paused = true;
  if (S.charging) {
    S.charging = false;
    $('b-shoot').classList.remove('hold');
  }
  show('pause');
}
function resume() {
  S.paused = false;
  show(null);
}
$('b-pause').onclick = () => pause();
$('b-resume').onclick = () => resume();
$('b-p-rules').onclick = () => {
  S.rulesBack = 'pause';
  show('rules');
};
$('b-quit').onclick = () => toMenu();
for (const b of $$('.btn, .link, .seg button')) b.addEventListener('click', () => sfx.ui());

// ---------------------------------------------------------------- teclado
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (document.querySelector('#s-pause.on')) {
    if (k === 'escape' || k === 'p') resume();
    return;
  }
  if ($$('.screen.on').length) return;
  if (k === 'escape' || k === 'p') return pause();
  if (S.role === 'shoot' && S.ready) {
    const st = 0.045;
    if (k === 'arrowleft') S.aim.x = clamp(S.aim.x - st, -AIM.x, AIM.x);
    else if (k === 'arrowright') S.aim.x = clamp(S.aim.x + st, -AIM.x, AIM.x);
    else if (k === 'arrowup') S.aim.y = clamp(S.aim.y + st * 0.8, AIM.yMin, AIM.yMax);
    else if (k === 'arrowdown') S.aim.y = clamp(S.aim.y - st * 0.8, AIM.yMin, AIM.yMax);
    else if (k === ' ' && !e.repeat) {
      e.preventDefault();
      startCharge();
    }
    S.aimed = true;
  } else if (S.role === 'keep' && S.ready) {
    const cur = S.sel || { c: 0, r: 0 };
    if (k === 'arrowleft') selectZone(clamp(cur.c - 1, -1, 1), cur.r);
    else if (k === 'arrowright') selectZone(clamp(cur.c + 1, -1, 1), cur.r);
    else if (k === 'arrowup') selectZone(cur.c, 1);
    else if (k === 'arrowdown') selectZone(cur.c, 0);
    else if (k === ' ' || k === 'enter') {
      e.preventDefault();
      if (S.sel) confirmDive();
      else selectZone(0, 0);
    }
  }
});
addEventListener('keyup', (e) => {
  if (e.key === ' ') releaseCharge();
});

// ---------------------------------------------------------------- bucle, tamaño y arranque
let lastT = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - (lastT || now)) / 1000);
  lastT = now;
  if (pitch) {
    if (!S.paused && !document.hidden) {
      pitch.update(dt);
      tickWaiters(dt);
      powerTick(now);
    }
    pitch.r.render(pitch.scene, pitch.cam);
    updateOverlay();
    // reloj de la decisión online
    const showClock = S.mode === 'online' && S.ol?.v?.phase === 'choose' && S.ready && S.ol.deadline;
    $('clock').hidden = !showClock;
    if (showClock) {
      const left = Math.max(0, S.ol.deadline - performance.now());
      $('clock-t').textContent = `⏱ ${Math.ceil(left / 1000)}`;
      $('clock').classList.toggle('low', left < 6000);
    }
  }
  requestAnimationFrame(loop);
}
new ResizeObserver(() => pitch?.resize()).observe($('game'));
addEventListener('blur', () => S.mode === 'cpu' && pause());
document.addEventListener('visibilitychange', () => document.hidden && S.mode === 'cpu' && pause());
G.onPause?.(() => (S.paused = true));
G.onResume?.(() => {
  if (!$$('.screen.on').length) S.paused = false;
});
G.onPrefs((p) => {
  document.documentElement.lang = p.lang;
  document.documentElement.classList.toggle('reduced', !!p.reducedMotion);
  $$('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t)));
  renderRules();
  lvHelp();
  renderSb();
  if (online?.room && document.querySelector('#s-lobby.on')) applyRoom(online.room);
}, true);

try {
  pitch = new Pitch($('cv'));
  pitch.resize();
} catch (err) {
  console.error('WebGL', err);
  const msg = document.createElement('div');
  msg.style.cssText = 'position:fixed;inset:56px 0 0;display:grid;place-items:center;padding:24px;text-align:center;background:#0b1a30;color:#fff;font:700 18px Nunito,sans-serif';
  msg.textContent = 'Este juego necesita WebGL. Probá con otro navegador o activá la aceleración por hardware.';
  document.body.append(msg);
}
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
  window.__penales = {
    S,
    OPTS,
    get pitch() {
      return pitch;
    },
    get online() {
      return online;
    },
    newCpuMatch,
    toMenu,
    selectZone,
    confirmDive,
    startCharge,
    releaseCharge,
    wait,
  };
G.ready();
