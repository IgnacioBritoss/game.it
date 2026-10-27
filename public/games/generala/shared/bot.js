/**
 * Generala — la compu. Elige qué dados guardar calculando lo que se espera sacar con las tiradas que quedan (sobre
 * las 252 manos posibles) y en qué categoría anotar comparando los puntos con lo que esa categoría promete si se la
 * deja libre para más adelante (así tacha los unos antes que la generala). Tres niveles: fácil mira una sola tirada y
 * se equivoca seguido, normal mira una tirada y casi no se equivoca, difícil calcula las dos.
 */
import { MAX_ROLLS, scoreFor, open, counts, isGenerala, HANDS, outcomes, keeps } from './rules.js';

export const LEVELS = {
  1: { look: 1, noise: 0.3, care: 0.45, name: { es: 'Fácil', en: 'Easy' } },
  2: { look: 1, noise: 0.06, care: 1, name: { es: 'Normal', en: 'Normal' } },
  3: { look: 2, noise: 0, care: 1, name: { es: 'Difícil', en: 'Hard' } },
};

/**
 * Lo que vale, en promedio, dejar libre cada categoría para más adelante. Anotar algo cuesta eso: conviene usar la
 * categoría en la que la jugada supera más a lo esperado (ajustado jugando miles de partidas, ver las pruebas).
 */
export const PROMISE = { 1: 1.2, 2: 4, 3: 6.8, 4: 9.6, 5: 12.5, 6: 15.5, E: 15, F: 24, P: 27, G: 15, D: 4 };

/** Mejor categoría para anotar ya: { cat, pts, gain }. */
export function bestCategory(dice, sheet, servida, opts = {}, care = 1) {
  let best = null;
  for (const cat of open(sheet)) {
    const pts = scoreFor(cat, dice, servida, sheet);
    let gain = pts - PROMISE[cat] * care;
    // la generala servida que gana la partida no se discute
    if (cat === 'G' && servida && opts.servida && pts) gain = 1e6;
    if (!best || gain > best.gain) best = { cat, pts, gain };
  }
  return best;
}

const keyOf = (a) => {
  let k = 0;
  for (const d of a) k = k * 10 + d;
  return k;
};
/** Clave de la mano que queda al juntar lo guardado `K` con lo que salió `o` (los dos ordenados). */
function mergeKey(K, o) {
  let i = 0, j = 0, k = 0;
  while (i < K.length || j < o.length) k = k * 10 + (j >= o.length || (i < K.length && K[i] <= o[j]) ? K[i++] : o[j++]);
  return k;
}
const KEEPS = new Map(HANDS.map((h) => [keyOf(h), keeps(h)]));

/** Tablas de valor para una planilla: v0 (sin más tiradas) y v1 (con una tirada más). */
export function plan(sheet, opts = {}, care = 1) {
  const v0 = new Map();
  for (const h of HANDS) v0.set(keyOf(h), bestCategory(h, sheet, false, opts, care).gain);
  const exp = (K, V) => {
    let s = 0;
    for (const o of outcomes(5 - K.length)) s += o.p * V.get(mergeKey(K, o.dice));
    return s;
  };
  let v1 = null;
  return {
    v0,
    exp,
    get v1() {
      if (!v1) {
        v1 = new Map();
        for (const h of HANDS) {
          let best = -Infinity;
          for (const K of KEEPS.get(keyOf(h))) best = Math.max(best, exp(K, v0));
          v1.set(keyOf(h), best);
        }
      }
      return v1;
    },
  };
}

/** Qué dados del tiro guardar para quedarse con el multiconjunto K. */
export function maskFor(dice, K) {
  const need = counts(K);
  return dice.map((d) => (need[d] > 0 ? (need[d]--, true) : false));
}

/**
 * Decide la próxima acción de la compu: { t: 'roll', hold } o { t: 'score', cat }.
 * state: { dice, roll (tiradas hechas), sheet, opts }. `memo` guarda las tablas del turno (opcional).
 */
export function decide(state, level = 2, rng = Math.random, memo = {}) {
  const { dice, roll, sheet } = state;
  const opts = state.opts || {};
  const L = LEVELS[level] || LEVELS[2];
  if (roll === 0) return { t: 'roll', hold: [false, false, false, false, false] };
  const now = bestCategory(dice, sheet, roll === 1, opts, L.care);
  if (roll === 1 && opts.servida && isGenerala(counts(dice)) && sheet.G === undefined) return { t: 'score', cat: 'G' };
  const left = MAX_ROLLS - roll;
  if (left <= 0) return { t: 'score', cat: now.cat };
  const key = open(sheet).join('') + ':' + (sheet.G ?? '') + ':' + level;
  if (memo.key !== key) {
    memo.key = key;
    memo.plan = plan(sheet, opts, L.care);
  }
  const P = memo.plan;
  const V = left >= 2 && L.look >= 2 ? P.v1 : P.v0;
  const cands = KEEPS.get(keyOf([...dice].sort((a, b) => a - b)))
    .map((K) => ({ K, e: P.exp(K, V) }))
    .sort((a, b) => b.e - a.e);
  let pick = cands[0];
  if (L.noise && rng() < L.noise) pick = cands[Math.floor(rng() * Math.min(4, cands.length))];
  // plantarse: lo que hay ya vale más que lo que se espera de seguir tirando
  if (pick.K.length === 5 || now.gain >= pick.e) return { t: 'score', cat: now.cat };
  return { t: 'roll', hold: maskFor(dice, pick.K) };
}
