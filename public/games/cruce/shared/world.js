/**
 * Cruce — lógica pura (sin DOM): el mundo con semilla y el personaje que salta de a una casilla.
 *
 * El mundo es una tira infinita de filas (fila 0 = salida, hacia adelante crece). Cada fila es pasto (con árboles y
 * piedras que tapan), calle (autos y camiones), vías (un tren cada tanto, con aviso) o río (troncos que se mueven o
 * camalotes quietos). Lo que se mueve es una función del tiempo t (segundos desde la largada): x = f(t). Así, con la
 * misma semilla y el mismo t, todos ven el mismo tráfico (la carrera online no necesita sincronizar autos).
 *
 * Columnas jugables: -HALF..HALF. Afuera hay decorado (y los autos aparecen y desaparecen por ahí).
 */
export const HALF = 4;
export const SPAN = 30; // largo del circuito por el que dan la vuelta los autos y los troncos (de -15 a 15)
export const HOP = 0.13; // duración de un salto (s)
export const TRAIN_SPEED = 34;
export const TRAIN_LEN = 16;
export const WARN = 1.7; // aviso del tren antes de que pase (s)
export const L = { GRASS: 0, ROAD: 1, RAIL: 2, RIVER: 3 };
const EDGE = SPAN / 2;

const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mod = (a, n) => ((a % n) + n) % n;

/** RNG con semilla (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
export function seedOf(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % 2147483647 || 1;
}

/** Dificultad según la distancia (0 al principio, 1 a la fila 320). */
export const level = (r) => clamp(r / 320, 0, 1);

/** Fila meta de la carrera según el largo, y puntos de control (vuelve ahí al perder). */
export const RACE_ROWS = { short: 60, medium: 100, long: 150 };
export const CHECK_EVERY = 25;

export class World {
  /** `finish`: fila de llegada (carrera) o 0 (infinito). */
  constructor(seed, { finish = 0 } = {}) {
    this.seed = seed;
    this.finish = finish;
    this.r = rng(seed);
    this.rows = [];
    this.path = 0; // columna que siempre queda libre en el pasto (garantiza que se puede pasar)
    this.taken = new Set(); // monedas ya agarradas ("fila:columna")
    for (let i = 0; i < 3; i++) this.rows.push(this.grass(i, true));
  }

  /** La fila r (se generan en orden, a demanda). Las filas negativas son decorado que tapa. */
  row(r) {
    if (r < 0) return { type: L.GRASS, trees: new Set([-4, -3, -2, -1, 0, 1, 2, 3, 4]), blocked: true, decor: decorOf(this.seed, r), coins: new Set() };
    while (this.rows.length <= r) this.genSegment();
    return this.rows[r];
  }

  genSegment() {
    const r = this.r;
    const at = this.rows.length;
    const d = level(at);
    const prev = this.rows[at - 1];
    // después de un peligro casi siempre hay pasto para respirar
    if (prev && prev.type !== L.GRASS && r() < 0.66) {
      const n = r() < 0.1 + 0.25 * (1 - d) ? 2 : 1;
      for (let i = 0; i < n; i++) this.push(this.grass(this.rows.length));
      return;
    }
    const roll = r();
    const wRoad = 0.42, wRiver = at > 8 ? 0.3 : 0, wRail = at > 14 ? 0.16 : 0;
    const tot = wRoad + wRiver + wRail + 0.06;
    let pick = roll * tot;
    if ((pick -= wRoad) < 0) {
      const n = 1 + Math.floor(r() * (2 + 2.6 * d));
      let dir = r() < 0.5 ? 1 : -1;
      for (let i = 0; i < n; i++) {
        this.push(this.road(this.rows.length, dir, d));
        if (r() < 0.75) dir = -dir;
      }
    } else if ((pick -= wRiver) < 0) {
      const n = 1 + Math.floor(r() * (1.6 + 2.2 * d));
      const pads = r() < 0.3 - 0.15 * d;
      let dir = r() < 0.5 ? 1 : -1;
      for (let i = 0; i < n; i++) {
        this.push(pads && i % 2 === 0 ? this.pads(this.rows.length) : this.logs(this.rows.length, dir, d));
        dir = -dir;
      }
    } else if ((pick -= wRail) < 0) {
      const n = r() < 0.25 + 0.3 * d ? 2 : 1;
      for (let i = 0; i < n; i++) this.push(this.rail(this.rows.length, d));
    } else this.push(this.grass(this.rows.length));
  }

  push(row) {
    const at = this.rows.length;
    if (this.finish && at > 0 && (at % CHECK_EVERY === 0 || at === this.finish) && at <= this.finish) {
      // carrera: pasto ancho en cada punto de control y en la meta
      this.rows.push(this.grass(at, true, at >= this.finish ? 'finish' : 'check'));
    }
    if (this.finish && this.rows.length > this.finish) row = this.grass(this.rows.length, true);
    this.rows.push(row);
  }

  grass(at, open = false, mark = null) {
    const r = this.r;
    const d = level(at);
    const trees = new Set();
    // el camino libre se corre de a poco (solo en el pasto, así en el río y la calle sigue igual)
    const from = this.path;
    if (!open && r() < 0.5) this.path = clamp(this.path + (r() < 0.5 ? -1 : 1) * (1 + Math.floor(r() * 2)), -HALF + 1, HALF - 1);
    const lo = Math.min(from, this.path), hi = Math.max(from, this.path);
    if (!open) {
      const n = Math.floor(r() * (2.2 + 2.6 * d));
      for (let k = 0; k < n; k++) {
        const c = -HALF + Math.floor(r() * (HALF * 2 + 1));
        if (c >= lo && c <= hi) continue; // nunca tapa el camino (ni el tramo que se corrió)
        trees.add(c);
      }
    }
    const coins = new Set();
    if (!open && r() < 0.16) {
      const c = -HALF + Math.floor(r() * (HALF * 2 + 1));
      if (!trees.has(c)) coins.add(c);
    }
    return { type: L.GRASS, trees, coins, decor: decorOf(this.seed, at), mark, shade: at % 2 };
  }

  road(at, dir, d) {
    const r = this.r;
    const truck = r() < 0.18 + 0.2 * d;
    const len = truck ? 2.6 : 1.5;
    const speed = (truck ? 0.8 : 1) * lerp(2.1, 5.4, d) * (0.8 + r() * 0.45);
    // autos a lo largo del circuito con huecos que alcanzan para pasar
    const minGap = 2.6 - 0.5 * d;
    const cars = lay(r, () => len, () => minGap + r() * lerp(8, 3.4, d), minGap).map((c) => ({ ...c, kind: truck ? 'truck' : Math.floor(r() * 4) }));
    const coins = new Set();
    if (r() < 0.06) coins.add(-HALF + Math.floor(r() * (HALF * 2 + 1)));
    return { type: L.ROAD, dir, speed, cars, len, coins };
  }

  logs(at, dir, d) {
    const r = this.r;
    const speed = lerp(1.1, 2.6, d) * (0.8 + r() * 0.45);
    const logs = lay(r, () => Math.round(lerp(3.2, 2, d) + r() * 1.6), () => lerp(1.4, 2.8, d) * (0.7 + r() * 0.6), 1.2);
    return { type: L.RIVER, dir, speed, logs, coins: new Set() };
  }

  pads(at) {
    const r = this.r;
    const pads = new Set([this.path]);
    const n = 2 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) pads.add(-HALF + Math.floor(r() * (HALF * 2 + 1)));
    return { type: L.RIVER, pads, logs: [], speed: 0, dir: 1, coins: new Set() };
  }

  rail(at, d) {
    const r = this.r;
    const period = lerp(9.5, 5.2, d) * (0.8 + r() * 0.45);
    return { type: L.RAIL, period, phase: r() * period, dir: r() < 0.5 ? 1 : -1, coins: new Set() };
  }

  // ------------------------------------------------------------ lo que se mueve (función de t)
  /** Centro x de un auto o tronco (o de un objeto del circuito en la posición o) en el instante t. */
  static loopX(o, dir, speed, t) {
    const p = mod(o + speed * t, SPAN);
    return dir > 0 ? -EDGE + p : EDGE - p;
  }

  /** Autos de la fila: [{ x, len, kind }]. */
  cars(row, t) {
    return row.cars.map((c) => ({ x: World.loopX(c.o, row.dir, row.speed, t), len: c.len, kind: c.kind }));
  }

  /** Troncos de la fila: [{ x, len }]. */
  logsAt(row, t) {
    return row.logs.map((l) => ({ x: World.loopX(l.o, row.dir, row.speed, t), len: l.len }));
  }

  /** Tren de una fila de vías: { x0, x1 } (lo que ocupa) o null; y si suena la alarma. */
  train(row, t) {
    const dur = (SPAN + TRAIN_LEN) / TRAIN_SPEED;
    const k = mod(t + row.phase, row.period);
    const warn = k > row.period - WARN || k < dur;
    if (k >= dur) return { on: null, warn };
    const head = -EDGE - TRAIN_LEN + k * TRAIN_SPEED; // avanza de izquierda a derecha
    const x0 = row.dir > 0 ? head : -head - TRAIN_LEN;
    return { on: { x0, x1: x0 + TRAIN_LEN }, warn };
  }

  /** ¿Algo atropella al que está en (x) de la fila r en el instante t? 'car' | 'train' | null. */
  hit(r, x, t, w = 0.32) {
    const row = this.row(r);
    if (row.type === L.ROAD) {
      for (const c of this.cars(row, t)) if (Math.abs(c.x - x) < c.len / 2 + w) return 'car';
    } else if (row.type === L.RAIL) {
      const tr = this.train(row, t).on;
      if (tr && x + w > tr.x0 && x - w < tr.x1) return 'train';
    }
    return null;
  }

  /** En el río: qué sostiene al que cae en x: { kind: 'log', v } | { kind: 'pad', x } | null (agua). */
  support(r, x, t) {
    const row = this.row(r);
    if (row.type !== L.RIVER) return { kind: 'ground' };
    if (row.pads) {
      const c = Math.round(x);
      return row.pads.has(c) && Math.abs(c - x) < 0.45 ? { kind: 'pad', x: c } : null;
    }
    for (const l of this.logsAt(row, t)) if (Math.abs(l.x - x) < l.len / 2 + 0.12) return { kind: 'log', v: row.dir * row.speed, log: l };
    return null;
  }

  blocked(r, c) {
    if (Math.abs(c) > HALF) return true;
    const row = this.row(r);
    return row.type === L.GRASS && (row.blocked || row.trees.has(c));
  }

  coinAt(r, c) {
    const row = this.row(r);
    return row.coins.has(c) && !this.taken.has(`${r}:${c}`);
  }
}

/**
 * Reparte cosas a lo largo del circuito (largo SPAN, que da la vuelta): cada una con su largo y su hueco, sin que se pisen
 * al dar la vuelta (el último hueco nunca es menor que `minGap`). Devuelve [{ o (centro), len }].
 */
function lay(r, lenOf, gapOf, minGap) {
  const out = [];
  const start = r() * SPAN;
  let cur = 0;
  for (;;) {
    const len = lenOf();
    if (cur + len + minGap > SPAN) break;
    out.push({ o: start + cur + len / 2, len });
    cur += len + gapOf();
  }
  return out;
}

/** Decorado de afuera de la zona jugable (árboles a los costados), fijo por semilla y fila. */
function decorOf(seed, at) {
  const r = rng(seed ^ Math.imul(at + 1000, 2654435761));
  const out = [];
  for (let c = HALF + 1; c <= HALF + 7; c++) {
    if (r() < 0.42) out.push(c);
    if (r() < 0.42) out.push(-c);
  }
  return out;
}

/**
 * El que salta. `press(dir)` ('up' | 'down' | 'left' | 'right') salta de a una casilla; si está en el aire, guarda una
 * orden. `step(dt, t)` avanza y devuelve eventos:
 *   { t: 'hop', dir } · { t: 'land', row } · { t: 'bump' } · { t: 'coin', row, col } · { t: 'die', cause } · { t: 'finish' }
 * Causas: 'car' | 'train' | 'water' | 'swept' (el tronco lo llevó afuera).
 */
export class Hopper {
  constructor(world, { row = 0, col = 0, minRow = 0 } = {}) {
    this.w = world;
    this.minRow = minRow;
    this.reset(row, col);
  }

  reset(row, col = 0) {
    this.row = row;
    this.x = col;
    this.hop = null;
    this.queue = null;
    this.alive = true;
    this.cause = null;
    this.best = Math.max(this.best || 0, row);
    this.face = 'up';
    this.ride = 0; // velocidad del tronco donde está parado
    this.done = false;
  }

  /** Fila donde "está" ahora (a mitad de salto ya cuenta la de destino). */
  get curRow() {
    return this.hop && this.hop.k > 0.5 ? this.hop.to : this.row;
  }

  press(dir) {
    if (!this.alive || this.done) return false;
    if (this.hop) {
      this.queue = dir;
      return false;
    }
    return this.start(dir);
  }

  start(dir) {
    this.face = dir;
    let row = this.row;
    let col = Math.round(this.x);
    if (dir === 'up') row++;
    else if (dir === 'down') row--;
    else if (dir === 'left') col--;
    else if (dir === 'right') col++;
    // en un tronco, los saltos de costado van a la casilla vecina (relativo a donde está)
    const fromX = this.x;
    let toX = dir === 'left' || dir === 'right' ? (this.ride ? this.x + (dir === 'left' ? -1 : 1) : col) : this.ride && this.w.row(row).type === L.RIVER && !this.w.row(row).pads ? this.x : col;
    if (row < this.minRow || this.w.blocked(row, Math.round(toX)) || Math.abs(toX) > HALF + 0.5) {
      this.bumped = true;
      return false;
    }
    this.hop = { from: this.row, to: row, fx: fromX, tx: toX, k: 0 };
    return true;
  }

  step(dt, t) {
    const ev = [];
    if (this.bumped) {
      this.bumped = false;
      ev.push({ t: 'bump' });
    }
    if (!this.alive || this.done) return ev;
    if (this.hop) {
      const h = this.hop;
      if (h.k === 0) ev.push({ t: 'hop', dir: this.face });
      h.k = Math.min(1, h.k + dt / HOP);
      // el tronco sigue moviendo el destino mientras está en el aire
      if (this.ride && h.to === h.from) h.tx += this.ride * dt;
      this.x = h.fx + (h.tx - h.fx) * h.k;
      if (h.k >= 1) {
        this.hop = null;
        this.row = h.to;
        this.land(ev, t);
        if (this.alive && this.queue) {
          const q = this.queue;
          this.queue = null;
          if (!this.start(q)) {
            this.bumped = false;
            ev.push({ t: 'bump' });
          }
        }
      }
    } else if (this.ride) {
      this.x += this.ride * dt;
      if (Math.abs(this.x) > HALF + 0.6) this.die(ev, 'swept');
    }
    if (this.alive) {
      const cause = this.w.hit(this.curRow, this.x, t);
      if (cause) this.die(ev, cause);
    }
    return ev;
  }

  land(ev, t) {
    const row = this.w.row(this.row);
    this.ride = 0;
    if (row.type === L.RIVER) {
      const s = this.w.support(this.row, this.x, t);
      if (!s) return this.die(ev, 'water');
      if (s.kind === 'pad') this.x = s.x;
      else this.ride = s.v;
    } else this.x = Math.round(this.x);
    if (this.row > this.best) this.best = this.row;
    ev.push({ t: 'land', row: this.row });
    const c = Math.round(this.x);
    if (this.w.coinAt(this.row, c)) {
      this.w.taken.add(`${this.row}:${c}`);
      ev.push({ t: 'coin', row: this.row, col: c });
    }
    if (this.w.finish && this.row >= this.w.finish) {
      this.done = true;
      ev.push({ t: 'finish' });
    }
  }

  die(ev, cause) {
    this.alive = false;
    this.cause = cause;
    this.hop = null;
    this.queue = null;
    ev.push({ t: 'die', cause });
  }
}

/** Tiempo mínimo (ms) para llegar a la fila `rows` saltando sin parar: el servidor lo usa contra trampas. */
export const minRaceMs = (rows) => Math.floor(rows * HOP * 1000 * 0.85);
