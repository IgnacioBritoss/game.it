/** Generala: puntos de cada categoría, probabilidades, la compu, la mesa (turnos, tiradas, servida), el diario y el servidor. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATS, ROUNDS, scoreFor, open, total, outcomes, HANDS, keeps } from '../public/games/generala/shared/rules.js';
import { decide, bestCategory } from '../public/games/generala/shared/bot.js';
import { Table, SCORE_MS } from '../public/games/generala/shared/table.js';
import { startServer, connect, wait } from './helpers.mjs';

/** Generador con semilla (para que las pruebas den siempre lo mismo). */
function mulberry(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** io de prueba: los temporizadores se corren a mano, en orden de vencimiento. */
function fakeIo() {
  const io = { views: [], over: null, timers: new Map(), now: 0 };
  io.emit = (i, v) => io.views.push(v);
  io.timer = (k, ms, fn) => io.timers.set(k, { at: io.now + ms, fn });
  io.clear = (k) => io.timers.delete(k);
  io.over = (s) => (io.over = s);
  io.run = (limit = 1e5) => {
    for (let n = 0; n < limit && io.timers.size; n++) {
      const [k, tm] = [...io.timers].sort((a, b) => a[1].at - b[1].at)[0];
      io.timers.delete(k);
      io.now = tm.at;
      tm.fn();
    }
  };
  return io;
}
const seats = (n, bot = 0) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `J${i}`, color: '#fff', bot }));

test('puntos: números, escaleras (también 3-4-5-6-1), full, póker, generala, doble y servidas', () => {
  assert.equal(scoreFor('3', [3, 3, 1, 2, 3]), 9);
  assert.equal(scoreFor('6', [1, 2, 3, 4, 5]), 0);
  assert.equal(scoreFor('E', [5, 1, 3, 2, 4]), 20);
  assert.equal(scoreFor('E', [2, 3, 4, 5, 6], true), 25, 'servida');
  assert.equal(scoreFor('E', [3, 4, 5, 6, 1]), 20, 'escalera al as');
  assert.equal(scoreFor('E', [1, 2, 3, 4, 6]), 0);
  assert.equal(scoreFor('F', [2, 2, 3, 3, 3]), 30);
  assert.equal(scoreFor('F', [2, 2, 3, 3, 3], true), 35);
  assert.equal(scoreFor('F', [2, 2, 2, 2, 2]), 0, 'la generala no es full');
  assert.equal(scoreFor('P', [4, 4, 1, 4, 4]), 40);
  assert.equal(scoreFor('P', [4, 4, 4, 4, 4], true), 45, 'cinco iguales también es póker');
  assert.equal(scoreFor('G', [6, 6, 6, 6, 6]), 50);
  assert.equal(scoreFor('G', [6, 6, 6, 6, 5]), 0);
  assert.equal(scoreFor('D', [2, 2, 2, 2, 2], false, { G: 50 }), 100);
  assert.equal(scoreFor('D', [2, 2, 2, 2, 2], false, { G: 0 }), 0, 'con la generala tachada no hay doble');
  assert.equal(scoreFor('D', [2, 2, 2, 2, 2], false, {}), 0);
  const sheet = { 1: 3, E: 20, G: 0 };
  assert.equal(total(sheet), 23);
  assert.deepEqual(open(sheet), CATS.filter((c) => !['1', 'E', 'G'].includes(c)));
  assert.equal(ROUNDS, 11);
});

test('probabilidades: las 252 manos y cada tirada suma 1', () => {
  assert.equal(HANDS.length, 252);
  for (let r = 0; r <= 5; r++) {
    const s = outcomes(r).reduce((a, o) => a + o.p, 0);
    assert.ok(Math.abs(s - 1) < 1e-9, `${r} dados`);
  }
  // un póker de seises tiene 1/6⁵·5 de probabilidad... acá: la mano 66666 sale 1 de 7776 veces
  const g = outcomes(5).find((o) => o.dice.join('') === '66666');
  assert.ok(Math.abs(g.p - 1 / 7776) < 1e-12);
  assert.equal(keeps([1, 1, 1, 1, 1]).length, 6, 'cinco unos: guardar de 0 a 5');
  assert.equal(keeps([1, 2, 3, 4, 5]).length, 32);
});

test('la compu: siempre juega algo válido, tacha lo que menos sirve y anota la servida', () => {
  const r = mulberry(7);
  for (let i = 0; i < 300; i++) {
    const sheet = {};
    for (const c of CATS) if (r() < 0.4) sheet[c] = Math.floor(r() * 30);
    if (!open(sheet).length) continue;
    const dice = Array.from({ length: 5 }, () => 1 + Math.floor(r() * 6));
    const roll = 1 + Math.floor(r() * 3);
    for (const level of [1, 2, 3]) {
      const d = decide({ dice, roll, sheet, opts: { servida: true } }, level, r);
      if (d.t === 'roll') {
        assert.ok(roll < 3);
        assert.equal(d.hold.length, 5);
        assert.ok(!d.hold.every(Boolean));
      } else {
        assert.equal(d.t, 'score');
        assert.equal(sheet[d.cat], undefined, 'categoría libre');
      }
    }
  }
  // sin nada que sirva, tacha los unos (lo que menos promete)
  const b = bestCategory([2, 3, 4, 6, 6], { 2: 2, 3: 3, 4: 4, 6: 12, E: 20, F: 30, P: 40 }, false);
  assert.equal(b.cat, '1');
  // generala servida con la opción: la anota y gana
  assert.deepEqual(decide({ dice: [5, 5, 5, 5, 5], roll: 1, sheet: {}, opts: { servida: true } }, 1, r), { t: 'score', cat: 'G' });
});

test('la compu difícil juega mejor que la fácil', () => {
  const play = (level, seed) => {
    const r = mulberry(seed);
    const sheet = {};
    const memo = {};
    for (let t = 0; t < ROUNDS; t++) {
      let dice = [1, 1, 1, 1, 1], roll = 0;
      for (;;) {
        const d = decide({ dice, roll, sheet, opts: { servida: false } }, level, r, memo);
        if (d.t === 'roll') {
          dice = dice.map((v, i) => (roll > 0 && d.hold[i] ? v : 1 + Math.floor(r() * 6)));
          roll++;
        } else {
          sheet[d.cat] = scoreFor(d.cat, dice, roll === 1, sheet);
          break;
        }
      }
    }
    assert.equal(open(sheet).length, 0);
    return total(sheet);
  };
  let easy = 0, hard = 0;
  const N = 24;
  for (let i = 0; i < N; i++) {
    easy += play(1, 100 + i);
    hard += play(3, 100 + i);
  }
  easy /= N;
  hard /= N;
  assert.ok(hard > 145, `difícil promedia ${hard.toFixed(1)}`);
  assert.ok(hard > easy, `difícil ${hard.toFixed(1)} > fácil ${easy.toFixed(1)}`);
});

test('mesa: turnos, hasta tres tiradas, guardar, anotar una vez y pasar al siguiente', () => {
  const io = fakeIo();
  const T = new Table({ seats: seats(2), opts: { servida: true, first: 0 }, io, rng: mulberry(3) });
  T.start();
  assert.equal(T.t.seat, 0);
  assert.equal(T.act(1, { t: 'roll' }), false, 'no es su turno');
  assert.equal(T.act(0, { t: 'score', cat: '1' }), false, 'primero hay que tirar');
  assert.ok(T.act(0, { t: 'roll' }));
  const first = T.t.dice.slice();
  assert.equal(T.act(0, { t: 'hold', hold: [true, true, true, true, true, true] }), false, 'mal formado');
  assert.equal(T.act(0, { t: 'roll', hold: [true, true, true, true, true] }), false, 'no se tira con todo guardado');
  assert.ok(T.act(0, { t: 'roll', hold: [true, false, true, false, false] }));
  assert.equal(T.t.dice[0], first[0]);
  assert.equal(T.t.dice[2], first[2]);
  assert.ok(T.act(0, { t: 'roll', hold: [true, true, true, true, false] }));
  assert.equal(T.act(0, { t: 'roll' }), false, 'la cuarta no');
  const v = T.view(0);
  assert.equal(v.roll, 3);
  assert.ok(T.act(0, { t: 'score', cat: 'D' }));
  assert.equal(T.seats[0].sheet.D, 0, 'doble sin generala anotada: tachada');
  assert.equal(T.act(0, { t: 'score', cat: '1' }), false, 'ya anotó');
  io.run(1);
  assert.equal(T.t.seat, 1, 'turno del otro');
  assert.equal(T.view(1).ev.k, 'turn');
  // terminar la partida tachando de a una
  for (let k = 0; k < ROUNDS * 2 - 1; k++) {
    const s = T.t.seat;
    T.act(s, { t: 'roll' });
    T.act(s, { t: 'score', cat: open(T.seats[s].sheet)[0] });
    io.run(1);
  }
  assert.equal(T.phase, 'over');
  assert.equal(T.result.standings.length, 2);
  assert.ok(T.result.standings[0].score >= T.result.standings[1].score);
  assert.ok(io.over);
  assert.ok(T.seats.every((s) => open(s.sheet).length === 0));
});

test('generala servida: gana en el acto con la opción; sin la opción vale 50', () => {
  const five = () => 4;
  for (const servida of [true, false]) {
    const io = fakeIo();
    const T = new Table({ seats: seats(3), opts: { servida, first: 1 }, io, rng: mulberry(9), dieFn: five });
    T.start();
    T.act(1, { t: 'roll' });
    T.act(1, { t: 'score', cat: 'G' });
    if (servida) {
      assert.equal(T.phase, 'over');
      assert.equal(T.result.servida, 1);
      assert.equal(T.result.standings[0].seat, 1);
    } else {
      assert.equal(T.phase, 'play');
      assert.equal(T.seats[1].sheet.G, 50);
    }
  }
});

test('la compu juega una partida entera sola y no se traba', () => {
  const io = fakeIo();
  const T = new Table({ seats: seats(4, 2).map((s, i) => ({ ...s, bot: 1 + (i % 3) })), opts: { servida: false }, io, rng: mulberry(21) });
  T.start();
  io.run();
  assert.equal(T.phase, 'over');
  for (const s of T.seats) assert.equal(open(s.sheet).length, 0);
  assert.ok(T.result.standings[0].score > 80);
  assert.ok(io.now >= ROUNDS * 4 * SCORE_MS, 'con las pausas de las animaciones');
});

test('generala del día: los mismos dados en el mismo lugar aunque se guarden otros', () => {
  const dieFn = (turn, roll, die) => ((turn * 7 + roll * 3 + die * 5) % 6) + 1;
  const a = new Table({ seats: seats(1), opts: { servida: false, first: 0 }, io: fakeIo(), rng: mulberry(1), dieFn });
  const b = new Table({ seats: seats(1), opts: { servida: false, first: 0 }, io: fakeIo(), rng: mulberry(2), dieFn });
  a.start();
  b.start();
  a.act(0, { t: 'roll' });
  b.act(0, { t: 'roll' });
  assert.deepEqual(a.t.dice, b.t.dice);
  a.act(0, { t: 'roll', hold: [true, false, false, false, false] });
  b.act(0, { t: 'roll', hold: [false, false, false, false, true] });
  // los dados que se volvieron a tirar salen iguales en los dos
  for (let i = 1; i < 4; i++) assert.equal(a.t.dice[i], b.t.dice[i]);
});

test('servidor: la mesa corre allá, valida las jugadas y suma la compu', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    a.send({ t: 'create', game: 'generala', name: 'Ana' });
    await wait(150);
    a.send({ t: 'settings', settings: { bots: 1, level: 1, servida: 0 } });
    await wait(100);
    const room = a.last('room').room;
    assert.equal(room.settings.bots, 1);
    a.send({ t: 'settings', settings: { bots: 9, level: 7 } });
    await wait(100);
    assert.equal(a.last('room').room.settings.bots, 1, 'valores raros se ignoran');
    a.send({ t: 'start' });
    await wait(300);
    let v = a.last('g')?.s;
    assert.ok(v, 'llegó la mesa');
    assert.equal(v.seats.length, 2);
    assert.equal(v.servida, false);
    // jugar hasta anotar dos veces (la compu juega en el medio)
    let wrote = 0;
    for (let k = 0; k < 120 && wrote < 2; k++) {
      await wait(250);
      v = a.last('g').s;
      if (v.phase !== 'play' || v.turn !== v.me || v.done) continue;
      if (v.roll === 0) {
        a.send({ t: 'roll', hold: [true, true, true, true, true] }); // la primera tirada ignora lo guardado
        await wait(150);
        const r = a.last('g').s;
        assert.equal(r.roll, 1);
        a.send({ t: 'hold', hold: 'todo' }); // mal formado: se ignora
        a.send({ t: 'score', cat: 'Z' });
        await wait(100);
        a.send({ t: 'score', cat: open(r.seats[r.me].sheet)[0] });
        wrote++;
      }
    }
    assert.equal(wrote, 2);
    v = a.last('g').s;
    assert.ok(Object.keys(v.seats[v.me].sheet).length >= 1);
    assert.ok(Object.keys(v.seats[1 - v.me].sheet).length >= 1, 'la compu anotó');
    a.ws.close();
  } finally {
    srv.stop();
  }
});
