/* Nébula — game.it
 * Pinball espacial de una mesa: flippers, lanzador, hongos, gomas, blancos con las letras N-É-B-U-L-A, carriles de
 * arriba que suben el bonus, una órbita con molinete, la rampa del cometa y un agujero negro que larga misiones
 * (multibola, hipervelocidad y carrera estelar). Tres pelotas, bola extra, pelota salvada, combos y TILT.
 * Física en shared/physics.js y reglas en shared/rules.js (puras, probadas en tests/nebula.test.mjs); dibujo de la
 * mesa en render.js y el visor de puntos en dmd.js.
 */
import { World } from './shared/physics.js';
import { Rules, MISSIONS, MSG, fmt, setLocale } from './shared/rules.js';
import { W, H, LETTERS, PLUNGER } from './shared/table.js';
import { Table, COL, INSERTS } from './render.js';
import { DMD, DW, DH, bitmap } from './dmd.js';
import { tone, noise, notes } from '/shared/sfx.js';

const G = window.GameIt;
const ID = 'nebula';
const $ = (id) => document.getElementById(id);
const $$ = (s) => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TOP = 56;
const FIXED = /[?&]fixed\b/.test(location.search);

const TXT = {
  tagline: { es: 'Pinball espacial. Prendé las letras, entrá al agujero negro y cumplí las misiones.', en: 'Space pinball. Light the letters, shoot the black hole and complete the missions.' },
  play: { es: 'Jugar', en: 'Play' },
  help: { es: 'Cómo se juega', en: 'How to play' },
  best: { es: 'Récord {n}', en: 'High score {n}' },
  noBest: { es: 'Todavía no hay récord', en: 'No high score yet' },
  keysDesk: { es: '← → flippers · mantené ↓ para lanzar · ↑ sacudir', en: '← → flippers · hold ↓ to launch · ↑ nudge' },
  keysTouch: { es: 'Tocá a la izquierda o a la derecha para los flippers', en: 'Tap left or right for the flippers' },
  launch: { es: 'LANZAR', en: 'LAUNCH' },
  nudge: { es: 'SACUDIR', en: 'NUDGE' },
  paused: { es: 'Pausa', en: 'Paused' },
  resume: { es: 'Seguir', en: 'Resume' },
  restart: { es: 'Empezar de nuevo', en: 'Start over' },
  quit: { es: 'Salir al menú', en: 'Quit to menu' },
  optShake: { es: 'Sacudón de pantalla', en: 'Screen shake' },
  optVib: { es: 'Vibración', en: 'Vibration' },
  on: { es: 'sí', en: 'on' },
  off: { es: 'no', en: 'off' },
  overTitle: { es: 'Fin del juego', en: 'Game over' },
  newBest: { es: '¡Nuevo récord!', en: 'New high score!' },
  topTitle: { es: 'Tus mejores partidas', en: 'Your best games' },
  noTop: { es: 'Acá van a aparecer tus mejores partidas.', en: 'Your best games will show up here.' },
  again: { es: 'Otra partida', en: 'Play again' },
  menu: { es: 'Menú', en: 'Menu' },
  oneMore: { es: 'Una pelota más', en: 'One more ball' },
  oneMoreSub: { es: 'mirando un anuncio', en: 'by watching an ad' },
  back: { es: '← volver', en: '← back' },
  rotate: { es: 'Se juega mejor con el teléfono parado', en: 'Best played in portrait' },
  sRamps: { es: 'rampas', en: 'ramps' },
  sOrbits: { es: 'órbitas', en: 'orbits' },
  sBumpers: { es: 'hongos', en: 'bumpers' },
  sLetters: { es: 'letras', en: 'letters' },
  sMissions: { es: 'misiones', en: 'missions' },
  sJackpots: { es: 'jackpots', en: 'jackpots' },
  today: { es: 'hoy', en: 'today' },
  tutDesk: { es: 'Mantené <kbd>↓</kbd> y soltá para lanzar.<br><kbd>←</kbd> <kbd>→</kbd> mueven los flippers.', en: 'Hold <kbd>↓</kbd> and release to launch.<br><kbd>←</kbd> <kbd>→</kbd> move the flippers.' },
  tutTouch: { es: 'Mantené <b>LANZAR</b> y soltá.<br>Tocá a la izquierda o a la derecha para los flippers.', en: 'Hold <b>LAUNCH</b> and release.<br>Tap left or right for the flippers.' },
  tutFlip: { es: '¡Bien! Ahora que no se te caiga.', en: 'Nice! Now keep it alive.' },
  kLeft: { es: 'flipper izquierdo', en: 'left flipper' },
  kRight: { es: 'flipper derecho', en: 'right flipper' },
  kLaunch: { es: 'lanzar (mantené)', en: 'launch (hold)' },
  kNudge: { es: 'sacudir la mesa', en: 'nudge the table' },
  kPause: { es: 'pausa', en: 'pause' },
  missionsTitle: { es: 'Las misiones del agujero negro', en: 'Black hole missions' },
  attractSub: { es: 'PINBALL ESPACIAL', en: 'SPACE PINBALL' },
  attractBest: { es: 'RÉCORD', en: 'HIGH SCORE' },
  attractLast: { es: 'ÚLTIMA PARTIDA', en: 'LAST GAME' },
  attractPlay: { es: 'PULSÁ JUGAR', en: 'PRESS PLAY' },
  attractTop: { es: 'MEJORES', en: 'TOP SCORES' },
  dmdPower: { es: 'FUERZA', en: 'POWER' },
  spBest: { es: 'Récord', en: 'High score' },
  spLetters: { es: 'Letras', en: 'Letters' },
  spBalls: { es: 'Pelota', en: 'Ball' },
  missionsTitleShort: { es: 'Misiones', en: 'Missions' },
};
const HOWTO = [
  ['⟵⟶', { es: '<b>Flippers:</b> <kbd>←</kbd> y <kbd>→</kbd> (o <kbd>Z</kbd> y <kbd>M</kbd>). En pantalla táctil, tocá la mitad izquierda o la derecha.', en: '<b>Flippers:</b> <kbd>←</kbd> and <kbd>→</kbd> (or <kbd>Z</kbd> and <kbd>M</kbd>). On touch screens, tap the left or right half.' }],
  ['↓', { es: '<b>Lanzador:</b> mantené <kbd>↓</kbd> o <kbd>Espacio</kbd> y soltá. Si la pelota entra por el carril de arriba que parpadea: <b>tiro preciso</b>.', en: '<b>Plunger:</b> hold <kbd>↓</kbd> or <kbd>Space</kbd> and release. If the ball drops into the blinking top lane: <b>skill shot</b>.' }],
  ['↑', { es: '<b>Sacudir:</b> <kbd>↑</kbd> empuja la mesa y ayuda a salvar la pelota. Si sacudís de más: <b>TILT</b> y se pierde la pelota.', en: '<b>Nudge:</b> <kbd>↑</kbd> bumps the table and helps save the ball. Overdo it: <b>TILT</b> and the ball is lost.' }],
  ['NÉ', { es: '<b>Letras NÉBULA:</b> N-É-B a la izquierda y U-L-A (los blancos que caen) a la derecha. Con las seis se prende el <b>agujero negro</b>.', en: '<b>NÉBULA letters:</b> N-É-B on the left and U-L-A (the drop targets) on the right. All six light the <b>black hole</b>.' }],
  ['⟳', { es: '<b>Rampa del cometa y órbita:</b> seguidas hacen <b>combo</b>. La órbita sube por la izquierda; la rampa, por la derecha.', en: '<b>Comet ramp and orbit:</b> chain them for <b>combos</b>. The orbit goes up on the left; the ramp on the right.' }],
  ['×', { es: '<b>Carriles de arriba:</b> pasá por los tres para subir el bonus hasta ×5. Los flippers corren las luces.', en: '<b>Top lanes:</b> go through all three to raise the bonus up to ×5. The flippers shift the lights.' }],
  ['★', { es: 'Al empezar cada pelota hay unos segundos de <b>pelota salvada</b>. Dos misiones dan <b>bola extra</b>; las tres, <b>SUPERNOVA</b>.', en: 'Each ball starts with a few seconds of <b>ball save</b>. Two missions give an <b>extra ball</b>; all three, <b>SUPERNOVA</b>.' }],
];
const MISSION_INFO = {
  lluvia: { c: COL.cyan, d: { es: 'Multibola: salen dos pelotas más del agujero. Cada rampa es un jackpot de 250.000.', en: 'Multiball: two more balls come out of the hole. Every ramp is a 250,000 jackpot.' } },
  hiper: { c: COL.amber, d: { es: '30 segundos en que todo vale el triple.', en: '30 seconds where everything scores triple.' } },
  carrera: { c: COL.magenta, d: { es: 'Pegale a lo que marcan las flechas: órbita, rampa, agujero o letras. Cada acierto suma 6 segundos.', en: 'Hit what the arrows show: orbit, ramp, hole or letters. Every hit adds 6 seconds.' } },
};

const t = (k, v) => {
  let s = G.t(TXT[k] || { es: k }) ?? k;
  if (v) for (const x in v) s = s.replace(`{${x}}`, v[x]);
  return s;
};
const lang = () => (G.prefs.lang === 'en' ? 'en' : 'es');

// ---------------------------------------------------------------- guardado
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(`gameit:${ID}:${k}`);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`gameit:${ID}:${k}`, JSON.stringify(v));
    } catch {}
  },
};
const opts = Object.assign({ shake: true, vib: true }, store.get('opts', {}));
let top = store.get('top', []);
let lastScore = store.get('last', 0);
const bestScore = () => (top[0]?.s || 0);

// ---------------------------------------------------------------- estado
const S = {
  phase: 'menu',
  world: null,
  rules: null,
  charge: 0,
  plVis: 0,
  autoT: 0,
  nudgeCool: 0,
  shake: 0,
  overT: 0,
  playT: 0,
  tut: 0, // 0 sin tutorial, 1 lanzar, 2 flippers, 3 listo
  tutT: 0,
  flips: 0,
  launched: false,
  attract: null,
  attractT: 0,
  chargeTick: 0,
};
const input = { left: false, right: false, plunge: false, keys: new Set(), ptr: new Map(), btnPlunge: false, pad: { left: false, right: false, plunge: false } };

const cv = $('c');
const ctx = cv.getContext('2d');
const table = new Table();
const dmd = new DMD();
const L = { dpr: 1, scale: 1, tx: 0, ty: 0, tw: 0, th: 0, dx: 0, dy: 0, dw: 0, dh: 0, portrait: true, bg: null };

// ---------------------------------------------------------------- disposición
function layout() {
  const vw = innerWidth, vh = innerHeight;
  L.dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(vw * L.dpr);
  cv.height = Math.round(vh * L.dpr);
  const availH = vh - TOP - 14;
  const wideScale = Math.min(availH / H, (vw * 0.62) / W);
  const side = (vw - W * wideScale) / 2;
  L.portrait = side < 240;
  if (!L.portrait) {
    L.scale = wideScale;
    L.tw = W * L.scale;
    L.th = H * L.scale;
    L.tx = Math.round((vw - L.tw) / 2);
    L.ty = Math.round(TOP + 6 + (availH - L.th) / 2);
    L.dw = Math.round(Math.min(side - 44, 480));
    L.dh = Math.round(L.dw / 4);
    L.dx = Math.round(L.tx - 22 - L.dw);
    L.dy = Math.round(L.ty + Math.max(10, L.th * 0.12));
  } else {
    // a la derecha del visor queda lugar para el botón de pausa
    const dw = Math.min(vw - 78, 520);
    let dh = Math.round(dw / 4);
    let scale = Math.min((vw - 8) / W, (availH - dh - 12) / H);
    // pantallas muy bajas: el visor se achica para que la mesa no quede chiquita
    if (scale * W < vw * 0.5 && dh > 60) {
      dh = 60;
      scale = Math.min((vw - 8) / W, (availH - dh - 12) / H);
    }
    L.scale = scale;
    L.tw = W * scale;
    L.th = H * scale;
    L.dw = Math.round(dh * 4);
    L.dh = dh;
    L.dx = Math.round(Math.max(10, (vw - 66 - L.dw) / 2));
    L.dy = TOP + 6;
    L.tx = Math.round((vw - L.tw) / 2);
    L.ty = Math.round(L.dy + L.dh + 10 + (availH - dh - 12 - L.th) / 2);
  }
  buildBg(vw, vh);
  placeHud();
}

function buildBg(vw, vh) {
  const b = document.createElement('canvas');
  b.width = cv.width;
  b.height = cv.height;
  const c = b.getContext('2d');
  c.scale(L.dpr, L.dpr);
  const g = c.createRadialGradient(vw / 2, vh * 0.45, 40, vw / 2, vh * 0.5, Math.max(vw, vh) * 0.8);
  g.addColorStop(0, '#120b30');
  g.addColorStop(0.6, '#07051a');
  g.addColorStop(1, '#030209');
  c.fillStyle = g;
  c.fillRect(0, 0, vw, vh);
  let s = 3;
  const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    const z = R();
    c.fillStyle = `rgba(220,225,255,${0.15 + z * 0.55})`;
    c.beginPath();
    c.arc(R() * vw, R() * vh, 0.4 + z * 1.1, 0, Math.PI * 2);
    c.fill();
  }
  // gabinete: marco alrededor de la mesa
  const pad = Math.max(6, L.scale * 16);
  c.save();
  c.shadowColor = 'rgba(255,79,216,.35)';
  c.shadowBlur = 30;
  const fg = c.createLinearGradient(L.tx - pad, 0, L.tx + L.tw + pad, 0);
  fg.addColorStop(0, '#2a2350');
  fg.addColorStop(0.5, '#3a3270');
  fg.addColorStop(1, '#2a2350');
  c.fillStyle = fg;
  c.beginPath();
  c.roundRect(L.tx - pad, L.ty - pad, L.tw + pad * 2, L.th + pad * 2, pad * 1.4);
  c.fill();
  c.restore();
  c.strokeStyle = 'rgba(64,240,255,.45)';
  c.lineWidth = 1.5;
  c.beginPath();
  c.roundRect(L.tx - pad + 2, L.ty - pad + 2, L.tw + pad * 2 - 4, L.th + pad * 2 - 4, pad * 1.2);
  c.stroke();
  // marco del visor
  const bp = Math.max(5, L.dh * 0.09);
  c.fillStyle = '#17132e';
  c.beginPath();
  c.roundRect(L.dx - bp, L.dy - bp, L.dw + bp * 2, L.dh + bp * 2, bp * 1.5);
  c.fill();
  c.strokeStyle = 'rgba(255,180,60,.35)';
  c.lineWidth = 1.2;
  c.stroke();
  c.fillStyle = '#080503';
  c.fillRect(L.dx, L.dy, L.dw, L.dh);
  L.bg = b;
}

/** Pasa de unidades de mesa a píxeles de pantalla. */
const toScreen = (x, y) => [L.tx + x * L.scale, L.ty + y * L.scale];

function placeHud() {
  const [lx, ly] = toScreen(476, 1036);
  const lb = $('b-launch');
  lb.style.left = `${Math.min(innerWidth - 42, lx)}px`;
  lb.style.top = `${Math.min(innerHeight - 42, ly)}px`;
  const [nx, ny] = toScreen(285, 1086);
  const nb = $('b-nudge');
  nb.style.left = `${nx}px`;
  nb.style.top = `${Math.min(innerHeight - 22, ny)}px`;
  const [tx, ty] = toScreen(285, 900);
  $('tut').style.left = `${tx}px`;
  $('tut').style.top = `${ty}px`;
  const kp = $('keys-panel');
  const showKeys = !L.portrait && !G.prefs.touch && L.dx > 20;
  kp.hidden = !showKeys;
  if (showKeys) {
    kp.style.left = `${L.dx}px`;
    kp.style.top = `${L.dy + L.dh + 26}px`;
    kp.style.width = `${L.dw}px`;
  }
  $('rotate-hint').hidden = !(G.prefs.touch && !L.portrait && innerHeight < 520 && S.phase === 'play');
  // en pantallas anchas el menú y el final van al costado de la mesa, que se sigue viendo
  const sideX = L.tx + L.tw + 24, sideW = innerWidth - sideX - 16;
  const side = !L.portrait && sideW >= 300;
  for (const id of ['s-home', 's-over']) {
    const el = $(id);
    el.classList.toggle('side', side);
    el.style.setProperty('--sx', `${sideX}px`);
    el.style.setProperty('--sw', `${sideW}px`);
  }
  const sp = $('side-panel');
  sp.hidden = !(side && (S.phase === 'play' || S.phase === 'pause'));
  if (!sp.hidden) {
    sp.style.left = `${sideX}px`;
    sp.style.top = `${L.dy}px`;
    sp.style.width = `${Math.min(300, sideW)}px`;
  }
}

/** Panel del costado (pantallas anchas): récord, letras y misiones. */
let sideT = 0;
function updateSide(dt) {
  const sp = $('side-panel');
  if (sp.hidden || !S.rules) return;
  sideT -= dt;
  if (sideT > 0) return;
  sideT = 0.25;
  const r = S.rules;
  const cycle = r.missionsDone % 3;
  const rows = MISSIONS.map((k, i) => {
    const m = MISSION_INFO[k];
    const state = i < cycle ? 'done' : r.mission && r.missionIdx === i ? 'live' : r.missionIdx === i ? 'next' : '';
    const tag = state === 'done' ? '✓' : state === 'live' ? (r.mission.time != null ? `${Math.ceil(r.mission.time)} s` : '●') : state === 'next' && r.holeLit ? '!' : '';
    return `<li class="${state}" style="--c:${m.c}"><span>${G.t(MSG[k])}</span><b>${tag}</b></li>`;
  }).join('');
  const word = LETTERS.map((l) => `<i class="${r.lit[l] ? 'on' : ''}">${l === 'E' ? 'É' : l}</i>`).join('');
  sp.innerHTML = `<p class="sp-k">${t('spBest')}</p><p class="sp-v">${fmtUi(Math.max(bestScore(), r.score))}</p>
    <p class="sp-k">${t('spLetters')}</p><p class="sp-word">${word}</p>
    <p class="sp-k">${t('missionsTitleShort')}</p><ul class="sp-m">${rows}</ul>
    <p class="sp-k">${t('spBalls')}</p><p class="sp-v small">${r.ball} / 3${r.extra ? ` · +${r.extra}` : ''}</p>`;
}

// ---------------------------------------------------------------- sonidos
const sfx = {
  flip() {
    noise(0.05, { freq: 260, q: 0.7, type: 'lowpass', vol: 0.32 });
    tone(140, 70, 0.05, { type: 'square', vol: 0.035 });
  },
  flipDown() {
    noise(0.03, { freq: 500, q: 1, vol: 0.08 });
  },
  bumper(id) {
    const f = { b1: 540, b2: 600, b3: 470 }[id] || 520;
    tone(f, f * 0.36, 0.13, { type: 'square', vol: 0.08 });
    tone(f * 2, f, 0.06, { type: 'sine', vol: 0.06 });
    noise(0.05, { freq: 2600, q: 1.4, vol: 0.14 });
  },
  sling() {
    noise(0.06, { freq: 1000, q: 1, vol: 0.22 });
    tone(320, 130, 0.08, { type: 'triangle', vol: 0.1 });
  },
  target(kind) {
    if (kind === 'drop') {
      noise(0.09, { freq: 520, type: 'lowpass', vol: 0.3 });
      tone(240, 110, 0.09, { type: 'square', vol: 0.05 });
    } else {
      tone(1250, 980, 0.05, { type: 'square', vol: 0.05 });
      noise(0.03, { freq: 3200, q: 2, vol: 0.12 });
    }
  },
  wall(v) {
    noise(0.03, { freq: 900 + Math.min(2500, v * 0.6), q: 1.2, vol: Math.min(0.2, v / 6000) });
  },
  launch(p) {
    noise(0.22, { freq: 260, sweep: 1600 + p * 1200, q: 0.8, vol: 0.18 + p * 0.12 });
    tone(110, 60, 0.12, { type: 'square', vol: 0.05 });
  },
  charge(p) {
    tone(160 + p * 380, 170 + p * 380, 0.04, { type: 'triangle', vol: 0.03 });
  },
  lane() {
    notes([988, 1318], { step: 0.05, dur: 0.12, type: 'sine', vol: 0.08 });
  },
  letter() {
    notes([1046, 1568], { step: 0.06, dur: 0.14, type: 'square', vol: 0.045 });
  },
  lit() {
    notes([523, 659, 784, 1046, 1318, 1568], { step: 0.07, dur: 0.22, type: 'square', vol: 0.05 });
  },
  bank() {
    notes([440, 554, 659, 880], { step: 0.06, dur: 0.16, type: 'triangle', vol: 0.09 });
  },
  rampIn() {
    tone(260, 820, 0.45, { type: 'sawtooth', vol: 0.035 });
    noise(0.45, { freq: 400, sweep: 2400, q: 1.5, vol: 0.06 });
  },
  rampOut() {
    notes([659, 880, 1175], { step: 0.06, dur: 0.16, type: 'triangle', vol: 0.09 });
  },
  orbit() {
    tone(380, 1500, 0.36, { type: 'triangle', vol: 0.07 });
    tone(760, 3000, 0.36, { type: 'sine', vol: 0.03 });
  },
  spin(n) {
    for (let i = 0; i < Math.min(n, 4); i++) tone(2100, 1900, 0.02, { type: 'square', vol: 0.025, at: i * 0.035 });
  },
  hole() {
    tone(700, 50, 0.7, { type: 'sine', vol: 0.14 });
    noise(0.5, { freq: 500, sweep: 70, type: 'lowpass', vol: 0.2 });
  },
  kick() {
    noise(0.08, { freq: 220, type: 'lowpass', vol: 0.35 });
    tone(130, 60, 0.1, { type: 'square', vol: 0.06 });
  },
  jackpot() {
    notes([523, 659, 784, 1046, 784, 1046, 1318, 1568], { step: 0.075, dur: 0.2, type: 'square', vol: 0.06 });
    noise(0.9, { freq: 6000, q: 0.5, type: 'highpass', vol: 0.08 });
    tone(80, 40, 0.6, { type: 'sine', vol: 0.2 });
  },
  skill() {
    notes([1318, 1568, 2093, 2637], { step: 0.06, dur: 0.18, type: 'square', vol: 0.05 });
  },
  bonusX() {
    notes([659, 880, 1318], { step: 0.07, dur: 0.18, type: 'triangle', vol: 0.09 });
  },
  mission() {
    tone(60, 40, 1.1, { type: 'sine', vol: 0.22 });
    notes([392, 523, 659, 784, 1046], { step: 0.12, dur: 0.3, type: 'sawtooth', vol: 0.045 });
  },
  rush() {
    notes([880, 1175, 1760], { step: 0.05, dur: 0.12, type: 'square', vol: 0.05 });
  },
  missionEnd() {
    notes([784, 659, 784, 1046, 1318], { step: 0.1, dur: 0.25, type: 'triangle', vol: 0.1 });
  },
  supernova() {
    tone(40, 1200, 1.6, { type: 'sawtooth', vol: 0.06 });
    noise(1.6, { freq: 200, sweep: 8000, q: 0.6, vol: 0.12 });
    notes([523, 659, 784, 1046, 1318, 1568, 2093], { step: 0.11, dur: 0.4, type: 'square', vol: 0.05 });
  },
  extra() {
    notes([784, 988, 1175, 1568, 1175, 1568], { step: 0.08, dur: 0.2, type: 'triangle', vol: 0.1 });
  },
  tilt() {
    tone(110, 98, 1.1, { type: 'sawtooth', vol: 0.14 });
    tone(116, 100, 1.1, { type: 'square', vol: 0.06 });
  },
  warning() {
    tone(220, 220, 0.12, { type: 'square', vol: 0.06 });
    tone(220, 220, 0.12, { type: 'square', vol: 0.06, at: 0.18 });
  },
  saved() {
    notes([880, 1175, 1760], { step: 0.07, dur: 0.18, type: 'sine', vol: 0.1 });
  },
  drain() {
    tone(240, 70, 0.5, { type: 'triangle', vol: 0.09 });
  },
  ballEnd() {
    notes([523, 440, 349, 262], { step: 0.14, dur: 0.3, type: 'triangle', vol: 0.08 });
  },
  gameOver() {
    notes([392, 330, 262, 196], { step: 0.22, dur: 0.5, type: 'triangle', vol: 0.1 });
  },
  nudge() {
    noise(0.12, { freq: 120, type: 'lowpass', vol: 0.4 });
  },
};
const vibrate = (ms) => {
  if (opts.vib && G.prefs.touch && navigator.vibrate) try {
    navigator.vibrate(ms);
  } catch {}
};

// ---------------------------------------------------------------- visor (mensajes y escenas)
const D = { cur: null, q: [], t: 0, score: 0, scene: 0, sceneT: 0 };

function dmdShow(m) {
  if (!m.anim) {
    // un mensaje chico reemplaza a otro chico que ya se leyó
    D.q = D.q.filter((x) => x.anim);
    if (D.cur && !D.cur.anim && D.t > 0.45) D.cur = null;
  }
  D.q.push(m);
  if (D.q.length > 4) D.q.splice(0, D.q.length - 4);
}

const ease = (k) => 1 - (1 - k) ** 3;
/** Texto alineado a un costado en el visor. */
function dText(str, x, y, { align = 'center', size = 'auto', v = 1, invert = false, scale = null, clipX = null } = {}) {
  let w;
  if (align === 'center') return dmd.text(str, x, y, { size, v, invert, scale, clipX });
  const font = size === 'small' ? 3 : 5;
  w = bitmap(str, font).w * (size === 'big' ? 2 : 1);
  const cx = align === 'left' ? x + w / 2 : x - w / 2;
  return dmd.text(str, cx, y, { size, v, invert, scale, clipX });
}

function bigY(str, hasSmall) {
  const two = DMD.fits2x(str);
  if (hasSmall) return two ? 4 : 7;
  return two ? 9 : 12;
}

/** Segunda línea de un mensaje: letra grande si entra, si no la chica. */
function smallLine(str, v, clipX = null) {
  if (bitmap(str, 5).w <= 124) dmd.text(str, 64, 23, { size: 'mid', v, clipX });
  else dmd.text(str, 64, 24, { size: 'small', v, clipX });
}

function dmdMsg(m, dt) {
  const tt = D.t;
  const hasSmall = !!m.small;
  let clipX = null;
  // barrido de entrada desde el centro
  if (m.anim !== 'zoom' && tt < 0.14) {
    const k = tt / 0.14;
    clipX = [64 - 66 * k, 64 + 66 * k];
  }
  if (m.anim === 'zoom') {
    dmd.starfield(dt, 160, 0.55);
    const k = ease(clamp(tt / 0.32, 0, 1));
    const sc = 1 + (1 - k) * 1.6;
    const y = bigY(m.big, hasSmall);
    const capH = DMD.fits2x(m.big) ? 14 : 7;
    dmd.text(m.big, 64, y + capH / 2 - (capH * sc) / 2, { scale: sc, v: 0.4 + 0.6 * k });
    if (hasSmall && tt > 0.3) smallLine(m.small, 0.85);
    if (tt < 0.6) dmd.ring(64, 16, tt * 70, 0.6 * (1 - tt / 0.6));
    return;
  }
  const flashing = m.anim === 'flash' && tt < 0.7 && Math.floor(tt * 14) % 2 === 0;
  if (flashing) dmd.clear(0.85);
  if (!flashing) dmd.text(m.big, 64, bigY(m.big, hasSmall), { clipX });
  if (flashing) {
    // texto oscuro sobre el visor prendido
    paintDark(m.big, bigY(m.big, hasSmall));
  }
  if (hasSmall) smallLine(m.small, 0.8, clipX);
  if (m.anim === 'flash' && tt > 0.7) dmd.starfield(dt, 40, 0.3);
}

/** Letras "apagadas" sobre el fondo prendido (destello). */
function paintDark(str, y) {
  const two = DMD.fits2x(str);
  const bm = bitmap(str, two || bitmap(str, 5).w <= 124 ? 5 : 3);
  const sc = two ? 2 : 1;
  const W2 = bm.w * sc, x0 = Math.round(64 - W2 / 2), y0 = y - bm.top * sc;
  for (let yy = 0; yy < bm.h * sc; yy++)
    for (let xx = 0; xx < W2; xx++) {
      if (!bm.px[Math.floor(yy / sc) * bm.w + Math.floor(xx / sc)]) continue;
      const X = x0 + xx, Y = y0 + yy;
      if (X >= 0 && Y >= 0 && X < DW && Y < DH) dmd.buf[Y * DW + X] = 0.05;
    }
}

function dmdPlay(dt) {
  const r = S.rules;
  D.score += (r.score - D.score) * Math.min(1, dt * 9);
  if (Math.abs(r.score - D.score) < 8) D.score = r.score;
  const M = r.mission;
  const scoreY = M ? 9 : 5;
  dmd.text(fmt(D.score), 64, scoreY, { size: 'big' });
  if (M) {
    dText(r.T(M.kind), 2, 1, { align: 'left', size: 'small', v: 0.8 });
    if (M.time != null) dText(String(Math.max(0, Math.ceil(M.time))), 126, 1, { align: 'right', size: 'small', v: 1 });
    else {
      const balls = S.world.balls.filter((b) => b.live).length;
      dText(`×${balls}`, 126, 1, { align: 'right', size: 'small', v: 1 });
    }
  }
  const inLane = S.world.ballInLane();
  if (inLane && S.charge > 0) {
    dText(t('dmdPower'), 2, 26, { align: 'left', size: 'small', v: 0.7 });
    const x0 = 30, wbar = 94;
    for (let x = 0; x < wbar; x++) {
      const on = x / wbar < S.charge;
      for (let y = 26; y < 31; y++) dmd.set(x0 + x, y, on ? 0.6 + 0.4 * (x / wbar) : 0.12);
    }
    return;
  }
  dText(r.T('ball', { n: r.ball }), 2, 26, { align: 'left', size: 'small', v: 0.7 });
  dmd.text(r.word(), 64, 26, { size: 'small', v: 0.9 });
  dText(`${r.bonusX}×`, 126, 26, { align: 'right', size: 'small', v: r.bonusX > 1 ? 1 : 0.6 });
}

function dmdAttract(dt) {
  D.sceneT += dt;
  if (D.sceneT > 3.6) {
    D.sceneT = 0;
    D.scene = (D.scene + 1) % 4;
  }
  const tt = D.sceneT;
  const k = ease(clamp(tt / 0.4, 0, 1));
  switch (D.scene) {
    case 0:
      dmd.starfield(dt, 50, 0.5);
      dmd.text('NÉBULA', 64, 5, { size: 'big', scale: 1 + (1 - k) * 0.8 });
      if (tt > 0.4) dmd.text(t('attractSub'), 64, 24, { size: 'small', v: 0.8 });
      break;
    case 1: {
      dmd.starfield(dt, 18, 0.3);
      const b = bestScore();
      dmd.text(t(lastScore && D.alt ? 'attractLast' : 'attractBest'), 64, 3, { size: 'mid', v: 0.85 });
      dmd.text(fmt(lastScore && D.alt ? lastScore : b), 64, 14, { size: 'big', v: k });
      if (tt < 0.05) D.alt = !D.alt;
      break;
    }
    case 2: {
      dmd.text(t('attractTop'), 64, 1, { size: 'small', v: 0.7 });
      const list = top.slice(0, 3);
      if (!list.length) dmd.text('—', 64, 14, { size: 'mid' });
      list.forEach((e, i) => {
        const y = 9 + i * 8;
        if (tt * 4 < i) return;
        dText(`${i + 1}`, 8, y, { align: 'left', size: 'mid', v: 0.7 });
        dText(fmt(e.s), 122, y, { align: 'right', size: 'mid', v: i === 0 ? 1 : 0.8 });
      });
      break;
    }
    case 3: {
      dmd.starfield(dt, 90, 0.45, -1);
      const on = Math.floor(tt * 2.5) % 2 === 0;
      dmd.text(t('attractPlay'), 64, 12, { size: 'auto', v: on ? 1 : 0.35 });
      break;
    }
  }
}

function dmdFrame(dt) {
  dmd.clear();
  D.t += dt;
  if (D.cur && D.t >= D.cur.dur) D.cur = null;
  if (!D.cur && D.q.length) {
    D.cur = D.q.shift();
    D.t = 0;
  }
  const r = S.rules;
  const M = r?.mission;
  dmd.color = r?.tilted ? [255, 70, 70] : M?.kind === 'lluvia' ? [90, 220, 255] : M?.kind === 'carrera' ? [255, 90, 220] : M?.kind === 'hiper' ? [255, 196, 70] : [255, 140, 40];
  if (!r || S.phase === 'menu' || S.phase === 'help') return dmdAttract(dt);
  if (D.cur) return dmdMsg(D.cur, dt);
  dmdPlay(dt);
}

// ---------------------------------------------------------------- partida
function newWorld() {
  const w = new World();
  return w;
}

function start() {
  S.world = newWorld();
  setLocale(lang());
  S.rules = new Rules(S.world, lang());
  S.charge = 0;
  S.plVis = 0;
  S.autoT = 0;
  S.overT = 0;
  S.playT = 0;
  S.flips = 0;
  S.launched = false;
  D.cur = null;
  D.q = [];
  D.score = 0;
  table.parts = [];
  table.pops = [];
  dmdShow({ big: 'NÉBULA', small: S.rules.T('ball', { n: 1 }), dur: 1.8, anim: 'zoom' });
  S.tut = store.get('tut', false) ? 0 : 1;
  S.tutT = 0;
  setTut();
  show('play');
}

function setTut() {
  const el = $('tut');
  if (!S.tut || S.tut >= 3 || S.phase !== 'play') {
    el.hidden = true;
    return;
  }
  el.innerHTML = S.tut === 1 ? t(G.prefs.touch ? 'tutTouch' : 'tutDesk') : t('tutFlip');
  el.hidden = false;
}

function stepGame(dt) {
  const w = S.world, r = S.rules;
  S.playT += dt;
  S.nudgeCool = Math.max(0, S.nudgeCool - dt);
  const ended = r.over;
  const tilted = r.tilted || ended;
  const left = input.left || input.pad.left, right = input.right || input.pad.right;
  w.setFlip('L', !tilted && left);
  w.setFlip('R', !tilted && right);

  // lanzador
  const lane = w.ballInLane();
  const others = w.balls.some((b) => b.live && b !== lane && !(b.x > 541 && b.y > 900));
  const plunging = (input.plunge || input.btnPlunge || input.pad.plunge || (input.touchPlunge && !others)) && !ended;
  if (lane && plunging) {
    S.charge = Math.min(1, S.charge + dt / 0.85);
    S.chargeTick -= dt;
    if (S.chargeTick <= 0) {
      S.chargeTick = 0.07;
      sfx.charge(S.charge);
    }
  } else if (S.charge > 0) {
    if (lane && w.launch(S.charge)) {
      S.launched = true;
      if (S.tut === 1) {
        S.tut = 2;
        setTut();
      }
    }
    S.charge = 0;
  }
  // con otras pelotas en juego, la del lanzador sale sola
  if (lane && others && !plunging) {
    S.autoT += dt;
    if (S.autoT > 0.7) {
      w.launch(0.8 + Math.random() * 0.15);
      S.autoT = 0;
    }
  } else S.autoT = 0;
  // el émbolo vuelve de golpe al soltarlo
  S.plVis = S.charge > S.plVis ? S.charge : Math.max(S.charge, S.plVis - dt * 9);

  const evs = w.step(dt);
  for (const e of evs) {
    r.on(e);
    onPhys(e);
  }
  r.update(dt);
  r.tick(dt);
  for (const f of r.fx.splice(0)) onFx(f);
  for (const m of r.msgs.splice(0)) dmdShow(m);
  table.forget(new Set(w.balls.map((b) => b.id)));

  // tutorial
  if (S.tut === 2) {
    S.tutT += dt;
    if (S.flips >= 4 || S.tutT > 8) {
      S.tut = 3;
      store.set('tut', true);
      setTut();
    }
  }
  if (ended) {
    S.overT += dt;
    if (S.overT > 2.8) gameOver();
  }
}

function onPhys(e) {
  switch (e.t) {
    case 'flipUp':
      sfx.flip();
      S.flips++;
      break;
    case 'flipDown':
      sfx.flipDown();
      break;
    case 'launch':
      sfx.launch(e.power);
      break;
    case 'bumper':
      table.hit(e.id, 0.16);
      table.sparks(e.x, e.y, COL.cyan, 7, 240);
      sfx.bumper(e.id);
      vibrate(10);
      break;
    case 'sling':
      table.hit(e.id, 0.14);
      table.sparks(e.x, e.y, COL.white, 5, 180);
      sfx.sling();
      vibrate(8);
      break;
    case 'target':
      table.hit('t' + e.id, 0.25);
      sfx.target(e.kind);
      break;
    case 'wall':
      sfx.wall(e.v);
      break;
    case 'flipHit':
      vibrate(6);
      break;
    case 'hole':
      sfx.hole();
      break;
    case 'kick':
      sfx.kick();
      shake(0.4);
      break;
    case 'spin':
      sfx.spin(e.n);
      break;
    case 'ramp':
      sfx.rampIn();
      break;
    case 'rampDone':
      sfx.rampOut();
      break;
    case 'drain':
      sfx.drain();
      break;
  }
}

const FX_POS = { ramp: [92, 790], orbit: [300, 96], hole: [285, 560] };
function onFx(f) {
  const r = S.rules;
  switch (f.k) {
    case 'bumper':
      table.popup(f.x, f.y - 20, fmt(f.pts), COL.white);
      break;
    case 'letter': {
      sfx.letter();
      const it = INSERTS.find((i) => i.id === f.id);
      if (it) {
        table.popup(it.x, it.y - 18, it.l, COL.cyan, true);
        table.sparks(it.x, it.y, COL.cyan, 10, 200);
      }
      break;
    }
    case 'lit':
      sfx.lit();
      table.giFlash(COL.amber, 0.6);
      break;
    case 'bank':
      sfx.bank();
      table.popup(470, 680, '25.000', COL.amber);
      break;
    case 'ramp':
      table.popup(...FX_POS.ramp, fmt(f.pts), COL.magenta);
      break;
    case 'orbit':
      sfx.orbit();
      table.popup(...FX_POS.orbit, fmt(f.pts), COL.lime);
      break;
    case 'jackpot':
      sfx.jackpot();
      table.giFlash(COL.amber, 1);
      table.popup(285, 480, r.T('jackpot'), COL.amber, true);
      shake(0.8);
      vibrate(40);
      break;
    case 'skill':
      sfx.skill();
      table.popup(289, 250, r.T('skill'), COL.amber, true);
      table.giFlash(COL.amber, 0.4);
      break;
    case 'lane':
      sfx.lane();
      break;
    case 'bonusX':
      sfx.bonusX();
      table.popup(285, 780, `${r.bonusX}×`, COL.violet, true);
      break;
    case 'mission':
      sfx.mission();
      table.giFlash(MISSION_INFO[f.kind].c, 0.9);
      shake(0.6);
      break;
    case 'rush':
      sfx.rush();
      table.giFlash(COL.magenta, 0.35);
      break;
    case 'missionEnd':
      sfx.missionEnd();
      break;
    case 'supernova':
      sfx.supernova();
      table.giFlash('#ffffff', 1);
      shake(1);
      break;
    case 'extra':
      sfx.extra();
      table.giFlash(COL.red, 0.6);
      break;
    case 'tilt':
      sfx.tilt();
      break;
    case 'warning':
      sfx.warning();
      break;
    case 'saved':
      sfx.saved();
      table.giFlash(COL.cyan, 0.5);
      break;
    case 'ballEnd':
      sfx.ballEnd();
      break;
    case 'gameOver':
      sfx.gameOver();
      break;
  }
}

function shake(k) {
  if (!opts.shake || G.prefs.reducedMotion) return;
  S.shake = Math.max(S.shake, k);
}

function nudge() {
  if (S.phase !== 'play' || S.nudgeCool > 0 || S.rules.over) return;
  S.nudgeCool = 0.32;
  sfx.nudge();
  shake(0.7);
  vibrate(25);
  if (!S.rules.nudge()) return;
  // empuja hacia el medio: lo que sirve para salvar una pelota que se va por afuera
  for (const b of S.world.balls)
    if (!b.held && b.x < 540) {
      b.vx += Math.sign(285 - b.x) * 70 + (Math.random() - 0.5) * 40;
      b.vy -= 150;
    }
}

/** Qué luz está prendida (lo lee el dibujo de la mesa). */
function lights() {
  const r = S.rules, w = S.world;
  const Lt = {};
  if (!r) return Lt;
  const arr = r.arrows();
  r.lanes.forEach((on, i) => (Lt['lane' + i] = on ? 1 : 0));
  if (r.skillOn && !r.saveArmed) Lt['lane' + r.skill] = 'fast';
  for (const l of LETTERS) Lt[l] = r.lit[l] ? 1 : arr.targets ? 'fast' : 0;
  Lt.aOrbit = arr.orbit ? 'blink' : r.comboT > 0 ? 0.45 : 0;
  Lt.aRamp = arr.ramp ? 'blink' : r.comboT > 0 ? 0.45 : 0;
  Lt.aHole = arr.hole ? 'fast' : 0;
  const cycle = r.missionsDone % 3;
  for (let i = 0; i < 3; i++) Lt['m' + i] = i < cycle ? 1 : r.mission && r.missionIdx === i ? 'fast' : r.holeLit && r.missionIdx === i ? 'blink' : 0;
  for (let n = 2; n <= 5; n++) Lt['x' + n] = r.bonusX >= n ? 1 : 0;
  const saving = r.saveArmed && r.saveT > 0;
  Lt.again = r.extra > 0 ? 1 : saving ? (r.saveT < 3 ? 'fast' : 'blink') : 0;
  Lt.outL = Lt.outR = saving ? 'blink' : 0;
  Lt.inL = Lt.inR = r.comboT > 0 ? 'blink' : 0;
  Lt.lane = w.ballInLane() ? 'blink' : 0;
  return Lt;
}

// ---------------------------------------------------------------- la máquina sola (menú)
function attractWorld() {
  const w = newWorld();
  w.addBall(300, 300, 120, 0);
  return w;
}
function stepAttract(dt) {
  let w = S.attract;
  if (!w) w = S.attract = attractWorld();
  for (const f of w.flips) {
    let near = false;
    for (const b of w.balls) if (!b.held && Math.hypot(b.x - (f.x + f.dir * 45), b.y - (f.y + 5)) < 55 && b.vy > -100) near = true;
    w.setFlip(f.id, near && Math.random() < 0.9);
  }
  for (const e of w.step(dt)) {
    if (e.t === 'bumper') {
      table.hit(e.id, 0.16);
      table.sparks(e.x, e.y, COL.cyan, 5, 200);
    } else if (e.t === 'sling') table.hit(e.id, 0.14);
    else if (e.t === 'target') {
      table.hit('t' + e.id, 0.25);
      if (w.dropped.size === 3) setTimeout(() => w.resetDrops(), 900);
    } else if (e.t === 'drain') w.addBall();
  }
  for (const b of w.balls) if (b.held?.kind === 'hole' && b.held.t > 1) w.kickHole(b);
  const lane = w.ballInLane();
  if (lane) {
    S.attractT += dt;
    if (S.attractT > 1.2) {
      w.launch(0.6 + Math.random() * 0.4);
      S.attractT = 0;
    }
  }
  // por si una pelota queda quieta en algún lado
  for (const b of w.balls) {
    b.still = Math.hypot(b.vx, b.vy) < 12 && !b.held && b.x < 540 ? (b.still || 0) + dt : 0;
    if (b.still > 4) {
      b.live = false;
      w.addBall();
    }
  }
  w.balls = w.balls.filter((b) => b.live);
}

// ---------------------------------------------------------------- dibujo
function draw() {
  const dpr = L.dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(L.bg, 0, 0);
  table.build(L.scale, dpr, lang());
  let sx = 0, sy = 0;
  if (S.shake > 0.01) {
    const a = table.t * 70;
    sx = Math.sin(a) * S.shake * 5;
    sy = Math.cos(a * 1.3) * S.shake * 3;
  }
  const playing = S.phase !== 'menu' && S.phase !== 'help' && S.rules;
  const w = playing ? S.world : S.attract || (S.attract = attractWorld());
  const lightsNow = playing ? lights() : {};
  table.draw(ctx, L.tx + sx, L.ty + sy, L.scale, dpr, {
    world: w,
    lights: lightsNow,
    attract: !playing,
    tilted: playing && S.rules.tilted,
    jackpot: playing && S.rules.mission?.kind === 'lluvia',
    charge: playing ? S.plVis : 0,
    reduced: !!G.prefs.reducedMotion,
  });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  dmd.draw(ctx, L.dx, L.dy, L.dw, L.dh, dpr);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ---------------------------------------------------------------- bucle
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.max(0, Math.min(1 / 30, (now - last) / 1000));
  last = now;
  if (FIXED) dt = 1 / 60;
  pollPad();
  if (S.phase === 'play') stepGame(dt);
  else if (S.phase === 'menu' || S.phase === 'help') stepAttract(dt);
  S.shake = Math.max(0, S.shake - dt * 4);
  if (S.phase !== 'pause') table.update(dt);
  dmdFrame(S.phase === 'pause' ? 0 : dt);
  updateTouchUi();
  updateSide(dt);
  draw();
}

function updateTouchUi() {
  const playing = S.phase === 'play' && S.rules && !S.rules.over;
  const lane = playing && S.world.ballInLane();
  const lb = $('b-launch');
  const showLaunch = !!(playing && G.prefs.touch && lane);
  if (lb.hidden === showLaunch) lb.hidden = !showLaunch;
  if (showLaunch) $('launch-fill').style.strokeDashoffset = String(276.5 * (1 - S.charge));
  const nb = $('b-nudge');
  const showNudge = !!(playing && G.prefs.touch);
  if (nb.hidden === showNudge) nb.hidden = !showNudge;
}

// ---------------------------------------------------------------- pantallas
function show(id) {
  const prev = S.phase;
  S.phase = id;
  const sid = id === 'menu' ? 'home' : id;
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === `s-${sid}`));
  $('hud').hidden = !(id === 'play' || id === 'pause');
  G.gameplay(id === 'play');
  if (id !== 'play') releaseAll();
  if (id === 'menu') refreshHome();
  if (id === 'play' && prev !== 'pause') setTut();
  if (id !== 'play') $('tut').hidden = true;
  else setTut();
  placeHud();
  const first = document.querySelector(`#s-${sid} .btn`);
  if (first && !G.prefs.touch) setTimeout(() => first.focus({ preventScroll: true }), 50);
}

function refreshHome() {
  const b = bestScore();
  $('home-best').textContent = b ? t('best', { n: fmtUi(b) }) : t('noBest');
  $('home-keys').textContent = G.prefs.touch ? t('keysTouch') : t('keysDesk');
}
const fmtUi = (n) => Math.round(n).toLocaleString(lang() === 'en' ? 'en-US' : 'es-AR');

function pause() {
  if (S.phase !== 'play') return;
  show('pause');
  refreshToggles();
}
function resume() {
  if (S.phase !== 'pause') return;
  last = performance.now();
  show('play');
}

function refreshToggles() {
  for (const [id, k] of [['t-shake', 'shake'], ['t-vib', 'vib']]) {
    const el = $(id);
    el.classList.toggle('off', !opts[k]);
    el.querySelector('b').textContent = opts[k] ? t('on') : t('off');
  }
  $('t-vib').hidden = !(G.prefs.touch && navigator.vibrate);
}

function gameOver() {
  const r = S.rules;
  if (S.phase !== 'play') return;
  const score = r.score;
  lastScore = score;
  store.set('last', score);
  const prevBest = bestScore();
  const entry = { s: score, d: Date.now() };
  top = [...top, entry].sort((a, b) => b.s - a.s).slice(0, 5);
  store.set('top', top);
  $('over-score').textContent = fmtUi(score);
  $('over-record').hidden = !(score > prevBest && score > 0);
  const st = r.stats;
  $('over-stats').innerHTML = [
    ['sRamps', st.ramps],
    ['sOrbits', st.orbits],
    ['sBumpers', st.bumpers],
    ['sLetters', st.letters],
    ['sMissions', st.missions],
    ['sJackpots', st.jackpots],
  ]
    .map(([k, v]) => `<div class="stat"><b>${v}</b><span>${t(k)}</span></div>`)
    .join('');
  const fmtDate = (d) => {
    const x = new Date(d);
    const today = new Date();
    if (x.toDateString() === today.toDateString()) return t('today');
    return x.toLocaleDateString(lang() === 'en' ? 'en-US' : 'es-AR', { day: 'numeric', month: 'short' });
  };
  $('over-top').innerHTML = top.length
    ? top.map((e) => `<li class="${e === entry ? 'me' : ''}"><b>${fmtUi(e.s)}</b><small>${fmtDate(e.d)}</small></li>`).join('')
    : `<li class="empty">${t('noTop')}</li>`;
  $('b-more').hidden = true;
  show('over');
  if (!r.continued)
    G.rewardAvailable('pelota-extra')
      .then((ok) => {
        if (ok && S.phase === 'over') $('b-more').hidden = false;
      })
      .catch(() => {});
}

function oneMore() {
  $('b-more').hidden = true;
  G.showReward()
    .then((ok) => {
      if (!ok || S.phase !== 'over') return;
      // la partida sigue: se saca el puntaje recién guardado para no contarlo dos veces
      top = top.filter((e) => e.s !== S.rules.score || e.d < Date.now() - 600000);
      store.set('top', top);
      S.rules.continueGame();
      S.overT = 0;
      D.cur = null;
      D.q = [];
      for (const m of S.rules.msgs.splice(0)) dmdShow(m);
      show('play');
    })
    .catch(() => {});
}

function again() {
  G.commercialBreak('otra-partida')
    .catch(() => {})
    .then(() => start());
}

function toMenu() {
  S.rules = null;
  S.world = null;
  D.cur = null;
  D.q = [];
  D.scene = 0;
  D.sceneT = 0;
  show('menu');
}

function buildHelp() {
  $('howto').innerHTML = HOWTO.map(([ic, txt]) => `<li><i>${ic}</i><span>${G.t(txt)}</span></li>`).join('');
  $('missions').innerHTML = MISSIONS.map((k) => {
    const m = MISSION_INFO[k];
    return `<div class="mission" style="--c:${m.c}"><canvas data-m="${k}" width="80" height="80"></canvas><div><b>${G.t(MSG[k])}</b>${G.t(m.d)}</div></div>`;
  }).join('');
  for (const c of $$('#missions canvas')) {
    drawMissionBadge(c.getContext('2d'), INSERTS.find((i) => i.k === c.dataset.m));
  }
  $('keys-panel').innerHTML = [
    ['<kbd>←</kbd> <kbd>Z</kbd>', t('kLeft')],
    ['<kbd>→</kbd> <kbd>M</kbd>', t('kRight')],
    ['<kbd>↓</kbd> <kbd>Espacio</kbd>'.replace('Espacio', lang() === 'en' ? 'Space' : 'Espacio'), t('kLaunch')],
    ['<kbd>↑</kbd>', t('kNudge')],
    ['<kbd>Esc</kbd>', t('kPause')],
  ]
    .map(([k, v]) => `<span>${k}</span><span>${v}</span>`)
    .join('');
}

function drawMissionBadge(x, it) {
  const col = COL[it.c];
  x.clearRect(0, 0, 80, 80);
  const g = x.createRadialGradient(40, 40, 4, 40, 40, 38);
  g.addColorStop(0, col);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalAlpha = 0.35;
  x.fillStyle = g;
  x.fillRect(0, 0, 80, 80);
  x.globalAlpha = 1;
  x.fillStyle = col;
  x.beginPath();
  x.arc(40, 40, 26, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#1a0b2a';
  x.save();
  x.translate(40, 40);
  const r = 26;
  if (it.k === 'lluvia') {
    x.strokeStyle = '#1a0b2a';
    x.lineCap = 'round';
    x.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      x.globalAlpha = 1 - i * 0.28;
      x.beginPath();
      x.moveTo(r * 0.18 - i * r * 0.05, -r * 0.18 + i * r * 0.22);
      x.lineTo(-r * 0.62 + i * r * 0.1, r * 0.44 + i * r * 0.05);
      x.stroke();
    }
    x.globalAlpha = 1;
    x.beginPath();
    x.arc(r * 0.26, -r * 0.26, r * 0.3, 0, Math.PI * 2);
    x.fill();
  } else if (it.k === 'hiper') {
    const p = [[0.12, -0.7], [-0.42, 0.08], [-0.04, 0.08], [-0.16, 0.7], [0.42, -0.12], [0.04, -0.12]];
    x.beginPath();
    x.moveTo(p[0][0] * r, p[0][1] * r);
    for (const q of p.slice(1)) x.lineTo(q[0] * r, q[1] * r);
    x.closePath();
    x.fill();
  } else {
    x.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.3 : r * 0.68;
      x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    x.closePath();
    x.fill();
  }
  x.restore();
}

// ---------------------------------------------------------------- controles
const KEYS = {
  left: ['ArrowLeft', 'KeyZ', 'ShiftLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyM', 'Slash', 'ShiftRight', 'KeyD'],
  plunge: ['ArrowDown', 'Space', 'Enter', 'KeyS'],
  nudge: ['ArrowUp', 'KeyW', 'KeyX'],
};
const ARROWS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp']);
const WASD = new Set(['KeyA', 'KeyD', 'KeyS', 'KeyW']);
function keyAllowed(code) {
  const k = G.prefs.keys;
  if (k === 'arrows' && WASD.has(code)) return false;
  if (k === 'wasd' && ARROWS.has(code)) return false;
  return true;
}
const isKey = (what, code) => KEYS[what].includes(code) && keyAllowed(code);

function syncKeys() {
  input.left = [...input.keys].some((c) => isKey('left', c)) || [...input.ptr.values()].some((p) => p === 'L');
  input.right = [...input.keys].some((c) => isKey('right', c)) || [...input.ptr.values()].some((p) => p === 'R');
  input.plunge = [...input.keys].some((c) => isKey('plunge', c));
  input.touchPlunge = [...input.ptr.values()].some((p) => p === 'R');
}

function releaseAll() {
  input.keys.clear();
  input.ptr.clear();
  input.btnPlunge = false;
  syncKeys();
  if (S.world) {
    S.world.setFlip('L', false);
    S.world.setFlip('R', false);
  }
  S.charge = 0;
}

addEventListener('keydown', (e) => {
  if (S.phase === 'play') {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      e.preventDefault();
      pause();
      return;
    }
    const known = Object.keys(KEYS).some((k) => isKey(k, e.code));
    if (!known) return;
    e.preventDefault();
    if (isKey('nudge', e.code)) {
      if (!e.repeat) nudge();
      return;
    }
    input.keys.add(e.code);
    syncKeys();
    return;
  }
  if (S.phase === 'pause' && (e.code === 'Escape' || e.code === 'KeyP')) {
    e.preventDefault();
    resume();
  } else if (S.phase === 'help' && e.code === 'Escape') toMenu();
  else if (S.phase === 'menu' && (e.code === 'Enter' || e.code === 'Space') && document.activeElement === document.body) {
    e.preventDefault();
    start();
  }
});
addEventListener('keyup', (e) => {
  input.keys.delete(e.code);
  syncKeys();
});
addEventListener('blur', () => {
  releaseAll();
  pause();
});
document.addEventListener('visibilitychange', () => document.hidden && pause());
G.onPause?.(() => pause());

cv.addEventListener('pointerdown', (e) => {
  if (S.phase !== 'play') return;
  e.preventDefault();
  const side = e.clientX < innerWidth / 2 ? 'L' : 'R';
  input.ptr.set(e.pointerId, side);
  cv.setPointerCapture?.(e.pointerId);
  syncKeys();
});
const ptrUp = (e) => {
  if (!input.ptr.has(e.pointerId)) return;
  input.ptr.delete(e.pointerId);
  syncKeys();
};
cv.addEventListener('pointerup', ptrUp);
cv.addEventListener('pointercancel', ptrUp);
cv.addEventListener('contextmenu', (e) => e.preventDefault());

const lb = $('b-launch');
lb.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  input.btnPlunge = true;
  lb.setPointerCapture?.(e.pointerId);
});
const lbUp = () => (input.btnPlunge = false);
lb.addEventListener('pointerup', lbUp);
lb.addEventListener('pointercancel', lbUp);
lb.addEventListener('contextmenu', (e) => e.preventDefault());
$('b-nudge').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  nudge();
});

const padPrev = {};
function pollPad() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  input.pad = { left: false, right: false, plunge: false };
  for (const gp of pads) {
    const b = (i) => !!gp.buttons[i]?.pressed || (gp.buttons[i]?.value || 0) > 0.4;
    const press = (i) => b(i) && !padPrev[`${gp.index}:${i}`];
    if (S.phase === 'play') {
      input.pad.left ||= b(4) || b(6) || b(14);
      input.pad.right ||= b(5) || b(7) || b(15);
      input.pad.plunge ||= b(0) || b(13);
      if (press(3) || press(2) || press(12)) nudge();
      if (press(9)) pause();
    } else if (S.phase === 'pause' && press(9)) resume();
    else if (press(0) && document.activeElement?.click && document.activeElement !== document.body) document.activeElement.click();
    else if (press(0) && S.phase === 'menu') start();
    for (let i = 0; i < gp.buttons.length; i++) padPrev[`${gp.index}:${i}`] = b(i);
  }
}

// botones
$('b-play').onclick = () => start();
$('b-help').onclick = () => show('help');
$('b-help-back').onclick = () => toMenu();
$('b-pause').onclick = () => pause();
$('b-resume').onclick = () => resume();
$('b-restart').onclick = () => start();
$('b-quit').onclick = () => toMenu();
$('b-again').onclick = () => again();
$('b-menu').onclick = () => toMenu();
$('b-more').onclick = () => oneMore();
$('t-shake').onclick = () => {
  opts.shake = !opts.shake;
  store.set('opts', opts);
  refreshToggles();
};
$('t-vib').onclick = () => {
  opts.vib = !opts.vib;
  store.set('opts', opts);
  refreshToggles();
  vibrate(20);
};

// ---------------------------------------------------------------- arranque
G.onPrefs((p) => {
  document.documentElement.lang = p.lang;
  setLocale(lang());
  $$('[data-t]').forEach((n) => (n.textContent = t(n.dataset.t)));
  buildHelp();
  refreshHome();
  refreshToggles();
  if (S.rules) S.rules.lang = lang();
  placeHud();
}, true);
addEventListener('resize', layout);
layout();
document.fonts?.ready.then(() => {
  table.key = '';
});
toMenu();
requestAnimationFrame(frame);
if (/[?&]debug\b/.test(location.search)) window.__nebula = { S, D, input, table, dmd, start, toMenu, gameOver, nudge, lights };
G.ready();
