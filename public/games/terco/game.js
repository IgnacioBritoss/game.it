/* Terco — game.it
 * Plataformas de trampas de un solo golpe: una mulita sube el cerro, patea piedritas y vuelve al último fogón cada
 * vez que algo filoso, un bicho o una trampa la agarra. Cinco zonas con un jefe cada una, secretos y tres
 * dificultades (cuanto más terco, menos fogones). La simulación (shared/sim.js) es pura y determinista a 60 pasos
 * por segundo; shared/world.js junta pantallas, fogones y piedras. Este archivo es solo el cliente: entrada
 * (teclado, toque y mando), pantallas, partida guardada, sonido y dibujo.
 */
import { IN, RW, RH } from './shared/sim.js';
import { newGame, stepGame, resume, snapshot, respawn, CARROTS, STONES, ZONES, START } from './shared/world.js';
import { BOSS_NAMES } from './shared/bosses.js';
import * as Rn from './render.js';
import { bossArt } from './boss-art.js';
import { sfx, music } from './sound.js';

const GI = window.GameIt;
const ID = 'terco';
const TOP = 56; // la barra del portal
const STEP = 1 / 60;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------------------------------------------------------------- textos
const TXT = {
  tagline: { es: 'Una mulita, un cerro y todo lo que quiere pincharla.', en: 'One little mule, one mountain, and everything out to stab her.' },
  cont: { es: 'Continuar', en: 'Continue' },
  contSub: { es: '{zone} · {n} porrazos', en: '{zone} · {n} deaths' },
  newGame: { es: 'Juego nuevo', en: 'New game' },
  how: { es: 'Cómo se juega', en: 'How to play' },
  back: { es: '← volver', en: '← back' },
  gotIt: { es: '¡Entendido!', en: 'Got it!' },
  diffTitle: { es: 'Elegí cómo subir', en: 'Choose your climb' },
  d0: { es: 'Normal', en: 'Normal' },
  d1: { es: 'Bravo', en: 'Brave' },
  d2: { es: 'Terco', en: 'Stubborn' },
  d0t: { es: 'Fogones por todos lados. Para ir conociendo las trampas.', en: 'Campfires everywhere. A gentle way to meet the traps.' },
  d1t: { es: 'Menos fogones: cada tropezón se paga.', en: 'Fewer campfires: every slip costs you.' },
  d2t: { es: 'Casi sin fogones. Solo para tercos de verdad.', en: 'Almost no campfires. Only for the truly stubborn.' },
  overwrite: { es: 'Empezar de nuevo borra tu partida guardada.', en: 'Starting over erases your saved game.' },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'Seguir', en: 'Resume' },
  retry: { es: 'Volver al fogón', en: 'Back to campfire' },
  toTitle: { es: 'Al inicio', en: 'Title screen' },
  where: { es: '{zone} · {n} porrazos · {t}', en: '{zone} · {n} deaths · {t}' },
  onward: { es: 'Seguir', en: 'Onward' },
  stoneK: { es: 'Piedra {n} de {m}', en: 'Stone {n} of {m}' },
  stoneT: { es: '¡Piedra de {zone}!', en: '{zone} stone!' },
  stoneS: { es: 'La dejaste en la apacheta del Puesto.', en: 'You left it on the cairn at the Outpost.' },
  stoneAll: { es: '¡Las cuatro! Se abrió el camino a la cumbre.', en: 'All four! The way to the summit is open.' },
  endKicker: { es: 'La cumbre', en: 'The summit' },
  endTitle: { es: '¡Llegaste!', en: 'You made it!' },
  endText: { es: 'Terca hasta el final. El cerro quedó atrás, con todas sus trampas.', en: 'Stubborn to the very end. The mountain is behind you, traps and all.' },
  playAgain: { es: 'Jugar de nuevo', en: 'Play again' },
  sTime: { es: 'Tiempo', en: 'Time' },
  sDeaths: { es: 'Porrazos', en: 'Deaths' },
  sCarrots: { es: 'Zanahorias', en: 'Carrots' },
  sDiff: { es: 'Dificultad', en: 'Difficulty' },
  sBest: { es: 'Tu mejor tiempo', en: 'Your best time' },
  bestLine: { es: 'Mejor: {t} · {n} porrazos ({d})', en: 'Best: {t} · {n} deaths ({d})' },
  tCp: { es: 'Fogón prendido', en: 'Campfire lit' },
  tCarrot: { es: 'Zanahoria secreta {n}/{m}', en: 'Secret carrot {n}/{m}' },
  tBoss: { es: '¡Jefe vencido!', en: 'Boss defeated!' },
  rotate: { es: 'Girá el celular', en: 'Rotate your phone' },
  h1: { es: 'Corré con ← → (o A D) y saltá con ↑, W o Espacio. Mantené apretado para saltar más alto; en el aire tenés un salto más.', en: 'Run with ← → (or A D) and jump with ↑, W or Space. Hold to jump higher; you get one more jump in the air.' },
  h2: { es: 'Pateá piedritas con X (o Z): rompen bloques frágiles, tocan los cencerros, prenden fogones y bajan a los bichos.', en: 'Kick pebbles with X (or Z): they break cracked blocks, ring the bells, light campfires and knock down bugs.' },
  h3: { es: 'Una punta, un bicho o una trampa y volvés al último fogón. Pasá cerca de uno para prenderlo.', en: 'One spike, bug or trap and you are back at the last campfire. Walk past one to light it.' },
  h4: { es: 'Nada es lo que parece: el piso se cae, los bloques aparecen y los cartelitos a veces mienten.', en: 'Nothing is what it seems: floors crumble, blocks pop out of nowhere and signs sometimes lie.' },
  h5: { es: 'Cada zona guarda una piedra. Con las cuatro en la apacheta del Puesto se abre la cumbre.', en: 'Each zone hides a stone. With all four on the Outpost cairn the summit opens.' },
  h6: { es: 'R vuelve al último fogón. Esc pausa. En el celular: botones en pantalla.', en: 'R returns to the last campfire. Esc pauses. On a phone: on-screen buttons.' },
  quipA: { es: ['¡Auch!', '¡Terco!', '¡Otra vez!', '¡Casi!', '¡Uf!', '¡Ay, mi cola!', '¡Pará, pará!'], en: ['Ouch!', 'Stubborn!', 'Again!', 'So close!', 'Oof!', 'My tail!', 'Whoa, whoa!'] },
};
const tr = (k, v) => {
  let s = GI.t(TXT[k]) ?? k;
  if (v) for (const x in v) s = s.replaceAll(`{${x}}`, v[x]);
  return s;
};
const zoneName = (id) => GI.t(ZONES.find((z) => z.id === id)?.name || { es: id, en: id });
const fmtT = (s) => {
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s % 60).padStart(2, '0')}`;
};
const stepsToSec = (n) => n / 60;

// ---------------------------------------------------------------- guardado
const lsGet = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem(`gameit:${ID}:${k}`)) ?? d;
  } catch {
    return d;
  }
};
const lsSet = (k, v) => {
  try {
    localStorage.setItem(`gameit:${ID}:${k}`, JSON.stringify(v));
  } catch {}
};
const lsDel = (k) => {
  try {
    localStorage.removeItem(`gameit:${ID}:${k}`);
  } catch {}
};

// ---------------------------------------------------------------- estado
let G = null; // la partida
let demo = null; // el fondo del inicio
const S = { screen: 'home', over: 'home', paused: false, acc: 0, px: 20, ox: 0, oy: 0, shake: 0, parts: [], layers: new Map(), dk: null, lastRoom: '', lastZone: '', lastDie: -9, rotate: false, helpFrom: 'home', hud: '', bannerT: 0, toastT: 0, quipT: 0, signKey: '', pending: null, lastBoss: '' };

const cv = $('c');
const g = cv.getContext('2d');
let Wd = 0, Hd = 0, dpr = 1;
function resize() {
  Wd = innerWidth;
  Hd = innerHeight;
  dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(Wd * dpr);
  cv.height = Math.round(Hd * dpr);
  S.rotate = !!GI.prefs.touch && Hd > Wd * 1.15;
  $('rotate').hidden = !S.rotate;
}
addEventListener('resize', resize);

// ---------------------------------------------------------------- pantallas
function showScreen(id) {
  S.over = id;
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === `s-${id}`);
  const inGame = !!G && S.screen === 'play';
  $('hud').hidden = !inGame;
  $('pad').hidden = !(inGame && !id && GI.prefs.touch);
  if (!inGame || id) $('sign').hidden = true;
  GI.gameplay(inGame && !id && !S.paused);
}

function translate() {
  document.documentElement.lang = GI.prefs.lang;
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = tr(el.dataset.t);
  const save = lsGet('save', null);
  $('b-cont').hidden = !save;
  if (save) {
    const z = ZONES.find((x) => x.id === save.cp?.zone) || null;
    $('b-cont-sub').textContent = tr('contSub', { zone: zoneName(z?.id || save.zone || 'puesto'), n: save.deaths || 0 });
  }
  const best = lsGet('best', {});
  const bd = [2, 1, 0].find((d) => best[d]);
  $('best').textContent = bd != null ? tr('bestLine', { t: fmtT(best[bd].time), n: best[bd].deaths, d: tr(`d${bd}`) }) : '';
  const how = $('how');
  how.innerHTML = '';
  for (const k of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
    const li = document.createElement('li');
    li.textContent = tr(k);
    how.appendChild(li);
  }
  const ds = $('diffs');
  ds.innerHTML = '';
  for (let d = 0; d < 3; d++) {
    const b = document.createElement('button');
    b.className = 'diff';
    b.innerHTML = '<b></b><span></span>';
    b.querySelector('b').textContent = tr(`d${d}`);
    b.querySelector('span').textContent = tr(`d${d}t`);
    b.onclick = () => begin(d);
    ds.appendChild(b);
  }
  $('diff-warn').hidden = !save;
  $('rotate').querySelector('b').textContent = tr('rotate');
  hudUpdate(true);
}

// ---------------------------------------------------------------- partida
function begin(diff) {
  lsDel('save');
  G = newGame(diff, { fx: true });
  S.screen = 'play';
  S.paused = false;
  S.parts.length = 0;
  S.lastRoom = '';
  S.lastZone = '';
  onRoom();
  saveNow();
  if (!lsGet('seenHelp', false)) {
    lsSet('seenHelp', true);
    S.helpFrom = 'play';
    showScreen('help');
  } else showScreen(null);
  music.zone(G.S.R.zone);
}
function continueGame() {
  const data = lsGet('save', null);
  if (!data) return begin(0);
  G = resume(data, { fx: true });
  G.won = false;
  S.screen = 'play';
  S.paused = false;
  S.parts.length = 0;
  S.lastRoom = '';
  S.lastZone = '';
  onRoom();
  showScreen(null);
  music.zone(G.S.R.zone);
}
function saveNow() {
  if (G) lsSet('save', { ...snapshot(G), zone: G.S.R.zone });
}
function toHome() {
  saveNow();
  G = null;
  S.screen = 'home';
  S.paused = false;
  S.lastRoom = '';
  translate();
  showScreen('home');
  music.zone('puesto');
}
function pause() {
  if (S.screen !== 'play' || S.over) return;
  S.paused = true;
  $('p-where').textContent = tr('where', { zone: zoneName(G.S.R.zone), n: G.deaths, t: fmtT(stepsToSec(G.steps)) });
  saveNow();
  showScreen('pause');
}
function unpause() {
  S.paused = false;
  S.acc = 0;
  last = performance.now();
  showScreen(null);
}

function onRoom() {
  const R = G.S.R;
  if (S.lastRoom === R.id) return;
  S.lastRoom = R.id;
  const zone = R.zone;
  const nm = R.def.name ? GI.t(R.def.name) : '';
  if (zone !== S.lastZone) {
    S.lastZone = zone;
    music.zone(zone);
    banner(zoneName(zone), nm === zoneName(zone) ? '' : nm);
  } else if (nm) banner(nm, '');
  S.dk = null;
}

let bannerTimer = 0;
function banner(a, b) {
  const el = $('room');
  el.innerHTML = '';
  el.append(document.createTextNode(a));
  if (b) {
    const s = document.createElement('small');
    s.textContent = b;
    el.appendChild(s);
  }
  el.classList.add('on');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove('on'), 2600);
}
let toastTimer = 0;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 1900);
}
let quipTimer = 0;
function quip(text) {
  const el = $('quip');
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(quipTimer);
  quipTimer = setTimeout(() => el.classList.remove('on'), 650);
}

function stoneScreen(e) {
  S.paused = true;
  const n = G.stones.length, m = STONES.length;
  $('st-kicker').textContent = tr('stoneK', { n, m });
  $('st-title').textContent = tr('stoneT', { zone: zoneName(e.id) });
  $('st-sub').textContent = n >= m ? tr('stoneAll') : tr('stoneS');
  const c = $('st-c').getContext('2d');
  c.clearRect(0, 0, 240, 160);
  const gl = c.createRadialGradient(120, 80, 6, 120, 80, 80);
  gl.addColorStop(0, 'rgba(255,255,255,.7)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = gl;
  c.fillRect(0, 0, 240, 160);
  c.save();
  c.translate(120, 120);
  c.scale(150, 150);
  Rn.stoneArt(c, 0, 0, Rn.STONE_COL[e.id] || '#ffd23f', 1);
  c.restore();
  saveNow();
  showScreen('stone');
}
function win() {
  const secs = stepsToSec(G.steps);
  const best = lsGet('best', {});
  const old = best[G.diff];
  if (!old || secs < old.time) best[G.diff] = { time: secs, deaths: G.deaths };
  lsSet('best', best);
  const st = $('e-stats');
  st.innerHTML = '';
  const row = (a, b) => {
    const li = document.createElement('li');
    li.innerHTML = '<span></span><b></b>';
    li.firstChild.textContent = a;
    li.lastChild.textContent = b;
    st.appendChild(li);
  };
  row(tr('sTime'), fmtT(secs));
  row(tr('sDeaths'), String(G.deaths));
  row(tr('sCarrots'), `${G.carrots.length} / ${CARROTS.length}`);
  row(tr('sDiff'), tr(`d${G.diff}`));
  if (old && old.time <= secs) row(tr('sBest'), fmtT(old.time));
  // la partida queda en el Puesto para buscar las zanahorias que falten
  G.flags.finished = 1;
  G.cp = { room: START.hub, id: START.hubSpawn };
  saveNow();
  S.screen = 'end';
  sfx('win');
  showScreen('end');
}

// ---------------------------------------------------------------- eventos de la simulación
function handle() {
  for (const e of G.ev) {
    switch (e.k) {
      case 'room':
        onRoom();
        break;
      case 'cp':
        toast(tr('tCp'));
        saveNow();
        break;
      case 'carrot':
        toast(tr('tCarrot', { n: G.carrots.length, m: CARROTS.length }));
        saveNow();
        break;
      case 'bossdown':
        toast(tr('tBoss'));
        break;
      case 'stone':
        sfx('stone');
        stoneScreen(e);
        break;
      case 'win':
        win();
        break;
      case 'die': {
        S.shake = GI.prefs.reducedMotion ? 0 : 0.35;
        const now = performance.now() / 1000;
        if (now - S.lastDie > 1.4 && Math.random() < 0.6) quip(pick(GI.t(TXT.quipA)));
        S.lastDie = now;
        break;
      }
    }
  }
  if (G.S?.fx) for (const f of G.S.fx) fxEvent(f);
}

const COL = { dust: ['#e9c9a0', '#c9a27a', '#fff3d6'], blood: ['#e83f6f', '#ffb000', '#2ec4b6', '#7a3fd0', '#f25c05'], spark: ['#ffd23f', '#ffb000', '#fff3b0'], rock: ['#8d8380', '#b3a79d', '#5e4e33'] };
function burst(x, y, n, cols, spd = 3, grav = 9, life = 0.6, up = 0) {
  if (GI.prefs.reducedMotion) n = Math.ceil(n / 3);
  for (let i = 0; i < n && S.parts.length < 260; i++) {
    const a = Math.random() * Math.PI * 2, v = (0.3 + Math.random()) * spd;
    S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, g: grav, life: life * (0.6 + Math.random() * 0.7), t: 0, c: pick(cols), r: 0.05 + Math.random() * 0.06 });
  }
}
function fxEvent(f) {
  const { k, x, y } = f;
  switch (k) {
    case 'jump':
      sfx('jump');
      burst(x, y, 4, COL.dust, 1.2, 3, 0.35);
      break;
    case 'jump2':
      sfx('jump2');
      burst(x, y - 0.3, 6, COL.dust, 1.5, 2, 0.35);
      break;
    case 'land':
      sfx('land');
      burst(x, y, 5, COL.dust, 1.4, 4, 0.35);
      break;
    case 'spring':
      sfx('spring');
      burst(x, y, 8, COL.spark, 2, 4, 0.4);
      break;
    case 'die':
      sfx('die');
      burst(x, y, 26, COL.blood, 4.2, 10, 0.9, 2.5);
      break;
    case 'cp':
      sfx('cp');
      burst(x, y - 0.5, 14, COL.spark, 2.6, -3, 0.9);
      break;
    case 'carrot':
      sfx('carrot');
      burst(x, y, 16, COL.spark, 3, 3, 0.8);
      break;
    case 'stone':
      burst(x, y, 24, COL.spark, 4, 2, 1);
      break;
    case 'break':
      sfx('break');
      burst(x, y, 12, COL.rock, 3.2, 12, 0.7);
      break;
    case 'crumble':
      sfx('crumble');
      burst(x, y, 7, COL.rock, 1.8, 10, 0.6);
      break;
    case 'fake':
      burst(x, y, 3, COL.dust, 1.2, 4, 0.4);
      break;
    case 'hid':
      sfx('hid');
      burst(x, y, 8, COL.rock, 2.2, 8, 0.5);
      break;
    case 'smash':
      sfx('smash');
      burst(x, y, 12, COL.rock, 3.5, 12, 0.6);
      S.shake = Math.max(S.shake, GI.prefs.reducedMotion ? 0 : 0.18);
      break;
    case 'thud':
      sfx('thud');
      burst(x, y, 6, COL.dust, 2, 5, 0.4);
      S.shake = Math.max(S.shake, GI.prefs.reducedMotion ? 0 : 0.14);
      break;
    case 'shot':
      sfx('shot');
      break;
    case 'tick':
      sfx('tick');
      burst(x, y, 2, COL.dust, 1, 3, 0.25);
      break;
    case 'creak':
      sfx('creak');
      break;
    case 'trap':
    case 'go':
      sfx('trap');
      break;
    case 'pew':
      sfx('pew');
      break;
    case 'puff':
      burst(x, y, 3, COL.dust, 1, 2, 0.3);
      break;
    case 'switch':
      sfx('bell');
      burst(x, y, 6, COL.spark, 2, 3, 0.5);
      break;
    case 'gate':
      sfx('gate');
      break;
    case 'hurt':
      sfx('hurt');
      burst(x, y, 4, COL.blood, 2, 6, 0.4);
      break;
    case 'pop':
      sfx('pop');
      burst(x, y, 14, COL.blood, 3.4, 8, 0.7);
      break;
    case 'bosshit':
      sfx('bosshit');
      burst(x, y, 6, COL.spark, 3, 6, 0.4);
      break;
    case 'bossdie':
      sfx('bossdie');
      burst(x, y, 40, COL.blood, 6, 6, 1.4, 2);
      S.shake = GI.prefs.reducedMotion ? 0 : 0.7;
      break;
    case 'warn':
      sfx('warn');
      break;
    case 'boom':
      sfx('boom');
      burst(x, y, 16, COL.rock, 4, 8, 0.8);
      S.shake = Math.max(S.shake, GI.prefs.reducedMotion ? 0 : 0.3);
      break;
  }
}

// ---------------------------------------------------------------- entrada
const held = new Set();
let jLatch = false, fLatch = false;
const tk = { l: false, r: false, j: false, f: false };
const KEYS_J = ['Space'];
const KEYS_F = ['KeyX', 'KeyZ', 'KeyK', 'ShiftLeft', 'ShiftRight'];
function keyDir(name) {
  const k = GI.prefs.keys;
  const arrows = k !== 'wasd', wasd = k !== 'arrows';
  if (name === 'l') return (arrows && held.has('ArrowLeft')) || (wasd && held.has('KeyA'));
  if (name === 'r') return (arrows && held.has('ArrowRight')) || (wasd && held.has('KeyD'));
  return (arrows && held.has('ArrowUp')) || (wasd && held.has('KeyW'));
}
const isJumpKey = (c) => KEYS_J.includes(c) || (c === 'ArrowUp' && GI.prefs.keys !== 'wasd') || (c === 'KeyW' && GI.prefs.keys !== 'arrows');
let padPrev = 0;
function pads() {
  const p = (navigator.getGamepads?.() || []).find(Boolean);
  if (!p) return { l: false, r: false, j: false, f: false, start: false };
  const b = (i) => !!p.buttons[i]?.pressed;
  const ax = p.axes[0] || 0;
  return { l: ax < -0.45 || b(14), r: ax > 0.45 || b(15), j: b(0) || b(12), f: b(1) || b(2) || b(5) || b(7), start: b(9) };
}
function readInput() {
  const p = pads();
  const j = keyDir('u') || KEYS_J.some((c) => held.has(c)) || tk.j || p.j;
  const f = KEYS_F.some((c) => held.has(c)) || tk.f || p.f;
  let inp = 0;
  if (keyDir('l') || tk.l || p.l) inp |= IN.L;
  if (keyDir('r') || tk.r || p.r) inp |= IN.R;
  if (j || jLatch) inp |= IN.J;
  if (f || fLatch) inp |= IN.F;
  if (inp & IN.L && inp & IN.R) inp &= ~(IN.L | IN.R);
  jLatch = fLatch = false;
  if (p.start && !(padPrev & 1)) pause();
  padPrev = p.start ? 1 : 0;
  return inp;
}
addEventListener('keydown', (e) => {
  const c = e.code;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(c)) e.preventDefault();
  if (e.repeat) {
    held.add(c);
    return;
  }
  held.add(c);
  if (S.screen === 'play' && !S.over) {
    if (isJumpKey(c)) jLatch = true;
    if (KEYS_F.includes(c)) fLatch = true;
    if (c === 'KeyR') {
      respawn(G);
      onRoom();
      sfx('ui');
    }
    if (c === 'Escape' || c === 'KeyP') pause();
  } else if (c === 'Escape' || c === 'KeyP') {
    if (S.screen === 'play' && S.over === 'pause') unpause();
  } else if (c === 'Enter' || c === 'Space') {
    const b = document.querySelector('.screen.on .btn.main:not([hidden])');
    if (b) {
      e.preventDefault();
      b.click();
    }
  }
});
addEventListener('keyup', (e) => held.delete(e.code));
addEventListener('blur', () => {
  held.clear();
  tk.l = tk.r = tk.j = tk.f = false;
  for (const el of document.querySelectorAll('.key.on')) el.classList.remove('on');
});

// botones táctiles
(() => {
  const dirEl = $('pad-dir'), kl = $('k-l'), kr = $('k-r');
  const setDir = (e) => {
    const r = dirEl.getBoundingClientRect();
    const left = e.clientX < r.left + r.width / 2;
    tk.l = left;
    tk.r = !left;
    kl.classList.toggle('on', left);
    kr.classList.toggle('on', !left);
  };
  const clear = () => {
    tk.l = tk.r = false;
    kl.classList.remove('on');
    kr.classList.remove('on');
  };
  dirEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try {
      dirEl.setPointerCapture(e.pointerId);
    } catch {}
    setDir(e);
  });
  dirEl.addEventListener('pointermove', (e) => {
    if (tk.l || tk.r) setDir(e);
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) dirEl.addEventListener(ev, clear);
  const btn = (el, key) => {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {}
      tk[key] = true;
      if (key === 'j') jLatch = true;
      else fLatch = true;
      el.classList.add('on');
    });
    const off = () => {
      tk[key] = false;
      el.classList.remove('on');
    };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, off);
  };
  btn($('k-j'), 'j');
  btn($('k-f'), 'f');
})();

// ---------------------------------------------------------------- marcador
function hudUpdate(force) {
  if (!G) return;
  const key = `${G.deaths}|${Math.floor(G.steps / 60)}|${G.stones.join()}|${G.carrots.length}|${GI.prefs.lang}`;
  if (!force && key === S.hud) return;
  S.hud = key;
  $('h-deaths').lastChild.textContent = G.deaths;
  $('h-time').textContent = fmtT(stepsToSec(G.steps));
  $('h-carrots').lastChild.textContent = `${G.carrots.length}/${CARROTS.length}`;
  const st = $('h-stones');
  if (st.childElementCount !== STONES.length) {
    st.innerHTML = '';
    for (const id of STONES) {
      const i = document.createElement('i');
      i.dataset.id = id;
      st.appendChild(i);
    }
  }
  for (const i of st.children) {
    const on = G.stones.includes(i.dataset.id);
    i.classList.toggle('on', on);
    i.style.background = on ? Rn.STONE_COL[i.dataset.id] : 'transparent';
  }
}
function bossUpdate() {
  const B = G?.S.boss;
  const show = !!B && B.on && !B.dead && S.screen === 'play';
  $('boss').hidden = !show;
  if (!show) return;
  if (S.lastBoss !== B.kind) {
    S.lastBoss = B.kind;
    $('boss-name').textContent = GI.t(BOSS_NAMES[B.kind] || { es: B.kind, en: B.kind });
  }
  $('boss-hp').style.width = `${clamp(B.hp / B.max, 0, 1) * 100}%`;
}
function signUpdate() {
  const el = $('sign');
  if (S.screen !== 'play' || S.over || !G) {
    el.hidden = true;
    return;
  }
  const Sx = G.S, h = Sx.h;
  let best = null, bd = 9;
  for (const d of Sx.R.ents) {
    if (d.t !== 'sign') continue;
    const dx = Math.abs(h.x - d.x), dy = Math.abs(h.y - d.y);
    if (dx < 1.7 && dy < 2.2 && dx < bd) {
      bd = dx;
      best = d;
    }
  }
  if (!best) {
    el.hidden = true;
    return;
  }
  const txt = typeof best.text === 'string' ? best.text : GI.t(best.text);
  const key = `${best.x}|${txt}`;
  if (key !== S.signKey) {
    S.signKey = key;
    el.textContent = txt;
  }
  el.hidden = false;
  el.style.left = `${S.ox + best.x * S.px}px`;
  el.style.top = `${S.oy + (best.y - 1.05) * S.px}px`;
}

// ---------------------------------------------------------------- bucle
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const tt = now / 1000;
  const playing = S.screen === 'play' && !S.over && !S.paused && !GI.paused && !S.rotate;
  if (playing) {
    S.acc += dt;
    let n = 0;
    while (S.acc >= STEP && n++ < 5) {
      S.acc -= STEP;
      stepGame(G, readInput());
      handle();
      if (S.screen !== 'play' || S.over || S.paused) break;
    }
    if (n >= 5) S.acc = 0;
    hudUpdate(false);
    bossUpdate();
    signUpdate();
  } else {
    if (!G || S.screen !== 'play') {
      demo.S.fx = null;
      stepGame(demo, 0);
    }
    if (S.screen !== 'play') $('boss').hidden = true;
    if (S.rotate && S.screen === 'play' && !S.over) pause();
  }
  draw(tt, dt);
}

function layerFor(R) {
  const px = Math.max(1, Math.round(S.px * dpr));
  let c = S.layers.get(R.id);
  if (!c || c.px !== px) {
    c = { px, cv: Rn.staticLayer(R, px) };
    S.layers.set(R.id, c);
    if (S.layers.size > 6) S.layers.delete(S.layers.keys().next().value);
  }
  return c.cv;
}

function draw(tt, dt) {
  const cur = G && (S.screen === 'play' || S.screen === 'end') ? G : demo;
  const Sx = cur.S, R = Sx.R;
  const still = !!GI.prefs.reducedMotion;
  S.px = Math.max(6, Math.min(Wd / RW, (Hd - TOP) / RH));
  S.ox = (Wd - RW * S.px) / 2;
  S.oy = TOP + (Hd - TOP - RH * S.px) / 2;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#24120e';
  g.fillRect(0, 0, Wd, Hd);
  S.shake = Math.max(0, S.shake - dt);
  const sh = S.shake > 0 && !still ? S.shake * 5 : 0;
  g.save();
  g.translate(S.ox + (sh ? (Math.random() - 0.5) * sh : 0), S.oy + (sh ? (Math.random() - 0.5) * sh : 0));
  g.scale(S.px, S.px);
  g.drawImage(layerFor(R), 0, 0, RW, RH);
  Rn.drawRoom(g, Sx, { t: tt, still, stones: cur.stones.length, stoneIds: cur.stones, bossArt });
  for (let i = S.parts.length - 1; i >= 0; i--) {
    const p = S.parts[i];
    p.t += dt;
    if (p.t >= p.life) {
      S.parts.splice(i, 1);
      continue;
    }
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    g.globalAlpha = 1 - p.t / p.life;
    g.fillStyle = p.c;
    g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
  }
  g.globalAlpha = 1;
  if (R.dark) {
    S.dk ||= Object.assign(document.createElement('canvas'), { width: RW * 8, height: RH * 8 });
    Rn.darkness(g, Sx, S.dk, tt, still);
  }
  g.restore();
}

// ---------------------------------------------------------------- botones
$('b-new').onclick = () => {
  translate();
  showScreen('diff');
};
$('b-cont').onclick = () => continueGame();
$('b-help').onclick = () => {
  S.helpFrom = 'home';
  showScreen('help');
};
$('help-ok').onclick = () => {
  if (S.helpFrom === 'pause') showScreen('pause');
  else if (S.helpFrom === 'play') {
    S.paused = false;
    last = performance.now();
    showScreen(null);
  } else showScreen('home');
};
for (const b of document.querySelectorAll('[data-go]')) b.onclick = () => showScreen('home');
$('b-pause').onclick = () => pause();
$('p-resume').onclick = () => unpause();
$('p-retry').onclick = () => {
  respawn(G);
  onRoom();
  unpause();
};
$('p-help').onclick = () => {
  S.helpFrom = 'pause';
  showScreen('help');
};
$('p-home').onclick = () => toHome();
$('st-ok').onclick = () => {
  S.paused = false;
  S.acc = 0;
  last = performance.now();
  showScreen(null);
};
$('e-again').onclick = () => {
  G = null;
  S.screen = 'home';
  translate();
  showScreen('diff');
};
$('e-home').onclick = () => toHome();
for (const b of document.querySelectorAll('.screen button')) b.addEventListener('click', () => sfx('ui'));

GI.onPause(() => {
  if (S.screen === 'play' && !S.over) pause();
});
GI.onResume(() => (last = performance.now()));
GI.onLeave?.(() => saveNow());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && S.screen === 'play' && !S.over) pause();
  if (document.hidden) saveNow();
});
GI.onPrefs(() => {
  resize();
  translate();
  S.layers.clear();
}, true);

// para pruebas y depuración
window.__terco = {
  S,
  game: () => G,
  begin,
  tp(room, spawn = 'start') {
    import('./shared/world.js').then((w) => {
      w.enter(G, room, spawn);
      onRoom();
    });
  },
};

resize();
demo = newGame(0);
translate();
showScreen('home');
requestAnimationFrame(frame);
GI.gameplay(false);
GI.ready();
