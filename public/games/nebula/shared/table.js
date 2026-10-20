/**
 * Nébula — la mesa: paredes (polilíneas), postes y hongos (círculos), flippers, gomas que patean, blancos fijos y
 * de caída, carriles de arriba, la órbita, la rampa del cometa, el agujero negro y el tobogán del lanzador.
 * Coordenadas en unidades de mesa (600 × 1100), y hacia abajo. La pelota tiene radio 11.
 */

export const W = 600;
export const H = 1100;
export const BALL_R = 11;
export const CX = 285; // centro del campo (el tobogán del lanzador ocupa x 540–570)

/** Arco como polilínea: centro, radio, ángulo inicial y final (radianes, y hacia abajo), cantidad de tramos. */
export function arc(cx, cy, r, a0, a1, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}
const PI = Math.PI;

// ---------------------------------------------------------------- paredes
/**
 * Cada pared es una polilínea con rebote `e`. `oneWay`: solo choca si la pelota viene en contra de su normal
 * (la compuerta del lanzador). `kind` sirve para el dibujo.
 */
export const WALLS = [
  // borde exterior: izquierda, arco de arriba y derecha (incluye el tobogán)
  { pts: [[30, 1100], [30, 640], [34, 560], [30, 330], ...arc(300, 330, 270, PI, 2 * PI, 40).slice(1), [570, 1100]], e: 0.45, kind: 'rail' },
  // separador del tobogán del lanzador
  { pts: [[540, 1100], [540, 420]], e: 0.4, kind: 'rail' },
  // guía interior de la órbita izquierda (sube pegada a la pared y gira por arriba)
  { pts: [[80, 540], [80, 330], ...arc(300, 330, 220, PI, PI * 1.32, 12).slice(1)], e: 0.45, kind: 'guide' },
  // desvío de la pared izquierda bajo la órbita (aleja la pelota del pasillo de afuera)
  { pts: [[30, 600], [58, 650], [30, 700]], e: 0.5, kind: 'rail' },
  // guías de los carriles de abajo (izquierda y derecha) hasta los flippers
  { pts: [[72, 770], [72, 905], [182, 963]], e: 0.35, kind: 'guide' },
  { pts: [[498, 770], [498, 905], [388, 963]], e: 0.35, kind: 'guide' },
  // paredes de abajo, afuera de los flippers (encauzan al desagüe del medio)
  { pts: [[30, 1060], [150, 1100]], e: 0.3, kind: 'apron' },
  { pts: [[540, 1060], [420, 1100]], e: 0.3, kind: 'apron' },
  // separadores de los carriles de arriba (3 carriles)
  { pts: [[214, 168], [214, 205]], e: 0.4, kind: 'post' },
  { pts: [[264, 160], [264, 200]], e: 0.4, kind: 'post' },
  { pts: [[314, 160], [314, 200]], e: 0.4, kind: 'post' },
  { pts: [[364, 168], [364, 205]], e: 0.4, kind: 'post' },
  // boca de la rampa del cometa (derecha, mira abajo a la izquierda)
  { pts: [[430, 560], [452, 470]], e: 0.4, kind: 'ramp' },
  { pts: [[500, 590], [540, 520]], e: 0.4, kind: 'ramp' },
  // techo de la boca: si la pelota no sube con fuerza rebota y vuelve; lo que cae encima rueda a la izquierda
  { pts: [[452, 470], [540, 430]], e: 0.25, kind: 'rampBack' },
  // compuerta del lanzador: deja salir la pelota hacia arriba y desvía lo que baja hacia el campo
  { pts: [[540, 420], [570, 392]], e: 0.4, kind: 'gate', oneWay: true },
];

// ---------------------------------------------------------------- círculos
/** Hongos (bumpers, patean), postes (rebote) y el agujero negro (sensor que atrapa). */
export const BUMPERS = [
  { id: 'b1', x: 222, y: 290, r: 28, kick: 520 },
  { id: 'b2', x: 340, y: 285, r: 28, kick: 520 },
  { id: 'b3', x: 282, y: 375, r: 30, kick: 560 },
];
export const POSTS = [
  { x: 72, y: 770, r: 7 },
  { x: 498, y: 770, r: 7 },
  { x: 160, y: 470, r: 6 },
  { x: 410, y: 470, r: 6 },
];
export const HOLE = { x: 285, y: 600, r: 18, capture: 15 };

// ---------------------------------------------------------------- gomas (slingshots)
/** Triángulos; `face` es el lado que patea (índices de vértices). */
export const SLINGS = [
  { id: 'sl', pts: [[110, 782], [110, 880], [170, 914]], face: [0, 2], kick: 430 },
  { id: 'sr', pts: [[460, 782], [460, 880], [400, 914]], face: [0, 2], kick: 430 },
];

// ---------------------------------------------------------------- flippers
export const FLIPPERS = [
  { id: 'L', x: 192, y: 980, len: 84, r0: 13, r1: 7, rest: 0.5, up: -0.42, dir: 1 },
  { id: 'R', x: 378, y: 980, len: 84, r0: 13, r1: 7, rest: 0.5, up: -0.42, dir: -1 },
];

// ---------------------------------------------------------------- blancos
/** Blancos fijos N-E-B (izquierda, en diagonal) y de caída U-L-A (derecha, contra la pared del lanzador). */
export const TARGETS = [
  { id: 'N', a: [118, 430], b: [138, 414], kind: 'stand' },
  { id: 'E', a: [144, 410], b: [164, 394], kind: 'stand' },
  { id: 'B', a: [170, 390], b: [190, 374], kind: 'stand' },
  { id: 'U', a: [532, 612], b: [532, 644], kind: 'drop' },
  { id: 'L', a: [532, 658], b: [532, 690], kind: 'drop' },
  { id: 'A', a: [532, 704], b: [532, 736], kind: 'drop' },
];
export const LETTERS = ['N', 'E', 'B', 'U', 'L', 'A'];

// ---------------------------------------------------------------- sensores
/** Zonas que avisan cuando la pelota pasa (carriles de arriba, órbita, rampa, salida, desagüe, pasillos de afuera). */
export const SENSORS = [
  { id: 'lane0', x: 239, y: 186, r: 13 },
  { id: 'lane1', x: 289, y: 182, r: 13 },
  { id: 'lane2', x: 339, y: 186, r: 13 },
  { id: 'orbitIn', x: 55, y: 520, r: 18 }, // entrada de la órbita (hay que subir)
  { id: 'orbitTop', x: 300, y: 76, r: 20 }, // la pelota pasó por arriba de todo
  { id: 'ramp', x: 482, y: 488, r: 22 }, // fondo de la boca de la rampa
  { id: 'outL', x: 51, y: 860, r: 16 },
  { id: 'outR', x: 519, y: 860, r: 16 },
  { id: 'inL', x: 91, y: 860, r: 12 },
  { id: 'inR', x: 479, y: 860, r: 12 },
  { id: 'launch', x: 555, y: 380, r: 16 },
];
export const SPINNER = { x: 55, y: 470, half: 22 };

/** Recorrido de la rampa del cometa (la pelota viaja sola por arriba de la mesa y baja al carril izquierdo). */
export const RAMP_PATH = [
  [486, 490], [500, 400], [490, 300], [450, 210], [380, 150], [290, 128], [200, 150], [140, 210], [110, 300], [96, 420], [90, 560], [88, 700], [88, 820],
];

/** Lanzador: la pelota espera acá; tirar más fuerte la lleva más arriba. */
export const PLUNGER = { x: 555, y: 1040, minV: 900, maxV: 2550 };
export const DRAIN_Y = 1090;
