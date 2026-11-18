/** Piñata — sonidos sintetizados (sin archivos) sobre /shared/sfx.js, que respeta el volumen del portal y la pausa. */
import { tone, noise, notes } from '/shared/sfx.js';

const SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760, 2093]; // la racha sube por la escala
let lastHit = 0;
let lastPop = 0;

export function sfx(k, n = 0) {
  const now = performance.now();
  if (k === 'hit') {
    // golpe de papel: un golpe sordo y el crujido del crepé
    if (now - lastHit < 40) return;
    lastHit = now;
    tone(160, 90, 0.09, { type: 'sine', vol: 0.18 });
    noise(0.07, { freq: 2400, q: 0.8, vol: 0.06 });
  } else if (k === 'clean') {
    tone(220, 120, 0.1, { type: 'sine', vol: 0.2 });
    const f = SCALE[Math.min(SCALE.length - 1, n)];
    tone(f, f * 1.02, 0.12, { type: 'triangle', vol: 0.1 });
  } else if (k === 'clank') {
    tone(900, 860, 0.12, { type: 'square', vol: 0.05 });
    tone(1340, 1300, 0.1, { type: 'square', vol: 0.03, at: 0.01 });
  } else if (k === 'pop') {
    if (now - lastPop < 60) return;
    lastPop = now;
    noise(0.25, { freq: 1800, sweep: 600, q: 0.7, vol: 0.14 });
    notes([1319, 1568, 2093], { step: 0.04, dur: 0.1, vol: 0.05 });
  } else if (k === 'gHit') noise(0.05, { freq: 1200, q: 1, vol: 0.04 });
  else if (k === 'dale') {
    // la corneta de cumpleaños
    tone(392, 523, 0.5, { type: 'sawtooth', vol: 0.07 });
    notes([523, 659, 784, 1047], { step: 0.07, dur: 0.18, vol: 0.1 });
  } else if (k === 'full') notes([784, 988, 1175], { step: 0.06, dur: 0.14, type: 'sine', vol: 0.09 });
  else if (k === 'quota') notes([659, 784, 1047, 1319], { step: 0.08, dur: 0.2, vol: 0.11 });
  else if (k === 'fail') notes([523, 466, 415, 349], { step: 0.16, dur: 0.34, type: 'sine', vol: 0.1 });
  else if (k === 'card') tone(660, 990, 0.1, { type: 'triangle', vol: 0.09 });
  else if (k === 'buy') tone(520, 780, 0.07, { type: 'triangle', vol: 0.1 });
  else if (k === 'up') notes([587, 784, 1175], { step: 0.06, dur: 0.14, vol: 0.09 });
  else if (k === 'no') tone(170, 120, 0.1, { type: 'square', vol: 0.05 });
  else if (k === 'escape') tone(880, 1760, 0.4, { type: 'sine', vol: 0.06 });
  else if (k === 'choco') notes([1047, 1319, 1568, 2093], { step: 0.06, dur: 0.16, type: 'sine', vol: 0.09 });
  else if (k === 'giant') {
    noise(0.8, { freq: 400, sweep: 2600, q: 0.6, vol: 0.16 });
    notes([392, 523, 659, 784, 1047, 1319], { step: 0.09, dur: 0.3, vol: 0.12 });
  } else if (k === 'blow') {
    noise(0.9, { freq: 900, q: 0.4, vol: 0.12, sweep: 300 });
    notes([523, 659, 784, 1047, 1568], { step: 0.12, dur: 0.4, type: 'sine', vol: 0.11 });
  } else if (k === 'ach') notes([784, 988, 1175, 1568], { step: 0.09, dur: 0.22, vol: 0.1 });
  else if (k === 'win') notes([523, 659, 784, 1047, 1319, 1568], { step: 0.09, dur: 0.3, vol: 0.12 });
  else if (k === 'lose') notes([523, 440, 349, 294], { step: 0.14, dur: 0.3, type: 'sine', vol: 0.1 });
  else if (k === 'tick') tone(660, 660, 0.08, { type: 'square', vol: 0.05 });
  else if (k === 'go') tone(990, 990, 0.22, { type: 'square', vol: 0.07 });
  else if (k === 'smoke') noise(0.7, { freq: 2200, sweep: 600, q: 0.5, vol: 0.12 });
  else if (k === 'tab') tone(700, 700, 0.03, { type: 'sine', vol: 0.04 });
  else if (k === 'beat') tone(110, 70, 0.08, { type: 'sine', vol: 0.06 });
}

/** Vibración corta en el celular, si existe y no se pidió menos movimiento. */
export function buzz(ms) {
  try {
    if (!window.GameIt?.prefs?.reducedMotion && navigator.vibrate) navigator.vibrate(ms);
  } catch {}
}
