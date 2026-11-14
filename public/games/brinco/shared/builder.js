/**
 * Brinco — armado de niveles por tramos. Cada tramo es una función que dibuja una sección de la pista (un foso, una
 * escalera, una cinta, un cañón…) sobre una grilla de 12 filas con el piso en la fila 10; los bordes de cada tramo
 * siempre tienen piso a la misma altura, así que se pueden pegar en cualquier orden y el recorrido sigue siendo
 * posible. Las distancias de los saltos están pensadas con margen (el salto normal cubre 6 baldosas de largo y 4
 * de alto). Un nivel es una lista de tramos con sus parámetros.
 */
import { H } from './sim.js';

const GROUND = 10;

class Chunk {
  constructor(w) {
    this.w = w;
    this.g = Array.from({ length: H }, () => Array(w).fill(' '));
  }
  set(x, y, ch) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && x < this.w && y >= 0 && y < H) this.g[y][x] = ch;
    return this;
  }
  rect(x0, y0, x1, y1, ch) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, ch);
    return this;
  }
  /** Piso sólido entre dos columnas, desde la fila `top` hasta abajo. */
  ground(x0 = 0, x1 = this.w - 1, top = GROUND, ch = '#') {
    return this.rect(x0, top, x1, H - 1, ch);
  }
  pit(x0, x1, ch = ' ') {
    return this.rect(x0, GROUND, x1, H - 1, ch);
  }
  text(x, y, s) {
    [...s].forEach((ch, i) => ch !== '.' && this.set(x + i, y, ch));
    return this;
  }
  coins(x, y, n, step = 1) {
    for (let i = 0; i < n; i++) this.set(x + i * step, y, '$');
    return this;
  }
  /** Arco de monedas: sube `rise` filas en el medio. */
  arc(cx, y, n, rise) {
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
      this.set(cx - (n - 1) / 2 + i, y - Math.round(rise * (1 - u * u)), '$');
    }
    return this;
  }
  plat(x, y, len, ch = '=') {
    return this.rect(x, y, x + len - 1, y, ch);
  }
  /** Enemigo u objeto parado sobre el piso. */
  ent(x, ch, y = GROUND - 1) {
    return this.set(x, y, ch);
  }
  rows() {
    return this.g.map((r) => r.join(''));
  }
}

const mid = (c) => Math.floor(c.w / 2);
const put = (c, list) => {
  for (const [x, ch, y] of list || []) c.ent(x, ch, y ?? GROUND - 1);
  return c;
};
const blocks = (c, list) => {
  for (const [x, y, ch] of list || []) c.set(x, y, ch);
  return c;
};

// ---------------------------------------------------------------- tramos
export const CHUNKS = {
  /** Inicio: el jugador aparece a 2 baldosas del borde. */
  start(w = 14, o = {}) {
    const c = new Chunk(w).ground();
    c.set(2, GROUND - 1, '@');
    c.coins(5, 8, 4);
    return put(c, o.e);
  },
  /** Llegada: el mástil de la meta. */
  goal(w = 14, o = {}) {
    const c = new Chunk(w).ground();
    c.rect(w - 5, 4, w - 5, 9, 'G');
    c.coins(2, 8, 4);
    return put(c, o.e);
  },
  /** Banderín de control: donde se vuelve a empezar. */
  checkpoint(w = 10, o = {}) {
    const c = new Chunk(w).ground();
    c.set(Math.floor(w / 2), GROUND - 1, 'F');
    return put(c, o.e);
  },
  flat(w = 16, o = {}) {
    const c = new Chunk(w).ground();
    if (o.coins !== false) c.coins(3, o.coinRow ?? 8, Math.max(2, w - 6));
    put(c, o.e);
    blocks(c, o.blocks);
    if (o.gem) c.set(o.gem[0], o.gem[1], '*');
    return c;
  },
  /** Un foso de `gw` baldosas (hasta 5) con monedas en arco. */
  gap(w = 14, o = {}) {
    const gw = Math.min(5, o.gw ?? 3);
    const c = new Chunk(w).ground();
    const a = Math.floor((w - gw) / 2);
    c.pit(a, a + gw - 1, o.lava ? '~' : ' ');
    if (o.lava) c.rect(a, GROUND + 1, a + gw - 1, H - 1, '~');
    c.arc(a + (gw - 1) / 2, 8, gw + 2, 2);
    return put(c, o.e);
  },
  /** Meseta de `h` baldosas (1 a 3) con escalones. */
  hill(w = 18, o = {}) {
    const h = Math.min(3, o.h ?? 2);
    const c = new Chunk(w).ground();
    const x0 = 3;
    const x1 = w - 4;
    for (let i = 1; i <= h; i++) {
      c.ground(x0 + (i - 1) * 2, x1 - (i - 1) * 2, GROUND - i);
    }
    c.coins(x0 + h * 2, GROUND - h - 2, Math.max(2, x1 - x0 - h * 4 + 1));
    put(c, o.e ? o.e.map(([x, ch]) => [x, ch, GROUND - h - 1]) : []);
    if (o.gem) c.set(mid(c), GROUND - h - 4, '*');
    return c;
  },
  /** Plataformas flotantes de ida sobre un foso grande. */
  platforms(w = 22, o = {}) {
    const c = new Chunk(w).ground(0, 2).ground(w - 3, w - 1);
    const hs = o.hs || [8, 7, 8, 7];
    const n = hs.length;
    const span = w - 8;
    hs.forEach((r, i) => {
      const x = 4 + Math.round((i * (span - 3)) / Math.max(1, n - 1));
      c.plat(x, r, 3);
      c.coins(x + 1, r - 2, 1);
    });
    if (o.gem) c.set(Math.round(w / 2), 3, '*');
    return c;
  },
  /** Fila de bloques con sorpresas y un bloque con premio. */
  blocks(w = 18, o = {}) {
    const c = new Chunk(w).ground();
    const x = mid(c) - 2;
    c.text(x, 7, o.row || 'B?A?B');
    c.coins(3, 8, 3).coins(w - 6, 8, 3);
    put(c, o.e);
    if (o.gem) c.set(x + 2, 2, '*');
    return c;
  },
  spikes(w = 16, o = {}) {
    const c = new Chunk(w).ground();
    const a = mid(c) - 1;
    c.rect(a, GROUND - 1, a + 2, GROUND - 1, '^');
    c.arc(a + 1, 7, 5, 2);
    return put(c, o.e);
  },
  /** Tubos con plantas que asoman. */
  pipes(w = 20, o = {}) {
    const c = new Chunk(w).ground();
    const xs = o.xs || [6, 13];
    for (const x of xs) {
      c.set(x, GROUND - 2, 'P').set(x, GROUND - 1, 'p');
      c.set(x, GROUND - 3, 'm');
    }
    c.coins(2, 8, 2).coins(w - 4, 8, 2);
    return c;
  },
  /** Un resorte que lanza hacia una plataforma alta con una gema. */
  spring(w = 16, o = {}) {
    const c = new Chunk(w).ground();
    c.set(5, GROUND - 1, 'S');
    c.plat(7, 3, 4);
    if (o.gem !== false) c.set(8, 2, '*');
    c.coins(8, 1, 2);
    c.coins(w - 5, 8, 3);
    return c;
  },
  movingH(w = 18, o = {}) {
    const c = new Chunk(w).ground(0, 2).ground(w - 3, w - 1);
    c.set(Math.floor(w / 2 - 1.5), GROUND - 1, 'h');
    c.arc(w / 2, 6, 6, 2);
    return c;
  },
  movingV(w = 20, o = {}) {
    const c = new Chunk(w).ground();
    c.ground(8, 11, 5);
    c.set(5, 7, 'u');
    c.coins(9, 3, 2);
    put(c, o.e ? o.e.map(([x, ch]) => [x, ch, 4]) : []);
    if (o.gem) c.set(10, 2, '*');
    return c;
  },
  /** Bloques que se desmoronan sobre el vacío. */
  crumble(w = 20, o = {}) {
    const c = new Chunk(w).ground(0, 2).ground(w - 3, w - 1);
    const groups = o.groups || 3;
    for (let i = 0; i < groups; i++) {
      const x = 4 + i * 5;
      c.rect(x, GROUND, x + 2, GROUND, 'c');
      c.coins(x, 8, 3);
    }
    return c;
  },
  cannons(w = 22, o = {}) {
    const c = new Chunk(w).ground();
    c.set(w - 2, GROUND - 1, 'n');
    if (o.both) c.set(1, GROUND - 1, 'N');
    c.coins(4, 8, 4).coins(11, 7, 4);
    return put(c, o.e);
  },
  thwomps(w = 24, o = {}) {
    const c = new Chunk(w).ground();
    const xs = o.xs || [7, 16];
    for (const x of xs) c.set(x, 3, 't');
    c.coins(2, 8, 3).coins(w - 5, 8, 3);
    return c;
  },
  /** Lava con islas para saltar de una a otra. */
  lava(w = 24, o = {}) {
    const c = new Chunk(w).ground(0, 2).ground(w - 3, w - 1);
    c.rect(3, GROUND, w - 4, H - 1, '~');
    const n = o.islands || 4;
    const step = (w - 8) / n;
    const xs = [];
    for (let i = 0; i < n; i++) {
      const x = Math.round(4 + i * step);
      xs.push(x);
      c.rect(x, GROUND, x + 1, GROUND, '#');
      c.coins(x, 8, 2);
    }
    if (o.gem) c.set(xs[Math.floor(n / 2)], 5, '*');
    return c;
  },
  /** Barra de fuego que gira sobre el camino. */
  fire(w = 20, o = {}) {
    const c = new Chunk(w).ground();
    for (const x of o.xs || [8, 15]) c.set(x, 7, 'o');
    c.coins(2, 8, 3).coins(w - 5, 8, 3);
    return c;
  },
  /** Piso de hielo: patina. */
  ice(w = 20, o = {}) {
    const c = new Chunk(w).ground();
    c.rect(2, GROUND, w - 3, H - 1, 'I');
    c.coins(4, 8, w - 8);
    return put(c, o.e);
  },
  conveyor(w = 20, o = {}) {
    const c = new Chunk(w).ground();
    const ch = o.left ? '<' : '>';
    c.rect(3, GROUND, w - 4, GROUND, ch).rect(3, GROUND + 1, w - 4, H - 1, '#');
    c.coins(5, 8, w - 10);
    return put(c, o.e);
  },
  /** Techo bajo con púas colgando sobre un foso: hay que cruzar con un saltito (sin mantener el salto del todo). */
  lowCeil(w = 18, o = {}) {
    const c = new Chunk(w).ground();
    const a = mid(c) - 1;
    c.pit(a, a + 1);
    c.rect(a - 2, 0, a + 3, 3, '#');
    c.rect(a - 1, 4, a + 2, 5, 'v');
    c.coins(a - 1, 8, 4);
    return c;
  },
  bats(w = 20, o = {}) {
    const c = new Chunk(w).ground();
    for (const [x, y] of o.bats || [[6, 6], [13, 7]]) c.set(x, y, 'b');
    c.coins(3, 8, w - 6);
    return put(c, o.e);
  },
  /** Plataformas que caen al pisarlas. */
  fallplat(w = 22, o = {}) {
    const c = new Chunk(w).ground(0, 2).ground(w - 3, w - 1);
    const n = o.n || 3;
    for (let i = 0; i < n; i++) c.set(4 + i * 5, 9, 'f');
    c.arc(w / 2, 6, 7, 2);
    return c;
  },
  /** Subida con plataformas hasta un escondite alto con gema. */
  climb(w = 18, o = {}) {
    const c = new Chunk(w).ground();
    c.plat(3, 7, 3).plat(7, 5, 3).plat(11, 3, 3);
    c.set(12, 2, '*');
    c.coins(4, 6, 1).coins(8, 4, 1);
    put(c, o.e);
    return c;
  },
  /** Arena del jefe: paredes a los costados y el jefe a la derecha; la salida aparece al vencerlo. */
  arena(w = 24, o = {}) {
    const c = new Chunk(w).ground();
    c.rect(w - 1, 5, w - 1, 9, '#');
    c.set(w - 8, GROUND - 1, 'Z');
    c.set(w - 3, GROUND - 1, 'g');
    c.rect(w - 3, 4, w - 3, 8, 'g');
    c.plat(5, 7, 3).plat(w - 9, 7, 3);
    return c;
  },
};

/** Arma un nivel: concatena los tramos y devuelve { rows, arena, ... }. */
export function buildLevel(def) {
  const chunks = [];
  let x = 0;
  let arena = null;
  for (const part of def.parts) {
    const [name, a, b] = part;
    const fn = CHUNKS[name];
    if (!fn) throw new Error(`${def.id}: tramo desconocido "${name}"`);
    const opts = typeof a === 'object' && a !== null ? a : b;
    const w = typeof a === 'number' ? a : undefined;
    const c = fn(w, opts || {});
    if (name === 'arena') arena = [x + 1, x + c.w - 1];
    chunks.push(c);
    x += c.w;
  }
  const rows = Array.from({ length: H }, (_, y) => chunks.map((c) => c.rows()[y]).join(''));
  return { ...def, rows, arena: arena || def.arena, width: x };
}
