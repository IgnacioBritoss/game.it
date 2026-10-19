/** Micelio: física del frasco (apilar sin atravesarse, rodar, rebotes chicos), fusiones, secuencia con semilla y duelo online. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Jar, W, H, RADII, MAX_K, POINTS, dropper, maxScore } from '../public/games/micelio/shared/physics.js';
import { startServer, connect, wait } from './helpers.mjs';

const steps = (jar, secs) => {
  const ev = [];
  for (let t = 0; t < secs; t += 1 / 60) ev.push(...jar.step(1 / 60));
  return ev;
};

test('especies: radios crecientes, puntos triangulares y la más grande entra holgada en el frasco', () => {
  for (let k = 1; k <= MAX_K; k++) assert.ok(RADII[k] > RADII[k - 1]);
  assert.deepEqual(POINTS.slice(0, 5), [1, 3, 6, 10, 15]);
  assert.ok(RADII[MAX_K] * 2 < W * 0.7);
});

test('la secuencia de hongos con semilla es la misma para todos y solo trae las 5 especies chicas', () => {
  const a = dropper(42), b = dropper(42), c = dropper(43);
  const sa = Array.from({ length: 200 }, a), sb = Array.from({ length: 200 }, b), sc = Array.from({ length: 200 }, c);
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  assert.ok(sa.every((k) => k >= 0 && k <= 4));
  const count = [0, 0, 0, 0, 0];
  for (const k of sa) count[k]++;
  assert.ok(count[0] > count[4], 'las chicas salen más');
});

test('apila 50 hongos sin atravesarse ni salirse, y quedan quietos', () => {
  const jar = new Jar();
  const next = dropper(7);
  for (let i = 0; i < 50; i++) {
    jar.add(next() % 3 === 0 ? 5 : 3, 60 + ((i * 97) % 480), 40); // dos especies que no se funden entre sí
    steps(jar, 0.4);
  }
  steps(jar, 8);
  // quietos: en un segundo más casi no se mueven (lo que se mide es la posición, no la velocidad residual del contacto)
  const before = new Map(jar.bodies.map((b) => [b, [b.x, b.y]]));
  steps(jar, 1);
  let pen = 0, vmax = 0;
  for (const a of jar.bodies) {
    const [x0, y0] = before.get(a) || [a.x, a.y];
    vmax = Math.max(vmax, Math.hypot(a.x - x0, a.y - y0));
    assert.ok(a.x >= a.r - 1.5 && a.x <= W - a.r + 1.5 && a.y <= H - a.r + 1.5, 'adentro del frasco');
    for (const b of jar.bodies) if (a !== b) pen = Math.max(pen, a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y));
  }
  assert.ok(pen < 3, `se pisan ${pen.toFixed(2)} px`);
  assert.ok(vmax < 2, `se siguen moviendo: ${vmax.toFixed(2)} px en 1 s`);
});

test('dos iguales que se tocan se funden en la siguiente; dos de la última desaparecen', () => {
  const jar = new Jar();
  jar.add(2, 260, H - 40);
  jar.add(2, 340, H - 40);
  const ev = steps(jar, 1);
  const m = ev.filter((e) => e.t === 'merge');
  assert.equal(m.length, 1);
  assert.equal(m[0].k, 3);
  assert.equal(jar.bodies.length, 1);
  assert.equal(jar.bodies[0].k, 3);
  // la nueva crece y empuja (no aparece superpuesta)
  const j2 = new Jar();
  j2.add(MAX_K, 180, H - 200);
  j2.add(MAX_K, 420, H - 200);
  const ev2 = steps(j2, 2);
  assert.ok(ev2.some((e) => e.t === 'vanish'));
  assert.equal(j2.bodies.length, 0);
  // distintas no se funden
  const j3 = new Jar();
  j3.add(1, 280, H - 40);
  j3.add(2, 330, H - 40);
  assert.ok(!steps(j3, 1).some((e) => e.t === 'merge'));
  assert.equal(j3.bodies.length, 2);
});

test('una cadena: dos chicas que se funden arriba de una igual a la nueva dan dos fusiones seguidas', () => {
  const jar = new Jar();
  jar.add(1, 300, H - 30);
  jar.add(0, 278, H - 82);
  jar.add(0, 322, H - 82);
  const ev = steps(jar, 2);
  const ks = ev.filter((e) => e.t === 'merge').map((e) => e.k);
  assert.deepEqual(ks, [1, 2]);
});

test('ruedan: un hongo que cae en un costado de otro gira', () => {
  const jar = new Jar();
  jar.add(6, W / 2, H - RADII[6]);
  steps(jar, 1);
  const b = jar.add(1, W / 2 + RADII[6] * 0.6, 60);
  let spun = 0;
  for (let i = 0; i < 120; i++) {
    jar.step(1 / 60);
    spun = Math.max(spun, Math.abs(b.w));
  }
  assert.ok(spun > 1, `velocidad de giro ${spun}`);
});

test('línea de peligro: over() ignora lo recién soltado y top() da la altura de la pila', () => {
  const jar = new Jar();
  jar.add(4, 300, 30);
  assert.equal(jar.over(132).length, 0, 'recién soltado');
  steps(jar, 3);
  assert.equal(jar.over(132).length, 0, 'ya cayó');
  assert.ok(Math.abs(jar.top() - (H - 2 * RADII[4])) < 3);
  for (let i = 0; i < 9; i++) jar.add(7 + (i % 2), 80 + (i % 3) * 220, 600 - Math.floor(i / 3) * 230);
  steps(jar, 2);
  assert.ok(jar.over(132).length > 0, 'la pila asoma');
  assert.ok(jar.biggest() >= 8);
});

test('tope de puntos contra trampas: generoso pero finito', () => {
  assert.ok(maxScore(180) > 3000 && maxScore(180) < 20000);
});

test('duelo online: ajustes, esporas a un rival, puntajes imposibles rechazados y ranking por puntaje', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    const b = await connect(srv.port);
    a.send({ t: 'create', game: 'micelio', name: 'Ana', settings: { public: false, time: '2', spores: 'on' } });
    await wait(150);
    b.send({ t: 'join', game: 'micelio', code: a.last('joined').code, name: 'Beto' });
    await wait(150);
    a.send({ t: 'settings', settings: { time: '9', spores: 'maybe' } });
    await wait(100);
    assert.equal(a.last('room').room.settings.time, '2');
    assert.equal(a.last('room').room.settings.spores, 'on');
    a.send({ t: 'start' });
    await wait(200);
    const race = a.last('room').room.race;
    assert.equal(race.limit, 120e3);
    // antes de largar no se tiran esporas
    a.send({ t: 'atk', n: 3 });
    await wait(100);
    assert.equal(b.all('junk').length, 0);
    await wait(Math.max(0, race.startAt - Date.now() + 50));
    a.send({ t: 'atk', n: 3 });
    await wait(120);
    const junk = b.last('junk');
    assert.ok(junk && junk.n === 3 && junk.name === 'Ana');
    a.send({ t: 'atk', n: 2 }); // muy seguido: se ignora
    await wait(100);
    assert.equal(b.all('junk').length, 1);
    a.send({ t: 'atk', n: 99 });
    await wait(450);
    assert.equal(b.all('junk').length, 1, 'cantidad inválida');
    // puntaje imposible para el tiempo jugado
    a.send({ t: 'finish', score: 999999, biggest: 3 });
    await wait(100);
    assert.equal(b.all('finished').length, 0);
    b.send({ t: 'state', s: [80, 4, 30, 0] });
    a.send({ t: 'finish', score: 120, biggest: 6 });
    await wait(150);
    assert.equal(b.last('finished').score, 120);
    b.send({ t: 'finish', score: 300, biggest: 7 });
    await wait(150);
    const end = a.last('end');
    assert.ok(end);
    assert.deepEqual(end.results.map((r) => r.name), ['Beto', 'Ana']);
    a.ws.close();
    b.ws.close();
  } finally {
    srv.stop();
  }
});
