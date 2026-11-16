/**
 * Disimulá — el cuerpo compartido (JS puro, sin three.js).
 *
 * Define el maniquí: huesos, partes (cápsulas, esferas y cajas), poses, y el atlas de
 * pintura de 128×128 donde vive cada parte. Este archivo es la única fuente de verdad:
 *  - el cliente genera las mallas 3D con `partMesh` (las UVs ya vienen en coordenadas del atlas),
 *  - el servidor y los bots usan `transforms`, `raycastBody`, `sampleBody` y `closestBodyPoint`
 *    para capturas, proyecciones de pintura y puntaje de camuflaje — sin WebGL.
 * Las matrices se calculan acá (no con Euler de three.js) para que CPU y GPU coincidan exacto.
 */

export const ATLAS = 128; // lado del atlas de pintura
export const BASE_COLOR = [238, 238, 244]; // blanco del maniquí sin pintar

// ---------------------------------------------------------------- huesos
// [nombre, padre, pivote en el espacio del padre]
export const BONES = [
  ['root', null, [0, 0, 0]],
  ['torso', 'root', [0, 0.1, 0]],
  ['head', 'torso', [0, 0.46, 0]],
  ['uarmL', 'torso', [0.215, 0.38, 0]],
  ['foreL', 'uarmL', [0, -0.28, 0]],
  ['uarmR', 'torso', [-0.215, 0.38, 0]],
  ['foreR', 'uarmR', [0, -0.28, 0]],
  ['thighL', 'root', [0.115, -0.02, 0]],
  ['shinL', 'thighL', [0, -0.42, 0]],
  ['thighR', 'root', [-0.115, -0.02, 0]],
  ['shinR', 'thighR', [0, -0.42, 0]],
];
const BONE_I = Object.fromEntries(BONES.map((b, i) => [b[0], i]));

// ---------------------------------------------------------------- partes
// shape: cap (cápsula a→b radio r) | sph (esfera c radio r) | box (centro c, medidas s)
// rect: lugar en el atlas [x, y, ancho, alto]. region: grupo para el balde y el material.
export const PARTS = [
  { id: 'head', bone: 'head', shape: 'sph', c: [0, 0.17, 0], r: 0.16, rect: [0, 0, 48, 32], region: 'head' },
  { id: 'torso', bone: 'torso', shape: 'cap', a: [0, 0.02, 0], b: [0, 0.4, 0], r: 0.175, rect: [48, 0, 56, 36], region: 'torso' },
  { id: 'hips', bone: 'root', shape: 'cap', a: [0, -0.05, 0], b: [0, 0.07, 0], r: 0.165, rect: [48, 36, 56, 14], region: 'torso' },
  { id: 'uarmL', bone: 'uarmL', shape: 'cap', a: [0, 0, 0], b: [0, -0.27, 0], r: 0.06, rect: [104, 0, 24, 18], region: 'armL' },
  { id: 'foreL', bone: 'foreL', shape: 'cap', a: [0, 0, 0], b: [0, -0.25, 0], r: 0.052, rect: [104, 18, 24, 16], region: 'armL' },
  { id: 'handL', bone: 'foreL', shape: 'sph', c: [0, -0.3, 0], r: 0.07, rect: [104, 34, 24, 14], region: 'handL' },
  { id: 'uarmR', bone: 'uarmR', shape: 'cap', a: [0, 0, 0], b: [0, -0.27, 0], r: 0.06, rect: [48, 50, 24, 18], region: 'armR' },
  { id: 'foreR', bone: 'foreR', shape: 'cap', a: [0, 0, 0], b: [0, -0.25, 0], r: 0.052, rect: [48, 68, 24, 16], region: 'armR' },
  { id: 'handR', bone: 'foreR', shape: 'sph', c: [0, -0.3, 0], r: 0.07, rect: [48, 84, 24, 14], region: 'handR' },
  { id: 'thighL', bone: 'thighL', shape: 'cap', a: [0, 0, 0], b: [0, -0.41, 0], r: 0.09, rect: [0, 32, 24, 22], region: 'legL' },
  { id: 'shinL', bone: 'shinL', shape: 'cap', a: [0, 0, 0], b: [0, -0.38, 0], r: 0.068, rect: [0, 54, 24, 20], region: 'legL' },
  { id: 'footL', bone: 'shinL', shape: 'box', c: [0, -0.4, 0.055], s: [0.12, 0.08, 0.26], rect: [0, 74, 24, 16], region: 'footL' },
  { id: 'thighR', bone: 'thighR', shape: 'cap', a: [0, 0, 0], b: [0, -0.41, 0], r: 0.09, rect: [24, 32, 24, 22], region: 'legR' },
  { id: 'shinR', bone: 'shinR', shape: 'cap', a: [0, 0, 0], b: [0, -0.38, 0], r: 0.068, rect: [24, 54, 24, 20], region: 'legR' },
  { id: 'footR', bone: 'shinR', shape: 'box', c: [0, -0.4, 0.055], s: [0.12, 0.08, 0.26], rect: [24, 74, 24, 16], region: 'footR' },
];

/**
 * Regiones para el balde y el material. face/front/back son sub-zonas solo de balde
 * (u es el ángulo: 0,5 = frente); las demás también tienen material propio.
 */
export const REGIONS = [
  { id: 'head', parts: ['head'] },
  { id: 'face', parts: ['head'], u: [0.33, 0.67], v: [0.3, 0.85] },
  { id: 'torso', parts: ['torso', 'hips'] },
  { id: 'front', parts: ['torso', 'hips'], u: [0.26, 0.74] },
  { id: 'back', parts: ['torso', 'hips'], uOut: [0.26, 0.74] }, // el complemento: la espalda
  { id: 'armL', parts: ['uarmL', 'foreL'] },
  { id: 'armR', parts: ['uarmR', 'foreR'] },
  { id: 'handL', parts: ['handL'] },
  { id: 'handR', parts: ['handR'] },
  { id: 'legL', parts: ['thighL', 'shinL'] },
  { id: 'legR', parts: ['thighR', 'shinR'] },
  { id: 'footL', parts: ['footL'] },
  { id: 'footR', parts: ['footR'] },
];
export const MAT_REGIONS = REGIONS.filter((r) => !r.u && !r.uOut).map((r) => r.id); // 10 regiones con material propio

/** ¿El texel (u,v) de una parte pertenece a la región? */
export function inRegion(reg, partId, u, v) {
  if (!reg.parts.includes(partId)) return false;
  if (reg.u && (u < reg.u[0] || u > reg.u[1])) return false;
  if (reg.uOut && u >= reg.uOut[0] && u <= reg.uOut[1]) return false;
  if (reg.v && (v < reg.v[0] || v > reg.v[1])) return false;
  return true;
}

// dueño de cada texel del atlas (índice de parte o -1): para pinceles y balde
let OWNER = null;
export function atlasOwner() {
  if (OWNER) return OWNER;
  OWNER = new Int8Array(ATLAS * ATLAS).fill(-1);
  PARTS.forEach((p, i) => {
    const [x, y, w, h] = p.rect;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) OWNER[yy * ATLAS + xx] = i;
  });
  return OWNER;
}

/** Texel del atlas para el (u,v) de una parte. */
export function uvToTexel(part, u, v) {
  const [x, y, w, h] = part.rect;
  return [x + Math.min(w - 1, Math.max(0, Math.floor(u * w))), y + Math.min(h - 1, Math.max(0, Math.floor((1 - v) * h)))];
}

/** (u,v) del centro de un texel de una parte. */
export function texelToUv(part, tx, ty) {
  const [x, y, w, h] = part.rect;
  return [(tx - x + 0.5) / w, 1 - (ty - y + 0.5) / h];
}

// ---------------------------------------------------------------- poses
// rot: [rx, ry, rz] por hueso. rootY: altura de la cadera. rootRX: inclinación de todo el cuerpo.
// hitH/hitR: cápsula del lugar que ocupa (validez del escondite). eye: altura de cámara propia.
export const POSES = {
  stand: { rootY: 0.89, rootRX: 0, hitH: 1.8, hitR: 0.3, eye: 1.6, bones: { uarmL: [0, 0, -0.08], uarmR: [0, 0, 0.08] } },
  crouch: {
    rootY: 0.47,
    rootRX: 0,
    hitH: 1.15,
    hitR: 0.34,
    eye: 0.95,
    bones: { torso: [0.38, 0, 0], head: [-0.25, 0, 0], thighL: [-1.62, 0, 0.06], shinL: [1.52, 0, 0], thighR: [-1.62, 0, -0.06], shinR: [1.52, 0, 0], uarmL: [-0.55, 0, -0.1], foreL: [-0.9, 0, 0], uarmR: [-0.55, 0, 0.1], foreR: [-0.9, 0, 0] },
  },
  sit: {
    rootY: 0.17,
    rootRX: 0,
    hitH: 0.95,
    hitR: 0.4,
    eye: 0.75,
    bones: { torso: [0.12, 0, 0], thighL: [-1.45, 0, 0.1], shinL: [0.28, 0, 0], thighR: [-1.45, 0, -0.1], shinR: [0.28, 0, 0], uarmL: [0.15, 0, -0.35], uarmR: [0.15, 0, 0.35] },
  },
  lie: {
    rootY: 0.22,
    rootRX: -1.5708,
    hitH: 0.5,
    hitR: 0.55,
    eye: 0.35,
    bones: { head: [0.35, 0, 0], uarmL: [0, 0, -0.12], uarmR: [0, 0, 0.12], thighL: [0.06, 0, 0.04], thighR: [0.06, 0, -0.04] },
  },
  star: {
    rootY: 0.89,
    rootRX: 0,
    hitH: 1.8,
    hitR: 0.55,
    eye: 1.6,
    bones: { uarmL: [0, 0, -1.4], uarmR: [0, 0, 1.4], thighL: [0, 0, 0.3], thighR: [0, 0, -0.3], shinL: [0, 0, -0.08], shinR: [0, 0, 0.08] },
  },
  wall: {
    rootY: 0.89,
    rootRX: 0.07,
    hitH: 1.8,
    hitR: 0.3,
    eye: 1.6,
    bones: { head: [-0.07, 0, 0], uarmL: [0, 0, -0.35], uarmR: [0, 0, 0.35], foreL: [0, 0, -0.1], foreR: [0, 0, 0.1] },
  },
};
export const POSE_IDS = Object.keys(POSES);

// Ajuste fino: 6 articulaciones de -1 a 1, cada una suma una rotación con límite.
// [hueso, eje (0=rx 2=rz), rango en radianes]
export const JOINTS = [
  ['head', 0, 0.6],
  ['torso', 0, 0.45],
  ['uarmL', 2, -1.3],
  ['uarmR', 2, 1.3],
  ['thighL', 0, -1.1],
  ['thighR', 0, -1.1],
];

export const eyeHeight = (pose) => (POSES[pose] || POSES.stand).eye;
export const poseHit = (pose) => {
  const p = POSES[pose] || POSES.stand;
  return { r: p.hitR, h: p.hitH };
};

// ---------------------------------------------------------------- matrices (3×3 por filas + posición)
const matMul = (a, b) => [
  a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
  a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
  a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
];
const matVec = (m, x, y, z) => [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
/** Transpuesta por el vector (la inversa de una rotación). */
const matTVec = (m, x, y, z) => [m[0] * x + m[3] * y + m[6] * z, m[1] * x + m[4] * y + m[7] * z, m[2] * x + m[5] * y + m[8] * z];
const rotXYZ = (rx, ry, rz) => {
  // orden fijo: primero giro propio Z, después X, después Y (R = Ry·Rx·Rz)
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  const Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return matMul(Ry, matMul(Rx, Rz));
};
const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/**
 * Transformaciones de cada parte en el mundo para un estado
 * { pos: [x,y,z] (pies), yaw, pose, joints: [6] } → [{ m: mat3, p: [x,y,z] }, …] (una por PARTS).
 * También devuelve los huesos en `bones` (para los ojos y la cabeza).
 */
export function transforms(state) {
  const pose = POSES[state.pose] || POSES.stand;
  const joints = state.joints || [];
  const rots = {};
  for (const [name] of BONES) rots[name] = pose.bones?.[name] ? pose.bones[name].slice() : [0, 0, 0];
  JOINTS.forEach(([bone, axis, range], i) => {
    const v = Math.max(-1, Math.min(1, joints[i] || 0));
    rots[bone][axis] += v * range;
  });
  // animación aditiva (caminar, sorpresa): { hueso: [rx, ry, rz] } — solo visual, no viaja por la red
  if (state.anim) {
    for (const k in state.anim) {
      const r = rots[k];
      if (!r) continue;
      r[0] += state.anim[k][0];
      r[1] += state.anim[k][1] || 0;
      r[2] += state.anim[k][2] || 0;
    }
  }
  const world = [];
  const yawM = rotXYZ(pose.rootRX, state.yaw || 0, 0);
  for (let i = 0; i < BONES.length; i++) {
    const [name, parent, pivot] = BONES[i];
    const local = name === 'root' ? IDENT : rotXYZ(rots[name][0], rots[name][1], rots[name][2]);
    if (!parent) {
      world.push({ m: yawM, p: [state.pos[0], state.pos[1] + pose.rootY, state.pos[2]] });
    } else {
      const pw = world[BONE_I[parent]];
      const off = matVec(pw.m, pivot[0], pivot[1], pivot[2]);
      world.push({ m: matMul(pw.m, local), p: [pw.p[0] + off[0], pw.p[1] + off[1], pw.p[2] + off[2]] });
    }
  }
  const parts = PARTS.map((part) => world[BONE_I[part.bone]]);
  return { parts, bones: world };
}

// ---------------------------------------------------------------- parametrización de superficies
// u = ángulo alrededor del eje (0,5 = frente, +Z) y envuelve; v = a lo largo (0 abajo, 1 arriba).

function capsuleLocal(part, u, v) {
  const az = (u - 0.5) * Math.PI * 2;
  const r = part.r;
  const len = part.b[1] - part.a[1];
  const L = r * Math.PI + Math.abs(len);
  const s = v * L;
  const qa = (r * Math.PI) / 2;
  let y;
  let ring;
  let ny;
  if (s <= qa) {
    const f = s / qa; // casquete de abajo
    y = part.a[1] - r * Math.cos((f * Math.PI) / 2);
    ring = r * Math.sin((f * Math.PI) / 2);
    ny = -Math.cos((f * Math.PI) / 2);
  } else if (s <= qa + Math.abs(len)) {
    y = part.a[1] + (len >= 0 ? s - qa : -(s - qa));
    ring = r;
    ny = 0;
  } else {
    const f = (s - qa - Math.abs(len)) / qa; // casquete de arriba
    y = part.b[1] + r * Math.sin((f * Math.PI) / 2);
    ring = r * Math.cos((f * Math.PI) / 2);
    ny = Math.sin((f * Math.PI) / 2);
  }
  const sa = Math.sin(az);
  const ca = Math.cos(az);
  const nr = Math.sqrt(Math.max(0, 1 - ny * ny));
  return { x: ring * sa, y, z: ring * ca, nx: nr * sa, ny, nz: nr * ca };
}

function sphereLocal(part, u, v) {
  const az = (u - 0.5) * Math.PI * 2;
  const pol = Math.PI * v; // 0 abajo → π arriba
  const y = -Math.cos(pol);
  const ring = Math.sin(pol);
  const nx = ring * Math.sin(az);
  const nz = ring * Math.cos(az);
  return { x: part.c[0] + part.r * nx, y: part.c[1] + part.r * y, z: part.c[2] + part.r * nz, nx, ny: y, nz };
}

// caras de la caja en una grilla 3×2 del rect: [frente+Z, atrás-Z, +X] / [-X, arriba+Y, abajo-Y]
const BOX_FACES = [
  { n: [0, 0, 1], cell: [0, 0] },
  { n: [0, 0, -1], cell: [1, 0] },
  { n: [1, 0, 0], cell: [2, 0] },
  { n: [-1, 0, 0], cell: [0, 1] },
  { n: [0, 1, 0], cell: [1, 1] },
  { n: [0, -1, 0], cell: [2, 1] },
];
function boxFaceUv(face, fu, fv) {
  // (fu, fv) ∈ [0,1] dentro de la cara → (u, v) dentro del rect de la parte
  const u = (face.cell[0] + fu) / 3;
  const v = 1 - (face.cell[1] + fv) / 2;
  return [u, v];
}

/** Malla de una parte: { pos, nor, uv, idx } con las UV ya en el atlas (0..1 del atlas entero). */
export function partMesh(partIndex, radial = 12, rows = 8) {
  const part = PARTS[partIndex];
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const [rx, ry, rw, rh] = part.rect;
  const toAtlas = (u, v) => [(rx + u * rw) / ATLAS, 1 - (ry + (1 - v) * rh) / ATLAS];
  if (part.shape === 'box') {
    const [sx, sy, sz] = part.s;
    const h = [sx / 2, sy / 2, sz / 2];
    for (const face of BOX_FACES) {
      const n = face.n;
      const ax = n[0] ? [0, 0, -n[0]] : [1, 0, 0]; // eje "fu"
      const ay = n[1] ? [0, 0, 1] : [0, 1, 0]; // eje "fv"
      const base = pos.length / 3;
      for (let j = 0; j < 4; j++) {
        const fu = j === 1 || j === 2 ? 1 : 0;
        const fv = j >= 2 ? 1 : 0;
        const px = part.c[0] + n[0] * h[0] + ax[0] * h[0] * 2 * (fu - 0.5) + ay[0] * h[0] * 2 * (fv - 0.5);
        const py = part.c[1] + n[1] * h[1] + ax[1] * h[1] * 2 * (fu - 0.5) + ay[1] * h[1] * 2 * (fv - 0.5);
        const pz = part.c[2] + n[2] * h[2] + ax[2] * h[2] * 2 * (fu - 0.5) + ay[2] * h[2] * 2 * (fv - 0.5);
        pos.push(px, py, pz);
        nor.push(n[0], n[1], n[2]);
        const [u, v] = boxFaceUv(face, fu, fv);
        uv.push(...toAtlas(u, v));
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return { pos, nor, uv, idx };
  }
  const local = part.shape === 'sph' ? sphereLocal : capsuleLocal;
  for (let iv = 0; iv <= rows; iv++) {
    const v = iv / rows;
    for (let iu = 0; iu <= radial; iu++) {
      const u = iu / radial;
      const q = local(part, u === 1 ? 0.999999 : u, Math.min(0.999999, Math.max(0.000001, v)));
      pos.push(q.x, q.y, q.z);
      nor.push(q.nx, q.ny, q.nz);
      uv.push(...toAtlas(u, v));
    }
  }
  const cols = radial + 1;
  for (let iv = 0; iv < rows; iv++)
    for (let iu = 0; iu < radial; iu++) {
      const a = iv * cols + iu;
      idx.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
    }
  return { pos, nor, uv, idx };
}

// ---------------------------------------------------------------- muestreo y raycast del cuerpo

/**
 * Puntos de la superficie del cuerpo en el mundo (para el camuflaje y la proyección de los bots).
 * `du`/`dv` son los pasos en texels del atlas. Devuelve [{ x,y,z, nx,ny,nz, tx,ty, part }].
 */
export function sampleBody(state, du = 3, dv = 3) {
  const tf = transforms(state).parts;
  const out = [];
  PARTS.forEach((part, pi) => {
    const [rx, ry, rw, rh] = part.rect;
    const t = tf[pi];
    for (let ty = ry; ty < ry + rh; ty += dv)
      for (let tx = rx; tx < rx + rw; tx += du) {
        const [u, v] = texelToUv(part, tx, ty);
        const q = part.shape === 'sph' ? sphereLocal(part, u, v) : part.shape === 'cap' ? capsuleLocal(part, u, v) : boxLocal(part, u, v);
        if (!q) continue;
        const p = matVec(t.m, q.x, q.y, q.z);
        const n = matVec(t.m, q.nx, q.ny, q.nz);
        out.push({ x: t.p[0] + p[0], y: t.p[1] + p[1], z: t.p[2] + p[2], nx: n[0], ny: n[1], nz: n[2], tx, ty, part: pi });
      }
  });
  return out;
}

function boxLocal(part, u, v) {
  const cu = Math.min(2, Math.floor(u * 3));
  const cv = v > 0.5 ? 0 : 1;
  const face = BOX_FACES.find((f) => f.cell[0] === cu && f.cell[1] === cv);
  const fu = u * 3 - cu;
  const fv = (1 - v) * 2 - cv;
  const n = face.n;
  const h = [part.s[0] / 2, part.s[1] / 2, part.s[2] / 2];
  const ax = n[0] ? [0, 0, -n[0]] : [1, 0, 0];
  const ay = n[1] ? [0, 0, 1] : [0, 1, 0];
  return {
    x: part.c[0] + n[0] * h[0] + ax[0] * h[0] * 2 * (fu - 0.5) + ay[0] * h[0] * 2 * (fv - 0.5),
    y: part.c[1] + n[1] * h[1] + ax[1] * h[1] * 2 * (fu - 0.5) + ay[1] * h[1] * 2 * (fv - 0.5),
    z: part.c[2] + n[2] * h[2] + ax[2] * h[2] * 2 * (fu - 0.5) + ay[2] * h[2] * 2 * (fv - 0.5),
    nx: n[0],
    ny: n[1],
    nz: n[2],
  };
}

/** Rayo contra el cuerpo: devuelve { t, part, u, v, tx, ty } del choque más cercano o null. */
export function raycastBody(state, ox, oy, oz, dx, dy, dz, maxT = Infinity) {
  const tf = transforms(state).parts;
  let best = null;
  PARTS.forEach((part, pi) => {
    const t = tf[pi];
    // rayo al espacio local de la parte
    const lo = matTVec(t.m, ox - t.p[0], oy - t.p[1], oz - t.p[2]);
    const ld = matTVec(t.m, dx, dy, dz);
    let hit = null;
    if (part.shape === 'sph') hit = raySphere(lo, ld, part.c, part.r);
    else if (part.shape === 'cap') hit = rayCapsule(lo, ld, part);
    else hit = rayPartBox(lo, ld, part);
    if (hit && hit.t >= 0 && hit.t < (best?.t ?? maxT)) {
      const [tx, ty] = uvToTexel(part, hit.u, hit.v);
      best = { t: hit.t, part: pi, u: hit.u, v: hit.v, tx, ty };
    }
  });
  return best;
}

function raySphere(o, d, c, r) {
  const ox = o[0] - c[0];
  const oy = o[1] - c[1];
  const oz = o[2] - c[2];
  const a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  const b = 2 * (ox * d[0] + oy * d[1] + oz * d[2]);
  const k = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - 4 * a * k;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0) return null;
  const px = ox + d[0] * t;
  const py = oy + d[1] * t;
  const pz = oz + d[2] * t;
  const u = 0.5 + Math.atan2(px, pz) / (Math.PI * 2);
  const v = Math.acos(Math.max(-1, Math.min(1, -py / r))) / Math.PI;
  return { t, u: ((u % 1) + 1) % 1, v };
}

function rayCapsule(o, d, part) {
  const r = part.r;
  const ay = Math.min(part.a[1], part.b[1]);
  const by = Math.max(part.a[1], part.b[1]);
  let best = null;
  // cilindro infinito en XZ
  const a = d[0] * d[0] + d[2] * d[2];
  if (a > 1e-12) {
    const b = 2 * (o[0] * d[0] + o[2] * d[2]);
    const k = o[0] * o[0] + o[2] * o[2] - r * r;
    const disc = b * b - 4 * a * k;
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      const y = o[1] + d[1] * t;
      if (t >= 0 && y >= ay && y <= by) best = { t, y, cap: 0 };
    }
  }
  for (const cy of [ay, by]) {
    const h = raySphere(o, d, [0, cy, 0], r);
    if (h && (!best || h.t < best.t)) best = { t: h.t, y: o[1] + d[1] * h.t, cap: cy === ay ? -1 : 1 };
  }
  if (!best) return null;
  const px = o[0] + d[0] * best.t;
  const py = best.y;
  const pz = o[2] + d[2] * best.t;
  const u = ((0.5 + Math.atan2(px, pz) / (Math.PI * 2)) % 1 + 1) % 1;
  // v por el perfil (casquete inferior, cilindro, casquete superior)
  const len = by - ay;
  const L = r * Math.PI + len;
  const qa = (r * Math.PI) / 2;
  let s;
  if (best.cap === -1) s = (qa * 2 * Math.acos(Math.max(-1, Math.min(1, (ay - py) / r)))) / Math.PI;
  else if (best.cap === 1) s = qa + len + (qa * 2 * Math.asin(Math.max(-1, Math.min(1, (py - by) / r)))) / Math.PI;
  else s = qa + (py - ay);
  return { t: best.t, u, v: Math.max(0, Math.min(1, s / L)) };
}

function rayPartBox(o, d, part) {
  const h = [part.s[0] / 2, part.s[1] / 2, part.s[2] / 2];
  let t0 = -Infinity;
  let t1 = Infinity;
  let axis = 0;
  for (let i = 0; i < 3; i++) {
    const oi = o[i] - part.c[i];
    if (Math.abs(d[i]) < 1e-12) {
      if (Math.abs(oi) > h[i]) return null;
      continue;
    }
    let ta = (-h[i] - oi) / d[i];
    let tb = (h[i] - oi) / d[i];
    if (ta > tb) {
      const tmp = ta;
      ta = tb;
      tb = tmp;
    }
    if (ta > t0) {
      t0 = ta;
      axis = i;
    }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  if (t0 < 0) return null;
  const p = [o[0] + d[0] * t0 - part.c[0], o[1] + d[1] * t0 - part.c[1], o[2] + d[2] * t0 - part.c[2]];
  const n = [0, 0, 0];
  n[axis] = p[axis] > 0 ? 1 : -1;
  const face = BOX_FACES.find((f) => f.n[0] === n[0] && f.n[1] === n[1] && f.n[2] === n[2]);
  const ax = n[0] ? [0, 0, -n[0]] : [1, 0, 0];
  const ay = n[1] ? [0, 0, 1] : [0, 1, 0];
  const fu = (p[0] * ax[0] + p[1] * ax[1] + p[2] * ax[2]) / (h[0] * (ax[0] !== 0 ? 1 : 0) + h[1] * (ax[1] !== 0 ? 1 : 0) + h[2] * (ax[2] !== 0 ? 1 : 0)) / 2 + 0.5;
  const fv = (p[0] * ay[0] + p[1] * ay[1] + p[2] * ay[2]) / (h[0] * (ay[0] !== 0 ? 1 : 0) + h[1] * (ay[1] !== 0 ? 1 : 0) + h[2] * (ay[2] !== 0 ? 1 : 0)) / 2 + 0.5;
  const [u, v] = boxFaceUv(face, Math.max(0, Math.min(1, fu)), Math.max(0, Math.min(1, fv)));
  return { t: t0, u, v };
}

/** El punto del cuerpo más cercano a (px,py,pz): { x,y,z, d } (para validar capturas). */
export function closestBodyPoint(state, px, py, pz) {
  const tf = transforms(state).parts;
  let best = null;
  PARTS.forEach((part, pi) => {
    const t = tf[pi];
    let ax;
    let bx;
    let r;
    if (part.shape === 'sph') {
      ax = bx = matVecAdd(t, part.c);
      r = part.r;
    } else if (part.shape === 'cap') {
      ax = matVecAdd(t, part.a);
      bx = matVecAdd(t, part.b);
      r = part.r;
    } else {
      ax = bx = matVecAdd(t, part.c);
      r = Math.max(part.s[0], part.s[1], part.s[2]) / 2;
    }
    const q = closestOnSeg(px, py, pz, ax, bx);
    const d = Math.max(0, Math.sqrt((px - q[0]) ** 2 + (py - q[1]) ** 2 + (pz - q[2]) ** 2) - r);
    if (!best || d < best.d) {
      // punto sobre la superficie, hacia quien pregunta
      const dd = Math.sqrt((px - q[0]) ** 2 + (py - q[1]) ** 2 + (pz - q[2]) ** 2) || 1;
      best = { d, x: q[0] + ((px - q[0]) / dd) * r, y: q[1] + ((py - q[1]) / dd) * r, z: q[2] + ((pz - q[2]) / dd) * r };
    }
  });
  return best;
}
const matVecAdd = (t, v) => {
  const r = matVec(t.m, v[0], v[1], v[2]);
  return [t.p[0] + r[0], t.p[1] + r[1], t.p[2] + r[2]];
};
function closestOnSeg(px, py, pz, a, b) {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 0 ? ((px - a[0]) * abx + (py - a[1]) * aby + (pz - a[2]) * abz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return [a[0] + abx * t, a[1] + aby * t, a[2] + abz * t];
}

/** Posición del centro de la cabeza en el mundo (origen del silbido, cartel del nombre). */
export function headPos(state) {
  const tf = transforms(state);
  const t = tf.parts[0];
  return matVecAdd(t, PARTS[0].c);
}
