/**
 * Tuercas — vehículos y pilotos armados con formas simples (ver models.js): cuatro autos, tres motos, cinco juegos de
 * ruedas, cinco accesorios y ocho pilotos. `makeVehicle(cfg)` devuelve el vehículo completo listo para animar:
 * carrocería con el piloto sentado (una sola malla), la cabeza aparte (gira y se sacude) y las ruedas sueltas.
 * El modelo mira hacia +z; +x es su izquierda.
 */
import { THREE, Builder, inked, paintMat, outlineMat, mix, darker, lighter } from './models.js';
import { DRIVERS, BODIES, WHEELS, EXTRAS, PAINTS, byId, sanitize } from './shared/parts.js';

const METAL = '#c9cfdc';
const STEEL = '#8d94a8';
const DARK = '#3a3f55';
const SEAT = '#2b2c40';
const TIRE = '#2a2733';
const LIGHT = '#fff3c4';
const GLASS = '#bfe9ff';
const WHITE = '#ffffff';
const BLACK = '#1b1722';

// ---------------------------------------------------------------- carrocerías
/* Cada carrocería dice dónde van las ruedas (se espejan en x; en las motos van al medio), dónde se sienta el piloto,
 * dónde agarra, los puntos de montaje de los accesorios y por dónde salen las llamas del escape. */
const BODY = {
  clasico: {
    wheels: [
      { x: 0.68, z: 0.66, r: 0.3, w: 0.26, front: true },
      { x: 0.72, z: -0.62, r: 0.34, w: 0.32 },
    ],
    seat: [0, 0.4, -0.3],
    hands: [0.17, 0.9, 0.24],
    back: [0, 0.62, -0.98],
    front: [0, 0.34, 1.02],
    pipes: [[0.2, 0.68, -1.14], [-0.2, 0.68, -1.14]],
    build(b, c) {
      b.rbox(1.0, 0.16, 1.86, 0.07, DARK, { p: [0, 0.3, 0] });
      b.rbox(0.66, 0.26, 0.92, 0.12, c.paint, { p: [0, 0.47, 0.56], round: 2, deform: (v) => (v.x *= 1 - 0.3 * Math.max(0, v.z + 0.2)) });
      b.mirror((s) => b.rbox(0.32, 0.24, 1.0, 0.1, c.paint2, { p: [s * 0.43, 0.45, -0.12] }));
      b.rbox(0.36, 0.05, 0.4, 0.02, c.accent, { p: [0, 0.605, 0.56] });
      b.tube([-0.56, 0.3, 1.0], [0.56, 0.3, 1.0], 0.07, METAL);
      b.tube([-0.5, 0.34, -0.98], [0.5, 0.34, -0.98], 0.07, METAL);
      b.rbox(0.6, 0.56, 0.16, 0.07, SEAT, { p: [0, 0.74, -0.58], r: [-0.22, 0, 0] });
      b.rbox(0.56, 0.3, 0.36, 0.08, STEEL, { p: [0, 0.5, -0.8] });
      b.mirror((s) => b.tube([s * 0.2, 0.56, -0.86], [s * 0.2, 0.68, -1.1], 0.06, METAL, { flat: true, r2: 0.075 }));
      b.tube([0, 0.5, 0.46], [0, 0.86, 0.27], 0.03, DARK);
      b.torus(0.15, 0.035, DARK, { p: [0, 0.89, 0.25], r: [-1.05, 0, 0] });
    },
  },
  flecha: {
    wheels: [
      { x: 0.7, z: 0.74, r: 0.3, w: 0.26, front: true },
      { x: 0.74, z: -0.72, r: 0.38, w: 0.38 },
    ],
    seat: [0, 0.34, -0.22],
    hands: [0.15, 0.78, 0.3],
    back: [0, 0.6, -1.08],
    front: [0, 0.3, 1.12],
    pipes: [[0, 0.5, -1.2]],
    build(b, c) {
      b.rbox(0.6, 0.24, 2.2, 0.1, c.paint, {
        p: [0, 0.38, 0.05],
        round: 2,
        deform: (v) => {
          const k = Math.max(0, v.z - 0.1);
          v.x *= 1 - 0.55 * k;
          v.y -= 0.1 * k * k;
        },
      });
      b.rbox(1.34, 0.05, 0.3, 0.02, c.accent, { p: [0, 0.22, 1.04] });
      b.mirror((s) => b.rbox(0.06, 0.2, 0.34, 0.02, c.paint2, { p: [s * 0.66, 0.28, 1.04] }));
      b.mirror((s) => b.rbox(0.36, 0.22, 0.86, 0.1, c.paint2, { p: [s * 0.42, 0.4, -0.28], round: 2 }));
      b.rbox(0.4, 0.34, 0.36, 0.12, DARK, { p: [0, 0.66, -0.66], round: 2 });
      b.rbox(1.12, 0.05, 0.32, 0.02, c.accent, { p: [0, 0.96, -1.04] });
      b.mirror((s) => b.rbox(0.05, 0.22, 0.36, 0.02, c.paint2, { p: [s * 0.56, 0.9, -1.04] }));
      b.mirror((s) => b.tube([s * 0.3, 0.5, -0.98], [s * 0.3, 0.94, -1.04], 0.035, DARK));
      b.cyl(0.09, 0.11, 0.2, METAL, { p: [0, 0.5, -1.12], r: [Math.PI / 2, 0, 0], seg: 8 });
      b.tube([0, 0.46, 0.5], [0, 0.74, 0.32], 0.03, DARK);
      b.torus(0.14, 0.032, DARK, { p: [0, 0.77, 0.3], r: [-1.1, 0, 0] });
      b.rbox(0.3, 0.04, 0.5, 0.015, WHITE, { p: [0, 0.505, 0.6] });
    },
  },
  bagual: {
    wheels: [
      { x: 0.76, z: 0.68, r: 0.42, w: 0.34, front: true },
      { x: 0.76, z: -0.68, r: 0.42, w: 0.34 },
    ],
    seat: [0, 0.68, -0.22],
    hands: [0.17, 1.16, 0.3],
    back: [0, 0.94, -0.98],
    front: [0, 0.56, 1.02],
    pipes: [[0.34, 0.5, -1.02]],
    build(b, c) {
      b.rbox(1.12, 0.34, 1.84, 0.13, c.paint, { p: [0, 0.66, 0], round: 2 });
      b.rbox(0.9, 0.2, 0.62, 0.09, c.paint2, { p: [0, 0.84, 0.56] });
      b.rbox(1.0, 0.16, 1.6, 0.06, DARK, { p: [0, 0.46, 0] });
      b.mirror((s) => {
        b.tube([s * 0.5, 0.8, -0.14], [s * 0.5, 1.56, -0.28], 0.045, METAL);
        b.tube([s * 0.5, 1.56, -0.28], [s * 0.5, 0.86, -0.86], 0.045, METAL);
        b.sphere(0.12, LIGHT, { p: [s * 0.36, 0.8, 0.9], s: [1, 1, 0.6] });
        b.sphere(0.07, LIGHT, { p: [s * 0.28, 1.66, -0.28] });
      });
      b.tube([-0.5, 1.56, -0.28], [0.5, 1.56, -0.28], 0.045, METAL);
      b.rbox(1.26, 0.16, 0.14, 0.06, STEEL, { p: [0, 0.54, 0.98] });
      b.rbox(1.16, 0.14, 0.12, 0.05, STEEL, { p: [0, 0.56, -0.98] });
      b.cyl(0.3, 0.3, 0.2, TIRE, { p: [0, 0.98, -1.0], r: [Math.PI / 2, 0, 0] });
      b.cyl(0.14, 0.14, 0.22, c.accent, { p: [0, 0.98, -1.0], r: [Math.PI / 2, 0, 0], seg: 8 });
      b.rbox(0.62, 0.5, 0.16, 0.07, SEAT, { p: [0, 1.0, -0.5], r: [-0.18, 0, 0] });
      b.tube([0, 0.8, 0.5], [0, 1.12, 0.33], 0.03, DARK);
      b.torus(0.16, 0.035, DARK, { p: [0, 1.15, 0.31], r: [-1.0, 0, 0] });
      b.cyl(0.07, 0.08, 0.3, METAL, { p: [0.34, 0.5, -0.9], r: [Math.PI / 2, 0, 0], seg: 8 });
    },
  },
  latita: {
    wheels: [
      { x: 0.56, z: 0.5, r: 0.26, w: 0.22, front: true },
      { x: 0.56, z: -0.5, r: 0.26, w: 0.22 },
    ],
    seat: [0, 0.6, -0.1],
    hands: [0.15, 1.02, 0.3],
    back: [0, 0.8, -0.8],
    front: [0, 0.38, 0.82],
    pipes: [[0, 0.42, -0.84]],
    build(b, c) {
      b.rbox(1.06, 0.64, 1.5, 0.3, c.paint, { p: [0, 0.6, 0], round: 2 });
      b.rbox(1.08, 0.12, 1.52, 0.05, c.paint2, { p: [0, 0.4, 0] });
      b.rbox(0.82, 0.1, 0.74, 0.05, SEAT, { p: [0, 0.9, -0.1] });
      b.mirror((s) => {
        b.sphere(0.14, LIGHT, { p: [s * 0.3, 0.64, 0.72], s: [1, 1, 0.5] });
        b.torus(0.15, 0.03, METAL, { p: [s * 0.3, 0.64, 0.74] });
        b.torus(0.12, 0.035, METAL, { p: [s * 0.13, 0.74, -1.0], r: [0, Math.PI / 2, 0] });
      });
      b.rbox(0.52, 0.08, 0.08, 0.03, METAL, { p: [0, 0.42, 0.78] });
      b.rbox(0.72, 0.26, 0.05, 0.02, GLASS, { p: [0, 1.02, 0.32], r: [-0.3, 0, 0] });
      b.tube([0, 0.74, -0.74], [0, 0.74, -1.0], 0.045, METAL);
      b.tube([0, 0.86, 0.42], [0, 1.0, 0.32], 0.03, DARK);
      b.torus(0.13, 0.03, DARK, { p: [0, 1.02, 0.3], r: [-1.0, 0, 0] });
      b.cyl(0.05, 0.06, 0.16, METAL, { p: [0, 0.42, -0.78], r: [Math.PI / 2, 0, 0], seg: 8 });
    },
  },
  avispa: {
    bike: true,
    wheels: [
      { x: 0, z: 0.78, r: 0.26, w: 0.18, front: true },
      { x: 0, z: -0.7, r: 0.26, w: 0.2 },
    ],
    seat: [0, 0.82, -0.36],
    hands: [0.3, 1.12, 0.46],
    feet: [0.14, 0.4, 0.14],
    back: [0, 0.78, -0.94],
    front: [0, 0.5, 0.98],
    pipes: [[0.16, 0.32, -0.94]],
    build(b, c) {
      b.rbox(0.38, 0.12, 0.92, 0.05, DARK, { p: [0, 0.3, 0.04] });
      b.rbox(0.46, 0.66, 0.16, 0.08, c.paint, { p: [0, 0.64, 0.5], r: [-0.25, 0, 0], round: 2 });
      b.rbox(0.42, 0.36, 0.84, 0.15, c.paint, { p: [0, 0.56, -0.52], round: 2 });
      b.rbox(0.36, 0.1, 0.64, 0.05, SEAT, { p: [0, 0.78, -0.44] });
      b.rbox(0.24, 0.1, 0.5, 0.05, c.paint2, { p: [0, 0.56, 0.8] });
      b.tube([0, 0.4, 0.74], [0, 1.08, 0.5], 0.05, METAL);
      b.tube([-0.34, 1.12, 0.46], [0.34, 1.12, 0.46], 0.035, DARK);
      b.sphere(0.12, LIGHT, { p: [0, 0.98, 0.62], s: [1, 1, 0.6] });
      b.mirror((s) => {
        b.tube([s * 0.28, 1.12, 0.46], [s * 0.36, 1.3, 0.42], 0.018, METAL);
        b.sphere(0.07, METAL, { p: [s * 0.37, 1.33, 0.42], s: [1, 1, 0.4] });
      });
      b.cyl(0.05, 0.06, 0.34, METAL, { p: [0.16, 0.32, -0.78], r: [Math.PI / 2, 0, 0], seg: 8 });
      b.rbox(0.3, 0.04, 0.2, 0.015, c.accent, { p: [0, 0.75, -0.88] });
    },
  },
  centella: {
    bike: true,
    wheels: [
      { x: 0, z: 0.86, r: 0.34, w: 0.16, front: true },
      { x: 0, z: -0.72, r: 0.34, w: 0.22 },
    ],
    seat: [0, 0.92, -0.28],
    hands: [0.28, 1.0, 0.5],
    feet: [0.19, 0.42, -0.22],
    back: [0, 0.98, -0.92],
    front: [0, 0.66, 1.04],
    pipes: [[0.2, 0.66, -1.0]],
    build(b, c) {
      b.rbox(0.36, 0.42, 0.96, 0.15, c.paint, { p: [0, 0.76, 0.2], round: 2, deform: (v) => (v.x *= 1 - 0.4 * Math.max(0, v.z - 0.1)) });
      b.rbox(0.3, 0.2, 0.72, 0.08, c.paint2, { p: [0, 0.84, -0.54], r: [0.18, 0, 0] });
      b.rbox(0.28, 0.08, 0.42, 0.04, SEAT, { p: [0, 0.91, -0.3] });
      b.rbox(0.3, 0.38, 0.52, 0.1, DARK, { p: [0, 0.46, -0.04] });
      b.mirror((s) => b.tube([s * 0.1, 0.36, 0.86], [s * 0.1, 0.98, 0.54], 0.035, METAL));
      b.tube([-0.3, 1.0, 0.5], [0.3, 1.0, 0.5], 0.03, DARK);
      b.rbox(0.3, 0.26, 0.05, 0.02, GLASS, { p: [0, 1.08, 0.56], r: [-0.6, 0, 0] });
      b.sphere(0.09, LIGHT, { p: [0, 0.82, 0.68], s: [1.3, 0.8, 0.5] });
      b.tube([0.16, 0.44, -0.3], [0.2, 0.64, -0.96], 0.07, METAL, { flat: true, r2: 0.085 });
      b.rbox(0.26, 0.04, 0.3, 0.015, c.accent, { p: [0, 0.975, 0.16] });
    },
  },
  trueno: {
    bike: true,
    wheels: [
      { x: 0, z: 1.12, r: 0.36, w: 0.14, front: true },
      { x: 0, z: -0.74, r: 0.36, w: 0.3 },
    ],
    seat: [0, 0.7, -0.42],
    hands: [0.4, 1.3, 0.34],
    feet: [0.2, 0.36, 0.3],
    back: [0, 0.76, -1.06],
    front: [0, 0.6, 1.24],
    pipes: [[0.22, 0.4, -1.1], [-0.22, 0.4, -1.1]],
    build(b, c) {
      b.rbox(0.32, 0.28, 0.64, 0.13, c.paint, { p: [0, 0.78, 0.12], round: 2, deform: (v) => (v.y += 0.12 * Math.max(0, v.z)) });
      b.rbox(0.36, 0.36, 0.5, 0.1, STEEL, { p: [0, 0.46, -0.02] });
      b.rbox(0.38, 0.1, 0.52, 0.05, SEAT, { p: [0, 0.68, -0.44] });
      b.rbox(0.36, 0.22, 0.66, 0.1, c.paint, { p: [0, 0.62, -0.8], round: 2 });
      b.mirror((s) => {
        b.tube([s * 0.11, 0.36, 1.12], [s * 0.11, 1.02, 0.5], 0.035, METAL);
        b.tube([s * 0.11, 1.02, 0.5], [s * 0.4, 1.3, 0.34], 0.03, METAL);
        b.tube([s * 0.2, 0.34, 0.14], [s * 0.22, 0.4, -1.06], 0.065, METAL, { flat: true, r2: 0.08 });
        b.sphere(0.05, DARK, { p: [s * 0.4, 1.3, 0.34] });
      });
      b.sphere(0.13, LIGHT, { p: [0, 0.92, 0.66], s: [1, 1, 0.6] });
      b.tube([0, 0.7, -0.74], [0, 1.16, -0.9], 0.035, METAL);
      b.rbox(0.26, 0.2, 0.06, 0.03, SEAT, { p: [0, 1.06, -0.84], r: [-0.3, 0, 0] });
      b.rbox(0.2, 0.06, 0.4, 0.02, c.paint2, { p: [0, 0.75, 1.12] });
    },
  },
};

// ---------------------------------------------------------------- ruedas
const WHEEL = {
  estandar: { r: 1, w: 1 },
  lisas: { r: 0.95, w: 1.28 },
  tacos: { r: 1.12, w: 1.1 },
  rulemanes: { r: 0.74, w: 0.82 },
  globo: { r: 1.2, w: 1.45 },
};

/** Una rueda con el eje en x, centrada. */
function wheelGeo(kind, r, w, c) {
  const b = new Builder();
  const hw = w / 2;
  const tire = kind === 'rulemanes' ? METAL : kind === 'tacos' ? '#3b2f2a' : TIRE;
  if (kind === 'globo') {
    b.torus(r * 0.66, r * 0.36, tire, { r: [0, Math.PI / 2, 0], tube: 8, seg: 16, s: [1, 1, hw / (r * 0.36)] });
  } else {
    b.lathe([[r * 0.55, -hw], [r * 0.93, -hw], [r, -hw * 0.6], [r, hw * 0.6], [r * 0.93, hw], [r * 0.55, hw]], tire, { r: [0, 0, Math.PI / 2], seg: 16 });
  }
  if (kind === 'tacos') for (let i = 0; i < 10; i++) b.group({ r: [(i / 10) * Math.PI * 2, 0, 0] }, () => b.box(w * 0.9, r * 0.14, r * 0.2, '#2a211e', { p: [0, r, 0] }));
  const hubR = kind === 'lisas' ? r * 0.72 : kind === 'globo' ? r * 0.44 : r * 0.6;
  const hub = kind === 'rulemanes' ? DARK : kind === 'lisas' ? METAL : c.accent;
  b.cyl(hubR, hubR, w * 0.86, hub, { r: [0, 0, Math.PI / 2], seg: 12 });
  if (kind === 'lisas') b.cyl(hubR * 0.62, hubR * 0.62, w * 0.9, c.paint, { r: [0, 0, Math.PI / 2], seg: 10 });
  // bulones: se ven girar
  const bolt = kind === 'rulemanes' ? METAL : kind === 'lisas' ? WHITE : DARK;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.mirror((s) => b.sphere(r * 0.09, bolt, { p: [s * hw * 0.88, Math.cos(a) * hubR * 0.6, Math.sin(a) * hubR * 0.6], seg: 6, rings: 4 }));
  }
  b.mirror((s) => b.sphere(r * 0.16, bolt, { p: [s * hw * 0.84, 0, 0], seg: 8, rings: 5, s: [0.6, 1, 1] }));
  return b.build();
}

// ---------------------------------------------------------------- accesorios
const EXTRA = {
  banderin(b, c, m) {
    b.tube([m.back[0] + 0.3, m.back[1], m.back[2] + 0.08], [m.back[0] + 0.34, m.back[1] + 0.95, m.back[2] - 0.06], 0.018, METAL);
    b.extrude([[0, 0], [0.38, 0.11], [0, 0.22]], 0.02, c.accent, { p: [m.back[0] + 0.34, m.back[1] + 0.72, m.back[2] - 0.06], r: [0, Math.PI / 2, 0] });
    b.sphere(0.04, c.paint, { p: [m.back[0] + 0.34, m.back[1] + 0.97, m.back[2] - 0.06], seg: 6, rings: 4 });
  },
  aleron(b, c, m) {
    const y = m.back[1] + (m.bike ? 0.3 : 0.36);
    const w = m.bike ? 0.7 : 1.16;
    b.rbox(w, 0.05, 0.34, 0.02, c.accent, { p: [0, y, m.back[2] - 0.04], r: [0.12, 0, 0] });
    b.mirror((s) => {
      b.rbox(0.05, 0.2, 0.38, 0.02, c.paint, { p: [(s * w) / 2, y - 0.03, m.back[2] - 0.04] });
      b.tube([s * w * 0.28, m.back[1] - 0.06, m.back[2] + 0.1], [s * w * 0.28, y, m.back[2] - 0.02], 0.03, DARK);
    });
  },
  turbina(b, c, m) {
    const y = m.back[1] + 0.26;
    const z = m.back[2] - 0.02;
    b.cyl(0.21, 0.24, 0.56, METAL, { p: [0, y, z], r: [Math.PI / 2, 0, 0], seg: 12 });
    b.torus(0.23, 0.045, c.paint, { p: [0, y, z + 0.28] });
    b.cone(0.16, 0.2, DARK, { p: [0, y, z + 0.26], r: [Math.PI / 2, 0, 0], seg: 8 });
    b.cyl(0.24, 0.16, 0.16, STEEL, { p: [0, y, z - 0.34], r: [Math.PI / 2, 0, 0], seg: 12 });
    b.rbox(0.14, 0.26, 0.26, 0.04, DARK, { p: [0, y - 0.2, z + 0.04] });
  },
  escape(b, c, m) {
    b.mirror((s) => {
      const x = s * (m.bike ? 0.2 : 0.38);
      b.tube([x, m.back[1] - 0.14, m.back[2] + 0.26], [x * 1.12, m.back[1] + 0.3, m.back[2] - 0.2], 0.085, METAL, { flat: true, r2: 0.11 });
      b.torus(0.105, 0.03, DARK, { p: [x * 1.12, m.back[1] + 0.3, m.back[2] - 0.2], r: [0.9, 0, 0] });
    });
  },
  paragolpes(b, c, m) {
    const w = m.bike ? 0.3 : 0.62;
    const [x, y, z] = m.front;
    b.tube([x - w, y, z + 0.06], [x + w, y, z + 0.06], 0.06, STEEL);
    b.tube([x - w * 0.86, y + 0.24, z + 0.02], [x + w * 0.86, y + 0.24, z + 0.02], 0.05, STEEL);
    b.mirror((s) => {
      b.tube([x + s * w * 0.5, y - 0.02, z + 0.06], [x + s * w * 0.5, y + 0.26, z + 0.02], 0.045, STEEL);
      b.tube([x + s * w * 0.86, y + 0.24, z + 0.02], [x + s * w * 0.9, y, z - 0.2], 0.045, STEEL);
    });
  },
};

// ---------------------------------------------------------------- pilotos
/** Ojo: blanco, pupila mirando al frente y, si se pide, un párpado del color de la piel. */
function eye(b, x, y, z, r, o = {}) {
  b.sphere(r, o.white || WHITE, { p: [x, y, z], seg: 10, rings: 7 });
  b.sphere(r * 0.58, o.iris || BLACK, { p: [x * (o.cross ?? 0.96), y + (o.dy || 0), z + r * 0.62], seg: 8, rings: 6 });
  if (o.iris) b.sphere(r * 0.3, BLACK, { p: [x * 0.96, y + (o.dy || 0), z + r * 1.0], seg: 6, rings: 4 });
  b.sphere(r * 0.2, WHITE, { p: [x * 0.96 + r * 0.25, y + r * 0.3, z + r * 1.05], seg: 6, rings: 4 });
  if (o.lid) b.dome(r * 1.12, o.lid, { p: [x, y + r * 0.1, z], r: [o.tilt ?? -0.5, 0, (x > 0 ? 1 : -1) * (o.slant || 0)], seg: 10, rings: 4 });
}

/* Cada piloto: colores del cuerpo y dos funciones, `head(b)` (centrada en la cabeza, mirando a +z) y, si tiene algo
 * más (caparazón, cola, pañuelo), `torso(b)` (con origen en la cadera). */
const DRIVER = {
  capi: {
    body: '#b9793f',
    arm: '#a86a34',
    hand: '#8f5a2c',
    head(b) {
      const fur = '#b9793f';
      b.rbox(0.58, 0.5, 0.6, 0.2, fur, { round: 2 });
      b.rbox(0.46, 0.34, 0.32, 0.14, '#cd9358', { p: [0, -0.07, 0.34], round: 2 });
      b.rbox(0.22, 0.1, 0.08, 0.04, '#3b2416', { p: [0, 0.05, 0.5] });
      b.rbox(0.2, 0.03, 0.04, 0.012, '#6b3f22', { p: [0, -0.12, 0.5] });
      b.mirror((s) => {
        b.sphere(0.095, '#8f5a2c', { p: [s * 0.21, 0.27, -0.14], s: [1, 1, 0.7] });
        b.sphere(0.05, '#e9a889', { p: [s * 0.21, 0.27, -0.1], s: [1, 1, 0.5] });
        eye(b, s * 0.2, 0.09, 0.24, 0.075, { lid: fur, tilt: -0.75 });
        b.sphere(0.07, '#e59a7a', { p: [s * 0.25, -0.08, 0.3], s: [1, 0.7, 0.5] });
      });
    },
    torso(b) {
      b.torus(0.16, 0.055, '#39b6e8', { p: [0, 0.44, 0], r: [Math.PI / 2, 0, 0] });
      b.cone(0.1, 0.2, '#39b6e8', { p: [0.04, 0.34, 0.17], r: [2.9, 0, 0.2], seg: 6 });
    },
  },
  lola: {
    body: '#4fc65a',
    arm: '#43b24e',
    hand: '#e8f59b',
    belly: '#e8f59b',
    head(b) {
      const g = '#4fc65a';
      b.sphere(0.36, g, { s: [1, 0.74, 0.9], seg: 14, rings: 10 });
      b.sphere(0.3, '#e8f59b', { p: [0, -0.1, 0.1], s: [1, 0.55, 0.9] });
      b.rbox(0.42, 0.028, 0.05, 0.012, '#256b2e', { p: [0, -0.07, 0.31] });
      b.mirror((s) => {
        b.sphere(0.15, g, { p: [s * 0.19, 0.2, 0.06] });
        eye(b, s * 0.19, 0.23, 0.12, 0.115, { cross: 0.9 });
        b.sphere(0.07, '#ff9ab0', { p: [s * 0.27, -0.03, 0.2], s: [1, 0.7, 0.5] });
        b.sphere(0.018, '#256b2e', { p: [s * 0.05, 0.03, 0.33], seg: 5, rings: 4 });
      });
    },
  },
  tuco: {
    body: '#23232b',
    arm: '#23232b',
    hand: '#5b6b8a',
    belly: '#fff6e0',
    head(b) {
      b.sphere(0.3, '#23232b', { seg: 14, rings: 10 });
      b.sphere(0.25, '#fff6e0', { p: [0, -0.07, 0.12], s: [0.95, 0.9, 0.8] });
      const curve = (v) => (v.y -= 0.55 * Math.max(0, v.z) ** 2);
      b.sphere(0.36, '#ff9a1f', { p: [0, -0.01, 0.3], s: [0.36, 0.42, 1], deform: curve, seg: 10, rings: 10 });
      b.sphere(0.3, '#ffd23f', { p: [0, 0.035, 0.3], s: [0.3, 0.3, 0.95], deform: curve, seg: 8, rings: 8 });
      b.sphere(0.1, '#2b1c14', { p: [0, -0.13, 0.6], s: [0.8, 0.9, 1] });
      b.mirror((s) => {
        b.sphere(0.09, '#3dc1ff', { p: [s * 0.2, 0.09, 0.19], s: [0.6, 1, 1] });
        eye(b, s * 0.215, 0.09, 0.2, 0.06);
      });
      b.sphere(0.07, '#23232b', { p: [0, 0.3, -0.06], s: [0.5, 1, 1.4] });
    },
  },
  rulo: {
    body: '#ff7a3c',
    arm: '#ff7a3c',
    hand: '#3a2418',
    belly: '#fff3e2',
    head(b) {
      const o = '#ff7a3c';
      b.sphere(0.32, o, { s: [1, 0.9, 0.94], seg: 14, rings: 10 });
      b.cone(0.17, 0.32, '#fff3e2', { p: [0, -0.08, 0.34], r: [Math.PI / 2, 0, 0], seg: 10 });
      b.sphere(0.055, BLACK, { p: [0, -0.07, 0.5] });
      b.mirror((s) => {
        b.cone(0.13, 0.3, o, { p: [s * 0.2, 0.33, -0.04], r: [-0.1, 0, -s * 0.22], seg: 8 });
        b.cone(0.07, 0.18, '#3a2418', { p: [s * 0.2, 0.35, 0.0], r: [-0.1, 0, -s * 0.22], seg: 6 });
        b.cone(0.13, 0.26, '#fff3e2', { p: [s * 0.27, -0.1, 0.06], r: [0, 0, s * 2.0], seg: 6 });
        eye(b, s * 0.14, 0.07, 0.24, 0.066, { lid: o, tilt: -0.9, slant: -0.5 });
      });
    },
    torso(b) {
      b.tube([0, 0.12, -0.22], [0.02, 0.5, -0.5], 0.11, '#ff7a3c');
      b.sphere(0.12, '#fff3e2', { p: [0.02, 0.56, -0.54] });
    },
  },
  lana: {
    body: '#f4e7cf',
    arm: '#f4e7cf',
    hand: '#8a6a4a',
    neck: 0.2,
    head(b) {
      const w = '#f4e7cf';
      b.tube([0, -0.42, -0.04], [0, -0.12, 0], 0.13, w);
      b.sphere(0.26, w, { s: [0.9, 0.9, 1.1], seg: 12, rings: 9 });
      b.sphere(0.16, '#fffaf0', { p: [0, -0.06, 0.25], s: [1, 0.85, 0.9] });
      b.sphere(0.03, '#5a4334', { p: [0, -0.02, 0.4], s: [1.6, 0.8, 1] });
      b.rbox(0.02, 0.07, 0.02, 0.008, '#5a4334', { p: [0, -0.08, 0.39] });
      for (const [x, y, z, r] of [[0, 0.24, 0.02, 0.12], [-0.1, 0.2, -0.04, 0.1], [0.1, 0.2, -0.04, 0.1], [0, 0.18, 0.12, 0.09]]) b.sphere(r, '#fffaf0', { p: [x, y, z], seg: 8, rings: 6 });
      b.mirror((s) => {
        b.sphere(0.17, w, { p: [s * 0.15, 0.34, -0.1], s: [0.36, 1, 0.3], r: [0, 0, -s * 0.3] });
        b.sphere(0.11, '#f3b6b0', { p: [s * 0.15, 0.34, -0.085], s: [0.3, 1, 0.2], r: [0, 0, -s * 0.3] });
        b.sphere(0.055, BLACK, { p: [s * 0.2, 0.05, 0.16] });
        b.sphere(0.016, WHITE, { p: [s * 0.2 + 0.015, 0.07, 0.205], seg: 5, rings: 4 });
      });
    },
    torso(b) {
      b.torus(0.15, 0.05, '#e8483f', { p: [0, 0.46, 0], r: [Math.PI / 2, 0, 0] });
      b.mirror((s) => b.sphere(0.055, '#22c7c7', { p: [s * 0.08, 0.38, 0.16] }));
      for (const [x, y, z] of [[0, 0.3, -0.16], [0.14, 0.2, -0.1], [-0.14, 0.2, -0.1]]) b.sphere(0.13, '#fffaf0', { p: [x, y, z], seg: 8, rings: 6 });
    },
  },
  brava: {
    body: '#d9a760',
    arm: '#d9a760',
    hand: '#b9853f',
    belly: '#f6e4c4',
    head(b) {
      const t = '#d9a760';
      b.sphere(0.33, t, { s: [1, 0.88, 0.94], seg: 14, rings: 10 });
      b.sphere(0.07, '#e06a7a', { p: [0, -0.02, 0.33], s: [1.1, 0.7, 0.7] });
      b.sphere(0.1, '#fff6e6', { p: [0, -0.16, 0.24], s: [1, 0.7, 0.8] });
      b.mirror((s) => {
        b.sphere(0.11, t, { p: [s * 0.24, 0.25, -0.06], s: [1, 1, 0.6] });
        b.sphere(0.065, '#8a5a34', { p: [s * 0.24, 0.25, -0.02], s: [1, 1, 0.5] });
        b.sphere(0.105, '#fff6e6', { p: [s * 0.075, -0.09, 0.26] });
        eye(b, s * 0.15, 0.08, 0.24, 0.068, { iris: '#c8e04a', lid: t, tilt: -0.95, slant: -0.6 });
        b.tube([s * 0.11, 0.04, 0.29], [s * 0.13, -0.05, 0.3], 0.014, '#5a3a20');
        for (let i = 0; i < 2; i++) b.sphere(0.014, '#5a3a20', { p: [s * (0.1 + i * 0.04), -0.1 - i * 0.02, 0.355], seg: 5, rings: 4 });
      });
    },
    torso(b) {
      b.tube([0, 0.1, -0.22], [0.16, 0.34, -0.5], 0.06, '#d9a760');
      b.sphere(0.07, '#5a3a20', { p: [0.18, 0.37, -0.53] });
    },
  },
  tatu: {
    body: '#b3a089',
    arm: '#b3a089',
    hand: '#7c6b56',
    head(b) {
      const g = '#b3a089';
      b.sphere(0.25, g, { s: [0.92, 0.9, 1.05], seg: 12, rings: 9 });
      b.cone(0.13, 0.38, '#c9b8a2', { p: [0, -0.07, 0.34], r: [1.72, 0, 0], seg: 10 });
      b.sphere(0.045, '#4a3a30', { p: [0, -0.1, 0.52] });
      b.sphere(0.22, '#8c7a63', { p: [0, 0.13, -0.02], s: [0.9, 0.42, 0.95], seg: 10, rings: 6 });
      b.mirror((s) => {
        b.cone(0.07, 0.28, '#c9b49b', { p: [s * 0.13, 0.32, -0.12], r: [-0.2, 0, -s * 0.25], seg: 6 });
        b.sphere(0.045, BLACK, { p: [s * 0.16, 0.02, 0.15] });
        b.sphere(0.014, WHITE, { p: [s * 0.16 + 0.012, 0.035, 0.19], seg: 5, rings: 4 });
      });
    },
    torso(b) {
      b.sphere(0.33, '#8c7a63', { p: [0, 0.24, -0.14], s: [1, 1.05, 0.85], seg: 12, rings: 9 });
      for (let i = 0; i < 3; i++) b.torus(0.31 - i * 0.012, 0.03, '#a8957c', { p: [0, 0.14 + i * 0.13, -0.14], r: [Math.PI / 2, 0, 0], s: [1, 0.85, 1], seg: 14 });
      b.cone(0.07, 0.3, '#b3a089', { p: [0, 0.08, -0.46], r: [-1.9, 0, 0], seg: 6 });
    },
  },
  yaca: {
    body: '#3f8f5c',
    arm: '#3f8f5c',
    hand: '#2c6b44',
    belly: '#cfe8a8',
    head(b) {
      const g = '#3f8f5c';
      const d = '#2c6b44';
      b.rbox(0.44, 0.26, 0.4, 0.11, g, { round: 2 });
      b.rbox(0.32, 0.15, 0.5, 0.07, g, { p: [0, -0.02, 0.38], round: 2 });
      b.rbox(0.3, 0.08, 0.48, 0.035, '#cfe8a8', { p: [0, -0.14, 0.34] });
      b.mirror((s) => {
        for (let i = 0; i < 4; i++) b.cone(0.022, 0.06, WHITE, { p: [s * 0.145, -0.095, 0.22 + i * 0.11], r: [Math.PI, 0, 0], seg: 5 });
        b.sphere(0.035, d, { p: [s * 0.07, 0.06, 0.6] });
        b.sphere(0.1, g, { p: [s * 0.13, 0.15, 0.04] });
        b.sphere(0.065, '#ffe45c', { p: [s * 0.14, 0.17, 0.09] });
        b.rbox(0.022, 0.09, 0.02, 0.008, BLACK, { p: [s * 0.14, 0.17, 0.152] });
        b.dome(0.075, g, { p: [s * 0.14, 0.18, 0.085], r: [-0.9, 0, 0], seg: 8, rings: 4 });
      });
      for (let i = 0; i < 3; i++) b.cone(0.045, 0.1, d, { p: [0, 0.15, -0.12 + i * -0.02 - i * 0.0], r: [-0.3, 0, 0], seg: 5, s: [1, 1 - i * 0.2, 1] });
    },
    torso(b) {
      for (let i = 0; i < 3; i++) b.cone(0.05, 0.12, '#2c6b44', { p: [0, 0.16 + i * 0.13, -0.2], r: [-1.2, 0, 0], seg: 5 });
      b.tube([0, 0.08, -0.2], [0, 0.2, -0.62], 0.1, '#3f8f5c', { flat: true, r2: 0.03 });
    },
  },
};

/** Solo la cabeza de un piloto (para retratos). El origen queda en el cuello. */
export function headGeo(id) {
  const d = DRIVER[id] || DRIVER.capi;
  const b = new Builder();
  b.group({ p: [0, 0.3 + (d.neck || 0), 0.02] }, () => d.head(b));
  return b.build();
}

function paletteOf(cfg) {
  const paint = PAINTS[cfg.paint] || PAINTS[0];
  const accent = cfg.paint === 8 ? '#ffd23f' : '#fff3c4';
  return { paint, paint2: darker(paint, 0.22), accent, light: lighter(paint, 0.4) };
}

/**
 * Arma el vehículo de una configuración. Devuelve:
 *   root (posición y rumbo) → lean (inclinación, salto, giro del derrape) → body, head y ruedas
 *   wheels: [{ pivot, spin, r, front, side }], pipes: puntos del escape, spec: medidas, bike, size
 */
export function makeVehicle(config, { thick = 0.03, outline = true } = {}) {
  const cfg = sanitize(config);
  const spec = BODY[cfg.body] || BODY.clasico;
  const drv = DRIVER[cfg.driver] || DRIVER.capi;
  const info = byId(DRIVERS, cfg.driver);
  const size = info.size;
  const wk = WHEEL[cfg.wheels] || WHEEL.estandar;
  const c = paletteOf(cfg);
  const bike = !!spec.bike;
  // las ruedas más grandes levantan todo el vehículo
  const lift = spec.wheels[1].r * (wk.r - 1);

  const b = new Builder();
  spec.build(b, c);
  (EXTRA[cfg.extra] || EXTRA.banderin)(b, c, { back: spec.back, front: spec.front, bike });
  // piloto sentado: tronco, panza, brazos hasta donde agarra y, en las motos, piernas
  const [sx, sy, sz] = spec.seat;
  b.group({ p: [sx, sy, sz], s: size }, () => {
    b.capsule(0.19, 0.2, drv.body, { p: [0, 0.25, 0] });
    if (drv.belly) b.sphere(0.17, drv.belly, { p: [0, 0.22, 0.09], s: [0.85, 1.1, 0.7] });
    drv.torso?.(b);
  });
  b.mirror((s) => {
    const sh = [sx + s * 0.2 * size, sy + 0.4 * size, sz + 0.05 * size];
    const hand = [s * spec.hands[0], spec.hands[1], spec.hands[2]];
    const elbow = [(sh[0] + hand[0]) / 2 + s * 0.07, (sh[1] + hand[1]) / 2 - 0.09, (sh[2] + hand[2]) / 2];
    b.tube(sh, elbow, 0.06 * size, drv.arm);
    b.tube(elbow, hand, 0.055 * size, drv.arm);
    b.sphere(0.075 * size, drv.hand, { p: hand, seg: 8, rings: 6 });
    if (bike) {
      const hip = [sx + s * 0.12 * size, sy + 0.06 * size, sz + 0.04];
      const foot = [s * spec.feet[0], spec.feet[1], spec.feet[2]];
      const knee = [s * (spec.feet[0] + 0.06), (hip[1] + foot[1]) / 2 + 0.14, (hip[2] + foot[2]) / 2 + 0.22];
      b.tube(hip, knee, 0.075 * size, drv.arm);
      b.tube(knee, foot, 0.065 * size, drv.arm);
      b.sphere(0.09 * size, drv.hand, { p: [foot[0], foot[1], foot[2] + 0.05], s: [0.8, 0.6, 1.3], seg: 8, rings: 6 });
    }
  });

  const root = new THREE.Group();
  const lean = new THREE.Group();
  root.add(lean);
  const body = inked(b.build({ outline }), { thick, outline });
  body.position.y = lift;
  lean.add(body);

  const head = inked(headGeo(cfg.driver), { thick, outline });
  head.scale.setScalar(size);
  head.position.set(sx, sy + lift + 0.4 * size, sz + 0.02 * size);
  lean.add(head);

  const wheels = [];
  for (const w of spec.wheels) {
    const r = w.r * wk.r;
    const geo = wheelGeo(cfg.wheels, r, w.w * wk.w, c);
    for (const side of bike ? [0] : [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * (w.x + (wk.w - 1) * w.w * 0.5), r, w.z);
      const spin = new THREE.Mesh(geo, paintMat());
      pivot.add(spin);
      if (outline) {
        const line = new THREE.Mesh(geo, outlineMat(thick));
        spin.add(line);
      }
      lean.add(pivot);
      wheels.push({ pivot, spin, r, front: !!w.front, side });
    }
  }
  const pipes = spec.pipes.map((p) => new THREE.Vector3(p[0], p[1] + lift, p[2]));
  return {
    root,
    lean,
    body,
    head,
    wheels,
    pipes,
    bike,
    size,
    lift,
    cfg,
    headBase: head.position.clone(),
    top: sy + lift + (1.0 + (drv.neck || 0)) * size, // altura de la coronilla (carteles, burbuja)
    paint: c.paint,
  };
}

export const DRIVER_IDS = DRIVERS.map((d) => d.id);
export const BODY_IDS = BODIES.map((d) => d.id);
export const WHEEL_IDS = WHEELS.map((d) => d.id);
export const EXTRA_IDS = EXTRAS.map((d) => d.id);
