/**
 * Penales — las reglas puras, sin estado: el arco en coordenadas normalizadas, cómo sale un remate (apuntar, fuerza y pulso) y
 * cómo se resuelve contra el arquero (gol, atajada, palo, afuera o por arriba).
 *
 * El arco se mide así: `x` va de -1 a 1 entre los palos (negativo es la izquierda de quien patea) e `y` de 0 al piso a 1 en el travesaño.
 * Quien patea elige a dónde apuntar `(x, y)` (se puede apuntar afuera: x hasta ±1,3 e y hasta 1,25) y con qué fuerza `p` de 0 a 1.
 * Cuanta más fuerza, menos tiempo tiene el arquero pero peor puntería: el remate sale con un error al azar (`noise`, dos números
 * normales) que crece con la fuerza. El arquero elige de antemano una de seis zonas (3 columnas × 2 alturas) y se tira: ataja si
 * la pelota llega dentro de lo que alcanza desde ahí, que se achica con la fuerza.
 */
export const GOAL_W = 7.32; // metros
export const GOAL_H = 2.44;
export const AIM = { x: 1.3, yMin: 0.04, yMax: 1.25 };

export const COLS = [-1, 0, 1]; // izquierda, centro y derecha (vistos desde atrás de la pelota)
export const ROWS = [0, 1]; // abajo y arriba
const ZX = 0.56;
const ZY = [0.26, 0.72];
/** Dónde queda el centro de cada zona de atajada (coordenadas del arco). */
export const zoneCenter = (c, r) => ({ x: c * ZX, y: ZY[r] });

const RX = 0.6; // cuánto alcanza el arquero a los costados y para arriba o abajo, con la fuerza mínima
const RY = 0.5;
export const POST = 0.05; // la pelota toca el palo si pasa a menos de esto del borde del arco (en x) o del travesaño (en y)

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** Qué tan mal le sale la puntería con esa fuerza (desvío típico, en coordenadas del arco). */
export const sigma = (p) => 0.04 + 0.34 * p * p;
/** Cuánto se achica lo que alcanza el arquero con esa fuerza (1 con un toque; 0,55 a todo lo que da). */
export const reach = (p) => 1 - 0.45 * p;

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
/** Un remate bien formado: apunta dentro de lo que se puede y la fuerza de 0 a 1. */
export const isShot = (s) => !!s && isNum(s.x) && isNum(s.y) && isNum(s.p) && Math.abs(s.x) <= AIM.x && s.y >= AIM.yMin && s.y <= AIM.yMax && s.p >= 0 && s.p <= 1;
export const cleanShot = (s) => ({ x: clamp(+s.x, -AIM.x, AIM.x), y: clamp(+s.y, AIM.yMin, AIM.yMax), p: clamp(+s.p, 0, 1) });
export const isDive = (d) => !!d && COLS.includes(d.c) && ROWS.includes(d.r);

/** Un número normal (Box-Muller), sin irse a los extremos. */
export function gauss(rng) {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return clamp(Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v), -2.4, 2.4);
}
export const makeNoise = (rng) => ({ x: gauss(rng), y: gauss(rng) });

/** Dónde llega la pelota al plano del arco: lo apuntado más el error de la fuerza. */
export function landing(shot, noise) {
  const s = sigma(shot.p);
  return { x: shot.x + noise.x * s, y: shot.y + noise.y * s * 0.85 };
}

/** La zona (columna y altura) más cercana a un punto del arco: sirve para anotar a dónde pateó cada uno. */
export function zoneOf(x, y) {
  return { c: x < -0.34 ? -1 : x > 0.34 ? 1 : 0, r: y < 0.5 ? 0 : 1 };
}

/**
 * Cuenta de lo que alcanza el arquero (1 o menos: la pelota está a su alcance). `dive` es la zona que eligió.
 */
export function stretch(pt, dive, p) {
  const z = zoneCenter(dive.c, dive.r);
  const k = reach(p);
  // en la columna del medio no se tira de costado: llega mejor a los dos lados
  const rx = RX * k * (dive.c === 0 ? 1.2 : 1);
  return Math.hypot((pt.x - z.x) / rx, (pt.y - z.y) / (RY * k));
}

/**
 * Cómo termina el remate. `kr` es la suerte del arquero (de -0,12 a 0,12: a veces llega por un pelo, a veces se le escapa).
 * Devuelve { result: 'goal' | 'saved' | 'post' | 'wide' | 'over', x, y, d } con el punto al que llegó la pelota y, si hay
 * atajada posible, qué tan cerca estuvo (d <= 1 es que alcanzaba).
 */
export function judge(shot, noise, dive, kr = 0) {
  const pt = landing(shot, noise);
  const out = { x: pt.x, y: pt.y, d: dive ? stretch(pt, dive, shot.p) : 9 };
  const ax = Math.abs(pt.x);
  if (ax > 1 + POST || pt.y > 1 + POST) return { ...out, result: ax > 1 + POST ? 'wide' : 'over' };
  // toca el palo o el travesaño (y vuelve a la cancha)
  if (pt.y > 0 && ((ax > 1 - POST && ax <= 1 + POST) || (pt.y > 1 - POST && pt.y <= 1 + POST))) return { ...out, result: 'post' };
  if (out.d <= 1 + kr) return { ...out, result: 'saved' };
  return { ...out, result: 'goal' };
}

export const SCORES = new Set(['goal']);
/** Para anotar en el marcador: ¿entró? */
export const isGoal = (result) => result === 'goal';
