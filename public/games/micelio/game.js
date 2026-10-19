/* Micelio — game.it
 * Soltá hongos en un frasco: dos iguales que se tocan se funden en la especie siguiente (11 especies, del Botoncito al
 * Ancestral). Si la pila asoma por encima de la línea un par de segundos, se termina. Modos: clásico (récord y especies
 * descubiertas guardadas en este dispositivo), Hongos del día (la misma secuencia para todos) y Duelo online de hasta 8
 * con tiempo, donde los hongos grandes le tiran esporas a un rival. Física en shared/physics.js; dibujos en species.js.
 */
import { Jar, W, H, RADII, MAX_K, POINTS, BIG, dropper } from './shared/physics.js';
import { SPECIES, Sprites, drawMushroom } from './species.js';
import { tone, noise, notes } from '/shared/sfx.js';
import { RaceLobby } from '/shared/race-lobby.js';
import { today, dayNumber } from '/shared/daily.js';

const G = window.GameIt;
const ID = 'micelio';
const DAILY_EPOCH = '2026-10-19';
const LINE = 132; // línea de peligro (desde arriba del frasco)
const DROP_Y = 62;
const COOLDOWN = 0.42;
const OVER_AFTER = 2.2;
const FRAME = 16; // grosor del vidrio (en unidades del mundo)
const $ = (id) => document.getElementById(id);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;

const TXT = {
  title: { es: 'Micelio', en: 'Mycelium' },
  tagline: { es: 'Juntá hongos iguales y descubrí especies nuevas sin llenar el frasco', en: 'Merge matching mushrooms and discover new species without filling the jar' },
  play: { es: 'Jugar', en: 'Play' },
  best: { es: 'récord {n}', en: 'best {n}' },
  daily: { es: 'Hongos del día', en: 'Daily jar' },
  dailySub: { es: 'n.º {n}', en: '#{n}' },
  dailySubBest: { es: 'n.º {n} · mejor {b}', en: '#{n} · best {b}' },
  online: { es: 'Duelo', en: 'Duel' },
  onlineSub: { es: 'online, hasta 8', en: 'online, up to 8' },
  onlineLong: { es: 'Los mismos hongos para todos y un reloj: gana quien más sume. Los hongos grandes le tiran esporas a un rival.', en: 'Same mushrooms for everyone and a clock: highest score wins. Big mushrooms throw spores at a rival.' },
  keysDesk: { es: 'Mouse o ← → para apuntar · clic, Espacio o ↓ para soltar', en: 'Mouse or ← → to aim · click, Space or ↓ to drop' },
  keysTouch: { es: 'Arrastrá para apuntar y soltá para tirar', en: 'Drag to aim and release to drop' },
  found: { es: 'Especies descubiertas: {n} de 11', en: 'Species discovered: {n} of 11' },
  score: { es: 'puntos', en: 'score' },
  next: { es: 'sigue', en: 'next' },
  newSpecies: { es: '¡Especie nueva!', en: 'New species!' },
  over: { es: '¡Frasco lleno!', en: 'Jar full!' },
  again: { es: 'Otra vez', en: 'Again' },
  share: { es: 'Compartir resultado', en: 'Share result' },
  copied: { es: '¡Copiado! Pegalo donde quieras', en: 'Copied! Paste it anywhere' },
  menu: { es: 'Menú', en: 'Menu' },
  back: { es: '← volver', en: '← back' },
  newBest: { es: '¡Nuevo récord!', en: 'New best!' },
  bestIs: { es: 'Récord: {n}', en: 'Best: {n}' },
  dailyBestIs: { es: 'Hongos del día n.º {n} · tu mejor: {b}', en: 'Daily jar #{n} · your best: {b}' },
  sBig: { es: 'el más grande', en: 'biggest' },
  sMerges: { es: 'fusiones', en: 'merges' },
  sTime: { es: 'tiempo', en: 'time' },
  combo: { es: 'combo ×{n}', en: 'combo ×{n}' },
  yourName: { es: 'Tu nombre', en: 'Your name' },
  quick: { es: 'Partida rápida', en: 'Quick match' },
  quickSub: { es: 'entrá a una sala abierta', en: 'join an open room' },
  create: { es: 'Crear sala privada', en: 'Create private room' },
  createSub: { es: 'con código para tus amigos', en: 'with a code for your friends' },
  join: { es: 'Unirse', en: 'Join' },
  room: { es: 'Sala', en: 'Room' },
  tapToCopy: { es: 'tocá el código para copiar el link', en: 'tap the code to copy the link' },
  time: { es: 'Tiempo', en: 'Time' },
  spores: { es: 'Esporas', en: 'Spores' },
  sporesOn: { es: 'Sí', en: 'On' },
  sporesOff: { es: 'No', en: 'Off' },
  start: { es: '¡A jugar!', en: 'Start!' },
  leave: { es: '← salir de la sala', en: '← leave room' },
  you: { es: 'vos', en: 'you' },
  win: { es: '¡Ganaste!', en: 'You won!' },
  place: { es: 'Quedaste {n}°', en: 'You placed #{n}' },
  waitOthers: { es: 'Esperando a los demás…', en: 'Waiting for the others…' },
  junk: { es: '¡Esporas de {n}! ×{k}', en: 'Spores from {n}! ×{k}' },
  sent: { es: '¡Esporas para {n}!', en: 'Spores sent to {n}!' },
  go: { es: '¡YA!', en: 'GO!' },
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
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
function seedOf(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % 2147483647 || 1;
}

// ---------------------------------------------------------------- estado
const S = {
  mode: 'menu', // menu | classic | daily | duel
  phase: 'menu', // menu | countdown | play | over | done
  jar: new Jar(),
  next: null,
  held: 0,
  queued: 0,
  aim: W / 2,
  cool: 0,
  overT: 0,
  score: 0,
  merges: 0,
  biggest: 0,
  combo: 0,
  lastMerge: -9,
  t: 0,
  best: load('best', 0) | 0,
  found: new Set(load('found', [0, 1, 2, 3, 4])),
  junk: [],
  startAt: 0,
  limit: 0,
  finishSent: false,
};
const sprites = new Sprites();
const parts = [];
const texts = [];
let shake = 0;

function newGame(seed) {
  S.jar = new Jar();
  S.next = dropper(seed);
  S.held = S.next();
  S.queued = S.next();
  S.aim = W / 2;
  S.cool = 0.25;
  S.overT = 0;
  S.score = 0;
  S.merges = 0;
  S.biggest = 0;
  S.combo = 0;
  S.lastMerge = -9;
  S.t = 0;
  S.junk = [];
  S.finishSent = false;
  parts.length = 0;
  texts.length = 0;
  setScore(0, false);
  drawNext();
}

function playClassic() {
  S.mode = 'classic';
  newGame(Math.floor(Math.random() * 2 ** 31));
  begin();
}
function dailyInfo() {
  const date = today();
  const d = load('daily', null);
  return { date, n: dayNumber(DAILY_EPOCH, date), rec: d && d.date === date ? d : { date, best: 0, tries: 0 } };
}
function playDaily() {
  S.mode = 'daily';
  newGame(seedOf(`${ID}:daily:${dailyInfo().date}`));
  begin();
}
function begin() {
  S.phase = 'play';
  show(null);
  $('hud').hidden = false;
  $('timer').hidden = S.mode !== 'duel';
  $('rivals').hidden = S.mode !== 'duel';
  $('best').textContent = S.mode === 'duel' ? '' : t('best', { n: S.mode === 'daily' ? dailyInfo().rec.best : S.best });
  layout();
}

function toMenu() {
  if (S.mode === 'duel') lobby.leave();
  S.mode = 'menu';
  S.phase = 'menu';
  $('hud').hidden = true;
  demoJar();
  refreshHome();
  show('home');
}

/** Frasco del menú: unos hongos ya asentados de adorno. */
function demoJar() {
  S.jar = new Jar();
  const ks = [5, 4, 3, 6, 2, 1, 3, 0, 2, 4, 1];
  ks.forEach((k, i) => S.jar.add(k, 80 + ((i * 137) % 440), H - 200 - i * 40));
  for (let i = 0; i < 240; i++) S.jar.step(1 / 60);
  S.held = 4;
  S.queued = 1;
}

// ---------------------------------------------------------------- soltar y fusionar
function drop() {
  if (S.phase !== 'play' || S.cool > 0) return;
  const r = RADII[S.held];
  const x = clamp(S.aim, r, W - r);
  S.jar.add(S.held, x, DROP_Y, 0, 60);
  S.held = S.queued;
  S.queued = S.next();
  S.cool = COOLDOWN;
  drawNext();
  sfx('drop');
}

function handle(ev) {
  for (const e of ev) {
    if (e.t === 'merge') {
      S.merges++;
      S.combo = S.t - S.lastMerge < 0.9 ? S.combo + 1 : 1;
      S.lastMerge = S.t;
      const pts = POINTS[e.k] + (S.combo - 1) * 2;
      addScore(pts, e.x, e.y, S.combo);
      S.biggest = Math.max(S.biggest, e.k);
      burst(e.x, e.y, e.k);
      sfx('merge', e.k);
      if (e.k >= 7) shake = Math.max(shake, 0.12 + (e.k - 7) * 0.05);
      if (!S.found.has(e.k)) {
        S.found.add(e.k);
        save('found', [...S.found]);
        discover(e.k);
      }
      if (S.mode === 'duel' && e.k >= 5 && lobby.net.room?.race?.spores === 'on') lobby.net.raw({ t: 'atk', n: Math.min(6, e.k - 3) });
    } else if (e.t === 'vanish') {
      addScore(BIG, e.x, e.y, 1);
      burst(e.x, e.y, MAX_K, 60);
      shake = 0.4;
      sfx('vanish');
    } else if (e.t === 'hit') {
      if (e.v > 520) sfx('hit', e.v);
    }
  }
}

function addScore(pts, x, y, combo) {
  S.score += pts;
  setScore(S.score);
  texts.push({ x, y, txt: `+${pts}`, sub: combo > 1 ? t('combo', { n: combo }) : '', life: 0, max: 1.1 });
}

function burst(x, y, k, n = 14) {
  const sp = SPECIES[k];
  if (G.prefs.reducedMotion) n = Math.ceil(n / 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const v = 120 + Math.random() * 380;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: 0, max: 0.5 + Math.random() * 0.5, size: 3 + Math.random() * 5, color: i % 3 ? sp.cap : '#fff8ec' });
  }
  parts.push({ ring: true, x, y, r: RADII[k] * 0.6, life: 0, max: 0.45, color: sp.cap });
}

// ---------------------------------------------------------------- bucle
let last = performance.now();
let lastCount = 0;
let lastState = 0;
let beat = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.paused) dt = 0;

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
  if (dt > 0) {
    if (S.phase === 'play' || S.phase === 'over' || S.phase === 'done' || S.phase === 'menu' || S.phase === 'countdown') {
      S.t += dt;
      handle(S.jar.step(dt));
    }
    if (S.phase === 'play') {
      S.cool = Math.max(0, S.cool - dt);
      aimInput(dt);
      junkDrops(dt);
      // ¿asoma por encima de la línea?
      const over = S.jar.over(LINE).length > 0;
      S.overT = over ? S.overT + dt : Math.max(0, S.overT - dt * 2);
      if (over) {
        beat -= dt;
        if (beat <= 0) {
          beat = Math.max(0.22, 0.6 - S.overT * 0.18);
          sfx('beat');
        }
      }
      if (S.overT > OVER_AFTER) gameOver();
      if (S.mode === 'duel') {
        const left = S.startAt + S.limit - lobby.net.serverNow();
        $('timer').textContent = fmt(left);
        $('timer').classList.toggle('low', left < 15000);
        if (left <= 0) finishDuel(false);
      }
    }
    for (const p of parts) {
      p.life += dt;
      if (!p.ring) {
        p.vy += 900 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life >= parts[i].max) parts.splice(i, 1);
    for (const x of texts) x.life += dt;
    for (let i = texts.length - 1; i >= 0; i--) if (texts[i].life >= texts[i].max) texts.splice(i, 1);
    shake = Math.max(0, shake - dt);
  }
  if (S.mode === 'duel' && now - lastState > 250 && (S.phase === 'play' || S.phase === 'countdown')) {
    lastState = now;
    lobby.net.raw({ t: 'state', s: [S.score, S.biggest, Math.round(pilePct()), S.phase === 'play' ? 0 : 1] });
  }
  render(now / 1000);
}

const pilePct = () => clamp(((H - S.jar.top(0.6)) / (H - LINE)) * 100, 0, 100);

function gameOver() {
  if (S.mode === 'duel') return finishDuel(true);
  S.phase = 'over';
  sfx('over');
  shake = 0.3;
  let isBest = false;
  let daily = null;
  if (S.mode === 'classic') {
    isBest = S.score > S.best;
    if (isBest) {
      S.best = S.score;
      save('best', S.best);
    }
  } else {
    daily = dailyInfo();
    daily.rec.tries = (daily.rec.tries || 0) + 1;
    isBest = S.score > (daily.rec.best || 0);
    if (isBest) daily.rec.best = S.score;
    save('daily', daily.rec);
  }
  setTimeout(() => {
    $('over-score').textContent = S.score;
    $('over-best').textContent = daily ? t('dailyBestIs', { n: daily.n, b: daily.rec.best }) : isBest && S.score > 0 ? t('newBest') : t('bestIs', { n: S.best });
    $('over-stats').innerHTML = stat(G.t(SPECIES[S.biggest].name), t('sBig')) + stat(S.merges, t('sMerges')) + stat(fmt(S.t * 1000), t('sTime'));
    paintSprite($('over-sprite'), S.biggest, 'happy');
    $('b-share').hidden = !daily;
    $('share-status').textContent = '';
    show('over');
  }, 1100);
}
const stat = (v, label) => `<div><b>${esc(v)}</b><small>${esc(label)}</small></div>`;

// ---------------------------------------------------------------- esporas (duelo)
let junkT = 0;
function junkDrops(dt) {
  if (!S.junk.length) return;
  junkT -= dt;
  if (junkT > 0) return;
  junkT = 0.22;
  S.junk.pop();
  const x = 30 + Math.random() * (W - 60);
  S.jar.add(0, x, 24, (Math.random() - 0.5) * 120, 140);
  sfx('spore');
}

// ---------------------------------------------------------------- dibujo
const cv = $('c');
const g = cv.getContext('2d');
let dpr = 1, vw = 0, vh = 0, sc = 1, jx = 0, jy = 0, portrait = true;
let bg = null;
const flies = Array.from({ length: 26 }, () => ({ x: Math.random(), y: Math.random(), p: Math.random() * TAU, s: 0.5 + Math.random() }));

function layout() {
  dpr = Math.min(devicePixelRatio || 1, 2);
  vw = innerWidth;
  vh = innerHeight;
  cv.width = Math.round(vw * dpr);
  cv.height = Math.round(vh * dpr);
  portrait = vw / vh < 0.95;
  const top = 64;
  let availW, availH, y0;
  if (portrait) {
    const hudRow = 78;
    const bottom = S.mode === 'duel' ? 70 : 64;
    availW = vw - 24;
    availH = vh - top - hudRow - bottom;
    sc = Math.min(availW / (W + FRAME * 2), availH / (H + FRAME));
    y0 = top + hudRow + Math.max(0, (availH - (H + FRAME) * sc) / 2);
  } else {
    availW = vw - 2 * 200;
    availH = vh - top - 22;
    sc = Math.min(availW / (W + FRAME * 2), availH / (H + FRAME));
    y0 = top + Math.max(0, (availH - (H + FRAME) * sc) / 2) + 6;
  }
  sc = Math.max(0.2, sc);
  jx = (vw - W * sc) / 2;
  jy = y0;
  sprites.clear();
  bg = null;
  placeHud();
}

function placeHud() {
  const sb = $('score-box').style, nb = $('next-box').style, tb = $('timer').style, cb = $('chart-box').style, rv = $('rivals').style;
  const jw = W * sc, jh = H * sc;
  for (const s of [sb, nb, tb, cb, rv]) {
    s.left = s.right = s.top = s.bottom = s.transform = '';
  }
  const chart = $('chart');
  if (portrait) {
    const rowTop = 64;
    sb.left = `${jx - FRAME * sc}px`;
    sb.top = `${rowTop}px`;
    nb.left = `${jx + jw + FRAME * sc}px`;
    nb.transform = 'translateX(-100%)';
    nb.top = `${rowTop}px`;
    tb.left = '50%';
    tb.transform = 'translateX(-50%)';
    tb.top = `${rowTop + 8}px`;
    const cw = Math.min(vw - 20, jw + FRAME * 2 * sc);
    sizeChart(chart, cw - 16, 'row');
    cb.left = '50%';
    cb.transform = 'translateX(-50%)';
    cb.top = `${jy + jh + FRAME * sc + 8}px`;
    rv.left = '50%';
    rv.transform = 'translateX(-50%)';
    rv.top = `${jy + jh + FRAME * sc + 8}px`;
    rv.width = `${cw}px`;
    rv.gridTemplateColumns = 'repeat(auto-fill, minmax(110px, 1fr))';
    $('chart-box').hidden = S.mode === 'duel';
  } else {
    const side = jx - FRAME * sc - 24;
    const off = S.mode === 'duel' ? 64 : 0;
    sb.left = `${side}px`;
    sb.transform = 'translateX(-100%)';
    sb.top = `${jy + 40 + off}px`;
    nb.left = `${side}px`;
    nb.transform = 'translateX(-100%)';
    nb.top = `${jy + 160 + off}px`;
    tb.left = `${side}px`;
    tb.transform = 'translateX(-100%)';
    tb.top = `${jy + 40}px`;
    sizeChart(chart, 150, 'grid');
    const right = jx + W * sc + FRAME * sc + 24;
    cb.left = `${right}px`;
    cb.top = `${jy + 40}px`;
    rv.left = `${right}px`;
    rv.top = `${jy + 40 + (S.mode === 'duel' ? 0 : 330)}px`;
    rv.width = '190px';
    rv.gridTemplateColumns = '1fr';
    $('chart-box').hidden = false;
    if (S.mode === 'duel') cb.top = `${jy + 40 + 54 * Math.min(8, lobbyCount()) + 10}px`;
  }
  drawChart();
}
const lobbyCount = () => Math.max(1, others.size);

let chartMode = 'row';
function sizeChart(c, w, mode) {
  chartMode = mode;
  const h = mode === 'row' ? 40 : 6 * 46 + 4;
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
}

/** Catálogo de especies: descubiertas en color, las demás como sombra con "?". La más grande de la partida, marcada. */
function drawChart() {
  const c = $('chart');
  const cg = c.getContext('2d');
  cg.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = c.width / dpr, h = c.height / dpr;
  cg.clearRect(0, 0, w, h);
  for (let k = 0; k <= MAX_K; k++) {
    let x, y, R;
    if (chartMode === 'row') {
      const cell = w / 11;
      R = Math.min(cell / 2 - 1, (6 + k * 1.2)) * 1;
      x = cell * (k + 0.5);
      y = h / 2;
    } else {
      const col = k % 2, row = Math.floor(k / 2);
      R = 12 + k * 0.9;
      x = 38 + col * 74;
      y = 24 + row * 46;
    }
    const found = S.found.has(k);
    if (k === S.biggest && S.mode !== 'menu') {
      cg.fillStyle = 'rgba(255,190,59,.35)';
      cg.beginPath();
      cg.arc(x, y, R + 4, 0, TAU);
      cg.fill();
    }
    const spr = sprites.get(k, (R / RADII[k]) * dpr);
    const s = spr.width / dpr;
    cg.save();
    if (!found) cg.filter = 'brightness(0) opacity(.35)';
    cg.drawImage(spr, x - s / 2, y - s / 2, s, s);
    cg.restore();
    if (!found) {
      cg.fillStyle = '#8a7562';
      cg.font = `800 ${Math.round(R)}px "Baloo 2", sans-serif`;
      cg.textAlign = 'center';
      cg.textBaseline = 'middle';
      cg.fillText('?', x, y + 1);
    }
  }
}

function paintSprite(c, k, face) {
  const cg = c.getContext('2d');
  cg.clearRect(0, 0, c.width, c.height);
  cg.save();
  cg.translate(c.width / 2, c.height / 2 + 2);
  drawMushroom(cg, k, c.width * 0.42, face);
  cg.restore();
}

function drawNext() {
  const c = $('next');
  const cg = c.getContext('2d');
  cg.clearRect(0, 0, 96, 96);
  cg.save();
  cg.translate(48, 50);
  drawMushroom(cg, S.queued, 18 + S.queued * 5, 'happy');
  cg.restore();
}

/** Fondo del bosque (se dibuja una vez por tamaño). */
function paintBg() {
  bg = document.createElement('canvas');
  bg.width = cv.width;
  bg.height = cv.height;
  const b = bg.getContext('2d');
  b.scale(dpr, dpr);
  const dark = G.prefs.theme === 'dark';
  const grd = b.createLinearGradient(0, 0, 0, vh);
  grd.addColorStop(0, dark ? '#183a28' : '#8fd18a');
  grd.addColorStop(0.6, dark ? '#10281c' : '#5fae6a');
  grd.addColorStop(1, dark ? '#0b1d14' : '#3f8a4f');
  b.fillStyle = grd;
  b.fillRect(0, 0, vw, vh);
  // luz que entra entre los árboles
  b.globalAlpha = dark ? 0.08 : 0.16;
  b.fillStyle = '#fff6c8';
  for (let i = 0; i < 4; i++) {
    b.beginPath();
    const x = vw * (0.1 + i * 0.27);
    b.moveTo(x, 0);
    b.lineTo(x + 70, 0);
    b.lineTo(x + 260, vh);
    b.lineTo(x + 120, vh);
    b.fill();
  }
  b.globalAlpha = 1;
  // hongos gigantes y helechos de fondo (siluetas)
  const sil = dark ? 'rgba(4,14,9,.55)' : 'rgba(30,80,45,.35)';
  b.fillStyle = sil;
  const big = (x, y, r) => {
    b.beginPath();
    b.ellipse(x, y - r * 0.45, r, r * 0.55, 0, Math.PI, TAU);
    b.fill();
    b.fillRect(x - r * 0.16, y - r * 0.5, r * 0.32, r * 0.5 + 400);
  };
  big(vw * 0.08, vh * 0.86, Math.min(160, vw * 0.22));
  big(vw * 0.93, vh * 0.8, Math.min(120, vw * 0.18));
  big(vw * 0.82, vh * 0.98, Math.min(90, vw * 0.14));
  for (let i = 0; i < 9; i++) {
    const x = (i / 8) * vw;
    b.beginPath();
    b.moveTo(x - 40, vh);
    b.quadraticCurveTo(x, vh - 90 - (i % 3) * 30, x + 40, vh);
    b.fill();
  }
}

function render(time) {
  const ctx = g;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!bg) paintBg();
  ctx.drawImage(bg, 0, 0, vw, vh);
  // luciérnagas
  for (const f of flies) {
    const x = (f.x * vw + Math.sin(time * 0.3 * f.s + f.p) * 30 + vw) % vw;
    const y = (f.y * vh + Math.cos(time * 0.23 * f.s + f.p) * 24 + vh) % vh;
    const a = 0.35 + 0.35 * Math.sin(time * 2 * f.s + f.p);
    ctx.fillStyle = `rgba(255,240,150,${a * 0.25})`;
    ctx.beginPath();
    ctx.arc(x, y, 6 * f.s, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(255,250,200,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, 1.6 * f.s, 0, TAU);
    ctx.fill();
  }
  let ox = 0, oy = 0;
  if (shake > 0 && !G.prefs.reducedMotion) {
    ox = (Math.random() - 0.5) * shake * 30;
    oy = (Math.random() - 0.5) * shake * 30;
  }
  ctx.save();
  ctx.translate(jx + ox, jy + oy);
  ctx.scale(sc, sc);
  drawJarBack(ctx, time);
  drawLine(ctx, time);
  // guía de caída y hongo en la mano
  if (S.phase === 'play' || S.phase === 'countdown') {
    const r = RADII[S.held];
    const x = clamp(S.aim, r, W - r);
    let land = H;
    for (const b of S.jar.bodies) if (Math.abs(b.x - x) < b.r + r * 0.4) land = Math.min(land, b.y - b.r);
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 3;
    ctx.setLineDash([2, 12]);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, DROP_Y + r);
    ctx.lineTo(x, land);
    ctx.stroke();
    ctx.setLineDash([]);
    const ready = S.cool <= 0;
    const bob = Math.sin(time * 4) * 3;
    ctx.globalAlpha = ready ? 1 : 0.45 + 0.55 * (1 - S.cool / COOLDOWN);
    sprite(ctx, S.held, x, DROP_Y + bob, Math.sin(time * 1.6) * 0.08, 1, 'happy');
    ctx.globalAlpha = 1;
  }
  // hongos
  const sleepy = S.phase === 'over' || S.phase === 'done';
  for (const b of S.jar.bodies) {
    const fast = b.vx * b.vx + b.vy * b.vy > 500 * 500;
    const fresh = S.jar.t - b.born < 0.35 && b.grow < 1;
    sprite(ctx, b.k, b.x, b.y, b.a, b.grow, sleepy ? 'sleep' : fast || fresh ? 'wow' : 'happy');
  }
  // partículas
  for (const p of parts) {
    const k = p.life / p.max;
    if (p.ring) {
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (1 + k * 1.4), 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
      continue;
    }
    ctx.fillStyle = p.color;
    ctx.globalAlpha = 1 - k * k;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  drawJarFront(ctx);
  // puntos que suben
  ctx.textAlign = 'center';
  for (const x of texts) {
    const k = x.life / x.max;
    const y = x.y - 30 - k * 70;
    ctx.globalAlpha = k < 0.75 ? 1 : (1 - k) / 0.25;
    ctx.font = '800 38px "Baloo 2", sans-serif';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(59,42,31,.85)';
    ctx.strokeText(x.txt, x.x, y);
    ctx.fillStyle = '#fff8ec';
    ctx.fillText(x.txt, x.x, y);
    if (x.sub) {
      ctx.font = '800 24px "Baloo 2", sans-serif';
      ctx.lineWidth = 5;
      ctx.strokeText(x.sub, x.x, y + 28);
      ctx.fillStyle = '#ffbe3b';
      ctx.fillText(x.sub, x.x, y + 28);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function sprite(ctx, k, x, y, a, grow, face) {
  const spr = sprites.get(k, sc * dpr, face);
  const s = (spr.width / (sc * dpr)) * grow;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.drawImage(spr, -s / 2, -s / 2, s, s);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawJarBack(ctx) {
  // vidrio de atrás
  roundRect(ctx, -FRAME / 2, -6, W + FRAME, H + FRAME / 2 + 6, 26);
  const gb = ctx.createLinearGradient(0, 0, W, 0);
  gb.addColorStop(0, 'rgba(255,255,255,.16)');
  gb.addColorStop(0.5, 'rgba(255,255,255,.07)');
  gb.addColorStop(1, 'rgba(255,255,255,.13)');
  ctx.fillStyle = gb;
  ctx.fill();
  // musgo y tierra del fondo
  ctx.save();
  roundRect(ctx, 0, 0, W, H + 2, 22);
  ctx.clip();
  ctx.fillStyle = '#6b4a2f';
  ctx.fillRect(0, H - 14, W, 30);
  ctx.fillStyle = '#5fb04f';
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 30) ctx.quadraticCurveTo(x + 15, H - 22 - ((x / 30) % 3) * 4, x + 30, H - 8);
  ctx.lineTo(W, H + 4);
  ctx.lineTo(0, H + 4);
  ctx.fill();
  ctx.fillStyle = '#7fcf62';
  for (let x = 12; x < W; x += 44) {
    ctx.beginPath();
    ctx.ellipse(x, H - 12, 12, 5, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawLine(ctx, time) {
  const warn = S.phase === 'play' && S.overT > 0;
  const k = warn ? 0.5 + 0.5 * Math.sin(time * 14) : 0;
  ctx.strokeStyle = warn ? `rgba(255,${90 - k * 60},${80 - k * 60},${0.6 + k * 0.4})` : 'rgba(255,255,255,.4)';
  ctx.lineWidth = warn ? 5 : 3;
  ctx.setLineDash([16, 12]);
  ctx.beginPath();
  ctx.moveTo(8, LINE);
  ctx.lineTo(W - 8, LINE);
  ctx.stroke();
  ctx.setLineDash([]);
  if (warn) {
    ctx.fillStyle = `rgba(255,60,60,${0.1 + k * 0.12})`;
    ctx.fillRect(0, 0, W, LINE);
  }
}

function drawJarFront(ctx) {
  // marco de vidrio
  roundRect(ctx, -FRAME / 2, -6, W + FRAME, H + FRAME / 2 + 6, 26);
  ctx.lineWidth = FRAME;
  ctx.strokeStyle = 'rgba(220,245,255,.38)';
  ctx.stroke();
  roundRect(ctx, 0, 0, W, H + 2, 20);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,.5)';
  ctx.stroke();
  // brillos
  ctx.fillStyle = 'rgba(255,255,255,.13)';
  roundRect(ctx, 18, 40, 16, H - 120, 8);
  ctx.fill();
  roundRect(ctx, 42, 70, 6, H * 0.35, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  roundRect(ctx, W - 34, 90, 12, H * 0.45, 6);
  ctx.fill();
  // labio de arriba
  ctx.fillStyle = 'rgba(230,248,255,.55)';
  roundRect(ctx, -FRAME, -14, FRAME * 1.6, 16, 6);
  ctx.fill();
  roundRect(ctx, W - FRAME * 0.6, -14, FRAME * 1.6, 16, 6);
  ctx.fill();
}

// ---------------------------------------------------------------- HUD
function setScore(n, bump = true) {
  const el = $('score');
  el.textContent = String(n);
  if (!bump) return;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
  drawChart();
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
function discover(k) {
  paintSprite($('banner-c'), k, 'wow');
  $('banner-name').textContent = G.t(SPECIES[k].name);
  const el = $('banner');
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  sfx('discover');
  drawChart();
}

// ---------------------------------------------------------------- pantallas
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  G.gameplay(!id && S.mode !== 'menu' && S.phase === 'play');
  const first = id && $(`s-${id}`).querySelector('.btn:not([hidden]):not(:disabled), .field');
  if (first && !G.prefs.touch) setTimeout(() => first.focus({ preventScroll: true }), 60);
}

function refreshHome() {
  $('b-play-sub').textContent = S.best ? t('best', { n: S.best }) : '';
  const { n, rec } = dailyInfo();
  $('b-daily-sub').textContent = rec.best ? t('dailySubBest', { n, b: rec.best }) : t('dailySub', { n });
  $('keys').textContent = G.prefs.touch ? t('keysTouch') : t('keysDesk');
  $('found').textContent = t('found', { n: S.found.size });
  const logo = $('logo');
  const lg = logo.getContext('2d');
  lg.clearRect(0, 0, 160, 110);
  for (const [k, x, y, r, a] of [[4, 52, 64, 38, -0.15], [8, 112, 58, 42, 0.12], [1, 82, 88, 20, 0]]) {
    lg.save();
    lg.translate(x, y);
    lg.rotate(a);
    drawMushroom(lg, k, r, 'happy');
    lg.restore();
  }
}

$('b-play').onclick = () => playClassic();
$('b-daily').onclick = () => playDaily();
$('b-online').onclick = () => lobby.open();
$('b-again').onclick = () => G.commercialBreak('otra-vez').then(() => (S.mode === 'daily' ? playDaily() : playClassic()));
$('b-share').onclick = async () => {
  const { n } = dailyInfo();
  const txt = `${t('title')} · ${t('daily')} n.º ${n}\n🍄 ${S.score} · ${G.t(SPECIES[S.biggest].name)}\n${location.origin}/#play/${ID}`;
  try {
    if (navigator.share && G.prefs.touch) await navigator.share({ text: txt });
    else {
      await navigator.clipboard.writeText(txt);
      $('share-status').textContent = t('copied');
    }
  } catch {}
};
$('res-leave').onclick = () => toMenu();
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go?.dataset.go === 'home') toMenu();
});

// ---------------------------------------------------------------- entrada
const keys = new Set();
const toWorldX = (cx) => (cx - jx) / sc;
addEventListener('keydown', (e) => {
  const on = document.querySelector('.screen.on');
  if (on) {
    if (document.activeElement?.tagName === 'INPUT') return;
    if ((e.code === 'Space' || e.key === 'Enter') && !e.repeat && document.activeElement === document.body) {
      if (on.id === 's-home') {
        e.preventDefault();
        playClassic();
      } else if (on.id === 's-over') {
        e.preventDefault();
        $('b-again').click();
      }
    }
    return;
  }
  const d = G.dir(e);
  if (d === 'left' || d === 'right') {
    keys.add(d);
    e.preventDefault();
  } else if ((e.code === 'Space' || e.key === 'Enter' || d === 'down') && !e.repeat) {
    e.preventDefault();
    drop();
  }
});
addEventListener('keyup', (e) => {
  const d = G.dir(e);
  if (d) keys.delete(d);
});
addEventListener('blur', () => keys.clear());
function aimInput(dt) {
  const dir = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
  if (dir) S.aim = clamp(S.aim + dir * 560 * dt, 0, W);
  for (const p of navigator.getGamepads?.() || []) {
    if (!p) continue;
    let x = p.axes[0] || 0;
    if (Math.abs(x) < 0.2) x = 0;
    if (p.buttons[14]?.pressed) x = -1;
    if (p.buttons[15]?.pressed) x = 1;
    if (x) S.aim = clamp(S.aim + x * 620 * dt, 0, W);
    const a = !!(p.buttons[0]?.pressed || p.buttons[13]?.pressed);
    if (a && !padDown) drop();
    padDown = a;
  }
}
let padDown = false;
let pointer = null;
addEventListener('pointerdown', (e) => {
  if (e.target !== cv || S.phase !== 'play') return;
  pointer = e.pointerId;
  S.aim = clamp(toWorldX(e.clientX), 0, W);
});
addEventListener('pointermove', (e) => {
  if (S.phase !== 'play') return;
  if (e.pointerType === 'mouse' || pointer === e.pointerId) S.aim = clamp(toWorldX(e.clientX), 0, W);
});
addEventListener('pointerup', (e) => {
  if (pointer !== e.pointerId) return;
  pointer = null;
  S.aim = clamp(toWorldX(e.clientX), 0, W);
  drop();
});
addEventListener('pointercancel', () => (pointer = null));

// ---------------------------------------------------------------- duelo online
const others = new Map(); // id → { name, color, score, biggest, pile, out, done }

const lobby = new RaceLobby({
  game: ID,
  settings: ['time', 'spores'],
  defaults: { time: '3', spores: 'on' },
  show: (id) => {
    S.mode = 'duel';
    S.phase = 'menu';
    show(id);
  },
  onRace: beginDuel,
  onLobby: () => {
    $('hud').hidden = true;
    S.phase = 'menu';
  },
  onMessage: onNet,
  onRoom: (room) => room.state === 'finished' && document.querySelector('#s-results.on') && showResults(),
  onClosed: () => {
    toMenu();
    show('online');
  },
});

function beginDuel(room) {
  S.mode = 'duel';
  newGame(room.race.seed);
  S.startAt = room.race.startAt;
  S.limit = room.race.limit;
  S.results = null;
  S.phase = 'countdown';
  lastCount = 0;
  others.clear();
  for (const p of room.players) if (p.id !== lobby.net.myId) others.set(p.id, { name: p.name, color: p.color, score: 0, biggest: 0, pile: 0, out: false, done: false });
  begin();
  S.phase = 'countdown';
  G.gameplay(false);
  $('timer').textContent = fmt(S.limit);
  renderRivals();
}

function finishDuel(out) {
  if (S.finishSent) return;
  S.finishSent = true;
  S.phase = 'done';
  if (out) {
    sfx('over');
    shake = 0.3;
  } else sfx('goal');
  lobby.net.send({ t: 'finish', score: S.score, biggest: S.biggest });
  setTimeout(showResults, 900);
}

function onNet(m) {
  if (m.t === 'state') {
    const o = others.get(m.id);
    if (!o) return;
    [o.score, o.biggest, o.pile] = m.s;
    o.out = !!m.s[3];
    return;
  }
  if (m.t === 'finished') {
    const o = others.get(m.id);
    if (o) {
      o.done = true;
      o.score = m.score;
      o.biggest = m.biggest;
    }
    if (document.querySelector('#s-results.on')) showResults();
    return;
  }
  if (m.t === 'junk') {
    if (S.phase !== 'play') return;
    for (let i = 0; i < m.n; i++) S.junk.push(1);
    toast(t('junk', { n: m.name, k: m.n }));
    sfx('incoming');
    return;
  }
  if (m.t === 'atk') {
    if (m.from === lobby.net.myId) {
      const o = others.get(m.to);
      if (o) toast(t('sent', { n: o.name }));
    }
    return;
  }
  if (m.t === 'end') {
    S.results = m.results;
    if (S.mode === 'duel') {
      if (S.phase === 'play' || S.phase === 'countdown') S.phase = 'done';
      showResults();
    }
  }
}

function renderRivals() {
  if (S.mode !== 'duel') return;
  const list = [...others.values()].sort((a, b) => b.score - a.score);
  $('rivals').innerHTML = list
    .map((o) => `<div class="${o.out || o.done ? 'out' : ''}"><i style="background:${o.color}"></i><span>${esc(o.name)}</span><b>${o.score}</b><em><u class="${o.pile > 80 ? 'hot' : ''}" style="transform:scaleX(${(o.pile || 0) / 100})"></u></em></div>`)
    .join('');
}
setInterval(renderRivals, 300);

function showResults() {
  const final = S.results;
  const me = lobby.net.myId;
  let rows;
  if (final) rows = final.map((r) => ({ id: r.id, name: r.name, color: r.color, score: r.score || 0, biggest: r.biggest || 0 }));
  else {
    rows = [{ id: me, name: lobby.name, color: '#fff', score: S.score, biggest: S.biggest }, ...[...others.entries()].map(([id, o]) => ({ id, ...o, playing: !o.done && !o.out }))];
    rows.sort((a, b) => b.score - a.score);
  }
  const place = rows.findIndex((r) => r.id === me) + 1;
  $('res-title').textContent = !final ? t('waitOthers') : place === 1 ? t('win') : t('place', { n: place });
  $('res-rank').innerHTML = rows
    .map((r, i) => `<li class="${r.id === me ? 'me' : ''}"><span>${i + 1}.</span><i style="background:${r.color}"></i><canvas width="52" height="52" data-k="${r.biggest}"></canvas><span>${esc(r.name)}${r.id === me ? ` (${t('you')})` : ''}</span><b>${r.score}${r.playing ? '…' : ''}</b></li>`)
    .join('');
  $$('#res-rank canvas').forEach((c) => paintSprite(c, +c.dataset.k, 'happy'));
  const a = lobby.againState(!!final);
  $('res-again').disabled = !a.enabled;
  $('res-again').querySelector('span').textContent = a.text;
  if (final && place === 1 && !S.cheered) {
    S.cheered = true;
    sfx('goal');
  }
  show('results');
}

// ---------------------------------------------------------------- sonido
let lastHit = 0;
function sfx(k, n = 0) {
  if (k === 'drop') {
    tone(330, 200, 0.09, { type: 'sine', vol: 0.16 });
  } else if (k === 'merge') {
    const f = 300 * 2 ** (n / 4.5);
    tone(f, f * 1.6, 0.14, { type: 'triangle', vol: 0.16 });
    noise(0.07, { freq: 2400, q: 1.5, vol: 0.08 });
    if (n >= 6) notes([f, f * 1.25, f * 1.5], { step: 0.05, dur: 0.18, vol: 0.08 });
  } else if (k === 'vanish') notes([523, 659, 784, 1047, 1319, 1568], { step: 0.07, dur: 0.3, vol: 0.12 });
  else if (k === 'hit') {
    const now = performance.now();
    if (now - lastHit < 70) return;
    lastHit = now;
    noise(0.05, { freq: 500, q: 1, vol: Math.min(0.12, n / 9000) });
  } else if (k === 'discover') notes([784, 988, 1175, 1568], { step: 0.09, dur: 0.22, vol: 0.12 });
  else if (k === 'beat') tone(110, 70, 0.12, { type: 'sine', vol: 0.3 });
  else if (k === 'over') notes([523, 440, 349, 262], { step: 0.14, dur: 0.3, type: 'sine', vol: 0.13 });
  else if (k === 'goal') notes([523, 659, 784, 1047], { step: 0.08, dur: 0.22, vol: 0.12 });
  else if (k === 'spore') tone(900, 1300, 0.05, { type: 'sine', vol: 0.06 });
  else if (k === 'incoming') noise(0.5, { freq: 400, sweep: 2400, q: 0.6, vol: 0.18 });
  else if (k === 'tick') tone(660, 660, 0.09, { type: 'square', vol: 0.06 });
  else if (k === 'go') tone(990, 990, 0.24, { type: 'square', vol: 0.08 });
}

// ---------------------------------------------------------------- arranque
G.onPrefs((p) => {
  document.documentElement.lang = p.lang;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  refreshHome();
  bg = null;
  drawChart();
}, true);
addEventListener('resize', layout);
demoJar();
layout();
refreshHome();
requestAnimationFrame(frame);
if (lobby.pending) {
  S.mode = 'duel';
  show('online');
} else show('home');
if (/[?&]debug\b/.test(location.search)) window.__micelio = { S, layout, handle };
G.ready();
