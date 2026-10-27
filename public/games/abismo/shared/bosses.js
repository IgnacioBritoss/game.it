/**
 * Abismo — los tres jefes y sus fases con nombre. Cada fase tiene vida, tiempo límite y un programa de ataque
 * `atk(sim, boss, t, n)` que se llama en cada paso (t: segundos de la fase, n: número de paso). Los programas mueven
 * al jefe (boss.tx / boss.ty) y arman las balas con los patrones de patterns.js.
 *
 * Las puntas de los tentáculos del pulpo, el señuelo del rape y los anillos del leviatán son funciones puras del
 * estado: el dibujo (render.js) usa las mismas para que lo que dispara esté donde se ve.
 */
import { W, H, TAU } from './data.js';
import { ring, spread, stack, spiral, wave, flower, line, wall } from './patterns.js';

/** Pasos entre disparos (`s` segundos, más lento en fácil y más rápido en difícil). */
const per = (sim, s) => Math.max(1, Math.round(s * 60 * sim.D.rate));
/** ¿Toca disparar en este paso? */
const every = (sim, n, s, off = 0) => n >= off && (n - off) % per(sim, s) === 0;

// ---------------------------------------------------------------- pulpo gigante
/** Punta del tentáculo i (0..7) del pulpo: abanicados hacia abajo, ondulando. */
export function pulpoTip(b, i, t = b.clock) {
  const side = i < 4 ? -1 : 1;
  const k = i % 4; // 0 el de más afuera
  const a = Math.PI / 2 + side * (1.25 - k * 0.32) + Math.sin(t * 1.6 + i * 1.3) * 0.16;
  const len = 74 + k * 12 + Math.sin(t * 2.2 + i) * 8;
  return { x: b.x + Math.cos(a) * len, y: b.y + 8 + Math.sin(a) * len, a };
}

const pulpo = {
  name: { es: 'Pulpo gigante', en: 'Giant Octopus' },
  title: { es: 'el guardián del arrecife', en: 'guardian of the reef' },
  y: 138,
  size: 150,
  pts: 1000000,
  hit: [[0, -4, 32], [0, 26, 20]],
  phases: [
    {
      name: { es: 'Tinta en abanico', en: 'Ink Fan' },
      hp: 10000,
      time: 44,
      atk(sim, b, t, n) {
        b.tx = W / 2 + Math.sin(t * 0.6) * 92;
        b.ty = 132 + Math.sin(t * 1.1) * 10;
        if (every(sim, n, 0.85, 40)) spread(sim, b.x, b.y + 26, { n: 13, arc: 1.5, spd: 146, kind: 'drop', col: 'violet' });
        if (every(sim, n, 1.7, 90))
          for (const i of [1, 6]) {
            const p = pulpoTip(b, i);
            stack(sim, p.x, p.y, { n: 3, arc: 0.26, m: 4, spd: 106, dspd: 28, kind: 'rice', col: 'pink' });
          }
        if (every(sim, n, 2.3, 150)) ring(sim, b.x, b.y, { n: 20, spd: 78, kind: 'bub', col: 'cyan', a0: t });
      },
    },
    {
      name: { es: 'Remolino de ventosas', en: 'Sucker Whirlpool' },
      hp: 12000,
      time: 48,
      atk(sim, b, t, n) {
        b.tx = W / 2;
        b.ty = 150 + Math.sin(t * 0.8) * 12;
        if (n > 50 && every(sim, n, 0.08)) spiral(sim, b.x, b.y + 6, { arms: 6, rot: 0.19, k: b.vars.k1 = (b.vars.k1 || 0) + 1, spd: 116, kind: 'dot', col: 'pink' });
        if (n > 50 && every(sim, n, 0.22)) spiral(sim, b.x, b.y + 6, { arms: 4, rot: -0.31, k: b.vars.k2 = (b.vars.k2 || 0) + 1, spd: 88, kind: 'bub', col: 'cyan' });
        if (every(sim, n, 2.6, 120)) for (const i of [0, 7]) spread(sim, pulpoTip(b, i).x, pulpoTip(b, i).y, { n: 5, arc: 0.4, spd: 165, kind: 'rice', col: 'yellow' });
      },
    },
    {
      name: { es: 'Nube de tinta', en: 'Ink Cloud' },
      hp: 14000,
      time: 54,
      ink: 0.5,
      atk(sim, b, t, n) {
        if (every(sim, n, 3.1, 0)) {
          b.tx = 70 + sim.r() * (W - 140);
          b.ty = 120 + sim.r() * 50;
        }
        if (every(sim, n, 1.8, 30)) {
          ring(sim, b.x, b.y + 10, { n: 26, spd: 170, acc: -210, min: 0, kind: 'orb', col: 'violet', aim: true, reaim: { at: 1.3, spd: 30, acc: 150, max: 175, jit: 0.6 } });
          sim.emit('ink', { x: b.x, y: b.y + 10 });
        }
        if (every(sim, n, 0.5, 60)) {
          const p = pulpoTip(b, (n / per(sim, 0.5)) % 8 | 0);
          spread(sim, p.x, p.y, { n: 5, arc: 0.5, spd: 150, kind: 'rice', col: 'pink' });
        }
      },
    },
  ],
};

// ---------------------------------------------------------------- rape abisal
/** El señuelo cuelga delante de la boca y se mueve solo. */
export function rapeLure(b, t = b.clock) {
  return { x: b.x + Math.sin(t * 1.25) * 74, y: b.y + 78 + Math.sin(t * 2.05) * 26 };
}

const rape = {
  name: { es: 'Rape abisal', en: 'Abyssal Anglerfish' },
  title: { es: 'la luz que no hay que seguir', en: 'the light you must not follow' },
  y: 128,
  size: 160,
  pts: 1600000,
  hit: [[0, 0, 34], [0, 30, 18]],
  phases: [
    {
      name: { es: 'Señuelo', en: 'Lure' },
      hp: 11500,
      time: 46,
      atk(sim, b, t, n) {
        b.tx = W / 2 + Math.sin(t * 0.5) * 64;
        b.ty = 124;
        const l = rapeLure(b);
        if (n > 40 && every(sim, n, 0.09)) spiral(sim, l.x, l.y, { arms: 3, rot: 0.36, k: b.vars.k = (b.vars.k || 0) + 1, spd: 108, kind: 'dot', col: 'yellow' });
        if (every(sim, n, 1.25, 70)) spread(sim, b.x, b.y + 32, { n: 9, arc: 1.0, spd: 185, kind: 'needle', col: 'white' });
        if (every(sim, n, 2.6, 130)) ring(sim, l.x, l.y, { n: 22, spd: 70, kind: 'bub', col: 'orange', aim: true });
      },
    },
    {
      name: { es: 'Dientes de aguja', en: 'Needle Teeth' },
      hp: 13500,
      time: 50,
      atk(sim, b, t, n) {
        b.tx = W / 2 + Math.sin(t * 0.7) * 40;
        b.ty = 112;
        if (every(sim, n, 1.9, 40)) {
          const hole = (b.vars.h = ((b.vars.h ?? 0.5) + 0.27 + sim.r() * 0.46) % 1);
          wall(sim, -10, { n: 18, gap: 4, hole, spd: 118, kind: 'needle', col: 'white' });
        }
        if (every(sim, n, 1.0, 90)) {
          const y = b.y + 10;
          line(sim, 4, y, { n: 7, spd: 150, spd1: 255, kind: 'needle', col: 'cyan' });
          line(sim, W - 4, y, { n: 7, spd: 150, spd1: 255, kind: 'needle', col: 'cyan' });
        }
        if (every(sim, n, 0.45, 20)) spread(sim, b.x, b.y + 30, { n: 3, arc: 0.7, spd: 95, kind: 'dot', col: 'yellow', a0: Math.PI / 2 + Math.sin(t * 1.7) * 0.9 });
      },
    },
    {
      name: { es: 'Luz que engaña', en: 'Deceiving Light' },
      hp: 15500,
      time: 56,
      dark: 0.6,
      atk(sim, b, t, n) {
        const v = b.vars;
        // embestida: baja de golpe, revienta en agujas y vuelve
        const cyc = t % 4.2;
        if (cyc < 3) {
          b.tx = W / 2 + Math.sin(t * 0.55) * 80;
          b.ty = 120;
          b.ease = 0.05;
        } else if (cyc < 3.5) {
          b.ty = 260;
          b.ease = 0.09;
        } else b.ty = 120;
        if (cyc >= 3.45 && !v.lunged) {
          v.lunged = true;
          ring(sim, b.x, b.y + 20, { n: 32, spd: 145, kind: 'needle', col: 'white', aim: true });
          ring(sim, b.x, b.y + 20, { n: 16, spd: 95, kind: 'orb', col: 'yellow', aim: true, off: Math.PI / 16 });
          sim.emit('lunge', { x: b.x, y: b.y });
        }
        if (cyc < 1) v.lunged = false;
        const l = rapeLure(b);
        if (every(sim, n, 0.6, 30)) flower(sim, l.x, l.y, { n: 14, spd: 96, w: 0.95, wT: 1.8, kind: 'dot', col: 'green', a0: t * 0.7 });
      },
    },
  ],
};

// ---------------------------------------------------------------- leviatán
/** Los anillos del cuerpo del leviatán que asoman por los costados (para disparar desde ahí). */
export function leviCoil(b, side, t = b.clock) {
  return { x: side < 0 ? 26 : W - 26, y: 300 + Math.sin(t * 0.9 + (side < 0 ? 0 : Math.PI)) * 110 };
}

const leviatan = {
  name: { es: 'Leviatán', en: 'Leviathan' },
  title: { es: 'lo que duerme en el fondo', en: 'what sleeps at the bottom' },
  y: 118,
  size: 200,
  pts: 3000000,
  hit: [[0, 0, 38], [0, -36, 30]],
  phases: [
    {
      name: { es: 'Marea', en: 'Tide' },
      hp: 13000,
      time: 48,
      atk(sim, b, t, n) {
        b.tx = W / 2 + Math.sin(t * 0.45) * 70;
        b.ty = 116;
        if (every(sim, n, 0.36, 40)) wave(sim, b.x, b.y + 34, { n: 7, arc: 1.9, a0: Math.PI / 2, spd: 102, amp: 26, freq: 4, dph: 0.8, phase: n * 0.05, kind: 'bub', col: 'blue' });
        if (every(sim, n, 1.35, 100)) ring(sim, b.x, b.y + 30, { n: 22, spd: 138, kind: 'dot', col: 'cyan', aim: true });
      },
    },
    {
      name: { es: 'Espiral abisal', en: 'Abyssal Spiral' },
      hp: 15000,
      time: 52,
      atk(sim, b, t, n) {
        b.tx = W / 2;
        b.ty = 140;
        if (n > 50 && every(sim, n, 0.07)) spiral(sim, b.x, b.y + 20, { arms: 5, rot: 0.155, k: b.vars.a = (b.vars.a || 0) + 1, spd: 114, kind: 'rice', col: 'violet' });
        if (n > 50 && every(sim, n, 0.12)) spiral(sim, b.x, b.y + 20, { arms: 5, rot: -0.22, k: b.vars.c = (b.vars.c || 0) + 1, spd: 86, kind: 'dot', col: 'blue', a0: 0.4 });
      },
    },
    {
      name: { es: 'Ojo del abismo', en: 'Eye of the Abyss' },
      hp: 16000,
      time: 52,
      eye: 1,
      atk(sim, b, t, n) {
        b.tx = W / 2 + Math.sin(t * 0.8) * 50;
        b.ty = 120;
        if (every(sim, n, 1.4, 40)) stack(sim, b.x, b.y + 30, { n: 5, arc: 0.8, m: 6, spd: 110, dspd: 26, kind: 'rice', col: 'red', delay: 0.45 });
        if (every(sim, n, 2.4, 100)) ring(sim, b.x, b.y + 30, { n: 14, spd: 72, kind: 'orb', col: 'violet', aim: true, off: Math.PI / 14, split: { at: 1.5, n: 8, spd: 108, kind: 'dot', col: 'pink' } });
      },
    },
    {
      name: { es: 'Furia del leviatán', en: "Leviathan's Fury" },
      hp: 20000,
      time: 64,
      eye: 1,
      dark: 0.35,
      atk(sim, b, t, n) {
        b.tx = W / 2 + Math.sin(t * 0.35) * 40;
        b.ty = 124;
        if (n > 50 && every(sim, n, 0.09)) spiral(sim, b.x, b.y + 24, { arms: 6, rot: 0.14, k: b.vars.a = (b.vars.a || 0) + 1, spd: 104, kind: 'dot', col: 'cyan' });
        if (every(sim, n, 1.8, 80))
          for (const side of [-1, 1]) {
            const c = leviCoil(b, side);
            flower(sim, c.x, c.y, { n: 12, spd: 86, w: side * 0.75, wT: 2, kind: 'drop', col: 'violet', a0: side < 0 ? 0 : Math.PI });
          }
        if (every(sim, n, 1.3, 130)) spread(sim, b.x, b.y + 34, { n: 5, arc: 0.6, spd: 205, kind: 'needle', col: 'red' });
      },
    },
  ],
};

export const BOSSES = { pulpo, rape, leviatan };
export { H, TAU };
