/** Prisma: óptica (espejos, divisores, prismas, filtros, portales y mezclas), jugadas, niveles con su mínimo, pistas y la luz del día. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, trace, Game, replay, solText, reflect, COLORS } from '../public/games/prisma/shared/optics.js';
import { solve, hint, distance } from '../public/games/prisma/shared/solver.js';
import { CHAPTERS, LEVELS, ALL } from '../public/games/prisma/shared/levels.js';
import { dailyLevel, FALLBACK, RECIPES, weekday } from '../public/games/prisma/shared/generator.js';

/** Traza un nivel tal como está y devuelve lo que le llega a cada cristal. */
function hits(map, tray = []) {
  const b = parse({ map, tray });
  const at = new Int16Array(b.n * b.n).fill(-1);
  for (const p of b.pieces) if (p.cell >= 0) at[p.cell] = p.id;
  return [...trace(b, at, b.pieces).hit];
}

test('espejos de dos caras: / y \\ reflejan desde los cuatro lados', () => {
  // 0 este, 1 sur, 2 oeste, 3 norte
  assert.deepEqual([0, 1, 2, 3].map((d) => reflect(d, 0)), [3, 2, 1, 0]);
  assert.deepEqual([0, 1, 2, 3].map((d) => reflect(d, 1)), [1, 0, 3, 2]);
  assert.deepEqual(hits(['.. .. *r .. ..', '.. .. .. .. ..', '>r .. M0 .. ..', '.. .. .. .. ..', '.. .. .. .. ..']), [1]);
  assert.deepEqual(hits(['.. .. .. .. ..', '.. .. .. .. ..', '>r .. M1 .. ..', '.. .. .. .. ..', '.. .. *r .. ..']), [1]);
  // de atrás también refleja
  assert.deepEqual(hits(['.. .. .. .. ..', '.. .. .. .. ..', '.. .. M0 .. <b', '.. .. .. .. ..', '.. .. *b .. ..']), [4]);
});

test('divisor: deja pasar y además refleja; los rayos se cruzan sin molestarse', () => {
  assert.deepEqual(hits(['.. .. *r .. ..', '.. .. .. .. ..', '>r .. S0 .. *r', '.. .. .. .. ..', '.. .. .. .. ..']), [1, 1]);
  assert.deepEqual(hits(['.. .. vg .. ..', '.. .. .. .. ..', '>r .. .. .. *r', '.. .. .. .. ..', '.. .. *g .. ..']), [1, 2]);
});

test('prisma: el blanco entra por la base y sale rojo a la izquierda, verde derecho y azul a la derecha; de costado bloquea', () => {
  assert.deepEqual(hits(['.. .. *r .. ..', '.. .. .. .. ..', '>w .. P0 .. *g', '.. .. .. .. ..', '.. .. *b .. ..']), [1, 2, 4]);
  // apuntando al sur, la luz que viene del oeste choca contra un costado
  assert.deepEqual(hits(['.. .. *r .. ..', '.. .. .. .. ..', '>w .. P1 .. *g', '.. .. .. .. ..', '.. .. *b .. ..']), [0, 0, 0]);
  // un rayo rojo solo, siempre dobla a la izquierda
  assert.deepEqual(hits(['.. .. *r .. ..', '.. .. .. .. ..', '>r .. P0 .. *g', '.. .. .. .. ..', '.. .. *b .. ..']), [1, 0, 0]);
});

test('filtros y mezclas: el filtro deja pasar su color y la luz se suma en los cristales', () => {
  assert.deepEqual(hits(['.. .. .. .. ..', '>w .. Fr .. *r', '.. .. .. .. ..', '.. .. .. .. ..', '.. .. .. .. ..']), [1]);
  assert.deepEqual(hits(['.. .. .. .. ..', '>b .. Fr .. *b', '.. .. .. .. ..', '.. .. .. .. ..', '.. .. .. .. ..']), [0]);
  assert.deepEqual(hits(['.. .. .. .. ..', '>w .. Fy .. *y', '.. .. .. .. ..', '.. .. .. .. ..', '.. .. .. .. ..']), [3]);
  // rojo + verde = amarillo, los tres = blanco
  assert.deepEqual(hits(['.. .. vg .. ..', '.. .. .. .. ..', '>r .. *y .. ..', '.. .. .. .. ..', '.. .. .. .. ..']), [3]);
  assert.deepEqual(hits(['.. .. vg .. ..', '.. .. .. .. ..', '>r .. *w .. <b', '.. .. .. .. ..', '.. .. .. .. ..']), [7]);
  assert.equal(COLORS.m, 5);
  assert.equal(COLORS.c, 6);
});

test('portales y rayos en círculo: el portal mantiene la dirección y las vueltas terminan', () => {
  assert.deepEqual(hits(['.. .. .. .. ..', '>r .. Oa .. ..', '.. .. .. .. ..', '.. .. Oa .. *r', '.. .. .. .. ..']), [1]);
  // un divisor manda luz a un circuito de espejos que vuelve sobre sí mismo
  const loop = ['.. .. .. .. .. ..', '.. M0 .. .. M1 ..', '.. .. .. .. .. ..', '>r S0 .. .. M0 ..', '.. .. .. .. .. ..', '.. *r .. .. .. ..'];
  assert.deepEqual(hits(loop), [1]);
  assert.throws(() => parse({ map: ['.. .. ..', '.. .. ..', '.. .. ..'] }), /5 a 9/);
  assert.throws(() => parse({ map: ['>r .. .. .. ..', '.. .. .. .. ..', '.. .. Oa .. ..', '.. .. .. .. ..', '.. .. .. .. *r'] }), /dos bocas/);
});

test('partida: girar, poner, sacar, deshacer y reiniciar cuentan jugadas', () => {
  const lv = { map: ['.. .. .. .. ..', '.. .. .. .. *r', '.. .. .. .. ..', '>r .. m1 .. ..', '.. .. .. .. ..'], tray: ['m1'] };
  const g = new Game(lv);
  const tray = g.pieces.find((p) => p.mode === 'move');
  const mirror = g.pieces.find((p) => p.mode === 'rot');
  assert.equal(g.won(), false);
  assert.ok(g.turn(mirror.id, 1));
  assert.equal(mirror.o, 0);
  assert.equal(g.canDrop(tray.id, 3 * 5 + 2), false, 'no se puede poner encima de otra pieza');
  assert.equal(g.canDrop(tray.id, 3 * 5), false, 'ni sobre un emisor');
  assert.ok(g.place(tray.id, 1 * 5 + 2));
  assert.ok(g.turn(tray.id, -1));
  assert.equal(g.moves, 3);
  assert.equal(g.won(), true);
  assert.ok(g.place(tray.id, -1), 'de vuelta a la bandeja');
  assert.equal(g.won(), false);
  g.undo();
  assert.equal(g.won(), true);
  g.reset();
  assert.equal(g.moves, 0);
  assert.equal(mirror.o, 1);
  assert.equal(tray.cell, -1);
  const fixed = new Game({ map: ['>r .. M0 .. ..', '.. .. .. .. ..', '.. .. .. .. ..', '.. .. .. .. ..', '.. .. *r .. ..'] });
  assert.equal(fixed.turn(0, 1), false, 'las atornilladas no giran');
});

test('niveles: 5 capítulos de 8, cada uno se resuelve con su solución en `par` jugadas', () => {
  assert.equal(CHAPTERS.length, 5);
  for (const c of CHAPTERS) assert.equal(LEVELS[c.id].length, 8, `capítulo ${c.id}`);
  assert.equal(ALL.length, 40);
  const keys = new Set();
  for (const lv of ALL) {
    assert.ok(!keys.has(lv.key));
    keys.add(lv.key);
    assert.ok(lv.name?.es && lv.name?.en, `${lv.key}: nombre en los dos idiomas`);
    const g0 = new Game(lv);
    assert.equal(g0.won(), false, `${lv.key} no empieza resuelto`);
    const g = replay(lv, lv.sol);
    assert.equal(g.won(), true, `${lv.key}: la solución guardada enciende todo`);
    assert.equal(g.moves, lv.par, `${lv.key}: la solución usa exactamente el mínimo`);
    // la luz del capítulo: antes de "mezclas" ningún cristal pide una mezcla que no venga de un emisor
    const ci = CHAPTERS.findIndex((c) => c.id === lv.chapter);
    if (ci < 3) {
      const b = parse(lv);
      const ok = new Set(b.emitters.map((e) => e.color).flatMap((c) => (c === 7 ? [1, 2, 4, 7] : [c])));
      for (const t of b.targets) assert.ok(ok.has(t.color), `${lv.key}: cristal de un color sin mezclar`);
    }
  }
  // los mínimos crecen de a poco dentro de cada capítulo (el primero de cada uno es fácil)
  for (const c of CHAPTERS) assert.ok(LEVELS[c.id][0].par <= 2, `${c.id}: el primero es para aprender`);
});

test('niveles: no hay soluciones más cortas que el mínimo (búsqueda completa)', () => {
  for (const lv of ALL) {
    const r = solve(lv, { bound: lv.par, maxNodes: 3e6 });
    assert.equal(r.complete, true, `${lv.key}: la búsqueda terminó`);
    assert.equal(r.cost, null, `${lv.key}: no se puede en menos de ${lv.par}`);
  }
});

test('resolvedor y pistas: el costo es la distancia y la pista acerca a la solución', () => {
  const lv = ALL.find((l) => l.key === 'espejos-7');
  const r = solve(lv);
  assert.equal(r.complete, true);
  assert.equal(r.cost, lv.par);
  const g = new Game(lv);
  assert.equal(distance(lv, g.config(), r.cfg), lv.par);
  // pista desde el comienzo: una pieza que hay que cambiar
  const h = hint(lv, g.config());
  assert.ok(h && h.id >= 0);
  const p = g.pieces[h.id];
  assert.notEqual(p.mode, 'fixed');
  // seguir pistas resuelve el nivel
  for (let i = 0; i < 12 && !g.won(); i++) {
    const k = hint(lv, g.config());
    const q = g.pieces[k.id];
    if (q.cell !== k.cell) g.place(k.id, k.cell);
    else g.turn(k.id, 1);
  }
  assert.equal(g.won(), true);
  // solText y replay son inversas
  assert.equal(replay(lv, solText(lv, r.cfg)).won(), true);
});

test('luz del día: igual para todos en la misma fecha, distinta cada día y siempre con solución', () => {
  const a = dailyLevel('2026-10-20');
  const b = dailyLevel('2026-10-20');
  assert.deepEqual(a, b);
  const seen = new Set();
  for (let d = 20; d <= 26; d++) {
    const date = `2026-10-${d}`;
    const lv = dailyLevel(date);
    assert.ok(lv.attempt >= 0, `${date}: no usó el de repuesto`);
    seen.add(lv.map.join('/'));
    const g = replay(lv, lv.sol);
    assert.equal(g.won(), true, `${date}: la solución enciende todo`);
    assert.equal(g.moves, lv.par);
    assert.ok(lv.par >= RECIPES[weekday(date)].minPar, `${date}: tiene su dificultad`);
    assert.equal(new Game(lv).won(), false);
  }
  assert.equal(seen.size, 7);
  assert.equal(weekday('2026-10-19'), 0, 'el 19/10/2026 es lunes');
  // el de repuesto también se resuelve con su mínimo
  const g = replay(FALLBACK, FALLBACK.sol);
  assert.equal(g.won(), true);
  assert.equal(g.moves, FALLBACK.par);
  assert.equal(solve(FALLBACK, { bound: FALLBACK.par }).cost, null);
});
