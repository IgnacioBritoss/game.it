/**
 * Golfazo — modelos hechos con primitivas (sin archivos): adornos de cada mundo y la apariencia de los obstáculos.
 * Todo se arma en mallas combinadas con color por vértice (geo.js); lo que se mueve va en un grupo propio.
 */
import * as THREE from '/vendor/three.min.js';
import { Mesher, M, shade } from './geo.js';
import { WALL_T } from './shared/build.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ adornos
const pick = (R, list) => list[Math.floor(R() * list.length) % list.length];

/** Agrega un adorno en el origen del marco actual de `lit` (y de `glow` para lo que brilla). */
export function decor(lit, glow, type, theme, R, s = 1) {
  const sn = theme === 'glaciar';
  switch (type) {
    case 'tree': {
      lit.push(0, 0, 0, R() * TAU, s);
      lit.cyl(0.16, 0.24, 1.3, 0, 0, 0, '#8a5a33', 8);
      lit.ball(1.0, 0.92, 1.0, 0, 2.05, 0, pick(R, ['#5cc84a', '#52bd44', '#66d352']), 10, 7);
      lit.ball(0.7, 0.66, 0.7, 0.62, 1.55, 0.18, '#4fb840', 9, 6);
      lit.ball(0.66, 0.6, 0.66, -0.55, 1.7, -0.25, '#6cd855', 9, 6);
      lit.pop();
      break;
    }
    case 'bush': {
      lit.push(0, 0, 0, R() * TAU, s);
      lit.ball(0.55, 0.42, 0.5, 0, 0.3, 0, '#4fb840', 9, 6);
      lit.ball(0.4, 0.32, 0.38, 0.45, 0.22, 0.1, '#5cc84a', 8, 5);
      lit.ball(0.36, 0.3, 0.34, -0.42, 0.2, -0.12, '#66d352', 8, 5);
      lit.pop();
      break;
    }
    case 'rock': {
      const c = sn ? '#b8c6d8' : theme === 'volcan' ? '#5a5060' : '#a7b0ba';
      lit.push(0, 0, 0, R() * TAU, s);
      lit.ball(0.7, 0.5, 0.6, 0, 0.3, 0, c, 8, 6);
      lit.ball(0.42, 0.32, 0.4, 0.55, 0.16, 0.2, shade(c, 0.08), 7, 5);
      lit.ball(0.3, 0.22, 0.3, -0.5, 0.12, -0.3, shade(c, -0.08), 7, 5);
      lit.pop();
      break;
    }
    case 'flower': {
      const c = pick(R, ['#ff5a8a', '#ffd23f', '#ffffff', '#ff8a3c', '#b06bff']);
      lit.push(0, 0, 0, R() * TAU, s);
      lit.cyl(0.02, 0.02, 0.4, 0, 0, 0, '#4fb840', 5);
      for (let i = 0; i < 5; i++) lit.ball(0.07, 0.04, 0.07, Math.sin((i * TAU) / 5) * 0.1, 0.42, Math.cos((i * TAU) / 5) * 0.1, c, 6, 4);
      lit.ball(0.06, 0.05, 0.06, 0, 0.44, 0, '#ffd23f', 6, 4);
      lit.pop();
      break;
    }
    case 'mushroom': {
      lit.push(0, 0, 0, R() * TAU, s);
      lit.cyl(0.1, 0.15, 0.45, 0, 0, 0, '#fff2d8', 7);
      lit.dome(0.42, 0.3, 0.42, 0, 0.42, 0, '#ff5a5f', 10, 5);
      for (let i = 0; i < 4; i++) lit.ball(0.07, 0.03, 0.07, Math.sin(i * 1.7) * 0.22, 0.68 - (i % 2) * 0.1, Math.cos(i * 1.7) * 0.22, '#ffffff', 5, 3);
      lit.pop();
      break;
    }
    case 'pine': {
      const g = sn ? ['#3f9a78', '#4aa886', '#58b894'] : ['#2f9e5a', '#38ac64', '#44b86e'];
      lit.push(0, 0, 0, R() * TAU, s);
      lit.cyl(0.14, 0.2, 0.9, 0, 0, 0, '#7a4e2c', 7);
      lit.cone(1.05, 1.1, 0, 0.7, 0, g[0], 9);
      lit.cone(0.82, 1.0, 0, 1.45, 0, g[1], 9);
      lit.cone(0.58, 0.95, 0, 2.15, 0, g[2], 9);
      if (sn) {
        lit.cone(0.5, 0.45, 0, 2.62, 0, '#f4f9ff', 9);
        lit.cone(0.62, 0.3, 0, 1.92, 0, '#f4f9ff', 9);
      }
      lit.pop();
      break;
    }
    case 'palm': {
      lit.push(0, 0, 0, R() * TAU, s);
      const lean = 0.35;
      for (let i = 0; i < 6; i++) lit.cyl(0.13 - i * 0.008, 0.15 - i * 0.008, 0.5, Math.sin(i * 0.28) * lean * i * 0.14, i * 0.48, 0, '#a8744a', 7);
      const tx = Math.sin(5 * 0.28) * lean * 5 * 0.14;
      for (let i = 0; i < 7; i++) {
        const a = (i * TAU) / 7;
        lit.pushM(M(tx, 2.95, 0, 0.45, a, 0));
        lit.ball(0.12, 0.05, 0.75, 0, 0, 0.7, i % 2 ? '#3fbf5a' : '#52cf68', 6, 4);
        lit.pop();
      }
      lit.ball(0.14, 0.14, 0.14, tx, 2.9, 0.05, '#7a4e2c', 6, 4);
      lit.pop();
      break;
    }
    case 'umbrella': {
      const c = pick(R, ['#ff5a5f', '#ffd23f', '#3ec1ff']);
      lit.push(0, 0, 0, R() * TAU, s);
      lit.pushM(M(0, 0, 0, 0, 0, 0.12));
      lit.cyl(0.03, 0.03, 1.7, 0, 0, 0, '#fff2d8', 5);
      lit.dome(0.95, 0.4, 0.95, 0, 1.55, 0, c, 12, 4);
      lit.ring(0.6, 0.04, 0, 1.78, 0, '#ffffff', 4, 14);
      lit.pop();
      lit.pop();
      break;
    }
    case 'starfish': {
      lit.push(0, 0, 0, R() * TAU, s);
      for (let i = 0; i < 5; i++) {
        lit.pushM(M(0, 0.05, 0, 0, (i * TAU) / 5, 0));
        lit.ball(0.08, 0.04, 0.26, 0, 0, 0.18, '#ff7a5a', 6, 4);
        lit.pop();
      }
      lit.ball(0.12, 0.05, 0.12, 0, 0.06, 0, '#ff8f6f', 6, 4);
      lit.pop();
      break;
    }
    case 'shell': {
      lit.push(0, 0, 0, R() * TAU, s);
      lit.ball(0.3, 0.14, 0.26, 0, 0.1, 0, '#ffe3cf', 8, 5);
      lit.ball(0.2, 0.09, 0.18, 0, 0.17, 0, '#ffc8b0', 8, 4);
      lit.pop();
      break;
    }
    case 'ball': {
      lit.push(0, 0, 0, R() * TAU, s);
      lit.ball(0.34, 0.34, 0.34, 0, 0.34, 0, '#ffffff', 10, 8);
      lit.ring(0.34, 0.06, 0, 0.34, 0, '#ff5a5f', 4, 16, 0);
      lit.ring(0.34, 0.06, 0, 0.34, 0, '#3ec1ff', 4, 16, Math.PI / 2, Math.PI / 2);
      lit.pop();
      break;
    }
    case 'snowman': {
      lit.push(0, 0, 0, R() * TAU, s);
      lit.ball(0.55, 0.5, 0.55, 0, 0.45, 0, '#ffffff', 10, 8);
      lit.ball(0.42, 0.4, 0.42, 0, 1.15, 0, '#ffffff', 10, 8);
      lit.ball(0.32, 0.3, 0.32, 0, 1.7, 0, '#ffffff', 10, 8);
      lit.pushM(M(0, 1.7, 0.3, Math.PI / 2, 0, 0));
      lit.cone(0.06, 0.28, 0, 0, 0, '#ff8a3c', 6);
      lit.pop();
      lit.ball(0.045, 0.045, 0.03, 0.11, 1.78, 0.27, '#222233', 5, 4);
      lit.ball(0.045, 0.045, 0.03, -0.11, 1.78, 0.27, '#222233', 5, 4);
      lit.cyl(0.2, 0.2, 0.05, 0, 1.94, 0, '#2a2a40', 10);
      lit.cyl(0.14, 0.14, 0.25, 0, 1.97, 0, '#2a2a40', 10);
      lit.cyl(0.145, 0.145, 0.05, 0, 2.0, 0, '#ff5a5f', 10);
      lit.pop();
      break;
    }
    case 'crystal': {
      const c = pick(R, ['#7fe9ff', '#b9a3ff', '#ff9ad5']);
      glow.push(0, 0, 0, R() * TAU, s);
      glow.cone(0.3, 1.5, 0, 0, 0, c, 6);
      glow.pushM(M(0.4, 0, 0.1, 0, 0, -0.35));
      glow.cone(0.22, 1.0, 0, 0, 0, shade(c, 0.2), 6);
      glow.pop();
      glow.pushM(M(-0.35, 0, -0.1, 0, 0, 0.4));
      glow.cone(0.2, 0.8, 0, 0, 0, shade(c, -0.1), 6);
      glow.pop();
      glow.pop();
      break;
    }
    case 'igloo': {
      lit.push(0, 0, 0, R() * TAU, s);
      lit.dome(1.2, 0.95, 1.2, 0, 0, 0, '#eaf4ff', 14, 6);
      lit.box(0.6, 0.55, 0.7, 0, 0, 1.0, '#dbe9fa');
      lit.dome(0.28, 0.28, 0.1, 0, 0.0, 1.36, '#33405a', 8, 4);
      lit.pop();
      break;
    }
    case 'lavarock': {
      lit.push(0, 0, 0, R() * TAU, s);
      lit.ball(0.8, 0.9, 0.7, 0, 0.5, 0, '#4a4152', 8, 6);
      lit.ball(0.5, 0.6, 0.5, 0.65, 0.3, 0.2, '#5a5062', 7, 5);
      lit.pop();
      glow.push(0, 0, 0, 0, s);
      glow.ball(0.1, 0.34, 0.04, 0.2, 0.6, 0.66, '#ff7a2e', 5, 4);
      glow.ball(0.3, 0.07, 0.05, -0.1, 0.9, 0.5, '#ffb02e', 5, 4);
      glow.pop();
      break;
    }
    case 'deadtree': {
      lit.push(0, 0, 0, R() * TAU, s);
      lit.cyl(0.1, 0.2, 1.8, 0, 0, 0, '#3a2d33', 6);
      lit.rod([0, 1.2, 0], [0.7, 1.9, 0.1], 0.06, '#3a2d33', 5);
      lit.rod([0, 1.5, 0], [-0.6, 2.2, -0.1], 0.05, '#3a2d33', 5);
      lit.rod([0.4, 1.7, 0.05], [0.9, 2.2, 0.3], 0.035, '#3a2d33', 4);
      lit.pop();
      break;
    }
    case 'bones': {
      lit.push(0, 0, 0, R() * TAU, s);
      lit.ball(0.32, 0.28, 0.3, 0, 0.3, 0, '#efe6d2', 9, 7);
      lit.ball(0.2, 0.14, 0.2, 0, 0.12, 0.2, '#efe6d2', 7, 5);
      lit.ball(0.08, 0.1, 0.05, 0.12, 0.34, 0.26, '#241c2a', 5, 4);
      lit.ball(0.08, 0.1, 0.05, -0.12, 0.34, 0.26, '#241c2a', 5, 4);
      lit.rod([0.45, 0.05, -0.1], [0.95, 0.07, 0.15], 0.045, '#efe6d2', 5);
      lit.pop();
      break;
    }
    case 'lantern': {
      lit.push(0, 0, 0, 0, s);
      lit.cyl(0.05, 0.07, 1.5, 0, 0, 0, '#3a2d33', 6);
      lit.box(0.3, 0.05, 0.3, 0, 1.5, 0, '#3a2d33');
      glow.push(0, 0, 0, 0, s);
      glow.ball(0.14, 0.18, 0.14, 0, 1.68, 0, '#ffb347', 7, 5);
      glow.pop();
      lit.pop();
      break;
    }
    default:
      break;
  }
}

/** Nube de dibujito: esferas aplastadas. */
export function cloud(m, R) {
  const n = 4 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const r = 1.4 + R() * 1.6;
    m.ball(r * 1.3, r * 0.7, r, (i - n / 2) * 1.8 + R(), R() * 0.6, R() * 1.0 - 0.5, '#ffffff', 9, 6);
  }
}

// ------------------------------------------------------------------ obstáculos
const boxM = (b) => new THREE.Matrix4().makeBasis(new THREE.Vector3(b.xx, b.xy, b.xz).multiplyScalar(2 * b.hx), new THREE.Vector3(b.yx, b.yy, b.yz).multiplyScalar(2 * b.hy), new THREE.Vector3(b.zx, b.zy, b.zz).multiplyScalar(2 * b.hz)).setPosition(b.cx, b.cy, b.cz);
const boxGeo = new THREE.BoxGeometry(1, 1, 1);

/** Caja de la física (en su marco) con color. */
export function physBox(m, b, color) {
  m.add(boxGeo, boxM(b), color);
}

/** Caja a rayas a lo largo de su eje X local (barras giratorias, compuertas). */
function stripedBox(m, b, c0, c1, n = 6) {
  const w = (2 * b.hx) / n;
  for (let i = 0; i < n; i++) {
    const o = -b.hx + w * (i + 0.5);
    const bb = { ...b, cx: b.cx + b.xx * o, cy: b.cy + b.xy * o, cz: b.cz + b.xz * o, hx: w / 2 };
    physBox(m, bb, i % 2 ? c1 : c0);
  }
}

const hexColor = (c) => `#${new THREE.Color(c).getHexString()}`;

/**
 * Visual de un obstáculo que se mueve, en el marco del propio obstáculo (el pivote es el origen).
 * Devuelve la malla combinada con las mismas cajas que usa la física, más adornos que no chocan.
 */
export function moverMesh(mv, prop, T) {
  const m = new Mesher();
  const type = prop?.type || 'slider';
  const [a0, a1, a2, a3] = T.accent;
  if (type === 'spinner') {
    for (const b of mv.boxes) stripedBox(m, b, a0, a3, 6);
    m.cyl(0.15, 0.17, 0.1, 0, 0.27, 0, T.trim, 12);
    return m;
  }
  if (type === 'windmill') {
    for (const b of mv.boxes) {
      physBox(m, b, '#c9915a');
      // la vela: tela de color sobre las dos caras, con una franja clara al medio
      for (const sg of [-1, 1]) {
        const off = sg * (b.hz + 0.004);
        const sail = { ...b, cx: b.cx + b.zx * off, cy: b.cy + b.zy * off, cz: b.cz + b.zz * off, hz: 0.004, hx: b.hx * 0.78, hy: b.hy * 0.94 };
        physBox(m, sail, a0);
        const mid = { ...sail, cx: sail.cx + b.zx * sg * 0.004, cy: sail.cy + b.zy * sg * 0.004, cz: sail.cz + b.zz * sg * 0.004, hx: sail.hx * 0.3, hy: sail.hy * 0.96, hz: 0.004 };
        physBox(m, mid, a3);
      }
    }
    m.cyl(0.24, 0.24, 0.24, 0, -0.05, 0.0, '#8a5a33', 12, Math.PI / 2, 0);
    m.ball(0.2, 0.2, 0.2, 0, 0, 0.17, a1, 10, 8);
    return m;
  }
  if (type === 'hammer') {
    const L = prop.len;
    m.rod([0, 0, 0], [0, -L + prop.head[1] / 2, 0], 0.045, '#8a8f99', 6);
    m.ball(0.1, 0.1, 0.1, 0, 0, 0, a1, 8, 6);
    for (const b of mv.boxes) {
      physBox(m, b, '#7b8494');
      stripedBox(m, { ...b, hy: b.hy * 0.5, cy: b.cy + b.hy * 0.5, hz: b.hz + 0.004, hx: b.hx + 0.004 }, a0, a3, 4);
    }
    return m;
  }
  if (type === 'gate') {
    for (const b of mv.boxes) stripedBox(m, b, '#2a2a3a', '#ffd23f', 8);
    return m;
  }
  if (type === 'raft') {
    for (const b of mv.boxes) {
      physBox(m, b, '#b9824a');
      const planks = 5;
      for (let i = 0; i < planks; i++) {
        const o = -b.hz + ((i + 0.5) * 2 * b.hz) / planks;
        physBox(m, { ...b, cx: b.cx + b.zx * o, cy: b.cy + b.yy * b.hy + 0.004, cz: b.cz + b.zz * o, hy: 0.006, hz: b.hz / planks - 0.012 }, i % 2 ? '#d9a566' : '#c8924f');
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.cyl(0.07, 0.07, 0.34, b.cx + sx * (b.hx - 0.1), b.cy + b.hy - 0.01, b.cz + sz * (b.hz - 0.1), '#8a5a33', 6);
      m.ring(0.2, 0.05, b.cx, b.cy + b.hy + 0.34, b.cz, '#ffffff', 5, 14, Math.PI / 2);
    }
    return m;
  }
  // slider común: cajas con carita (cangrejo), hielo o madera según el estilo
  const style = prop?.style || '';
  for (const b of mv.boxes) {
    if (style === 'crab') {
      physBox(m, b, '#ff6b5a');
      m.ball(b.hx * 0.95, b.hy * 0.9, b.hz * 0.9, b.cx, b.cy + b.hy * 0.6, b.cz, '#ff7a6a', 10, 6);
      for (const sx of [-1, 1]) {
        m.ball(0.07, 0.07, 0.07, b.cx + sx * 0.14, b.cy + b.hy * 1.7, b.cz + b.hz * 0.5, '#ffffff', 7, 5);
        m.ball(0.035, 0.035, 0.035, b.cx + sx * 0.14, b.cy + b.hy * 1.7, b.cz + b.hz * 0.5 + 0.055, '#1b1b2a', 5, 4);
        m.ball(0.11, 0.09, 0.14, b.cx + sx * (b.hx + 0.06), b.cy + b.hy * 0.4, b.cz + b.hz * 0.5, '#ff5a4a', 7, 5);
      }
    } else if (style === 'ice') physBox(m, b, '#bfe6ff');
    else physBox(m, b, T.pillar);
  }
  return m;
}

/** Adornos fijos de un obstáculo (no se mueve ni choca): techo del molino, arco del martillo, ventilador, etc. */
export function propMesh(p, T, lit, glow) {
  const [a0, a1, a2, a3] = T.accent;
  const yaw = ((p.yaw || 0) * Math.PI) / 180;
  switch (p.type) {
    case 'windmill': {
      lit.push(p.x, p.y, p.z, yaw, 1);
      const w = p.wide;
      // techo a dos aguas sobre la pared
      lit.roof(w + 0.1, 0.85, p.depth + 0.3, 0, 1.92, p.depth / 2, a0);
      lit.box(w + 0.14, 0.07, p.depth + 0.34, 0, 1.9, p.depth / 2, a3);
      lit.box(p.door + 0.18, 0.06, p.depth + 0.04, 0, 0.7, p.depth / 2, a3);
      for (const s of [-1, 1]) lit.box(0.1, 0.72, p.depth + 0.04, s * (p.door / 2 + 0.05), -0.0, p.depth / 2, a3);
      lit.pop();
      break;
    }
    case 'hammer': {
      lit.push(p.x, p.y, p.z, yaw, 1);
      const half = (p.axis === 'f' ? p.span : p.span) / 2;
      const top = p.height;
      const sideAxis = p.axis === 'f' ? [1, 0, 0] : [0, 0, 1];
      for (const s of [-1, 1]) {
        lit.cyl(0.13, 0.17, top + 0.25, sideAxis[0] * s * half, -0.2, sideAxis[2] * s * half, '#5b6272', 8);
        lit.ball(0.17, 0.17, 0.17, sideAxis[0] * s * half, top + 0.07, sideAxis[2] * s * half, a1, 8, 6);
      }
      lit.add(new THREE.BoxGeometry(1, 1, 1), M(0, top + 0.07, 0, 0, p.axis === 'f' ? 0 : Math.PI / 2, 0, 2 * half, 0.16, 0.2), '#5b6272');
      lit.ring(0.16, 0.04, 0, top + 0.07, 0, a0, 5, 12, 0, 0);
      lit.pop();
      break;
    }
    case 'spinner': {
      lit.push(p.x, p.y, p.z, 0, 1);
      lit.cyl(0.17, 0.2, p.h + 0.1, 0, -0.05, 0, T.pillar, 12);
      lit.cyl(0.2, 0.2, 0.04, 0, 0.0, 0, a3, 12);
      lit.pop();
      break;
    }
    case 'fan': {
      lit.push(p.x, p.y, p.z, yaw, 1);
      lit.cyl(0.55, 0.62, 0.22, 0, 0, 0, '#5b6272', 14);
      lit.add(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true), M(0, 0.62, 0.1, Math.PI / 2, 0, 0, 0.58, 0.28, 0.58), a0);
      lit.ring(0.58, 0.045, 0, 0.62, 0.0, '#ffffff', 5, 18, 0, 0);
      lit.pop();
      break;
    }
    case 'bumper': {
      lit.push(p.x, p.y, p.z, 0, 1);
      lit.cyl(p.r * 1.12, p.r * 1.18, 0.07, 0, -0.03, 0, a3, 18);
      lit.cyl(p.r * 0.92, p.r, p.h, 0, 0, 0, a0, 18);
      lit.cyl(p.r * 1.02, p.r * 1.02, 0.07, 0, p.h * 0.45, 0, a3, 18);
      lit.dome(p.r * 0.82, 0.14, p.r * 0.82, 0, p.h, 0, a1, 14, 4);
      lit.pop();
      break;
    }
    case 'post': {
      lit.push(p.x, p.y, p.z, 0, 1);
      lit.cyl(p.r, p.r * 1.06, p.h, 0, 0, 0, T.pillar, 12);
      lit.cyl(p.r * 1.04, p.r * 1.04, 0.07, 0, p.h * 0.62, 0, a0, 12);
      lit.cyl(p.r * 1.08, p.r * 1.08, 0.05, 0, p.h, 0, a3, 12);
      lit.pop();
      break;
    }
    case 'block':
    case 'ice': {
      lit.push(p.x, p.y, p.z, yaw, 1);
      const ice = p.type === 'ice';
      lit.box(p.w, p.h, p.d, 0, 0, 0, ice ? '#bfe6ff' : T.pillar);
      lit.box(p.w + 0.05, 0.05, p.d + 0.05, 0, p.h, 0, ice ? '#ffffff' : a3);
      lit.pop();
      break;
    }
    case 'crate': {
      lit.push(p.x, p.y, p.z, yaw, 1);
      lit.box(p.w, p.h, p.d, 0, 0, 0, '#c8924f');
      lit.box(p.w + 0.03, 0.05, p.d + 0.03, 0, p.h - 0.05, 0, '#8a5a33');
      lit.box(p.w + 0.03, 0.05, p.d + 0.03, 0, 0, 0, '#8a5a33');
      lit.pop();
      break;
    }
    default:
      break;
  }
  void glow;
}

/** Cañón: boca de salida de un tubo con ángulo. */
export function cannonMesh(lit, glow, z, T) {
  const yaw = ((z.yaw || 0) * Math.PI) / 180;
  const pitch = ((z.pitch || 0) * Math.PI) / 180;
  lit.push(z.bx, z.by, z.bz, yaw, 1);
  lit.cyl(0.55, 0.62, 0.18, 0, 0, 0, '#4a4f5e', 14);
  lit.pushM(M(0, 0.18, 0, Math.PI / 2 - pitch, 0, 0));
  lit.add(new THREE.CylinderGeometry(1, 1, 1, 14, 1, true), M(0, 0.5, 0, 0, 0, 0, 0.34, 1.0, 0.34), '#6a7084');
  lit.ring(0.34, 0.07, 0, 1.0, 0, '#ffd23f', 5, 14, Math.PI / 2, 0);
  lit.pop();
  lit.pop();
  void glow;
  void T;
}

export { WALL_T };
