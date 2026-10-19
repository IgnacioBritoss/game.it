/**
 * Solcito — reglas de empujar cajas (puras, sin DOM; las usan el juego, las pruebas y el resolvedor).
 *
 * Mapa como lista de filas:
 *   #  pared            .  sol (lugar para una caja)      ~  hielo (lo que entra se resbala)
 *   o  caja             *  caja ya al sol                 c  gato (naranja)    k  segundo gato (negro)
 *   X  caja grande 2×2 (cuatro X juntas): solo se mueve si la empujan dos gatos a la vez
 *   A/a, B/b  bocas de un túnel de tela: lo que entra por una sale por la otra, un paso más allá, en la misma dirección
 *   espacio afuera de las paredes: nada (no se dibuja)
 *
 * Gana cuando todas las cajas (las celdas de las grandes también) están al sol.
 */

export const DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
export const DIR_KEYS = ['U', 'D', 'L', 'R'];

export function parse(level) {
  const rows = level.map;
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const n = w * h;
  const wall = new Uint8Array(n), ice = new Uint8Array(n), target = new Uint8Array(n), floor = new Uint8Array(n);
  const portal = new Int32Array(n).fill(-1);
  const cats = [], boxes = [], bigCells = [];
  const ends = {};
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x] ?? ' ';
      const i = y * w + x;
      if (ch === '#') wall[i] = 1;
      if (ch === '.' || ch === '*') target[i] = 1;
      if (ch === '~') ice[i] = 1;
      if (ch === 'o' || ch === '*') boxes.push(i);
      if (ch === 'c') cats[0] = i;
      if (ch === 'k') cats[1] = i;
      if (ch === 'X') bigCells.push(i);
      if (/[AaBb]/.test(ch)) (ends[ch.toUpperCase()] ||= []).push(i);
    }
  for (const k in ends) {
    const [p, q] = ends[k];
    portal[p] = q;
    portal[q] = p;
  }
  // el piso: lo que se alcanza desde los gatos sin cruzar paredes (afuera queda vacío)
  const seen = new Uint8Array(n);
  const stack = cats.filter((c) => c !== undefined);
  while (stack.length) {
    const i = stack.pop();
    if (seen[i] || wall[i]) continue;
    seen[i] = 1;
    floor[i] = 1;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
    if (portal[i] >= 0) stack.push(portal[i]);
  }
  // cajas grandes: esquina de arriba a la izquierda de cada bloque de cuatro X
  const bigs = [];
  const used = new Set();
  for (const i of bigCells.sort((a, b) => a - b)) {
    if (used.has(i)) continue;
    const q = [i, i + 1, i + w, i + w + 1];
    if (!q.every((c) => bigCells.includes(c))) throw new Error(`caja grande incompleta en ${i}`);
    q.forEach((c) => used.add(c));
    bigs.push(i);
  }
  for (const i of [...boxes, ...bigCells]) floor[i] = 1;
  return { w, h, wall, ice, target, floor, portal, start: { cats: cats.filter((c) => c !== undefined), boxes, bigs } };
}

const bigCellsOf = (p, w) => [p, p + 1, p + w, p + w + 1];

/** Estado de una partida (posiciones como índices de celda). */
export class Puzzle {
  constructor(level) {
    this.level = level;
    this.m = parse(level);
    this.reset();
  }

  reset() {
    const s = this.m.start;
    this.s = { cats: [...s.cats], boxes: [...s.boxes], bigs: [...s.bigs] };
    this.hist = [];
    this.moves = 0;
  }

  get w() {
    return this.m.w;
  }

  /** Qué hay en la celda i: { t: 'cat'|'box'|'big', id } o null. */
  at(i, s = this.s) {
    let k = s.cats.indexOf(i);
    if (k >= 0) return { t: 'cat', id: k };
    k = s.boxes.indexOf(i);
    if (k >= 0) return { t: 'box', id: k };
    const w = this.m.w;
    for (let b = 0; b < s.bigs.length; b++) if (bigCellsOf(s.bigs[b], w).includes(i)) return { t: 'big', id: b };
    return null;
  }

  free(i, s = this.s) {
    const m = this.m;
    return i >= 0 && i < m.w * m.h && m.floor[i] && !m.wall[i] && m.portal[i] < 0 && !this.at(i, s);
  }

  step(i, d) {
    const [dx, dy] = DIRS[d];
    const x = (i % this.m.w) + dx, y = ((i / this.m.w) | 0) + dy;
    if (x < 0 || y < 0 || x >= this.m.w || y >= this.m.h) return -1;
    return y * this.m.w + x;
  }

  /** Un paso: si cae en la boca de un túnel, sale por la otra un paso más allá. Devuelve [celda, pasóPorTúnel]. */
  stepThrough(i, d) {
    let n = this.step(i, d);
    if (n >= 0 && this.m.portal[n] >= 0) return [this.step(this.m.portal[n], d), n];
    return [n, -1];
  }

  /** Recorrido de algo que se mueve libremente desde i hacia d (se resbala en el hielo). [] si no puede ni empezar. */
  travel(i, d, s) {
    const path = [];
    let cur = i;
    for (let guard = 0; guard < 200; guard++) {
      const [n, via] = this.stepThrough(cur, d);
      if (!this.free(n, s)) break;
      path.push({ to: n, via });
      cur = n;
      if (!this.m.ice[n]) break;
    }
    return path;
  }

  /**
   * Mueve el gato `ci` hacia `d`. Devuelve { ok, moved: [{ t, id, from, path }], bump, pushed } y, si se movió,
   * guarda el estado anterior para deshacer.
   */
  move(ci, d) {
    const s = this.s;
    const from = s.cats[ci];
    if (from === undefined) return { ok: false };
    const [t, via] = this.stepThrough(from, d);
    const m = this.m;
    if (t < 0 || !m.floor[t] || m.wall[t] || m.portal[t] >= 0) return { ok: false, bump: true };
    const o = this.at(t);
    const prev = { cats: [...s.cats], boxes: [...s.boxes], bigs: [...s.bigs] };
    const moved = [];
    if (!o) {
      // caminar (y resbalarse)
      const path = this.travel(from, d, s);
      if (!path.length) return { ok: false, bump: true };
      s.cats[ci] = path[path.length - 1].to;
      moved.push({ t: 'cat', id: ci, from, path });
    } else if (o.t === 'box') {
      // empujar una caja: ella se desliza; el gato ocupa su lugar
      const path = this.travel(t, d, s);
      if (!path.length) return { ok: false, bump: true, blocked: o };
      s.boxes[o.id] = path[path.length - 1].to;
      s.cats[ci] = t;
      moved.push({ t: 'box', id: o.id, from: t, path }, { t: 'cat', id: ci, from, path: [{ to: t, via }] });
    } else if (o.t === 'big') {
      if (via >= 0) return { ok: false, bump: true };
      const p = s.bigs[o.id];
      const cells = bigCellsOf(p, m.w);
      const back = cells.map((c) => this.step(c, opposite(d))).filter((c) => !cells.includes(c));
      const front = cells.map((c) => this.step(c, d)).filter((c) => !cells.includes(c));
      const helpers = back.map((c) => s.cats.indexOf(c));
      if (helpers.some((k) => k < 0)) return { ok: false, bump: true, needTwo: true, blocked: o };
      if (!front.every((c) => this.free(c, s))) return { ok: false, bump: true, blocked: o };
      s.bigs[o.id] = this.step(p, d);
      moved.push({ t: 'big', id: o.id, from: p, path: [{ to: s.bigs[o.id], via: -1 }] });
      for (const k of helpers) {
        const f = s.cats[k];
        s.cats[k] = this.step(f, d);
        moved.push({ t: 'cat', id: k, from: f, path: [{ to: s.cats[k], via: -1 }] });
      }
    } else return { ok: false, bump: true, blocked: o };
    this.hist.push(prev);
    this.moves++;
    return { ok: true, moved, pushed: o ? o.t : null, won: this.won() };
  }

  undo() {
    const p = this.hist.pop();
    if (!p) return false;
    this.s = p;
    this.moves--;
    return true;
  }

  won(s = this.s) {
    const m = this.m;
    for (const b of s.boxes) if (!m.target[b]) return false;
    for (const p of s.bigs) for (const c of bigCellsOf(p, m.w)) if (!m.target[c]) return false;
    return true;
  }

  /** Cuántas cajas (contando cada celda de las grandes) están al sol. */
  sunny(s = this.s) {
    const m = this.m;
    let n = 0;
    for (const b of s.boxes) n += m.target[b];
    for (const p of s.bigs) for (const c of bigCellsOf(p, m.w)) n += m.target[c];
    return n;
  }
}

export const opposite = (d) => ({ U: 'D', D: 'U', L: 'R', R: 'L' })[d];

/** Juega una solución escrita como "c0:URRD k1:L…" o, con un solo gato, "URRDL". Devuelve el rompecabezas al final. */
export function replay(level, sol) {
  const P = new Puzzle(level);
  let ci = 0;
  for (const ch of sol.replace(/\s+/g, '')) {
    if (ch === '1' || ch === '2') {
      ci = +ch - 1;
      continue;
    }
    const r = P.move(ci, ch);
    if (!r.ok) throw new Error(`movida imposible ${ch} en la jugada ${P.moves + 1}`);
  }
  return P;
}

/**
 * Busca la solución más corta (en movidas) a lo ancho. Los gatos son intercambiables para la búsqueda. Devuelve la
 * solución como texto ("1" / "2" eligen el gato) o null si no hay en `limit` estados.
 */
export function solve(level, limit = 3e6) {
  const P = new Puzzle(level);
  const two = P.s.cats.length > 1;
  const key = (s) => `${[...s.cats].sort((a, b) => a - b).join(',')}|${[...s.boxes].sort((a, b) => a - b).join(',')}|${[...s.bigs].sort((a, b) => a - b).join(',')}`;
  const start = P.s;
  const seen = new Map([[key(start), null]]);
  let frontier = [start];
  const parent = new Map();
  while (frontier.length && seen.size < limit) {
    const next = [];
    for (const s of frontier) {
      for (let ci = 0; ci < s.cats.length; ci++)
        for (const d of DIR_KEYS) {
          P.s = { cats: [...s.cats], boxes: [...s.boxes], bigs: [...s.bigs] };
          P.hist = [];
          const r = P.move(ci, d);
          if (!r.ok) continue;
          const ns = P.s;
          const k = key(ns);
          if (seen.has(k)) continue;
          seen.set(k, null);
          parent.set(ns, [s, ci, d]);
          if (P.won(ns)) {
            // reconstruir
            const out = [];
            let cur = ns;
            while (parent.has(cur)) {
              const [ps, c, dd] = parent.get(cur);
              out.push([c, dd]);
              cur = ps;
            }
            out.reverse();
            let txt = '', sel = 0;
            for (const [c, dd] of out) {
              if (two && c !== sel) {
                txt += String(c + 1);
                sel = c;
              }
              txt += dd;
            }
            return { moves: out.length, sol: txt, states: seen.size };
          }
          next.push(ns);
        }
    }
    frontier = next;
  }
  return null;
}
