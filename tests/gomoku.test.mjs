/** 5 en línea (Gomoku): las reglas, la compu y la partida online. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Position, SIZES, SIZE_IDS, BLACK, WHITE, moveStr, fromStr, replay, isSize, xy } from '../public/games/gomoku/shared/rules.js';
import { Engine, LEVELS } from '../public/games/gomoku/shared/engine.js';
import gomoku from '../server/games/gomoku.js';
import { startServer, connect, wait } from './helpers.mjs';

function mulberry(a) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Juega las cruces (x, y) de a una, alternando desde las negras, y devuelve la posición. */
function setup(n, cells) {
  const p = new Position(n);
  for (const [x, y] of cells) p.play(y * n + x);
  return p;
}

test('tamaños y notación', () => {
  assert.deepEqual(SIZE_IDS, ['s', 'm', 'l']);
  assert.deepEqual(SIZE_IDS.map((k) => SIZES[k]), [9, 13, 15]);
  assert.ok(isSize('m') && !isSize('xl') && !isSize('toString') && !isSize(13));
  assert.equal(moveStr(112), '112');
  assert.equal(fromStr(15, '112'), 112);
  assert.equal(fromStr(15, '225'), -1, 'fuera del tablero');
  for (const bad of ['x', '', '-1', '1.5', ' 3', '3 ', 'abc']) assert.equal(fromStr(15, bad), -1);
  assert.equal(fromStr(15, 112), -1, 'solo texto');
  assert.deepEqual(xy(15, 32), [2, 2]);
});

test('reglas: las negras empiezan, se alterna y la fila de 5 gana en las cuatro direcciones', () => {
  const dirs = { horizontal: [1, 0], vertical: [0, 1], diagonal: [1, 1], contradiagonal: [1, -1] };
  for (const [name, [dx, dy]] of Object.entries(dirs)) {
    const n = 15;
    const p = new Position(n);
    assert.equal(p.turn, 0);
    const start = [dx < 0 ? 9 : 3, dy < 0 ? 9 : 3];
    // las negras arman la fila y las blancas juegan lejos
    for (let k = 0; k < 5; k++) {
      const bx = start[0] + dx * k;
      const by = start[1] + dy * k;
      const r = p.play(by * n + bx);
      assert.equal(r.by, 0, name);
      assert.equal(r.win !== null, k === 4, `${name} k=${k}`);
      if (k < 4) p.play((12 + (k % 2)) * n + (k + 1) * 2); // blancas lejos de la fila
    }
    assert.equal(p.over, true);
    assert.deepEqual(p.status().winner, 0);
    assert.equal(p.status().line.length, 5);
    assert.deepEqual(p.moves(), [], 'terminada: no hay jugadas');
  }
  // las blancas también ganan
  const q = new Position(15);
  const blackFar = [[0, 0], [0, 2], [0, 4], [0, 6], [0, 8], [0, 10]];
  for (let k = 0; k < 5; k++) {
    q.play(blackFar[k][1] * 15 + blackFar[k][0]);
    const r = q.play(7 * 15 + 3 + k);
    if (k === 4) assert.equal(r.by, 1);
  }
  assert.deepEqual([q.over, q.status().winner], [true, 1]);
});

test('reglas: cuatro no alcanzan, seis o más (juego libre) sí, y la fila devuelta es toda la corrida', () => {
  const n = 15;
  const p = new Position(n);
  const row = (x) => 5 * n + x;
  // negras: 4 seguidas (con un hueco en el medio donde luego se juega para armar 7)
  for (const x of [2, 3, 5, 6]) {
    p.play(row(x));
    p.play(12 * n + x); // blancas abajo, sin fila
  }
  assert.equal(p.over, false, 'dos y dos no son cinco');
  assert.equal(p.lineAt(row(2), BLACK), null);
  p.play(row(4)); // une 2,3,4,5,6 → cinco
  assert.equal(p.over, true);
  assert.deepEqual(p.status().line, [row(2), row(3), row(4), row(5), row(6)]);
  // con dos piedras de cada lado del hueco se forma una fila de 7
  const q = new Position(n);
  for (const x of [1, 2, 3, 5, 6, 7]) {
    q.play(row(x));
    q.play(11 * n + x);
    assert.equal(q.over, false);
  }
  q.play(row(4));
  assert.equal(q.over, true);
  assert.equal(q.status().line.length, 7);
});

test('reglas: empate cuando se llena el tablero sin fila, deshacer y repaso', () => {
  // un tablero de 5×5 lleno sin ninguna fila de 5 de ningún color
  const pattern = ['XXOOX', 'OOXXO', 'XXOOX', 'OOXXO', 'XXOOX'];
  const blacks = [];
  const whites = [];
  pattern.forEach((row, y) => [...row].forEach((c, x) => (c === 'X' ? blacks : whites).push(y * 5 + x)));
  assert.deepEqual([blacks.length, whites.length], [13, 12]);
  const p = new Position(5);
  for (let k = 0; k < 13; k++) {
    p.play(blacks[k]);
    if (k < 12) p.play(whites[k]);
  }
  assert.deepEqual(p.status(), { over: true, winner: null, reason: 'full' });
  // deshacer
  const q = new Position(9);
  const a = q.play(40);
  const b = q.play(41);
  q.unplay(b, 40);
  assert.deepEqual([q.turn, q.count, q.last, q.b[41]], [1, 1, 40, 0]);
  q.unplay(a, -1);
  assert.deepEqual([q.turn, q.count, q.last], [0, 0, -1]);
  // repaso
  const r = replay(['40', '41', '49'], 9);
  assert.deepEqual([r.pos.count, r.pos.turn, r.made.length], [3, 1, 3]);
  assert.equal(replay(['40', '40'], 9), null, 'cruz ocupada');
  assert.equal(replay(['81'], 9), null, 'fuera del tablero');
  assert.equal(replay(['x'], 9), null);
  // no se sigue jugando después de ganar
  const five = ['0', '30', '1', '31', '2', '32', '3', '33', '4'];
  assert.ok(replay(five, 9)?.pos.over);
  assert.equal(replay([...five, '50'], 9), null);
});

// ------------------------------------------------------------------ compu

test('motor: gana si puede, tapa un cuatro, y sin saber de nadie abre en el centro', () => {
  const e = new Engine();
  const n = 15;
  const c = Math.floor(n / 2);
  for (const level of [1, 2, 3, 4, 5]) {
    const empty = new Position(n);
    const first = e.think(empty, { level, rand: mulberry(level) }).move;
    const [x, y] = xy(n, first);
    assert.ok(Math.abs(x - c) <= 2 && Math.abs(y - c) <= 2, `nivel ${level} abre en ${x},${y}`);
  }
  // las negras tienen un cuatro abierto (4,5,6,7 en la fila 7): ganar en 3 o en 8
  const win = setup(n, [[4, 7], [4, 3], [5, 7], [5, 3], [6, 7], [6, 3], [7, 7], [9, 12]]);
  assert.equal(win.turn, 0);
  for (const level of [1, 2, 3, 4, 5]) {
    const m = e.think(win, { level, rand: mulberry(level), time: 200 }).move;
    assert.ok([3 + 7 * n, 8 + 7 * n].includes(m), `nivel ${level} juega ${m}`);
  }
  // las blancas tienen un cuatro y les toca a las negras: hay que taparlo (en 3 o en 8 de la fila 3)
  const block = setup(n, [[10, 10], [4, 3], [10, 12], [5, 3], [12, 12], [6, 3], [13, 9], [7, 3], [1, 1]]);
  assert.equal(block.turn, 1, 'tras 9 piedras le toca a las blancas');
  const block2 = setup(n, [[10, 10], [4, 3], [10, 12], [5, 3], [12, 12], [6, 3], [13, 9], [7, 3]]);
  assert.equal(block2.turn, 0);
  for (const level of [2, 3, 4, 5]) {
    const m = e.think(block2, { level, rand: mulberry(level + 10), time: 200 }).move;
    assert.ok([3 + 3 * n, 8 + 3 * n].includes(m), `nivel ${level} tapa en ${m}`);
  }
});

test('motor: siempre juega una cruz libre y respeta el tiempo', () => {
  const e = new Engine();
  const r = mulberry(4);
  for (const n of [9, 13, 15]) {
    const p = new Position(n);
    for (let k = 0; k < 16; k++) {
      const m = e.think(p, { level: 2, rand: r }).move;
      assert.ok(p.b[m] === 0 && m >= 0 && m < n * n);
      p.play(m);
      if (p.over) break;
    }
    for (const level of [1, 2, 3, 4, 5]) {
      const t0 = performance.now();
      const res = e.think(p, { level, rand: r, time: 150 });
      assert.ok(p.b[res.move] === 0, `nivel ${level}`);
      assert.ok(performance.now() - t0 < 1500, `nivel ${level} se pasó del tiempo`);
    }
  }
  assert.equal(e.think(setup(9, [[0, 0]]).clone(), { level: 3 }).move >= 0, true);
  assert.equal(LEVELS.length, 6);
});

test('motor: un nivel más alto le gana a uno más bajo (aperturas al azar y colores alternados)', () => {
  function play(black, white, n, op, seed) {
    const r = mulberry(seed);
    const p = new Position(n);
    for (const c of op) p.play(c);
    const eng = [new Engine(), new Engine()];
    const lv = [black, white];
    while (!p.over) {
      const who = p.turn;
      p.play(eng[who].think(p, { level: lv[who], rand: r, time: 120 }).move);
    }
    return p.status();
  }
  const n = 9;
  const opening = (seed) => {
    const r = mulberry(seed);
    const cells = [];
    while (cells.length < 4) {
      const i = (2 + Math.floor(r() * 5)) * n + 2 + Math.floor(r() * 5);
      if (!cells.includes(i)) cells.push(i);
    }
    return cells;
  };
  for (const [a, b, need] of [[2, 1, 6], [4, 2, 5]]) {
    let wins = 0;
    let losses = 0;
    for (let g = 0; g < 6; g++) {
      const op = opening(30 + g);
      for (const swap of [0, 1]) {
        const st = swap ? play(b, a, n, op, 5 + g) : play(a, b, n, op, 5 + g);
        const winnerLevel = st.winner === null ? null : st.winner === 0 ? (swap ? b : a) : swap ? a : b;
        if (winnerLevel === a) wins++;
        else if (winnerLevel === b) losses++;
      }
    }
    assert.ok(wins >= need && wins > losses, `nivel ${a} contra ${b}: ${wins}-${losses}`);
  }
});

// ------------------------------------------------------------------ servidor

function fakeTable(settings = {}) {
  const room = { settings: { ...gomoku.defaults, ...settings }, players: new Map(), state: 'playing', data: null, host: 'a' };
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
  const play = (id, m) => gomoku.message(room, api, room.players.get(id), { t: 'move', m });
  return { room, api, log, timers, play, start: () => gomoku.start(room, api) };
}

test('servidor: ajustes, turnos, jugadas ilegales y reloj', () => {
  assert.deepEqual(gomoku.settings({ ...gomoku.defaults }, { tc: '99+9', size: 'gigante', public: 'si' }), gomoku.defaults);
  assert.deepEqual(gomoku.settings({ ...gomoku.defaults }, { tc: '2+0', size: 's', public: true }), { tc: '2+0', size: 's', public: true });
  const tb = fakeTable({ tc: '3+2', size: 's' });
  tb.start();
  const d = tb.room.data;
  const [f, s] = [d.first, d.second];
  assert.equal(gomoku.view(tb.room).gomoku.size, 's');
  assert.deepEqual(gomoku.view(tb.room).gomoku.clock, [180000, 180000]);
  tb.play(s, '40');
  assert.deepEqual(tb.log.sent.pop(), [s, { t: 'error', code: 'not_your_turn' }]);
  assert.equal(tb.play(f, 'x'), false);
  assert.equal(tb.play(f, '81'), false, 'fuera del tablero de 9×9');
  assert.equal(tb.play(f, '-3'), false);
  assert.deepEqual(d.moves, []);
  assert.equal(tb.play(f, '40'), true);
  assert.equal(d.running, -1, 'el reloj arranca con la segunda jugada');
  assert.equal(tb.play(s, '40'), false, 'cruz ocupada');
  assert.equal(tb.play(s, '41'), true);
  assert.equal(d.running, 0, 'ahora le toca al primero');
  d.since = Date.now() - 3000;
  assert.equal(tb.play(f, '49'), true);
  assert.ok(d.clock[0] > 180000 + 2000 - 3200 && d.clock[0] <= 180000 + 2000 - 2800, `reloj ${d.clock[0]}`);
  d.clock[1] = 40;
  d.since = Date.now() - 300;
  tb.timers.get('clock').fn();
  assert.equal(tb.log.ended.at(-1).result.winner, 0);
  assert.equal(tb.log.ended.at(-1).result.reason, 'timeout');
  assert.equal(gomoku.command(tb.room, tb.api, tb.room.players.get('a'), { t: 'again' }), true);
  gomoku.command(tb.room, tb.api, tb.room.players.get('b'), { t: 'again' });
  assert.equal(tb.room.state, 'playing');
  assert.notEqual(tb.room.data.first, f);
});

test('servidor: gana quien arma cinco (y se manda la fila), rendición, abandono y anulación', () => {
  const tb = fakeTable({ size: 's' });
  tb.start();
  const d = tb.room.data;
  const [f, s] = [d.first, d.second];
  // negras: 0,1,2,3,4 en la fila 0; blancas: 9,10,11,12
  const blacks = ['0', '1', '2', '3', '4'];
  const whites = ['9', '10', '11', '12'];
  for (let k = 0; k < 5; k++) {
    assert.equal(tb.play(f, blacks[k]), true);
    if (k < 4) assert.equal(tb.play(s, whites[k]), true);
  }
  const res = tb.log.ended.at(-1).result;
  assert.deepEqual([res.winner, res.reason, res.line], [0, 'five', [0, 1, 2, 3, 4]]);
  const t2 = fakeTable();
  t2.start();
  gomoku.message(t2.room, t2.api, t2.room.players.get(t2.room.data.second), { t: 'resign' });
  assert.deepEqual([t2.log.ended.at(-1).result.winner, t2.log.ended.at(-1).result.reason], [0, 'resign']);
  const t3 = fakeTable();
  t3.start();
  gomoku.leave(t3.room, t3.api, t3.room.data.first);
  assert.equal(t3.log.ended.at(-1).result.reason, 'aborted');
  const t4 = fakeTable();
  t4.start();
  t4.play(t4.room.data.first, '0');
  t4.play(t4.room.data.second, '1');
  gomoku.leave(t4.room, t4.api, t4.room.data.second);
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
    a.send({ t: 'create', game: 'gomoku', name: 'Ana', settings: { public: true, tc: '10+0', size: 's' } });
    await wait(200);
    const code = a.last('joined').code;
    const q = await connect(srv.port);
    q.send({ t: 'list', game: 'gomoku' });
    await wait(150);
    const listed = q.last('list').rooms;
    assert.deepEqual([listed[0].code, listed[0].n, listed[0].max, listed[0].tc, listed[0].size], [code, 1, 2, '10+0', 's']);
    q.ws.close();
    const b = await connect(srv.port);
    b.send({ t: 'join', game: 'gomoku', code, name: 'Beto' });
    await wait(250);
    a.send({ t: 'start' });
    await wait(300);
    const g = a.last('room').room.gomoku;
    assert.equal(g.size, 's');
    const meA = a.last('joined').id;
    const first = g.first === meA ? a : b;
    const second = first === a ? b : a;
    second.send({ t: 'move', m: '40' });
    await wait(120);
    assert.equal(second.last('error')?.code, 'not_your_turn');
    first.send({ t: 'move', m: '40' });
    await wait(150);
    second.send({ t: 'move', m: '41' });
    await wait(150);
    assert.deepEqual(first.last('room').room.gomoku.moves, ['40', '41']);
    const sess = { code, token: second.last('joined').token };
    second.ws.close();
    await wait(200);
    const s2 = await connect(srv.port);
    s2.send({ t: 'join', game: 'gomoku', code: sess.code, token: sess.token, name: 'x' });
    await wait(300);
    assert.deepEqual(s2.last('room').room.gomoku.moves, ['40', '41']);
    s2.send({ t: 'resign' });
    await wait(200);
    const end = first.last('end');
    assert.equal(end.result.reason, 'resign');
    assert.equal(end.result.winner, 0);
    s2.send({ t: 'again' });
    first.send({ t: 'again' });
    await wait(300);
    const g3 = first.last('room').room.gomoku;
    assert.equal(g3.n, 2);
    assert.deepEqual(g3.moves, []);
    assert.notEqual(g3.first, g.first);
    s2.ws.close();
    first.ws.close();
  } finally {
    srv.stop();
  }
});

void WHITE;
