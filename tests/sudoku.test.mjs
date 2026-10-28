/** Sudoku: el resolvedor que cuenta soluciones, las técnicas, el generador (único, determinista, con la dificultad pedida), las pistas y la carrera online. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N, LEVELS, UNITS, PEERS, rowOf, colOf, boxOf, parse, stringify, solve, conflicts, candidates, nextStep, solveLogic, grade, generate, randomSolution, rngFor, hint, digitCounts, finders, isFull, popcount, digitsOf } from '../public/games/sudoku/shared/engine.js';
import { startServer, connect, wait } from './helpers.mjs';

const WIKI = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const WIKI_SOL = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
const bit = (d) => 1 << d;

test('geometría: 27 unidades de 9, cada casillero tiene 20 vecinos y una sola caja', () => {
  assert.equal(UNITS.length, 27);
  for (const u of UNITS) assert.equal(new Set(u).size, 9);
  assert.ok(PEERS.every((p) => p.length === 20 && new Set(p).size === 20));
  assert.deepEqual([rowOf(40), colOf(40), boxOf(40)], [4, 4, 4]);
  assert.deepEqual([rowOf(80), colOf(80), boxOf(80)], [8, 8, 8]);
  assert.equal(boxOf(2), 0);
  assert.equal(boxOf(3), 1);
  assert.equal(boxOf(27), 3);
  // cada casillero está en exactamente una fila, una columna y una caja
  for (let i = 0; i < N; i++) assert.equal(UNITS.filter((u) => u.includes(i)).length, 3);
  assert.equal(stringify(parse(WIKI)), WIKI);
  assert.equal(stringify(parse('1.3')), '1' + '0' + '3' + '0'.repeat(78));
  assert.deepEqual(digitsOf(bit(2) | bit(9)), [2, 9]);
  assert.equal(popcount(bit(1) | bit(5) | bit(7)), 3);
});

test('resolvedor: cuenta soluciones (una, varias, ninguna) y encuentra la correcta', () => {
  const r = solve(parse(WIKI), 2);
  assert.equal(r.count, 1);
  assert.equal(stringify(r.solution), WIKI_SOL);
  assert.equal(solve(new Int8Array(81), 2).count, 2, 'la grilla vacía tiene muchas: corta en el límite');
  assert.equal(solve(new Int8Array(81), 1).count, 1);
  // sin soluciones aunque no haya repetidos: el casillero (0,8) no tiene candidatos
  const dead = new Int8Array(81);
  '12345678'.split('').forEach((d, c) => (dead[c] = +d));
  dead[9 + 8] = 9;
  assert.equal(conflicts(dead).size, 0);
  assert.equal(solve(dead, 2).count, 0);
  // con repetidos
  const dup = parse(WIKI);
  dup[1] = 5;
  assert.equal(solve(dup, 2).count, 0);
  assert.deepEqual([...conflicts(dup)].sort((a, b) => a - b), [0, 1]);
  // dos soluciones: un "rectángulo mortal" (cuatro casilleros en dos cajas que se pueden intercambiar)
  let found = null;
  for (let k = 0; k < 40 && !found; k++) {
    const sol = randomSolution(rngFor(`rect${k}`));
    for (let r1 = 0; r1 < 9 && !found; r1++)
      for (let r2 = r1 + 1; r2 < 9 && !found; r2++) {
        if (((r1 / 3) | 0) !== ((r2 / 3) | 0)) continue;
        for (let c1 = 0; c1 < 9 && !found; c1++)
          for (let c2 = c1 + 1; c2 < 9; c2++) {
            if (((c1 / 3) | 0) === ((c2 / 3) | 0)) continue;
            if (sol[r1 * 9 + c1] === sol[r2 * 9 + c2] && sol[r1 * 9 + c2] === sol[r2 * 9 + c1]) {
              found = Int8Array.from(sol);
              for (const [r, c] of [[r1, c1], [r1, c2], [r2, c1], [r2, c2]]) found[r * 9 + c] = 0;
              break;
            }
          }
      }
  }
  assert.ok(found, 'se encontró un rectángulo ambiguo');
  assert.equal(solve(found, 5).count, 2, 'la original y la intercambiada');
  const amb = parse(WIKI_SOL);
  amb[0] = 0;
  assert.equal(solve(amb, 2).count, 1, 'con un solo casillero vacío hay una');
  // la solución completa no tiene repetidos y está llena
  assert.equal(conflicts(parse(WIKI_SOL)).size, 0);
  assert.ok(isFull(parse(WIKI_SOL)));
  assert.ok(!isFull(parse(WIKI)));
});

test('candidatos: salen de lo que ya está puesto', () => {
  const g = parse(WIKI);
  const c = candidates(g);
  assert.equal(c[0], 0, 'un casillero lleno no tiene candidatos');
  // (0,2): la fila tiene 5 y 3 y 7, la columna 8 y 9, la caja 5 3 6 9 8 → quedan 1, 2, 4
  assert.deepEqual(digitsOf(c[2]), [1, 2, 4]);
  for (let i = 0; i < N; i++) if (!g[i]) assert.ok(c[i] !== 0, 'ninguno vacío sin candidatos en un puzzle válido');
  // la solución es siempre uno de los candidatos
  const sol = parse(WIKI_SOL);
  for (let i = 0; i < N; i++) if (!g[i]) assert.ok(c[i] & bit(sol[i]));
});

test('técnicas: únicos, bloqueados, pares y X-Wing sobre situaciones armadas', () => {
  const empty = () => ({ cells: new Int8Array(81), cand: new Int16Array(81) });
  // único desnudo
  let s = empty();
  s.cand[40] = bit(7);
  s.cand[41] = bit(3) | bit(4);
  assert.deepEqual(finders.nakedSingle(s.cells, s.cand), { tech: 1, kind: 'naked', place: [{ cell: 40, digit: 7 }] });
  // único oculto: el 4 solo cabe en un casillero de la fila 2 (los demás tienen otros candidatos)
  s = empty();
  for (let c = 0; c < 9; c++) s.cand[18 + c] = bit(1) | bit(2);
  s.cand[18 + 5] = bit(1) | bit(4);
  const h = finders.hiddenSingle(s.cells, s.cand);
  assert.deepEqual([h.kind, h.place[0]], ['hidden', { cell: 23, digit: 4 }]);
  // apuntando: en la caja 0 el 7 solo está en la fila 1; sale del resto de la fila
  s = empty();
  s.cand[9] = s.cand[10] = bit(7) | bit(1);
  s.cand[14] = bit(7) | bit(2); // (1,5), fuera de la caja
  s.cand[16] = bit(5) | bit(6); // sin el 7: no cambia
  let r = finders.locked(s.cells, s.cand);
  assert.equal(r.kind, 'pointing');
  assert.deepEqual(r.elim, [{ cell: 14, digits: [7] }]);
  // reclamando: en la fila 4 el 3 solo está en la caja 4; sale del resto de la caja
  s = empty();
  s.cand[4 * 9 + 3] = s.cand[4 * 9 + 4] = bit(3) | bit(8);
  s.cand[3 * 9 + 4] = bit(3) | bit(9); // (3,4), en la caja pero fuera de la fila
  r = finders.locked(s.cells, s.cand);
  assert.equal(r.kind, 'claiming');
  assert.deepEqual(r.elim, [{ cell: 31, digits: [3] }]);
  // par desnudo en la fila 2
  s = empty();
  s.cand[18] = s.cand[19] = bit(3) | bit(4);
  s.cand[23] = bit(3) | bit(4) | bit(8);
  r = finders.subsets(s.cells, s.cand);
  assert.equal(r.kind, 'nakedPair');
  assert.deepEqual(r.elim, [{ cell: 23, digits: [3, 4] }]);
  // par oculto en la fila 6: el 1 y el 2 solo caben en los mismos dos casilleros
  s = empty();
  const row6 = (c) => 6 * 9 + c;
  s.cand[row6(0)] = bit(1) | bit(2) | bit(7);
  s.cand[row6(3)] = bit(1) | bit(2) | bit(8);
  for (const c of [1, 2, 4, 5, 6, 7, 8]) s.cand[row6(c)] = bit(5) | bit(6) | bit(7) | bit(8) | bit(9);
  r = finders.subsets(s.cells, s.cand);
  assert.equal(r.kind, 'hiddenPair');
  assert.deepEqual(r.elim.map((e) => [e.cell, e.digits]), [[row6(0), [7]], [row6(3), [8]]]);
  // X-Wing: el 5 en las filas 1 y 5 solo está en las columnas 2 y 6
  s = empty();
  for (const rr of [1, 5]) for (const cc of [2, 6]) s.cand[rr * 9 + cc] = bit(5) | bit(1);
  for (const [rr, cc] of [[0, 2], [7, 2], [4, 6], [8, 6]]) s.cand[rr * 9 + cc] = bit(5) | bit(2);
  r = finders.xwing(s.cells, s.cand);
  assert.equal(r.kind, 'xwing');
  assert.equal(r.by, 'row');
  assert.deepEqual(r.lines, [1, 5]);
  assert.deepEqual(r.across, [2, 6]);
  assert.deepEqual(r.elim.map((e) => e.cell).sort((a, b) => a - b), [2, 42, 65, 78], 'el 5 sale de esas columnas en las demás filas');
  // lo mismo girado: columnas 1 y 5 con el 5 solo en las filas 2 y 6
  s = empty();
  for (const cc of [1, 5]) for (const rr of [2, 6]) s.cand[rr * 9 + cc] = bit(5) | bit(1);
  for (const [rr, cc] of [[2, 0], [2, 7], [6, 3], [6, 8]]) s.cand[rr * 9 + cc] = bit(5) | bit(2);
  r = finders.xwing(s.cells, s.cand);
  assert.equal(r.by, 'col');
  assert.deepEqual(r.lines, [1, 5]);
  assert.deepEqual(r.elim.map((e) => e.cell).sort((a, b) => a - b), [18, 25, 57, 62]);
  // y si no hay nada, nada
  s = empty();
  assert.equal(nextStep(s.cells, s.cand), null);
});

test('lógica: el puzzle clásico se resuelve solo con únicos y cada paso es válido', () => {
  const r = solveLogic(parse(WIKI), 5);
  assert.ok(r.solved);
  assert.ok(r.tech <= 2);
  assert.equal(stringify(r.cells), WIKI_SOL);
  assert.equal(grade(parse(WIKI)), 1);
  // si la grilla tiene repetidos, no se resuelve
  const dup = parse(WIKI);
  dup[1] = 5;
  assert.equal(solveLogic(dup).solved, false);
});

test('generador: el mismo puzzle con la misma semilla, otro con otra; única solución y la solución es la que dice', () => {
  const a = generate('2026-10-27', 2);
  const b = generate('2026-10-27', 2);
  assert.deepEqual(a, b);
  assert.notEqual(generate('2026-10-28', 2).puzzle, a.puzzle);
  assert.notEqual(generate('2026-10-27', 3).puzzle, a.puzzle);
  assert.equal(solve(parse(a.puzzle), 2).count, 1);
  assert.equal(stringify(solve(parse(a.puzzle), 2).solution), a.solution);
  // las pistas del puzzle están en la solución
  for (let i = 0; i < N; i++) if (a.puzzle[i] !== '0') assert.equal(a.puzzle[i], a.solution[i]);
  assert.equal(a.givens, [...a.puzzle].filter((c) => c !== '0').length);
  assert.equal(conflicts(parse(a.solution)).size, 0);
  // la solución al azar siempre es válida
  for (let k = 0; k < 6; k++) {
    const s = randomSolution(rngFor(`sol${k}`));
    assert.ok(isFull(s) && conflicts(s).size === 0);
  }
  assert.deepEqual(randomSolution(rngFor('x')), randomSolution(rngFor('x')));
  assert.deepEqual(LEVELS, ['easy', 'medium', 'hard', 'expert']);
});

test('generador: cada nivel sale con la dificultad pedida (la técnica que hace falta) y se resuelve sin adivinar hasta el difícil', () => {
  for (let level = 1; level <= 4; level++)
    for (let k = 0; k < 4; k++) {
      const g = generate(`nivel-${level}-${k}`, level);
      const cells = parse(g.puzzle);
      assert.equal(solve(cells, 2).count, 1, `única (nivel ${level} semilla ${k})`);
      assert.equal(g.grade, level, `dificultad (nivel ${level} semilla ${k})`);
      assert.equal(grade(cells), level);
      if (level === 1) {
        assert.ok(solveLogic(cells, 2).solved, 'el fácil se resuelve con únicos');
        assert.equal(g.givens, 36);
      } else if (level === 2) {
        assert.ok(!solveLogic(cells, 2).solved, 'el medio necesita más que únicos');
        assert.ok(solveLogic(cells, 3).solved, 'pero alcanza con candidatos bloqueados');
      } else if (level === 3) {
        assert.ok(!solveLogic(cells, 3).solved, 'el difícil necesita pares o tríos');
        assert.ok(solveLogic(cells, 4).solved);
      }
      assert.ok(g.givens >= 17 && g.givens <= 36);
    }
});

test('generador: rápido (todos los niveles en pocos segundos)', () => {
  const t0 = Date.now();
  for (let level = 1; level <= 4; level++) for (let k = 0; k < 5; k++) generate(`rapido-${k}`, level);
  assert.ok(Date.now() - t0 < 8000, `tardó ${Date.now() - t0} ms`);
});

test('pistas: avisa si hay un error, explica los únicos y con ayuda se resuelve todo el fácil', () => {
  const g = generate('pistas', 1);
  const cells = parse(g.puzzle);
  const sol = parse(g.solution);
  // un dígito mal puesto
  const bad = Int8Array.from(cells);
  const i = bad.findIndex((d) => !d);
  bad[i] = (sol[i] % 9) + 1;
  assert.deepEqual(hint(bad, g.solution), { kind: 'wrong', cell: i });
  // completa: no hay pista
  assert.deepEqual(hint(sol, g.solution), { kind: 'done' });
  // aplicar las pistas una por una resuelve todo, y cada dígito es el de la solución
  const cur = Int8Array.from(cells);
  const kinds = new Set();
  for (let step = 0; step < 60 && !isFull(cur); step++) {
    const h = hint(cur, g.solution);
    assert.ok(['naked', 'hidden', 'reveal'].includes(h.kind), h.kind);
    assert.equal(h.digit, sol[h.cell], 'el dígito de la pista es el de la solución');
    assert.equal(cur[h.cell], 0, 'el casillero estaba vacío');
    kinds.add(h.kind);
    if (h.kind === 'hidden') assert.ok(h.unit >= 0 && h.unit < 27);
    cur[h.cell] = h.digit;
  }
  assert.ok(isFull(cur));
  assert.equal(stringify(cur), g.solution);
  assert.ok(kinds.has('naked') || kinds.has('hidden'));
  // en un experto, las pistas siguen dando el dígito correcto aunque haga falta lógica más avanzada
  const e = generate('pistas-exp', 4);
  const cur2 = parse(e.puzzle);
  const esol = parse(e.solution);
  let reveals = 0;
  for (let step = 0; step < 70 && !isFull(cur2); step++) {
    const h = hint(cur2, e.solution);
    assert.equal(h.digit, esol[h.cell]);
    if (h.kind === 'reveal') reveals++;
    cur2[h.cell] = h.digit;
  }
  assert.ok(isFull(cur2));
  void reveals;
});

test('dígitos completos: cuenta los que están bien puestos', () => {
  const sol = parse(WIKI_SOL);
  const c = digitCounts(sol);
  assert.deepEqual(c.slice(1), new Array(9).fill(9));
  const g = parse(WIKI);
  const gc = digitCounts(g, sol);
  assert.ok(gc.slice(1).every((n) => n < 9));
  const wrong = Int8Array.from(sol);
  wrong[0] = 9; // mal
  assert.equal(digitCounts(wrong, sol)[5], 8, 'el 5 de ese casillero ya no está');
  assert.equal(digitCounts(wrong, sol)[9], 9, 'y el 9 mal puesto no cuenta');
  assert.equal(digitCounts(wrong)[9], 10, 'sin la solución cuenta todo');
});

test('servidor (carrera): el puzzle sale de la semilla, la solución no viaja, el final se valida y el tiempo se acota', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    a.send({ t: 'create', game: 'sudoku', name: 'Ana' });
    await wait(200);
    const code = a.last('joined').code;
    a.send({ t: 'settings', settings: { level: 'otro', public: 'x' } });
    await wait(100);
    assert.equal(a.last('room').room.settings.level, 'medium', 'un nivel raro se ignora');
    a.send({ t: 'settings', settings: { level: 'easy' } });
    await wait(100);
    assert.equal(a.last('room').room.settings.level, 'easy');
    const b = await connect(srv.port);
    b.send({ t: 'join', game: 'sudoku', code, name: 'Beto' });
    await wait(250);
    a.send({ t: 'start' });
    await wait(300);
    const room = a.last('room').room;
    assert.equal(room.state, 'playing');
    assert.equal(room.race.level, 'easy');
    assert.ok(Number.isInteger(room.race.seed));
    assert.ok(room.race.startAt > Date.now() - 1000, 'largan en unos segundos');
    // los dos navegadores arman el mismo puzzle con la semilla; la solución no viaja en ningún mensaje
    const g = generate(String(room.race.seed), 1);
    const empties = [...g.puzzle].filter((c) => c === '0').length;
    for (const c of [a, b]) assert.ok(!JSON.stringify(c.msgs).includes(g.solution), 'la solución no se manda');
    while (Date.now() < room.race.startAt + 200) await wait(100);
    // el avance de uno le llega al otro; datos raros se ignoran
    a.send({ t: 'state', s: [7] });
    a.send({ t: 'state', s: 'x' });
    await wait(200);
    assert.deepEqual(b.last('state').s, [7]);
    // un final con una grilla que no es la solución no cuenta
    const wrong = g.solution.replace(/./, (ch) => String((+ch % 9) + 1));
    b.send({ t: 'finish', time: 30000, grid: wrong });
    b.send({ t: 'finish', time: 30000 });
    await wait(250);
    assert.equal(b.all('finished').length, 0);
    // uno correcto pero imposiblemente rápido: se acota al mínimo (45 casilleros × 0,45 s)
    a.send({ t: 'finish', time: 800, grid: g.solution });
    await wait(300);
    const fa = a.last('finished');
    assert.equal(fa.name, 'Ana');
    assert.equal(fa.place, 1);
    assert.equal(fa.time, empties * 450);
    assert.equal(b.last('finished').id, fa.id, 'el otro se entera');
    // el segundo cierra la carrera y llega el resultado ordenado
    b.send({ t: 'finish', time: 90000, grid: g.solution });
    await wait(400);
    const end = a.last('end');
    assert.ok(end, 'terminó la carrera');
    assert.deepEqual(end.results.map((r) => r.name), ['Ana', 'Beto']);
    assert.ok(end.results.every((r) => !r.dnf && r.time >= empties * 450));
    a.ws.close();
    b.ws.close();
  } finally {
    srv.stop();
  }
});
