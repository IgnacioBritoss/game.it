/** Bengala — sonidos sintetizados (sin archivos) sobre /shared/sfx.js, que respeta el volumen del portal y la pausa. */
import { tone, noise, notes } from '/shared/sfx.js';

const SCALE = [392, 440, 523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760]; // pentatónica: los eslabones suben por la escala
let lastBoom = 0;
let lastLaunch = 0;
let booms = 0;

export function sfx(k, n = 0) {
  const now = performance.now();
  if (k === 'launch') {
    if (now - lastLaunch < 60) return;
    lastLaunch = now;
    noise(0.16, { freq: 900, sweep: 2600, q: 1.4, vol: 0.035 });
  } else if (k === 'boom') {
    // muchos estallidos seguidos no se pisan: se espacian y bajan de volumen
    if (now - lastBoom < 45) return;
    booms = now - lastBoom < 300 ? Math.min(6, booms + 1) : 0;
    lastBoom = now;
    const v = 0.2 / (1 + booms * 0.35);
    tone(150 + Math.random() * 40, 46, 0.26, { type: 'sine', vol: v });
    noise(0.22, { freq: 1400 + Math.random() * 800, q: 0.6, vol: v * 0.5, sweep: 500 });
    if (n > 1) {
      const f = SCALE[Math.min(SCALE.length - 1, n - 2)];
      tone(f, f * 1.01, 0.16, { type: 'triangle', vol: 0.09 });
    }
  } else if (k === 'chain') notes([523, 659, 784, 1047, 1319].slice(0, Math.min(5, n)), { step: 0.05, dur: 0.16, vol: 0.09 });
  else if (k === 'lantern') {
    tone(1175, 1568, 0.18, { type: 'sine', vol: 0.1 });
    tone(1568, 2093, 0.22, { type: 'sine', vol: 0.06, at: 0.06 });
  } else if (k === 'plane') notes([659, 784, 988, 1319, 1568], { step: 0.07, dur: 0.24, vol: 0.11 });
  else if (k === 'buy') tone(520, 780, 0.07, { type: 'triangle', vol: 0.1 });
  else if (k === 'up') notes([587, 784, 1175], { step: 0.06, dur: 0.14, vol: 0.09 });
  else if (k === 'no') tone(170, 120, 0.1, { type: 'square', vol: 0.05 });
  else if (k === 'finale') {
    noise(0.9, { freq: 500, sweep: 3200, q: 0.7, vol: 0.14 });
    notes([392, 523, 659, 784, 1047], { step: 0.08, dur: 0.3, vol: 0.12 });
  } else if (k === 'crowd') noise(1.1, { freq: 900, q: 0.4, vol: 0.06, sweep: 1400 });
  else if (k === 'ach') notes([784, 988, 1175, 1568], { step: 0.09, dur: 0.22, vol: 0.1 });
  else if (k === 'star') notes([523, 784, 1047, 1568, 2093], { step: 0.1, dur: 0.4, type: 'sine', vol: 0.12 });
  else if (k === 'win') notes([523, 659, 784, 1047, 1319, 1568], { step: 0.09, dur: 0.3, vol: 0.12 });
  else if (k === 'lose') notes([523, 440, 349, 294], { step: 0.14, dur: 0.3, type: 'sine', vol: 0.1 });
  else if (k === 'tick') tone(660, 660, 0.08, { type: 'square', vol: 0.05 });
  else if (k === 'go') tone(990, 990, 0.22, { type: 'square', vol: 0.07 });
  else if (k === 'smoke') noise(0.7, { freq: 300, sweep: 1500, q: 0.5, vol: 0.14 });
  else if (k === 'fizz') noise(0.2, { freq: 3000, sweep: 600, q: 1, vol: 0.04 });
  else if (k === 'tab') tone(700, 700, 0.03, { type: 'sine', vol: 0.04 });
}

/** Vibración corta en el celular, si existe y no se pidió menos movimiento. */
export function buzz(ms) {
  try {
    if (!window.GameIt?.prefs?.reducedMotion && navigator.vibrate) navigator.vibrate(ms);
  } catch {}
}
