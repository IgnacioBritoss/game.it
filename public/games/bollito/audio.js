/**
 * Bollito — sonidos sintetizados (sin archivos): el papel que se arruga, el soplido del tiro, el "fsss" de un tiro
 * limpio, el clanc del aro de metal, la malla del cesto, golpes contra muebles y piso, aplausos del compañero y el
 * zumbido del ventilador (que sube con el viento).
 */
import { tone, noise, notes, unlock, vol, ready } from '/shared/sfx.js';

const G = window.GameIt;
const rnd = (a, b) => a + Math.random() * (b - a);
const k01 = (v, max) => Math.max(0.15, Math.min(1, v / max));

/** Papel que se arruga en la mano: crujidos cortos de ruido agudo. */
export function crumple() {
  for (let i = 0; i < 9; i++) noise(rnd(0.025, 0.06), { freq: rnd(1400, 5200), q: rnd(1.5, 4), vol: rnd(0.05, 0.12), at: i * rnd(0.025, 0.045) });
  noise(0.12, { freq: 700, q: 0.8, vol: 0.05, at: 0.05 });
}

/** Soplido del brazo al tirar (más fuerte, más agudo). */
export function whoosh(p) {
  noise(0.26, { freq: 380 + p * 300, sweep: 1600 + p * 1600, q: 0.9, vol: 0.09 + p * 0.08 });
}

/** Tiro limpio: el bollito pasa rozando la bolsa, "fsss". */
export function swish() {
  noise(0.32, { freq: 6200, sweep: 1800, q: 0.7, vol: 0.2 });
  noise(0.18, { freq: 2600, q: 1.2, vol: 0.08, at: 0.08 });
}

/** Choques según el material. `v`: rapidez del golpe (m/s). */
export function hit(kind, v) {
  const k = k01(v, 4);
  if (kind === 'rim') {
    // aro de metal: dos parciales inarmónicos que suenan un rato
    const f = rnd(1650, 1900);
    tone(f, f * 0.99, 0.32, { type: 'triangle', vol: 0.11 * k });
    tone(f * 1.47, f * 1.46, 0.22, { type: 'sine', vol: 0.07 * k });
    tone(f * 0.62, f * 0.61, 0.4, { type: 'sine', vol: 0.06 * k });
    noise(0.03, { freq: 5000, q: 2, vol: 0.12 * k });
  } else if (kind === 'wall') {
    // malla del cesto: tintineo seco
    noise(0.09, { freq: rnd(2400, 3200), q: 3.5, vol: 0.13 * k });
    tone(950, 900, 0.07, { type: 'square', vol: 0.025 * k });
  } else if (kind === 'bottom') {
    noise(0.12, { freq: 260, type: 'lowpass', vol: 0.32 * k });
    tone(150, 90, 0.12, { type: 'sine', vol: 0.12 * k });
    noise(0.05, { freq: 1800, q: 2, vol: 0.06 * k });
  } else if (kind === 'metal') {
    tone(620, 600, 0.28, { type: 'triangle', vol: 0.08 * k });
    tone(1410, 1400, 0.18, { type: 'sine', vol: 0.05 * k });
    noise(0.04, { freq: 2500, q: 2, vol: 0.08 * k });
  } else if (kind === 'wood' || kind === 'pot') {
    tone(kind === 'pot' ? 420 : 300, 230, 0.07, { type: 'triangle', vol: 0.1 * k });
    noise(0.05, { freq: 1100, q: 1.4, vol: 0.12 * k });
  } else if (kind === 'plastic') {
    noise(0.04, { freq: 2300, q: 4, vol: 0.13 * k });
    tone(700, 640, 0.04, { type: 'square', vol: 0.03 * k });
  } else if (kind === 'soft') noise(0.08, { freq: 500, type: 'lowpass', vol: 0.12 * k });
  else {
    // piso, paredes: papel contra madera
    noise(0.06, { freq: 900, q: 1.2, vol: 0.16 * k });
    tone(190, 120, 0.06, { type: 'sine', vol: 0.06 * k });
  }
}

/** Entró: campanita (más brillante si fue limpio). */
export function made(clean, mult) {
  const up = Math.min(3, mult - 1) * 2;
  const base = [523, 659, 784, 1047].map((f) => f * 2 ** (up / 12));
  notes(clean ? [...base, base[3] * 1.26] : base.slice(0, 3), { step: 0.065, dur: 0.22, type: 'triangle', vol: 0.1 });
}

/** Subió el multiplicador de racha. */
export function streak() {
  notes([784, 988, 1175, 1568], { step: 0.05, dur: 0.18, type: 'square', vol: 0.045 });
}

/** Afuera: "uuh" que baja. */
export function miss(close) {
  tone(close ? 420 : 360, close ? 250 : 200, 0.45, { type: 'sine', vol: 0.09 });
  tone(close ? 315 : 270, close ? 190 : 150, 0.45, { type: 'triangle', vol: 0.04, at: 0.04 });
}

/** El compañero aplaude (más palmas cuanto más `level`). */
export function claps(level = 1) {
  const n = Math.round(4 + level * 6);
  for (let i = 0; i < n; i++) noise(0.035, { freq: rnd(1300, 2100), q: 1.1, vol: rnd(0.08, 0.14), at: 0.05 + i * rnd(0.09, 0.13) });
  if (level > 0.6) tone(520, 880, 0.28, { type: 'sawtooth', vol: 0.025, at: 0.04 });
}

/** Cuenta regresiva (online). */
export const beep = (go = false) => tone(go ? 990 : 660, go ? 990 : 660, go ? 0.3 : 0.12, { type: 'square', vol: 0.06 });

/** Fin de partida. */
export const over = () => notes([523, 440, 349, 262], { step: 0.14, dur: 0.3, type: 'triangle', vol: 0.1 });

/** Récord nuevo. */
export const record = () => notes([523, 659, 784, 1047, 1319, 1568], { step: 0.08, dur: 0.3, type: 'triangle', vol: 0.11 });

/** Tic de la interfaz. */
export const tick = () => tone(1200, 1100, 0.03, { type: 'square', vol: 0.025 });

// ---------------------------------------------------------------- zumbido del ventilador
let fan = null;
/** `level`: 0 apagado … 1 a fondo. Se suaviza solo. */
export function fanHum(level) {
  if (!fan && (!ready() || level <= 0)) return;
  const ac = unlock();
  if (!ac) return;
  if (!fan) {
    const len = ac.sampleRate * 2;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.96 + (Math.random() * 2 - 1) * 0.04;
      d[i] = last * 5;
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 0.8;
    const g = ac.createGain();
    g.gain.value = 0;
    // un zumbido grave del motor debajo del aire
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = 96;
    const og = ac.createGain();
    og.gain.value = 0;
    src.connect(f).connect(g).connect(ac.destination);
    o.connect(og).connect(ac.destination);
    src.start();
    o.start();
    fan = { f, g, o, og };
  }
  const v = G?.paused || G?.prefs?.volume?.muted ? 0 : vol();
  const t = ac.currentTime;
  fan.g.gain.setTargetAtTime(level * level * 0.09 * v, t, 0.25);
  fan.f.frequency.setTargetAtTime(380 + level * 900, t, 0.25);
  fan.og.gain.setTargetAtTime(level * 0.02 * v, t, 0.25);
  fan.o.frequency.setTargetAtTime(80 + level * 50, t, 0.25);
}
