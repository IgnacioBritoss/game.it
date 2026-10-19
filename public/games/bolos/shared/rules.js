/**
 * Bolos — reglas del puntaje (bowling de 10 pinos), puras y sin DOM. Partidas de N cuadros (5 rápida, 10 clásica):
 * pleno (strike) = 10 + las dos bolas siguientes; semipleno (spare) = 10 + la bola siguiente; en el último cuadro, un
 * pleno o un semipleno dan bolas extra (hasta 3) y se vuelven a parar los 10 pinos.
 */

/** Hoja de puntaje a partir de los pinos de cada bola. Devuelve { frames: [{ rolls, strike, spare, total }], total }. */
export function sheet(rolls, N = 10) {
  const frames = [];
  let i = 0;
  for (let f = 0; f < N && i < rolls.length; f++) {
    if (f === N - 1) {
      frames.push({ rolls: rolls.slice(i, i + 3), start: i, last: true });
      i = rolls.length;
    } else if (rolls[i] === 10) {
      frames.push({ rolls: [10], start: i, strike: true });
      i += 1;
    } else {
      const r = rolls.slice(i, i + 2);
      frames.push({ rolls: r, start: i, spare: r.length === 2 && r[0] + r[1] === 10 });
      i += 2;
    }
  }
  let total = 0;
  let known = true;
  for (const fr of frames) {
    const s = fr.start;
    let v = null;
    if (fr.last) {
      const r = fr.rolls;
      const need = r[0] === 10 || r[0] + (r[1] ?? 0) === 10 ? 3 : 2;
      if (r.length >= need) v = r.reduce((a, b) => a + b, 0);
    } else if (fr.strike) {
      if (rolls.length >= s + 3) v = 10 + rolls[s + 1] + rolls[s + 2];
    } else if (fr.spare) {
      if (rolls.length >= s + 3) v = 10 + rolls[s + 2];
    } else if (fr.rolls.length === 2) v = fr.rolls[0] + fr.rolls[1];
    if (v === null) known = false;
    if (known) {
      total += v;
      fr.total = total;
    } else fr.total = null;
  }
  // puntaje parcial (lo que ya está seguro más lo tirado): para mostrar mientras se juega
  return { frames, total: known ? total : partial(frames, rolls), final: known && frames.length === N && isDone(rolls, N) };
}

function partial(frames, rolls) {
  let t = 0;
  for (const fr of frames) if (fr.total != null) t = fr.total;
  const firstUnknown = frames.find((f) => f.total == null);
  if (firstUnknown) for (let k = firstUnknown.start; k < rolls.length; k++) t += rolls[k];
  return t;
}

/**
 * Qué sigue: { frame (0..N-1), ball (0, 1 o 2 dentro del cuadro), fresh (se paran los 10 pinos), done }.
 * `standing` (los pinos que quedan) lo calcula quien juega; acá solo se dice si hay que pararlos todos.
 */
export function next(rolls, N = 10) {
  let i = 0;
  for (let f = 0; f < N; f++) {
    if (f < N - 1) {
      if (i >= rolls.length) return { frame: f, ball: 0, fresh: true, done: false };
      if (rolls[i] === 10) {
        i += 1;
        continue;
      }
      if (i + 1 >= rolls.length) return { frame: f, ball: 1, fresh: false, done: false };
      i += 2;
      continue;
    }
    // último cuadro
    const r = rolls.slice(i);
    if (r.length === 0) return { frame: f, ball: 0, fresh: true, done: false };
    if (r.length === 1) return { frame: f, ball: 1, fresh: r[0] === 10, done: false };
    if (r.length === 2) {
      const bonus = r[0] === 10 || r[0] + r[1] === 10;
      if (!bonus) return { frame: f, ball: 2, fresh: false, done: true };
      // después de pleno + algo que no limpió, la tercera bola va contra lo que quedó
      const fresh = (r[0] === 10 && r[1] === 10) || (r[0] < 10 && r[0] + r[1] === 10);
      return { frame: f, ball: 2, fresh, done: false };
    }
    return { frame: f, ball: 3, fresh: false, done: true };
  }
  return { frame: N - 1, ball: 0, fresh: false, done: true };
}

export const isDone = (rolls, N = 10) => next(rolls, N).done;

/** Cuántos pinos pueden caer en la próxima bola (para validar): 10 si se paran todos, si no los que quedan. */
export function maxNext(rolls, N = 10) {
  const n = next(rolls, N);
  if (n.done) return 0;
  if (n.fresh) return 10;
  return 10 - rolls[rolls.length - 1];
}

/** Marca de una bola para la hoja: X, /, - o el número. */
export function mark(fr, k) {
  const r = fr.rolls;
  const v = r[k];
  if (v === undefined) return '';
  const num = v === 0 ? '-' : String(v);
  if (!fr.last) {
    if (fr.strike) return 'X';
    return k === 1 && fr.spare ? '/' : num;
  }
  // último cuadro: ¿la bola k se tiró contra los 10 pinos parados?
  const fresh = k === 0 || (k === 1 && r[0] === 10) || (k === 2 && ((r[0] === 10 && r[1] === 10) || (r[0] < 10 && r[0] + r[1] === 10)));
  if (fresh) return v === 10 ? 'X' : num;
  return r[k - 1] + v === 10 ? '/' : num;
}

/** Máximo posible de una partida de N cuadros (todos plenos). */
export const perfect = (N) => N * 30;
