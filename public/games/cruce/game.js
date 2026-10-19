/* Cruce — game.it
 * Saltá de a una casilla cruzando calles, vías y ríos sin que te pisen, te arrastre el agua ni te agarre el águila.
 * Modos: infinito (récord, monedas y personajes que se desbloquean, guardados en este dispositivo), Camino del día
 * (el mismo mundo para todos ese día) y Carrera online hasta 8 (mismo mundo y mismo tráfico para todos: se ven como
 * fantasmas; gana quien llega primero a la meta). Mundo y reglas en shared/world.js; dibujo en view.js.
 */
import { View } from './view.js';
import { World, Hopper, L, HALF, HOP, seedOf, level, RACE_ROWS, CHECK_EVERY } from './shared/world.js';
import { CHARACTERS } from './models.js';
import { tone, noise, notes } from '/shared/sfx.js';
import { RaceLobby } from '/shared/race-lobby.js';
import { today, dayNumber } from '/shared/daily.js';

const G = window.GameIt;
const ID = 'cruce';
const DAILY_EPOCH = '2026-10-19';
const $ = (id) => document.getElementById(id);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const TXT = {
  tagline: { es: 'Cruzá calles, vías y ríos sin que te agarren', en: 'Cross roads, rails and rivers without getting caught' },
  play: { es: 'Jugar', en: 'Play' },
  unlock: { es: 'Desbloquear · {n}', en: 'Unlock · {n}' },
  needCoins: { es: 'Te faltan {n} monedas', en: '{n} more coins needed' },
  owned: { es: 'récord {n}', en: 'best {n}' },
  locked: { es: '🔒 {n} monedas', en: '🔒 {n} coins' },
  daily: { es: 'Camino del día', en: 'Daily path' },
  dailySub: { es: 'n.º {n}', en: '#{n}' },
  dailySubBest: { es: 'n.º {n} · mejor {b}', en: '#{n} · best {b}' },
  online: { es: 'Carrera', en: 'Race' },
  onlineSub: { es: 'online, hasta 8', en: 'online, up to 8' },
  onlineLong: { es: 'El mismo camino y el mismo tráfico para todos: gana quien llegue primero a la meta', en: 'Same path and same traffic for everyone: first to the finish wins' },
  keysDesk: { es: 'Flechas o WASD para saltar', en: 'Arrows or WASD to hop' },
  keysTouch: { es: 'Tocá para avanzar · deslizá para los costados', en: 'Tap to hop forward · swipe to turn' },
  swipeHint: { es: 'Tocá para saltar', en: 'Tap to hop' },
  best: { es: 'récord {n}', en: 'best {n}' },
  car: { es: '¡Pum!', en: 'Splat!' },
  train: { es: '¡El tren!', en: 'Train!' },
  water: { es: '¡Splash!', en: 'Splash!' },
  swept: { es: '¡Te llevó el río!', en: 'Swept away!' },
  eagle: { es: '¡El águila!', en: 'The eagle!' },
  newBest: { es: '¡Nuevo récord!', en: 'New best!' },
  bestIs: { es: 'Récord: {n}', en: 'Best: {n}' },
  again: { es: 'Otra vez', en: 'Again' },
  revive: { es: '▶ Seguir · ver anuncio', en: '▶ Keep going · watch an ad' },
  menu: { es: 'Menú', en: 'Menu' },
  back: { es: '← volver', en: '← back' },
  sCoins: { es: 'monedas', en: 'coins' },
  sTotal: { es: 'en total', en: 'total' },
  sRows: { es: 'saltos', en: 'hops' },
  dailyLine: { es: 'Camino del día n.º {n} · tu mejor hoy: {b}', en: 'Daily path #{n} · your best today: {b}' },
  yourName: { es: 'Tu nombre', en: 'Your name' },
  quick: { es: 'Partida rápida', en: 'Quick match' },
  quickSub: { es: 'entrá a una sala abierta', en: 'join an open room' },
  create: { es: 'Crear sala privada', en: 'Create private room' },
  createSub: { es: 'con código para tus amigos', en: 'with a code for your friends' },
  join: { es: 'Unirse', en: 'Join' },
  room: { es: 'Sala', en: 'Room' },
  tapToCopy: { es: 'tocá el código para copiar el link', en: 'tap the code to copy the link' },
  length: { es: 'Largo del camino', en: 'Path length' },
  lenShort: { es: 'Corto', en: 'Short' },
  lenMedium: { es: 'Medio', en: 'Medium' },
  lenLong: { es: 'Largo', en: 'Long' },
  start: { es: '¡Largar!', en: 'Start!' },
  leave: { es: '← salir de la sala', en: '← leave room' },
  you: { es: 'vos', en: 'you' },
  win: { es: '¡Ganaste!', en: 'You won!' },
  place: { es: 'Llegaste {n}°', en: 'You finished #{n}' },
  raceOver: { es: 'Fin de la carrera', en: 'Race over' },
  waitOthers: { es: 'Esperando a los demás…', en: 'Waiting for the others…' },
  dnf: { es: 'fila {r}', en: 'row {r}' },
  finishedPop: { es: '{n} llegó {p}°', en: '{n} finished #{p}' },
  check: { es: '¡Control!', en: 'Checkpoint!' },
  go: { es: '¡YA!', en: 'GO!' },
  coin: { es: '+1', en: '+1' },
};
const t = (k, v) => {
  let s = G.t(TXT[k]) ?? k;
  if (v) for (const x in v) s = s.replace(`{${x}}`, v[x]);
  return s;
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
const fmt = (ms) => {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
};

// ---------------------------------------------------------------- estado
const view = new View($('stage'));
const owned = new Set(load('owned', ['pollito']));
owned.add('pollito');
const S = {
  mode: 'menu', // menu | solo | daily | race
  phase: 'menu', // menu | countdown | play | dying | dead | respawn | done
  world: null,
  hop: null,
  t: 0,
  camRow: 0,
  camX: 0,
  started: false,
  best: load('best', 0) | 0,
  coins: load('coins', 0) | 0,
  runCoins: 0,
  char: Math.max(0, CHARACTERS.findIndex((c) => c.id === load('char', 'pollito'))),
  pick: 0,
  deaths: 0,
  revived: false,
  startAt: 0,
  finishMs: 0,
  dieT: 0,
  cause: null,
  eagle: null,
  ahead: -1.9,
};
S.pick = S.char;

function newWorld(seed, opts) {
  S.world = new World(seed, opts);
  S.hop = new Hopper(S.world, { row: 0, col: 0 });
  S.t = 0;
  S.camRow = 0;
  S.camX = 0;
  S.started = false;
  S.runCoins = 0;
  S.revived = false;
  S.eagle = null;
  view.clearRows();
  view.eagle.visible = false;
  view.player.root.visible = true;
  view.player.root.rotation.set(0, 0, 0);
  view.player.body.rotation.set(0, 0, 0);
  view.player.face = 0;
  view.setChar(view.player, S.pick);
  setScore(0, false);
}

// ---------------------------------------------------------------- modos
function playSolo() {
  const c = CHARACTERS[S.pick];
  if (!owned.has(c.id)) {
    if (S.coins < c.price) return;
    S.coins -= c.price;
    owned.add(c.id);
    save('coins', S.coins);
    save('owned', [...owned]);
    sfx('unlock');
  }
  S.char = S.pick;
  save('char', c.id);
  S.mode = 'solo';
  newWorld(Math.floor(Math.random() * 2 ** 31));
  begin();
}

function dailyInfo() {
  const date = today();
  const d = load('daily', null);
  return { date, n: dayNumber(DAILY_EPOCH, date), rec: d && d.date === date ? d : { date, best: 0, tries: 0 } };
}
function playDaily() {
  S.mode = 'daily';
  S.pick = S.char;
  newWorld(seedOf(`${ID}:daily:${dailyInfo().date}`));
  begin();
}

function begin() {
  S.phase = 'play';
  show(null);
  $('hud').hidden = false;
  $('hud-race').hidden = S.mode !== 'race';
  $('race').hidden = S.mode !== 'race';
  $('best').textContent = S.mode === 'race' ? '' : t('best', { n: S.mode === 'daily' ? dailyInfo().rec.best : S.best });
  $('coin-n').textContent = S.coins;
  $('coins').hidden = S.mode === 'race';
  if (G.prefs.touch && S.best < 8 && S.mode !== 'race') {
    $('swipe-hint').hidden = false;
    setTimeout(() => ($('swipe-hint').hidden = true), 3000);
  }
}

function toMenu() {
  if (S.mode === 'race') lobby.leave();
  S.mode = 'menu';
  S.phase = 'menu';
  view.dropGhosts();
  $('labels').innerHTML = '';
  $('race').hidden = true;
  $('hud').hidden = true;
  S.pick = S.char;
  newWorld(Math.floor(Math.random() * 2 ** 31));
  refreshHome();
  show('home');
}

// ---------------------------------------------------------------- eventos del saltador
function handle(ev) {
  const h = S.hop;
  for (const e of ev) {
    if (e.t === 'hop') {
      sfx('hop');
      if (!S.started) {
        S.started = true;
        $('swipe-hint').hidden = true;
      }
    } else if (e.t === 'land') {
      view.player.squash = 1;
      const row = S.world.row(e.row);
      if (row.type !== L.RIVER) view.dust(h.x, row.type === L.GRASS ? 0.12 : 0.02, -e.row);
      else sfx('log');
      if (row.mark === 'check' && S.mode === 'race' && e.row > (S.lastCheck || 0)) {
        S.lastCheck = e.row;
        toast(t('check'));
        sfx('check');
      }
      const score = h.best;
      if (score !== S.shown) {
        setScore(score);
        if (S.mode === 'solo' && score === S.best + 1 && S.best > 5) {
          toast(t('newBest'));
          sfx('best');
        }
      }
    } else if (e.t === 'bump') {
      view.player.squash = 0.6;
      sfx('bump');
    } else if (e.t === 'coin') {
      S.runCoins++;
      if (S.mode !== 'race') {
        S.coins++;
        save('coins', S.coins);
        $('coin-n').textContent = S.coins;
        const el = $('coins');
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
      }
      sfx('coin');
    } else if (e.t === 'die') onDie(e.cause);
    else if (e.t === 'finish') onFinish();
  }
}

function onDie(cause) {
  S.cause = cause;
  S.dieT = 0;
  S.phase = 'dying';
  const h = S.hop;
  const p = view.player;
  const color = CHARACTERS[p.char].color;
  if (cause === 'car') {
    view.shake(0.25);
    view.burst(h.x, 0.3, -h.curRow, color);
    sfx('crash');
  } else if (cause === 'train') {
    view.shake(0.4);
    view.burst(h.x, 0.4, -h.curRow, color);
    sfx('crash');
    sfx('train');
  } else if (cause === 'water' || cause === 'swept') {
    view.splash(h.x, -h.row);
    sfx('splash');
  } else if (cause === 'eagle') sfx('eagle');
  if (S.mode === 'race') {
    S.deaths++;
    S.phase = 'respawn';
    setTimeout(() => {
      if (S.phase !== 'respawn') return;
      const row = Math.floor(h.best / CHECK_EVERY) * CHECK_EVERY;
      h.reset(row, 0);
      h.minRow = row;
      resetPlayerLook();
      S.camRow = row;
      S.phase = 'play';
    }, 1300);
    return;
  }
  setTimeout(() => showDead(), cause === 'eagle' ? 1500 : 950);
}

function resetPlayerLook() {
  const p = view.player;
  p.root.visible = true;
  p.root.rotation.set(0, 0, 0);
  p.body.rotation.set(0, 0, 0);
  p.body.scale.set(1, 1, 1);
  p.face = 0;
}

function onFinish() {
  S.phase = 'done';
  sfx('win');
  view.burst(S.hop.x, 0.6, -S.hop.row, '#ffcc33');
  if (S.mode === 'race') {
    S.finishMs = lobby.net.serverNow() - S.startAt;
    lobby.net.send({ t: 'finish', time: Math.round(S.finishMs), deaths: S.deaths });
    setTimeout(showResults, 900);
  }
}

// ---------------------------------------------------------------- bucle
let last = performance.now();
let lastCount = 0;
let warnSeen = new Set();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  if (G.paused) dt = 0;
  const h = S.hop;
  if (!h) return;
  // tiempo del mundo: en la carrera es el del servidor (el mismo tráfico para todos)
  if (S.mode === 'race' && S.startAt) S.t = Math.max(0, (lobby.net.serverNow() - S.startAt) / 1000);
  else S.t += dt;

  if (S.phase === 'countdown') {
    const left = (S.startAt - lobby.net.serverNow()) / 1000;
    const n = Math.ceil(left);
    if (n !== lastCount && n > 0 && n <= 3) {
      countPop(String(n));
      sfx('tick');
    }
    lastCount = n;
    if (left <= 0) {
      countPop(t('go'));
      sfx('go');
      S.phase = 'play';
      G.gameplay(true);
    }
  }
  if (dt > 0 && (S.phase === 'play' || S.phase === 'menu')) {
    if (S.phase === 'menu') menuIdle(dt);
    handle(h.step(dt, S.t));
  } else if (S.phase === 'dying' || S.phase === 'respawn') dying(dt);

  // cámara: sigue al saltador hacia adelante; en solo, además avanza sola (si te quedás, te agarra el águila)
  const zRow = h.hop ? h.hop.from + (h.hop.to - h.hop.from) * h.hop.k : h.row;
  if (S.phase === 'play' || S.phase === 'menu' || S.phase === 'countdown') {
    if (S.mode === 'race') S.camRow += (zRow - S.camRow) * Math.min(1, dt * 4);
    else {
      if (zRow > S.camRow) S.camRow += (zRow - S.camRow) * Math.min(1, dt * 3.5);
      if (S.started && S.phase === 'play') S.camRow += dt * (0.3 + 0.55 * level(h.best));
      h.minRow = Math.max(0, Math.floor(S.camRow) - 3);
      if (S.phase === 'play' && zRow < S.camRow - 3.4) eagleStart();
    }
  }
  S.camX += (clamp(h.x * 0.55, -1.8, 1.8) - S.camX) * Math.min(1, dt * 3);
  // en el menú la cámara se acerca y deja al personaje arriba de la tarjeta
  const menu = S.phase === 'menu' && S.mode === 'menu';
  S.ahead += ((menu ? -1.9 : 2.6) - S.ahead) * Math.min(1, dt * 4);
  const z = menu ? 0.42 : 1;
  if (menu) h.face = 'cam';
  else if (h.face === 'cam') h.face = 'up';
  if (Math.abs(view.zoom - z) > 0.002) {
    view.zoom += (z - view.zoom) * Math.min(1, dt * 4);
    view.updateFrustum();
  }
  view.focus.set(S.camX, 0, -(S.camRow + S.ahead));
  const base = Math.floor(S.camRow);
  view.syncRows(S.world, base - 10, base + 26);
  const warns = view.updateRows(S.world, S.t, dt);
  trainBells(warns);
  if (S.phase === 'play' || S.phase === 'menu' || S.phase === 'countdown' || S.phase === 'done') view.pose(view.player, h, dt, S.world);
  if (S.eagle) eagleFrame(dt);
  if (S.mode === 'race') ghostsFrame(dt);
  view.frame(dt);
  if (S.mode === 'race') {
    if (S.phase !== 'done') $('timer').textContent = fmt(S.phase === 'countdown' ? 0 : lobby.net.serverNow() - S.startAt);
    $('bar').style.transform = `scaleX(${clamp(h.best / S.world.finish, 0, 1)})`;
    sendState(now);
    drawLabels();
  }
}

/** En el menú el personaje salta de vez en cuando en el lugar. */
let idleT = 0;
function menuIdle(dt) {
  idleT += dt;
  if (idleT > 2.4) {
    idleT = 0;
    view.player.squash = 0.8;
  }
}

/** Animación de las muertes (aplastado, al agua, revoleado por el tren). */
function dying(dt) {
  S.dieT += dt;
  const p = view.player;
  const k = S.dieT;
  if (S.cause === 'car') {
    p.body.scale.set(1.35, Math.max(0.12, 1 - k * 12), 1.35);
  } else if (S.cause === 'train') {
    p.root.position.y = Math.min(6, k * 9);
    p.root.position.x += 18 * dt * (S.world.row(S.hop.curRow).dir || 1);
    p.body.rotation.z += dt * 18;
  } else if (S.cause === 'water' || S.cause === 'swept') {
    p.body.position.y = -0.2 - k * 1.4;
    p.root.visible = k < 0.6;
  }
}

function eagleStart() {
  if (S.phase !== 'play') return;
  const h = S.hop;
  S.eagle = { k: 0, x: h.x, z: -h.row };
  h.alive = false;
  onDie('eagle');
  view.eagle.visible = true;
}
function eagleFrame(dt) {
  const e = S.eagle;
  e.k += dt;
  const m = view.eagle;
  // baja en picada desde arriba de la pantalla, lo agarra y se va
  const zStart = e.z - 14;
  if (e.k < 0.55) {
    const k = e.k / 0.55;
    m.position.set(e.x, 4 * (1 - k) + 0.9, zStart + (e.z - zStart) * k);
  } else {
    const k = e.k - 0.55;
    m.position.set(e.x, 0.9 + k * 3, e.z + k * 9);
    view.player.root.position.set(e.x, 0, m.position.z);
    view.player.body.position.y = m.position.y - 0.7;
    if (k > 1.4) {
      m.visible = false;
      view.player.root.visible = false;
      S.eagle = null;
    }
  }
  m.rotation.set(0, Math.PI, Math.sin(e.k * 20) * 0.08);
}

/** La campana de las vías suena cuando se prende una alarma cerca. */
function trainBells(warns) {
  const h = S.hop;
  const now = new Set(warns);
  for (const r of now) if (!warnSeen.has(r) && Math.abs(r - h.row) < 8 && S.phase !== 'menu') sfx('bell');
  warnSeen = now;
}

// ---------------------------------------------------------------- HUD
function setScore(n, bump = true) {
  S.shown = n;
  const el = $('score');
  el.textContent = String(n);
  if (!bump) return;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}
function toast(txt) {
  const el = $('toast');
  el.textContent = txt;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}
function countPop(txt) {
  const el = $('count');
  el.textContent = txt;
  el.classList.remove('go');
  void el.offsetWidth;
  el.classList.add('go');
}

// ---------------------------------------------------------------- pantallas
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  G.gameplay(!id && S.mode !== 'menu' && S.phase !== 'countdown');
  const first = id && $(`s-${id}`).querySelector('.btn:not([hidden]):not(:disabled), .field');
  if (first && !G.prefs.touch) setTimeout(() => first.focus({ preventScroll: true }), 60);
}

function refreshHome() {
  const c = CHARACTERS[S.pick];
  $('ch-name').textContent = G.t(c.name);
  const own = owned.has(c.id);
  const info = $('ch-info');
  info.textContent = own ? t('owned', { n: S.best }) : t('locked', { n: c.price });
  info.classList.toggle('lock', !own);
  const play = $('b-play');
  if (own) {
    $('b-play-txt').textContent = t('play');
    play.disabled = false;
  } else if (S.coins >= c.price) {
    $('b-play-txt').textContent = t('unlock', { n: c.price });
    play.disabled = false;
  } else {
    $('b-play-txt').textContent = t('needCoins', { n: c.price - S.coins });
    play.disabled = true;
  }
  const { n, rec } = dailyInfo();
  $('b-daily-sub').textContent = rec.best ? t('dailySubBest', { n, b: rec.best }) : t('dailySub', { n });
  $('keys').textContent = G.prefs.touch ? t('keysTouch') : t('keysDesk');
  $('coin-n').textContent = S.coins;
}

function pickChar(d) {
  S.pick = (S.pick + d + CHARACTERS.length) % CHARACTERS.length;
  view.setChar(view.player, S.pick);
  view.player.squash = 1;
  sfx('hop');
  refreshHome();
}

const stat = (v, label) => `<div><b>${esc(v)}</b><small>${esc(label)}</small></div>`;
function showDead() {
  S.phase = 'dead';
  const score = S.hop.best;
  let isBest = false;
  let daily = null;
  if (S.mode === 'solo') {
    isBest = score > S.best;
    if (isBest) {
      S.best = score;
      save('best', S.best);
    }
  } else if (S.mode === 'daily') {
    daily = dailyInfo();
    daily.rec.tries = (daily.rec.tries || 0) + 1;
    isBest = score > (daily.rec.best || 0);
    if (isBest) daily.rec.best = score;
    save('daily', daily.rec);
  }
  $('dead-title').textContent = t(S.cause);
  $('dead-score').textContent = score;
  $('dead-best').textContent = isBest && score > 0 ? t('newBest') : t('bestIs', { n: S.mode === 'daily' ? daily.rec.best : S.best });
  $('dead-stats').innerHTML = stat(S.runCoins, t('sCoins')) + stat(S.coins, t('sTotal')) + stat(CHARACTERS.filter((c) => owned.has(c.id)).length + '/' + CHARACTERS.length, '🐥');
  $('dead-daily').hidden = !daily;
  if (daily) $('dead-daily').textContent = t('dailyLine', { n: daily.n, b: daily.rec.best });
  $('b-revive').hidden = true;
  show('dead');
  if (!S.revived && S.mode === 'solo')
    G.rewardAvailable('continuar').then((ok) => {
      if (ok && S.phase === 'dead') {
        $('b-revive').textContent = t('revive');
        $('b-revive').hidden = false;
      }
    });
}

/** Revivir: vuelve al pasto más cercano hacia atrás, en una columna libre. */
function revive() {
  const h = S.hop;
  let r = h.row;
  while (r > 0 && S.world.row(r).type !== L.GRASS) r--;
  let col = clamp(Math.round(h.x), -HALF, HALF);
  for (let d = 0; d <= HALF * 2; d++) {
    const c = col + (d % 2 ? -1 : 1) * Math.ceil(d / 2);
    if (!S.world.blocked(r, c)) {
      col = c;
      break;
    }
  }
  h.reset(r, col);
  S.camRow = r;
  resetPlayerLook();
  view.eagle.visible = false;
  S.eagle = null;
  S.revived = true;
  S.phase = 'play';
  show(null);
}

$('ch-prev').onclick = () => pickChar(-1);
$('ch-next').onclick = () => pickChar(1);
$('b-play').onclick = () => playSolo();
$('b-daily').onclick = () => playDaily();
$('b-online').onclick = () => lobby.open();
$('b-retry').onclick = () => {
  G.commercialBreak('otra-vez').then(() => {
    if (S.mode === 'daily') return playDaily();
    S.pick = S.char;
    playSolo();
  });
};
$('b-revive').onclick = async () => {
  $('b-revive').hidden = true;
  if (await G.showReward()) revive();
};
$('b-dead-menu').onclick = () => toMenu();
$('res-leave').onclick = () => toMenu();
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go?.dataset.go === 'home') toMenu();
});

// ---------------------------------------------------------------- entrada
function press(dir) {
  if (S.phase !== 'play') return;
  S.hop.press(dir);
}
addEventListener('keydown', (e) => {
  const on = document.querySelector('.screen.on');
  if (on) {
    if (document.activeElement?.tagName === 'INPUT') return;
    if (on.id === 's-home' && !e.repeat) {
      const d = G.dir(e);
      if (d === 'left' || d === 'right') {
        pickChar(d === 'left' ? -1 : 1);
        e.preventDefault();
      } else if ((e.code === 'Space' || e.key === 'Enter' || d === 'up') && document.activeElement === document.body) {
        e.preventDefault();
        $('b-play').click();
      }
    } else if (on.id === 's-dead' && (e.code === 'Space' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      $('b-retry').click();
    }
    return;
  }
  const d = G.dir(e) || (e.code === 'Space' ? 'up' : null);
  if (!d) return;
  e.preventDefault();
  if (!e.repeat) press(d);
});

// tocar = adelante; deslizar = esa dirección (se dispara apenas se nota el gesto)
let touch = null;
addEventListener('pointerdown', (e) => {
  if (e.target.closest('.card, button, input')) return;
  touch = { id: e.pointerId, x: e.clientX, y: e.clientY, used: false };
});
addEventListener('pointermove', (e) => {
  if (!touch || touch.id !== e.pointerId || touch.used) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
  if (Math.hypot(dx, dy) > 28) {
    touch.used = true;
    press(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  }
});
addEventListener('pointerup', (e) => {
  if (!touch || touch.id !== e.pointerId) return;
  if (!touch.used) press('up');
  touch = null;
});
addEventListener('pointercancel', () => (touch = null));

// mando: cruceta o palanca (un salto por movimiento)
const padPrev = {};
function pads() {
  for (const p of navigator.getGamepads?.() || []) {
    if (!p) continue;
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    const now = {
      up: p.buttons[12]?.pressed || ay < -0.6 || p.buttons[0]?.pressed,
      down: p.buttons[13]?.pressed || ay > 0.6,
      left: p.buttons[14]?.pressed || ax < -0.6,
      right: p.buttons[15]?.pressed || ax > 0.6,
    };
    for (const d in now) {
      if (now[d] && !padPrev[p.index + d]) {
        if (document.querySelector('.screen.on')?.id === 's-dead' && d === 'up') $('b-retry').click();
        else press(d);
      }
      padPrev[p.index + d] = now[d];
    }
  }
  requestAnimationFrame(pads);
}
requestAnimationFrame(pads);

// ---------------------------------------------------------------- online
const others = new Map(); // id → { name, color, char, best, done, time, place }
let lastSent = 0;
const FACES = ['up', 'down', 'left', 'right'];

const lobby = new RaceLobby({
  game: ID,
  settings: ['length'],
  defaults: { length: 'medium' },
  show: (id) => {
    S.mode = 'race';
    S.phase = 'menu';
    show(id);
  },
  onRace: beginRace,
  onLobby: () => {
    view.dropGhosts();
    $('labels').innerHTML = '';
    $('race').hidden = true;
    $('hud').hidden = true;
  },
  onMessage: onNet,
  onRoom: (room) => room.state === 'finished' && document.querySelector('#s-results.on') && showResults(),
  onClosed: () => {
    toMenu();
    show('online');
  },
});

function beginRace(room) {
  S.mode = 'race';
  S.pick = S.char;
  const finish = RACE_ROWS[room.race.length] || RACE_ROWS.medium;
  newWorld(room.race.seed, { finish });
  S.startAt = room.race.startAt;
  S.deaths = 0;
  S.lastCheck = 0;
  S.finishMs = 0;
  S.results = null;
  S.phase = 'countdown';
  lastCount = 0;
  view.dropGhosts();
  others.clear();
  $('labels').innerHTML = '';
  const marks = $('marks');
  marks.innerHTML = '';
  for (let r = CHECK_EVERY; r < finish; r += CHECK_EVERY) {
    const s = document.createElement('s');
    s.style.left = `${(r / finish) * 100}%`;
    marks.appendChild(s);
  }
  for (const p of room.players) {
    if (p.id === lobby.net.myId) continue;
    others.set(p.id, { name: p.name, color: p.color, char: 0, best: 0, done: false });
    const lab = document.createElement('span');
    lab.id = `lab-${p.id}`;
    lab.textContent = p.name;
    lab.style.background = p.color;
    $('labels').appendChild(lab);
  }
  begin();
  S.phase = 'countdown';
  G.gameplay(false);
  renderRace();
}

function onNet(m) {
  if (m.t === 'state') {
    const o = others.get(m.id);
    if (!o) return;
    const [x100, row, face, flags, ch, best] = m.s;
    o.char = clamp(ch | 0, 0, CHARACTERS.length - 1);
    o.best = best | 0;
    const g = view.ghost(m.id, o.char, o.color);
    const tgt = { x: x100 / 100, row: row | 0, face: FACES[face] || 'up', dead: !!(flags & 1) };
    if (!g.state) g.state = { x: tgt.x, row: tgt.row, face: tgt.face, hop: null, dead: false };
    const st = g.state;
    if (tgt.row !== st.row || (Math.abs(tgt.x - st.x) > 0.6 && !st.hop)) {
      // salto del fantasma: de donde está a lo que avisó
      st.hop = { from: st.row, to: tgt.row, k: 0, fx: st.x, tx: tgt.x };
      if (Math.abs(tgt.row - st.row) > 2) st.hop = null, (st.row = tgt.row), (st.x = tgt.x);
    }
    st.tx = tgt.x;
    st.face = tgt.face;
    st.dead = tgt.dead;
    return;
  }
  if (m.t === 'finished') {
    const o = others.get(m.id);
    if (o) {
      o.done = true;
      o.time = m.time;
      o.place = m.place;
      if (S.phase !== 'done') toast(t('finishedPop', { n: o.name, p: m.place }));
    }
    if (S.phase === 'done') showResults();
    renderRace();
    return;
  }
  if (m.t === 'end') {
    S.results = m.results;
    if (S.mode === 'race') {
      if (S.phase !== 'done') S.phase = 'done';
      showResults();
    }
  }
}

function ghostsFrame(dt) {
  for (const [id, g] of view.ghosts) {
    const st = g.state;
    if (!st) continue;
    if (st.hop) {
      st.hop.k = Math.min(1, st.hop.k + dt / HOP);
      st.x = st.hop.fx + (st.hop.tx - st.hop.fx) * st.hop.k;
      if (st.hop.k >= 1) {
        st.row = st.hop.to;
        st.hop = null;
      }
    } else st.x += (st.tx - st.x) * Math.min(1, dt * 10);
    view.pose(g, st, dt, S.world);
    g.root.visible = !others.get(id)?.done;
    g.mesh.material.opacity = st.dead ? 0.18 : 0.5;
  }
}

function sendState(now) {
  if (now - lastSent < 90 || !S.hop) return;
  if (S.phase !== 'play' && S.phase !== 'respawn' && S.phase !== 'countdown') return;
  lastSent = now;
  const h = S.hop;
  const row = h.hop ? h.hop.to : h.row;
  const x = h.hop ? h.hop.tx : h.x;
  lobby.net.raw({ t: 'state', s: [Math.round(x * 100), row, FACES.indexOf(h.face), h.alive ? 0 : 1, S.char, h.best] });
}

function drawLabels() {
  for (const [id, g] of view.ghosts) {
    const el = document.getElementById(`lab-${id}`);
    if (!el) continue;
    const p = view.toScreen(g.root.position.x, g.body.position.y + 1.1, g.root.position.z);
    el.hidden = !g.root.visible;
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
  }
}

function renderRace() {
  if (S.mode !== 'race' || !S.world) return;
  const fin = S.world.finish;
  const list = [...others.entries()].map(([id, o]) => ({ id, ...o }));
  list.sort((a, b) => (b.done ? 1e6 - b.place : b.best) - (a.done ? 1e6 - a.place : a.best));
  $('race').innerHTML = list.map((o) => `<div><i style="background:${o.color}"></i>${esc(o.name)} · ${o.done ? fmt(o.time) : o.best + '/' + fin}</div>`).join('');
  const em = $('marks');
  em.querySelectorAll('b').forEach((b) => b.remove());
  for (const o of list) {
    const b = document.createElement('b');
    b.style.background = o.color;
    b.style.left = `${Math.min(100, ((o.done ? fin : o.best) / fin) * 100)}%`;
    em.appendChild(b);
  }
}
setInterval(renderRace, 300);

function showResults() {
  const final = S.results;
  const me = lobby.net.myId;
  let rows;
  if (final) rows = final.map((r) => ({ id: r.id, name: r.name, color: r.color, val: r.dnf ? t('dnf', { r: r.best || 0 }) : fmt(r.time) }));
  else {
    const all = [{ id: me, name: lobby.name, color: '#fff', done: true, time: S.finishMs }, ...[...others.entries()].map(([id, o]) => ({ id, ...o }))];
    all.sort((a, b) => (a.done ? 0 : 1) - (b.done ? 0 : 1) || (a.done ? a.time - b.time : b.best - a.best));
    rows = all.map((r) => ({ id: r.id, name: r.name, color: r.color, val: r.done ? fmt(r.time) : `${t('dnf', { r: r.best })} …` }));
  }
  const place = rows.findIndex((r) => r.id === me) + 1;
  $('res-title').textContent = !final ? t('waitOthers') : S.finishMs && place === 1 ? t('win') : S.finishMs ? t('place', { n: place }) : t('raceOver');
  $('res-rank').innerHTML = rows
    .map((r, i) => `<li class="${r.id === me ? 'me' : ''}"><span>${i + 1}.</span><i style="background:${r.color}"></i><span>${esc(r.name)}${r.id === me ? ` (${t('you')})` : ''}</span><b>${esc(r.val)}</b></li>`)
    .join('');
  const a = lobby.againState(!!final);
  $('res-again').disabled = !a.enabled;
  $('res-again').querySelector('span').textContent = a.text;
  show('results');
}

// ---------------------------------------------------------------- sonido
function sfx(k) {
  if (k === 'hop') tone(520, 760, 0.06, { type: 'square', vol: 0.045 });
  else if (k === 'bump') tone(160, 120, 0.07, { type: 'square', vol: 0.06 });
  else if (k === 'log') noise(0.05, { freq: 700, q: 1.5, vol: 0.08 });
  else if (k === 'coin') notes([988, 1319], { step: 0.06, dur: 0.12, vol: 0.11 });
  else if (k === 'crash') {
    noise(0.3, { freq: 900, sweep: 120, q: 0.6, vol: 0.32 });
    tone(220, 60, 0.3, { type: 'square', vol: 0.1 });
  } else if (k === 'train') noise(0.9, { freq: 300, sweep: 1200, q: 0.5, vol: 0.2 });
  else if (k === 'splash') noise(0.45, { freq: 1500, sweep: 300, q: 0.7, vol: 0.28 });
  else if (k === 'bell') {
    for (let i = 0; i < 4; i++) tone(1320, 1320, 0.09, { type: 'triangle', vol: 0.07, at: i * 0.22 });
  } else if (k === 'eagle') tone(1800, 900, 0.5, { type: 'sawtooth', vol: 0.06 });
  else if (k === 'best') notes([659, 784, 1047], { step: 0.08, dur: 0.16, vol: 0.12 });
  else if (k === 'check') notes([784, 988], { step: 0.08, dur: 0.14, vol: 0.12 });
  else if (k === 'win') notes([523, 659, 784, 1047, 1319], { step: 0.08, dur: 0.22, vol: 0.13 });
  else if (k === 'unlock') notes([523, 784, 1047, 1568], { step: 0.07, dur: 0.2, vol: 0.12 });
  else if (k === 'tick') tone(660, 660, 0.09, { type: 'square', vol: 0.06 });
  else if (k === 'go') tone(990, 990, 0.24, { type: 'square', vol: 0.08 });
}

// ---------------------------------------------------------------- arranque
G.onPrefs((p) => {
  document.documentElement.lang = p.lang;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  view.reduced = !!p.reducedMotion;
  refreshHome();
}, true);
addEventListener('resize', () => view.resize());
newWorld(Math.floor(Math.random() * 2 ** 31));
refreshHome();
requestAnimationFrame(frame);
if (lobby.pending) {
  S.mode = 'race';
  show('online');
} else show('home');
if (/[?&]debug\b/.test(location.search)) window.__cruce = { S, view, owned };
G.ready();
