/**
 * Cruce — modelos vóxel armados con cajas (una sola geometría por modelo, con colores por vértice).
 * Unidades: una casilla = 1. Los personajes miran hacia -z (adelante) y apoyan en y = 0.
 */
import * as THREE from '/vendor/three.min.js';

const FACES = [
  // normal, 4 esquinas (como factores -1/1 de x, y, z)
  [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]],
  [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
  [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]],
  [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
  [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
  [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
];
const tmp = new THREE.Color();

/** Junta cajas en una geometría. Cada caja: [x, y, z, w, h, d, color] con (x, z) el centro y y la base. */
export class Vox {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.idx = [];
    this.ox = this.oy = this.oz = 0;
    this.flip = false;
    this.dim = 1; // oscurece lo que se agregue (decorado fuera de la zona jugable)
  }
  /** Corre lo que se agregue después (para juntar varios modelos en una sola geometría). `flip`: espejado en x. */
  at(x, y, z, flip = false) {
    this.ox = x;
    this.oy = y;
    this.oz = z;
    this.flip = flip;
    return this;
  }
  box(x, y, z, w, h, d, color, shadeTop = 1.06) {
    const c = color instanceof THREE.Color ? color : tmp.set(color);
    const cx = (this.flip ? -x : x) + this.ox, cy = y + h / 2 + this.oy, cz = z + this.oz;
    for (const [n, corners] of FACES) {
      const k = (n[1] > 0 ? shadeTop : n[1] < 0 ? 0.7 : 1) * this.dim;
      const base = this.pos.length / 3;
      for (const [a, b, e] of corners) {
        this.pos.push(cx + (a * w) / 2, cy + (b * h) / 2, cz + (e * d) / 2);
        this.nor.push(n[0], n[1], n[2]);
        this.col.push(Math.min(1, c.r * k), Math.min(1, c.g * k), Math.min(1, c.b * k));
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return this;
  }
  get empty() {
    return !this.pos.length;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const v = () => new Vox();
const eyes = (b, y, z, sx = 0.14, w = 0.07, h = 0.09, white = false) => {
  for (const s of [-1, 1]) {
    if (white) b.box(s * sx, y - 0.02, z, w + 0.06, h + 0.06, 0.03, '#ffffff');
    b.box(s * sx, y, z - 0.012, w, h, 0.03, '#15151f');
  }
};

/** Personajes: nombre, precio en monedas y modelo. */
export const CHARACTERS = [
  {
    id: 'pollito',
    name: { es: 'Pollito', en: 'Chick' },
    price: 0,
    color: '#ffd23f',
    build() {
      const b = v();
      b.box(0, 0.08, 0, 0.56, 0.52, 0.56, '#ffd23f');
      b.box(0, 0.6, 0.02, 0.12, 0.1, 0.22, '#ff3b3b');
      b.box(0, 0.34, -0.31, 0.16, 0.08, 0.1, '#ff8c1a');
      b.box(0, 0.3, -0.3, 0.12, 0.04, 0.08, '#e06d00');
      eyes(b, 0.44, -0.285, 0.15);
      for (const s of [-1, 1]) {
        b.box(s * 0.3, 0.22, 0.04, 0.06, 0.2, 0.3, '#f2b81c');
        b.box(s * 0.13, 0, -0.04, 0.1, 0.08, 0.16, '#ff8c1a');
      }
      return b.geometry();
    },
  },
  {
    id: 'pingui',
    name: { es: 'Pingüino con casco', en: 'Helmet penguin' },
    price: 30,
    color: '#ff4d4d',
    build() {
      const b = v();
      b.box(0, 0.06, 0, 0.52, 0.6, 0.5, '#1d2333');
      b.box(0, 0.1, -0.252, 0.36, 0.42, 0.02, '#f4f4f4');
      b.box(0, 0.64, 0, 0.58, 0.14, 0.56, '#ff4d4d');
      b.box(0, 0.78, 0, 0.42, 0.06, 0.42, '#ff4d4d');
      b.box(0, 0.64, -0.29, 0.6, 0.05, 0.04, '#ffffff');
      b.box(0, 0.42, -0.3, 0.14, 0.07, 0.1, '#ff9f1c');
      eyes(b, 0.52, -0.262, 0.13, 0.05, 0.07, true);
      for (const s of [-1, 1]) {
        b.box(s * 0.29, 0.2, 0, 0.06, 0.34, 0.3, '#151a27');
        b.box(s * 0.13, 0, -0.06, 0.14, 0.06, 0.2, '#ff9f1c');
      }
      return b.geometry();
    },
  },
  {
    id: 'rana',
    name: { es: 'Rana', en: 'Frog' },
    price: 60,
    color: '#4cd964',
    build() {
      const b = v();
      b.box(0, 0.06, 0.02, 0.62, 0.34, 0.56, '#4cd964');
      b.box(0, 0.06, -0.27, 0.46, 0.18, 0.04, '#b8f5a0');
      b.box(0, 0.26, -0.275, 0.3, 0.03, 0.03, '#b33a3a');
      for (const s of [-1, 1]) {
        b.box(s * 0.17, 0.38, -0.12, 0.18, 0.18, 0.18, '#4cd964');
        b.box(s * 0.17, 0.42, -0.215, 0.12, 0.12, 0.02, '#ffffff');
        b.box(s * 0.17, 0.43, -0.228, 0.06, 0.07, 0.02, '#15151f');
        b.box(s * 0.33, 0, 0.12, 0.14, 0.16, 0.3, '#2fae4a');
        b.box(s * 0.3, 0, -0.2, 0.1, 0.06, 0.14, '#2fae4a');
      }
      return b.geometry();
    },
  },
  {
    id: 'gato',
    name: { es: 'Gato', en: 'Cat' },
    price: 90,
    color: '#ff9f43',
    build() {
      const b = v();
      b.box(0, 0.06, 0.04, 0.5, 0.5, 0.58, '#ff9f43');
      for (const z of [-0.05, 0.12]) b.box(0, 0.555, z, 0.5, 0.012, 0.06, '#d9762a');
      b.box(0, 0.12, -0.255, 0.3, 0.22, 0.02, '#fff2e0');
      b.box(0, 0.3, -0.27, 0.07, 0.05, 0.03, '#ff6b8b');
      eyes(b, 0.42, -0.255, 0.12, 0.06, 0.08);
      for (const s of [-1, 1]) {
        b.box(s * 0.16, 0.56, -0.1, 0.12, 0.14, 0.1, '#ff9f43');
        b.box(s * 0.16, 0.58, -0.152, 0.06, 0.08, 0.02, '#ffc0cb');
        b.box(s * 0.14, 0, -0.16, 0.12, 0.07, 0.14, '#fff2e0');
      }
      b.box(0.14, 0.3, 0.38, 0.08, 0.08, 0.2, '#ff9f43');
      b.box(0.14, 0.34, 0.46, 0.08, 0.36, 0.08, '#d9762a');
      return b.geometry();
    },
  },
  {
    id: 'robot',
    name: { es: 'Robot', en: 'Robot' },
    price: 150,
    color: '#7fd6ff',
    build() {
      const b = v();
      b.box(0, 0.1, 0, 0.54, 0.56, 0.5, '#b8c4d6');
      b.box(0, 0.36, -0.252, 0.44, 0.22, 0.02, '#1c2a4a');
      for (const s of [-1, 1]) b.box(s * 0.11, 0.42, -0.265, 0.1, 0.08, 0.02, '#4dfcff');
      b.box(0, 0.16, -0.255, 0.3, 0.12, 0.02, '#8d99ad');
      b.box(0, 0.66, 0, 0.04, 0.16, 0.04, '#5e6a7e');
      b.box(0, 0.8, 0, 0.1, 0.1, 0.1, '#ff3b5c');
      for (const s of [-1, 1]) {
        b.box(s * 0.3, 0.26, 0, 0.06, 0.24, 0.2, '#8d99ad');
        b.box(s * 0.15, 0, 0, 0.16, 0.1, 0.36, '#3a4458');
      }
      return b.geometry();
    },
  },
  {
    id: 'zorro',
    name: { es: 'Zorro', en: 'Fox' },
    price: 250,
    color: '#ff6b35',
    build() {
      const b = v();
      b.box(0, 0.06, 0.04, 0.5, 0.48, 0.58, '#ff6b35');
      b.box(0, 0.08, -0.255, 0.32, 0.24, 0.02, '#fff4ea');
      b.box(0, 0.2, -0.36, 0.22, 0.16, 0.2, '#fff4ea');
      b.box(0, 0.3, -0.465, 0.07, 0.06, 0.03, '#15151f');
      eyes(b, 0.42, -0.255, 0.12, 0.06, 0.07);
      for (const s of [-1, 1]) {
        b.box(s * 0.16, 0.54, -0.08, 0.13, 0.16, 0.1, '#ff6b35');
        b.box(s * 0.16, 0.64, -0.08, 0.08, 0.06, 0.1, '#15151f');
        b.box(s * 0.14, 0, -0.16, 0.12, 0.07, 0.14, '#2a1a12');
      }
      b.box(0, 0.24, 0.42, 0.2, 0.2, 0.3, '#ff6b35');
      b.box(0, 0.26, 0.6, 0.16, 0.16, 0.08, '#fff4ea');
      return b.geometry();
    },
  },
];

const CAR_COLORS = ['#ff4d4d', '#3e8bff', '#ffcc00', '#3ccf6e', '#9d6bff', '#ff8fd0'];

/** Auto (largo ~1,4) que mira hacia +x. `kind` 0..5 = color. */
export function carGeo(kind) {
  const c = CAR_COLORS[kind % CAR_COLORS.length];
  const b = v();
  b.box(0, 0.14, 0, 1.4, 0.36, 0.8, c);
  b.box(-0.08, 0.5, 0, 0.82, 0.3, 0.72, c);
  b.box(0.335, 0.52, 0, 0.02, 0.24, 0.6, '#27324a'); // parabrisas
  b.box(-0.495, 0.52, 0, 0.02, 0.24, 0.6, '#27324a');
  for (const s of [-1, 1]) b.box(-0.08, 0.53, s * 0.362, 0.66, 0.2, 0.02, '#27324a');
  b.box(0.71, 0.3, 0.25, 0.03, 0.1, 0.14, '#fff6c2');
  b.box(0.71, 0.3, -0.25, 0.03, 0.1, 0.14, '#fff6c2');
  b.box(-0.71, 0.3, 0.27, 0.03, 0.08, 0.12, '#ff2a2a');
  b.box(-0.71, 0.3, -0.27, 0.03, 0.08, 0.12, '#ff2a2a');
  for (const x of [-0.42, 0.42]) for (const s of [-1, 1]) b.box(x, 0, s * 0.39, 0.3, 0.28, 0.1, '#1b1b22');
  return b.geometry();
}

/** Camión (largo ~2,5) que mira hacia +x. */
export function truckGeo(kind) {
  const cargo = ['#f4f4f4', '#ffb347', '#7ec8e3'][kind % 3];
  const cab = ['#3e8bff', '#e63946', '#2a9d8f'][kind % 3];
  const b = v();
  b.box(-0.35, 0.18, 0, 1.8, 0.9, 0.84, cargo);
  b.box(-0.35, 1.08, 0, 1.7, 0.02, 0.76, '#ffffff');
  b.box(0.85, 0.16, 0, 0.6, 0.62, 0.8, cab);
  b.box(1.152, 0.48, 0, 0.02, 0.22, 0.62, '#27324a');
  for (const s of [-1, 1]) b.box(0.88, 0.5, s * 0.402, 0.36, 0.18, 0.02, '#27324a');
  b.box(1.155, 0.26, 0.26, 0.03, 0.1, 0.14, '#fff6c2');
  b.box(1.155, 0.26, -0.26, 0.03, 0.1, 0.14, '#fff6c2');
  for (const x of [-1, -0.5, 0.85]) for (const s of [-1, 1]) b.box(x, 0, s * 0.4, 0.32, 0.3, 0.1, '#1b1b22');
  return b.geometry();
}

/** Árbol (variante 0..2) o piedra (3..4), dibujado en `b` (en la posición que marque b.at). */
export function drawTree(b, kind) {
  if (kind >= 3) {
    b.box(0, 0, 0, 0.66, 0.34, 0.6, '#9aa3ad');
    b.box(0.06, 0.34, -0.04, 0.4, 0.16, 0.36, '#b4bcc6');
    if (kind === 4) b.box(-0.18, 0.34, 0.14, 0.2, 0.1, 0.2, '#b4bcc6');
    return b;
  }
  b.box(0, 0, 0, 0.24, 0.36 + kind * 0.08, 0.24, '#8b5a2b');
  const g = ['#3caa3c', '#2f9e4f', '#5bbf3a'][kind];
  const g2 = ['#58c458', '#46b86a', '#7ad65a'][kind];
  let y = 0.34 + kind * 0.08;
  const layers = kind === 1 ? 3 : 2;
  for (let i = 0; i < layers; i++) {
    const w = 0.76 - i * 0.16;
    const h = kind === 1 ? 0.34 : 0.44 - i * 0.08;
    b.box(0, y, 0, w, h, w, i % 2 ? g2 : g);
    y += h;
  }
  return b;
}
/** Alto de cada variante (para la sombra). */
export const TREE_H = [1.22, 1.44, 1.38, 0.5, 0.5];

/** Tronco de largo `len` (a lo largo de x). */
export function logGeo(len) {
  const b = v();
  b.box(0, -0.16, 0, len - 0.06, 0.36, 0.7, '#a0522d');
  for (let x = -len / 2 + 0.5; x < len / 2 - 0.3; x += 0.9) b.box(x, 0.2, 0, 0.3, 0.012, 0.7, '#8a4524');
  for (const s of [-1, 1]) b.box((s * (len - 0.06)) / 2, -0.12, 0, 0.04, 0.28, 0.6, '#e2b07e');
  return b.geometry();
}

/** Camalote (hoja quieta en el río). */
export function padGeo() {
  const b = v();
  b.box(0, -0.16, 0, 0.82, 0.06, 0.82, '#3fae5a');
  b.box(0.18, -0.1, -0.18, 0.3, 0.012, 0.3, '#5cd07a');
  b.box(-0.2, -0.1, 0.16, 0.12, 0.08, 0.12, '#ff8fd0');
  return b.geometry();
}

/** Tren: locomotora y vagones (largo total `len`, hacia +x). */
export function trainGeo(len) {
  const b = v();
  const unit = 2;
  const n = Math.round(len / unit);
  for (let i = 0; i < n; i++) {
    const x0 = -len / 2 + i * unit + 0.05;
    const loco = i === n - 1;
    const c = loco ? '#e63946' : i % 2 ? '#457b9d' : '#5c93b5';
    b.box(x0 + unit / 2 - 0.05, 0.16, 0, unit - 0.1, 1.0, 0.9, c);
    b.box(x0 + unit / 2 - 0.05, 1.16, 0, unit - 0.3, 0.06, 0.8, '#dfe6ee');
    b.box(x0 + unit / 2 - 0.05, 0.62, 0, unit - 0.3, 0.06, 0.92, '#ffcc00');
    if (!loco) for (let w = 0; w < 3; w++) for (const s of [-1, 1]) b.box(x0 + 0.35 + w * 0.6, 0.74, s * 0.452, 0.38, 0.26, 0.02, '#cfe8ff');
    else {
      b.box(x0 + unit - 0.1, 0.7, 0, 0.04, 0.34, 0.7, '#27324a');
      b.box(x0 + unit - 0.08, 0.3, 0.28, 0.04, 0.12, 0.16, '#fff6c2');
      b.box(x0 + unit - 0.08, 0.3, -0.28, 0.04, 0.12, 0.16, '#fff6c2');
      b.box(x0 + 0.6, 1.16, 0, 0.3, 0.3, 0.3, '#333');
    }
    for (const x of [0.4, unit - 0.5]) for (const s of [-1, 1]) b.box(x0 + x, 0, s * 0.44, 0.34, 0.24, 0.08, '#1b1b22');
  }
  return b.geometry();
}

/** Águila (alas abiertas, mira hacia -z). */
export function eagleGeo() {
  const b = v();
  b.box(0, 0, 0, 0.5, 0.4, 1.0, '#6b4226');
  b.box(0, 0.06, -0.62, 0.4, 0.4, 0.36, '#ffffff');
  b.box(0, 0.12, -0.84, 0.14, 0.14, 0.14, '#ffcc00');
  for (const s of [-1, 1]) {
    b.box(s * 0.75, 0.2, 0, 1.0, 0.08, 0.6, '#5a3620');
    b.box(s * 1.35, 0.2, 0.08, 0.4, 0.06, 0.44, '#3f2616');
    b.box(s * 0.12, 0.2, -0.72, 0.05, 0.06, 0.02, '#15151f');
  }
  b.box(0, 0.05, 0.62, 0.42, 0.06, 0.34, '#ffffff');
  return b.geometry();
}

/** Moneda (de canto, gira sobre y). */
export function coinGeo() {
  const g = new THREE.CylinderGeometry(0.22, 0.22, 0.07, 18);
  g.rotateX(Math.PI / 2);
  return g;
}
