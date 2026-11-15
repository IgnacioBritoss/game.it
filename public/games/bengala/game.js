/**
 * Bengala — pegamento del juego: bucle, entrada, interfaz, tutorial, guardado, modos y SDK del portal.
 *
 * Se juega por funciones: un rato corto de cielo a pantalla completa y, entre una y otra, el taller (el panel de compras).
 * Modos: la gira (se guarda sola; llenar la plaza habilita viajar a la sede siguiente), el show del día (igual para todos),
 * la contrarreloj (de cero, con medallas y reto por link) y el duelo online (el servidor rehace tu partida).
 * Todo lo que se decide pasa en shared/sim.js; acá se mandan acciones a la sim y se muestra lo que devuelve.
 */
import { TPS, FW, SKY_MAX, GENS, UPS, COLS, SHAPES, NS, REC_N, CONS, NODES, VENUES, ACH, ACH_TEXT, CON_TEXT, MILESTONES, MEDALS, SPRINT_TIMES, RACE, fxText } from './shared/data.js';
import { create, step, act, genCost, genAfford, recCost, upAvail, nodeAvail, starGain, showGoal, dailySetup, ovMul, raceInfo, lanternX } from './shared/sim.js';
import { fmt, fmtClock } from './shared/num.js';
import { pack, unpack, encode, decode } from './shared/save.js';
import { View } from './render.js';
import { ICONS, GOLD, VENUE_ART, recipeIcon, genIcon, glowSprite, consLayout, drawCons, upIcon } from './art.js';
import { sfx, buzz } from './sound.js';
import { tx, pick, lang } from './textos.js';
import { makeDuel } from './net.js';
import { today, dayNumber, msUntilNext, fmtClock as dayClock, loadDay, saveDay, record, loadStats, liveStreak, markPortal, share, shareLink } from '/shared/daily.js';

const G = window.GameIt;
const ID = 'bengala';
const EPOCH = '2026-11-12'; // día del show n.º 1
const TICK = 1000 / TPS;
const FOOT = 86; // alto de la franja del público y el botón de ovación
const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- guardado (siempre con try/catch)
const read = (k, d = null) => {
  try {
    return JSON.parse(localStorage.getItem(`gameit:${ID}:${k}`)) ?? d;
  } catch {
    return d;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(`gameit:${ID}:${k}`, JSON.stringify(v));
  } catch {}
};

// ---------------------------------------------------------------- estado
const view = new View($('sky'));
let solo = null; // la gira (siempre cargada)
let soloClock = 0;
let cur = null; // la sim que se está jugando
let mode = 'home'; // home | solo | sprint | reto | daily | duel
let ui = 'home'; // home | shop | show
let run = null; // datos de la contrarreloj, show del día, reto o duelo en curso
let paused = false;
let hold = false; // el tutorial frena la función hasta que hagas lo que pide
let screen = 'home';
let opts = { sci: false, fx: 'auto' };
let hints = 0; // pasos del tutorial ya vistos (bits)
let seen = 0; // pestañas ya descubiertas: 1 mejoras, 2 recetas, 4 gira
let tut = -1; // paso del tutorial en curso
let tutMark = 0;
let bests = read('best', {});
let tab = 'gens';
let buyMode = 1;
let reto = null;
let fullNow = false;
let chainAt = 0;
let rewardOk = false;
const events = [];
const cache = new Map();
const pointer = { down: false, x: 0, y: 0 };
const key = { x: FW / 2, y: 110, on: false };
const F = (n) => fmt(n, lang(), opts.sci);
const set = (id, v) => {
  if (cache.get(id) === v) return;
  cache.set(id, v);
  const el = $(id);
  if (el) el.textContent = v;
};
const html = (id, v) => {
  const k = `${id}:html`;
  if (cache.get(k) === v) return false;
  cache.set(k, v);
  const el = $(id);
  if (el) el.innerHTML = v;
  return true;
};
const cls = (id, name, on) => {
  const k = `${id}.${name}`;
  if (cache.get(k) === on) return;
  cache.set(k, on);
  $(id)?.classList.toggle(name, on);
};
const hide = (id, on) => {
  const k = `${id}:h`;
  if (cache.get(k) === on) return;
  cache.set(k, on);
  const el = $(id);
  if (el) el.hidden = on;
};
const bar = (id, p) => {
  const v = `scaleX(${clamp(p || 0, 0, 1).toFixed(3)})`;
  if (cache.get(id) === v) return;
  cache.set(id, v);
  const el = $(id);
  if (el) el.style.transform = v;
};
const cur$ = (icon, n) => `${ICONS[icon]}<span>${n}</span>`;

const ICON = { gen: [], rec: [] };
const starSprites = [glowSprite('#bfe0ff'), glowSprite(GOLD)];

function loadSolo() {
  const u = unpack(read('save'));
  if (u) {
    solo = u.S;
    hints = u.hints | 0;
    seen = u.seen | 0;
    if (u.opts) opts = { ...opts, ...u.opts };
  } else solo = create({ seed: Math.floor(Math.random() * 2 ** 31) });
}
const saveData = () => pack(solo, Date.now(), { hints, opts, seen });
function saveSolo() {
  if (solo) write('save', saveData());
}

// ---------------------------------------------------------------- pantallas y avisos
function show(id) {
  screen = id || '';
  for (const s of $$('.screen')) s.classList.toggle('on', s.id === `s-${id}`);
  G.gameplay(!!cur && !screen);
}
/** Cambia entre el menú, el taller (cielo chico y panel) y la función (cielo entero). */
function setUi(name) {
  ui = name;
  const app = $('app');
  app.classList.toggle('home', name === 'home');
  app.classList.toggle('shop', name === 'shop');
  app.classList.toggle('show', name === 'show');
  hide('race', !(run && run.kind === 'duel'));
  cache.clear();
  view.ambient = name === 'shop';
  view.aim = null;
  layout();
  if (name !== 'show') coachOff();
}
function layout() {
  const wide = matchMedia('(min-aspect-ratio: 5/4)').matches;
  if (ui === 'show') view.setLayout(FOOT, 56);
  else view.setLayout(ui === 'shop' ? 10 : 0, ui === 'shop' && wide ? 56 : 0);
  requestAnimationFrame(() => {
    view.resize();
    coachPlace();
  });
}
function toast(text) {
  const box = $('toasts');
  const d = document.createElement('div');
  d.textContent = text;
  box.appendChild(d);
  while (box.children.length > 2) box.firstChild.remove();
  setTimeout(() => d.remove(), 3200);
}
/** Ventana con título, contenido y botones: [{ label, fn, ghost }]. Escape o el fondo eligen el último botón "ghost". */
let modalBack = null;
function modal(title, body, buttons) {
  $('m-title').textContent = title;
  $('m-body').innerHTML = body;
  const box = $('m-btns');
  box.innerHTML = '';
  modalBack = null;
  for (const b of buttons) {
    const el = document.createElement('button');
    el.className = `btn${b.ghost ? ' ghost' : ''}${b.cls ? ` ${b.cls}` : ''}`;
    el.innerHTML = `<span>${esc(b.label)}</span>`;
    const go = () => {
      if (!b.keep) closeModal();
      b.fn?.(el);
    };
    el.onclick = go;
    if (b.ghost) modalBack = go;
    box.appendChild(el);
  }
  $('modal').hidden = false;
  box.lastChild?.focus();
}
function closeModal() {
  $('modal').hidden = true;
  modalBack = null;
}
const ask = (title, body, yes, fn, no = tx('cancel')) => modal(title, `<p>${esc(body)}</p>`, [{ label: no, ghost: true }, { label: yes, fn }]);

// ---------------------------------------------------------------- el globo del tutorial
let coachEl = ''; // id de lo que señala
let coachT = 0;
/** Muestra el globo señalando `target` (un elemento, o nada: arriba del cielo). `o.btn` le pone un botón; `o.ms` lo cierra solo. */
function coach(text, target, o = {}) {
  coachEl = target || '';
  $('coach-t').textContent = text;
  const b = $('coach-ok');
  b.hidden = !o.btn;
  if (o.btn) {
    b.textContent = o.btn;
    b.onclick = o.fn;
  }
  $('coach').hidden = false;
  clearTimeout(coachT);
  if (o.ms) coachT = setTimeout(coachOff, o.ms);
  coachPlace();
}
function coachOff() {
  clearTimeout(coachT);
  $('coach').hidden = true;
  coachEl = '';
  tipKey = '';
}
function coachPlace() {
  const c = $('coach');
  if (c.hidden) return;
  const cw = c.offsetWidth;
  const ch = c.offsetHeight;
  let x;
  let y;
  let dir = 'none';
  const el = coachEl && $(coachEl);
  if (coachEl && !(el && el.offsetWidth)) return coachOff(); // lo que señalaba ya no está a la vista
  if (el) {
    const r = el.getBoundingClientRect();
    x = r.left + r.width / 2;
    if (r.top - ch - 22 > 60) {
      y = r.top - ch - 20;
      dir = 'up';
    } else {
      y = r.bottom + 20;
      dir = 'down';
    }
  } else {
    const r = $('stage').getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top + Math.max(170, r.height * 0.24);
  }
  const left = clamp(x - cw / 2, 10, innerWidth - cw - 10);
  c.style.transform = `translate(${Math.round(left)}px, ${Math.round(y)}px)`;
  c.style.setProperty('--ax', `${clamp(x - left, 22, cw - 22)}px`);
  c.className = `coach ${dir}${$('coach-ok').hidden ? '' : ' still'}`;
}

// ---------------------------------------------------------------- acciones
function doAct(a) {
  if (!cur || (run && (run.done || run.clock() < 0))) return false;
  const ok = act(cur, a, events);
  if (ok && run && run.kind === 'duel') duel.record(cur.tick, a);
  return ok;
}
function fire(x, y) {
  if (!cur || paused || hold || screen || ui !== 'show') return;
  if (doAct(['T', Math.round(clamp(x, 0, FW - 1)), Math.round(clamp(y, 0, SKY_MAX))])) return;
  if (cur.fin > 0 || !cur.run || cur.run.over) return;
  if (cur.fuse < 1) {
    cls('h-fuses', 'empty', true);
    setTimeout(() => cls('h-fuses', 'empty', false), 260);
    sfx('no');
  }
}
function finale() {
  if (!doAct(['F'])) return;
  if (hold) {
    hold = false;
    hints |= 8;
    coachOff();
    soloClock = performance.now();
  }
}

/** Lo que pasó en la sim desde el último cuadro: chispas, sonidos y avisos. Con `quiet` (poniéndose al día) no se dibuja. */
function handle(quiet) {
  for (const e of events) {
    switch (e.e) {
      case 'burst':
        if (run?.kind === 'duel') duel.burst();
        if (quiet) break;
        view.burst(e);
        if (e.g === 0 || e.mini) sfx('fizz');
        else sfx('boom', e.k);
        if (e.man) view.text(e.x, e.y - 6, `${e.k > 1 ? `x${e.k}  ` : ''}+${F(e.gain)}`, false, e.k > 1 ? GOLD : '#fff1d0');
        break;
      case 'launch':
        if (quiet) break;
        view.launch(e.g);
        if (e.g < 0) sfx('launch');
        break;
      case 'chain':
        if (quiet || e.k < 3 || performance.now() - chainAt < 450) break;
        chainAt = performance.now();
        view.text(e.x, e.y - 15, tx('chain', { k: e.k }), true, GOLD);
        sfx('chain', e.k);
        buzz(18);
        break;
      case 'lan':
        if (quiet) break;
        view.gold(e.x, e.y, false);
        view.text(e.x, e.y - 7, `+${F(e.gain)}`, false, GOLD);
        sfx('lantern');
        break;
      case 'plane':
        view.gold(e.x, e.y, true);
        view.text(e.x, e.y + 12, `+${F(e.gain)}`, true, GOLD);
        sfx('plane');
        buzz(30);
        break;
      case 'fin':
        sfx('finale');
        buzz(70);
        break;
      case 'finEnd':
        sfx('crowd');
        break;
      case 'con':
        toast(tx('jobDone', { n: e.rw }));
        sfx('up');
        break;
      case 'ach':
        toast(tx('achGot', { x: pick(ACH[e.i].name) }));
        sfx('ach');
        break;
      case 'full':
        fullNow = true;
        view.text(FW / 2, 90, tx('full'), true, GOLD);
        sfx('win');
        buzz(120);
        break;
      case 'over':
        view.text(FW / 2, 120, tx('timeUp'), true, '#fff1d0');
        sfx('go');
        break;
      case 'runEnd':
        if (run) run.rounds.push(Math.floor(e.got));
        else if (mode === 'solo') setTimeout(() => showResult(e), 650);
        break;
    }
  }
  events.length = 0;
}

// ---------------------------------------------------------------- bucle
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  let frac = 0;
  if (cur && !paused) {
    if (mode === 'solo') frac = hold ? 0 : tickSolo(now);
    else if (run) frac = tickRun();
    if (pointer.down && cur.fin > 0 && !screen) fire(pointer.x, pointer.y); // en el Gran Final alcanza con dejar apretado
  }
  view.draw(cur, frac, paused ? 0 : dt);
  if (!$('m-stars').hidden) drawStars(dt);
}

/** La gira: el reloj de la sim solo corre mientras hay función (o ensayo). */
function tickSolo(now) {
  if (!solo.run) {
    soloClock = now;
    return 0;
  }
  const ms = now - soloClock;
  if (ms > 600) {
    soloClock = now; // la pestaña estuvo tapada: la función sigue desde acá
    return 0;
  }
  const n = Math.floor(ms / TICK);
  if (!n) return ms / TICK;
  for (let i = 0; i < n; i++) step(solo, events);
  soloClock += n * TICK;
  handle(false);
  return clamp((now - soloClock) / TICK, 0, 1);
}

function tickRun() {
  const t = run.clock();
  if (t < 0) {
    const c = Math.ceil(-t / 1000);
    if (c !== run.count) {
      run.count = c;
      set('count', String(c));
      sfx('tick');
    }
    return 0;
  }
  if (run.count) {
    run.count = 0;
    set('count', '');
    sfx('go');
  }
  if (run.done) return 0;
  let n = Math.min(run.limit + 60, Math.floor(t / TICK)) - cur.tick;
  const quiet = n > 6;
  if (n > 600) n = 600;
  for (let i = 0; i < n; i++) step(cur, events);
  handle(quiet);
  if (run.kind === 'duel') duel.pump(cur, run.rounds);
  if (cur.tick >= run.limit && (!cur.run || cur.tick >= run.limit + 60)) {
    finishRun();
    return 0;
  }
  // de la función al taller y vuelta, según el horario
  const phase = cur.run ? 'show' : 'shop';
  if (phase !== ui) {
    setUi(phase);
    if (phase === 'shop') {
      buildTabs();
      sfx('up');
    } else {
      view.clear();
      sfx('go');
    }
  }
  return clamp(t / TICK - cur.tick, 0, 1);
}

// ---------------------------------------------------------------- la gira: taller, función y resultado
function enterSolo() {
  mode = 'solo';
  cur = solo;
  run = null;
  hold = false;
  view.setVenue(solo.venue);
  view.clear();
  show('');
  if (solo.st.runs === 0 && !(hints & 1)) startTutorial();
  else toShop();
}
function toShop() {
  setUi('shop');
  buildTabs();
  refresh();
  shopTips();
}
function startShow() {
  if (mode !== 'solo' || solo.run?.reh === 0) return;
  saveSolo(); // si se recarga a mitad de la función, se vuelve a este taller
  if (!act(solo, ['G'], events)) return;
  events.length = 0;
  fullNow = false;
  if (solo.gens[0]) hints |= 130;
  tut = -1;
  view.hint = '';
  view.clear();
  coachOff();
  setUi('show');
  soloClock = performance.now();
  sfx('go');
  refresh();
}
let countT = 0;
function showResult(e) {
  if (mode !== 'solo') return;
  const S = solo;
  const goal = showGoal(S);
  $('rn-kicker').textContent = tx('showN', { n: S.st.runs });
  $('rn-chain').innerHTML = `${ICONS.chain}<span>${esc(tx('bestChain', { k: Math.max(1, e.k) }))}</span>`;
  $('rn-rec').hidden = !(e.rec && S.st.runs > 1);
  $('rn-rec').textContent = tx('record');
  $('rn-stamp').hidden = !fullNow;
  $('rn-stamp').textContent = tx('full');
  $('rn-bar').style.transform = `scaleX(${clamp(S.best / goal, 0, 1).toFixed(3)})`;
  $('rn-goal').classList.toggle('done', !!S.full);
  $('rn-goal-t').innerHTML = `${ICONS.flag}`.replace('<svg', '<svg style="display:inline;vertical-align:-2px"') + ` ${esc(tx('goalOf', { a: F(S.best), b: F(goal) }))}`;
  $('rn-x2').hidden = !(rewardOk && !S.lastX);
  // el número sube contando
  clearInterval(countT);
  let k = 0;
  const el = $('rn-score');
  countT = setInterval(() => {
    k++;
    el.textContent = F(e.got * Math.min(1, (k / 16) ** 2));
    if (k >= 16) clearInterval(countT);
  }, 30);
  $('m-run').hidden = false;
  $('rn-ok').focus();
  sfx(fullNow ? 'star' : e.rec ? 'up' : 'buy');
  saveSolo();
  G.gameplay(false);
}
function closeResult() {
  if ($('m-run').hidden) return;
  clearInterval(countT);
  $('m-run').hidden = true;
  G.gameplay(true);
  view.clear();
  toShop();
}

// ---------------------------------------------------------------- tutorial: de a un paso, jugando entre uno y otro
function startTutorial() {
  act(solo, ['H', 0]);
  events.length = 0;
  setUi('show');
  $('app').classList.add('reh');
  soloClock = performance.now();
  tut = 0;
  view.hint = 'tap';
  coach(tx('tut0'));
}
function tutorial(S) {
  if (tut === 0 && S.st.man >= 2 && !S.sh.length) {
    tut = 1;
    act(S, ['H', 1]);
    view.hint = 'lan';
    coach(tx('tut1'));
  } else if (tut === 1) {
    if (S.st.lan >= 1) {
      if (S.bl.length || S.chains.length) return; // que termine la cadena del farolito
      tut = 2;
      tutMark = S.st.chains;
      act(S, ['H', 2]);
      view.hint = 'sh';
      coach(tx('tut2'));
    } else if (!S.la.some((l) => !l.dead && lanternX(l, S.tick) < FW - 20)) {
      S.la.length = 0;
      act(S, ['H', 1]); // se fue: otro farolito
    }
  } else if (tut === 2) {
    if (S.st.chains > tutMark) {
      tut = 3;
      view.hint = '';
      coach(tx('tut3', { s: Math.round(S.m.showLen / TPS) }), null, {
        btn: tx('tutGo'),
        fn: () => {
          hints |= 1;
          $('app').classList.remove('reh');
          coachOff();
          startShow();
        },
      });
    } else if (!S.sh.length && !S.bl.length) act(S, ['H', 2]); // no los enganchó: van de nuevo
  }
}
/** Avisos de una sola vez durante la función. */
function showTips(S) {
  if (mode !== 'solo' || !S.run || S.run.reh || S.run.over) return;
  if (!(hints & 8) && S.ov >= 100 && !S.fin) {
    hold = true; // se frena hasta que toque el botón
    if ($('coach').hidden) coach(tx('tutFin'), 'b-ov');
  } else if (!(hints & 4) && S.st.runs >= 1 && S.run.end - S.tick < S.m.showLen - 60 && $('coach').hidden) {
    hints |= 4;
    coach(tx('tutOv'), 'b-ov', { ms: 4500 });
  }
}
/** Avisos de una sola vez en el taller: uno por vez, y se queda hasta que hagas lo que dice. */
let tipKey = '';
function shopTips() {
  if (mode !== 'solo' || ui !== 'shop') return;
  const S = solo;
  let k = '';
  let el = '';
  if (!S.gens[0] && !(hints & 2)) {
    if (tab !== 'gens') return setTab('gens');
    k = 'tut4';
    el = 'g-b-0';
  } else if (!(hints & 128) && S.st.runs <= 2) {
    hints |= 2;
    k = 'tut5';
    el = 'b-go';
  } else if (S.full && !(hints & 32) && $('t-sky')) {
    k = 'tutFull';
    el = 't-sky';
  } else if (!(hints & 16) && S.polv >= recCost(S) && $('t-lab')) {
    k = 'tutRec';
    el = 't-lab';
  } else if (!(hints & 64) && S.stars >= 5 && $('t-sky')) {
    k = 'tutStars';
    el = tab === 'sky' ? 'k-cons' : 't-sky';
  }
  if (k === tipKey && coachEl === el) return;
  if (k) coach(tx(k), el);
  else coachOff();
  tipKey = k;
}

// ---------------------------------------------------------------- partidas por tiempo
function toHome() {
  if (mode === 'solo') saveSolo();
  mode = 'home';
  cur = null;
  run = null;
  hold = false;
  tut = -1;
  view.hint = '';
  $('app').classList.remove('reh');
  $('m-run').hidden = true;
  set('count', '');
  view.clear();
  view.setVenue(solo.venue);
  setUi('home');
  refreshHome();
  show('home');
}

function startRun(o) {
  run = { kind: o.kind, mins: o.mins, limit: SPRINT_TIMES[o.mins] * TPS, cfg: o.cfg, target: o.target || 0, practice: !!o.practice, done: false, rounds: o.rounds || [], count: 0, results: null, n: o.n || 0, date: o.date || '' };
  cur = o.S || create({ ...o.cfg, plan: o.mins });
  mode = o.kind;
  if (o.kind === 'duel') run.clock = () => duel.now() - o.startAt;
  else {
    const t0 = performance.now() + 3000;
    run.clock = () => performance.now() - t0;
  }
  tab = 'gens';
  events.length = 0;
  view.setVenue(cur.venue);
  view.clear();
  coachOff();
  setUi(cur.run ? 'show' : 'shop');
  buildTabs();
  show('');
  refresh();
}

function finishRun() {
  run.done = true;
  if (run.kind === 'duel') {
    duel.finish(cur);
    setTimeout(() => run && showResults(), 900);
  } else setTimeout(() => run && showEnd(), 900);
}

const medalOf = (score, mins) => {
  const m = MEDALS[mins] || MEDALS[3];
  let k = -1;
  while (k < 4 && score >= m[k + 1]) k++;
  return k;
};
const medalName = (k) => (k < 0 ? tx('noMedal') : tx('medals').split(',')[k]);

function showEnd() {
  const score = Math.floor(cur.total);
  const chain = cur.st.bestK;
  const mins = run.mins;
  const k = medalOf(score, mins);
  const bk = `s${mins}`;
  const prev = bests[bk];
  let extra = '';
  let title = tx('result');
  $('e-status').textContent = '';
  if (run.kind === 'daily') {
    $('e-kicker').textContent = tx('dailyT', { n: run.n });
    if (!run.practice) {
      saveDay(ID, 'all', { score, chain, medal: k }, run.date);
      const st = record(ID, 'all', { date: run.date, won: true, score: Math.max(0, k + 1) });
      markPortal(ID, { date: run.date, done: true, won: true, streak: liveStreak(st, run.date) });
      solo.st.daily++;
      saveSolo();
      extra = tx('dailyStreak', { n: liveStreak(st, run.date), p: st.played });
    }
    $('e-again').querySelector('span').textContent = tx('dailyPractice');
    $('e-share').querySelector('span').textContent = tx('shareB');
  } else {
    $('e-kicker').textContent = `${tx('sprintT')} · ${tx('mins', { n: mins })}`;
    if (run.kind === 'reto' && run.target) {
      const won = score > run.target;
      title = tx(won ? 'retoWin' : 'retoLose', { a: F(score), b: F(run.target) });
      sfx(won ? 'win' : 'lose');
    }
    if (!prev || score > prev.score) {
      bests[bk] = { score };
      write('best', bests);
      extra = tx('newBest');
      if (run.kind !== 'reto') sfx('win');
    } else extra = tx('best', { n: F(prev.score) });
    $('e-again').querySelector('span').textContent = tx('again');
    $('e-share').querySelector('span').textContent = tx('retoShare');
  }
  $('e-title').textContent = title;
  $('e-score').textContent = F(score);
  $('e-chain').textContent = tx('bestChain', { k: chain });
  $('e-medal').textContent = medalName(k);
  $('e-extra').textContent = extra;
  $('e-rounds').innerHTML = run.rounds.map((v, i) => `<span class="chip">${i + 1} · ${F(v)}</span>`).join('');
  run.score = score;
  run.chain = chain;
  setUi('home');
  show('end');
}

// ---------------------------------------------------------------- inicio
function refreshHome() {
  const has = solo.st.runs > 0;
  $('b-play-t').textContent = tx(has ? 'cont' : 'play');
  $('b-play-sub').textContent = has ? tx('contSub', { v: pick(VENUES[solo.venue].name), n: solo.st.runs + 1 }) : '';
  const date = today();
  const day = loadDay(ID, 'all', date);
  const n = dayNumber(EPOCH, date);
  $('b-daily-sub').textContent = day ? tx('dailyDone', { s: F(day.score) }) : tx('dailyNew', { n });
  hide('reto-card', !reto);
  if (reto) $('reto-body').textContent = tx('retoBody', { m: reto.mins, n: F(reto.score) });
}

// ---------------------------------------------------------------- show del día
let dailyStop = null;
function openDaily() {
  const date = today();
  const n = dayNumber(EPOCH, date);
  const cfg = dailySetup(date);
  const day = loadDay(ID, 'all', date);
  const st = loadStats(ID, 'all');
  const rule = pick(VENUES[cfg.venue].rule);
  $('d-title').textContent = tx('dailyT', { n });
  $('d-venue').textContent = pick(VENUES[cfg.venue].name);
  $('d-rule').textContent = rule;
  $('d-colors').innerHTML = cfg.colors.map((c) => `<i style="background:${COLS[c].hex}" title="${esc(pick(COLS[c].name))}"></i>`).join('');
  for (const id of ['d-yours', 'd-next', 'd-share']) {
    $(id).hidden = !day;
    cache.delete(`${id}:h`);
  }
  if (day) $('d-yours').textContent = `${tx('dailyYours', { n: F(day.score), k: day.chain })} · ${medalName(day.medal)}`;
  $('d-stats').textContent = st.played ? tx('dailyStreak', { n: liveStreak(st, date), p: st.played }) : '';
  $('d-status').textContent = '';
  $('d-go').querySelector('span').textContent = tx(day ? 'dailyPractice' : 'dailyGo');
  $('d-go').onclick = () => {
    clearInterval(dailyStop);
    startRun({ kind: 'daily', mins: 3, cfg, practice: !!day, n, date });
  };
  $('d-share').onclick = async () => {
    const r = await share(`${tx('shareTxt', { n, s: F(day.score), k: day.chain })}\n${shareLink(ID)}`);
    $('d-status').textContent = r === 'failed' ? '' : tx('shared');
  };
  clearInterval(dailyStop);
  const tickNext = () => {
    if (today() !== date) return openDaily();
    $('d-next').textContent = tx('dailyNext', { t: dayClock(msUntilNext()) });
  };
  tickNext();
  dailyStop = setInterval(tickNext, 1000);
  show('daily');
}

// ---------------------------------------------------------------- contrarreloj y reto
let spMins = 3;
function openSprint() {
  const m = MEDALS[spMins];
  const best = bests[`s${spMins}`];
  const k = best ? medalOf(best.score, spMins) : -1;
  for (const b of $$('#sp-time button')) {
    b.textContent = tx('mins', { n: b.dataset.v });
    b.classList.toggle('on', +b.dataset.v === spMins);
  }
  $('sp-best').textContent = best ? `${tx('best', { n: F(best.score) })} · ${medalName(k)}` : tx('noBest');
  $('sp-medals').innerHTML = tx('medals')
    .split(',')
    .map((name, i) => `<li class="${i <= k ? 'got' : ''}"><b>${esc(name)}</b>${F(m[i])}</li>`)
    .join('');
  show('sprint');
}
const newSeed = () => Math.floor(1 + Math.random() * (2 ** 31 - 2)).toString(36);
const startSprint = (mins, seed) => startRun({ kind: 'sprint', mins, cfg: { seed: `r${seed}`, mode: 'sprint' } });
const startReto = () => reto && startRun({ kind: 'reto', mins: reto.mins, cfg: { seed: `r${reto.seed}`, mode: 'sprint' }, target: reto.score });
function parseReto() {
  const m = /^([0-9a-z]{1,8})-(\d{1,2})-([0-9a-z]{1,14})$/.exec(new URLSearchParams(location.search).get('reto') || '');
  if (!m || !SPRINT_TIMES[m[2]]) return null;
  return { seed: m[1], mins: +m[2], score: parseInt(m[3], 36) };
}

// ---------------------------------------------------------------- duelo online
const duel = makeDuel({
  show: (id) => {
    if (cur && mode !== 'home') {
      if (mode === 'solo') saveSolo();
      mode = 'home';
      cur = null;
      run = null;
      setUi('home');
    }
    show(id);
  },
  begin: (room, S, rounds) => startRun({ kind: 'duel', mins: room.race.limit / 60, cfg: { seed: room.race.seed, mode: 'sprint' }, startAt: room.race.startAt, S, rounds }),
  lobby: () => {
    mode = 'home';
    cur = null;
    run = null;
    setUi('home');
  },
  room: (room) => room && room.state === 'finished' && screen === 'results' && showResults(),
  closed: () => {
    if (mode === 'duel') toHome();
    show('online');
  },
  end: (results) => {
    if (!run || run.kind !== 'duel') return;
    run.results = results;
    run.done = true;
    showResults();
  },
  smoke: (name) => {
    view.smoke = 5.2;
    toast(tx('smokeFrom', { n: name }));
    sfx('smoke');
  },
  smoked: (name) => toast(tx('smokeTo', { n: name })),
  rival: (color, n) => view.farFlash(color, n),
});

function duelRows() {
  const me = duel.me;
  const rows = [{ id: me, name: duel.lobby.name, color: '#ffcf33', score: Math.floor(cur?.total || 0), chain: cur?.st.bestK || 0, done: !!run?.done }];
  for (const [id, o] of duel.others) rows.push({ id, ...o });
  return rows.sort((a, b) => b.score - a.score);
}
function showResults() {
  if (!run) return;
  const final = run.results;
  const me = duel.me;
  const rows = final ? final.map((r) => ({ ...r, done: !r.dnf })) : duelRows();
  const place = rows.findIndex((r) => r.id === me) + 1;
  $('res-title').textContent = !final ? tx('waitOthers') : place === 1 ? tx('win') : tx('place', { n: place });
  $('res-rank').innerHTML = rows
    .map((r, i) => `<li class="${r.id === me ? 'me' : ''}"><span>${i + 1}.</span><i style="background:${esc(r.color || '#fff')}"></i><span>${esc(r.name)}${r.id === me ? ` (${tx('you')})` : ''}<small> · x${r.chain || 0}${final && r.dnf ? ` · ${tx('dnf')}` : ''}</small></span><b>${F(r.score || 0)}${!final && !r.done ? '…' : ''}</b></li>`)
    .join('');
  const a = duel.lobby.againState(!!final);
  $('res-again').disabled = !a.enabled;
  $('res-again').querySelector('span').textContent = a.text;
  if (final && !run.cheered) {
    run.cheered = true;
    sfx(place === 1 ? 'win' : 'lose');
  }
  setUi('home');
  show('results');
}

// ---------------------------------------------------------------- pestañas del taller (aparecen a medida que hacen falta)
const TAB_T = { gens: 'tabGens', shop: 'tabShop', lab: 'tabLab', sky: 'tabSky' };
function tabList(S) {
  if (run) return ['gens', 'shop', 'lab'];
  const was = seen;
  if (S.ups.some(Boolean) || UPS.some((u, i) => upAvail(S, i) && u.cost <= Math.max(S.ch, S.best) * 3)) seen |= 1;
  if (S.polv >= 1 || S.recN > 1) seen |= 2;
  if (S.full || S.starsTot > 0 || S.venue > 0 || S.laps > 0) seen |= 4;
  const list = ['gens'];
  if (seen & 1) list.push('shop');
  if (seen & 2) list.push('lab');
  if (seen & 4) list.push('sky');
  list.fresh = seen & ~was;
  return list;
}
let tabSig = '';
function buildTabs() {
  const list = tabList(cur);
  if (!list.includes(tab)) tab = 'gens';
  tabSig = list.join();
  const bit = { shop: 1, lab: 2, sky: 4 };
  $('tabs').innerHTML = list.map((id) => `<button data-tab="${id}" id="t-${id}" class="${list.fresh & bit[id] ? 'new' : ''}">${ICONS[id]}<span>${tx(TAB_T[id])}</span></button>`).join('');
  hide('tabs', list.length < 2);
  cache.delete('tabs:h');
  $('tabs').hidden = list.length < 2;
  setTab(tab);
}
function setTab(id) {
  tab = id;
  cache.clear();
  for (const b of $$('#tabs button')) b.classList.toggle('on', b.dataset.tab === id);
  $('pane').innerHTML = PANES[id].build();
  $('pane').scrollTop = 0;
  PANES[id].sig = '';
  if (mode === 'solo') {
    if (id === 'lab') hints |= 16;
    if (id === 'sky' && solo.full) hints |= 32;
  }
  refresh();
  shopTips();
}

let labSel = -1;
const nextMile = (n) => MILESTONES.find((m) => m > n);
const prevMile = (n) => [...MILESTONES].reverse().find((m) => m <= n) || 0;
const qtyFor = (S, i) => (buyMode ? buyMode : Math.max(1, genAfford(S, i)));
const genShown = (S, i) => i === 0 || S.gens[i] > 0 || S.gens[i - 1] > 0;

const PANES = {
  gens: {
    build: () =>
      `<div class="phead"><span></span><div class="seg" id="g-mode">${[1, 10, 0].map((v) => `<button data-a="mode" data-v="${v}" class="${buyMode === v ? 'on' : ''}">${v ? `x${v}` : tx('max')}</button>`).join('')}</div></div>${GENS.map(
        (g, i) =>
          `<div class="row" id="g-row-${i}" hidden><div class="ico" style="background-image:url(${ICON.gen[i]})"></div><div><b>${esc(pick(g.name))}<em id="g-n-${i}" hidden></em></b><small><span id="g-s-${i}"></span><i><u id="g-m-${i}"></u></i><span id="g-x-${i}"></span></small></div><button class="buy" data-a="gen" data-i="${i}" id="g-b-${i}"><span id="g-c-${i}"></span><small id="g-q-${i}"></small></button></div>`,
      ).join('')}`,
    upd(S) {
      for (let i = 0; i < GENS.length; i++) {
        const on = genShown(S, i);
        hide(`g-row-${i}`, !on);
        if (!on) continue;
        const q = qtyFor(S, i);
        const cost = genCost(S, i, q);
        const n = S.gens[i];
        const m = nextMile(n);
        const p = prevMile(n);
        hide(`g-n-${i}`, !n);
        set(`g-n-${i}`, String(n));
        set(`g-s-${i}`, tx('each', { n: F(GENS[i].prod * S.m.gen[i] * S.m.all) }));
        bar(`g-m-${i}`, m ? (n - p) / (m - p) : 1);
        set(`g-x-${i}`, m ? `x${S.m.mileMul} · ${m}` : '');
        set(`g-c-${i}`, F(cost));
        set(`g-q-${i}`, q > 1 ? `x${q}` : '');
        cls(`g-b-${i}`, 'can', cost <= S.ch);
      }
    },
  },
  shop: {
    build: () => '<div id="s-list" style="display:grid;gap:8px"></div>',
    upd(S) {
      const list = [];
      for (let i = 0; i < UPS.length; i++) if (upAvail(S, i)) list.push(i);
      list.sort((a, b) => UPS[a].cost - UPS[b].cost);
      const top = list.slice(0, 9);
      const sig = top.join(',') + lang();
      if (sig !== this.sig) {
        this.sig = sig;
        for (const i of top) cache.delete(`u-b-${i}.can`);
        $('s-list').innerHTML = top.length
          ? top
              .map((i) => {
                const ic = upIcon(UPS[i]);
                return `<div class="row up"><div class="ico k-${ic}">${ICONS[ic]}</div><div><b>${esc(fxText(UPS[i].fx, lang()))}</b></div><button class="buy" data-a="up" data-i="${i}" id="u-b-${i}"><span>${F(UPS[i].cost)}</span></button></div>`;
              })
              .join('')
          : `<p class="empty">${tx('shopEmpty')}</p>`;
      }
      for (const i of top) cls(`u-b-${i}`, 'can', UPS[i].cost <= S.ch);
    },
  },
  lab: {
    build: () => {
      let cells = '';
      for (let r = 0; r < REC_N; r++) cells += `<button data-a="rec" data-i="${r}" id="l-${r}" style="--c:${COLS[Math.floor(r / NS)].hex}" aria-label="${esc(recName(r))}"></button>`;
      return `<div class="labsel"><div><b id="l-name"></b><small id="l-sub"></small></div><button class="buy" data-a="recbuy" id="l-buy"><span id="l-cost"></span><small>${tx('powder')}</small></button></div><div class="grid">${cells}</div><p class="note" id="l-help"></p>`;
    },
    upd(S) {
      if (labSel < 0 || (S.rec[labSel] && this.auto)) {
        labSel = S.rec.findIndex((on, r) => !on && S.allow & (1 << Math.floor(r / NS)));
        this.auto = true;
      }
      const sig = `${S.rec.join('')}|${labSel}|${S.allow}`;
      if (sig !== this.sig) {
        this.sig = sig;
        for (let r = 0; r < REC_N; r++) {
          const el = $(`l-${r}`);
          if (!el) continue;
          const have = !!S.rec[r];
          el.className = `${have ? 'have' : ''}${S.allow & (1 << Math.floor(r / NS)) ? '' : ' no'}${r === labSel ? ' sel' : ''}`;
          el.style.backgroundImage = have ? `url(${ICON.rec[r]})` : '';
        }
      }
      const cost = recCost(S);
      set('l-help', tx('labHelp', { p: String(Math.round(S.m.recPct * 100)) }));
      if (labSel >= 0) {
        const have = !!S.rec[labSel];
        const ok = !!(S.allow & (1 << Math.floor(labSel / NS)));
        set('l-name', recName(labSel));
        set('l-sub', have ? tx('labHave') : ok ? `${S.recN} / ${REC_N}` : tx('labNo'));
        set('l-cost', have || !ok ? '—' : F(cost));
        cls('l-buy', 'can', !have && ok && S.polv >= cost);
      }
    },
  },
  sky: {
    build: () =>
      `<div class="block"><h3 id="k-venue"></h3><p id="k-rule"></p><div class="goal wide" id="k-goal"><i><u id="k-bar"></u></i><span id="k-goal-t"></span></div><button class="btn" data-a="travel" id="k-travel"><span id="k-travel-t"></span><small id="k-travel-s"></small></button></div>` +
      `<button class="btn c2" data-a="cons" id="k-cons"><span>${tx('consBtn')}</span><small id="k-stars"></small></button>` +
      `<div class="venues" id="k-venues"></div>`,
    upd(S) {
      const goal = showGoal(S);
      const nextV = VENUES[(S.venue + 1) % VENUES.length];
      const g = starGain(S);
      set('k-venue', `${pick(VENUES[S.venue].name)}${S.laps ? ` · ${tx('lap', { k: S.laps + 1 })}` : ''}`);
      set('k-rule', pick(VENUES[S.venue].rule));
      hide('k-rule', !pick(VENUES[S.venue].rule));
      bar('k-bar', S.best / goal);
      cls('k-goal', 'done', !!S.full);
      set('k-goal-t', tx('goalOf', { a: F(S.best), b: F(goal) }));
      set('k-travel-t', tx('travel', { v: pick(nextV.name) }));
      set('k-travel-s', S.full ? tx('travelGain', { n: g }) : tx('needFull'));
      const b = $('k-travel');
      if (b && b.disabled !== !S.full) b.disabled = !S.full;
      set('k-stars', `${S.stars} ${tx('stars').toLowerCase()}`);
      const sig = `${S.venue}:${S.laps}:${lang()}`;
      if (sig !== this.sig) {
        this.sig = sig;
        $('k-venues').innerHTML = VENUES.map((v, i) => {
          const A = VENUE_ART[i];
          return `<div class="${i < S.venue || S.laps ? 'got' : i === S.venue ? 'now' : ''}${i === S.venue ? ' now' : ''}" style="background:linear-gradient(${A.sky[0]},${A.sky[1]} 55%,${A.sky[2]})" title="${esc(pick(v.rule))}">${esc(pick(v.name))}</div>`;
        }).join('');
      }
    },
  },
};
function recName(r) {
  return tx('recName', { s: pick(SHAPES[r % NS].name), c: pick(COLS[Math.floor(r / NS)].name) });
}

// ---------------------------------------------------------------- lo que hace cada botón del panel
const ACTIONS = {
  mode(b) {
    buyMode = +b.dataset.v;
    for (const x of $$('#g-mode button')) x.classList.toggle('on', +x.dataset.v === buyMode);
  },
  gen(b) {
    const i = +b.dataset.i;
    if (doAct(['B', i, qtyFor(cur, i)])) {
      sfx('buy');
      view.launch(i);
    } else sfx('no');
  },
  up(b) {
    if (doAct(['U', +b.dataset.i])) sfx('up');
    else sfx('no');
  },
  rec(b) {
    labSel = +b.dataset.i;
    PANES.lab.auto = false;
    sfx('tab');
  },
  recbuy() {
    if (labSel >= 0 && doAct(['R', labSel])) {
      sfx('up');
      PANES.lab.auto = true;
    } else sfx('no');
  },
  cons() {
    hints |= 64;
    coachOff();
    openStars();
  },
  travel() {
    if (mode !== 'solo' || !solo.full) return sfx('no');
    const g = starGain(solo);
    const to = VENUES[(solo.venue + 1) % VENUES.length];
    ask(tx('travel', { v: pick(to.name) }), tx('travelBody', { n: g }), tx('travel', { v: pick(to.name) }), () => {
      if (!doAct(['P'])) return;
      events.length = 0;
      sfx('star');
      buzz(100);
      view.setVenue(solo.venue);
      view.clear();
      saveSolo();
      toast(tx('arrived', { v: pick(VENUES[solo.venue].name) }));
      buildTabs();
      setTab('sky');
    });
  },
};

// ---------------------------------------------------------------- ajustes, logros y guardado (una ventana)
let achSel = -1;
function openMore() {
  const S = solo;
  const st = S.st;
  const rows = [['stLife', F(S.life)], ['stRuns', st.runs], ['stStars', S.starsTot], ['stShows', st.shows], ['stBest', `x${st.bestK}`], ['stFin', st.fin], ['stLan', F(st.lan)], ['stPla', st.pla]];
  const seg = (a, list, on) => `<div class="seg">${list.map(([v, t]) => `<button data-m="${a}" data-v="${v}" class="${on === v ? 'on' : ''}">${tx(t)}</button>`).join('')}</div>`;
  modal(
    tx('moreT'),
    `<h4>${tx('achs')}</h4><p>${tx('achSub', { n: S.achN, t: ACH.length })}</p><div class="achs">${ACH.map((a, i) => `<button data-m="ach" data-i="${i}" class="${S.ach[i] ? 'got' : ''}${i === achSel ? ' sel' : ''}" aria-label="${esc(pick(a.name))}">${ICONS.star}</button>`).join('')}</div><p id="a-detail" style="min-height:36px">${achSel >= 0 ? esc(achText(achSel)) : ''}</p>` +
      `<div class="stats">${rows.map(([k, v]) => `<span>${tx(k)}</span><b>${v}</b>`).join('')}</div>` +
      `<div class="phead"><span>${tx('notation')}</span>${seg('sci', [['', 'notShort'], ['1', 'notSci']], opts.sci ? '1' : '')}</div>` +
      `<div class="phead"><span>${tx('effects')}</span>${seg('fx', [['auto', 'fxAuto'], ['high', 'fxHigh'], ['low', 'fxLow']], opts.fx)}</div>` +
      `<button class="btn ghost sm" data-m="export" style="width:100%">${tx('exportB')}</button><button class="btn ghost sm" data-m="import" style="width:100%">${tx('importB')}</button><button class="btn danger sm" data-m="reset" style="width:100%">${tx('resetB')}</button>`,
    [{ label: tx('menu'), cls: 'c2', fn: toHome }, { label: tx('close'), ghost: true }],
  );
}
const achText = (i) => {
  const a = ACH[i];
  return `${pick(a.name)}: ${pick(ACH_TEXT[a.k]).replace('{v}', a.v >= 1000 ? F(a.v) : a.v).replace('{g}', a.i >= 0 ? pick(GENS[a.i].name) : '')}`;
};
const MORE = {
  ach(b) {
    achSel = +b.dataset.i;
    for (const x of $$('.achs button')) x.classList.toggle('sel', x === b);
    $('a-detail').textContent = achText(achSel);
  },
  sci(b) {
    opts.sci = !!b.dataset.v;
    saveSolo();
    openMore();
    cache.clear();
  },
  fx(b) {
    opts.fx = b.dataset.v;
    view.setQuality(opts.fx);
    saveSolo();
    openMore();
  },
  export() {
    saveSolo();
    const code = encode(saveData());
    modal(tx('exportB'), `<p>${tx('exportHelp')}</p><textarea id="x-code" readonly>${code}</textarea>`, [
      { label: tx('close'), ghost: true },
      {
        label: tx('copy'),
        keep: true,
        fn: async (el) => {
          try {
            await navigator.clipboard.writeText(code);
          } catch {
            $('x-code').select();
          }
          el.querySelector('span').textContent = tx('copied');
        },
      },
    ]);
  },
  import() {
    modal(tx('importB'), `<p>${tx('importHelp')}</p><textarea id="x-code" spellcheck="false" autocomplete="off"></textarea><p id="x-err" style="color:var(--red)"></p>`, [
      { label: tx('cancel'), ghost: true },
      {
        label: tx('importDo'),
        keep: true,
        fn: () => {
          const u = unpack(decode($('x-code').value));
          if (!u) return ($('x-err').textContent = tx('importBad'));
          solo = u.S;
          hints = u.hints | 0;
          seen = u.seen | 0;
          if (u.opts) opts = { ...opts, ...u.opts };
          saveSolo();
          closeModal();
          toast(tx('importOk'));
          enterSolo();
        },
      },
    ]);
  },
  reset() {
    ask(tx('reset1'), tx('reset1Body'), tx('resetDo'), () =>
      ask(tx('reset2'), tx('reset2Body'), tx('resetDo'), () => {
        solo = create({ seed: Math.floor(Math.random() * 2 ** 31) });
        hints = 0;
        seen = 0;
        saveSolo();
        enterSolo();
      }),
    );
  },
};

// ---------------------------------------------------------------- constelaciones
let starSel = 0;
let starLay = null;
let starT = 0;
function openStars() {
  $('m-stars').hidden = false;
  const first = NODES.findIndex((n, i) => nodeAvail(solo, i) && n.cost <= solo.stars);
  const any = NODES.findIndex((_, i) => nodeAvail(solo, i));
  starSel = first >= 0 ? first : any >= 0 ? any : 0;
  starLay = null;
  starInfo();
}
function sizeStars() {
  const cv = $('st-cv');
  const r = cv.getBoundingClientRect();
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (starLay && starLay.w === Math.round(r.width) && starLay.h === Math.round(r.height)) return;
  cv.width = Math.round(r.width * dpr);
  cv.height = Math.round(r.height * dpr);
  cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  starLay = { ...consLayout(r.width, r.height), w: Math.round(r.width), h: Math.round(r.height) };
}
function drawStars(dt) {
  sizeStars();
  starT += dt;
  drawCons($('st-cv').getContext('2d'), starLay.w, starLay.h, solo, starSel, starT, starLay, starSprites, CONS.map((c) => pick(c.name)));
}
function starInfo() {
  const n = NODES[starSel];
  const con = CONS[n.c];
  $('st-stars').innerHTML = cur$('star', solo.stars);
  $('st-name').textContent = tx('consNode', { c: pick(con.name), k: n.k + 1 });
  $('st-fx').textContent = fxText(n.fx, lang());
  $('st-power').textContent = tx('consPower', { x: fxText(con.fx, lang()) });
  const b = $('st-buy');
  const have = !!solo.nodes[starSel];
  const can = nodeAvail(solo, starSel);
  b.querySelector('span').textContent = have ? tx('consHave') : can ? tx('consBuy', { n: n.cost }) : tx('consNeed');
  b.disabled = have || !can || solo.stars < n.cost;
}

// ---------------------------------------------------------------- refresco de la interfaz (5 veces por segundo)
function refresh() {
  const S = cur;
  if (!S) return;
  if (ui === 'show') hud(S);
  else if (ui === 'shop') {
    if (!run && tabList(S).join() !== tabSig) buildTabs();
    html('w-ch', cur$('spark', F(S.ch)));
    hide('w-polv', !(S.polv > 0 || S.recN > 1));
    html('w-polv', cur$('powder', F(S.polv)));
    hide('w-star', !(mode === 'solo' && S.stars > 0));
    html('w-star', cur$('star', S.stars));
    hide('b-more', mode !== 'solo');
    cls('t-shop', 'dot', tab !== 'shop' && UPS.some((u, i) => u.cost <= S.ch && upAvail(S, i)));
    cls('t-lab', 'dot', tab !== 'lab' && S.polv >= recCost(S) && S.rec.some((on, r) => !on && S.allow & (1 << Math.floor(r / NS))));
    if (mode === 'solo') cls('t-sky', 'dot', tab !== 'sky' && (!!S.full || S.nodes.some((on, i) => !on && nodeAvail(S, i) && NODES[i].cost <= S.stars)));
    PANES[tab].upd(S);
    // el cartel de la sede y el botón de empezar
    const b = $('b-go');
    if (run) {
      const info = raceInfo(run.mins, Math.max(0, S.tick));
      set('sg-venue', tx('roundOf', { a: Math.min(info.n, info.i + 2), b: info.n }));
      set('sg-rule', tx('brk'));
      hide('sg-goal', true);
      set('go-t', tx('nextIn', { s: fmtClock(Math.ceil(info.left / TPS)) }));
      set('go-sub', '');
      cls('b-go', 'wait', true);
      if (!b.disabled) b.disabled = true;
      hide('w-rank', run.kind !== 'duel');
      if (run.kind === 'duel') {
        const rows = duelRows();
        set('w-rank', tx('posOf', { a: rows.findIndex((r) => r.id === duel.me) + 1, b: rows.length }));
      }
    } else {
      const goal = showGoal(S);
      set('sg-venue', pick(VENUES[S.venue].name));
      set('sg-rule', pick(VENUES[S.venue].rule));
      hide('sg-rule', !pick(VENUES[S.venue].rule));
      hide('sg-goal', false);
      bar('sg-bar', S.best / goal);
      set('sg-goal-t', `${tx('goal')} ${F(goal)}`);
      set('go-t', tx('go'));
      set('go-sub', tx('goSub', { s: Math.round(S.m.showLen / TPS) }));
      cls('b-go', 'wait', false);
      if (b.disabled) b.disabled = false;
      hide('w-rank', true);
      if (tut < 0 && $('m-run').hidden && $('modal').hidden && $('m-stars').hidden) shopTips();
    }
  }
  coachPlace();
}

/** Lo que se ve durante la función: reloj de mecha, chispas, meta, pedido y ovación. */
function hud(S) {
  const r = S.run;
  let left = 0;
  let total = 1;
  if (run) {
    const info = raceInfo(run.mins, Math.max(0, S.tick));
    left = info.show ? info.left : 0;
    total = RACE[run.mins].show * TPS;
    set('h-round', tx('roundOf', { a: info.i + 1, b: info.n }));
    set('h-score', F(S.total));
    hide('h-goal', true);
    if (run.kind === 'duel') rivals();
  } else {
    left = r && !r.reh ? Math.max(0, r.end - S.tick) : 0;
    total = S.m.showLen;
    set('h-round', r && r.reh ? '' : tx('showN', { n: S.st.runs + 1 }));
    set('h-score', F(r ? r.got : S.last));
    const goal = showGoal(S);
    hide('h-goal', !!(r && r.reh));
    bar('h-goal-bar', (r ? Math.max(r.got, S.best) : S.best) / goal);
    cls('h-goal', 'done', !!S.full);
    set('h-goal-t', `${tx('goal')} ${F(goal)}`);
  }
  const p = clamp(left / total, 0, 1);
  bar('h-fuse', p);
  const sp = `${(p * 100).toFixed(1)}%`;
  if (cache.get('h-spark') !== sp) {
    cache.set('h-spark', sp);
    $('h-spark').style.left = sp;
  }
  set('h-clock', fmtClock(Math.ceil(left / TPS)));
  cls('hud', 'ending', left > 0 && left <= 10 * TPS);
  // pedido del público
  const c = S.con[0];
  hide('h-job', !c);
  if (c) {
    const text = pick(CON_TEXT[c.k]).replace('{n}', c.k === 5 ? F(c.n) : c.n).replace('{a}', c.a);
    const prog = c.n > 1 && c.k !== 5 ? ` ${Math.min(c.p, c.n)}/${c.n}` : '';
    if (html('h-job', `${ICONS.powder}<span>${esc(text)}${prog}</span><b>+${c.rw}</b>`) && cache.get('job-k') !== `${c.k}:${c.n}:${c.a}`) {
      cache.set('job-k', `${c.k}:${c.n}:${c.a}`);
      const el = $('h-job');
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    }
  }
  // ovación: la barra es el botón del Gran Final
  const full = S.ov >= 100 && !S.fin;
  cls('b-ov', 'full', full);
  cls('b-ov', 'on', S.fin > 0);
  bar('h-ovbar', S.fin > 0 ? S.fin / S.m.finDur : S.ov / 100);
  set('h-ovt', S.fin > 0 ? `${tx('finale')} ${Math.ceil(S.fin / TPS)}` : full ? tx('finale') : tx('ovation'));
  set('h-ovx', `x${ovMul(S).toFixed(1).replace('.', lang() === 'es' ? ',' : '.')}`);
  if (mode === 'solo') {
    if (tut >= 0) tutorial(S);
    else showTips(S);
  }
}

function fuses() {
  const S = cur;
  if (!S || ui !== 'show') return;
  const max = Math.min(18, Math.round(S.m.fuseMax));
  const on = S.fin > 0 ? max : Math.min(max, Math.floor(S.fuse + 1e-6));
  const k = `${max}:${on}`;
  if (cache.get('fz') === k) return;
  cache.set('fz', k);
  let h = '';
  for (let i = 0; i < max; i++) h += `<i class="${i < on ? 'on' : ''}"></i>`;
  $('h-fuses').innerHTML = h;
}

function rivals() {
  const rows = duelRows();
  const me = duel.me;
  set('r-pos', tx('posOf', { a: rows.findIndex((r) => r.id === me) + 1, b: rows.length }));
  html(
    'r-rivals',
    rows
      .slice(0, 4)
      .map((r) => `<div class="${r.id === me ? 'me' : ''}"><i style="background:${esc(r.color || '#fff')}"></i><span>${esc(r.name)}</span><b>${F(r.score)}</b></div>`)
      .join(''),
  );
}

// ---------------------------------------------------------------- entrada
const cv = $('sky');
cv.addEventListener('pointerdown', (e) => {
  if (!cur || ui !== 'show') return;
  const p = view.toField(e.clientX, e.clientY);
  pointer.down = true;
  pointer.x = p.x;
  pointer.y = p.y;
  key.on = false;
  fire(p.x, p.y);
  try {
    cv.setPointerCapture(e.pointerId);
  } catch {}
});
cv.addEventListener('pointermove', (e) => {
  const p = view.toField(e.clientX, e.clientY);
  pointer.x = p.x;
  pointer.y = p.y;
  if (e.pointerType === 'mouse' && cur && ui === 'show') view.aim = { x: clamp(p.x, 0, FW), y: clamp(p.y, 0, SKY_MAX) };
});
const up = () => (pointer.down = false);
cv.addEventListener('pointerup', up);
cv.addEventListener('pointercancel', up);
cv.addEventListener('pointerleave', () => {
  if (!key.on) view.aim = null;
});
cv.addEventListener('contextmenu', (e) => e.preventDefault());

// panel: un toque compra; dejar apretado un mortero sigue comprando
let holdT = 0;
const stopHold = () => clearTimeout(holdT);
$('pane').addEventListener('pointerdown', (e) => {
  const b = e.target.closest('[data-a="gen"]');
  if (!b) return;
  ACTIONS.gen(b);
  refresh();
  const again = () => {
    if (!b.isConnected || !doAct(['B', +b.dataset.i, qtyFor(cur, +b.dataset.i)])) return;
    sfx('buy');
    refresh();
    holdT = setTimeout(again, 110);
  };
  stopHold();
  holdT = setTimeout(again, 380);
});
addEventListener('pointerup', stopHold);
addEventListener('pointercancel', stopHold);
$('pane').addEventListener('click', (e) => {
  const b = e.target.closest('[data-a]');
  if (!b || !cur) return;
  if (b.dataset.a === 'gen' && e.detail !== 0) return; // ya se compró al apretar
  ACTIONS[b.dataset.a]?.(b);
  refresh();
});
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  sfx('tab');
  setTab(b.dataset.tab);
});
$('m-body').addEventListener('click', (e) => {
  const b = e.target.closest('[data-m]');
  if (b) MORE[b.dataset.m]?.(b);
});
$('b-ov').onclick = finale;
$('b-go').onclick = startShow;
$('b-more').onclick = openMore;
$('rn-ok').onclick = closeResult;
$('rn-x2').onclick = async () => {
  if (!(await G.showReward())) return;
  if (act(solo, ['X'])) {
    sfx('up');
    $('rn-score').textContent = F(solo.last * 2);
    $('rn-x2').hidden = true;
    saveSolo();
  }
};
$('b-quit').onclick = () => {
  if (!cur) return;
  if (mode === 'solo') {
    if (!solo.run || solo.run.reh) return toHome();
    return ask(tx('leftShow'), tx('leftShowBody'), tx('leave'), () => {
      const u = unpack(read('save')); // la partida como estaba antes de empezar esta función
      if (u) solo = cur = u.S;
      hold = false;
      events.length = 0;
      view.clear();
      toShop();
    }, tx('stay'));
  }
  if (run.done) return;
  ask(tx('leftSprint'), tx(run.kind === 'daily' && !run.practice ? 'leftDaily' : 'leftSprintBody'), tx('leave'), () => {
    if (run?.kind === 'duel') duel.leave();
    if (run?.kind === 'daily' && !run.practice) return showEnd();
    toHome();
  }, tx('stay'));
};
$('b-play').onclick = enterSolo;
$('b-daily').onclick = openDaily;
$('b-sprint').onclick = openSprint;
$('b-online').onclick = () => duel.lobby.open();
$('reto-go').onclick = startReto;
$('sp-time').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  spMins = +b.dataset.v;
  openSprint();
};
$('sp-go').onclick = () => startSprint(spMins, newSeed());
$('e-again').onclick = () => {
  if (!run) return toHome();
  if (run.kind === 'daily') startRun({ kind: 'daily', mins: 3, cfg: run.cfg, practice: true, n: run.n, date: run.date });
  else if (run.kind === 'reto') startRun({ kind: 'reto', mins: run.mins, cfg: run.cfg, target: run.target });
  else startSprint(run.mins, newSeed());
};
$('e-share').onclick = async () => {
  if (!run) return;
  let r;
  if (run.kind === 'daily') r = await share(`${tx('shareTxt', { n: run.n, s: F(run.score), k: run.chain })}\n${shareLink(ID)}`);
  else r = await share(`${location.origin}/#play/${ID}?reto=${String(run.cfg.seed).slice(1)}-${run.mins}-${Math.floor(Math.max(run.score, run.target || 0)).toString(36)}`);
  $('e-status').textContent = r === 'failed' ? '' : tx(run.kind === 'daily' ? 'shared' : 'retoCopied');
};
$('res-leave').onclick = () => {
  duel.leave();
  toHome();
};
for (const b of $$('[data-go="home"]'))
  b.onclick = () => {
    clearInterval(dailyStop);
    if (screen === 'online') duel.leave();
    toHome();
  };
$('st-close').onclick = () => {
  $('m-stars').hidden = true;
  refresh();
};
$('st-buy').onclick = () => {
  if (doAct(['N', starSel])) {
    sfx('star');
    saveSolo();
    if (NODES[starSel].k < 9) starSel++;
  } else sfx('no');
  starInfo();
};
$('st-cv').addEventListener('pointerdown', (e) => {
  if (!starLay) return;
  const r = $('st-cv').getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  let best = -1;
  let bd = 34 * 34;
  for (const p of starLay.pts) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) {
      bd = d;
      best = p.i;
    }
  }
  if (best >= 0) {
    starSel = best;
    sfx('tab');
    starInfo();
  }
});
$('modal').addEventListener('pointerdown', (e) => e.target === $('modal') && modalBack?.());

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.key === 'Escape') {
    if (!$('modal').hidden) return void (modalBack ? modalBack() : closeModal());
    if (!$('m-stars').hidden) return void $('st-close').click();
    return;
  }
  if (!$('m-stars').hidden) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') starSel = (starSel + 1) % NODES.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') starSel = (starSel + NODES.length - 1) % NODES.length;
    else if (e.key === 'Enter') return void $('st-buy').click();
    else return;
    e.preventDefault();
    return void starInfo();
  }
  if (!cur || screen || !$('modal').hidden || !$('m-run').hidden) return;
  if (ui === 'show') {
    const d = G.dir(e);
    if (d) {
      const s = e.shiftKey ? 20 : 9;
      key.x = clamp(key.x + (d === 'right' ? s : d === 'left' ? -s : 0), 0, FW - 1);
      key.y = clamp(key.y + (d === 'down' ? s : d === 'up' ? -s : 0), 0, SKY_MAX);
      key.on = true;
      view.aim = { x: key.x, y: key.y };
      e.preventDefault();
    } else if (e.code === 'Space' || (e.key === 'Enter' && e.target === document.body)) {
      if (!key.on && view.aim) {
        key.x = view.aim.x;
        key.y = view.aim.y;
      }
      fire(key.x, key.y);
      e.preventDefault();
    } else if (e.code === 'KeyF') finale();
    return;
  }
  if (e.key === 'Enter' && e.target === document.body) startShow();
  else if (e.code === 'KeyQ' || e.code === 'KeyE') {
    const list = $$('#tabs button').map((b) => b.dataset.tab);
    if (list.length) setTab(list[(list.indexOf(tab) + (e.code === 'KeyE' ? 1 : list.length - 1)) % list.length]);
  } else if (/^Digit[1-8]$/.test(e.code)) {
    const i = +e.code.slice(5) - 1;
    if (genShown(cur, i) && doAct(['B', i, qtyFor(cur, i)])) sfx('buy');
    refresh();
  }
});

// ---------------------------------------------------------------- portal: pausa, preferencias, salida
G.onPause(() => (paused = true));
G.onResume(() => {
  paused = false;
  last = soloClock = performance.now();
});
const saveIdle = () => mode === 'solo' && !solo.run && saveSolo(); // a mitad de una función no: se vuelve al taller de antes
G.onLeave(saveIdle);
document.addEventListener('visibilitychange', () => document.hidden && saveIdle());
addEventListener('pagehide', saveIdle);
setInterval(saveIdle, 15000);
setInterval(refresh, 200);
setInterval(fuses, 80);
addEventListener('resize', layout);
new ResizeObserver(() => view.resize()).observe($('stage'));

function applyPrefs() {
  document.documentElement.lang = lang();
  for (const n of $$('[data-t]')) n.textContent = tx(n.dataset.t);
  for (const b of $$('#seg-time button')) b.textContent = tx('mins', { n: b.dataset.v });
  view.still = !!G.prefs.reducedMotion;
  view.label = tx('title').toUpperCase();
  $('b-quit').innerHTML = ICONS.x;
  $('b-quit').setAttribute('aria-label', tx('leave'));
  $('b-more').innerHTML = ICONS.more;
  $('b-more').setAttribute('aria-label', tx('moreT'));
  $('st-close').className = 'icobtn';
  $('st-stars').className = 'cur star';
  $('st-close').innerHTML = ICONS.x;
  $('st-close').setAttribute('aria-label', tx('close'));
  cache.clear();
  if (cur && ui === 'shop') buildTabs();
  else if (!cur) refreshHome();
  if (screen === 'sprint') openSprint();
  if (!$('m-stars').hidden) starInfo();
}

// ---------------------------------------------------------------- arranque
loadSolo();
GENS.forEach((_, i) => ICON.gen.push(genIcon(i)));
for (let r = 0; r < REC_N; r++) ICON.rec.push(recipeIcon(r % NS, COLS[Math.floor(r / NS)].hex));
view.setQuality(opts.fx);
view.venue = solo.venue;
reto = parseReto();
G.onPrefs(applyPrefs, true);
{
  const date = today();
  const day = loadDay(ID, 'all', date);
  markPortal(ID, { date, done: !!day, won: !!day, streak: liveStreak(loadStats(ID, 'all'), date) });
}
G.rewardAvailable('doble').then((ok) => (rewardOk = !!ok));
setUi('home');
requestAnimationFrame(frame);
if (duel.lobby.pending) show('online');
else show('home');
if (/[?&]debug\b/.test(location.search)) window.__bengala = { view, act: doAct, enterSolo, toHome, toShop, startRun, startShow, get S() { return cur; }, get solo() { return solo; }, set solo(v) { solo = v; }, get run() { return run; }, get ui() { return ui; }, hints: (v) => (v === undefined ? hints : (hints = v)), seen: (v) => (seen = v), save: saveSolo, encode: () => encode(saveData()) };
G.ready();
