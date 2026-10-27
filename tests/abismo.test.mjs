/** Abismo: simulación determinista, punto débil y roces, sonar, potencia, guiones de las etapas, jefes y sus fases. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim, NOINPUT, Pool } from '../public/games/abismo/shared/sim.js';
import { PLAYER, SHOT, MAX_POWER, BOMB, CHAIN, ENEMIES, MAX_BULLETS, DIFFS, extendAt, W, H, TICK } from '../public/games/abismo/shared/data.js';
import { STAGES } from '../public/games/abismo/shared/stages.js';
import { BOSSES } from '../public/games/abismo/shared/bosses.js';
import { ring, spread, spiral, stack, wall } from '../public/games/abismo/shared/patterns.js';
import { botInput } from '../public/games/abismo/shared/bot.js';

const steps = (sim, n, inp = () => NOINPUT) => {
  const ev = [];
  for (let i = 0; i < n; i++) for (const e of sim.step(inp(sim, i))) ev.push({ ...e });
  return ev;
};
/** Una simulación quieta en el medio, sin bichos ni balas (para probar cosas sueltas). */
function bare(o = {}) {
  const sim = new Sim({ seed: 3, ...o });
  sim.script = [];
  sim.p.enterT = 0;
  return sim;
}

test('misma semilla y mismas entradas: misma inmersión; otra semilla, otra', () => {
  const run = (seed) => {
    const sim = new Sim({ seed, diff: 'normal' });
    const mem = {};
    steps(sim, 60 * 70, (s) => botInput(s, mem));
    return sim;
  };
  const a = run(42), b = run(42), c = run(43);
  assert.equal(a.hash(), b.hash());
  assert.equal(a.score, b.score);
  assert.deepEqual(a.summary(), b.summary());
  assert.ok(a.score > 0 && a.stats.kills > 20, `hundió ${a.stats.kills}`);
  // el guion es el mismo, pero la semilla cambia lo que tira al azar (lluvias, jefes, perlas)
  const d = new Sim({ seed: 43 });
  d.p.x = a.p.x;
  assert.notEqual(c.hash(), a.hash());
});

test('el punto débil es chiquito: una bala que pasa cerca suma roce y no mata', () => {
  const sim = bare();
  const p = sim.p;
  const lives = p.lives;
  // pasa a 9 unidades: dentro del radio de roce, lejos del punto débil
  sim.bullet(p.x + 9, p.y - 60, Math.PI / 2, 300, { kind: 'dot' });
  const ev = steps(sim, 30);
  assert.equal(sim.stats.graze, 1);
  assert.ok(ev.some((e) => e.t === 'graze'));
  assert.ok(!ev.some((e) => e.t === 'hit'));
  assert.equal(p.lives, lives);
  // cada bala roza una sola vez
  sim.bullet(p.x + 9, p.y - 20, Math.PI / 2, 10, { kind: 'dot' });
  steps(sim, 60);
  assert.equal(sim.stats.graze, 2);
  // de lleno en el centro: golpe y, sin sonar, una vida menos
  const hit = sim.bullet(p.x, p.y - 30, Math.PI / 2, 300, { kind: 'dot' });
  assert.ok(hit);
  const ev2 = steps(sim, 30);
  assert.ok(ev2.some((e) => e.t === 'hit'));
  assert.ok(ev2.some((e) => e.t === 'die'));
  assert.equal(p.lives, lives - 1);
});

test('radio de choque: justo afuera roza, justo adentro pega', () => {
  for (const kind of ['dot', 'orb', 'rice', 'needle']) {
    const sim = bare();
    const p = sim.p;
    const r = sim.bullet(0, 0, 0, 0, { kind }).r;
    sim.bullets.clear();
    const b = sim.bullet(p.x + r + PLAYER.hitR + 0.4, p.y, Math.PI / 2, 0, { kind });
    steps(sim, 1);
    assert.equal(p.hitT, 0, `${kind}: afuera no pega`);
    assert.ok(b.grazed, `${kind}: roza`);
    sim.bullet(p.x + r + PLAYER.hitR - 0.4, p.y, Math.PI / 2, 0, { kind });
    steps(sim, 1);
    assert.ok(p.hitT > 0, `${kind}: adentro pega`);
  }
});

test('salvarse con el sonar justo después del golpe', () => {
  const sim = bare();
  const p = sim.p;
  sim.bullet(p.x, p.y - 10, Math.PI / 2, 300, { kind: 'dot' });
  let ev = steps(sim, 3);
  assert.ok(ev.some((e) => e.t === 'hit'));
  ev = steps(sim, 1, () => ({ dx: 0, dy: 0, focus: false, bomb: true }));
  assert.ok(ev.some((e) => e.t === 'bomb' && e.saved));
  ev = steps(sim, 60);
  assert.ok(!ev.some((e) => e.t === 'die'));
  assert.equal(p.lives, PLAYER.lives);
  assert.equal(p.bombs, PLAYER.bombs - 1);
});

test('el sonar borra todas las balas, las vuelve perlitas y protege', () => {
  const sim = bare();
  const p = sim.p;
  for (let i = 0; i < 12; i++) ring(sim, 30 + i * 28, 40 + (i % 3) * 60, { n: 30, spd: 40, kind: 'dot' });
  const n0 = sim.bullets.n;
  assert.ok(n0 >= 300);
  const score0 = sim.score;
  let ev = steps(sim, 1, () => ({ dx: 0, dy: 0, focus: false, bomb: true }));
  assert.ok(ev.some((e) => e.t === 'bomb'));
  assert.equal(p.bombs, PLAYER.bombs - 1);
  assert.ok(p.inv >= BOMB.time);
  ev = steps(sim, 70);
  assert.equal(sim.bullets.n, 0, 'no queda ninguna');
  const cancelled = ev.filter((e) => e.t === 'cancel').reduce((a, e) => a + e.n, 0);
  assert.ok(cancelled >= n0 - 5, `borradas ${cancelled} de ${n0}`);
  steps(sim, 90);
  assert.ok(sim.score > score0, 'las perlitas suman');
  // mientras dura, las balas nuevas también se borran y no pegan
  const sim2 = bare();
  steps(sim2, 1, () => ({ dx: 0, dy: 0, focus: false, bomb: true }));
  steps(sim2, 30);
  sim2.bullet(sim2.p.x, sim2.p.y - 5, Math.PI / 2, 200);
  const ev2 = steps(sim2, 20);
  assert.ok(!ev2.some((e) => e.t === 'hit'));
  // sin sonares no pasa nada
  const sim3 = bare();
  sim3.p.bombs = 0;
  const ev3 = steps(sim3, 1, () => ({ dx: 0, dy: 0, focus: false, bomb: true }));
  assert.ok(!ev3.some((e) => e.t === 'bomb'));
});

test('potencia 1 a 4: más disparos; la cápsula P sube, al máximo da puntos; perder una vida la baja', () => {
  const count = (power, focus) => {
    const sim = bare({ power });
    steps(sim, SHOT.every * 4 - 1, () => ({ dx: 0, dy: 0, focus, bomb: false }));
    return sim.shots.n;
  };
  const c = [1, 2, 3, 4].map((lv) => count(lv, false));
  for (let i = 1; i < 4; i++) assert.ok(c[i] > c[i - 1], `nivel ${i + 1}: ${c[i]} > ${c[i - 1]}`);
  assert.equal(SHOT.levels[1].length * 4, c[0]);
  // en modo preciso el disparo se cierra (los ángulos se achican)
  const spreadOf = (focus) => {
    const sim = bare({ power: 3 });
    steps(sim, 2, () => ({ dx: 0, dy: 0, focus, bomb: false }));
    const vx = [];
    for (let i = 0; i < sim.shots.n; i++) vx.push(Math.abs(sim.shots.items[i].vx));
    return Math.max(...vx);
  };
  assert.ok(spreadOf(true) < spreadOf(false) * 0.5);
  // cápsulas
  const sim = bare({ power: 1 });
  const p = sim.p;
  for (let lv = 2; lv <= MAX_POWER; lv++) {
    sim.item('P', p.x, p.y - 4, 0, 0);
    const ev = steps(sim, 20);
    assert.equal(p.power, lv);
    assert.ok(ev.some((e) => e.t === 'power' && e.lv === lv));
  }
  const s0 = sim.score;
  sim.item('P', p.x, p.y - 4, 0, 0);
  const ev = steps(sim, 20);
  assert.equal(p.power, MAX_POWER);
  assert.ok(ev.some((e) => e.t === 'powerMax') && sim.score > s0);
  // nivel 4: torpedos que persiguen
  assert.ok(Array.from({ length: sim.shots.n }, (_, i) => sim.shots.items[i]).some((s) => s.homing));
  // perder una vida: baja un nivel y la cápsula queda flotando
  sim.bullet(p.x, p.y - 10, Math.PI / 2, 300);
  steps(sim, 20);
  assert.equal(p.power, MAX_POWER - 1);
  assert.ok(Array.from({ length: sim.items.n }, (_, i) => sim.items.items[i]).some((it) => it.kind === 'P'));
});

test('patrones: anillos parejos, abanicos apuntados, espirales que giran y menos balas en fácil', () => {
  const sim = bare();
  const p = sim.p;
  const n = ring(sim, W / 2, 100, { n: 16, spd: 100 });
  assert.equal(n, 16);
  const angs = Array.from({ length: 16 }, (_, i) => sim.bullets.items[i].ang).sort((a, b) => a - b);
  for (let i = 1; i < 16; i++) assert.ok(Math.abs(angs[i] - angs[i - 1] - (Math.PI * 2) / 16) < 1e-9);
  sim.bullets.clear();
  spread(sim, 60, 80, { n: 7, arc: 1, spd: 100 });
  const mid = sim.bullets.items[3];
  assert.ok(Math.abs(mid.ang - Math.atan2(p.y - 80, p.x - 60)) < 1e-9, 'la del medio va al submarino');
  sim.bullets.clear();
  const a = sim.bullets.get();
  sim.bullets.clear();
  void a;
  spiral(sim, 180, 100, { arms: 3, rot: 0.3, k: 0, spd: 90 });
  const a0 = sim.bullets.items[0].ang;
  sim.bullets.clear();
  spiral(sim, 180, 100, { arms: 3, rot: 0.3, k: 2, spd: 90 });
  assert.ok(Math.abs(sim.bullets.items[0].ang - a0 - 0.6) < 1e-9);
  // dificultad: fácil tira menos y más lento; difícil, más
  const facil = bare({ diff: 'facil' }), dif = bare({ diff: 'dificil' });
  assert.ok(ring(facil, 100, 100, { n: 20, spd: 100 }) < 20);
  assert.ok(ring(dif, 100, 100, { n: 20, spd: 100 }) > 20);
  assert.ok(facil.bullets.items[0].spd < dif.bullets.items[0].spd);
  assert.equal(stack(sim, 100, 100, { n: 3, arc: 0.4, m: 3, spd: 100, dspd: 20 }), 9);
  // una pared siempre deja un hueco
  const wsim = bare();
  const c = wall(wsim, -10, { n: 18, gap: 4, hole: 0.5, spd: 100 });
  assert.ok(c <= 14 && c >= 10);
});

test('cadena: hundir seguido sube el multiplicador; si se espera, se corta', () => {
  const sim = bare();
  for (let i = 0; i < 10; i++) {
    const e = sim.spawnEnemy({ e: 'sardina', x: 40 + i * 30, y: 100, mv: { k: 'line', vx: 0, vy: 0 } });
    e.on = true;
    sim.damage(e, 999);
  }
  assert.equal(sim.chain, 10);
  assert.ok(sim.mult > 1.3);
  const s0 = sim.score;
  const e = sim.spawnEnemy({ e: 'sardina', x: 100, y: 100 });
  sim.damage(e, 999);
  assert.ok(sim.score - s0 > ENEMIES.sardina.pts, 'el multiplicador se nota');
  steps(sim, Math.ceil(CHAIN.time * 60) + 5);
  assert.equal(sim.chain, 0);
  assert.equal(sim.maxChain, 11);
});

test('vidas extra al pasar los puntos', () => {
  const sim = bare();
  const l0 = sim.p.lives;
  sim.addScore(extendAt(0) - 10);
  assert.equal(sim.p.lives, l0);
  sim.addScore(20);
  assert.equal(sim.p.lives, l0 + 1);
  sim.addScore(extendAt(2));
  assert.equal(sim.p.lives, l0 + 3);
  assert.ok(extendAt(4) > extendAt(3));
});

test('globos que revientan en anillos y minas que explotan solas', () => {
  const sim = bare();
  // lejos de la línea de tiro del submarino (si no, lo hunde antes de que reviente)
  sim.spawnEnemy({ e: 'globo', x: 50, y: 160, mv: { k: 'line', vx: 0, vy: 0 }, inf: 0.5 });
  const ev = steps(sim, 120);
  assert.ok(ev.some((e) => e.t === 'inflate'));
  assert.ok(ev.some((e) => e.t === 'burst'));
  assert.ok(sim.bullets.n >= 18, 'el globo largó su anillo');
  const sim2 = bare();
  sim2.spawnEnemy({ e: 'mina', x: 50, y: 100, mv: { k: 'line', vx: 0, vy: 0 }, fuse: 1 });
  const ev2 = steps(sim2, 80);
  assert.ok(ev2.some((e) => e.t === 'mine' && !e.killed));
  assert.ok(sim2.bullets.n >= 16);
  // en fácil, la mina rota no suelta balas de venganza
  const sim3 = bare({ diff: 'facil' });
  const m = sim3.spawnEnemy({ e: 'mina', x: 180, y: 100, mv: { k: 'line', vx: 0, vy: 0 } });
  sim3.damage(m, 999);
  assert.equal(sim3.bullets.n, 0);
});

test('los guiones son válidos y cada etapa llega a su jefe', () => {
  assert.equal(STAGES.length, 3);
  for (const [i, st] of STAGES.entries()) {
    const ev = st.events;
    for (let k = 1; k < ev.length; k++) assert.ok(ev[k].t >= ev[k - 1].t, 'ordenado');
    for (const e of ev) {
      if (e.boss) assert.ok(BOSSES[e.boss], e.boss);
      else if (e.warn) assert.ok(BOSSES[e.warn]);
      else {
        assert.ok(ENEMIES[e.e], `bicho ${e.e}`);
        assert.ok(e.t > 0 && e.t < st.bossAt);
        if (e.fr) assert.ok(['spread', 'ring', 'stack', 'spiral', 'wave', 'flower', 'line'].includes(e.fr.p), e.fr.p);
      }
    }
    assert.equal(ev.filter((e) => e.boss).length, 1);
    assert.ok(ev.filter((e) => e.e).length > 60, `etapa ${i}: muchos bichos`);
    assert.ok(ev.some((e) => e.drop === 'P'), 'hay cápsulas de potencia');
    // el jefe aparece a tiempo aunque no se hunda nada
    const sim = new Sim({ seed: 1, stage: i, practice: true, god: true });
    let boss = null;
    for (let k = 0; k < (st.bossAt + 4) * 60 && !boss; k++) for (const e of sim.step(NOINPUT)) if (e.t === 'bossIn') boss = e.id;
    assert.equal(boss, st.boss);
    assert.equal(sim.mode, 'boss');
    assert.ok(Math.abs(sim.tick / 60 - st.bossAt) < 0.1);
    // y se avisa antes
    assert.ok(ev.some((e) => e.warn === st.boss && e.t < st.bossAt));
  }
});

test('fases de los jefes: se ganan con daño, se pierden por tiempo y al final cae el jefe', () => {
  for (const [i, st] of STAGES.entries()) {
    const sim = bare({ stage: i, practice: true });
    sim.god = true;
    sim.spawnBoss(st.boss);
    const def = BOSSES[st.boss];
    const seen = [];
    let fired = 0;
    const note = (list) => {
      for (const e of list) {
        if (e.t === 'phase') seen.push(['phase', e.i]);
        if (e.t === 'phaseEnd') seen.push([e.won ? 'won' : e.timeout ? 'time' : 'lost', e.i, e.bonus]);
        if (e.t === 'bossDown') seen.push(['down']);
      }
    };
    for (let k = 0; k < 60 * 400 && sim.mode !== 'clear'; k++) {
      note(sim.step(NOINPUT));
      const b = sim.boss;
      if (b && b.state === 'fight') {
        fired = Math.max(fired, sim.bullets.n);
        // la primera fase se gana a los 3 s; la segunda se deja vencer por tiempo (sin disparar); el resto se gana
        if (b.phase === 1) sim.p.shotT = 99;
        else if (b.t > 3) {
          // el daño de afuera del paso deja sus eventos en sim.ev (el paso siguiente los borra)
          sim.damageBoss(b.hp + 1);
          note(sim.ev);
        }
      }
    }
    const names = seen.filter((x) => x[0] === 'phase').map((x) => x[1]);
    assert.deepEqual(names, def.phases.map((_, k) => k), `${st.boss}: fases en orden`);
    assert.deepEqual(seen.find((x) => x[1] === 0 && x[0] !== 'phase').slice(0, 1), ['won']);
    assert.ok(seen.find((x) => x[0] === 'won' && x[1] === 0)[2] > 0, 'bonus de fase');
    const timeout = seen.find((x) => x[1] === 1 && x[0] !== 'phase');
    assert.equal(timeout[0], 'time');
    assert.equal(timeout[2], 0, 'por tiempo no hay bonus');
    assert.ok(seen.some((x) => x[0] === 'down'));
    assert.equal(sim.mode, 'clear');
    assert.ok(sim.tally.clear > 0 && sim.tally.total > 0);
    assert.ok(fired > 40, `${st.boss} dispara (${fired})`);
    assert.ok(sim.stats.phasesWon === def.phases.length - 1);
  }
});

test('perder vida o usar el sonar en una fase se queda sin el bonus', () => {
  const sim = bare();
  sim.spawnBoss('pulpo');
  while (sim.boss.state !== 'fight') sim.step(NOINPUT);
  steps(sim, 1, () => ({ dx: 0, dy: 0, focus: false, bomb: true }));
  sim.damageBoss(1e9);
  const e = sim.ev.find((x) => x.t === 'phaseEnd');
  assert.ok(e && !e.won && e.bonus === 0);
});

test('de etapa en etapa hasta el fondo; práctica termina en su etapa; continuar', () => {
  const sim = new Sim({ seed: 5 });
  assert.equal(sim.stage, 0);
  for (let s = 0; s < 3; s++) {
    sim.spawnBoss(STAGES[s].boss);
    sim.boss.phase = BOSSES[STAGES[s].boss].phases.length - 1;
    sim.boss.state = 'fight';
    sim.boss.hp = 1;
    sim.damageBoss(5);
    for (let k = 0; k < 400 && sim.mode !== 'clear'; k++) sim.step(NOINPUT);
    assert.equal(sim.mode, 'clear');
    const more = sim.nextStage();
    assert.equal(more, s < 2);
  }
  assert.equal(sim.mode, 'won');
  assert.ok(sim.tally.all > 0, 'bonus por llegar al fondo');
  const pr = new Sim({ seed: 5, stage: 1, practice: true });
  assert.ok(pr.p.power >= 3, 'la práctica empieza con potencia');
  pr.stageClear();
  assert.equal(pr.nextStage(), false);
  assert.equal(pr.mode, 'won');
  // continuar
  const c = bare();
  c.p.lives = 1;
  c.bullet(c.p.x, c.p.y - 10, Math.PI / 2, 300);
  const ev = steps(c, 40);
  assert.ok(ev.some((e) => e.t === 'over'));
  assert.equal(c.mode, 'over');
  const frozen = c.tick;
  steps(c, 10);
  assert.equal(c.tick, frozen, 'en "over" no avanza');
  c.continueGame();
  assert.equal(c.mode, 'stage');
  assert.equal(c.p.lives, PLAYER.lives);
  assert.equal(c.continues, 1);
});

test('el arrastre se limita por paso y el submarino no sale del campo', () => {
  const sim = bare();
  const p = sim.p;
  const x0 = p.x;
  steps(sim, 1, () => ({ dx: 500, dy: 0, focus: false, bomb: false }));
  assert.ok(Math.abs(p.x - x0 - PLAYER.maxStep) < 1e-9);
  steps(sim, 120, () => ({ dx: 50, dy: -50, focus: false, bomb: false }));
  assert.equal(p.x, PLAYER.maxX);
  assert.equal(p.y, PLAYER.minY);
  // arriba de la línea, las perlas vienen solas
  sim.item('pearl', 30, 600, 0, 0);
  const ev = steps(sim, 90);
  assert.ok(ev.some((e) => e.t === 'pearl'));
});

test('grupos reciclados y mil balas por paso sin problema', () => {
  const pool = new Pool(() => ({ v: 0 }), 4);
  const a = pool.get(), b = pool.get();
  a.v = 1;
  b.v = 2;
  pool.free(0);
  assert.equal(pool.n, 1);
  assert.equal(pool.items[0].v, 2);
  assert.equal(pool.get(), a, 'se reusa el objeto');
  pool.get();
  pool.get();
  assert.equal(pool.get(), null, 'tope');
  const sim = bare({ diff: 'dificil' });
  sim.god = true;
  for (let i = 0; i < 40; i++) ring(sim, 20 + i * 8, 40 + (i % 5) * 40, { n: 26, spd: 30 + i, kind: i % 2 ? 'dot' : 'rice', w: i % 3 ? 0.3 : 0 });
  assert.ok(sim.bullets.n >= 1000, `balas: ${sim.bullets.n}`);
  assert.ok(sim.bullets.n <= MAX_BULLETS);
  const t0 = performance.now();
  steps(sim, 120);
  const ms = (performance.now() - t0) / 120;
  assert.ok(ms < 2, `ms por paso con ${sim.bullets.n} balas: ${ms.toFixed(3)}`);
  void TICK;
  void H;
  void DIFFS;
});

test('el piloto automático esquiva: aguanta una etapa entera en fácil', () => {
  const sim = new Sim({ seed: 9, diff: 'facil', stage: 0, practice: true });
  const mem = {};
  for (let k = 0; k < 60 * 120 && sim.mode !== 'over'; k++) sim.step(botInput(sim, mem));
  assert.notEqual(sim.mode, 'over');
  assert.ok(sim.stats.deaths <= 1, `muertes: ${sim.stats.deaths}`);
  assert.ok(sim.stats.graze > 0);
});
