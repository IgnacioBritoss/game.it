/* Brinco — game.it
 * Plataformas 2D de dibujito: cuatro mundos de tres niveles (el último de cada mundo termina con un jefe), ocho
 * personajes con habilidad propia, enemigos y obstáculos distintos en cada mundo (aplastadores, cañones, barras de
 * fuego, lava, hielo, cintas, plataformas que se mueven o caen), tres gemas por nivel, banderines de control y
 * objetos (fruta, flor, ají). La simulación (shared/sim.js) es pura y de paso fijo; render.js dibuja; el piloto
 * automático (shared/pilot.js) juega la demo de la pantalla de inicio.
 */
import { Renderer } from './render.js';
import { audio } from './audio.js';
import { load, step, respawn, DT, CHARS, CHAR_IDS } from './shared/sim.js';
import { LEVELS, WORLDS } from './shared/levels.js';
import { pilot } from './shared/pilot.js';
import { TXT } from './text.js';
import { drawChar, drawEnt, CHAR_COLOR } from './sprites.js';

const G = window.GameIt;
const ID = 'brinco';
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const lang = () => G.prefs.lang;

// ---------------------------------------------------------------- textos
const t = (k, v) => {
  const e = TXT[k];
  let s = e ? G.t(e) : k;
  if (v) for (const x in v) s = s.replaceAll(`{${x}}`, v[x]);
  return s;
};
const NAMES = { capi: 'Capi', lola: 'Lola', tuco: 'Tuco', rulo: 'Rulo', lana: 'Lana', brava: 'Brava', tatu: 'Tatú', yaca: 'Yaca' };

// ---------------------------------------------------------------- guardado
const loadKey = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem(`gameit:${ID}:${k}`)) ?? d;
  } catch {
    return d;
  }
};
const saveKey = (k, v) => {
  try {
    localStorage.setItem(`gameit:${ID}:${k}`, JSON.stringify(v));
  } catch {}
};
const progress = loadKey('progress', { levels: {} });
let charId = CHAR_IDS.includes(loadKey('char', 'capi')) ? loadKey('char', 'capi') : 'capi';

const unlocked = (i) => i === 0 || !!progress.levels[LEVELS[i - 1].id]?.done;
const nextLevelIndex = () => {
  const i = LEVELS.findIndex((l) => !progress.levels[l.id]?.done);
  return i < 0 ? LEVELS.length - 1 : i;
};

// ---------------------------------------------------------------- estado
const S = {
  view: 'title', // title | chars | map | help | play | results
  W: null,
  demo: null,
  demoMemo: {},
  demoT: 0,
  levelIndex: 0,
  acc: 0,
  paused: false,
  portalPaused: false,
  ready: 0,
  readyShown: 0,
  hintShown: new Set(),
  lastHp: 0,
  lastGems: 0,
  restartT: 0,
  resultsAt: 0,
};
let rd = null;
let last = performance.now();
let clock = 0;
const keys = new Set();
const touch = { l: false, r: false, u: false, d: false, a: false };
let helpFrom = 'title';

// ---------------------------------------------------------------- pantallas
const SCREENS = ['s-title', 's-chars', 's-map', 's-help', 's-pause', 's-results'];
const show = (id) => SCREENS.forEach((s) => $(s).classList.toggle('on', s === id));
const overlay = (id, on) => $(id).classList.toggle('on', on);

function applyLang() {
  document.documentElement.lang = lang();
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  const i = nextLevelIndex();
  const any = Object.keys(progress.levels).length;
  $('m-play-sub').textContent = any ? t('playSub', { n: `${LEVELS[i].id.slice(1).replace('-', '–')}` }) : t('playSubNew');
  $('m-chars-sub').textContent = NAMES[charId];
}

const GEM = '<svg viewBox="0 0 48 48" stroke="#2b1b3d" stroke-width="3" stroke-linejoin="round"><defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9ad2"/><stop offset=".5" stop-color="#6bd0ff"/><stop offset="1" stop-color="#b08aff"/></linearGradient></defs><path d="M24 4l17 12-6 28H13L7 16z" fill="url(#gg)"/><path d="M7 16h34M24 4l-6 12 6 28M24 4l6 12-6 28" fill="none" stroke-width="1.6" opacity=".55"/></svg>';
const HEART = (on) => `<svg viewBox="0 0 32 32" class="${on ? '' : 'off'}" stroke="#2b1b3d" stroke-width="2.4" stroke-linejoin="round"><path d="M16 28C5 20 3 14 3 10a6.5 6.5 0 0 1 13-1 6.5 6.5 0 0 1 13 1c0 4-2 10-13 18z" fill="#ff4b5c"/><path d="M9 9a4 4 0 0 1 4-2" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>`;

// ---------------------------------------------------------------- personajes
function renderChars() {
  const box = $('chars');
  box.innerHTML = CHAR_IDS.map((id) => `<button class="ch ${id === charId ? 'on' : ''}" data-id="${id}"><canvas width="120" height="120"></canvas><b>${NAMES[id]}</b><small>${esc(t('a_' + CHARS[id].ability))}</small></button>`).join('');
  box.querySelectorAll('.ch').forEach((b, i) => {
    const cv = b.querySelector('canvas');
    const g = cv.getContext('2d');
    g.translate(60, 100);
    g.scale(78, 78);
    drawChar(g, CHAR_IDS[i], { face: 1, anim: 'idle', t: 0 });
  });
  charInfo();
}
function charInfo() {
  const a = CHARS[charId].ability;
  $('char-info').innerHTML = `<b>${NAMES[charId]}</b> · ${esc(t('a_' + a))}<i>${esc(t('a_' + a + 'T'))}</i>`;
}

// ---------------------------------------------------------------- mapa
function renderMap() {
  $('worlds').innerHTML = WORLDS.map((w) => {
    const lvls = LEVELS.map((l, i) => ({ l, i })).filter((q) => q.l.world === w.id);
    return `<div class="world w${w.id}"><h3>${w.id}. ${esc(w.name[lang()])}</h3><p>${esc(w.blurb[lang()])}</p><div class="lvls">${lvls
      .map(({ l, i }) => {
        const p = progress.levels[l.id];
        const ok = unlocked(i);
        const boss = !!l.boss;
        return `<button class="lv ${ok ? '' : 'lock'} ${boss ? 'final' : ''}" data-i="${i}" ${ok ? '' : 'disabled'}><b>${ok ? l.id.slice(-1) : '🔒'}</b><small>${esc(l.name[lang()])}</small><span class="med"><i class="${p?.done ? 'on' : ''}"></i><i class="g ${p?.gems >= 3 ? 'on' : ''}"></i><i class="h ${p?.noHit ? 'on' : ''}"></i></span></button>`;
      })
      .join('')}</div></div>`;
  }).join('');
}

// ---------------------------------------------------------------- ayuda
function renderHelp() {
  const kb = [['hMove', '← → / A D'], ['hJump', '↑ / W / Space / Z'], ['hDown', '↓ / S'], ['hAct', 'X / J / Shift'], ['hPause', 'Esc / P']];
  const foes = ['walker', 'erizo', 'beetle', 'bat', 'jumper', 'plant', 'cannon', 'thwomp', 'firebar'];
  $('help-body').innerHTML = `
    <section><h3>${esc(t('hKeys'))}</h3><div class="keys">${kb.map(([k, v]) => `<span>${esc(t(k))}</span><kbd>${v}</kbd>`).join('')}</div></section>
    <section><h3>${esc(t('hPad'))}</h3><p>${esc(t('hPadText'))}</p>
      <h3>${esc(t('hTouch'))}</h3><p>${esc(t('hTouchText'))}</p></section>
    <section><h3>${esc(t('hItemsT'))}</h3><p>${esc(t('hItemsText'))}</p>
      <h3>${esc(t('hTips'))}</h3><p>${esc(t('hTipsText'))}</p></section>
    <div class="help-foes"><h3 style="grid-column:1/-1;color:var(--sun)">${esc(t('hFoes'))}</h3>${foes.map((f) => `<div><canvas data-f="${f}" width="88" height="88"></canvas><p><b>${esc(t('f_' + f))}</b><span>${esc(t('f_' + f + 'T'))}</span></p></div>`).join('')}</div>`;
  $('help-body').querySelectorAll('canvas').forEach((cv) => {
    const f = cv.dataset.f;
    const g = cv.getContext('2d');
    g.translate(44, 76);
    g.scale(58, 58);
    const e = { kind: f, face: 1, t: 0.2, x: 0, y: 0, w: 1, h: 1, ang: 0.7, len: 1.6, dir: 1, mode: 'walk', state: 'wait', grounded: true, wait: 1 };
    if (f === 'firebar') {
      g.translate(-0.4, -0.3);
      g.scale(0.6, 0.6);
    }
    if (f === 'thwomp') {
      g.scale(0.55, 0.55);
      g.translate(0, 0.1);
    }
    if (f === 'plant') e.h = 0.9;
    if (f === 'cannon') e.dir = 1;
    if (f === 'bat') g.translate(0, 0.4);
    drawEnt(g, e, 0.3);
  });
}

// ---------------------------------------------------------------- controles
function moveKeys() {
  const k = G.prefs.keys || 'both';
  const arrows = k !== 'wasd';
  const wasd = k !== 'arrows';
  return {
    l: (arrows && keys.has('ArrowLeft')) || (wasd && keys.has('KeyA')),
    r: (arrows && keys.has('ArrowRight')) || (wasd && keys.has('KeyD')),
    u: (arrows && keys.has('ArrowUp')) || (wasd && keys.has('KeyW')) || keys.has('Space') || keys.has('KeyZ'),
    d: (arrows && keys.has('ArrowDown')) || (wasd && keys.has('KeyS')),
    a: keys.has('KeyX') || keys.has('KeyJ') || keys.has('ShiftLeft') || keys.has('ShiftRight'),
  };
}
let padStart = false;
function readInput() {
  const m = moveKeys();
  const o = { l: m.l || touch.l, r: m.r || touch.r, u: m.u || touch.u, d: m.d || touch.d, a: m.a || touch.a };
  const p = (navigator.getGamepads?.() || []).find((x) => x && x.connected);
  if (p) {
    const ax = p.axes[0] || 0;
    const ay = p.axes[1] || 0;
    const b = (i) => !!p.buttons[i]?.pressed;
    o.l ||= ax < -0.4 || b(14);
    o.r ||= ax > 0.4 || b(15);
    o.u ||= b(0) || b(12);
    o.d ||= ay > 0.6 || b(13);
    o.a ||= b(2) || b(1) || b(5);
    const st = b(9);
    if (st && !padStart) togglePause();
    padStart = st;
  }
  return o;
}

addEventListener('keydown', (e) => {
  if (e.repeat) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    return;
  }
  keys.add(e.code);
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  audio.init();
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (S.view === 'play') togglePause();
    else if (S.view === 'map' || S.view === 'chars') goTitle();
    else if (S.view === 'help') closeHelp();
  }
  if (S.view !== 'play' || S.paused) {
    const m = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (e.code in m) {
      const list = [...document.querySelectorAll('.screen.on button')].filter((b) => !b.disabled && b.offsetParent !== null);
      if (list.length) {
        let i = list.indexOf(document.activeElement);
        i = i < 0 ? 0 : (i + m[e.code] + list.length) % list.length;
        list[i].focus();
        audio.click();
        e.preventDefault();
      }
    }
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

function wireTouch() {
  document.querySelectorAll('#touch [data-k]').forEach((b) => {
    const k = b.dataset.k;
    const set = (v) => {
      touch[k] = v;
      b.classList.toggle('on', v);
    };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      set(true);
      audio.init();
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => set(false));
  });
  $('touch').addEventListener('contextmenu', (e) => e.preventDefault());
}

// ---------------------------------------------------------------- demo del inicio
function startDemo() {
  const i = Math.floor(Math.random() * LEVELS.length);
  const lv = LEVELS[i];
  const ch = CHAR_IDS[Math.floor(Math.random() * CHAR_IDS.length)];
  S.demo = load(lv, ch);
  S.demoMemo = {};
  S.demoT = 0;
  rd.setWorld(S.demo);
  audio.music.start(lv.theme, i + 3);
}

// ---------------------------------------------------------------- niveles
function startLevel(i) {
  audio.init();
  const lv = LEVELS[i];
  S.levelIndex = i;
  S.W = load(lv, charId);
  S.paused = false;
  S.acc = 0;
  S.ready = 1.7;
  S.readyShown = 0;
  S.hintShown = new Set();
  S.lastHp = S.W.p.hp;
  S.lastGems = 0;
  S.restartT = 0;
  S.view = 'play';
  rd.setWorld(S.W);
  show('');
  overlay('s-pause', false);
  $('hud').hidden = false;
  $('h-name').textContent = `${lv.id.slice(1).replace('-', '–')} · ${lv.name[lang()]}`;
  $('h-boss').hidden = true;
  $('h-hint').classList.remove('on');
  $('h-gems').innerHTML = GEM.repeat(3).replaceAll('<svg ', '<svg class="off" ');
  $('touch').hidden = !G.prefs.touch;
  audio.music.start(lv.theme, i + 11);
  G.gameplay(true);
}

function hudHearts(p) {
  const key = `${p.hp}/${p.maxHp}`;
  const box = $('h-hearts');
  if (box._k === key) return;
  box._k = key;
  box.innerHTML = Array.from({ length: p.maxHp }, (_, i) => HEART(i < p.hp)).join('');
  if (p.hp < S.lastHp) box.children[p.hp]?.classList.add('hit');
  S.lastHp = p.hp;
}

function updateHud(W) {
  hudHearts(W.p);
  const c = $('h-coins');
  if (c._v !== W.coins) c.textContent = c._v = W.coins;
  const gs = $('h-gems');
  if (gs._v !== W.gems) {
    gs._v = W.gems;
    [...gs.children].forEach((s, i) => s.classList.toggle('off', i >= W.gems));
    if (W.gems > S.lastGems) gs.children[W.gems - 1]?.classList.add('pop');
    S.lastGems = W.gems;
  }
  const sec = Math.floor(W.t);
  const tm = $('h-time');
  const txt = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  if (tm._v !== txt) tm.textContent = tm._v = txt;
  // jefe
  const bar = $('h-boss');
  if (W.boss && !W.boss.dead && W.p.x > (W.level.arena?.[0] ?? 1e9) - 14) {
    bar.hidden = false;
    $('h-boss-name').textContent = t('bossName_' + (W.level.bossSkin || 'beetle'));
    $('h-boss-bar').style.width = `${Math.max(0, (W.boss.hp / W.boss.hpMax) * 100)}%`;
  } else bar.hidden = true;
  // pistas del primer nivel
  for (const h of W.level.hints || []) {
    if (!S.hintShown.has(h.x) && W.p.x > h.x) {
      S.hintShown.add(h.x);
      const el = $('h-hint');
      el.textContent = lang() === 'es' ? h.es : h.en;
      el.classList.add('on');
      clearTimeout(updateHud.ht);
      updateHud.ht = setTimeout(() => el.classList.remove('on'), 4200);
    }
  }
}

function drain(W, sfx) {
  if (!W.events.length) return;
  rd.fx(W.events, W);
  if (sfx) for (const e of W.events) audio.event(e);
  W.events.length = 0;
}

function showResults() {
  const W = S.W;
  const lv = LEVELS[S.levelIndex];
  S.view = 'results';
  $('hud').hidden = true;
  $('touch').hidden = true;
  audio.music.stop();
  G.gameplay(false);
  const prev = progress.levels[lv.id] || {};
  const best = { done: true, gems: Math.max(prev.gems || 0, W.gems), coins: Math.max(prev.coins || 0, W.coins), noHit: prev.noHit || W.hits === 0, time: prev.time ? Math.min(prev.time, W.t) : W.t, score: Math.max(prev.score || 0, W.score) };
  const newBest = !prev.time || W.t < prev.time - 1e-6;
  progress.levels[lv.id] = best;
  saveKey('progress', progress);
  const lastOfWorld = lv.boss;
  const finished = LEVELS.every((l) => progress.levels[l.id]?.done);
  $('res-kicker').textContent = `${lv.id.slice(1).replace('-', '–')} · ${lv.name[lang()]}`;
  $('res-title').textContent = finished && S.levelIndex === LEVELS.length - 1 ? t('allDone') : lastOfWorld ? t('worldDone') : t('levelDone');
  $('res-gems').innerHTML = Array.from({ length: 3 }, (_, i) => `<i class="${i < W.gems ? 'pop' : 'off'}" style="--i:${i}">${GEM}</i>`).join('');
  const sec = W.t;
  const fmt = `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  const rows = [
    [t('coins'), `${W.coins}/${W.coinsTotal}`],
    [t('gems'), `${W.gems}/${W.gemsTotal}`],
    [t('time'), fmt + (newBest ? `  ★ ${t('newBest')}` : '')],
    [W.hits === 0 ? t('noHit') : t('hits'), W.hits === 0 ? '♥' : String(W.hits)],
    [t('score'), String(W.score)],
  ];
  $('res-list').innerHTML = rows.map(([a, b], i) => `<li class="${i === 3 && W.hits === 0 ? 'star' : ''}" style="--i:${i}"><span>${esc(a)}</span><b>${esc(b)}</b></li>`).join('');
  const btns = [];
  const nxt = S.levelIndex + 1 < LEVELS.length && unlocked(S.levelIndex + 1);
  if (nxt) btns.push(['btn sun', t('next'), () => startLevel(S.levelIndex + 1)]);
  btns.push(['btn ice', t('retry'), () => retry()], ['btn ghost', t('map'), () => goMap()]);
  $('res-btns').innerHTML = '';
  for (const [cls, label, fn] of btns) {
    const b = document.createElement('button');
    b.className = cls;
    b.innerHTML = `<span>${esc(label)}</span>`;
    b.onclick = () => {
      audio.click();
      fn();
    };
    $('res-btns').appendChild(b);
  }
  audio.win();
  show('s-results');
  $('res-btns').firstChild?.focus();
}
async function retry() {
  await G.commercialBreak('revancha');
  startLevel(S.levelIndex);
}

// ---------------------------------------------------------------- navegación
function goTitle() {
  S.view = 'title';
  show('s-title');
  applyLang();
  if (!S.demo) startDemo();
}
function goMap() {
  audio.music.stop();
  S.view = 'map';
  S.W = null;
  $('hud').hidden = true;
  $('touch').hidden = true;
  overlay('s-pause', false);
  renderMap();
  show('s-map');
  G.gameplay(false);
  if (!S.demo) startDemo();
  $('worlds').querySelector('.lv:not(.lock)')?.focus();
}
function closeHelp() {
  if (helpFrom === 'pause') {
    show('');
    overlay('s-pause', true);
    S.view = 'play';
  } else goTitle();
}
function togglePause() {
  if (S.view !== 'play') return;
  S.paused = !S.paused;
  overlay('s-pause', S.paused);
  G.gameplay(!S.paused);
  if (S.paused) $('p-resume').focus();
  else last = performance.now();
}

// ---------------------------------------------------------------- bucle
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0, 0.1);
  last = now;
  clock += dt;
  try {
    if (S.view === 'play') tickPlay(dt);
    else if (S.view === 'results') {
      rd.update(S.W, dt);
      rd.draw(S.W);
    } else tickDemo(dt);
    audio.music.update();
  } catch (e) {
    console.error(e);
  }
}

function tickDemo(dt) {
  const W = S.demo;
  if (!W) return;
  S.acc += dt;
  let n = 0;
  while (S.acc >= DT && n < 6) {
    if (W.state === 'dead') {
      step(W, {});
      if (W.deadT > 1) respawn(W);
    } else step(W, W.state === 'play' ? pilot(W, S.demoMemo, { horizon: 36, every: 8 }) : {});
    drain(W, false);
    S.acc -= DT;
    n++;
  }
  if (n >= 6) S.acc = 0;
  S.demoT += dt;
  if ((W.state === 'won' && W.wonT > 1.6) || S.demoT > 120) startDemo();
  rd.update(W, dt);
  rd.draw(W);
}

function tickPlay(dt) {
  const W = S.W;
  if (!W) return;
  const frozen = S.paused || S.portalPaused;
  if (!frozen) {
    // cuenta de "¡Listo!"
    if (S.ready > 0) {
      const before = S.readyShown;
      S.ready -= dt;
      if (S.ready > 0.75 && before < 1) {
        S.readyShown = 1;
        flashReady(t('ready'), false);
        audio.ready(1);
      } else if (S.ready <= 0.75 && before < 2) {
        S.readyShown = 2;
        flashReady(t('go'), true);
        audio.ready(0);
      }
    } else {
      const inp = readInput();
      S.acc += dt;
      let n = 0;
      while (S.acc >= DT && n < 6) {
        step(W, inp);
        drain(W, true);
        S.acc -= DT;
        n++;
      }
      if (n >= 6) S.acc = 0;
    }
    if (W.state === 'dead' && W.deadT > 1.3 && !S.restartT) {
      S.restartT = 1;
      $('fade').classList.add('on');
      setTimeout(() => {
        if (S.view !== 'play' || !S.W) return;
        respawn(S.W);
        rd.snap(S.W);
        S.acc = 0;
        S.lastHp = S.W.p.hp;
        $('fade').classList.remove('on');
        S.restartT = 0;
        S.ready = 0.9;
        S.readyShown = 1;
      }, 320);
    }
    if (W.state === 'won' && W.wonT > 2.1) return showResults();
    updateHud(W);
  }
  rd.update(W, frozen ? 0 : dt);
  rd.draw(W);
}

function flashReady(text, go) {
  const r = $('ready');
  r.textContent = text;
  r.className = 'ready';
  void r.offsetWidth;
  r.className = 'ready on';
  void go;
}

// ---------------------------------------------------------------- conexiones
function wire() {
  const click = (id, fn) =>
    $(id).addEventListener('click', () => {
      audio.init();
      audio.click();
      fn();
    });
  click('m-play', () => {
    const i = nextLevelIndex();
    startLevel(i);
  });
  click('m-chars', () => {
    S.view = 'chars';
    renderChars();
    show('s-chars');
  });
  click('m-help', () => {
    helpFrom = 'title';
    S.view = 'help';
    renderHelp();
    show('s-help');
  });
  click('chars-ok', () => {
    saveKey('char', charId);
    goTitle();
  });
  click('help-ok', closeHelp);
  click('map-back', goTitle);
  click('p-resume', togglePause);
  click('p-restart', () => startLevel(S.levelIndex));
  click('p-map', goMap);
  click('p-help', () => {
    helpFrom = 'pause';
    S.view = 'help';
    renderHelp();
    overlay('s-pause', false);
    show('s-help');
  });
  $('b-pause').addEventListener('click', () => togglePause());
  $('chars').addEventListener('click', (e) => {
    const b = e.target.closest('.ch');
    if (!b) return;
    charId = b.dataset.id;
    audio.pick();
    for (const x of $('chars').children) x.classList.toggle('on', x === b);
    charInfo();
  });
  $('worlds').addEventListener('click', (e) => {
    const b = e.target.closest('.lv');
    if (!b || b.disabled) return;
    audio.click();
    startLevel(+b.dataset.i);
  });
  // el "Jugar" lleva al mapa si ya hay progreso
  $('m-play').addEventListener(
    'click',
    (e) => {
      if (Object.keys(progress.levels).length) {
        e.stopImmediatePropagation();
        audio.init();
        audio.click();
        goMap();
      }
    },
    true,
  );
  addEventListener('resize', () => {
    rd.resize();
  });
  G.onPause(() => {
    S.portalPaused = true;
    if (S.view === 'play' && !S.paused) togglePause();
  });
  G.onResume(() => {
    S.portalPaused = false;
    last = performance.now();
  });
  G.onPrefs(() => {
    applyLang();
    rd.reduced = !!G.prefs.reducedMotion;
    if (S.view === 'chars') renderChars();
    if (S.view === 'map') renderMap();
    if (S.view === 'help') renderHelp();
  }, true);
  wireTouch();
  addEventListener('pointerdown', () => audio.init(), { once: true });
}

// ---------------------------------------------------------------- arranque
function boot() {
  G.progress(0.2);
  rd = new Renderer($('cv'));
  rd.resize();
  rd.reduced = !!G.prefs.reducedMotion;
  wire();
  G.progress(0.6);
  startDemo();
  applyLang();
  show('s-title');
  G.gameplay(false);
  requestAnimationFrame(frame);
  G.ready();
}
boot();

window.__brinco = { S, startLevel, goMap, showResults, renderHelp, get rd() { return rd; }, progress };
