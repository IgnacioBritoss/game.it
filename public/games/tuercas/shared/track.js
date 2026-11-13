/**
 * Tuercas — pistas. Un circuito se escribe como un trazado de rectas y curvas (ver tracks.js); acá se recorre, se
 * cierra, se suaviza y se muestrea cada ~2 m con todo lo que la física, los bots y el dibujo necesitan: tangente,
 * normal, curvatura, altura, ancho, banquinas, tipo de borde y línea de carrera.
 *
 * Convenciones: x a la derecha, z hacia la cámara, y arriba. El rumbo `yaw` es rotation.y de three.js: adelante =
 * (sin yaw, cos yaw), izquierda = (cos yaw, -sin yaw). El desvío lateral `d` es positivo hacia la izquierda.
 * Es lógica pura (sin DOM): la usan el navegador y las pruebas.
 */
import { clamp, lerp, wrapDelta, mod } from './util.js';

export const STEP = 2; // metros entre muestras (aprox.; se ajusta para cerrar justo)
export const WALL = 0; // borde con valla: rebota
export const FALL = 1; // borde al vacío (agua, lava, mesa): caés y te reponen

const EDGE = { wall: WALL, fall: FALL };
const RAD = Math.PI / 180;

/** Promedio móvil sobre un circuito cerrado (suaviza uniones de rectas con curvas, lomas y cambios de ancho). */
function blur(arr, radius, passes) {
  const n = arr.length;
  let cur = arr;
  for (let p = 0; p < passes; p++) {
    const out = new Float64Array(n);
    let acc = 0;
    for (let k = -radius; k <= radius; k++) acc += cur[mod(k, n)];
    for (let i = 0; i < n; i++) {
      out[i] = acc / (2 * radius + 1);
      acc += cur[mod(i + radius + 1, n)] - cur[mod(i - radius, n)];
    }
    cur = out;
  }
  return cur;
}

/**
 * La "tortuga": recorre el trazado (rectas y curvas de radio exacto) partiendo de (0, 0) hacia +x y devuelve puntos
 * cada ~1 m con sus datos. Dos rectas pueden tener largo '?': se calculan solas para que el circuito cierre justo.
 */
function layout(def) {
  let y = def.y ?? 0;
  let w = def.width ?? 16;
  let L = def.margin ?? 8;
  let R = def.margin ?? 8;
  let eL = EDGE[def.edge ?? 'wall'];
  let eR = eL;
  const segs = def.path.map((p) => {
    const s = p[0] === 's' ? { kind: 's', len: p[1], o: p[2] || {} } : { kind: p[0], r: p[1], phi: p[2] * RAD, o: p[3] || {} };
    const o = s.o;
    s.y0 = y;
    if (o.y !== undefined) y = o.y;
    if (o.w !== undefined) w = o.w;
    if (o.L !== undefined) L = o.L;
    if (o.R !== undefined) R = o.R;
    if (o.e !== undefined) eL = eR = EDGE[o.e];
    if (o.eL !== undefined) eL = EDGE[o.eL];
    if (o.eR !== undefined) eR = EDGE[o.eR];
    Object.assign(s, { y1: y, hw: w / 2, L, R, eL, eR });
    return s;
  });
  // 1) rumbo de cada tramo y cuánto falta para cerrar
  let th = Math.PI / 2;
  let px = 0;
  let pz = 0;
  const free = [];
  for (const s of segs) {
    s.th = th;
    if (s.kind === 's') {
      if (s.len === '?') free.push(s);
      else {
        px += Math.sin(th) * s.len;
        pz += Math.cos(th) * s.len;
      }
    } else {
      const sg = s.kind === 'l' ? 1 : -1;
      const cx = px + Math.cos(th) * s.r * sg;
      const cz = pz - Math.sin(th) * s.r * sg;
      th += sg * s.phi;
      px = cx - Math.cos(th) * s.r * sg;
      pz = cz + Math.sin(th) * s.r * sg;
    }
  }
  const turn = Math.abs(th - Math.PI / 2);
  if (Math.abs(turn - Math.PI * 2) > 1e-6) throw new Error(`${def.id}: el trazado gira ${(turn / RAD).toFixed(1)}° (tiene que dar una vuelta entera)`);
  if (free.length === 2) {
    const [a, b] = free;
    const ax = Math.sin(a.th);
    const az = Math.cos(a.th);
    const bx = Math.sin(b.th);
    const bz = Math.cos(b.th);
    const det = ax * bz - az * bx;
    if (Math.abs(det) < 0.05) throw new Error(`${def.id}: las dos rectas libres son casi paralelas`);
    a.len = (-px * bz + pz * bx) / det;
    b.len = (-ax * pz + az * px) / det;
    if (a.len < 8 || b.len < 8) throw new Error(`${def.id}: no cierra (rectas libres de ${a.len.toFixed(1)} y ${b.len.toFixed(1)} m)`);
  } else if (free.length) throw new Error(`${def.id}: hacen falta exactamente dos rectas '?' (o ninguna)`);
  else if (Math.hypot(px, pz) > 0.5) throw new Error(`${def.id}: no cierra (faltan ${Math.hypot(px, pz).toFixed(1)} m)`);

  // 2) puntos cada ~1 m
  const X = [];
  const Z = [];
  const Y = [];
  const HW = [];
  const ML = [];
  const MR = [];
  const seg = [];
  th = Math.PI / 2;
  px = 0;
  pz = 0;
  let total = 0;
  segs.forEach((s, si) => {
    const length = s.kind === 's' ? s.len : s.r * s.phi;
    const k = Math.max(1, Math.round(length));
    s.s0 = total;
    s.length = length;
    const sg = s.kind === 'l' ? 1 : -1;
    const cx = px + Math.cos(th) * s.r * sg;
    const cz = pz - Math.sin(th) * s.r * sg;
    for (let q = 0; q < k; q++) {
      const u = q / k;
      if (s.kind === 's') {
        X.push(px + Math.sin(th) * length * u);
        Z.push(pz + Math.cos(th) * length * u);
      } else {
        const a = th + sg * s.phi * u;
        X.push(cx - Math.cos(a) * s.r * sg);
        Z.push(cz + Math.sin(a) * s.r * sg);
      }
      Y.push(lerp(s.y0, s.y1, u));
      HW.push(s.hw);
      ML.push(s.L);
      MR.push(s.R);
      seg.push(si);
    }
    if (s.kind === 's') {
      px += Math.sin(th) * length;
      pz += Math.cos(th) * length;
    } else {
      th += sg * s.phi;
      px = cx - Math.cos(th) * s.r * sg;
      pz = cz + Math.sin(th) * s.r * sg;
    }
    total += length;
  });
  const bx = blur(X, 4, 2);
  const bz = blur(Z, 4, 2);
  const by = blur(Y, 9, 3);
  const bw = blur(HW, 6, 2);
  const bl = blur(ML, 6, 2);
  const br = blur(MR, 6, 2);
  const dense = X.map((_, i) => [bx[i], bz[i], by[i], bw[i], bl[i], br[i]]);

  // 3) lo que va sobre la pista se escribe por tramo (fracción del tramo) y acá pasa a fracción de vuelta
  const feat = { ramps: [], pads: [], boxes: [], nuts: [], obstacles: [] };
  const list = (v) => (v === undefined ? [] : Array.isArray(v) && Array.isArray(v[0]) ? v : [v]);
  for (const s of segs) {
    const at = (f) => (s.s0 + f * s.length) / total;
    const o = s.o;
    for (const r of list(o.ramp)) feat.ramps.push({ at: at(r[0]), len: r[1] ?? 9, h: r[2] ?? 1.2 });
    for (const p of list(o.pad)) feat.pads.push(Array.isArray(p) ? { at: at(p[0]), d: p[1] ?? 0 } : { at: at(p), d: 0 });
    for (const b of list(o.box)) feat.boxes.push(Array.isArray(b) ? { at: at(b[0]), n: b[1], span: b[2] } : { at: at(b) });
    for (const g of list(o.nuts)) feat.nuts.push({ at: at(g[0]), n: g[1] ?? 5, d: g[2] ?? 0, wave: g[3] ?? 0 });
    for (const q of list(o.obs)) feat.obstacles.push({ at: at(q[0]), d: q[1] ?? 0, amp: q[2] ?? 0, per: q[3] ?? 4, kind: q[4], r: q[5] });
  }
  return { dense, seg, segs, feat };
}

/**
 * Arma la pista a partir de su definición (ver tracks.js).
 * Devuelve arreglos por muestra y las cosas ya ubicadas (cajas, tuercas, aceleradores, rampas, obstáculos).
 */
export function buildTrack(def) {
  const { dense, seg, segs: cps, feat } = layout(def);
  const dn = dense.length;
  const cum = new Float64Array(dn + 1);
  for (let i = 0; i < dn; i++) {
    const a = dense[i];
    const b = dense[(i + 1) % dn];
    cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const len = cum[dn];
  const n = Math.max(16, Math.round(len / STEP));
  const step = len / n;

  // 2) remuestreo a paso fijo
  const T = {
    id: def.id,
    def,
    n,
    step,
    len,
    laps: def.laps ?? 3,
    theme: def.theme,
    grip: def.grip ?? 1,
    x: new Float32Array(n),
    z: new Float32Array(n),
    y: new Float32Array(n),
    hw: new Float32Array(n),
    mL: new Float32Array(n),
    mR: new Float32Array(n),
    eL: new Uint8Array(n),
    eR: new Uint8Array(n),
    tx: new Float32Array(n),
    tz: new Float32Array(n),
    nx: new Float32Array(n),
    nz: new Float32Array(n),
    yaw: new Float32Array(n),
    curv: new Float32Array(n),
    line: new Float32Array(n),
  };
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = i * step;
    while (j < dn - 1 && cum[j + 1] < s) j++;
    const f = cum[j + 1] > cum[j] ? (s - cum[j]) / (cum[j + 1] - cum[j]) : 0;
    const a = dense[j];
    const b = dense[(j + 1) % dn];
    T.x[i] = lerp(a[0], b[0], f);
    T.z[i] = lerp(a[1], b[1], f);
    T.y[i] = lerp(a[2], b[2], f);
    T.hw[i] = Math.max(3.5, lerp(a[3], b[3], f));
    T.mL[i] = Math.max(0.4, lerp(a[4], b[4], f));
    T.mR[i] = Math.max(0.4, lerp(a[5], b[5], f));
    T.eL[i] = cps[seg[j]].eL;
    T.eR[i] = cps[seg[j]].eR;
  }
  // 3) tangente, normal, rumbo
  for (let i = 0; i < n; i++) {
    const a = mod(i - 1, n);
    const b = (i + 1) % n;
    let tx = T.x[b] - T.x[a];
    let tz = T.z[b] - T.z[a];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    T.tx[i] = tx;
    T.tz[i] = tz;
    T.nx[i] = tz;
    T.nz[i] = -tx;
    T.yaw[i] = Math.atan2(tx, tz);
  }
  // 4) curvatura con signo (positiva = dobla a la izquierda), suavizada
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = mod(i - 1, n);
    const b = (i + 1) % n;
    let d = T.yaw[b] - T.yaw[a];
    if (d > Math.PI) d -= Math.PI * 2;
    else if (d < -Math.PI) d += Math.PI * 2;
    raw[i] = d / (2 * step);
  }
  for (let i = 0; i < n; i++) T.curv[i] = (raw[mod(i - 1, n)] + 2 * raw[i] + raw[(i + 1) % n]) / 4;

  // 5) línea de carrera de los bots: hacia adentro de la curva que viene, suavizada
  const target = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let k = 0;
    for (let q = 2; q <= 16; q++) k += T.curv[(i + q) % n];
    k /= 15;
    target[i] = clamp(k * 55, -1, 1) * Math.max(0, T.hw[i] - 2.4) * 0.78;
  }
  let cur = target;
  for (let pass = 0; pass < 6; pass++) {
    const nx = new Float32Array(n);
    for (let i = 0; i < n; i++) nx[i] = (cur[mod(i - 2, n)] + cur[mod(i - 1, n)] + cur[i] + cur[(i + 1) % n] + cur[(i + 2) % n]) / 5;
    cur = nx;
  }
  T.line.set(cur);

  // 6) rampas (lomos con salto): suben en parábola hasta `h` y cortan de golpe
  T.ramps = feat.ramps.map((r) => ({ s0: mod(r.at * len - r.len, len), len: r.len, h: r.h, s1: mod(r.at * len, len) }));

  // 7) cosas sobre la pista
  const at = (frac) => mod(frac * len, len);
  T.pads = feat.pads.map((p) => {
    const s = at(p.at);
    const i = Math.round(s / step) % n;
    return { s, i, d: (p.d || 0) * T.hw[i], w: p.w ?? 5, len: p.len ?? 7 };
  });
  T.boxes = [];
  for (const b of feat.boxes) {
    const s = at(b.at);
    const i = Math.round(s / step) % n;
    const count = b.n ?? (T.hw[i] >= 8 ? 5 : 4);
    const span = (T.hw[i] - 1.6) * 2 * (b.span ?? 0.86);
    for (let q = 0; q < count; q++) {
      const d = count === 1 ? (b.d || 0) * T.hw[i] : -span / 2 + (span * q) / (count - 1);
      const P = pointAt(T, s, d);
      T.boxes.push({ x: P.x, z: P.z, y: P.y + 1.15, s, d, row: T.boxes.length - q });
    }
  }
  T.nuts = [];
  for (const g of feat.nuts) {
    const count = g.n ?? 5;
    const gap = g.gap ?? 3.2;
    for (let q = 0; q < count; q++) {
      const s = mod(at(g.at) + q * gap, len);
      const i = Math.round(s / step) % n;
      const wave = g.wave ? Math.sin((q / Math.max(1, count - 1)) * Math.PI * 2) * g.wave : 0;
      const d = clamp((g.d || 0) + wave, -0.85, 0.85) * (T.hw[i] - 1.2);
      const P = pointAt(T, s, d);
      T.nuts.push({ x: P.x, z: P.z, y: P.y + 0.75, s, d });
    }
  }
  T.obstacles = feat.obstacles.map((o, q) => {
    const s = at(o.at);
    const i = Math.round(s / step) % n;
    return { s, i, d: (o.d || 0) * T.hw[i], amp: (o.amp || 0) * T.hw[i], per: o.per || 4, ph: o.ph ?? q * 1.7, r: o.r ?? 1.1, kind: o.kind || 'cono' };
  });

  // 8) caja que la contiene (para el minimapa, el terreno y la cámara de presentación)
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const r = T.hw[i] + Math.max(T.mL[i], T.mR[i]);
    x0 = Math.min(x0, T.x[i] - r);
    x1 = Math.max(x1, T.x[i] + r);
    z0 = Math.min(z0, T.z[i] - r);
    z1 = Math.max(z1, T.z[i] + r);
    y0 = Math.min(y0, T.y[i]);
    y1 = Math.max(y1, T.y[i]);
  }
  T.box = { x0, x1, z0, z1, y0, y1 };
  return T;
}

/** Muestra más cercana a un punto (búsqueda completa: solo para ubicar algo por primera vez). */
export function nearest(T, x, z) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < T.n; i++) {
    const dx = x - T.x[i];
    const dz = z - T.z[i];
    const d = dx * dx + dz * dz;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/**
 * Proyecta un punto sobre la pista partiendo de la muestra `hint` (la del paso anterior; -1 = buscar en toda la pista).
 * Deja en `out`: i (muestra), a (metros a lo largo desde esa muestra) y d (desvío lateral, + = izquierda).
 * Como solo camina desde `hint`, nadie "salta" a otro tramo de la pista aunque pase cerca.
 */
export function project(T, x, z, hint, out) {
  const n = T.n;
  let i = hint < 0 ? nearest(T, x, z) : hint;
  const half = T.step * 0.5;
  let a = 0;
  for (let it = 0; it < 10; it++) {
    a = (x - T.x[i]) * T.tx[i] + (z - T.z[i]) * T.tz[i];
    if (a > half) i = i + 1 === n ? 0 : i + 1;
    else if (a < -half) i = i === 0 ? n - 1 : i - 1;
    else break;
  }
  const dx = x - T.x[i];
  const dz = z - T.z[i];
  a = dx * T.tx[i] + dz * T.tz[i];
  // fracción hasta la muestra vecina medida contra las dos: así el avance y la altura no pegan saltitos al cambiar de
  // muestra en una curva (por adentro se recorre menos pista que por afuera)
  const j = a >= 0 ? (i + 1 === n ? 0 : i + 1) : i === 0 ? n - 1 : i - 1;
  const b = (x - T.x[j]) * T.tx[j] + (z - T.z[j]) * T.tz[j];
  const span = a - b;
  const f = Math.abs(span) > 1e-6 ? clamp(a / span, -1, 1) : 0;
  out.i = i;
  out.a = (a >= 0 ? Math.abs(f) : -Math.abs(f)) * T.step;
  out.d = dx * T.nx[i] + dz * T.nz[i];
  return out;
}

/** Altura extra de las rampas en la posición `s` de la vuelta. */
export function rampAt(T, s) {
  let h = 0;
  for (const r of T.ramps) {
    let ds = s - r.s0;
    if (ds < 0) ds += T.len;
    if (ds < r.len) {
      const u = ds / r.len;
      h += r.h * u * u;
    }
  }
  return h;
}

/** Altura del piso en la muestra `i` más `a` metros a lo largo, con desvío lateral `d` (los lomos ocupan solo la calzada). */
export function groundAt(T, i, a, d = 0) {
  const n = T.n;
  const j = a >= 0 ? (i + 1 === n ? 0 : i + 1) : i === 0 ? n - 1 : i - 1;
  const f = Math.min(1, Math.abs(a) / T.step);
  const y = T.y[i] + (T.y[j] - T.y[i]) * f;
  return T.ramps.length && Math.abs(d) <= T.hw[i] + 0.2 ? y + rampAt(T, mod(i * T.step + a, T.len)) : y;
}

/** Punto del mundo en la posición `s` de la vuelta con desvío lateral `d`. */
export function pointAt(T, s, d = 0) {
  const n = T.n;
  s = mod(s, T.len);
  const fi = s / T.step;
  const i = Math.floor(fi) % n;
  const j = (i + 1) % n;
  const f = fi - Math.floor(fi);
  const nx = lerp(T.nx[i], T.nx[j], f);
  const nz = lerp(T.nz[i], T.nz[j], f);
  let dy = T.yaw[j] - T.yaw[i];
  if (dy > Math.PI) dy -= Math.PI * 2;
  else if (dy < -Math.PI) dy += Math.PI * 2;
  return {
    x: lerp(T.x[i], T.x[j], f) + nx * d,
    z: lerp(T.z[i], T.z[j], f) + nz * d,
    y: lerp(T.y[i], T.y[j], f) + (T.ramps.length && Math.abs(d) <= T.hw[i] + 0.2 ? rampAt(T, s) : 0),
    yaw: T.yaw[i] + dy * f,
    i,
  };
}

/** Lugares de la grilla de largada: el 0 es la pole. */
export function gridSlot(T, k) {
  const s = -(5 + k * 3.3);
  const i = Math.round(mod(s, T.len) / T.step) % T.n;
  const d = (k % 2 ? -1 : 1) * T.hw[i] * 0.4;
  const P = pointAt(T, s, d);
  return { x: P.x, z: P.z, y: P.y, yaw: P.yaw, i: P.i, s };
}

/**
 * Revisa que la pista se pueda dibujar y correr. Devuelve la lista de problemas (vacía = bien):
 * tramos que se pisan, curvas más cerradas que el borde interno y largada sin recta.
 */
export function validate(T) {
  const issues = [];
  const n = T.n;
  const reach = (i) => T.hw[i] + Math.max(T.mL[i], T.mR[i]);
  // tramos lejanos en la vuelta no pueden quedar pegados
  const skip = Math.ceil(70 / T.step);
  let worst = Infinity;
  for (let i = 0; i < n; i += 2) {
    for (let j = i + skip; j < n; j += 2) {
      if (n - (j - i) < skip) continue;
      const d = Math.hypot(T.x[i] - T.x[j], T.z[i] - T.z[j]);
      // el lado que mira al otro tramo es el que importa
      const side = (k, ox, oz) => ((ox - T.x[k]) * T.nx[k] + (oz - T.z[k]) * T.nz[k] > 0 ? T.mL[k] : T.mR[k]);
      const need = T.hw[i] + side(i, T.x[j], T.z[j]) + T.hw[j] + side(j, T.x[i], T.z[i]) + 1.5;
      if (d - need < worst) worst = d - need;
      if (d < need) {
        issues.push(`se pisan los tramos ${Math.round((i / n) * 100)}% y ${Math.round((j / n) * 100)}% (${d.toFixed(1)} m, hacen falta ${need.toFixed(1)})`);
        i += 6;
        break;
      }
    }
  }
  T.clearance = worst;
  // el borde interno de una curva no puede plegarse
  for (let i = 0; i < n; i++) {
    const k = T.curv[i];
    const inner = T.hw[i] + (k > 0 ? T.mL[i] : T.mR[i]);
    if (Math.abs(k) * inner > 0.97) {
      issues.push(`curva demasiado cerrada en ${Math.round((i / n) * 100)}% (radio ${(1 / Math.abs(k)).toFixed(1)} m, borde a ${inner.toFixed(1)} m)`);
      i += 8;
    }
  }
  // la grilla necesita una recta
  for (let q = -16; q <= 6; q++) {
    if (Math.abs(T.curv[mod(q, n)]) > 0.012) {
      issues.push('la largada no está en una recta');
      break;
    }
  }
  if (reach(0) < 6) issues.push('largada demasiado angosta');
  return issues;
}

export { wrapDelta };
