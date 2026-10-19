/** Vuelo: trampolines, física del salto (despegue, viento, equilibrio, telemark), puntos y competencia online. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HILLS, HILL_IDS, geometry, ground, landAt, makeWind, Jump, bot, simulate, points, maxDist, takeoffQuality, takeoffLabel } from '../public/games/vuelo/shared/hill.js';
import { startServer, connect, wait } from './helpers.mjs';

const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;

test('trampolines: perfil que baja siempre, K medido sobre el perfil y velocidades de verdad', () => {
  for (const id of HILL_IDS) {
    const h = HILLS[id], g = geometry(id);
    for (let i = 1; i < g.land.length; i++) {
      assert.ok(g.land[i].y <= g.land[i - 1].y + 1e-9, `${id}: el perfil no sube`);
      assert.ok(g.land[i].x > g.land[i - 1].x, `${id}: el perfil avanza`);
    }
    const k = landAt(g, h.K);
    assert.ok(Math.abs(ground(g, k.x).u - h.K) < 0.5, `${id}: la distancia sobre el perfil en el K`);
    assert.ok(k.a > 0.5 && k.a < 0.75, `${id}: pendiente en el K ${(k.a * 57.3).toFixed(1)}°`);
    const kmh = g.v0 * 3.6;
    assert.ok(kmh > 82 && kmh < 108, `${id}: velocidad de despegue ${kmh.toFixed(1)} km/h`);
  }
  assert.ok(geometry('vuelo').v0 > geometry('grande').v0 && geometry('grande').v0 > geometry('normal').v0);
});

test('el mismo viento y el mismo saltador dan el mismo salto', () => {
  const a = simulate('grande', makeWind('grande', 99), bot(0.7, 5));
  const b = simulate('grande', makeWind('grande', 99), bot(0.7, 5));
  assert.deepEqual(a.result, b.result);
  assert.equal(makeWind('grande', 99).base, makeWind('grande', 99).base);
  assert.notDeepEqual(makeWind('grande', 99).gusts, makeWind('grande', 100).gusts);
});

test('el salto avisa que terminó una sola vez', () => {
  const j = new Jump('normal', makeWind('normal', 4, 0));
  const ctl = bot(0.9, 2);
  let done = 0;
  for (let i = 0; i < 60 * 40; i++) for (const e of j.step(1 / 60, ctl(j))) if (e.t === 'done') done++;
  assert.equal(j.over, true);
  assert.equal(done, 1);
});

test('saltar mejor y con viento de frente da más metros; los buenos pasan el K', () => {
  for (const id of ['normal', 'grande']) {
    const h = HILLS[id];
    const dist = (skill, w) => avg([1, 2, 3, 4, 5].map((s) => simulate(id, makeWind(id, s * 31, w), bot(skill, s * 7)).dist));
    const good = dist(0.95, 0), poor = dist(0.25, 0);
    assert.ok(good > poor + 8, `${id}: ${good.toFixed(1)} vs ${poor.toFixed(1)}`);
    assert.ok(good > h.K - 2 && good < h.HS + 6, `${id}: buen saltador ${good.toFixed(1)} m (K${h.K}, HS${h.HS})`);
    const head = dist(0.8, h.wind), tail = dist(0.8, -h.wind);
    assert.ok(head > tail + 5, `${id}: de frente ${head.toFixed(1)} vs de cola ${tail.toFixed(1)}`);
  }
});

test('el momento de soltar: perfecto en el borde, tarde o temprano pierde metros', () => {
  assert.equal(takeoffQuality(0), 1);
  assert.equal(takeoffQuality(-0.03), 1);
  assert.ok(takeoffQuality(0.15) < 0.6 && takeoffQuality(-0.3) === 0);
  assert.deepEqual([0, 0.06, -0.06, 0.2, -0.2].map(takeoffLabel), ['perfect', 'good', 'good', 'late', 'early']);
  // mismo saltador, mismo viento: soltar 0,2 s tarde
  const wind = makeWind('grande', 7, 0);
  const late = (j) => {
    const inp = bot(1, 3)(j);
    if (j.phase === 'inrun') inp.hold = true;
    if (j.phase === 'flight' && !j.pushed) inp.hold = j.t - j.edgeT < 0.2;
    return inp;
  };
  const a = simulate('grande', wind, bot(1, 3));
  const b = simulate('grande', wind, late);
  assert.equal(b.result.q < 0.7, true);
  assert.ok(a.dist > b.dist + 4, `perfecto ${a.dist} vs tarde ${b.dist}`);
});

test('telemark a tiempo suma estilo; sin marcarlo, menos; perder el equilibrio es caída', () => {
  const wind = makeWind('normal', 3, 0);
  const tele = simulate('normal', wind, bot(1, 1));
  assert.equal(tele.landing.kind, 'telemark');
  const noTele = simulate('normal', wind, (j) => {
    const inp = bot(1, 1)(j);
    if (j.phase === 'flight' && j.pushed) inp.hold = false;
    return inp;
  });
  assert.equal(noTele.landing.kind, 'two');
  assert.ok(tele.result.style >= noTele.result.style + 4.5, `${tele.result.style} vs ${noTele.result.style}`);
  // empujar el equilibrio para un lado hasta perderlo
  const lost = simulate('normal', wind, (j) => {
    const inp = bot(1, 1)(j);
    if (j.phase === 'flight' && j.pushed) inp.ux = 1;
    return inp;
  });
  assert.equal(lost.landing.kind, 'fall');
  assert.ok(lost.result.style < 45);
});

test('puntos: distancia desde el K más estilo de los 3 jueces del medio', () => {
  const j = simulate('grande', makeWind('grande', 12), bot(0.8, 2));
  const r = j.result;
  const s = [...r.judges].sort((a, b) => a - b);
  assert.equal(r.style, s[1] + s[2] + s[3]);
  assert.ok(r.judges.every((v) => v >= 0 && v <= 20 && v * 2 === Math.round(v * 2)));
  assert.equal(r.total, points('grande', r.dist, r.style));
  assert.equal(points('grande', 120, 54), 114);
  assert.equal(points('normal', 100, 50), 120);
  assert.equal(points('vuelo', 200, 55), 175);
  assert.ok(maxDist('grande') > HILLS.grande.HS);
});

test('online: mismos vientos, saltos validados, puntos sumados por el servidor y ranking', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    const b = await connect(srv.port);
    a.send({ t: 'create', game: 'vuelo', name: 'Ana', settings: { hill: 'normal', rounds: '2' } });
    await wait(150);
    b.send({ t: 'join', game: 'vuelo', code: a.last('joined').code, name: 'Beto' });
    await wait(150);
    a.send({ t: 'start' });
    await wait(250);
    const race = a.last('room').room.race;
    assert.equal(race.hill, 'normal');
    assert.equal(race.rounds, 2);
    assert.deepEqual(b.last('room').room.race.seed, race.seed);
    // el estado de uno le llega al otro (fantasma)
    a.send({ t: 'state', s: [2, 0, 300, -50, -300, 0, 0, 0] });
    await wait(120);
    assert.deepEqual(b.last('state').s, [2, 0, 300, -50, -300, 0, 0, 0]);
    // terminar antes de tiempo o con saltos imposibles: rechazado
    a.send({ t: 'finish', jumps: [{ dist: 100, style: 54 }, { dist: 98.5, style: 53.5 }] });
    await wait(150);
    assert.equal(b.all('finished').length, 0, 'demasiado rápido');
    await wait(Math.max(0, race.startAt + 2 * 5000 - Date.now() + 200));
    a.send({ t: 'finish', jumps: [{ dist: 300, style: 54 }, { dist: 98.5, style: 53.5 }] });
    b.send({ t: 'finish', jumps: [{ dist: 100, style: 61 }, { dist: 98.5, style: 53.5 }] });
    await wait(150);
    assert.equal(b.all('finished').length, 0, 'distancia o estilo imposibles');
    a.send({ t: 'finish', jumps: [{ dist: 100, style: 54 }, { dist: 98.5, style: 53.5 }] });
    b.send({ t: 'finish', jumps: [{ dist: 104, style: 55 }, { dist: 101, style: 54 }] });
    for (let i = 0; i < 40 && !a.last('end'); i++) await wait(100);
    const end = a.last('end');
    assert.ok(end);
    assert.deepEqual(end.results.map((r) => r.name), ['Beto', 'Ana']);
    assert.equal(end.results[1].total, Math.round((points('normal', 100, 54) + points('normal', 98.5, 53.5)) * 10) / 10);
    assert.deepEqual(end.results[0].dists, [104, 101]);
    a.ws.close();
    b.ws.close();
  } finally {
    srv.stop();
  }
});
