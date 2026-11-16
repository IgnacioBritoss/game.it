/**
 * Disimulá — sonido: efectos con /shared/sfx.js, silbido 3D posicional propio y
 * música sintetizada con WebAudio (sin archivos). Respeta el volumen del portal
 * y los deslizadores locales de música y efectos.
 */
import { tone, noise, notes, unlock } from '/shared/sfx.js';

const G = window.GameIt;
export const local = { music: 0.8, sfx: 1 }; // multiplicadores de las opciones del juego

const sv = () => (G.prefs.volume.muted ? 0 : G.prefs.volume.master * G.prefs.volume.sfx * local.sfx);
const mv = () => (G.prefs.volume.muted ? 0 : G.prefs.volume.master * G.prefs.volume.music * local.music);

export const sfx = {
  ui: () => tone(760, 540, 0.05, { type: 'square', vol: 0.05 * local.sfx }),
  ok: () => notes([620, 930], { step: 0.06, dur: 0.1, vol: 0.09 * local.sfx }),
  paint: (() => {
    let last = 0;
    return () => {
      if (performance.now() - last < 70) return;
      last = performance.now();
      noise(0.05, { freq: 2600 + Math.random() * 800, q: 1.4, vol: 0.05 * local.sfx });
    };
  })(),
  pose: () => tone(300, 420, 0.08, { type: 'triangle', vol: 0.08 * local.sfx }),
  bucket: () => {
    noise(0.16, { freq: 900, q: 1, vol: 0.12 * local.sfx, sweep: 300 });
    tone(220, 160, 0.14, { type: 'sine', vol: 0.08 * local.sfx });
  },
  pick: () => tone(980, 1400, 0.06, { type: 'sine', vol: 0.07 * local.sfx }),
  catch: () => {
    // ¡pop! de color
    tone(300, 900, 0.14, { type: 'square', vol: 0.14 * local.sfx });
    noise(0.2, { freq: 1500, q: 0.8, vol: 0.18 * local.sfx, sweep: 400 });
    notes([880, 1320], { step: 0.07, dur: 0.12, vol: 0.08 * local.sfx });
  },
  found: () => {
    tone(520, 180, 0.5, { type: 'sawtooth', vol: 0.1 * local.sfx });
    noise(0.4, { freq: 500, q: 1, vol: 0.12 * local.sfx, sweep: 120 });
  },
  stun: () => {
    tone(420, 120, 0.5, { type: 'triangle', vol: 0.12 * local.sfx });
    tone(380, 110, 0.5, { type: 'triangle', vol: 0.1 * local.sfx, at: 0.08 });
  },
  mark: () => notes([700, 1050], { step: 0.05, dur: 0.1, type: 'sine', vol: 0.09 * local.sfx }),
  tick: () => tone(1250, 1180, 0.035, { type: 'square', vol: 0.035 * local.sfx }),
  freeze: () => notes([520, 390, 260], { step: 0.1, dur: 0.2, type: 'triangle', vol: 0.1 * local.sfx }),
  go: () => notes([392, 523, 659, 784], { step: 0.09, dur: 0.18, type: 'square', vol: 0.08 * local.sfx }),
  win: () => notes([523, 659, 784, 1047, 1319], { step: 0.1, dur: 0.24, type: 'square', vol: 0.08 * local.sfx }),
  lose: () => notes([392, 311, 262, 196], { step: 0.13, dur: 0.26, type: 'sawtooth', vol: 0.05 * local.sfx }),
  react: () => tone(880, 1180, 0.07, { type: 'sine', vol: 0.06 * local.sfx }),
};

/** Silbido 3D: dos notas (fiiu–fiu) con paneo estéreo y volumen por distancia. */
export function whistleAt(dx, dy, dz) {
  const ac = unlock();
  if (!ac || !sv()) return;
  const d = Math.hypot(dx, dy, dz);
  const vol = Math.min(0.5, 1.6 / (1 + d * 0.33)) * sv();
  if (vol < 0.004) return;
  const pan = Math.max(-1, Math.min(1, dx / Math.max(1.5, d)));
  const t0 = ac.currentTime + 0.01;
  const g = ac.createGain();
  let out = g;
  if (ac.createStereoPanner) {
    const p = ac.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    p.connect(ac.destination);
    out = g;
  } else g.connect(ac.destination);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.04);
  g.gain.setValueAtTime(vol, t0 + 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.75);
  const o = ac.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(1150, t0);
  o.frequency.exponentialRampToValueAtTime(1900, t0 + 0.22);
  o.frequency.setValueAtTime(1750, t0 + 0.32);
  o.frequency.exponentialRampToValueAtTime(900, t0 + 0.7);
  const vib = ac.createOscillator();
  vib.frequency.value = 26;
  const vg = ac.createGain();
  vg.gain.value = 36;
  vib.connect(vg).connect(o.frequency);
  o.connect(out);
  o.start(t0);
  o.stop(t0 + 0.8);
  vib.start(t0);
  vib.stop(t0 + 0.8);
}

// ---------------------------------------------------------------- música
// Un colchón de acordes + arpegio sencillo. En "tense" sube el tempo, baja a menor
// y entran tics de percusión (los últimos 30 segundos).
let msRunning = false;
let msMode = 'calm';
let msTimer = 0;
let msStep = 0;

const CALM = { bpm: 72, chords: [[0, 4, 7, 11], [5, 9, 12, 16], [7, 11, 14, 17], [4, 7, 11, 14]], base: 196 };
const TENSE = { bpm: 126, chords: [[0, 3, 7, 10], [-2, 2, 5, 8], [0, 3, 7, 10], [3, 7, 10, 13]], base: 185 };
const f = (base, semi) => base * 2 ** (semi / 12);

function musicStep() {
  if (!msRunning) return;
  const ac = unlock();
  const cfg = msMode === 'tense' ? TENSE : CALM;
  const beat = 60 / cfg.bpm / 2; // corcheas
  msTimer = setTimeout(musicStep, beat * 1000);
  if (!ac || ac.state !== 'running' || !mv() || G.paused) return;
  const t = ac.currentTime + 0.02;
  const bar = Math.floor(msStep / 8) % cfg.chords.length;
  const chord = cfg.chords[bar];
  const vol = mv();
  // colchón al empezar cada compás
  if (msStep % 8 === 0) {
    for (const semi of chord.slice(0, 3)) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      const fl = ac.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.value = msMode === 'tense' ? 900 : 620;
      o.type = 'sawtooth';
      o.frequency.value = f(cfg.base / 2, semi);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05 * vol, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 8);
      o.connect(fl).connect(g).connect(ac.destination);
      o.start(t);
      o.stop(t + beat * 8 + 0.05);
    }
  }
  // arpegio
  const seq = msMode === 'tense' ? [0, 1, 2, 3, 2, 1, 3, 2] : [0, 2, 1, 3, 0, 2, 3, 1];
  const semi = chord[seq[msStep % 8]];
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'triangle';
  o.frequency.value = f(cfg.base * 2, semi);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.045 * vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + beat * 0.95);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + beat);
  // percusión tensa
  if (msMode === 'tense' && msStep % 2 === 0) noise(0.04, { freq: 3400, q: 2, vol: 0.05 * local.music });
  msStep++;
}

export function music(mode) {
  if (mode === null || mode === false) {
    msRunning = false;
    clearTimeout(msTimer);
    return;
  }
  msMode = mode;
  if (!msRunning) {
    msRunning = true;
    msStep = 0;
    musicStep();
  }
}

export { unlock };
