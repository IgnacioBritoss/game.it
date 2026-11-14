/**
 * Golfazo — física de la pelota. El mismo archivo corre en el navegador y en el servidor.
 *
 * Es determinista: paso fijo de 1/120 s (con subpasos según la velocidad) y solo + − × ÷ √ más la trigonometría de
 * dmath.js. Con el mismo hoyo, la misma pelota y los mismos golpes (ángulo, fuerza y tick en que se pega) el recorrido
 * es idéntico bit a bit en cualquier navegador y en Node. Por eso online alcanza con mandar el golpe: cada cliente lo
 * simula al instante y el servidor lo repite para decidir el resultado oficial.
 *
 * El mundo (lo arma build.js) tiene:
 *   tris   triángulos del piso (solo apoyan de cara; con normales suaves en lomas, rampas y rulos)
 *   boxes  cajas orientadas (bordes, bloques); las paredes en cadena comparten normal en las juntas
 *   cyls   cilindros verticales (postes y rebotadores)
 *   rims   aristas de cornisas sin baranda (la pelota rueda por el borde y se cae)
 *   movers obstáculos que se mueven: su pose es una función pura del tiempo del hoyo (giran, van y vienen, se hamacan)
 *   zones  superficies (arena, hielo), agua/lava, aceleradores, resortes, viento, cintas, tubos
 *   cup    el hoyo, resuelto de forma analítica (borde, pared y fondo): la pelota entra, hace la corbata o pasa de largo
 *
 * Ejes: x a la derecha, y hacia arriba, z hacia adelante (los de three.js). Unidades ≈ metros; la pelota mide 10 cm de radio.
 */
import { dsin, dcos, TAU, PI } from './dmath.js';

export const HZ = 120;
export const DT = 1 / HZ;
export const R = 0.1;
export const GRAV = 14;
export const VMIN = 0.5;
export const VMAX = 20;
export const CUP_R = 0.21;
export const CUP_DEPTH = 0.3;
export const ANGLES = 65536; // el ángulo del golpe viaja como entero 0..65535
export const POWERS = 1000; // y la fuerza como entero 1..1000
export const MAX_FLIGHT = 25 * HZ; // si en 25 s no se queda quieta, vuelve al lugar del tiro

/** Estados de la pelota. */
export const SLEEP = 0; // quieta sobre piso firme: no hace falta simularla
export const MOVE = 1; // en movimiento (o quieta arriba de algo que se mueve)
export const HOLED = 2; // adentro del hoyo
export const PIPE = 3; // viajando por un tubo

const SLOP = 0.002; // penetración que se tolera: el apoyo queda "pegado" y no vibra
const BACK = 0.75 * R; // un triángulo empuja hacia su cara aunque la pelota lo haya pasado un poco
const BOUNCE_MIN = 0.9; // por debajo de esta velocidad normal no rebota (se apoya)
const STILL_V = 0.06;
const STILL_TICKS = 30;
const MAX_SPEED = 45;
const SUB_LEN = 0.4 * R; // avance máximo por subpaso
const MAX_SUB = 12;
const RIM_POP = 2.2; // lo máximo que la hace saltar el borde del hoyo

/** Superficies: mu (freno constante = mu·g), drag (freno proporcional a la velocidad) y rest (rebote). */
export const SURF = { grass: 0, sand: 1, ice: 2, wood: 3, rough: 4, rubber: 5, stone: 6, wall: 7, metal: 8, bumper: 9, belt: 10, plat: 11, rim: 12 };
export const SURF_NAMES = Object.keys(SURF);
const S_MU = [0.045, 0.33, 0.012, 0.04, 0.12, 0.05, 0.04, 0.03, 0.03, 0.02, 0.25, 0.5, 0.03];
const S_DRAG = [0.55, 3.2, 0.12, 0.5, 1.5, 0.5, 0.45, 0, 0, 0, 6, 6, 0];
const S_REST = [0.38, 0.1, 0.3, 0.42, 0.22, 0.88, 0.45, 0.72, 0.6, 0.9, 0.3, 0.25, 0];

// ------------------------------------------------------------------ contactos (memoria fija: no se crea basura)
const C_MAX = 24;
const cnx = new Float64Array(C_MAX);
const cny = new Float64Array(C_MAX);
const cnz = new Float64Array(C_MAX);
const cpen = new Float64Array(C_MAX);
const cux = new Float64Array(C_MAX);
const cuy = new Float64Array(C_MAX);
const cuz = new Float64Array(C_MAX);
const crest = new Float64Array(C_MAX);
const ckick = new Float64Array(C_MAX);
const csurf = new Int32Array(C_MAX);
const cmov = new Int32Array(C_MAX); // 1 si el contacto es con algo que se mueve (o una cinta)
let cn = 0;

// resultado de la última prueba de forma
let Hnx = 0;
let Hny = 0;
let Hnz = 0;
let Hpen = 0;

let EV = null; // lista de eventos del paso en curso (sonidos y efectos); null en el servidor

function add(nx, ny, nz, pen, surf, rest, kick, ux, uy, uz, mov) {
  if (cn >= C_MAX) return;
  cnx[cn] = nx;
  cny[cn] = ny;
  cnz[cn] = nz;
  cpen[cn] = pen;
  csurf[cn] = surf;
  crest[cn] = rest;
  ckick[cn] = kick;
  cux[cn] = ux;
  cuy[cn] = uy;
  cuz[cn] = uz;
  cmov[cn] = mov;
  cn++;
}

// ------------------------------------------------------------------ formas
/** Triángulo de piso: solo de cara (si el centro se proyecta adentro). De un solo lado, con algo de "espesor" hacia atrás. */
function triHit(t, px, py, pz) {
  const dx = px - t.ax;
  const dy = py - t.ay;
  const dz = pz - t.az;
  const sd = dx * t.nx + dy * t.ny + dz * t.nz;
  if (sd >= R || sd < -BACK) return false;
  const d20 = dx * t.e1x + dy * t.e1y + dz * t.e1z;
  const d21 = dx * t.e2x + dy * t.e2y + dz * t.e2z;
  const v = (t.d11 * d20 - t.d01 * d21) * t.inv;
  const w = (t.d00 * d21 - t.d01 * d20) * t.inv;
  const u = 1 - v - w;
  if (u < -t.tu || v < -t.tv || w < -t.tw) return false;
  Hpen = R - sd;
  const sn = t.sn;
  if (sn) {
    // normal interpolada entre los vértices: las lomas y los rulos se sienten lisos aunque sean facetas
    const nx = u * sn[0] + v * sn[3] + w * sn[6];
    const ny = u * sn[1] + v * sn[4] + w * sn[7];
    const nz = u * sn[2] + v * sn[5] + w * sn[8];
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    Hnx = nx / l;
    Hny = ny / l;
    Hnz = nz / l;
  } else {
    Hnx = t.nx;
    Hny = t.ny;
    Hnz = t.nz;
  }
  return true;
}

/** Caja orientada (en el marco en que está definida). Las paredes en cadena no chocan con sus puntas unidas. */
function boxHit(b, px, py, pz) {
  const dx = px - b.cx;
  const dy = py - b.cy;
  const dz = pz - b.cz;
  const lx = dx * b.xx + dy * b.xy + dz * b.xz;
  const ly = dx * b.yx + dy * b.yy + dz * b.yz;
  const lz = dx * b.zx + dy * b.zy + dz * b.zz;
  const hx = b.hx;
  const hy = b.hy;
  const hz = b.hz;
  if ((b.j0 && lz < -hz) || (b.j1 && lz > hz)) return false;
  const qx = lx < -hx ? -hx : lx > hx ? hx : lx;
  const qy = ly < -hy ? -hy : ly > hy ? hy : ly;
  const qz = lz < -hz ? -hz : lz > hz ? hz : lz;
  const ex = lx - qx;
  const ey = ly - qy;
  const ez = lz - qz;
  const d2 = ex * ex + ey * ey + ez * ez;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  if (d2 > 0) {
    if (d2 >= R * R) return false;
    const d = Math.sqrt(d2);
    Hpen = R - d;
    nx = ex / d;
    ny = ey / d;
    nz = ez / d;
  } else {
    // el centro quedó adentro: sale por la cara más cercana
    const fx = hx - (lx < 0 ? -lx : lx);
    const fy = hy - (ly < 0 ? -ly : ly);
    const fz = b.j0 || b.j1 ? 1e9 : hz - (lz < 0 ? -lz : lz);
    if (fx <= fy && fx <= fz) {
      nx = lx < 0 ? -1 : 1;
      Hpen = R + fx;
    } else if (fy <= fz) {
      ny = ly < 0 ? -1 : 1;
      Hpen = R + fy;
    } else {
      nz = lz < 0 ? -1 : 1;
      Hpen = R + fz;
    }
  }
  if (b.sm && ny === 0 && nz === 0) {
    // cara lateral de una pared en cadena: la normal gira de a poco entre las dos juntas (curvas sin facetas)
    const k = (lz + hz) / (2 * hz);
    const sx = b.n0x + (b.n1x - b.n0x) * k;
    const sy = b.n0y + (b.n1y - b.n0y) * k;
    const sz = b.n0z + (b.n1z - b.n0z) * k;
    const l = Math.sqrt(sx * sx + sy * sy + sz * sz);
    const sg = nx < 0 ? 1 : -1; // n0/n1 apuntan hacia la cancha (cara −X)
    Hnx = (sx / l) * sg;
    Hny = (sy / l) * sg;
    Hnz = (sz / l) * sg;
    return true;
  }
  Hnx = nx * b.xx + ny * b.yx + nz * b.zx;
  Hny = nx * b.xy + ny * b.yy + nz * b.zy;
  Hnz = nx * b.xz + ny * b.yz + nz * b.zz;
  return true;
}

/** Cilindro vertical: costado, tapa y el borde de la tapa. */
function cylHit(c, px, py, pz) {
  if (py >= c.y1 + R || py <= c.y0) return false;
  const dx = px - c.x;
  const dz = pz - c.z;
  const d2 = dx * dx + dz * dz;
  const rr = c.r + R;
  if (d2 >= rr * rr) return false;
  const d = Math.sqrt(d2);
  if (py <= c.y1) {
    const side = rr - d;
    const top = c.y1 - py + R;
    if (d < c.r && top < side) {
      Hnx = 0;
      Hny = 1;
      Hnz = 0;
      Hpen = top;
    } else if (d > 0) {
      Hnx = dx / d;
      Hny = 0;
      Hnz = dz / d;
      Hpen = side;
    } else {
      Hnx = 1;
      Hny = 0;
      Hnz = 0;
      Hpen = side;
    }
    return true;
  }
  const ey = py - c.y1;
  if (d <= c.r) {
    Hnx = 0;
    Hny = 1;
    Hnz = 0;
    Hpen = R - ey;
    return true;
  }
  const ex = d - c.r;
  const e2 = ex * ex + ey * ey;
  if (e2 >= R * R) return false;
  const e = Math.sqrt(e2);
  Hnx = ((dx / d) * ex) / e;
  Hny = ey / e;
  Hnz = ((dz / d) * ex) / e;
  Hpen = R - e;
  return true;
}

/** Arista de cornisa: solo cuenta cuando el centro ya pasó el borde (del lado de afuera). */
function rimHit(s, px, py, pz) {
  const dx = px - s.ax;
  const dy = py - s.ay;
  const dz = pz - s.az;
  let t = (dx * s.ex + dy * s.ey + dz * s.ez) * s.il;
  if (t <= 0) {
    if (s.j0) return false;
    t = 0;
  } else if (t >= 1) {
    if (s.j1) return false;
    t = 1;
  }
  const qx = dx - s.ex * t;
  const qy = dy - s.ey * t;
  const qz = dz - s.ez * t;
  if (qx * s.ox + qz * s.oz <= 0) return false;
  const d2 = qx * qx + qy * qy + qz * qz;
  if (d2 >= R * R || d2 === 0) return false;
  const d = Math.sqrt(d2);
  Hnx = qx / d;
  Hny = qy / d;
  Hnz = qz / d;
  Hpen = R - d;
  return true;
}

const inZone = (zn, px, pz) => {
  const dx = px - zn.x;
  const dz = pz - zn.z;
  if (zn.r) return dx * dx + dz * dz < zn.r * zn.r;
  const lx = dx * zn.ux + dz * zn.uz;
  const lz = dx * zn.vx + dz * zn.vz;
  return lx > -zn.hw && lx < zn.hw && lz > -zn.hd && lz < zn.hd;
};

// ------------------------------------------------------------------ obstáculos que se mueven
/**
 * Pose de un móvil en el segundo `t` del hoyo. Deja en el propio objeto la matriz de giro (m00…m22), el
 * desplazamiento (tx,ty,tz), la velocidad angular (om, alrededor de su eje) y la lineal (lvx,lvy,lvz).
 * La usan la física y el dibujo (así lo que se ve es exactamente lo que choca).
 */
export function pose(m, t) {
  if (m.tq === t) return m;
  m.tq = t;
  if (m.rot) {
    let th;
    if (m.rot === 1) {
      th = m.ph + m.w * t;
      m.om = m.w;
    } else {
      const a = m.ph + m.w * t;
      th = m.amp * dsin(a);
      m.om = m.amp * m.w * dcos(a);
    }
    m.th = th;
    const c = dcos(th);
    const s = dsin(th);
    const k = 1 - c;
    const ax = m.ax;
    const ay = m.ay;
    const az = m.az;
    m.m00 = c + k * ax * ax;
    m.m01 = k * ax * ay - s * az;
    m.m02 = k * ax * az + s * ay;
    m.m10 = k * ay * ax + s * az;
    m.m11 = c + k * ay * ay;
    m.m12 = k * ay * az - s * ax;
    m.m20 = k * az * ax - s * ay;
    m.m21 = k * az * ay + s * ax;
    m.m22 = c + k * az * az;
  }
  if (m.lin) {
    let sl;
    let sv;
    if (m.lin === 1) {
      const a = TAU * (t / m.per + m.lph);
      sl = 0.5 - 0.5 * dcos(a);
      sv = (PI / m.per) * dsin(a);
    } else {
      const x = t / m.per + m.lph;
      const u = x - Math.floor(x);
      if (u < m.h0) {
        sl = 0;
        sv = 0;
      } else if (u < m.h0 + m.go) {
        const q = (u - m.h0) / m.go;
        sl = q * q * (3 - 2 * q);
        sv = (6 * q * (1 - q)) / (m.go * m.per);
      } else if (u < m.h0 + m.go + m.h1) {
        sl = 1;
        sv = 0;
      } else {
        const q = (u - m.h0 - m.go - m.h1) / m.back;
        sl = 1 - q * q * (3 - 2 * q);
        sv = (-6 * q * (1 - q)) / (m.back * m.per);
      }
    }
    m.sl = sl;
    m.tx = m.dx * sl;
    m.ty = m.dy * sl;
    m.tz = m.dz * sl;
    m.lvx = m.dx * sv;
    m.lvy = m.dy * sv;
    m.lvz = m.dz * sv;
  }
  return m;
}

function hitMover(m, t, px, py, pz) {
  pose(m, t);
  // la pelota en el marco del móvil
  const dx = px - m.px - m.tx;
  const dy = py - m.py - m.ty;
  const dz = pz - m.pz - m.tz;
  let lx = dx;
  let ly = dy;
  let lz = dz;
  if (m.rot) {
    lx = m.m00 * dx + m.m10 * dy + m.m20 * dz;
    ly = m.m01 * dx + m.m11 * dy + m.m21 * dz;
    lz = m.m02 * dx + m.m12 * dy + m.m22 * dz;
  }
  const bs = m.boxes;
  const cs = m.cyls;
  const nb = bs.length;
  for (let i = 0, n = nb + cs.length; i < n; i++) {
    const sh = i < nb ? bs[i] : cs[i - nb];
    if (!(i < nb ? boxHit(sh, lx, ly, lz) : cylHit(sh, lx, ly, lz))) continue;
    let nx = Hnx;
    let ny = Hny;
    let nz = Hnz;
    if (m.rot) {
      nx = m.m00 * Hnx + m.m01 * Hny + m.m02 * Hnz;
      ny = m.m10 * Hnx + m.m11 * Hny + m.m12 * Hnz;
      nz = m.m20 * Hnx + m.m21 * Hny + m.m22 * Hnz;
    }
    // velocidad del punto de contacto (para que empuje y arrastre)
    const k = R - Hpen;
    const rx = dx - nx * k;
    const ry = dy - ny * k;
    const rz = dz - nz * k;
    let ux = m.lvx;
    let uy = m.lvy;
    let uz = m.lvz;
    if (m.rot) {
      const wx = m.ax * m.om;
      const wy = m.ay * m.om;
      const wz = m.az * m.om;
      ux += wy * rz - wz * ry;
      uy += wz * rx - wx * rz;
      uz += wx * ry - wy * rx;
    }
    add(nx, ny, nz, Hpen, sh.surf, sh.rest, sh.kick, ux, uy, uz, 1);
  }
}

// ------------------------------------------------------------------ el hoyo
function hitCup(w, px, py, pz) {
  const c = w.cup;
  const dx = px - c.x;
  const dz = pz - c.z;
  const d2 = dx * dx + dz * dz;
  if (d2 >= CUP_R * CUP_R || py >= c.y + R) return;
  const d = Math.sqrt(d2);
  if (py >= c.y) {
    // todavía arriba: se apoya en el borde (un aro)
    if (d <= 0) return;
    const ex = CUP_R - d;
    const ey = py - c.y;
    const e2 = ex * ex + ey * ey;
    if (e2 >= R * R) return;
    const e = Math.sqrt(e2);
    add((-dx / d) * (ex / e), ey / e, (-dz / d) * (ex / e), R - e, SURF.rim, 0, 0, 0, 0, 0, 0);
    return;
  }
  const gap = CUP_R - d;
  if (gap < R && d > 0) add(-dx / d, 0, -dz / d, R - gap, SURF.metal, 0.3, 0, 0, 0, 0, 0);
  const yb = c.y - CUP_DEPTH;
  if (py - yb < R) add(0, 1, 0, R - (py - yb), SURF.sand, 0.1, 0, 0, 0, 0, 0);
}

// ------------------------------------------------------------------ choque contra todo el mundo
function collide(w, s, t) {
  cn = 0;
  const px = s.x;
  const py = s.y;
  const pz = s.z;
  const g = w.grid;
  const q = ++w.q;
  let ix0 = Math.floor((px - R - g.x0) * g.inv);
  let ix1 = Math.floor((px + R - g.x0) * g.inv);
  let iz0 = Math.floor((pz - R - g.z0) * g.inv);
  let iz1 = Math.floor((pz + R - g.z0) * g.inv);
  if (ix0 < 0) ix0 = 0;
  if (iz0 < 0) iz0 = 0;
  if (ix1 >= g.nx) ix1 = g.nx - 1;
  if (iz1 >= g.nz) iz1 = g.nz - 1;
  const cup = w.cup;
  const zs = w.zones;
  for (let iz = iz0; iz <= iz1; iz++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const cell = g.cells[iz * g.nx + ix];
      if (!cell) continue;
      for (let i = 0; i < cell.length; i++) {
        const p = cell[i];
        if (p.q === q) continue;
        p.q = q;
        if (px + R <= p.x0 || px - R >= p.x1 || py + R <= p.y0 || py - R >= p.y1 || pz + R <= p.z0 || pz - R >= p.z1) continue;
        switch (p.t) {
          case 0: {
            if (p.cup) {
              const dx = px - cup.x;
              const dz = pz - cup.z;
              if (dx * dx + dz * dz < CUP_R * CUP_R) break; // ahí no hay piso: es la boca del hoyo
            }
            if (!triHit(p, px, py, pz)) break;
            let surf = p.surf;
            let ux = 0;
            let uz = 0;
            let mov = 0;
            // parches (arena, hielo…) y cintas pintados sobre el piso
            for (let k = 0; k < zs.surf.length; k++) {
              const zn = zs.surf[k];
              if (py - zn.y < 3 * R && py - zn.y > -R && inZone(zn, px, pz)) surf = zn.surf;
            }
            for (let k = 0; k < zs.conv.length; k++) {
              const zn = zs.conv[k];
              if (py - zn.y < 3 * R && py - zn.y > -R && inZone(zn, px, pz)) {
                if (zn.om) {
                  ux = zn.om * (pz - zn.z);
                  uz = -zn.om * (px - zn.x);
                } else {
                  ux = zn.cx;
                  uz = zn.cz;
                }
                surf = SURF.belt;
                mov = 1;
              }
            }
            add(Hnx, Hny, Hnz, Hpen, surf, S_REST[surf], 0, ux, 0, uz, mov);
            break;
          }
          case 1:
            if (boxHit(p, px, py, pz)) add(Hnx, Hny, Hnz, Hpen, p.surf, p.rest, p.kick, 0, 0, 0, 0);
            break;
          case 2:
            if (cylHit(p, px, py, pz)) add(Hnx, Hny, Hnz, Hpen, p.surf, p.rest, p.kick, 0, 0, 0, 0);
            break;
          default:
            if (rimHit(p, px, py, pz)) add(Hnx, Hny, Hnz, Hpen, p.surf, S_REST[p.surf], 0, 0, 0, 0, 0);
        }
      }
    }
  }
  const ms = w.movers;
  for (let i = 0; i < ms.length; i++) {
    const z = ms[i].zone;
    if (px + R > z.x0 && px - R < z.x1 && py + R > z.y0 && py - R < z.y1 && pz + R > z.z0 && pz - R < z.z1) hitMover(ms[i], t, px, py, pz);
  }
  hitCup(w, px, py, pz);
  return cn;
}

function substep(w, s, t, dt) {
  s.vy -= GRAV * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.z += s.vz * dt;
  s.g = 0;
  let deep = 0;
  for (let it = 0; it < 3; it++) {
    const n = collide(w, s, t);
    if (!n) break;
    deep = 0;
    let touchedMover = 0;
    // lo que ya se corrió en esta pasada: cada contacto descuenta lo que los anteriores ya la sacaron
    let mx = 0;
    let my = 0;
    let mz = 0;
    for (let i = 0; i < n; i++) {
      const nx = cnx[i];
      const ny = cny[i];
      const nz = cnz[i];
      const pen = cpen[i];
      if (pen > deep) deep = pen;
      const push = pen - SLOP - (mx * nx + my * ny + mz * nz);
      if (push > 0) {
        mx += nx * push;
        my += ny * push;
        mz += nz * push;
        s.x += nx * push;
        s.y += ny * push;
        s.z += nz * push;
      }
      if (cmov[i]) touchedMover = 1;
      const rvx = s.vx - cux[i];
      const rvy = s.vy - cuy[i];
      const rvz = s.vz - cuz[i];
      const vn = rvx * nx + rvy * ny + rvz * nz;
      if (vn < 0) {
        const surf = csurf[i];
        let j = -vn > BOUNCE_MIN ? -(1 + crest[i]) * vn : -vn;
        if (ckick[i] > 0 && -vn > 0.5 && j < ckick[i] - vn) j = ckick[i] - vn; // rebotador: siempre devuelve con ganas
        const tx = rvx - vn * nx;
        const ty = rvy - vn * ny;
        const tz = rvz - vn * nz;
        s.vx += j * nx;
        s.vy += j * ny;
        s.vz += j * nz;
        if (surf === SURF.rim && s.vy > RIM_POP) s.vy = RIM_POP;
        const vt = Math.sqrt(tx * tx + ty * ty + tz * tz);
        if (vt > 1e-9) {
          // roce: el freno constante sale de la fuerza de apoyo; el proporcional, de la superficie
          let dv = S_MU[surf] * j + S_DRAG[surf] * vt * dt;
          if (dv > vt) dv = vt;
          const k = dv / vt;
          s.vx -= tx * k;
          s.vy -= ty * k;
          s.vz -= tz * k;
        }
        if (EV && -vn > 1.1) EV.push({ t: ckick[i] > 0 ? 'bumper' : 'hit', k: s.k, x: s.x, y: s.y, z: s.z, v: -vn, s: surf, wall: ny < 0.5 ? 1 : 0, nx, ny, nz });
      }
      if (ny > 0.5) {
        // apoyo: se recuerda la normal y a qué velocidad va el piso (plataformas, cintas)
        s.g = 1;
        s.gnx = nx;
        s.gny = ny;
        s.gnz = nz;
        s.gux = cux[i];
        s.guy = cuy[i];
        s.guz = cuz[i];
        s.gmov = cmov[i];
        s.gsurf = csurf[i];
      }
    }
    if (n < 2 && deep < 0.3 * R) break;
    if (it === 2 && touchedMover && deep > 0.6 * R) s.sq = 1; // quedó apretada entre un móvil y algo más
  }
}

function emit(type, s, v) {
  if (EV) EV.push({ t: type, k: s.k, x: s.x, y: s.y, z: s.z, v: v || 0 });
}

/** La pelota vuelve al último lugar firme donde estuvo quieta. `pen` suma un golpe de multa. */
function reset(s, why, pen) {
  emit(why, s, 0);
  s.x = s.sx;
  s.y = s.sy;
  s.z = s.sz;
  s.vx = 0;
  s.vy = 0;
  s.vz = 0;
  s.mode = MOVE;
  s.settled = 0;
  s.still = 0;
  s.flight = 0;
  s.sq = 0;
  s.sqn = 0;
  s.resets++;
  if (pen) s.pens++;
  emit('reset', s, 0);
}

/** Avanza un tick (1/120 s). `ev` (opcional) junta los eventos para sonidos y efectos. */
export function step(w, s, ev) {
  if (s.mode === SLEEP || s.mode === HOLED) {
    s.k++;
    return;
  }
  EV = ev || null;
  const zs = w.zones;
  if (s.mode === PIPE) {
    s.k++;
    if (--s.pipeT <= 0) {
      const p = zs.portal[s.pipe];
      s.x = p.bx;
      s.y = p.by + R;
      s.z = p.bz;
      s.vx = p.dx * s.pipeV;
      s.vy = p.dy * s.pipeV;
      s.vz = p.dz * s.pipeV;
      s.mode = MOVE;
      s.pipe = -1;
      emit('pipeOut', s, s.pipeV);
    }
    EV = null;
    return;
  }

  // zonas que empujan: viento (también en el aire) y aceleradores (solo apoyada)
  for (let i = 0; i < zs.wind.length; i++) {
    const zn = zs.wind[i];
    if (s.y > zn.y0 && s.y < zn.y1 && inZone(zn, s.x, s.z)) {
      s.vx += zn.fx * DT;
      s.vy += zn.fy * DT;
      s.vz += zn.fz * DT;
    }
  }
  if (s.air < 3) {
    for (let i = 0; i < zs.boost.length; i++) {
      const zn = zs.boost[i];
      if (s.y - zn.y < 3 * R && s.y - zn.y > -R && inZone(zn, s.x, s.z)) {
        const along = s.vx * zn.dx + s.vz * zn.dz;
        if (along < zn.speed) {
          let dv = zn.acc * DT;
          if (dv > zn.speed - along) dv = zn.speed - along;
          s.vx += zn.dx * dv;
          s.vz += zn.dz * dv;
          if (EV && !s.boosted) emit('boost', s, zn.speed);
          s.boosted = 6;
        }
      }
    }
    for (let i = 0; i < zs.spring.length; i++) {
      const zn = zs.spring[i];
      if (s.y - zn.y < 2 * R && s.y - zn.y > -R && s.vy < 1 && inZone(zn, s.x, s.z)) {
        s.vy = zn.up;
        s.vx += zn.dx;
        s.vz += zn.dz;
        emit('spring', s, zn.up);
      }
    }
  }
  if (s.boosted > 0) s.boosted--;

  // subpasos: nunca avanza más de 0,4 radios de una vez (no atraviesa nada)
  let sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
  if (sp > MAX_SPEED) {
    const k = MAX_SPEED / sp;
    s.vx *= k;
    s.vy *= k;
    s.vz *= k;
    sp = MAX_SPEED;
  }
  let n = Math.ceil((sp * DT) / SUB_LEN);
  if (n < 1) n = 1;
  else if (n > MAX_SUB) n = MAX_SUB;
  const dt = DT / n;
  const k0 = s.k;
  s.sq = 0;
  for (let i = 0; i < n; i++) substep(w, s, (k0 + i / n) / HZ, dt);
  s.k = k0 + 1;
  s.flight++;
  if (s.g) s.air = 0;
  else s.air++;

  // adentro del hoyo
  const c = w.cup;
  const cdx = s.x - c.x;
  const cdz = s.z - c.z;
  if (s.y < c.y - 0.4 * R && s.y > c.y - CUP_DEPTH - R && cdx * cdx + cdz * cdz < CUP_R * CUP_R) {
    s.mode = HOLED;
    s.settled = 0;
    emit('cup', s, Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz));
    s.vx = 0;
    s.vy = 0;
    s.vz = 0;
    EV = null;
    return;
  }

  // agua, lava y caídas
  if (s.y < w.killY) {
    reset(s, w.killKind, 1);
    EV = null;
    return;
  }
  for (let i = 0; i < zs.hazard.length; i++) {
    const zn = zs.hazard[i];
    if (s.y - zn.y < R + 0.06 && s.y - zn.y > -4 * R && inZone(zn, s.x, s.z)) {
      reset(s, zn.kind, 1);
      EV = null;
      return;
    }
  }
  // tubos
  if (s.g) {
    for (let i = 0; i < zs.portal.length; i++) {
      const p = zs.portal[i];
      const dx = s.x - p.ax;
      const dz = s.z - p.az;
      if (dx * dx + dz * dz < p.r * p.r && s.y - p.ay < 2.5 * R && s.y - p.ay > -R) {
        let v = Math.sqrt(s.vx * s.vx + s.vz * s.vz) * p.keep;
        if (v < p.vmin) v = p.vmin;
        else if (v > p.vmax) v = p.vmax;
        emit('pipeIn', s, v);
        s.mode = PIPE;
        s.pipe = i;
        s.pipeT = p.ticks;
        s.pipeV = v;
        s.settled = 0;
        s.still = 0;
        s.x = p.ax;
        s.z = p.az;
        s.vx = 0;
        s.vy = 0;
        s.vz = 0;
        EV = null;
        return;
      }
    }
  }
  // aplastada
  if (s.sq) {
    if (++s.sqn >= 4) {
      reset(s, 'crush', 0);
      EV = null;
      return;
    }
  } else s.sqn = 0;

  // ¿se quedó quieta? (respecto de lo que la sostiene)
  if (s.g) {
    const rx = s.vx - s.gux;
    const ry = s.vy - s.guy;
    const rz = s.vz - s.guz;
    if (rx * rx + ry * ry + rz * rz < STILL_V * STILL_V) s.still++;
    else s.still = 0;
  } else s.still = 0;
  if (s.still >= STILL_TICKS) {
    if (!s.settled) emit('settle', s, 0);
    s.settled = 1;
    s.flight = 0;
    s.vx = s.gux;
    s.vy = s.guy;
    s.vz = s.guz;
    if (!s.gmov) {
      // piso firme: queda como punto de regreso; y si nada que se mueva pasa por acá, se duerme
      s.sx = s.x;
      s.sy = s.y;
      s.sz = s.z;
      let near = 0;
      const ms = w.movers;
      for (let i = 0; i < ms.length; i++) {
        const z = ms[i].zone;
        if (s.x + R > z.x0 && s.x - R < z.x1 && s.y + R > z.y0 && s.y - R < z.y1 && s.z + R > z.z0 && s.z - R < z.z1) near = 1;
      }
      if (!near) s.mode = SLEEP;
    }
  } else {
    s.settled = 0;
    if (s.flight > MAX_FLIGHT) reset(s, 'timeout', 0);
  }
  EV = null;
}

/** Simula hasta el tick `k` (las pelotas dormidas o embocadas saltan directo). */
export function advance(w, s, k, ev) {
  while (s.k < k) {
    if (s.mode === SLEEP || s.mode === HOLED) {
      s.k = k;
      return;
    }
    step(w, s, ev);
  }
}

/** ¿Se le puede pegar? Quieta en el piso, o quieta arriba de una plataforma. */
export const canShoot = (s) => s.mode === SLEEP || (s.mode === MOVE && s.settled === 1);

export const shotSpeed = (p) => VMIN + ((VMAX - VMIN) * p) / POWERS;
/** Dirección (x, z) de un ángulo entero: 0 = hacia +z, crece hacia +x. */
export const shotDir = (a) => {
  const th = a * (TAU / ANGLES);
  return [dsin(th), dcos(th)];
};

/** Golpe: `a` 0..65535 (ángulo) y `p` 1..1000 (fuerza). Sale por el piso, también en pendiente. */
export function shoot(w, s, a, p) {
  const th = a * (TAU / ANGLES);
  let dx = dsin(th);
  let dy = 0;
  let dz = dcos(th);
  const dot = dx * s.gnx + dz * s.gnz;
  dx -= dot * s.gnx;
  dy -= dot * s.gny;
  dz -= dot * s.gnz;
  const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const v0 = shotSpeed(p) / l;
  s.vx += dx * v0;
  s.vy += dy * v0;
  s.vz += dz * v0;
  s.mode = MOVE;
  s.settled = 0;
  s.still = 0;
  s.flight = 0;
  s.strokes++;
}

// ------------------------------------------------------------------ estado de la pelota
export function newBall(w) {
  const t = w.tee;
  return {
    k: 0, x: t.x, y: t.y + R - SLOP, z: t.z, vx: 0, vy: 0, vz: 0,
    mode: SLEEP, settled: 1, still: STILL_TICKS, flight: 0, air: 0,
    sx: t.x, sy: t.y + R - SLOP, sz: t.z,
    g: 1, gnx: 0, gny: 1, gnz: 0, gux: 0, guy: 0, guz: 0, gmov: 0, gsurf: 0,
    strokes: 0, pens: 0, resets: 0, pipe: -1, pipeT: 0, pipeV: 0, sq: 0, sqn: 0, boosted: 0,
  };
}

const KEYS = ['k', 'x', 'y', 'z', 'vx', 'vy', 'vz', 'mode', 'settled', 'still', 'flight', 'air', 'sx', 'sy', 'sz', 'g', 'gnx', 'gny', 'gnz', 'gux', 'guy', 'guz', 'gmov', 'gsurf', 'strokes', 'pens', 'resets', 'pipe', 'pipeT', 'pipeV', 'sq', 'sqn', 'boosted'];

export function copyBall(dst, src) {
  for (let i = 0; i < KEYS.length; i++) dst[KEYS[i]] = src[KEYS[i]];
  return dst;
}
export const cloneBall = (s) => copyBall({}, s);
/** Para mandar por la red: una lista de números (JSON conserva los decimales exactos). */
export const packBall = (s) => KEYS.map((k) => s[k]);
export function unpackBall(a) {
  if (!Array.isArray(a) || a.length !== KEYS.length) return null;
  const s = {};
  for (let i = 0; i < KEYS.length; i++) {
    const v = Number(a[i]);
    if (!Number.isFinite(v)) return null;
    s[KEYS[i]] = v;
  }
  return s;
}
export const sameBall = (a, b) => KEYS.every((k) => a[k] === b[k]);

/** Altura del piso más alto en (x, z) por debajo de `yMax` (o null si ahí no hay cancha). */
export function floorAt(w, x, z, yMax = Infinity, skipEl = -1) {
  const g = w.grid;
  const ix = Math.floor((x - g.x0) * g.inv);
  const iz = Math.floor((z - g.z0) * g.inv);
  if (ix < 0 || iz < 0 || ix >= g.nx || iz >= g.nz) return null;
  const cell = g.cells[iz * g.nx + ix];
  if (!cell) return null;
  let best = null;
  for (let i = 0; i < cell.length; i++) {
    const t = cell[i];
    if (t.t !== 0 || t.ny < 0.35 || t.el === skipEl) continue;
    if (x < t.x0 || x > t.x1 || z < t.z0 || z > t.z1) continue;
    const y = t.ay - (t.nx * (x - t.ax) + t.nz * (z - t.az)) / t.ny;
    if (y > yMax) continue;
    const dx = x - t.ax;
    const dy = y - t.ay;
    const dz = z - t.az;
    const d20 = dx * t.e1x + dy * t.e1y + dz * t.e1z;
    const d21 = dx * t.e2x + dy * t.e2y + dz * t.e2z;
    const v = (t.d11 * d20 - t.d01 * d21) * t.inv;
    const ww = (t.d00 * d21 - t.d01 * d20) * t.inv;
    if (v < -1e-7 || ww < -1e-7 || 1 - v - ww < -1e-7) continue;
    if (best === null || y > best) best = y;
  }
  return best;
}
