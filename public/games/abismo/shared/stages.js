/**
 * Abismo — los guiones de las tres etapas, como datos: a qué segundo sale cada bicho, por dónde entra, cómo se
 * mueve y qué patrón dispara. Cada etapa dura unos dos minutos y medio y termina con su jefe (shared/bosses.js).
 *
 * Los bichos se arman con formaciones chicas (cardúmenes de sardinas, filas de medusas, globos que se plantan,
 * minas a la deriva, anguilas que cruzan, mantas, nautilos que traen cápsulas y señuelos de rape). Los números son
 * para dificultad normal: la simulación escala velocidad, cantidad y ritmo de las balas.
 */
import { W } from './data.js';

const PI = Math.PI;

// ---------------------------------------------------------------- disparos
const F = {
  aim: (spd, every, o = {}) => ({ p: 'spread', n: 1, arc: 0, spd, every, kind: 'dot', col: 'pink', delay: 0.8, ...o }),
  fan: (n, arc, spd, every, o = {}) => ({ p: 'spread', n, arc, spd, every, kind: 'dot', col: 'pink', delay: 0.7, ...o }),
  ring: (n, spd, every, o = {}) => ({ p: 'ring', n, spd, every, kind: 'dot', col: 'cyan', delay: 0.9, aim: true, ...o }),
  stack: (n, arc, m, spd, dspd, every, o = {}) => ({ p: 'stack', n, arc, m, spd, dspd, every, kind: 'rice', col: 'orange', delay: 0.9, ...o }),
  spiral: (arms, rot, spd, every, o = {}) => ({ p: 'spiral', arms, rot, spd, every, kind: 'dot', col: 'yellow', delay: 0.6, ...o }),
  wave: (n, arc, spd, amp, freq, every, o = {}) => ({ p: 'wave', n, arc, spd, amp, freq, every, a0: PI / 2, kind: 'bub', col: 'cyan', delay: 0.8, dph: 1.1, ...o }),
  flower: (n, spd, w, every, o = {}) => ({ p: 'flower', n, spd, w, wT: 1.6, every, kind: 'dot', col: 'green', delay: 0.7, aim: true, ...o }),
};

// ---------------------------------------------------------------- armado
function build(fn) {
  const ev = [];
  const add = (t, e, x, y, mv, fr, more = {}) => ev.push({ t, e, x, y, mv, fr, ...more });

  const api = {
    F,
    /** Cardumen de sardinas que entra por un costado y se va curvando hacia abajo. */
    sardines(t, side, { n = 5, y = 70, dt = 0.2, vx = 165, vy = 18, ay = 72, fr = null } = {}) {
      const s = side === 'L' ? 1 : -1;
      for (let i = 0; i < n; i++) add(t + i * dt, 'sardina', side === 'L' ? -12 : W + 12, y, { k: 'line', vx: vx * s, vy, ay }, fr);
    },
    /** Fila de sardinas que baja ondulando desde arriba. */
    column(t, x, { n = 6, dt = 0.2, vy = 150, amp = 36, freq = 3, ph = 0, fr = null } = {}) {
      for (let i = 0; i < n; i++) add(t + i * dt, 'sardina', x, -12, { k: 'sine', vy, amp, freq, ph }, fr);
    },
    /** Sardinas en V. */
    vee(t, x, { n = 7, vy = 120, gap = 22, fr = null } = {}) {
      for (let i = 0; i < n; i++) {
        const k = i - (n - 1) / 2;
        add(t + Math.abs(k) * 0.12, 'sardina', x + k * gap, -14, { k: 'line', vx: k * 6, vy }, fr);
      }
    },
    /** Medusas que bajan despacio, ondulando. */
    jellies(t, xs, { vy = 42, amp = 22, freq = 1.3, fr = F.fan(3, 0.4, 110, 1.9), dt = 0.25, hp = 1 } = {}) {
      xs.forEach((x, i) => add(t + i * dt, 'medusa', x, -16, { k: 'sine', vy, amp, freq, ph: i * 1.7 }, fr, { hp }));
    },
    /** Globos: se plantan, se inflan y revientan en un anillo si no se los rompe antes. */
    puffers(t, xs, { ty = 150, inf = 3.2, dt = 0.35, hold = 6 } = {}) {
      xs.forEach((x, i) => add(t + i * dt, 'globo', x, -18, { k: 'stop', tx: x, ty: ty + (i % 2) * 34, tin: 1.4, hold, oy: 70 }, null, { inf }));
    },
    /** Minas a la deriva: explotan solas al rato o al pasar la mitad de la pantalla. */
    mines(t, xs, { vy = 46, fuse = 6, dt = 0.3 } = {}) {
      xs.forEach((x, i) => add(t + i * dt, 'mina', x, -16, { k: 'sine', vy, amp: 7, freq: 1.1, ph: i }, null, { fuse }));
    },
    /** Anguila que cruza ondulando (el cuerpo sigue a la cabeza). */
    eel(t, side, y, { vx = 118, vy = 12, amp = 46, freq = 2.6, fr = F.fan(5, 0.75, 132, 1.0, { kind: 'drop', col: 'green' }) } = {}) {
      const s = side === 'L' ? 1 : -1;
      add(t, 'anguila', side === 'L' ? -36 : W + 36, y, { k: 'eel', vx: vx * s, vy, amp, freq }, fr);
    },
    /** Manta que cruza despacio disparando olas desde las alas. */
    manta(t, side, y, { vx = 46, vy = 14, fr = F.wave(7, 1.6, 92, 18, 5, 0.95), drop = null } = {}) {
      const s = side === 'L' ? 1 : -1;
      add(t, 'manta', side === 'L' ? -50 : W + 50, y, { k: 'line', vx: vx * s, vy }, fr, { drop });
    },
    /** Manta que baja al centro, se queda un rato y se va. */
    mantaStop(t, x, { ty = 140, hold = 7, fr = F.wave(9, 2, 95, 20, 5, 0.85), drop = null } = {}) {
      add(t, 'manta', x, -40, { k: 'stop', tx: x, ty, tin: 2, hold, ox: x < W / 2 ? -60 : 60, oy: -30 }, fr, { drop });
    },
    /** Nautilo: trae una cápsula (potencia o sonar), se planta y dispara filas. */
    nautilus(t, x, { drop = 'P', ty = 120, hold = 4.5, fr = F.stack(5, 0.8, 3, 105, 24, 1.35) } = {}) {
      add(t, 'nautilo', x, -24, { k: 'stop', tx: x, ty, tin: 1.6, hold, oy: -50, bob: 10 }, fr, { drop });
    },
    /** Señuelos de rape: una lucecita colgando en la oscuridad que larga flores de balas. */
    lures(t, xs, { ty = 150, hold = 5.5, fr = F.flower(10, 88, 1.1, 1.5), dt = 0.5 } = {}) {
      xs.forEach((x, i) => add(t + i * dt, 'senuelo', x, -20, { k: 'stop', tx: x, ty: ty + (i % 2) * 40, tin: 1.8, hold, oy: 60, bob: 14 }, fr));
    },
    /** Medusas que giran en ronda (pareja que baja dando vueltas). */
    swirl(t, cx, { rad = 60, w = 1.4, vy = 36, fr = F.aim(115, 1.6, { col: 'violet' }), n = 4 } = {}) {
      for (let i = 0; i < n; i++) add(t, 'medusa', cx, -60, { k: 'orbit', cx, rad, w, a0: (i * 2 * PI) / n, vy, sq: 0.55 }, fr);
    },
    warn(t, boss) {
      ev.push({ t, warn: boss });
    },
    boss(t, boss) {
      ev.push({ t, boss });
    },
  };
  fn(api);
  ev.sort((a, b) => a.t - b.t);
  return ev;
}

// ---------------------------------------------------------------- 1 · arrecife
const reef = build((s) => {
  const { F } = s;
  s.sardines(2, 'L', { y: 60 });
  s.sardines(4, 'R', { y: 92 });
  s.jellies(6.5, [100, 260], { fr: F.aim(105, 2.1) });
  s.column(9.5, 120);
  s.column(10.6, 240, { ph: PI });
  s.jellies(13, [60, 180, 300], { fr: F.aim(112, 1.9) });
  s.nautilus(16, 180, { drop: 'P', fr: F.fan(3, 0.42, 118, 1.5, { kind: 'rice', col: 'orange' }) });
  s.sardines(21, 'L', { n: 6, y: 50 });
  s.sardines(22, 'R', { n: 6, y: 84 });
  s.puffers(24.5, [110, 250]);
  s.jellies(29, [50, 130, 230, 310], { fr: F.ring(12, 80, 2.3, { kind: 'bub', col: 'cyan' }) });
  s.mines(33, [80, 180, 280]);
  s.vee(37, 180);
  s.nautilus(40, 90, { drop: 'P' });
  s.nautilus(40.6, 270, { drop: null });
  s.manta(46, 'L', 70, { drop: 'B' });
  s.puffers(52, [70, 180, 290]);
  s.sardines(55, 'L', { n: 7, y: 56, fr: F.aim(140, 9, { times: 1, delay: 0.9, col: 'yellow' }) });
  s.sardines(56.2, 'R', { n: 7, y: 96, fr: F.aim(140, 9, { times: 1, delay: 0.9, col: 'yellow' }) });
  s.jellies(59, [90, 170, 250], { fr: F.fan(5, 0.7, 118, 1.4) });
  s.column(63, 60);
  s.column(63.4, 300, { ph: PI });
  s.eel(66, 'R', 150, { fr: F.fan(3, 0.5, 125, 1.15, { kind: 'drop', col: 'green' }) });
  s.mines(70, [50, 130, 230, 310]);
  s.mines(72.5, [90, 180, 270]);
  s.nautilus(75, 180, { drop: 'P', fr: F.stack(7, 1.1, 3, 106, 24, 1.3) });
  s.jellies(79, [40, 120, 200, 280, 330], { fr: F.fan(3, 0.36, 118, 1.6) });
  s.puffers(84, [90, 270]);
  s.puffers(85.6, [180], { ty: 210 });
  s.manta(89, 'R', 60, { drop: 'P' });
  s.sardines(95, 'L', { n: 8, y: 40 });
  s.sardines(95, 'R', { n: 8, y: 110 });
  s.eel(99, 'L', 120);
  s.eel(101, 'R', 210);
  s.mines(106, [70, 180, 290]);
  s.puffers(107, [120, 240], { ty: 120 });
  s.nautilus(112, 120, { drop: 'B' });
  s.nautilus(112.8, 240, { drop: 'P' });
  s.swirl(117, 180);
  s.vee(122, 100);
  s.vee(123, 260);
  s.manta(126, 'L', 50);
  s.manta(127.5, 'R', 120);
  s.puffers(134, [60, 180, 300]);
  s.mines(135, [120, 240]);
  s.sardines(139, 'L', { n: 8, y: 50 });
  s.sardines(139.6, 'R', { n: 8, y: 90 });
  s.column(141, 180, { n: 8 });
  s.warn(146, 'pulpo');
  s.boss(150, 'pulpo');
});

// ---------------------------------------------------------------- 2 · bosque de algas
const kelp = build((s) => {
  const { F } = s;
  const leaf = { kind: 'drop', col: 'green' };
  s.eel(2, 'L', 80, { fr: F.fan(3, 0.5, 135, 1.1, leaf) });
  s.sardines(4, 'R', { n: 6, y: 70 });
  s.nautilus(6, 180, { drop: 'P', fr: F.stack(3, 0.5, 3, 112, 26, 1.4, { col: 'yellow' }) });
  s.jellies(10, [60, 150, 240, 330], { fr: F.fan(3, 0.4, 122, 1.6, { col: 'yellow' }) });
  s.eel(13, 'R', 140, { fr: F.fan(3, 0.5, 135, 1.1, leaf) });
  s.eel(15, 'L', 220, { fr: F.fan(3, 0.5, 135, 1.1, leaf) });
  s.puffers(18, [80, 180, 280]);
  s.column(22, 90, { fr: F.aim(150, 9, { times: 1, col: 'yellow' }) });
  s.column(22.5, 270, { ph: PI, fr: F.aim(150, 9, { times: 1, col: 'yellow' }) });
  s.mantaStop(25, 180, { drop: 'B', fr: F.wave(7, 1.6, 98, 20, 5, 1.0, { col: 'green' }) });
  s.mines(32, [60, 140, 220, 300]);
  s.eel(35, 'L', 60, { fr: F.fan(5, 0.8, 130, 1.2, leaf) });
  s.eel(35.6, 'R', 160, { fr: F.fan(5, 0.8, 130, 1.2, leaf) });
  s.jellies(39, [70, 145, 215, 290], { fr: F.fan(5, 0.7, 125, 1.4, { col: 'yellow' }) });
  s.puffers(43, [60, 140, 220, 300], { dt: 0.4 });
  s.nautilus(48, 100, { drop: 'P', fr: F.stack(3, 0.5, 3, 115, 26, 1.4, { col: 'yellow' }) });
  s.nautilus(48.6, 260, { drop: null, fr: F.stack(3, 0.5, 3, 115, 26, 1.4, { col: 'yellow' }) });
  s.sardines(53, 'L', { n: 8, y: 50 });
  s.sardines(53.3, 'R', { n: 8, y: 100 });
  s.eel(56, 'L', 60, { fr: F.fan(3, 0.5, 140, 1.0, leaf) });
  s.eel(57.2, 'R', 150, { fr: F.fan(3, 0.5, 140, 1.0, leaf) });
  s.eel(58.4, 'L', 240, { fr: F.fan(3, 0.5, 140, 1.0, leaf) });
  s.manta(62, 'L', 60, { drop: 'P', fr: F.wave(5, 1.3, 96, 18, 5, 1.1, { col: 'green' }) });
  s.manta(63.5, 'R', 120, { fr: F.wave(5, 1.3, 96, 18, 5, 1.1, { col: 'yellow' }) });
  s.mines(70, [80, 280]);
  s.puffers(71, [130, 230]);
  s.jellies(75, [90, 180, 270], { fr: F.spiral(3, 0.42, 92, 0.22, { col: 'yellow', delay: 1 }) });
  s.column(80, 50);
  s.column(80.5, 140, { ph: 1 });
  s.column(81, 220, { ph: 2 });
  s.column(81.5, 310, { ph: 3 });
  s.nautilus(84, 180, { drop: 'B', fr: F.stack(5, 0.9, 2, 112, 26, 1.3, { col: 'yellow' }) });
  s.eel(88, 'L', 50, { fr: F.fan(3, 0.5, 140, 1.0, leaf) });
  s.eel(89, 'R', 120, { fr: F.fan(3, 0.5, 140, 1.0, leaf) });
  s.eel(90, 'L', 190, { fr: F.fan(3, 0.5, 140, 1.0, leaf) });
  s.eel(91, 'R', 260, { fr: F.fan(3, 0.5, 140, 1.0, leaf) });
  s.puffers(95, [50, 120, 180, 240, 310], { dt: 0.3 });
  s.mantaStop(100, 180, { drop: 'P', fr: F.wave(9, 2, 100, 22, 5, 1.0, { col: 'green' }) });
  s.mines(107, [40, 110, 180, 250, 320], { vy: 52 });
  s.jellies(112, [60, 300], { fr: F.ring(16, 90, 1.8, { col: 'yellow', kind: 'bub' }) });
  s.sardines(113, 'L', { n: 8, y: 70 });
  s.eel(118, 'L', 70, { fr: F.fan(5, 0.8, 135, 1.2, leaf) });
  s.eel(118.5, 'R', 170, { fr: F.fan(5, 0.8, 135, 1.2, leaf) });
  s.puffers(120, [180], { ty: 200 });
  s.manta(124, 'L', 50, { fr: F.wave(5, 1.3, 98, 18, 5, 1.1, { col: 'green' }) });
  s.manta(124, 'R', 130, { drop: 'P', fr: F.wave(5, 1.3, 98, 18, 5, 1.1, { col: 'yellow' }) });
  s.nautilus(132, 110, { drop: null });
  s.nautilus(132.4, 250, { drop: 'B' });
  s.jellies(134, [60, 180, 300], { fr: F.fan(5, 0.6, 125, 1.4, { col: 'yellow' }) });
  s.sardines(138, 'L', { n: 9, y: 40 });
  s.sardines(138, 'R', { n: 9, y: 100 });
  s.mines(140, [90, 180, 270]);
  s.warn(146, 'rape');
  s.boss(150, 'rape');
});

// ---------------------------------------------------------------- 3 · la fosa
const trench = build((s) => {
  const { F } = s;
  const glow = { col: 'cyan' };
  s.jellies(2, [90, 270], { fr: F.aim(112, 1.9, glow) });
  s.lures(4, [180]);
  s.nautilus(7, 180, { drop: 'P', fr: F.stack(3, 0.5, 3, 115, 26, 1.4, { col: 'violet' }) });
  s.mines(11, [70, 180, 290]);
  s.lures(14, [90, 270], { fr: F.flower(8, 92, 1.1, 1.6, { col: 'cyan' }) });
  s.eel(18, 'L', 100, { fr: F.fan(3, 0.5, 140, 1.0, { kind: 'drop', col: 'blue' }) });
  s.eel(19.5, 'R', 180, { fr: F.fan(3, 0.5, 140, 1.0, { kind: 'drop', col: 'blue' }) });
  s.jellies(23, [50, 130, 230, 310], { fr: F.ring(14, 84, 2.0, { kind: 'bub', col: 'violet' }) });
  s.puffers(27, [80, 180, 280]);
  s.mantaStop(31, 180, { drop: 'B', fr: F.wave(7, 1.6, 100, 22, 5, 0.95, { col: 'blue' }) });
  s.lures(38, [60, 180, 300], { fr: F.flower(8, 92, 1.1, 1.8, { col: 'green' }) });
  s.mines(43, [40, 110, 180, 250, 320], { vy: 50 });
  s.eel(47, 'L', 60, { fr: F.fan(3, 0.5, 145, 1.0, { kind: 'drop', col: 'blue' }) });
  s.eel(48, 'R', 130, { fr: F.fan(3, 0.5, 145, 1.0, { kind: 'drop', col: 'blue' }) });
  s.eel(49, 'L', 200, { fr: F.fan(3, 0.5, 145, 1.0, { kind: 'drop', col: 'blue' }) });
  s.eel(50, 'R', 270, { fr: F.fan(3, 0.5, 145, 1.0, { kind: 'drop', col: 'blue' }) });
  s.nautilus(53, 100, { drop: 'P', fr: F.stack(3, 0.5, 3, 118, 26, 1.3, { col: 'violet' }) });
  s.nautilus(53.6, 260, { drop: null, fr: F.stack(3, 0.5, 3, 118, 26, 1.3, { col: 'violet' }) });
  s.jellies(58, [70, 290], { fr: F.fan(5, 0.6, 120, 1.3, glow) });
  s.sardines(58.5, 'L', { n: 8, y: 60 });
  s.sardines(59, 'R', { n: 8, y: 110 });
  s.lures(63, [120, 240]);
  s.puffers(64, [60, 300], { ty: 200 });
  s.manta(70, 'L', 60, { drop: 'P', fr: F.wave(5, 1.3, 100, 18, 5, 1.0, { col: 'violet' }) });
  s.manta(70, 'R', 130, { fr: F.wave(5, 1.3, 100, 18, 5, 1.0, { col: 'blue' }) });
  s.mines(78, [60, 140, 220, 300]);
  s.mines(80, [100, 180, 260]);
  s.lures(83, [180], { ty: 130, fr: F.flower(16, 95, 1.2, 1.2, { col: 'cyan' }) });
  s.eel(84, 'L', 220, { fr: F.fan(3, 0.5, 145, 1.0, { kind: 'drop', col: 'blue' }) });
  s.eel(85, 'R', 260, { fr: F.fan(3, 0.5, 145, 1.0, { kind: 'drop', col: 'blue' }) });
  s.swirl(90, 110, { fr: F.aim(122, 1.5, glow) });
  s.swirl(91.5, 250, { fr: F.aim(122, 1.5, glow) });
  s.puffers(95, [50, 120, 180, 240, 310], { dt: 0.3 });
  s.nautilus(100, 120, { drop: 'P', fr: F.stack(5, 0.9, 2, 115, 26, 1.3, { col: 'violet' }) });
  s.nautilus(100.6, 240, { drop: 'B', fr: F.stack(5, 0.9, 2, 115, 26, 1.3, { col: 'violet' }) });
  s.lures(106, [60, 180, 300], { fr: F.flower(10, 95, 1.1, 1.7, { col: 'green' }) });
  s.mines(108, [120, 240], { vy: 40 });
  s.eel(113, 'L', 50);
  s.eel(113.8, 'R', 120);
  s.eel(114.6, 'L', 190);
  s.eel(115.4, 'R', 260);
  s.mantaStop(120, 180, { drop: 'P', fr: F.wave(9, 2, 102, 22, 5, 0.95, { col: 'blue' }) });
  s.jellies(128, [50, 310], { fr: F.ring(18, 88, 1.7, { kind: 'bub', col: 'violet' }) });
  s.lures(129, [180], { ty: 120 });
  s.sardines(135, 'L', { n: 9, y: 50 });
  s.sardines(135.4, 'R', { n: 9, y: 110 });
  s.puffers(137, [90, 270]);
  s.mines(139, [180]);
  s.warn(146, 'leviatan');
  s.boss(150, 'leviatan');
});

export const STAGES = [
  { id: 'arrecife', events: reef, bossAt: 150, boss: 'pulpo' },
  { id: 'algas', events: kelp, bossAt: 150, boss: 'rape' },
  { id: 'fosa', events: trench, bossAt: 150, boss: 'leviatan' },
];
