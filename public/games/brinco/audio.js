/**
 * Brinco — sonido sintetizado: un efecto por cada evento de la simulación y una música que se arma sola para cada
 * mundo (bombo, bajo, arpegio y melodía sobre una progresión de acordes).
 */
import { tone, noise, notes, unlock, vol } from '/shared/sfx.js';

const G = window.GameIt;
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10] };
const PROG = { major: [0, 5, 3, 4], minor: [0, 5, 2, 6], dorian: [0, 3, 0, 6], phrygian: [0, 1, 0, 6] };
const THEME = { prairie: { tempo: 132, root: 60, mode: 'major' }, cave: { tempo: 112, root: 57, mode: 'minor' }, ice: { tempo: 104, root: 64, mode: 'dorian' }, lava: { tempo: 146, root: 55, mode: 'phrygian' } };

let ac = null;
const ctx = () => (ac ||= unlock());

class Music {
  constructor() {
    this.on = false;
    this.step = 0;
    this.nextT = 0;
  }
  start(theme, seed = 1) {
    if (!ctx()) return;
    this.th = THEME[theme] || THEME.prairie;
    let a = seed * 2654435761;
    const R = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
    this.motif = Array.from({ length: 16 }, (_, i) => (i % 4 === 0 || R() < 0.55 ? Math.floor(R() * 5) : -1));
    this.step = 0;
    this.nextT = ac.currentTime + 0.1;
    this.on = true;
    this.rate = 1;
  }
  stop() {
    this.on = false;
  }
  update() {
    if (!this.on || !ac || ac.state !== 'running') return;
    const mv = (G?.prefs?.volume?.music ?? 0.5) * 0.6;
    if (mv <= 0.001) {
      this.nextT = ac.currentTime + 0.1;
      return;
    }
    const th = this.th;
    const stepDur = 60 / (th.tempo * this.rate) / 4;
    const scale = SCALES[th.mode];
    const prog = PROG[th.mode];
    while (this.nextT < ac.currentTime + 0.22) {
      const s = this.step % 16;
      const bar = Math.floor(this.step / 16) % 4;
      const deg = prog[bar];
      const root = th.root;
      const at = this.nextT - ac.currentTime;
      if (s % 4 === 0) tone(140, 48, 0.12, { type: 'sine', vol: 0.5 * mv * 2, at });
      if (s % 4 === 2) noise(0.04, { freq: 7000, q: 1, type: 'highpass', vol: 0.1 * mv * 2, at });
      if (s === 4 || s === 12) noise(0.08, { freq: 1800, q: 0.8, vol: 0.18 * mv * 2, at });
      if ([0, 3, 6, 8, 11, 14].includes(s)) {
        const n = root - 24 + scale[deg % 7];
        tone(hz(n), hz(n), stepDur * 1.5, { type: 'triangle', vol: 0.32 * mv * 2, at });
      }
      const m = this.motif[s];
      if (m >= 0) {
        const d = deg + m;
        const n = root + scale[d % 7] + 12 * Math.floor(d / 7);
        tone(hz(n + 12), hz(n + 12), stepDur * 1.2, { type: 'square', vol: 0.09 * mv * 2, at });
      }
      this.nextT += stepDur;
      this.step++;
    }
  }
}
const music = new Music();

export const audio = {
  init: () => ctx(),
  music: {
    start: (theme, seed) => music.start(theme, seed),
    stop: () => music.stop(),
    update: () => music.update(),
  },
  event(e) {
    if (!ac) return;
    switch (e.t) {
      case 'jump':
        tone(360, 760, 0.13, { type: 'square', vol: 0.15 });
        break;
      case 'coin':
        notes([988, 1319], { step: 0.05, dur: 0.12, type: 'square', vol: 0.12 });
        break;
      case 'gem':
        notes([784, 988, 1319, 1568], { step: 0.06, dur: 0.16, type: 'triangle', vol: 0.2 });
        break;
      case 'stomp':
        tone(320, 110, 0.12, { type: 'square', vol: 0.2 });
        noise(0.06, { freq: 1500, q: 1, vol: 0.14 });
        break;
      case 'kill':
        tone(500, 900, 0.08, { type: 'triangle', vol: 0.12 });
        break;
      case 'kick':
        tone(200, 420, 0.1, { type: 'square', vol: 0.18 });
        break;
      case 'hurt':
        tone(520, 110, 0.35, { type: 'sawtooth', vol: 0.22 });
        break;
      case 'die':
        notes([523, 440, 349, 262, 196], { step: 0.11, dur: 0.22, type: 'triangle', vol: 0.22 });
        break;
      case 'bump':
        tone(150, 90, 0.08, { type: 'square', vol: 0.18 });
        break;
      case 'break':
        noise(0.22, { freq: 900, q: 0.8, vol: 0.22 });
        tone(220, 80, 0.15, { type: 'square', vol: 0.1 });
        break;
      case 'item-out':
        tone(300, 900, 0.25, { type: 'triangle', vol: 0.18 });
        break;
      case 'power':
        notes([523, 659, 784, 1047, 1319], { step: 0.06, dur: 0.14, type: 'square', vol: 0.12 });
        break;
      case 'checkpoint':
        notes([523, 659, 784], { step: 0.08, dur: 0.2, type: 'triangle', vol: 0.2 });
        break;
      case 'goal':
        notes([523, 659, 784, 1047, 784, 1047, 1319], { step: 0.1, dur: 0.26, type: 'triangle', vol: 0.22 });
        break;
      case 'spring':
        tone(180, 1000, 0.3, { type: 'triangle', vol: 0.2 });
        break;
      case 'spit':
        tone(900, 500, 0.09, { type: 'square', vol: 0.12 });
        break;
      case 'shoot':
        noise(0.12, { freq: 400, q: 0.8, type: 'lowpass', vol: 0.3 });
        tone(140, 70, 0.15, { type: 'sawtooth', vol: 0.15 });
        break;
      case 'pop':
        tone(700, 300, 0.06, { type: 'square', vol: 0.1 });
        break;
      case 'thud':
      case 'pound-land':
        tone(90, 45, 0.22, { type: 'sine', vol: 0.4 });
        noise(0.12, { freq: 400, q: 0.6, type: 'lowpass', vol: 0.3 });
        break;
      case 'pound':
        tone(300, 120, 0.15, { type: 'sawtooth', vol: 0.15 });
        break;
      case 'boss-hit':
        tone(260, 90, 0.35, { type: 'sawtooth', vol: 0.25 });
        noise(0.15, { freq: 900, q: 1, vol: 0.2 });
        break;
      case 'boss-dead':
        notes([784, 659, 523, 392, 523, 659, 784, 1047], { step: 0.1, dur: 0.25, type: 'triangle', vol: 0.22 });
        noise(0.6, { freq: 300, q: 0.5, type: 'lowpass', vol: 0.4 });
        break;
      case 'boom':
        noise(0.35, { freq: 500, q: 0.6, type: 'lowpass', vol: 0.35 });
        break;
      case 'burn':
        noise(0.3, { freq: 2000, q: 0.8, sweep: 6000, vol: 0.2 });
        break;
      case 'land':
        if ((e.a || 0) > 12) tone(120, 60, 0.07, { type: 'sine', vol: 0.18 });
        break;
      case 'boss-jump':
        tone(200, 600, 0.3, { type: 'triangle', vol: 0.2 });
        break;
      case 'flutter':
        tone(500, 700, 0.04, { type: 'triangle', vol: 0.05 });
        break;
      default:
        break;
    }
  },
  click: () => ctx() && tone(660, 880, 0.06, { type: 'triangle', vol: 0.16 }),
  back: () => ctx() && tone(520, 380, 0.07, { type: 'triangle', vol: 0.14 }),
  pick: () => ctx() && notes([784, 1047], { step: 0.05, dur: 0.1, type: 'triangle', vol: 0.16 }),
  ready: (n) => ctx() && tone(n ? 440 : 880, n ? 440 : 880, n ? 0.18 : 0.45, { type: 'square', vol: 0.22 }),
  win: () => ctx() && notes([523, 659, 784, 1047, 784, 1047, 1319], { step: 0.1, dur: 0.28, type: 'triangle', vol: 0.22 }),
};
void vol;
