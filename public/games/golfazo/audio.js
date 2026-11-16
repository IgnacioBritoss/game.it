/** Golfazo — sonidos sintetizados (sin archivos). Usa el módulo compartido, que respeta el volumen del portal. */
import { tone, noise, notes } from '/shared/sfx.js';

const rnd = (a, b) => a + Math.random() * (b - a);

export const S = {
  /** golpe de palo: más fuerte, más grave y con más "toc" */
  putt: (p = 0.5) => {
    tone(rnd(700, 900), 320, 0.07, { type: 'triangle', vol: 0.14 + p * 0.18 });
    noise(0.06, { freq: 2600, q: 1.5, vol: 0.2 + p * 0.2 });
  },
  hit: (v = 4, wall = false) => {
    const k = Math.min(1, v / 12);
    if (wall) tone(rnd(170, 230), 90, 0.1, { type: 'triangle', vol: 0.12 + k * 0.25 });
    else noise(0.07, { freq: 900, q: 1, vol: 0.06 + k * 0.12 });
  },
  bumper: () => {
    tone(320, 960, 0.12, { type: 'square', vol: 0.1 });
    tone(640, 1280, 0.1, { vol: 0.14, at: 0.03 });
  },
  water: () => {
    noise(0.55, { freq: 800, q: 0.6, vol: 0.4, sweep: 300 });
    tone(520, 120, 0.4, { vol: 0.1 });
  },
  lava: () => {
    noise(0.7, { freq: 1500, q: 0.5, vol: 0.32, sweep: 200 });
    tone(180, 60, 0.5, { type: 'sawtooth', vol: 0.09 });
  },
  fall: () => tone(700, 90, 0.5, { type: 'sine', vol: 0.14 }),
  boost: () => {
    tone(200, 1400, 0.28, { type: 'sawtooth', vol: 0.08 });
    noise(0.25, { freq: 3000, q: 0.5, vol: 0.1 });
  },
  spring: () => {
    tone(260, 880, 0.18, { type: 'square', vol: 0.09 });
    tone(520, 1500, 0.14, { vol: 0.1, at: 0.05 });
  },
  pipe: () => tone(300, 1700, 0.25, { type: 'sine', vol: 0.14 }),
  cup: () => {
    [0, 0.06, 0.11].forEach((at) => tone(1500, 1400, 0.05, { type: 'square', vol: 0.06, at }));
    notes([660, 880, 1175], { step: 0.1, dur: 0.22, vol: 0.18 });
  },
  good: () => notes([523, 659, 784, 1047], { step: 0.1, vol: 0.16 }),
  great: () => notes([523, 659, 784, 1047, 784, 1047, 1319], { step: 0.085, vol: 0.16 }),
  meh: () => notes([392, 392], { step: 0.14, vol: 0.12 }),
  bad: () => notes([392, 370, 349, 262], { step: 0.16, type: 'sawtooth', vol: 0.07 }),
  win: () => notes([523, 523, 523, 698, 880, 784, 698, 880, 1047], { step: 0.11, vol: 0.16 }),
  lose: () => notes([392, 330, 262, 196], { step: 0.22, type: 'sawtooth', vol: 0.07 }),
  click: () => tone(720, 520, 0.04, { type: 'square', vol: 0.06 }),
  tick: () => tone(1200, 1200, 0.03, { type: 'square', vol: 0.05 }),
  go: () => notes([784, 1047], { step: 0.1, vol: 0.16 }),
};
