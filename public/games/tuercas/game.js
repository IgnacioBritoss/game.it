/* Tuercas — game.it
 * Carreras de karts y motos en 3D de dibujito, con piloto, carrocería, ruedas, accesorio, pintura y puesta a punto
 * propios (seis estadísticas que cambian con cada pieza), seis pistas con tema propio, cajas con ítems, tuercas,
 * derrapes con miniturbo y saltos con pirueta. Modos: copa de 3 carreras, carrera libre, contrarreloj y 2 jugadores
 * en pantalla dividida. La carrera (shared/) es lógica pura de paso fijo; scene.js la dibuja con three.js.
 */
import { Stage } from './scene.js';
import { Input } from './input.js';
import { audio } from './audio.js';
import { Hud, ICONS, fmtTime, esc } from './hud.js';
import { Garage, loadConfig } from './garage.js';
import { createRace, stepRace, endRace, DT, pointsFor } from './shared/race.js';
import { TRACK_DEFS, CUPS, getTrack } from './shared/tracks.js';
import { CLASSES, DRIVERS, PAINTS, byId, randomConfig } from './shared/parts.js';
import { ITEMS, ITEM_IDS } from './shared/items.js';
import { THEMES } from './themes.js';
import { OnlineMode } from './online.js';
import { makeT } from './text.js';
import { rng, clamp } from './shared/util.js';

const G = window.GameIt;
const ID = 'tuercas';
const $ = (id) => document.getElementById(id);
const tr = makeT(G);
const LANG = () => G.prefs.lang;

// ---------------------------------------------------------------- guardado
const load = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem(`gameit:${ID}:${k}`)) ?? d;
  } catch {
    return d;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(`gameit:${ID}:${k}`, JSON.stringify(v));
  } catch {}
};

// ---------------------------------------------------------------- estado
const S = {
  view: 'home', // home | select | garage | help | race | results
  mode: null, // cup | free | trial | two
  sel: { cup: load('sel:cup', 'tuerca'), free: load('sel:free', 'pradera'), trial: load('sel:trial', 'pradera'), two: load('sel:two', 'pradera') },
  cls: load('cls', 'carrera'),
  laps: load('laps', 3),
  players: 1,
  race: null,
  bg: null,
  bgTrack: null,
  bgKart: 0,
  bgT: 0,
  cup: null,
  opts: null, // opciones de la carrera en curso (para reiniciar)
  paused: false,
  portalPaused: false,
  endTimer: 0,
  lapTimes: [],
  acc: 0,
  views: [],
};
let stage = null;
let input = null;
let hud = null;
let garage = null;
let online = null;
let clock = 0;
let last = performance.now();
let unlocked = false;

// ---------------------------------------------------------------- pantallas
const SCREENS = ['s-home', 's-select', 's-garage', 's-help', 's-pause', 's-results', 's-nogl', 's-online', 's-lobby', 's-loading', 's-crash'];
function show(id) {
  for (const s of SCREENS) $(s).classList.toggle('on', s === id);
}
const overlay = (id, on) => $(id).classList.toggle('on', on);

function applyLang() {
  document.documentElement.lang = LANG();
  for (const el of document.querySelectorAll('[data-t]')) {
    // la garage los reescribe ella misma; el resto se traduce acá
    if (!el.closest('#g-tabs')) el.textContent = tr(el.dataset.t);
  }
  for (const el of document.querySelectorAll('[data-ph]')) el.placeholder = tr(el.dataset.ph);
  for (const el of document.querySelectorAll('[data-title]')) el.title = tr(el.dataset.title);
}

// ---------------------------------------------------------------- ayuda
function renderHelp() {
  const kb = [['hAccel', '↑ / W'], ['hBrake', '↓ / S'], ['hSteer', '← → / A D'], ['hDrift', 'Space / Shift'], ['hItem', 'E / X / Enter'], ['hPause', 'Esc / P']];
  const lang = LANG();
  $('help-body').innerHTML = `
    <section><h3>${esc(tr('hKeys'))}</h3><div class="keys">${kb.map(([k, v]) => `<span>${esc(tr(k))}</span><kbd>${v}</kbd>`).join('')}</div>
      <h3>${esc(tr('hPad'))}</h3><p>${esc(tr('hPadText'))}</p></section>
    <section><h3>${esc(tr('hTouch'))}</h3><p>${esc(tr('hTouchText'))}</p>
      <h3>${esc(tr('hTwo'))}</h3><p>${esc(tr('hTwoText'))}</p></section>
    <section><h3>${esc(tr('hDriftT'))}</h3><p>${esc(tr('hDriftText'))}</p>
      <h3>${esc(tr('hBoxT'))}</h3><p>${esc(tr('hBoxText'))}</p></section>
    <section><h3>${esc(tr('hTricksT'))}</h3><p>${esc(tr('hTricksText'))}</p>
      <h3>${esc(tr('hGarageT'))}</h3><p>${esc(tr('hGarageText'))}</p>
      <h3>${esc(tr('hOnlineT'))}</h3><p>${esc(tr('hOnlineText'))}</p></section>
    <div class="help-items"><h3 style="grid-column:1/-1;color:var(--sun)">${esc(tr('hItems'))}</h3>${ITEM_IDS.map((id) => `<div>${ICONS[id]}<p><b>${esc(ITEMS[id].name[lang])}</b><span>${esc(ITEMS[id].tip[lang])}</span></p></div>`).join('')}</div>`;
}

// ---------------------------------------------------------------- miniaturas de pistas
function drawTrackMap(canvas, trackId, box) {
  const T = getTrack(trackId);
  const th = THEMES[T.theme];
  const g = canvas.getContext('2d');
  const [bx, by, bw, bh] = box || [0, 0, canvas.width, canvas.height];
  g.save();
  g.beginPath();
  g.rect(bx, by, bw, bh);
  g.clip();
  const gr = g.createLinearGradient(bx, by, bx, by + bh);
  gr.addColorStop(0, th.sky[0]);
  gr.addColorStop(1, th.base.color);
  g.fillStyle = gr;
  g.fillRect(bx, by, bw, bh);
  const b = T.box;
  const span = Math.max(b.x1 - b.x0, b.z1 - b.z0);
  const pad = bh * 0.14;
  const sc = Math.min((bw - pad * 2) / (b.x1 - b.x0), (bh - pad * 2) / (b.z1 - b.z0));
  const ox = bx + (bw - (b.x1 - b.x0) * sc) / 2;
  const oz = by + (bh - (b.z1 - b.z0) * sc) / 2;
  void span;
  const path = new Path2D();
  for (let i = 0; i <= T.n; i += 2) {
    const k = i % T.n;
    const x = ox + (T.x[k] - b.x0) * sc;
    const z = oz + (T.z[k] - b.z0) * sc;
    if (i === 0) path.moveTo(x, z);
    else path.lineTo(x, z);
  }
  path.closePath();
  g.lineJoin = g.lineCap = 'round';
  const w = Math.max(6, bh * 0.1);
  g.lineWidth = w + 5;
  g.strokeStyle = '#2b1b3d';
  g.stroke(path);
  g.lineWidth = w;
  g.strokeStyle = th.road.base;
  g.stroke(path);
  g.lineWidth = Math.max(1.5, w * 0.16);
  g.strokeStyle = th.road.center;
  g.setLineDash([w * 0.55, w * 0.55]);
  g.stroke(path);
  g.setLineDash([]);
  const sx = ox + (T.x[0] - b.x0) * sc;
  const sz = oz + (T.z[0] - b.z0) * sc;
  g.fillStyle = '#fff';
  g.strokeStyle = '#2b1b3d';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(sx, sz, w * 0.5, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.restore();
}

// ---------------------------------------------------------------- selección
function bestOf(id) {
  return load(`best:${id}`, {});
}

function openSelect(mode) {
  S.mode = mode;
  S.view = 'select';
  show('s-select');
  const cup = mode === 'cup';
  $('sel-title').textContent = tr({ cup: 'selCup', free: 'selFree', trial: 'selTrial', two: 'selTwo' }[mode]);
  $('sel-kicker').textContent = '';
  const list = cup ? CUPS : TRACK_DEFS;
  if (!list.some((x) => x.id === S.sel[mode])) S.sel[mode] = list[0].id;
  const box = $('sel-cards');
  box.className = 'cards' + (cup ? ' two' : '');
  const lang = LANG();
  box.innerHTML = list
    .map((it) => {
      if (cup) {
        const best = load(`cup:${it.id}`, null);
        return `<button class="card" data-id="${it.id}"><canvas width="360" height="150"></canvas><b>${esc(it.name[lang])}</b><small>${esc(best ? tr('cupBest', { n: best.place, p: best.pts }) : tr('cupRaces'))}</small></button>`;
      }
      const b = bestOf(it.id);
      return `<button class="card" data-id="${it.id}"><canvas width="320" height="200"></canvas><b>${esc(it.name[lang])}</b><span class="stars">${'★'.repeat(it.stars)}${'☆'.repeat(5 - it.stars)}</span><small>${esc(b.lap ? tr('bestLap', { t: fmtTime(b.lap) }) : tr('noBest'))}</small></button>`;
    })
    .join('');
  box.querySelectorAll('.card').forEach((el, i) => {
    const cv = el.querySelector('canvas');
    if (cup) {
      const ids = CUPS[i].tracks;
      ids.forEach((tid, k) => drawTrackMap(cv, tid, [(cv.width / 3) * k, 0, cv.width / 3, cv.height]));
    } else drawTrackMap(cv, list[i].id);
  });
  // cilindrada y vueltas
  $('sel-cls-g').hidden = mode === 'trial';
  $('sel-laps-g').hidden = cup;
  $('sel-cls').innerHTML = CLASSES.map((c) => `<button data-v="${c.id}" class="${S.cls === c.id ? 'on' : ''}">${esc(c.name[lang])}<small>${esc(c.sub[lang])}</small></button>`).join('');
  $('sel-laps').innerHTML = [1, 3, 5].map((n) => `<button data-v="${n}" class="${S.laps === n ? 'on' : ''}">${n}</button>`).join('');
  markSelected();
}

function markSelected() {
  const id = S.sel[S.mode];
  const lang = LANG();
  for (const el of $('sel-cards').children) el.classList.toggle('on', el.dataset.id === id);
  if (S.mode === 'cup') {
    const c = CUPS.find((x) => x.id === id);
    const names = c.tracks.map((t) => TRACK_DEFS.find((d) => d.id === t).name[lang]);
    $('sel-info').textContent = names.join(' · ');
  } else {
    const d = TRACK_DEFS.find((x) => x.id === id);
    $('sel-info').textContent = d.blurb[lang];
  }
}

function pickCard(id) {
  S.sel[S.mode] = id;
  save(`sel:${S.mode}`, id);
  audio.jingle('pick');
  markSelected();
  // la pista elegida se ve de fondo
  const tid = S.mode === 'cup' ? CUPS.find((c) => c.id === id).tracks[0] : id;
  clearTimeout(pickCard.t);
  pickCard.t = setTimeout(() => S.view === 'select' && startAttract(tid), 160);
}

// ---------------------------------------------------------------- carrera de fondo (menús)
function startAttract(id) {
  if (!stage) return;
  S.bgTrack = id;
  stage.marks = false;
  stage.loadTrack(id);
  const R = createRace({ track: id, cls: 'carrera', seed: (Math.random() * 1e9) | 0, mode: 'attract', noCount: true, entries: [] });
  S.bg = R;
  S.bgT = 0;
  S.bgKart = 0;
  stage.setRace(R);
  stage.snapCameras();
  hud.build(0);
  audio.music.start(stage.th.music, 11);
}

// ---------------------------------------------------------------- empezar una carrera
function newSeed() {
  return (Math.random() * 1e9) | 0;
}

/** Plantel de una copa: el jugador (o los dos) y bots con piezas fijas durante las 3 carreras. */
function makeRoster(players) {
  const R = rng(newSeed());
  const roster = [];
  const used = [];
  for (let p = 0; p < players; p++) {
    const cfg = loadConfig(p);
    used.push(cfg.driver);
    roster.push({ rid: roster.length, cfg, human: p, name: players > 1 ? `P${p + 1}` : tr('you'), pts: 0 });
  }
  while (roster.length < 8) {
    const cfg = randomConfig(R, used.length < DRIVERS.length ? used : []);
    used.push(cfg.driver);
    roster.push({ rid: roster.length, cfg, human: -1, name: byId(DRIVERS, cfg.driver).name, pts: 0 });
  }
  return roster;
}

function startFromSelect() {
  audio.init();
  const mode = S.mode;
  S.players = mode === 'two' ? 2 : 1;
  save('cls', S.cls);
  save('laps', S.laps);
  if (mode === 'cup') {
    const cup = CUPS.find((c) => c.id === S.sel.cup);
    S.cup = { cup, idx: 0, roster: makeRoster(1), done: [] };
    S.opts = { mode: 'cup', cls: S.cls, laps: 3 };
    startRace();
  } else {
    S.cup = null;
    S.opts = { mode, cls: mode === 'trial' ? 'carrera' : S.cls, laps: S.laps, track: S.sel[mode] };
    startRace();
  }
}

function raceEntries(o) {
  if (S.cup) {
    // primera carrera: el jugador sale en el fondo; después se sale según el puntaje
    const cs = S.cup;
    let order = cs.roster.slice();
    if (cs.idx === 0) {
      const R = rng(newSeed());
      order.sort(() => R() - 0.5);
      const hi = order.findIndex((e) => e.human === 0);
      const [me] = order.splice(hi, 1);
      order.splice(5, 0, me);
    } else order.sort((a, b) => b.pts - a.pts);
    return order.map((e) => ({ cfg: e.cfg, human: e.human, name: e.name, rid: e.rid }));
  }
  const list = [];
  for (let p = 0; p < S.players; p++) list.push({ cfg: loadConfig(p), human: p, name: S.players > 1 ? `P${p + 1}` : tr('you') });
  return list;
}

async function startRace() {
  const o = S.opts;
  const trackId = S.cup ? S.cup.cup.tracks[S.cup.idx] : o.track;
  clearTimeout(pickCard.t);
  S.paused = false;
  overlay('s-pause', false);
  S.view = 'race';
  show('');
  const entries = raceEntries(o);
  S.entryRids = entries.map((e) => e.rid);
  stage.marks = S.players > 1;
  stage.loadTrack(trackId);
  const seed = newSeed();
  const R = createRace({ track: trackId, cls: o.cls, laps: o.laps, seed, mode: o.mode === 'trial' ? 'trial' : 'race', entries, size: 8 });
  S.race = R;
  S.bg = null;
  S.trackId = trackId;
  S.endTimer = 0;
  S.lapTimes = [];
  S.acc = 0;
  stage.setRace(R);
  stage.snapCameras();
  input.setPlayers(S.players);
  input.showTouch(!!G.prefs.touch && S.players === 1);
  hud = new Hud($('hud'), R.T, tr);
  hud.build(S.players);
  $('hud').hidden = false;
  $('hud').classList.toggle('solo', S.players === 1);
  layoutViews();
  $('b-pause').classList.add('on');
  $('count').className = 'count';
  audio.music.start(stage.th.music, seed);
  audio.music.final(false);
  G.gameplay(true);
}

// ---------------------------------------------------------------- vistas
function layoutViews() {
  const W = innerWidth;
  const H = innerHeight;
  const R = S.race;
  const n = R ? S.players : 1;
  let rects;
  if (n === 1) rects = [{ x: 0, y: 0, w: W, h: H }];
  else if (W >= H * 0.95) {
    const w1 = Math.floor(W / 2);
    rects = [{ x: 0, y: 0, w: w1 - 2, h: H }, { x: w1 + 2, y: 0, w: W - w1 - 2, h: H }];
  } else {
    const h1 = Math.floor(H / 2);
    rects = [{ x: 0, y: 0, w: W, h: h1 - 2 }, { x: 0, y: h1 + 2, w: W, h: H - h1 - 2 }];
  }
  S.views = rects.map((rect, i) => ({ rect, kart: R ? R.humans[i] || null : null }));
  if (R && hud) hud.layout(S.views);
  let d = document.getElementById('divider');
  if (n > 1) {
    if (!d) {
      d = document.createElement('div');
      d.id = 'divider';
      d.style.cssText = 'position:fixed;z-index:11;background:#2b1b3d;pointer-events:none';
      document.body.appendChild(d);
    }
    const wide = W >= H * 0.95;
    Object.assign(d.style, wide ? { left: `${Math.floor(W / 2) - 2}px`, top: 0, width: '4px', height: '100%' } : { left: 0, top: `${Math.floor(H / 2) - 2}px`, width: '100%', height: '4px' });
  } else d?.remove();
}

// ---------------------------------------------------------------- bucle
function stepSim(R, dt, inputs) {
  S.acc += dt;
  let n = 0;
  while (S.acc >= DT && n < 10) {
    stepRace(R, inputs);
    S.acc -= DT;
    n++;
  }
  if (n >= 10) S.acc = 0;
}

let errStreak = 0;
let crashed = false;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0, 0.1);
  last = now;
  clock += dt;
  if (!stage || crashed) return;
  navPad();
  try {
    if (S.view === 'garage') {
      garage.frame(dt, clock);
      audio.update(null, [], dt);
    } else if ((S.view === 'race' || S.view === 'results') && S.mode === 'online') online.frame(dt, clock);
    else if (S.view === 'race' || S.view === 'results') tickRace(dt);
    else tickAttract(dt);
    errStreak = Math.max(0, errStreak - 0.05);
  } catch (e) {
    // un error en un cuadro no debe congelar el juego: se registra y se sigue; si se repite sin parar, se avisa y se ofrece salir
    if (errStreak < 1) console.error(e);
    if (++errStreak >= 30) crash(e);
  }
}

/** Algo se repite fallando: se frena la carrera y se deja salir al menú o recargar. */
function crash(err) {
  if (crashed) return;
  crashed = true;
  console.error('Tuercas: el bucle falló sin parar', err);
  try {
    audio.stopAll();
    G.gameplay(false);
  } catch {}
  show('s-crash');
}
function recover() {
  crashed = false;
  errStreak = 0;
  try {
    if (S.mode === 'online' && online?.active) online.leaveRace();
    else quitToMenu();
  } catch (e) {
    console.error(e);
    location.reload();
  }
  show('s-home');
}

function tickRace(dt) {
  const R = S.race;
  if (!R) return;
  const frozen = S.paused || S.portalPaused || S.view === 'results';
  if (!frozen) {
    const inputs = input.poll();
    stepSim(R, dt, inputs);
    drain(R, S.views);
    // cuando llegaron todos los jugadores se espera un momento y se muestran los resultados
    if (R.humans.every((k) => k.finished)) {
      S.endTimer += dt;
      if (S.endTimer > 3.4 && !R.over) endRace(R);
    }
    if (R.over && S.view === 'race') return showResults(R);
  }
  const alpha = frozen ? 1 : S.acc / DT;
  stage.render(R, alpha, frozen ? 0 : dt, clock, S.views);
  hud.update(R, S.views, frozen ? 0 : dt, clock, S.players === 1);
  audio.update(frozen ? null : R, S.views, dt);
  // última vuelta: la música se acelera
  const k0 = S.views[0]?.kart;
  if (k0) audio.music.final(!!(R.laps > 1 && k0.lap === R.laps - 1 && !k0.finished));
  // nubarrón: borde rojo para quien lo tiene arriba
  $('vign').classList.toggle('on', !!k0 && !frozen && R.ents.some((e) => e.type === 'nube' && e.target === k0.index && e.state === 'hover'));
}

function tickAttract(dt) {
  const R = S.bg;
  if (!R) return;
  const inputs = [];
  stepSim(R, dt, inputs);
  for (const ev of R.events) stage.fx(ev, [R.order[S.bgKart]]);
  R.events.length = 0;
  S.bgT += dt;
  if (S.bgT > 11) {
    S.bgT = 0;
    S.bgKart = (S.bgKart + 1 + Math.floor(Math.random() * 3)) % 4;
  }
  if (R.over) return startAttract(S.bgTrack);
  const kart = R.order[S.bgKart] || R.order[0];
  stage.render(R, S.acc / DT, dt, clock, [{ rect: { x: 0, y: 0, w: innerWidth, h: innerHeight }, kart }]);
  audio.update(null, [], dt);
}

/** Eventos del paso: efectos, sonido y mensajes del HUD. */
function drain(R, views) {
  drainEvents(R, R.events, views);
  R.events.length = 0;
}

function drainEvents(R, events, views) {
  const karts = views.map((v) => v.kart).filter(Boolean);
  for (const ev of events) {
    stage.fx(ev, karts);
    audio.event(ev, karts);
    const vi = ev.k ? views.findIndex((v) => v.kart === ev.k) : -1;
    switch (ev.type) {
      case 'count':
        countdown(String(ev.a), false);
        break;
      case 'go':
        countdown(tr('go2'), true);
        break;
      case 'boost':
        if (vi >= 0 && ev.a === 'start') hud.msg(vi, tr('startBoost'), 'good');
        break;
      case 'stall':
        if (vi >= 0) hud.msg(vi, tr('stall'), 'bad');
        break;
      case 'trick':
        if (vi >= 0) hud.msg(vi, tr('trick'), 'good', 1.1);
        break;
      case 'nube-warn':
        if (vi >= 0) hud.warn(vi, tr('nubeWarn'));
        break;
      case 'nube-strike': {
        const bi = views.findIndex((v) => v.kart === ev.b);
        if (bi >= 0) flash();
        break;
      }
      case 'lap':
        if (vi >= 0 && S.players === 1) S.lapTimes.push(ev.b);
        break;
      case 'finish':
        if (vi >= 0) {
          if (S.players === 1) {
            const sum = S.lapTimes.reduce((a, b) => a + b, 0);
            S.lapTimes.push(ev.k.finishT - sum);
          }
          hud.msg(vi, ev.a === 1 ? tr('win') : tr('placeN', { n: ev.a }), ev.a <= 3 ? 'good big' : 'big', 3);
        }
        break;
    }
  }
}

function countdown(text, go) {
  const c = $('count');
  c.textContent = text;
  c.className = 'count';
  void c.offsetWidth;
  c.className = 'count on' + (go ? ' go' : '');
}
function flash() {
  const f = $('flash');
  f.className = 'flash';
  void f.offsetWidth;
  f.className = 'flash on';
}

// ---------------------------------------------------------------- pausa
function pauseGame() {
  if (S.view !== 'race' || S.paused) return;
  S.paused = true;
  const on = S.mode === 'online';
  $('p-restart').hidden = on; // online no se reinicia ni se detiene: el menú avisa y deja salir
  $('pause-note').hidden = !on;
  if (on) online.pause(true);
  else audio.muteEngines();
  overlay('s-pause', true);
  G.gameplay(false);
}
function resumeGame() {
  if (!S.paused) return;
  S.paused = false;
  if (S.mode === 'online') online.pause(false);
  overlay('s-pause', false);
  G.gameplay(true);
  last = performance.now();
}

function quitToMenu() {
  audio.stopAll();
  audio.jingle('back');
  S.race = null;
  S.paused = false;
  S.cup = null;
  overlay('s-pause', false);
  $('b-pause').classList.remove('on');
  $('vign').classList.remove('on');
  $('count').className = 'count';
  $('hud').hidden = true;
  input.showTouch(false);
  stage.marks = false;
  layoutViews();
  S.view = 'home';
  show('s-home');
  G.gameplay(false);
  startAttract(S.bgTrack || load('track', 'pradera'));
}

// ---------------------------------------------------------------- resultados
function recordResults(R) {
  const h = R.humans[0];
  if (!h || S.players !== 1) return {};
  const id = S.trackId;
  const b = bestOf(id);
  const out = {};
  if (h.bestLap && (!b.lap || h.bestLap < b.lap - 1e-6)) {
    out.lap = true;
    b.lap = h.bestLap;
  }
  if (S.opts.mode === 'trial' && S.opts.laps === 3) {
    const t = R.results.find((r) => r.human === 0)?.time;
    if (t && (!b.race || t < b.race - 1e-6)) {
      out.race = true;
      b.race = t;
    }
  }
  save(`best:${id}`, b);
  save('track', id);
  return out;
}

function showResults(R) {
  S.view = 'results';
  S.paused = false;
  $('hud').hidden = true;
  audio.stopAll();
  $('b-pause').classList.remove('on');
  $('vign').classList.remove('on');
  input.showTouch(false);
  G.gameplay(false);
  const res = R.results;
  const rec = recordResults(R);
  const lang = LANG();
  const mine = res.find((r) => r.human === 0);
  const entries = R.karts;
  const rows = [];
  const dot = (cfg) => `<i class="dot" style="background:${PAINTS[cfg.paint] || '#fff'}"></i>`;
  const kicker = $('res-kicker');
  const title = $('res-title');
  const podium = $('res-podium');
  const note = $('res-note');
  podium.hidden = true;
  kicker.textContent = '';
  note.textContent = '';
  const btns = [];
  const trackName = TRACK_DEFS.find((d) => d.id === S.trackId).name[lang];
  let win = false;

  if (S.opts.mode === 'trial') {
    kicker.textContent = trackName;
    title.textContent = tr('trialTitle');
    win = true;
    const t = mine?.time ?? 0;
    rows.push(`<li class="me"><b>⏱</b><i class="dot" style="background:var(--sun)"></i><span>${esc(tr('time'))}</span><span class="tm">${fmtTime(t)}</span><span class="pts">${rec.race ? '★' : ''}</span></li>`);
    S.lapTimes.forEach((lt, i) => {
      const best = Math.min(...S.lapTimes) === lt;
      rows.push(`<li><b>${i + 1}</b><i class="dot" style="background:${best ? '#6ee07a' : '#8b7fc9'}"></i><span>${esc(tr('lap'))} ${i + 1}</span><span class="tm">${fmtTime(lt)}</span><span class="pts">${best && rec.lap ? '★' : ''}</span></li>`);
    });
    const b = bestOf(S.trackId);
    note.textContent = rec.lap || rec.race ? tr('newRecord') : b.lap ? tr('bestLap', { t: fmtTime(b.lap) }) : '';
    btns.push(['btn sun', tr('retry'), () => again()], ['btn ice', tr('pickTrack'), () => openSelect('trial')], ['btn ghost', tr('menu'), () => quitToMenu()]);
  } else {
    const cs = S.cup;
    if (cs) {
      // puntos de esta carrera
      for (const r of res) {
        const ent = entries[r.index];
        const rid = S.entryRids?.[r.index];
        void ent;
        const e = cs.roster.find((x) => x.rid === rid);
        if (e) {
          r.pts = pointsFor(r.place);
          e.pts += r.pts;
        }
      }
      cs.done.push(mine?.place ?? 8);
    }
    const last = cs && cs.idx >= cs.cup.tracks.length - 1;
    const sorted = cs && last ? res.slice().sort((a, b) => (cs.roster.find((x) => x.rid === S.entryRids[b.index])?.pts ?? 0) - (cs.roster.find((x) => x.rid === S.entryRids[a.index])?.pts ?? 0)) : res;
    if (S.players === 2) {
      const a = res.find((r) => r.human === 0);
      const b = res.find((r) => r.human === 1);
      const w = a.place < b.place ? 1 : 2;
      title.textContent = tr('winnerN', { n: w });
      win = true;
    } else {
      win = (mine?.place ?? 8) <= 3;
      title.textContent = mine?.place === 1 ? tr('win') : tr('placeN', { n: mine?.place ?? 8 });
    }
    kicker.textContent = cs ? `${cs.cup.name[lang]} · ${tr('raceN', { n: cs.idx + 1, m: cs.cup.tracks.length })} · ${trackName}` : trackName;
    res.forEach((r, i) => {
      const me = r.human >= 0;
      const tm = r.estimated ? tr('estimated') : fmtTime(r.time);
      const pts = cs ? `<span class="pts">+${r.pts ?? 0}</span>` : '<span></span>';
      const tot = cs ? `<span class="pts">${cs.roster.find((x) => x.rid === S.entryRids[r.index])?.pts ?? 0}</span>` : '<span></span>';
      rows.push(`<li class="${me ? 'me' : ''}" style="--i:${i}"><b>${r.place}</b>${dot(r.cfg)}<span>${esc(r.name)}</span>${cs ? pts : `<span class="tm">${tm}</span>`}${cs ? tot : ''}</li>`);
    });
    if (cs && last) {
      // al terminar la copa: podio y tabla final
      const fin = cs.roster.slice().sort((a, b) => b.pts - a.pts);
      const myPlace = fin.findIndex((e) => e.human === 0) + 1;
      const best = load(`cup:${cs.cup.id}`, null);
      if (!best || myPlace < best.place || (myPlace === best.place && fin[myPlace - 1].pts > best.pts)) save(`cup:${cs.cup.id}`, { place: myPlace, pts: fin[myPlace - 1].pts });
      podium.hidden = false;
      podium.innerHTML = [1, 0, 2]
        .map((k) => fin[k])
        .map((e, i) => {
          const cls = ['p2', 'p1', 'p3'][i];
          return `<div class="${cls}"><span>${dot(e.cfg)}</span><span>${esc(e.name)}</span><b>${[2, 1, 3][i]}</b><small>${e.pts} ${esc(tr('pts'))}</small></div>`;
        })
        .join('');
      title.textContent = myPlace === 1 ? tr('champion') : tr('cupPlace', { n: myPlace });
      kicker.textContent = `${cs.cup.name[lang]} · ${tr('cupFinal')}`;
      win = myPlace <= 3;
      rows.length = 0;
      fin.forEach((e, i) => rows.push(`<li class="${e.human >= 0 ? 'me' : ''}" style="--i:${i}"><b>${i + 1}</b>${dot(e.cfg)}<span>${esc(e.name)}</span><span></span><span class="pts">${e.pts}</span></li>`));
      btns.push(['btn sun', tr('retry'), () => restartCup()], ['btn ghost', tr('menu'), () => quitToMenu()]);
    } else if (cs) {
      btns.push(['btn sun', tr('next'), () => nextCupRace()], ['btn ghost', tr('menu'), () => quitToMenu()]);
    } else {
      btns.push(['btn sun', tr('retry'), () => again()], ['btn ice', tr('pickTrack'), () => openSelect(S.opts.mode)], ['btn ghost', tr('menu'), () => quitToMenu()]);
    }
    void sorted;
  }
  $('res-table').innerHTML = rows.join('');
  $('res-btns').innerHTML = '';
  for (const [cls, label, fn] of btns) {
    const b = document.createElement('button');
    b.className = cls;
    b.innerHTML = `<span>${esc(label)}</span>`;
    b.onclick = () => {
      audio.jingle('click');
      fn();
    };
    $('res-btns').appendChild(b);
  }
  setTimeout(() => audio.jingle(win ? 'win' : 'ok'), 250);
  show('s-results');
  $('res-btns').firstChild?.focus();
}

async function again() {
  await G.commercialBreak('revancha');
  startRace();
}
function nextCupRace() {
  S.cup.idx++;
  startRace();
}
function restartCup() {
  S.cup = { cup: S.cup.cup, idx: 0, roster: makeRoster(1), done: [] };
  startRace();
}

// ---------------------------------------------------------------- ratón, teclado y mando en los menús
const focusables = () => [...document.querySelectorAll('.screen.on button, .screen.on input[type=range]')].filter((b) => !b.closest('[hidden]') && b.offsetParent !== null);
function moveFocus(d) {
  const list = focusables();
  if (!list.length) return;
  let i = list.indexOf(document.activeElement);
  i = i < 0 ? 0 : (i + d + list.length) % list.length;
  list[i].focus();
  audio.jingle('click');
}
function back() {
  if (S.paused) return resumeGame();
  if (S.view === 'select') return goHome();
  if (S.view === 'help') return closeHelp();
  if (S.view === 'garage') return garage.finish();
  if (S.view === 'online') return online.exit();
  if (S.view === 'lobby') {
    online.lobby.leave();
    return online.screen('online');
  }
}
function goHome() {
  S.view = 'home';
  show('s-home');
  startAttract(S.bgTrack);
}
function closeHelp() {
  S.view = S.helpFrom || 'home';
  if (S.helpFrom === 'race') {
    show('');
    overlay('s-pause', true);
    S.view = 'race';
  } else show('s-home');
}
addEventListener('keydown', (e) => {
  if (!unlocked) unlocked = !!audio.init();
  if (S.view === 'race' && !S.paused) return;
  const t = document.activeElement;
  if (t && t.type === 'range' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) return;
  if (t && t.tagName === 'INPUT' && t.type !== 'range' && e.code !== 'Escape') return; // escribiendo el nombre o el código
  const m = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
  if (e.code in m && S.view !== 'garage') {
    moveFocus(m[e.code]);
    e.preventDefault();
  } else if (e.code === 'Escape' && S.view !== 'race') back();
});
const padEdge = { u: false, d: false, l: false, r: false, a: false, b: false };
function navPad() {
  if (S.view === 'race' && !S.paused) return;
  const p = (navigator.getGamepads?.() || []).find((x) => x && x.connected);
  if (!p) return;
  const ax = p.axes[0] || 0;
  const ay = p.axes[1] || 0;
  const st = { u: ay < -0.6 || p.buttons[12]?.pressed, d: ay > 0.6 || p.buttons[13]?.pressed, l: ax < -0.6 || p.buttons[14]?.pressed, r: ax > 0.6 || p.buttons[15]?.pressed, a: p.buttons[0]?.pressed, b: p.buttons[1]?.pressed };
  if (st.d && !padEdge.d) moveFocus(1);
  if (st.r && !padEdge.r) moveFocus(1);
  if (st.u && !padEdge.u) moveFocus(-1);
  if (st.l && !padEdge.l) moveFocus(-1);
  if (st.a && !padEdge.a) document.activeElement?.click?.();
  if (st.b && !padEdge.b) back();
  Object.assign(padEdge, st);
}

// ---------------------------------------------------------------- conexiones
function wire() {
  const click = (id, fn) => {
    $(id).addEventListener('click', () => {
      audio.init();
      audio.jingle('click');
      fn();
    });
  };
  click('m-cup', () => openSelect('cup'));
  click('m-free', () => openSelect('free'));
  click('m-trial', () => openSelect('trial'));
  click('m-two', () => openSelect('two'));
  click('m-online', () => online.open());
  click('m-garage', () => {
    S.garageFrom = 'home';
    S.view = 'garage';
    show('s-garage');
    garage.open(0, 1);
  });
  click('m-help', () => {
    S.helpFrom = 'home';
    S.view = 'help';
    renderHelp();
    show('s-help');
  });
  click('help-ok', closeHelp);
  click('sel-back', goHome);
  click('sel-go', startFromSelect);
  click('p-resume', resumeGame);
  click('p-restart', () => startRace());
  click('p-quit', () => (S.mode === 'online' ? online.leaveRace() : quitToMenu()));
  click('p-help', () => {
    S.helpFrom = 'race';
    S.view = 'help';
    renderHelp();
    overlay('s-pause', false);
    show('s-help');
  });
  click('nogl-exit', () => G.exit());
  click('crash-menu', recover);
  click('crash-reload', () => location.reload());
  $('b-pause').addEventListener('click', pauseGame);
  $('sel-cards').addEventListener('click', (e) => {
    const c = e.target.closest('.card');
    if (c) pickCard(c.dataset.id);
  });
  $('sel-cls').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    S.cls = b.dataset.v;
    for (const x of $('sel-cls').children) x.classList.toggle('on', x === b);
    audio.jingle('pick');
  });
  $('sel-laps').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    S.laps = +b.dataset.v;
    for (const x of $('sel-laps').children) x.classList.toggle('on', x === b);
    audio.jingle('pick');
  });
  addEventListener('pointerdown', () => {
    if (!unlocked) unlocked = !!audio.init();
  });
  addEventListener('resize', () => {
    stage?.resize();
    layoutViews();
  });
  // pausa del portal (ajustes abiertos, pestaña oculta)
  G.onPause(() => {
    S.portalPaused = true;
    audio.muteEngines();
    if (S.view === 'race') pauseGame();
  });
  G.onResume(() => {
    S.portalPaused = false;
    last = performance.now();
  });
  input.onPause(() => (S.paused ? resumeGame() : pauseGame()));
  G.onPrefs(() => {
    applyLang();
    online?.buildOptions();
    online?.refreshMine();
    if (S.view === 'help') renderHelp();
    if (S.view === 'select') openSelect(S.mode);
    if (S.view === 'garage') garage.i18n(), garage.renderTab(), garage.renderStats(true);
    if (S.view === 'results' && S.race?.results) {
      /* los resultados se rearman al abrir la siguiente pantalla */
    }
  }, true);
}

// ---------------------------------------------------------------- arranque
function boot() {
  applyLang();
  G.progress(0.1);
  try {
    stage = new Stage($('gl'), { quality: G.prefs.platform === 'mobile' ? 0.6 : 1 });
  } catch (e) {
    console.error(e);
    show('s-nogl');
    $('s-nogl').classList.add('on');
    G.ready();
    return;
  }
  G.progress(0.3);
  stage.onContext = (lost) => {
    const n = $('gfx-note');
    n.hidden = !lost;
    if (lost) n.textContent = tr('gfxLost');
  };
  input = new Input(document.body);
  hud = new Hud($('hud'), getTrack('pradera'), tr);
  garage = new Garage($('s-garage'), tr, {
    stage,
    audio,
    onDone: () => {
      if (S.garageFrom === 'lobby') return online.afterGarage();
      S.view = 'home';
      show('s-home');
    },
  });
  online = makeOnline();
  wire();
  // "2 jugadores" necesita teclado o mandos
  const two = () => ($('m-two').hidden = G.prefs.platform === 'mobile' && !input.pads.length);
  two();
  addEventListener('gamepadconnected', two);
  addEventListener('gamepaddisconnected', two);
  const first = load('track', 'pradera');
  startAttract(first);
  G.progress(0.9);
  // un link de sala o una partida online en curso que se recargó: directo a la pantalla online
  if (online.pending) {
    online.active = true;
    S.view = 'online';
    show('s-online');
  } else {
    S.view = 'home';
    show('s-home');
  }
  G.gameplay(false);
  requestAnimationFrame(frame);
  G.ready();
}

/** El modo online: game.js le presta lo que necesita de la pantalla, la carrera y los menús. */
function makeOnline() {
  return new OnlineMode({
    G,
    tr,
    $,
    lang: LANG,
    show,
    overlay,
    audio,
    input,
    stage: () => stage,
    hud: () => hud,
    newHud: (R) => (hud = new Hud($('hud'), R.T, tr)),
    views: () => S.views,
    layout: () => layoutViews(),
    setView: (v) => {
      S.view = v;
    },
    setRace: (R, init) => {
      S.mode = 'online';
      S.race = R;
      S.players = 1;
      S.bg = null;
      S.cup = null;
      S.paused = false;
      S.trackId = init.track;
      S.opts = { mode: 'online', cls: init.cls, laps: init.laps, track: init.track };
    },
    drain: (R, events) => drainEvents(R, events, S.views),
    cfg: () => loadConfig(0),
    openGarage: (from) => {
      S.garageFrom = from;
      S.view = 'garage';
      show('s-garage');
      garage.open(0, 1);
    },
    goHome: () => {
      S.mode = null;
      S.race = null;
      S.paused = false;
      stage.marks = false;
      layoutViews();
      S.view = 'home';
      show('s-home');
      startAttract(S.bgTrack || load('track', 'pradera'));
    },
  });
}
boot();

// para pruebas y depuración
window.__tuercas = { S, get stage() { return stage; }, startRace, openSelect, showResults };
