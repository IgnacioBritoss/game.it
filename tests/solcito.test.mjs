/** Solcito: reglas de empujar (hielo, túneles, cajas grandes con dos gatos), deshacer y que cada nivel tenga solución con su mínimo. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Puzzle, replay, solve, parse } from '../public/games/solcito/shared/rules.js';
import { ROOMS, LEVELS, ALL } from '../public/games/solcito/shared/levels.js';

const lv = (...map) => ({ map });

test('empujar: una caja sí, dos seguidas no, contra la pared no; deshacer vuelve atrás', () => {
  const P = new Puzzle(lv('#######', '#c oo #', '#######'));
  assert.equal(P.move(0, 'R').ok, true); // camina
  const r = P.move(0, 'R'); // dos cajas seguidas
  assert.equal(r.ok, false);
  assert.equal(P.moves, 1);
  const Q = new Puzzle(lv('#####', '#co #', '#####'));
  assert.equal(Q.move(0, 'R').ok, true);
  assert.equal(Q.move(0, 'R').ok, false, 'la caja contra la pared');
  assert.equal(Q.move(0, 'L').ok, true);
  assert.equal(Q.moves, 2);
  assert.ok(Q.undo() && Q.undo());
  assert.equal(Q.moves, 0);
  assert.deepEqual(Q.s.boxes, Q.m.start.boxes);
  assert.equal(Q.undo(), false);
});

test('hielo: la caja y el gato se resbalan hasta chocar o llegar a piso firme', () => {
  const P = new Puzzle(lv('#########', '#co~~~ .#', '#########'));
  const r = P.move(0, 'R');
  assert.ok(r.ok);
  const w = P.w;
  // la caja cruzó el hielo y paró en el primer piso firme
  assert.equal(P.s.boxes[0], 1 * w + 6);
  assert.equal(r.moved[0].path.length, 4);
  // el gato que empuja no se resbala; el que camina sí
  assert.equal(P.s.cats[0], 1 * w + 2);
  P.move(0, 'R');
  assert.equal(P.s.cats[0], 1 * w + 5, 'el gato se resbaló hasta la caja');
});

test('túneles: lo que entra por una boca sale por la otra, un paso más allá', () => {
  const P = new Puzzle(lv('#########', '#   #   #', '#c oA a.#', '#   #   #', '#########'));
  P.move(0, 'R');
  const r = P.move(0, 'R');
  assert.ok(r.ok && r.won);
  assert.equal(r.moved[0].path[0].via, 2 * P.w + 4, 'pasó por la boca A');
  // el gato también puede cruzar caminando
  const Q = new Puzzle(lv('#########', '#   #   #', '#c  A a #', '#   #   #', '#########'));
  Q.move(0, 'R');
  Q.move(0, 'R');
  Q.move(0, 'R');
  assert.equal(Q.s.cats[0], 2 * Q.w + 7);
});

test('cajas grandes: solo se mueven con los dos gatos empujando del mismo lado', () => {
  const P = new Puzzle(lv('#########', '#c      #', '# XX  ..#', '# XX  ..#', '#k      #', '#########'));
  const w = P.w;
  // un gato solo no puede
  P.move(0, 'D');
  const r = P.move(0, 'R');
  assert.equal(r.ok, false);
  assert.equal(r.needTwo, true);
  // con los dos atrás, sí: se mueven la caja y los dos gatos
  P.move(1, 'U');
  const r2 = P.move(0, 'R');
  assert.ok(r2.ok);
  assert.equal(P.s.bigs[0], 2 * w + 3);
  assert.deepEqual([...P.s.cats].sort((a, b) => a - b), [2 * w + 2, 3 * w + 2]);
  P.move(0, 'R');
  P.move(0, 'R');
  assert.equal(P.move(0, 'R').won, true);
});

test('cada nivel se resuelve con su solución en exactamente el mínimo de movidas', () => {
  assert.equal(ALL.length, ROOMS.reduce((a, r) => a + LEVELS[r.id].length, 0));
  for (const l of ALL) {
    parse(l); // bien formado
    const P = replay(l, l.sol);
    assert.ok(P.won(), `${l.key}: la solución gana`);
    assert.equal(P.moves, l.par, `${l.key}: movidas de la solución`);
    assert.ok(!new Puzzle(l).won(), `${l.key}: no empieza resuelto`);
    assert.ok(l.name.es && l.name.en);
  }
});

test('el mínimo es de verdad el mínimo (búsqueda a lo ancho en los niveles chicos)', () => {
  const quick = ALL.filter((l) => l.room !== 'desafios' && !['mudanza-4', 'mudanza-5'].includes(l.key));
  for (const l of quick) {
    const r = solve(l, 2e5);
    assert.ok(r, `${l.key}: tiene solución`);
    assert.equal(r.moves, l.par, `${l.key}: mínimo`);
  }
});
