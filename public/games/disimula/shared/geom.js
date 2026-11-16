/**
 * Disimulá — geometría compartida (JS puro, sin DOM ni three.js).
 * El mundo son cajas alineadas a los ejes ({ min:[x,y,z], max:[x,y,z] }), en metros.
 * La usan igual el cliente, el servidor y las pruebas: raycast, línea de visión,
 * altura del piso y caminar con deslizamiento (sin salto: se sube por escalones).
 */

export const STEP = 0.45; // alto máximo que se sube caminando (sillas → mesas en los mapas)
const EPS = 1e-4;

/** Rayo contra una caja (método de los planos). Devuelve [tIn, tOut] o null. */
export function rayBox(b, ox, oy, oz, dx, dy, dz) {
  let t0 = -Infinity;
  let t1 = Infinity;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < b.min[i] || o[i] > b.max[i]) return null;
    } else {
      let a = (b.min[i] - o[i]) / d[i];
      let c = (b.max[i] - o[i]) / d[i];
      if (a > c) {
        const tmp = a;
        a = c;
        c = tmp;
      }
      if (a > t0) t0 = a;
      if (c < t1) t1 = c;
      if (t0 > t1) return null;
    }
  }
  return [t0, t1];
}

/**
 * Rayo contra todas las cajas. Devuelve el choque más cercano
 * { t, x, y, z, nx, ny, nz, box } o null. Ignora cajas con `ghost` (decorado sin colisión).
 */
export function rayBoxes(boxes, ox, oy, oz, dx, dy, dz, maxT = Infinity) {
  let best = null;
  let bestT = maxT;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.ghost) continue;
    const hit = rayBox(b, ox, oy, oz, dx, dy, dz);
    if (!hit) continue;
    const t = hit[0] >= 0 ? hit[0] : hit[1] >= 0 ? 0 : -1; // desde adentro cuenta como t=0
    if (t < 0 || t >= bestT) continue;
    bestT = t;
    best = b;
  }
  if (!best) return null;
  const x = ox + dx * bestT;
  const y = oy + dy * bestT;
  const z = oz + dz * bestT;
  // normal: la cara más cercana al punto de choque
  let nx = 0;
  let ny = 0;
  let nz = 0;
  const dxs = [Math.abs(x - best.min[0]), Math.abs(x - best.max[0]), Math.abs(y - best.min[1]), Math.abs(y - best.max[1]), Math.abs(z - best.min[2]), Math.abs(z - best.max[2])];
  let k = 0;
  for (let i = 1; i < 6; i++) if (dxs[i] < dxs[k]) k = i;
  if (k === 0) nx = -1;
  else if (k === 1) nx = 1;
  else if (k === 2) ny = -1;
  else if (k === 3) ny = 1;
  else if (k === 4) nz = -1;
  else nz = 1;
  return { t: bestT, x, y, z, nx, ny, nz, box: best };
}

/** ¿El segmento a→b está libre de cajas? (línea de visión). `pad` recorta las puntas. */
export function segmentClear(boxes, ax, ay, az, bx, by, bz, pad = 0.01) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < EPS) return true;
  const inv = 1 / len;
  const hit = rayBoxes(boxes, ax + dx * inv * pad, ay + dy * inv * pad, az + dz * inv * pad, dx * inv, dy * inv, dz * inv, len - pad * 2);
  return !hit;
}

/** ¿El punto (x,z) está dentro de la caja expandida `r` en horizontal? */
const inXZ = (b, x, z, r) => x > b.min[0] - r && x < b.max[0] + r && z > b.min[2] - r && z < b.max[2] + r;

/**
 * Altura del piso en (x,z) para alguien parado en y: el techo de caja más alto
 * que quede a su alcance (hasta STEP por encima de los pies). null si no hay piso.
 */
export function groundAt(boxes, x, z, y, r = 0.12) {
  let top = null;
  for (const b of boxes) {
    if (b.ghost || !inXZ(b, x, z, r)) continue;
    const t = b.max[1];
    if (t <= y + STEP + 0.001 && (top === null || t > top)) top = t;
  }
  return top;
}

/** ¿La cápsula (pies en pos, radio r, alto h) penetra alguna caja? Ignora lo que queda bajo los pies (escalón). */
export function capsuleHits(boxes, x, y, z, r, h) {
  for (const b of boxes) {
    if (b.ghost) continue;
    if (b.max[1] <= y + STEP) continue; // por debajo: se pisa
    if (b.min[1] >= y + h) continue; // por encima de la cabeza
    if (inXZ(b, x, z, r)) return b;
  }
  return null;
}

/** ¿Es un lugar válido para estar parado? (sin penetrar nada, con piso y dentro de los límites). */
export function validSpot(map, x, y, z, r = 0.3, h = 1.0) {
  const bb = map.bounds;
  if (x < bb.min[0] + r || x > bb.max[0] - r || z < bb.min[2] + r || z > bb.max[2] - r) return false;
  if (capsuleHits(map.boxes, x, y, z, r, h)) return false;
  const g = groundAt(map.boxes, x, z, y + 0.01);
  return g !== null && Math.abs(g - y) <= STEP;
}

/**
 * Camina con deslizamiento: intenta mover (dx, dz), resuelve choques eje por eje,
 * sube escalones de hasta STEP y pega los pies al piso. Modifica y devuelve `pos`.
 */
export function walk(map, pos, dx, dz, r = 0.3, h = 1.55) {
  const boxes = map.boxes;
  const bb = map.bounds;
  const tryAxis = (nx, nz) => {
    const px = pos.x + nx;
    const pz = pos.z + nz;
    const b = capsuleHits(boxes, px, pos.y, pz, r, h);
    if (!b) {
      pos.x = px;
      pos.z = pz;
      return;
    }
    // ¿se puede subir como escalón? (la caja es baja y arriba queda libre)
    const stepY = b.max[1];
    if (stepY <= pos.y + STEP + 0.001 && stepY < bb.max[1] && !capsuleHits(boxes, px, stepY + 0.001, pz, r, h)) {
      pos.x = px;
      pos.z = pz;
      pos.y = stepY;
      return;
    }
    // deslizar: empuja fuera de la caja solo en el eje que se movió
    if (nx) pos.x = nx > 0 ? b.min[0] - r - EPS : b.max[0] + r + EPS;
    if (nz) pos.z = nz > 0 ? b.min[2] - r - EPS : b.max[2] + r + EPS;
    if (capsuleHits(boxes, pos.x, pos.y, pos.z, r, h)) {
      // quedó dentro de otra caja (esquina): no se mueve en este eje
      if (nx) pos.x = px - nx;
      if (nz) pos.z = pz - nz;
    }
  };
  tryAxis(dx, 0);
  tryAxis(0, dz);
  pos.x = Math.min(bb.max[0] - r, Math.max(bb.min[0] + r, pos.x));
  pos.z = Math.min(bb.max[2] - r, Math.max(bb.min[2] + r, pos.z));
  const g = groundAt(boxes, pos.x, pos.z, pos.y + 0.01, r * 0.5);
  if (g !== null) pos.y = g;
  return pos;
}

/** El punto válido más cercano a (x,y,z) entre una lista de candidatos [[x,y,z], …]. */
export function nearestSpot(map, x, y, z, candidates) {
  let best = null;
  let bd = Infinity;
  for (const c of candidates) {
    if (!validSpot(map, c[0], c[1], c[2])) continue;
    const d = (c[0] - x) ** 2 + (c[1] - y) ** 2 + (c[2] - z) ** 2;
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/** Distancia de un punto a un segmento (para la cápsula del cuerpo). */
export function distPointSeg(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 0 ? ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const x = ax + abx * t;
  const y = ay + aby * t;
  const z = az + abz * t;
  return Math.sqrt((px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2);
}

/** Generador determinista (mulberry32) compartido por bots, patrones y pruebas. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash determinista de enteros → [0,1) (ruido de los patrones). */
export function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
