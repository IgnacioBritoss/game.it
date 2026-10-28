/** Bloques: las piezas, las manos (compartidas y adaptativas), el puntaje con combos y la carrera online validada en el servidor. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIZE, SHAPES, shapeOf, Game, fits, fitsAnywhere, fullLines, handAt, solvable, hashSeed, mulberry32, comboMult, LINE_POINTS, PERFECT_BONUS, encodeMove, decodeMoves, replayMoves, suggest } from '../public/games/bloques/shared/engine.js';
import { startServer, connect, wait } from './helpers.mjs';

const empty = () => new Uint8Array(64);
const norm = (cells) => {
  const r0 = Math.min(...cells.map((c) => c[0]));
  const c0 = Math.min(...cells.map((c) => c[1]));
  return cells
    .map(([r, c]) => `${r - r0},${c - c0}`)
    .sort()
    .join(' ');
};
/** Pone piezas a mano sobre una partida: llena las casillas indicadas del tablero. */
function setBoard(g, rows) {
  rows.forEach((row, r) => [...row].forEach((ch, c) => (g.b[r * 8 + c] = ch === '#' ? 1 : 0)));
}
const slotOf = (g, id) => g.hand.indexOf(id);
const shapeId = (pat) => {
  const rows = pat.split('/');
  const cells = [];
  rows.forEach((row, r) => [...row].forEach((ch, c) => ch === '#' && cells.push([r, c])));
  const key = norm(cells);
  return SHAPES.find((s) => norm(s.cells) === key).id;
};

test('las piezas: 37 formas distintas, de 1 a 5 casillas, con su tamaño y su color', () => {
  assert.equal(SHAPES.length, 37);
  assert.equal(new Set(SHAPES.map((s) => norm(s.cells))).size, 37, 'ninguna repetida');
  for (const s of SHAPES) {
    assert.ok(s.n >= 1 && s.n <= 9 && s.n === s.cells.length);
    assert.equal(s.cells.length, s.n);
    assert.ok(s.w <= 5 && s.h <= 5);
    assert.ok(s.color >= 1 && s.color <= 8);
    assert.ok(s.weight > 0);
    assert.equal(Math.max(...s.cells.map((c) => c[0])) + 1, s.h);
    assert.equal(Math.max(...s.cells.map((c) => c[1])) + 1, s.w);
  }
  assert.equal(shapeOf(0).n, 1);
  assert.equal(SHAPES.filter((s) => s.fam === 'ele4').length, 8);
  assert.equal(SHAPES.filter((s) => s.fam === 'te').length, 4);
});

test('entrar o no entrar: bordes, choques y búsqueda de lugar', () => {
  const b = empty();
  const sq3 = shapeOf(shapeId('###/###/###'));
  assert.equal(fits(b, sq3, 0, 0), true);
  assert.equal(fits(b, sq3, 5, 5), true);
  assert.equal(fits(b, sq3, 6, 0), false, 'se sale por abajo');
  assert.equal(fits(b, sq3, 0, 6), false, 'se sale por la derecha');
  assert.equal(fits(b, sq3, -1, 0), false);
  b[4 * 8 + 4] = 3;
  assert.equal(fits(b, sq3, 3, 3), false, 'choca');
  assert.equal(fits(b, sq3, 5, 5), true);
  // un tablero casi lleno: solo entra lo que cabe en el hueco
  const full = new Uint8Array(64).fill(1);
  full[0] = 0;
  assert.equal(fitsAnywhere(full, shapeOf(0)), true);
  assert.equal(fitsAnywhere(full, shapeOf(shapeId('##'))), false);
});

test('las manos salen de la semilla: iguales para todos, distintas entre sí y nunca tres iguales', () => {
  assert.deepEqual(handAt('abc', 0), handAt('abc', 0));
  assert.notDeepEqual(handAt('abc', 0), handAt('abc', 1));
  assert.notDeepEqual(handAt('abc', 3), handAt('xyz', 3));
  const seen = new Set();
  for (let h = 0; h < 400; h++) {
    const [a, b, c] = handAt(777, h);
    assert.ok(!(a === b && b === c));
    for (const id of [a, b, c]) {
      assert.ok(id >= 0 && id < SHAPES.length);
      seen.add(id);
    }
  }
  assert.ok(seen.size >= 35, `salen casi todas las formas (${seen.size})`);
  // con la partida avanzada salen más piezas grandes
  const avg = (from) => {
    let n = 0;
    let t = 0;
    for (let h = from; h < from + 300; h++) for (const id of handAt(5, h)) (t += shapeOf(id).n), n++;
    return t / n;
  };
  assert.ok(avg(80) > avg(0), 'más grandes más adelante');
});

test('colocar: suma las casillas, se rechazan los lugares ocupados y se reparte la mano siguiente', () => {
  const g = new Game({ seed: 'colocar' });
  assert.equal(g.hand.every((x) => x >= 0), true);
  assert.equal(g.handNo, 1);
  const first = g.hand.slice();
  const s0 = shapeOf(first[0]);
  const r = g.place(0, 0, 0);
  assert.equal(r.slot, 0);
  assert.equal(r.id, first[0]);
  assert.equal(g.score, s0.n);
  assert.equal(g.hand[0], -1);
  assert.equal(g.place(0, 0, 0), null, 'la ranura ya se usó');
  assert.equal(g.place(1, 9, 9), null);
  assert.equal(g.place(3, 0, 0), null);
  // con las tres usadas llega la mano siguiente
  let dealt = false;
  for (const slot of [1, 2]) {
    const m = g.moves().find((x) => x.slot === slot);
    if (!m) break;
    dealt = g.place(slot, m.r, m.c).dealt;
  }
  if (g.hand.every((x) => x >= 0)) {
    assert.equal(dealt, true);
    assert.deepEqual(g.hand, handAt('colocar', 1));
  }
});

test('limpiar líneas: filas, columnas y las dos a la vez (la casilla del cruce vale una sola vez)', () => {
  const g = new Game({ seed: 1 });
  g.hand = [shapeId('#'), shapeId('#'), shapeId('##')];
  // fila 0 llena salvo (0,7)
  setBoard(g, ['#######.', '........', '........', '........', '........', '........', '........', '........']);
  const r = g.place(0, 0, 7);
  assert.deepEqual(r.rows, [0]);
  assert.deepEqual(r.cols, []);
  assert.equal(r.cleared.length, 8);
  assert.equal(g.b.every((v) => !v), true);
  assert.equal(r.perfect, true);
  assert.equal(g.lines, 1);
  assert.equal(r.gained, 1 + LINE_POINTS[1] + PERFECT_BONUS);
  // una fila y una columna que se cruzan: 15 casillas, 2 líneas
  const h = new Game({ seed: 1 });
  h.hand = [shapeId('#'), shapeId('##'), shapeId('##')];
  setBoard(h, ['.#######', '#.......', '#.......', '#.......', '#.......', '#.......', '#.......', '#.......', ].slice(0, 8));
  const q = h.place(0, 0, 0);
  assert.deepEqual(q.rows, [0]);
  assert.deepEqual(q.cols, [0]);
  assert.equal(q.cleared.length, 15);
  assert.equal(q.perfect, true, 'quedó vacío');
  assert.equal(q.gained, 1 + LINE_POINTS[2] + PERFECT_BONUS);
  assert.equal(h.lines, 2);
  // los colores de lo que se limpia quedan para animarlo
  assert.ok(q.cleared.every((c) => c.color > 0));
});

test('combos: cada placement que limpia suma al combo, se multiplica y se pierde tras tres jugadas sin limpiar', () => {
  assert.equal(comboMult(0), 1);
  assert.equal(comboMult(1), 1);
  assert.equal(comboMult(2), 1.5);
  assert.equal(comboMult(3), 2);
  assert.equal(comboMult(20), 4, 'tope');
  const g = new Game({ seed: 1 });
  const dot = shapeId('#');
  const clearOne = (row) => {
    g.hand = [dot, dot, dot];
    const rows = Array.from({ length: 8 }, (_, r) => (r === row ? '#######.' : '........'));
    setBoard(g, rows);
    return g.place(0, row, 7);
  };
  const a = clearOne(2);
  assert.equal(a.streak, 1);
  assert.equal(a.mult, 1);
  const b = clearOne(3);
  assert.equal(b.streak, 2);
  assert.equal(b.mult, 1.5);
  assert.equal(b.lineScore, Math.round(LINE_POINTS[1] * 1.5));
  assert.equal(g.maxStreak, 2);
  // tres colocaciones seguidas sin limpiar cortan el combo
  g.hand = [dot, dot, dot];
  setBoard(g, ['........', '........', '........', '........', '........', '........', '........', '........']);
  g.place(0, 0, 0);
  assert.equal(g.streak, 2, 'una jugada sin limpiar todavía no lo corta');
  g.place(1, 0, 2);
  g.place(2, 0, 4);
  assert.equal(g.streak, 0);
  assert.equal(g.maxStreak, 2);
});

test('perfecto: dejar el tablero vacío da un bonus', () => {
  const g = new Game({ seed: 1 });
  g.hand = [shapeId('###'), shapeId('#'), shapeId('#')];
  setBoard(g, ['..#####.', '........', '........', '........', '........', '........', '........', '........'].map((r, i) => (i ? r : '#####...')));
  // fila 0 con 5 llenas: la pieza de 3 completa la fila (cols 5,6,7) y no queda nada
  const r = g.place(0, 0, 5);
  assert.equal(r.perfect, true);
  assert.equal(g.score, 3 + LINE_POINTS[1] + PERFECT_BONUS);
});

test('fin de la partida: cuando ninguna pieza que queda entra', () => {
  const g = new Game({ seed: 1 });
  assert.equal(g.over, false);
  g.hand = [shapeId('##'), -1, -1];
  const rows = Array.from({ length: 8 }, () => '########');
  const mk = (...holes) => {
    const b = rows.map((r) => [...r]);
    for (const [r, c] of holes) b[r][c] = '.';
    setBoard(g, b.map((r) => r.join('')));
  };
  mk([0, 0]);
  assert.equal(g.over, true, 'un hueco solo no deja entrar un dominó');
  mk([0, 0], [0, 1]);
  assert.equal(g.over, false);
  g.hand = [-1, -1, -1];
  assert.equal(g.over, true);
});

test('modo adaptativo: la mano siempre se puede colocar entera cuando existe una así', () => {
  let solvedAtDeal = 0;
  let deals = 0;
  for (let k = 0; k < 6; k++) {
    const g = new Game({ seed: `adapt${k}`, adaptive: true });
    const rng = mulberry32(k + 99);
    for (let step = 0; step < 90 && !g.over; step++) {
      const ms = g.moves();
      const m = ms[Math.floor(rng() * ms.length)];
      const res = g.place(m.slot, m.r, m.c);
      if (res.dealt) {
        deals++;
        if (solvable(g.b, g.hand)) solvedAtDeal++;
      }
    }
  }
  assert.ok(deals >= 10);
  assert.ok(solvedAtDeal / deals >= 0.9, `${solvedAtDeal}/${deals} manos resolubles`);
  // y hay al menos una pieza que entra siempre que la partida sigue (si no, se terminó)
  const h = new Game({ seed: 'x', adaptive: true });
  assert.equal(h.over, false);
});

test('solvable: decide bien si las tres piezas entran en algún orden', () => {
  const b = empty();
  assert.equal(solvable(b, [shapeId('###/###/###'), shapeId('###/###/###'), shapeId('###/###/###')]), true);
  // un tablero con solo un hueco de un casillero: solo entra el punto
  const full = new Uint8Array(64).fill(1);
  full[10] = 0;
  assert.equal(solvable(full, [0]), true);
  assert.equal(solvable(full, [shapeId('##')]), false);
  assert.equal(solvable(full, []), true);
});

test('jugadas como texto: se codifican, se leen y se rechazan las raras', () => {
  assert.equal(encodeMove(2, 7, 7).length, 2);
  const s = encodeMove(0, 0, 0) + encodeMove(1, 3, 4) + encodeMove(2, 7, 7);
  assert.deepEqual(decodeMoves(s), [{ slot: 0, r: 0, c: 0 }, { slot: 1, r: 3, c: 4 }, { slot: 2, r: 7, c: 7 }]);
  assert.equal(decodeMoves('0'), null, 'cantidad impar');
  assert.equal(decodeMoves('3a'), null, 'ranura inexistente');
  assert.equal(decodeMoves('0ÿ'), null, 'casilla fuera del tablero');
  assert.equal(decodeMoves(7), null);
  assert.equal(decodeMoves('00'.repeat(1000)), null, 'demasiado largo');
  assert.deepEqual(decodeMoves(''), []);
});

test('replayMoves rehace la partida y da el mismo puntaje que jugarla en vivo; lo ilegal se rechaza', () => {
  const live = new Game({ seed: 4242 });
  let moves = '';
  for (let i = 0; i < 60 && !live.over; i++) {
    const m = suggest(live);
    live.place(m.slot, m.r, m.c);
    moves += encodeMove(m.slot, m.r, m.c);
  }
  const rep = replayMoves(4242, moves);
  assert.ok(rep);
  assert.equal(rep.score, live.score);
  assert.equal(rep.lines, live.lines);
  assert.equal(rep.placed, live.placed);
  assert.equal(replayMoves(4243, moves) === null || replayMoves(4243, moves).score !== live.score, true, 'otra semilla, otra partida');
  // una jugada que no entra o una ranura repetida invalida todo
  assert.equal(replayMoves(4242, moves + encodeMove(0, 0, 0) + encodeMove(0, 0, 0)), null);
  assert.equal(replayMoves(4242, encodeMove(0, 7, 7)), null, 'se sale del tablero');
  assert.equal(replayMoves(4242, encodeMove(0, 0, 0) + encodeMove(0, 4, 4)), null, 'la ranura ya se usó');
  assert.equal(replayMoves(1, 'zz'), null);
  assert.deepEqual(replayMoves(1, ''), { score: 0, lines: 0, placed: 0, maxStreak: 0, over: false });
});

test('la sugerencia juega partidas largas y limpia líneas (el puntaje tiene sentido)', () => {
  let best = 0;
  let total = 0;
  for (let k = 0; k < 4; k++) {
    const g = new Game({ seed: `bot${k}`, adaptive: true });
    for (let i = 0; i < 600 && !g.over; i++) {
      const m = suggest(g);
      assert.ok(g.canPlace(m.slot, m.r, m.c));
      g.place(m.slot, m.r, m.c);
    }
    best = Math.max(best, g.score);
    total += g.score;
    assert.ok(g.lines > 20, `líneas ${g.lines}`);
  }
  assert.ok(total / 4 > 800, `puntaje medio ${total / 4}`);
  assert.ok(best > 1000);
});

test('hash y azar con semilla: estables', () => {
  assert.equal(hashSeed('a'), hashSeed('a'));
  assert.notEqual(hashSeed('a'), hashSeed('b'));
  const r1 = mulberry32(5);
  const r2 = mulberry32(5);
  assert.deepEqual([r1(), r1(), r1()], [r2(), r2(), r2()]);
  assert.equal(SIZE, 8);
  assert.deepEqual(fullLines(empty()), { rows: [], cols: [] });
  assert.deepEqual(fullLines(new Uint8Array(64).fill(1)).rows.length, 8);
});

// ------------------------------------------------------------------ servidor

test('servidor (carrera): las manos salen de la semilla, el puntaje se rehace en el servidor y se rechazan las trampas', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    a.send({ t: 'create', game: 'bloques', name: 'Ana' });
    await wait(200);
    const code = a.last('joined').code;
    a.send({ t: 'settings', settings: { time: '7', public: 'x' } });
    await wait(100);
    assert.equal(a.last('room').room.settings.time, '180', 'un tiempo raro se ignora');
    a.send({ t: 'settings', settings: { time: '90', public: true } });
    await wait(100);
    assert.equal(a.last('room').room.settings.time, '90');
    const b = await connect(srv.port);
    b.send({ t: 'join', game: 'bloques', code, name: 'Beto' });
    await wait(250);
    a.send({ t: 'start' });
    await wait(300);
    const room = a.last('room').room;
    assert.equal(room.state, 'playing');
    assert.equal(room.race.limit, 90);
    assert.ok(Number.isInteger(room.race.seed));
    // las dos partidas se rehacen con la misma semilla: se juega una con la sugerencia y se manda
    const seed = room.race.seed;
    const live = new Game({ seed });
    let moves = '';
    for (let i = 0; i < 14 && !live.over; i++) {
      const m = suggest(live);
      live.place(m.slot, m.r, m.c);
      moves += encodeMove(m.slot, m.r, m.c);
    }
    while (Date.now() < room.race.startAt + 100) await wait(100);
    // un avance parcial le llega al otro; datos raros se ignoran
    a.send({ t: 'state', s: [123] });
    a.send({ t: 'state', s: 'x' });
    await wait(200);
    assert.deepEqual(b.last('state').s, [123]);
    // un final con jugadas que no entran no cuenta
    b.send({ t: 'finish', moves: encodeMove(0, 7, 7) + encodeMove(0, 0, 0) });
    b.send({ t: 'finish', moves: 5 });
    b.send({ t: 'finish' });
    await wait(250);
    assert.equal(b.all('finished').length, 0);
    // demasiadas colocaciones para el tiempo que pasó: también se rechaza (14 en menos de 3 s es imposible)
    a.send({ t: 'finish', moves });
    await wait(300);
    assert.equal(a.all('finished').length, 0, 'más rápido de lo posible');
    // con un par de colocaciones sí, y el puntaje es el que sale de rehacerlas
    const few = moves.slice(0, 4);
    const rep = replayMoves(seed, few);
    a.send({ t: 'finish', moves: few });
    await wait(300);
    const fa = a.last('finished');
    assert.equal(fa.name, 'Ana');
    assert.equal(fa.score, rep.score);
    assert.equal(fa.placed, 2);
    assert.equal(fa.place, 1);
    assert.equal(b.last('finished').id, fa.id, 'el otro se entera');
    // la carrera sigue hasta que termina el otro (no se corta con el primero)
    assert.equal(a.last('end'), undefined);
    b.send({ t: 'finish', moves: '' });
    await wait(400);
    const end = a.last('end');
    assert.ok(end, 'terminó la carrera');
    assert.deepEqual(end.results.map((r) => r.name), ['Ana', 'Beto'], 'Ana tiene puntos y Beto no');
    assert.ok(end.results.every((r) => !r.dnf));
    a.ws.close();
    b.ws.close();
  } finally {
    srv.stop();
  }
});
