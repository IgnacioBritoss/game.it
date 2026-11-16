/**
 * Tuercas — los circuitos. Cada uno se escribe como un trazado de "tortuga" que arranca en la largada mirando a +x:
 *   ['s', largo, { opciones }]            recta ('?' = largo libre: hay dos por pista y se calculan para que cierre)
 *   ['l' | 'r', radio, grados, { … }]     curva a la izquierda / derecha
 * Las opciones de forma se arrastran al tramo siguiente hasta que se cambian:
 *   y  altura al final del tramo     w  ancho de la calzada     L / R  metros de banquina a izquierda / derecha
 *   e / eL / eR  qué hay después de la banquina: 'wall' (valla, rebota) o 'fall' (agua, lava, vacío: caés y te reponen)
 * Lo que va sobre la pista se ubica por fracción del tramo (0 = donde empieza, 1 = donde termina):
 *   pad   acelerador: f o [f, d]          (d = desvío lateral en fracción del medio ancho, + = izquierda)
 *   box   fila de cajas sorpresa: f o [f, cuántas, cuánto ancho ocupan]
 *   ramp  lomo con salto: [f del borde, largo, alto]
 *   nuts  hilera de tuercas: [f, cuántas, d, onda]
 *   obs   estorbo que va y viene a lo ancho: [f, d, amplitud, período en s, tipo, radio]
 * Para varias cosas del mismo tipo en un tramo se pasa una lista de listas. track.js arma la pista y la valida.
 */
import { buildTrack } from './track.js';

export const TRACK_DEFS = [
  {
    id: 'pradera',
    name: { es: 'La Pradera', en: 'The Meadow' },
    blurb: { es: 'Curvas amplias entre molinos y lomas. Ideal para agarrarle la mano.', en: 'Sweeping bends among windmills and hills. Perfect to get the hang of it.' },
    theme: 'pradera',
    stars: 1,
    width: 18,
    margin: 9,
    edge: 'wall',
    path: [
      ['s', 84, { pad: 0.55, nuts: [0.12, 5, 0.45] }],
      ['r', 46, 95, { y: 2.5, nuts: [0.3, 5, -0.4] }],
      ['s', '?', { y: 5, box: 0.5 }],
      ['r', 42, 85, { y: 7 }],
      ['s', '?', { nuts: [0.1, 5, 0.3, 0.3] }],
      ['r', 36, 55, { y: 5 }],
      ['s', 10, { y: 4 }],
      ['l', 36, 110, { obs: [0.5, 0, 0.55, 5.5, 'fardo', 1.3] }],
      ['s', 10],
      ['r', 36, 55, { y: 6 }],
      ['s', 24, { y: 7, box: 0.2, pad: 0.6 }],
      ['r', 42, 85, { y: 5 }],
      ['s', 30, { y: 3, box: 0.6 }],
      ['r', 46, 95, { y: 0.5, nuts: [0.3, 6, 0.35] }],
      ['s', 84, { y: 0, pad: [0.2, 0.45], nuts: [0.45, 5, -0.4] }],
    ],
  },
  {
    id: 'costa',
    name: { es: 'Costa Caracola', en: 'Seashell Coast' },
    blurb: { es: 'Arena que frena, un muelle angosto con salto y el mar siempre a la derecha.', en: 'Sand that slows you down, a narrow pier with a jump and the sea always on your right.' },
    theme: 'costa',
    stars: 2,
    width: 17,
    margin: 9,
    edge: 'wall',
    y: 0.6,
    path: [
      ['s', 90, { L: 9, R: 5, eR: 'fall', pad: [0.5, 0.4], nuts: [0.1, 5, -0.4] }],
      ['l', 60, 80, { box: 0.75 }],
      ['s', 30, { nuts: [0.1, 6, 0, 0.25] }],
      ['l', 42, 100, { y: 1.6, w: 13, L: 1.2, R: 1.2, e: 'wall' }],
      ['s', 56, { pad: 0.2, box: [0.36, 3, 0.7], ramp: [0.6, 9, 1.3] }],
      ['l', 32, 50, { y: 0.8, w: 17, L: 9, R: 5, eR: 'fall' }],
      ['s', 8, { nuts: [0, 5, 0.35] }],
      ['r', 32, 100, { obs: [0.5, 0, 0.6, 4.2, 'cangrejo', 1.0] }],
      ['s', 8],
      ['l', 32, 50, { y: 2, box: 0.9 }],
      ['s', '?', { y: 3, pad: [0.5, -0.3], nuts: [0.1, 6, -0.3, 0.3] }],
      ['l', 50, 90, { y: 2, obs: [0.6, 0.1, 0.55, 3.6, 'cangrejo', 1.0] }],
      ['s', '?', { y: 0.8, box: 0.5 }],
      ['l', 50, 90, { y: 0.6, nuts: [0.3, 5, 0.4] }],
      ['s', 66],
    ],
  },
  {
    id: 'ciudad',
    name: { es: 'Ciudad Farol', en: 'Lantern City' },
    blurb: { es: 'De noche, entre edificios: rectas largas, esquinas a 90° y paredes pegadas.', en: 'At night among buildings: long straights, 90° corners and walls right at the edge.' },
    theme: 'ciudad',
    stars: 2,
    width: 16,
    margin: 1.4,
    edge: 'wall',
    path: [
      ['s', 100, { pad: [0.5, -0.4], nuts: [0.1, 6, 0.45], box: 0.92 }],
      ['r', 24, 90],
      ['s', '?', { pad: 0.3, nuts: [0.5, 5, -0.4], obs: [[0.75, 0.45, 0, 4, 'cono', 0.9], [0.86, -0.45, 0, 4, 'cono', 0.9]] }],
      ['r', 24, 90],
      ['s', 46, { box: 0.5 }],
      ['r', 28, 60, { y: 2 }],
      ['s', 16, { y: 3.5 }],
      ['l', 28, 120, { y: 4, nuts: [0.15, 7, 0, 0.45] }],
      ['s', 16, { y: 3.5 }],
      ['r', 28, 60, { y: 1.5 }],
      ['s', '?', { y: 0, box: 0.35, nuts: [0.6, 5, 0.4] }],
      ['r', 24, 90],
      ['s', 64, { box: 0.15, pad: 0.4, obs: [[0.7, 0, 0, 4, 'cono', 0.9], [0.85, 0.5, 0, 4, 'cono', 0.9]] }],
      ['r', 24, 90],
      ['s', 76, { nuts: [0.2, 5, -0.3] }],
    ],
  },
  {
    id: 'glaciar',
    name: { es: 'Glaciar Tintín', en: 'Tinkle Glacier' },
    blurb: { es: 'Hielo que patina, un eslalon cuesta abajo y muñecos de nieve en el medio.', en: 'Slippery ice, a downhill slalom and snowmen right in the way.' },
    theme: 'glaciar',
    stars: 3,
    width: 18,
    margin: 8,
    edge: 'wall',
    grip: 0.5,
    path: [
      ['s', 100, { pad: 0.5, nuts: [0.1, 5, 0.4] }],
      ['l', 56, 90, { y: 3, box: 0.6 }],
      ['s', 34, { y: 7, nuts: [0.1, 6, -0.35] }],
      ['l', 50, 90, { y: 10 }],
      ['s', 22, { y: 11, box: 0.5 }],
      ['r', 42, 35, { y: 9.5 }],
      ['l', 42, 70, { y: 7.5, nuts: [0.1, 8, 0, 0.5], obs: [0.7, 0.4, 0, 4, 'munieco', 1.2] }],
      ['r', 42, 70, { y: 5, obs: [0.6, -0.35, 0, 4, 'munieco', 1.2] }],
      ['l', 42, 35, { y: 3.5, box: 0.9 }],
      ['s', '?', { y: 2.5, pad: 0.3, ramp: [0.7, 10, 1.2], nuts: [0.05, 5, 0.35] }],
      ['l', 46, 90, { y: 2 }],
      ['s', '?', { y: 1, box: 0.4, nuts: [0.55, 6, -0.4], obs: [0.8, 0, 0.5, 6, 'munieco', 1.2] }],
      ['l', 56, 90, { y: 0 }],
      ['s', 76, { pad: [0.3, -0.4] }],
    ],
  },
  {
    id: 'volcan',
    name: { es: 'Caldera Brava', en: 'Fierce Caldera' },
    blurb: { es: 'Subida al cráter con lava a un costado, dos saltos y poco margen de error.', en: 'A climb to the crater with lava on one side, two jumps and little room for error.' },
    theme: 'volcan',
    stars: 4,
    width: 16,
    margin: 6,
    edge: 'wall',
    path: [
      ['s', 62, { pad: 0.5, nuts: [0.1, 5, -0.4] }],
      ['r', 38, 90, { y: 2, L: 3, R: 3, eL: 'fall', box: 0.9 }],
      ['s', 14, { y: 3 }],
      ['r', 34, 45, { y: 4.5, nuts: [0, 6, 0.3] }],
      ['s', '?', { y: 7.5, obs: [0.5, 0, 0.5, 4.6, 'roca', 1.2] }],
      ['l', 34, 90, { y: 10, box: 0.5 }],
      ['s', 20, { y: 11.5, nuts: [0, 6, 0, 0.35] }],
      ['r', 38, 135, { y: 15 }],
      ['s', '?', { y: 17, w: 18, eR: 'fall', pad: 0.2, ramp: [0.6, 9, 1.2] }],
      ['r', 38, 135, { y: 14, w: 16, eR: 'wall', box: 0.3 }],
      ['s', 20, { y: 12, nuts: [0, 6, -0.3] }],
      ['l', 34, 90, { y: 9, obs: [0.5, 0, 0.5, 3.8, 'roca', 1.2] }],
      ['s', 44, { y: 6, pad: 0.15, ramp: [0.5, 9, 1.1] }],
      ['r', 34, 45, { y: 5 }],
      ['s', 14, { y: 4, box: 0.5 }],
      ['r', 38, 90, { y: 1, L: 6, R: 6, eL: 'wall', nuts: [0.5, 4, 0.4] }],
      ['s', 52, { y: 0 }],
    ],
  },
  {
    id: 'taller',
    name: { es: 'El Tallercito', en: 'The Little Workshop' },
    blurb: { es: 'Una pista de juguete armada sobre el banco de trabajo: tres saltos y casi nada de baranda.', en: 'A toy track built on the workbench: three jumps and hardly any guard rails.' },
    theme: 'taller',
    stars: 5,
    width: 16,
    margin: 1.2,
    edge: 'wall',
    y: 4,
    path: [
      ['s', 66, { pad: [0.45, 0.4], nuts: [0.1, 5, -0.4], box: 0.9 }],
      ['l', 26, 180, { y: 5.5, eL: 'fall' }],
      ['s', 78, { y: 7, eR: 'fall', pad: 0.2, ramp: [0.5, 9, 1.2], nuts: [0.78, 5, 0.3] }],
      ['r', 24, 180, { y: 7.5, eL: 'wall', obs: [0.5, 0, 0.55, 3.4, 'ruleman', 1.15] }],
      ['s', 60, { y: 6, eL: 'fall', box: 0.3, nuts: [0.5, 6, 0, 0.3], obs: [0.88, 0, 0.55, 4.4, 'ruleman', 1.15] }],
      ['l', 26, 180, { y: 7, eR: 'wall' }],
      ['s', '?', { y: 8.5, eR: 'fall', box: 0.1, pad: 0.26, ramp: [0.5, 10, 1.3], nuts: [0.72, 6, -0.3] }],
      ['l', 34, 90, { y: 8, eR: 'wall' }],
      ['s', '?', { y: 5.5, eR: 'fall', pad: 0.2, ramp: [0.45, 9, 1.1], box: 0.72, obs: [0.9, 0, 0.5, 3.9, 'ruleman', 1.15] }],
      ['l', 34, 90, { y: 4.3, e: 'wall', nuts: [0.3, 5, 0] }],
      ['s', 42, { y: 4 }],
    ],
  },
];

export const TRACK_IDS = TRACK_DEFS.map((d) => d.id);

/** Copas: tres carreras cada una. */
export const CUPS = [
  { id: 'tuerca', name: { es: 'Copa Tuerca', en: 'Nut Cup' }, tracks: ['pradera', 'costa', 'ciudad'] },
  { id: 'bulon', name: { es: 'Copa Bulón', en: 'Bolt Cup' }, tracks: ['glaciar', 'volcan', 'taller'] },
];

const cache = new Map();
/** La pista ya armada (se arma una vez y se reutiliza). */
export function getTrack(id) {
  if (!cache.has(id)) {
    const def = TRACK_DEFS.find((d) => d.id === id);
    if (!def) throw new Error(`pista desconocida: ${id}`);
    cache.set(id, buildTrack(def));
  }
  return cache.get(id);
}
