/**
 * Memotest — mazo y reparto puros. Los usan el navegador (solo, del día, contra la compu, de a varios) y el servidor (online), así
 * que no tocan el DOM. Las caras son números (índices de FACES) y cada tema usa un tramo; el servidor guarda el reparto y solo
 * manda la cara de las cartas que se dan vuelta.
 */
export const FACES = [
  // frutas y verduras (0–17)
  '🍎', '🍌', '🍒', '🍓', '🍋', '🍇', '🍊', '🍉', '🍐', '🍍', '🥑', '🥕', '🍑', '🥝', '🍅', '🌽', '🍆', '🥦',
  // animales (18–35)
  '🐱', '🐶', '🐟', '🐸', '🦉', '🐧', '🐝', '🦋', '🐙', '🦊', '🐼', '🐨', '🦁', '🐢', '🐞', '🐷', '🐰', '🐮',
  // comida (36–53)
  '🍕', '🍔', '🍟', '🍩', '🍪', '🍦', '🧁', '🍫', '🥐', '🌮', '🍿', '🧀', '🥨', '🍣', '🍰', '🥞', '🍭', '🥪',
  // cosas (54–71)
  '⚽', '🎸', '🚀', '🌈', '⭐', '🔔', '🎈', '🚲', '⏰', '🎁', '🔑', '💎', '🎩', '🧲', '🌵', '🍄', '🌻', '⛄',
];

/** Tramo [desde, hasta) de FACES de cada tema. */
export const RANGE = { fruits: [0, 18], animals: [18, 36], food: [36, 54], things: [54, 72], mix: [0, 72] };
export const THEME_IDS = Object.keys(RANGE);

/** Tamaños: cantidad de pares (las cartas son el doble). */
export const SIZES = { s: 6, m: 8, l: 12, xl: 15, xxl: 18 };
export const SIZE_IDS = Object.keys(SIZES);

export const isTheme = (v) => typeof v === 'string' && Object.hasOwn(RANGE, v);
export const isSize = (v) => typeof v === 'string' && Object.hasOwn(SIZES, v);

/** Mezcla (Fisher–Yates) con el generador `rand` (devuelve un número en [0, 1)). */
export function shuffled(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Reparte una mesa: `pairs` caras distintas del tema, cada una dos veces, mezcladas. */
export function deal(rand, pairs, theme = 'mix') {
  const [a, b] = RANGE[theme] || RANGE.mix;
  const pool = Array.from({ length: b - a }, (_, k) => a + k);
  const ids = shuffled(pool, rand).slice(0, pairs);
  return shuffled([...ids, ...ids], rand);
}

/** Estrellas de una partida de un jugador: pocos intentos (dos cartas dadas vuelta) por par. */
export function stars(moves, pairs) {
  return moves <= Math.round(pairs * 1.7) ? 3 : moves <= Math.round(pairs * 2.5) ? 2 : 1;
}

/**
 * Cómo acomodar `n` cartas (de proporción `ratio` = ancho / alto) en un espacio de `w` × `h` con `gap` entre cartas:
 * la cantidad de columnas que da la carta más grande. Devuelve { cols, rows, cw, ch }.
 */
export function fit(n, w, h, gap = 8, ratio = 0.78) {
  let best = null;
  for (let cols = 1; cols <= n; cols++) {
    if (n % cols) continue;
    const rows = n / cols;
    const cw = Math.min((w - (cols - 1) * gap) / cols, ((h - (rows - 1) * gap) / rows) * ratio);
    if (!best || cw > best.cw) best = { cols, rows, cw, ch: cw / ratio };
  }
  return best;
}
