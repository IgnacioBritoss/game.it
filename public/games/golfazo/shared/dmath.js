/**
 * Golfazo — trigonometría determinista.
 *
 * Math.sin y Math.cos pueden dar un último bit distinto según el navegador; acá solo se usan + − × y Math.round
 * (que el estándar IEEE 754 fija bit a bit), así la física y la geometría de los hoyos dan exactamente lo mismo en
 * Chrome, Firefox, Safari y Node. Todo lo que está en shared/ usa estas funciones y nunca Math.sin/cos/atan2/pow/hypot.
 */
export const PI = 3.141592653589793;
export const TAU = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;
export const DEG = PI / 180;

const INV_HALF_PI = 0.6366197723675814;
const P_HI = 1.5707963267341256; // π/2 partido en dos para no perder precisión al reducir
const P_LO = 6.077100506506192e-11;

const S3 = -1 / 6;
const S5 = 1 / 120;
const S7 = -1 / 5040;
const S9 = 1 / 362880;
const S11 = -1 / 39916800;
const S13 = 1 / 6227020800;
const C2 = -1 / 2;
const C4 = 1 / 24;
const C6 = -1 / 720;
const C8 = 1 / 40320;
const C10 = -1 / 3628800;
const C12 = 1 / 479001600;
const C14 = -1 / 87178291200;

// polinomios de Taylor en [−π/4, π/4] (error < 1e-11)
const sinP = (r) => {
  const q = r * r;
  return r * (1 + q * (S3 + q * (S5 + q * (S7 + q * (S9 + q * (S11 + q * S13))))));
};
const cosP = (r) => {
  const q = r * r;
  return 1 + q * (C2 + q * (C4 + q * (C6 + q * (C8 + q * (C10 + q * (C12 + q * C14))))));
};

export function dsin(x) {
  const k = Math.round(x * INV_HALF_PI);
  const r = x - k * P_HI - k * P_LO;
  const m = ((k % 4) + 4) % 4;
  return m === 0 ? sinP(r) : m === 1 ? cosP(r) : m === 2 ? -sinP(r) : -cosP(r);
}

export function dcos(x) {
  const k = Math.round(x * INV_HALF_PI);
  const r = x - k * P_HI - k * P_LO;
  const m = ((k % 4) + 4) % 4;
  return m === 0 ? cosP(r) : m === 1 ? -sinP(r) : m === 2 ? -cosP(r) : sinP(r);
}

/** Suavizado 0..1 con derivada cero en las puntas. */
export const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const frac = (x) => x - Math.floor(x);
