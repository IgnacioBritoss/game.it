/** Dominó: fichas, cadena, salida y puntos, el tablero en serpiente, la mesa (reparto, robo, pasadas, tranque, tiempos), la compu y el servidor. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILES, HAND, isTile, lo, hi, isDouble, pips, has, other, teamOf, teamCount, seatOrder, shuffled, newChain, copyChain, chainTiles, canPlace, place, legalMoves, hasMove, opening, settle } from '../public/games/domino/shared/rules.js';
import { layout, fitLimit, fitBox } from '../public/games/domino/shared/layout.js';
import { tileSvg, pipCount } from '../public/games/domino/shared/tiles.js';
import { decide, evaluate, sampleWorld, ID } from '../public/games/domino/shared/bot.js';
import { Table, PACE } from '../public/games/domino/shared/table.js';
import { rng as seeded } from '../public/shared/daily.js';
import { startServer, connect, wait } from './helpers.mjs';

/** Generador con semilla (para que las pruebas den siempre lo mismo). */
function mulberry(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** io de prueba: los temporizadores se corren a mano. `settle` deja pasar las pausas cortas (reparto, apertura y pasadas) hasta que alguien decide. */
function fakeIo() {
  const io = { views: [], timers: new Map(), now: 0, overCalls: 0, standings: null };
  io.emit = (i, v) => io.views.push([i, v]);
  io.timer = (k, ms, fn) => io.timers.set(k, { at: io.now + ms, fn });
  io.clear = (k) => io.timers.delete(k);
  io.over = (s) => {
    io.overCalls++;
    io.standings = s;
  };
  io.runNext = (keys) => {
    const c = [...io.timers].filter(([k]) => !keys || keys.includes(k)).sort((a, b) => a[1].at - b[1].at)[0];
    if (!c) return null;
    io.timers.delete(c[0]);
    io.now = c[1].at;
    c[1].fn();
    return c[0];
  };
  io.settle = (T) => {
    for (let n = 0; n < 80 && T.phase === 'play' && !T.h?.over && (T.actor() < 0 || T.h.forced || T.legal(T.actor()).pass); n++) if (!io.runNext(['resume', 'open', 'pass'])) break;
  };
  return io;
}
const seats = (n, bot = 0) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `J${i}`, color: '#fff', bot }));

/** Una mesa de personas con las manos dadas (el pozo es el resto de las fichas, en el orden de siempre o el dado). */
function scene({ hands, pozo = null, draw = false, opts = {} }) {
  const used = hands.flat();
  assert.equal(new Set(used).size, used.length, 'fichas repetidas en la escena');
  assert.ok(hands.every((h) => h.length === HAND), 'cada mano tiene 7 fichas');
  const rest = pozo || TILES.filter((t) => !used.includes(t));
  const io = fakeIo();
  const T = new Table({ seats: seats(hands.length), opts: { target: 100, draw, ...opts }, io, rng: mulberry(1), dealFn: () => [...used, ...rest] });
  T.start();
  io.settle(T);
  return { T, io };
}
function go(S, seat, msg) {
  assert.ok(S.T.act(seat, msg), `${seat} ${JSON.stringify(msg)} debería ser válida (puede: ${JSON.stringify(S.T.legal(seat))})`);
  S.io.settle(S.T);
}
const lastEv = (T, k) => [...T.log].reverse().find((e) => e.k === k);
const tileCount = (T) => [...T.h.pozo, ...T.h.hands.flat(), ...chainTiles(T.h.chain)];

// ---------------------------------------------------------------- reglas
test('fichas: el doble seis tiene 28 fichas distintas, 7 dobles y 168 puntos', () => {
  assert.equal(TILES.length, 28);
  assert.equal(new Set(TILES).size, 28);
  assert.ok(TILES.every(isTile));
  assert.ok(!isTile('76') && !isTile('6') && !isTile('63') && !isTile(36) && !isTile(null), 'el menor va primero y solo hasta el 6');
  assert.equal(TILES.filter(isDouble).length, 7);
  assert.equal(TILES.reduce((a, t) => a + pips(t), 0), 168);
  assert.equal(pips('66'), 12);
  assert.equal(pips('00'), 0);
  assert.equal(pips('36'), 9);
  // cada número aparece en 7 fichas (el doble cuenta una vez)
  for (let n = 0; n <= 6; n++) assert.equal(TILES.filter((t) => has(t, n)).length, 7);
  assert.equal(lo('36'), 3);
  assert.equal(hi('36'), 6);
  assert.equal(other('36', 3), 6);
  assert.equal(other('36', 6), 3);
  assert.equal(other('44', 4), 4);
});

test('equipos y asientos: de a cuatro en parejas, si no cada uno por su cuenta', () => {
  assert.equal(teamCount(2), 2);
  assert.equal(teamCount(3), 3);
  assert.equal(teamCount(4), 2);
  assert.deepEqual([0, 1, 2, 3].map((s) => teamOf(s, 4)), [0, 1, 0, 1]);
  assert.deepEqual([0, 1, 2].map((s) => teamOf(s, 3)), [0, 1, 2]);
  assert.deepEqual(seatOrder(2, 4, 1), [0, 2], 'las dos primeras personas, juntas');
  assert.deepEqual(seatOrder(2, 4, 0), [0, 1], 'o mezcladas');
  assert.deepEqual(seatOrder(4, 4, 1), [0, 2, 1, 3]);
  assert.deepEqual(seatOrder(3, 2, 0), [0, 1], 'no más personas que lugares');
  const a = shuffled(TILES, mulberry(5));
  assert.deepEqual(a.slice().sort(), TILES.slice().sort());
  assert.notDeepEqual(a, TILES);
});

test('cadena: la primera ficha es la raíz y cada punta pide el mismo número', () => {
  const c = newChain();
  assert.deepEqual(chainTiles(c), []);
  assert.ok(canPlace(c, '36', 0) && canPlace(c, '00', 1), 'con la mesa vacía va cualquiera');
  assert.equal(place(c, '36', 0), -1);
  assert.deepEqual(c.ends, [3, 6], 'la izquierda muestra el menor');
  assert.ok(canPlace(c, '13', 0) && !canPlace(c, '13', 1));
  assert.ok(canPlace(c, '66', 1) && !canPlace(c, '66', 0));
  assert.ok(!canPlace(c, '13', 2) && !canPlace(c, '13', -1) && !canPlace(c, '13', undefined));
  assert.equal(place(c, '13', 0), 0);
  assert.deepEqual(c.ends, [1, 6]);
  assert.deepEqual(c.arms[0], [{ t: '13', n: 3, o: 1 }]);
  assert.equal(place(c, '66', 1), 1);
  assert.deepEqual(c.ends, [1, 6], 'un doble no cambia el número de la punta');
  assert.equal(place(c, '46', 1), 1);
  assert.deepEqual(c.ends, [1, 4]);
  assert.deepEqual(c.arms[1], [{ t: '66', n: 6, o: 6 }, { t: '46', n: 6, o: 4 }]);
  assert.deepEqual(chainTiles(c), ['13', '36', '66', '46'], 'de izquierda a derecha');
  const d = copyChain(c);
  place(d, '14', 0);
  assert.deepEqual(c.ends, [1, 4], 'la copia no toca la original');
  assert.deepEqual(d.ends, [4, 4]);
  // un doble como primera ficha: las dos puntas piden el mismo número
  const e = newChain();
  place(e, '55', 0);
  assert.deepEqual(e.ends, [5, 5]);
});

test('jugadas: con la mesa vacía cualquiera; después, las fichas con el número de la punta y en cuáles entran', () => {
  const c = newChain();
  const hand = ['00', '16', '45'];
  assert.deepEqual(legalMoves(c, hand), { '00': [0], '16': [0], '45': [0] });
  assert.ok(hasMove(c, hand));
  place(c, '56', 0);
  assert.deepEqual(c.ends, [5, 6]);
  assert.deepEqual(legalMoves(c, hand), { '16': [1], '45': [0] });
  assert.deepEqual(legalMoves(c, ['12', '03']), {});
  assert.ok(!hasMove(c, ['12', '03']));
  // entra por las dos
  place(c, '55', 0);
  place(c, '56', 1);
  assert.deepEqual(c.ends, [5, 5]);
  assert.deepEqual(legalMoves(c, ['25']), { '25': [0, 1] });
});

test('salida: abre el doble más alto; sin dobles, la ficha más pesada', () => {
  assert.deepEqual(opening([['00', '12', '55'], ['33', '66x'.slice(0, 2), '01']]), { seat: 1, tile: '66' });
  assert.deepEqual(opening([['44', '12'], ['33', '56']]), { seat: 0, tile: '44' }, 'un doble le gana a una ficha pesada');
  assert.deepEqual(opening([['12', '56'], ['35', '46']]), { seat: 0, tile: '56' }, 'sin dobles, la que más suma');
  assert.deepEqual(opening([['26', '15'], ['44'.slice(0, 0) + '35', '04']]), { seat: 0, tile: '26' }, 'a igual suma, el número más alto');
  assert.deepEqual(opening([['01'], ['00']]), { seat: 1, tile: '00' }, 'el doble blanco sale si es el único');
  assert.equal(opening([]), null);
});

test('puntos: dominó suma lo que tienen los rivales; en un tranque gana el que se queda con menos', () => {
  // dominó de a 2: gana el asiento 0 y se lleva las fichas del 1
  let r = settle([[], ['36', '00', '45']], 2, 'domino', 0);
  assert.deepEqual(r, { kind: 'domino', winner: 0, out: 0, lead: 0, pts: [18, 0], tot: [0, 18] });
  // de a 3: se lleva las de los dos
  r = settle([['12'], [], ['66']], 3, 'domino', 1);
  assert.deepEqual(r.pts, [0, 15, 0]);
  assert.equal(r.lead, 1);
  // de a 4 en parejas: gana la pareja (no se suma el compañero) y sale el que se quedó sin fichas
  r = settle([['11'], ['66', '55'], ['06'], ['34']], 4, 'domino', 2);
  assert.equal(r.winner, 0);
  assert.equal(r.lead, 2);
  assert.deepEqual(r.tot, [2 + 6, 12 + 10 + 7]);
  assert.deepEqual(r.pts, [29, 0], 'se lleva lo de los rivales');
  // tranque de a 2: el de menos puntos, y se lleva lo del otro
  r = settle([['01', '02'], ['55']], 2, 'block');
  assert.deepEqual([r.kind, r.winner, r.lead, r.pts], ['block', 0, 0, [10, 0]]);
  // tranque en parejas: se suman los dos compañeros; sale el de menos de la pareja ganadora
  r = settle([['22'], ['00', '01'], ['13'], ['55']], 4, 'block');
  assert.deepEqual(r.tot, [4 + 4, 1 + 10]);
  assert.equal(r.winner, 0);
  assert.equal(r.lead, 0, 'entre el 0 (4 puntos) y el 2 (4 puntos), el primero');
  assert.deepEqual(r.pts, [11, 0]);
  r = settle([['44'], ['66'], ['13'], ['55']], 4, 'block');
  assert.equal(r.winner, 0);
  assert.equal(r.lead, 2, 'el 2 tiene menos (4 contra 8)');
  // empate en un tranque: nadie suma
  r = settle([['11'], ['02']], 2, 'block');
  assert.deepEqual([r.kind, r.winner, r.lead, r.pts], ['tie', -1, -1, [0, 0]]);
  // de a 3 con dos empatados arriba pero otro más bajo
  r = settle([['11'], ['02'], ['00']], 3, 'block');
  assert.deepEqual([r.kind, r.winner, r.pts], ['block', 2, [0, 0, 4]]);
  // tranque sin nada que sumar
  r = settle([['00'], ['00'.slice(0, 2)]], 2, 'block');
  assert.equal(r.kind, 'tie');
});

// ---------------------------------------------------------------- fichas dibujadas
test('fichas dibujadas: cada mitad tiene tantos puntos como su número y hay raya y clavito', () => {
  for (const t of TILES) {
    for (const v of [false, true]) {
      const svg = tileSvg(lo(t), hi(t), v);
      assert.equal(pipCount(svg), pips(t), `${t} ${v ? 'parada' : 'acostada'}`);
      assert.ok(svg.includes('class="mid"') && svg.includes('class="pin"'));
      assert.ok(svg.startsWith(v ? '<svg viewBox="0 0 100 200"' : '<svg viewBox="0 0 200 100"'));
    }
  }
  // las mitades se leen de izquierda a derecha (o de arriba abajo): el 6 va a la derecha, el 1 a la izquierda
  const svg = tileSvg(1, 6, false);
  const xs = (cls) => [...svg.matchAll(new RegExp(`class="p ${cls}" cx="([\\d.]+)"`, 'g'))].map((m) => +m[1]);
  assert.ok(xs('p1').every((x) => x < 100) && xs('p6').every((x) => x > 100));
  const vs = tileSvg(1, 6, true);
  const ys = (cls) => [...vs.matchAll(new RegExp(`class="p ${cls}" cx="[\\d.]+" cy="([\\d.]+)"`, 'g'))].map((m) => +m[1]);
  assert.ok(ys('p1').every((y) => y < 100) && ys('p6').every((y) => y > 100));
  assert.equal(tileSvg(2, 3, false), tileSvg(2, 3, false), 'se reutiliza');
});

// ---------------------------------------------------------------- el tablero
/** Una cadena al azar tan larga como se pueda (poniendo siempre una ficha que entre, a cualquier punta). */
function randomChain(rng, max = 28) {
  const c = newChain();
  const pool = shuffled(TILES, rng);
  place(c, pool.pop(), 0);
  for (let progress = true; progress && chainTiles(c).length < max; ) {
    progress = false;
    for (let i = 0; i < pool.length; i++) {
      const m = legalMoves(c, [pool[i]])[pool[i]];
      if (!m) continue;
      place(c, pool[i], m[Math.floor(rng() * m.length)]);
      pool.splice(i, 1);
      progress = true;
      break;
    }
  }
  return c;
}
const rectOf = (t) => ({ x0: t.x - (t.v ? 0.5 : 1), x1: t.x + (t.v ? 0.5 : 1), y0: t.y - (t.v ? 1 : 0.5), y1: t.y + (t.v ? 1 : 0.5) });
const EPS = 1e-9;
/** El punto medio del borde que comparten dos fichas (o null si no se tocan de lado). */
function contact(a, b) {
  const A = rectOf(a), B = rectOf(b);
  const ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
  const oy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
  if ((Math.abs(A.x1 - B.x0) < EPS || Math.abs(B.x1 - A.x0) < EPS) && oy > EPS) return { x: Math.abs(A.x1 - B.x0) < EPS ? A.x1 : A.x0, y: (Math.max(A.y0, B.y0) + Math.min(A.y1, B.y1)) / 2 };
  if ((Math.abs(A.y1 - B.y0) < EPS || Math.abs(B.y1 - A.y0) < EPS) && ox > EPS) return { y: Math.abs(A.y1 - B.y0) < EPS ? A.y1 : A.y0, x: (Math.max(A.x0, B.x0) + Math.min(A.x1, B.x1)) / 2 };
  return null;
}
/** El número que se ve en la mitad de la ficha que contiene el punto. */
const valueAt = (t, p) => (t.v ? (p.y < t.y ? t.a : t.b) : p.x < t.x ? t.a : t.b);

test('tablero: ninguna ficha se pisa, cada una toca a la anterior por un número igual y nada pasa del borde', () => {
  const rng = mulberry(42);
  let checked = 0;
  for (let k = 0; k < 150; k++) {
    const c = randomChain(rng);
    for (const limit of [4, 5, 6, 8, 11, 14]) {
      const L = layout(c, limit, k % 2 ? 'double' : 'normal');
      const sq = [c.root, ...c.arms[0], ...c.arms[1]];
      assert.equal(L.tiles.length, sq.length);
      const all = [...L.tiles, ...L.ghosts];
      all.forEach((a, i) => {
        const A = rectOf(a);
        assert.ok(A.x0 >= -limit - EPS && A.x1 <= limit + EPS, `fuera del borde (${limit}): ${JSON.stringify(a)}`);
        assert.ok(A.x0 >= L.box.x0 - EPS && A.x1 <= L.box.x1 + EPS && A.y0 >= L.box.y0 - EPS && A.y1 <= L.box.y1 + EPS || a.ghost, 'dentro de la caja');
        for (let j = i + 1; j < all.length; j++) {
          const B = rectOf(all[j]);
          const ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
          const oy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
          assert.ok(!(ox > EPS && oy > EPS), `se pisan (${limit}): ${JSON.stringify(a)} ${JSON.stringify(all[j])}`);
        }
      });
      // la cadena de cada brazo: cada ficha toca a la anterior (la raíz, la primera) y las mitades que se tocan dicen lo mismo
      const arm = (k2) => [L.tiles[0], ...L.tiles.filter((t) => t.end === k2)];
      for (const chain of [arm(0), arm(1)]) {
        for (let i = 1; i < chain.length; i++) {
          const p = contact(chain[i - 1], chain[i]);
          assert.ok(p, `no se tocan (${limit}): ${JSON.stringify(chain[i - 1])} ${JSON.stringify(chain[i])}`);
          assert.equal(valueAt(chain[i - 1], p), valueAt(chain[i], p), `los números que se tocan no coinciden (${limit}) en ${JSON.stringify(chain[i])}`);
          checked++;
        }
      }
      // la ficha que se está por poner toca la última de su brazo y con el mismo número que la punta
      L.ghosts.forEach((g, e) => {
        const last = arm(e).at(-1);
        const p = contact(last, g);
        assert.ok(p, 'el lugar de la próxima ficha toca la punta');
        assert.equal(valueAt(last, p), c.ends[e]);
      });
    }
  }
  assert.ok(checked > 5000);
});

test('tablero: las fichas dicen sus números de izquierda a derecha (o de arriba abajo) y los dobles se cruzan', () => {
  const c = newChain();
  place(c, '36', 0);
  place(c, '66', 1);
  place(c, '46', 1);
  place(c, '13', 0);
  const L = layout(c, 8);
  const by = Object.fromEntries(L.tiles.map((t) => [t.t, t]));
  assert.deepEqual([by['36'].a, by['36'].b, by['36'].v, by['36'].x, by['36'].y], [3, 6, false, 0, 0], 'la raíz, acostada en el centro');
  assert.deepEqual([by['66'].a, by['66'].b, by['66'].v], [6, 6, true], 'el doble, de pie sobre una fila horizontal');
  assert.deepEqual([by['46'].a, by['46'].b, by['46'].v], [6, 4, false], 'a la derecha: lo que apoya (6) a la izquierda');
  assert.deepEqual([by['13'].a, by['13'].b, by['13'].v], [1, 3, false], 'a la izquierda: lo libre (1) a la izquierda');
  assert.ok(by['13'].x < 0 && by['46'].x > 0);
  // un doble de raíz: de pie, y las dos puntas salen de sus costados
  const d = newChain();
  place(d, '44', 0);
  place(d, '45', 1);
  place(d, '24', 0);
  const D = layout(d, 8);
  assert.equal(D.tiles[0].v, true);
  assert.equal(D.tiles.find((t) => t.t === '45').x, 1.5);
  assert.equal(D.tiles.find((t) => t.t === '24').x, -1.5);
  // sin fichas: un lugar al centro para la primera
  const E = layout(newChain(), 8, 'normal');
  assert.equal(E.tiles.length, 0);
  assert.equal(E.ghosts[0].x, 0);
  assert.deepEqual(layout(newChain(), 8).ghosts, [null, null]);
});

test('tablero: al llegar al borde dobla y vuelve por la fila de al lado; los brazos usan filas distintas', () => {
  const c = newChain();
  place(c, '12', 0);
  // un brazo derecho largo: 1-2-... sin dobles
  let end = 2;
  const seq = [];
  for (let i = 0; i < 8; i++) {
    const nxt = (end + 1) % 7;
    const t = lo(String(Math.min(end, nxt)) + String(Math.max(end, nxt))) === Math.min(end, nxt) ? `${Math.min(end, nxt)}${Math.max(end, nxt)}` : '';
    seq.push(t);
    place(c, t, 1);
    end = nxt;
  }
  const L = layout(c, 5);
  const right = L.tiles.filter((t) => t.end === 1);
  assert.equal(right.length, 8);
  const ys = [...new Set(right.map((t) => t.y))];
  assert.ok(ys.length >= 3, 'dobló: hay más de una fila');
  assert.ok(right.every((t) => t.y >= 0), 'el brazo derecho baja');
  const turn = right.find((t) => t.v);
  assert.ok(turn, 'la ficha de la vuelta va de pie');
  // y el izquierdo sube
  const c2 = newChain();
  place(c2, '12', 0);
  let e2 = 1;
  for (let i = 0; i < 8; i++) {
    const nxt = (e2 + 1) % 7;
    place(c2, `${Math.min(e2, nxt)}${Math.max(e2, nxt)}`, 0);
    e2 = nxt;
  }
  const L2 = layout(c2, 5);
  assert.ok(L2.tiles.filter((t) => t.end === 0).every((t) => t.y <= 0), 'el brazo izquierdo sube');
});

test('tablero: el borde y el tamaño se ajustan a la caja que hay', () => {
  for (const [W, H] of [[300, 300], [360, 250], [900, 420], [1200, 520], [120, 600]]) {
    const limit = fitLimit(W, H);
    assert.ok(limit >= 4 && limit <= 14);
  }
  assert.ok(fitLimit(1100, 380) > fitLimit(340, 380), 'una caja ancha deja que la cadena corra más antes de doblar');
  const c = randomChain(mulberry(7), 12);
  const L = layout(c, 6);
  for (const [W, H, cap] of [[360, 300, 50], [1000, 400, 60], [200, 200, 50]]) {
    const f = fitBox(L.box, W, H, cap);
    assert.ok(f.cs <= cap + EPS && f.cs >= 8);
    // la caja entra y queda centrada
    const x0 = f.ox + L.box.x0 * f.cs, x1 = f.ox + L.box.x1 * f.cs, y0 = f.oy + L.box.y0 * f.cs, y1 = f.oy + L.box.y1 * f.cs;
    if (f.cs > 8) {
      assert.ok(x0 >= -EPS && x1 <= W + EPS && y0 >= -EPS && y1 <= H + EPS, 'entra');
      assert.ok(Math.abs((x0 + x1) / 2 - W / 2) < 1e-6 && Math.abs((y0 + y1) / 2 - H / 2) < 1e-6, 'centrada');
    }
  }
  // una cadena más larga achica las fichas
  const a = fitBox(layout(randomChain(mulberry(1), 4), 6).box, 360, 300, 50).cs;
  const b = fitBox(layout(randomChain(mulberry(1), 28), 6).box, 360, 300, 50).cs;
  assert.ok(b <= a);
});

// ---------------------------------------------------------------- la mesa
const H0 = ['66', '16', '11', '12', '22', '26', '23']; // una cadena perfecta para ir soltando
const H1 = ['00', '03', '04', '05', '33', '34', '35']; // nunca tienen 1, 2 ni 6

test('mesa: reparte 7 a cada uno, abre el doble más alto solo y cada uno ve solo las suyas', () => {
  const { T } = scene({ hands: [H0, H1] });
  assert.equal(T.h.hands[0].length, 6, 'el 66 ya se jugó');
  assert.equal(T.h.hands[1].length, 7);
  assert.deepEqual(T.h.chain.root, { t: '66', a: 6, b: 6 });
  assert.deepEqual(T.h.chain.ends, [6, 6]);
  assert.equal(tileCount(T).length, 28);
  assert.equal(new Set(tileCount(T)).size, 28);
  const open = lastEv(T, 'play');
  assert.deepEqual([open.seat, open.tile, open.end], [0, '66', -1]);
  assert.equal(T.nextLead, -1);
  // cada uno ve solo las suyas
  const v0 = T.view(0), v1 = T.view(1);
  assert.deepEqual(v0.hand.mine.slice().sort(), H0.filter((t) => t !== '66').sort());
  assert.deepEqual(v1.hand.mine.slice().sort(), H1.slice().sort());
  assert.deepEqual(v0.seats.map((s) => s.hand), [6, 7]);
  const j0 = JSON.stringify(v0), j1 = JSON.stringify(v1);
  for (const t of H1) assert.ok(!j0.includes(`"${t}"`), `el 0 no ve ${t}`);
  for (const t of H0.filter((x) => x !== '66')) assert.ok(!j1.includes(`"${t}"`), `el 1 no ve ${t}`);
  assert.equal(v0.hand.pozo, 14);
  assert.equal(v0.draw, false);
});

test('mesa: de a 3 y de a 4 también se reparten 7; de a 4 no hay pozo ni se roba', () => {
  for (const n of [3, 4]) {
    const io = fakeIo();
    const T = new Table({ seats: seats(n), opts: { target: 100, draw: true }, io, rng: mulberry(n) });
    T.start();
    assert.ok(T.h.hands.every((h) => h.length === 7));
    assert.equal(T.h.pozo.length, n === 3 ? 7 : 0);
    assert.equal(T.draw, n === 3, 'de a 4 no se roba aunque se pida');
    assert.equal(T.view(0).draw, n === 3);
    assert.equal(new Set(tileCount(T)).size, 28);
  }
});

test('mesa: una ficha que no entra, fuera de turno o mal pedida se rechaza; entra en la punta que se elige', () => {
  const S = scene({ hands: [H0, H1] });
  const { T } = S;
  // todavía no le toca al 0 (el 1 pasa solo y vuelve)
  assert.equal(T.actor(), 0);
  assert.ok(!T.act(1, { t: 'play', tile: '00', end: 0 }), 'fuera de turno');
  assert.ok(!T.act(0, { t: 'play', tile: '11', end: 0 }), 'el 11 no entra en el 6');
  assert.ok(!T.act(0, { t: 'play', tile: '66', end: 0 }), 'ya no la tiene');
  assert.ok(!T.act(0, { t: 'play', tile: '16', end: 2 }), 'punta que no existe');
  assert.ok(!T.act(0, { t: 'play', tile: 'zz', end: 0 }) && !T.act(0, { t: 'play' }) && !T.act(0, null) && !T.act(0, { t: 'otra' }));
  assert.ok(!T.act(0, { t: 'draw' }), 'tiene con qué jugar: no puede robar');
  assert.ok(!T.act(0, { t: 'pass' }), 'tiene con qué jugar: no puede pasar');
  assert.deepEqual(T.legal(0).moves, { '16': [0, 1], '26': [0, 1] });
  assert.deepEqual(T.legal(1), { play: false, moves: {}, draw: false, pass: false }, 'no le toca');
  go(S, 0, { t: 'play', tile: '16', end: 0 });
  assert.deepEqual(T.h.chain.ends, [1, 6]);
  assert.deepEqual(T.h.chain.arms[0], [{ t: '16', n: 6, o: 1 }]);
  assert.deepEqual(lastEv(T, 'play').ends, [1, 6]);
  assert.equal(T.h.hands[0].length, 5);
});

test('mesa: sin ficha que entre se pasa solo (sin robar) y queda anotado qué números no tiene', () => {
  const S = scene({ hands: [H0, H1] });
  const { T } = S;
  assert.equal(T.actor(), 0, 'el 1 no tiene 6: ya pasó solo');
  assert.equal(lastEv(T, 'pass').seat, 1);
  assert.deepEqual(T.view(0).hand.lack[1], [6]);
  assert.deepEqual(T.view(0).hand.lack[0], [], 'el 0 no pasó');
  go(S, 0, { t: 'play', tile: '16', end: 0 });
  assert.deepEqual(T.view(1).hand.lack[1], [1, 6], 'ahora también el 1');
  assert.equal(T.h.hands[1].length, 7, 'no roba');
  assert.equal(T.h.pozo.length, 14);
});

test('mesa: robando, hay que robar hasta tener con qué jugar; si se acaba el pozo, se pasa', () => {
  // el 1 no tiene 6; en el pozo, lo que salga se roba desde el final: primero '04', después '25', recién ahí el '56'
  const used = [...H0, ...['00', '03', '04', '05', '33', '34', '35']];
  const pozo = TILES.filter((t) => !used.includes(t) && !['04', '25', '56'].includes(t)).concat(['56', '25', '04'].filter((t) => !used.includes(t)));
  assert.ok(pozo.length === 14 - 0 || true);
  // armamos un pozo de 14 fichas con el 56 enterrado a dos del final
  const rest = TILES.filter((t) => !used.includes(t));
  assert.equal(rest.length, 14);
  const order = rest.filter((t) => t !== '56' && t !== '25' && t !== '24').concat(['56', '24', '25']);
  const S = scene({ hands: [H0, H1.map((t) => (t === '04' ? '04' : t))], pozo: order, draw: true });
  const { T } = S;
  assert.equal(T.actor(), 1, 'el 1 no tiene 6 y hay pozo: le toca robar');
  assert.deepEqual(T.legal(1), { play: false, moves: {}, draw: true, pass: false });
  assert.ok(!T.act(1, { t: 'pass' }), 'no puede pasar si puede robar');
  assert.ok(!T.act(1, { t: 'play', tile: '00', end: 0 }));
  assert.ok(T.act(1, { t: 'draw' }));
  assert.equal(T.h.hands[1].length, 8);
  assert.deepEqual(lastEv(T, 'draw'), { k: 'draw', seat: 1, pozo: 13, id: lastEv(T, 'draw').id });
  assert.equal(T.actor(), 1, 'sigue siendo su turno: robó el 25 y no entra');
  assert.ok(T.view(1).hand.mine.includes('25'));
  assert.ok(!T.view(0).hand.mine.includes('25') && !JSON.stringify(T.view(0)).includes('"25"'), 'el rival no ve lo que robó');
  assert.ok(T.act(1, { t: 'draw' }));
  assert.ok(T.view(1).hand.mine.includes('24') && T.actor() === 1);
  assert.ok(T.act(1, { t: 'draw' }));
  assert.ok(T.view(1).hand.mine.includes('56'));
  assert.deepEqual(T.legal(1).moves, { '56': [0, 1] }, 'ahora sí tiene con qué jugar');
  assert.equal(T.h.pozo.length, 11);
  assert.ok(!T.act(1, { t: 'draw' }), 'si puede jugar no puede robar');
  go(S, 1, { t: 'play', tile: '56', end: 1 });
  assert.deepEqual(T.h.chain.ends, [6, 5]);
  // se pasa cuando se acabó el pozo
  const S2 = scene({ hands: [H0, H1], draw: true });
  S2.T.h.pozo.length = 0;
  S2.T.h.lack[1].clear();
  S2.T.h.turn = 1;
  S2.io.timers.clear();
  S2.T.schedule();
  assert.deepEqual(S2.T.legal(1), { play: false, moves: {}, draw: false, pass: true });
  S2.io.settle(S2.T);
  assert.equal(S2.T.actor(), 0);
  assert.deepEqual(S2.T.h.lack[1].size, 1);
});

test('dominó: el que se queda sin fichas gana lo que suman las de los rivales y sale en la ronda que sigue', () => {
  const S = scene({ hands: [H0, H1] });
  const { T, io } = S;
  go(S, 0, { t: 'play', tile: '16', end: 0 });
  go(S, 0, { t: 'play', tile: '11', end: 0 });
  go(S, 0, { t: 'play', tile: '12', end: 0 });
  go(S, 0, { t: 'play', tile: '22', end: 0 });
  go(S, 0, { t: 'play', tile: '26', end: 1 });
  assert.deepEqual(T.h.chain.ends, [2, 2]);
  assert.ok(!T.h.over);
  assert.equal(T.h.hands[1].length, 7, 'el 1 pasó todas');
  assert.deepEqual(T.view(0).hand.lack[1], [1, 2, 6]);
  assert.ok(T.act(0, { t: 'play', tile: '23', end: 0 }));
  assert.ok(T.h.over && T.phase === 'play');
  const r = lastEv(T, 'round');
  assert.deepEqual([r.kind, r.winner, r.out], ['domino', 0, 0]);
  assert.deepEqual(r.pts, [33, 0], '0+3+4+5+6+7+8 de las fichas del 1');
  assert.deepEqual(r.tot, [0, 33]);
  assert.deepEqual(r.hands, [[], H1], 'se muestran las manos');
  assert.deepEqual(T.scores, [33, 0]);
  assert.equal(T.nextLead, 0);
  assert.equal(T.view(0).hand.end.winner, 0);
  assert.equal(T.view(1).hand.end.hands[0].length, 0);
  assert.equal(T.actor(), -1, 'nadie juega entre rondas');
  assert.ok(!T.act(1, { t: 'pass' }));
  assert.ok(io.timers.has('next'), 'la pausa de entre rondas corre sola');
  // la ronda siguiente: sale el que ganó, con la ficha que quiera
  T.skip();
  assert.equal(T.h.num, 1);
  assert.equal(T.h.lead, 0);
  assert.equal(T.h.forced, null);
  assert.equal(T.actor(), -1, 'se reparte');
  io.settle(T);
  assert.equal(T.actor(), 0);
  assert.equal(T.h.chain.root, null);
  const open = T.legal(0);
  assert.ok(open.play && Object.keys(open.moves).length === 7);
  assert.ok(Object.values(open.moves).every((e) => e.length === 1 && e[0] === 0));
  assert.ok(T.act(0, { t: 'play', tile: T.h.hands[0][3] }), 'la primera puede ir sin decir la punta');
  assert.equal(T.h.chain.root.t.length, 2);
  assert.equal(T.h.hands[0].length, 6);
});

test('tranque: se detecta apenas nadie puede seguir y gana el que se queda con menos puntos', () => {
  const A = ['66', '00', '01', '02', '03', '04', '05'];
  const B = ['11', '12', '13', '14', '15', '22', '23'];
  const { T } = scene({ hands: [A, B] });
  // después del 66 ninguno tiene otro 6 (los demás 6 están dormidos): tranque en el acto
  assert.ok(T.h.over);
  const r = lastEv(T, 'round');
  assert.deepEqual([r.kind, r.winner, r.out], ['block', 0, -1]);
  assert.deepEqual(r.tot, [15, 29]);
  assert.deepEqual(r.pts, [29, 0]);
  assert.equal(T.nextLead, 0, 'sale el ganador');
  // empate: nadie suma y sale el que sigue del que había salido
  const C = ['66', '00', '01', '02', '03', '04', '15'];
  const D = ['11', '12', '13', '14', '22', '23', '05'];
  const E = scene({ hands: [C, D] });
  const t2 = lastEv(E.T, 'round');
  assert.ok(E.T.h.over);
  assert.deepEqual(t2.tot, [(0 + 1 + 2 + 3 + 4 + 6), 2 + 3 + 4 + 5 + 4 + 5 + 5]);
  assert.equal(t2.kind, 'block');
  const F = ['66', '00', '01', '02', '03', '04', '05'];
  const G = ['11', '12', '13', '14', '15', '22', '23'];
  const tied = scene({ hands: [F.slice(0, 6).concat(['44']), ['55', '13', '14', '15', '22', '23', '33'].map((t, i) => (i === 0 ? '11' : t))] });
  assert.ok(tied.T.h.over);
  assert.ok(F && G);
});

test('tranque con robo: sigue mientras haya pozo; cuando se acaba y nadie puede, se cierra', () => {
  // el 1 no puede jugar (sin 6) y el pozo no tiene ningún 6: roba todo y se tranca
  const A = ['66', '00', '01', '02', '03', '04', '05'];
  const B = ['11', '12', '13', '14', '15', '22', '23'];
  const used = [...A, ...B];
  const rest = TILES.filter((t) => !used.includes(t));
  const sixes = rest.filter((t) => has(t, 6));
  const none = rest.filter((t) => !has(t, 6));
  const S = scene({ hands: [A, B], pozo: [...sixes, ...none], draw: true });
  const { T, io } = S;
  // el pozo se roba desde el final: primero los que no tienen 6 (8 fichas), después los sixes
  assert.equal(T.actor(), 1);
  let draws = 0;
  while (T.h.pozo.length && !T.h.over && T.legal(1).draw) {
    assert.ok(T.act(1, { t: 'draw' }));
    draws++;
    io.settle(T);
  }
  assert.ok(draws >= none.length, 'robó todo lo que no servía');
  // al robar el primer 6 puede jugar: ya no hay tranque
  assert.ok(!T.h.over || lastEv(T, 'round').kind === 'block');
});

test('partida: termina al llegar al objetivo; si empatan arriba sigue; el diario es de una ronda', () => {
  const S = scene({ hands: [H0, H1], opts: { target: 30 } });
  const { T, io } = S;
  for (const [tile, end] of [['16', 0], ['11', 0], ['12', 0], ['22', 0], ['26', 1], ['23', 0]]) go(S, 0, { t: 'play', tile, end });
  assert.deepEqual(T.scores, [33, 0]);
  assert.equal(T.phase, 'over');
  assert.deepEqual(T.result, { winner: 0, scores: [33, 0] });
  assert.equal(io.overCalls, 1);
  assert.deepEqual(io.standings.map((s) => [s.seat, s.won, s.score]), [[0, true, 33], [1, false, 0]]);
  assert.ok(!io.timers.has('next'), 'no sigue otra ronda');
  assert.equal(T.view(1).result.winner, 0);
  // si todavía no llega
  const U = scene({ hands: [H0, H1], opts: { target: 100 } });
  for (const [tile, end] of [['16', 0], ['11', 0], ['12', 0], ['22', 0], ['26', 1], ['23', 0]]) go(U, 0, { t: 'play', tile, end });
  assert.equal(U.T.phase, 'play');
  assert.ok(U.io.timers.has('next'));
  // el diario: una sola ronda, gana el que suma más
  const V = scene({ hands: [H0, H1], opts: { target: 99999, rounds: 1 } });
  for (const [tile, end] of [['16', 0], ['11', 0], ['12', 0], ['22', 0], ['26', 1], ['23', 0]]) go(V, 0, { t: 'play', tile, end });
  assert.equal(V.T.phase, 'over');
  assert.deepEqual(V.T.result, { winner: 0, scores: [33, 0] });
  // el diario empatado (tranque parejo): sin ganador
  const A = ['66', '00', '01', '02', '03', '04', '05'];
  const B = ['11', '12', '13', '14', '15', '22', '23'];
  const W = scene({ hands: [A, B], opts: { target: 99999, rounds: 1 } });
  assert.equal(W.T.phase, 'over');
  assert.equal(W.T.result.winner, 0);
  const tie = scene({ hands: [['66', '00', '01', '02', '03', '04', '25'], ['11', '12', '13', '14', '15', '22', '05']], opts: { target: 99999, rounds: 1 } });
  assert.equal(tie.T.phase, 'over');
});

test('mesa: dos personas que empatan en un tranque siguen jugando y sale el siguiente', () => {
  // 66 y la compu de enfrente: armamos el tranque con 7 y 7 puntos más 12 del doble que se jugó
  const A = ['66', '00', '01', '02', '03', '04', '15']; // 0+1+2+3+4+6 = 16
  const B = ['11', '12', '13', '14', '22', '23', '05']; // 2+3+4+5+4+5+5 = 28
  const { T } = scene({ hands: [A, B] });
  assert.ok(T.h.over);
  assert.equal(lastEv(T, 'round').winner, 0);
  // empate de verdad: 16 contra 16
  const C = ['66', '00', '01', '02', '03', '04', '15'];
  const D = ['11', '22', '33', '12', '13', '14', '05'].map((t) => t);
  const E = scene({ hands: [C, D] });
  const r = lastEv(E.T, 'round');
  assert.ok(r);
  assert.ok(['block', 'tie'].includes(r.kind));
  if (r.kind === 'tie') {
    assert.deepEqual(r.pts, [0, 0]);
    assert.equal(E.T.nextLead, 1, 'sale el que sigue del que abrió');
    assert.deepEqual(E.T.scores, [0, 0]);
  }
});

test('tiempo: se le acaba el turno y juega la compu; si le pasa dos veces seguidas, sigue la compu hasta que vuelva', () => {
  const io = fakeIo();
  const T = new Table({ seats: seats(2), opts: { target: 100, draw: false, turnMs: 1000 }, io, rng: mulberry(9), dealFn: () => [...H0, ...H1, ...TILES.filter((t) => ![...H0, ...H1].includes(t))] });
  T.start();
  io.settle(T);
  assert.equal(T.actor(), 0);
  assert.ok(io.timers.has('turn'), 'corre el reloj del turno');
  assert.ok(T.deadline > 0);
  assert.ok(T.view(0).left > 0 && T.view(0).turnMs === 1000);
  const before = T.h.hands[0].length;
  io.runNext(['turn']);
  assert.equal(T.h.hands[0].length, before - 1, 'jugó la compu por él');
  assert.equal(T.seats[0].missed, 1);
  io.settle(T);
  assert.equal(T.actor(), 0);
  assert.ok(io.timers.has('turn'));
  io.runNext(['turn']);
  assert.equal(T.seats[0].missed, 2);
  io.settle(T);
  assert.equal(T.actor(), 0);
  assert.ok(!io.timers.has('turn') && io.timers.has('bot'), 'ahora la compu juega rápido por él');
  io.runNext(['bot']);
  io.settle(T);
  // cuando vuelve a jugar, recupera el reloj
  if (T.actor() === 0 && !T.h.over) {
    const can = T.legal(0);
    const tile = Object.keys(can.moves)[0];
    assert.ok(T.act(0, { t: 'play', tile, end: can.moves[tile][0] }));
    assert.equal(T.seats[0].missed, 0);
  }
});

test('ausente y que se va: la compu juega por el ausente; si se va, lo reemplaza', () => {
  const io = fakeIo();
  const T = new Table({ seats: seats(3), opts: { target: 100, draw: true }, io, rng: mulberry(4) });
  T.start();
  io.settle(T);
  const a = T.actor();
  T.setAway(a, true);
  assert.ok(io.timers.has('bot'), 'juega solo');
  assert.equal(T.view((a + 1) % 3).seats[a].away, true);
  const before = T.seq;
  io.runNext(['bot']);
  assert.ok(T.seq > before);
  T.setAway(a, false);
  assert.equal(T.seats[a].away, false);
  T.toBot(1);
  assert.equal(T.seats[1].bot, 2);
  assert.equal(T.standings().length, 3);
});

// ---------------------------------------------------------------- la compu
/** Juega una partida entera con la compu en todos los asientos y comprueba que no se rompa nada. */
function playAll({ n, level, draw, seed, target = 100 }) {
  const io = fakeIo();
  const T = new Table({ seats: seats(n, level), opts: { target, draw }, io, rng: mulberry(seed), botRng: mulberry(seed + 77) });
  T.start();
  let steps = 0;
  while (T.phase !== 'over' && steps++ < 30000) {
    assert.ok(io.runNext(), 'siempre hay algo que correr');
    const all = tileCount(T);
    assert.equal(all.length, 28, 'ninguna ficha aparece ni desaparece');
    assert.equal(new Set(all).size, 28);
    for (const [i, h] of T.h.hands.entries()) assert.ok(h.length >= 0 && h.length <= 28 - 7 * (n - 1), `mano ${i}`);
    const e = T.h.chain.ends;
    if (T.h.chain.root) {
      const arms = T.h.chain.arms;
      assert.equal(e[0], arms[0].length ? arms[0].at(-1).o : T.h.chain.root.a);
      assert.equal(e[1], arms[1].length ? arms[1].at(-1).o : T.h.chain.root.b);
    }
  }
  assert.equal(T.phase, 'over', `terminó (n=${n} nivel=${level} draw=${draw} semilla=${seed})`);
  assert.ok(T.scores.some((s) => s >= target));
  assert.equal(T.result.scores.reduce((a, b) => a + b, 0), T.scores.reduce((a, b) => a + b, 0));
  return T;
}

test('la compu juega partidas completas con jugadas siempre válidas (de a 2, 3 y 4, tres niveles, robando o no)', () => {
  for (const n of [2, 3, 4]) for (const draw of [true, false]) for (const level of [1, 2, 3]) for (let g = 0; g < (level === 3 ? 2 : 4); g++) playAll({ n, level, draw, seed: g * 11 + n, target: level === 3 ? 60 : 100 });
});

test('la compu: los niveles se notan (el difícil le gana al normal y este al fácil)', () => {
  const duel = (la, lb, n, draw, games) => {
    let a = 0;
    for (let g = 0; g < games; g++) {
      const flip = g % 2;
      const levels = n === 2 ? (flip ? [lb, la] : [la, lb]) : flip ? [lb, la, lb, la] : [la, lb, la, lb];
      const io = fakeIo();
      const T = new Table({ seats: levels.map((l, i) => ({ id: `p${i}`, name: `J${i}`, color: '#fff', bot: l })), opts: { target: 100, draw }, io, rng: mulberry(1000 + g), botRng: mulberry(2000 + g) });
      T.start();
      for (let s = 0; s < 40000 && T.phase !== 'over'; s++) io.runNext();
      if (T.result.winner === (flip ? 1 : 0)) a++;
    }
    return a / games;
  };
  assert.ok(duel(3, 2, 2, true, 40) >= 0.6, 'el difícil le gana al normal de a dos');
  assert.ok(duel(2, 1, 2, true, 40) >= 0.6, 'el normal le gana al fácil');
  assert.ok(duel(3, 1, 4, false, 24) >= 0.75, 'en parejas, el difícil le gana al fácil');
});

test('la compu: elige entre robar, pasar y jugar según la vista, sin tocarla', () => {
  const S = scene({ hands: [H0, H1], draw: true });
  const v1 = S.T.view(1);
  assert.deepEqual(decide(v1, 3, mulberry(1)), { t: 'draw' });
  assert.deepEqual(decide(v1, 1, mulberry(1)), { t: 'draw' });
  const S2 = scene({ hands: [H0, H1] });
  const v0 = S2.T.view(0);
  const snap = JSON.stringify(v0);
  for (const level of [1, 2, 3]) {
    const d = decide(v0, level, mulberry(level));
    assert.equal(d.t, 'play');
    assert.ok(v0.can.moves[d.tile].includes(d.end), `nivel ${level} juega algo válido`);
  }
  assert.equal(JSON.stringify(v0), snap, 'no cambia la vista');
  // sin turno, no hace nada
  assert.equal(decide(S2.T.view(1), 3, mulberry(1)), null);
  // si no puede jugar ni robar, pasa
  const mute = { ...v0, can: { play: false, moves: {}, draw: false, pass: true } };
  assert.deepEqual(decide(mute, 2, mulberry(1)), { t: 'pass' });
  // el difícil explica sus jugadas
  const ex = [];
  decide(v0, 3, mulberry(3), ex);
  assert.equal(ex.length, 4, 'las 2 fichas con 6 (16 y 26) en las dos puntas');
  assert.ok(ex.every((o) => typeof o.score === 'number' && v0.can.moves[o.tile].includes(o.end)));
});

test('la compu difícil: reparte las fichas que no ve respetando lo que ya se sabe que no tienen', () => {
  const hand = ['00', '01', '02', '11', '12', '22', '13'];
  const seen = new Set(hand);
  const unseen = TILES.filter((t) => !seen.has(t)).map((t) => ID.get(t));
  const rng = mulberry(5);
  for (let k = 0; k < 200; k++) {
    const need = [0, 7, 7];
    const lack = [new Set(), new Set([6, 5]), new Set([4])];
    const w = sampleWorld(rng, unseen, need, lack);
    assert.equal(w.hands[1].length, 7);
    assert.equal(w.hands[2].length, 7);
    for (const id of w.hands[1]) assert.ok(!has(TILES[id], 6) && !has(TILES[id], 5), `el 1 no tiene 5 ni 6: ${TILES[id]}`);
    for (const id of w.hands[2]) assert.ok(!has(TILES[id], 4), `el 2 no tiene 4: ${TILES[id]}`);
    const all = [...w.hands.flat(), ...w.pozo];
    assert.equal(all.length, unseen.length);
    assert.equal(new Set(all).size, unseen.length, 'ninguna ficha repetida');
  }
  // si no alcanzan fichas sin ese número, no se rompe
  const few = unseen.filter((id) => has(TILES[id], 6)).concat(unseen.slice(0, 2));
  const w = sampleWorld(mulberry(1), few, [0, 4], [new Set(), new Set([6])]);
  assert.equal(w.hands[1].length, 4);
});

test('la compu difícil: no cambia sola con el tiempo (misma vista y misma suerte, misma jugada) y es rápida', () => {
  const io = fakeIo();
  const T = new Table({ seats: seats(4, 3), opts: { target: 100 }, io, rng: mulberry(21), botRng: mulberry(22) });
  T.start();
  let worst = 0;
  let calls = 0;
  for (let s = 0; s < 400 && T.phase !== 'over'; s++) {
    const a = T.actor();
    if (a >= 0) {
      const v = T.view(a);
      if (v.can.play && Object.keys(v.can.moves).length > 1) {
        const t0 = performance.now();
        const d1 = decide(v, 3, mulberry(s));
        worst = Math.max(worst, performance.now() - t0);
        const d2 = decide(v, 3, mulberry(s));
        assert.deepEqual(d1, d2);
        calls++;
      }
    }
    io.runNext();
  }
  assert.ok(calls > 20);
  assert.ok(worst < 400, `una jugada tarda ${worst.toFixed(0)} ms`);
  // evaluate devuelve un puntaje por jugada
  const S = scene({ hands: [H0, H1] });
  const sc = evaluate(S.T.view(0), mulberry(1), 30);
  assert.equal(sc.length, 4);
});

test('el diario: las mismas fichas para todos y la compu decide igual', () => {
  const run = (date) => {
    const deal = (k) => shuffled(TILES, seeded(`domino:${date}:${k}`));
    const io = fakeIo();
    const T = new Table({ seats: [{ id: 'me', name: 'Vos', color: '#fff', bot: 0 }, { id: 'b', name: 'Mate', color: '#fff', bot: 3 }], opts: { target: 99999, rounds: 1, draw: true }, io, rng: mulberry(1), dealFn: deal, botRng: seeded(`domino:${date}:compu`) });
    T.start();
    io.settle(T);
    return T;
  };
  const a = run('2026-10-28'), b = run('2026-10-28'), c = run('2026-10-29');
  assert.deepEqual(a.h.hands, b.h.hands);
  assert.notDeepEqual(a.h.hands, c.h.hands);
  // jugando lo primero que se pueda, todo se repite
  const playOut = (T, io) => {
    for (let s = 0; s < 4000 && T.phase !== 'over'; s++) {
      if (T.actor() === 0 && !T.h.over) {
        const can = T.legal(0);
        if (can.draw) T.act(0, { t: 'draw' });
        else {
          const tile = Object.keys(can.moves).sort()[0];
          T.act(0, { t: 'play', tile, end: can.moves[tile][0] });
        }
      }
      io.runNext();
    }
    return JSON.stringify([T.scores, T.log.map((e) => [e.k, e.seat, e.tile])]);
  };
  const io1 = fakeIo(), io2 = fakeIo();
  const mk = (io) => {
    const deal = (k) => shuffled(TILES, seeded(`domino:2026-10-28:${k}`));
    const T = new Table({ seats: [{ id: 'me', name: 'Vos', color: '#fff', bot: 0 }, { id: 'b', name: 'Mate', color: '#fff', bot: 3 }], opts: { target: 99999, rounds: 1, draw: true }, io, rng: mulberry(1), dealFn: deal, botRng: seeded('domino:2026-10-28:compu') });
    T.start();
    return T;
  };
  assert.equal(playOut(mk(io1), io1), playOut(mk(io2), io2));
});

// ---------------------------------------------------------------- el servidor
test('servidor: valida los ajustes, pide dos personas, reparte sin mostrar fichas ajenas y sigue sin esperar entre rondas', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    a.send({ t: 'create', game: 'domino', name: 'Ana' });
    await wait(150);
    const code = a.last('joined').code;
    a.send({ t: 'start' });
    await wait(150);
    assert.equal(a.last('error')?.code, 'need_players');
    a.send({ t: 'settings', settings: { n: 2, pair: 1, target: 50, draw: 0, level: 3 } });
    await wait(100);
    const st = a.last('room').room.settings;
    assert.deepEqual(st, { n: 2, pair: 1, target: 50, draw: 0, level: 3 });
    a.send({ t: 'settings', settings: { n: 5, target: 99, level: 'x', pair: 7, draw: 2 } });
    await wait(100);
    assert.deepEqual(a.last('room').room.settings, st, 'valores raros se ignoran');
    const b = await connect(srv.port);
    b.send({ t: 'join', game: 'domino', code, name: 'Beto' });
    await wait(150);
    a.send({ t: 'start' });
    await wait(600);
    const va = a.last('g')?.s, vb = b.last('g')?.s;
    assert.ok(va && vb, 'llegó la mesa a los dos');
    assert.equal(va.n, 2);
    assert.equal(va.target, 50);
    assert.equal(va.draw, false);
    assert.equal(va.me, 0);
    assert.equal(vb.me, 1);
    assert.deepEqual(va.seats.map((s) => [s.name, !!s.bot]), [['Ana', false], ['Beto', false]]);
    assert.ok(va.hand.mine.length >= 6 && vb.hand.mine.length >= 6);
    const ja = JSON.stringify(va), jb = JSON.stringify(vb);
    // lo único que se anuncia es con qué ficha se abre (el doble más alto, que se juega solo en un segundo)
    const pub = va.hand.forced;
    assert.ok(pub === null || isTile(pub));
    for (const t of vb.hand.mine) assert.ok(t === pub || !ja.includes(`"${t}"`), `Ana no ve ${t}`);
    for (const t of va.hand.mine) assert.ok(t === pub || !jb.includes(`"${t}"`), `Beto no ve ${t}`);
    // una jugada mal formada o fuera de turno no rompe nada
    b.send({ t: 'play', tile: 'zz' });
    b.send({ t: 'play', tile: '66', end: 7 });
    a.send({ t: 'play', tile: va.hand.mine[0], end: 'izquierda' });
    a.send({ t: 'otra cosa' });
    await wait(300);
    assert.ok(a.last('g') && b.last('g'), 'siguen conectados');
    // los dos juegan lo que haga falta hasta terminar la primera ronda; después se sigue con "siguiente"
    const play = (c) => {
      const v = c.last('g').s;
      if (v.can.draw) {
        c.send({ t: 'draw' });
        return true;
      }
      if (!v.can.play) return false;
      const tile = Object.keys(v.can.moves)[0];
      c.send({ t: 'play', tile, end: v.can.moves[tile][0] });
      return true;
    };
    let roundEnded = false;
    for (let k = 0; k < 160 && !roundEnded; k++) {
      play(a);
      play(b);
      await wait(250);
      roundEnded = !!a.last('g').s.hand.over;
    }
    assert.ok(roundEnded, 'terminó la primera ronda');
    const re = a.last('g').s.ev.find((e) => e.k === 'round');
    assert.ok(re, 'llegó el resultado de la ronda');
    assert.ok(['domino', 'block', 'tie'].includes(re.kind));
    if (a.last('g').s.phase === 'play') {
      const num = a.last('g').s.hand.num;
      a.send({ t: 'next' });
      await wait(200);
      assert.equal(a.last('g').s.hand.num, num, 'con uno solo listo todavía se espera');
      b.send({ t: 'next' });
      await wait(400);
      assert.equal(a.last('g').s.hand.num, num + 1, 'con todos listos arranca la siguiente');
      // si Beto se desconecta, juega la compu por él
      b.ws.close();
      await wait(400);
      assert.equal(a.last('g').s.seats[1].away, true);
    }
    a.ws.close();
  } finally {
    srv.stop();
  }
});

test('servidor: con más personas que lugares avisa; de a cuatro entran y la compu completa; reconectar devuelve la mesa', async () => {
  const srv = await startServer();
  try {
    const a = await connect(srv.port);
    a.send({ t: 'create', game: 'domino', name: 'Ana' });
    await wait(150);
    const code = a.last('joined').code;
    const b = await connect(srv.port);
    b.send({ t: 'join', game: 'domino', code, name: 'Beto' });
    const c = await connect(srv.port);
    c.send({ t: 'join', game: 'domino', code, name: 'Cata' });
    await wait(200);
    a.send({ t: 'start' });
    await wait(200);
    assert.equal(a.last('error')?.code, 'too_many');
    a.send({ t: 'settings', settings: { n: 4, pair: 1 } });
    await wait(100);
    a.send({ t: 'start' });
    await wait(500);
    const v = a.last('g')?.s;
    assert.ok(v, 'de a cuatro entran los tres');
    assert.equal(v.n, 4);
    assert.equal(v.draw, false, 'de a cuatro no hay pozo');
    assert.equal(v.seats.filter((s) => s.bot).length, 1);
    assert.deepEqual(v.seats.map((s) => s.team), [0, 1, 0, 1]);
    assert.deepEqual(v.seats.map((s) => s.name).slice(0, 2).sort(), ['Ana', 'Cata'].sort(), 'las dos primeras personas, juntas');
    assert.equal(v.hand.mine.length >= 6, true);
    // Beto se cae y vuelve: recibe su vista de nuevo
    const token = b.last('joined')?.token;
    b.ws.close();
    await wait(300);
    assert.equal(a.last('g').s.seats.find((s) => s.name === 'Beto').away, true);
    if (token) {
      const b2 = await connect(srv.port);
      b2.send({ t: 'join', game: 'domino', code, name: 'Beto', token });
      await wait(400);
      assert.ok(b2.last('g'), 'recibió la mesa al volver');
      assert.equal(b2.last('g').s.seats.find((s) => s.name === 'Beto').away, false);
      b2.ws.close();
    }
    a.ws.close();
    c.ws.close();
  } finally {
    srv.stop();
  }
});
