/** Penales: el remate y el arquero (reglas), la tanda, la compu y el servidor. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge, landing, sigma, reach, stretch, zoneOf, zoneCenter, makeNoise, gauss, isShot, isDive, cleanShot, COLS, ROWS, AIM, POST } from '../public/games/penales/shared/rules.js';
import { Shootout } from '../public/games/penales/shared/match.js';
import { aimShot, pickDive, ZONES, SHOT_SET } from '../public/games/penales/shared/cpu.js';
import { startServer, connect, wait } from './helpers.mjs';

function mulberry(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const NO = { x: 0, y: 0 };

// ---------------------------------------------------------------- el remate
test('remate: lo que se apunta, más el error que crece con la fuerza', () => {
  assert.deepEqual(landing({ x: 0.5, y: 0.4, p: 0.5 }, NO), { x: 0.5, y: 0.4 });
  assert.ok(sigma(0) < sigma(0.5) && sigma(0.5) < sigma(1), 'más fuerza, peor puntería');
  assert.ok(reach(0) > reach(0.5) && reach(0.5) > reach(1), 'más fuerza, menos alcance del arquero');
  assert.ok(reach(1) > 0.4 && reach(0) <= 1);
  const l = landing({ x: 0, y: 0.5, p: 1 }, { x: 1, y: -1 });
  assert.ok(Math.abs(l.x - sigma(1)) < 1e-9 && l.y < 0.5);
});

test('remate: gol, atajada, palo, afuera y por arriba', () => {
  // gol: va a un lado y el arquero se tira al otro
  assert.equal(judge({ x: 0.8, y: 0.8, p: 0.6 }, NO, { c: -1, r: 0 }).result, 'goal');
  // atajada: el arquero adivinó la zona
  const s = judge({ x: -0.5, y: 0.4, p: 0.5 }, NO, { c: -1, r: 0 });
  assert.equal(s.result, 'saved');
  assert.ok(s.d < 1);
  // palo y travesaño
  assert.equal(judge({ x: 1.0, y: 0.5, p: 0.5 }, NO, { c: 0, r: 0 }).result, 'post');
  assert.equal(judge({ x: -1.0 + POST * 0.5, y: 0.5, p: 0.5 }, NO, { c: 0, r: 0 }).result, 'post');
  assert.equal(judge({ x: 0.3, y: 1.0, p: 0.5 }, NO, { c: -1, r: 0 }).result, 'post');
  // afuera (a un costado) y por arriba
  assert.equal(judge({ x: 1.2, y: 0.5, p: 0.5 }, NO, { c: 0, r: 0 }).result, 'wide');
  assert.equal(judge({ x: -1.25, y: 0.9, p: 0.5 }, NO, { c: 0, r: 0 }).result, 'wide');
  assert.equal(judge({ x: 0.2, y: 1.2, p: 0.5 }, NO, { c: 0, r: 1 }).result, 'over');
  // el error empuja la pelota afuera aunque se haya apuntado adentro
  assert.equal(judge({ x: 0.9, y: 0.5, p: 1 }, { x: 1, y: 0 }, { c: 0, r: 0 }).result, 'wide');
  // ras del piso: entra (no es palo)
  assert.equal(judge({ x: 0.5, y: 0.04, p: 0.5 }, NO, { c: -1, r: 1 }).result, 'goal');
  // sin arquero (no eligió): gol si va adentro
  assert.equal(judge({ x: 0.1, y: 0.4, p: 0.5 }, NO, null).result, 'goal');
});

test('arquero: con más fuerza alcanza menos y la suerte decide los casos justos', () => {
  const dive = { c: 0, r: 0 };
  const z = zoneCenter(0, 0);
  const ball = { x: z.x + 0.52, y: z.y };
  // flojito: llega; a todo lo que da: no
  assert.equal(judge({ ...ball, p: 0.1 }, NO, dive).result, 'saved');
  assert.equal(judge({ ...ball, p: 1 }, NO, dive).result, 'goal');
  assert.ok(stretch(ball, dive, 0.1) < stretch(ball, dive, 1));
  // un caso justo se decide con la suerte (kr)
  const p = 0.6;
  let best = null;
  for (let x = 0; x < 0.9; x += 0.002) {
    const pt = { x: z.x + x, y: z.y };
    const d = stretch(pt, dive, p);
    if (d > 1.04 && d < 1.07) best = pt;
  }
  assert.ok(best && Math.abs(best.x) < 0.9, 'hay un punto justo adentro del arco');
  assert.equal(judge({ ...best, p }, NO, dive, -0.1).result, 'goal');
  assert.equal(judge({ ...best, p }, NO, dive, 0.12).result, 'saved');
  // las zonas: tres columnas y dos alturas, ordenadas de izquierda a derecha y de abajo hacia arriba
  assert.deepEqual(COLS, [-1, 0, 1]);
  assert.deepEqual(ROWS, [0, 1]);
  assert.ok(zoneCenter(-1, 0).x < zoneCenter(0, 0).x && zoneCenter(0, 0).x < zoneCenter(1, 0).x);
  assert.ok(zoneCenter(0, 0).y < zoneCenter(0, 1).y);
  assert.deepEqual(zoneOf(-0.8, 0.8), { c: -1, r: 1 });
  assert.deepEqual(zoneOf(0, 0.2), { c: 0, r: 0 });
  assert.deepEqual(zoneOf(0.9, 0.3), { c: 1, r: 0 });
});

test('remate: se valida lo que llega (apuntar, fuerza y zona)', () => {
  assert.ok(isShot({ x: 0.2, y: 0.5, p: 0.5 }) && isShot({ x: -AIM.x, y: AIM.yMax, p: 1 }) && isShot({ x: 0, y: AIM.yMin, p: 0 }));
  for (const bad of [null, {}, { x: 'a', y: 0.5, p: 0.5 }, { x: 2, y: 0.5, p: 0.5 }, { x: 0, y: 3, p: 0.5 }, { x: 0, y: -1, p: 0.5 }, { x: 0, y: 0.5, p: 1.5 }, { x: 0, y: 0.5, p: -0.1 }, { x: NaN, y: 0.5, p: 0.5 }, { x: Infinity, y: 0.5, p: 0.5 }]) assert.ok(!isShot(bad), JSON.stringify(bad));
  assert.ok(isDive({ c: -1, r: 1 }) && isDive({ c: 0, r: 0 }));
  for (const bad of [null, {}, { c: 2, r: 0 }, { c: 0, r: 2 }, { c: '0', r: 0 }, { c: 0 }]) assert.ok(!isDive(bad));
  assert.deepEqual(cleanShot({ x: 9, y: -9, p: 7 }), { x: AIM.x, y: AIM.yMin, p: 1 });
});

test('error de puntería: normal, sin extremos y parejo (con una semilla)', () => {
  const rng = mulberry(3);
  const xs = Array.from({ length: 4000 }, () => gauss(rng));
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  assert.ok(Math.abs(mean) < 0.06 && sd > 0.9 && sd < 1.06, `media ${mean} desvío ${sd}`);
  assert.ok(xs.every((x) => Math.abs(x) <= 2.4 + 1e-9));
  const n = makeNoise(mulberry(1));
  assert.ok(typeof n.x === 'number' && typeof n.y === 'number');
});

test('equilibrio: patear a los costados con fuerza media rinde, y el arquero que adivina ataja casi todo', () => {
  const rng = mulberry(11);
  const N = 3000;
  const rate = (shot, dive) => {
    let g = 0;
    for (let i = 0; i < N; i++) if (judge(shot, makeNoise(rng), dive, (rng() - 0.5) * 0.24).result === 'goal') g++;
    return g / N;
  };
  // un ángulo con fuerza media, contra un arquero al azar: se convierte seguido
  let tot = 0;
  for (const c of COLS) for (const r of ROWS) tot += rate({ x: 0.82, y: 0.8, p: 0.6 }, { c, r });
  const avg = tot / 6;
  assert.ok(avg > 0.5 && avg < 0.85, `ángulo contra arquero al azar: ${avg}`);
  // si el arquero adivina la zona, ataja mucho más
  assert.ok(rate({ x: 0.55, y: 0.3, p: 0.55 }, { c: 1, r: 0 }) < 0.3);
  assert.ok(rate({ x: 0.55, y: 0.3, p: 0.55 }, { c: -1, r: 1 }) > 0.9);
  // todo a lo bestia en el ángulo se va afuera seguido
  assert.ok(rate({ x: 0.95, y: 0.95, p: 1 }, { c: -1, r: 0 }) < 0.5);
});

// ---------------------------------------------------------------- la tanda
test('tanda: patean alternando y el que empieza lo elige el asiento `first`', () => {
  const so = new Shootout({ kicks: 5, first: 1 });
  assert.deepEqual([so.shooter, so.keeper, so.round, so.n], [1, 0, 1, 0]);
  so.record(true);
  assert.deepEqual([so.shooter, so.keeper, so.round], [0, 1, 1]);
  so.record(false, 'saved');
  assert.deepEqual([so.shooter, so.round], [1, 2]);
  assert.deepEqual(so.score, [0, 1]);
  assert.deepEqual(so.marks(1), [true, null, null, null, null]);
  assert.deepEqual(so.marks(0), [false, null, null, null, null]);
  assert.deepEqual(so.results(0), ['saved']);
  assert.equal(so.left(1), 4);
  assert.ok(!so.over && !so.sudden);
});

test('tanda: termina antes si el otro ya no alcanza y si no, al final de las cinco', () => {
  // 3 a 0 después de 3 por lado: al otro le quedan 2, no alcanza
  let so = new Shootout({ kicks: 5, first: 0 });
  for (const g of [true, false, true, false, true]) so.record(g);
  // taken: [3, 2]; marcador 3-0; al 1 le quedan 3 → todavía puede
  assert.ok(!so.over);
  so.record(false);
  assert.ok(so.over, '3-0 y al otro le quedan 2: no alcanza');
  assert.equal(so.winner, 0);
  assert.ok(!so.record(true), 'terminada: no se anota más');
  // se juega hasta el final si queda abierto
  so = new Shootout({ kicks: 5, first: 0 });
  for (let i = 0; i < 10; i++) so.record(i % 4 === 0 || i % 4 === 1);
  assert.ok(so.over || so.sudden);
  // gana el que patea primero 5-4
  so = new Shootout({ kicks: 5, first: 0 });
  const seq = [true, true, true, true, true, true, true, true, true, false];
  // 0: 5 goles; 1: 4 goles y el último errado — pero termina antes (cuando 0 llega a 5 y 1 no puede)
  for (const g of seq) if (!so.over) so.record(g);
  assert.ok(so.over);
  assert.equal(so.winner, 0);
  assert.ok(so.score[0] >= so.score[1]);
});

test('tanda: si empatan, muerte súbita de a un penal por lado hasta que uno convierte y el otro no', () => {
  const so = new Shootout({ kicks: 5, first: 0 });
  for (let i = 0; i < 10; i++) so.record(true);
  assert.ok(!so.over && so.sudden, '5 a 5: sigue');
  assert.deepEqual(so.score, [5, 5]);
  assert.equal(so.round, 6);
  so.record(true); // el 0 convierte
  assert.ok(!so.over, 'falta que patee el otro');
  so.record(true);
  assert.ok(!so.over, 'los dos convirtieron: siguen');
  so.record(false);
  so.record(true); // el 1 convierte y el 0 no: gana el 1
  assert.ok(so.over);
  assert.equal(so.winner, 1);
  assert.deepEqual(so.score, [6, 7]);
  assert.equal(so.marks(0).length, 7, 'las marcas crecen con la muerte súbita');
});

test('tanda: con menos penales y cuentas parejas (3 por lado)', () => {
  const so = new Shootout({ kicks: 3, first: 0 });
  for (const g of [true, false, true]) so.record(g);
  assert.ok(!so.over, '2 a 0 con dos por patear del otro: todavía puede');
  so.record(false);
  assert.ok(so.over, '2 a 0 y al otro le queda uno: no alcanza');
  assert.equal(so.winner, 0);
  assert.deepEqual(so.score, [2, 0]);
  assert.equal(so.n, 4);
  const t2 = new Shootout({ kicks: 3, first: 1 });
  for (const g of [false, false, false, false, false, false]) t2.record(g);
  assert.ok(t2.sudden && !t2.over, '0 a 0');
  t2.record(true);
  t2.record(false);
  assert.ok(t2.over && t2.winner === 1);
});

// ---------------------------------------------------------------- la compu
test('la compu: siempre patea y se tira a algo válido, con la misma semilla da lo mismo', () => {
  for (const level of [1, 2, 3]) {
    const rng = mulberry(level);
    const hist = { shots: [], dives: [] };
    for (let i = 0; i < 80; i++) {
      const s = aimShot(level, hist, rng);
      assert.ok(isShot(s), `nivel ${level}: ${JSON.stringify(s)}`);
      const d = pickDive(level, hist, rng);
      assert.ok(isDive(d));
      hist.shots.push(s);
      hist.dives.push(d);
    }
    const a = aimShot(level, { dives: [{ c: 1, r: 0 }] }, mulberry(9));
    const b = aimShot(level, { dives: [{ c: 1, r: 0 }] }, mulberry(9));
    assert.deepEqual(a, b);
  }
  assert.equal(ZONES.length, 6);
  assert.ok(SHOT_SET.every(isShot));
});

test('la compu: el difícil se tira contra lo que más patea el rival y el fácil no mira', () => {
  const N = 400;
  const share = (level, shots) => {
    const rng = mulberry(5 + level);
    let right = 0;
    for (let i = 0; i < N; i++) if (pickDive(level, { shots }, rng).c === 1) right++;
    return right / N;
  };
  // el rival patea siempre abajo a la derecha
  const habit = Array.from({ length: 6 }, () => ({ x: 0.8, y: 0.2, p: 0.6 }));
  assert.ok(share(3, habit) > 0.6, 'el difícil se tira a la derecha');
  assert.ok(share(1, habit) < 0.45, 'el fácil se tira al azar');
  assert.ok(share(3, []) < 0.5, 'sin datos reparte');
  // y cuando patea, evita el costado al que el arquero se tira siempre
  const diveLeft = Array.from({ length: 6 }, () => ({ c: -1, r: 0 }));
  const rng = mulberry(77);
  let left = 0;
  for (let i = 0; i < N; i++) if (aimShot(3, { dives: diveLeft }, rng).x < -0.1) left++;
  assert.ok(left / N < 0.25, `el difícil casi no patea adonde se tira el arquero: ${left / N}`);
});

test('la compu: los niveles se notan (el difícil le gana al normal y este al fácil)', () => {
  const play = (levels, first, seed) => {
    const rng = mulberry(seed);
    const so = new Shootout({ kicks: 5, first });
    const shots = [[], []], dives = [[], []];
    for (let g = 0; g < 200 && !so.over; g++) {
      const s = so.shooter, k = so.keeper;
      const shot = aimShot(levels[s], { dives: dives[k], shots: shots[s] }, rng);
      const dive = pickDive(levels[k], { shots: shots[s] }, rng);
      const j = judge(shot, makeNoise(rng), dive, (rng() - 0.5) * 0.24);
      shots[s].push(shot);
      dives[k].push(dive);
      so.record(j.result === 'goal', j.result);
    }
    assert.ok(so.over);
    return so.winner;
  };
  const duel = (a, b, games) => {
    let w = 0;
    for (let g = 0; g < games; g++) {
      const first = g % 2;
      const levels = first ? [b, a] : [a, b];
      if (play(levels, first, 500 + g) === (first ? 1 : 0)) w++;
    }
    return w / games;
  };
  assert.ok(duel(3, 2, 300) >= 0.57, 'el difícil le gana al normal');
  assert.ok(duel(2, 1, 300) >= 0.62, 'el normal le gana al fácil');
  assert.ok(duel(3, 1, 300) >= 0.75, 'el difícil le gana al fácil');
});

// ---------------------------------------------------------------- el servidor
const FAST = { PENALES_FAST: '1' };
async function room(srv, names = ['Ana', 'Beto']) {
  const a = await connect(srv.port);
  a.send({ t: 'create', game: 'penales', name: names[0] });
  await wait(150);
  const code = a.last('joined').code;
  const b = await connect(srv.port);
  b.send({ t: 'join', game: 'penales', code, name: names[1] });
  await wait(150);
  return { a, b, code };
}
const view = (c) => c.last('room')?.room?.penales;
/** Cada uno manda lo suyo según el rol y se espera la resolución. */
function pick(c, v, me) {
  if (v.shooter === me) c.send({ t: 'aim', x: 0.4321, y: 0.4, p: 0.5 });
  else c.send({ t: 'dive', c: 1, r: 0 });
}

test('servidor: pide dos personas, empieza con el que patea primero y no muestra lo elegido hasta resolver', async () => {
  const srv = await startServer(FAST);
  try {
    const a = await connect(srv.port);
    a.send({ t: 'create', game: 'penales', name: 'Ana' });
    await wait(150);
    a.send({ t: 'start' });
    await wait(150);
    assert.equal(a.last('error')?.code, 'need_players');
    const code = a.last('joined').code;
    const b = await connect(srv.port);
    b.send({ t: 'join', game: 'penales', code, name: 'Beto' });
    await wait(150);
    a.send({ t: 'start' });
    await wait(200);
    const v = view(a);
    assert.ok(v, 'empezó');
    assert.equal(v.phase, 'choose');
    assert.equal(v.n, 0);
    assert.equal(v.kicks, 5);
    assert.deepEqual(v.seats.map((s) => s.name), ['Ana', 'Beto']);
    assert.deepEqual(v.log, []);
    assert.deepEqual(v.ready, { shot: false, dive: false });
    const me = (c) => v.seats.findIndex((s) => s.id === c.last('joined').id);
    const sh = v.shooter;
    const shooter = sh === me(a) ? a : b;
    const keeper = shooter === a ? b : a;
    // el que ataja manda lo suyo: solo se sabe que ya mandó
    keeper.send({ t: 'dive', c: -1, r: 1 });
    await wait(150);
    const w = view(a);
    assert.deepEqual(w.ready, { shot: false, dive: true });
    assert.equal(w.phase, 'choose');
    const raw = JSON.stringify(a.msgs.slice(-3)) + JSON.stringify(b.msgs.slice(-3));
    assert.ok(!raw.includes('"c":-1'), 'la zona elegida no viaja');
    // mensajes de más: del rol equivocado, mal formados o repetidos no rompen nada
    shooter.send({ t: 'dive', c: 1, r: 1 });
    shooter.send({ t: 'aim', x: 9, y: 0.5, p: 0.5 });
    shooter.send({ t: 'aim', x: 'x', y: 0.5, p: 0.5 });
    keeper.send({ t: 'aim', x: 0.1, y: 0.1, p: 0.1 });
    keeper.send({ t: 'dive', c: 1, r: 0 });
    await wait(150);
    assert.deepEqual(view(a).ready, { shot: false, dive: true }, 'nada de eso cambia lo elegido');
    // el que patea manda: se resuelve y llega el resultado a los dos
    shooter.send({ t: 'aim', x: 0.4321, y: 0.4, p: 0.5 });
    await wait(200);
    for (const c of [a, b]) {
      const r = view(c);
      assert.equal(r.n, 1);
      assert.ok(['goal', 'saved', 'post', 'wide', 'over'].includes(r.last.result));
      assert.equal(r.last.seat, sh);
      assert.deepEqual(r.last.dive, { c: -1, r: 1 }, 'se revela lo que se tiró');
      assert.equal(r.last.shot.x, 0.4321);
      assert.equal(r.log.length, 1);
      assert.equal(r.score[sh], r.last.result === 'goal' ? 1 : 0);
    }
    a.ws.close();
    b.ws.close();
  } finally {
    srv.stop();
  }
});

test('servidor: si se acaba el tiempo elige el servidor por el que falta y la tanda sigue sola hasta el final', async () => {
  const srv = await startServer(FAST);
  try {
    const { a, b } = await room(srv);
    a.send({ t: 'start' });
    await wait(300);
    // nadie elige: el primer penal se resuelve solo (700 ms) y arranca el siguiente
    await wait(1500);
    const v = view(a);
    assert.ok(v.n >= 1, `se resolvió solo (n=${v.n})`);
    assert.ok(v.log.length >= 1);
    // jugar la tanda entera mandando siempre lo mismo: termina con un ganador y marcadores iguales para los dos
    for (let k = 0; k < 200; k++) {
      const x = view(a);
      if (x.phase === 'over') break;
      if (x.phase === 'choose') {
        const idA = a.last('joined').id;
        const meA = x.seats.findIndex((s) => s.id === idA);
        pick(a, x, meA);
        pick(b, x, 1 - meA);
      }
      await wait(120);
    }
    const fa = view(a), fb = view(b);
    assert.equal(fa.phase, 'over');
    assert.deepEqual(fa.score, fb.score);
    assert.ok(fa.winner === 0 || fa.winner === 1);
    assert.ok(fa.score[fa.winner] > fa.score[1 - fa.winner]);
    assert.equal(fa.log.length, fa.n);
    // el marcador y el registro cuentan lo mismo
    for (const s of [0, 1]) assert.equal(fa.log.filter((k2) => k2.seat === s && k2.result === 'goal').length, fa.score[s]);
    // revancha: la piden los dos y patea primero el otro
    const first1 = fa.first;
    a.send({ t: 'again' });
    await wait(150);
    assert.equal(view(a).game, 1, 'con uno solo no empieza');
    b.send({ t: 'again' });
    await wait(300);
    const g2 = view(a);
    assert.equal(g2.game, 2);
    assert.equal(g2.n, 0);
    assert.equal(g2.first, 1 - first1);
    assert.deepEqual(g2.score, [0, 0]);
    a.ws.close();
    b.ws.close();
  } finally {
    srv.stop();
  }
});

test('servidor: si uno se va durante la tanda gana el otro, y al volver recibe la mesa', async () => {
  const srv = await startServer(FAST);
  try {
    const { a, b, code } = await room(srv);
    a.send({ t: 'start' });
    await wait(300);
    const token = b.last('joined').token;
    // Beto se cae y vuelve: sigue en la misma tanda
    b.ws.close();
    await wait(300);
    const b2 = await connect(srv.port);
    b2.send({ t: 'join', game: 'penales', code, name: 'Beto', token });
    await wait(300);
    const v = view(b2);
    assert.ok(v && v.game === 1, 'recibió la tanda en curso');
    // Ana se va a propósito: gana Beto
    a.send({ t: 'leave' });
    await wait(400);
    const w = view(b2);
    assert.equal(w.phase, 'over');
    assert.equal(w.winner, w.seats.findIndex((s) => s.name === 'Beto'));
    b2.ws.close();
    a.ws.close();
  } finally {
    srv.stop();
  }
});
