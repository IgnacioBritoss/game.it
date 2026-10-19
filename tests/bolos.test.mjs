/** Bolos: puntaje de bowling, física determinista (bolsillo, canaleta, efecto), compu por niveles y partida online. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sheet, next, mark, maxNext } from '../public/games/bolos/shared/rules.js';
import { Roll, simulate, count, quantize, validThrow, isSplit, ALL, HEAD } from '../public/games/bolos/shared/lane.js';
import { plan, LEVELS, rng } from '../public/games/bolos/shared/cpu.js';
import { startServer, connect, wait } from './helpers.mjs';

const marks = (rolls, N) => sheet(rolls, N).frames.map((f) => f.rolls.map((_, k) => mark(f, k)).join(''));

test('puntaje: perfecto, todo semipleno, todo canaleta y partidas de 5 cuadros', () => {
  assert.equal(sheet(Array(12).fill(10), 10).total, 300);
  assert.equal(sheet(Array(7).fill(10), 5).total, 150);
  assert.equal(sheet(Array(21).fill(0).map((_, i) => (i % 2 ? 1 : 9)), 10).total, 190);
  assert.equal(sheet(Array(20).fill(0), 10).total, 0);
  const s = sheet([10, 7, 3, 9, 0, 10, 10, 10, 2], 5);
  assert.deepEqual(s.frames.map((f) => f.total), [20, 39, 48, 78, 100]);
  assert.equal(s.final, true);
  assert.deepEqual(marks([10, 7, 3, 9, 0, 10, 10, 10, 2], 5), ['X', '7/', '9-', 'X', 'XX2']);
});

test('puntaje parcial mientras se juega y lo que sigue en el último cuadro', () => {
  const s = sheet([10, 10, 4], 5);
  assert.equal(s.frames[0].total, 24);
  assert.equal(s.frames[1].total, null);
  assert.equal(s.total, 24 + 10 + 4);
  assert.deepEqual(next([10, 10, 4], 5), { frame: 2, ball: 1, fresh: false, done: false });
  assert.equal(maxNext([10, 10, 4], 5), 6);
  // último cuadro: pleno → la segunda va contra 10; pleno + 7 → la tercera contra 3
  const base = [3, 4, 3, 4, 3, 4, 3, 4];
  assert.deepEqual(next([...base, 10], 5), { frame: 4, ball: 1, fresh: true, done: false });
  assert.deepEqual(next([...base, 10, 7], 5), { frame: 4, ball: 2, fresh: false, done: false });
  assert.equal(maxNext([...base, 10, 7], 5), 3);
  assert.deepEqual(next([...base, 8, 2], 5), { frame: 4, ball: 2, fresh: true, done: false });
  assert.equal(next([...base, 8, 1], 5).done, true);
  assert.deepEqual(marks([...base, 10, 7, 3], 5).at(-1), 'X7/');
  assert.deepEqual(marks([...base, 8, 2, 10], 5).at(-1), '8/X');
});

test('la física es determinista y solo usa la grilla de tiros', () => {
  const p = quantize({ x: 0.1234567, aim: -0.0012345678, speed: 8.33333, spin: -0.4444 });
  assert.deepEqual(p, { x: 0.123, aim: -0.00123, speed: 8.333, spin: -0.444 });
  assert.equal(simulate(ALL, p), simulate(ALL, p));
  assert.ok(validThrow(p));
  for (const bad of [null, {}, { x: 0, aim: 0, speed: 99, spin: 0 }, { x: 1, aim: 0, speed: 8, spin: 0 }, { x: 0, aim: 0, speed: 8, spin: NaN }, { x: 0, aim: 0.5, speed: 8, spin: 0 }]) assert.equal(validThrow(bad), false);
});

test('el bolsillo da plenos seguido; de frente quedan splits; la canaleta no tira nada', () => {
  // tiros que entran entre el 1 y el 3 (derecha) con algo de efecto
  let strikes = 0, n = 0, pins = 0;
  for (let x = 0.03; x <= 0.09; x += 0.01)
    for (const speed of [7.5, 8.5, 9.5]) {
      n++;
      const k = count(simulate(ALL, { x, aim: 0, speed, spin: 0 }));
      pins += k;
      if (k === 10) strikes++;
    }
  assert.ok(strikes / n > 0.3, `plenos en el bolsillo: ${strikes}/${n}`);
  assert.ok(pins / n > 9, `pinos por tiro en el bolsillo: ${(pins / n).toFixed(2)}`);
  let headOn = 0, splits = 0;
  for (const speed of [7, 8, 9, 10]) {
    const k = simulate(ALL, { x: 0, aim: 0, speed, spin: 0 });
    if (count(k) === 10) headOn++;
    if (isSplit(ALL & ~k)) splits++;
  }
  assert.ok(headOn <= 1);
  assert.ok(splits >= 1, 'de frente al 1 suele quedar un split');
  assert.equal(simulate(ALL, { x: 0.44, aim: 0.03, speed: 8, spin: 1 }), 0, 'canaleta');
});

test('el efecto engancha hacia su lado al final y los pinos ya caídos no cuentan', () => {
  const pos = (spin) => {
    const r = new Roll(ALL, { x: 0, aim: 0, speed: 8, spin });
    while (r.ball.y < HEAD - 0.5) r.step();
    return r.ball.x;
  };
  assert.ok(pos(-1) < -0.3 && pos(1) > 0.3 && Math.abs(pos(0)) < 1e-9);
  // con solo el 7 parado, un tiro al otro lado no tira nada
  assert.equal(simulate(1 << 6, { x: 0.3, aim: 0, speed: 8, spin: 0 }), 0);
  // y si le pega, cuenta solo el 7
  const k = simulate(1 << 6, { x: -0.38, aim: -0.004, speed: 8, spin: 0 });
  assert.equal(k, 1 << 6);
});

test('la compu: más nivel, más puntos', () => {
  const avg = (skill) => {
    const r = rng(11);
    let tot = 0;
    for (let g = 0; g < 6; g++) {
      const rolls = [];
      let st = ALL;
      while (!next(rolls, 5).done) {
        if (next(rolls, 5).fresh) st = ALL;
        const k = simulate(st, plan(st, skill, r, 24));
        rolls.push(count(k));
        st &= ~k;
      }
      tot += sheet(rolls, 5).total;
    }
    return tot / 6;
  };
  const e = avg(LEVELS.easy), p = avg(LEVELS.pro);
  assert.ok(p > e + 10, `pro ${p} vs fácil ${e}`);
});

test('online: tiros validados y simulados por el servidor, carriles paralelos, máquina si alguien se va y ranking final', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    const b = await connect(srv.port);
    a.send({ t: 'create', game: 'bolos', name: 'Ana', settings: { frames: '5' } });
    await wait(150);
    b.send({ t: 'join', game: 'bolos', code: a.last('joined').code, name: 'Beto' });
    await wait(150);
    a.send({ t: 'start' });
    await wait(200);
    const race = a.last('room').room.race;
    assert.equal(race.frames, 5);
    const ids = { a: a.last('joined').id, b: b.last('joined').id };
    assert.deepEqual([race.lanes[ids.a].lane, race.lanes[ids.b].lane].sort(), [0, 1]);
    a.send({ t: 'throw', p: { x: 0.05, aim: 0, speed: 8, spin: 0 } });
    await wait(100);
    assert.equal(b.all('roll').length, 0, 'antes de largar no se tira');
    await wait(Math.max(0, race.startAt - Date.now() + 60));
    a.send({ t: 'throw', p: { x: 2, aim: 0, speed: 8, spin: 0 } });
    await wait(100);
    assert.equal(b.all('roll').length, 0, 'tiro fuera de los límites');
    const p = { x: 0.05, aim: 0, speed: 8, spin: 0 };
    a.send({ t: 'throw', p });
    await wait(150);
    const roll = b.last('roll');
    assert.equal(roll.id, ids.a);
    assert.equal(roll.before, ALL);
    assert.equal(roll.knocked, simulate(ALL, quantize(p)), 'el servidor simula lo mismo que el navegador');
    assert.deepEqual(roll.rolls, [count(roll.knocked)]);
    // Ana juega todo; Beto se va y la máquina termina su carril
    const anaDone = () => next(a.all('roll').filter((r) => r.id === ids.a).at(-1)?.rolls || [], 5).done;
    for (let i = 0; i < 20 && !anaDone(); i++) {
      a.send({ t: 'throw', p: { x: 0.06, aim: 0, speed: 8.5, spin: 0 } });
      await wait(80);
    }
    assert.ok(anaDone());
    b.send({ t: 'leave' });
    for (let i = 0; i < 60 && !a.last('end'); i++) await wait(250);
    const end = a.last('end');
    assert.ok(end, 'terminó');
    assert.equal(end.results.length, 2);
    assert.ok(end.results.every((r) => typeof r.score === 'number'));
    assert.ok(end.results[0].score >= end.results[1].score);
    a.ws.close();
    b.ws.close();
  } finally {
    srv.stop();
  }
});
