/** Fortín: mapas, oleadas, construir y mejorar hongos, daño y corazas, bichos especiales, poderes y partidas enteras con un bot. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, T, buildMap, makeWave, posAt, hpMul, WAVE_GAP } from '../public/games/fortin/shared/sim.js';
import { MAPS, TOWERS, TOWER_IDS, ENEMIES, POWERS, COLS, ROWS, LIVES } from '../public/games/fortin/shared/data.js';

const run = (g, secs) => {
  const ev = [];
  for (let i = 0; i < Math.round(secs * 60); i++) ev.push(...g.step(1 / 60));
  return ev;
};
const firstGrass = (g, near = null) => {
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) if (g.canBuild(x, y) && (!near || Math.hypot(x + 0.5 - near.x, y + 0.5 - near.y) < 1.6)) return [x, y];
  return null;
};

test('mapas: los caminos son casilleros de sendero, el tocón no se tapa y solo se planta en pasto', () => {
  for (const def of MAPS) {
    const m = buildMap(def);
    assert.ok(m.paths.length >= 1);
    for (const p of m.paths) {
      assert.ok(p.len > 10, `${def.id}: camino largo`);
      for (let d = 0.5; d < p.len - 0.5; d += 0.25) {
        const q = posAt(p, d);
        const tx = Math.floor(q.x), ty = Math.floor(q.y);
        if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) continue;
        assert.equal(m.tiles[m.at(tx, ty)], T.PATH, `${def.id}: (${tx},${ty}) es sendero`);
      }
      // cada tramo es horizontal o vertical
      for (let i = 1; i < p.pts.length; i++) assert.ok(p.pts[i][0] === p.pts[i - 1][0] || p.pts[i][1] === p.pts[i - 1][1]);
    }
    assert.ok([...m.tiles].some((t) => t === T.BASE), `${def.id}: hay tocón`);
    const g = new Game({ map: def.id });
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) assert.equal(g.canBuild(x, y), m.tiles[m.at(x, y)] === T.GRASS);
    const grass = [...m.tiles].filter((t) => t === T.GRASS).length;
    assert.ok(grass > 100, `${def.id}: hay lugar para plantar (${grass})`);
  }
  // el arroyo tiene agua y puentes donde lo cruza el sendero
  const creek = buildMap(MAPS.find((m) => m.id === 'arroyo'));
  assert.ok([...creek.tiles].some((t) => t === T.WATER));
  assert.ok(creek.bridges.size >= 2);
});

test('oleadas: deterministas, crecen y los mapas con jefe lo traen en la última', () => {
  for (const def of MAPS) {
    assert.deepEqual(makeWave(def, 3), makeWave(def, 3));
    const first = makeWave(def, 1), lastW = makeWave(def, def.waves);
    assert.ok(first.length >= 2);
    const hp = (w, n) => w.reduce((a, s) => a + ENEMIES[s.e].hp * hpMul(n), 0);
    assert.ok(hp(lastW, def.waves) > hp(first, 1) * 3, `${def.id}: la última es mucho más dura`);
    for (const s of lastW) assert.ok(s.p < def.paths.length);
    const bosses = lastW.filter((s) => ENEMIES[s.e].boss).map((s) => s.e);
    if (def.boss) assert.deepEqual(bosses.sort(), [].concat(def.boss).sort(), `${def.id}: jefes de la última oleada`);
    else assert.equal(bosses.length, 0);
    // las salidas están ordenadas
    for (let i = 1; i < lastW.length; i++) assert.ok(lastW[i].at >= lastW[i - 1].at);
  }
  // modo infinito: jefe cada 10
  const tocon = MAPS.find((m) => m.id === 'tocon');
  assert.ok(makeWave(tocon, 10, true).some((s) => ENEMIES[s.e].boss));
  assert.ok(!makeWave(tocon, 9, true).some((s) => ENEMIES[s.e].boss));
});

test('plantar, mejorar, especializar y vender (antes de la primera oleada se devuelve todo)', () => {
  const g = new Game({ map: 0 });
  const [x, y] = firstGrass(g);
  const c0 = g.coins;
  const tw = g.build(x, y, 'champi');
  assert.ok(tw);
  assert.equal(g.coins, c0 - TOWERS.champi.levels[0].cost);
  assert.equal(g.build(x, y, 'champi'), null, 'no se planta encima');
  assert.equal(g.build(x, y + 100, 'champi'), null);
  assert.equal(g.canBuild(...firstGrass(g), 'fosforito'), false, 'el primer mapa no tiene fosforito');
  g.coins = 5000;
  assert.ok(g.upgrade(tw));
  assert.ok(g.upgrade(tw));
  assert.equal(tw.lv, 3);
  assert.equal(g.upgrade(tw), false, 'al nivel 3 hay que elegir especialidad');
  assert.ok(g.upgrade(tw, 'b'));
  assert.equal(tw.spec, 'b');
  assert.equal(g.stats_(tw).pierce, 4);
  assert.equal(g.upgrade(tw, 'a'), false);
  const invested = TOWERS.champi.levels.reduce((a, l) => a + l.cost, 0) + TOWERS.champi.specs.b.cost;
  assert.equal(tw.invested, invested);
  assert.equal(g.sellValue(tw), invested);
  g.callWave();
  assert.equal(g.sellValue(tw), Math.floor(invested * 0.7));
  const before = g.coins;
  g.sell(tw);
  assert.equal(g.coins, before + Math.floor(invested * 0.7));
  assert.equal(g.towers.length, 0);
  // sin semillas no se puede
  g.coins = 10;
  assert.equal(g.build(...firstGrass(g), 'bejin'), null);
});

test('oleadas: la primera se llama a mano, después hay cuenta regresiva y adelantarla da semillas', () => {
  const g = new Game({ map: 0 });
  run(g, 5);
  assert.equal(g.wave, 0, 'sin llamar, no viene nadie');
  assert.equal(g.enemies.length, 0);
  assert.equal(g.callWave(), 0);
  assert.equal(g.wave, 1);
  assert.equal(g.callWave(), 0, 'mientras salen no se puede llamar otra');
  assert.equal(g.wave, 1);
  // esperar a que terminen de salir
  let guard = 0;
  while (g.queue.length && guard++ < 6000) g.step(1 / 60);
  g.step(1 / 60);
  assert.ok(g.nextT > 0 && g.nextT <= WAVE_GAP);
  g.step(2);
  const c = g.coins;
  const bonus = g.callWave();
  assert.ok(bonus > 0);
  assert.equal(g.wave, 2);
  assert.equal(g.coins, c + bonus);
  // sin llamar, la siguiente llega sola
  const h = new Game({ map: 0 });
  h.lives = 999;
  h.callWave();
  run(h, 60);
  assert.ok(h.wave >= 2);
});

test('daño: la coraza frena las esporas pero no el veneno; debilitar y caparazón', () => {
  const g = new Game({ map: 0 });
  g.callWave();
  g.queue.length = 0;
  const beetle = g.spawn('escarabajo', 0, 3);
  const hp0 = beetle.hp;
  g.hurt(beetle, 10, 'phys', null);
  assert.ok(Math.abs(hp0 - beetle.hp - 10 * (1 - ENEMIES.escarabajo.armor)) < 1e-9);
  const hp1 = beetle.hp;
  g.hurt(beetle, 10, 'magic', null);
  assert.ok(Math.abs(hp1 - beetle.hp - 10) < 1e-9);
  beetle.weakT = 2;
  beetle.weakK = 0.3;
  const hp2 = beetle.hp;
  g.hurt(beetle, 10, 'magic', null);
  assert.ok(Math.abs(hp2 - beetle.hp - 13) < 1e-9);
  // el caracol se mete en el caparazón a la mitad y recibe menos
  const snail = g.spawn('caracol', 0, 3);
  g.hurt(snail, snail.max * 0.55, 'magic', null);
  assert.ok(snail.shellT > 0);
  assert.equal(g.speedOf(snail), 0, 'escondido no camina');
  const hp3 = snail.hp;
  g.hurt(snail, 10, 'magic', null);
  assert.ok(Math.abs(hp3 - snail.hp - 3) < 1e-9);
});

test('bichos especiales: la oruga se parte, el ciempiés suelta pedazos, la reina larga avispas', () => {
  const g = new Game({ map: 'tocon' });
  g.callWave();
  g.queue.length = 0;
  const c0 = g.coins;
  const cat = g.spawn('oruga', 0, 5);
  g.hurt(cat, 1e6, 'magic', null);
  assert.equal(g.coins, c0 + ENEMIES.oruga.reward);
  assert.equal(g.enemies.filter((e) => e.e === 'larva' && !e.dead).length, ENEMIES.oruga.split.n);
  const centi = g.spawn('ciempies', 0, 5);
  g.hurt(centi, centi.max * 0.6, 'magic', null);
  assert.equal(g.enemies.filter((e) => e.e === 'larva' && !e.dead).length, ENEMIES.oruga.split.n + ENEMIES.ciempies.shed.n);
  g.hurt(centi, 1, 'magic', null);
  assert.equal(g.enemies.filter((e) => e.e === 'larva' && !e.dead).length, ENEMIES.oruga.split.n + ENEMIES.ciempies.shed.n, 'suelta una sola vez');
  const q = new Game({ map: 'raices' });
  q.callWave();
  q.queue.length = 0;
  q.spawn('reina', 0, 2);
  run(q, ENEMIES.reina.spawn.every + 0.1);
  assert.ok(q.enemies.some((e) => e.e === 'avispa'));
});

test('hongos: el bejín no alcanza a lo que vuela, la escarcha frena y el veneno lastima con el tiempo', () => {
  const setup = (type, enemy) => {
    const g = new Game({ map: 'raices' });
    g.callWave();
    g.queue.length = 0;
    g.coins = 9999;
    const path = g.map.paths[0];
    const en = g.spawn(enemy, 0, 6);
    en.hp = en.max = 1e5;
    const [x, y] = firstGrass(g, { x: en.x, y: en.y });
    const tw = g.build(x, y, type);
    // que el bicho no se vaya del alcance
    en.d = 6;
    return { g, en, tw, path };
  };
  {
    const { g, en } = setup('bejin', 'polilla');
    for (let i = 0; i < 120; i++) {
      en.d = 6;
      g.step(1 / 60);
    }
    assert.equal(en.hp, en.max, 'el bejín ignora a la polilla');
  }
  {
    const { g, en } = setup('escarcha', 'hormiga');
    for (let i = 0; i < 90; i++) {
      en.d = 6;
      g.step(1 / 60);
    }
    assert.ok(en.slowT > 0 && en.slow >= TOWERS.escarcha.levels[0].slow - 1e-9);
    assert.ok(g.speedOf(en) < ENEMIES.hormiga.sp);
  }
  {
    const { g, en } = setup('amanita', 'escarabajo');
    for (let i = 0; i < 240; i++) {
      en.d = 6;
      g.step(1 / 60);
    }
    assert.ok(en.poison.length > 0);
    assert.ok(en.poison.length <= TOWERS.amanita.levels[0].stacks);
    assert.ok(en.max - en.hp > TOWERS.amanita.levels[0].poison, 'el veneno sumó daño');
  }
});

test('poderes: lluvia lastima y frena, raíces atrapan (menos a los que vuelan) y se recargan', () => {
  const g = new Game({ map: 'raices' });
  assert.equal(g.usePower('lluvia', 5, 5), false, 'antes de empezar no se puede');
  g.callWave();
  g.queue.length = 0;
  const a = g.spawn('hormiga', 0, 4);
  const m = g.spawn('polilla', 0, 4);
  a.hp = a.max = 1000;
  m.hp = m.max = 1000;
  assert.ok(g.usePower('lluvia', a.x, a.y));
  assert.equal(a.max - a.hp, POWERS.lluvia.dmg);
  assert.ok(a.slowT > 0);
  assert.equal(g.usePower('lluvia', a.x, a.y), false, 'se está recargando');
  assert.ok(g.usePower('raices', a.x, a.y));
  assert.ok(a.rootT > 0);
  assert.equal(m.rootT, 0, 'la polilla vuela por arriba de las raíces');
  run(g, POWERS.lluvia.cd + 0.1);
  assert.equal(g.powers.lluvia.cd, 0);
});

test('vidas: lo que llega al tocón resta vidas y con cero se pierde', () => {
  const g = new Game({ map: 0 });
  g.callWave();
  let lost = false;
  for (let i = 0; i < 60 * 600 && !lost; i++) for (const e of g.step(1 / 60)) if (e.t === 'lost') lost = true;
  assert.equal(lost, true);
  assert.equal(g.phase, 'lost');
  assert.equal(g.lives, 0);
  assert.ok(g.stats.leaked > 0);
  assert.equal(g.stars(), 0);
  assert.equal(g.callWave(), 0, 'perdida no se juega más');
});

/** Bot simple y determinista: planta champis y bejines en los mejores lugares y los mejora. */
function botPlay(mapId) {
  const g = new Game({ map: mapId });
  const spots = [];
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      if (g.tile(x, y) !== T.GRASS) continue;
      let c = 0;
      for (const p of g.map.paths)
        for (let d = 0; d < p.len; d += 0.25) {
          const q = posAt(p, d);
          if (Math.hypot(q.x - x - 0.5, q.y - y - 0.5) <= 2.6) c++;
        }
      spots.push({ x, y, c });
    }
  spots.sort((a, b) => b.c - a.c);
  const order = ['champi', 'bejin', 'champi', 'escarcha', 'champi', 'bejin'];
  let k = 0;
  const act = () => {
    for (let guard = 0; guard < 8; guard++) {
      const want = order[k % order.length];
      const spot = spots.find((s) => g.canBuild(s.x, s.y));
      const weak = g.towers.filter((t) => t.lv < 3).sort((a, b) => a.lv - b.lv)[0];
      if (g.towers.length >= 6 && weak && g.coins >= TOWERS[weak.type].levels[weak.lv].cost) {
        g.upgrade(weak);
        continue;
      }
      if (spot && g.coins >= TOWERS[want].levels[0].cost) {
        g.build(spot.x, spot.y, want);
        k++;
        continue;
      }
      break;
    }
  };
  act();
  g.callWave();
  for (let i = 0; i < 60 * 1800 && g.phase === 'run'; i++) {
    g.step(1 / 60);
    if (i % 60 === 0) act();
  }
  return g;
}

test('una partida entera del primer mapa con un bot sencillo se gana', () => {
  const g = botPlay('claro');
  assert.equal(g.phase, 'won');
  assert.equal(g.wave, MAPS[0].waves);
  assert.ok(g.stars() >= 1);
  assert.ok(g.stats.kills > 100);
});

test('modo infinito: no termina, trae jefes y la vista previa coincide con la oleada', () => {
  const g = new Game({ map: 'senderos', endless: true });
  assert.equal(g.total, Infinity);
  const pv = g.preview();
  const w1 = makeWave(MAPS.find((m) => m.id === 'senderos'), 1, true);
  assert.equal(pv.reduce((a, x) => a + x.n, 0), w1.length);
  g.lives = 1e6;
  g.callWave();
  for (let i = 0; i < 60 * 400; i++) g.step(1 / 60);
  assert.equal(g.phase, 'run');
  assert.ok(g.wave >= 5);
  for (const id of TOWER_IDS) assert.ok(TOWERS[id].specs.a && TOWERS[id].specs.b);
  assert.equal(LIVES, 20);
});
