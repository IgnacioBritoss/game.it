/**
 * Golfazo — solucionador: busca golpes que embocan cada hoyo (muestreo al azar con semilla + haz de los mejores estados)
 * y los imprime como JSON. Sirve para fijar el par (lo mejor que encuentra + 1) y para las soluciones de prueba.
 *
 *   node tools/golfazo-solve.mjs pradera-1 bahia-3      # solo esos hoyos
 *   node tools/golfazo-solve.mjs --all --depth 4        # todos
 *   node tools/golfazo-solve.mjs --all --write          # y reescribe public/games/golfazo/shared/solutions.js
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HOLE_LIST, freshHole } from '../public/games/golfazo/shared/holes.js';
import { newBall, cloneBall, HZ, ANGLES, POWERS, HOLED } from '../public/games/golfazo/shared/physics.js';
import { playShot, strokesOf } from '../public/games/golfazo/shared/rules.js';

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(`--${n}`) ? Number(args[args.indexOf(`--${n}`) + 1]) : d);
const ids = args.includes('--all') ? HOLE_LIST.map((h) => h.id) : args.filter((a, i) => !a.startsWith('--') && !/^--/.test(args[i - 1] || ''));
const DEPTH = flag('depth', 4);
const N1 = flag('n1', 6000);
const BEAM = flag('beam', 12);
const NB = flag('nb', 900);
const write = args.includes('--write');

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function solve(id) {
  const w = freshHole(id, false);
  const R = rng(1234 + id.length * 77 + id.charCodeAt(id.length - 1));
  const hasMovers = w.movers.length > 0 || w.zones.conv.length > 0;
  const bearing = (s) => {
    const dx = w.cup.x - s.x;
    const dz = w.cup.z - s.z;
    return Math.atan2(dx, dz);
  };
  const dist = (s) => Math.hypot(s.x - w.cup.x, s.z - w.cup.z) + Math.abs(s.y - w.cup.y) * 2;
  let frontier = [{ ball: newBall(w), shots: [], d: 99 }];
  let tried = 0;
  for (let depth = 1; depth <= DEPTH; depth++) {
    const children = [];
    for (const st of frontier) {
      const n = depth === 1 ? N1 : NB;
      for (let i = 0; i < n; i++) {
        const s = cloneBall(st.ball);
        let ang;
        const r = R();
        if (r < 0.5) ang = bearing(s) + (R() - 0.5) * 0.9;
        else ang = R() * Math.PI * 2;
        let a = Math.round((((ang / (Math.PI * 2)) % 1) + 1) % 1 * ANGLES) % ANGLES;
        const p = 40 + Math.floor(Math.pow(R(), 0.8) * (POWERS - 40));
        const k = s.k + (hasMovers ? Math.floor(R() * 600) : 0);
        const res = playShot(w, s, a, p, k);
        tried++;
        if (!res.ok) continue;
        const shots = [...st.shots, { a, p, k }];
        if (res.holed) return { id, depth, shots, tried, strokes: strokesOf(s) };
        if (s.pens > st.ball.pens) continue; // agua o lava: no sirve de punto de partida
        if (Math.hypot(s.x - st.ball.x, s.z - st.ball.z) < 0.3) continue;
        children.push({ ball: s, shots, d: dist(s) });
      }
    }
    children.sort((x, y) => x.d - y.d);
    frontier = [];
    for (const c of children) {
      if (frontier.length >= BEAM) break;
      if (frontier.some((f) => Math.hypot(f.ball.x - c.ball.x, f.ball.z - c.ball.z) < 0.6 && Math.abs(f.ball.y - c.ball.y) < 0.5)) continue;
      frontier.push(c);
    }
    if (!frontier.length) break;
  }
  return { id, depth: null, shots: null, tried };
}

const out = {};
for (const id of ids) {
  const t0 = Date.now();
  const r = solve(id);
  const par = HOLE_LIST.find((h) => h.id === id).par;
  console.log(`${id.padEnd(11)} ${r.depth ? `golpes ${r.depth}` : 'SIN SOLUCIÓN'}  par actual ${par} → sugerido ${r.depth ? r.depth + 1 : '?'}  (${r.tried} tiros, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (r.shots) out[id] = r.shots;
  console.log('SOL ' + JSON.stringify({ id, shots: r.shots }));
}
if (write) {
  const file = fileURLToPath(new URL('../public/games/golfazo/shared/solutions.js', import.meta.url));
  let prev = {};
  if (existsSync(file)) {
    const m = readFileSync(file, 'utf8').match(/export const SOLUTIONS = (\{[\s\S]*\});/);
    if (m) prev = JSON.parse(m[1]);
  }
  const all = { ...prev, ...out };
  writeFileSync(file, `/** Soluciones de prueba de cada hoyo (las genera tools/golfazo-solve.mjs): golpes { a: ángulo, p: fuerza, k: tick } que lo embocan. */\nexport const SOLUTIONS = ${JSON.stringify(all, null, 1)};\n`);
  console.log('escrito', file);
}
