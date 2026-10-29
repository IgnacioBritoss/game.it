/**
 * Dominó — dónde va cada ficha de la cadena. Todo en "celdas": una ficha mide 2×1 (cada mitad es una celda) y el origen
 * es el centro de la primera ficha. La cadena sale por las dos puntas; cada brazo corre en línea recta hasta el borde
 * (`limit` celdas a cada lado) y ahí dobla: baja (el derecho) o sube (el izquierdo) una ficha y vuelve por la fila de al
 * lado. Los dobles van cruzados a la fila, salvo en la vuelta. Las dos mitades de una ficha siempre se leen de izquierda a
 * derecha o de arriba hacia abajo: `a` y `b` son los números que se ven en cada una.
 *
 * Los dos brazos nunca se pisan: el derecho usa las filas del centro hacia abajo y el izquierdo las del centro hacia arriba.
 */

/**
 * Pone las fichas de un brazo. `C` es el centro de la celda abierta de donde sigue, `hd` la dirección de la fila ([1,0] o [-1,0])
 * y `turn` hacia dónde dobla (+1 abajo, -1 arriba).
 */
function walk(arm, C, hd, turn, limit, end) {
  C = C.slice();
  hd = hd.slice();
  let mode = 0; // 0: sigue derecho; 1: acaba de doblar y la que viene vuelve por la fila de al lado
  const out = [];
  arm.forEach((e, i) => {
    const dbl = e.n === e.o;
    let r;
    if (mode === 1) {
      const A = [C[0], C[1] + turn];
      const back = -hd[0];
      r = { x: A[0] + back / 2, y: A[1], v: false, a: back > 0 ? e.n : e.o, b: back > 0 ? e.o : e.n };
      C = [A[0] + back, A[1]];
      hd = [back, 0];
      mode = 0;
    } else if ((C[0] + (dbl ? 1.5 : 2.5) * hd[0]) * hd[0] <= limit - 1) {
      // derecho: un doble queda cruzado (de pie en la fila) y ocupa una sola celda de largo
      r = dbl ? { x: C[0] + hd[0], y: C[1], v: true, a: e.n, b: e.n } : { x: C[0] + 1.5 * hd[0], y: C[1], v: false, a: hd[0] > 0 ? e.n : e.o, b: hd[0] > 0 ? e.o : e.n };
      C = [C[0] + (dbl ? 1 : 2) * hd[0], C[1]];
    } else {
      // llegó al borde: baja (o sube) una ficha
      const A = [C[0] + hd[0], C[1]];
      r = { x: A[0], y: A[1] + turn / 2, v: true, a: turn > 0 ? e.n : e.o, b: turn > 0 ? e.o : e.n };
      C = [A[0], A[1] + turn];
      mode = 1;
    }
    out.push({ ...r, t: e.t, dbl, end, i });
  });
  return out;
}

const NORMAL = { t: '', n: -1, o: -2 };
const DOUBLE = { t: '', n: -1, o: -1 };

/** Los datos de salida de cada brazo: dónde queda abierta la celda y para dónde sigue. */
function starts(root) {
  const dbl = root.a === root.b;
  return [
    { C: [dbl ? 0 : -0.5, 0], hd: [-1, 0], turn: -1 },
    { C: [dbl ? 0 : 0.5, 0], hd: [1, 0], turn: 1 },
  ];
}

/**
 * Arma la cadena. `ghost`: null (nada), 'normal' o 'double': dónde caería la ficha que se está por poner en cada punta.
 * Devuelve { tiles, ghosts: [izq, der], box } (todo en celdas; `box` incluye lugar para una ficha más en cada punta, así
 * no se mueve todo cuando se elige una).
 */
export function layout(chain, limit = 6, ghost = null) {
  if (!chain.root) {
    const g = { x: 0, y: 0, v: false, a: -1, b: -1, ghost: true, end: -1 };
    return { tiles: [], ghosts: ghost ? [g, g] : [null, null], box: { x0: -1, y0: -0.5, x1: 1, y1: 0.5 } };
  }
  const r = chain.root;
  const rd = r.a === r.b;
  const root = { x: 0, y: 0, v: rd, a: r.a, b: r.b, t: r.t, dbl: rd, end: -1, i: -1, root: true };
  const st = starts(r);
  const arms = chain.arms.map((arm, k) => walk(arm, st[k].C, st[k].hd, st[k].turn, limit, k));
  const tiles = [root, ...arms[0], ...arms[1]];
  const ghostAt = (k, e) => {
    const arm = chain.arms[k];
    const g = walk([...arm, e], st[k].C, st[k].hd, st[k].turn, limit, k).pop();
    return { ...g, ghost: true };
  };
  const spare = [0, 1].map((k) => ghostAt(k, NORMAL));
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const t of [...tiles, ...spare]) {
    const w = t.v ? 1 : 2, h = t.v ? 2 : 1;
    box.x0 = Math.min(box.x0, t.x - w / 2);
    box.x1 = Math.max(box.x1, t.x + w / 2);
    box.y0 = Math.min(box.y0, t.y - h / 2);
    box.y1 = Math.max(box.y1, t.y + h / 2);
  }
  const ghosts = ghost ? (ghost === 'double' ? [0, 1].map((k) => ghostAt(k, DOUBLE)) : spare) : [null, null];
  return { tiles, ghosts, box };
}

/** El tamaño de la caja de una cadena de prueba larga con ese borde (para elegir el borde que más agranda las fichas). */
function worst(limit, count) {
  const per = Math.ceil(count / 2);
  const arm = Array.from({ length: per }, () => ({ t: '12', n: 1, o: 2 }));
  const L = layout({ root: { t: '12', a: 1, b: 2 }, arms: [arm, arm], ends: [2, 2] }, limit);
  return L.box;
}

/**
 * Qué tan lejos del centro dobla la cadena: el borde que, con una cadena larga, deja las fichas más grandes en un tablero de
 * `W`×`H` píxeles. Un tablero ancho pide un borde lejano; uno angosto, uno cercano.
 */
export function fitLimit(W, H, count = 22) {
  let best = 6;
  let bs = -1;
  for (let limit = 4; limit <= 14; limit++) {
    const b = worst(limit, count);
    const s = Math.min(W / (b.x1 - b.x0 + 0.6), H / (b.y1 - b.y0 + 0.6));
    if (s > bs + 1e-6) {
      bs = s;
      best = limit;
    }
  }
  return best;
}

/** Cuántos píxeles mide una celda para que la caja entre en `W`×`H` (con un margen), sin pasar de `cap`; y dónde cae el origen. */
export function fitBox(box, W, H, cap = 56, pad = 6) {
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  const cs = Math.max(8, Math.min(cap, (W - 2 * pad) / bw, (H - 2 * pad) / bh));
  return { cs, ox: W / 2 - ((box.x0 + box.x1) / 2) * cs, oy: H / 2 - ((box.y0 + box.y1) / 2) * cs };
}
