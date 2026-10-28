/** Reversi: las reglas (pases, final, vueltas), el motor de la compu (incluido el final exacto) y la partida online. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Position, BLACK, WHITE, sqName, sqIndex, flipsAt, canMove, fromStr, moveStr, replay } from '../public/games/reversi/shared/rules.js';
import { Engine, LEVELS, evaluate } from '../public/games/reversi/shared/engine.js';
import reversi from '../server/games/reversi.js';
import { startServer, connect, wait } from './helpers.mjs';

const perft = (p, d) => {
  if (d === 0) return 1;
  const ms = p.moves();
  if (!ms.length) return 1;
  let n = 0;
  for (const m of ms) {
    const u = p.make(m);
    n += perft(p, d - 1);
    p.unmake(u);
  }
  return n;
};
const names = (p) => p.moves().map(sqName).sort();
/** Valor exacto (diferencia de fichas para el que mueve) probando todas las partidas, sin podas. */
function brute(p) {
  const ms = p.moves();
  const turn = p.turn;
  if (!ms.length) return p.cnt[turn] - p.cnt[turn ^ 1];
  let best = -99;
  for (const m of ms) {
    const u = p.make(m);
    const v = p.turn === turn ? brute(p) : -brute(p);
    p.unmake(u);
    if (v > best) best = v;
  }
  return best;
}
const PASS_ROWS = ['........', '........', '........', '........', 'bbbbw.w.', '........', '........', '........'];

test('geometría y notación: a1 arriba a la izquierda, h8 abajo a la derecha', () => {
  assert.equal(sqIndex('a1'), 0);
  assert.equal(sqIndex('h8'), 63);
  assert.equal(sqIndex('d3'), 19);
  assert.equal(sqName(63), 'h8');
  for (let s = 0; s < 64; s++) assert.equal(sqIndex(sqName(s)), s);
  assert.equal(sqIndex('i1'), -1);
  assert.equal(sqIndex(3), -1);
});

test('posición inicial: cuatro fichas, mueven las negras y tienen cuatro jugadas', () => {
  const p = new Position();
  assert.deepEqual(p.cnt, [2, 2]);
  assert.equal(p.turn, BLACK);
  assert.deepEqual(p.toRows(), ['........', '........', '........', '...wb...', '...bw...', '........', '........', '........']);
  assert.deepEqual(names(p), ['c4', 'd3', 'e6', 'f5']);
  assert.equal(p.empties(), 60);
  assert.equal(p.status().over, false);
});

test('perft: coincide con los números conocidos del Reversi', () => {
  const p = new Position();
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((d) => perft(p, d)), [4, 12, 56, 244, 1396, 8200, 55092]);
});

test('una jugada da vuelta todas las líneas que cierra y solo esas', () => {
  const start = Position.parse(['........', '........', '........', '...wb...', '...bw...', '........', '........', '........'], BLACK);
  assert.deepEqual(flipsAt(start.b, sqIndex('d3'), BLACK).map(sqName), ['d4']);
  // la columna d (d3 y d4 blancas, d5 negra) y la fila 3 (d3 blanca, e3 negra)
  const m = Position.parse(['........', '........', '...wb...', '...w....', '...b....', '........', '........', '........'], BLACK);
  assert.deepEqual(flipsAt(m.b, sqIndex('c3'), BLACK).map(sqName), ['d3']);
  assert.deepEqual(flipsAt(m.b, sqIndex('d2'), BLACK).map(sqName).sort(), ['d3', 'd4']);
  assert.equal(flipsAt(m.b, sqIndex('a1'), BLACK), null);
  assert.equal(flipsAt(m.b, sqIndex('d3'), BLACK), null, 'una casilla ocupada no es jugada');
  // dos líneas a la vez: c3 cierra la fila (d3 con e3) y la diagonal (d4 con e5)
  const two = Position.parse(['........', '........', '...wb...', '...w....', '....b...', '........', '........', '........'], BLACK);
  assert.deepEqual(flipsAt(two.b, sqIndex('c3'), BLACK).map(sqName).sort(), ['d3', 'd4']);
  // la misma casilla para el otro color no cierra nada
  assert.equal(flipsAt(two.b, sqIndex('c3'), WHITE), null);
});

test('las filas se cierran contra una ficha propia, no contra un vacío ni el borde', () => {
  const p = Position.parse(['........', '........', '........', '........', '.wwwb...', '........', '........', '........'], BLACK);
  assert.deepEqual(names(p), ['a5']);
  assert.deepEqual(flipsAt(p.b, sqIndex('a5'), BLACK).map(sqName), ['b5', 'c5', 'd5']);
  const q = Position.parse(['........', '........', '........', '........', 'wwww....', '........', '........', '........'], BLACK);
  assert.equal(q.moves().length, 0, 'hasta el borde no cierra');
});

test('hacer, deshacer y el hash incremental no se desfasan', () => {
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  for (let g = 0; g < 8; g++) {
    const p = new Position();
    const stack = [];
    for (;;) {
      const ms = p.moves();
      if (!ms.length) break;
      const before = [...p.b, p.turn, p.n, p.cnt[0], p.cnt[1], p.h1, p.h2].join(',');
      const u = p.make(ms[Math.floor(rnd() * ms.length)]);
      stack.push([u, before]);
      const q = p.clone();
      q.rehash();
      assert.equal(q.h1, p.h1);
      assert.equal(q.h2, p.h2);
      assert.equal(p.cnt[0] + p.cnt[1], 4 + p.n);
      assert.equal(p.cnt[0], [...p.b].filter((v) => v === BLACK).length);
    }
    while (stack.length) {
      const [u, before] = stack.pop();
      p.unmake(u);
      assert.equal([...p.b, p.turn, p.n, p.cnt[0], p.cnt[1], p.h1, p.h2].join(','), before);
    }
  }
});

test('pase automático: si el rival no puede mover sigue el mismo jugador', () => {
  const p = Position.parse(PASS_ROWS, BLACK);
  assert.deepEqual(names(p), ['f5']);
  p.make(sqIndex('f5'));
  // el blanco no tiene jugadas (todas las negras llegan al borde): le toca otra vez al negro
  assert.equal(p.turn, BLACK);
  assert.equal(canMove(p.b, WHITE), false);
  assert.deepEqual(names(p), ['h5']);
  assert.equal(p.status().over, false);
  p.make(sqIndex('h5'));
  assert.deepEqual(p.cnt, [8, 0]);
  assert.deepEqual(p.status(), { over: true, winner: BLACK, counts: [8, 0], reason: 'count' });
  // el hash cuenta el turno también en los pases: dos posiciones con distinto que mueve no colisionan
  const a = Position.parse(PASS_ROWS, BLACK);
  const b = Position.parse(PASS_ROWS, BLACK);
  b.turn = WHITE;
  b.rehash();
  assert.notEqual(a.h1, b.h1);
});

test('el final: nadie puede mover, gana quien tiene más fichas y puede haber empate', () => {
  const full = Position.parse(['bbbbbbbb', 'bbbbbbbb', 'bbbbbbbb', 'bbbbbbbb', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww'], BLACK);
  assert.deepEqual(full.status(), { over: true, winner: null, counts: [32, 32], reason: 'count' });
  const more = Position.parse(['bbbbbbbb', 'bbbbbbbb', 'bbbbbbbb', 'bbbbbbbb', 'bwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww'], BLACK);
  assert.equal(more.status().winner, BLACK);
  // un lado sin fichas: no hay jugadas para nadie
  const wiped = Position.parse(['bb......', '........', '........', '........', '........', '........', '........', '........'], WHITE);
  assert.equal(wiped.moves().length, 0);
  assert.equal(wiped.status().over, true);
  assert.equal(wiped.status().winner, BLACK);
  // si el que debería mover no puede pero el otro sí, parse resuelve el pase
  const q = Position.parse(PASS_ROWS, WHITE);
  assert.equal(q.turn, BLACK);
});

test('notación y repaso de partidas', () => {
  const p = new Position();
  assert.equal(fromStr(p.moves(), 'd3'), 19);
  assert.equal(fromStr(p.moves(), 'a1'), -1);
  assert.equal(fromStr(p.moves(), 7), -1);
  assert.equal(moveStr(19), 'd3');
  const r = replay(['d3', 'c3', 'c4']);
  assert.ok(r);
  assert.equal(r.pos.n, 3);
  assert.deepEqual(r.made.map((m) => m.by), [BLACK, WHITE, BLACK]);
  assert.deepEqual(r.made[0].flips.map(sqName), ['d4']);
  assert.equal(replay(['d3', 'd3']), null);
  assert.equal(replay(['zz']), null);
  assert.equal(replay([]).pos.n, 0);
});

// ------------------------------------------------------------------ motor

test('motor: toma la esquina que se le ofrece', () => {
  const e = new Engine();
  const p = Position.parse(['.wb.....', '........', '........', '...w....', '....b...', '........', '........', '........'], BLACK);
  assert.deepEqual(names(p), ['a1', 'c3'].sort());
  // los niveles 2 y 3 puntúan igual las dos jugadas a partir de la segunda mirada y eligen con ruido: ahí vale cualquiera de las dos
  for (const lv of [1, 4, 5]) assert.equal(sqName(e.think(p, { ...LEVELS[lv], time: 1500 }).move), 'a1');
  for (const lv of [2, 3]) assert.ok(['a1', 'c3'].includes(sqName(e.think(p, { ...LEVELS[lv], time: 1500 }).move)));
});

test('motor: una sola jugada se devuelve enseguida y sin jugadas no hay jugada', () => {
  const e = new Engine();
  const p = Position.parse(PASS_ROWS, BLACK);
  const r = e.think(p, { depth: 6, time: 300 });
  assert.equal(sqName(r.move), 'f5');
  assert.equal(r.forced, true);
  const dead = Position.parse(['bb......', '........', '........', '........', '........', '........', '........', '........'], WHITE);
  assert.equal(e.think(dead, { depth: 4 }).move, -1);
});

test('motor: el final exacto coincide con probar todas las partidas (también con pases)', () => {
  const e = new Engine();
  let seed = 3;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  let checked = 0;
  for (let g = 0; g < 14; g++) {
    const p = new Position();
    const target = 6 + (g % 4);
    while (p.empties() > target) {
      const ms = p.moves();
      if (!ms.length) break;
      p.make(ms[Math.floor(rnd() * ms.length)]);
    }
    if (!p.moves().length) continue;
    const truth = brute(p.clone());
    e.clear();
    const r = e.think(p, { depth: 20, time: 5000, noise: 0, solve: 20 });
    assert.equal(r.exact, true);
    if (!r.forced) assert.equal(r.score, truth, `vacías ${p.empties()}`);
    // la jugada elegida alcanza ese valor
    const q = p.clone();
    const turn = q.turn;
    q.make(r.move);
    const v = q.turn === turn ? brute(q) : -brute(q);
    assert.equal(v, truth);
    checked++;
  }
  assert.ok(checked >= 10);
});

test('motor: respeta el tiempo, la profundidad y siempre juega jugadas legales (con ruido también)', () => {
  const e = new Engine();
  const p = new Position();
  const t0 = performance.now();
  const r = e.think(p, { depth: 30, time: 150 });
  assert.ok(performance.now() - t0 < 450);
  assert.ok(r.depth >= 4 && p.moves().includes(r.move));
  assert.ok(e.think(p, { depth: 2, time: 5000 }).depth <= 2);
  for (const lv of [1, 2, 3]) {
    const q = new Position();
    for (let i = 0; i < 30 && q.moves().length; i++) {
      const m = e.think(q, { ...LEVELS[lv], time: 40 }).move;
      assert.ok(q.moves().includes(m), `nivel ${lv}`);
      q.make(m);
    }
  }
});

test('motor: un nivel más alto le gana a uno más bajo y la evaluación ve las esquinas', () => {
  const e1 = new Engine();
  const e2 = new Engine();
  let hi = 0;
  let lo = 0;
  for (let g = 0; g < 4; g++) {
    const hiBlack = g % 2 === 0;
    const p = new Position();
    while (p.moves().length) {
      const hiTurn = (p.turn === BLACK) === hiBlack;
      const lv = hiTurn ? 4 : 1;
      p.make((hiTurn ? e1 : e2).think(p, { ...LEVELS[lv], time: 60 }).move);
    }
    const [b, w] = p.cnt;
    const hiDiscs = hiBlack ? b : w;
    const loDiscs = hiBlack ? w : b;
    if (hiDiscs > loDiscs) hi++;
    else if (loDiscs > hiDiscs) lo++;
  }
  assert.ok(hi >= 3 && lo === 0, `nivel 4 ganó ${hi}, nivel 1 ganó ${lo}`);
  const corner = Position.parse(['b.......', '........', '........', '........', '........', '........', '........', '.......w'], BLACK);
  assert.ok(evaluate(corner) > 0 || evaluate(corner) === 0);
  const mine = Position.parse(['b.......', '........', '........', '...bw...', '........', '........', '........', '........'], WHITE);
  const theirs = Position.parse(['w.......', '........', '........', '...bw...', '........', '........', '........', '........'], WHITE);
  assert.ok(evaluate(theirs) > evaluate(mine), 'la esquina propia vale más que la del rival');
});

// ------------------------------------------------------------------ servidor

/** Sala y API falsas para probar el módulo del servidor sin red ni relojes de verdad. */
function fakeTable(settings = {}) {
  const room = { players: new Map(), settings: { ...reversi.defaults, ...settings }, state: 'playing', data: null };
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
  const play = (id, m) => reversi.message(room, api, room.players.get(id), { t: 'move', m });
  return { room, api, log, timers, play, start: () => reversi.start(room, api) };
}

test('servidor: ajustes, colores que se alternan, turnos, reloj con incremento y tiempo', () => {
  assert.deepEqual(reversi.settings({ ...reversi.defaults }, { tc: '99+9', public: 'si' }), reversi.defaults);
  assert.deepEqual(reversi.settings({ ...reversi.defaults }, { tc: '2+0', public: true }), { tc: '2+0', public: true });
  const tb = fakeTable({ tc: '3+2' });
  tb.start();
  const d = tb.room.data;
  const [bl, wh] = [d.black, d.white];
  assert.deepEqual(reversi.view(tb.room).reversi.clock, [180000, 180000]);
  // las blancas no pueden abrir; una casilla ilegal o un dato raro no cambia nada
  tb.play(wh, 'd3');
  assert.deepEqual(tb.log.sent.pop(), [wh, { t: 'error', code: 'not_your_turn' }]);
  assert.equal(tb.play(bl, 'a1'), false);
  assert.equal(tb.play(bl, 9), false);
  assert.deepEqual(d.moves, []);
  assert.equal(tb.play(bl, 'd3'), true);
  assert.equal(d.running, -1, 'el reloj arranca con la segunda jugada');
  assert.equal(tb.play(wh, 'c3'), true);
  assert.equal(d.running, 0, 'le toca a las negras');
  d.since = Date.now() - 4000;
  assert.equal(tb.play(bl, 'c4'), true);
  assert.ok(d.clock[0] > 180000 + 2000 - 4200 && d.clock[0] <= 180000 + 2000 - 3800, `reloj ${d.clock[0]}`);
  // se acaba el tiempo de las blancas
  d.clock[1] = 50;
  d.since = Date.now() - 300;
  tb.timers.get('clock').fn();
  assert.equal(tb.log.ended.at(-1).result.winner, 0);
  assert.equal(tb.log.ended.at(-1).result.reason, 'timeout');
  // revancha con los colores cambiados
  tb.log.ended.length = 0;
  assert.equal(reversi.command(tb.room, tb.api, tb.room.players.get('a'), { t: 'again' }), true);
  assert.equal(tb.room.state, 'finished');
  reversi.command(tb.room, tb.api, tb.room.players.get('b'), { t: 'again' });
  assert.equal(tb.room.state, 'playing');
  assert.notEqual(tb.room.data.black, bl);
});

test('servidor: el pase no cambia el turno, el final sale del conteo y rendición, abandono y anulación', () => {
  const tb = fakeTable();
  tb.start();
  const d = tb.room.data;
  d.pos = Position.parse(PASS_ROWS, BLACK);
  d.moves = ['x1', 'x2']; // el reloj ya corre
  d.running = 0;
  assert.equal(tb.play(d.black, 'f5'), true);
  assert.equal(d.pos.turn, BLACK, 'las blancas pasan');
  assert.equal(d.running, 0, 'el reloj sigue con las negras');
  assert.equal(tb.play(d.black, 'h5'), true);
  const res = tb.log.ended.at(-1).result;
  assert.deepEqual([res.winner, res.reason, res.counts], [0, 'count', [8, 0]]);
  // rendición
  const t2 = fakeTable();
  t2.start();
  reversi.message(t2.room, t2.api, t2.room.players.get(t2.room.data.white), { t: 'resign' });
  assert.deepEqual([t2.log.ended.at(-1).result.winner, t2.log.ended.at(-1).result.reason], [0, 'resign']);
  // abandono y anulación antes de la segunda jugada
  const t3 = fakeTable();
  t3.start();
  reversi.leave(t3.room, t3.api, t3.room.data.black);
  assert.equal(t3.log.ended.at(-1).result.reason, 'aborted');
  const t4 = fakeTable();
  t4.start();
  t4.play(t4.room.data.black, 'd3');
  t4.play(t4.room.data.white, 'c3');
  reversi.leave(t4.room, t4.api, t4.room.data.white);
  assert.deepEqual([t4.log.ended.at(-1).result.winner, t4.log.ended.at(-1).result.reason], [0, 'abandon']);
  const t5 = fakeTable();
  t5.start();
  t5.timers.get('clock').fn();
  assert.equal(t5.log.ended.at(-1).result.reason, 'aborted');
  assert.equal(reversi.message(t5.room, t5.api, t5.room.players.get('a'), { t: 'move', m: 'd3' }), true, 'terminada: se ignora');
});

test('servidor (red): sala pública, partida con reconexión y revancha', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    a.send({ t: 'create', game: 'reversi', name: 'Ana', settings: { public: true, tc: '10+0' } });
    await wait(200);
    const code = a.last('joined').code;
    const q = await connect(srv.port);
    q.send({ t: 'list', game: 'reversi' });
    await wait(150);
    const listed = q.last('list').rooms;
    assert.deepEqual([listed[0].code, listed[0].n, listed[0].max, listed[0].tc], [code, 1, 2, '10+0']);
    q.ws.close();
    const b = await connect(srv.port);
    b.send({ t: 'join', game: 'reversi', code, name: 'Beto' });
    await wait(250);
    a.send({ t: 'start' });
    await wait(300);
    const g = a.last('room').room.reversi;
    const meA = a.last('joined').id;
    const black = g.black === meA ? a : b;
    const white = black === a ? b : a;
    white.send({ t: 'move', m: 'd3' });
    await wait(120);
    assert.equal(white.last('error')?.code, 'not_your_turn');
    black.send({ t: 'move', m: 'd3' });
    await wait(150);
    white.send({ t: 'move', m: 'c3' });
    await wait(150);
    assert.deepEqual(black.last('room').room.reversi.moves, ['d3', 'c3']);
    const sess = { code, token: white.last('joined').token };
    white.ws.close();
    await wait(200);
    const w2 = await connect(srv.port);
    w2.send({ t: 'join', game: 'reversi', code: sess.code, token: sess.token, name: 'x' });
    await wait(300);
    assert.deepEqual(w2.last('room').room.reversi.moves, ['d3', 'c3']);
    w2.send({ t: 'resign' });
    await wait(200);
    const end = black.last('end');
    assert.equal(end.result.reason, 'resign');
    assert.equal(end.result.winner, 0);
    w2.send({ t: 'again' });
    black.send({ t: 'again' });
    await wait(300);
    const g3 = black.last('room').room.reversi;
    assert.equal(g3.n, 2);
    assert.deepEqual(g3.moves, []);
    assert.notEqual(g3.black, g.black);
    w2.ws.close();
    black.ws.close();
  } finally {
    srv.stop();
  }
});

