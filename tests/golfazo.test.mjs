/** Golfazo: física determinista, los 24 hoyos (se arman y tienen solución), reglas de puntaje y partida online validada por el servidor. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dsin, dcos, TAU } from '../public/games/golfazo/shared/dmath.js';
import { newBall, advance, shoot, step, canShoot, packBall, unpackBall, sameBall, cloneBall, pose, HOLED, MOVE, SLEEP, HZ } from '../public/games/golfazo/shared/physics.js';
import { Builder } from '../public/games/golfazo/shared/build.js';
import { HOLE_LIST, HOLES, WORLDS, courseHoles, freshHole, COURSE_IDS } from '../public/games/golfazo/shared/holes.js';
import { SOLUTIONS } from '../public/games/golfazo/shared/solutions.js';
import { playShot, settle, validShot, label, stars, strokesOf, holeScore, replay, MAX_STROKES } from '../public/games/golfazo/shared/rules.js';
import { startServer, connect, wait } from './helpers.mjs';

test('dmath: seno y coseno exactos y deterministas', () => {
  let worst = 0;
  for (let i = -400; i <= 400; i++) {
    const x = i * 0.0731;
    worst = Math.max(worst, Math.abs(dsin(x) - Math.sin(x)), Math.abs(dcos(x) - Math.cos(x)));
  }
  assert.ok(worst < 1e-9, `error máximo ${worst}`);
  assert.equal(dsin(0), 0);
  assert.equal(dcos(0), 1);
  assert.ok(Math.abs(dsin(TAU / 4) - 1) < 1e-12);
});

test('hay 4 mundos de 6 hoyos con ids únicos, nombres en dos idiomas y par razonable', () => {
  assert.equal(WORLDS.length, 4);
  assert.equal(HOLE_LIST.length, 24);
  assert.equal(new Set(HOLE_LIST.map((h) => h.id)).size, 24);
  for (const w of WORLDS) assert.equal(w.holes.length, 6);
  for (const h of HOLE_LIST) {
    assert.ok(h.name.es && h.name.en, h.id);
    assert.ok(h.par >= 2 && h.par <= 5, `${h.id} par ${h.par}`);
  }
  assert.equal(courseHoles('todos').length, 24);
  assert.equal(courseHoles('gira').length, 8);
  assert.equal(courseHoles('pradera').length, 6);
  assert.ok(COURSE_IDS.includes('gira') && COURSE_IDS.includes('volcan'));
});

for (const def of HOLE_LIST) {
  test(`hoyo ${def.id}: se arma, tiene salida y hoyo sobre el piso y una solución que emboca`, () => {
    const w = freshHole(def.id);
    assert.ok(w.tris.length > 0 && w.boxes.length > 0);
    assert.ok(Number.isFinite(w.tee.x) && Number.isFinite(w.cup.x));
    assert.ok(w.spine.length >= 2);
    const sol = SOLUTIONS[def.id];
    assert.ok(sol && sol.length, `falta la solución de ${def.id} (node tools/golfazo-solve.mjs ${def.id} --write)`);
    assert.ok(sol.length <= def.par, `${def.id}: la solución usa ${sol.length} golpes y el par es ${def.par}`);
    const r = replay(w, newBall, sol);
    assert.ok(r, 'la solución se puede jugar');
    assert.equal(r.ball.mode, HOLED, 'la solución emboca');
    assert.ok(strokesOf(r.ball) <= def.par);
  });
}

test('la física es determinista: mismo golpe, mismo resultado, también con el estado pasado por JSON', () => {
  const w1 = freshHole('pradera-6');
  const w2 = freshHole('pradera-6');
  let same = 0;
  const N = 60;
  for (let i = 0; i < N; i++) {
    const a = (i * 977) % 65536, p = 200 + ((i * 53) % 800), k0 = (i * 131) % 900;
    const s1 = newBall(w1), s2 = newBall(w2);
    advance(w1, s1, k0); advance(w2, s2, k0);
    shoot(w1, s1, a, p); shoot(w2, s2, a, p);
    for (let n = 0; n < 700; n++) step(w1, s1);
    for (let n = 0; n < 350; n++) step(w2, s2);
    const s3 = unpackBall(JSON.parse(JSON.stringify(packBall(s2))));
    for (let n = 0; n < 350; n++) step(w2, s3);
    if (sameBall(s1, s3)) same++;
  }
  assert.equal(same, N);
});

test('los obstáculos que se mueven son una función pura del tiempo', () => {
  const w = freshHole('pradera-4');
  const m = w.movers[0];
  const grab = (t) => { pose(m, t); return [m.m00, m.m01, m.m02, m.m10, m.m11, m.m12, m.m20, m.m21, m.m22, m.tx, m.ty, m.tz]; };
  const a = grab(3.3);
  grab(7.1);
  grab(0.5);
  assert.deepEqual(grab(3.3), a);
  assert.notDeepEqual(grab(3.3), grab(3.9));
});

test('un golpe solo se acepta con la pelota quieta, en un tick que no se adelante y sin pasarse del máximo', () => {
  const w = freshHole('pradera-1');
  const s = newBall(w);
  assert.equal(playShot(w, s, -1, 500, 0).ok, false);
  assert.equal(playShot(w, s, 100, 5000, 0).ok, false);
  assert.equal(playShot(w, s, 100, 500, 1.5).ok, false);
  assert.equal(validShot(65535, 1000, 0), true);
  assert.equal(validShot(65536, 1000, 0), false);
  // tiro corto: queda quieta y se puede volver a tirar
  const r = playShot(w, s, 0, 120, 0);
  assert.ok(r.ok && !r.holed);
  assert.equal(canShoot(s), true);
  assert.equal(r.strokes, 1);
  // volver atrás en el tiempo no vale
  assert.equal(playShot(w, s, 0, 120, 0).why, 'past');
  // en pleno vuelo no se puede pegar
  const s2 = newBall(w);
  shoot(w, s2, 0, 800);
  step(w, s2);
  assert.equal(canShoot(s2), false);
  // a los 10 golpes se corta
  const s3 = newBall(w);
  let n = 0;
  while (s3.mode !== HOLED && n < 12) {
    const q = playShot(w, s3, 32768 + (n % 2) * 3000, 100, s3.k);
    if (!q.ok) break;
    n++;
  }
  assert.ok(n <= MAX_STROKES);
});

test('puntaje: nombres de las jugadas, estrellas y tope de golpes', () => {
  assert.equal(label(1, 3), 'ace');
  assert.equal(label(2, 4), 'eagle');
  assert.equal(label(2, 3), 'birdie');
  assert.equal(label(3, 3), 'par');
  assert.equal(label(4, 3), 'bogey');
  assert.equal(label(5, 3), 'double');
  assert.equal(label(8, 3), 'over');
  assert.equal(stars(2, 3), 3);
  assert.equal(stars(3, 3), 2);
  assert.equal(stars(5, 3), 1);
  assert.equal(stars(6, 3), 0);
  const w = freshHole('pradera-1');
  const s = newBall(w);
  assert.equal(holeScore(s), MAX_STROKES, 'sin embocar vale el máximo');
});

test('lo que ven los demás (repetir golpes sin esperar el final) coincide con lo que decide el servidor', () => {
  for (const id of ['pradera-6', 'bahia-5', 'glaciar-5', 'volcan-5', 'glaciar-6']) {
    const w = freshHole(id);
    const sol = SOLUTIONS[id];
    // servidor: cada golpe hasta que se queda quieta
    const srv = newBall(w);
    let endK = 0;
    for (const sh of sol) endK = playShot(w, srv, sh.a, sh.p, sh.k).k;
    // cliente fantasma: va golpeando en su tick y después avanza el reloj hasta el final
    const gh = newBall(w);
    for (const sh of sol) {
      advance(w, gh, sh.k);
      assert.ok(canShoot(gh) || gh.mode === HOLED, `${id}: el fantasma puede pegar en k=${sh.k}`);
      shoot(w, gh, sh.a, sh.p);
    }
    advance(w, gh, endK);
    assert.ok(sameBall(srv, gh), `${id}: mismo estado final`);
    assert.equal(gh.mode, HOLED);
  }
});

test('online: golpes validados por el servidor, pelotas de todos a la vez, rechazo de lo imposible y puntajes', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    const b = await connect(srv.port);
    a.send({ t: 'create', game: 'golfazo', name: 'Ana', settings: { course: 'pradera', limit: 60 } });
    await wait(150);
    const code = a.last('joined').code;
    b.send({ t: 'join', game: 'golfazo', code, name: 'Beto' });
    await wait(150);
    // opciones inválidas se ignoran
    a.send({ t: 'settings', settings: { course: 'no-existe', limit: 7 } });
    await wait(80);
    assert.equal(a.last('room').room.settings.course, 'pradera');
    assert.equal(a.last('room').room.settings.limit, 60);
    a.send({ t: 'start', settings: { course: 'pradera', limit: 60 } });
    await wait(250);
    const room0 = a.last('room').room;
    assert.equal(room0.idx, 0);
    assert.equal(room0.holes.length, 6);
    assert.equal(room0.phase, 'play');
    const ids = { a: a.last('joined').id, b: b.last('joined').id };
    const sol = SOLUTIONS['pradera-1'][0];
    // antes de la largada el tick es negativo: se rechaza
    a.send({ t: 'shot', a: sol.a, p: sol.p, k: 0 });
    await wait(100);
    assert.equal(a.all('reject').length >= 1 && a.last('reject').why, 'time');
    await wait(Math.max(0, room0.startAt - Date.now() + 80));
    // basura: golpe con tipos que no son enteros → falta que cuenta para el límite
    a.send({ t: 'shot', a: 1.5, p: 500, k: 0 });
    // tick del futuro
    a.send({ t: 'shot', a: sol.a, p: sol.p, k: 99999 });
    await wait(100);
    assert.equal(a.last('reject').why, 'time');
    // golpe bueno de Ana: el servidor lo simula y avisa que embocó
    a.send({ t: 'shot', a: sol.a, p: sol.p, k: 0 });
    await wait(200);
    const done = b.last('done');
    assert.equal(done.id, ids.a);
    assert.equal(done.holed, true);
    assert.equal(done.strokes, 1);
    const view = b.last('room').room;
    assert.deepEqual(view.pl[ids.a].s, [[sol.a, sol.p, 0]], 'Beto recibe el golpe de Ana para ver su pelota');
    assert.ok(Number.isInteger(view.pl[ids.a].d), 'tick en que embocó');
    assert.equal(view.pl[ids.b].s.length, 0);
    // un golpe de más después de embocar no se acepta
    a.send({ t: 'shot', a: 100, p: 300, k: view.pl[ids.a].d + 10 });
    await wait(100);
    assert.equal(b.last('room').room.pl[ids.a].s.length, 1);
    // Beto también emboca: el hoyo termina y se suman los puntajes
    b.send({ t: 'shot', a: sol.a, p: sol.p, k: 5 });
    await wait(250);
    const after = a.last('room').room;
    assert.equal(after.phase, 'between');
    assert.deepEqual(after.pl[ids.a].sc, [1]);
    assert.equal(after.pl[ids.b].sc.length, 1);
    assert.ok(after.pl[ids.b].sc[0] >= 1);
  } finally {
    srv.stop();
  }
});

test('online: quien no termina el hoyo suma el máximo de golpes', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    a.send({ t: 'create', game: 'golfazo', name: 'Solo', settings: { course: 'bahia', limit: 60 } });
    await wait(150);
    a.send({ t: 'start' });
    await wait(200);
    const room = a.last('room').room;
    assert.equal(room.holes[0], 'bahia-1');
    assert.ok(room.deadline - room.startAt === 60000);
  } finally {
    srv.stop();
  }
});

test('servidor: partida completa de 6 hoyos con reloj falso — puntajes por hoyo, quien no termina suma el máximo y ranking final', async () => {
  const mod = (await import('../server/games/golfazo.js')).default;
  const realNow = Date.now;
  let now = 1_700_000_000_000;
  Date.now = () => now;
  try {
    const timers = new Map();
    const sent = [];
    let ended = null;
    const players = [
      { id: 'a', name: 'Ana', color: '#ff5a5f', connected: true },
      { id: 'b', name: 'Beto', color: '#3ec1ff', connected: true },
    ];
    const room = { settings: { course: 'pradera', limit: 60, public: false }, data: null, host: 'a', players: new Map(players.map((p) => [p.id, p])) };
    const api = {
      broadcast: (m) => sent.push(m),
      send: (id, m) => sent.push({ to: id, ...m }),
      sync: () => {},
      touch: () => {},
      players: () => players,
      connected: () => true,
      setTimer: (n, ms, fn) => timers.set(n, { at: now + ms, fn }),
      clearTimer: (n) => timers.delete(n),
      end: (payload) => (ended = payload),
    };
    mod.start(room, api);
    const d = room.data;
    assert.equal(d.holes.length, 6);
    for (let h = 0; h < 6; h++) {
      assert.equal(d.idx, h);
      const id = d.holes[h];
      const sol = SOLUTIONS[id];
      // Ana juega la solución; Beto solo en los hoyos pares (en los impares no termina)
      const play = (pid) => {
        for (const sh of sol) {
          now = Math.max(now, d.startAt + (sh.k / HZ) * 1000 + 50);
          const r = mod.message(room, api, { id: pid }, { t: 'shot', a: sh.a, p: sh.p, k: sh.k });
          assert.notEqual(r, false, `${id}: golpe válido`);
        }
      };
      play('a');
      assert.equal(d.pl.get('a').done, true, `${id}: Ana embocó`);
      if (h % 2 === 0) play('b');
      else {
        // Beto no termina: vence el tiempo del hoyo
        now = d.deadline + 500;
        timers.get('limit').fn();
      }
      assert.equal(d.phase, 'between', `${id}: terminó el hoyo`);
      if (h < 5) {
        now += 7000;
        timers.get('next').fn();
      }
    }
    assert.deepEqual(d.pl.get('a').scores, SOLUTIONS_STROKES(), 'puntajes de Ana');
    assert.equal(d.pl.get('b').scores[1], MAX_STROKES, 'quien no emboca suma el máximo');
    assert.equal(d.pl.get('b').scores.length, 6);
    // fin de la partida
    now += 5000;
    timers.get('next').fn();
    assert.ok(ended, 'la partida terminó');
    assert.equal(ended.standings[0].id, 'a', 'Ana gana');
    assert.ok(ended.standings[0].total < ended.standings[1].total);
    assert.equal(ended.standings[0].holes, 6);
  } finally {
    Date.now = realNow;
  }
});

function SOLUTIONS_STROKES() {
  return courseHoles('pradera').map((id) => SOLUTIONS[id].length);
}
