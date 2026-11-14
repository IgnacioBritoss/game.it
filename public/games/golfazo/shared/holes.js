/**
 * Golfazo — los hoyos. Cada uno es una receta del constructor (build.js): el cursor arranca en el origen mirando a +z
 * y va dejando cancha. Las posiciones de obstáculos y zonas son relativas al cursor en el momento de llamarlos
 * (`f` adelante, `l` a la izquierda, `u` arriba), así que se ponen ANTES del tramo que los lleva.
 *
 * `par` sale de la prueba con el solucionador (tools/golfazo-solve.mjs): lo mejor que se encontró + 1.
 * Cada mundo es un tema (themes.js): Pradera, Bahía Coral, Glaciar y Volcán.
 */
import { buildHole, hill, bowl, mound, halfpipe } from './build.js';

const H = (id, es, en, par, build) => ({ id, name: { es, en }, par, build });

export const HOLE_LIST = [
  // ───────────────────────────── 1 · PRADERA ─────────────────────────────
  H('pradera-1', 'Primer Golpe', 'First Swing', 2, (b) => {
    b.width(3);
    b.tee({ f: 1.5 });
    b.lane(15);
    b.cup({ f: -2 });
  }),
  H('pradera-2', 'La Curva', 'The Bend', 3, (b) => {
    b.tee({ f: 1.2 });
    b.lane(6);
    b.arc(90, 3.2);
    b.lane(7);
    b.cup({ f: -1.6 });
  }),
  H('pradera-3', 'Lomita', 'Little Hill', 3, (b) => {
    b.width(3);
    b.tee({ f: 1.2 });
    b.lane(4);
    b.lane(7, { bump: hill(0.5) });
    b.patch('sand', { f: 3.4, l: 0.9, r: 0.95 });
    b.lane(5);
    b.cup({ f: -2 });
  }),
  H('pradera-4', 'El Molino', 'The Windmill', 3, (b) => {
    b.width(3);
    b.tee({ f: 1.2 });
    b.windmill({ f: 7, speed: 0.16, door: 1.0 });
    b.lane(16);
    b.cup({ f: -2 });
  }),
  H('pradera-5', 'La Laguna', 'The Pond', 3, (b) => {
    b.sea(-1.2, 'water');
    b.tee({ f: 1.2 });
    b.lane(5);
    b.lane(2, { w: 1.3 });
    b.lane(6, { surf: 'wood', walls: false });
    b.lane(2, { w: 3 });
    b.disc(2.8);
    b.cup();
  }),
  H('pradera-6', 'Gran Final', 'Grand Finale', 4, (b) => {
    b.tee({ f: 1.2 });
    b.lane(6);
    b.arc(-90, 3.2);
    b.lane(3);
    b.arc(90, 3.2);
    b.lane(2);
    b.lane(5, { dy: 1.0 });
    b.disc(3.2);
    b.cup();
    b.bumper({ f: 1.9, l: 0 });
    b.bumper({ f: -0.7, l: 1.9 });
    b.bumper({ f: -0.7, l: -1.9 });
  }),

  // ───────────────────────────── 2 · BAHÍA CORAL ─────────────────────────────
  H('bahia-1', 'El Muelle', 'The Pier', 2, (b) => {
    b.sea(-1.5, 'water');
    b.tee({ f: 1.5 });
    b.rect(4, 3.4, { surf: 'sand' });
    b.lane(1.2, { w: 1.6, surf: 'wood', walls: false });
    b.lane(15, { surf: 'wood', walls: false });
    b.disc(2.4, { surf: 'sand' });
    b.cup();
  }),
  H('bahia-2', 'La Balsa', 'The Raft', 3, (b) => {
    b.sea(-1.5, 'water');
    b.tee({ f: 1.2 });
    b.lane(4.5, { walls: { E: 'none' } });
    b.slider({ f: 1.2, w: 2.2, d: 2.2, h: 0.3, to: { f: 5.8 }, period: 8, hold: [0.2, 0.3, 0.2, 0.3], ride: true });
    b.gap(7);
    b.lane(4, { walls: { S: 'none' } });
    b.disc(2.6);
    b.cup();
  }),
  H('bahia-3', 'Cangrejos', 'Crabs', 3, (b) => {
    b.tee({ f: 1.2 });
    b.slider({ f: 5, l: -1.0, to: { l: 1.0 }, w: 0.8, d: 0.55, h: 0.4, period: 3, phase: 0, style: 'crab' });
    b.slider({ f: 9, l: 1.0, to: { l: -1.0 }, w: 0.8, d: 0.55, h: 0.4, period: 3, phase: 0.5, style: 'crab' });
    b.slider({ f: 13, l: -1.0, to: { l: 1.0 }, w: 0.8, d: 0.55, h: 0.4, period: 3, phase: 0.25, style: 'crab' });
    b.lane(18);
    b.cup({ f: -1.8 });
  }),
  H('bahia-4', 'El Arrecife', 'The Reef', 3, (b) => {
    b.tee({ f: 1.2 });
    b.lane(3);
    b.lane(2, { w: 7.5 });
    for (const [f, l] of [[2, -2.2], [2, 2.2], [4.2, 0], [6.2, -2.3], [6.2, 2.3], [4.2, -3.1], [4.2, 3.1]]) b.bumper({ f, l, r: 0.32 });
    b.rect(8, 7.5);
    b.lane(2, { w: 2.4 });
    b.lane(4);
    b.cup({ f: -1.5 });
  }),
  H('bahia-5', 'Los Tubos', 'The Pipes', 3, (b) => {
    b.sea(-1.5, 'water');
    b.tee({ f: 1.2 });
    b.lane(8);
    b.at(5.6, 2, 0, 0);
    b.lane(10);
    b.disc(2.4);
    b.cup();
    b.at(0, 0, 0, 0);
    b.portal({ f: 6.5, l: 0, r: 0.42 }, { f: 2.8, l: 5.6, rot: 0, vmin: 5, vmax: 5, time: 0.5 });
  }),
  H('bahia-6', 'La Isla', 'The Island', 4, (b) => {
    b.sea(-1.5, 'water');
    b.tee({ f: 1.2 });
    b.lane(6);
    b.boost({ f: -2, w: 1.4, d: 1.6, speed: 12.5 });
    b.lane(3, { dy: 0.9, ease: 'in', walls: { E: 'none' } });
    b.gap(5.2, { dy: -0.4 });
    b.lane(3, { walls: { S: 'none' } });
    b.disc(2.8);
    b.cup();
  }),

  // ───────────────────────────── 3 · GLACIAR ─────────────────────────────
  H('glaciar-1', 'El Tobogán', 'The Slide', 3, (b) => {
    b.surf = 'ice';
    b.tee({ f: 1.2 });
    b.lane(6);
    b.arc(-110, 3.2);
    b.lane(3);
    b.arc(110, 3.2);
    b.lane(5);
    b.disc(2.6, { surf: 'grass' });
    b.cup();
  }),
  H('glaciar-2', 'El Iglú', 'The Igloo', 3, (b) => {
    b.surf = 'ice';
    b.width(3.2);
    b.tee({ f: 1.2 });
    b.block({ f: 5, l: 0.8, w: 0.9, d: 0.9, h: 0.7, type: 'ice' });
    b.block({ f: 8, l: -0.8, w: 0.9, d: 0.9, h: 0.7, type: 'ice' });
    b.block({ f: 11, l: 0.7, w: 1.0, d: 1.0, h: 0.7, type: 'ice' });
    b.block({ f: 14, l: -0.9, w: 1.2, d: 0.9, h: 0.7, type: 'ice' });
    b.lane(17);
    b.lane(4, { surf: 'grass' });
    b.cup({ f: -2 });
  }),
  H('glaciar-3', 'Martillos', 'Hammers', 3, (b) => {
    b.width(3);
    b.tee({ f: 1.2 });
    b.hammer({ f: 7, speed: 0.35, amp: 50, phase: 0 });
    b.hammer({ f: 13, speed: 0.35, amp: 50, phase: 0.5 });
    b.lane(20);
    b.cup({ f: -2 });
  }),
  H('glaciar-4', 'El Trampolín', 'The Trampoline', 3, (b) => {
    b.sea(-1.5, 'water');
    b.tee({ f: 1.2 });
    b.lane(7, { walls: { E: 'none' } });
    b.spring({ f: -1.2, r: 0.5, up: 7, fwd: 1 });
    b.gap(9);
    b.lane(5, { walls: { S: 'none' }, surf: 'ice' });
    b.disc(2.8, { surf: 'grass' });
    b.cup();
  }),
  H('glaciar-5', 'La Cinta', 'The Conveyor', 4, (b) => {
    b.width(3);
    b.tee({ f: 1.2 });
    b.belt({ f: 5, w: 2.6, d: 3, rot: 90, speed: 2.6 });
    b.belt({ f: 10, w: 2.6, d: 3, rot: -90, speed: 2.6 });
    b.turntable({ f: 16, r: 1.5, speed: 0.22 });
    b.lane(20);
    b.cup({ f: -2 });
  }),
  H('glaciar-6', 'La Cima', 'The Summit', 4, (b) => {
    b.tee({ f: 1.2 });
    b.lane(4);
    b.lane(5, { dy: 0.9 });
    b.arc(180, 2.8);
    b.lane(4, { dy: 0.9 });
    b.arc(-180, 2.8);
    b.lane(4, { dy: 0.7 });
    b.disc(3.0);
    b.cup();
  }),

  // ───────────────────────────── 4 · VOLCÁN ─────────────────────────────
  H('volcan-1', 'La Boca', 'The Crater', 3, (b) => {
    b.width(3);
    b.tee({ f: 1.2 });
    b.pool('lava', { f: 6, l: -0.9, r: 1.0 });
    b.pool('lava', { f: 10, l: 0.9, r: 1.0 });
    b.lane(16);
    b.cup({ f: -2 });
  }),
  H('volcan-2', 'Compuertas', 'Gates', 3, (b) => {
    b.width(3);
    b.tee({ f: 1.2 });
    b.gate({ f: 6, period: 3.4, phase: 0, open: 0.45 });
    b.gate({ f: 10, period: 3.4, phase: 0.35, open: 0.45 });
    b.gate({ f: 14, period: 3.4, phase: 0.7, open: 0.45 });
    b.lane(19);
    b.cup({ f: -2 });
  }),
  H('volcan-3', 'El Rulo', 'The Loop', 3, (b) => {
    b.sea(-1.5, 'lava');
    b.tee({ f: 1.2 });
    b.lane(5);
    b.lane(2.5, { w: 0.7 });
    b.lane(2);
    b.boost({ f: -1.2, w: 0.7, d: 1.2, speed: 13 });
    b.loop(1.2);
    b.lane(2);
    b.lane(2.5, { w: 2.4 });
    b.lane(5);
    b.cup({ f: -1.5 });
  }),
  H('volcan-4', 'Péndulos', 'Pendulums', 3, (b) => {
    b.sea(-1.5, 'lava');
    b.width(3.2);
    b.tee({ f: 1.2 });
    b.spinner({ f: 6, len: 2.8, arms: 2, speed: 0.22 });
    b.spinner({ f: 11, len: 2.8, arms: 2, speed: -0.3, phase: 0.25 });
    b.spinner({ f: 16, len: 2.8, arms: 4, speed: 0.18 });
    b.lane(21);
    b.cup({ f: -2 });
  }),
  H('volcan-5', 'El Cañón', 'The Cannon', 3, (b) => {
    b.sea(-1.5, 'lava');
    b.tee({ f: 1.2 });
    b.lane(7);
    b.at(0, 15, 0, 2.2);
    b.width(3.2);
    b.lane(6);
    b.disc(2.8);
    b.cup();
    b.at(0, 0, 0, 0);
    b.portal({ f: 3.6, l: 0, r: 0.5 }, { f: 6.4, l: 0, rot: 0, pitch: 50, vmin: 13, vmax: 13, time: 0.45 });
  }),
  H('volcan-6', 'Magma', 'Magma', 5, (b) => {
    b.sea(-1.5, 'lava');
    b.tee({ f: 1.2 });
    b.lane(5);
    b.boost({ f: -1.6, w: 1.4, d: 1.6, speed: 12.5 });
    b.lane(3, { dy: 0.9, ease: 'in', walls: { E: 'none' } });
    b.gap(5, { dy: -0.4 });
    b.rect(8, 4.2);
    b.spinner({ f: -4, len: 3.4, arms: 2, speed: 0.2 });
    b.lane(2, { w: 2.4 });
    b.lane(4);
    b.disc(2.8, { height: bowl(0.35) });
    b.cup();
  }),
];

export const HOLES = Object.fromEntries(HOLE_LIST.map((h) => [h.id, h]));

/** Los mundos, en orden. `theme` es la clave de themes.js. */
export const WORLDS = [
  { id: 'pradera', theme: 'pradera', holes: ['pradera-1', 'pradera-2', 'pradera-3', 'pradera-4', 'pradera-5', 'pradera-6'] },
  { id: 'bahia', theme: 'bahia', holes: ['bahia-1', 'bahia-2', 'bahia-3', 'bahia-4', 'bahia-5', 'bahia-6'] },
  { id: 'glaciar', theme: 'glaciar', holes: ['glaciar-1', 'glaciar-2', 'glaciar-3', 'glaciar-4', 'glaciar-5', 'glaciar-6'] },
  { id: 'volcan', theme: 'volcan', holes: ['volcan-1', 'volcan-2', 'volcan-3', 'volcan-4', 'volcan-5', 'volcan-6'] },
];
export const WORLD_IDS = WORLDS.map((w) => w.id);
export const worldOf = (holeId) => WORLDS.find((w) => w.holes.includes(holeId));

/** Recorridos para jugar: un mundo entero, "Gira" (los 4 mundos, 2 hoyos de cada uno) o la mezcla de 9. */
export function courseHoles(course) {
  const w = WORLDS.find((x) => x.id === course);
  if (w) return [...w.holes];
  if (course === 'gira') return WORLDS.flatMap((x) => [x.holes[1], x.holes[4]]);
  if (course === 'todos') return WORLDS.flatMap((x) => x.holes);
  return [...WORLDS[0].holes];
}
export const COURSE_IDS = [...WORLD_IDS, 'gira', 'todos'];

const cache = new Map();
/** Arma (y guarda) el mundo físico de un hoyo. `vis` agrega lo necesario para dibujarlo (el servidor no lo pide). */
export function holeWorld(id, vis = false) {
  const key = `${id}:${vis ? 1 : 0}`;
  let w = cache.get(key);
  if (!w) {
    const def = HOLES[id];
    if (!def) throw new Error(`hoyo desconocido: ${id}`);
    w = buildHole(def, { vis });
    w.id = id;
    w.world = worldOf(id)?.id;
    cache.set(key, w);
  }
  return w;
}

/** Los mundos con estado (movers, tiempos) no se pueden compartir entre partidas simultáneas del mismo proceso: copia limpia. */
export function freshHole(id, vis = false) {
  const def = HOLES[id];
  if (!def) throw new Error(`hoyo desconocido: ${id}`);
  const w = buildHole(def, { vis });
  w.id = id;
  w.world = worldOf(id)?.id;
  return w;
}

export { hill, bowl, mound, halfpipe };
