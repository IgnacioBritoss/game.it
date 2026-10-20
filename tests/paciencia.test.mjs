/** Paciencia: repartos, reglas de Klondike, Spider y FreeCell, robar, escaleras completas, terminar solo y los resolvedores. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deal, dealFreecell, canMove, apply, draw, canDraw, legalMoves, won, safeAuto, canFinish, finishMove, hint, bestFrom, clone, capacity, RANKS } from '../public/games/paciencia/shared/rules.js';
import { solveKlondike, solveFreecell } from '../public/games/paciencia/shared/solver.js';

const card = (s, r, up = true, id = s * 13 + r) => ({ id, s, r, up });
const name = (c) => RANKS[c.r] + 'SHDC'[c.s];

test('repartos: Klondike de 52, Spider de 104 con sus palos y FreeCell igual al de Microsoft', () => {
  const k = deal('klondike', { draw: 1 }, 42);
  assert.deepEqual(k.tab.map((p) => p.length), [1, 2, 3, 4, 5, 6, 7]);
  assert.ok(k.tab.every((p) => p[p.length - 1].up && p.slice(0, -1).every((c) => !c.up)));
  assert.equal(k.stock.length, 24);
  const ids = new Set([...k.tab.flat(), ...k.stock].map((c) => c.id));
  assert.equal(ids.size, 52);
  assert.deepEqual(deal('klondike', { draw: 1 }, 42), k, 'misma semilla, mismo reparto');
  for (const suits of [1, 2, 4]) {
    const s = deal('spider', { suits }, 7);
    const all = [...s.tab.flat(), ...s.stock];
    assert.equal(all.length, 104);
    assert.equal(s.stock.length, 50);
    assert.equal(new Set(all.map((c) => c.s)).size, suits);
    for (let r = 1; r <= 13; r++) assert.equal(all.filter((c) => c.r === r).length, 8);
  }
  // la partida 1 de FreeCell empieza JD 2D 9H JC 5D 7H 7C 5H
  const f = dealFreecell(1);
  assert.equal(f.tab.map((p) => name(p[0])).join(' '), 'JD 2D 9H JC 5D 7H 7C 5H');
  assert.deepEqual(f.tab.map((p) => p.length), [7, 7, 7, 7, 6, 6, 6, 6]);
});

test('Klondike: alternar colores, rey a columna vacía, robar de a 1 y de a 3 y dar vuelta el pozo', () => {
  const st = deal('klondike', { draw: 3 }, 1);
  st.tab = [[card(0, 13)], [card(1, 12)], [card(0, 11)], [], [card(2, 5, false), card(3, 9)], [card(1, 8)], [card(0, 1)]];
  assert.ok(canMove(st, { from: { p: 'tab', i: 1, k: 0 }, to: { p: 'tab', i: 0 } }), 'Q♥ sobre K♠');
  assert.ok(canMove(st, { from: { p: 'tab', i: 2, k: 0 }, to: { p: 'tab', i: 1 } }), 'J♠ sobre Q♥');
  assert.ok(!canMove(st, { from: { p: 'tab', i: 5, k: 0 }, to: { p: 'tab', i: 2 } }), '8♥ no va sobre J♠');
  assert.ok(canMove(st, { from: { p: 'tab', i: 0, k: 0 }, to: { p: 'tab', i: 3 } }), 'rey a la vacía');
  assert.ok(!canMove(st, { from: { p: 'tab', i: 5, k: 0 }, to: { p: 'tab', i: 3 } }), 'solo reyes a la vacía');
  assert.ok(canMove(st, { from: { p: 'tab', i: 6, k: 0 }, to: { p: 'found', i: 0 } }));
  const info = apply(st, { from: { p: 'tab', i: 4, k: 1 }, to: { p: 'tab', i: 5 } });
  assert.ok(info.flipped && st.tab[4][0].up, 'se da vuelta la carta tapada');
  // robar de a 3 y dar vuelta el pozo
  const d = deal('klondike', { draw: 3 }, 9);
  draw(d);
  assert.equal(d.waste.length, 3);
  while (d.stock.length) draw(d);
  assert.equal(d.waste.length, 24);
  draw(d);
  assert.equal(d.stock.length, 24);
  assert.equal(d.passes, 1);
  assert.ok(d.stock.every((c) => !c.up));
});

test('Spider: escaleras del mismo palo, repartir con columnas ocupadas y escalera completa que sale sola', () => {
  const st = deal('spider', { suits: 2 }, 3);
  st.tab = st.tab.map(() => []);
  st.tab[0] = [card(0, 9), card(0, 8, true, 200), card(1, 7, true, 201)];
  st.tab[1] = [card(1, 9, true, 202)];
  assert.ok(!canMove(st, { from: { p: 'tab', i: 0, k: 1 }, to: { p: 'tab', i: 1 } }), '8♠ 7♥ no es escalera del mismo palo');
  assert.ok(canMove(st, { from: { p: 'tab', i: 0, k: 2 }, to: { p: 'tab', i: 2 } }), 'a una columna vacía');
  assert.equal(canDraw(st), false, 'con columnas vacías no se reparte');
  // escalera completa
  const s2 = deal('spider', { suits: 1 }, 4);
  const run = [];
  for (let r = 13; r >= 2; r--) run.push(card(0, r, true, 300 + r));
  s2.tab[0] = [card(0, 5, false, 400), ...run];
  s2.tab[1] = [card(0, 1, true, 301)];
  const info = apply(s2, { from: { p: 'tab', i: 1, k: 0 }, to: { p: 'tab', i: 0 } });
  assert.deepEqual(info.completed, [0]);
  assert.equal(s2.found.length, 1);
  assert.equal(s2.found[0].length, 13);
  assert.equal(s2.tab[0].length, 1);
  assert.ok(s2.tab[0][0].up, 'la de abajo se da vuelta');
  assert.equal(s2.score, 500 - 1 + 100);
});

test('FreeCell: celdas, capacidad para mover escaleras y nada de bases a la mesa', () => {
  const st = dealFreecell(5);
  st.tab = [[card(0, 9), card(1, 8), card(0, 7), card(2, 6)], [card(1, 10)], [], [], [card(1, 1)], [card(0, 2)], [card(2, 13)], [card(1, 12)]];
  st.cells = [card(3, 4, true, 900), card(3, 5, true, 901), null, null];
  assert.equal(capacity(st), (2 + 1) * 2 ** 2);
  assert.equal(capacity(st, true), (2 + 1) * 2);
  assert.ok(canMove(st, { from: { p: 'tab', i: 0, k: 0 }, to: { p: 'tab', i: 1 } }), '4 cartas con 2 celdas y 2 columnas libres');
  st.cells = [card(3, 4, true, 900), card(3, 5, true, 901), card(3, 6, true, 902), card(3, 3, true, 903)];
  st.tab[2] = [card(3, 8)];
  st.tab[3] = [card(3, 7)];
  assert.equal(capacity(st), 1);
  assert.ok(!canMove(st, { from: { p: 'tab', i: 0, k: 0 }, to: { p: 'tab', i: 1 } }), 'sin lugar no se mueven 4');
  assert.ok(!canMove(st, { from: { p: 'cell', i: 0 }, to: { p: 'cell', i: 1 } }));
  st.found[1] = [card(1, 1)];
  assert.ok(!canMove(st, { from: { p: 'found', i: 1 }, to: { p: 'tab', i: 0 } }), 'en FreeCell las bases no vuelven');
});

test('subir solas: ases y dos siempre; las demás cuando ya no hacen falta', () => {
  const st = dealFreecell(2);
  st.tab = st.tab.map(() => []);
  st.cells = [null, null, null, null];
  st.tab[0] = [card(1, 1)];
  assert.ok(safeAuto(st), 'el as sube');
  apply(st, safeAuto(st));
  st.tab[0] = [card(1, 3)];
  st.found[1].push(card(1, 2));
  assert.equal(safeAuto(st), null, 'el 3♥ espera a los 2 negros');
  st.found[0] = [card(0, 1), card(0, 2)];
  st.found[3] = [card(3, 1), card(3, 2)];
  assert.ok(safeAuto(st));
});

test('terminar solo: con todo ordenado se gana carta por carta', () => {
  const st = deal('klondike', { draw: 1 }, 5);
  st.stock = [];
  st.waste = [];
  st.found = [[], [], [], []];
  st.tab = [[], [], [], [], [], [], []];
  for (let s = 0; s < 4; s++) for (let r = 13; r >= 1; r--) st.tab[s].push(card(s, r));
  assert.equal(canFinish(st), true);
  let guard = 0;
  while (!won(st) && guard++ < 60) apply(st, finishMove(st));
  assert.equal(won(st), true);
  const fc = dealFreecell(3);
  assert.equal(canFinish(fc), false, 'un reparto mezclado no se termina solo');
});

test('pistas y toques: siempre devuelven movidas válidas y deshacer copia el estado', () => {
  for (const [kind, opt] of [['klondike', { draw: 1 }], ['spider', { suits: 2 }], ['freecell', {}]]) {
    const st = deal(kind, opt, 11);
    for (let i = 0; i < 150; i++) {
      const h = hint(st);
      if (!h) break;
      if (h === 'draw') draw(st);
      else {
        assert.ok(canMove(st, h), `${kind}: la pista es válida`);
        const before = clone(st);
        apply(st, h);
        assert.notDeepEqual(before, st);
      }
    }
    for (const m of legalMoves(st)) assert.ok(canMove(st, m));
    const tb = st.tab.findIndex((p) => p.length);
    if (tb >= 0) {
      const m = bestFrom(st, { p: 'tab', i: tb, k: st.tab[tb].length - 1 });
      if (m) assert.ok(canMove(st, m));
    }
  }
});

test('resolvedores: las primeras partidas de FreeCell se resuelven y hay Klondikes ganables', () => {
  for (let n = 1; n <= 6; n++) assert.equal(solveFreecell(dealFreecell(n), 200000).ok, true, `FreeCell n.º ${n}`);
  let ok = 0;
  for (let s = 1; s <= 6; s++) if (solveKlondike(deal('klondike', { draw: 1 }, `dia:2026-10-20:${s}`), 45000).ok === true) ok++;
  assert.ok(ok >= 3, `Klondikes ganables: ${ok}/6`);
  // un reparto imposible a propósito: los ases enterrados debajo de reyes sin poder moverse
  const st = deal('klondike', { draw: 1 }, 1);
  st.stock = [];
  st.waste = [];
  st.tab = [[card(0, 1, false), card(1, 13)], [card(1, 1, false), card(2, 13)], [card(2, 1, false), card(3, 13)], [card(3, 1, false), card(0, 13)], [], [], []];
  st.tab[4] = [];
  assert.notEqual(solveKlondike(st, 5000).ok, true);
});
