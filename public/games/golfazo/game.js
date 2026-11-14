/* Golfazo — controlador del juego (game.it).
 * Modos: Un jugador (4 mundos, estrellas), Con amigos (de 2 a 4 por turnos en el mismo aparato) y Online (hasta 8 a la vez).
 * La física es determinista (shared/physics.js): el navegador simula al instante y, online, el servidor repite cada golpe.
 * Entradas: arrastrar hacia atrás y soltar (honda), dos dedos / clic derecho para girar la cámara, rueda o pellizco para el zoom,
 * y teclado (← → apuntan, ↑ ↓ fuerza, espacio pega, Q E giran la cámara).
 */
import { GolfScene } from './scene.js';
import { WORLDS, courseHoles, freshHole, worldOf, HOLES } from './shared/holes.js';
import { newBall, advance, shoot, canShoot, cloneBall, step, HZ, HOLED, MOVE, SLEEP, ANGLES } from './shared/physics.js';
import { MAX_STROKES, strokesOf, holeScore, label as labelOf, stars as starsOf } from './shared/rules.js';
import { THEMES } from './themes.js';
import { OnlineRoom, defaultName, shareLink, roomFromUrl, share, netText } from '/shared/online.js';
import { S as SFX } from './audio.js';
import { t, TXT, worldText } from './text.js';

const G = window.GameIt;
const $ = (id) => document.getElementById(id);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;
const COLORS = ['#ff5a5f', '#3ec1ff', '#ffc93c', '#7bd389', '#c77dff', '#ff9f43', '#2de2e6', '#f15bb5'];
const bi = (o) => (G?.prefs?.lang === 'en' ? o.en : o.es);

const load = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem(`gameit:golfazo:${k}`)) ?? d;
  } catch {
    return d;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(`gameit:golfazo:${k}`, JSON.stringify(v));
  } catch {}
};

// ---------------------------------------------------------------- estado
const opts = { guide: 1, quality: null, ...load('opts', {}) };
const st = {
  mode: 'menu', // menu | solo | local | online
  course: 'pradera',
  holes: [],
  idx: 0,
  single: false,
  world: null,
  players: [],
  turn: 0,
  holeT: 0,
  phase: 'idle', // idle | play | result | final
  paused: false,
  screen: 'home',
  bests: load('best', {}),
  courseBest: load('courses', {}),
  hint: '',
  online: null,
  lastCount: 99,
};
const scene = new GolfScene($('c'), opts.quality ? { quality: opts.quality } : {});
const sc = scene;
const evBuf = [];
let net = null;

// ---------------------------------------------------------------- textos y pantallas
function applyTexts() {
  document.documentElement.lang = G?.prefs?.lang === 'en' ? 'en' : 'es';
  for (const el of $$('[data-t]')) el.textContent = t(el.dataset.t);
  $('how').innerHTML = [1, 2, 3, 4].map((i) => `<li>${t('how' + i)}</li>`).join('');
  $('on-name').placeholder = defaultName();
  renderWorlds();
  renderSeg();
}
const SCREENS = ['home', 'worlds', 'holes', 'local', 'online', 'lobby', 'result', 'final', 'pause', 'how', 'opts'];
function showScreen(id) {
  st.screen = id;
  for (const s of SCREENS) $('s-' + s).classList.toggle('on', s === id);
  const playing = !id && st.phase === 'play';
  $('hud').hidden = !(st.phase !== 'idle' && st.mode !== 'menu');
  G?.gameplay(playing);
}
const goto = (id) => {
  SFX.click();
  showScreen(id);
};
for (const b of $$('[data-go]')) b.addEventListener('click', () => goto(b.dataset.go));

let toastTimer = 0;
function toast(msg, ms = 2200) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), ms);
}
function banner(title, sub = '', cls = '') {
  const el = $('banner');
  el.className = 'banner ' + cls;
  el.querySelector('b').textContent = title;
  el.querySelector('small').textContent = sub;
  void el.offsetWidth;
  el.classList.add('pop');
}
function bigCount(txt) {
  const el = $('count');
  el.textContent = txt;
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}
function setHint(msg) {
  const el = $('hint');
  if (msg) el.textContent = msg;
  el.classList.toggle('on', !!msg);
  st.hint = msg || '';
}
const isTouch = () => matchMedia('(pointer: coarse)').matches || G?.prefs?.touch;

// ---------------------------------------------------------------- jugadores y reglas de turno
const me = () => st.players.find((p) => p.me);
/** La pelota que se controla desde este aparato ahora mismo. */
function ctrl() {
  return st.mode === 'local' ? st.players[st.turn] : me();
}
function resetPlayer(p, w) {
  p.ball = newBall(w);
  p.moving = false;
  p.done = false;
  p.doneK = null;
  p.srvDoneK = null;
  p.shots = [];
  p.applied = 0;
  p.score = null;
  p.announced = false;
}
function makePlayers(list, meId) {
  return list.map((x, i) => ({ id: x.id ?? `p${i}`, name: x.name, color: col(x.color || COLORS[i % COLORS.length]), scores: [], me: meId !== undefined ? x.id === meId : st.mode !== 'local' && i === 0 }));
}

// ---------------------------------------------------------------- hoyos
function themeOf(id) {
  return worldOf(id).theme;
}

function loadHole(i) {
  st.idx = i;
  const id = st.holes[i];
  const w = freshHole(id, true);
  st.world = w;
  sc.loadHole(w, themeOf(id));
  for (const p of st.players) resetPlayer(p, w);
  const showNames = st.mode !== 'solo';
  sc.setBalls(st.players.map((p) => ({ id: p.id, name: p.name, color: p.color, ghost: st.mode === 'online' && !p.me, hideName: !showNames })));
  st.holeT = st.mode === 'online' ? -1 : 0;
  st.phase = 'play';
  st.paused = false;
  st.lastCount = 99;
  st.turn = 0;
  if (st.mode === 'local' && i > 0) {
    // "honor": empieza quien mejor anotó el hoyo anterior
    let best = 0;
    st.players.forEach((p, k) => {
      if ((p.scores[i - 1] ?? 99) < (st.players[best].scores[i - 1] ?? 99)) best = k;
    });
    st.turn = best;
  }
  sc.startIntro();
  aimState = null;
  sc.setAim(null);
  showScreen(null);
  updateHud(true);
  const par = w.par;
  if (st.mode !== 'online') banner(bi(w.name), `${t('holeN', { n: i + 1 })} · ${t('par', { n: par })}`, 'good');
  if (st.mode === 'local') announceTurn();
  refreshHint();
}

function announceTurn() {
  const p = ctrl();
  if (!p) return;
  const el = $('h-turn');
  el.textContent = t('turnOf', { n: p.name });
  el.style.background = p.color;
  el.classList.add('on');
  clearTimeout(announceTurn.t);
  announceTurn.t = setTimeout(() => el.classList.remove('on'), 2200);
}

function refreshHint() {
  if (st.phase !== 'play') return setHint('');
  if (canAim()) {
    if (!st.hintSeen) return setHint(isTouch() ? t('hintTouch') : t('hintMouse'));
    return setHint('');
  }
  setHint('');
}

// ---------------------------------------------------------------- el reloj y la simulación
function eventSound(e, mine) {
  if (!mine && e.t !== 'cup' && e.t !== 'water' && e.t !== 'lava') return;
  switch (e.t) {
    case 'hit':
      if (e.v > 1.6) SFX.hit(e.v, !!e.wall);
      break;
    case 'bumper':
      SFX.bumper();
      break;
    case 'water':
      SFX.water();
      break;
    case 'lava':
      SFX.lava();
      break;
    case 'fall':
    case 'crush':
      SFX.fall();
      break;
    case 'boost':
      SFX.boost();
      break;
    case 'spring':
      SFX.spring();
      break;
    case 'pipeIn':
    case 'pipeOut':
      SFX.pipe();
      break;
    case 'cup':
      SFX.cup();
      break;
    default:
      break;
  }
}
const isMine = (p) => (st.mode === 'local' ? p === st.players[st.turn] : p.me);

function onEvent(e, p) {
  const mine = isMine(p);
  sc.event(e, mine);
  eventSound(e, mine);
  if (mine) {
    if (e.t === 'water') banner(t('water'), t('penalty'), 'bad');
    else if (e.t === 'lava') banner(t('lava'), t('penalty'), 'bad');
    else if (e.t === 'fall') banner(t('fall'), t('penalty'), 'bad');
    else if (e.t === 'crush') banner(t('crush'), '', 'bad');
  }
}

function tick(dt) {
  if (!st.world || st.phase === 'idle') return;
  if (st.mode === 'online') {
    const r = st.online?.room;
    if (r?.startAt) st.holeT = (net.serverNow() - r.startAt) / 1000;
    countdown();
  } else if (!st.paused) st.holeT += dt;
  const k = Math.floor(Math.max(0, st.holeT) * HZ);
  for (const p of st.players) {
    evBuf.length = 0;
    advance(st.world, p.ball, k, evBuf);
    for (let i = 0; i < evBuf.length; i++) onEvent(evBuf[i], p);
    if (p.moving && (p.ball.mode === HOLED || canShoot(p.ball))) {
      p.moving = false;
      onShotEnd(p);
    }
    // online: el tick en que el servidor dice que embocó
    if (st.mode === 'online' && p.srvDoneK != null && !p.announced && k >= p.srvDoneK) {
      p.announced = true;
      if (!p.me) toast(`${p.name} ✓ ${t('holeIn', { n: strokesOf(p.ball) })}`);
    }
  }
}

function countdown() {
  const r = st.online?.room;
  if (!r || r.phase !== 'play') return;
  if (st.holeT < 0) {
    const n = Math.ceil(-st.holeT);
    if (n !== st.lastCount && n <= 3) {
      st.lastCount = n;
      bigCount(String(n));
      SFX.tick();
    }
  } else if (st.lastCount !== 0 && st.lastCount <= 3) {
    st.lastCount = 0;
    bigCount(t('countGo'));
    SFX.go();
  }
}

// ---------------------------------------------------------------- golpes
function canAim() {
  const p = ctrl();
  if (!p || st.phase !== 'play' || st.paused || st.screen || p.done || p.moving || !canShoot(p.ball)) return false;
  if (strokesOf(p.ball) >= MAX_STROKES) return false;
  if (st.mode === 'online') {
    const r = st.online?.room;
    if (!r || r.phase !== 'play' || st.holeT < 0) return false;
  }
  return true;
}

function fire(a, pw) {
  if (!canAim()) return false;
  const p = ctrl();
  const k = p.ball.k;
  shoot(st.world, p.ball, a, pw);
  p.shots.push({ a, p: pw, k });
  p.applied = p.shots.length;
  p.moving = true;
  SFX.putt(pw / 1000);
  sc.skipIntro();
  if (st.mode === 'online') net.send({ t: 'shot', a, p: pw, k });
  st.hintSeen = true;
  setHint('');
  aimState = null;
  sc.setAim(null);
  $('power').classList.remove('on');
  updateHud(true);
  return true;
}

function onShotEnd(p) {
  if (p.ball.mode === HOLED) return onHoled(p, false);
  if (strokesOf(p.ball) >= MAX_STROKES) return onHoled(p, true);
  if (st.mode === 'local') {
    if (p === st.players[st.turn]) setTimeout(nextTurn, 350);
  } else if (isMine(p)) {
    sc.recenter();
    updateHud(true);
  }
}

function onHoled(p, forced) {
  p.done = true;
  p.doneK = p.ball.k;
  p.score = holeScore(p.ball);
  const strokes = strokesOf(p.ball);
  const par = st.world.par;
  const mine = isMine(p);
  const lab = forced ? 'max' : labelOf(strokes, par);
  const good = !forced && strokes - par <= -1;
  if (mine || st.mode === 'local') {
    const title = forced ? t('max') : lab === 'over' ? t('over', { n: strokes - par }) : t(lab === 'par' ? 'parL' : lab);
    const who = st.mode === 'local' ? `${p.name} · ` : '';
    banner(title, who + (strokes === 1 ? t('holeIn1') : t('holeIn', { n: strokes })), good ? 'good' : forced ? 'bad' : '');
    if (forced) SFX.bad();
    else if (lab === 'ace' || lab === 'albatross' || lab === 'eagle') SFX.great();
    else if (good) SFX.good();
    else SFX.meh();
  }
  updateHud(true);
  if (st.mode === 'solo') setTimeout(() => st.phase === 'play' && showResult(), 2000);
  else if (st.mode === 'local') {
    if (st.players.every((x) => x.done)) setTimeout(() => st.phase === 'play' && showResult(), 2000);
    else setTimeout(nextTurn, 1500);
  }
}

function nextTurn() {
  if (st.mode !== 'local' || st.phase !== 'play') return;
  const n = st.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (st.turn + k) % n;
    if (!st.players[i].done) {
      if (i !== st.turn || st.players[i].moving === false) {
        st.turn = i;
        announceTurn();
        sc.recenter();
        updateHud(true);
        refreshHint();
      }
      return;
    }
  }
}

// ---------------------------------------------------------------- resultados
const relText = (n) => (n === 0 ? 'E' : n > 0 ? `+${n}` : String(n));
const starsHtml = (n) => '★'.repeat(n) + `<u>${'★'.repeat(3 - n)}</u>`;

function rankHole() {
  return [...st.players].sort((a, b) => (a.score ?? 99) - (b.score ?? 99) || (a.doneK ?? 1e9) - (b.doneK ?? 1e9));
}

function showResult() {
  if (st.phase !== 'play') return;
  st.phase = 'result';
  const w = st.world;
  for (const p of st.players) {
    if (!p.done) {
      p.done = true;
      p.score = Math.max(MAX_STROKES, strokesOf(p.ball));
    }
    p.scores[st.idx] = p.score;
  }
  const last = st.idx >= st.holes.length - 1;
  $('res-kicker').textContent = `${t('holeN', { n: st.idx + 1 })} · ${bi(w.name)} · ${t('par', { n: w.par })}`;
  const rank = rankHole();
  if (st.mode === 'solo') {
    const p = st.players[0];
    const strokes = p.score;
    const lab = p.ball.mode === HOLED ? labelOf(strokes, w.par) : 'max';
    $('res-title').textContent = lab === 'max' ? t('max') : lab === 'over' ? t('over', { n: strokes - w.par }) : t(lab === 'par' ? 'parL' : lab);
    $('res-big').innerHTML = `${strokes}<small>${strokes === 1 ? t('holeIn1') : t('holeIn', { n: strokes })}</small>`;
    const s = p.ball.mode === HOLED ? starsOf(strokes, w.par) : 0;
    $('res-stars').innerHTML = starsHtml(s);
    const id = st.holes[st.idx];
    const prev = st.bests[id];
    if (p.ball.mode === HOLED && (prev === undefined || strokes < prev)) {
      st.bests[id] = strokes;
      save('best', st.bests);
      if (prev !== undefined) $('res-title').textContent += ` ${t('newBest')}`;
    }
    $('res-rank').innerHTML = '';
  } else {
    const w0 = rank[0];
    const tie = rank[1] && rank[1].score === w0.score;
    $('res-title').textContent = tie ? t('tie') : t('winner', { n: w0.name });
    $('res-big').innerHTML = `${w0.score}<small>${t('holeIn', { n: w0.score })}</small>`;
    $('res-stars').innerHTML = '';
    $('res-rank').innerHTML = rank.map((p) => `<li class="${p.me ? 'me' : ''}"><i style="background:${p.color}"></i>${esc(p.name)}<em>${p.score}${p.ball.mode !== HOLED ? ' ✗' : ''}</em></li>`).join('');
  }
  $('res-next').hidden = false;
  $('res-next').querySelector('b').textContent = last ? t('finish') : t('next');
  $('res-wait').textContent = '';
  showScreen('result');
  SFX.good();
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** Los colores que llegan por la red se validan antes de usarlos en estilos. */
const col = (c) => (/^#[0-9a-f]{6}$/i.test(String(c)) ? c : '#999999');

function finalTable(players, holes) {
  const head = `<tr><th>${t('hole')}</th>${holes.map((h, i) => `<th>${i + 1}</th>`).join('')}<th>${t('total')}</th></tr>`;
  const parRow = `<tr><td>${t('par', { n: '' }).trim()}</td>${holes.map((h) => `<td>${HOLES[h].par}</td>`).join('')}<td class="tot">${holes.reduce((a, h) => a + HOLES[h].par, 0)}</td></tr>`;
  const rows = players.map((p) => {
    const tot = holes.reduce((a, _, i) => a + (p.scores[i] ?? 0), 0);
    const cells = holes.map((h, i) => {
      const s = p.scores[i];
      if (s === undefined) return '<td>·</td>';
      const d = s - HOLES[h].par;
      return `<td class="${d < 0 ? 'u' : d > 0 ? 'o' : ''}">${s}</td>`;
    });
    return `<tr><td><i style="background:${p.color}"></i>${esc(p.name)}</td>${cells.join('')}<td class="tot">${tot}</td></tr>`;
  });
  return head + parRow + rows.join('');
}

function showFinal(rows) {
  st.phase = 'final';
  const holes = st.holes;
  const players = rows || st.players;
  const parTotal = holes.reduce((a, h) => a + HOLES[h].par, 0);
  const totals = players.map((p) => ({ p, tot: holes.reduce((a, _, i) => a + (p.scores[i] ?? MAX_STROKES), 0) })).sort((a, b) => a.tot - b.tot);
  $('fin-kicker').textContent = bi(worldText[st.course] || worldText.pradera);
  $('fin-table').innerHTML = finalTable(totals.map((x) => x.p), holes);
  const pod = totals.slice(0, 3);
  const order = pod.length === 3 ? [1, 0, 2] : pod.length === 2 ? [1, 0] : [0];
  $('fin-podium').innerHTML = order.map((i) => `<div class="p${i + 1}"><i style="background:${pod[i].p.color}"></i><span>${esc(pod[i].p.name)}</span><b>${i + 1}</b></div>`).join('');
  $('fin-podium').hidden = players.length < 2;
  if (st.mode === 'solo') {
    const tot = totals[0].tot;
    $('fin-title').textContent = t('courseDone');
    const best = st.courseBest[st.course];
    const nb = best === undefined || tot < best;
    if (nb) {
      st.courseBest[st.course] = tot;
      save('courses', st.courseBest);
    }
    const stars = holes.reduce((a, h, i) => a + starsOf(players[0].scores[i] ?? MAX_STROKES, HOLES[h].par), 0);
    $('fin-kicker').textContent = `${bi(worldText[st.course] || worldText.pradera)} · ${tot} (${relText(tot - parTotal)}) · ★ ${stars}/${holes.length * 3}${nb && best !== undefined ? ' · ' + t('newBest') : ''}`;
    SFX.win();
  } else {
    const w0 = totals[0], tie = totals[1] && totals[1].tot === w0.tot;
    $('fin-title').textContent = tie ? t('tie') : w0.p.me && st.mode === 'online' ? t('youWon') : t('winner', { n: w0.p.name });
    (w0.p.me ? SFX.win : SFX.lose)();
  }
  $('fin-again').querySelector('b').textContent = st.mode === 'online' ? t('rematch') : t('again');
  $('fin-again').disabled = false;
  showScreen('final');
}

function nextHole() {
  SFX.click();
  if (st.mode === 'online') return;
  if (st.idx + 1 < st.holes.length) loadHole(st.idx + 1);
  else showFinal();
}

// ---------------------------------------------------------------- HUD
const hud = { strokes: -1, key: '' };
function updateHud(force) {
  const p = ctrl() || st.players[0];
  if (!p || !st.world) return;
  const strokes = strokesOf(p.ball);
  if (force || hud.strokes !== strokes) {
    $('h-strokes').textContent = strokes;
    hud.strokes = strokes;
  }
  $('h-num').textContent = st.idx + 1;
  $('h-name').textContent = bi(st.world.name);
  $('h-par').textContent = ' · ' + t('par', { n: st.world.par });
  const multi = st.players.length > 1;
  const list = $('h-players');
  list.hidden = !multi;
  if (multi) {
    const html = st.players
      .map((q) => {
        const isTurn = st.mode === 'local' && q === st.players[st.turn];
        return `<div class="pl ${q.me ? 'me' : ''} ${isTurn ? 'turn' : ''} ${q.done ? 'done' : ''}"><i style="background:${q.color}"></i><span>${esc(q.name)}</span><em>${strokesOf(q.ball)}</em></div>`;
      })
      .join('');
    if (html !== hud.key) {
      list.innerHTML = html;
      hud.key = html;
    }
  }
  const timer = $('h-timer');
  if (st.mode === 'online' && st.online?.room?.deadline) {
    timer.hidden = false;
    const left = Math.max(0, Math.ceil((st.online.room.deadline - net.serverNow()) / 1000));
    $('h-time').textContent = st.holeT < 0 ? '–' : left;
    timer.classList.toggle('low', left <= 10 && st.holeT >= 0);
  } else timer.hidden = true;
}
setInterval(() => st.phase === 'play' && updateHud(), 250);

// ---------------------------------------------------------------- entrada: honda, cámara y teclado
let aimState = null; // { sx, sy, cx, cy, id }
const pointers = new Map();
let pinch = null;
const canvas = $('c');

function pullMax() {
  return clamp(Math.min(sc.W, sc.H) * 0.34, 110, 280);
}
/** De lo que se arrastró (px) a un ángulo (entero) y una fuerza (1..1000). */
function aimFromDrag(vx, vy) {
  const y = sc.yaw;
  const dx = vy * Math.sin(y) + vx * Math.cos(y);
  const dz = vy * Math.cos(y) - vx * Math.sin(y);
  const rad = Math.atan2(dx, dz);
  const q = clamp(Math.hypot(vx, vy) / pullMax(), 0, 1);
  return { rad, q };
}
const toInt = (rad) => ((Math.round((((rad / TAU) % 1) + 1) % 1 * ANGLES) % ANGLES) + ANGLES) % ANGLES;
const powerOf = (q) => clamp(Math.round(1000 * Math.pow(q, 1.35)), 1, 1000);

const GUIDE_N = [0, 20, 56];
function guidePts(ball, a, pw) {
  const n = GUIDE_N[opts.guide] || 0;
  if (!n) return null;
  const s = cloneBall(ball);
  shoot(st.world, s, a, pw);
  const pts = [];
  for (let i = 0; i < n * 3 && s.mode === MOVE; i++) {
    step(st.world, s);
    if (i % 3 === 2) pts.push([s.x, s.y, s.z]);
  }
  return pts;
}

const kb = { on: false, rel: 0, q: 0.5 };

function updateAim() {
  const p = ctrl();
  let aim = null;
  if (p && canAim()) {
    let rad = null, q = 0;
    if (aimState && aimState.live) {
      const r = aimFromDrag(aimState.cx - aimState.sx, aimState.cy - aimState.sy);
      if (r.q > 0.04) { rad = r.rad; q = r.q; }
    } else if (kb.on) {
      rad = sc.yaw + kb.rel;
      q = kb.q;
    }
    if (rad !== null) {
      const a = toInt(rad), pw = powerOf(q);
      aim = { x: p.ball.x, y: p.ball.y - 0.04, z: p.ball.z, a: (a / ANGLES) * TAU, p: q, pts: guidePts(p.ball, a, pw), ai: a, pi: pw };
    }
  }
  sc.setAim(aim);
  const pow = $('power');
  pow.classList.toggle('on', !!aim);
  if (aim) {
    $('power-fill').style.width = `${Math.round(aim.p * 100)}%`;
    $('power-v').textContent = Math.round(aim.p * 100);
  }
  return aim;
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture?.(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
  sc.skipIntro();
  if (pointers.size >= 2) {
    aimState = null;
    pinch = null;
    return;
  }
  const orbit = e.button === 2 || e.button === 1 || e.shiftKey || !canAim();
  aimState = { sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY, live: !orbit, orbit, id: e.pointerId };
  kb.on = false;
});
canvas.addEventListener('pointermove', (e) => {
  const pt = pointers.get(e.pointerId);
  if (!pt) return;
  const dx = e.clientX - pt.x, dy = e.clientY - pt.y;
  pt.x = e.clientX;
  pt.y = e.clientY;
  if (pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch) {
      sc.orbit(-(cx - pinch.cx) * 0.007, (cy - pinch.cy) * 0.004);
      if (pinch.d > 8 && d > 8) sc.zoom(pinch.d / d);
    }
    pinch = { cx, cy, d };
    return;
  }
  if (!aimState || aimState.id !== e.pointerId) return;
  aimState.cx = e.clientX;
  aimState.cy = e.clientY;
  if (aimState.orbit) sc.orbit(-dx * 0.007, dy * 0.004);
});
function endPointer(e, cancel) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (!aimState || aimState.id !== e.pointerId) return;
  const s = aimState;
  aimState = null;
  if (!s.live || cancel) return;
  const r = aimFromDrag(s.cx - s.sx, s.cy - s.sy);
  if (r.q <= 0.04) return;
  fire(toInt(r.rad), powerOf(r.q));
}
canvas.addEventListener('pointerup', (e) => endPointer(e, false));
canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  sc.zoom(Math.exp(e.deltaY * 0.0012));
}, { passive: false });

const held = new Set();
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === 'Escape') {
    if (st.screen === 'pause') return resumeGame();
    if (st.phase === 'play' && !st.screen) {
      if (aimState?.live || kb.on) {
        aimState = null;
        kb.on = false;
        return;
      }
      return openPause();
    }
    return;
  }
  if (st.screen || st.phase !== 'play') return;
  held.add(e.code);
  if (e.code === 'KeyQ') sc.orbit(0.12, 0);
  else if (e.code === 'KeyE') sc.orbit(-0.12, 0);
  else if (e.code === 'KeyR') sc.recenter();
  else if (e.code === 'KeyO') $('b-over').click();
  else if (e.code === 'KeyP') openPause();
  else if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (kb.on) {
      const a = updateAim();
      if (a) fire(a.ai, a.pi);
      kb.on = false;
    } else {
      kb.on = true;
      kb.rel = 0;
    }
  } else {
    const d = G?.dir?.(e);
    if (d === 'left' || d === 'right') {
      kb.on = true;
      kb.rel += (d === 'left' ? 1 : -1) * (e.shiftKey ? 0.004 : 0.03);
    } else if (d === 'up' || d === 'down') {
      kb.on = true;
      kb.q = clamp(kb.q + (d === 'up' ? 0.03 : -0.03), 0.05, 1);
    } else return;
    e.preventDefault();
  }
});
addEventListener('keyup', (e) => held.delete(e.code));

$('b-rotl').addEventListener('click', () => sc.orbit(0.35, 0));
$('b-rotr').addEventListener('click', () => sc.orbit(-0.35, 0));
$('b-center').addEventListener('click', () => sc.recenter());
$('b-over').addEventListener('click', () => {
  const on = sc.toggleOverview();
  setHint(on ? '' : '');
});
for (const id of ['b-rotl', 'b-rotr']) {
  // mantener apretado sigue girando
  let timer = 0;
  const el = $(id);
  el.addEventListener('pointerdown', () => {
    timer = setInterval(() => sc.orbit(id === 'b-rotl' ? 0.04 : -0.04, 0), 30);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) el.addEventListener(ev, () => clearInterval(timer));
}

// ---------------------------------------------------------------- pausa
function openPause() {
  if (st.phase !== 'play') return;
  if (st.mode !== 'online') st.paused = true;
  $('p-restart').hidden = st.mode === 'online';
  $('p-card').hidden = st.mode === 'solo' && st.holes.length === 1;
  renderSeg();
  showScreen('pause');
}
function resumeGame() {
  st.paused = false;
  showScreen(null);
}
$('b-pause').addEventListener('click', openPause);
$('p-resume').addEventListener('click', () => {
  SFX.click();
  resumeGame();
});
$('p-restart').addEventListener('click', () => {
  SFX.click();
  loadHole(st.idx);
});
$('p-card').addEventListener('click', () => {
  SFX.click();
  if (st.mode === 'online') return;
  const rows = st.players.map((p) => ({ ...p, scores: [...p.scores] }));
  rows.forEach((r) => (r.scores[st.idx] = undefined));
  $('fin-kicker').textContent = bi(worldText[st.course] || worldText.pradera);
  $('fin-title').textContent = t('scorecard');
  $('fin-table').innerHTML = finalTable(rows, st.holes);
  $('fin-podium').hidden = true;
  $('fin-again').hidden = true;
  $('fin-menu').querySelector('b').textContent = t('resume');
  st.cardMode = true;
  showScreen('final');
});
$('p-quit').addEventListener('click', () => {
  SFX.click();
  quitToMenu();
});
G?.onPause?.(() => {
  if (st.phase === 'play' && !st.screen && st.mode !== 'online') openPause();
});

function quitToMenu() {
  if (st.mode === 'online') leaveOnline();
  st.phase = 'idle';
  st.mode = 'menu';
  st.world = null;
  st.paused = false;
  aimState = null;
  sc.setAim(null);
  $('banner').className = 'banner';
  $('count').className = 'count';
  $('fin-again').hidden = false;
  $('fin-menu').querySelector('b').textContent = t('menu');
  st.cardMode = false;
  showMenuScene();
  showScreen('home');
}

// ---------------------------------------------------------------- el fondo del menú: un hoyo girando lentamente
let menuT = 0;
let menuHole = 0;
function showMenuScene() {
  const ids = ['pradera-4', 'bahia-2', 'glaciar-6', 'volcan-3', 'pradera-6', 'bahia-5', 'glaciar-3', 'volcan-5'];
  const id = ids[menuHole++ % ids.length];
  const w = freshHole(id, true);
  st.world = null;
  menuWorld = w;
  sc.loadHole(w, themeOf(id));
  sc.setBalls([]);
  sc.setAim(null);
  sc.cam.overview = false;
  sc.cam.pitch = 0.62;
  sc.cam.dist = Math.max(14, sc.bounds.r * 1.5);
  menuT = 0;
  sc.cam.tx = sc.bounds.cx; sc.cam.ty = sc.bounds.cy; sc.cam.tz = sc.bounds.cz;
}
let menuWorld = null;

// ---------------------------------------------------------------- bucle
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (st.world && st.mode !== 'menu') {
    tick(dt);
    updateAim();
    const mine = ctrl();
    const balls = new Map(st.players.map((q) => [q.id, q.ball]));
    const yawHint = mine && canAim() && !aimState ? sc.headingAt(mine.ball.x, mine.ball.z) : null;
    const focus = (st.mode === 'local' ? st.players[st.turn] : me() || st.players[0])?.id;
    sc.frame(dt, { t: Math.max(0, st.holeT), balls, focus, yawHint, holed: !!(mine && mine.ball.mode === HOLED && st.mode !== 'local') });
  } else if (menuWorld && st.mode === 'menu') {
    menuT += dt;
    sc.cam.yaw += dt * 0.12;
    sc.frame(dt, { t: menuT, balls: new Map(), focus: null, yawHint: null, holed: false, menu: true });
  }
}

// ---------------------------------------------------------------- menús
function stars(world) {
  const w = WORLDS.find((x) => x.id === world);
  if (!w) return 0;
  return w.holes.reduce((a, h) => a + (st.bests[h] !== undefined ? starsOf(st.bests[h], HOLES[h].par) : 0), 0);
}
function renderWorlds() {
  const el = $('worlds');
  if (!el) return;
  const cards = WORLDS.map((w) => {
    const T = THEMES[w.theme];
    return `<button class="world" data-course="${w.id}" style="--a:${T.preview[0]};--b:${T.preview[1]}"><span class="st">★ ${stars(w.id)}/18</span><b>${bi(T.name)}</b><small>${bi(T.blurb)}</small></button>`;
  });
  cards.push(`<button class="world" data-course="gira" style="--a:#c77dff;--b:#3ec1ff"><b>${bi(worldText.gira)}</b><small>${t('giraBlurb')}</small></button>`);
  cards.push(`<button class="world" data-course="todos" style="--a:#ff9f43;--b:#f15bb5"><b>${bi(worldText.todos)}</b><small>${t('todosBlurb')}</small></button>`);
  el.innerHTML = cards.join('');
  for (const b of $$('.world', el)) b.addEventListener('click', () => openHoles(b.dataset.course));
}

let pickedCourse = 'pradera';
function openHoles(course) {
  SFX.click();
  pickedCourse = course;
  const ids = courseHoles(course);
  const T = THEMES[course] || null;
  $('holes-title').textContent = bi(worldText[course]);
  $('holes-blurb').textContent = T ? bi(T.blurb) : t(course + 'Blurb');
  $('holes-play-sub').textContent = `${t('holesN', { n: ids.length })} · ${t('par', { n: ids.reduce((a, h) => a + HOLES[h].par, 0) })}`;
  $('hole-grid').innerHTML = ids
    .map((h, i) => {
      const b = st.bests[h];
      const s = b !== undefined ? starsOf(b, HOLES[h].par) : 0;
      return `<button class="hole" data-hole="${h}"><b>${i + 1}</b>${bi(HOLES[h].name)}<span class="s">${b !== undefined ? starsHtml(s) : ''}</span><small>${t('par', { n: HOLES[h].par })}${b !== undefined ? ' · ' + t('best', { n: b }) : ''}</small></button>`;
    })
    .join('');
  for (const b of $$('.hole', $('hole-grid'))) b.addEventListener('click', () => startSolo(pickedCourse, [b.dataset.hole], true));
  showScreen('holes');
}
$('holes-play').addEventListener('click', () => startSolo(pickedCourse, courseHoles(pickedCourse), false));

function startSolo(course, holes, single) {
  SFX.click();
  st.mode = 'solo';
  st.course = course;
  st.holes = holes;
  st.single = single;
  st.players = makePlayers([{ id: 'me', name: defaultName() }], 'me');
  loadHole(0);
}

// local
let localCount = 2;
let localCourse = 'pradera';
function renderLocal() {
  const el = $('local-names');
  const prev = $$('input', el).map((i) => i.value);
  el.innerHTML = Array.from({ length: localCount }, (_, i) => `<input class="field" maxlength="12" data-i="${i}" value="${esc(prev[i] || (G?.prefs?.lang === 'en' ? `Player ${i + 1}` : `Jugador ${i + 1}`))}" aria-label="${i + 1}" />`).join('');
  $('local-course').innerHTML = [...WORLDS.map((w) => w.id), 'gira', 'todos'].map((c) => `<button data-c="${c}" class="${c === localCourse ? 'on' : ''}">${THEMES[c] ? `<i style="--c:${THEMES[c].preview[0]}"></i>` : ''}${bi(worldText[c])}</button>`).join('');
  for (const b of $$('button', $('local-course'))) b.addEventListener('click', () => { localCourse = b.dataset.c; renderLocal(); });
}
$('h-local').addEventListener('click', () => { goto('local'); renderLocal(); });
$('seg-count').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  localCount = Number(b.dataset.v);
  for (const x of $$('button', $('seg-count'))) x.classList.toggle('on', x === b);
  renderLocal();
});
$('local-start').addEventListener('click', () => {
  SFX.click();
  const names = $$('input', $('local-names')).map((i, k) => i.value.trim() || `P${k + 1}`);
  st.mode = 'local';
  st.course = localCourse;
  st.holes = courseHoles(localCourse);
  st.single = false;
  st.players = names.map((n, i) => ({ id: `p${i}`, name: n, color: COLORS[i], scores: [], me: false }));
  loadHole(0);
});

$('h-solo').addEventListener('click', () => { goto('worlds'); renderWorlds(); });
$('h-how').addEventListener('click', () => goto('how'));
$('how-ok').addEventListener('click', () => { st.hintSeen = false; goto(st.phase === 'play' || st.mode !== 'menu' ? null : 'home'); });
$('h-opts').addEventListener('click', () => { renderSeg(); goto('opts'); });
$('opts-ok').addEventListener('click', () => goto(st.mode === 'menu' ? 'home' : 'pause'));
$('res-next').addEventListener('click', nextHole);
$('fin-menu').addEventListener('click', () => {
  SFX.click();
  if (st.cardMode) {
    st.cardMode = false;
    $('fin-again').hidden = false;
    $('fin-menu').querySelector('b').textContent = t('menu');
    return showScreen('pause');
  }
  quitToMenu();
});
$('fin-again').addEventListener('click', () => {
  SFX.click();
  if (st.mode === 'online') {
    net.send({ t: 'rematch' });
    $('fin-again').disabled = true;
    return;
  }
  for (const p of st.players) p.scores = [];
  loadHole(0);
});

function renderSeg() {
  for (const [id, key] of [['seg-guide', 'guide'], ['opt-guide', 'guide'], ['opt-quality', 'quality']]) {
    const el = $(id);
    if (!el) continue;
    const val = String(key === 'quality' ? sc.quality : opts.guide);
    for (const b of $$('button', el)) b.classList.toggle('on', b.dataset.v === val);
  }
}
for (const id of ['seg-guide', 'opt-guide', 'opt-quality']) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    SFX.click();
    if (id === 'opt-quality') {
      opts.quality = b.dataset.v;
      sc.setQuality(b.dataset.v);
    } else opts.guide = Number(b.dataset.v);
    save('opts', opts);
    renderSeg();
  });
}

// ---------------------------------------------------------------- online
const myName = () => ($('on-name').value.trim() || defaultName()).slice(0, 16);

function ensureNet() {
  if (net) return net;
  net = new OnlineRoom('golfazo', { onRoom, onMessage, onStatus, onJoined: () => {} });
  return net;
}
function onStatus(s) {
  const m = netText(s) || '';
  $('on-status').textContent = s === 'open' ? '' : m;
  $('on-status').classList.toggle('err', s === 'netError' || s === 'rate');
}
$('h-online').addEventListener('click', () => {
  goto('online');
  $('on-name').value = defaultName();
  const c = roomFromUrl();
  if (c) {
    $('on-code').value = c;
    $('on-status').textContent = t('joinFromLink');
  }
});
$('on-create').addEventListener('click', () => {
  SFX.click();
  ensureNet().create(myName(), { course: 'pradera', limit: 90, public: false });
});
$('on-quick').addEventListener('click', () => {
  SFX.click();
  st.quick = true;
  ensureNet().name = myName();
  net.send({ t: 'list', game: 'golfazo' });
});
$('on-join').addEventListener('click', () => {
  SFX.click();
  const code = $('on-code').value.trim().toUpperCase();
  if (code.length < 5) {
    $('on-status').textContent = t('enterCode');
    return;
  }
  ensureNet().join(code, myName());
});
$('on-code').addEventListener('input', (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')));
$('lobby-code').addEventListener('click', async () => {
  const code = st.online?.room?.code;
  if (!code) return;
  const r = await share('golfazo', code);
  if (r === 'copied') toast(t('copied'));
});
$('lobby-leave').addEventListener('click', () => {
  SFX.click();
  leaveOnline();
  showScreen('home');
});
function leaveOnline() {
  net?.leave();
  st.online = null;
  if (st.mode === 'online') st.mode = 'menu';
}

function lobbySettings() {
  const course = $('lobby-course').querySelector('.on')?.dataset.c || 'pradera';
  const limit = Number($('lobby-time').querySelector('.on')?.dataset.v || 90);
  return { course, limit, public: $('lobby-public').checked };
}
function pushSettings() {
  if (net?.isHost) net.send({ t: 'settings', settings: lobbySettings() });
}
$('lobby-time').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  for (const x of $$('button', $('lobby-time'))) x.classList.toggle('on', x === b);
  pushSettings();
});
$('lobby-public').addEventListener('change', pushSettings);
$('lobby-start').addEventListener('click', () => {
  SFX.click();
  net.send({ t: 'start', settings: lobbySettings() });
});

function renderLobby(room) {
  st.online = { room };
  const host = room.host === net.myId;
  $('lobby-code').textContent = room.code;
  $('lobby-players').innerHTML = room.players
    .map((p) => `<li><i style="background:${col(p.color)}"></i>${esc(p.name)}${p.id === net.myId ? ` <small>${t('you')}</small>` : ''}${p.id === room.host ? ` <small>${t('host')}</small>` : ''}${!p.connected ? ` <small>${t('offline')}</small>` : ''}${host && p.id !== net.myId ? `<button data-kick="${esc(p.id)}">${t('kick')}</button>` : ''}</li>`)
    .join('');
  for (const b of $$('[data-kick]', $('lobby-players'))) b.addEventListener('click', () => net.send({ t: 'kick', id: b.dataset.kick }));
  $('lobby-host').hidden = !host;
  $('lobby-wait').hidden = host;
  const s = room.settings || {};
  $('lobby-course').innerHTML = [...WORLDS.map((w) => w.id), 'gira', 'todos'].map((c) => `<button data-c="${c}" class="${c === s.course ? 'on' : ''}">${THEMES[c] ? `<i style="--c:${THEMES[c].preview[0]}"></i>` : ''}${bi(worldText[c])}</button>`).join('');
  for (const b of $$('button', $('lobby-course'))) b.addEventListener('click', () => {
    if (!net.isHost) return;
    for (const x of $$('button', $('lobby-course'))) x.classList.toggle('on', x === b);
    pushSettings();
  });
  for (const b of $$('button', $('lobby-time'))) b.classList.toggle('on', Number(b.dataset.v) === s.limit);
  $('lobby-public').checked = !!s.public;
  if (!$('lobby-course').dataset.bound) $('lobby-course').dataset.bound = '1';
}

function onRoom(room) {
  st.online = { room };
  if (room.state === 'lobby') {
    if (st.mode === 'online' && st.phase !== 'idle') {
      // volvió al lobby (revancha)
      st.phase = 'idle';
      st.world = null;
      st.mode = 'menu';
      showMenuScene();
    }
    renderLobby(room);
    if (st.screen !== 'lobby') showScreen('lobby');
    return;
  }
  if (room.state === 'playing' || room.state === 'finished') {
    if (st.mode !== 'online' || st.phase === 'idle') enterOnline(room);
    syncOnline(room);
  }
}

function enterOnline(room) {
  st.mode = 'online';
  st.course = room.course;
  st.holes = room.holes || courseHoles(room.course);
  st.single = false;
  st.players = room.players.map((p, i) => ({ id: p.id, name: p.name, color: col(p.color || COLORS[i % 8]), scores: [], me: p.id === net.myId }));
  st.idx = -1;
  st.phase = 'idle';
  showScreen(null);
}

function syncOnline(room) {
  if (room.idx === undefined || room.idx < 0 || !room.holes) return;
  // jugadores nuevos o que se fueron
  const ids = room.players.map((p) => p.id).join();
  if (ids !== st.players.map((p) => p.id).join()) {
    st.players = room.players.map((p, i) => st.players.find((x) => x.id === p.id) || { id: p.id, name: p.name, color: col(p.color || COLORS[i % 8]), scores: [], me: p.id === net.myId });
    if (st.world) sc.setBalls(st.players.map((p) => ({ id: p.id, name: p.name, color: p.color, ghost: !p.me })));
  }
  if (room.idx !== st.idx || st.phase === 'idle') {
    st.holes = room.holes;
    $('banner').className = 'banner';
    loadHole(room.idx);
    st.phase = 'play';
  }
  for (const p of st.players) {
    const info = room.pl?.[p.id];
    if (!info) continue;
    p.scores = info.sc || [];
    p.srvDoneK = info.d;
    p.gone = !!info.g;
    applyShots(p, info.s || []);
  }
  if (room.phase === 'between' && st.screen !== 'result' && room.state !== 'finished') showOnlineResult(room);
  if (room.phase === 'play' && st.screen === 'result') showScreen(null);
  if (room.state === 'finished' && st.screen !== 'final') showOnlineFinal(room);
  updateHud(true);
}

function rebuild(p, list) {
  p.ball = newBall(st.world);
  p.shots = [];
  p.applied = 0;
  p.moving = false;
  for (const [a, pw, k] of list) {
    advance(st.world, p.ball, k);
    if (!canShoot(p.ball)) break;
    shoot(st.world, p.ball, a, pw);
    p.shots.push({ a, p: pw, k });
    p.applied++;
    p.moving = true;
  }
}
function applyShots(p, list) {
  if (p.me && list.length <= p.shots.length) return;
  if (list.length < p.applied) return rebuild(p, list);
  while (p.applied < list.length) {
    const [a, pw, k] = list[p.applied];
    if (k < p.ball.k) {
      if (p.ball.mode === SLEEP) p.ball.k = k;
      else return rebuild(p, list);
    }
    advance(st.world, p.ball, k);
    if (!canShoot(p.ball)) return rebuild(p, list);
    shoot(st.world, p.ball, a, pw);
    p.shots.push({ a, p: pw, k });
    p.applied++;
    p.moving = true;
  }
}

function showOnlineResult(room) {
  st.phase = 'result';
  const w = st.world;
  const rows = st.players.filter((p) => !p.gone).map((p) => ({ p, s: (room.pl?.[p.id]?.sc || [])[room.idx] ?? MAX_STROKES, x: room.pl?.[p.id]?.x }));
  rows.sort((a, b) => a.s - b.s);
  const mine = rows.find((r) => r.p.me);
  const lab = mine && !mine.x ? labelOf(mine.s, w.par) : 'max';
  $('res-kicker').textContent = `${t('holeN', { n: room.idx + 1 })} · ${bi(w.name)} · ${t('par', { n: w.par })}`;
  $('res-title').textContent = mine?.x ? t('timeUp') : lab === 'over' ? t('over', { n: (mine?.s ?? 0) - w.par }) : t(lab === 'par' ? 'parL' : lab === 'max' ? 'max' : lab);
  $('res-big').innerHTML = `${mine?.s ?? '–'}<small>${mine?.x ? t('dnf') : t('holeIn', { n: mine?.s })}</small>`;
  $('res-stars').innerHTML = '';
  $('res-rank').innerHTML = rows.map((r) => `<li class="${r.p.me ? 'me' : ''}"><i style="background:${r.p.color}"></i>${esc(r.p.name)}<em>${r.s}${r.x ? ' ✗' : ''}</em></li>`).join('');
  $('res-next').hidden = true;
  $('res-wait').textContent = room.idx >= room.holes.length - 1 ? '' : t('nextIn');
  showScreen('result');
  SFX.good();
}

function showOnlineFinal(room) {
  const players = st.players.map((p) => ({ ...p, scores: room.pl?.[p.id]?.sc || p.scores }));
  st.phase = 'final';
  const totals = players.map((p) => ({ p, tot: st.holes.reduce((a, _, i) => a + (p.scores[i] ?? MAX_STROKES), 0) })).sort((a, b) => a.tot - b.tot);
  void totals;
  showFinal(players);
  $('fin-again').hidden = false;
  $('fin-again').querySelector('b').textContent = net.isHost ? t('rematch') : t('waitRematch');
  $('fin-again').disabled = !net.isHost;
}

function onMessage(msg) {
  switch (msg.t) {
    case 'joined':
      break;
    case 'list': {
      if (!st.quick) break;
      st.quick = false;
      const open = (msg.rooms || []).filter((r) => r.state === 'lobby' && r.n < r.max).sort((a, b) => b.n - a.n);
      if (open.length) net.join(open[0].code, myName());
      else {
        toast(t('noRooms'));
        net.create(myName(), { course: 'pradera', limit: 90, public: true });
      }
      break;
    }
    case 'done':
      if (msg.id !== net?.myId && st.mode === 'online') {
        const p = st.players.find((x) => x.id === msg.id);
        if (p && msg.holed && st.world) toast(t('firstDone', { n: p.name }));
      }
      break;
    case 'reject': {
      const p = me();
      const list = st.online?.room?.pl?.[p?.id]?.s;
      if (p && list) {
        rebuild(p, list);
        toast(t('desync'));
      }
      break;
    }
    case 'closed':
      toast(netText('closed_' + msg.reason) || netText('closed_empty'));
      st.online = null;
      quitToMenu();
      break;
    case 'kicked':
      toast(netText('kicked'));
      st.online = null;
      quitToMenu();
      break;
    case 'error': {
      const key = msg.code;
      const text = netText(key) !== key ? netText(key) : t('err_' + key) !== 'err_' + key ? t('err_' + key) : key;
      $('on-status').textContent = text;
      $('on-status').classList.add('err');
      break;
    }
    default:
      break;
  }
}

// ---------------------------------------------------------------- arranque
G?.onPrefs?.(() => applyTexts());
applyTexts();
showMenuScene();
showScreen('home');
requestAnimationFrame(frame);
G?.progress?.(1);
requestAnimationFrame(() => requestAnimationFrame(() => G?.ready?.()));
addEventListener('resize', () => sc.resize());
// volver a una sala si se recargó la página
(() => {
  try {
    if (JSON.parse(sessionStorage.getItem('gameit:session:golfazo'))?.code) {
      ensureNet();
      net.resume();
    } else if (roomFromUrl()) {
      $('h-online').click();
    }
  } catch {}
})();
window.__golfazo = { st, sc, fire, loadHole, startSolo, TXT, shareLink };
