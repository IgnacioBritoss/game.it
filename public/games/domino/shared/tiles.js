/**
 * Dominó — el dibujo de una ficha: dos mitades con sus puntos, la rayita del medio y el clavito. Es solo el SVG (el marfil y
 * la sombra los pone el estilo). `a` es lo que se ve a la izquierda (o arriba, si va parada) y `b` lo de la derecha (o abajo).
 */
const POS = [
  [],
  [[50, 50]],
  [[27, 27], [73, 73]],
  [[27, 27], [50, 50], [73, 73]],
  [[27, 27], [73, 27], [27, 73], [73, 73]],
  [[27, 27], [73, 27], [50, 50], [27, 73], [73, 73]],
  [[27, 24], [73, 24], [27, 50], [73, 50], [27, 76], [73, 76]],
];

const half = (n, ox, oy) => (POS[n] || []).map(([x, y]) => `<circle class="p p${n}" cx="${ox + x}" cy="${oy + y}" r="9.6"/>`).join('');

const cache = new Map();
export function tileSvg(a, b, vertical = false) {
  const key = `${a}${b}${vertical ? 'v' : 'h'}`;
  let s = cache.get(key);
  if (s) return s;
  const mid = vertical ? `<line class="mid" x1="14" y1="100" x2="86" y2="100"/><circle class="pin" cx="50" cy="100" r="4.6"/>` : `<line class="mid" x1="100" y1="14" x2="100" y2="86"/><circle class="pin" cx="100" cy="50" r="4.6"/>`;
  s = `<svg viewBox="0 0 ${vertical ? '100 200' : '200 100'}" aria-hidden="true">${half(a, 0, 0)}${half(b, vertical ? 0 : 100, vertical ? 100 : 0)}${mid}</svg>`;
  cache.set(key, s);
  return s;
}

/** Cuántos puntos se dibujan en un SVG de ficha (para las pruebas). */
export const pipCount = (svg) => (svg.match(/<circle class="p /g) || []).length;
