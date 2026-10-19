/**
 * Bolos — física del tiro (pura, sin DOM), vista desde arriba en 2D: la bola resbala por el aceite y en el último tramo
 * engancha según el efecto; choca con los pinos (masas reales: 7 kg contra 1,5 kg), los pinos se chocan entre sí, rebotan
 * en las paredes del costado y se van a la canaleta o al foso. Solo usa + − × ÷ y √, así que es determinista: el servidor
 * simula el mismo tiro que el navegador y decide qué pinos cayeron (como en Billar).
 *
 * Coordenadas en metros: x a lo ancho (0 = centro, positivo a la derecha del que tira), y a lo largo desde la línea de
 * falta (el pino 1 está en y = HEAD).
 */
export const HALF = 0.527; // medio ancho del carril
export const GUTTER = 0.235;
export const WALL = HALF + GUTTER + 0.03; // paredes laterales del fondo (donde rebotan los pinos)
export const HEAD = 18.29; // pino 1
export const PIT = HEAD + 1.05; // fin de la cubierta de pinos
export const BALL_R = 0.109;
export const PIN_R = 0.06;
export const BALL_M = 7;
export const PIN_M = 1.5;
export const HOOK = 1.15; // aceleración lateral máxima del efecto (m/s²): con efecto 1 engancha unos 45 cm al final
export const DT = 1 / 240;
export const MAX_T = 9;

/** Lugar de cada pino (1 al 10) respecto del pino 1: filas a 0,264 m, columnas a 0,1524 m. */
export const SPOTS = [
  [0, 0],
  [-0.1524, 0.264],
  [0.1524, 0.264],
  [-0.3048, 0.528],
  [0, 0.528],
  [0.3048, 0.528],
  [-0.4572, 0.792],
  [-0.1524, 0.792],
  [0.1524, 0.792],
  [0.4572, 0.792],
];
export const ALL = 0x3ff;

/** Límites del tiro (los valida el servidor). */
export const LIMITS = { x: 0.44, aim: 0.06, speedMin: 3.5, speedMax: 11, spin: 1 };

/** ¿Es válido el tiro? { x, aim, speed, spin } con números finitos y dentro de los límites. */
export function validThrow(p) {
  if (!p || typeof p !== 'object') return false;
  const { x, aim, speed, spin } = p;
  if (![x, aim, speed, spin].every((v) => typeof v === 'number' && Number.isFinite(v))) return false;
  return Math.abs(x) <= LIMITS.x && Math.abs(aim) <= LIMITS.aim && speed >= LIMITS.speedMin && speed <= LIMITS.speedMax && Math.abs(spin) <= LIMITS.spin;
}

/** Redondea el tiro a una grilla fija (lo que viaja por la red es exactamente lo mismo que simula cada uno). */
export function quantize(p) {
  const q = (v, s) => Math.round(v * s) / s;
  return { x: q(p.x, 1000), aim: q(p.aim, 100000), speed: q(p.speed, 1000), spin: q(p.spin, 1000) };
}

const ramp = (y) => (y < 9 ? 0 : y > 14 ? 1 : (y - 9) / 5);

export class Roll {
  /** `standing`: máscara de bits de los pinos parados (bit i = pino i+1). */
  constructor(standing, p) {
    const s = Math.sqrt(1 + p.aim * p.aim);
    this.ball = { x: p.x, y: 0, vx: (p.speed * p.aim) / s, vy: p.speed / s, spin: p.spin, gutter: 0, gone: false };
    this.pins = SPOTS.map(([dx, dy], i) => ({ i, x: dx, y: HEAD + dy, vx: 0, vy: 0, up: !!(standing & (1 << i)), down: false, gone: false, hit: 0, at: 0 }));
    this.start = standing;
    this.t = 0;
    this.done = false;
    this.events = [];
  }

  /** Pinos que estaban parados y ya no. */
  knocked() {
    let m = 0;
    for (const p of this.pins) if (p.up && (p.down || p.gone) && this.start & (1 << p.i)) m |= 1 << p.i;
    return m;
  }

  standing() {
    return this.start & ~this.knocked();
  }

  /** Avanza un paso fijo. Junta eventos para el sonido y el dibujo: { t: 'pin', i, v } (un pino cae), 'gutter', 'wall'. */
  step() {
    if (this.done) return;
    const h = DT;
    this.t += h;
    const b = this.ball;
    // bola: resbala y, en el último tramo, engancha
    if (!b.gone) {
      if (!b.gutter) {
        b.vx += b.spin * HOOK * ramp(b.y) * h;
        b.x += b.vx * h;
        b.y += b.vy * h;
        if (b.x > HALF - BALL_R * 0.35 || b.x < -HALF + BALL_R * 0.35) {
          b.gutter = b.x > 0 ? 1 : -1;
          b.x = b.gutter * (HALF + GUTTER * 0.5);
          b.vx = 0;
          this.events.push({ t: 'gutter' });
        }
      } else b.y += b.vy * h;
      b.vy *= 1 - 0.012 * h;
      if (b.y > PIT + 0.4) b.gone = true;
    }
    const P = this.pins;
    // bola contra pinos
    if (!b.gone && !b.gutter && b.y > HEAD - 0.3) {
      for (const p of P) {
        if (!p.up || p.gone) continue;
        const dx = p.x - b.x, dy = p.y - b.y;
        const rr = BALL_R + PIN_R;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-6;
        this.collide(b, p, dx / d, dy / d, rr - d, BALL_M, PIN_M, 0.72);
      }
    }
    // pinos entre sí (los parados no se mueven hasta que algo los toca)
    for (let i = 0; i < 10; i++) {
      const a = P[i];
      if (!a.up || a.gone) continue;
      for (let j = i + 1; j < 10; j++) {
        const c = P[j];
        if (!c.up || c.gone || (!a.down && !c.down)) continue;
        const dx = c.x - a.x, dy = c.y - a.y;
        const ra = a.down ? PIN_R * 1.25 : PIN_R, rc = c.down ? PIN_R * 1.25 : PIN_R;
        const rr = ra + rc;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-6;
        this.collide(a, c, dx / d, dy / d, rr - d, PIN_M, PIN_M, 0.6);
      }
    }
    // pinos que se mueven: rozamiento, paredes, canaleta y foso
    let moving = false;
    for (const p of P) {
      if (!p.up || p.gone || !p.down) continue;
      const v2 = p.vx * p.vx + p.vy * p.vy;
      if (v2 > 1e-6) {
        const v = Math.sqrt(v2);
        const nv = Math.max(0, v - 2.6 * h);
        p.vx *= nv / v;
        p.vy *= nv / v;
        p.x += p.vx * h;
        p.y += p.vy * h;
        if (nv > 0.02) moving = true;
      }
      if (p.x > WALL - PIN_R && p.vx > 0) {
        p.vx = -p.vx * 0.5;
        this.events.push({ t: 'wall', v: -p.vx });
      } else if (p.x < -WALL + PIN_R && p.vx < 0) {
        p.vx = -p.vx * 0.5;
        this.events.push({ t: 'wall', v: p.vx });
      }
      if (p.y > PIT || p.y < HEAD - 1.4 || (Math.abs(p.x) > HALF + PIN_R && p.y < HEAD - 0.25)) p.gone = true;
    }
    const ballDone = b.gone || (b.gutter && b.y > PIT);
    if ((ballDone && !moving) || this.t > MAX_T) this.done = true;
  }

  collide(a, c, nx, ny, pen, ma, mc, e) {
    const ia = 1 / ma, ic = 1 / mc;
    // a y c: si alguno estaba parado, deja de estarlo (un pino tocado cae)
    const corr = pen / (ia + ic);
    a.x -= nx * corr * ia;
    a.y -= ny * corr * ia;
    c.x += nx * corr * ic;
    c.y += ny * corr * ic;
    const rv = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
    if (rv >= 0) return;
    const j = (-(1 + e) * rv) / (ia + ic);
    a.vx -= nx * j * ia;
    a.vy -= ny * j * ia;
    c.vx += nx * j * ic;
    c.vy += ny * j * ic;
    for (const p of a === this.ball ? [c] : [a, c]) {
      if (!p.down) {
        p.down = true;
        p.at = this.t;
        p.hit = -rv;
        this.events.push({ t: 'pin', i: p.i, v: -rv });
      }
    }
  }

  /** Corre el tiro hasta el final (para el servidor y la compu). */
  run() {
    while (!this.done) this.step();
    return this.knocked();
  }
}

/** Atajo: qué pinos tira un tiro contra los que están parados. */
export const simulate = (standing, p) => new Roll(standing, p).run();

export const count = (mask) => {
  let n = 0;
  for (let i = 0; i < 10; i++) if (mask & (1 << i)) n++;
  return n;
};

/** ¿Quedó un split? (el 1 caído y dos grupos de pinos separados por un hueco). */
export function isSplit(standing) {
  if (standing & 1 || count(standing) < 2) return false;
  const cols = new Set();
  for (let i = 0; i < 10; i++) if (standing & (1 << i)) cols.add(Math.round(SPOTS[i][0] / 0.1524));
  const xs = [...cols].sort((a, b) => a - b);
  for (let k = 1; k < xs.length; k++) if (xs[k] - xs[k - 1] > 2) return true;
  return false;
}
