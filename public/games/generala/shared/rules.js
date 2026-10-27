/**
 * Generala — reglas puras (sin DOM): las categorías de la planilla, los puntos de cada jugada y las cuentas de
 * probabilidades que usa la compu. La usan el navegador, el servidor y las pruebas.
 *
 * Cinco dados y hasta tres tiradas por turno; entre tirada y tirada se guardan los dados que se quieran. Al final del
 * turno se anota la jugada en una categoría libre de la planilla (o se tacha con 0). Las categorías:
 *   1 … 6        la suma de los dados de ese número
 *   E escalera   1-2-3-4-5, 2-3-4-5-6 o 3-4-5-6-1: 20 (servida, en la primera tirada: 25)
 *   F full       tres iguales y dos iguales: 30 (servido: 35)
 *   P póker      cuatro iguales: 40 (servido: 45)
 *   G generala   cinco iguales: 50; servida gana la partida en el acto (si la opción está activa)
 *   D doble      otra generala con la generala ya anotada (no tachada): 100
 */
export const CATS = ['1', '2', '3', '4', '5', '6', 'E', 'F', 'P', 'G', 'D'];
export const ROUNDS = CATS.length;
export const MAX_ROLLS = 3;
export const BASE = { E: 20, F: 30, P: 40, G: 50, D: 100 };
export const SERVIDA_BONUS = 5;

/** Cuántos dados hay de cada número: c[1] … c[6]. */
export function counts(dice) {
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) c[d]++;
  return c;
}

export function isStraight(dice) {
  const s = [...dice].sort((a, b) => a - b).join('');
  return s === '12345' || s === '23456' || s === '13456';
}
export const isFull = (c) => c.includes(3) && c.includes(2);
export const isPoker = (c) => c.some((k) => k >= 4);
export const isGenerala = (c) => c.includes(5);

/**
 * Puntos de anotar `dice` en `cat`. `servida`: salió en la primera tirada. `sheet`: la planilla del jugador
 * ({ cat: puntos | undefined }), hace falta para la doble.
 */
export function scoreFor(cat, dice, servida = false, sheet = {}) {
  const c = counts(dice);
  if (cat >= '1' && cat <= '6') {
    const n = +cat;
    return n * c[n];
  }
  const bonus = servida ? SERVIDA_BONUS : 0;
  if (cat === 'E') return isStraight(dice) ? BASE.E + bonus : 0;
  if (cat === 'F') return isFull(c) ? BASE.F + bonus : 0;
  if (cat === 'P') return isPoker(c) ? BASE.P + bonus : 0;
  if (cat === 'G') return isGenerala(c) ? BASE.G : 0;
  if (cat === 'D') return isGenerala(c) && sheet.G === BASE.G ? BASE.D : 0;
  return 0;
}

export const open = (sheet) => CATS.filter((k) => sheet[k] === undefined);
export const total = (sheet) => CATS.reduce((s, k) => s + (sheet[k] || 0), 0);

/** Nombre corto de cada categoría para las pruebas y los registros. */
export const LABEL = { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', E: 'escalera', F: 'full', P: 'póker', G: 'generala', D: 'doble' };

// ---------------------------------------------------------------- probabilidades de tirar dados
/** Todas las maneras de que salgan r dados, como cuentas por número, con su probabilidad. */
const OUT = [];
for (let r = 0; r <= 5; r++) {
  const m = new Map();
  const rec = (k, from, acc) => {
    if (k === r) {
      const key = acc.join('');
      m.set(key, (m.get(key) || 0) + 1);
      return;
    }
    for (let v = 1; v <= 6; v++) rec(k + 1, from, [...acc, v].sort());
  };
  rec(0, 0, []);
  OUT.push([...m].map(([k, n]) => ({ dice: k ? k.split('').map(Number) : [], p: n / 6 ** r })));
}
export const outcomes = (r) => OUT[r];

/** Las 252 manos posibles (multiconjuntos de 5 dados), ordenadas. */
export const HANDS = OUT[5].map((o) => o.dice);
export const handKey = (dice) => [...dice].sort((a, b) => a - b).join('');

/** Los distintos dados que se pueden guardar de una mano (sub-multiconjuntos, sin repetir). */
export function keeps(dice) {
  const s = [...dice].sort((a, b) => a - b);
  const seen = new Set();
  const out = [];
  for (let m = 0; m < 32; m++) {
    const k = s.filter((_, i) => m & (1 << i));
    const key = k.join('');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }
  return out;
}
