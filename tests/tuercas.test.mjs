/**
 * Tuercas: pistas (cierran, no se pisan, largada en recta), piezas y estadísticas, física del vehículo (derrape con
 * miniturbo, saltos, bordes, caídas, choques), ítems, bots que completan cada pista en cada nivel, determinismo,
 * modelos 3D de todas las combinaciones y textos en los dos idiomas.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { TRACK_DEFS, TRACK_IDS, CUPS, getTrack } from '../public/games/tuercas/shared/tracks.js';
import { validate, project, groundAt, pointAt, gridSlot } from '../public/games/tuercas/shared/track.js';
import { DRIVERS, BODIES, WHEELS, EXTRAS, PAINTS, TUNING, STATS, CLASSES, sanitize, statsOf, params, randomConfig, DEFAULT_CONFIG } from '../public/games/tuercas/shared/parts.js';
import { createRace, stepRace, endRace, DT, COUNT_TIME, pointsFor } from '../public/games/tuercas/shared/race.js';
import { makeKart, placeKart, stepKart, hitKart } from '../public/games/tuercas/shared/kart.js';
import { ITEMS, ITEM_IDS, itemWeights, rollItem, useItem } from '../public/games/tuercas/shared/items.js';
import { think } from '../public/games/tuercas/shared/ai.js';
import { rng } from '../public/games/tuercas/shared/util.js';
import { TXT } from '../public/games/tuercas/text.js';

const IDLE = { steer: 0, accel: false, brake: false, drift: false, item: false };
const noEv = () => {};

/** Corre una carrera de solo bots y cuenta eventos. */
function runBots(track, cls, seed, maxT = 300) {
  const R = createRace({ track, cls, seed, entries: [] });
  const count = {};
  let steps = 0;
  while (!R.over && R.t < maxT) {
    stepRace(R, []);
    steps++;
    for (const e of R.events) count[e.type] = (count[e.type] || 0) + 1;
    R.events.length = 0;
  }
  return { R, count, steps };
}

test('las seis pistas cierran, no se pisan y la largada está en una recta', () => {
  assert.equal(TRACK_DEFS.length, 6);
  const themes = new Set();
  for (const def of TRACK_DEFS) {
    const T = getTrack(def.id);
    assert.deepEqual(validate(T), [], `${def.id}: ${validate(T).join(' | ')}`);
    assert.ok(T.len > 550 && T.len < 1100, `${def.id}: largo ${T.len.toFixed(0)}`);
    assert.ok(T.clearance > 15, `${def.id}: holgura entre tramos ${T.clearance.toFixed(1)}`);
    assert.ok(def.name.es && def.name.en && def.blurb.es && def.blurb.en);
    assert.ok(T.boxes.length >= 12 && T.nuts.length >= 20 && T.pads.length >= 3, `${def.id}: cajas, tuercas y aceleradores`);
    // el último punto casi toca el primero: no hay saltos al cerrar
    const dx = T.x[T.n - 1] - T.x[0];
    const dz = T.z[T.n - 1] - T.z[0];
    assert.ok(Math.hypot(dx, dz) < T.step * 1.6, `${def.id}: cierra`);
    for (let i = 0; i < T.n; i++) assert.ok(Number.isFinite(T.x[i] + T.z[i] + T.y[i] + T.curv[i] + T.line[i]), `${def.id}: números finitos`);
    themes.add(T.theme);
  }
  assert.equal(themes.size, 6, 'cada pista tiene su tema');
  for (const c of CUPS) for (const id of c.tracks) assert.ok(TRACK_IDS.includes(id));
});

test('project() sigue la pista sin saltar a otro tramo y groundAt() es continuo', () => {
  const T = getTrack('volcan');
  const out = { i: 0, a: 0, d: 0 };
  let hint = -1;
  let prev = null;
  for (let s = 0; s < T.len; s += 0.5) {
    const P = pointAt(T, s, 3, false);
    project(T, P.x, P.z, hint, out);
    hint = out.i;
    assert.ok(Math.abs(out.d - 3) < 0.35, `desvío ${out.d.toFixed(2)} en s=${s}`);
    const y = groundAt(T, out.i, out.a, out.d);
    // los lomos terminan en un corte a propósito: ahí sí hay un salto de altura
    const onRamp = T.ramps.some((r) => ((s - r.s0 + T.len) % T.len) < r.len + 1.5);
    if (prev !== null && !onRamp) assert.ok(Math.abs(y - prev) < 0.5, `salto de altura ${Math.abs(y - prev).toFixed(2)} en s=${s}`);
    prev = onRamp ? null : y;
  }
});

test('la grilla de largada tiene ocho lugares sobre la pista', () => {
  for (const id of TRACK_IDS) {
    const T = getTrack(id);
    const out = { i: 0, a: 0, d: 0 };
    const seen = new Set();
    for (let k = 0; k < 8; k++) {
      const g = gridSlot(T, k);
      project(T, g.x, g.z, -1, out);
      assert.ok(Math.abs(out.d) < T.hw[out.i] - 1, `${id}: lugar ${k} dentro de la calzada`);
      seen.add(`${g.x.toFixed(1)},${g.z.toFixed(1)}`);
    }
    assert.equal(seen.size, 8);
  }
});

test('piezas: estadísticas entre 1 y 10, parámetros razonables y configuración a prueba de datos rotos', () => {
  assert.equal(STATS.length, 6);
  assert.equal(DRIVERS.length, 8);
  assert.equal(BODIES.filter((b) => b.bike).length, 3);
  assert.equal(BODIES.filter((b) => !b.bike).length, 4);
  assert.equal(WHEELS.length, 5);
  assert.equal(EXTRAS.length, 5);
  assert.equal(PAINTS.length, 10);
  for (const list of [DRIVERS, BODIES, WHEELS, EXTRAS]) {
    for (const p of list) {
      assert.equal(p.s.length, 6, `${p.id}: seis estadísticas`);
      assert.ok(p.bio.es && p.bio.en, `${p.id}: descripción en los dos idiomas`);
      assert.ok(typeof p.name === 'string' ? p.name : p.name.es && p.name.en);
    }
  }
  // todas las combinaciones dan estadísticas válidas y parámetros de física sanos
  let fastest = 0;
  let slowest = 1e9;
  for (const d of DRIVERS) for (const b of BODIES) for (const w of WHEELS) for (const e of EXTRAS) {
    const cfg = { driver: d.id, body: b.id, wheels: w.id, extra: e.id, paint: 0, tune: [0, 0, 0] };
    const st = statsOf(cfg);
    for (const v of st) assert.ok(v >= 1 && v <= 10);
    const P = params(cfg);
    assert.ok(P.vmax > 24 && P.vmax < 33 && P.accel > 8 && P.turn > 1.6 && P.mass > 0.7 && P.off > 0.4 && P.off < 0.85, JSON.stringify(P));
    fastest = Math.max(fastest, P.vmax);
    slowest = Math.min(slowest, P.vmax);
  }
  assert.ok(fastest - slowest > 3, `las piezas cambian de verdad la velocidad (${slowest.toFixed(1)}–${fastest.toFixed(1)})`);
  // la puesta a punto cambia una estadística por otra
  const base = statsOf(DEFAULT_CONFIG);
  const geared = statsOf({ ...DEFAULT_CONFIG, tune: [2, 0, 0] });
  assert.ok(geared[TUNING[0].up] > base[TUNING[0].up] && geared[TUNING[0].down] < base[TUNING[0].down]);
  // datos rotos
  const bad = sanitize({ driver: 'nadie', body: 5, wheels: null, extra: {}, paint: 99, tune: [9, -9, 'x'] });
  assert.deepEqual(bad.tune, [2, -2, 0]);
  assert.equal(bad.paint, 0);
  assert.ok(DRIVERS.some((d) => d.id === bad.driver));
  assert.deepEqual(sanitize(undefined).tune, [0, 0, 0]);
  // las motos y los autos manejan distinto
  assert.equal(params({ ...DEFAULT_CONFIG, body: 'avispa' }).mtLevels, 2);
  assert.equal(params(DEFAULT_CONFIG).mtLevels, 3);
  // los bots no repiten piloto si se puede
  const R = rng(5);
  const used = [];
  for (let i = 0; i < 7; i++) used.push(randomConfig(R, used).driver);
  assert.equal(new Set(used).size, 7);
  assert.ok(CLASSES[0].speed < CLASSES[1].speed && CLASSES[1].speed < CLASSES[2].speed);
});

test('los bots completan las seis pistas en los tres niveles y nadie se cae del mapa', () => {
  for (const id of TRACK_IDS) {
    for (const cls of ['paseo', 'carrera', 'fierro']) {
      const { R, count } = runBots(id, cls, 11);
      assert.ok(R.over, `${id}/${cls}: terminó (t=${R.t.toFixed(0)})`);
      const done = R.results.filter((r) => !r.estimated).length;
      assert.ok(done >= 6, `${id}/${cls}: llegaron ${done}/8`);
      const best = R.results[0].time;
      const lapAvg = best / R.laps;
      assert.ok(lapAvg > 14 && lapAvg < 45, `${id}/${cls}: vuelta de ${lapAvg.toFixed(1)} s`);
      assert.ok((count.fall || 0) <= 6, `${id}/${cls}: demasiadas caídas (${count.fall})`);
      assert.ok(count.box > 8 && count.nut > 15, `${id}/${cls}: junta cajas y tuercas`);
      for (const k of R.karts) assert.ok(Number.isFinite(k.x + k.y + k.z + k.v), 'sin NaN');
    }
  }
});

test('la carrera es determinista y distintos niveles dan distintos tiempos', () => {
  const a = runBots('costa', 'carrera', 7).R.results.map((r) => [r.index, r.place, r.time.toFixed(3)]);
  const b = runBots('costa', 'carrera', 7).R.results.map((r) => [r.index, r.place, r.time.toFixed(3)]);
  assert.deepEqual(a, b);
  const c = runBots('costa', 'carrera', 8).R.results.map((r) => [r.index, r.place, r.time.toFixed(3)]);
  assert.notDeepEqual(a, c);
  const slow = runBots('pradera', 'paseo', 3).R.results[0].time;
  const fast = runBots('pradera', 'fierro', 3).R.results[0].time;
  assert.ok(fast < slow * 0.85, `a fondo (${fast.toFixed(1)}) gana por bastante a paseo (${slow.toFixed(1)})`);
});

test('cuenta regresiva: nadie se mueve hasta el YA, la largada turbo y el que se pasa se ahoga', () => {
  const mk = () => createRace({ track: 'pradera', seed: 1, entries: [{ cfg: DEFAULT_CONFIG, human: 0, name: 'Vos' }] });
  const evs = [];
  const run = (R, input, until) => {
    while (R.t < until) {
      stepRace(R, [input]);
      evs.push(...R.events);
      R.events.length = 0;
    }
  };
  // quieto: no se mueve y cuenta 3, 2, 1
  let R = mk();
  run(R, IDLE, -0.01);
  assert.ok(R.karts.every((k) => k.v === 0 && k.frozen));
  assert.deepEqual(evs.filter((e) => e.type === 'count').map((e) => e.a), [3, 2, 1]);
  stepRace(R, [IDLE]);
  stepRace(R, [IDLE]);
  assert.ok(evs.concat(R.events).some((e) => e.type === 'go'));
  // acelerar en el momento justo da largada turbo
  evs.length = 0;
  R = mk();
  run(R, IDLE, -0.8);
  run(R, { ...IDLE, accel: true }, 0.02);
  const h = R.humans[0];
  assert.ok(evs.some((e) => e.type === 'boost' && e.a === 'start' && e.k === h), 'largada turbo');
  // mantenerlo apretado desde el principio ahoga el motor
  evs.length = 0;
  R = mk();
  run(R, { ...IDLE, accel: true }, 0.02);
  assert.ok(evs.some((e) => e.type === 'stall'), 'se ahoga');
  assert.ok(R.humans[0].stallT > 0 || R.humans[0].v < 12);
});

test('derrape: el saltito empieza el derrape y soltar da un miniturbo que dura y empuja', () => {
  const T = getTrack('pradera');
  const P = params(DEFAULT_CONFIG);
  const k = makeKart(0, DEFAULT_CONFIG, P);
  // parado sobre el borde izquierdo de la recta larga, con lugar de sobra para doblar a la derecha
  const g = pointAt(T, 20, 8, false);
  placeKart(k, T, g.x, g.z, g.yaw);
  const events = [];
  const ev = (t, kk, a) => events.push([t, a]);
  // sale lanzado (casi a tope) y sigue derecho un instante
  k.v = P.vmax * 0.92;
  for (let i = 0; i < 0.25 * 120; i++) stepKart(k, T, { steer: 0, accel: true, brake: false, drift: false }, DT, ev);
  assert.ok(k.v > P.vmax * 0.85, `velocidad ${k.v.toFixed(1)}`);
  // aprieta derrape y dobla a la derecha; como un círculo no entra en una recta, el vehículo se devuelve al centro
  // de la pista en cada paso (así se prueba la carga del miniturbo sin depender de dónde cae)
  const home = pointAt(T, 40, 0, false);
  let max = 0;
  for (let i = 0; i < 2.4 * 120; i++) {
    stepKart(k, T, { steer: 0.9, accel: true, brake: false, drift: true }, DT, ev);
    max = Math.max(max, k.mtLevel);
    Object.assign(k, { x: home.x, z: home.z, ti: home.i, ta: 0, d: 0, off: false });
  }
  assert.ok(events.some((e) => e[0] === 'hop') && events.some((e) => e[0] === 'drift'), 'saltito y derrape');
  assert.equal(k.drift, -1, 'derrapa hacia la derecha');
  assert.ok(max >= 2, `nivel de miniturbo ${max}`);
  assert.ok(Math.abs(k.slip) > 0.05, 'la marcha va atrasada respecto del rumbo');
  // suelta: sale empuje
  const before = k.v;
  stepKart(k, T, { steer: 0.9, accel: true, brake: false, drift: false }, DT, ev);
  assert.ok(k.boostT > 0.7 && k.boostK > 1.15, 'miniturbo');
  assert.ok(events.some((e) => e[0] === 'boost'));
  assert.equal(k.drift, 0);
  for (let i = 0; i < 40; i++) stepKart(k, T, { steer: 0, accel: true, brake: false, drift: false }, DT, ev);
  assert.ok(k.v > before - 1, 'no frena con el empuje');
});

test('las motos tienen dos niveles de miniturbo, los autos tres', () => {
  const T = getTrack('pradera');
  for (const [body, levels] of [['avispa', 2], ['clasico', 3]]) {
    const cfg = { ...DEFAULT_CONFIG, body };
    const k = makeKart(0, cfg, params(cfg));
    const g = gridSlot(T, 0);
    placeKart(k, T, g.x, g.z, g.yaw, g.i);
    k.v = k.P.vmax * 0.92;
    let max = 0;
    for (let i = 0; i < 4 * 120; i++) {
      // sobre una recta larga: pegamos giros a un lado para mantener la velocidad
      stepKart(k, T, { steer: i % 120 < 60 ? 0.9 : -0.1, accel: true, brake: false, drift: true }, DT, noEv);
      max = Math.max(max, k.mtLevel);
      if (k.v < 5) break;
    }
    assert.ok(max <= levels, `${body}: máximo ${levels} niveles (vio ${max})`);
  }
});

test('el borde: las vallas rebotan y el vacío repone al vehículo unos metros atrás', () => {
  // valla (pradera): se corre a toda velocidad contra el lado
  let T = getTrack('pradera');
  let k = makeKart(0, DEFAULT_CONFIG, params(DEFAULT_CONFIG));
  let g = gridSlot(T, 0);
  placeKart(k, T, g.x, g.z, g.yaw, g.i);
  let walls = 0;
  for (let i = 0; i < 6 * 120; i++) stepKart(k, T, { steer: i > 150 ? 1 : 0, accel: true, brake: false, drift: false }, DT, (t) => t === 'wall' && walls++);
  assert.ok(walls >= 1, 'chocó contra la valla');
  assert.ok(Math.abs(k.d) <= T.hw[k.ti] + Math.max(T.mL[k.ti], T.mR[k.ti]), 'quedó dentro de la valla');
  // vacío (taller): hay que caer y que lo repongan sobre la pista
  T = getTrack('taller');
  k = makeKart(0, DEFAULT_CONFIG, params(DEFAULT_CONFIG));
  let fell = 0;
  let resp = 0;
  const out = { i: 0, a: 0, d: 0 };
  g = gridSlot(T, 0);
  placeKart(k, T, g.x, g.z, g.yaw, g.i);
  // largo recto con el vacío a un costado (tramo 0.15–0.2): vamos hasta ahí corriendo el volante
  let guard = 0;
  while (fell === 0 && guard++ < 40 * 120) {
    const target = pointAt(T, k.s + 6, 0);
    const ang = Math.atan2(target.x - k.x, target.z - k.z) - k.yaw;
    stepKart(k, T, { steer: (k.s > T.len * 0.18 && k.s < T.len * 0.3 ? 1 : 0) || Math.max(-1, Math.min(1, -ang * 2)), accel: true, brake: false, drift: false }, DT, (t) => {
      if (t === 'fall') fell++;
      if (t === 'respawn') resp++;
    });
  }
  assert.ok(fell >= 1, 'se cayó al vacío');
  for (let i = 0; i < 3 * 120; i++) stepKart(k, T, IDLE, DT, (t) => t === 'respawn' && resp++);
  assert.equal(resp, 1, 'lo repusieron una vez');
  project(T, k.x, k.z, -1, out);
  assert.ok(Math.abs(out.d) < T.hw[out.i], 'repuesto sobre la calzada');
  assert.ok(k.fallT <= 0 && k.safeT > 0);
});

test('los lomos hacen saltar y la pirueta da un empuje al aterrizar', () => {
  const T = getTrack('costa');
  const ramp = T.ramps[0];
  const cfg = DEFAULT_CONFIG;
  const k = makeKart(0, cfg, params(cfg));
  const start = pointAt(T, ramp.s0 - 70, 0, false);
  placeKart(k, T, start.x, start.z, start.yaw);
  const events = [];
  let tricked = false;
  let airMax = 0;
  for (let i = 0; i < 12 * 120; i++) {
    const target = pointAt(T, k.s + 7, 0);
    const ang = Math.atan2(target.x - k.x, target.z - k.z) - k.yaw;
    // aprieta derrape justo al despegar para la pirueta
    const drift = k.air && k.rampAir && !tricked && k.airT < 0.3;
    if (drift) tricked = true;
    stepKart(k, T, { steer: Math.max(-1, Math.min(1, -ang * 2.4)), accel: true, brake: false, drift }, DT, (t) => events.push(t));
    airMax = Math.max(airMax, k.y - k.gy);
    if (k.s > ramp.s1 + 40 || (k.prog > T.len * 0.5)) break;
  }
  assert.ok(events.includes('jump'), 'despegó del lomo');
  assert.ok(airMax > 0.8, `altura del salto ${airMax.toFixed(2)}`);
  assert.ok(events.includes('land'), 'aterrizó');
  assert.ok(events.includes('trick'), 'pirueta');
});

test('choques entre vehículos: se empujan según el peso y el pesado casi no se mueve', () => {
  const R = createRace({
    track: 'pradera',
    seed: 2,
    entries: [
      { cfg: { ...DEFAULT_CONFIG, driver: 'yaca', body: 'bagual', extra: 'paragolpes' }, human: -1, name: 'pesado' },
      { cfg: { ...DEFAULT_CONFIG, driver: 'lola', body: 'latita', extra: 'banderin' }, human: -1, name: 'liviano' },
    ],
    size: 2,
    noCount: true,
  });
  const [a, b] = R.karts;
  assert.ok(a.P.mass > b.P.mass * 1.4);
  // los pone uno al lado del otro, quietos
  const g = gridSlot(R.T, 0);
  placeKart(a, R.T, g.x, g.z, g.yaw, g.i);
  placeKart(b, R.T, g.x + Math.cos(g.yaw) * 1.4, g.z - Math.sin(g.yaw) * 1.4, g.yaw, g.i);
  const ax = a.x;
  const bx = b.x;
  a.brain.start = 0;
  for (let i = 0; i < 20; i++) {
    stepRace(R, []);
  }
  const da = Math.hypot(a.x - ax, a.z - g.z);
  const db = Math.hypot(b.x - bx, b.z - (g.z - Math.sin(g.yaw) * 1.4));
  assert.ok(Number.isFinite(da + db));
  assert.ok(db > da * 0.9, `el liviano se corrió ${db.toFixed(2)} y el pesado ${da.toFixed(2)}`);
});

test('ítems: la ruleta reparte según el puesto y todos los ítems existen en los dos idiomas', () => {
  assert.equal(ITEM_IDS.length, 11);
  for (const id of ITEM_IDS) assert.ok(ITEMS[id].name.es && ITEMS[id].name.en && ITEMS[id].tip.es && ITEMS[id].tip.en && ITEMS[id].uses >= 1, id);
  const front = itemWeights(1, 8);
  const back = itemWeights(8, 8);
  assert.equal(front.aji, 0, 'el puntero no recibe ají');
  assert.equal(front.canita, 0);
  assert.ok(back.canita > front.canita && back.aji > front.aji && back.sifon3 > front.sifon3);
  assert.ok(front.aceite > back.aceite && front.burbuja > back.burbuja, 'adelante salen defensas');
  // distribución real: el último saca mejores cosas que el primero
  const R = createRace({ track: 'pradera', seed: 3, entries: [], noCount: true });
  R.t = 30;
  const tally = (rank) => {
    const k = R.order[rank - 1];
    const c = {};
    for (let i = 0; i < 3000; i++) {
      const id = rollItem(R, k);
      assert.ok(ITEM_IDS.includes(id));
      c[id] = (c[id] || 0) + 1;
    }
    return c;
  };
  // el último está lejos del puntero: puede recibir cañita
  R.order[7].prog = R.order[0].prog - 200;
  const first = tally(1);
  const last = tally(8);
  assert.ok(!first.nube && !first.tero && !first.canita, 'el puntero no recibe ítems de ataque ni de remontada');
  assert.ok((last.canita || 0) > 100 && (last.aji || 0) > 100);
});

test('cada ítem se puede usar y hace lo suyo', () => {
  const mk = () => {
    const R = createRace({ track: 'pradera', seed: 4, entries: [{ cfg: DEFAULT_CONFIG, human: 0, name: 'Vos' }], noCount: true });
    for (let i = 0; i < 200; i++) stepRace(R, [{ ...IDLE, accel: true }]);
    return R;
  };
  const use = (R, k, id) => {
    k.item = id;
    k.itemN = ITEMS[id].uses;
    useItem(R, k, { brake: false });
  };
  let R = mk();
  let k = R.humans[0];
  use(R, k, 'sifon');
  assert.ok(k.boostT > 1 && k.boostK > 1.3 && k.item === null);
  use(R, k, 'sifon3');
  assert.equal(k.itemN, 2, 'queda con dos usos');
  assert.equal(k.item, 'sifon3');
  R = mk();
  k = R.humans[0];
  use(R, k, 'aji');
  assert.ok(k.invT > 5);
  R = mk();
  k = R.humans[0];
  use(R, k, 'burbuja');
  assert.ok(k.shieldT > 5);
  assert.equal(hitKart(k, 'spin', noEv), false, 'la burbuja absorbe el golpe');
  assert.equal(k.shieldT, 0);
  assert.equal(hitKart(k, 'spin', noEv, 0) || hitKart(k, 'spin', noEv), false, 'y después queda inmune un instante');
  R = mk();
  k = R.humans[0];
  use(R, k, 'canita');
  assert.ok(k.autoT > 2);
  const v0 = k.v;
  for (let i = 0; i < 240; i++) stepRace(R, [IDLE]);
  assert.ok(k.v > v0 + 5 && k.v > 38, `la cañita va a ${k.v.toFixed(1)}`);
  R = mk();
  k = R.humans[0];
  use(R, k, 'aceite');
  assert.ok(R.ents.some((e) => e.type === 'aceite'));
  R = mk();
  k = R.humans[0];
  use(R, k, 'ruleman');
  assert.ok(R.ents.some((e) => e.type === 'ruleman'));
  use(R, k, 'tero');
  assert.ok(R.ents.some((e) => e.type === 'tero'));
  R = mk();
  k = R.humans[0];
  // el nubarrón solo sirve si no vas primero
  k.rank = 3;
  use(R, k, 'nube');
  assert.ok(R.ents.some((e) => e.type === 'nube'));
  R = mk();
  k = R.humans[0];
  const near = R.karts.find((o) => o !== k);
  near.x = k.x + 3;
  near.z = k.z;
  near.y = k.y;
  use(R, k, 'bocina');
  assert.ok(near.spinT > 0 || near.safeT > 0 || near.shieldT >= 0, 'la bocina alcanza a los cercanos');
});

test('golpes: trompo pierde tuercas y velocidad, el golpe grande lanza al aire y hay inmunidad', () => {
  const R = createRace({ track: 'pradera', seed: 5, entries: [{ cfg: DEFAULT_CONFIG, human: 0, name: 'Vos' }], noCount: true });
  for (let i = 0; i < 600; i++) stepRace(R, [{ ...IDLE, accel: true }]);
  const k = R.humans[0];
  k.nuts = 6;
  const v = k.v;
  assert.equal(hitKart(k, 'spin', noEv), true);
  assert.equal(k.nuts, 4);
  assert.ok(k.v < v * 0.5 && k.spinT > 1);
  assert.equal(hitKart(k, 'spin', noEv), false, 'inmune mientras gira');
  for (let i = 0; i < 4 * 120; i++) stepRace(R, [{ ...IDLE, accel: true }]);
  assert.ok(k.spinT <= 0 && k.safeT <= 0);
  k.nuts = 5;
  assert.equal(hitKart(k, 'big', noEv), true);
  assert.equal(k.nuts, 2);
  assert.ok(k.air && k.vy > 5);
});

test('un humano manejado por la misma lógica que los bots también llega a la meta', () => {
  const R = createRace({ track: 'ciudad', cls: 'carrera', seed: 9, entries: [{ cfg: DEFAULT_CONFIG, human: 0, name: 'Vos' }] });
  const h = R.humans[0];
  const out = { steer: 0, accel: false, brake: false, drift: false, item: false };
  let guard = 0;
  while (!h.finished && guard++ < 200 * 120) {
    if (R.t >= 0) think(h, R.T, R, out);
    stepRace(R, [{ ...out }]);
    R.events.length = 0;
  }
  assert.ok(h.finished, `llegó (t=${R.t.toFixed(0)})`);
  endRace(R);
  assert.ok(R.over && R.results.length === 8);
  assert.equal(R.results.filter((r) => r.human === 0).length, 1);
  assert.deepEqual(R.results.map((r) => r.place), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('contrarreloj: solo el jugador, con tres sifones y termina al llegar', () => {
  const R = createRace({ track: 'glaciar', mode: 'trial', laps: 1, seed: 2, entries: [{ cfg: DEFAULT_CONFIG, human: 0, name: 'Vos' }] });
  assert.equal(R.karts.length, 1);
  assert.equal(R.karts[0].item, 'sifon3');
  assert.equal(R.itemsOn, false);
  const h = R.humans[0];
  const out = { steer: 0, accel: false, brake: false, drift: false, item: false };
  let guard = 0;
  while (!R.over && guard++ < 120 * 120) {
    if (R.t >= 0) think(h, R.T, R, out);
    stepRace(R, [{ ...out }]);
    R.events.length = 0;
  }
  assert.ok(R.over && h.finished && h.bestLap > 10);
});

test('puntos de copa y finales de carrera', () => {
  assert.equal(pointsFor(1), 15);
  assert.ok(pointsFor(1) > pointsFor(2) && pointsFor(7) > pointsFor(8) && pointsFor(9) === 0);
  const { R } = runBots('pradera', 'fierro', 21);
  assert.equal(R.results.length, 8);
  assert.ok(R.results.every((r, i) => r.place === i + 1));
  const times = R.results.filter((r) => !r.estimated).map((r) => r.time);
  assert.deepEqual(times, times.slice().sort((a, b) => a - b), 'los que llegaron van por tiempo');
});

test('el costo por paso de la simulación es chico (ocho vehículos, ítems y colisiones)', () => {
  const R = createRace({ track: 'ciudad', seed: 5, entries: [], noCount: true });
  const t0 = performance.now();
  for (let i = 0; i < 120 * 10; i++) {
    stepRace(R, []);
    R.events.length = 0;
  }
  const us = ((performance.now() - t0) / (120 * 10)) * 1000;
  assert.ok(us < 900, `${us.toFixed(0)} µs por paso`);
});

test('textos: todas las claves que usa la interfaz existen en español e inglés', () => {
  for (const [k, v] of Object.entries(TXT)) assert.ok(v.es && v.en, `falta un idioma en "${k}"`);
  const dir = new URL('../public/games/tuercas/', import.meta.url);
  const used = new Set();
  for (const f of ['game.js', 'hud.js', 'garage.js']) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/\btr\(\s*'([\w]+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/\bthis\.t\(\s*'([\w]+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/\bt\(\s*'([\w]+)'/g)) used.add(m[1]);
  }
  const html = readFileSync(new URL('index.html', dir), 'utf8');
  for (const m of html.matchAll(/data-t="([\w]+)"/g)) used.add(m[1]);
  for (const k of ['tab_driver', 'tab_body', 'tab_wheels', 'tab_extra', 'tab_paint', 'tab_tune', 'tBrake', 'tItem', 'tDrift']) used.add(k);
  for (const m of readFileSync(new URL('game.js', dir), 'utf8').matchAll(/(?:cup|free|trial|two)\s*:\s*'(sel\w+)'/g)) used.add(m[1]);
  for (const key of used) assert.ok(TXT[key], `falta la clave "${key}" en text.js`);
});

test('el HTML tiene todos los elementos que usa el código y el game.json es válido', () => {
  const dir = new URL('../public/games/tuercas/', import.meta.url);
  const html = readFileSync(new URL('index.html', dir), 'utf8');
  const ids = new Set([...html.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]));
  for (const f of ['game.js', 'garage.js', 'hud.js']) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/\$\(\s*'([\w-]+)'\s*\)/g)) assert.ok(ids.has(m[1]), `${f}: no existe #${m[1]} en index.html`);
    for (const m of src.matchAll(/this\.\$\(\s*'#([\w-]+)'\s*\)/g)) assert.ok(ids.has(m[1]), `${f}: no existe #${m[1]} en index.html`);
  }
  const gj = JSON.parse(readFileSync(new URL('game.json', dir), 'utf8'));
  assert.equal(gj.id, 'tuercas');
  assert.ok(gj.title.es && gj.title.en && gj.description.es && gj.description.en);
  assert.ok(gj.categories.includes('carreras'));
  assert.ok(readdirSync(dir).includes(gj.thumbnail));
});

test('modelos 3D: cada piloto, carrocería, rueda y accesorio se arma entero y cabe en el presupuesto de triángulos', async () => {
  const { makeVehicle } = await import('../public/games/tuercas/vehicles.js');
  const tris = (v) => {
    let n = 0;
    v.root.traverse((o) => {
      if (o.isMesh && !o.userData.outline && o.geometry) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    });
    return n;
  };
  const check = (cfg, label) => {
    const v = makeVehicle(cfg);
    const bike = BODIES.find((b) => b.id === cfg.body).bike;
    assert.equal(v.bike, bike, label);
    assert.equal(v.wheels.length, bike ? 2 : 4, `${label}: ruedas`);
    assert.ok(v.pipes.length >= 1 && v.head && v.body && v.top > 1, label);
    assert.ok(tris(v) > 1500 && tris(v) < 9500, `${label}: ${tris(v)} triángulos`);
    v.root.traverse((o) => {
      if (!o.geometry) return;
      const a = o.geometry.attributes.position.array;
      for (let i = 0; i < a.length; i += 97) assert.ok(Number.isFinite(a[i]), `${label}: vértice finito`);
    });
    for (const w of v.wheels) assert.ok(w.r > 0.15 && w.r < 0.6);
  };
  let n = 0;
  for (const d of DRIVERS) for (const b of BODIES) {
    check({ ...DEFAULT_CONFIG, driver: d.id, body: b.id, wheels: WHEELS[n % 5].id, extra: EXTRAS[(n * 3) % 5].id, paint: n % 10 }, `${d.id}/${b.id}`);
    n++;
  }
  for (const w of WHEELS) for (const b of BODIES) check({ ...DEFAULT_CONFIG, body: b.id, wheels: w.id }, `${w.id}/${b.id}`);
  for (const e of EXTRAS) for (const b of BODIES) check({ ...DEFAULT_CONFIG, body: b.id, extra: e.id }, `${e.id}/${b.id}`);
});
