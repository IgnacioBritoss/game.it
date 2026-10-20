/**
 * Prisma — óptica pura (sin DOM): el tablero, las piezas y el trazado de los rayos. La usan el juego, el resolvedor,
 * el generador del desafío diario y las pruebas.
 *
 * Direcciones: 0 este (→), 1 sur (↓), 2 oeste (←), 3 norte (↑); girar a la derecha es +1 (sentido horario en pantalla).
 * Colores como bits que se suman (mezcla aditiva): rojo 1, verde 2, azul 4 → amarillo 3, magenta 5, cian 6, blanco 7.
 *
 * Mapa: filas de fichas de dos caracteres separadas por espacios (una por casilla):
 *   ..  vacío                         ##  pared
 *   >r  emisor hacia el este, rojo    (dirección > v < ^, color r g b w)
 *   *y  cristal que pide amarillo     (color r g b y m c w: la mezcla exacta que tiene que recibir)
 *   m0  espejo /   m1 espejo \        (dos caras: refleja de los dos lados)
 *   s0  divisor /  s1 divisor \       (medio espejo: deja pasar la luz y además la refleja)
 *   p0…p3  prisma que apunta al este, sur, oeste o norte: solo recibe luz por su base (la que viaja hacia donde
 *          apunta); el rojo sale doblando a la izquierda, el verde sigue derecho y el azul dobla a la derecha
 *   fr fg fb fy fm fc  filtro: deja pasar solo su color (el blanco sale de ese color)
 *   oa ob oc  portales (de a pares): la luz que entra a uno sale por el otro con la misma dirección
 * Letra minúscula = pieza que se gira tocándola; MAYÚSCULA = pieza atornillada (fija). Los filtros, emisores, cristales
 * y portales son siempre fijos en el tablero. `tray` es la bandeja: piezas que se arrastran al tablero (y ahí también
 * se giran), con su orientación inicial: ['m0', 'fr', …].
 */

export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];
export const ARROWS = '>v<^';
export const COLORS = { r: 1, g: 2, b: 4, y: 3, m: 5, c: 6, w: 7 };
/** Letra de cada mezcla (índice = bits). */
export const COLOR_CH = ['', 'r', 'g', 'y', 'b', 'm', 'c', 'w'];
export const KIND_CH = { m: 'mirror', s: 'splitter', p: 'prism', f: 'filter' };
/** Cantidad de orientaciones de cada pieza que gira. */
export const STATES = { mirror: 2, splitter: 2, prism: 4, filter: 1 };

/** Espejo / (o = 0) y \ (o = 1). */
export const reflect = (d, o) => (o === 0 ? 3 - d : d ^ 1);
export const left = (d) => (d + 3) & 3;
export const right = (d) => (d + 1) & 3;

/** Distancia de giro (tocar gira a la derecha; clic derecho o mantener apretado, a la izquierda). */
export function turnDist(from, to, n) {
  const k = (((to - from) % n) + n) % n;
  return Math.min(k, n - k);
}

/** Lee una ficha de pieza movible o giratoria ('m0', 'P2', 'fr'…). */
export function pieceFromToken(tok) {
  const k = KIND_CH[tok[0].toLowerCase()];
  if (!k) return null;
  const fixed = tok[0] !== tok[0].toLowerCase();
  if (k === 'filter') {
    const c = COLORS[tok[1]];
    if (!c || c === 7) throw new Error(`filtro de color inválido: ${tok}`);
    return { kind: k, o: 0, color: c, fixed: true };
  }
  const o = +tok[1];
  if (!(o >= 0 && o < STATES[k])) throw new Error(`orientación inválida: ${tok}`);
  return { kind: k, o, color: 0, fixed };
}

/**
 * Parte el nivel en lo fijo (paredes, emisores, cristales, portales, piezas atornilladas) y lo que se mueve
 * (piezas giratorias y de la bandeja). Devuelve { n, cells, pieces, emitters, targets, portal }.
 * `pieces`: [{ id, kind, o, color, mode: 'fixed' | 'rot' | 'move', cell, o0, cell0 }] (cell −1 = en la bandeja).
 */
export function parse(level, { loose = false } = {}) {
  const rows = level.map.map((r) => r.trim().split(/\s+/));
  const n = rows.length;
  if (n < 5 || n > 9) throw new Error(`tablero de ${n} filas (va de 5 a 9)`);
  for (const r of rows) if (r.length !== n) throw new Error(`el tablero tiene que ser cuadrado (${r.length} ≠ ${n})`);
  const N = n * n;
  const cells = new Uint8Array(N); // 0 vacío, 1 pared, 2 emisor, 3 cristal, 4 portal, 5 pieza
  const portal = new Int16Array(N).fill(-1);
  const pieces = [], emitters = [], targets = [];
  const ends = {};
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const tok = rows[y][x];
      const i = y * n + x;
      if (tok === '..') continue;
      if (tok === '##') cells[i] = 1;
      else if (ARROWS.includes(tok[0])) {
        const c = COLORS[tok[1]];
        if (!c || ![1, 2, 4, 7].includes(c)) throw new Error(`emisor de color inválido: ${tok}`);
        cells[i] = 2;
        emitters.push({ cell: i, d: ARROWS.indexOf(tok[0]), color: c });
      } else if (tok[0] === '*') {
        const c = COLORS[tok[1]];
        if (!c) throw new Error(`cristal de color inválido: ${tok}`);
        cells[i] = 3;
        targets.push({ cell: i, color: c });
      } else if (tok[0] === 'o' || tok[0] === 'O') {
        cells[i] = 4;
        (ends[tok[1]] ||= []).push(i);
      } else {
        const p = pieceFromToken(tok);
        if (!p) throw new Error(`ficha desconocida "${tok}" en ${x},${y}`);
        cells[i] = 5;
        pieces.push({ ...p, mode: p.fixed ? 'fixed' : 'rot', cell: i });
      }
    }
  for (const k in ends) {
    if (ends[k].length !== 2) throw new Error(`el portal ${k} tiene que tener dos bocas`);
    const [a, b] = ends[k];
    portal[a] = b;
    portal[b] = a;
  }
  for (const tok of level.tray || []) {
    const p = pieceFromToken(tok.toLowerCase());
    if (!p) throw new Error(`ficha de bandeja desconocida "${tok}"`);
    pieces.push({ ...p, mode: 'move', cell: -1 });
  }
  pieces.forEach((p, id) => {
    p.id = id;
    p.o0 = p.o;
    p.cell0 = p.cell;
    delete p.fixed;
  });
  if (!loose && !emitters.length) throw new Error('el nivel no tiene emisores');
  if (!loose && !targets.length) throw new Error('el nivel no tiene cristales');
  return { n, cells, portal, pieces, emitters, targets, ends };
}

/**
 * Traza todos los rayos. `at` es un Int16Array(n²) con el id de la pieza de cada casilla (−1 si no hay) y `pieces`
 * las piezas con su orientación actual. Devuelve:
 *   seg[c*4+d]   bits de la luz que sale del centro de la casilla c hacia d (hasta el centro de la vecina)
 *   stop[c*4+d]  cómo termina ese tramo: 0 sigue, 1 contra una pared o el borde (medio tramo), 2 contra una pieza
 *                que no la deja pasar (llega a su cara)
 *   depth[c*4+d] a cuántos pasos del emisor llega (para animar la luz que avanza)
 *   hit[t]       la mezcla que le llega a cada cristal
 *   lit[c]       1 si pasa luz por la casilla (para el resolvedor)
 *   won          todos los cristales reciben exactamente su color
 * Las vueltas en círculo y los rayos que se cruzan se resuelven marcando qué colores ya pasaron por cada
 * (casilla, dirección): nunca se procesa dos veces el mismo color en el mismo lugar.
 */
export function trace(board, at, pieces, out) {
  const { n, cells, portal, emitters, targets } = board;
  const N = n * n;
  const r = out || { seg: new Uint8Array(N * 4), stop: new Uint8Array(N * 4), depth: new Uint16Array(N * 4), hit: new Uint8Array(targets.length), lit: new Uint8Array(N), won: false, tIndex: null };
  if (out) {
    r.seg.fill(0);
    r.stop.fill(0);
    r.depth.fill(0);
    r.hit.fill(0);
    r.lit.fill(0);
  }
  if (!r.tIndex) {
    r.tIndex = new Int16Array(N).fill(-1);
    targets.forEach((t, i) => (r.tIndex[t.cell] = i));
  }
  const { seg, stop, depth, hit, lit, tIndex } = r;
  // cola de trabajo plana: casilla, dirección, color, profundidad
  const q = r.q || (r.q = new Int32Array(N * 4 * 3 * 4 + 64));
  let qh = 0, qt = 0;
  const push = (c, d, col, k) => {
    const s = c * 4 + d;
    const m = col & ~seg[s];
    if (!m) return;
    if (!seg[s]) depth[s] = k;
    seg[s] |= m;
    q[qt++] = c;
    q[qt++] = d;
    q[qt++] = m;
    q[qt++] = k;
  };
  for (const e of emitters) push(e.cell, e.d, e.color, 0);
  while (qh < qt) {
    const c = q[qh++], d = q[qh++], m = q[qh++], k = q[qh++];
    const x = (c % n) + DX[d], y = ((c / n) | 0) + DY[d];
    const s = c * 4 + d;
    if (x < 0 || y < 0 || x >= n || y >= n) {
      stop[s] = 1;
      continue;
    }
    const nx = y * n + x;
    const kind = cells[nx];
    if (kind === 1) {
      stop[s] = 1;
      continue;
    }
    if (kind === 2) {
      stop[s] = 2;
      continue;
    }
    if (kind === 3) {
      hit[tIndex[nx]] |= m;
      continue;
    }
    if (kind === 4) {
      push(portal[nx], d, m, k + 1);
      continue;
    }
    const pid = at[nx];
    if (pid < 0) {
      lit[nx] = 1;
      push(nx, d, m, k + 1);
      continue;
    }
    lit[nx] = 1;
    const p = pieces[pid];
    switch (p.kind) {
      case 'mirror':
        push(nx, reflect(d, p.o), m, k + 1);
        break;
      case 'splitter':
        push(nx, d, m, k + 1);
        push(nx, reflect(d, p.o), m, k + 1);
        break;
      case 'prism':
        if (p.o !== d) {
          stop[s] = 2;
          break;
        }
        if (m & 1) push(nx, left(d), 1, k + 1);
        if (m & 2) push(nx, d, 2, k + 1);
        if (m & 4) push(nx, right(d), 4, k + 1);
        break;
      case 'filter': {
        const f = m & p.color;
        if (f) push(nx, d, f, k + 1);
        else stop[s] = 2;
        break;
      }
    }
  }
  let won = true;
  for (let i = 0; i < targets.length; i++) if (hit[i] !== targets[i].color) won = false;
  r.won = won;
  return r;
}

/**
 * Una partida: estado de las piezas, jugadas (girar, poner, sacar), deshacer y reiniciar.
 * Cada jugada cuenta 1: girar una vez (para cualquier lado) o arrastrar una pieza a otro lugar.
 */
export class Game {
  constructor(level) {
    this.level = level;
    this.b = parse(level);
    this.n = this.b.n;
    this.pieces = this.b.pieces.map((p) => ({ ...p }));
    this.at = new Int16Array(this.n * this.n).fill(-1);
    for (const p of this.pieces) if (p.cell >= 0) this.at[p.cell] = p.id;
    this.hist = [];
    this.r = null;
    this.retrace();
  }
  get moves() {
    return this.hist.length;
  }
  retrace() {
    this.r = trace(this.b, this.at, this.pieces, this.r);
    return this.r;
  }
  won() {
    return this.r.won;
  }
  /** ¿Se puede girar? (las giratorias y las de la bandeja, puestas o no). */
  canTurn(id) {
    const p = this.pieces[id];
    return !!p && p.mode !== 'fixed' && STATES[p.kind] > 1;
  }
  /** Gira una pieza un paso (dir +1 a la derecha, −1 a la izquierda). */
  turn(id, dir = 1) {
    if (!this.canTurn(id)) return false;
    const p = this.pieces[id];
    const k = STATES[p.kind];
    p.o = (p.o + dir + k) % k;
    this.hist.push({ t: 'turn', id, dir });
    this.retrace();
    return true;
  }
  /** ¿Se puede soltar una pieza movible en esta casilla? (vacía, o es donde ya está). */
  canDrop(id, cell) {
    const p = this.pieces[id];
    if (!p || p.mode !== 'move') return false;
    if (cell < 0) return true;
    return this.b.cells[cell] === 0 && (this.at[cell] < 0 || this.at[cell] === id);
  }
  /** Lleva una pieza movible a una casilla (−1 = a la bandeja). Devuelve false si no se puede o no cambia nada. */
  place(id, cell) {
    const p = this.pieces[id];
    if (!this.canDrop(id, cell) || p.cell === cell) return false;
    const from = p.cell;
    if (from >= 0) this.at[from] = -1;
    p.cell = cell;
    if (cell >= 0) this.at[cell] = id;
    this.hist.push({ t: 'place', id, from, to: cell });
    this.retrace();
    return true;
  }
  undo() {
    const h = this.hist.pop();
    if (!h) return null;
    const p = this.pieces[h.id];
    if (h.t === 'turn') {
      const k = STATES[p.kind];
      p.o = (p.o - h.dir + k) % k;
    } else {
      if (h.to >= 0) this.at[h.to] = -1;
      p.cell = h.from;
      if (h.from >= 0) this.at[h.from] = h.id;
    }
    this.retrace();
    return h;
  }
  reset() {
    for (const p of this.pieces) {
      if (p.cell >= 0) this.at[p.cell] = -1;
      p.o = p.o0;
      p.cell = p.cell0;
    }
    for (const p of this.pieces) if (p.cell >= 0) this.at[p.cell] = p.id;
    this.hist = [];
    this.retrace();
  }
  /** Estado como lista compacta: [orientación, casilla] de cada pieza (para el resolvedor y las pistas). */
  config() {
    return this.pieces.map((p) => [p.o, p.cell]);
  }
}

/** Juega una solución escrita como texto: "R:x,y" gira a la derecha, "L:x,y" a la izquierda, "T2:x,y" pone la pieza 2 de la bandeja. */
export function replay(level, sol) {
  const g = new Game(level);
  const n = g.n;
  const trayIds = g.pieces.filter((p) => p.mode === 'move').map((p) => p.id);
  for (const a of String(sol).trim().split(/\s+/).filter(Boolean)) {
    const m = /^(R|L|T(\d+)):(\d+),(\d+)$/.exec(a);
    if (!m) throw new Error(`jugada inválida: ${a}`);
    const cell = +m[4] * n + +m[3];
    let ok;
    if (m[1] === 'R' || m[1] === 'L') ok = g.at[cell] >= 0 && g.turn(g.at[cell], m[1] === 'R' ? 1 : -1);
    else ok = g.place(trayIds[+m[2]], cell);
    if (!ok) throw new Error(`no se pudo jugar ${a}`);
  }
  return g;
}

/** Escribe como texto las jugadas que llevan de la configuración inicial a `cfg` ([orientación, casilla] por pieza). */
export function solText(level, cfg) {
  const b = parse(level);
  const n = b.n;
  const out = [];
  const trayIds = b.pieces.filter((p) => p.mode === 'move').map((p) => p.id);
  const xy = (c) => `${c % n},${(c / n) | 0}`;
  for (const p of b.pieces) {
    const [o, cell] = cfg[p.id];
    if (p.mode === 'move' && cell !== p.cell0) out.push(`T${trayIds.indexOf(p.id)}:${xy(cell)}`);
    if (p.mode === 'fixed' || o === p.o0) continue;
    const k = STATES[p.kind];
    const cw = (((o - p.o0) % k) + k) % k;
    const where = xy(cell);
    if (cw <= k - cw) for (let i = 0; i < cw; i++) out.push(`R:${where}`);
    else for (let i = 0; i < k - cw; i++) out.push(`L:${where}`);
  }
  return out.join(' ');
}

/** Dibujo del tablero en texto (para las herramientas y los mensajes de las pruebas). */
export function ascii(board, at, pieces, r) {
  const { n, cells, emitters, targets } = board;
  const rows = [];
  for (let y = 0; y < n; y++) {
    let s = '';
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      let t = ' .';
      if (cells[i] === 1) t = '##';
      else if (cells[i] === 2) {
        const e = emitters.find((e) => e.cell === i);
        t = ARROWS[e.d] + COLOR_CH[e.color];
      } else if (cells[i] === 3) {
        const k = targets.findIndex((t) => t.cell === i);
        t = (r && r.hit[k] === targets[k].color ? '✓' : '*') + COLOR_CH[targets[k].color];
      } else if (cells[i] === 4) t = '()';
      else if (at[i] >= 0) {
        const p = pieces[at[i]];
        t = p.kind === 'mirror' ? (p.o ? ' \\' : ' /') : p.kind === 'splitter' ? (p.o ? '%\\' : '%/') : p.kind === 'prism' ? 'P' + '>v<^'[p.o] : 'F' + COLOR_CH[p.color];
      } else if (r) {
        let m = 0;
        for (let d = 0; d < 4; d++) m |= r.seg[i * 4 + d];
        if (m) t = ' ' + COLOR_CH[m];
      }
      s += t + ' ';
    }
    rows.push(s);
  }
  return rows.join('\n');
}
