/**
 * Tuercas — sonido sintetizado: motor de cada jugador (sube con la velocidad), chirrido del derrape, efectos de cada
 * evento de la carrera (con volumen según qué tan cerca pasa) y una música que se arma sola para cada pista
 * (batería, bajo y arpegio sobre una progresión de acordes) y se acelera en la última vuelta.
 */
import { tone, noise, notes, unlock, vol, now } from '/shared/sfx.js';
import { rng, clamp } from './shared/util.js';

const G = window.GameIt;
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixo: [0, 2, 4, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};
const PROG = { major: [0, 5, 3, 4], minor: [0, 5, 2, 6], dorian: [0, 3, 0, 6], mixo: [0, 6, 3, 0], phrygian: [0, 1, 0, 6] };

let ac = null;
let bus = null; // volumen de la música y el motor
let noiseBuf = null;

function ctx() {
  if (ac) return ac;
  ac = unlock();
  if (!ac) return null;
  bus = ac.createGain();
  bus.connect(ac.destination);
  const len = ac.sampleRate;
  noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return ac;
}

// ---------------------------------------------------------------- motor y chirrido
class Voice {
  constructor(pan = 0) {
    this.o1 = ac.createOscillator();
    this.o2 = ac.createOscillator();
    this.o1.type = 'sawtooth';
    this.o2.type = 'square';
    this.f = ac.createBiquadFilter();
    this.f.type = 'lowpass';
    this.f.Q.value = 3;
    this.g = ac.createGain();
    this.g.gain.value = 0;
    const p = ac.createStereoPanner ? ac.createStereoPanner() : null;
    if (p) p.pan.value = pan;
    const mix = ac.createGain();
    mix.gain.value = 0.5;
    this.o1.connect(mix);
    this.o2.connect(mix);
    mix.connect(this.f).connect(this.g);
    (p ? this.g.connect(p).connect(bus) : this.g.connect(bus));
    this.o1.start();
    this.o2.start();
    // chirrido del derrape: ruido filtrado
    this.n = ac.createBufferSource();
    this.n.buffer = noiseBuf;
    this.n.loop = true;
    this.nf = ac.createBiquadFilter();
    this.nf.type = 'bandpass';
    this.nf.frequency.value = 2100;
    this.nf.Q.value = 5;
    this.ng = ac.createGain();
    this.ng.gain.value = 0;
    this.n.connect(this.nf).connect(this.ng);
    (p ? this.ng.connect(p).connect(bus) : this.ng.connect(bus));
    this.n.start();
    // viento: ruido grave que sube con la velocidad
    this.w = ac.createBufferSource();
    this.w.buffer = noiseBuf;
    this.w.loop = true;
    this.wf = ac.createBiquadFilter();
    this.wf.type = 'lowpass';
    this.wf.frequency.value = 500;
    this.wg = ac.createGain();
    this.wg.gain.value = 0;
    this.w.connect(this.wf).connect(this.wg);
    (p ? this.wg.connect(p).connect(bus) : this.wg.connect(bus));
    this.w.start();
  }
  update(k, level) {
    const t = ac.currentTime;
    const sp = clamp(k.v / Math.max(1, k.P.vmax), 0, 1.4);
    const rpm = k.air ? 0.8 + sp * 0.4 : 0.35 + Math.min(1, sp) * 0.9 + (k.boostT > 0 ? 0.12 : 0);
    const f = (k.P.bike ? 78 : 58) * (1 + rpm * 2.1);
    this.o1.frequency.setTargetAtTime(f, t, 0.05);
    this.o2.frequency.setTargetAtTime(f * (k.P.bike ? 1.5 : 1.004), t, 0.05);
    this.f.frequency.setTargetAtTime(380 + rpm * 1500, t, 0.06);
    const alive = k.fallT <= 0 && k.stallT <= 0 ? 1 : 0.2;
    this.g.gain.setTargetAtTime((0.05 + 0.045 * rpm) * level * alive, t, 0.08);
    const sk = k.drift && !k.air && sp > 0.35 ? 0.05 : (k.off && sp > 0.3 ? 0.025 : 0);
    this.ng.gain.setTargetAtTime(sk * level, t, 0.05);
    this.nf.frequency.setTargetAtTime(k.drift ? 2300 + k.mtLevel * 500 : 900, t, 0.1);
    this.wg.gain.setTargetAtTime(0.06 * clamp(sp - 0.3, 0, 1) * level, t, 0.15);
    this.wf.frequency.setTargetAtTime(300 + sp * 1800, t, 0.15);
  }
  mute() {
    const t = ac.currentTime;
    this.g.gain.setTargetAtTime(0, t, 0.05);
    this.ng.gain.setTargetAtTime(0, t, 0.05);
    this.wg.gain.setTargetAtTime(0, t, 0.05);
  }
  stop() {
    for (const n of [this.o1, this.o2, this.n, this.w]) {
      try {
        n.stop();
      } catch {}
    }
  }
}

// ---------------------------------------------------------------- música
class Music {
  constructor() {
    this.on = false;
    this.step = 0;
    this.nextT = 0;
    this.theme = null;
    this.rate = 1;
    this.shift = 0;
    this.bar = 0;
  }
  start(theme, seed) {
    if (!ctx()) return;
    this.theme = { tempo: 120, root: 60, mode: 'major', ...theme };
    const R = rng(seed || 1);
    // motivo de 16 pasos con algunos silencios
    this.motif = Array.from({ length: 16 }, (_, i) => (i % 4 === 0 || R() < 0.55 ? Math.floor(R() * 5) : -1));
    this.step = 0;
    this.bar = 0;
    this.nextT = ac.currentTime + 0.1;
    this.on = true;
    this.shift = 0;
    this.rate = 1;
  }
  stop() {
    this.on = false;
  }
  /** Última vuelta: más rápida y dos semitonos arriba. */
  final(on) {
    this.rate = on ? 1.1 : 1;
    this.shift = on ? 2 : 0;
  }
  update() {
    if (!this.on || !ac || ac.state !== 'running') return;
    const mv = (G?.prefs?.volume?.music ?? 0.5) * 0.6;
    bus.gain.value = 1;
    if (mv <= 0.001) {
      this.nextT = ac.currentTime + 0.1;
      return;
    }
    const th = this.theme;
    const stepDur = 60 / (th.tempo * this.rate) / 4;
    const scale = SCALES[th.mode] || SCALES.major;
    const prog = PROG[th.mode] || PROG.major;
    while (this.nextT < ac.currentTime + 0.22) {
      const s = this.step % 16;
      const bar = Math.floor(this.step / 16) % 4;
      const deg = prog[bar];
      const chord = [0, 2, 4].map((q) => {
        const d = deg + q;
        return scale[d % 7] + 12 * Math.floor(d / 7);
      });
      const root = th.root + this.shift;
      const t = this.nextT;
      const at = t - ac.currentTime;
      // bombo y hi-hat
      if (s === 0 || s === 8 || (s === 14 && bar % 2)) tone(130, 45, 0.16, { type: 'sine', vol: 0.55 * mv * 2, at });
      if (s % 2 === 0 && s % 4 !== 0) noise(0.04, { freq: 7000, q: 1, type: 'highpass', vol: 0.12 * mv * 2, at });
      if (s === 4 || s === 12) noise(0.09, { freq: 1800, q: 0.8, vol: 0.22 * mv * 2, at });
      // bajo
      if ([0, 3, 6, 8, 11, 14].includes(s)) tone(hz(root - 24 + chord[0]), hz(root - 24 + chord[0]), stepDur * 1.6, { type: 'triangle', vol: 0.34 * mv * 2, at });
      // arpegio
      const m = this.motif[s];
      if (m >= 0) {
        const d = deg + m;
        const n = root + scale[d % 7] + 12 * Math.floor(d / 7) + (bar === 3 && s > 8 ? 12 : 0);
        tone(hz(n + 12), hz(n + 12), stepDur * 1.3, { type: 'square', vol: 0.1 * mv * 2, at });
      }
      this.nextT += stepDur;
      this.step++;
    }
  }
}

// ---------------------------------------------------------------- general
const engines = [];
let budget = 12;
let budgetT = 0;
const music = new Music();
let rollT = 0;
let nutStreak = 0;
let nutT = 0;

export const audio = {
  /** Se llama con el primer toque: crea el contexto de audio. */
  init() {
    return ctx();
  },
  music: {
    start: (theme, seed) => music.start(theme, seed),
    stop: () => music.stop(),
    final: (on) => music.final(on),
  },
  /** Cada cuadro: motores, música y los tics de la ruleta. `views` = [{ kart }]. */
  update(R, views, dt) {
    if (!ac) return;
    music.update();
    if (!R) {
      for (const e of engines) e.mute();
      return;
    }
    const lv = clamp(vol(), 0, 1);
    views.forEach((v, i) => {
      if (!v.kart) return;
      if (!engines[i]) engines[i] = new Voice(views.length > 1 ? (i === 0 ? -0.5 : 0.5) : 0);
      engines[i].update(v.kart, lv * (views.length > 1 ? 0.7 : 1));
      // tic de la ruleta de ítems
      if (v.kart.rollT > 0 && i === 0) {
        rollT -= dt;
        if (rollT <= 0) {
          rollT = 0.075;
          tone(520 + Math.random() * 500, 700, 0.04, { type: 'square', vol: 0.12 });
        }
      }
    });
    if (nutT > 0) nutT -= dt;
    else nutStreak = 0;
  },
  muteEngines() {
    if (ac) for (const e of engines) e.mute();
  },
  /** Sonido de un evento. `view` = vehículos que miran las cámaras (para el volumen por cercanía). */
  event(ev, view) {
    if (!ac) return;
    const k = ev.k;
    // con 12 vehículos juntos los eventos se amontonan: lo de los demás (no el propio) tiene un tope por cuarto de segundo
    if (k && !view.includes(k)) {
      const t = ac.currentTime;
      if (t - budgetT > 0.25) {
        budgetT = t;
        budget = 12;
      }
      if (budget-- <= 0) return;
    }
    let f = 1;
    if (k && view.length && !view.includes(k)) {
      let best = 1e9;
      for (const o of view) best = Math.min(best, Math.hypot(o.x - k.x, o.z - k.z));
      f = clamp(1 - best / 34, 0, 1) * 0.6;
      if (f <= 0.02) return;
    } else if (k && !view.length) f = 0.4;
    const v = (x) => x * f;
    switch (ev.type) {
      case 'count':
        tone(440, 440, 0.2, { type: 'square', vol: 0.22 });
        break;
      case 'go':
        tone(880, 880, 0.55, { type: 'square', vol: 0.24 });
        notes([880, 1318], { step: 0.07, dur: 0.3, type: 'triangle', vol: 0.18 });
        break;
      case 'nut': {
        nutStreak = Math.min(8, nutStreak + 1);
        nutT = 0.9;
        const f0 = 880 * Math.pow(1.0595, nutStreak * 2);
        tone(f0, f0 * 1.5, 0.09, { type: 'triangle', vol: v(0.22) });
        break;
      }
      case 'box':
        noise(0.18, { freq: 3000, q: 1.5, sweep: 9000, vol: v(0.16) });
        notes([784, 988, 1175], { step: 0.05, dur: 0.12, type: 'triangle', vol: v(0.16) });
        break;
      case 'item':
        notes([523, 659, 784, 1047], { step: 0.06, dur: 0.16, type: 'triangle', vol: v(0.2) });
        break;
      case 'use':
        use(ev.a, v);
        break;
      case 'hit':
        if (ev.a === 'big') {
          noise(0.5, { freq: 300, q: 0.5, type: 'lowpass', vol: v(0.5) });
          tone(260, 40, 0.7, { type: 'sawtooth', vol: v(0.3) });
        } else {
          tone(700, 120, 0.55, { type: 'triangle', vol: v(0.3) });
          noise(0.2, { freq: 900, q: 1, vol: v(0.2) });
        }
        break;
      case 'boost':
        noise(0.4, { freq: 600, q: 1.2, sweep: 5000, vol: v(0.26) });
        tone(220, 660, 0.35, { type: 'sawtooth', vol: v(0.12) });
        break;
      case 'mt':
        tone(700 + ev.a * 260, 900 + ev.a * 300, 0.1, { type: 'square', vol: v(0.14) });
        break;
      case 'drift':
        noise(0.12, { freq: 2400, q: 3, vol: v(0.12) });
        break;
      case 'hop':
        tone(300, 520, 0.08, { type: 'triangle', vol: v(0.1) });
        break;
      case 'jump':
        noise(0.25, { freq: 800, q: 1, sweep: 3000, vol: v(0.1) });
        break;
      case 'land':
        if ((ev.a || 0) > 3) {
          tone(110, 55, 0.14, { type: 'sine', vol: v(0.35) });
          noise(0.08, { freq: 500, q: 0.6, vol: v(0.2) });
        }
        break;
      case 'trick':
        notes([660, 880, 1100, 1320], { step: 0.045, dur: 0.1, type: 'triangle', vol: v(0.16) });
        break;
      case 'wall':
        tone(150, 60, 0.12, { type: 'square', vol: v(0.25) });
        noise(0.1, { freq: 600, q: 1, vol: v(0.2) });
        break;
      case 'bump':
        tone(180, 80, 0.09, { type: 'square', vol: v(0.16) });
        break;
      case 'fall':
        tone(900, 90, 0.9, { type: 'sine', vol: v(0.22) });
        break;
      case 'respawn':
        notes([523, 784], { step: 0.07, dur: 0.14, type: 'triangle', vol: v(0.16) });
        break;
      case 'lap':
        if (k && view.includes(k)) notes([523, 659, 784], { step: 0.08, dur: 0.2, type: 'triangle', vol: 0.2 });
        break;
      case 'finish':
        if (k && view.includes(k)) {
          const win = ev.a <= 3;
          notes(win ? [523, 659, 784, 1047, 1319, 1568] : [392, 349, 330, 262], { step: 0.11, dur: 0.3, type: win ? 'triangle' : 'sine', vol: 0.22 });
        }
        break;
      case 'shield-pop':
        tone(900, 300, 0.12, { type: 'triangle', vol: v(0.2) });
        break;
      case 'steal':
        notes([880, 660], { step: 0.06, dur: 0.1, type: 'square', vol: v(0.14) });
        break;
      case 'ent-hit':
      case 'ent-pop':
        noise(0.14, { freq: 1200, q: 1, vol: v(0.2) });
        break;
      case 'ent-bounce':
        tone(900, 700, 0.05, { type: 'triangle', vol: v(0.1) });
        break;
      case 'nube-warn':
        if (k && view.includes(k)) {
          for (let i = 0; i < 4; i++) tone(i % 2 ? 660 : 880, i % 2 ? 660 : 880, 0.14, { type: 'square', vol: 0.18, at: i * 0.16 });
        }
        break;
      case 'nube-strike':
        noise(0.9, { freq: 220, q: 0.5, type: 'lowpass', vol: 0.55 });
        tone(120, 30, 0.9, { type: 'sawtooth', vol: 0.3 });
        break;
      case 'stall':
        tone(120, 70, 0.25, { type: 'sawtooth', vol: v(0.2) });
        break;
      case 'obs':
        noise(0.12, { freq: 1500, q: 1, vol: v(0.2) });
        break;
      case 'wheelie':
        tone(200, 320, 0.12, { type: 'triangle', vol: v(0.08) });
        break;
      case 'draft':
        noise(0.3, { freq: 1500, q: 0.8, sweep: 4000, vol: v(0.08) });
        break;
    }
  },
  /** Fanfarria corta para menús y resultados. */
  jingle(kind) {
    if (!ctx()) return;
    if (kind === 'win') notes([523, 659, 784, 1047, 784, 1047, 1319], { step: 0.1, dur: 0.28, type: 'triangle', vol: 0.22 });
    else if (kind === 'ok') notes([523, 659, 784], { step: 0.1, dur: 0.22, type: 'triangle', vol: 0.2 });
    else if (kind === 'click') tone(660, 880, 0.06, { type: 'triangle', vol: 0.16 });
    else if (kind === 'back') tone(520, 380, 0.07, { type: 'triangle', vol: 0.14 });
    else if (kind === 'pick') notes([784, 1047], { step: 0.05, dur: 0.1, type: 'triangle', vol: 0.16 });
  },
  stopAll() {
    music.stop();
    for (const e of engines) e.stop();
    engines.length = 0;
  },
};

function use(id, v) {
  switch (id) {
    case 'sifon':
    case 'sifon3':
      noise(0.5, { freq: 1500, q: 0.8, sweep: 6000, vol: v(0.3) });
      break;
    case 'aceite':
      tone(300, 120, 0.2, { type: 'sine', vol: v(0.25) });
      break;
    case 'ruleman':
      tone(1500, 300, 0.2, { type: 'triangle', vol: v(0.22) });
      noise(0.1, { freq: 4000, q: 2, vol: v(0.1) });
      break;
    case 'tero':
      for (let i = 0; i < 3; i++) tone(1100, 700, 0.12, { type: 'sawtooth', vol: v(0.14), at: i * 0.13 });
      break;
    case 'nube':
      tone(160, 80, 0.5, { type: 'sine', vol: v(0.28) });
      break;
    case 'burbuja':
      tone(400, 900, 0.18, { type: 'sine', vol: v(0.24) });
      break;
    case 'bocina':
      tone(330, 330, 0.55, { type: 'square', vol: v(0.28) });
      tone(440, 440, 0.55, { type: 'square', vol: v(0.2) });
      break;
    case 'iman':
      tone(180, 520, 0.4, { type: 'sawtooth', vol: v(0.16) });
      break;
    case 'aji':
      notes([392, 523, 659, 784, 1047], { step: 0.06, dur: 0.2, type: 'square', vol: v(0.14) });
      break;
    case 'canita':
      noise(0.9, { freq: 500, q: 0.8, sweep: 6000, vol: v(0.4) });
      tone(150, 700, 0.8, { type: 'sawtooth', vol: v(0.15) });
      break;
  }
}
void now;
