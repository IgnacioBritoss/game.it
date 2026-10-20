/** Nébula: física de la mesa (lanzador, flippers, que nada se atraviese) y reglas (letras, misiones, multibola, tilt, pelota salvada, fin del juego). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../public/games/nebula/shared/physics.js';
import { Rules, BALLS } from '../public/games/nebula/shared/rules.js';
import { LETTERS, BALL_R } from '../public/games/nebula/shared/table.js';

const seeded = (s) => () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
const run = (w, secs, each = () => {}) => {
  const out = [];
  for (let i = 0; i < Math.round(secs * 60); i++) {
    each(w);
    out.push(...w.step(1 / 60));
  }
  return out;
};
/** Bot de flippers: levanta cuando una pelota se acerca. */
const flipBot = (rnd) => (w) => {
  for (const f of w.flips) {
    let near = false;
    for (const b of w.balls) if (!b.held && Math.hypot(b.x - (f.x + f.dir * 45), b.y - (f.y + 5)) < 55 && b.vy > -100) near = true;
    w.setFlip(f.id, near && rnd() < 0.93);
  }
};

test('lanzador: a fondo la pelota sale por arriba; muy suave vuelve al émbolo', () => {
  const w = new World();
  w.addBall();
  run(w, 0.3);
  assert.ok(w.ballInLane(), 'la pelota espera en el lanzador');
  assert.ok(w.launch(1));
  let top = 2000;
  run(w, 1.5, () => (top = Math.min(top, w.balls[0]?.y ?? top)));
  assert.ok(top < 200, `llegó arriba (y mínima ${top.toFixed(0)})`);
  assert.equal(w.ballInLane(), null);

  const v = new World();
  v.addBall();
  run(v, 0.3);
  v.launch(0);
  run(v, 3);
  assert.ok(v.ballInLane(), 'sin fuerza, vuelve a caer al lanzador');
});

test('flipper: la pelota que cae sobre el flipper sale disparada hacia arriba', () => {
  const w = new World();
  const b = w.addBall(250, 900, 0, 0);
  // esperar a que llegue al flipper izquierdo y pegarle
  let maxUp = 0;
  run(w, 1.6, (ww) => {
    if (b.y > 960 && b.x > 200) ww.setFlip('L', true);
    maxUp = Math.max(maxUp, -b.vy);
  });
  assert.ok(maxUp > 1400, `velocidad de salida ${maxUp.toFixed(0)}`);
});

test('nada se atraviesa: tiros rápidos en todas direcciones quedan adentro de la mesa', () => {
  const rnd = seeded(3);
  for (let k = 0; k < 40; k++) {
    const w = new World();
    const a = rnd() * Math.PI * 2;
    const b = w.addBall(150 + rnd() * 300, 250 + rnd() * 450, Math.cos(a) * 3200, Math.sin(a) * 3200);
    const bot = flipBot(rnd);
    for (let i = 0; i < 60 * 4 && b.live; i++) {
      bot(w);
      w.step(1 / 60);
      if (!b.live) break;
      assert.ok(b.x > 30 - BALL_R && b.x < 570 + BALL_R, `x ${b.x.toFixed(1)} dentro de la mesa (tiro ${k})`);
      assert.ok(b.y > 60 - BALL_R, `y ${b.y.toFixed(1)} debajo del techo (tiro ${k})`);
    }
  }
});

test('la física es determinista: las mismas entradas dan el mismo partido', () => {
  const play = () => {
    const w = new World();
    w.addBall();
    run(w, 0.2);
    w.launch(0.83);
    run(w, 10, flipBot(seeded(9)));
    return w.balls.map((b) => [Math.round(b.x * 1000), Math.round(b.y * 1000)]);
  };
  assert.deepEqual(play(), play());
});

test('letras NÉBULA: las seis prenden el agujero negro y el agujero larga la multibola', () => {
  const w = new World();
  const r = new Rules(w, 'es', seeded(1));
  for (const l of LETTERS) {
    if (['U', 'L', 'A'].includes(l)) w.dropped.add(l);
    r.on({ t: 'target', id: l, kind: ['U', 'L', 'A'].includes(l) ? 'drop' : 'stand' });
  }
  assert.equal(r.holeLit, true);
  assert.match(r.msgs.map((m) => m.small).join('|'), /AGUJERO NEGRO LISTO/);
  // la pelota entra al agujero
  const b = w.balls[0];
  w.hold(b, 'hole');
  r.on({ t: 'hole', id: b.id });
  assert.equal(r.mission?.kind, 'lluvia');
  assert.equal(r.holeLit, false);
  for (let i = 0; i < 60 * 4; i++) {
    w.step(1 / 60);
    r.update(1 / 60);
  }
  assert.equal(w.balls.length, 3, 'salieron dos pelotas más');
  assert.equal(r.pendingBalls, 0);
  // en la multibola la rampa es jackpot
  const before = r.score;
  r.on({ t: 'rampDone', id: b.id });
  assert.ok(r.score - before >= 250000);
  assert.equal(r.stats.jackpots, 1);
});

test('misiones en orden: hipervelocidad triplica y la carrera estelar suma tiempo por acierto', () => {
  const w = new World();
  const r = new Rules(w, 'es', seeded(2));
  r.missionIdx = 1;
  r.startMission();
  assert.equal(r.mission.kind, 'hiper');
  const s0 = r.score;
  r.on({ t: 'sling', id: 'sl' });
  assert.equal(r.score - s0, 330);
  r.update(31);
  assert.equal(r.mission, null, 'se termina por tiempo');
  assert.equal(r.missionsDone, 1);
  assert.equal(r.missionIdx, 2);
  r.startMission();
  assert.equal(r.mission.kind, 'carrera');
  const shot = r.mission.shot, time = r.mission.time;
  assert.equal(shot, 'orbit');
  r.orbitT = w.t;
  r.on({ t: 'sensor', id: 'orbitTop', vx: 0, vy: -500 });
  assert.equal(r.mission.hits, 1);
  assert.equal(r.mission.time, time + 6);
  assert.notEqual(r.mission.shot, 'orbit', 'la flecha se mueve a otro tiro');
  // al terminar la segunda misión hay bola extra
  r.update(99);
  assert.equal(r.missionsDone, 2);
  assert.equal(r.extra, 1);
});

test('carriles de arriba: los tres suben el bonus y los flippers corren las luces', () => {
  const w = new World();
  const r = new Rules(w, 'es', seeded(4));
  r.skillOn = false;
  r.on({ t: 'sensor', id: 'lane0', vx: 0, vy: 100 });
  assert.deepEqual(r.lanes, [true, false, false]);
  r.on({ t: 'flipUp', id: 'R' });
  assert.deepEqual(r.lanes, [false, true, false]);
  r.on({ t: 'sensor', id: 'lane0', vx: 0, vy: 100 });
  r.on({ t: 'sensor', id: 'lane2', vx: 0, vy: 100 });
  assert.equal(r.bonusX, 2);
  assert.deepEqual(r.lanes, [false, false, false]);
});

test('tiro preciso: el primer carril de la pelota, si es el que parpadea', () => {
  const w = new World();
  const r = new Rules(w, 'es', seeded(5));
  const s0 = r.score;
  r.on({ t: 'sensor', id: `lane${r.skill}`, vx: 0, vy: 200 });
  assert.ok(r.score - s0 >= 50000);
  assert.equal(r.skillOn, false);
});

test('TILT: sacudir de más apaga los flippers, anula el bonus y pasa a la pelota siguiente', () => {
  const w = new World();
  const r = new Rules(w, 'es', seeded(6));
  r.lettersBall = 3;
  assert.equal(r.nudge(), true);
  assert.equal(r.nudge(), true);
  assert.equal(r.nudge(), false);
  assert.equal(r.tilted, true);
  const s0 = r.score;
  r.on({ t: 'bumper', id: 'b1', x: 0, y: 0 });
  assert.equal(r.score, s0, 'en tilt no suma');
  w.balls[0].live = false;
  w.balls = [];
  r.on({ t: 'drain' });
  assert.equal(r.lastBonus.total, 0);
  assert.equal(r.ball, 2);
  assert.equal(r.tilted, false, 'la pelota nueva empieza sin tilt');
  // el tilt baja solo con el tiempo
  r.nudge();
  r.update(5);
  assert.equal(r.tilt, 0);
});

test('pelota salvada, fin del juego después de tres pelotas y una pelota más', () => {
  const w = new World();
  const r = new Rules(w, 'es', seeded(7));
  const drain = () => {
    for (const b of w.balls) b.live = false;
    w.balls = [];
    r.on({ t: 'drain' });
  };
  r.on({ t: 'sensor', id: 'launch', vx: 0, vy: -2000 });
  assert.equal(r.saveArmed, true);
  drain();
  assert.equal(r.ball, 1, 'salvada: sigue la misma pelota');
  assert.equal(w.balls.length, 1);
  assert.match(r.msgs.map((m) => m.big).join('|'), /PELOTA SALVADA/);
  for (let i = 0; i < BALLS; i++) drain();
  assert.equal(r.over, true);
  assert.equal(r.ball, BALLS);
  assert.equal(r.continueGame(), true);
  assert.equal(r.over, false);
  drain();
  assert.equal(r.over, true);
  assert.equal(r.continueGame(), false, 'una sola vez por partida');
});

test('un partido entero con un bot: termina, suma puntos y ninguna pelota queda trabada', () => {
  const rnd = seeded(11);
  const w = new World();
  const r = new Rules(w, 'es', rnd);
  const bot = flipBot(rnd);
  let t = 0, laneT = 0;
  const still = new Map();
  while (!r.over && t < 600) {
    if (w.ballInLane()) {
      laneT += 1 / 60;
      if (laneT > 0.5) {
        w.launch(0.55 + rnd() * 0.45);
        laneT = 0;
      }
    } else laneT = 0;
    bot(w);
    for (const e of w.step(1 / 60)) r.on(e);
    r.update(1 / 60);
    r.tick(1 / 60);
    for (const b of w.balls) {
      const s = Math.hypot(b.vx, b.vy) < 15 && !b.held && b.x < 540 ? (still.get(b.id) || 0) + 1 / 60 : 0;
      still.set(b.id, s);
      assert.ok(s < 4, `pelota quieta en (${b.x.toFixed(0)}, ${b.y.toFixed(0)})`);
    }
    t += 1 / 60;
  }
  assert.equal(r.over, true);
  assert.ok(r.score > 50000, `puntos ${r.score}`);
  assert.ok(r.stats.bumpers > 0 && r.stats.letters > 0);
});
