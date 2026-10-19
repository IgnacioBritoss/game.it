/** Cruce: mundo con semilla (siempre hay camino, tráfico que no se pisa), saltos, troncos, muertes, monedas, meta y carrera online. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, Hopper, L, HALF, HOP, SPAN, TRAIN_SPEED, TRAIN_LEN, WARN, RACE_ROWS, CHECK_EVERY, minRaceMs } from '../public/games/cruce/shared/world.js';
import { startServer, connect, wait } from './helpers.mjs';

const plain = (row) => JSON.stringify(row, (k, v) => (v instanceof Set ? [...v].sort((a, b) => a - b) : v));
const run = (h, secs, t0 = 0, dt = 1 / 120) => {
  const ev = [];
  let t = t0;
  for (; t < t0 + secs; t += dt) ev.push(...h.step(dt, t));
  return { ev, t };
};
/** Mundo con filas armadas a mano (las demás, pasto abierto). */
function custom(rows) {
  const w = new World(1);
  w.rows = [];
  const grass = () => ({ type: L.GRASS, trees: new Set(), coins: new Set(), decor: [] });
  rows.forEach((r) => w.rows.push({ ...grass(), ...r }));
  for (let i = 0; i < 40; i++) w.rows.push(grass());
  return w;
}

test('la misma semilla arma el mismo camino y otra semilla otro', () => {
  const a = new World(99), b = new World(99), c = new World(100);
  for (let r = 0; r < 300; r++) assert.equal(plain(a.row(r)), plain(b.row(r)));
  let diff = 0;
  for (let r = 0; r < 100; r++) if (plain(a.row(r)) !== plain(c.row(r))) diff++;
  assert.ok(diff > 20);
});

test('hay de todo: calles, ríos (troncos y camalotes), vías; y la dificultad sube', () => {
  const count = { [L.GRASS]: 0, [L.ROAD]: 0, [L.RIVER]: 0, [L.RAIL]: 0 };
  let pads = 0;
  const speed = { early: [], late: [] };
  for (let s = 1; s <= 30; s++) {
    const w = new World(s);
    for (let r = 0; r < 400; r++) {
      const row = w.row(r);
      count[row.type]++;
      if (row.pads) pads++;
      if (row.type === L.ROAD) (r < 60 ? speed.early : r > 300 ? speed.late : []).push(row.speed);
    }
  }
  for (const k in count) assert.ok(count[k] > 300, `tipo ${k}: ${count[k]}`);
  assert.ok(pads > 20);
  const avg = (l) => l.reduce((a, b) => a + b, 0) / l.length;
  assert.ok(avg(speed.late) > avg(speed.early) * 1.5);
  // al principio no hay río ni vías
  for (let s = 1; s <= 30; s++) {
    const w = new World(s);
    for (let r = 0; r < 3; r++) assert.equal(w.row(r).type, L.GRASS);
    for (let r = 0; r <= 8; r++) assert.notEqual(w.row(r).type, L.RIVER);
  }
});

test('siempre hay camino: de la salida se llega a la fila 400 sin atravesar árboles (y los camalotes conectan)', () => {
  for (let s = 1; s <= 60; s++) {
    const w = new World(s);
    const ok = (r, c) => {
      if (Math.abs(c) > HALF || r < 0) return false;
      const row = w.row(r);
      if (row.type === L.GRASS) return !row.trees.has(c);
      if (row.type === L.RIVER && row.pads) return row.pads.has(c);
      return true; // calle, vías y troncos se cruzan esperando el momento
    };
    const seen = new Set(['0:0']);
    const q = [[0, 0]];
    let far = 0;
    while (q.length) {
      const [r, c] = q.pop();
      far = Math.max(far, r);
      if (r >= 400) break;
      for (const [dr, dc] of [[1, 0], [0, 1], [0, -1], [-1, 0]]) {
        const k = `${r + dr}:${c + dc}`;
        if (!seen.has(k) && ok(r + dr, c + dc)) {
          seen.add(k);
          q.push([r + dr, c + dc]);
        }
      }
    }
    assert.ok(far >= 400, `semilla ${s}: se traba en la fila ${far}`);
  }
});

test('el tráfico es una función del tiempo y nunca se pisa (autos, camiones y troncos)', () => {
  for (let s = 1; s <= 20; s++) {
    const w = new World(s);
    for (let r = 0; r < 200; r++) {
      const row = w.row(r);
      if (row.type !== L.ROAD && !(row.type === L.RIVER && !row.pads)) continue;
      for (const t of [0, 1.7, 33.3, 120]) {
        const items = (row.type === L.ROAD ? w.cars(row, t) : w.logsAt(row, t)).map((c) => ({ ...c }));
        // en el circuito (que da la vuelta) dos cosas vecinas no se superponen
        const pos = items.map((c) => ({ a: ((c.x - c.len / 2 + SPAN * 10) % SPAN), len: c.len })).sort((p, q) => p.a - q.a);
        for (let i = 0; i < pos.length; i++) {
          const p = pos[i], q = pos[(i + 1) % pos.length];
          const gap = ((q.a - (p.a + p.len)) % SPAN + SPAN) % SPAN;
          if (pos.length > 1) assert.ok(gap >= 1 - 1e-9, `semilla ${s} fila ${r}: hueco ${gap}`);
        }
      }
      // determinista: mismo t, mismas posiciones
      assert.deepEqual(row.type === L.ROAD ? w.cars(row, 5) : w.logsAt(row, 5), row.type === L.ROAD ? w.cars(row, 5) : w.logsAt(row, 5));
    }
  }
});

test('el tren avisa antes de pasar, atropella mientras pasa y después se va', () => {
  const w = custom([{}, { type: L.RAIL, period: 8, phase: 0, dir: 1, coins: new Set() }]);
  const row = w.row(1);
  const dur = (SPAN + TRAIN_LEN) / TRAIN_SPEED;
  assert.equal(w.train(row, 8 - WARN - 0.1).warn, false);
  assert.equal(w.train(row, 8 - WARN + 0.1).warn, true);
  assert.equal(w.train(row, 8 - 0.05).on, null);
  // cruza x = 0 a mitad de camino
  const mid = (SPAN / 2 + TRAIN_LEN / 2) / TRAIN_SPEED;
  assert.ok(w.train(row, 8 + mid).on);
  assert.equal(w.hit(1, 0, 8 + mid), 'train');
  assert.equal(w.hit(1, 0, 8 + dur + 0.1), null);
});

test('saltar avanza una casilla en HOP segundos; los árboles frenan; las monedas se agarran una vez', () => {
  const w = custom([{}, { trees: new Set([0]), coins: new Set([1]) }, {}]);
  const h = new Hopper(w);
  assert.equal(h.press('up'), false, 'un árbol tapa');
  let { ev } = run(h, 0.05);
  assert.ok(ev.some((e) => e.t === 'bump'));
  assert.equal(h.row, 0);
  assert.equal(h.press('right'), true);
  ({ ev } = run(h, HOP + 0.02));
  assert.equal(h.x, 1);
  h.press('up');
  ({ ev } = run(h, HOP + 0.02));
  assert.equal(h.row, 1);
  assert.deepEqual(ev.filter((e) => e.t === 'coin'), [{ t: 'coin', row: 1, col: 1 }]);
  assert.equal(w.coinAt(1, 1), false);
  h.press('down');
  run(h, HOP + 0.02);
  h.press('up');
  ({ ev } = run(h, HOP + 0.02));
  assert.ok(!ev.some((e) => e.t === 'coin'), 'la moneda ya no está');
  assert.equal(h.best, 1);
  // no se sale de la zona jugable
  h.reset(1, HALF);
  assert.equal(h.press('right'), false);
});

test('una orden en el aire se guarda y se hace al caer', () => {
  const w = custom([]);
  const h = new Hopper(w);
  h.press('up');
  run(h, HOP / 2);
  h.press('up');
  run(h, HOP * 2 + 0.05);
  assert.equal(h.row, 2);
});

test('río: el agua ahoga, el tronco te lleva y si te saca de la zona, perdés; el camalote sostiene quieto', () => {
  const logRow = { type: L.RIVER, dir: 1, speed: 2, logs: [{ o: 0, len: 3 }], coins: new Set() };
  // el tronco está centrado en x = -15 + 0·… en t = 0: ubicarlo debajo de la columna 0 eligiendo el instante
  const w = custom([{}, logRow]);
  const tAt0 = 15 / 2; // x = -15 + 2t = 0
  const h = new Hopper(w);
  h.press('up');
  let { ev, t } = run(h, HOP + 0.01, tAt0 - HOP);
  assert.ok(ev.some((e) => e.t === 'land'), JSON.stringify(ev));
  assert.ok(h.alive);
  assert.equal(h.ride, 2);
  const x0 = h.x;
  ({ ev, t } = run(h, 1, t));
  assert.ok(Math.abs(h.x - (x0 + 2)) < 0.05, 'lo lleva el tronco');
  ({ ev } = run(h, 4, t));
  assert.ok(ev.some((e) => e.t === 'die' && e.cause === 'swept'));
  // agua
  const h2 = new Hopper(w);
  h2.press('up');
  ({ ev } = run(h2, HOP + 0.05, 0));
  assert.ok(ev.some((e) => e.t === 'die' && e.cause === 'water'));
  // camalote
  const w3 = custom([{}, { type: L.RIVER, pads: new Set([0]), logs: [], speed: 0, dir: 1, coins: new Set() }]);
  const h3 = new Hopper(w3);
  h3.press('up');
  ({ ev } = run(h3, 2));
  assert.ok(h3.alive && h3.row === 1 && h3.x === 0);
  h3.press('right');
  ({ ev } = run(h3, 0.5));
  assert.ok(ev.some((e) => e.cause === 'water'));
});

test('calle: el auto atropella al que está en su carril (también a mitad de salto)', () => {
  const road = { type: L.ROAD, dir: 1, speed: 4, len: 1.5, cars: [{ o: 0, len: 1.5, kind: 0 }], coins: new Set() };
  const w = custom([{}, road]);
  const h = new Hopper(w);
  h.press('up');
  // el auto pasa por x = 0 en t = 15 / 4
  const { ev } = run(h, 6, 0);
  const d = ev.find((e) => e.t === 'die');
  assert.ok(d && d.cause === 'car');
});

test('carrera: puntos de control cada 25 filas, meta y tiempo mínimo', () => {
  const w = new World(5, { finish: RACE_ROWS.short });
  for (let r = CHECK_EVERY; r < RACE_ROWS.short; r += CHECK_EVERY) {
    assert.equal(w.row(r).type, L.GRASS);
    assert.equal(w.row(r).mark, 'check');
    assert.equal(w.row(r).trees.size, 0);
  }
  assert.equal(w.row(RACE_ROWS.short).mark, 'finish');
  for (let r = RACE_ROWS.short + 1; r < RACE_ROWS.short + 10; r++) assert.equal(w.row(r).type, L.GRASS);
  const h = new Hopper(w, { row: RACE_ROWS.short - 1 });
  h.x = 0;
  h.press('up');
  const { ev } = run(h, HOP + 0.05);
  assert.ok(ev.some((e) => e.t === 'finish'));
  assert.equal(h.done, true);
  assert.equal(h.press('up'), false);
  assert.ok(minRaceMs(60) > 0 && minRaceMs(60) < 60 * HOP * 1000);
});

test('carrera online: lista pública, fantasmas, tiempo imposible rechazado y ranking por fila alcanzada', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    const b = await connect(srv.port);
    a.send({ t: 'create', game: 'cruce', name: 'Ana', settings: { public: true, length: 'short' } });
    await wait(150);
    const code = a.last('joined').code;
    b.send({ t: 'list', game: 'cruce' });
    await wait(150);
    assert.ok(b.last('list').rooms.some((r) => r.code === code && r.state === 'lobby'));
    b.send({ t: 'join', game: 'cruce', code, name: 'Beto' });
    await wait(150);
    a.send({ t: 'start' });
    await wait(200);
    const race = a.last('room').room.race;
    assert.equal(race.length, 'short');
    b.send({ t: 'state', s: [150, 7, 0, 0, 2, 7] });
    await wait(120);
    assert.deepEqual(a.last('state').s, [150, 7, 0, 0, 2, 7]);
    a.send({ t: 'finish', time: 100, deaths: 0 });
    await wait(120);
    assert.equal(b.all('finished').length, 0, 'demasiado rápido');
    await wait(Math.max(0, race.startAt + minRaceMs(RACE_ROWS.short) + 50 - Date.now()));
    a.send({ t: 'finish', time: minRaceMs(RACE_ROWS.short) + 20, deaths: 1 });
    await wait(150);
    assert.equal(b.last('finished').place, 1);
    b.send({ t: 'leave' });
    await wait(200);
    const end = a.last('end');
    assert.ok(end);
    assert.equal(end.results[0].name, 'Ana');
    a.ws.close();
    b.ws.close();
  } finally {
    srv.stop();
  }
});
