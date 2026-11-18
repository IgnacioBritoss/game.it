/**
 * Tuercas — formas del decorado (árboles, rocas, farolas, juguetes gigantes…) y los estorbos que se mueven por la
 * pista (conos, fardos, cangrejos, muñecos de nieve, rocas rodantes, reglas con patas). Cada forma se arma con el
 * Builder de models.js; las del decorado devuelven solo la geometría (se instancian), los estorbos devuelven un
 * modelo animado con su contorno.
 */
import { THREE, Builder, inked, darker, lighter, mix } from './models.js';
import { clamp, TAU, rng } from './shared/util.js';

const WHITE = '#ffffff';
const INK = '#2b1b3d';

/** Variación de color estable por posición (para que cada instancia no sea idéntica sin crear geometrías nuevas). */
const jitter = (R, c, k = 0.1) => (R() < 0.5 ? darker(c, k * R()) : lighter(c, k * R()));

// ---------------------------------------------------------------- decorado (solo geometría)
export const shapes = {
  roundTree(leaf = '#3fb04a', leaf2 = '#5acb5e', trunk = '#8a5a35') {
    const b = new Builder();
    b.cyl(0.28, 0.4, 2.2, trunk, { p: [0, 1.1, 0], seg: 7 });
    b.sphere(1.5, leaf, { p: [0, 3.1, 0], s: [1, 0.9, 1], seg: 9, rings: 6 });
    b.sphere(1.05, leaf2, { p: [0.75, 4.0, 0.2], seg: 8, rings: 5 });
    b.sphere(0.95, leaf2, { p: [-0.65, 3.9, -0.4], seg: 8, rings: 5 });
    b.sphere(0.8, lighter(leaf2, 0.18), { p: [0, 4.75, 0], seg: 8, rings: 5 });
    return b.build();
  },
  pine(snow = false, green = '#2f8a4e') {
    const b = new Builder();
    b.cyl(0.26, 0.36, 1.7, '#6b4a35', { p: [0, 0.85, 0], seg: 6 });
    for (let k = 0; k < 4; k++) {
      const r = 2.15 - k * 0.46;
      const h = 2.3;
      const y = 1.4 + k * 1.35;
      const white = '#eef6ff';
      const col = snow ? (v) => (v.y > -h * 0.12 ? white : green) : k % 2 ? lighter(green, 0.08) : green;
      b.cone(r, h, col, { p: [0, y + h / 2, 0], seg: 8 });
    }
    return b.build();
  },
  bush(c = '#4ebf50') {
    const b = new Builder();
    b.sphere(0.8, c, { p: [0, 0.55, 0], s: [1.2, 0.85, 1], seg: 8, rings: 5 });
    b.sphere(0.6, lighter(c, 0.12), { p: [0.7, 0.45, 0.2], seg: 7, rings: 4 });
    b.sphere(0.55, darker(c, 0.08), { p: [-0.6, 0.4, -0.3], seg: 7, rings: 4 });
    return b.build();
  },
  haystack() {
    const b = new Builder();
    b.cyl(1.25, 1.35, 1.5, '#e8c14a', { p: [0, 0.75, 0], seg: 10 });
    b.dome(1.25, '#f0cf66', { p: [0, 1.5, 0], s: [1, 1.0, 1], seg: 10, rings: 4 });
    b.cyl(1.37, 1.37, 0.14, '#b98a2e', { p: [0, 0.7, 0], seg: 10 });
    return b.build();
  },
  flowers(petal = '#ff6bb5') {
    const b = new Builder();
    for (const [x, z, h] of [[0, 0, 0.55], [0.35, 0.2, 0.42], [-0.3, 0.25, 0.5], [0.1, -0.35, 0.4], [-0.25, -0.2, 0.36]]) {
      b.tube([x, 0, z], [x, h, z], 0.025, '#3b9a45', { seg: 5 });
      b.sphere(0.13, petal, { p: [x, h + 0.04, z], seg: 6, rings: 4 });
      b.sphere(0.06, '#ffd23f', { p: [x, h + 0.1, z], seg: 5, rings: 3 });
    }
    return b.build();
  },
  windmillTower() {
    const b = new Builder();
    b.cyl(1.3, 2.3, 8, '#f4ead6', { p: [0, 4, 0], seg: 10 });
    b.cyl(1.36, 1.55, 0.6, '#c9a46a', { p: [0, 7.6, 0], seg: 10 });
    b.cone(1.9, 2.6, '#e8483f', { p: [0, 9.1, 0], seg: 10 });
    b.rbox(1.2, 1.8, 0.2, 0.08, '#7a4a28', { p: [0, 1.1, 2.12] });
    b.mirror((s) => b.rbox(0.7, 0.9, 0.2, 0.05, '#7fd0ff', { p: [s * 0.0 + 0, 5.2, 1.65 - 0.05 * s], r: [0.2, 0, 0], s: [1, 1, 1] }));
    b.cyl(0.3, 0.3, 0.9, '#7a4a28', { p: [0, 8.2, 1.4], r: [Math.PI / 2, 0, 0], seg: 8 });
    return b.build();
  },
  windmillBlades() {
    const b = new Builder();
    for (let k = 0; k < 4; k++) {
      b.group({ r: [0, 0, (k * Math.PI) / 2] }, () => {
        b.rbox(0.28, 5.6, 0.14, 0.05, '#7a4a28', { p: [0, 3.0, 0] });
        b.rbox(1.15, 3.5, 0.1, 0.04, '#fff7e6', { p: [0.7, 3.4, 0.03] });
      });
    }
    b.sphere(0.45, '#c9a46a', { seg: 8, rings: 5 });
    return b.build();
  },
  palm(lean = 0.35) {
    const b = new Builder();
    const pts = [[0, 0, 0], [lean * 0.5, 2.2, 0], [lean * 1.4, 4.4, 0], [lean * 2.6, 6.2, 0]];
    for (let k = 0; k < 3; k++) b.tube(pts[k], pts[k + 1], 0.36 - k * 0.04, k % 2 ? '#a9743f' : '#b9814a', { seg: 7 });
    for (let k = 0; k < 8; k++) {
      b.group({ p: [pts[3][0], pts[3][1] + 0.1, 0], r: [0, (k / 8) * TAU, 0] }, () => {
        b.cone(0.55, 3.4, k % 2 ? '#2fae5a' : '#43c46a', { p: [0, 0.2, 1.5], r: [Math.PI / 2 + 0.55, 0, 0], s: [1, 1, 0.22], seg: 6 });
      });
    }
    b.sphere(0.2, '#5a3a22', { p: [pts[3][0] + 0.2, pts[3][1] - 0.15, 0.2], seg: 6, rings: 4 });
    b.sphere(0.2, '#5a3a22', { p: [pts[3][0] - 0.2, pts[3][1] - 0.2, -0.1], seg: 6, rings: 4 });
    return b.build();
  },
  umbrella(c = '#ff4b4b') {
    const b = new Builder();
    b.cyl(0.06, 0.06, 2.4, '#f4f1ea', { p: [0, 1.2, 0], seg: 6 });
    for (let k = 0; k < 8; k++) {
      b.group({ r: [0, (k / 8) * TAU, 0] }, () => {
        b.cone(1.1, 0.9, k % 2 ? c : WHITE, { p: [0.0, 2.55, 0.0], s: [0.38, 1, 1], r: [0, 0, 0], seg: 4, deform: (v) => (v.z += 0) });
      });
    }
    b.dome(1.55, c, { p: [0, 2.2, 0], s: [1, 0.55, 1], seg: 12, rings: 3 });
    b.rbox(1.8, 0.05, 0.9, 0.02, '#ffd23f', { p: [1.8, 0.03, 0.4], r: [0, 0.4, 0] });
    return b.build();
  },
  lighthouse() {
    const b = new Builder();
    for (let k = 0; k < 4; k++) b.cyl(1.5 - (k + 1) * 0.16, 1.5 - k * 0.16, 2.3, k % 2 ? '#e8483f' : '#f4f1ea', { p: [0, 1.15 + k * 2.3, 0], seg: 12 });
    b.cyl(1.55, 1.2, 0.5, '#2b1b3d', { p: [0, 9.45, 0], seg: 12 });
    b.cyl(0.8, 0.8, 1.3, '#ffe27a', { p: [0, 10.35, 0], seg: 10 });
    b.cone(1.2, 1.2, '#e8483f', { p: [0, 11.6, 0], seg: 10 });
    b.sphere(0.2, '#ffd23f', { p: [0, 12.3, 0], seg: 6, rings: 4 });
    b.rbox(1.0, 1.4, 0.2, 0.08, '#7a4a28', { p: [0, 0.7, 1.4] });
    return b.build();
  },
  boat(c = '#3d8bff') {
    const b = new Builder();
    b.rbox(1.7, 0.7, 4.2, 0.3, '#f4f1ea', { p: [0, 0.35, 0], round: 2, deform: (v) => (v.x *= 1 - 0.7 * Math.max(0, v.z - 0.2)) });
    b.rbox(1.74, 0.16, 4.24, 0.07, c, { p: [0, 0.5, 0], deform: (v) => (v.x *= 1 - 0.7 * Math.max(0, v.z - 0.2)) });
    b.cyl(0.07, 0.09, 4.6, '#7a4a28', { p: [0, 2.9, -0.2], seg: 6 });
    b.extrude([[0, 0], [2.6, 0.2], [0.1, 3.8]], 0.08, WHITE, { p: [0.04, 1.2, -0.4], r: [0, -Math.PI / 2, 0] });
    b.extrude([[0, 0], [1.5, 0.1], [0, 2.4]], 0.07, c, { p: [-0.05, 1.5, -0.1], r: [0, Math.PI / 2, 0] });
    b.sphere(0.14, '#ffd23f', { p: [0, 5.2, -0.2], seg: 6, rings: 4 });
    return b.build();
  },
  buoy() {
    const b = new Builder();
    b.sphere(0.55, '#ff4b4b', { p: [0, 0.3, 0], s: [1, 1.1, 1], seg: 8, rings: 6 });
    b.cyl(0.57, 0.57, 0.2, WHITE, { p: [0, 0.38, 0], seg: 8 });
    b.cone(0.18, 0.5, '#ffd23f', { p: [0, 1.1, 0], seg: 6 });
    return b.build();
  },
  rock(c = '#9aa3b4', R = rng(1)) {
    const b = new Builder();
    const bump = (v) => {
      const k = 1 + (Math.sin(v.x * 7.1 + v.y * 3.3) * Math.cos(v.z * 6.2 + v.x * 2.1)) * 0.28;
      v.multiplyScalar(k);
    };
    b.sphere(1.0, (v) => (v.y > 0.35 ? lighter(c, 0.12) : v.y < -0.2 ? darker(c, 0.15) : c), { p: [0, 0.55, 0], s: [1.1, 0.8, 1], seg: 7, rings: 5, deform: bump });
    b.sphere(0.55, lighter(c, 0.06), { p: [0.9, 0.3, 0.4], s: [1, 0.8, 1], seg: 6, rings: 4, deform: bump });
    return b.build();
  },
  crystal(c = '#9fe6ff') {
    const b = new Builder();
    for (const [x, z, h, r, tilt] of [[0, 0, 2.6, 0.5, 0], [0.7, 0.3, 1.6, 0.36, 0.3], [-0.6, 0.4, 1.9, 0.4, -0.35], [0.1, -0.7, 1.3, 0.3, 0.2]]) {
      b.cone(r, h, (v) => (v.y > 0 ? lighter(c, 0.35) : c), { p: [x, h / 2, z], r: [tilt, 0, tilt * 0.6], seg: 5 });
    }
    return b.build();
  },
  mound(c = '#f4f9ff') {
    const b = new Builder();
    b.dome(1.8, c, { s: [1, 0.55, 1], seg: 10, rings: 4 });
    b.dome(1.1, lighter(c, 0.1), { p: [1.5, 0, 0.4], s: [1, 0.6, 1], seg: 8, rings: 3 });
    return b.build();
  },
  igloo() {
    const b = new Builder();
    b.dome(2.6, '#eaf4ff', { s: [1, 0.85, 1], seg: 12, rings: 5 });
    b.rbox(1.5, 1.1, 1.8, 0.45, '#dfeeff', { p: [0, 0.55, 2.2], round: 2 });
    b.rbox(0.9, 0.85, 0.3, 0.3, '#2b2c40', { p: [0, 0.5, 3.0], round: 2 });
    for (let k = 0; k < 3; k++) b.torus(2.45 - k * 0.5, 0.045, '#b7d6f2', { p: [0, 0.1 + k * 0.7, 0], r: [Math.PI / 2, 0, 0], seg: 14, tube: 4, s: [1, 1, 1] });
    return b.build();
  },
  deadTree() {
    const b = new Builder();
    b.tube([0, 0, 0], [0.2, 2.4, 0], 0.32, '#241d2b', { seg: 6 });
    b.tube([0.2, 2.4, 0], [0.9, 3.8, 0.2], 0.2, '#241d2b', { seg: 5 });
    b.tube([0.15, 1.8, 0], [-0.9, 3.0, -0.2], 0.2, '#241d2b', { seg: 5 });
    b.tube([0.2, 2.5, 0], [-0.2, 4.2, 0.4], 0.14, '#241d2b', { seg: 5 });
    b.sphere(0.1, '#ff7a3c', { p: [0.9, 3.85, 0.2], seg: 5, rings: 3 });
    return b.build();
  },
  basalt(h = 8) {
    const b = new Builder();
    for (const [x, z, hh, r] of [[0, 0, h, 1.5], [1.7, 0.6, h * 0.7, 1.3], [-1.5, 0.9, h * 0.55, 1.2], [0.4, -1.8, h * 0.8, 1.3]]) {
      b.cyl(r * 0.92, r, hh, (v) => (v.y > hh / 2 - 0.1 ? '#6b5b73' : '#3d3446'), { p: [x, hh / 2 - 2, z], seg: 6 });
    }
    return b.build();
  },
  lavaGem() {
    const b = new Builder();
    for (const [x, z, h, r, tilt] of [[0, 0, 1.8, 0.4, 0], [0.5, 0.2, 1.1, 0.28, 0.4], [-0.4, 0.2, 1.3, 0.3, -0.4]]) b.cone(r, h, (v) => (v.y > 0 ? '#ffd23f' : '#ff7a3c'), { p: [x, h / 2, z], r: [tilt, 0, 0], seg: 5 });
    return b.build();
  },
  volcano(h = 150, r = 130) {
    const b = new Builder();
    b.lathe([[r, -4], [r * 0.78, h * 0.3], [r * 0.5, h * 0.62], [r * 0.24, h * 0.9], [r * 0.2, h]], (v) => (v.y > h * 0.72 ? '#3a2d3e' : v.y > h * 0.35 ? '#4c3a4a' : '#5d4756'), { seg: 14 });
    b.cyl(r * 0.2, r * 0.2, 4, '#ff7a3c', { p: [0, h, 0], seg: 14 });
    b.dome(r * 0.2, '#ffb03c', { p: [0, h + 1.5, 0], s: [1, 0.3, 1], seg: 12, rings: 3 });
    return b.build();
  },
  mountain(h = 120, r = 90) {
    const b = new Builder();
    b.cone(r, h, (v) => (v.y > h * 0.12 ? '#f2f8ff' : v.y > -h * 0.15 ? '#c4d6ea' : '#8fa6bf'), { p: [0, h / 2, 0], seg: 7 });
    return b.build();
  },
  hill(c = '#6fcf62') {
    const b = new Builder();
    b.dome(1, (v) => (v.y > 0.6 ? lighter(c, 0.1) : c), { s: [1, 0.55, 1], seg: 12, rings: 6 });
    return b.build();
  },
  cloud(c = '#ffffff') {
    const b = new Builder();
    for (const [x, y, z, r] of [[0, 0, 0, 5], [5, -0.6, 1, 4], [-4.6, -0.8, -1, 3.8], [2, 1.8, 0, 3.6], [-1.5, 1.4, 1.2, 3.2]]) b.sphere(r, (v) => (v.y < -0.3 * r ? darker(c, 0.1) : c), { p: [x, y, z], s: [1, 0.7, 1], seg: 9, rings: 6 });
    return b.build({ outline: false });
  },
  lamp() {
    const b = new Builder();
    b.cyl(0.12, 0.2, 6.6, '#3a3f55', { p: [0, 3.3, 0], seg: 6 });
    b.tube([0, 6.5, 0], [0.9, 6.9, 0], 0.09, '#3a3f55', { seg: 5 });
    b.rbox(1.0, 0.2, 0.46, 0.08, '#3a3f55', { p: [1.0, 6.95, 0] });
    b.rbox(0.8, 0.1, 0.34, 0.04, '#fff3c4', { p: [1.0, 6.82, 0] });
    b.cyl(0.4, 0.4, 0.3, '#3a3f55', { p: [0, 0.15, 0], seg: 6 });
    return b.build();
  },
  sign(c = '#ff2bd6', c2 = '#4ee0ff') {
    const b = new Builder();
    b.cyl(0.14, 0.14, 7, '#3a3f55', { p: [-1.6, 3.5, 0], seg: 6 });
    b.cyl(0.14, 0.14, 7, '#3a3f55', { p: [1.6, 3.5, 0], seg: 6 });
    b.rbox(4.6, 2.4, 0.3, 0.12, '#1b1722', { p: [0, 7.4, 0] });
    b.rbox(4.2, 2.0, 0.34, 0.1, c, { p: [0, 7.4, 0.02] });
    b.rbox(3.2, 0.5, 0.4, 0.1, c2, { p: [0, 7.7, 0.04] });
    b.rbox(2.2, 0.4, 0.4, 0.1, '#ffffff', { p: [0, 7.0, 0.04] });
    return b.build();
  },
  bolt(c = '#c9cfdc') {
    const b = new Builder();
    b.cyl(1.7, 1.7, 1.0, c, { p: [0, 0.5, 0], seg: 6 });
    b.cyl(1.72, 1.72, 0.12, lighter(c, 0.3), { p: [0, 1.0, 0], seg: 6 });
    b.cyl(0.9, 0.9, 5.5, darker(c, 0.1), { p: [0, 3.7, 0], seg: 10 });
    for (let k = 0; k < 4; k++) b.torus(0.92, 0.12, darker(c, 0.25), { p: [0, 2.0 + k * 1.1, 0], r: [Math.PI / 2, 0, 0], tube: 4, seg: 10 });
    return b.build();
  },
  nutBig(c = '#ffc93a') {
    const b = new Builder();
    b.cyl(2.2, 2.2, 1.6, c, { p: [0, 0.8, 0], seg: 6 });
    b.cyl(2.25, 2.25, 0.2, lighter(c, 0.3), { p: [0, 1.6, 0], seg: 6 });
    b.cyl(1.0, 1.0, 1.7, '#5a3a22', { p: [0, 0.8, 0], seg: 10 });
    return b.build();
  },
  pencil(c = '#ffd23f') {
    const b = new Builder();
    b.cyl(0.55, 0.55, 8, c, { p: [0, 0, 0], r: [0, 0, Math.PI / 2], seg: 6 });
    b.cone(0.55, 1.4, '#f1c99a', { p: [4.7, 0, 0], r: [0, 0, -Math.PI / 2], seg: 6 });
    b.cone(0.2, 0.5, '#2b2c40', { p: [5.2, 0, 0], r: [0, 0, -Math.PI / 2], seg: 6 });
    b.cyl(0.58, 0.58, 0.9, '#c9cfdc', { p: [-4.2, 0, 0], r: [0, 0, Math.PI / 2], seg: 6 });
    b.cyl(0.5, 0.5, 0.7, '#ff6bb5', { p: [-4.9, 0, 0], r: [0, 0, Math.PI / 2], seg: 6 });
    return b.build();
  },
  eraser(c = '#ff6bb5') {
    const b = new Builder();
    b.rbox(5, 1.8, 2.4, 0.4, c, { p: [0, 0.9, 0], round: 2 });
    b.rbox(5.05, 0.9, 2.45, 0.35, '#3d8bff', { p: [0, 0.5, 0], round: 2 });
    return b.build();
  },
  spool(c = '#e8483f') {
    const b = new Builder();
    b.cyl(1.9, 1.9, 0.45, '#c9a46a', { p: [0, 0.22, 0], seg: 12 });
    b.cyl(1.9, 1.9, 0.45, '#c9a46a', { p: [0, 3.78, 0], seg: 12 });
    b.cyl(1.55, 1.55, 3.4, c, { p: [0, 2, 0], seg: 12 });
    b.cyl(1.58, 1.58, 0.2, darker(c, 0.2), { p: [0, 2.4, 0], seg: 12 });
    return b.build();
  },
  can(c = '#3d8bff') {
    const b = new Builder();
    b.cyl(1.7, 1.7, 4.2, '#c9cfdc', { p: [0, 2.1, 0], seg: 12 });
    b.cyl(1.74, 1.74, 2.0, c, { p: [0, 2.1, 0], seg: 12 });
    b.cyl(1.8, 1.8, 0.3, '#8d94a8', { p: [0, 4.3, 0], seg: 12 });
    b.torus(1.6, 0.08, '#8d94a8', { p: [0, 4.45, 0], r: [Math.PI / 2, 0, 0], tube: 4, seg: 12 });
    b.cyl(0.35, 0.35, 0.3, c, { p: [0.4, 4.6, 0.2], seg: 8 });
    return b.build();
  },
  die() {
    const b = new Builder();
    b.rbox(4, 4, 4, 0.7, '#f4f1ea', { p: [0, 2, 0], round: 2 });
    const dot = (x, y, z) => b.sphere(0.34, '#e8483f', { p: [x, y, z], s: [1, 1, 0.3], seg: 6, rings: 4 });
    dot(0, 2, 2.02);
    for (const [x, y] of [[-1, 3], [1, 1]]) dot(x, y, -2.02);
    for (const [x, z] of [[-1, -1], [1, 1]]) b.sphere(0.34, '#2b1b3d', { p: [x, 4.02, z], s: [1, 0.3, 1], seg: 6, rings: 4 });
    return b.build();
  },
  block(c = '#ff4b4b') {
    const b = new Builder();
    b.rbox(3.6, 3.6, 3.6, 0.3, c, { p: [0, 1.8, 0], round: 1 });
    b.rbox(2.2, 2.2, 0.14, 0.05, WHITE, { p: [0, 1.8, 1.82] });
    b.rbox(0.5, 1.5, 0.2, 0.05, c, { p: [0, 1.8, 1.9] });
    return b.build();
  },
  tapeRoll() {
    const b = new Builder();
    b.torus(1.8, 0.8, '#ffd23f', { p: [0, 0.8, 0], r: [Math.PI / 2, 0, 0], tube: 8, seg: 14 });
    b.torus(1.8, 0.82, '#e6b82e', { p: [0, 0.8, 0], r: [Math.PI / 2, 0, 0], tube: 3, seg: 14, s: [1, 1, 1.05] });
    return b.build();
  },
  wrench(c = '#8d94a8') {
    const b = new Builder();
    b.rbox(0.9, 7, 0.5, 0.2, c, { p: [0, 0, 0], round: 2 });
    b.torus(1.1, 0.5, c, { p: [0, 3.9, 0], seg: 10, tube: 6, arc: Math.PI * 1.55, r: [0, 0, Math.PI * 0.72] });
    b.cyl(0.9, 0.9, 0.5, c, { p: [0, -3.7, 0], r: [Math.PI / 2, 0, 0], seg: 10 });
    return b.build();
  },
  pillar(c = '#e8483f') {
    const b = new Builder();
    b.cyl(1.0, 1.25, 1, c, { p: [0, 0.5, 0], seg: 10 });
    return b.build({ outline: false });
  },
};

// ---------------------------------------------------------------- estorbos
/** Rompe una geometría de un estorbo en un grupo con contorno. */
const body = (b, thick = 0.035) => inked(b.build(), { thick });

/**
 * Modelo animado de un estorbo. `update(pos, def, T, t, dt)`: pos = { x, y, z, now, downT } del estado de la carrera,
 * def = su definición en la pista, t = reloj de la carrera. Cuando lo chocan sale volando, desaparece y vuelve a crecer.
 */
export function obstacleModel(kind, th) {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  const part = {};
  let face = 'track'; // 'track' = mira a lo largo de la pista, 'move' = mira hacia donde va, 'back' = mira a los que vienen
  let lift = 0;

  if (kind === 'fardo') {
    const b = new Builder();
    b.cyl(0.95, 0.95, 1.5, '#e8c14a', { p: [0, 0, 0], r: [Math.PI / 2, 0, 0], seg: 14 });
    for (const z of [-0.5, 0.5]) b.cyl(0.98, 0.98, 0.12, '#b98a2e', { p: [0, 0, z], r: [Math.PI / 2, 0, 0], seg: 14 });
    for (let k = 0; k < 6; k++) b.tube([0.25 * Math.cos(k), 0.25 * Math.sin(k), 0.76], [0.8 * Math.cos(k), 0.8 * Math.sin(k), 0.76], 0.045, '#f4dc8a', { seg: 4 });
    part.roll = body(b);
    inner.add(part.roll);
    lift = 0.95;
  } else if (kind === 'roca') {
    const b = new Builder();
    const bump = (v) => v.multiplyScalar(1 + Math.sin(v.x * 6.3 + v.y * 2.1) * Math.cos(v.z * 5.2 + v.x * 1.7) * 0.2);
    b.sphere(1.1, (v) => (v.y > 0.45 ? '#6f6378' : v.y < -0.35 ? '#2c2433' : '#4a3f52'), { seg: 9, rings: 7, deform: bump });
    b.sphere(0.3, '#ff7a3c', { p: [0.7, 0.2, 0.8], s: [1, 0.5, 1], seg: 5, rings: 3 });
    b.sphere(0.24, '#ffb03c', { p: [-0.6, 0.5, 0.78], s: [1, 0.5, 1], seg: 5, rings: 3 });
    b.sphere(0.26, '#ff7a3c', { p: [-0.2, -0.7, 0.8], s: [1, 0.5, 1], seg: 5, rings: 3 });
    part.roll = body(b, 0.04);
    inner.add(part.roll);
    lift = 1.1;
  } else if (kind === 'cangrejo') {
    const red = '#ff5a3c';
    const b = new Builder();
    b.sphere(0.62, red, { p: [0, 0.6, 0], s: [1.3, 0.62, 1], seg: 10, rings: 6 });
    b.sphere(0.4, lighter(red, 0.25), { p: [0, 0.66, 0.15], s: [1.3, 0.5, 1], seg: 8, rings: 4 });
    b.mirror((s) => {
      b.tube([s * 0.25, 0.9, 0.35], [s * 0.3, 1.25, 0.4], 0.04, '#ff8a6a', { seg: 5 });
      b.sphere(0.14, WHITE, { p: [s * 0.3, 1.3, 0.42], seg: 7, rings: 5 });
      b.sphere(0.08, '#1b1722', { p: [s * 0.3, 1.3, 0.54], seg: 5, rings: 4 });
      for (let k = 0; k < 3; k++) {
        b.tube([s * 0.55, 0.55, -0.25 + k * 0.28], [s * 1.0, 0.45, -0.3 + k * 0.32], 0.045, darker(red, 0.1), { seg: 5 });
        b.tube([s * 1.0, 0.45, -0.3 + k * 0.32], [s * 1.1, 0.0, -0.35 + k * 0.34], 0.04, darker(red, 0.1), { seg: 5 });
      }
    });
    part.body = body(b);
    inner.add(part.body);
    const claw = (s) => {
      const c = new Builder();
      c.tube([0, 0, 0], [s * 0.2, 0.28, 0.4], 0.07, darker(red, 0.05), { seg: 5 });
      c.sphere(0.3, red, { p: [s * 0.25, 0.4, 0.6], s: [1.1, 0.8, 1], seg: 8, rings: 5 });
      c.cone(0.14, 0.4, lighter(red, 0.2), { p: [s * 0.1, 0.45, 0.95], r: [Math.PI / 2, 0, 0.15 * s], seg: 5 });
      c.cone(0.1, 0.34, lighter(red, 0.2), { p: [s * 0.4, 0.4, 0.92], r: [Math.PI / 2, 0, -0.15 * s], seg: 5 });
      const g = body(c);
      g.position.set(s * 0.78, 0.55, 0.2);
      return g;
    };
    part.cl = claw(1);
    part.cr = claw(-1);
    inner.add(part.cl, part.cr);
  } else if (kind === 'munieco') {
    const b = new Builder();
    b.sphere(0.9, '#f4f9ff', { p: [0, 0.85, 0], seg: 10, rings: 7 });
    b.sphere(0.65, '#f4f9ff', { p: [0, 1.95, 0], seg: 10, rings: 7 });
    b.sphere(0.46, '#f4f9ff', { p: [0, 2.78, 0], seg: 10, rings: 7 });
    b.cone(0.1, 0.55, '#ff7a1f', { p: [0, 2.74, 0.62], r: [Math.PI / 2, 0, 0], seg: 6 });
    b.mirror((s) => {
      b.sphere(0.07, '#1b1722', { p: [s * 0.17, 2.9, 0.4], seg: 5, rings: 4 });
      b.tube([s * 0.55, 2.0, 0], [s * 1.3, 2.5, 0], 0.045, '#6b4a35', { seg: 5 });
      b.tube([s * 1.15, 2.4, 0], [s * 1.45, 2.8, 0], 0.035, '#6b4a35', { seg: 4 });
    });
    for (const y of [1.7, 2.0, 2.3]) b.sphere(0.08, '#1b1722', { p: [0, y, 0.62 - (y - 1.7) * 0.05], seg: 5, rings: 4 });
    b.torus(0.5, 0.11, '#e8483f', { p: [0, 2.35, 0], r: [Math.PI / 2, 0, 0], seg: 12, tube: 5 });
    b.rbox(0.18, 0.7, 0.14, 0.05, '#e8483f', { p: [0.35, 2.0, 0.42] });
    b.cyl(0.3, 0.32, 0.5, '#2b2c40', { p: [0, 3.35, 0], seg: 10 });
    b.cyl(0.52, 0.52, 0.07, '#2b2c40', { p: [0, 3.12, 0], seg: 12 });
    part.body = body(b);
    inner.add(part.body);
    face = 'back';
  } else if (kind === 'ruleman') {
    const b = new Builder();
    b.rbox(0.62, 2.3, 0.24, 0.08, '#ffd23f', { p: [0, 1.5, 0] });
    for (let k = 0; k < 9; k++) b.rbox(k % 2 ? 0.16 : 0.26, 0.04, 0.26, 0.01, '#2b1b3d', { p: [-0.18 + (k % 2 ? 0.1 : 0.05), 0.5 + k * 0.23, 0.0] });
    b.mirror((s) => {
      b.sphere(0.15, WHITE, { p: [s * 0.16, 2.35, 0.11], seg: 8, rings: 6 });
      b.sphere(0.085, '#1b1722', { p: [s * 0.16, 2.35, 0.23], seg: 6, rings: 4 });
      b.tube([s * 0.3, 1.9, 0], [s * 0.62, 1.4, 0.05], 0.05, '#2b1b3d', { seg: 5 });
      b.sphere(0.1, '#ff7a3c', { p: [s * 0.64, 1.35, 0.05], seg: 6, rings: 4 });
      b.tube([s * 0.17, 0.4, 0], [s * 0.2, 0.08, 0], 0.06, '#2b1b3d', { seg: 5 });
      b.sphere(0.14, '#ff7a3c', { p: [s * 0.2, 0.07, 0.07], s: [1, 0.6, 1.4], seg: 6, rings: 4 });
    });
    b.tube([-0.12, 1.95, 0.12], [0.12, 1.95, 0.12], 0.025, '#2b1b3d', { seg: 4 });
    part.body = body(b);
    inner.add(part.body);
    face = 'move';
  } else {
    // cono de tránsito
    const b = new Builder();
    b.rbox(1.1, 0.12, 1.1, 0.05, '#ff7a1f', { p: [0, 0.06, 0] });
    b.cone(0.45, 1.2, '#ff7a1f', { p: [0, 0.72, 0], seg: 12 });
    b.cyl(0.25, 0.33, 0.22, WHITE, { p: [0, 0.62, 0], seg: 12 });
    part.body = body(b);
    inner.add(part.body);
  }

  let prev = null;
  let vel = 0;
  let dir = 1;
  return {
    root,
    update(pos, def, T, t, dt) {
      const dn = pos.downT || 0;
      let sc = 1;
      let up = 0;
      let spin = 0;
      if (dn > 4.7) {
        const k = (5 - dn) / 0.3;
        sc = 1 - k;
        up = k * 4;
        spin = k * 9;
      } else if (dn > 0.6) sc = 0;
      else if (dn > 0) sc = 1 - dn / 0.6;
      root.visible = sc > 0.02;
      if (!root.visible) return;
      const lat = pos.now ?? 0;
      if (prev !== null && dt > 0) vel += ((lat - prev) / dt - vel) * Math.min(1, dt * 8);
      prev = lat;
      if (Math.abs(vel) > 0.3) dir = Math.sign(vel);
      const yaw0 = T.yaw[def.i];
      let yaw = yaw0;
      if (face === 'move') yaw = yaw0 + dir * (Math.PI / 2);
      else if (face === 'back') yaw = yaw0 + Math.PI;
      root.position.set(pos.x, pos.y + lift + up, pos.z);
      root.rotation.set(0, yaw + spin, 0);
      root.scale.setScalar(sc);
      if (kind === 'fardo') part.roll.rotation.z = -lat / 0.95;
      else if (kind === 'roca') {
        part.roll.rotation.z = -lat / 1.1;
        part.roll.rotation.x = Math.sin(t * 1.3) * 0.2;
      } else if (kind === 'cangrejo') {
        const k = Math.min(1, Math.abs(vel) * 0.5 + 0.35);
        inner.position.y = Math.abs(Math.sin(t * 11)) * 0.07 * k;
        inner.rotation.z = Math.sin(t * 11) * 0.06 * k;
        part.cl.rotation.x = -0.15 + Math.sin(t * 4.2) * 0.35;
        part.cr.rotation.x = -0.15 + Math.sin(t * 4.2 + 2) * 0.35;
      } else if (kind === 'munieco') {
        inner.rotation.z = Math.sin(t * 2 + def.ph) * 0.045 + vel * 0.012;
        inner.position.y = Math.abs(Math.sin(t * 3 + def.ph)) * 0.05;
      } else if (kind === 'ruleman') {
        const k = Math.min(1, Math.abs(vel) * 0.4 + 0.25);
        inner.position.y = Math.abs(Math.sin(t * 7 + def.ph)) * 0.55 * k;
        inner.rotation.z = Math.sin(t * 7 + def.ph) * 0.1 * k;
        inner.rotation.x = Math.cos(t * 3.5) * 0.04;
      }
    },
  };
}

/** Lado (m) de las celdas en que se parte el decorado: cada una es una malla propia que la cámara puede descartar entera. */
export const CELL = 120;

/** Parte los lugares en celdas del mapa. Dentro de cada celda el orden se mezcla (con semilla), así quedarse con los primeros n deja un decorado parejo. */
function cellsOf(places) {
  const cells = new Map();
  for (const pl of places) {
    const key = `${Math.floor(pl.x / CELL)},${Math.floor(pl.z / CELL)}`;
    (cells.get(key) || cells.set(key, []).get(key)).push(pl);
  }
  let seed = 1;
  return [...cells.values()].map((list) => {
    const R = rng(seed++ * 7919);
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(R() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  });
}

/**
 * Pone una geometría en N lugares como mallas instanciadas con contorno. Devuelve el grupo. Con muchos lugares se parte en
 * celdas del mapa (CELL): cada una se descarta sola cuando la cámara no la ve (una malla única de toda la pista siempre
 * "se ve" y la placa de video procesa todos los árboles de la vuelta en cada cuadro). Cada malla guarda en `userData.full`
 * cuántos lugares tiene: el escenario baja `count` para aflojar el decorado en dispositivos lentos (Stage.setDetail).
 * `bob` anima las matrices una por una y necesita una sola malla: no se parte.
 */
export function instanced(geo, places, { outline = true, thick = 0.045, mat = null, matOutline = null, bob = false, chunk = true } = {}) {
  const g = new THREE.Group();
  if (!places.length) return g;
  const cells = chunk && !bob && places.length >= 40 ? cellsOf(places) : [places];
  const M = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (const list of cells) {
    const mesh = new THREE.InstancedMesh(geo, mat || paintMaterial(), list.length);
    list.forEach((pl, i) => {
      e.set(pl.rx || 0, pl.ry ?? pl.rot ?? 0, pl.rz || 0);
      q.setFromEuler(e);
      if (Array.isArray(pl.s)) s.set(pl.s[0], pl.s[1], pl.s[2]);
      else s.setScalar(pl.s ?? 1);
      p.set(pl.x, pl.y, pl.z);
      M.compose(p, q, s);
      mesh.setMatrixAt(i, M);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.userData.full = list.length;
    g.add(mesh);
    if (outline && geo.attributes.onormal) {
      const line = new THREE.InstancedMesh(geo, matOutline || outlineMaterial(thick), list.length);
      line.instanceMatrix = mesh.instanceMatrix;
      line.computeBoundingSphere();
      line.userData.outline = true;
      line.userData.full = list.length;
      g.add(line);
    }
  }
  return g;
}

// los materiales compartidos se piden recién cuando hacen falta (evita ciclos de importación)
import { paintMat as paintMaterial, outlineMat as outlineMaterial } from './models.js';
