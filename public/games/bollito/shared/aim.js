/**
 * Bollito — de un gesto a un tiro (puro, sin DOM; lo usan el juego y las pruebas).
 *
 * Deslizar (dedo o mouse): el ángulo del gesto respecto de la vertical es la puntería y el largo es la fuerza, en
 * relación con el alto de la pantalla (un gesto de medio alto de pantalla es la fuerza máxima). La velocidad del final
 * del gesto solo cambia cuánto gira el bollito. Hacia abajo, o muy corto, no tira (se cancela).
 *
 * Teclado y mando: ←/→ corren la puntería y sostener Espacio (o A) carga la fuerza, que sube y baja sola (vaivén).
 */

export const AIM_SPAN = 0.62; // radianes de gesto (≈ 35°) para la puntería máxima (a = ±1)
export const MIN_SWIPE = 22; // px: menos que esto es un toque, no un tiro
export const CHARGE_RATE = 0.5; // fuerza por segundo al sostener Espacio (2 s de 0 a 1)

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Largo de gesto (px) que da fuerza 1, según el tamaño de la pantalla. */
export const swipeRef = (w, h) => clamp(Math.min(h * 0.5, w * 1.1), 240, 460);

/**
 * Gesto → tiro. dx, dy en px (dy negativo = hacia arriba). Devuelve { a, p, ok } (ok = false si no es un tiro).
 * `ref`: largo del gesto para la fuerza máxima.
 */
export function swipeThrow(dx, dy, ref) {
  const len = Math.sqrt(dx * dx + dy * dy);
  const up = -dy;
  const ok = len >= MIN_SWIPE && up > len * 0.25;
  const ang = Math.atan2(dx, Math.max(1e-6, up));
  return { a: clamp(ang / AIM_SPAN, -1, 1), p: clamp(len / ref, 0, 1), ok };
}

/** Fuerza de la carga con vaivén: sube de 0 a 1 y vuelve a bajar, una y otra vez. `t` en segundos. */
export function chargePower(t) {
  const x = (t * CHARGE_RATE) % 2;
  return x <= 1 ? x : 2 - x;
}
