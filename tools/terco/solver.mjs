/**
 * Terco — buscador de soluciones: dado el estado de una pantalla y una meta (una salida, un fogón, una zanahoria…),
 * busca una lista de teclas que llegue viva. Es una búsqueda A* con peso sobre estados reales de la simulación:
 * cada decisión se mantiene K pasos (como un dedo humano, no cuadro por cuadro) y los peligros se agrandan un
 * margen, así lo que encuentra no depende de un píxel.
 */
import { step, clone, key, exitTo, solidBoxes, RW, RH, T, K as KIND, IN, P, isSolid } from '../../public/games/terco/shared/sim.js';

class Heap {
  constructor() {
    this.f = [];
    this.v = [];
  }
  get size() {
    return this.v.length;
  }
  push(f, v) {
    const F = this.f, V = this.v;
    let i = V.length;
    F.push(f);
    V.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (F[p] <= f) break;
      F[i] = F[p];
      V[i] = V[p];
      i = p;
    }
    F[i] = f;
    V[i] = v;
  }
  pop() {
    const F = this.f, V = this.v;
    const top = V[0];
    const f = F.pop(), v = V.pop();
    const n = V.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && F[c + 1] < F[c]) c++;
        if (F[c] >= f) break;
        F[i] = F[c];
        V[i] = V[c];
        i = c;
      }
      F[i] = f;
      V[i] = v;
    }
    return top;
  }
}

/** Distancia (en baldosas, por el aire) de cada celda a las celdas meta: guía a la búsqueda. */
export function distMap(S, cells) {
  const D = new Float32Array(RW * RH).fill(Infinity);
  const q = new Heap();
  for (const [x, y] of cells) {
    if (x < 0 || y < 0 || x >= RW || y >= RH) continue;
    D[y * RW + x] = 0;
    q.push(0, y * RW + x);
  }
  const cost = (t) => (t === T.S || t === T.CR || t === T.SPR || t === T.CL || t === T.CRT ? Infinity : t === T.BRK ? 4 : t >= T.UP && t <= T.RT ? 6 : t === T.LAVA ? 8 : 1);
  while (q.size) {
    const i = q.pop();
    const x = i % RW, y = (i / RW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= RW || ny >= RH) continue;
      const c = cost(S.tiles[ny * RW + nx]);
      if (c === Infinity) continue;
      const nd = D[i] + c;
      if (nd < D[ny * RW + nx]) {
        D[ny * RW + nx] = nd;
        q.push(nd, ny * RW + nx);
      }
    }
  }
  return D;
}

/** Arma la meta: { fn(S) → llegó, cells → celdas hacia donde ir }. */
export function goal(S, g) {
  const R = S.R;
  if (g.exit) {
    const list = R.exits[g.exit] || [];
    const ok = (v) => list.some((o) => (!g.to || o.to === g.to) && v >= o.a && v < o.b);
    const cells = [];
    if (g.exit === 'left' || g.exit === 'right') {
      const x = g.exit === 'left' ? 0 : RW - 1;
      for (let y = 0; y < RH; y++) if (ok(y + 0.9) && !isSolid(S.tiles[y * RW + x])) cells.push([x, y]);
    } else {
      const y = g.exit === 'up' ? 0 : RH - 1;
      for (let x = 0; x < RW; x++) if (ok(x + 0.5) && !isSolid(S.tiles[y * RW + x])) cells.push([x, y]);
    }
    return { fn: (s) => s.exit === g.exit && (!g.to || exitTo(s) === g.to), cells };
  }
  const find = (k, pred) => {
    const i = R.ents.findIndex((d) => d.k === k && pred(d));
    if (i < 0) throw new Error(`pantalla ${R.id}: no encuentro la meta ${JSON.stringify(g)}`);
    return i;
  };
  if (g.cp != null) {
    const i = find(KIND.CP, (d) => d.id === g.cp);
    const d = R.ents[i];
    return { fn: (s) => s.cpOn === i, cells: [[Math.floor(d.x), Math.floor(d.y - 0.5)]] };
  }
  if (g.carrot) {
    const i = find(KIND.CARROT, (d) => d.id === g.carrot);
    const d = R.ents[i];
    return { fn: (s) => s.e[i].got === 1, cells: [[Math.floor(d.x), Math.floor(d.y - 0.5)]] };
  }
  if (g.stone) {
    const i = find(KIND.STONE, () => true);
    const d = R.ents[i];
    return { fn: (s) => s.e[i].got === 1, cells: [[Math.floor(d.x), Math.floor(d.y - 0.5)]] };
  }
  if (g.warp) {
    const i = find(KIND.WARP, (d) => d.to === g.warp);
    const d = R.ents[i];
    return { fn: (s) => s.warp === i, cells: [[Math.floor(d.x + d.w / 2), Math.floor(d.y + d.h - 0.5)]] };
  }
  if (g.sig) {
    const b = R.sigs[g.sig];
    return { fn: (s) => (s.sig & b) !== 0, cells: g.cells || [] };
  }
  if (g.at) return { fn: (s) => !s.h.dead && s.h.gr && Math.abs(s.h.x - g.at[0]) < (g.tol || 0.5) && Math.abs(s.h.y - g.at[1]) < 0.3, cells: [[Math.floor(g.at[0]), Math.floor(g.at[1] - 0.5)]] };
  throw new Error(`meta desconocida: ${JSON.stringify(g)}`);
}

/** Tramos donde la mula puede pararse: [x0, x1, y] (baldosas firmes sin pinchos encima). */
function supports(S) {
  const out = [];
  const stand = (x, y) => {
    const t = S.tiles[y * RW + x];
    if (!(isSolid(t) || t === T.OW)) return false;
    if (y === 0) return true;
    const a = S.tiles[(y - 1) * RW + x];
    return !isSolid(a) && !(a >= T.UP && a <= T.RT) && a !== T.LAVA;
  };
  for (let y = 0; y < RH; y++) {
    for (let x = 0; x < RW; x++) {
      if (!stand(x, y)) continue;
      let x1 = x;
      while (x1 + 1 < RW && stand(x1 + 1, y)) x1++;
      out.push([x, x1 + 1, y]);
      x = x1;
    }
  }
  return out;
}
const T_CAP = P.maxFall / P.g, D_CAP = (P.g * T_CAP * T_CAP) / 2;
const fallSteps = (d) => (d <= 0 ? 0 : d <= D_CAP ? Math.sqrt((2 * d) / P.g) : T_CAP + (d - D_CAP) / P.maxFall);
const AIR_UP = (P.jump2 * P.jump2) / (2 * P.g), AIR_T = P.jump2 / P.g;
/** ¿Desde donde está (y con lo que le queda de salto) la mula puede caer sobre el tramo [x0, x1] a la altura y? */
function canLand(h, x0, x1, y, slack) {
  let up = 0, t = 4;
  if (h.vy < 0) {
    up += (h.vy * h.vy) / (2 * P.g);
    t += -h.vy / P.g;
  }
  if (h.aj > 0) {
    up += AIR_UP;
    t += AIR_T;
  }
  const dy = y - h.y;
  if (dy < -up - 0.05) return false;
  t += fallSteps(dy + up);
  const dx = h.x < x0 ? x0 - h.x : h.x > x1 ? h.x - x1 : 0;
  return dx <= t * P.run + P.hw + slack;
}

/**
 * Busca cómo llegar de S0 a la meta. Devuelve { inputs: [teclas por paso], end: estado final, nodes } o { fail }.
 * opts: K (pasos por decisión), shoot (¿puede patear?), maxNodes, q (resolución de la clave).
 *
 * Es una búsqueda golosa: siempre sigue por el estado más cerca de la meta y, a igual distancia, por el más
 * reciente (así "esperar" avanza el reloj de un tirón en vez de probar todas las formas de perder el tiempo).
 * Los saltos que no pueden caer en ningún lado quedan para el final, y los que solo pueden volver al mismo lugar
 * de donde salieron (saltar en el lugar) se prueban recién cuando no queda otra, por ejemplo para esquivar algo.
 */
export function solve(S0, g, opts = {}) {
  const Kd = opts.K || 4;
  const shoot = !!opts.shoot;
  const q = opts.q || { x: 8, y: 8, v: 25 };
  const maxNodes = opts.maxNodes || 400000;
  const { fn, cells } = g.fn ? g : goal(S0, g);
  const D = cells.length ? distMap(S0, cells) : null;
  const sup = supports(S0);
  const nStatic = sup.length;
  for (const [x, y] of cells) sup.push([x, x + 1, y + 1]); // la meta también es "un lugar donde caer"
  for (const i of S0.R.winds) {
    const d = S0.R.ents[i];
    if (d.py < 0) sup.push([d.x, d.x + d.w, d.y + d.h]);
  }
  const boxes = [];
  const PEN = opts.pen ?? 45, PEN2 = opts.pen2 ?? 6;
  const dist = (x, y) => (x < 0 || y < 0 || x >= RW || y >= RH ? Infinity : D[y * RW + x]);
  /** Distancia a la meta; deja en S.ls el lugar donde está parada (o del que saltó). */
  const hOf = (S) => {
    const h = S.h;
    let d = 0;
    if (D) {
      const px = Math.max(0, Math.min(RW - 0.001, h.x)), py = Math.max(0, Math.min(RH - 0.001, h.y - 0.35));
      const x = Math.floor(px), y = Math.floor(py);
      d = D[y * RW + x];
      if (d === Infinity) d = 60;
      else {
        // un poco más fino que por celda: cuánto avanzó hacia la vecina que acerca
        const r = dist(x + 1, y), l = dist(x - 1, y), dn = dist(x, y + 1), up = dist(x, y - 1);
        const m = Math.min(r, l, dn, up);
        if (m < d) d -= m === r ? px - x : m === l ? 1 - (px - x) : m === dn ? py - y : 1 - (py - y);
      }
    }
    if (h.gr) {
      if (h.ride >= 0) S.ls = 1000 + h.ride;
      else {
        S.ls = -1;
        for (let n = 0; n < nStatic; n++) {
          if (sup[n][2] === h.y && h.x + P.hw > sup[n][0] && h.x - P.hw < sup[n][1]) {
            S.ls = n;
            break;
          }
        }
      }
      return d;
    }
    if (!PEN) return d;
    let same = false;
    for (let n = 0; n < sup.length; n++) {
      if (!canLand(h, sup[n][0], sup[n][1], sup[n][2], 0.3)) continue;
      if (n !== S.ls) return d;
      same = true;
    }
    solidBoxes(S, boxes);
    for (let n = 0; n < boxes.length; n += 5) {
      if (!canLand(h, boxes[n], boxes[n + 2], boxes[n + 1], 2.5)) continue;
      if (1000 + boxes[n + 4] !== S.ls) return d;
      same = true;
    }
    return d + (same ? PEN2 : PEN);
  };
  const base = [0, IN.L, IN.R, IN.J, IN.J | IN.L, IN.J | IN.R];
  const acts = shoot ? [...base, ...base.map((a) => a | IN.F)] : base;
  const start = clone(S0);
  start.fx = null;
  start.ls = -1;
  if (fn(start)) return { inputs: [], end: start, nodes: 0 };
  const states = [start], parent = [-1], act = [0], len = [0], gs = [0];
  const seen = new Set([key(start, q, shoot)]);
  const open = new Heap();
  open.push(hOf(start), 0);
  let best = null;
  while (open.size) {
    const n = open.pop();
    const S = states[n];
    states[n] = null;
    for (let ai = 0; ai < acts.length; ai++) {
      const a = acts[ai];
      const C = clone(S);
      let ok = true, done = false, used = 0;
      for (let i = 0; i < Kd; i++) {
        step(C, a);
        used++;
        if (C.h.dead) {
          ok = false;
          break;
        }
        if (fn(C)) {
          done = true;
          break;
        }
        if (C.exit || C.warp >= 0) {
          ok = false; // se fue por otro lado
          break;
        }
      }
      if (!ok) continue;
      if (!done) {
        const k = key(C, q, shoot);
        if (seen.has(k)) continue;
        seen.add(k);
      }
      const id = states.length;
      states.push(done ? null : C);
      parent.push(n);
      act.push(a);
      len.push(used);
      gs.push(gs[n] + used);
      if (done) {
        best = { id, end: C };
        break;
      }
      open.push(hOf(C) - 1e-4 * gs[id], id);
    }
    if (best || states.length > maxNodes) break;
  }
  if (!best) return { fail: true, nodes: states.length, exhausted: !open.size };
  const inputs = [];
  for (let n = best.id; n > 0; n = parent[n]) for (let i = 0; i < len[n]; i++) inputs.push(act[n]);
  inputs.reverse();
  return { inputs, end: best.end, nodes: states.length };
}

/** Prueba de más grueso a más fino: primero decisiones largas y poca resolución (rápido), después más detalle. */
const PASSES = [
  { K: 6, q: { x: 4, y: 4, v: 12 }, maxNodes: 150000 },
  { K: 4, q: { x: 8, y: 8, v: 25 }, maxNodes: 500000 },
  { K: 3, q: { x: 16, y: 16, v: 50 }, maxNodes: 1200000 },
];
export function solveAny(S0, g, opts = {}) {
  let nodes = 0;
  const from = opts.pass || 0;
  for (let p = from; p < (opts.passes ?? PASSES.length); p++) {
    const r = solve(S0, g, { ...PASSES[p], ...opts });
    nodes += r.nodes;
    if (!r.fail) return { ...r, nodes, pass: p, K: PASSES[p].K };
  }
  return { fail: true, nodes };
}

/** Varias metas seguidas (pasar por un fogón, apretar una palanca, salir). */
export function solvePath(S0, goals, opts = {}) {
  let S = S0;
  const inputs = [];
  let nodes = 0, pass = 0;
  for (const g of goals) {
    const r = solveAny(S, g, { ...opts, ...(g.opts || {}) });
    nodes += r.nodes;
    if (r.fail) return { fail: true, nodes, at: g };
    inputs.push(...r.inputs);
    pass = Math.max(pass, r.pass);
    S = r.end;
  }
  return { inputs, end: S, nodes, pass };
}

/** Teclas comprimidas: "tecla×pasos" seguidos, en base 36. */
export function pack(inputs) {
  const out = [];
  for (let i = 0; i < inputs.length; ) {
    let j = i;
    while (j < inputs.length && inputs[j] === inputs[i]) j++;
    out.push(inputs[i].toString(36) + (j - i).toString(36).padStart(1, '0') + '.');
    i = j;
  }
  return out.join('');
}
export function unpack(str) {
  const out = [];
  for (const part of str.split('.')) {
    if (!part) continue;
    const a = parseInt(part[0], 36), n = parseInt(part.slice(1), 36);
    for (let i = 0; i < n; i++) out.push(a);
  }
  return out;
}

/** Dibuja la pantalla en texto con el recorrido encima (para revisar a ojo qué hizo el buscador). */
export function trace(S0, inputs) {
  const S = clone(S0);
  const R = S.R;
  const CHS = ' #^v<>=%?:BS~{}';
  const grid = [];
  for (let y = 0; y < RH; y++) grid.push([...Array(RW)].map((_, x) => CHS[S.tiles[y * RW + x]] || '?'));
  R.ents.forEach((d) => {
    const mark = { [KIND.CP]: 'F', [KIND.CARROT]: 'Z', [KIND.SWITCH]: 'P', [KIND.STONE]: 'O', [KIND.SIGN]: 'i' }[d.k];
    if (mark) {
      const x = Math.floor(d.x), y = Math.floor(d.y - 0.5);
      if (grid[y]?.[x] === ' ') grid[y][x] = mark;
    }
  });
  let n = 0;
  for (const a of inputs) {
    step(S, a);
    const x = Math.floor(S.h.x), y = Math.floor(S.h.y - 0.35);
    if (y >= 0 && y < RH && x >= 0 && x < RW && ' ·'.includes(grid[y][x])) grid[y][x] = n++ % 10 === 0 ? 'o' : '·';
    if (S.h.dead) {
      if (grid[y]?.[x]) grid[y][x] = 'X';
      break;
    }
  }
  return grid.map((r) => r.join('')).join('\n');
}
