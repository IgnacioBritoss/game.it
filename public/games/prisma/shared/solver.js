/**
 * Prisma — resolvedor exacto (sin DOM). Busca la configuración ganadora más barata: cada giro cuesta 1 (para el lado
 * más corto) y cada arrastre de una pieza a otro lugar cuesta 1, así que el costo de una configuración es la suma de lo
 * que cambió cada pieza respecto del comienzo (las jugadas se pueden hacer en cualquier orden).
 *
 * La poda que lo hace rápido: en una solución óptima, toda pieza que cambió recibe luz (si no, dejarla como estaba sale
 * más barato). Y si se ordenan las piezas cambiadas según cuándo les llega la luz en la solución, a cada una le llega
 * luz ya en la configuración parcial que tiene cambiadas solo las anteriores (el camino hasta ella pasa por piezas que
 * no cambiaron o que ya se cambiaron). Entonces alcanza con probar, en cada paso, cambios en las casillas iluminadas:
 * girar una pieza que recibe luz o poner una pieza de la bandeja en una casilla vacía por la que pasa un rayo.
 * Con ramificación y poda (solo se sigue lo que cuesta menos que la mejor solución encontrada) y memoria de las
 * configuraciones ya vistas, la búsqueda termina y prueba que el mínimo es el mínimo.
 */
import { parse, trace, STATES, turnDist } from './optics.js';

/**
 * Busca la solución más barata desde el comienzo del nivel (o desde `from`: [[o, casilla], …] por pieza).
 *   bound     solo interesan soluciones que cuesten menos que esto (para probar que no hay nada mejor que el par)
 *   maxNodes  tope de configuraciones a revisar; si se pasa, `complete` es false
 * Devuelve { cost, cfg, nodes, complete } (cost null si no encontró ninguna por debajo de bound).
 */
export function solve(level, { from = null, bound = Infinity, maxNodes = 4e6 } = {}) {
  const b = parse(level);
  const N = b.n * b.n;
  const pieces = b.pieces.map((p) => ({ ...p }));
  if (from) pieces.forEach((p, i) => ([p.o, p.cell] = from[i]));
  const at = new Int16Array(N).fill(-1);
  for (const p of pieces) if (p.cell >= 0) at[p.cell] = p.id;
  // estado "de partida" de cada pieza (desde donde se cuentan los costos)
  const homeO = pieces.map((p) => p.o), homeCell = pieces.map((p) => p.cell);
  const dyn = pieces.filter((p) => p.mode !== 'fixed' && (p.mode === 'move' || STATES[p.kind] > 1));
  // piezas idénticas que esperan en la bandeja: se usan en orden (la primera libre) y se ordenan en la clave
  const group = new Int16Array(pieces.length).fill(-1);
  const groups = [];
  for (const p of dyn) {
    if (p.mode !== 'move' || homeCell[p.id] >= 0) continue;
    const sig = `${p.kind}:${p.color}:${homeO[p.id]}`;
    let gi = groups.findIndex((g) => g.sig === sig);
    if (gi < 0) gi = groups.push({ sig, ids: [] }) - 1;
    groups[gi].ids.push(p.id);
    group[p.id] = gi;
  }
  const solo = dyn.filter((p) => group[p.id] < 0).map((p) => p.id);
  const changed = new Uint8Array(pieces.length);
  const seen = new Set();
  const key = () => {
    let s = '';
    for (const id of solo) s += String.fromCharCode(pieces[id].o * 128 + pieces[id].cell + 1);
    for (const g of groups) {
      const v = g.ids.map((id) => pieces[id].o * 128 + pieces[id].cell + 1).sort((a, b) => a - b);
      s += '|' + String.fromCharCode(...v);
    }
    return s;
  };
  let best = bound, bestCfg = null, nodes = 0, aborted = false;
  const r0 = { buf: null };

  function dfs(cost) {
    if (aborted) return;
    if (++nodes > maxNodes) {
      aborted = true;
      return;
    }
    const r = (r0.buf = trace(b, at, pieces, r0.buf));
    if (r.won) {
      if (cost < best) {
        best = cost;
        bestCfg = pieces.map((p) => [p.o, p.cell]);
      }
      return;
    }
    if (cost + 1 >= best) return;
    // candidatos: casillas iluminadas (se copian porque la recursión vuelve a trazar)
    const litCells = [];
    for (let c = 0; c < N; c++) if (r.lit[c]) litCells.push(c);
    const free = [];
    for (const g of groups) {
      const id = g.ids.find((i) => !changed[i]);
      if (id !== undefined) free.push(id);
    }
    for (const id of solo) if (!changed[id] && pieces[id].mode === 'move') free.push(id);
    for (const c of litCells) {
      const pid = at[c];
      if (pid >= 0) {
        const p = pieces[pid];
        if (changed[pid] || p.mode === 'fixed') continue;
        const k = STATES[p.kind];
        // girarla donde está
        for (let o = 0; o < k; o++) {
          if (o === homeO[pid]) continue;
          const dc = turnDist(homeO[pid], o, k);
          if (cost + dc >= best) continue;
          p.o = o;
          changed[pid] = 1;
          visit(cost + dc);
          changed[pid] = 0;
          p.o = homeO[pid];
        }
        // una pieza movible ya puesta que recibe luz también se puede sacar a la bandeja
        if (p.mode === 'move' && cost + 1 < best) {
          at[c] = -1;
          p.cell = -1;
          changed[pid] = 1;
          visit(cost + 1);
          changed[pid] = 0;
          p.cell = c;
          at[c] = pid;
        }
        continue;
      }
      if (b.cells[c] !== 0) continue;
      // poner una pieza (de la bandeja o traída de otra casilla) en esta casilla vacía iluminada
      for (const id of free) {
        const p = pieces[id];
        const k = STATES[p.kind];
        const from = p.cell;
        for (let o = 0; o < k; o++) {
          const dc = 1 + turnDist(homeO[id], o, k);
          if (cost + dc >= best) continue;
          if (from >= 0) at[from] = -1;
          p.cell = c;
          p.o = o;
          at[c] = id;
          changed[id] = 1;
          visit(cost + dc);
          changed[id] = 0;
          at[c] = -1;
          p.cell = from;
          p.o = homeO[id];
          if (from >= 0) at[from] = id;
        }
      }
    }
  }
  function visit(cost) {
    const k = key();
    if (seen.has(k)) return;
    seen.add(k);
    dfs(cost);
  }
  seen.add(key());
  dfs(0);
  return { cost: bestCfg ? best : null, cfg: bestCfg, nodes, complete: !aborted };
}

/** Costo de ir de la configuración `a` a la `b` (las dos como [[o, casilla], …]). */
export function distance(level, a, b) {
  const { pieces } = parse(level);
  let c = 0;
  for (const p of pieces) {
    const [oa, ca] = a[p.id], [ob, cb] = b[p.id];
    if (p.mode === 'fixed') continue;
    if (p.mode === 'move') {
      if (ca !== cb) c++;
      if (cb < 0) continue; // si termina en la bandeja, la orientación no importa
    }
    c += turnDist(oa, ob, STATES[p.kind]);
  }
  return c;
}

/**
 * Pista: la solución más cercana a cómo está el tablero ahora y una pieza que hay que cambiar para llegar
 * (la primera que toca la luz). Si la búsqueda no termina a tiempo, usa la solución guardada del nivel.
 * Devuelve { id, o, cell, cost } o null si ya está resuelto.
 */
export function hint(level, now, { stored = null, maxNodes = 150000 } = {}) {
  let target = stored, cost = stored ? distance(level, now, stored) : Infinity;
  const r = solve(level, { from: now, bound: cost, maxNodes });
  if (r.cfg) {
    target = r.cfg;
    cost = r.cost;
  }
  if (!target) return null;
  const b = parse(level);
  // orden: por profundidad de la luz que llega a la casilla de destino (las de la bandeja, después)
  const at = new Int16Array(b.n * b.n).fill(-1);
  const ps = b.pieces.map((p) => ({ ...p }));
  ps.forEach((p, i) => ([p.o, p.cell] = target[i]));
  for (const p of ps) if (p.cell >= 0) at[p.cell] = p.id;
  const tr = trace(b, at, ps);
  const reach = (cell) => {
    if (cell < 0) return 1e9;
    let m = 1e9;
    const n = b.n;
    const x = cell % n, y = (cell / n) | 0;
    const nb = [[x - 1, y, 0], [x, y - 1, 1], [x + 1, y, 2], [x, y + 1, 3]];
    for (const [X, Y, d] of nb) {
      if (X < 0 || Y < 0 || X >= n || Y >= n) continue;
      const s = (Y * n + X) * 4 + d;
      if (tr.seg[s]) m = Math.min(m, tr.depth[s]);
    }
    return m;
  };
  const diff = b.pieces
    .filter((p) => {
      if (p.mode === 'fixed') return false;
      const [o, c] = now[p.id], [to, tc] = target[p.id];
      if (p.mode === 'move' && tc < 0) return c >= 0;
      return c !== tc || (STATES[p.kind] > 1 && o !== to);
    })
    .map((p) => ({ id: p.id, o: target[p.id][0], cell: target[p.id][1], depth: reach(target[p.id][1]) }))
    .sort((a, b) => a.depth - b.depth || a.id - b.id);
  if (!diff.length) return null;
  const { id, o, cell } = diff[0];
  return { id, o, cell, cost };
}
