/** Mancala (Kalah): la siembra, el turno extra, las capturas, el final, el motor de la compu y la partida online. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Position, STORE, PITS, pitOf, opposite, moveStr, fromStr, replay } from '../public/games/mancala/shared/rules.js';
import { Engine, LEVELS, evaluate } from '../public/games/mancala/shared/engine.js';
import mancala from '../server/games/mancala.js';
import { startServer, connect, wait } from './helpers.mjs';

/** Una referencia sencilla y distinta de la implementación: mueve sobre un arreglo de 14 con los depósitos en 6 y 13. */
function ref(b, turn, m) {
  const board = Array.from(b);
  const mine = turn === 0 ? 6 : 13;
  const theirs = turn === 0 ? 13 : 6;
  let n = board[m];
  board[m] = 0;
  let i = m;
  while (n > 0) {
    i = (i + 1) % 14;
    if (i === theirs) continue;
    board[i] += 1;
    n -= 1;
  }
  let extra = false;
  if (i === mine) extra = true;
  else {
    const own = turn === 0 ? i >= 0 && i <= 5 : i >= 7 && i <= 12;
    if (own && board[i] === 1 && board[12 - i] > 0) {
      board[mine] += board[12 - i] + 1;
      board[12 - i] = 0;
      board[i] = 0;
    }
  }
  const empty0 = board.slice(0, 6).every((v) => v === 0);
  const empty1 = board.slice(7, 13).every((v) => v === 0);
  let over = false;
  if (empty0 || empty1) {
    over = true;
    for (let k = 0; k < 6; k++) {
      board[6] += board[k];
      board[k] = 0;
      board[13] += board[7 + k];
      board[7 + k] = 0;
    }
  }
  return { board, extra, over };
}

test('posición inicial: 4 semillas en cada hoyo, depósitos vacíos y mueve el jugador de abajo', () => {
  for (const seeds of [3, 4, 6]) {
    const p = new Position(seeds);
    assert.deepEqual([...p.b], [seeds, seeds, seeds, seeds, seeds, seeds, 0, seeds, seeds, seeds, seeds, seeds, seeds, 0]);
    assert.equal(p.turn, 0);
    assert.deepEqual(p.moves(), [0, 1, 2, 3, 4, 5]);
  }
  assert.deepEqual(STORE, [6, 13]);
  assert.equal(pitOf(1, 0), 7);
  assert.equal(opposite(0), 12);
  assert.equal(opposite(7), 5);
  assert.equal(PITS, 6);
});

test('sembrar: una semilla por casilla en sentido contrario, saltea el depósito del rival', () => {
  const p = new Position(4);
  const r = p.make(0); // 4 semillas: hoyos 1, 2, 3, 4
  assert.deepEqual(r.path, [1, 2, 3, 4]);
  assert.deepEqual([...p.b], [0, 5, 5, 5, 5, 4, 0, 4, 4, 4, 4, 4, 4, 0]);
  // desde el hoyo 5 con 4 semillas: depósito propio y luego el lado del rival
  const q = new Position(4);
  const r2 = q.make(5);
  assert.deepEqual(r2.path, [6, 7, 8, 9]);
  // una vuelta larga no toca el depósito del rival
  const b = new Int8Array(14).fill(0);
  b[12] = 20;
  b[0] = 1;
  const z = Position.parse(b, 1);
  const r3 = z.make(12);
  assert.ok(!r3.path.includes(6), 'el jugador 1 saltea el depósito 6');
  assert.equal(r3.path.filter((i) => i === 13).length, 2);
});

test('turno extra: si la última semilla cae en tu depósito, jugás otra vez', () => {
  const p = new Position(4);
  const r = p.make(2); // 2 + 4 = 6
  assert.equal(r.extra, true);
  assert.equal(p.turn, 0);
  assert.equal(p.b[6], 1);
  const r2 = p.make(0);
  assert.equal(r2.extra, false);
  assert.equal(p.turn, 1);
  // el jugador 1 también: el hoyo 9 (3.º) con 4 semillas termina en el 13
  const q = new Position(4);
  q.turn = 1;
  q.rehash();
  const r3 = q.make(9);
  assert.equal(r3.extra, true);
  assert.equal(q.turn, 1);
  assert.equal(q.b[13], 1);
});

test('captura: la última semilla en un hoyo propio vacío se lleva las de enfrente', () => {
  const b = new Int8Array(14);
  b[0] = 1; // cae en el hoyo 1, vacío
  b[11] = 5; // enfrente del 1 (12 - 1)
  b[5] = 2;
  b[8] = 2;
  const p = Position.parse(b, 0);
  const r = p.make(0);
  assert.deepEqual(r.capture, { pit: 1, opp: 11, amount: 6 });
  assert.equal(p.b[6], 6);
  assert.equal(p.b[1], 0);
  assert.equal(p.b[11], 0);
  assert.equal(p.turn, 1);
  // si enfrente no hay nada no se captura y la semilla se queda
  const c = new Int8Array(14);
  c[0] = 1;
  c[5] = 1;
  c[8] = 1;
  const q = Position.parse(c, 0);
  const r2 = q.make(0);
  assert.equal(r2.capture, null);
  assert.equal(q.b[1], 1);
  // caer en un hoyo del rival nunca captura
  const d = new Int8Array(14);
  d[5] = 2;
  d[0] = 1;
  d[8] = 3;
  const w = Position.parse(d, 0);
  assert.equal(w.make(5).capture, null);
});

test('una vuelta completa que termina en el hoyo de origen (vacío al sembrar) también captura', () => {
  const b = new Int8Array(14);
  b[2] = 13;
  b[10] = 3;
  b[0] = 1;
  const p = Position.parse(b, 0);
  const r = p.make(2);
  assert.equal(r.path.length, 13);
  assert.equal(r.path[12], 2);
  assert.deepEqual(r.capture && [r.capture.pit, r.capture.opp], [2, 10]);
});

test('el final: cuando un lado se queda sin semillas, el otro se lleva las suyas y gana el depósito más grande', () => {
  const b = new Int8Array(14);
  b[5] = 1; // pasa al depósito: turno extra, y entonces el lado 0 queda vacío
  b[8] = 3;
  b[10] = 2;
  b[6] = 10;
  b[13] = 12;
  const p = Position.parse(b, 0);
  const r = p.make(5);
  assert.equal(p.over, true);
  assert.deepEqual(r.sweep, [0, 5]);
  assert.deepEqual([p.b[6], p.b[13]], [11, 17]);
  assert.deepEqual(p.status(), { over: true, winner: 1, counts: [11, 17], reason: 'count' });
  assert.deepEqual(p.moves(), []);
  // empate
  const t = Position.parse(Int8Array.from([0, 0, 0, 0, 0, 1, 5, 0, 0, 0, 0, 0, 1, 5]), 0);
  t.make(5);
  assert.equal(t.status().winner, null);
});

test('coincide con la referencia sencilla en miles de jugadas al azar', () => {
  let seed = 31;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  let moves = 0;
  for (let g = 0; g < 400; g++) {
    const seeds = [3, 4, 6][g % 3];
    const p = new Position(seeds);
    while (!p.over) {
      const ms = p.moves();
      const m = ms[Math.floor(rnd() * ms.length)];
      const before = Array.from(p.b);
      const turn = p.turn;
      const expect = ref(before, turn, m);
      const r = p.make(m);
      assert.deepEqual(Array.from(p.b), expect.board);
      assert.equal(r.extra, expect.extra);
      assert.equal(p.over, expect.over);
      if (!p.over) assert.equal(p.turn, expect.extra ? turn : turn ^ 1);
      assert.equal(p.b.reduce((a, v) => a + v, 0), seeds * 12, 'no se pierde ni se inventa ninguna semilla');
      moves++;
    }
  }
  assert.ok(moves > 8000);
});

test('landing dice dónde cae la última semilla y el hash cambia con la posición y el turno', () => {
  const p = new Position(4);
  assert.equal(p.landing(2), 6);
  assert.equal(p.landing(0), 4);
  assert.equal(p.landing(5), 9);
  const h = p.h;
  const q = p.clone();
  assert.equal(q.h, h);
  q.make(0);
  assert.notEqual(q.h, h);
  const t = Position.parse(p.b, 1);
  assert.notEqual(t.h, h);
});

test('notación y repaso', () => {
  const p = new Position(4);
  assert.equal(fromStr(p.moves(), '2'), 2);
  assert.equal(fromStr(p.moves(), '7'), -1, 'no es un hoyo del que mueve');
  assert.equal(fromStr(p.moves(), 'x'), -1);
  assert.equal(fromStr(p.moves(), 2), -1);
  assert.equal(moveStr(9), '9');
  const r = replay(['2', '0', '8']);
  assert.ok(r);
  assert.equal(r.pos.n, 3);
  assert.equal(r.made[0].extra, true);
  assert.equal(replay(['2', '7']), null);
  assert.equal(replay(['0'], 6).pos.seeds, 6);
});

// ------------------------------------------------------------------ motor

test('motor: la jugada única se devuelve enseguida y sin jugadas no hay jugada', () => {
  const e = new Engine();
  const b = new Int8Array(14);
  b[3] = 2;
  b[9] = 3;
  const p = Position.parse(b, 0);
  const r = e.think(p, { depth: 6, time: 300 });
  assert.equal(r.move, 3);
  assert.equal(r.forced, true);
  const over = Position.parse(new Int8Array(14), 0);
  assert.equal(e.think(over, { depth: 3 }).move, -1);
});

test('motor: ve las capturas grandes y los turnos extra', () => {
  const e = new Engine();
  // una captura grande a la vista
  const b = new Int8Array(14);
  b[1] = 1; // cae en el 2, vacío
  b[10] = 9; // enfrente del 2
  b[3] = 1; // otra captura, de 2 semillas
  b[8] = 1;
  const p = Position.parse(b, 0);
  assert.equal(e.think(p, { depth: 6, time: 500 }).move, 1);
  // con un turno extra disponible y nada más en juego, lo toma: el hoyo 5 con 1 semilla cae en el depósito
  const c = new Int8Array(14);
  c[5] = 1;
  c[3] = 1;
  c[9] = 1;
  c[12] = 1;
  const q = Position.parse(c, 0);
  assert.equal(e.think(q, { depth: 6, time: 500 }).move, 5);
});

test('motor: respeta el tiempo y juega siempre jugadas legales (también con ruido)', () => {
  const e = new Engine();
  const p = new Position(4);
  const t0 = performance.now();
  const r = e.think(p, { depth: 40, time: 150 });
  assert.ok(performance.now() - t0 < 450);
  assert.ok(r.depth >= 6 && p.moves().includes(r.move));
  for (const lv of [1, 2, 3]) {
    const q = new Position(4);
    for (let i = 0; i < 60 && !q.over; i++) {
      const m = e.think(q, { ...LEVELS[lv], time: 40 }).move;
      assert.ok(q.moves().includes(m), `nivel ${lv}`);
      q.make(m);
    }
  }
  assert.ok(evaluate(new Position(4)) === 0);
});

test('motor: un nivel más alto le gana a uno más bajo', () => {
  const e1 = new Engine();
  const e2 = new Engine();
  let hi = 0;
  let lo = 0;
  for (let g = 0; g < 6; g++) {
    const hiFirst = g % 2 === 0;
    const p = new Position(4);
    while (!p.over) {
      const hiTurn = (p.turn === 0) === hiFirst;
      const lv = hiTurn ? 4 : 1;
      p.make((hiTurn ? e1 : e2).think(p, { ...LEVELS[lv], time: 60 }).move);
    }
    const [a, b] = [p.b[6], p.b[13]];
    const hiS = hiFirst ? a : b;
    const loS = hiFirst ? b : a;
    if (hiS > loS) hi++;
    else if (loS > hiS) lo++;
  }
  assert.ok(hi >= 5 && lo === 0, `nivel 4 ganó ${hi}, nivel 1 ganó ${lo}`);
});

// ------------------------------------------------------------------ servidor

function fakeTable(settings = {}) {
  const room = { players: new Map(), settings: { ...mancala.defaults, ...settings }, state: 'playing', data: null };
  for (const id of ['a', 'b']) room.players.set(id, { id, connected: true, name: id.toUpperCase() });
  const log = { sent: [], ended: [] };
  const timers = new Map();
  const api = {
    players: () => [...room.players.values()],
    setTimer: (n, ms, fn) => timers.set(n, { ms, fn }),
    clearTimer: (n) => timers.delete(n),
    sync: () => {},
    touch: () => {},
    send: (id, m) => log.sent.push([id, m]),
    end: (p) => {
      room.state = 'finished';
      log.ended.push(p);
    },
    broadcast: () => {},
  };
  const play = (id, m) => mancala.message(room, api, room.players.get(id), { t: 'move', m });
  return { room, api, log, timers, play, start: () => mancala.start(room, api) };
}

test('servidor: ajustes, turnos, turno extra con el reloj de quien sigue y tiempo', () => {
  assert.deepEqual(mancala.settings({ ...mancala.defaults }, { tc: '99+9', seeds: '5', public: 'si' }), mancala.defaults);
  assert.deepEqual(mancala.settings({ ...mancala.defaults }, { tc: '2+0', seeds: '6', public: true }), { tc: '2+0', seeds: '6', public: true });
  const tb = fakeTable({ tc: '3+2', seeds: '4' });
  tb.start();
  const d = tb.room.data;
  const [f, s] = [d.first, d.second];
  assert.deepEqual(mancala.view(tb.room).mancala.clock, [180000, 180000]);
  tb.play(s, '8');
  assert.deepEqual(tb.log.sent.pop(), [s, { t: 'error', code: 'not_your_turn' }]);
  assert.equal(tb.play(f, '7'), false, 'ese hoyo es del otro');
  assert.equal(tb.play(f, 'x'), false);
  assert.deepEqual(d.moves, []);
  assert.equal(tb.play(f, '2'), true); // turno extra: sigue el mismo
  assert.equal(d.pos.turn, 0);
  assert.equal(d.running, -1, 'el reloj arranca con la segunda jugada');
  assert.equal(tb.play(f, '0'), true);
  assert.equal(d.running, 1, 'ahora le toca al otro');
  d.since = Date.now() - 3000;
  assert.equal(tb.play(s, '9'), true); // 9 es el 3.º hoyo del jugador 1 y cae en su depósito
  assert.equal(d.pos.turn, 1);
  assert.equal(d.running, 1, 'tras un turno extra el reloj sigue siendo suyo');
  assert.ok(d.clock[1] > 180000 + 2000 - 3200 && d.clock[1] <= 180000 + 2000 - 2800, `reloj ${d.clock[1]}`);
  d.clock[1] = 40;
  d.since = Date.now() - 300;
  tb.timers.get('clock').fn();
  assert.equal(tb.log.ended.at(-1).result.winner, 0);
  assert.equal(tb.log.ended.at(-1).result.reason, 'timeout');
  // revancha: empieza el otro
  assert.equal(mancala.command(tb.room, tb.api, tb.room.players.get('a'), { t: 'again' }), true);
  mancala.command(tb.room, tb.api, tb.room.players.get('b'), { t: 'again' });
  assert.equal(tb.room.state, 'playing');
  assert.notEqual(tb.room.data.first, f);
});

test('servidor: el final sale del conteo, rendición, abandono y anulación', () => {
  const tb = fakeTable();
  tb.start();
  const d = tb.room.data;
  d.pos = Position.parse(Int8Array.from([0, 0, 0, 0, 0, 1, 10, 0, 0, 3, 0, 0, 0, 12]), 0);
  d.moves = ['x', 'y'];
  d.running = 0;
  assert.equal(tb.play(d.first, '5'), true);
  const res = tb.log.ended.at(-1).result;
  assert.deepEqual([res.winner, res.reason, res.counts], [1, 'count', [11, 15]]);
  const t2 = fakeTable();
  t2.start();
  mancala.message(t2.room, t2.api, t2.room.players.get(t2.room.data.second), { t: 'resign' });
  assert.deepEqual([t2.log.ended.at(-1).result.winner, t2.log.ended.at(-1).result.reason], [0, 'resign']);
  const t3 = fakeTable();
  t3.start();
  mancala.leave(t3.room, t3.api, t3.room.data.first);
  assert.equal(t3.log.ended.at(-1).result.reason, 'aborted');
  const t4 = fakeTable();
  t4.start();
  t4.play(t4.room.data.first, '0');
  t4.play(t4.room.data.second, '8');
  mancala.leave(t4.room, t4.api, t4.room.data.second);
  assert.deepEqual([t4.log.ended.at(-1).result.winner, t4.log.ended.at(-1).result.reason], [0, 'abandon']);
  const t5 = fakeTable();
  t5.start();
  t5.timers.get('clock').fn();
  assert.equal(t5.log.ended.at(-1).result.reason, 'aborted');
});

test('servidor (red): sala pública, partida con reconexión y revancha', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    a.send({ t: 'create', game: 'mancala', name: 'Ana', settings: { public: true, tc: '10+0', seeds: '6' } });
    await wait(200);
    const code = a.last('joined').code;
    const q = await connect(srv.port);
    q.send({ t: 'list', game: 'mancala' });
    await wait(150);
    const listed = q.last('list').rooms;
    assert.deepEqual([listed[0].code, listed[0].n, listed[0].max, listed[0].tc, listed[0].seeds], [code, 1, 2, '10+0', '6']);
    q.ws.close();
    const b = await connect(srv.port);
    b.send({ t: 'join', game: 'mancala', code, name: 'Beto' });
    await wait(250);
    a.send({ t: 'start' });
    await wait(300);
    const g = a.last('room').room.mancala;
    assert.equal(g.seeds, 6);
    const meA = a.last('joined').id;
    const first = g.first === meA ? a : b;
    const second = first === a ? b : a;
    second.send({ t: 'move', m: '8' });
    await wait(120);
    assert.equal(second.last('error')?.code, 'not_your_turn');
    first.send({ t: 'move', m: '0' }); // 6 semillas desde el hoyo 0 terminan en el 6: turno extra
    await wait(150);
    first.send({ t: 'move', m: '1' });
    await wait(150);
    assert.deepEqual(second.last('room').room.mancala.moves, ['0', '1']);
    const sess = { code, token: second.last('joined').token };
    second.ws.close();
    await wait(200);
    const s2 = await connect(srv.port);
    s2.send({ t: 'join', game: 'mancala', code: sess.code, token: sess.token, name: 'x' });
    await wait(300);
    assert.deepEqual(s2.last('room').room.mancala.moves, ['0', '1']);
    s2.send({ t: 'resign' });
    await wait(200);
    const end = first.last('end');
    assert.equal(end.result.reason, 'resign');
    assert.equal(end.result.winner, 0);
    s2.send({ t: 'again' });
    first.send({ t: 'again' });
    await wait(300);
    const g3 = first.last('room').room.mancala;
    assert.equal(g3.n, 2);
    assert.deepEqual(g3.moves, []);
    assert.notEqual(g3.first, g.first);
    s2.ws.close();
    first.ws.close();
  } finally {
    srv.stop();
  }
});
