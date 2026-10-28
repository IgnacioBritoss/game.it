/** Memotest: el reparto, la memoria de la compu, el acomodo de las cartas y la partida online (sin espiar el reparto). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACES, RANGE, SIZES, SIZE_IDS, THEME_IDS, deal, fit, shuffled, stars, isSize, isTheme } from '../public/games/memotest/shared/deck.js';
import { Brain, LEVELS } from '../public/games/memotest/shared/brain.js';
import { rng } from '../public/shared/daily.js';
import memotest from '../server/games/memotest.js';
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

test('mazo: 72 caras distintas, cuatro temas de 18 y los tamaños que entran en todos', () => {
  assert.equal(FACES.length, 72);
  assert.equal(new Set(FACES).size, 72);
  for (const t of ['fruits', 'animals', 'food', 'things']) assert.equal(RANGE[t][1] - RANGE[t][0], 18);
  assert.deepEqual(THEME_IDS, ['fruits', 'animals', 'food', 'things', 'mix']);
  assert.deepEqual(SIZE_IDS.map((s) => SIZES[s]), [6, 8, 12, 15, 18]);
  for (const t of THEME_IDS) assert.ok(RANGE[t][1] - RANGE[t][0] >= SIZES.xxl, `el tema ${t} alcanza para el tamaño más grande`);
  assert.ok(isSize('m') && !isSize('xxxl') && !isSize('toString') && !isSize(3));
  assert.ok(isTheme('mix') && !isTheme('constructor') && !isTheme(undefined));
});

test('reparto: cada cara dos veces, dentro del tema, y con la misma semilla sale igual', () => {
  for (const theme of THEME_IDS) {
    for (const size of SIZE_IDS) {
      const faces = deal(mulberry(7), SIZES[size], theme);
      assert.equal(faces.length, SIZES[size] * 2);
      const count = new Map();
      for (const f of faces) count.set(f, (count.get(f) || 0) + 1);
      assert.equal(count.size, SIZES[size]);
      assert.ok([...count.values()].every((n) => n === 2), 'cada cara aparece dos veces');
      const [a, b] = RANGE[theme];
      assert.ok(faces.every((f) => f >= a && f < b), `las caras salen del tema ${theme}`);
    }
  }
  assert.deepEqual(deal(rng('memotest-daily-2026-10-28'), 12, 'mix'), deal(rng('memotest-daily-2026-10-28'), 12, 'mix'));
  assert.notDeepEqual(deal(rng('memotest-daily-2026-10-28'), 12, 'mix'), deal(rng('memotest-daily-2026-10-29'), 12, 'mix'));
  // mezcla de verdad: en 200 repartos la primera carta tiene muchas caras distintas, y en 200 las dos copias caen en lugares distintos
  const firstFaces = new Set();
  const spots = new Set();
  for (let k = 0; k < 200; k++) {
    const faces = deal(mulberry(k + 1), 6, 'fruits');
    firstFaces.add(faces[0]);
    spots.add(faces.indexOf(faces[0], 1));
  }
  assert.ok(firstFaces.size >= 10, `caras en el primer lugar: ${firstFaces.size}`);
  assert.ok(spots.size >= 8, `lugares de la copia: ${spots.size}`);
  assert.deepEqual(shuffled([1, 2, 3, 4, 5], mulberry(3)).sort(), [1, 2, 3, 4, 5]);
});

test('estrellas: pocos intentos por par dan tres, algunos dos y el resto una', () => {
  assert.equal(stars(12, 12), 3);
  assert.equal(stars(20, 12), 3);
  assert.equal(stars(21, 12), 2);
  assert.equal(stars(30, 12), 2);
  assert.equal(stars(31, 12), 1);
  assert.equal(stars(10, 6), 3);
  assert.equal(stars(15, 6), 2);
  assert.equal(stars(16, 6), 1);
  assert.equal(stars(40, 6), 1);
});

test('acomodo: elige las columnas que dan la carta más grande y entra en el espacio', () => {
  // celular vertical: 24 cartas en 6 columnas × 4 filas; escritorio apaisado: más columnas
  const a = fit(24, 374, 420);
  assert.deepEqual([a.cols, a.rows], [6, 4]);
  const w = fit(24, 1000, 380);
  assert.ok(w.cols >= 8, `apaisado: ${w.cols}`);
  for (const [n, W, H] of [[12, 374, 500], [16, 360, 380], [30, 374, 460], [36, 340, 400], [36, 1200, 500]]) {
    const f = fit(n, W, H, 8);
    assert.equal(f.cols * f.rows, n);
    assert.ok(f.cw * f.cols + (f.cols - 1) * 8 <= W + 1e-6, 'entra a lo ancho');
    assert.ok(f.ch * f.rows + (f.rows - 1) * 8 <= H + 1e-6, 'entra a lo alto');
    // ninguna otra forma da una carta mayor
    for (let cols = 1; cols <= n; cols++) {
      if (n % cols) continue;
      const rows = n / cols;
      const cw = Math.min((W - (cols - 1) * 8) / cols, ((H - (rows - 1) * 8) / rows) * 0.78);
      assert.ok(cw <= f.cw + 1e-9);
    }
  }
});

/** Una partida de una persona contra el reparto: devuelve los intentos (dos cartas dadas vuelta) que le llevó a la compu. */
function soloBrain(level, pairs, seed) {
  const faces = deal(mulberry(seed), pairs, 'mix');
  const brain = new Brain(level, mulberry(seed ^ 0x9e3779b9));
  let down = faces.map((_, i) => i);
  let attempts = 0;
  while (down.length) {
    const f = brain.first(down);
    assert.ok(down.includes(f.i), 'la primera carta está boca abajo');
    brain.see(f.i, faces[f.i]);
    const j = f.pair >= 0 ? f.pair : brain.second(f.i, faces[f.i], down);
    assert.ok(down.includes(j) && j !== f.i, 'la segunda es otra carta boca abajo');
    brain.see(j, faces[j]);
    attempts++;
    if (faces[f.i] === faces[j]) {
      down = down.filter((x) => x !== f.i && x !== j);
      brain.taken(f.i, j);
    }
    brain.endTurn();
    assert.ok(attempts < 3000);
  }
  return attempts;
}

test('compu: juega siempre cartas boca abajo y un nivel más alto necesita menos intentos', () => {
  const avg = {};
  for (const level of [1, 2, 3]) {
    let s = 0;
    for (let k = 0; k < 120; k++) s += soloBrain(level, 12, k + 1);
    avg[level] = s / 120;
  }
  assert.ok(avg[1] > avg[2] * 1.2, `nivel 1 ${avg[1]} vs 2 ${avg[2]}`);
  assert.ok(avg[2] > avg[3] * 1.05, `nivel 2 ${avg[2]} vs 3 ${avg[3]}`);
  assert.ok(avg[3] < 12 * 2, `nivel 3 ${avg[3]}`);
  assert.ok(avg[3] >= 12, 'no puede ganarle a su propio sorteo: hacen falta al menos tantos intentos como pares');
  assert.ok(LEVELS[1].keep < LEVELS[2].keep && LEVELS[2].keep < LEVELS[3].keep);
});

test('compu: se lleva el par que sabe y no mira cartas que no vio', () => {
  const b = new Brain(3, () => 0.5); // 0,5: se acuerda de lo que ve, no se equivoca y no se olvida
  b.see(3, 40);
  b.see(7, 55);
  b.see(9, 40);
  const down = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  assert.deepEqual(b.first(down), { i: 3, pair: 9 });
  assert.equal(b.second(3, 40, down), 9, 'si la primera ya tiene pareja sabida, va a esa');
  // sin pares sabidos: una al azar entre las que no conoce
  const c = new Brain(3, () => 0.99);
  c.known.set(1, 10);
  c.known.set(2, 11);
  const f = c.first([0, 1, 2, 3, 4]);
  assert.equal(f.pair, -1);
  assert.ok([0, 3, 4].includes(f.i), `eligió ${f.i}`);
  // un par que ya se llevaron no cuenta
  const h = new Brain(3, () => 0.5);
  h.see(1, 5);
  h.see(2, 5);
  assert.equal(h.first([0, 1, 3]).pair, -1);
  // segunda carta: si sabe dónde está la pareja de la primera, va ahí
  const d = new Brain(3, () => 0.5);
  d.see(5, 20);
  assert.equal(d.second(2, 20, [0, 1, 2, 3, 4, 5, 6]), 5);
  // sin saberlo: otra distinta de la primera y que no conozca
  const e = new Brain(3, () => 0.5);
  e.known.set(4, 1);
  const j = e.second(1, 99, [1, 2, 3, 4]);
  assert.ok([2, 3].includes(j), `eligió ${j}`);
  // se olvida al terminar el turno (con 0 siempre toca olvidar)
  const o = new Brain(3, () => 0);
  o.known.set(1, 5);
  o.known.set(2, 6);
  o.endTurn();
  assert.equal(o.known.size, 0);
  // y se acuerda con la chance del nivel: con 0,99 no se acuerda de nada en el nivel 1 (keep 0,45)
  const p = new Brain(1, () => 0.99);
  p.see(1, 5);
  assert.equal(p.known.size, 0);
  // las cartas llevadas se sacan
  const g = new Brain(3, () => 0);
  g.see(1, 5);
  g.see(2, 5);
  g.taken(1, 2);
  assert.equal(g.known.size, 0);
});

// ------------------------------------------------------------------ servidor

function fakeTable(n = 3, settings = {}) {
  const room = { settings: { ...memotest.defaults, ...settings }, players: new Map(), state: 'playing', data: null, host: 'p0' };
  for (let k = 0; k < n; k++) room.players.set(`p${k}`, { id: `p${k}`, connected: true, name: `J${k}`, color: `#00000${k}` });
  const log = { sent: [], ended: [], syncs: 0 };
  const timers = new Map();
  const api = {
    players: () => [...room.players.values()],
    setTimer: (name, ms, fn) => timers.set(name, { ms, fn }),
    clearTimer: (name) => timers.delete(name),
    sync: () => log.syncs++,
    touch: () => {},
    send: (id, m) => log.sent.push([id, m]),
    end: (p) => {
      room.state = 'finished';
      log.ended.push(p);
    },
    broadcast: () => {},
  };
  const flip = (id, i) => memotest.message(room, api, room.players.get(id), { t: 'flip', i });
  const start = () => memotest.start(room, api);
  /** Da vuelta el par `a`,`b` como el jugador de turno y resuelve. */
  const pair = (a, b) => {
    const d = room.data;
    const id = d.seats[d.turn].id;
    flip(id, a);
    flip(id, b);
    timers.get('resolve').fn();
  };
  /** Dos posiciones con la misma cara / con caras distintas, entre las que siguen boca abajo. */
  const find = (same) => {
    const d = room.data;
    const free = d.faces.map((_, i) => i).filter((i) => d.own[i] < 0);
    for (const a of free) for (const b of free) if (a < b && (d.faces[a] === d.faces[b]) === same) return [a, b];
    return null;
  };
  return { room, api, log, timers, flip, start, pair, find };
}

test('servidor: ajustes, reparto oculto, turnos y pares', () => {
  assert.deepEqual(memotest.settings({ ...memotest.defaults }, { size: 'gigante', theme: 'x', public: 'si' }), memotest.defaults);
  assert.deepEqual(memotest.settings({ ...memotest.defaults }, { size: 'xxl', theme: 'food', public: true }), { size: 'xxl', theme: 'food', public: true });
  const tb = fakeTable(3, { size: 's', theme: 'fruits' });
  tb.start();
  const d = tb.room.data;
  assert.equal(d.faces.length, 12);
  assert.deepEqual(d.seats.map((s) => s.id).sort(), ['p0', 'p1', 'p2']);
  const order = d.seats.map((s) => s.id);
  // el reparto no sale en la vista: solo las cartas dadas vuelta
  let v = memotest.view(tb.room).memotest;
  assert.deepEqual(v.up, []);
  assert.equal(JSON.stringify(v).includes('faces'), false);
  assert.ok(v.deadline > Date.now());
  // fuera de turno
  tb.flip(order[1], 0);
  assert.deepEqual(tb.log.sent.pop(), [order[1], { t: 'error', code: 'not_your_turn' }]);
  assert.equal(tb.flip(order[0], 99), false);
  assert.equal(tb.flip(order[0], -1), false);
  assert.equal(tb.flip(order[0], 1.5), false);
  assert.equal(memotest.message(tb.room, tb.api, tb.room.players.get(order[0]), { t: 'otra' }), false);
  // un par distinto: se ven las dos, se tapan y pasa el turno
  const [x, y] = tb.find(false);
  tb.flip(order[0], x);
  v = memotest.view(tb.room).memotest;
  assert.deepEqual(v.up, [[x, d.faces[x]]]);
  assert.equal(tb.flip(order[0], x), true, 'la misma carta otra vez no hace nada');
  assert.deepEqual(d.up, [x]);
  tb.flip(order[0], y);
  v = memotest.view(tb.room).memotest;
  assert.equal(v.busy, true);
  assert.equal(v.deadline, 0, 'mientras se resuelve no corre el tiempo del turno');
  assert.equal(v.up.length, 2);
  const z = d.faces.findIndex((_, i) => i !== x && i !== y);
  assert.equal(tb.flip(order[0], z), true);
  assert.equal(d.up.length, 2, 'con el par a la vista no entra otra carta');
  assert.equal(tb.timers.get('resolve').ms, 1500);
  tb.timers.get('resolve').fn();
  assert.deepEqual([d.turn, d.up.length, d.moves, d.scores], [1, 0, 1, [0, 0, 0]]);
  // un par igual: se lo lleva y sigue
  const [p, q] = tb.find(true);
  tb.flip(order[1], p);
  tb.flip(order[1], q);
  assert.equal(tb.timers.get('resolve').ms, 900);
  tb.timers.get('resolve').fn();
  assert.deepEqual([d.turn, d.scores, d.own[p], d.own[q]], [1, [0, 1, 0], 1, 1]);
  v = memotest.view(tb.room).memotest;
  assert.deepEqual(v.taken, [[p, d.faces[p], 1], [q, d.faces[q], 1]]);
  assert.equal(tb.flip(order[1], p), true, 'una carta ya llevada no se da vuelta');
  assert.deepEqual(d.up, []);
  assert.ok(v.deadline > 0);
});

test('servidor: el final cuenta los pares, los empates ganan los dos y el anfitrión repite', () => {
  const tb = fakeTable(2, { size: 's' });
  tb.start();
  const d = tb.room.data;
  // se juegan todos los pares: el de turno se los lleva todos menos dos (que se los lleva el otro)
  let k = 0;
  while (d.own.some((o) => o < 0)) {
    const [a, b] = tb.find(true);
    tb.pair(a, b);
    k++;
    if (k === 3) {
      d.turn = 1 - d.turn; // reparte los pares entre los dos: 3 y 3
    }
    if (tb.log.ended.length) break;
  }
  const res = tb.log.ended.at(-1).result;
  assert.equal(res.reason, 'done');
  assert.equal(res.scores.reduce((a, b) => a + b, 0), 6);
  assert.deepEqual(res.scores, [3, 3]);
  assert.deepEqual(res.winners, [0, 1], 'empate: ganan los dos');
  assert.equal(d.result, res);
  assert.equal(tb.flip(d.seats[0].id, 0), true, 'terminada: no pasa nada');
  // la revancha la pide el anfitrión (p0)
  assert.equal(memotest.command(tb.room, tb.api, tb.room.players.get('p1'), { t: 'again' }), true);
  assert.equal(tb.room.state, 'finished');
  assert.equal(memotest.command(tb.room, tb.api, tb.room.players.get('p0'), { t: 'again' }), true);
  assert.equal(tb.room.state, 'playing');
  assert.equal(tb.room.data.n, 2);
  assert.equal(tb.room.data.scores.join(), '0,0');
  assert.notEqual(tb.room.data.seats[0].id, d.seats[0].id, 'en la revancha empieza el otro');
  // un ganador solo
  const t2 = fakeTable(3, { size: 's' });
  t2.start();
  const d2 = t2.room.data;
  while (d2.own.some((o) => o < 0)) {
    const [a, b] = t2.find(true);
    t2.pair(a, b);
  }
  const r2 = t2.log.ended.at(-1).result;
  assert.equal(r2.scores[d2.seats.findIndex((_, s) => r2.scores[s] === 6)], 6, 'el que no falló se llevó todo');
  assert.equal(r2.winners.length, 1);
});

test('servidor: se vence el turno, a la segunda seguida queda afuera y el que queda gana', () => {
  const tb = fakeTable(3, { size: 's' });
  tb.start();
  const d = tb.room.data;
  const A = d.turn;
  const [x] = tb.find(false);
  tb.flip(d.seats[A].id, x);
  assert.equal(d.up.length, 1);
  tb.timers.get('turn').fn(); // se le vence el turno con una carta dada vuelta: se tapa y pasa
  assert.deepEqual([d.up.length, d.idle[A], d.out[A]], [0, 1, false]);
  assert.notEqual(d.turn, A);
  const B = d.turn;
  tb.timers.get('turn').fn();
  const C = d.turn;
  tb.timers.get('turn').fn();
  assert.deepEqual([d.turn, d.idle[A], d.idle[B], d.idle[C]], [A, 1, 1, 1]);
  tb.flip(d.seats[A].id, x); // juega: se le borra la racha de turnos vencidos
  assert.equal(d.idle[A], 0);
  tb.timers.get('turn').fn(); // vuelve a vencerse (1)
  tb.timers.get('turn').fn(); // B: segunda seguida → afuera
  assert.deepEqual([d.out[A], d.out[B], d.out[C]], [false, true, false]);
  assert.equal(tb.log.ended.length, 0);
  assert.ok(![B].includes(d.turn), 'el que quedó afuera no vuelve a tener el turno');
  tb.timers.get('turn').fn(); // C: segunda seguida → afuera; queda A solo
  assert.equal(tb.log.ended.length, 1);
  const res = tb.log.ended[0].result;
  assert.equal(res.reason, 'abandon');
  assert.equal(res.winners.length, 1);
  assert.equal(d.out.filter((o) => !o).length, 1);
  assert.equal(d.out[res.winners[0]], false);
  // quien está afuera no puede dar vuelta cartas
  assert.equal(tb.flip(d.seats[B].id, 0), true, 'terminada: se ignora');
});

test('servidor: si se va alguien pasa el turno; si queda uno solo, gana', () => {
  const tb = fakeTable(3, { size: 's' });
  tb.start();
  const d = tb.room.data;
  const mover = d.seats[d.turn].id;
  const [x, y] = tb.find(false);
  tb.flip(mover, x);
  tb.flip(mover, y);
  assert.equal(d.busy, true);
  memotest.leave(tb.room, tb.api, mover); // se va en pleno turno, con el par a la vista
  assert.equal(d.out[d.seats.findIndex((s) => s.id === mover)], true);
  assert.deepEqual([d.busy, d.up.length], [false, 0]);
  assert.notEqual(d.seats[d.turn].id, mover);
  assert.equal(tb.timers.has('resolve'), false);
  assert.equal(tb.log.ended.length, 0);
  const other = d.seats[d.turn].id;
  const last = d.seats.find((s) => s.id !== mover && s.id !== other).id;
  memotest.leave(tb.room, tb.api, other);
  assert.equal(tb.log.ended.length, 1);
  assert.equal(tb.log.ended[0].result.reason, 'abandon');
  assert.deepEqual(tb.log.ended[0].result.winners, [d.seats.findIndex((s) => s.id === last)]);
  // quien nunca estuvo sentado no hace nada
  memotest.leave(tb.room, tb.api, 'nadie');
  assert.equal(tb.log.ended.length, 1);
});

test('servidor (red): sala pública, hasta 4, el reparto no se filtra y se reconecta', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    a.send({ t: 'create', game: 'memotest', name: 'Ana', settings: { public: true, size: 's', theme: 'animals' } });
    await wait(200);
    const code = a.last('joined').code;
    const q = await connect(srv.port);
    q.send({ t: 'list', game: 'memotest' });
    await wait(150);
    const listed = q.last('list').rooms;
    assert.deepEqual([listed[0].code, listed[0].n, listed[0].max, listed[0].size, listed[0].theme], [code, 1, 4, 's', 'animals']);
    q.ws.close();
    const b = await connect(srv.port);
    const c = await connect(srv.port);
    b.send({ t: 'join', game: 'memotest', code, name: 'Beto' });
    c.send({ t: 'join', game: 'memotest', code, name: 'Caro' });
    await wait(300);
    a.send({ t: 'start' });
    await wait(300);
    const g = a.last('room').room.memotest;
    assert.equal(g.count, 12);
    assert.equal(g.seats.length, 3);
    assert.deepEqual(g.up, []);
    assert.equal(JSON.stringify(a.last('room').room).includes('faces'), false, 'el reparto no se manda');
    const byId = { [a.last('joined').id]: a, [b.last('joined').id]: b, [c.last('joined').id]: c };
    const turnId = g.seats[g.turn].id;
    const mover = byId[turnId];
    const other = Object.values(byId).find((x) => x !== mover);
    other.send({ t: 'flip', i: 0 });
    await wait(120);
    assert.equal(other.last('error')?.code, 'not_your_turn');
    mover.send({ t: 'flip', i: 0 });
    await wait(150);
    const g1 = other.last('room').room.memotest;
    assert.equal(g1.up.length, 1, 'todos ven la carta dada vuelta');
    assert.equal(g1.up[0][0], 0);
    mover.send({ t: 'flip', i: 1 });
    await wait(150);
    const g2 = other.last('room').room.memotest;
    assert.equal(g2.up.length, 2);
    assert.equal(g2.busy, true);
    // quien se reconecta recibe el estado con las cartas que están a la vista
    const sess = { code, token: other.last('joined').token };
    other.ws.close();
    await wait(200);
    const r = await connect(srv.port);
    r.send({ t: 'join', game: 'memotest', code: sess.code, token: sess.token, name: 'x' });
    await wait(300);
    assert.equal(r.last('room').room.memotest.up.length, 2);
    // se resuelve (par o error) y la sala sigue con el estado limpio
    await wait(1700);
    const g3 = r.last('room').room.memotest;
    assert.equal(g3.up.length, 0);
    assert.equal(g3.moves, 1);
    assert.equal(g3.busy, false);
    for (const x of [a, b, c, r]) x.ws.close();
  } finally {
    srv.stop();
  }
});
