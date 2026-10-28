/** Puntos y cajas: la geometría, las reglas (cajas, turno extra, final), la compu y la partida online. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Position, SIZES, SIZE_IDS, geometry, moveStr, fromStr, replay, isSize } from '../public/games/puntos/shared/rules.js';
import { Engine, LEVELS } from '../public/games/puntos/shared/engine.js';
import puntos from '../server/games/puntos.js';
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

test('geometría: rayas y cajas de cada tamaño, y cada raya sabe qué cajas cierra', () => {
  assert.deepEqual(SIZE_IDS, ['s', 'm', 'l', 'xl']);
  assert.ok(isSize('m') && !isSize('xxl') && !isSize('constructor') && !isSize(4));
  for (const id of SIZE_IDS) {
    const [rows, cols] = SIZES[id];
    const g = geometry(rows, cols);
    assert.equal(g.nBoxes, rows * cols);
    assert.equal(g.nLines, (rows + 1) * cols + rows * (cols + 1));
    // cada caja tiene 4 rayas distintas y cada raya del borde cierra 1 caja y las de adentro 2
    const count = new Array(g.nLines).fill(0);
    for (let b = 0; b < g.nBoxes; b++) {
      const ls = [...g.boxLines.slice(b * 4, b * 4 + 4)];
      assert.equal(new Set(ls).size, 4);
      for (const l of ls) {
        count[l]++;
        assert.ok(g.lineBoxes[l * 2] === b || g.lineBoxes[l * 2 + 1] === b);
      }
    }
    for (let l = 0; l < g.nLines; l++) {
      const border = g.kind[l] === 0 ? g.at[l * 2] === 0 || g.at[l * 2] === rows : g.at[l * 2 + 1] === 0 || g.at[l * 2 + 1] === cols;
      assert.equal(count[l], border ? 1 : 2, `raya ${l} del ${id}`);
      assert.equal(g.lineBoxes[l * 2 + 1] >= 0, !border);
    }
  }
});

test('reglas: cerrar una caja da otro turno, una raya puede cerrar dos cajas y el final decide', () => {
  const p = new Position(2, 2);
  const g = p.g;
  const boxLines = (b) => [...g.boxLines.slice(b * 4, b * 4 + 4)];
  // se trazan tres rayas de la caja 0 alternando
  const [a, b, c, d] = boxLines(0);
  assert.deepEqual([p.turn, p.moves().length], [0, 12]);
  for (const m of [a, b, c]) {
    const r = p.make(m);
    assert.deepEqual([r.boxes.length, r.extra], [0, false]);
  }
  assert.equal(p.turn, 1, 'tres rayas: le toca al segundo');
  assert.equal(p.gives(d), 0);
  assert.equal(p.closes(d), 1);
  assert.equal(p.isSafe(d), false);
  const r = p.make(d); // el segundo cierra la caja 0
  assert.deepEqual([r.boxes, r.extra, p.turn, p.score, p.owner[0]], [[0], true, 1, [0, 1], 1]);
  // una raya compartida entre dos cajas que ya tienen tres: cierra las dos de una (tablero de 1×2: la raya 5 es la del medio)
  const q = new Position(1, 2);
  for (const m of [0, 1, 2, 3, 4, 6]) assert.equal(q.make(m).boxes.length, 0);
  assert.deepEqual([q.closes(5), q.gives(5), q.moves()], [2, 0, [5]]);
  const both = q.make(5);
  assert.deepEqual([both.boxes, both.extra, q.over, q.score], [[0, 1], false, true, [2, 0]], 'cerró las dos y terminó la partida');
  // fin de la partida: sin rayas libres no hay turno extra y gana el de más cajas
  const full = new Position(1, 1);
  const order = [...full.g.boxLines.slice(0, 4)];
  let last;
  for (const m of order) last = full.make(m);
  assert.deepEqual([full.over, last.extra, full.score], [true, false, [0, 1]]);
  assert.deepEqual(full.status(), { over: true, winner: 1, counts: [0, 1], reason: 'count' });
  assert.deepEqual(new Position(2, 2).status(), { over: false });
});

test('deshacer vuelve a la posición anterior (rayas, lados, dueños, puntaje, turno y hash)', () => {
  const r = mulberry(5);
  for (const [rows, cols] of [[2, 2], [3, 3], [4, 4], [5, 5]]) {
    const p = new Position(rows, cols);
    const recs = [];
    const snaps = [];
    const snap = () => JSON.stringify([[...p.drawn], [...p.sides], [...p.owner], p.turn, p.score, p.left, p.n, p.h1, p.h2]);
    while (!p.over) {
      snaps.push(snap());
      const ms = p.moves();
      recs.push(p.make(ms[Math.floor(r() * ms.length)]));
    }
    assert.equal(p.score[0] + p.score[1], rows * cols);
    while (recs.length) {
      p.unmake(recs.pop());
      assert.equal(snap(), snaps.pop());
    }
    assert.equal(p.h1 | p.h2, 0, 'sin rayas el hash vuelve a cero');
  }
});

/** Una referencia sencilla y distinta de la implementación: cuenta los lados de cada caja con las rayas por coordenadas. */
function refGame(rows, cols, moves) {
  const H = new Set();
  const V = new Set();
  const own = new Map();
  let turn = 0;
  const score = [0, 0];
  const nH = (rows + 1) * cols;
  const out = [];
  for (const m of moves) {
    let closed = 0;
    if (m < nH) {
      const r = Math.floor(m / cols);
      const c = m % cols;
      H.add(`${r},${c}`);
      for (const br of [r - 1, r]) if (br >= 0 && br < rows && H.has(`${br},${c}`) && H.has(`${br + 1},${c}`) && V.has(`${br},${c}`) && V.has(`${br},${c + 1}`) && !own.has(`${br},${c}`)) (own.set(`${br},${c}`, turn), closed++);
    } else {
      const k = m - nH;
      const r = Math.floor(k / (cols + 1));
      const c = k % (cols + 1);
      V.add(`${r},${c}`);
      for (const bc of [c - 1, c]) if (bc >= 0 && bc < cols && H.has(`${r},${bc}`) && H.has(`${r + 1},${bc}`) && V.has(`${r},${bc}`) && V.has(`${r},${bc + 1}`) && !own.has(`${r},${bc}`)) (own.set(`${r},${bc}`, turn), closed++);
    }
    if (closed) score[turn] += closed;
    else turn ^= 1;
    out.push([closed, turn, score.slice()]);
  }
  return out;
}

test('coincide con la referencia sencilla en cientos de partidas al azar', () => {
  const r = mulberry(11);
  for (const [rows, cols] of [[1, 1], [2, 2], [2, 3], [3, 3], [4, 4], [3, 5], [6, 6]]) {
    for (let g = 0; g < 25; g++) {
      const p = new Position(rows, cols);
      const moves = [];
      const seen = [];
      while (!p.over) {
        const ms = p.moves();
        const m = ms[Math.floor(r() * ms.length)];
        const rec = p.make(m);
        moves.push(m);
        seen.push([rec.boxes.length, p.turn, p.score.slice()]);
      }
      assert.deepEqual(seen, refGame(rows, cols, moves));
    }
  }
});

test('notación y repaso', () => {
  const p = new Position(3, 3);
  const legal = p.moves();
  assert.equal(moveStr(7), '7');
  assert.equal(fromStr(legal, '7'), 7);
  for (const bad of ['x', '', '-1', '99', '1.5', 'abc', ' 3', '3 ']) assert.equal(fromStr(legal, bad), -1);
  assert.equal(fromStr(legal, 7), -1, 'no acepta números sueltos, solo texto');
  const rr = replay(['0', '5', '1'], 3, 3);
  assert.deepEqual([rr.pos.n, rr.pos.left, rr.made.length], [3, 21, 3]);
  assert.equal(replay(['0', '0'], 3, 3), null, 'la misma raya dos veces');
  assert.equal(replay(['0', '77'], 3, 3), null);
});

// ------------------------------------------------------------------ compu

/** Valor exacto (cajas que quedan de ventaja para quien mueve) sin trucos: para comparar con el motor. */
function brute(pos) {
  if (pos.left === 0) return 0;
  let best = -Infinity;
  for (const m of pos.moves()) {
    const rec = pos.make(m);
    const g = rec.boxes.length;
    const v = pos.left === 0 ? g : rec.extra ? g + brute(pos) : g - brute(pos);
    pos.unmake(rec);
    if (v > best) best = v;
  }
  return best;
}

test('motor: el final exacto coincide con probar todas las partidas', () => {
  const e = new Engine();
  const r = mulberry(21);
  let checked = 0;
  for (const [rows, cols, left] of [[2, 2, 9], [2, 3, 9], [3, 3, 9], [3, 3, 8], [2, 4, 9]]) {
    for (let g = 0; g < 12; g++) {
      const p = new Position(rows, cols);
      while (p.left > left) {
        const ms = p.moves();
        p.make(ms[Math.floor(r() * ms.length)]);
      }
      e.clear();
      const res = e.solve(p, 20000);
      assert.ok(res, 'se resolvió');
      assert.equal(res.value, brute(p.clone()), `${rows}x${cols}, quedan ${left}`);
      // todas las jugadas que devuelve dan ese valor
      for (const m of res.moves) {
        const q = p.clone();
        const rec = q.make(m);
        const v = q.left === 0 ? rec.boxes.length : rec.extra ? rec.boxes.length + brute(q) : rec.boxes.length - brute(q);
        assert.equal(v, res.value);
      }
      checked++;
    }
  }
  assert.equal(checked, 60);
});

test('motor: respeta el tiempo, devuelve jugadas legales y la jugada única se juega enseguida', () => {
  const e = new Engine();
  const big = new Position(6, 6);
  assert.equal(e.solve(big, 30), null, 'con 84 rayas libres y 30 ms no alcanza');
  for (const level of [1, 2, 3, 4, 5]) {
    const p = new Position(4, 4);
    const r = mulberry(level);
    for (let k = 0; k < 14; k++) {
      const ms = p.moves();
      p.make(ms[Math.floor(r() * ms.length)]);
    }
    const res = e.think(p, { level, rand: r, time: 200 });
    assert.ok(p.moves().includes(res.move), `nivel ${level}: ${res.move}`);
  }
  const one = new Position(1, 1);
  const [a, b, c, d] = one.g.boxLines;
  one.make(a);
  one.make(b);
  one.make(c);
  assert.deepEqual(e.think(one, { level: 3 }), { move: d, forced: true });
  const done = new Position(1, 1);
  for (const m of [a, b, c, d]) done.make(m);
  assert.deepEqual(e.think(done, { level: 3 }), { move: -1 });
});

test('motor: toma las cajas que puede y no regala mientras haya rayas seguras', () => {
  const e = new Engine();
  const r = mulberry(3);
  let regalos = 0;
  let tomas = 0;
  for (let g = 0; g < 60; g++) {
    const p = new Position(5, 5);
    // se juega al azar hasta una posición con muchas rayas libres (para que no entre el final exacto)
    for (let k = 0; k < 14 + (g % 8); k++) {
      const ms = p.moves();
      p.make(ms[Math.floor(r() * ms.length)]);
    }
    if (p.over) continue;
    const caps = p.moves().filter((m) => p.closes(m) > 0);
    const safe = p.moves().filter((m) => p.isSafe(m));
    const res = e.think(p, { level: 3, rand: r });
    if (caps.length) {
      assert.ok(p.closes(res.move) > 0, 'el nivel 3 siempre toma una caja si puede');
      tomas++;
    } else if (safe.length) {
      assert.ok(p.isSafe(res.move), 'con rayas seguras no regala');
      regalos++;
    }
  }
  assert.ok(tomas > 3 && regalos > 10, `${tomas} tomas · ${regalos} seguras`);
  // y el nivel 1 a veces no toma (60 %)
  const p = new Position(5, 5);
  const [a, b, c] = p.g.boxLines;
  p.make(a);
  p.make(b);
  p.make(c);
  let took = 0;
  for (let k = 0; k < 200; k++) if (p.closes(e.think(p, { level: 1, rand: mulberry(k + 1) }).move) > 0) took++;
  assert.ok(took > 70 && took < 170, `el nivel 1 toma el ${took / 2} %`);
});

test('motor: regala lo menos posible cuando ya no quedan rayas seguras', () => {
  const e = new Engine();
  // una caja con 2 rayas (regalarla cuesta 1) y una cadena de dos cajas (cuesta 2): hay que abrir la corta
  const p = new Position(1, 3);
  const g = p.g;
  const set = (list) => list.forEach((m) => p.make(m));
  // rayas de las cajas 0, 1, 2 en fila: arriba h(0,c), abajo h(1,c), verticales v(0,0..3)
  const top = [0, 1, 2];
  const bottom = [3, 4, 5];
  const vert = [6, 7, 8, 9];
  // se trazan todas las horizontales y las verticales de los extremos: cada caja queda con 2 o 3 lados
  set([...top, ...bottom]); // las tres cajas con 2 lados
  assert.ok(p.moves().every((m) => !p.isSafe(m)), 'ninguna raya es segura');
  assert.equal(e.gift(p, vert[0]), 3, 'abrir por el extremo regala toda la cadena');
  assert.equal(e.gift(p, vert[1]), 3);
  void g;
  const res = e.think(p, { level: 3, rand: mulberry(1), time: 200 });
  assert.ok(vert.includes(res.move));
});

test('motor: cada nivel le gana al anterior (en partidas con ventaja alternada)', () => {
  function play(lvA, lvB, rows, cols, seed) {
    const r = mulberry(seed);
    const p = new Position(rows, cols);
    const eng = [new Engine(), new Engine()];
    const lv = [lvA, lvB];
    while (!p.over) {
      const who = p.turn;
      p.make(eng[who].think(p, { level: lv[who], rand: r, time: 150 }).move);
    }
    return p.score;
  }
  for (const [a, b] of [[2, 1], [3, 2], [5, 3]]) {
    let wins = 0;
    let losses = 0;
    for (let g = 0; g < 8; g++) {
      const swap = g % 2;
      const sc = swap ? play(b, a, 4, 4, 100 + g) : play(a, b, 4, 4, 100 + g);
      const [sa, sb] = swap ? [sc[1], sc[0]] : [sc[0], sc[1]];
      if (sa > sb) wins++;
      else if (sb > sa) losses++;
    }
    assert.ok(wins > losses + 2, `nivel ${a} contra ${b}: ${wins}-${losses}`);
  }
  assert.equal(LEVELS.length, 6);
});

// ------------------------------------------------------------------ servidor

function fakeTable(settings = {}) {
  const room = { settings: { ...puntos.defaults, ...settings }, players: new Map(), state: 'playing', data: null, host: 'a' };
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
  const play = (id, m) => puntos.message(room, api, room.players.get(id), { t: 'move', m });
  return { room, api, log, timers, play, start: () => puntos.start(room, api) };
}

test('servidor: ajustes, turnos, raya que cierra caja deja el turno y reloj', () => {
  assert.deepEqual(puntos.settings({ ...puntos.defaults }, { tc: '99+9', size: 'gigante', public: 'si' }), puntos.defaults);
  assert.deepEqual(puntos.settings({ ...puntos.defaults }, { tc: '2+0', size: 'xl', public: true }), { tc: '2+0', size: 'xl', public: true });
  const tb = fakeTable({ tc: '3+2', size: 's' });
  tb.start();
  const d = tb.room.data;
  const [f, s] = [d.first, d.second];
  assert.deepEqual(puntos.view(tb.room).puntos.clock, [180000, 180000]);
  assert.equal(puntos.view(tb.room).puntos.size, 's');
  tb.play(s, '0');
  assert.deepEqual(tb.log.sent.pop(), [s, { t: 'error', code: 'not_your_turn' }]);
  assert.equal(tb.play(f, 'x'), false);
  assert.equal(tb.play(f, '99'), false, 'esa raya no existe');
  assert.deepEqual(d.moves, []);
  // se juega una caja entera alternando: el que cierra la cuarta raya sigue y su reloj corre
  const lines = [...d.pos.g.boxLines.slice(0, 4)];
  assert.equal(tb.play(f, String(lines[0])), true);
  assert.equal(d.running, -1, 'el reloj arranca con la segunda jugada');
  assert.equal(tb.play(s, String(lines[1])), true);
  assert.equal(d.running, 0, 'ahora le toca al primero');
  assert.equal(tb.play(f, String(lines[2])), true);
  assert.equal(d.running, 1);
  d.since = Date.now() - 3000;
  assert.equal(tb.play(s, String(lines[3])), true); // cierra la caja
  assert.deepEqual([d.pos.turn, d.pos.score], [1, [0, 1]]);
  assert.equal(d.running, 1, 'tras cerrar una caja el reloj sigue siendo suyo');
  assert.ok(d.clock[1] > 180000 + 2000 - 3200 && d.clock[1] <= 180000 + 2000 - 2800, `reloj ${d.clock[1]}`);
  assert.equal(tb.play(s, String(lines[3])), false, 'la raya ya está trazada');
  d.clock[1] = 40;
  d.since = Date.now() - 300;
  tb.timers.get('clock').fn();
  assert.equal(tb.log.ended.at(-1).result.winner, 0);
  assert.equal(tb.log.ended.at(-1).result.reason, 'timeout');
  // revancha: empieza el otro
  assert.equal(puntos.command(tb.room, tb.api, tb.room.players.get('a'), { t: 'again' }), true);
  puntos.command(tb.room, tb.api, tb.room.players.get('b'), { t: 'again' });
  assert.equal(tb.room.state, 'playing');
  assert.notEqual(tb.room.data.first, f);
});

test('servidor: el final sale del conteo, rendición, abandono y anulación', () => {
  const tb = fakeTable({ size: 's' });
  tb.start();
  const d = tb.room.data;
  // se juegan todas las rayas al azar menos la última
  const r = mulberry(9);
  while (d.pos.left > 1) {
    const ms = d.pos.moves();
    const m = ms[Math.floor(r() * ms.length)];
    const who = d.pos.turn === 0 ? d.first : d.second;
    assert.equal(tb.play(who, String(m)), true);
    if (tb.log.ended.length) break;
  }
  const last = d.pos.moves()[0];
  tb.play(d.pos.turn === 0 ? d.first : d.second, String(last));
  const res = tb.log.ended.at(-1).result;
  assert.equal(res.reason, 'count');
  assert.equal(res.counts[0] + res.counts[1], 9);
  assert.equal(res.winner, res.counts[0] > res.counts[1] ? 0 : res.counts[1] > res.counts[0] ? 1 : null);
  const t2 = fakeTable();
  t2.start();
  puntos.message(t2.room, t2.api, t2.room.players.get(t2.room.data.second), { t: 'resign' });
  assert.deepEqual([t2.log.ended.at(-1).result.winner, t2.log.ended.at(-1).result.reason], [0, 'resign']);
  const t3 = fakeTable();
  t3.start();
  puntos.leave(t3.room, t3.api, t3.room.data.first);
  assert.equal(t3.log.ended.at(-1).result.reason, 'aborted');
  const t4 = fakeTable();
  t4.start();
  t4.play(t4.room.data.first, '0');
  t4.play(t4.room.data.second, '1');
  puntos.leave(t4.room, t4.api, t4.room.data.second);
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
    a.send({ t: 'create', game: 'puntos', name: 'Ana', settings: { public: true, tc: '10+0', size: 'l' } });
    await wait(200);
    const code = a.last('joined').code;
    const q = await connect(srv.port);
    q.send({ t: 'list', game: 'puntos' });
    await wait(150);
    const listed = q.last('list').rooms;
    assert.deepEqual([listed[0].code, listed[0].n, listed[0].max, listed[0].tc, listed[0].size], [code, 1, 2, '10+0', 'l']);
    q.ws.close();
    const b = await connect(srv.port);
    b.send({ t: 'join', game: 'puntos', code, name: 'Beto' });
    await wait(250);
    a.send({ t: 'start' });
    await wait(300);
    const g = a.last('room').room.puntos;
    assert.equal(g.size, 'l');
    const meA = a.last('joined').id;
    const first = g.first === meA ? a : b;
    const second = first === a ? b : a;
    second.send({ t: 'move', m: '0' });
    await wait(120);
    assert.equal(second.last('error')?.code, 'not_your_turn');
    first.send({ t: 'move', m: '0' });
    await wait(150);
    second.send({ t: 'move', m: '1' });
    await wait(150);
    assert.deepEqual(first.last('room').room.puntos.moves, ['0', '1']);
    const sess = { code, token: second.last('joined').token };
    second.ws.close();
    await wait(200);
    const s2 = await connect(srv.port);
    s2.send({ t: 'join', game: 'puntos', code: sess.code, token: sess.token, name: 'x' });
    await wait(300);
    assert.deepEqual(s2.last('room').room.puntos.moves, ['0', '1']);
    s2.send({ t: 'resign' });
    await wait(200);
    const end = first.last('end');
    assert.equal(end.result.reason, 'resign');
    assert.equal(end.result.winner, 0);
    s2.send({ t: 'again' });
    first.send({ t: 'again' });
    await wait(300);
    const g3 = first.last('room').room.puntos;
    assert.equal(g3.n, 2);
    assert.deepEqual(g3.moves, []);
    assert.notEqual(g3.first, g.first);
    s2.ws.close();
    first.ws.close();
  } finally {
    srv.stop();
  }
});
