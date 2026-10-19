/**
 * Espiral — lógica pura (sin DOM): la torre generada con semilla y la caída de la pelota.
 * La usan el navegador (los tres modos), el servidor (tiempo mínimo de la carrera) y las pruebas.
 *
 * La torre es una pila de anillos: el anillo i tiene su cara de arriba en y = -i·SPACING y está dividido en SEG porciones
 * (huecos, piso, peligro o peligro que titila). La pelota no se mueve en horizontal: rebota siempre en el mismo ángulo
 * del mundo (BALL_A, el lado que mira a la cámara) y lo que gira es la torre (`rot`). La porción que toca se busca con el
 * ángulo local φ = BALL_A − rot − giro propio del anillo.
 *
 * Reglas: pasar por un hueco suma (combo creciente hasta volver a tocar piso); con 3 anillos seguidos sin tocar la pelota
 * se prende fuego y rompe el próximo anillo que toque, aunque sea peligro; tocar peligro sin fuego es perder; llegar al
 * anillo meta termina la torre.
 */
export const SEG = 12;
export const SEG_A = (Math.PI * 2) / SEG;
export const SPACING = 3;
export const THICK = 0.36;
export const R_IN = 0.95;
export const R_OUT = 2.55;
export const POLE_R = 0.86;
export const BALL_R = 0.3;
export const ORBIT = 1.75;
export const BALL_A = Math.PI / 2;
export const GRAV = 34;
export const V0 = 11.2; // rebote: siempre a la misma altura (V0² / 2g ≈ 1,85)
export const VMAX = 21;
export const APEX = (V0 * V0) / (2 * GRAV);
export const FIRE_AT = 3; // anillos seguidos sin tocar para prender fuego

/** Tipos de porción. */
export const T = { SOLID: 0, GAP: 1, HAZARD: 2, BLINK: 3, GOAL: 4 };

const TAU = Math.PI * 2;
export const wrap = (a) => ((a % TAU) + TAU) % TAU;
const lerp = (a, b, k) => a + (b - a) * k;

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

/** Semilla de 31 bits a partir de un texto (la torre del día usa la fecha). */
export function seedOf(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % 2147483647 || 1;
}

/** Dificultad de un nivel (1 = el más fácil). */
export function diff(level) {
  const k = Math.min(1, (level - 1) / 26);
  return {
    gap3: lerp(0.7, 0.05, k), // prob. de hueco de 3 porciones (si no, de 2; y a veces de 1)
    gap1: level < 6 ? 0 : lerp(0, 0.3, k),
    hazard: level < 2 ? 0.05 : lerp(0.1, 0.36, k), // fracción del piso que es peligro
    spin: level < 4 ? 0 : lerp(0.12, 0.38, k), // prob. de que el anillo gire solo
    spinSpeed: lerp(0.45, 1.15, k), // rad/s
    blink: level < 7 ? 0 : lerp(0.25, 0.5, k), // de los peligros, cuántos titilan
    cascade: 0.22, // prob. de escalera (el hueco corrido una o dos porciones del anterior): da combos
    double: level < 3 ? 0 : lerp(0.08, 0.22, k), // prob. de un segundo hueco
  };
}

/** Anillos de un nivel del modo clásico. */
export const ringsFor = (level) => Math.min(42, 11 + Math.floor(level * 1.4));

/**
 * Arma una torre. `sections`: lista de { level, rings } que se apilan de arriba abajo; al final va el anillo meta.
 * Devuelve { seed, rings, sections: [{ start, end, level }], goal }.
 */
export function makeTower(seed, sections) {
  const r = rng(seed);
  const rings = [];
  const secs = [];
  let prev = null;
  for (const s of sections) {
    const start = rings.length;
    const d = diff(s.level);
    for (let i = 0; i < s.rings; i++) {
      const first = rings.length === 0;
      const ring = makeRing(r, d, prev, first);
      rings.push(ring);
      prev = ring;
    }
    secs.push({ start, end: rings.length - 1, level: s.level });
  }
  rings.push({ segs: new Array(SEG).fill(T.GOAL), spin: 0, phase: 0, blinkP: 0, blinkPhase: 0, goal: true });
  return { seed, rings, sections: secs, goal: rings.length - 1 };
}

/** Torre de un nivel del modo clásico. */
export const makeLevel = (level, seed) => makeTower(seed, [{ level, rings: ringsFor(level) }]);

/** Largos de la carrera (online y torre del día): cuántas secciones y de qué nivel. */
export const RACE = {
  short: [3, 7],
  medium: [3, 7, 11],
  long: [3, 7, 11, 15],
};
export const RACE_RINGS = 14;
export const makeRace = (seed, length = 'medium') => makeTower(seed, (RACE[length] || RACE.medium).map((level) => ({ level, rings: RACE_RINGS })));

/** Porción estática debajo de la pelota al arrancar (rot = 0): la del ángulo BALL_A. */
export const START_SEG = Math.floor(BALL_A / SEG_A);

function makeRing(r, d, prev, first) {
  const segs = new Array(SEG).fill(T.SOLID);
  // hueco principal: en escalera respecto del anterior (combos) o al azar
  let w = r() < d.gap3 ? 3 : r() < d.gap1 ? 1 : 2;
  let at;
  if (prev && prev.gapAt != null && r() < d.cascade) at = (prev.gapAt + (r() < 0.5 ? -1 : 1) * (1 + Math.floor(r() * 2)) + SEG) % SEG;
  else at = Math.floor(r() * SEG);
  if (first) {
    // el primero: la pelota arranca arriba de START_SEG, el hueco lejos
    at = (START_SEG + 4 + Math.floor(r() * 4)) % SEG;
    w = Math.max(w, 2);
  }
  for (let k = 0; k < w; k++) segs[(at + k) % SEG] = T.GAP;
  if (!first && r() < d.double) {
    const at2 = (at + w + 2 + Math.floor(r() * (SEG - w - 4))) % SEG;
    segs[at2] = T.GAP;
  }
  const spin = !first && r() < d.spin ? (r() < 0.5 ? -1 : 1) * d.spinSpeed * (0.75 + r() * 0.5) : 0;
  // peligros: nunca justo debajo de un hueco del anillo anterior quieto (al caer derecho no hay cómo esquivarlo)
  const below = new Set();
  if (prev && !prev.spin && !spin) prev.segs.forEach((t, i) => t === T.GAP && below.add(i));
  const solids = [];
  segs.forEach((t, i) => t === T.SOLID && !(first && Math.abs(i - START_SEG) <= 1) && !below.has(i) && solids.push(i));
  let n = Math.round((solids.length + below.size) * d.hazard * (spin ? 0.6 : 1) * (0.7 + r() * 0.6));
  n = Math.min(n, solids.length - 2); // siempre queda piso para caer
  for (let k = 0; k < n && solids.length; k++) {
    const i = solids.splice(Math.floor(r() * solids.length), 1)[0];
    segs[i] = r() < d.blink ? T.BLINK : T.HAZARD;
  }
  return { segs, spin, phase: r() * Math.PI * 2, blinkP: 2.2 + r() * 1.2, blinkPhase: r() * 4, gapAt: at };
}

/** Desplazamiento propio de un anillo que gira, en el instante t. */
export const ringOffset = (ring, t) => (ring.spin ? ring.phase + ring.spin * t : 0);

/** ¿El peligro que titila está prendido en el instante t? (y cuánto falta para cambiar, para avisar). */
export function blinkOn(ring, t) {
  const p = ring.blinkP || 2.6;
  const x = (((t + ring.blinkPhase) % p) + p) % p;
  return { on: x < p * 0.5, left: x < p * 0.5 ? p * 0.5 - x : p - x };
}

/** Índice de la porción del anillo debajo de la pelota. */
export const segIndex = (ring, rot, t) => Math.floor(wrap(BALL_A - rot - ringOffset(ring, t)) / SEG_A) % SEG;

/** Cara de arriba del anillo i. */
export const ringTop = (i) => -i * SPACING;

/** Tiempo mínimo (ms) para bajar toda la torre: caída libre a la velocidad máxima. El servidor lo usa contra trampas. */
export const minTimeMs = (tower) => Math.floor(((tower.goal * SPACING) / VMAX) * 1000 * 0.9);

/**
 * La caída de una pelota por una torre. `step(dt, rot)` avanza y devuelve los eventos:
 *   { t: 'bounce', ring, seg, phi }           tocó piso (phi: ángulo local, para la mancha)
 *   { t: 'pass', ring, combo, pts }           pasó por un hueco
 *   { t: 'smash', ring, pts }                 la rompió con fuego
 *   { t: 'fire' }                             se prendió fuego
 *   { t: 'die', ring, seg }                   tocó peligro
 *   { t: 'goal', ring }                       llegó al final
 */
export class Run {
  constructor(tower, { mult = 1 } = {}) {
    this.tower = tower;
    this.mult = mult;
    this.t = 0;
    this.score = 0;
    this.broken = new Uint8Array(tower.rings.length);
    this.place(0);
  }

  /** Pone la pelota arriba del anillo i (inicio o vuelta al punto de control) y rearma los anillos de ahí para abajo. */
  place(i) {
    this.next = i;
    this.y = ringTop(i) + BALL_R + APEX;
    this.vy = 0;
    this.combo = 0;
    this.fire = false;
    this.alive = true;
    this.done = false;
    for (let k = i; k < this.broken.length; k++) this.broken[k] = 0;
  }

  /** Sección a la que pertenece el anillo i (para volver a su comienzo). */
  section(i = this.next) {
    const s = this.tower.sections;
    for (let k = s.length - 1; k >= 0; k--) if (i >= s[k].start) return k;
    return 0;
  }

  /** Cuántos anillos pasó (0..goal) contando fracción: sirve para barras de progreso. */
  depth() {
    if (this.done) return this.tower.goal;
    const f = Math.min(1, Math.max(0, (ringTop(this.next - 1) - (this.y - BALL_R)) / SPACING));
    return Math.min(this.tower.goal, Math.max(0, this.next - 1 + (this.next > 0 ? f : 0)));
  }

  /** Tipo efectivo de la porción (con el titilar resuelto) del anillo i bajo la pelota. */
  typeAt(i, rot, t = this.t) {
    const ring = this.tower.rings[i];
    if (this.broken[i]) return T.GAP;
    const s = segIndex(ring, rot, t);
    const k = ring.segs[s];
    if (k === T.BLINK) return blinkOn(ring, t).on ? T.HAZARD : T.SOLID;
    return k;
  }

  step(dt, rot) {
    const ev = [];
    if (!this.alive || this.done) return ev;
    // pasos chicos: a la velocidad máxima no se saltea ningún anillo
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / n;
    for (let k = 0; k < n && this.alive && !this.done; k++) this.sub(h, rot, ev);
    return ev;
  }

  sub(h, rot, ev) {
    this.t += h;
    this.vy = Math.max(-VMAX, this.vy - GRAV * h);
    const y0 = this.y;
    this.y += this.vy * h;
    while (this.next <= this.tower.goal && this.vy < 0) {
      const top = ringTop(this.next);
      if (!(y0 - BALL_R >= top - 1e-9 && this.y - BALL_R < top)) break;
      const i = this.next;
      const ring = this.tower.rings[i];
      const seg = segIndex(ring, rot, this.t);
      const type = this.typeAt(i, rot);
      if (type === T.GOAL) {
        this.y = top + BALL_R;
        this.vy = 0;
        this.done = true;
        ev.push({ t: 'goal', ring: i });
        return;
      }
      if (type === T.GAP) {
        const passed = !this.broken[i];
        this.next++;
        if (passed) {
          this.broken[i] = 1;
          this.combo++;
          const pts = this.combo * this.mult;
          this.score += pts;
          ev.push({ t: 'pass', ring: i, combo: this.combo, pts });
          if (this.combo === FIRE_AT && !this.fire) {
            this.fire = true;
            ev.push({ t: 'fire' });
          }
        }
        continue;
      }
      if (this.fire) {
        // con fuego rompe lo que toque (también el peligro) y rebota más bajo
        this.broken[i] = 1;
        this.next++;
        const pts = (this.combo + 2) * this.mult;
        this.score += pts;
        this.fire = false;
        this.combo = 0;
        this.y = top + BALL_R;
        this.vy = V0 * 0.72;
        ev.push({ t: 'smash', ring: i, pts });
        return;
      }
      if (type === T.HAZARD) {
        this.y = top + BALL_R;
        this.vy = 0;
        this.alive = false;
        ev.push({ t: 'die', ring: i, seg });
        return;
      }
      // piso
      this.y = top + BALL_R;
      this.vy = V0;
      this.combo = 0;
      ev.push({ t: 'bounce', ring: i, seg, phi: wrap(BALL_A - rot - ringOffset(ring, this.t)) });
      return;
    }
  }

  /** Revivir (anuncio con recompensa): se rompe el anillo donde perdió y sigue cayendo. */
  revive() {
    if (this.alive) return;
    this.broken[this.next] = 1;
    this.next++;
    this.alive = true;
    this.vy = V0 * 0.5;
    this.combo = 0;
  }
}
