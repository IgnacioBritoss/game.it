/**
 * Brinco: los doce niveles (estructura, obstáculos, tres gemas alcanzables en cada uno), la física del jugador (salto
 * variable, margen de coyote y de apretado anticipado, hielo, cintas, resortes, bloques), cada enemigo y obstáculo, las
 * ocho habilidades, los jefes, los banderines, el determinismo, el piloto automático terminando cada nivel, el dibujo
 * de todos los sprites y los textos en los dos idiomas.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { load, step, respawn, clone, tileAt, T, H, PH, CHARS, CHAR_IDS } from '../public/games/brinco/shared/sim.js';
import { LEVELS, WORLDS, levelById } from '../public/games/brinco/shared/levels.js';
import { CHUNKS, buildLevel } from '../public/games/brinco/shared/builder.js';
import { pilot, playLevel, setRespawn, searchGem } from '../public/games/brinco/shared/pilot.js';
import { drawChar, drawEnt, drawBoss, heartPath, CHAR_COLOR } from '../public/games/brinco/sprites.js';
import { TXT } from '../public/games/brinco/text.js';

setRespawn(respawn);

const DIR = new URL('../public/games/brinco/', import.meta.url);
const read = (f) => readFileSync(new URL(f, DIR), 'utf8');
const IDLE = { l: false, r: false, u: false, d: false, a: false };
const GROUND = H - 2; // fila del piso (la parte de arriba del piso está en y = GROUND)

// ------------------------------------------------------------------ ayudas
/**
 * Mundo chico para probar una cosa a la vez: `top` son las filas de arriba hacia el piso (la última queda justo encima
 * del piso), después vienen dos filas de piso. `@` marca el comienzo.
 */
function mini(top, { char = 'capi', floor = '#', w, ...level } = {}) {
  const width = w ?? Math.max(40, ...top.map((r) => r.length));
  const rows = [...Array(H - top.length - 2).fill(''), ...top, floor.repeat(width), '#'.repeat(width)].map((r) => r.padEnd(width, ' ').slice(0, width));
  return load({ id: 'mini', rows, seed: 1, ...level }, char);
}
/** Avanza `n` cuadros con una entrada fija o una función `(f, W) => entrada`; devuelve los eventos. */
function run(W, n, inp = IDLE) {
  const ev = [];
  for (let f = 0; f < n; f++) {
    step(W, { ...IDLE, ...(typeof inp === 'function' ? inp(f, W) : inp) });
    ev.push(...W.events);
    W.events.length = 0;
  }
  return ev;
}
/** Saca baldosas (por defecto, las dos filas del piso) entre dos columnas. */
const carve = (W, x0, x1, y0 = GROUND, y1 = H - 1) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) W.tiles[y * W.w + x] = T.AIR;
};
const ents = (W, kind) => W.ents.filter((e) => e.kind === kind);
const ent = (W, kind) => W.ents.find((e) => e.kind === kind);
const names = (ev) => new Set(ev.map((e) => e.t));
/** Deja que el personaje se apoye en el piso. */
const settle = (W) => {
  run(W, 20);
  assert.ok(W.p.grounded, 'se apoya en el piso');
  return W;
};
/** Altura máxima alcanzada (en baldosas) manteniendo apretado el salto `hold` cuadros. */
function apex(char, hold, extra = {}) {
  const W = mini(['', '', '', '', '', '', '', '  @'], { char, ...extra });
  settle(W);
  const y0 = W.p.y;
  let min = y0;
  run(W, 100, (f) => {
    min = Math.min(min, W.p.y);
    return { u: f < hold };
  });
  return y0 - min;
}

// ------------------------------------------------------------------ niveles
test('hay doce niveles en cuatro mundos de tres, con su tema', () => {
  assert.equal(LEVELS.length, 12);
  assert.equal(WORLDS.length, 4);
  assert.deepEqual(WORLDS.map((w) => w.theme), ['prairie', 'cave', 'ice', 'lava']);
  for (const w of WORLDS) {
    const lv = LEVELS.filter((l) => l.world === w.id);
    assert.equal(lv.length, 3, `mundo ${w.id}`);
    assert.deepEqual(lv.map((l) => l.id), [1, 2, 3].map((n) => `w${w.id}-${n}`));
    for (const l of lv) assert.equal(l.theme, w.theme);
    assert.ok(lv[2].boss, 'el tercero de cada mundo termina con jefe');
    assert.ok(!lv[0].boss && !lv[1].boss);
  }
  assert.equal(new Set(LEVELS.map((l) => l.id)).size, 12);
  assert.equal(levelById('w3-2').id, 'w3-2');
});

test('cada nivel tiene la grilla bien formada, un solo comienzo, tres gemas y su salida', () => {
  const legend = new Set(' #=B?AU^v~I><ScPpFG$*@weNnkbjmtohufalx1Zg'.split(''));
  for (const L of LEVELS) {
    assert.equal(L.rows.length, H, `${L.id}: alto`);
    const w = L.rows[0].length;
    assert.ok(w >= 200 && w <= 300, `${L.id}: ancho ${w}`);
    for (const r of L.rows) {
      assert.equal(r.length, w, `${L.id}: todas las filas miden lo mismo`);
      for (const ch of r) assert.ok(legend.has(ch), `${L.id}: carácter desconocido "${ch}"`);
    }
    const all = L.rows.join('');
    const count = (ch) => [...all].filter((c) => c === ch).length;
    assert.equal(count('@'), 1, `${L.id}: un solo comienzo`);
    assert.equal(count('*'), 3, `${L.id}: tres gemas escondidas`);
    assert.ok(count('$') >= 40, `${L.id}: monedas`);
    assert.ok(count('F') >= 1, `${L.id}: al menos un banderín`);
    if (L.boss) {
      assert.equal(count('Z'), 1, `${L.id}: un jefe`);
      assert.ok(count('g') > 0 && count('G') === 0, `${L.id}: la salida del jefe está escondida hasta vencerlo`);
      assert.ok(L.arena && L.arena[0] > 0 && L.arena[1] < w, `${L.id}: arena`);
      assert.ok(['charger', 'jumper', 'flyer'].includes(L.boss));
      assert.ok(['beetle', 'mole', 'bird', 'king'].includes(L.bossSkin));
    } else {
      assert.equal(count('Z'), 0);
      assert.ok(count('G') > 0, `${L.id}: salida`);
    }
    // el comienzo está parado sobre piso firme
    const sy = L.rows.findIndex((r) => r.includes('@'));
    assert.ok('#=B'.includes(L.rows[sy + 1][L.rows[sy].indexOf('@')]), `${L.id}: el comienzo tiene piso`);
    for (const h of L.hints || []) assert.ok(h.es && h.en && h.x >= 0 && h.x < w);
  }
});

test('los niveles usan todos los enemigos, obstáculos y premios del juego', () => {
  const all = LEVELS.map((l) => l.rows.join('')).join('');
  const need = {
    enemigos: 'wekbjm',
    cañones: 'nN',
    aplastador: 't',
    'barra de fuego': 'o',
    'plataformas móviles y que caen': 'huf',
    'púas y lava': '^v~',
    'hielo, cintas y resortes': 'I><S',
    'bloques que se desmoronan, tubos y bloques': 'cPpB?A',
    'premios (fruta, flor, ají y corazón dorado)': 'alx1',
  };
  for (const [what, chars] of Object.entries(need)) {
    const missing = chars.split('').filter((c) => !all.includes(c));
    assert.deepEqual(missing, [], `${what}: faltan ${missing.join(' ')}`);
  }
  // cada mundo tiene lo suyo
  assert.ok(LEVELS.filter((l) => l.world === 3).some((l) => l.rows.join('').includes('I')), 'hielo en el mundo 3');
  assert.ok(LEVELS.filter((l) => l.world === 4).some((l) => l.rows.join('').includes('~')), 'lava en el mundo 4');
  assert.ok(LEVELS.filter((l) => l.world === 3).some((l) => l.wind), 'ventisca en el mundo 3');
  assert.ok(LEVELS.filter((l) => l.world === 1).every((l) => !l.rows.join('').includes('~')), 'sin lava en la pradera');
  // antes de cada jefe hay una fruta para curarse
  for (const L of LEVELS.filter((l) => l.boss)) assert.ok(L.rows.join('').includes('a'), `${L.id}: fruta antes del jefe`);
});

test('cada tramo mide lo pedido, tiene doce filas y los bordes con piso a la misma altura', () => {
  for (const [name, fn] of Object.entries(CHUNKS)) {
    for (const w of [undefined, 16, 24]) {
      const c = fn(w, {});
      const rows = c.rows();
      assert.equal(rows.length, H, `${name}`);
      for (const r of rows) assert.equal(r.length, c.w, `${name}: ancho`);
      if (w) assert.equal(c.w, w, `${name}: respeta el ancho pedido`);
    }
  }
  for (const [name, fn] of Object.entries(CHUNKS)) {
    if (['arena', 'goal', 'start'].includes(name)) continue;
    const r = fn(undefined, {}).rows();
    assert.ok('#IcB>< '.includes(r[10][0]) || r[10][0] === '=', `${name}: borde izquierdo`);
  }
  assert.throws(() => buildLevel({ id: 'x', parts: [['no-existe', 10]] }), /tramo desconocido/);
});

// ------------------------------------------------------------------ el piloto automático juega cada nivel
test('el piloto automático termina los doce niveles y alcanza las tres gemas de cada uno', () => {
  for (const L of LEVELS) {
    const gems = [];
    L.rows.forEach((r, y) => [...r].forEach((ch, x) => ch === '*' && gems.push({ x, y, ok: false })));
    assert.equal(gems.length, 3);
    const W = load(L, 'capi');
    const r = playLevel(W, {
      maxSeconds: 160,
      // mientras avanza, cada medio segundo comprueba si las gemas que vienen se pueden juntar desde donde está
      onFrame(S) {
        if (S.frame % 30 !== 0 || S.state !== 'play') return;
        for (const g of gems) {
          if (g.ok || g.x + 0.5 - S.p.x < -3 || g.x + 0.5 - S.p.x > 14) continue;
          if (searchGem(S, { x: g.x + 0.5, y: g.y + 0.5 })) g.ok = true;
        }
      },
    });
    assert.ok(r.won, `${L.id}: no se pudo terminar (llegó a x=${r.x.toFixed(0)}, muertes ${r.deaths})`);
    assert.ok(r.deaths <= 6, `${L.id}: demasiadas muertes (${r.deaths})`);
    assert.ok(r.frames / 60 < 100, `${L.id}: tarda demasiado (${(r.frames / 60).toFixed(0)} s)`);
    if (L.boss) assert.equal(W.bossDown, true, `${L.id}: el jefe tiene que caer antes de la salida`);
    assert.equal(W.state, 'won');
    assert.ok(W.coins > 10 && W.score > 1000, `${L.id}: junta monedas y puntos`);
    const missing = gems.filter((g) => !g.ok).map((g) => `(${g.x},${g.y})`);
    assert.deepEqual(missing, [], `${L.id}: gemas que no se pueden alcanzar`);
  }
});

test('cada personaje puede terminar niveles pensados para frenarlo', () => {
  const plan = { capi: 'w2-1', lola: 'w1-2', tuco: 'w1-3', rulo: 'w3-1', lana: 'w4-1', brava: 'w2-2', tatu: 'w3-2', yaca: 'w4-3' };
  assert.deepEqual(Object.keys(plan).sort(), [...CHAR_IDS].sort());
  for (const [ch, id] of Object.entries(plan)) {
    const W = load(levelById(id), ch);
    const r = playLevel(W, { maxSeconds: 160 });
    assert.ok(r.won, `${ch} en ${id}: no pudo terminarlo (x=${r.x.toFixed(0)}, muertes ${r.deaths})`);
  }
});

test('con la misma jugada el resultado es idéntico (determinista) y el clon no toca al original', () => {
  const sig = (W) => JSON.stringify({ x: W.p.x, y: W.p.y, vx: W.p.vx, vy: W.p.vy, hp: W.p.hp, c: W.coins, g: W.gems, s: W.score, k: W.kills, n: W.ents.length, t: W.t, st: W.state });
  const go = () => {
    const W = load(levelById('w2-1'), 'lola');
    const memo = {};
    for (let f = 0; f < 900; f++) {
      step(W, pilot(W, memo));
      W.events.length = 0;
    }
    return W;
  };
  const a = go();
  const b = go();
  assert.equal(sig(a), sig(b));
  assert.ok(a.p.x > 20, 'avanzó');
  const before = sig(a);
  const C = clone(a);
  for (let f = 0; f < 120; f++) step(C, { ...IDLE, r: true });
  assert.equal(sig(a), before, 'el original no cambia');
  assert.notEqual(sig(C), before);
  // y el clon evoluciona igual que el original con las mismas teclas
  const D = clone(a);
  const E = clone(a);
  for (let f = 0; f < 90; f++) {
    step(D, { ...IDLE, r: true, u: f % 40 < 12 });
    step(E, { ...IDLE, r: true, u: f % 40 < 12 });
  }
  assert.equal(sig(D), sig(E));
});

// ------------------------------------------------------------------ movimiento
test('corre con inercia hasta su velocidad máxima y frena en el piso común', () => {
  const W = mini(['  @']);
  settle(W);
  run(W, 40, { r: true });
  assert.ok(Math.abs(W.p.vx - PH.walk) < 0.05, `velocidad ${W.p.vx}`);
  assert.equal(W.p.face, 1);
  run(W, 12);
  assert.equal(W.p.vx, 0, 'frena enseguida');
  run(W, 30, { l: true });
  assert.equal(W.p.face, -1);
  assert.ok(W.p.vx < 0);
});

test('el salto es más alto si se mantiene apretado y se puede cortar; un salto simple no llega a 4 baldosas', () => {
  const full = apex('capi', 80);
  const tap = apex('capi', 4);
  assert.ok(full > 3.6 && full < 4, `salto completo ${full}`);
  assert.ok(tap > 0.4 && tap < full - 1, `salto corto ${tap}`);
});

test('el margen de coyote deja saltar justo después de salir del borde, pero no mucho después', () => {
  const attempt = (n) => {
    const W = mini(['  @']);
    carve(W, 10, 39);
    settle(W);
    let guard = 0;
    while (W.p.grounded && guard++ < 400) run(W, 1, { r: true }); // camina hasta dejar de pisar
    assert.ok(!W.p.grounded, 'salió del borde');
    run(W, n, { r: true });
    run(W, 1, { r: true, u: true });
    return W.p.vy < 0;
  };
  assert.equal(attempt(2), true, 'salta con coyote');
  assert.equal(attempt(14), false, 'ya no');
});

test('apretar salto un poco antes de tocar el piso igual salta (buffer)', () => {
  const start = () => mini(['  @', '', '', '']);
  const probe = start();
  let fall = 0;
  while (!probe.p.grounded && fall < 200) {
    run(probe, 1);
    fall++;
  }
  assert.ok(fall > 16, `cae ${fall} cuadros`);
  const jumps = (early) => {
    const W = start();
    let min = Infinity;
    run(W, fall + 25, (f) => {
      if (f > fall) min = Math.min(min, W.p.y); // ya aterrizó: ¿volvió a despegar?
      return { u: f === fall - early };
    });
    return min < GROUND - 0.5;
  };
  assert.equal(jumps(4), true, 'con el botón apretado cuatro cuadros antes, salta al aterrizar');
  assert.equal(jumps(14), false, 'si apretó mucho antes, se perdió');
});

test('el hielo patina, la cinta arrastra y el viento empuja', () => {
  const slide = (floor) => {
    const W = mini(['  @'], { floor });
    settle(W);
    run(W, 70, { r: true });
    run(W, 30);
    return W.p.vx;
  };
  assert.equal(slide('#'), 0);
  assert.ok(slide('I') > 3.5, 'sigue deslizando en el hielo');
  const belt = (ch) => {
    const W = mini(['                    @'], { floor: ch });
    settle(W);
    const x0 = W.p.x;
    run(W, 60);
    return W.p.x - x0;
  };
  assert.ok(belt('>') > 2.5, `cinta derecha ${belt('>')}`);
  assert.ok(belt('<') < -2.5, `cinta izquierda ${belt('<')}`);
  assert.ok(Math.abs(belt('#')) < 0.01, 'el piso común no mueve');
  // viento en contra: llega menos lejos
  const dist = (level) => {
    const W = mini(['  @'], level);
    settle(W);
    const x0 = W.p.x;
    run(W, 60, { r: true });
    return W.p.x - x0;
  };
  assert.ok(dist({ wind: -2.4 }) < dist({}) - 0.5, 'el viento en contra frena');
});

test('el resorte lanza mucho más alto que un salto', () => {
  const W = mini(['', '', '', '', '', '', '', '  @']);
  W.tiles[(GROUND - 1) * W.w + 2] = T.SPRING; // un resorte sobre el piso, justo bajo el personaje
  W.p.y = GROUND - 1;
  W.p.x = 2.5;
  const y0 = W.p.y;
  let min = y0;
  const ev = run(W, 90, () => {
    min = Math.min(min, W.p.y);
    return IDLE;
  });
  assert.ok(names(ev).has('spring'), 'suena el resorte');
  assert.ok(y0 - min > 6, `sube ${(y0 - min).toFixed(1)}`);
  assert.ok(y0 - min > apex('capi', 80) + 2);
});

test('los bloques que se desmoronan caen y vuelven', () => {
  const W = mini(['  @', '', '  c', '', '']);
  const c = { x: 2, y: GROUND - 3 };
  assert.equal(tileAt(W, c.x, c.y), T.CRUMB);
  run(W, 10);
  assert.ok(W.p.grounded && Math.abs(W.p.y - c.y) < 0.01, 'se para sobre el bloque');
  run(W, 40);
  assert.equal(tileAt(W, c.x, c.y), T.AIR, 'se rompió');
  run(W, 270, { r: true });
  assert.equal(tileAt(W, c.x, c.y), T.CRUMB, 'volvió');
});

test('las plataformas móviles llevan al jugador y las que caen se caen', () => {
  const W = mini(['', '', '', '', '', '  h']);
  carve(W, 0, 39);
  const plat = ent(W, 'plat');
  assert.ok(plat);
  W.p.x = plat.x;
  W.p.y = plat.y - 2;
  run(W, 30);
  assert.ok(W.p.grounded && W.p.ride === plat, 'viaja arriba');
  const off = W.p.x - plat.x;
  const x0 = plat.x;
  run(W, 90);
  assert.ok(W.p.grounded && W.p.ride === plat);
  assert.ok(Math.abs(W.p.x - plat.x - off) < 0.2, 'se mueve con la plataforma');
  assert.ok(Math.abs(plat.x - x0) > 0.5, 'la plataforma se mueve');
  // la que cae
  const F = mini(['', '', '', '', '', '  f']);
  carve(F, 0, 39);
  const fp = ent(F, 'plat');
  F.p.x = fp.x;
  F.p.y = fp.y - 2;
  run(F, 25);
  assert.equal(fp.state, 'shake', 'tiembla al pisarla');
  run(F, 40);
  assert.ok(['fall', 'gone'].includes(fp.state), 'y se cae');
  assert.ok(fp.state === 'gone' || fp.y > fp.y0 + 0.5);
});

// ------------------------------------------------------------------ bloques, monedas y premios
test('monedas y gemas se juntan una sola vez', () => {
  const W = mini(['  @ $$ *']);
  assert.equal(W.coinsTotal, 2);
  assert.equal(W.gemsTotal, 1);
  const ev = run(W, 60, { r: true });
  assert.equal(W.coins, 2);
  assert.equal(W.gems, 1);
  assert.ok(names(ev).has('coin') && names(ev).has('gem'));
  run(W, 60, { l: true });
  run(W, 60, { r: true });
  assert.equal(W.coins, 2, 'no se repiten');
  assert.equal(W.score, 2 * 50 + 500);
});

test('los bloques dan monedas, premios y se rompen desde abajo', () => {
  const hit = (ch) => {
    const W = mini(['', '', '', '', '', '  ' + ch, '', '', '  @']);
    settle(W);
    const by = GROUND - 4; // fila del bloque
    assert.equal(tileAt(W, 2, by), { B: T.BRICK, '?': T.Q, A: T.QP }[ch]);
    const ev = run(W, 40, { u: true });
    return { W, ev, tile: tileAt(W, 2, by) };
  };
  const q = hit('?');
  assert.equal(q.tile, T.USED);
  assert.equal(q.W.coins, 1);
  assert.ok(names(q.ev).has('coin'));
  const b = hit('B');
  assert.equal(b.tile, T.AIR);
  assert.ok(names(b.ev).has('break'));
  const a = hit('A');
  assert.equal(a.tile, T.USED);
  assert.ok(names(a.ev).has('item-out'), 'sale un premio');
  // el premio (una flor, porque ya tiene todos los corazones) cae justo donde está el personaje y lo junta
  run(a.W, 120);
  assert.equal(a.W.p.power, 1, 'juntó la flor');
  assert.ok(a.W.ents.every((e) => e.kind !== 'item'));
  // con un corazón menos, el premio es una fruta
  const h = mini(['', '', '', '', '', '  A', '', '', '  @']);
  h.p.hp = 1;
  settle(h);
  run(h, 40, { u: true });
  run(h, 120);
  assert.equal(h.p.hp, 2, 'juntó la fruta');
});

test('fruta cura, flor da semillas, ají vuelve invencible y el corazón dorado suma un corazón', () => {
  const W = mini(['  @ a l x 1']);
  W.p.hp = 1;
  const ev = run(W, 120, { r: true });
  assert.equal(W.p.power, 1, 'la flor da poder');
  assert.ok(W.p.star > 5, 'el ají da invencibilidad');
  assert.equal(W.p.maxHp, CHARS.capi.hp + 1, 'el corazón dorado agranda la vida');
  assert.equal(W.p.hp, 3, 'fruta (+1) y corazón dorado (+1)');
  assert.equal(names(ev).has('power'), true);
  // con el ají puesto no lo lastima nada y se lleva puesto a los enemigos
  const w = { id: 70, kind: 'walker', x: W.p.x + 0.4, y: W.p.y, w: 0.8, h: 0.75, vx: 0, vy: 0, t: 0, dead: false, face: -1 };
  W.ents.push(w);
  run(W, 3);
  assert.equal(W.kills, 1);
  assert.equal(W.hits, 0);
  // la invencibilidad se acaba
  run(W, 60 * 9);
  assert.ok(W.p.star <= 0);
  // la fruta no pasa del máximo y el corazón dorado tiene tope
  const V = mini(['  @ a a a a']);
  run(V, 150, { r: true });
  assert.equal(V.p.hp, V.p.maxHp);
  const U = mini(['  @ 1 1 1 1 1 1']);
  run(U, 200, { r: true });
  assert.equal(U.p.maxHp, 5);
});

test('el banderín guarda el avance y al reaparecer vuelven los enemigos pero no lo juntado', () => {
  const W = mini(['  @   $ F $$    w']);
  const w0 = ent(W, 'walker');
  const wx = w0.x;
  const ev = run(W, 60, { r: true });
  assert.ok(W.check && W.check.on, 'activó el banderín');
  assert.ok(names(ev).has('checkpoint'));
  const coins = W.coins;
  assert.ok(coins >= 1);
  // el enemigo se movió y el jugador perdió
  ent(W, 'walker').x += 3;
  W.p.x = 14;
  W.p.hp = 0;
  W.score = 900;
  respawn(W);
  assert.equal(W.state, 'play');
  assert.equal(W.p.hp, CHARS.capi.hp, 'vuelve con toda la vida');
  assert.ok(Math.abs(W.p.x - W.check.x) < 0.01, 'reaparece en el banderín');
  assert.equal(W.coins, coins, 'las monedas juntadas siguen');
  assert.equal(W.score, 700, 'cuesta 200 puntos');
  assert.equal(ents(W, 'walker').length, 1, 'el enemigo volvió');
  assert.equal(ent(W, 'walker').x, wx, 'a su lugar de siempre');
});

test('llegar a la meta termina el nivel y suma puntos por el tiempo', () => {
  const W = mini(['  @       G', '          G']);
  const ev = run(W, 240, { r: true });
  assert.equal(W.state, 'won');
  assert.ok(names(ev).has('goal'));
  assert.ok(W.score >= 900);
  const x = W.p.x;
  run(W, 30, { r: true });
  assert.equal(W.p.x, x, 'festeja quieto');
});

// ------------------------------------------------------------------ enemigos y obstáculos
test('aplastar a un bichito lo mata y rebota; de costado lastima y da tiempo de invulnerabilidad', () => {
  const W = mini(['', '', '', '', '', '', '     w']);
  const w = ent(W, 'walker');
  w.vx = 0;
  W.p.x = w.x;
  W.p.y = w.y - 2.5;
  W.p.vy = 4;
  const ev = run(W, 20);
  assert.equal(W.kills, 1);
  assert.equal(W.p.hp, CHARS.capi.hp);
  assert.ok(names(ev).has('stomp'));
  assert.ok(W.p.y < w.y - 0.5 || W.p.vy < 0, 'rebota');
  assert.equal(ents(W, 'walker').length, 0);
  // de costado
  const V = mini(['  @       w']);
  settle(V);
  let guard = 0;
  while (V.hits === 0 && guard++ < 600) run(V, 1);
  assert.equal(V.p.hp, CHARS.capi.hp - 1, 'perdió un corazón');
  assert.ok(V.p.inv > 1 && V.p.hurtT > 0, 'queda invulnerable un rato');
  assert.ok(V.p.vx !== 0 || V.p.vy < 0, 'sale despedido');
  // mientras dura la invulnerabilidad, el enemigo puede atravesarlo sin hacerle nada
  V.ents.push({ id: 91, kind: 'walker', x: V.p.x + 0.3, y: V.p.y, w: 0.8, h: 0.75, vx: 0, vy: 0, t: 0, dead: false, face: -1 });
  run(V, 20);
  assert.equal(V.hits, 1);
});

test('sin vida el personaje muere, y se puede volver a empezar', () => {
  const W = mini(['  @       w']);
  W.p.hp = 1;
  settle(W);
  const ev = run(W, 400);
  assert.equal(W.state, 'dead');
  assert.equal(W.deaths, 1);
  assert.ok(names(ev).has('die'));
  W.score = 500;
  respawn(W);
  assert.equal(W.state, 'play');
  assert.equal(W.score, 300);
  assert.equal(W.p.hp, CHARS.capi.hp);
});

test('el erizo no se pisa (salvo con pisotón) y la armadura aguanta el roce', () => {
  const drop = (char, down) => {
    const W = mini(['', '', '', '', '', '', '     e'], { char });
    const e = ent(W, 'erizo');
    e.vx = 0;
    W.p.x = e.x;
    W.p.y = e.y - 2.5;
    W.p.vy = 4;
    run(W, 40, (f) => ({ d: !!down && f === 0 }));
    return W;
  };
  const capi = drop('capi', false);
  assert.equal(capi.p.hp, CHARS.capi.hp - 1, 'pisarlo lastima');
  assert.equal(capi.kills, 0);
  const yaca = drop('yaca', true);
  assert.equal(yaca.kills, 1, 'con pisotón sí cae');
  assert.equal(yaca.p.hp, CHARS.yaca.hp);
  const tatu = mini(['  @   e'], { char: 'tatu' });
  settle(tatu);
  run(tatu, 300, (f, S) => ({ r: S.p.x < 12 }));
  assert.equal(tatu.p.hp, CHARS.tatu.hp, 'la armadura no sufre con el erizo');
});

test('el escarabajo deja su caparazón al pisarlo, se patea y arrasa con lo que encuentra', () => {
  const W = mini(['', '', '', '', '', '', '     k']);
  const b = ent(W, 'beetle');
  b.vx = 0;
  W.p.x = b.x;
  W.p.y = b.y - 2.5;
  W.p.vy = 4;
  run(W, 20);
  assert.equal(b.mode, 'shell');
  assert.ok(b.h < 0.7);
  assert.equal(W.p.hp, CHARS.capi.hp);
  // lo patea: se mete en el caparazón desde un costado
  W.p.vy = 0;
  W.p.y = b.y;
  W.p.x = b.x - 0.5;
  W.p.vx = 0;
  run(W, 4, { r: true });
  assert.equal(b.mode, 'slide');
  assert.ok(Math.abs(b.vx) > 8);
  // y se lleva puesto lo que está en el camino
  W.ents.push({ id: 99, kind: 'walker', x: b.x + Math.sign(b.vx) * 4, y: b.y, w: 0.8, h: 0.75, vx: 0, vy: 0, t: 0, dead: false, face: -1 });
  W.p.x = 0.5;
  W.p.inv = 5;
  run(W, 120);
  assert.ok(W.kills >= 1, 'el caparazón mató a otro enemigo');
});

test('el murciélago, la gelatina saltarina y la carnívora hacen lo suyo', () => {
  const B = mini(['', '', '', '', '', '', '', '', '   b']);
  const bat = ent(B, 'bat');
  const ys = [];
  run(B, 120, () => {
    ys.push(bat.y);
    return IDLE;
  });
  assert.ok(Math.max(...ys) - Math.min(...ys) > 0.8, 'vuela ondulando');
  const J = mini(['  @       j']);
  const j = ent(J, 'jumper');
  const ys2 = [];
  const x0 = j.x;
  run(J, 240, () => {
    ys2.push(j.y);
    return IDLE;
  });
  assert.ok(Math.max(...ys2) - Math.min(...ys2) > 1.5, 'salta');
  assert.ok(j.x < x0, 'hacia el jugador');
  const P = mini(['                  m']);
  const m = ent(P, 'plant');
  const states = new Set();
  run(P, 60 * 7, () => {
    states.add(m.state);
    return IDLE;
  });
  assert.deepEqual([...states].sort(), ['down', 'rise', 'sink', 'up']);
  // asomada, lastima
  m.state = 'up';
  m.ph = 1;
  m.timer = 5;
  P.p.x = m.x;
  P.p.y = m.y0;
  P.p.inv = 0;
  run(P, 3);
  assert.equal(P.p.hp, CHARS.capi.hp - 1);
});

test('el cañón dispara balas que se pueden aplastar', () => {
  const W = mini(['  @      n']);
  settle(W);
  const ev = run(W, 60 * 4);
  assert.ok(names(ev).has('shoot'), 'disparó');
  assert.ok(ents(W, 'bullet').length >= 1 || W.hits >= 1);
  const b = { id: 90, kind: 'bullet', x: W.p.x + 0.2, y: W.p.y - 3, w: 0.7, h: 0.55, vx: 0, vy: 0, t: 0, dead: false, face: -1 };
  W.ents = [b];
  W.p.inv = 0;
  W.p.vy = 5;
  W.p.y = b.y - 0.5;
  W.p.hp = 3;
  run(W, 10);
  assert.equal(ents(W, 'bullet').length, 0, 'la bala se aplasta');
  assert.equal(W.p.hp, 3);
});

test('el aplastador cae cuando se pasa por debajo y vuelve a subir', () => {
  const W = mini(['', '', '', '', '', '', '', '', '', ''], { w: 40 });
  W.ents.push({ id: 50, kind: 'thwomp', x: 8.8, y: 3 + 1.6, y0: 3 + 1.6, w: 1.6, h: 1.6, vx: 0, vy: 0, t: 0, dead: false, face: 1, state: 'wait', timer: 0 });
  const t = ent(W, 'thwomp');
  W.p.x = 10.1; // dentro del rango pero fuera de la caja (|dx| = 1.3)
  W.p.y = GROUND;
  const states = [];
  const ev = run(W, 60 * 5, () => {
    if (!states.length || states[states.length - 1] !== t.state) states.push(t.state);
    return IDLE;
  });
  assert.deepEqual(states.slice(0, 5), ['wait', 'shake', 'fall', 'rest', 'rise']);
  assert.ok(names(ev).has('thud'));
  assert.equal(W.p.hp, CHARS.capi.hp, 'el jugador se salvó');
  // si cae encima, lastima
  t.state = 'wait';
  t.y = t.y0;
  W.p.x = 8.8;
  W.p.inv = 0;
  run(W, 120);
  assert.ok(W.hits >= 1, 'lo aplastó');
});

test('la barra de fuego gira y quema', () => {
  const W = mini([], { w: 40 });
  W.ents.push({ id: 70, kind: 'firebar', x: 10.5, y: 5.5, w: 0.4, h: 0.4, vx: 0, vy: 0, t: 0, dead: false, face: 1, ang: 0, spin: 2.1, len: 3.3 });
  const f = ent(W, 'firebar');
  const a0 = f.ang;
  run(W, 60);
  assert.ok(Math.abs(f.ang - a0 - 2.1) < 0.05, 'gira 2,1 rad por segundo');
  // un punto de la barra: lastima
  W.p.inv = 0;
  W.p.x = f.x + Math.cos(f.ang) * 3 * 0.55;
  W.p.y = f.y + Math.sin(f.ang) * 3 * 0.55 + 0.5;
  W.p.vy = 0;
  run(W, 1);
  assert.equal(W.p.hp, CHARS.capi.hp - 1);
});

test('las púas lastiman (menos al tatú), la lava rebota quemando y los fosos cuestan un corazón', () => {
  const spikes = (char) => {
    const W = mini(['  @       ^'], { char });
    settle(W);
    run(W, 200, { r: true });
    return W;
  };
  assert.equal(spikes('capi').p.hp, CHARS.capi.hp - 1);
  assert.equal(spikes('tatu').p.hp, CHARS.tatu.hp);
  // púas de techo
  const C = mini(['', '', '  v', '', '  @']);
  settle(C);
  const hp = C.p.hp;
  run(C, 40, { u: true });
  assert.equal(C.p.hp, hp - 1, 'las púas del techo pinchan al saltar');
  // lava
  const L = mini(['  @']);
  for (let x = 6; x < 12; x++) {
    L.tiles[GROUND * L.w + x] = T.LAVA;
    L.tiles[(GROUND + 1) * L.w + x] = T.LAVA;
  }
  settle(L);
  const ev = [];
  let guard = 0;
  while (L.hits === 0 && guard++ < 400) ev.push(...run(L, 1, { r: true }));
  assert.ok(names(ev).has('burn'), 'se quemó');
  assert.equal(L.p.hp, CHARS.capi.hp - 1);
  assert.ok(L.p.vy < -5, 'y rebota hacia arriba');
  // foso: un corazón menos y vuelve al último piso firme
  const P = mini(['  @']);
  carve(P, 8, 30);
  settle(P);
  guard = 0;
  while (P.hits === 0 && guard++ < 600) run(P, 1, { r: true });
  assert.equal(P.p.hp, CHARS.capi.hp - 1, 'caerse cuesta un corazón');
  assert.ok(P.p.x < 9 && Math.abs(P.p.y - GROUND) < 0.2, `vuelve al último piso firme (x=${P.p.x.toFixed(1)}, y=${P.p.y.toFixed(1)})`);
  assert.equal(P.state, 'play');
  assert.ok(P.p.inv > 1);
});

// ------------------------------------------------------------------ habilidades
test('cada personaje tiene su habilidad, y las cifras distintas', () => {
  assert.equal(CHAR_IDS.length, 8);
  const abilities = CHAR_IDS.map((id) => CHARS[id].ability);
  assert.equal(new Set(abilities).size, 8, 'ocho habilidades distintas');
  assert.equal(CHARS.capi.hp, 3);
  for (const id of CHAR_IDS.filter((i) => i !== 'capi')) assert.equal(CHARS[id].hp, 2);
  assert.ok(CHARS.lola.jump > 1.1 && CHARS.rulo.speed > 1.1 && CHARS.tatu.speed < 1);
  for (const id of CHAR_IDS) {
    assert.ok(TXT['a_' + CHARS[id].ability] && TXT['a_' + CHARS[id].ability + 'T'], `texto de ${id}`);
    assert.ok(/^#[0-9a-f]{6}$/i.test(CHAR_COLOR(id)));
  }
});

test('Lola salta más alto y Rulo corre más rápido', () => {
  assert.ok(apex('lola', 80) > apex('capi', 80) * 1.25, `${apex('lola', 80)} vs ${apex('capi', 80)}`);
  const speed = (char) => {
    const W = mini(['  @'], { char });
    settle(W);
    run(W, 40, { r: true });
    return W.p.vx;
  };
  assert.ok(speed('rulo') > speed('capi') * 1.15);
  assert.ok(speed('tatu') < speed('capi'));
});

test('Tuco planea manteniendo el salto en el aire', () => {
  const fall = (char) => {
    const W = mini(['', '', '', '', '', '', '', '  @'], { char });
    W.p.y = 2;
    let vmax = 0;
    run(W, 60, () => {
      vmax = Math.max(vmax, W.p.vy);
      return { u: true };
    });
    return vmax;
  };
  assert.ok(fall('tuco') <= PH.glideFall + 0.01, `velocidad de caída ${fall('tuco')}`);
  assert.ok(fall('capi') > 10);
});

test('Lana escupe semillas que matan enemigos y mantiene el poder aunque la lastimen', () => {
  const W = mini(['  @     w'], { char: 'lana' });
  assert.equal(W.p.power, 1, 'ya empieza con el poder');
  settle(W);
  const w = ent(W, 'walker');
  w.vx = 0;
  const ev = run(W, 60, (f) => ({ a: f % 20 === 0 }));
  assert.ok(names(ev).has('spit'));
  assert.equal(W.kills, 1, 'la semilla mató al bichito');
  assert.equal(W.p.hp, CHARS.lana.hp);
  W.p.inv = 0;
  W.ents.push({ id: 80, kind: 'walker', x: W.p.x + 0.4, y: W.p.y, w: 0.8, h: 0.75, vx: 0, vy: 0, t: 0, dead: false, face: -1 });
  run(W, 3);
  assert.equal(W.p.hp, CHARS.lana.hp - 1);
  assert.equal(W.p.power, 1, 'sigue pudiendo escupir');
  // los demás, sin flor, no escupen
  const C = mini(['  @'], { char: 'capi' });
  settle(C);
  assert.ok(!names(run(C, 30, { a: true })).has('spit'));
});

test('Brava se agarra de las paredes y salta desde ellas', () => {
  const wall = ['', '', '', '', '        #', '        #', '        #', '        #', '        #', '    @   #'];
  const grab = (char) => {
    const W = mini(wall, { char });
    settle(W);
    W.p.x = 7.69;
    W.p.y = 7;
    W.p.vy = 1;
    W.p.vx = 0;
    W.p.grounded = false;
    W.p.coyote = 0; // venía cayendo desde antes
    run(W, 2, { r: true });
    return W;
  };
  assert.equal(grab('capi').p.wall, 0, 'sin garra no se agarra');
  const W = grab('brava');
  assert.equal(W.p.wall, 1, 'se agarra de la pared derecha');
  assert.ok(W.p.vy <= PH.slide + 0.01, 'resbala despacio');
  run(W, 1, { r: true, u: true });
  assert.ok(W.p.vy < -10, 'salta');
  assert.ok(W.p.vx < -5, 'y sale despedida de la pared');
});

test('Yaca hace pisotón: rompe ladrillos y aturde lo que tiene cerca', () => {
  const W = mini(['', '', '', '', '', '', '', ''], { char: 'yaca' });
  W.tiles[GROUND * W.w + 6] = T.BRICK;
  W.p.x = 6.5;
  W.p.y = 3;
  W.p.vy = 2;
  W.ents.push({ id: 60, kind: 'walker', x: 8, y: GROUND, w: 0.8, h: 0.75, vx: 0, vy: 0, t: 0, dead: false, face: -1 });
  W.ents.push({ id: 61, kind: 'erizo', x: 4.5, y: GROUND, w: 0.85, h: 0.75, vx: 0, vy: 0, t: 0, dead: false, face: -1 });
  const ev = run(W, 120, (f) => ({ d: f === 3 }));
  assert.ok(names(ev).has('pound'));
  assert.ok(names(ev).has('pound-land'));
  assert.equal(W.kills, 2, 'el pisotón mató a los dos que tenía cerca (también al erizo)');
  assert.equal(tileAt(W, 6, GROUND), T.AIR, 'rompió el ladrillo de abajo');
  // los demás no pueden
  const C = mini(['', '', '', '', '', '', '', ' @'], { char: 'capi' });
  C.p.y = 3;
  assert.ok(!names(run(C, 30, (f) => ({ d: f === 3 }))).has('pound'));
});

// ------------------------------------------------------------------ jefes
test('el jefe tiene la vida del nivel, se lastima pisándolo y deja aparecer la salida al caer', () => {
  for (const id of ['w1-3', 'w2-3', 'w3-3', 'w4-3']) {
    const L = levelById(id);
    const W = load(L, 'capi');
    W.p.inv = 1e9; // que el combate no lo moleste
    const b = W.boss;
    assert.ok(b, `${id}: hay jefe`);
    assert.equal(b.hp, L.bossHp || 4);
    assert.equal(b.type, L.boss);
    const gx = Math.floor(W.goal.x);
    assert.equal(tileAt(W, gx, 8), T.AIR, `${id}: la salida está escondida`);
    run(W, 2); // el volador se acomoda a su altura
    const stomp = () => {
      W.p.x = b.x;
      W.p.y = b.y - b.h + 0.15;
      W.p.vy = 8;
      return run(W, 3);
    };
    const hp0 = L.bossHp || 4;
    assert.ok(names(stomp()).has('boss-hit'), `${id}: lo lastimó`);
    assert.equal(b.hp, hp0 - 1);
    assert.ok(b.hurt > 0.5, 'queda aturdido un rato');
    stomp();
    assert.equal(b.hp, hp0 - 1, `${id}: durante el aturdimiento no recibe otro golpe`);
    // muere
    b.hp = 0.5;
    b.hurt = 0;
    assert.ok(names(stomp()).has('boss-dead'));
    assert.equal(b.mode, 'dying');
    run(W, 120);
    assert.equal(W.bossDown, true);
    assert.equal(tileAt(W, gx, 8), T.GOAL, `${id}: aparece la salida`);
    assert.equal(W.ents.some((e) => e.kind === 'boss'), false);
  }
});

test('los tres comportamientos de jefe: embiste, salta con onda de choque y vuela soltando bombas', () => {
  const arena = (id) => {
    const L = levelById(id);
    const W = load(L, 'capi');
    W.p.x = L.arena[0] + 3;
    W.p.y = GROUND;
    W.p.inv = 1e9; // que no moleste el combate
    return W;
  };
  // embestidor
  const C = arena('w1-3');
  const modes = new Set();
  run(C, 60 * 8, () => {
    modes.add(C.boss.mode);
    return IDLE;
  });
  for (const m of ['idle', 'wind', 'charge', 'stun']) assert.ok(modes.has(m), `embestidor: ${m}`);
  // saltador
  const J = arena('w2-3');
  const jm = new Set();
  let waves = 0;
  run(J, 60 * 10, () => {
    jm.add(J.boss.mode);
    waves = Math.max(waves, ents(J, 'wave').length);
    return IDLE;
  });
  assert.ok(jm.has('air') && jm.has('idle'));
  assert.ok(waves >= 2, 'onda de choque al caer');
  // volador
  const F = arena('w3-3');
  let bombs = 0;
  const ev = run(F, 60 * 6, () => {
    bombs = Math.max(bombs, ents(F, 'bomb').length);
    return IDLE;
  });
  assert.ok(bombs >= 1, 'suelta bombas');
  assert.ok(names(ev).has('boom') || names(ev).has('shoot'));
  // el Rey Tuerca aguanta más
  assert.ok(levelById('w4-3').bossHp > 4);
});

test('el pisotón de Yaca le saca doble vida al jefe', () => {
  const W = load(levelById('w1-3'), 'yaca');
  W.p.inv = 1e9;
  const b = W.boss;
  const hp = b.hp;
  W.p.x = b.x;
  W.p.y = b.y - b.h + 0.15;
  W.p.vy = 8;
  W.p.pound = 1;
  run(W, 3);
  assert.equal(b.hp, hp - 2);
});

// ------------------------------------------------------------------ dibujo
/** Un contexto 2D de mentira: anota las llamadas y deja guardar propiedades. */
function fakeCtx() {
  const calls = [];
  const props = {};
  const g = new Proxy(props, {
    get(t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k === 'measureText') return () => ({ width: 10 });
      if (k in t) return t[k];
      return (...a) => {
        calls.push([k, ...a]);
      };
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
  return { g, calls };
}

test('todos los sprites se dibujan sin errores, con números válidos y save/restore balanceados', () => {
  const check = (calls, what) => {
    const s = calls.filter((c) => c[0] === 'save').length;
    const r = calls.filter((c) => c[0] === 'restore').length;
    assert.equal(s, r, `${what}: save/restore balanceados (${s}/${r})`);
    for (const c of calls) for (const a of c.slice(1)) if (typeof a === 'number') assert.ok(Number.isFinite(a), `${what}: número inválido en ${c[0]}`);
  };
  for (const id of CHAR_IDS) {
    for (const anim of ['idle', 'run', 'jump', 'fall', 'hurt', 'pound', 'wall', 'dead']) {
      for (const extra of [{}, { power: 1, star: 3, glide: 1, squash: 0.6, blink: 1 }]) {
        const { g, calls } = fakeCtx();
        drawChar(g, id, { face: -1, anim, t: 0.37, ...extra });
        assert.ok(calls.length > 20, `${id}/${anim} dibuja algo`);
        check(calls, `${id}/${anim}`);
      }
    }
  }
  const kinds = [
    ['walker', {}], ['erizo', {}], ['beetle', { mode: 'walk' }], ['beetle', { mode: 'shell' }], ['beetle', { mode: 'slide' }], ['bat', {}], ['jumper', { vy: -3 }], ['jumper', { grounded: true }],
    ['plant', { ph: 0.6, w: 0.7, h: 1 }], ['cannon', { dir: 1 }], ['cannon', { dir: -1, fire: 0.1 }], ['bullet', { vx: 6 }], ['thwomp', { state: 'wait' }], ['thwomp', { state: 'fall' }], ['thwomp', { state: 'rest' }],
    ['plat', { w: 3, h: 0.5 }], ['plat', { w: 2.6, h: 0.5, falling: true, state: 'shake' }], ['item', { item: 'fruit' }], ['item', { item: 'flower' }], ['item', { item: 'chili' }], ['item', { item: 'life' }],
    ['spit', {}], ['wave', {}], ['bomb', {}], ['firebar', { ang: 0.7, len: 3.3 }],
  ];
  for (const [kind, extra] of kinds) {
    const { g, calls } = fakeCtx();
    drawEnt(g, { kind, x: 0, y: 0, w: 0.8, h: 0.8, vx: 1, vy: 0, t: 0.4, face: 1, ...extra }, 0.4);
    assert.ok(calls.length > 3, `${kind} dibuja algo`);
    check(calls, kind);
  }
  for (const skin of ['beetle', 'mole', 'bird', 'king']) {
    for (const mode of ['idle', 'wind', 'charge', 'stun', 'air', 'dying']) {
      const { g, calls } = fakeCtx();
      drawBoss(g, { x: 0, y: 0, w: 1.9, h: 1.7, t: 0.8, hp: 3, hpMax: 4, hurt: 0.5, mode, face: 1, timer: 1, vx: 3, vy: 0, type: 'charger' }, skin, 0.3);
      assert.ok(calls.length > 20, `${skin}/${mode} dibuja algo`);
      check(calls, `${skin}/${mode}`);
    }
  }
  const { g, calls } = fakeCtx();
  heartPath(g, 1, 2, 3);
  assert.ok(calls.length >= 3);
});

// ------------------------------------------------------------------ textos, páginas y metadatos
test('los textos están completos en español e inglés, con los mismos marcadores, y todos se usan', () => {
  const html = read('index.html');
  const js = read('game.js');
  for (const [k, v] of Object.entries(TXT)) {
    assert.ok(typeof v.es === 'string' && v.es.trim(), `${k}: falta el español`);
    assert.ok(typeof v.en === 'string' && v.en.trim(), `${k}: falta el inglés`);
    const marks = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
    assert.equal(marks(v.es), marks(v.en), `${k}: marcadores distintos`);
  }
  // los que se piden por nombre
  const used = new Set();
  for (const m of js.matchAll(/\bt\('(\w+)'/g)) if (!m[1].endsWith('_')) used.add(m[1]);
  for (const m of html.matchAll(/data-t="(\w+)"/g)) used.add(m[1]);
  for (const m of js.matchAll(/\['(h\w+)',\s*'/g)) used.add(m[1]);
  for (const k of used) assert.ok(TXT[k], `se pide el texto "${k}" y no existe`);
  // los que se arman con un prefijo
  for (const id of CHAR_IDS) {
    used.add('a_' + CHARS[id].ability);
    used.add('a_' + CHARS[id].ability + 'T');
  }
  const foes = js.match(/const foes = \[([^\]]+)\]/)[1].match(/'(\w+)'/g).map((s) => s.slice(1, -1));
  assert.ok(foes.length >= 9);
  for (const f of foes) {
    assert.ok(TXT['f_' + f] && TXT['f_' + f + 'T'], `ayuda de ${f}`);
    used.add('f_' + f);
    used.add('f_' + f + 'T');
  }
  for (const L of LEVELS.filter((l) => l.boss)) {
    assert.ok(TXT['bossName_' + L.bossSkin], `nombre del jefe ${L.bossSkin}`);
    used.add('bossName_' + L.bossSkin);
  }
  for (const k of Object.keys(TXT)) assert.ok(used.has(k), `el texto "${k}" no se usa en ningún lado`);
});

test('los niveles, mundos y pistas tienen nombre en los dos idiomas', () => {
  for (const L of LEVELS) {
    assert.ok(L.name.es && L.name.en, L.id);
    for (const h of L.hints || []) assert.ok(h.es && h.en);
  }
  for (const w of WORLDS) assert.ok(w.name.es && w.name.en && w.blurb.es && w.blurb.en);
});

test('la página trae todo lo que usa game.js y respeta las reglas del portal', () => {
  const html = read('index.html');
  const js = read('game.js');
  const ids = new Set([...html.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]));
  for (const m of js.matchAll(/\$\('([\w-]+)'\)/g)) assert.ok(ids.has(m[1]), `game.js pide #${m[1]} y no está en index.html`);
  for (const m of js.matchAll(/getElementById\('([\w-]+)'\)/g)) assert.ok(ids.has(m[1]), `falta #${m[1]}`);
  for (const id of ['s-title', 's-chars', 's-map', 's-help', 's-pause', 's-results', 'cv', 'hud', 'touch']) assert.ok(ids.has(id), `falta #${id}`);
  assert.ok(html.includes('/sdk/gameit.js'));
  assert.match(html, /name="viewport"/);
  assert.match(html, /\.\/style\.css/);
  assert.match(js, /G\.ready\(\)/);
  assert.match(js, /G\.gameplay\(true\)/);
  assert.match(js, /G\.onPause\(/);
  assert.match(js, /G\.onResume\(/);
  assert.match(js, /gameit:\$\{ID\}:\$\{k\}/, 'el guardado usa el prefijo del juego');
  assert.match(js, /const ID = 'brinco'/);
  for (const k of ['l', 'r', 'u', 'd', 'a']) assert.ok(html.includes(`data-k="${k}"`), `botón táctil ${k}`);
  assert.match(read('style.css'), /--top:\s*64px/, 'deja libre el borde de arriba para la barra del portal');
});

test('game.json es válido y tiene miniatura', () => {
  const g = JSON.parse(read('game.json'));
  assert.equal(g.id, 'brinco');
  assert.ok(g.title.es && g.title.en);
  assert.ok(g.description.es.length > 60 && g.description.en.length > 60);
  assert.ok(Array.isArray(g.platforms) && g.platforms.includes('desktop') && g.platforms.includes('mobile'));
  assert.ok(g.categories.length >= 2);
  assert.equal(g.sdk, true);
  assert.ok(existsSync(new URL(g.thumbnail, DIR)));
  assert.ok(existsSync(new URL(g.entry, DIR)));
  assert.deepEqual([...g.input].sort(), ['gamepad', 'keyboard', 'touch']);
});
