/**
 * Prisma — "Luz del día": un rompecabezas nuevo por día, igual para todos, generado con la semilla de la fecha
 * (la de Argentina, ver /shared/daily.js). Se arma al revés: primero se hace crecer una red de rayos poniendo piezas
 * al azar en casillas iluminadas, después se ponen cristales donde terminan los rayos (con la mezcla que les llega) y
 * recién ahí se desarma: algunas piezas van a la bandeja y otras quedan giradas. El resolvedor calcula el mínimo de
 * jugadas (que puede ser menor que lo que se desarmó) y garantiza que tiene solución; si algo no cumple, se prueba
 * con la semilla siguiente del mismo día. La dificultad sube de lunes a domingo.
 */
import { rng, rint, pick, shuffle, dayIndex } from '/shared/daily.js';
import { parse, trace, solText, ARROWS, COLOR_CH } from './optics.js';
import { solve } from './solver.js';

export const DAILY_EPOCH = '2026-10-20';

/** Recetas por día de la semana (0 = lunes). */
export const RECIPES = [
  { n: 6, emit: [[1], [4]], kinds: ['m', 'm', 's'], grow: 4, walls: 3, scr: [4, 6], minPar: 4 },
  { n: 6, emit: [[7], [1, 4]], kinds: ['m', 'm', 's', 'f'], grow: 5, walls: 3, scr: [4, 6], minPar: 4 },
  { n: 7, emit: [[7], [2]], kinds: ['m', 'm', 'p', 's'], grow: 5, walls: 4, scr: [5, 7], minPar: 5 },
  { n: 7, emit: [[1, 2], [2, 4], [1, 4]], kinds: ['m', 'm', 'm', 's'], grow: 5, walls: 4, scr: [5, 7], minPar: 5 },
  { n: 7, emit: [[7], [1, 2]], kinds: ['m', 'm', 's', 'o', 'f'], grow: 5, walls: 4, scr: [5, 7], minPar: 5 },
  { n: 8, emit: [[7, 2], [1, 4]], kinds: ['m', 'm', 's', 'p', 'f'], grow: 6, walls: 5, scr: [6, 8], minPar: 6 },
  { n: 8, emit: [[7], [1, 2, 4], [7, 4]], kinds: ['m', 'm', 's', 'p', 'o', 'f'], grow: 7, walls: 5, scr: [6, 8], minPar: 6 },
];

/** Día de la semana de una fecha "AAAA-MM-DD" (0 = lunes … 6 = domingo). */
export const weekday = (date) => (((dayIndex(date) + 3) % 7) + 7) % 7;

/** Intenta armar un nivel con el generador r; devuelve { map, tray, scr } o null. */
export function build(r, rec) {
  const n = rec.n;
  const N = n * n;
  const tok = new Array(N).fill('..');
  const free = (i) => tok[i] === '..';
  const xy = (i) => [i % n, (i / n) | 0];
  const inside = (x, y) => x >= 0 && y >= 0 && x < n && y < n;
  // emisores en el borde, mirando hacia adentro
  const colors = pick(r, rec.emit);
  const used = new Set();
  for (const c of colors) {
    for (let k = 0; k < 40; k++) {
      const side = rint(r, 4);
      const t = 1 + rint(r, n - 2);
      const [x, y, d] = side === 0 ? [0, t, 0] : side === 1 ? [n - 1, t, 2] : side === 2 ? [t, 0, 1] : [t, n - 1, 3];
      const i = y * n + x;
      if (!free(i) || used.has(`${side}:${t}`)) continue;
      // que no quede pegado a otro emisor
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inside(x + dx, y + dy) && ARROWS.includes(tok[(y + dy) * n + x + dx][0]))) continue;
      tok[i] = ARROWS[d] + COLOR_CH[c];
      used.add(`${side}:${t}`);
      break;
    }
  }
  if (tok.filter((t) => ARROWS.includes(t[0])).length !== colors.length) return null;
  // paredes sueltas (nunca en el borde delante de un emisor)
  for (let k = 0; k < rec.walls; k++) {
    const i = rint(r, N);
    const [x, y] = xy(i);
    if (!free(i) || x === 0 || y === 0 || x === n - 1 || y === n - 1) continue;
    tok[i] = '##';
  }
  // crecer la red de rayos
  let portals = 0;
  const levelOf = (tray = []) => ({ map: Array.from({ length: n }, (_, y) => tok.slice(y * n, y * n + n).join(' ')), tray });
  const traceNow = () => {
    // al principio todavía no hay cristales: se lee sin exigirlos
    const b = parse(levelOf(), { loose: true });
    const at = new Int16Array(N).fill(-1);
    for (const p of b.pieces) at[p.cell] = p.id;
    return { b, r: trace(b, at, b.pieces), at };
  };
  for (let k = 0; k < rec.grow * 3 && countPieces(tok) < rec.grow; k++) {
    const { r: tr } = traceNow();
    const lit = [];
    for (let i = 0; i < N; i++) if (tr.lit[i] && free(i)) lit.push(i);
    if (!lit.length) break;
    const i = pick(r, lit);
    // dirección de la luz que pasa por i (la primera que se encuentre)
    let dIn = -1, colIn = 0;
    for (let d = 0; d < 4; d++)
      if (tr.seg[i * 4 + d]) {
        // la luz que sale de i hacia d entró viajando hacia d si no hay pieza: es la dirección de viaje
        dIn = d;
        colIn = tr.seg[i * 4 + d];
        break;
      }
    if (dIn < 0) continue;
    let kind = pick(r, rec.kinds);
    if (kind === 'o' && portals >= 1) kind = 'm';
    if (kind === 'p' && colIn !== 7 && rint(r, 3)) kind = 'm';
    if (kind === 'f' && (colIn === 1 || colIn === 2 || colIn === 4)) kind = 'm';
    if (kind === 'm') tok[i] = 'm' + rint(r, 2);
    else if (kind === 's') tok[i] = 's' + rint(r, 2);
    else if (kind === 'p') tok[i] = 'p' + dIn;
    else if (kind === 'f') {
      const opts = [1, 2, 4, 3, 5, 6].filter((c) => c & colIn && c !== colIn);
      tok[i] = 'f' + COLOR_CH[pick(r, opts)];
    } else if (kind === 'o') {
      // la otra boca, en una casilla libre a distancia
      const [x0, y0] = xy(i);
      const cand = [];
      for (let j = 0; j < N; j++) {
        const [x, y] = xy(j);
        if (free(j) && j !== i && Math.abs(x - x0) + Math.abs(y - y0) >= 3 && !tr.lit[j] && x > 0 && y > 0 && x < n - 1 && y < n - 1) cand.push(j);
      }
      if (!cand.length) continue;
      tok[i] = 'Oa';
      tok[pick(r, cand)] = 'Oa';
      portals++;
    }
  }
  if (countPieces(tok) < rec.grow - 1) return null;
  // cristales donde terminan los rayos
  for (let pass = 0; pass < 3; pass++) {
    const { r: tr } = traceNow();
    const ends = [];
    for (let i = 0; i < N; i++) {
      if (!free(i)) continue;
      for (let d = 0; d < 4; d++) if (tr.seg[i * 4 + d] && tr.stop[i * 4 + d] === 1) ends.push(i);
    }
    if (!ends.length) break;
    for (const i of shuffle(r, [...new Set(ends)]).slice(0, 3)) tok[i] = '*w';
  }
  // color de cada cristal = lo que le llega; los que no reciben nada se sacan; las piezas sin luz, también
  for (let pass = 0; pass < 4; pass++) {
    const { b, r: tr } = traceNow();
    let changed = false;
    b.targets.forEach((t, k) => {
      const c = tr.hit[k];
      const want = c ? '*' + COLOR_CH[c] : '..';
      if (tok[t.cell] !== want) {
        tok[t.cell] = want;
        changed = true;
      }
    });
    for (const p of b.pieces)
      if (!tr.lit[p.cell]) {
        tok[p.cell] = '..';
        changed = true;
      }
    if (!changed) break;
  }
  const targets = tok.filter((t) => t[0] === '*').length;
  if (targets < 2 || targets > 5) return null;
  // desarmar: bandeja, giradas o atornilladas
  const dyn = [];
  for (let i = 0; i < N; i++) if (/^[msp]/.test(tok[i]) || tok[i][0] === 'f') dyn.push(i);
  if (dyn.length < 3) return null;
  const tray = [];
  let scr = 0;
  const goal = rec.scr[0] + rint(r, rec.scr[1] - rec.scr[0] + 1);
  for (const i of shuffle(r, dyn)) {
    const t = tok[i];
    const kind = t[0];
    if (scr >= goal) {
      tok[i] = t[0].toUpperCase() + t[1];
      continue;
    }
    const toTray = kind === 'f' ? rint(r, 2) === 0 : rint(r, 3) === 0 && tray.length < 3;
    if (toTray) {
      const k = kind === 'p' ? 4 : kind === 'f' ? 1 : 2;
      const o = kind === 'f' ? t[1] : 0;
      tray.push(kind + o);
      const so = kind === 'f' ? 0 : +t[1];
      scr += 1 + (k > 1 ? Math.min(so, k - so) : 0);
      tok[i] = '..';
    } else if (kind !== 'f') {
      const k = kind === 'p' ? 4 : 2;
      const so = +t[1];
      const o = (so + 1 + rint(r, k - 1)) % k;
      tok[i] = kind + o;
      scr += Math.min((o - so + k) % k, (so - o + k) % k);
    } else tok[i] = 'F' + t[1];
  }
  if (scr < rec.scr[0]) return null;
  return { ...levelOf(tray), scr };
}

function countPieces(tok) {
  return tok.filter((t) => /^[mspfO]/.test(t)).length;
}

/**
 * El nivel del día: { map, tray, par, sol, recipe, date }. Mismo resultado en todos los navegadores (semilla de la
 * fecha y resolvedor determinista).
 */
export function dailyLevel(date, { maxNodes = 60000 } = {}) {
  const rec = RECIPES[weekday(date)];
  for (let attempt = 0; attempt < 80; attempt++) {
    const r = rng(`prisma:${date}:${attempt}`);
    let lv;
    try {
      lv = build(r, rec);
    } catch {
      lv = null;
    }
    if (!lv) continue;
    let b;
    try {
      b = parse(lv);
    } catch {
      continue;
    }
    // que no empiece resuelto ni con casi todo prendido
    const at = new Int16Array(b.n * b.n).fill(-1);
    for (const p of b.pieces) if (p.cell >= 0) at[p.cell] = p.id;
    const t0 = trace(b, at, b.pieces);
    const okStart = b.targets.filter((t, k) => t0.hit[k] === t.color).length;
    if (t0.won || okStart > b.targets.length / 2) continue;
    const res = solve(lv, { bound: lv.scr + 1, maxNodes });
    if (!res.complete || res.cost == null || res.cost < rec.minPar) continue;
    return { map: lv.map, tray: lv.tray, par: res.cost, sol: solText(lv, res.cfg), date, attempt, nodes: res.nodes };
  }
  return { ...FALLBACK, date, attempt: -1 };
}

/** Por si ninguna semilla del día sirve (no pasa en las pruebas, pero el juego nunca se queda sin rompecabezas). */
export const FALLBACK = {
  map: ['*r .. m0 .. .. ..', '.. .. .. .. .. ..', '>w .. p1 .. .. *g', '.. .. .. .. .. ..', '.. .. .. .. .. ..', '.. .. m0 .. .. *b'],
  tray: [],
  par: 3,
  sol: 'R:2,0 L:2,2 R:2,5',
};
