/* Solcito — game.it
 * Rompecabezas de empujar cajas con gatos: hay que llevar las cajas de cartón a los rayitos de sol para que los gatos
 * se puedan echar la siesta. Cinco cuartos: la cocina (empujar), el patio helado (todo resbala), el cuarto de juegos
 * (túneles de tela), la mudanza (dos gatos y cajas grandes que se empujan entre los dos) y los desafíos. Deshacer sin
 * límite, reiniciar y la menor cantidad de movidas de cada nivel para compararse (calculada con el resolvedor).
 * Reglas en shared/rules.js; niveles en shared/levels.js; dibujos en art.js.
 */
import { Puzzle, DIRS } from './shared/rules.js';
import { ROOMS, LEVELS, ALL } from './shared/levels.js';
import { CATS, THEMES, OUT, floorTile, wallTop, wallFront, sunSpot, iceTile, tunnelMouth, box, cat, sleepingCat, roomIcon } from './art.js';
import { tone, noise, notes } from '/shared/sfx.js';

const G = window.GameIt;
const ID = 'solcito';
const $ = (id) => document.getElementById(id);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const TAU = Math.PI * 2;
const TOP = 56;

const TXT = {
  title: { es: 'Solcito', en: 'Sunny Spot' },
  tagline: { es: 'Empujá las cajas al sol para que los gatos se echen la siesta', en: 'Push the boxes into the sun so the cats can nap' },
  play: { es: 'Jugar', en: 'Play' },
  playNext: { es: 'sigue: {n}', en: 'next: {n}' },
  levels: { es: 'Niveles', en: 'Levels' },
  starsN: { es: '{n} de {m} estrellas', en: '{n} of {m} stars' },
  keysDesk: { es: 'Flechas: mover · Tab: cambiar de gato · Z: deshacer · R: reiniciar', en: 'Arrows: move · Tab: switch cat · Z: undo · R: restart' },
  keysTouch: { es: 'Deslizá para mover · tocá un gato para elegirlo', en: 'Swipe to move · tap a cat to pick it' },
  back: { es: '← volver', en: '← back' },
  locked: { es: 'Resolvé 3 niveles de {r} para abrir', en: 'Solve 3 levels of {r} to unlock' },
  lockedAll: { es: 'Resolvé todos los demás para abrir', en: 'Solve all the others to unlock' },
  moves: { es: '{n} movidas', en: '{n} moves' },
  movesBest: { es: 'mínimo {p} · tu mejor {b}', en: 'fewest {p} · your best {b}' },
  movesPar: { es: 'mínimo {p}', en: 'fewest {p}' },
  win: { es: '¡A la siesta!', en: 'Nap time!' },
  winPerfect: { es: '¡Siesta perfecta!', en: 'Perfect nap!' },
  winMoves: { es: 'Lo resolviste en {n} movidas. Se puede en {p}.', en: 'You solved it in {n} moves. It can be done in {p}.' },
  winMovesPar: { es: 'Lo resolviste en {n} movidas: ¡el mínimo posible!', en: 'You solved it in {n} moves: the fewest possible!' },
  next: { es: 'Siguiente', en: 'Next' },
  again: { es: 'Otra vez', en: 'Again' },
  toLevels: { es: 'Niveles', en: 'Levels' },
  allDone: { es: '¡Terminaste todos los niveles!', en: 'You finished every level!' },
  gotIt: { es: '¡Entendido!', en: 'Got it!' },
  newRoom: { es: 'Cuarto nuevo', en: 'New room' },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'Seguir', en: 'Resume' },
  restart: { es: 'Reiniciar', en: 'Restart' },
  undo: { es: 'Deshacer', en: 'Undo' },
  swap: { es: 'Cambiar de gato', en: 'Switch cat' },
  tut1: { es: 'Movete con las flechas o deslizando. Empujá la caja hasta el solcito.', en: 'Move with the arrows or by swiping. Push the box into the sunny spot.' },
  tut1t: { es: 'Deslizá el dedo para moverte. Empujá la caja hasta el solcito.', en: 'Swipe to move. Push the box into the sunny spot.' },
  tut2: { es: 'Las cajas no se pueden tirar, solo empujar. Si te trabás: Z deshace, R reinicia.', en: 'Boxes can only be pushed, never pulled. Stuck? Z undoes, R restarts.' },
  tut2t: { es: 'Las cajas no se pueden tirar, solo empujar. Si te trabás, usá ↶ para deshacer.', en: 'Boxes can only be pushed, never pulled. Stuck? Use ↶ to undo.' },
  needTwo: { es: '¡Pesa mucho! Hacen falta los dos gatos', en: 'Too heavy! It takes both cats' },
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
const P = { best: load('best', {}), tips: load('tips', []), tut: load('tut', false) };

const starsFor = (lv, moves) => (moves == null ? 0 : moves <= lv.par ? 3 : moves <= lv.par + Math.max(3, Math.ceil(lv.par * 0.25)) ? 2 : 1);
const solvedIn = (room) => LEVELS[room].filter((_, i) => P.best[`${room}-${i + 1}`] != null).length;
function roomOpen(i) {
  if (i === 0) return true;
  const r = ROOMS[i];
  if (r.id === 'desafios') return ROOMS.slice(0, -1).every((x) => solvedIn(x.id) === LEVELS[x.id].length);
  return solvedIn(ROOMS[i - 1].id) >= 3;
}
const levelOpen = (lv) => roomOpen(ROOMS.findIndex((r) => r.id === lv.room)) && (lv.i === 0 || P.best[`${lv.room}-${lv.i}`] != null || P.best[lv.key] != null);

// ---------------------------------------------------------------- estado
const cv = $('c');
const g = cv.getContext('2d');
const S = {
  screen: 'home',
  lv: null,
  pz: null,
  sel: 0,
  vis: null,
  wonT: -1,
  time: 0,
  hint: '',
  hintT: 0,
};
const parts = [];
let shake = 0;
let L = { T: 60, ox: 0, oy: 0 }; // escala y origen del tablero

// ---------------------------------------------------------------- empezar un nivel
function startLevel(lv) {
  S.lv = lv;
  S.pz = new Puzzle(lv);
  S.sel = 0;
  S.wonT = -1;
  parts.length = 0;
  makeVis();
  layout();
  show(null);
  S.screen = 'play';
  $('hud').hidden = false;
  $('b-swap').hidden = S.pz.s.cats.length < 2;
  const room = ROOMS.find((r) => r.id === lv.room);
  $('h-room').textContent = `${G.t(room.name)} · ${lv.i + 1}`;
  $('h-name').textContent = G.t(lv.name);
  updateMoves();
  G.gameplay(true);
  // tutorial y explicación de cada cuarto la primera vez
  if (lv.key === 'cocina-1' && !P.tut) hint(G.prefs.touch ? t('tut1t') : t('tut1'), 999);
  else if (lv.key === 'cocina-2' && !P.tut2) {
    P.tut2 = true;
    hint(G.prefs.touch ? t('tut2t') : t('tut2'), 7);
  } else hint('', 0);
  if (room.tip && !P.tips.includes(room.id)) {
    P.tips.push(room.id);
    save('tips', P.tips);
    showTip(room);
  }
}

function makeVis() {
  const s = S.pz.s, w = S.pz.w;
  const xy = (i) => [i % w, (i / w) | 0];
  S.vis = {
    cats: s.cats.map((c, i) => ({ ...pos(xy(c)), face: i ? 'L' : 'R', q: [], hop: 0, squash: 0, expr: 'normal', exprT: 0, blink: 2 + Math.random() * 3, tail: Math.random() * 6, slide: 0 })),
    boxes: s.boxes.map((b) => ({ ...pos(xy(b)), q: [], squash: 0, warm: S.pz.m.target[b] ? 1 : 0, scale: 1 })),
    bigs: s.bigs.map((b) => ({ ...pos(xy(b)), q: [], squash: 0, warm: 0, scale: 1 })),
  };
}
const pos = ([x, y]) => ({ x, y });

/** Lleva los dibujos a las posiciones del estado (después de deshacer o reiniciar). */
function snapVis() {
  const s = S.pz.s, w = S.pz.w;
  s.cats.forEach((c, i) => Object.assign(S.vis.cats[i], { x: c % w, y: (c / w) | 0, q: [], hop: 0, slide: 0, scale: 1 }));
  s.boxes.forEach((b, i) => Object.assign(S.vis.boxes[i], { x: b % w, y: (b / w) | 0, q: [], scale: 1 }));
  s.bigs.forEach((b, i) => Object.assign(S.vis.bigs[i], { x: b % w, y: (b / w) | 0, q: [], scale: 1 }));
}
const busy = () => S.vis && [...S.vis.cats, ...S.vis.boxes, ...S.vis.bigs].some((v) => v.q.length);
function finishAnims() {
  if (!busy()) return;
  for (const v of [...S.vis.cats, ...S.vis.boxes, ...S.vis.bigs]) {
    const last = v.q[v.q.length - 1];
    if (last) {
      v.x = last.to[0];
      v.y = last.to[1];
    }
    v.q = [];
    v.scale = 1;
    v.slide = 0;
  }
}

// ---------------------------------------------------------------- mover
function tryMove(d) {
  if (S.screen !== 'play' || S.wonT >= 0) return;
  finishAnims();
  const pz = S.pz;
  const r = pz.move(S.sel, d);
  const vc = S.vis.cats[S.sel];
  if (d === 'L' || d === 'R') vc.face = d;
  else vc.face = d;
  if (!r.ok) {
    // chocar: el gato se sacude
    vc.q = [];
    vc.squash = -0.5;
    if (r.needTwo) {
      say(vc, 'wow');
      hint(t('needTwo'), 2.2);
      sfx('heavy');
    } else {
      say(vc, 'strain', 0.35);
      sfx('bump');
    }
    shake = 0.06;
    return;
  }
  const w = pz.w;
  const xy = (i) => [i % w, (i / w) | 0];
  for (const m of r.moved) {
    const v = m.t === 'cat' ? S.vis.cats[m.id] : m.t === 'box' ? S.vis.boxes[m.id] : S.vis.bigs[m.id];
    let prev = xy(m.from);
    m.path.forEach((p, k) => {
      const to = xy(p.to);
      const onIce = k > 0 || pz.m.ice[p.to];
      if (p.via >= 0) {
        // por el túnel: entra achicándose y sale por la otra boca
        const a = xy(p.via), b = xy(pz.m.portal[p.via]);
        v.q.push({ from: prev, to: a, dur: 0.1, kind: 'in' }, { from: b, to, dur: 0.12, kind: 'out' });
      } else v.q.push({ from: prev, to, dur: m.t === 'big' ? 0.2 : onIce && k > 0 ? 0.07 : 0.12, kind: k > 0 ? 'slide' : m.t === 'cat' && r.pushed ? 'push' : 'walk' });
      prev = to;
    });
    if (m.t !== 'cat') v.squash = 0.6;
  }
  if (r.pushed === 'big') say(vc, 'strain', 0.4);
  const slid = r.moved.some((m) => m.path.length > 1);
  const via = r.moved.some((m) => m.path.some((p) => p.via >= 0));
  sfx(via ? 'tunnel' : r.pushed === 'big' ? 'big' : r.pushed ? 'push' : 'step');
  if (slid) setTimeout(() => sfx('slide'), 60);
  updateMoves();
  if (S.lv.key === 'cocina-1' && !P.tut) {
    P.tut = true;
    save('tut', true);
    hint('', 0);
  }
  if (r.won) {
    S.wonT = 0;
    G.gameplay(false);
  }
}

function undo() {
  if (S.screen !== 'play' || S.wonT >= 0) return;
  if (S.pz.undo()) {
    finishAnims();
    snapVis();
    sfx('undo');
    updateMoves();
  }
}
function restart() {
  if (S.screen !== 'play' && S.screen !== 'pause') return;
  if (!S.pz.moves) return;
  S.pz.reset();
  S.wonT = -1;
  snapVis();
  sfx('restart');
  updateMoves();
  if (S.screen === 'pause') resume();
}
function swapCat(to = null) {
  if (S.screen !== 'play' || S.pz.s.cats.length < 2 || S.wonT >= 0) return;
  S.sel = to ?? (S.sel + 1) % S.pz.s.cats.length;
  const v = S.vis.cats[S.sel];
  v.hop = 0.25;
  say(v, 'happy', 0.5);
  sfx('meow', S.sel);
}
function say(v, expr, dur = 0.6) {
  v.expr = expr;
  v.exprT = dur;
}

function updateMoves() {
  const lv = S.lv, b = P.best[lv.key];
  $('h-moves').textContent = t('moves', { n: S.pz.moves });
  $('h-par').textContent = b != null ? t('movesBest', { p: lv.par, b }) : t('movesPar', { p: lv.par });
  $('b-undo').disabled = !S.pz.moves;
}

let hintTimer = 0;
function hint(txt, secs) {
  const el = $('hint');
  el.textContent = txt;
  el.classList.toggle('on', !!txt);
  clearTimeout(hintTimer);
  if (txt && secs < 900) hintTimer = setTimeout(() => el.classList.remove('on'), secs * 1000);
}

// ---------------------------------------------------------------- ganar
function won() {
  const lv = S.lv;
  const n = S.pz.moves;
  const prev = P.best[lv.key];
  if (prev == null || n < prev) {
    P.best[lv.key] = n;
    save('best', P.best);
  }
  const stars = starsFor(lv, n);
  $('w-title').textContent = n <= lv.par ? t('winPerfect') : t('win');
  $('w-stars').innerHTML = [0, 1, 2].map((i) => `<i class="${i < stars ? 'on' : ''}" style="--d:${0.15 + i * 0.15}s">★</i>`).join('');
  $('w-text').textContent = n <= lv.par ? t('winMovesPar', { n }) : t('winMoves', { n, p: lv.par });
  const nx = nextLevel(lv);
  $('w-next').hidden = !nx;
  $('w-all').hidden = !!nx;
  S.screen = 'win';
  show('win');
  sfx('win');
}
function nextLevel(lv) {
  const i = ALL.findIndex((x) => x.key === lv.key);
  for (let k = i + 1; k < ALL.length; k++) if (levelOpen(ALL[k])) return ALL[k];
  return null;
}
$('w-next').onclick = () => {
  const nx = nextLevel(S.lv);
  if (nx) G.commercialBreak('siguiente').then(() => startLevel(nx));
};
$('w-again').onclick = () => startLevel(S.lv);
$('w-levels').onclick = () => openLevels();

// ---------------------------------------------------------------- dibujo
function layout() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(innerWidth * dpr);
  cv.height = Math.round(innerHeight * dpr);
  L.dpr = dpr;
  if (!S.pz) return;
  const m = S.pz.m;
  const WH = 0.42; // alto de las paredes (en celdas)
  const top = TOP + 74, bottom = 78;
  const availW = innerWidth - 24, availH = innerHeight - top - bottom;
  const T = Math.floor(clamp(Math.min(availW / m.w, availH / (m.h + WH)), 24, 96));
  L.T = T;
  L.ox = Math.round((innerWidth - m.w * T) / 2);
  L.oy = Math.round(top + WH * T + (availH - (m.h + WH) * T) / 2);
}

function draw(dt) {
  const W = innerWidth, H = innerHeight;
  g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
  const th = THEMES[S.lv?.room || 'cocina'];
  // fondo
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, th.bg);
  bg.addColorStop(1, th.bg2);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  if (!S.pz) return;
  const pz = S.pz, m = pz.m, T = L.T, w = m.w;
  const wh = 0.42;
  let sx = 0, sy = 0;
  if (shake > 0) {
    shake = Math.max(0, shake - dt);
    sx = (Math.random() - 0.5) * shake * 60;
    sy = (Math.random() - 0.5) * shake * 60;
  }
  const cell = (x, y, fn) => {
    g.save();
    g.translate(L.ox + x * T + sx, L.oy + y * T + sy);
    g.scale(T, T);
    fn();
    g.restore();
  };
  // sombra del cuarto
  g.fillStyle = 'rgba(80,50,30,.12)';
  g.beginPath();
  g.roundRect(L.ox - 6 + sx, L.oy - wh * T + 10 + sy, w * T + 12, m.h * T + wh * T, 18);
  g.fill();
  // piso, hielo, sol y túneles
  const warmAll = S.wonT >= 0 ? clamp(S.wonT / 0.8, 0, 1) : 0;
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!m.floor[i] || m.wall[i]) continue;
      cell(x, y, () => floorTile(g, th, x, y));
      if (m.ice[i]) cell(x, y, () => iceTile(g, S.time, x, y));
    }
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < m.target.length; i++) if (m.target[i]) cell(i % w, (i / w) | 0, () => sunSpot(g, S.time, 0.8 + 0.2 * Math.sin(S.time * 1.5 + i) + warmAll * 0.6));
  g.globalCompositeOperation = 'source-over';
  // motas de polvo en el sol
  for (let i = 0; i < m.target.length; i++) {
    if (!m.target[i]) continue;
    for (let k = 0; k < 2; k++) {
      const ph = S.time * 0.3 + i * 1.7 + k * 3.1;
      const px = (i % w) + 0.5 + Math.sin(ph) * 0.3, py = ((i / w) | 0) + 0.5 + Math.cos(ph * 0.8) * 0.3 - ((S.time * 0.1 + k * 0.5) % 1) * 0.4;
      g.fillStyle = `rgba(255,250,220,${0.5 + 0.4 * Math.sin(ph * 3)})`;
      g.beginPath();
      g.arc(L.ox + px * T + sx, L.oy + py * T + sy, Math.max(1, T * 0.02), 0, TAU);
      g.fill();
    }
  }
  // selección: aro debajo del gato elegido
  if (pz.s.cats.length > 1 && S.wonT < 0) {
    const v = S.vis.cats[S.sel];
    cell(v.x, v.y, () => {
      g.strokeStyle = 'rgba(255,255,255,.85)';
      g.lineWidth = 0.05;
      g.setLineDash([0.1, 0.07]);
      g.lineDashOffset = -S.time * 0.3;
      g.beginPath();
      g.ellipse(0.5, 0.85, 0.38, 0.13, 0, 0, TAU);
      g.stroke();
      g.setLineDash([]);
    });
  }
  // por filas: paredes, túneles, cajas y gatos (lo de abajo tapa a lo de arriba)
  const items = [];
  S.vis.boxes.forEach((v, i) => items.push({ row: Math.ceil(v.y - 0.01), kind: 'box', v, i }));
  S.vis.bigs.forEach((v, i) => items.push({ row: Math.ceil(v.y - 0.01) + 1, kind: 'big', v, i }));
  S.vis.cats.forEach((v, i) => items.push({ row: Math.ceil(v.y - 0.01), kind: 'cat', v, i }));
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (m.portal[i] >= 0) {
        const pair = portalPair(i);
        cell(x, y, () => tunnelMouth(g, pair, S.time, 0));
      }
      if (!m.wall[i]) continue;
      if (!touchesFloor(m, x, y)) continue;
      cell(x, y, () => {
        if (y === m.h - 1 || !m.wall[i + w] || !touchesFloor(m, x, y + 1)) wallFront(g, th, wh);
        wallTop(g, th, wh);
      });
    }
    for (const it of items.filter((it) => it.row === y).sort((a, b) => a.v.x - b.v.x)) drawItem(it, cell);
  }
  for (const it of items.filter((it) => it.row >= m.h || it.row < 0)) drawItem(it, cell);
  // partículas
  for (const p of parts) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += (p.g || 0) * dt;
    const k = clamp(p.life / p.max, 0, 1);
    g.globalAlpha = Math.min(1, k * 2);
    const X = L.ox + p.x * T + sx, Y = L.oy + p.y * T + sy;
    if (p.kind === 'heart') {
      g.fillStyle = '#ff6b8b';
      g.font = `${Math.round(T * 0.32)}px Nunito, sans-serif`;
      g.textAlign = 'center';
      g.fillText('♥', X, Y);
    } else if (p.kind === 'z') {
      g.fillStyle = '#6b5bd6';
      g.font = `800 ${Math.round(T * (0.2 + (1 - k) * 0.25))}px Nunito, sans-serif`;
      g.textAlign = 'center';
      g.fillText('z', X, Y);
    } else if (p.kind === 'spark') {
      g.fillStyle = '#ffe27a';
      g.beginPath();
      g.arc(X, Y, T * 0.05 * k + 1, 0, TAU);
      g.fill();
    } else {
      g.fillStyle = p.color || 'rgba(240,225,200,.9)';
      g.beginPath();
      g.arc(X, Y, T * (0.06 + (1 - k) * 0.08), 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
}

function portalPair(i) {
  const lv = S.lv;
  const w = S.pz.m.w;
  const ch = lv.map[(i / w) | 0][i % w];
  return ch.toUpperCase();
}
function touchesFloor(m, x, y) {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= m.w || Y >= m.h) continue;
      const i = Y * m.w + X;
      if (m.floor[i] && !m.wall[i]) return true;
    }
  return false;
}

function drawItem(it, cell) {
  const v = it.v;
  const sc = v.scale ?? 1;
  if (it.kind === 'box' || it.kind === 'big') {
    cell(v.x, v.y, () => {
      if (sc !== 1) {
        g.translate(0.5, 0.9);
        g.scale(sc, sc);
        g.translate(-0.5, -0.9);
      }
      box(g, { big: it.kind === 'big', warm: v.warm, squash: v.squash, t: S.time });
    });
    return;
  }
  const c = CATS[it.i];
  cell(v.x, v.y, () => {
    if (sc !== 1) {
      g.translate(0.5, 0.9);
      g.scale(sc, sc);
      g.translate(-0.5, -0.9);
    }
    if (S.wonT > 0.7) sleepingCat(g, c, S.time + it.i);
    else cat(g, c, { view: v.face, expr: v.exprT > 0 ? v.expr : v.blink < 0.12 ? 'blink' : 'normal', hop: v.hop, squash: v.squash, tail: v.tail, slide: v.slide });
    // flechita sobre el gato elegido
    if (S.pz.s.cats.length > 1 && it.i === S.sel && S.wonT < 0) {
      g.fillStyle = '#ffffff';
      g.strokeStyle = OUT;
      g.lineWidth = 0.035;
      const by = -0.38 - Math.abs(Math.sin(S.time * 4)) * 0.08;
      g.beginPath();
      g.moveTo(0.5, by + 0.1);
      g.lineTo(0.42, by);
      g.lineTo(0.58, by);
      g.closePath();
      g.fill();
      g.stroke();
    }
  });
}

// ---------------------------------------------------------------- animación
function update(dt) {
  S.time += dt;
  if (!S.vis) return;
  const pz = S.pz, m = pz.m, w = m.w;
  const all = [...S.vis.cats, ...S.vis.boxes, ...S.vis.bigs];
  for (const v of all) {
    v.squash = lerp(v.squash || 0, 0, 1 - Math.exp(-dt * 12));
    if (v.hop !== undefined && !v.q.length) v.hop = lerp(v.hop, 0, 1 - Math.exp(-dt * 10));
    if (v.q.length) {
      const s = v.q[0];
      s.t = (s.t || 0) + dt;
      const k = clamp(s.t / s.dur, 0, 1);
      const e = s.kind === 'slide' ? k : k * k * (3 - 2 * k);
      v.x = lerp(s.from[0], s.to[0], e);
      v.y = lerp(s.from[1], s.to[1], e);
      if (s.kind === 'in') v.scale = 1 - k * 0.85;
      else if (s.kind === 'out') v.scale = 0.15 + k * 0.85;
      else v.scale = 1;
      if (v.hop !== undefined) {
        v.hop = s.kind === 'walk' || s.kind === 'push' ? Math.sin(k * Math.PI) * 0.12 : 0;
        v.slide = s.kind === 'slide' ? 1 : 0;
      }
      if (k >= 1) {
        v.q.shift();
        if (s.kind === 'in') puff(s.to[0], s.to[1], 6, 'spark');
        if (s.kind === 'out') puff(s.to[0], s.to[1], 6, 'spark');
        if (!v.q.length) {
          v.scale = 1;
          v.slide = 0;
          if (v.hop !== undefined) v.squash = 0.35;
          landed(v);
        }
      }
    }
  }
  for (const v of S.vis.cats) {
    v.tail += dt * 2.2;
    v.blink -= dt;
    if (v.blink < 0) v.blink = 2.5 + Math.random() * 3;
    v.exprT -= dt;
  }
  // calorcito de las cajas al sol
  pz.s.boxes.forEach((b, i) => {
    const vb = S.vis.boxes[i];
    const on = m.target[b] && !vb.q.length ? 1 : 0;
    vb.warm = lerp(vb.warm, on, 1 - Math.exp(-dt * 6));
  });
  pz.s.bigs.forEach((b, i) => {
    const vb = S.vis.bigs[i];
    const on = [b, b + 1, b + w, b + w + 1].every((c) => m.target[c]) && !vb.q.length ? 1 : 0;
    vb.warm = lerp(vb.warm, on, 1 - Math.exp(-dt * 6));
  });
  // ganó: siesta
  if (S.wonT >= 0 && !busy()) {
    const before = S.wonT;
    S.wonT += dt;
    if (before < 0.7 && S.wonT >= 0.7) for (const v of S.vis.cats) puff(v.x, v.y - 0.3, 5, 'heart');
    if (S.wonT > 0.9 && Math.random() < dt * 2.5) {
      const v = S.vis.cats[(Math.random() * S.vis.cats.length) | 0];
      parts.push({ kind: 'z', x: v.x + 0.65, y: v.y + 0.2, vx: 0.25, vy: -0.45, life: 1.6, max: 1.6 });
    }
    if (before < 1.7 && S.wonT >= 1.7) won();
  }
}

/** Algo terminó de moverse: si es una caja que quedó al sol, brillitos y el gato se pone contento. */
function landed(v) {
  const pz = S.pz, w = pz.m.w;
  const bi = S.vis.boxes.indexOf(v);
  if (bi >= 0) {
    const b = pz.s.boxes[bi];
    if (pz.m.target[b]) {
      puff(b % w, (b / w) | 0, 10, 'spark');
      say(S.vis.cats[S.sel], 'happy', 0.9);
      sfx('sun');
    } else puff(b % w, (b / w) | 0, 3, 'dust');
  }
  const gi = S.vis.bigs.indexOf(v);
  if (gi >= 0) {
    const b = pz.s.bigs[gi];
    puff((b % w) + 0.5, ((b / w) | 0) + 0.5, 6, 'dust');
    if ([b, b + 1, b + w, b + w + 1].every((c) => pz.m.target[c])) {
      puff((b % w) + 0.5, ((b / w) | 0) + 0.5, 16, 'spark');
      for (const c of S.vis.cats) say(c, 'happy', 1);
      sfx('sun');
    }
  }
}

function puff(x, y, n, kind) {
  for (let i = 0; i < n && parts.length < 300; i++) {
    const a = Math.random() * TAU, sp = 0.4 + Math.random() * 0.8;
    parts.push({ kind, x: x + 0.5, y: y + 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - (kind === 'heart' ? 0.6 : 0.3), life: 0.5 + Math.random() * 0.5, max: 1, g: kind === 'dust' ? 0 : 0.6 });
  }
}

// ---------------------------------------------------------------- bucle
let last = performance.now();
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  if (!G.paused) {
    if (S.screen === 'play' || S.screen === 'win' || S.screen === 'pause') update(S.screen === 'pause' ? 0 : dt);
    if (S.screen === 'home' || S.screen === 'levels') homeUpdate(dt);
  }
  if (S.screen === 'home' || S.screen === 'levels') drawHome();
  else draw(S.screen === 'pause' ? 0 : dt);
  pollPad();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- inicio: escena de la siesta
const home = { t: 0 };
function homeUpdate(dt) {
  home.t += dt;
  S.time += dt;
}
function drawHome() {
  const W = innerWidth, H = innerHeight;
  g.setTransform(L.dpr || 1, 0, 0, L.dpr || 1, 0, 0);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#fbe8c9');
  bg.addColorStop(1, '#f4cf9b');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // rayos de la ventana
  g.save();
  g.globalCompositeOperation = 'lighter';
  const cx = W * (W > 760 ? 0.72 : 0.5), cy = W > 760 ? H * 0.55 : H * 0.3;
  for (let i = 0; i < 4; i++) {
    const gr = g.createLinearGradient(cx - 300, cy - 400, cx, cy);
    gr.addColorStop(0, 'rgba(255,240,180,0)');
    gr.addColorStop(1, `rgba(255,220,130,${0.18 + 0.05 * Math.sin(home.t + i)})`);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(cx - 420 + i * 70, cy - 520);
    g.lineTo(cx - 360 + i * 70, cy - 520);
    g.lineTo(cx + 40 + i * 50, cy + 30);
    g.lineTo(cx - 40 + i * 50, cy + 30);
    g.closePath();
    g.fill();
  }
  g.restore();
  const T = Math.min(150, Math.max(90, Math.min(W, H) * 0.22));
  const draw1 = (x, y, fn) => {
    g.save();
    g.translate(x, y);
    g.scale(T, T);
    fn();
    g.restore();
  };
  // mancha de sol en el piso, la caja con Mandarina durmiendo y Carbón mirando
  g.globalCompositeOperation = 'lighter';
  draw1(cx - T * 0.9, cy - T * 0.1, () => {
    g.scale(1.8, 1.1);
    sunSpot(g, home.t, 1.1);
  });
  g.globalCompositeOperation = 'source-over';
  draw1(cx - T * 0.5, cy - T * 0.25, () => box(g, { warm: 1, t: home.t }));
  draw1(cx - T * 0.5, cy - T * 0.62, () => sleepingCat(g, CATS[0], home.t));
  draw1(cx + T * 0.55, cy - T * 0.05, () => cat(g, CATS[1], { view: 'L', expr: Math.sin(home.t * 0.7) > 0.96 ? 'blink' : 'happy', tail: home.t * 2 }));
  if (Math.random() < 0.02) parts.push({ kind: 'z', x: 0, y: 0, hx: cx - T * 0.05, hy: cy - T * 0.55, vx: 20, vy: -30, life: 1.6, max: 1.6 });
  for (const p of parts) {
    if (p.hx === undefined) continue;
    p.life -= 1 / 60;
    p.hx += p.vx / 60;
    p.hy += p.vy / 60;
    g.globalAlpha = clamp(p.life / p.max, 0, 1);
    g.fillStyle = '#6b5bd6';
    g.font = `800 ${Math.round(T * 0.18)}px Nunito, sans-serif`;
    g.fillText('z', p.hx, p.hy);
    g.globalAlpha = 1;
  }
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i].hx !== undefined && parts[i].life <= 0) parts.splice(i, 1);
}

// ---------------------------------------------------------------- pantallas
function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${id}`));
  if (!id) return;
  const first = $(`s-${id}`).querySelector('.btn:not([hidden]):not(:disabled), .lvl:not(:disabled)');
  if (first && !G.prefs.touch) setTimeout(() => first.focus({ preventScroll: true }), 60);
}

function toHome() {
  S.screen = 'home';
  S.pz = null;
  S.vis = null;
  $('hud').hidden = true;
  hint('', 0);
  G.gameplay(false);
  parts.length = 0;
  refreshHome();
  show('home');
}

function refreshHome() {
  const total = ALL.length * 3;
  const got = ALL.reduce((a, lv) => a + starsFor(lv, P.best[lv.key]), 0);
  $('h-stars').textContent = t('starsN', { n: got, m: total });
  const nx = ALL.find((lv) => P.best[lv.key] == null && levelOpen(lv));
  $('b-play-sub').textContent = nx ? t('playNext', { n: G.t(nx.name) }) : t('allDone');
  $('keys').textContent = G.prefs.touch ? t('keysTouch') : t('keysDesk');
}

function openLevels() {
  S.screen = 'levels';
  S.pz = null;
  S.vis = null;
  $('hud').hidden = true;
  hint('', 0);
  G.gameplay(false);
  $('rooms').innerHTML = ROOMS.map((r, ri) => {
    const open = roomOpen(ri);
    const lv = LEVELS[r.id];
    const btns = lv
      .map((l, i) => {
        const key = `${r.id}-${i + 1}`;
        const b = P.best[key];
        const st = starsFor(l, b);
        const ok = open && levelOpen({ ...l, room: r.id, i, key });
        return `<button class="lvl ${b != null ? 'done' : ''}" data-k="${key}" ${ok ? '' : 'disabled'}><b>${i + 1}</b><span>${'★'.repeat(st)}${'☆'.repeat(3 - st)}</span></button>`;
      })
      .join('');
    const lock = !open ? `<p class="lock">🔒 ${ri === ROOMS.length - 1 ? t('lockedAll') : t('locked', { r: G.t(ROOMS[ri - 1].name) })}</p>` : '';
    return `<section class="room ${r.id} ${open ? '' : 'closed'}"><header><canvas width="96" height="96" data-room="${r.id}"></canvas><div><h3>${G.t(r.name)}</h3><small>${solvedIn(r.id)}/${lv.length}</small></div></header>${lock}<div class="lvls">${btns}</div></section>`;
  }).join('');
  $$('#rooms canvas').forEach((c) => {
    const x = c.getContext('2d');
    x.clearRect(0, 0, 96, 96);
    x.save();
    x.translate(14, 18);
    x.scale(66, 66);
    roomIcon(x, c.dataset.room, 0.5);
    x.restore();
  });
  $$('#rooms .lvl').forEach((b) => (b.onclick = () => startLevel(ALL.find((l) => l.key === b.dataset.k))));
  show('levels');
}

function showTip(room) {
  $('tip-room').textContent = G.t(room.name);
  $('tip-text').textContent = G.t(room.tip);
  const c = $('tip-c').getContext('2d');
  c.clearRect(0, 0, 140, 140);
  c.save();
  c.translate(20, 26);
  c.scale(100, 100);
  roomIcon(c, room.id, 0.3);
  c.restore();
  S.screen = 'tip';
  show('tip');
}
$('tip-go').onclick = () => {
  S.screen = 'play';
  show(null);
};

function pause() {
  if (S.screen !== 'play') return;
  S.screen = 'pause';
  G.gameplay(false);
  show('pause');
}
function resume() {
  if (S.screen !== 'pause') return;
  S.screen = 'play';
  G.gameplay(true);
  show(null);
}

$('b-play').onclick = () => {
  const nx = ALL.find((lv) => P.best[lv.key] == null && levelOpen(lv)) || ALL[0];
  startLevel(nx);
};
$('b-levels').onclick = openLevels;
$('l-back').onclick = toHome;
$('b-menu').onclick = pause;
$('b-undo').onclick = undo;
$('b-restart').onclick = restart;
$('b-swap').onclick = () => swapCat();
$('p-resume').onclick = resume;
$('p-restart').onclick = restart;
$('p-levels').onclick = openLevels;

// ---------------------------------------------------------------- controles
const KEYMAP = { ArrowUp: 'U', KeyW: 'U', ArrowDown: 'D', KeyS: 'D', ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R' };
addEventListener('keydown', (e) => {
  if (S.screen === 'tip' && (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape')) {
    e.preventDefault();
    $('tip-go').click();
    return;
  }
  if (S.screen === 'pause' && (e.code === 'Escape' || e.code === 'KeyP')) return resume();
  if (S.screen !== 'play') return;
  const d = KEYMAP[e.code];
  if (d) {
    e.preventDefault();
    tryMove(d);
  } else if (e.code === 'Tab' || e.code === 'Space' || e.code === 'KeyC') {
    e.preventDefault();
    if (!e.repeat) swapCat();
  } else if (e.code === 'KeyZ' || e.code === 'Backspace' || e.code === 'KeyU') {
    e.preventDefault();
    undo();
  } else if (e.code === 'KeyR' && !e.repeat) restart();
  else if (e.code === 'Escape' || e.code === 'KeyP') pause();
  else if (e.code === 'Digit1' || e.code === 'Digit2') swapCat(+e.code.slice(5) - 1 < S.pz.s.cats.length ? +e.code.slice(5) - 1 : S.sel);
});
addEventListener('blur', () => pause());
G.onPause?.(() => pause());

// toques: deslizar para mover, tocar un gato para elegirlo, tocar al costado para dar un paso hacia ahí
let touch0 = null;
cv.addEventListener('pointerdown', (e) => {
  if (S.screen !== 'play') return;
  touch0 = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
});
cv.addEventListener('pointermove', (e) => {
  if (!touch0 || S.screen !== 'play') return;
  const dx = e.clientX - touch0.x, dy = e.clientY - touch0.y;
  const th = Math.max(22, L.T * 0.45);
  if (Math.hypot(dx, dy) > th) {
    tryMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : dy > 0 ? 'D' : 'U');
    touch0 = { x: e.clientX, y: e.clientY, t: performance.now(), moved: true };
  }
});
cv.addEventListener('pointerup', (e) => {
  if (!touch0 || S.screen !== 'play') return;
  const was = touch0;
  touch0 = null;
  if (was.moved) return;
  // toque: ¿cayó sobre un gato?
  const cx = (e.clientX - L.ox) / L.T, cy = (e.clientY - L.oy) / L.T;
  const cats = S.vis.cats;
  for (let i = 0; i < cats.length; i++) {
    const v = cats[i];
    if (cx > v.x && cx < v.x + 1 && cy > v.y - 0.6 && cy < v.y + 1) {
      if (i !== S.sel) swapCat(i);
      return;
    }
  }
  // si no, un paso hacia donde tocó (desde el gato elegido)
  const v = cats[S.sel];
  const dx = cx - (v.x + 0.5), dy = cy - (v.y + 0.5);
  if (Math.hypot(dx, dy) < 0.6) return;
  tryMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : dy > 0 ? 'D' : 'U');
});
cv.addEventListener('pointercancel', () => (touch0 = null));

const padPrev = {};
let padRepeat = 0;
function pollPad() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  for (const gp of pads) {
    const b = (i) => !!gp.buttons[i]?.pressed;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    let d = b(12) || ay < -0.6 ? 'U' : b(13) || ay > 0.6 ? 'D' : b(14) || ax < -0.6 ? 'L' : b(15) || ax > 0.6 ? 'R' : null;
    const key = `${gp.index}:dir`;
    if (d && (padPrev[key] !== d || performance.now() > padRepeat)) {
      if (S.screen === 'play') tryMove(d);
      padRepeat = performance.now() + (padPrev[key] === d ? 150 : 320);
    }
    padPrev[key] = d;
    const press = (i) => b(i) && !padPrev[`${gp.index}:${i}`];
    if (S.screen === 'play') {
      if (press(1)) undo();
      if (press(3)) restart();
      if (press(2) || press(4) || press(5)) swapCat();
      if (press(9)) pause();
    } else if (press(0) && document.activeElement?.click) document.activeElement.click();
    else if (press(9) && S.screen === 'pause') resume();
    for (let i = 0; i < gp.buttons.length; i++) padPrev[`${gp.index}:${i}`] = b(i);
  }
}

// ---------------------------------------------------------------- sonido
function sfx(k, n = 0) {
  if (k === 'step') tone(520, 560, 0.05, { type: 'triangle', vol: 0.05 });
  else if (k === 'push') {
    noise(0.12, { freq: 380, q: 0.8, vol: 0.18, type: 'lowpass' });
    tone(150, 110, 0.12, { type: 'sine', vol: 0.12 });
  } else if (k === 'big') {
    noise(0.22, { freq: 260, q: 0.7, vol: 0.26, type: 'lowpass' });
    tone(110, 80, 0.2, { type: 'sine', vol: 0.15 });
  } else if (k === 'slide') noise(0.35, { freq: 2600, sweep: 900, q: 1.2, vol: 0.07 });
  else if (k === 'tunnel') {
    tone(300, 900, 0.18, { type: 'sine', vol: 0.1 });
    tone(900, 500, 0.15, { type: 'sine', vol: 0.08, at: 0.16 });
  } else if (k === 'bump') tone(200, 150, 0.08, { type: 'sine', vol: 0.1 });
  else if (k === 'heavy') {
    tone(160, 120, 0.25, { type: 'triangle', vol: 0.1 });
    meow(0.9);
  } else if (k === 'sun') notes([784, 988, 1319], { step: 0.06, dur: 0.22, vol: 0.08 });
  else if (k === 'undo') tone(700, 450, 0.08, { type: 'triangle', vol: 0.06 });
  else if (k === 'restart') notes([660, 520, 400], { step: 0.05, dur: 0.1, vol: 0.06 });
  else if (k === 'meow') meow(n ? 0.75 : 1.1);
  else if (k === 'win') {
    meow(1.05);
    notes([523, 659, 784, 1047, 1319], { step: 0.09, dur: 0.3, vol: 0.09 });
    // ronroneo
    for (let i = 0; i < 6; i++) noise(0.14, { freq: 110, q: 0.6, vol: 0.22, type: 'lowpass', at: 0.6 + i * 0.22 });
  }
}
function meow(pitch = 1) {
  tone(520 * pitch, 820 * pitch, 0.12, { type: 'sawtooth', vol: 0.035 });
  tone(820 * pitch, 460 * pitch, 0.22, { type: 'triangle', vol: 0.06, at: 0.1 });
}

// ---------------------------------------------------------------- arranque
G.onPrefs((p) => {
  document.documentElement.lang = p.lang;
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  refreshHome();
  if (S.screen === 'levels') openLevels();
  if (S.lv && S.screen === 'play') updateMoves();
}, true);
addEventListener('resize', layout);
layout();
toHome();
requestAnimationFrame(frame);
if (/[?&]debug\b/.test(location.search)) window.__solcito = { S, P, startLevel, tryMove, ALL, openLevels };
G.ready();
