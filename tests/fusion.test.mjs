/** Fusión: el deslizamiento y las fusiones, las fichas nuevas con semilla, el fin de la partida, la repetición de partidas y la carrera online validada. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Fusion, slideLine, replayMoves, suggest, DIRS, dirIndex, mulberry32, hashSeed } from '../public/games/fusion/shared/engine.js';
import { startServer, connect, wait } from './helpers.mjs';

const E = (g, rows) => rows.forEach((row, r) => row.forEach((v, c) => (g.b[r * g.size + c] = v)));
const rows = (g) => Array.from({ length: g.size }, (_, r) => [...g.b.slice(r * g.size, (r + 1) * g.size)]);
/** Una partida con el tablero armado a mano, sin las fichas iniciales. */
function game(boardRows, size = boardRows.length, seed = 1) {
  const g = new Fusion({ size, seed });
  g.b.fill(0);
  g.score = 0;
  g.moves = 0;
  g.best = 0;
  E(g, boardRows);
  g.best = Math.max(...g.b);
  return g;
}

test('deslizar una fila: junta, fusiona de a pares y una ficha no se fusiona dos veces', () => {
  assert.deepEqual(slideLine([0, 0, 0, 0]).out, [0, 0, 0, 0]);
  assert.deepEqual(slideLine([1, 0, 0, 1]).out, [2, 0, 0, 0]);
  assert.deepEqual(slideLine([1, 1, 1, 1]).out, [2, 2, 0, 0]);
  assert.deepEqual(slideLine([1, 1, 1, 0]).out, [2, 1, 0, 0]);
  assert.deepEqual(slideLine([0, 1, 1, 1]).out, [2, 1, 0, 0]);
  assert.deepEqual(slideLine([2, 1, 1, 0]).out, [2, 2, 0, 0]);
  assert.deepEqual(slideLine([1, 1, 2, 0]).out, [2, 2, 0, 0], 'no vuelve a fusionar lo recién fusionado');
  assert.deepEqual(slideLine([1, 2, 1, 2]).out, [1, 2, 1, 2]);
  assert.equal(slideLine([2, 2, 3, 3]).gained, 8 + 16);
  const r = slideLine([0, 1, 0, 1]);
  assert.deepEqual(r.moves, [{ from: 1, to: 0, merge: false }, { from: 3, to: 0, merge: true }]);
});

test('el tablero inicial tiene dos fichas (2 o 4) y la misma semilla da el mismo arranque', () => {
  const g = new Fusion({ size: 4, seed: 'abc' });
  const filled = [...g.b].filter(Boolean);
  assert.equal(filled.length, 2);
  assert.ok(filled.every((v) => v === 1 || v === 2));
  assert.deepEqual([...new Fusion({ size: 4, seed: 'abc' }).b], [...g.b]);
  assert.notDeepEqual([...new Fusion({ size: 4, seed: 'abd' }).b], [...g.b]);
  assert.equal(new Fusion({ size: 5, seed: 1 }).b.length, 25);
});

test('mover en las cuatro direcciones: posiciones, puntaje y ficha nueva', () => {
  const base = [
    [1, 0, 1, 0],
    [0, 0, 0, 0],
    [2, 0, 0, 2],
    [0, 3, 0, 0],
  ];
  const L = game(base);
  const r = L.move(0);
  assert.deepEqual([L.b[0], L.b[8], L.b[12]], [2, 3, 3], 'cada fila se junta a la izquierda y fusiona');
  assert.equal(L.score, 4 + 8, 'dos 2 dan un 4 y dos 4 dan un 8');
  assert.ok(r.spawned && L.b[r.spawned.i] === r.spawned.v);
  assert.equal(L.moves, 1);
  const R = game(base);
  R.move(1);
  assert.deepEqual([R.b[3], R.b[11], R.b[15]], [2, 3, 3]);
  const U = game(base);
  U.move(2);
  assert.deepEqual([U.b[0], U.b[4], U.b[1], U.b[2], U.b[3]], [1, 2, 3, 1, 2]);
  const D = game(base);
  D.move(3);
  assert.deepEqual([D.b[12], D.b[8], D.b[13], D.b[14], D.b[15]], [2, 1, 3, 1, 2], 'abajo: lo que estaba abajo queda en el fondo');
});

test('un movimiento que no cambia nada es inválido y no gasta jugada ni genera ficha', () => {
  const g = game([[1, 2, 3, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  const before = [...g.b];
  assert.equal(g.canMove(0), false);
  assert.equal(g.move(0), null);
  assert.deepEqual([...g.b], before);
  assert.equal(g.moves, 0);
  assert.equal(g.canMove(3), true);
});

test('el detalle de la jugada alcanza para animar: de dónde sale cada ficha y qué se fusionó', () => {
  const g = game([[1, 1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  const r = g.move(0);
  assert.equal(r.slides.length, 2);
  assert.deepEqual(r.slides.map((x) => [x.from, x.to, x.merge]), [[0, 0, false], [1, 0, true]]);
  assert.deepEqual(r.merged, [{ i: 0, v: 2 }]);
  assert.equal(r.gained, 4);
  assert.equal(g.best >= 2, true);
});

test('fin de la partida: sin lugar y sin fusiones posibles', () => {
  const full = game([[1, 2, 1, 2], [2, 1, 2, 1], [1, 2, 1, 2], [2, 1, 2, 1]]);
  assert.equal(full.over, true);
  const almost = game([[1, 2, 1, 2], [2, 1, 2, 1], [1, 2, 1, 2], [2, 1, 2, 2]]);
  assert.equal(almost.over, false, 'hay dos 2 juntos');
  assert.equal(new Fusion({ size: 4, seed: 1 }).over, false);
});

test('llegar al 2048 se avisa una sola vez y se puede seguir', () => {
  const g = game([[10, 10, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  const r = g.move(0);
  assert.equal(r.reached, true);
  assert.equal(g.won, true);
  assert.equal(g.best, 11);
  const again = g.move(3);
  assert.equal(again.reached, false);
});

test('las fichas nuevas: 90 % de 2, siempre en un lugar vacío, y dependen de la semilla y de los movimientos', () => {
  const rng = mulberry32(hashSeed('stat'));
  let twos = 0;
  let total = 0;
  for (let k = 0; k < 400; k++) {
    const g = new Fusion({ size: 4, seed: `s${k}` });
    const m = g.move([0, 2, 1, 3][k % 4]);
    if (!m) continue;
    total++;
    assert.equal(g.b[m.spawned.i], m.spawned.v);
    if (m.spawned.v === 1) twos++;
    void rng;
  }
  assert.ok(twos / total > 0.8 && twos / total < 0.97, `${twos}/${total}`);
  // dos partidas con la misma semilla y los mismos movimientos terminan igual
  const a = new Fusion({ size: 4, seed: 77 });
  const b = new Fusion({ size: 4, seed: 77 });
  for (const d of [0, 2, 1, 3, 0, 2, 0, 2, 1, 3]) {
    a.move(d);
    b.move(d);
  }
  assert.deepEqual([...a.b], [...b.b]);
  assert.equal(a.score, b.score);
});

test('guardar y restaurar, y deshacer', () => {
  const g = new Fusion({ size: 4, seed: 5 });
  for (const d of [0, 2, 1, 3, 0, 2]) g.move(d) || g.move((d + 1) % 4);
  const snap = g.snapshot();
  const h = Fusion.restore(snap);
  assert.deepEqual([...h.b], [...g.b]);
  assert.equal(h.score, g.score);
  assert.equal(h.moves, g.moves);
  const before = g.snapshot();
  const m = [0, 1, 2, 3].find((d) => g.canMove(d));
  g.move(m);
  g.undoTo(before);
  assert.deepEqual(g.snapshot(), before);
});

test('replayMoves rehace la partida y da el mismo puntaje que jugarla en vivo; lo inválido se rechaza', () => {
  const live = new Fusion({ size: 4, seed: 1234 });
  let str = '';
  for (let i = 0; i < 120 && !live.over; i++) {
    const d = suggest(live);
    assert.ok(live.move(d));
    str += DIRS[d];
  }
  const rep = replayMoves(1234, str);
  assert.ok(rep);
  assert.equal(rep.score, live.score);
  assert.equal(rep.moves, live.moves);
  assert.equal(rep.best, live.best);
  assert.notEqual(replayMoves(1235, str)?.score, live.score);
  assert.equal(replayMoves(1234, str + 'X'), null);
  assert.equal(replayMoves(1234, 7), null);
  // un movimiento que no cambia nada invalida la partida: se busca una semilla cuyo arranque no se pueda mover a la izquierda
  let seed = 1;
  while (new Fusion({ size: 4, seed }).canMove(0)) seed++;
  assert.equal(replayMoves(seed, 'L'), null);
  assert.deepEqual(replayMoves(1, ''), { score: 0, moves: 0, best: new Fusion({ size: 4, seed: 1 }).best, over: false });
  assert.equal(replayMoves(1, 'L'.repeat(5000)), null);
  assert.equal(dirIndex('U'), 2);
  assert.equal(dirIndex('x'), -1);
});

test('la sugerencia llega lejos (el puntaje tiene sentido)', () => {
  let total = 0;
  for (let k = 0; k < 6; k++) {
    const g = new Fusion({ size: 4, seed: `bot${k}` });
    for (let i = 0; i < 3000 && !g.over; i++) g.move(suggest(g));
    total += g.score;
    assert.ok(g.best >= 6, `ficha ${2 ** g.best}`);
  }
  assert.ok(total / 6 > 600, `puntaje medio ${total / 6}`);
});

// ------------------------------------------------------------------ servidor

test('servidor (carrera): el puntaje se rehace en el servidor y se rechazan las trampas', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    a.send({ t: 'create', game: 'fusion', name: 'Ana' });
    await wait(200);
    const code = a.last('joined').code;
    a.send({ t: 'settings', settings: { time: '7', public: 'x' } });
    await wait(100);
    assert.equal(a.last('room').room.settings.time, '180');
    a.send({ t: 'settings', settings: { time: '90' } });
    await wait(100);
    const b = await connect(srv.port);
    b.send({ t: 'join', game: 'fusion', code, name: 'Beto' });
    await wait(250);
    a.send({ t: 'start' });
    await wait(300);
    const room = a.last('room').room;
    assert.equal(room.race.limit, 90);
    const seed = room.race.seed;
    const live = new Fusion({ size: 4, seed });
    let moves = '';
    for (let i = 0; i < 40 && !live.over; i++) {
      const d = suggest(live);
      live.move(d);
      moves += DIRS[d];
    }
    while (Date.now() < room.race.startAt + 100) await wait(100);
    a.send({ t: 'state', s: [321] });
    await wait(200);
    assert.deepEqual(b.last('state').s, [321]);
    // jugadas que no cambian nada o con letras raras: no cuentan
    b.send({ t: 'finish', moves: 'LXR' });
    b.send({ t: 'finish', moves: 5 });
    await wait(250);
    assert.equal(b.all('finished').length, 0);
    // 40 movimientos en menos de 3 segundos: imposible
    a.send({ t: 'finish', moves });
    await wait(300);
    assert.equal(a.all('finished').length, 0);
    const few = moves.slice(0, 3);
    a.send({ t: 'finish', moves: few });
    await wait(300);
    const fa = a.last('finished');
    assert.equal(fa.score, replayMoves(seed, few).score);
    assert.equal(fa.moves, 3);
    assert.equal(a.last('end'), undefined, 'la carrera sigue hasta que termina el otro');
    b.send({ t: 'finish', moves: '' });
    await wait(400);
    const end = a.last('end');
    assert.ok(end);
    assert.deepEqual(end.results.map((r) => r.name), ['Ana', 'Beto'], 'Ana tiene puntos y Beto no');
    a.ws.close();
    b.ws.close();
  } finally {
    srv.stop();
  }
});
