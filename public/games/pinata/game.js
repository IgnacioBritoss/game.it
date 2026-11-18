/**
 * Piñata — pegamento del juego: bucle, entrada, interfaz, tutorial, guardado, modos y SDK del portal.
 *
 * Se juega por fiestas: tandas cortas con el patio a pantalla completa, cartas entre una y otra y, cuando la fiesta termina,
 * la mesa (invitados, mantel, álbum y torta). Modos: la gira de fiestas (se guarda al empezar y al terminar cada fiesta), la
 * piñata del día (igual para todos), la contrarreloj (de cero, con medallas y reto por link) y el duelo online (el servidor
 * rehace tu partida). Todo lo que se decide pasa en shared/sim.js; acá se mandan acciones a la sim y se muestra lo que devuelve.
 */
import { TPS, GUESTS, CARDS, TAGS, MANTEL, BRANCHES, TORTA, FIG_N, FIG_PAGE, PAGES, EDADES, ACH, ACH_TEXT, MEDALS, SPRINT_TIMES, RACE, GIANT, fxText } from './shared/data.js';
import { create, step, act, guestCost, guestAfford, mantelCost, mantelAvail, tortaAvail, floorCount, figCost, figCount, velGain, quotaOf, dailySetup, raceInfo, tagCount, nPts } from './shared/sim.js';
import { fmt, fmtClock } from './shared/num.js';
import { pack, unpack, encode, decode } from './shared/save.js';
import { View, GROUND } from './render.js';
import { ICONS, TAG_ICON, EDAD_ART, guestIcon, stickerIcon, PAL } from './art.js';
import { sfx, buzz } from './sound.js';
import { tx, pick, lang } from './textos.js';
import { makeDuel } from './net.js';
import { today, dayNumber, msUntilNext, fmtClock as dayClock, loadDay, saveDay, record, loadStats, liveStreak, markPortal, share, shareLink } from '/shared/daily.js';

const G = window.GameIt;
const ID = 'pinata';
const EPOCH = '2026-11-15'; // día de la piñata n.º 1
const TICK = 1000 / TPS;
const HUD_H = 64; // alto de la franja de arriba (vela y cuota)
const FOOT_H = 92; // alto de la franja de abajo (Fuerza y ¡DALE!)
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
const view = new View($('yard'));
let solo = null; // la gira de fiestas (siempre cargada)
let soloClock = 0;
let cur = null; // la sim que se está jugando
let mode = 'home'; // home | solo | sprint | reto | daily | duel
let ui = 'home'; // home | play | table
let run = null; // datos de la contrarreloj, piñata del día, reto o duelo en curso
let paused = false;
let hold = false; // el tutorial frena la tanda hasta que hagas lo que pide
let screen = 'home';
let opts = { sci: false, buy: 1 }; // buy: cuántos se compran por toque (1, 10 o 0 = lo máximo que alcanza)
let hints = 0; // pasos del tutorial ya vistos (bits)
let seen = 0; // pestañas ya descubiertas: 1 mantel, 2 álbum, 4 torta
let tut = -1; // paso del ensayo en curso (1 y 2)
let bests = read('best', {});
let tab = 'guests';
let reto = null;
let page = 0;
let tortaSel = -1;
let lastFrac = 0;
let tickHook = null;
const events = [];
const cache = new Map();
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
const bar = (id, p, axis = 'X') => {
  const v = `scale${axis}(${clamp(p || 0, 0, 1).toFixed(3)})`;
  if (cache.get(id) === v) return;
  cache.set(id, v);
  const el = $(id);
  if (el) el.style.transform = v;
};
const cur$ = (icon, n) => `${ICONS[icon]}<span>${n}</span>`;

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
  G.gameplay(!!cur && !screen && ui === 'play');
}
/** Cambia entre el menú, la mesa y la tanda (patio entero). */
function setUi(name) {
  ui = name;
  const app = $('app');
  for (const k of ['home', 'play', 'table']) app.classList.toggle(`is-${k}`, name === k);
  hide('race', !(run && run.kind === 'duel'));
  cache.clear();
  layout();
  if (name !== 'play') view.hint = '';
  coachOff();
  G.gameplay(!!cur && !screen && name === 'play');
}
function layout() {
  const short = innerHeight < 500; // celular acostado: franjas más finas y el patio pasa un poco por debajo
  if (ui === 'play') view.setPads(56 + (short ? 40 : HUD_H), short ? 50 : FOOT_H);
  else view.setPads(56, 0);
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
    el.className = `btn sm${b.ghost ? ' ghost' : ''}${b.cls ? ` ${b.cls}` : ''}`;
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
let coachEl = '';
let coachT = 0;
let tipKey = '';
/** Muestra el globo señalando `target` (un id, o nada: arriba del patio). `o.btn` le pone un botón; `o.ms` lo cierra solo. */
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
  const el = coachEl && coachEl !== '@pin' && $(coachEl);
  if (coachEl && coachEl !== '@pin' && !(el && el.offsetWidth)) return coachOff(); // lo que señalaba ya no está a la vista
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
  } else if (coachEl === '@pin' && cur?.pts) {
    // señala la piñata del medio (la del ensayo)
    const i = cur.pts.findIndex(Boolean);
    const o = view.lastPos?.[i];
    const p = o ? view.fieldToClient(o.x, o.y) : { x: innerWidth / 2, y: innerHeight / 2 };
    x = p.x;
    y = p.y - ch - 46 * view.u * 0.5;
    dir = 'up';
    if (y < 64) {
      y = p.y + 40 * view.u * 0.5;
      dir = 'down';
    }
  } else {
    x = innerWidth / 2;
    y = Math.max(140, innerHeight * 0.28);
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
function hitAt(i) {
  if (!cur || paused || hold || screen || ui !== 'play' || i < 0) return;
  if (doAct(['T', i])) {
    handle(false);
    return;
  }
  const P = cur.party;
  if (!P || P.phase !== 'run' || cur.dale > 0) return;
  if (cur.force < 1) {
    cls('h-force', 'empty', true);
    setTimeout(() => cls('h-force', 'empty', false), 260);
    sfx('no');
  }
}
function dale() {
  if (!doAct(['F'])) return;
  handle(false);
  if (hold) {
    hold = false;
    hints |= 32;
    coachOff();
    soloClock = performance.now();
  }
}

/** Lo que pasó en la sim desde el último cuadro: efectos, sonidos y avisos. Con `quiet` (poniéndose al día) no se dibuja. */
function handle(quiet) {
  for (const e of events) {
    switch (e.e) {
      case 'hit':
        if (quiet) break;
        view.hit(cur, e);
        if (e.clank) {
          sfx('clank');
          view.text(view.lastPos?.[e.i]?.x || 128, (view.lastPos?.[e.i]?.y || 100) - 22, tx('armor'), false, PAL.vio);
        } else if (e.lleno) {
          sfx('clean', cur.streak);
          const o = view.lastPos?.[e.i];
          if (o) view.text(o.x, o.y - 26, e.perfect ? tx('perfect') : cur.streak > 1 ? tx('cleanX', { k: Math.min(cur.streak, 99) }) : tx('clean'), e.perfect || cur.streak >= 5, e.perfect ? '#c48a00' : cur.streak >= 5 ? PAL.pink : '#2a7a10');
        } else sfx('hit');
        break;
      case 'pop':
        if (run?.kind === 'duel' && e.k === 8) duel.unicorn();
        if (quiet) break;
        view.burst(cur, e.i, e.k, e.k === GIANT);
        sfx(e.k === GIANT ? 'giant' : 'pop');
        if (e.pay > 0 && performance.now() - lastHitAt < 200) {
          const o = view.lastPos?.[e.i];
          if (o) view.text(o.x, o.y - 8, `+${F(e.pay)}`, e.k === GIANT || e.gold, e.gold ? '#c48a00' : PAL.pink);
        }
        break;
      case 'guest':
        if (!quiet) view.guestAct(e.g);
        break;
      case 'gHit':
        if (!quiet) {
          view.guestHit(cur, e.g, e.i);
          sfx('gHit');
        }
        break;
      case 'unic':
        toast(tx('choco', { n: e.choco }));
        sfx('choco');
        break;
      case 'escape':
        if (!quiet) {
          sfx('escape');
          const o = view.lastPos?.[e.i];
          if (o) view.text(o.x, o.y - 30, tx('escaped'), false, PAL.vio);
        }
        break;
      case 'euFull':
        sfx('full');
        break;
      case 'dale':
        view.dale();
        sfx('dale');
        buzz(60);
        break;
      case 'quota':
        sfx('quota');
        view.text(128, 60, tx('quotaOk'), true, '#2a7a10');
        buzz(40);
        break;
      case 'giantDown':
        buzz(150);
        break;
      case 'ach':
        toast(tx('achGot', { x: pick(ACH[e.i].name) }));
        sfx('ach');
        break;
      case 'tandaStart':
        view.clear();
        if (!quiet && e.t > 1) sfx('go');
        break;
      case 'tandaEnd':
        if (run) {
          run.rounds.push(Math.floor(cur.party ? cur.party.got : 0));
          if (!e.last && !quiet) sfx('quota');
        } else if (mode === 'solo') {
          if (e.ok) setTimeout(openCards, 350);
          else sfx('fail');
        }
        break;
      case 'partyEnd':
        if (mode === 'solo') setTimeout(() => showPartyEnd(e), 700);
        break;
    }
  }
  events.length = 0;
}
let lastHitAt = 0;

// ---------------------------------------------------------------- bucle
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  let frac = 0;
  if (cur && !paused) {
    if (mode === 'solo') frac = hold ? lastFrac : tickSolo(now);
    else if (run) frac = tickRun();
  }
  lastFrac = frac;
  view.draw(ui === 'play' ? cur : null, frac, paused ? 0 : dt);
  if (ui === 'play' && mode === 'solo' && cur) {
    if (tut >= 0) tutorial(cur);
    else tandaTips(cur);
  }
}

/** La gira: el reloj de la sim solo corre mientras hay tanda (o ensayo). */
function tickSolo(now) {
  const P = solo.party;
  if (!P || P.phase !== 'run') {
    soloClock = now;
    return 0;
  }
  const ms = now - soloClock;
  if (ms > 600) {
    soloClock = now; // la pestaña estuvo tapada: la tanda sigue desde acá
    return 0;
  }
  const n = Math.floor(ms / TICK);
  if (!n) return ms / TICK;
  for (let i = 0; i < n; i++) {
    tickHook?.(solo); // solo con ?debug: las pruebas automáticas juegan tick a tick
    step(solo, events);
    if (!solo.party || solo.party.phase !== 'run') break;
  }
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
  let n = Math.min(run.limit + 2, Math.floor(t / TICK)) - cur.tick;
  const quiet = n > 6;
  if (n > 600) n = 600;
  for (let i = 0; i < n; i++) {
    tickHook?.(cur);
    step(cur, events);
  }
  handle(quiet);
  if (run.kind === 'duel') duel.pump(cur, run.rounds);
  if (cur.tick >= run.limit) {
    finishRun();
    return 0;
  }
  // de la tanda a las cartas y la mesa, y vuelta, según el horario
  const P = cur.party;
  const phase = P.phase === 'run' ? 'play' : 'table';
  if (phase !== ui) {
    setUi(phase);
    if (phase === 'table') {
      tab = 'guests';
      buildTabs();
      if (!P.picked) openCards();
    } else {
      $('m-cards').hidden = true;
      view.clear();
    }
  }
  if (P.phase === 'cards' && P.picked && !$('m-cards').hidden) $('m-cards').hidden = true;
  return clamp(t / TICK - cur.tick, 0, 1);
}

// ---------------------------------------------------------------- la gira: mesa, fiesta y fin de fiesta
function enterSolo() {
  mode = 'solo';
  cur = solo;
  run = null;
  hold = false;
  view.setEdad(solo.edad);
  view.pat = pagesDone(solo);
  view.clear();
  show('');
  if (solo.st.parties === 0 && !(hints & 1)) startTutorial();
  else toTable();
}
function toTable() {
  setUi('table');
  $('app').classList.remove('reh');
  buildTabs();
  refresh();
  tableTips();
}
function startParty() {
  if (mode !== 'solo' || (solo.party && !solo.party.reh)) return;
  if (!solo.party) saveSolo(); // si se recarga a mitad de la fiesta, se vuelve a esta mesa
  if (!act(solo, ['G'], events)) return;
  events.length = 0;
  tut = -1;
  view.hint = '';
  view.clear();
  coachOff();
  $('app').classList.remove('reh');
  if (solo.guests[0] && !(hints & 16)) hints |= 16;
  setUi('play');
  soloClock = performance.now();
  sfx('go');
  refresh();
}

// ---------------------------------------------------------------- cartas
function openCards() {
  const S = cur;
  const P = S?.party;
  if (!P || P.phase !== 'cards' || P.picked) return;
  const tc = tagCount(P.cards);
  set('c-sub', run ? tx('brk') : tx('pickSub'));
  $('deck').innerHTML = P.offer
    .map((c, i) => {
      const C = CARDS[c];
      const t = TAGS[C.tag];
      const have = tc[C.tag] + (P.cards.includes(c) ? 0 : 1);
      return `<button class="pcard" data-c="${i}" id="card-${i}" style="--c:${t.col}"><header>${TAG_ICON[C.tag]}<span>${esc(pick(t.name))}</span></header><div><b>${esc(pick(C.name))}</b><p>${esc(fxText(C.fx, lang()))}</p></div><small class="${have >= 3 ? 'set' : ''}">${have >= 3 ? tx('setOn') : tx('setOf', { n: Math.min(3, have) })}</small></button>`;
    })
    .join('');
  $('mine').innerHTML = TAGS.map((t, i) => (tc[i] ? `<span class="${tc[i] >= 3 ? 'set' : ''}" style="--c:${t.col}">${TAG_ICON[i]}${esc(pick(t.name))} ${Math.min(3, tc[i])}/3</span>` : '')).join('');
  $('m-cards').hidden = false;
  G.gameplay(false);
  sfx('card');
  if (mode === 'solo' && !(hints & 2)) coach(tx('tut4'), 'card-0');
}
function pickCard(i) {
  if (!doAct(['C', i])) return;
  handle(false);
  sfx('up');
  $('m-cards').hidden = true;
  if (mode === 'solo') {
    hints |= 2;
    coachOff();
    view.clear();
    soloClock = performance.now();
    G.gameplay(true);
  }
  refresh();
}

let countT = 0;
function showPartyEnd(e) {
  if (mode !== 'solo') return;
  const S = solo;
  $('pe-kicker').textContent = tx('stParties') + ` · ${S.st.parties}`;
  $('pe-title').textContent = e.giant ? tx('beatGiant') : tx('partyOver');
  $('pe-line').textContent = tx('reached', { n: Math.min(8, e.t) }) + (e.t === 9 ? ` · ${tx('giant')}` : '');
  const rec = S.st.bestT >= e.t && e.t > (S.prevBest || 0) && S.st.parties > 1;
  $('pe-stamp').hidden = !rec && !e.giant;
  $('pe-stamp').textContent = e.giant ? tx('giant') : tx('record');
  S.prevBest = Math.max(S.prevBest || 0, e.t);
  clearInterval(countT);
  let k = 0;
  const el = $('pe-score');
  countT = setInterval(() => {
    k++;
    el.innerHTML = cur$('candy', F(e.sum * Math.min(1, (k / 16) ** 2)));
    if (k >= 16) clearInterval(countT);
  }, 30);
  $('m-end').hidden = false;
  $('pe-ok').focus();
  sfx(e.giant ? 'win' : e.t >= 3 ? 'up' : 'buy');
  saveSolo();
  G.gameplay(false);
  if (!(hints & 4)) coach(tx('tut5'), 'pe-ok');
}
function closePartyEnd() {
  if ($('m-end').hidden) return;
  clearInterval(countT);
  $('m-end').hidden = true;
  hints |= 4;
  coachOff();
  view.clear();
  toTable();
}

// ---------------------------------------------------------------- tutorial: de a un paso, jugando entre uno y otro
function startTutorial() {
  act(solo, ['H', 1], events);
  events.length = 0;
  setUi('play');
  $('app').classList.add('reh');
  soloClock = performance.now();
  tut = 1;
  tutMark = solo.st.hits;
  coach(tx('tut1'), '@pin');
}
let tutMark = 0;
function tutorial(S) {
  if (tut === 1 && S.st.hits - tutMark >= 2) {
    tut = 2;
    tutMark = S.st.lleno;
    view.hint = 'ring';
    coach(tx('tut2'), '@pin');
  } else if (tut === 2 && S.st.lleno > tutMark) {
    tut = 3;
    view.hint = '';
    coach(tx('tut3'), null, {
      btn: tx('tutGo'),
      fn: () => {
        hints |= 1;
        coachOff();
        startParty();
      },
    });
  } else if (tut >= 1 && tut <= 2) coachPlace();
}
/** Avisos de una sola vez durante la tanda. */
function tandaTips(S) {
  if (mode !== 'solo' || !S.party || S.party.reh || S.party.phase !== 'run') return;
  if (hold && (S.dale > 0 || S.eu < 100)) {
    // ya usó la Euforia (con el teclado o el botón): sigue la tanda
    hold = false;
    hints |= 32;
    coachOff();
    soloClock = performance.now();
  }
  if (!(hints & 32) && S.eu >= 100 && S.dale <= 0) {
    hold = true; // se frena hasta que toque ¡DALE!
    if ($('coach').hidden) coach(tx('tut8'), 'b-dale');
  }
}
/** Avisos de una sola vez en la mesa: uno por vez, y se queda hasta que hagas lo que dice. */
function tableTips() {
  if (mode !== 'solo' || ui !== 'table' || !$('m-end').hidden || !$('modal').hidden) return;
  const S = solo;
  let k = '';
  let el = '';
  if (S.guests[0] && !(hints & 8)) hints |= 8; // ya invitó al Nene, aunque haya sido con el teclado
  if (!S.guests[0] && !(hints & 8) && S.ca >= guestCost(S, 0)) {
    if (tab !== 'guests') return setTab('guests');
    k = 'tut6';
    el = 'gb-0';
  } else if (!(hints & 16) && S.guests[0]) {
    k = 'tut7';
    el = 'b-go';
  } else if (S.cake && !(hints & 128) && $('t-torta')) {
    k = 'tut10';
    el = tab === 'torta' ? 'k-blow' : 't-torta';
  } else if (S.choco > 0 && !(hints & 64) && $('t-album')) {
    k = 'tut9';
    el = 't-album';
  } else if (!(hints & 256) && $('t-mantel') && tab !== 'mantel') {
    k = 'tutMantel';
    el = 't-mantel';
  }
  if (k === tipKey && coachEl === el) return;
  if (k) coach(tx(k), el);
  else coachOff();
  tipKey = k;
}

// ---------------------------------------------------------------- partidas por tiempo
function toHome() {
  if (mode === 'solo' && !(solo.party && !solo.party.reh)) saveSolo();
  if (mode === 'solo' && solo.party) {
    const u = unpack(read('save')); // la partida como estaba antes de esta fiesta
    if (u) solo = u.S;
    else solo.party = null;
  }
  mode = 'home';
  cur = null;
  run = null;
  hold = false;
  tut = -1;
  view.hint = '';
  $('app').classList.remove('reh');
  $('m-end').hidden = true;
  $('m-cards').hidden = true;
  set('count', '');
  view.clear();
  view.setEdad(solo.edad);
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
  tab = 'guests';
  events.length = 0;
  view.setEdad(cur.edad);
  view.pat = 0;
  view.clear();
  coachOff();
  $('m-cards').hidden = true;
  setUi(cur.party && cur.party.phase === 'run' ? 'play' : 'table');
  buildTabs();
  show('');
  refresh();
}

function finishRun() {
  run.done = true;
  $('m-cards').hidden = true;
  if (run.kind === 'duel') {
    duel.finish(cur);
    setTimeout(() => run && showResults(), 900);
  } else setTimeout(() => run && showEnd(), 900);
  view.text(128, 90, tx('timeUp'), true, PAL.pink);
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
  const streak = cur.st.bestStreak;
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
      saveDay(ID, 'all', { score, streak, medal: k }, run.date);
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
  $('e-score').innerHTML = cur$('candy', F(score));
  $('e-streak').textContent = tx('bestStreak', { k: streak });
  $('e-medal').textContent = medalName(k);
  $('e-extra').textContent = extra;
  $('e-rounds').innerHTML = run.rounds.map((v, i) => `<span class="chip">${i + 1} · ${F(v)}</span>`).join('');
  run.score = score;
  run.streak = streak;
  setUi('home');
  show('end');
}

// ---------------------------------------------------------------- inicio
function refreshHome() {
  const has = solo.st.parties > 0;
  $('b-play-t').textContent = tx(has ? 'cont' : 'play');
  $('b-play-sub').textContent = has ? tx('contSub', { e: pick(EDADES[solo.edad].name), n: solo.st.parties + 1 }) : '';
  const date = today();
  const day = loadDay(ID, 'all', date);
  const n = dayNumber(EPOCH, date);
  $('b-daily-sub').textContent = day ? tx('dailyDone', { s: F(day.score) }) : tx('dailyNew', { n });
  hide('reto-card', !reto);
  if (reto) $('reto-body').textContent = tx('retoBody', { m: reto.mins, n: F(reto.score) });
}
function paintLogo() {
  const cols = [PAL.pink, PAL.yel, PAL.teal, PAL.ora, PAL.lime, PAL.vio, PAL.pink, PAL.yel, PAL.teal, PAL.ora, PAL.lime];
  $('logo').style.fontSize = `min(${(150 / tx('title').length).toFixed(1)}vw, 96px)`;
  $('logo').innerHTML = [...tx('title')].map((c, i) => (c === ' ' ? ' ' : `<span style="color:${cols[i % cols.length]};animation-delay:${(i * 0.13).toFixed(2)}s">${esc(c)}</span>`)).join('');
}

// ---------------------------------------------------------------- piñata del día
let dailyStop = null;
function openDaily() {
  const date = today();
  const n = dayNumber(EPOCH, date);
  const cfg = dailySetup(date);
  const day = loadDay(ID, 'all', date);
  const st = loadStats(ID, 'all');
  $('d-title').textContent = tx('dailyT', { n });
  $('d-edad').textContent = pick(EDADES[cfg.edad].name);
  $('d-rule').textContent = pick(EDADES[cfg.edad].rule) || tx('tagline');
  for (const id of ['d-yours', 'd-next', 'd-share']) {
    $(id).hidden = !day;
    cache.delete(`${id}:h`);
  }
  if (day) $('d-yours').textContent = `${tx('dailyYours', { n: F(day.score), k: day.streak })} · ${medalName(day.medal)}`;
  $('d-stats').textContent = st.played ? tx('dailyStreak', { n: liveStreak(st, date), p: st.played }) : '';
  $('d-status').textContent = '';
  $('d-go').querySelector('span').textContent = tx(day ? 'dailyPractice' : 'dailyGo');
  $('d-go').onclick = () => {
    clearInterval(dailyStop);
    startRun({ kind: 'daily', mins: 3, cfg, practice: !!day, n, date });
  };
  $('d-share').onclick = async () => {
    const r = await share(`${tx('shareTxt', { n, s: F(day.score), k: day.streak })}\n${shareLink(ID)}`);
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
    view.smoke = 4;
    toast(tx('smokeFrom', { n: name }));
    sfx('smoke');
  },
  smoked: (name) => toast(tx('smokeTo', { n: name })),
  rival: () => {},
});

function duelRows() {
  const me = duel.me;
  const rows = [{ id: me, name: duel.lobby.name, color: PAL.yel, score: Math.floor(cur?.total || 0), streak: cur?.st.bestStreak || 0, done: !!run?.done }];
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
    .map((r, i) => `<li class="${r.id === me ? 'me' : ''}"><span>${i + 1}.</span><i style="background:${esc(r.color || '#fff')}"></i><span>${esc(r.name)}${r.id === me ? ` (${tx('you')})` : ''}<small> · x${r.streak || 0}${final && r.dnf ? ` · ${tx('dnf')}` : ''}</small></span><b>${F(r.score || 0)}${!final && !r.done ? '…' : ''}</b></li>`)
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

// ---------------------------------------------------------------- pestañas de la mesa (aparecen a medida que hacen falta)
const TAB_T = { guests: 'tabGuests', mantel: 'tabMantel', album: 'tabAlbum', torta: 'tabTorta' };
function tabList(S) {
  if (run) return ['guests', 'mantel'];
  const was = seen;
  if (S.mantel.some(Boolean) || (S.guests[0] && S.ca >= mantelCost(S, 0) * 0.6) || S.st.parties >= 3) seen |= 1;
  if (S.choco > 0 || figCount(S) > 0) seen |= 2;
  if (S.cake || S.vel > 0 || S.torta.some(Boolean) || S.edad > 0 || S.laps > 0) seen |= 4;
  const list = ['guests'];
  if (seen & 1) list.push('mantel');
  if (seen & 2) list.push('album');
  if (seen & 4) list.push('torta');
  list.fresh = seen & ~was;
  return list;
}
let tabSig = '';
function buildTabs() {
  const list = tabList(cur);
  if (!list.includes(tab)) tab = 'guests';
  tabSig = list.join();
  const bit = { mantel: 1, album: 2, torta: 4 };
  $('tabs').innerHTML = list.map((id) => `<button data-tab="${id}" id="t-${id}" class="${list.fresh & bit[id] ? 'new' : ''}">${ICONS[id]}<span>${tx(TAB_T[id])}</span></button>`).join('');
  $('tabs').hidden = list.length < 2;
  cache.delete('tabs:h');
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
    if (id === 'album') hints |= 64;
    if (id === 'mantel') hints |= 256;
  }
  refresh();
  tableTips();
}
/** Cuántos niveles del invitado `i` compra un toque según el modo (x1, x10 o máx). */
const guestQty = (S, i) => (opts.buy ? opts.buy : Math.max(1, guestAfford(S, i, 50)));
/** Los nodos de mantel que compra un toque en la rama `b`: los siguientes en orden, hasta el modo (en máx, hasta lo que alcanza). */
function mantelPlan(S, b) {
  const list = [];
  let sum = 0;
  const lim = opts.buy || 12;
  for (let k = 0; k < 12 && list.length < lim; k++) {
    const i = b * 12 + k;
    if (S.mantel[i]) continue;
    const c = mantelCost(S, i);
    if (!opts.buy && list.length && sum + c > S.ca) break;
    list.push(i);
    sum += c;
  }
  return { list, sum };
}
const modeBar = () => `<div class="phead"><span></span><div class="seg" id="buy-mode">${[1, 10, 0].map((v) => `<button data-a="mode" data-v="${v}" class="${opts.buy === v ? 'on' : ''}">${v ? `x${v}` : tx('max')}</button>`).join('')}</div></div>`;
const guestShown = (S, i) => i === 0 || S.guests[i] > 0 || S.guests[i - 1] > 0;
const nextMantel = (S, b) => {
  for (let k = 0; k < 12; k++) if (!S.mantel[b * 12 + k]) return b * 12 + k;
  return -1;
};
const pagesDone = (S) => {
  let n = 0;
  for (let p = 0; p < 6; p++) if (S.album.slice(p * FIG_PAGE, p * FIG_PAGE + FIG_PAGE).every(Boolean)) n++;
  return n;
};

const PANES = {
  guests: {
    build: () =>
      modeBar() +
      GUESTS.map(
        (g, i) =>
          `<div class="row" id="gr-${i}" hidden><div class="ico" style="background-image:url(${guestIcon(i)})"></div><div><b>${esc(pick(g.name))}<em id="gl-${i}" hidden></em></b><small>${esc(pick(g.txt))}</small></div><button class="buy" data-a="guest" data-i="${i}" id="gb-${i}"><span id="gc-${i}"></span><small id="gq-${i}"></small></button></div>`,
      ).join(''),
    upd(S) {
      for (let i = 0; i < GUESTS.length; i++) {
        const on = guestShown(S, i);
        hide(`gr-${i}`, !on);
        if (!on) continue;
        const q = guestQty(S, i);
        const c = guestCost(S, i, q);
        hide(`gl-${i}`, !S.guests[i]);
        set(`gl-${i}`, tx('lv', { n: S.guests[i] }));
        html(`gc-${i}`, `${ICONS.candy}${F(c)}`);
        set(`gq-${i}`, q > 1 ? `x${q}` : '');
        cls(`gb-${i}`, 'can', c <= S.ca);
      }
    },
  },
  mantel: {
    build: () =>
      modeBar() +
      BRANCHES.map(
        (b, i) =>
          `<div class="row" style="--c:${b.col}"><div class="ico" style="background:${b.col};border:3px solid #3a1d5c;color:#fff">${ICONS.mantel}</div><div><b>${esc(pick(b.name))}</b><small id="mf-${i}"></small><div class="dots" id="md-${i}"></div></div><button class="buy" data-a="mantel" data-i="${i}" id="mb-${i}"><span id="mc-${i}"></span><small id="mq-${i}"></small></button></div>`,
      ).join(''),
    upd(S) {
      for (let b = 0; b < 4; b++) {
        const i = nextMantel(S, b);
        const got = S.mantel.slice(b * 12, b * 12 + 12).filter(Boolean).length;
        html(`md-${b}`, Array.from({ length: 12 }, (_, k) => `<i class="${k < got ? 'on' : ''}"></i>`).join(''));
        if (i < 0) {
          set(`mf-${b}`, `12 / 12`);
          html(`mc-${b}`, ICONS.check);
          cls(`mb-${b}`, 'can', false);
          cls(`mb-${b}`, 'done', true);
          continue;
        }
        set(`mf-${b}`, fxText(MANTEL[i].fx, lang()));
        const { list, sum } = mantelPlan(S, b);
        html(`mc-${b}`, `${ICONS.candy}${F(sum)}`);
        set(`mq-${b}`, list.length > 1 ? `x${list.length}` : '');
        cls(`mb-${b}`, 'can', sum <= S.ca && mantelAvail(S, i));
      }
    },
  },
  album: {
    build: () =>
      `<p class="note" id="al-note"></p><div class="pages" id="al-pages">${PAGES.map((p, i) => `<button data-a="page" data-i="${i}" style="--c:${p.col}">${i + 1}</button>`).join('')}</div><div class="phead"><b id="al-title" style="color:var(--ink);font:700 18px var(--disp)"></b><span id="al-done"></span></div><div class="stickers" id="al-grid"></div>`,
    upd(S) {
      const cost = figCost(S);
      set('al-note', Number.isFinite(cost) ? tx('figNext', { n: `${cost} ${tx('chocos').toLowerCase()}` }) : '48 / 48');
      const sig = `${S.album.join('')}|${page}|${S.choco >= cost}|${lang()}`;
      if (sig === this.sig) return;
      this.sig = sig;
      for (const b of $$('#al-pages button')) {
        const i = +b.dataset.i;
        b.classList.toggle('on', i === page);
        b.classList.toggle('full', S.album.slice(i * 8, i * 8 + 8).every(Boolean));
      }
      const P = PAGES[page];
      set('al-title', pick(P.name));
      set('al-done', S.album.slice(page * 8, page * 8 + 8).every(Boolean) ? tx('pageDone') : `${S.album.slice(page * 8, page * 8 + 8).filter(Boolean).length} / 8`);
      let h = '';
      for (let k = 0; k < 8; k++) {
        const i = page * 8 + k;
        const have = !!S.album[i];
        h += `<button data-a="fig" data-i="${i}" id="fg-${i}" class="${have ? 'have' : S.choco >= cost ? 'can' : ''}" style="--c:${P.col};${have ? `background-image:url(${stickerUrl(i)})` : ''}">${have ? '' : i + 1}</button>`;
      }
      $('al-grid').innerHTML = h;
    },
  },
  torta: {
    build: () =>
      `<button class="btn blow" data-a="blow" id="k-blow"><span id="k-blow-t"></span><small id="k-blow-s"></small></button>` +
      `<div class="edades" id="k-edades"></div>` +
      `<div class="cake" id="k-cake">${[3, 2, 1, 0].map((p) => `<div class="tier" id="tier-${p}" style="--c:${['#ffb3d6', '#bff3ef', '#ffe9a3', '#d6c8ff'][p]};width:${58 + p * 14}%">${Array.from({ length: 6 }, (_, k) => `<button data-a="candle" data-i="${p * 6 + k}" id="tc-${p * 6 + k}" aria-label="${p * 6 + k + 1}"></button>`).join('')}</div>`).join('')}</div>` +
      `<div class="pick"><div><b id="k-fx"></b><small id="k-sub"></small></div><button class="buy" data-a="light" id="k-light"><span id="k-cost"></span></button></div>`,
    upd(S) {
      const g = velGain(S);
      const to = EDADES[(S.edad + 1) % EDADES.length];
      set('k-blow-t', tx('blow'));
      set('k-blow-s', S.cake ? tx('blowSub', { n: g, e: pick(to.name) }) : tx('blowNeed'));
      const b = $('k-blow');
      if (b && b.disabled !== !S.cake) b.disabled = !S.cake;
      const sig = `${S.edad}:${S.laps}:${S.torta.join('')}:${tortaSel}:${S.vel}`;
      if (sig !== this.sig) {
        this.sig = sig;
        $('k-edades').innerHTML = EDADES.map((e, i) => `<i class="${i < S.edad || S.laps ? 'got' : ''}${i === S.edad ? ' now' : ''}" style="background:linear-gradient(${EDAD_ART[i].sky[0]},${EDAD_ART[i].ground})" title="${esc(pick(e.name))}"></i>`).join('');
        if (tortaSel < 0 || S.torta[tortaSel]) tortaSel = TORTA.findIndex((_, i) => tortaAvail(S, i));
        for (let p = 0; p < 4; p++) $(`tier-${p}`)?.classList.toggle('lock', p > 0 && floorCount(S, p - 1) < 3);
        for (let i = 0; i < TORTA.length; i++) {
          const el = $(`tc-${i}`);
          if (!el) continue;
          el.className = `${S.torta[i] ? 'on' : ''}${i === tortaSel ? ' sel' : ''}${tortaAvail(S, i) && TORTA[i].cost <= S.vel ? ' can' : ''}`;
        }
      }
      if (tortaSel >= 0) {
        const n = TORTA[tortaSel];
        set('k-fx', fxText(n.fx, lang()));
        set('k-sub', S.torta[tortaSel] ? tx('lit') : tortaAvail(S, tortaSel) ? tx('floor', { n: n.p + 1 }) : tx('floorNeed'));
        html('k-cost', S.torta[tortaSel] ? ICONS.check : `${ICONS.candle}${n.cost}`);
        cls('k-light', 'can', !S.torta[tortaSel] && tortaAvail(S, tortaSel) && n.cost <= S.vel);
      } else {
        set('k-fx', '24 / 24');
        set('k-sub', '');
        html('k-cost', ICONS.check);
      }
    },
  },
};
const stickerUrl = (i) => stickerIcon(i);

// ---------------------------------------------------------------- lo que hace cada botón de la mesa
const ACTIONS = {
  guest(b) {
    const i = +b.dataset.i;
    if (doAct(['B', i, guestQty(cur, i)])) {
      sfx('buy');
      if (i === 0) hints |= 8;
      view.guestAct(i);
    } else sfx('no');
  },
  mantel(b) {
    const { list, sum } = mantelPlan(cur, +b.dataset.i);
    if (!list.length || sum > cur.ca) return sfx('no');
    let n = 0;
    for (const i of list) if (doAct(['U', i])) n++;
    sfx(n ? 'up' : 'no');
  },
  mode(b) {
    opts.buy = +b.dataset.v;
    for (const x of $$('#buy-mode button')) x.classList.toggle('on', +x.dataset.v === opts.buy);
    cache.clear();
    if (mode === 'solo') saveSolo();
    sfx('tab');
  },
  page(b) {
    page = +b.dataset.i;
    sfx('tab');
  },
  fig(b) {
    if (doAct(['R', +b.dataset.i])) {
      sfx('up');
      view.pat = pagesDone(solo);
      saveSolo();
    } else sfx('no');
  },
  candle(b) {
    tortaSel = +b.dataset.i;
    sfx('tab');
  },
  light() {
    if (tortaSel >= 0 && doAct(['N', tortaSel])) {
      sfx('up');
      saveSolo();
    } else sfx('no');
  },
  blow() {
    if (mode !== 'solo' || !solo.cake) return sfx('no');
    const g = velGain(solo);
    const to = EDADES[(solo.edad + 1) % EDADES.length];
    ask(tx('blow'), tx('blowBody', { n: g }), tx('blow'), () => {
      if (!doAct(['P'])) return;
      events.length = 0;
      hints |= 128;
      sfx('blow');
      buzz(100);
      view.setEdad(solo.edad);
      view.clear();
      saveSolo();
      toast(tx('arrived', { e: pick(to.name) }));
      buildTabs();
      setTab('torta');
    });
  },
};

// ---------------------------------------------------------------- ajustes, logros y guardado (una ventana)
let achSel = -1;
function openMore() {
  const S = solo;
  const st = S.st;
  const rows = [['stLife', F(S.life)], ['stParties', st.parties], ['stGiants', st.giants], ['stLleno', F(st.lleno)], ['stStreak', `x${st.bestStreak}`], ['stDale', st.dale], ['stEdades', st.edades], ['stUnic', st.unic]];
  const seg = (a, list, on) => `<div class="seg">${list.map(([v, t]) => `<button data-m="${a}" data-v="${v}" class="${on === v ? 'on' : ''}">${tx(t)}</button>`).join('')}</div>`;
  modal(
    tx('moreT'),
    `<h4>${tx('achs')}</h4><p>${tx('achSub', { n: S.achN, t: ACH.length })}</p><div class="achs">${ACH.map((a, i) => `<button data-m="ach" data-i="${i}" class="${S.ach[i] ? 'got' : ''}${i === achSel ? ' sel' : ''}" aria-label="${esc(pick(a.name))}">${ICONS.check}</button>`).join('')}</div><p id="a-detail" style="min-height:36px">${achSel >= 0 ? esc(achText(achSel)) : ''}</p>` +
      `<div class="stats">${rows.map(([k, v]) => `<span>${tx(k)}</span><b>${v}</b>`).join('')}</div>` +
      `<div class="phead"><span>${tx('notation')}</span>${seg('sci', [['', 'notShort'], ['1', 'notSci']], opts.sci ? '1' : '')}</div>` +
      `<button class="btn ghost sm" data-m="export" style="width:100%">${tx('exportB')}</button><button class="btn ghost sm" data-m="import" style="width:100%">${tx('importB')}</button><button class="btn danger sm" data-m="reset" style="width:100%">${tx('resetB')}</button>`,
    [{ label: tx('menu'), cls: 'c2', fn: toHome }, { label: tx('close'), ghost: true }],
  );
}
const achText = (i) => {
  const a = ACH[i];
  return `${pick(a.name)}: ${pick(ACH_TEXT[a.k]).replace('{v}', a.v >= 1000 ? F(a.v) : a.v)}`;
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
    modal(tx('importB'), `<p>${tx('importHelp')}</p><textarea id="x-code" spellcheck="false" autocomplete="off"></textarea><p id="x-err" style="color:#ff4b5c"></p>`, [
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

// ---------------------------------------------------------------- refresco de la interfaz
function refresh() {
  const S = cur;
  if (!S) return;
  if (ui === 'play') hud(S);
  else if (ui === 'table') {
    if (!run && tabList(S).join() !== tabSig) buildTabs();
    html('w-ca', cur$('candy', F(S.ca)));
    hide('w-choco', !(S.choco > 0 || figCount(S) > 0) || !!run);
    html('w-choco', cur$('choco', F(S.choco)));
    hide('w-vel', !(S.vel > 0 || S.velTot > 0) || !!run);
    html('w-vel', cur$('candle', F(S.vel)));
    hide('b-more', mode !== 'solo');
    cls('t-mantel', 'dot', tab !== 'mantel' && [0, 1, 2, 3].some((b) => nextMantel(S, b) >= 0 && mantelCost(S, nextMantel(S, b)) <= S.ca));
    cls('t-album', 'dot', tab !== 'album' && S.choco >= figCost(S));
    cls('t-torta', 'dot', tab !== 'torta' && (!!S.cake || TORTA.some((n, i) => tortaAvail(S, i) && n.cost <= S.vel)));
    PANES[tab].upd(S);
    const b = $('b-go');
    if (run) {
      const info = raceInfo(run.mins, Math.max(0, S.tick));
      set('go-t', tx('nextIn', { s: fmtClock(Math.ceil(info.left / TPS)) }));
      set('go-sub', tx('tandaOf', { a: Math.min(info.n, info.i + 2), b: info.n }));
      cls('b-go', 'wait', true);
      if (!b.disabled) b.disabled = true;
      hide('w-rank', run.kind !== 'duel');
      if (run.kind === 'duel') {
        const rows = duelRows();
        set('w-rank', tx('posOf', { a: rows.findIndex((r) => r.id === duel.me) + 1, b: rows.length }));
      }
    } else {
      const t0 = Math.max(1, Math.min(8, S.m.startT));
      set('go-t', tx('go'));
      set('go-sub', tx('goSub', { n: t0, q: F(quotaOf(S, t0)) }));
      cls('b-go', 'wait', false);
      if (b.disabled) b.disabled = false;
      hide('w-rank', true);
      if (tut < 0 && $('m-end').hidden && $('modal').hidden) tableTips();
    }
  }
  coachPlace();
}

/** Lo que se ve durante la tanda: vela, cuota, tanda, Fuerza y ¡DALE!. */
function hud(S) {
  const P = S.party;
  if (!P) return;
  let left = 0;
  let total = 1;
  if (run) {
    const info = raceInfo(run.mins, Math.max(0, S.tick));
    left = info.run ? info.left : 0;
    total = RACE[run.mins].tanda * TPS;
    set('h-tanda', tx('tandaOf', { a: info.i + 1, b: info.n }));
    html('h-got', `${ICONS.candy.replace('<svg', '<svg style="display:inline;vertical-align:-3px;width:16px;height:16px"')} ${F(S.total)}`);
    bar('h-qbar', 1);
    cls('h-quota', 'free', true);
    if (run.kind === 'duel') rivals();
  } else {
    left = P.reh ? 0 : Math.max(0, P.end - S.tick);
    total = P.t === 9 ? 60 * TPS : 30 * TPS + S.m.tandaT;
    set('h-tanda', P.t === 9 ? tx('giant') : tx('tanda', { n: P.t }));
    cls('h-quota', 'free', P.t === 9);
    if (P.t === 9) {
      const g = S.pts[0];
      html('h-got', g ? `${Math.max(0, Math.ceil((g.hp / g.max) * 100))} %` : '0 %');
      bar('h-qbar', g ? g.hp / g.max : 0);
    } else {
      html('h-got', `${F(P.got)} / ${F(P.quota)}`);
      bar('h-qbar', P.quota ? P.got / P.quota : 0);
    }
    cls('h-quota', 'ok', !!P.ok);
  }
  bar('h-wax', left / total, 'Y');
  set('h-clock', fmtClock(Math.ceil(left / TPS)));
  cls('hud', 'ending', left > 0 && left <= 5 * TPS);
  // Fuerza
  const max = Math.min(14, Math.round(S.m.fmax));
  const on = S.dale > 0 ? max : Math.min(max, Math.floor(S.force + 1e-6));
  const k = `${max}:${on}`;
  if (cache.get('fz') !== k) {
    cache.set('fz', k);
    let h = '';
    for (let i = 0; i < max; i++) h += `<i class="${i < on ? 'on' : ''}"></i>`;
    $('h-force').innerHTML = h;
  }
  // ¡DALE!: la barra de Euforia es el botón
  const full = S.eu >= 100 && S.dale <= 0;
  cls('b-dale', 'full', full);
  cls('b-dale', 'on', S.dale > 0);
  bar('h-eubar', S.dale > 0 ? S.dale / S.m.daleT : S.eu / 100);
  set('h-dale', S.dale > 0 ? `${tx('dale')} ${Math.ceil(S.dale / TPS)}` : full ? tx('dale') : tx('hype'));
}

function rivals() {
  const rows = duelRows();
  const me = duel.me;
  set('r-pos', tx('posOf', { a: rows.findIndex((r) => r.id === me) + 1, b: rows.length }));
  html('r-rivals', rows.slice(0, 4).map((r) => `<div class="${r.id === me ? 'me' : ''}"><i style="background:${esc(r.color || '#fff')}"></i><span>${esc(r.name)}</span><b>${F(r.score)}</b></div>`).join(''));
}

// ---------------------------------------------------------------- entrada
const cv = $('yard');
cv.addEventListener('pointerdown', (e) => {
  if (!cur || ui !== 'play') return;
  const p = view.toField(e.clientX, e.clientY);
  const i = view.pick(cur, p.x, p.y, lastFrac);
  lastHitAt = performance.now();
  hitAt(i);
});
cv.addEventListener('contextmenu', (e) => e.preventDefault());

// mesa: un toque compra; dejar apretado un invitado sigue comprando
let holdT = 0;
const stopHold = () => clearTimeout(holdT);
$('pane').addEventListener('pointerdown', (e) => {
  const b = e.target.closest('[data-a="guest"]');
  if (!b) return;
  ACTIONS.guest(b);
  refresh();
  const again = () => {
    if (!b.isConnected || !doAct(['B', +b.dataset.i, guestQty(cur, +b.dataset.i)])) return;
    sfx('buy');
    refresh();
    holdT = setTimeout(again, 140);
  };
  stopHold();
  holdT = setTimeout(again, 420);
});
addEventListener('pointerup', stopHold);
addEventListener('pointercancel', stopHold);
$('pane').addEventListener('click', (e) => {
  const b = e.target.closest('[data-a]');
  if (!b || !cur) return;
  if (b.dataset.a === 'guest' && e.detail !== 0) return; // ya se compró al apretar
  ACTIONS[b.dataset.a]?.(b);
  refresh();
});
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  sfx('tab');
  setTab(b.dataset.tab);
});
$('deck').addEventListener('click', (e) => {
  const b = e.target.closest('[data-c]');
  if (b) pickCard(+b.dataset.c);
});
$('m-body').addEventListener('click', (e) => {
  const b = e.target.closest('[data-m]');
  if (b) MORE[b.dataset.m]?.(b);
});
$('b-dale').onclick = dale;
$('b-go').onclick = startParty;
$('b-more').onclick = openMore;
$('pe-ok').onclick = closePartyEnd;
$('b-quit').onclick = () => {
  if (!cur) return;
  if (mode === 'solo') {
    if (!solo.party || solo.party.reh) return toHome();
    return ask(tx('leftParty'), tx('leftPartyBody'), tx('leave'), () => {
      const u = unpack(read('save')); // la partida como estaba antes de empezar esta fiesta
      if (u) solo = cur = u.S;
      else solo.party = null;
      hold = false;
      events.length = 0;
      $('m-cards').hidden = true;
      view.clear();
      toTable();
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
  if (run.kind === 'daily') r = await share(`${tx('shareTxt', { n: run.n, s: F(run.score), k: run.streak })}\n${shareLink(ID)}`);
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
$('modal').addEventListener('pointerdown', (e) => e.target === $('modal') && modalBack?.());

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.key === 'Escape') {
    if (!$('modal').hidden) return void (modalBack ? modalBack() : closeModal());
    return;
  }
  if (!cur || screen || !$('modal').hidden) return;
  if (!$('m-cards').hidden) {
    if (/^Digit[1-4]$/.test(e.code)) pickCard(+e.code.slice(5) - 1);
    return;
  }
  if (!$('m-end').hidden) {
    if (e.key === 'Enter' || e.code === 'Space') closePartyEnd();
    return;
  }
  if (ui === 'play') {
    if (/^Digit[1-5]$/.test(e.code)) {
      lastHitAt = performance.now();
      hitAt(+e.code.slice(5) - 1);
      e.preventDefault();
    } else if (e.code === 'Space' || e.code === 'KeyF') {
      dale();
      e.preventDefault();
    }
    return;
  }
  if (e.key === 'Enter' && e.target === document.body && !run) startParty();
  else if (e.code === 'KeyQ' || e.code === 'KeyE') {
    const list = $$('#tabs button').map((b) => b.dataset.tab);
    if (list.length) setTab(list[(list.indexOf(tab) + (e.code === 'KeyE' ? 1 : list.length - 1)) % list.length]);
  }
});

// ---------------------------------------------------------------- portal: pausa, preferencias, salida
G.onPause(() => (paused = true));
G.onResume(() => {
  paused = false;
  last = soloClock = performance.now();
});
const saveIdle = () => mode === 'solo' && !(solo.party && !solo.party.reh) && saveSolo(); // a mitad de una fiesta no: se vuelve a la mesa de antes
G.onLeave(saveIdle);
document.addEventListener('visibilitychange', () => document.hidden && saveIdle());
addEventListener('pagehide', saveIdle);
setInterval(saveIdle, 15000);
setInterval(refresh, 120);
addEventListener('resize', layout);
new ResizeObserver(() => view.resize()).observe($('stage'));

function applyPrefs() {
  document.documentElement.lang = lang();
  for (const n of $$('[data-t]')) n.textContent = tx(n.dataset.t);
  for (const b of $$('#seg-time button')) b.textContent = tx('mins', { n: b.dataset.v });
  view.still = !!G.prefs.reducedMotion;
  paintLogo();
  $('b-quit').innerHTML = ICONS.x;
  $('b-quit').setAttribute('aria-label', tx('leave'));
  $('b-more').innerHTML = ICONS.more;
  $('b-more').setAttribute('aria-label', tx('moreT'));
  cache.clear();
  if (cur && ui === 'table') buildTabs();
  else if (!cur) refreshHome();
  if (screen === 'sprint') openSprint();
  if (!$('m-cards').hidden) openCards();
}

// ---------------------------------------------------------------- arranque
loadSolo();
view.setEdad(solo.edad);
view.pat = pagesDone(solo);
reto = parseReto();
G.onPrefs(applyPrefs, true);
{
  const date = today();
  const day = loadDay(ID, 'all', date);
  markPortal(ID, { date, done: !!day, won: !!day, streak: liveStreak(loadStats(ID, 'all'), date) });
}
setUi('home');
requestAnimationFrame(frame);
if (duel.lobby.pending) show('online');
else show('home');
if (/[?&]debug\b/.test(location.search))
  window.__pinata = { view, act: doAct, enterSolo, toHome, toTable, startRun, startParty, pickCard, openCards, get S() { return cur; }, get solo() { return solo; }, set solo(v) { solo = v; }, get run() { return run; }, get ui() { return ui; }, hints: (v) => (v === undefined ? hints : (hints = v)), onTick: (fn) => (tickHook = fn), seen: (v) => (seen = v), save: saveSolo, encode: () => encode(saveData()), nPts, GROUND };
G.ready();
