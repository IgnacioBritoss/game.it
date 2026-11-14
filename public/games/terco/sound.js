/**
 * Terco — sonidos y música sintetizados (sin archivos). Los efectos pasan por /shared/sfx.js, que respeta el volumen
 * del portal y se calla cuando el juego está en pausa; la música es un bajo y una melodía pentatónica chiquitas,
 * una por zona, programadas con un reloj corto sobre el mismo AudioContext (y con su propio volumen).
 */
import { tone, noise, notes, unlock } from '/shared/sfx.js';

const GI = window.GameIt;
const lastAt = {};
const every = (k, ms) => {
  const now = performance.now();
  if (now - (lastAt[k] || 0) < ms) return false;
  lastAt[k] = now;
  return true;
};

export function sfx(k, o = {}) {
  switch (k) {
    case 'jump':
      tone(300, 640, 0.11, { type: 'triangle', vol: 0.1 });
      break;
    case 'jump2':
      tone(520, 980, 0.1, { type: 'triangle', vol: 0.09 });
      break;
    case 'land':
      if (every(k, 60)) noise(0.05, { freq: 420, q: 1, vol: 0.1 });
      break;
    case 'spring':
      tone(260, 1200, 0.22, { type: 'square', vol: 0.07 });
      break;
    case 'die':
      tone(520, 80, 0.38, { type: 'sawtooth', vol: 0.13 });
      noise(0.32, { freq: 1100, sweep: 180, q: 0.8, vol: 0.2 });
      break;
    case 'cp':
      notes([523, 659, 784], { step: 0.07, dur: 0.22, type: 'triangle', vol: 0.11 });
      break;
    case 'carrot':
      notes([880, 1175, 1568, 2093], { step: 0.06, dur: 0.18, type: 'sine', vol: 0.1 });
      break;
    case 'stone':
      notes([523, 659, 784, 1047, 1319], { step: 0.1, dur: 0.34, type: 'triangle', vol: 0.13 });
      break;
    case 'break':
      noise(0.16, { freq: 800, q: 0.8, vol: 0.25 });
      tone(220, 90, 0.12, { type: 'square', vol: 0.05 });
      break;
    case 'crumble':
      if (every(k, 50)) noise(0.12, { freq: 320, q: 0.7, vol: 0.14 });
      break;
    case 'hid':
      tone(180, 420, 0.09, { type: 'square', vol: 0.07 });
      noise(0.08, { freq: 900, q: 1, vol: 0.12 });
      break;
    case 'smash':
      noise(0.22, { freq: 500, q: 0.6, vol: 0.28 });
      tone(120, 50, 0.2, { type: 'sine', vol: 0.16 });
      break;
    case 'thud':
      noise(0.14, { freq: 260, type: 'lowpass', q: 0.7, vol: 0.28 });
      tone(90, 45, 0.18, { type: 'sine', vol: 0.18 });
      break;
    case 'boom':
      noise(0.5, { freq: 300, type: 'lowpass', vol: 0.34 });
      tone(110, 38, 0.5, { type: 'sine', vol: 0.22 });
      break;
    case 'shot':
      if (every(k, 40)) tone(900, 520, 0.05, { type: 'triangle', vol: 0.05 });
      break;
    case 'tick':
      if (every(k, 30)) noise(0.025, { freq: 2300, q: 3, vol: 0.07 });
      break;
    case 'creak':
      if (every(k, 120)) tone(170, 130, 0.14, { type: 'sawtooth', vol: 0.04 });
      break;
    case 'trap':
      tone(380, 190, 0.14, { type: 'square', vol: 0.06 });
      break;
    case 'pew':
      if (every(k, 60)) tone(720, 300, 0.09, { type: 'square', vol: 0.04 });
      break;
    case 'bell':
      tone(1180, 1160, 0.55, { type: 'sine', vol: 0.15 });
      tone(1770, 1750, 0.35, { type: 'sine', vol: 0.06 });
      break;
    case 'gate':
      noise(0.22, { freq: 220, q: 1, vol: 0.2 });
      tone(130, 90, 0.2, { type: 'square', vol: 0.05 });
      break;
    case 'hurt':
      if (every(k, 40)) tone(420, 210, 0.08, { type: 'square', vol: 0.07 });
      break;
    case 'pop':
      tone(280, 960, 0.12, { type: 'triangle', vol: 0.1 });
      noise(0.1, { freq: 1600, q: 1, vol: 0.15 });
      break;
    case 'bosshit':
      if (every(k, 45)) {
        tone(240, 130, 0.1, { type: 'square', vol: 0.09 });
        noise(0.06, { freq: 1500, q: 1.5, vol: 0.12 });
      }
      break;
    case 'bossdie':
      for (let i = 0; i < 6; i++) noise(0.35, { freq: 400 + i * 120, type: 'lowpass', vol: 0.26, at: i * 0.13 });
      tone(160, 30, 1.1, { type: 'sawtooth', vol: 0.18 });
      notes([392, 523, 659, 784, 1047], { step: 0.14, dur: 0.4, type: 'triangle', vol: 0.12 });
      break;
    case 'warn':
      if (every(k, 200)) {
        tone(880, 880, 0.1, { type: 'square', vol: 0.05 });
        tone(880, 880, 0.1, { type: 'square', vol: 0.05, at: 0.14 });
      }
      break;
    case 'ui':
      tone(700, 900, 0.05, { type: 'triangle', vol: 0.06 });
      break;
    case 'win':
      notes([523, 659, 784, 1047, 1319, 1568, 2093], { step: 0.13, dur: 0.5, type: 'triangle', vol: 0.14 });
      break;
  }
}

// ---------------------------------------------------------------- música
// root en Hz, escala en semitonos, bpm, forma de onda y motivos de 16 corcheas (-1 = silencio; números = grado)
const MUSIC = {
  puesto: { root: 196, scale: [0, 2, 4, 7, 9], bpm: 84, wave: 'triangle', arp: 0.5 },
  quebrada: { root: 220, scale: [0, 3, 5, 7, 10], bpm: 104, wave: 'triangle', arp: 0.6 },
  mina: { root: 147, scale: [0, 3, 5, 6, 7, 10], bpm: 76, wave: 'sine', arp: 0.7 },
  salar: { root: 262, scale: [0, 2, 4, 7, 9], bpm: 92, wave: 'sine', arp: 0.7 },
  volcan: { root: 165, scale: [0, 1, 4, 5, 7, 8], bpm: 116, wave: 'square', arp: 0.25 },
  cumbre: { root: 196, scale: [0, 2, 4, 7, 9], bpm: 72, wave: 'triangle', arp: 0.55 },
};
const MOTIFS = [
  [0, -1, 2, -1, 4, 2, -1, 0, 1, -1, 2, -1, 3, 2, -1, -1],
  [4, -1, 3, 2, -1, 0, -1, 2, 3, -1, 2, -1, 1, 0, -1, -1],
  [0, 2, 4, -1, 2, 4, 5, -1, 4, 2, 1, -1, 0, -1, -1, -1],
  [2, -1, -1, 4, -1, 2, 0, -1, 1, -1, 3, -1, 2, 1, 0, -1],
];
let mbus = null;
let cur = null;
let curId = '';
let timer = 0;
let nextT = 0;
let beat = 0;

const level = () => GI?.prefs?.volume?.music ?? 0.5;
// el navegador no deja arrancar el audio sin un gesto: la música espera al primer toque o tecla
let armed = false;
for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, () => (armed = true), { passive: true, capture: true });

function osc(ac, f, t, dur, type, vol) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(mbus);
  o.start(t);
  o.stop(t + dur + 0.05);
}
const freq = (m, deg, oct = 0) => {
  const n = m.scale.length;
  const d = ((deg % n) + n) % n;
  const o = Math.floor(deg / n) + oct;
  return m.root * 2 ** ((m.scale[d] + 12 * o) / 12);
};
function schedule(ac, m, step, t, dur) {
  const bar = Math.floor(step / 16);
  const s = step % 16;
  const motif = MOTIFS[bar % MOTIFS.length];
  // bajo: tónica y quinta (huayno: corchea con puntillo)
  if (s === 0 || s === 6 || s === 8 || s === 14) osc(ac, freq(m, s === 8 || s === 14 ? 2 : 0, -1), t, dur * 2.2, m.wave === 'square' ? 'triangle' : m.wave, 0.5);
  const deg = motif[s];
  if (deg >= 0) osc(ac, freq(m, deg + (bar % 2 ? 1 : 0), 1), t, dur * 1.6, m.wave, 0.22 * m.arp);
  if (s % 4 === 2 && m.wave === 'square') osc(ac, freq(m, 0, 2), t, dur * 0.6, 'square', 0.06);
}
function tick() {
  if (!armed) return;
  const ac = unlock();
  if (!ac || ac.state !== 'running' || !cur) return;
  if (!mbus) {
    mbus = ac.createGain();
    mbus.connect(ac.destination);
  }
  const lv = level();
  mbus.gain.setTargetAtTime(lv * 0.16, ac.currentTime, 0.15);
  const dur = 60 / cur.bpm / 2;
  if (!lv) {
    nextT = Math.max(nextT, ac.currentTime);
    return;
  }
  if (nextT < ac.currentTime) nextT = ac.currentTime + 0.05;
  while (nextT < ac.currentTime + 0.4) {
    schedule(ac, cur, beat++, nextT, dur);
    nextT += dur;
  }
}

export const music = {
  zone(id) {
    const m = MUSIC[id] || MUSIC.puesto;
    if (id === curId) return;
    curId = id;
    cur = m;
    beat = 0;
    nextT = 0;
    if (!timer) timer = setInterval(tick, 120);
  },
};
