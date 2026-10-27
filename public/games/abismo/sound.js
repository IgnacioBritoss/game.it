/**
 * Abismo — sonidos sintetizados (sin archivos): burbujas que revientan, el ping del sonar con su eco, roces
 * agudos, perlas que suben de tono con la cadena, alarmas de jefe y fanfarrias. Todo pasa por /shared/sfx.js, que
 * respeta el volumen del portal y se calla cuando el juego está en pausa.
 */
import { tone, noise, notes } from '/shared/sfx.js';

const lastAt = {};
const every = (k, ms) => {
  const now = performance.now();
  if (now - (lastAt[k] || 0) < ms) return false;
  lastAt[k] = now;
  return true;
};
const PENTA = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760, 2093];

let grazeN = 0, grazeLast = 0;
let pearlN = 0, pearlLast = 0;

export function sfx(k, o = {}) {
  switch (k) {
    case 'shoot':
      if (every(k, 150)) tone(900, 1300, 0.04, { type: 'sine', vol: 0.012 });
      break;
    case 'ehit':
      if (every(k, 55)) noise(0.03, { freq: 2600 + Math.random() * 900, q: 3, vol: 0.03 });
      break;
    case 'bhit':
      if (every(k, 70)) noise(0.035, { freq: 1500 + Math.random() * 500, q: 2.5, vol: 0.035 });
      break;
    case 'efire':
      if (every(k, 110)) noise(0.06, { freq: 700, sweep: 1500, q: 1.2, vol: 0.022 });
      break;
    case 'kill':
      if (o.big) {
        noise(0.5, { freq: 300, type: 'lowpass', vol: 0.3 });
        tone(140, 45, 0.45, { type: 'sine', vol: 0.18 });
        for (let i = 0; i < 6; i++) tone(500 + Math.random() * 900, 1500 + Math.random() * 900, 0.05, { type: 'sine', vol: 0.05, at: 0.05 + i * 0.045 });
      } else if (every(k, 40)) {
        tone(380 + Math.random() * 200, 1300 + Math.random() * 500, 0.07, { type: 'sine', vol: 0.06 });
        noise(0.05, { freq: 1800, q: 1.5, vol: 0.04 });
      }
      break;
    case 'graze': {
      const now = performance.now();
      grazeN = now - grazeLast < 500 ? Math.min(20, grazeN + 1) : 0;
      grazeLast = now;
      if (every(k, 45)) noise(0.03, { freq: 5200 + grazeN * 120, q: 6, vol: 0.05 });
      break;
    }
    case 'pearl': {
      const now = performance.now();
      pearlN = now - pearlLast < 450 ? Math.min(PENTA.length - 1, pearlN + 1) : 0;
      pearlLast = now;
      if (every(k, 35)) tone(PENTA[pearlN], PENTA[pearlN] * 1.01, 0.12, { type: 'triangle', vol: o.big ? 0.08 : 0.045 });
      break;
    }
    case 'mini':
      if (every(k, 60)) tone(1760 + Math.random() * 400, 2400, 0.04, { type: 'sine', vol: 0.02 });
      break;
    case 'power':
      notes([523, 659, 784, 1047, 1319], { step: 0.05, dur: 0.18, type: 'square', vol: 0.045 });
      break;
    case 'powerMax':
      notes([1047, 1319, 1568], { step: 0.05, dur: 0.14, type: 'triangle', vol: 0.07 });
      break;
    case 'bombGet':
      tone(1500, 1480, 0.4, { type: 'sine', vol: 0.09 });
      tone(1500, 1480, 0.3, { type: 'sine', vol: 0.04, at: 0.25 });
      break;
    case 'bomb':
      // ping del sonar con eco
      for (let i = 0; i < 4; i++) tone(1320, 1290, 0.7, { type: 'sine', vol: 0.16 / (1 + i * 1.4), at: i * 0.32 });
      noise(1.4, { freq: 160, sweep: 1600, q: 0.7, vol: 0.18 });
      tone(90, 40, 0.9, { type: 'sine', vol: 0.2 });
      break;
    case 'hit':
      tone(880, 440, 0.12, { type: 'square', vol: 0.05 });
      break;
    case 'die':
      noise(1, { freq: 400, sweep: 80, type: 'lowpass', vol: 0.4 });
      tone(220, 40, 0.8, { type: 'sawtooth', vol: 0.09 });
      for (let i = 0; i < 10; i++) tone(300 + Math.random() * 700, 900 + Math.random() * 900, 0.06, { type: 'sine', vol: 0.05, at: 0.1 + i * 0.06 });
      break;
    case 'respawn':
      notes([392, 523, 659], { step: 0.07, dur: 0.18, type: 'triangle', vol: 0.06 });
      break;
    case 'extend':
      notes([659, 784, 1047, 784, 1047, 1319, 1568], { step: 0.08, dur: 0.22, type: 'square', vol: 0.05 });
      break;
    case 'inflate':
      tone(300, 900, 0.7, { type: 'triangle', vol: 0.05 });
      break;
    case 'burst':
      noise(0.25, { freq: 900, q: 0.8, vol: 0.18 });
      tone(700, 150, 0.2, { type: 'sine', vol: 0.08 });
      break;
    case 'mine':
      noise(0.6, { freq: 250, type: 'lowpass', vol: 0.32 });
      tone(110, 40, 0.5, { type: 'sine', vol: 0.18 });
      break;
    case 'warning':
      for (let i = 0; i < 4; i++) {
        tone(440, 440, 0.32, { type: 'square', vol: 0.05, at: i * 0.7 });
        tone(330, 330, 0.32, { type: 'square', vol: 0.05, at: i * 0.7 + 0.35 });
      }
      break;
    case 'bossIn':
      tone(70, 48, 2.2, { type: 'sawtooth', vol: 0.12 });
      tone(104, 70, 2.2, { type: 'sawtooth', vol: 0.07 });
      noise(2, { freq: 180, type: 'lowpass', vol: 0.25 });
      break;
    case 'phase':
      tone(55, 50, 0.9, { type: 'sine', vol: 0.22 });
      notes(o.last ? [220, 262, 330, 415] : [220, 277, 330], { step: 0.07, dur: 0.5, type: 'sawtooth', vol: 0.04 });
      break;
    case 'phaseEnd':
      noise(0.8, { freq: 600, sweep: 4000, q: 0.7, vol: 0.14 });
      if (o.won) notes([784, 988, 1175, 1568], { step: 0.07, dur: 0.3, type: 'triangle', vol: 0.09 });
      else notes([523, 494, 440], { step: 0.12, dur: 0.3, type: 'triangle', vol: 0.07 });
      break;
    case 'bossDown':
      noise(2, { freq: 260, type: 'lowpass', vol: 0.45 });
      tone(90, 30, 1.6, { type: 'sine', vol: 0.25 });
      notes([392, 494, 587, 784, 988, 1175, 1568], { step: 0.11, dur: 0.45, type: 'triangle', vol: 0.09 });
      break;
    case 'bossBoom':
      if (every(k, 90)) {
        noise(0.35, { freq: 380, type: 'lowpass', vol: 0.22 });
        tone(160, 50, 0.3, { type: 'sine', vol: 0.1 });
      }
      break;
    case 'lunge':
      noise(0.5, { freq: 200, sweep: 900, q: 0.8, vol: 0.2 });
      break;
    case 'ink':
      noise(0.6, { freq: 300, sweep: 120, type: 'lowpass', vol: 0.12 });
      break;
    case 'stage':
      notes([262, 330, 392, 523], { step: 0.12, dur: 0.6, type: 'sine', vol: 0.07 });
      notes([131, 165], { step: 0.24, dur: 1.2, type: 'triangle', vol: 0.05 });
      break;
    case 'clear':
      notes([523, 659, 784, 1047, 784, 1047, 1319], { step: 0.11, dur: 0.35, type: 'triangle', vol: 0.09 });
      break;
    case 'tally':
      if (every(k, 50)) tone(1200, 1250, 0.03, { type: 'square', vol: 0.025 });
      break;
    case 'won':
      notes([392, 523, 659, 784, 1047, 1319, 1568, 2093], { step: 0.13, dur: 0.7, type: 'triangle', vol: 0.09 });
      notes([131, 196, 262], { step: 0.4, dur: 1.8, type: 'sine', vol: 0.06 });
      break;
    case 'over':
      notes([392, 330, 262, 196], { step: 0.2, dur: 0.5, type: 'sine', vol: 0.09 });
      break;
    case 'chainEnd':
      tone(700, 350, 0.25, { type: 'triangle', vol: 0.04 });
      break;
    case 'ping':
      tone(1250, 1230, 1.2, { type: 'sine', vol: 0.025 });
      tone(1250, 1230, 0.9, { type: 'sine', vol: 0.01, at: 0.45 });
      break;
    case 'click':
      tone(700, 900, 0.05, { type: 'triangle', vol: 0.05 });
      break;
    case 'tick':
      tone(1000, 1000, 0.05, { type: 'square', vol: 0.03 });
      break;
    case 'start':
      noise(0.9, { freq: 300, sweep: 1600, q: 0.6, vol: 0.12 });
      for (let i = 0; i < 8; i++) tone(400 + Math.random() * 600, 1200 + Math.random() * 800, 0.06, { type: 'sine', vol: 0.04, at: i * 0.05 });
      break;
  }
}
