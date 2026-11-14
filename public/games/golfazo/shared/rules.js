/**
 * Golfazo — reglas de un golpe y puntajes. Las usan el navegador (solo, local y online) y el servidor.
 *
 * Un golpe se escribe { a, p, k }: ángulo entero (0..65535), fuerza entera (1..1000) y el tick del reloj del hoyo en que
 * se pega. Todo lo demás lo decide la física determinista de physics.js, así que el servidor repite el golpe y obtiene
 * exactamente lo mismo que vio el jugador.
 */
import { advance, step, shoot, canShoot, MOVE, PIPE, HOLED, SLEEP, ANGLES, POWERS, HZ, MAX_FLIGHT } from './physics.js';

export const MAX_STROKES = 10;
/** Tiempo máximo de un golpe en ticks (si no se queda quieta, la física la devuelve al último lugar firme). */
export const SHOT_TICKS = MAX_FLIGHT + 60;

export const strokesOf = (s) => s.strokes + s.pens;

export function validShot(a, p, k) {
  return Number.isInteger(a) && a >= 0 && a < ANGLES && Number.isInteger(p) && p >= 1 && p <= POWERS && Number.isInteger(k) && k >= 0 && k < 1e7;
}

/** Corre la física hasta que la pelota queda lista para el próximo golpe (o embocada). Devuelve cuántos ticks pasaron. */
export function settle(w, s, ev) {
  let n = 0;
  while ((s.mode === MOVE || s.mode === PIPE) && !canShoot(s) && n < SHOT_TICKS) {
    step(w, s, ev);
    n++;
  }
  return n;
}

/**
 * Juega un golpe completo sobre la pelota `s`: la lleva hasta el tick `k`, la golpea y la deja quieta (o adentro).
 * Devuelve { ok, why, holed, strokes, k } (`k` = tick en que quedó lista otra vez).
 */
export function playShot(w, s, a, p, k, ev) {
  if (!validShot(a, p, k)) return { ok: false, why: 'bad_shot' };
  if (s.mode === HOLED) return { ok: false, why: 'holed' };
  if (k < s.k) return { ok: false, why: 'past' };
  advance(w, s, k, ev);
  if (s.mode === HOLED) return { ok: false, why: 'holed' };
  if (!canShoot(s)) return { ok: false, why: 'moving' };
  if (strokesOf(s) >= MAX_STROKES) return { ok: false, why: 'max' };
  shoot(w, s, a, p);
  settle(w, s, ev);
  return { ok: true, holed: s.mode === HOLED, strokes: strokesOf(s), k: s.k };
}

/** ¿Terminó el hoyo para esta pelota? (embocó o llegó al máximo de golpes). */
export const holeOver = (s) => s.mode === HOLED || strokesOf(s) >= MAX_STROKES;

/** Puntaje del hoyo: lo que anotó, o el máximo si no embocó. */
export const holeScore = (s) => (s.mode === HOLED ? strokesOf(s) : Math.max(MAX_STROKES, strokesOf(s)));

/** Nombre de la jugada: ace, albatross, eagle, birdie, par, bogey, double u over. */
export function label(strokes, par) {
  if (strokes === 1) return 'ace';
  const rel = strokes - par;
  return rel <= -3 ? 'albatross' : rel === -2 ? 'eagle' : rel === -1 ? 'birdie' : rel === 0 ? 'par' : rel === 1 ? 'bogey' : rel === 2 ? 'double' : 'over';
}

/** Estrellas de un hoyo (0 a 3): par o mejor = 2, birdie o mejor = 3, hasta par + 2 = 1. */
export const stars = (strokes, par) => (strokes <= par - 1 ? 3 : strokes <= par ? 2 : strokes <= par + 2 ? 1 : 0);

export { HZ };
export const ticksToSec = (k) => k / HZ;

/** Reproduce una lista de golpes ({a,p,k}) desde cero. Devuelve { ball, results } o null si alguno no es válido. */
export function replay(w, newBall, shots, ev) {
  const s = newBall(w);
  const results = [];
  for (const sh of shots) {
    const r = playShot(w, s, sh.a, sh.p, sh.k, ev);
    if (!r.ok) return null;
    results.push(r);
  }
  return { ball: s, results };
}

export { HOLED, SLEEP };
