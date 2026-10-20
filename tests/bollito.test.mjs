/** Bollito: física del bollito (aro, paredes, fondo, muebles, viento), lugares alcanzables, puntos, series y online. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPOTS, SPOT_IDS, BIN, BALL_R, Toss, simulate, solve, aimAt, crossing, quantize, validThrow, launch, frame } from '../public/games/bollito/shared/physics.js';
import { ROUNDS, LIVES, course, classicRound, classicLevel, scoreThrow, multFor, tallyMarks, replaySeries, maxScore, marksText, rng, windSpeed, WIND_SCALES } from '../public/games/bollito/shared/rules.js';
import { startServer, connect, wait } from './helpers.mjs';

/** Corre un Toss desde una posición y velocidad dadas (para probar choques puntuales). */
function drop(spotId, pos, vel = { x: 0, y: 0, z: 0 }, wind = null) {
  const s = new Toss(spotId, wind, { a: 0, p: 0.5 });
  Object.assign(s.p, pos);
  Object.assign(s.v, vel);
  const ev = [];
  while (!s.over) ev.push(...s.step());
  return { s, ev, kinds: ev.filter((e) => e.t === 'hit').map((e) => e.kind) };
}

test('el mismo tiro da exactamente el mismo resultado (determinista)', () => {
  const w = { x: 1.7, z: -0.8 };
  const a = simulate('lejos', w, { a: 0.12, p: 0.63 }, 1);
  const b = simulate('lejos', w, { a: 0.12, p: 0.63 }, 1);
  assert.deepEqual(a, b);
  assert.deepEqual(course(123), course(123));
  assert.notDeepEqual(course(123), course(124));
  assert.deepEqual(course('bollito:daily:2026-10-20'), course('bollito:daily:2026-10-20'));
});

test('la fuerza da velocidad y ángulo: más fuerte, más rápido y más tendido', () => {
  const lo = launch('cerca', { a: 0, p: 0 }).vel, hi = launch('cerca', { a: 0, p: 1 }).vel;
  const sp = (v) => Math.hypot(v.x, v.y, v.z);
  assert.ok(sp(hi) > sp(lo) * 3);
  assert.ok(hi.y / Math.hypot(hi.x, hi.z) < lo.y / Math.hypot(lo.x, lo.z));
  // la puntería corre la dirección hacia la derecha del que tira
  const f = frame('cerca');
  const r = launch('cerca', { a: 1, p: 0.5 }).vel;
  assert.ok(r.x * f.rx + r.z * f.rz > 0);
});

test('cada lugar del cesto se puede embocar, con calma y con viento fuerte de cualquier lado', () => {
  for (const id of SPOT_IDS) {
    assert.ok(solve(id, null), `${id}: sin viento`);
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      const w = { x: Math.round(Math.cos(ang) * 4 * 100) / 100, z: Math.round(Math.sin(ang) * 4 * 100) / 100 };
      const t = solve(id, w);
      assert.ok(t, `${id}: viento ${JSON.stringify(w)}`);
      assert.ok(validThrow(t));
    }
  }
});

test('el viento empuja: el mismo tiro cae corrido hacia donde sopla, y hay que compensarlo', () => {
  const id = 'pasillo';
  const f = frame(id);
  const t = aimAt(id, null);
  const calm = crossing(id, null, t);
  const right = crossing(id, { x: f.rx * 3, z: f.rz * 3 }, t);
  const head = crossing(id, { x: -f.fx * 3, z: -f.fz * 3 }, t);
  assert.ok(Math.abs(calm.l) < 0.01 && Math.abs(calm.d) < 0.01);
  assert.ok(right.l > 0.15, `de costado corre ${right.l.toFixed(2)} m`);
  assert.ok(head.d < -0.15, `de frente se queda corto ${head.d.toFixed(2)} m`);
  assert.equal(simulate(id, { x: f.rx * 3, z: f.rz * 3 }, quantize(t)).made, false);
  assert.ok(solve(id, { x: f.rx * 3, z: f.rz * 3 }).a < -0.05, 'se apunta contra el viento');
});

test('aro: el bollito que cae justo en el borde rebota en el aro; en el centro entra limpio hasta el fondo', () => {
  const s = SPOTS.cerca;
  const top = s.y + BIN.h;
  const center = drop('cerca', { x: s.x, y: top + 0.5, z: s.z });
  assert.equal(center.s.result, 'in');
  assert.equal(center.s.clean, true);
  assert.ok(center.kinds.includes('bottom'));
  assert.ok(Math.abs(center.s.p.y - (s.y + BALL_R + 0.008)) < 0.003, 'quieto en el fondo');
  // justo sobre el aro, un poco hacia afuera: toca el aro y cae afuera
  const out = drop('cerca', { x: s.x + BIN.rt + 0.02, y: top + 0.5, z: s.z });
  assert.ok(out.kinds.includes('rim'));
  assert.equal(out.s.result, 'miss');
  assert.ok(out.s.p.y < 0.05 && Math.hypot(out.s.p.x - s.x, out.s.p.z - s.z) > BIN.rt);
  // un poco hacia adentro: toca el aro y entra bailando (no es limpio)
  const rattle = drop('cerca', { x: s.x + BIN.rt - 0.02, y: top + 0.5, z: s.z });
  assert.ok(rattle.kinds.includes('rim'));
  assert.equal(rattle.s.result, 'in');
  assert.equal(rattle.s.clean, false);
});

test('paredes del cesto: de afuera no se atraviesan y de adentro no se sale', () => {
  const s = SPOTS.cerca;
  // tiro rasante contra la pared de afuera, a media altura
  const hit = drop('cerca', { x: s.x - 0.6, y: s.y + 0.15, z: s.z }, { x: 4, y: 0.5, z: 0 });
  assert.ok(hit.kinds.includes('wall'));
  assert.equal(hit.s.result, 'miss');
  assert.ok(hit.s.p.x < s.x - BIN.rb, 'rebotó hacia atrás');
  // adentro, tirado de costado contra la pared: se queda adentro
  const inside = drop('cerca', { x: s.x, y: s.y + 0.12, z: s.z }, { x: 3, y: 1, z: 0.5 });
  assert.equal(inside.s.result, 'in');
  const r = Math.hypot(inside.s.p.x - s.x, inside.s.p.z - s.z);
  assert.ok(r < BIN.rb, `terminó adentro (r ${r.toFixed(3)})`);
});

test('muebles y piso: el bollito se apoya en el escritorio y en el archivero, nunca atraviesa el piso', () => {
  const desk = drop('cerca', { x: 1.9, y: 1.4, z: 2.6 });
  assert.ok(desk.kinds.includes('wood'));
  assert.ok(Math.abs(desk.s.p.y - (0.75 + BALL_R)) < 0.004, `arriba de la mesita (${desk.s.p.y.toFixed(3)})`);
  const cab = drop('cerca', { x: 1.6, y: 1.6, z: 5.3 });
  assert.ok(cab.kinds.includes('metal'));
  const R = rng(5);
  for (let i = 0; i < 120; i++) {
    const id = SPOT_IDS[i % SPOT_IDS.length];
    const w = { x: (R() - 0.5) * 8, z: (R() - 0.5) * 8 };
    const t = quantize({ a: R() * 2 - 1, p: R() });
    const sim = new Toss(id, w, t);
    let minY = 9;
    while (!sim.over) {
      sim.step();
      minY = Math.min(minY, sim.p.y);
    }
    assert.ok(minY >= BALL_R - 1e-9, 'nunca bajo el piso');
    // si terminó adentro del cesto, la física dice que entró (y al revés)
    const s = SPOTS[id];
    const inBin = Math.hypot(sim.p.x - s.x, sim.p.z - s.z) < BIN.rb && sim.p.y < s.y + BIN.h && sim.p.y > s.y;
    assert.equal(inBin, sim.result === 'in', `${id} ${JSON.stringify(t)}`);
  }
});

test('el tiro termina siempre y avisa el resultado una sola vez', () => {
  const sim = new Toss('archivero', { x: 0.5, z: 0.5 }, { a: 0.3, p: 0.9 });
  let res = 0, rest = 0;
  for (let i = 0; i < 4000 && !sim.over; i++) for (const e of sim.step()) e.t === 'in' || e.t === 'miss' ? res++ : e.t === 'rest' && rest++;
  assert.equal(sim.over, true);
  assert.equal(res, 1);
  assert.equal(rest, 1);
});

test('puntos: base del lugar, mitad más por limpio y multiplicador por racha', () => {
  assert.deepEqual([1, 2, 3, 5, 6, 9, 10, 15].map(multFor), [1, 1, 2, 2, 3, 3, 4, 4]);
  assert.deepEqual(scoreThrow('cerca', true, false, 0), { pts: 10, base: 10, bonus: 0, mult: 1, streak: 1 });
  assert.deepEqual(scoreThrow('lejos', true, true, 2), { pts: 60, base: 20, bonus: 10, mult: 2, streak: 3 });
  assert.equal(scoreThrow('lejos', false, false, 7).pts, 0);
  assert.equal(scoreThrow('lejos', false, false, 7).streak, 0);
  const list = [{ spot: 'cerca' }, { spot: 'cerca' }, { spot: 'pasillo' }, { spot: 'lejos' }];
  const marks = [{ made: true, clean: false }, { made: true, clean: true }, { made: true, clean: false }, { made: false, clean: false }];
  assert.deepEqual(tallyMarks(list, marks), { score: 10 + 15 + 30, made: 3, clean: 1, streak: 3 });
  assert.equal(marksText(marks), '🟩⭐🟩⬜');
});

test('series de 10: dificultad creciente, vientos que crecen y escala de viento', () => {
  const c = course(77);
  assert.equal(c.length, ROUNDS);
  const tiers = c.map((r) => SPOTS[r.spot].tier);
  assert.deepEqual(tiers, [...tiers].sort((a, b) => a - b));
  for (let i = 1; i < c.length; i++) assert.notEqual(c[i].spot, c[i - 1].spot);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const ws = (k) => avg(Array.from({ length: 40 }, (_, s) => windSpeed(course(s + 1)[k].wind)));
  assert.ok(ws(9) > ws(0) * 3, 'el viento crece');
  const soft = avg(Array.from({ length: 40 }, (_, s) => windSpeed(course(s + 1, WIND_SCALES.suave)[9].wind)));
  assert.ok(soft < ws(9) * 0.7);
  // cada tiro de la serie se puede embocar
  for (const r of course(2026)) assert.ok(solve(r.spot, r.wind), r.spot);
});

test('Clásico: el cesto se aleja y el viento crece con los aciertos, sin repetir lugar seguido', () => {
  assert.equal(LIVES, 3);
  assert.equal(classicLevel(0).tier, 0);
  assert.ok(classicLevel(0).wind < 0.5);
  assert.equal(classicLevel(12).tier, 3);
  assert.ok(classicLevel(12).wind > 3);
  const R = rng('clasico');
  let prev = null;
  for (let made = 0; made < 30; made++) {
    const r = classicRound(R, made, prev);
    assert.notEqual(r.spot, prev);
    assert.ok(SPOTS[r.spot].tier <= classicLevel(made).tier);
    assert.ok(windSpeed(r.wind) <= classicLevel(made).wind + 0.02);
    prev = r.spot;
  }
});

test('repetir una serie: los tiros perfectos suman lo mismo que dice la física; tiros inválidos se rechazan', () => {
  const c = course(31337);
  const good = c.map((r) => solve(r.spot, r.wind));
  const rep = replaySeries(c, good);
  assert.equal(rep.made, ROUNDS);
  assert.ok(rep.score > 0 && rep.score <= maxScore(c));
  assert.equal(replaySeries(c, good.slice(0, 9)), null);
  assert.equal(replaySeries(c, [...good.slice(0, 9), { a: 2, p: 0.5 }]), null);
  assert.equal(replaySeries(c, [...good.slice(0, 9), { a: 0.1234, p: 0.5 }]), null, 'fuera de la grilla');
  assert.equal(replaySeries(c, [...good.slice(0, 9), { a: 0, p: NaN }]), null);
});

test('online: misma serie para todos, puntaje en vivo, el servidor vuelve a simular y arma el ranking', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    const b = await connect(srv.port);
    a.send({ t: 'create', game: 'bollito', name: 'Ana', settings: { wind: 'fuerte' } });
    await wait(150);
    // sola no se puede largar
    a.send({ t: 'start' });
    await wait(120);
    assert.equal(a.last('error')?.code, 'need_players');
    b.send({ t: 'join', game: 'bollito', code: a.last('joined').code, name: 'Beto' });
    await wait(150);
    a.send({ t: 'start' });
    await wait(250);
    const race = a.last('room').room.race;
    assert.equal(race.wind, 'fuerte');
    assert.equal(race.rounds, ROUNDS);
    assert.equal(b.last('room').room.race.seed, race.seed);
    const list = course(race.seed, WIND_SCALES.fuerte);
    // el puntaje en vivo le llega al otro
    a.send({ t: 'state', s: [3, 45, 0b101, 0b001, 0] });
    await wait(120);
    assert.deepEqual(b.last('state').s, [3, 45, 5, 1, 0]);
    const good = list.map((r) => solve(r.spot, r.wind));
    const bad = list.map((r, i) => (i < 4 ? solve(r.spot, r.wind) : { a: -1, p: 0 }));
    // demasiado rápido: rechazado
    a.send({ t: 'finish', throws: good });
    await wait(150);
    assert.equal(b.all('finished').length, 0, 'demasiado rápido');
    await wait(Math.max(0, race.startAt + ROUNDS * 1100 - Date.now() + 200));
    a.send({ t: 'finish', throws: good.slice(0, 7) });
    b.send({ t: 'finish', throws: good.map((t) => ({ ...t, p: 1.5 })) });
    await wait(150);
    assert.equal(b.all('finished').length, 0, 'tiros incompletos o imposibles');
    a.send({ t: 'finish', throws: bad });
    b.send({ t: 'finish', throws: good, score: 1 });
    for (let i = 0; i < 40 && !a.last('end'); i++) await wait(100);
    const end = a.last('end');
    assert.ok(end);
    assert.deepEqual(end.results.map((r) => r.name), ['Beto', 'Ana']);
    assert.equal(end.results[0].score, replaySeries(list, good).score, 'el servidor calcula el puntaje');
    assert.equal(end.results[0].made, ROUNDS);
    assert.equal(end.results[1].score, replaySeries(list, bad).score);
    assert.equal(end.results[1].made, 4);
    assert.equal(end.results[1].marks.length, ROUNDS);
    a.ws.close();
    b.ws.close();
  } finally {
    srv.stop();
  }
});
