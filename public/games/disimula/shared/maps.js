/**
 * Disimulá — mapas y patrones compartidos (JS puro, sin WebGL).
 *
 * Cada mapa son cajas { min, max, pat } y cada superficie tiene un patrón procedural
 * `fn(u, v) → [r, g, b]` en metros (periódico cada `tile`). El cliente dibuja los
 * patrones en canvas; el servidor y los bots leen el color de cualquier punto con
 * `colorAt`/`raycastColor`, sin dibujar nada.
 *
 * La luz también vive acá (ambiente + direccional fija, estilo Lambert): el color
 * "visto" es patrón × lambert(normal), idéntico en CPU y en GPU (el render va en
 * espacio lineal, sin gestión de color).
 */
import { rayBoxes, groundAt, validSpot, hash2 } from './geom.js';

// ---------------------------------------------------------------- luz
export const LIGHT = { ambient: 0.58, dir: 0.62, L: norm3(0.45, 1, 0.3) };
function norm3(x, y, z) {
  const l = Math.sqrt(x * x + y * y + z * z);
  return [x / l, y / l, z / l];
}
export const lambert = (nx, ny, nz) => LIGHT.ambient + LIGHT.dir * Math.max(0, nx * LIGHT.L[0] + ny * LIGHT.L[1] + nz * LIGHT.L[2]);

// ---------------------------------------------------------------- utilidades de patrones
const H = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (c, k) => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
const mod = (v, m) => ((v % m) + m) % m;
/** Ruido suave [0,1): interpola el hash en una grilla de paso `s` metros. */
function vnoise(u, v, s, seed) {
  const x = u / s;
  const y = v / s;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sm = (t) => t * t * (3 - 2 * t);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sm(fx) + (c - a) * sm(fy) + (a - b - c + d) * sm(fx) * sm(fy);
}

export const PATTERNS = {};
/** Registra un patrón. `tile` en metros; `px` resolución del mosaico en el cliente. */
function pat(id, tile, px, fn) {
  PATTERNS[id] = { id, tile, px, fn };
}

const PAL = ['#e85d4a', '#f2a73b', '#f7d154', '#5fbf77', '#3e9bd6', '#9168c4', '#39c6b5', '#ef7f34', '#e26fa2', '#7dcf5a', '#d6d2c8', '#6e86c7'].map(H);

// --- lisos y materiales de base
function flat(id, hex, amp = 0.05, grain = 0.18) {
  const c = H(hex);
  pat(id, 1, 32, (u, v) => {
    const n = vnoise(u, v, grain, 7) * 2 - 1;
    return shade(c, 1 + n * amp);
  });
}
flat('plaster', '#d8cfc0');
flat('plaster2', '#c9d4cf');
flat('ceiling', '#efece4', 0.03);
flat('ceiling_dark', '#4a4f55', 0.04);
flat('concrete', '#8d9293', 0.09, 0.3);
flat('stone', '#a8a49c', 0.07, 0.12);
flat('stone_dark', '#7b7873', 0.08, 0.12);
flat('cream', '#e7dfca', 0.03);
flat('leaf', '#4e9a4e', 0.18, 0.09);

// --- madera: tablones con veta
function woodFn(base, dark, plankW, along) {
  return (u, v) => {
    const a = along ? v : u;
    const b = along ? u : v;
    const plank = Math.floor(a / plankW);
    const off = hash2(plank, 0, 11) * 3;
    const seg = Math.floor((b + off) / 2.2);
    const tone = 0.82 + hash2(plank, seg, 12) * 0.3;
    const vein = Math.sin((b + off) * 9 + hash2(plank, 3, 13) * 6) * 0.05;
    const gap = mod(a, plankW) < 0.012 || mod(b + off, 2.2) < 0.015 ? 0.62 : 1;
    return shade(mix(base, dark, 0.25 + vein), tone * gap);
  };
}
pat('wood', 2.2, 96, woodFn(H('#b5824f'), H('#7a5230'), 0.17, false));
pat('wood_dark', 2.2, 96, woodFn(H('#8a5e38'), H('#54351e'), 0.17, false));
pat('parquet', 1.2, 96, (u, v) => {
  const cell = 0.6;
  const cx = Math.floor(u / cell);
  const cy = Math.floor(v / cell);
  const horiz = (cx + cy) % 2 === 0;
  const a = horiz ? mod(u, cell) : mod(v, cell);
  const b = horiz ? mod(v, cell) : mod(u, cell);
  const strip = Math.floor(b / 0.15);
  const tone = 0.8 + hash2(cx * 7 + strip, cy * 3 + strip, 21) * 0.32;
  const gap = mod(b, 0.15) < 0.01 || a < 0.01 ? 0.6 : 1;
  return shade(mix(H('#c08a52'), H('#8a5a30'), hash2(cx, cy, 22) * 0.5), tone * gap);
});

// --- empapelados de la mansión
pat('wallpaper1', 1, 64, (u, v) => {
  const s = Math.sin(u * Math.PI * 4);
  const base = mix(H('#b6cdb4'), H('#8fb18c'), s > 0.25 ? 1 : 0);
  const dot = mod(u, 0.5) > 0.19 && mod(u, 0.5) < 0.31 && mod(v, 0.5) > 0.19 && mod(v, 0.5) < 0.31;
  return dot ? H('#e9e2c8') : base;
});
pat('wallpaper2', 1, 64, (u, v) => {
  const du = Math.abs(mod(u, 0.6) - 0.3) / 0.3;
  const dv = Math.abs(mod(v, 0.6) - 0.3) / 0.3;
  const d = du + dv;
  if (d < 0.36) return H('#ac4a52');
  if (d < 0.5) return H('#d8b25e');
  return mix(H('#c2666d'), H('#9e3f47'), vnoise(u, v, 0.4, 31));
});
pat('wainscot', 4, 96, (u, v) => {
  const y = mod(v, 4);
  if (y < 0.09) return H('#4e3820'); // zócalo
  if (y < 1.0) {
    const panel = mod(u, 0.9);
    const inner = panel > 0.1 && panel < 0.8 && y > 0.18 && y < 0.88;
    const edge = inner && (panel < 0.14 || panel > 0.76 || y < 0.22 || y > 0.84);
    return shade(H('#7a4e2a'), edge ? 0.7 : inner ? 1.02 : 0.9);
  }
  if (y < 1.06) return H('#5d3a1e');
  const s = Math.sin(u * Math.PI * 4);
  return mix(H('#cdb89a'), H('#b9a179'), s > 0 ? 1 : 0);
});

// --- alfombras y telas
pat('rug', 1.4, 96, (u, v) => {
  const du = Math.abs(mod(u, 1.4) - 0.7);
  const dv = Math.abs(mod(v, 1.4) - 0.7);
  const d = Math.max(du, dv);
  const n = 1 + (vnoise(u, v, 0.05, 41) - 0.5) * 0.22;
  if (d > 0.62) return shade(H('#7e2f35'), n);
  if (d > 0.54) return shade(H('#d9b35c'), n);
  if (Math.abs(du - dv) < 0.07 || du + dv < 0.3) return shade(H('#355d7e'), n);
  return shade(H('#a8434b'), n);
});
pat('rug_blue', 1.2, 96, (u, v) => {
  const ring = Math.floor((Math.abs(mod(u, 1.2) - 0.6) + Math.abs(mod(v, 1.2) - 0.6)) / 0.14);
  const n = 1 + (vnoise(u, v, 0.05, 43) - 0.5) * 0.2;
  return shade([H('#2e4a73'), H('#c8b273'), H('#4a6a94'), H('#85a0bf')][ring % 4], n);
});
function fabric(id, hex, hex2) {
  const a = H(hex);
  const b = H(hex2);
  pat(id, 0.5, 48, (u, v) => {
    const w = (Math.sin(u * 60) + Math.sin(v * 60)) * 0.04;
    const btn = mod(u, 0.25) > 0.1 && mod(u, 0.25) < 0.15 && mod(v, 0.25) > 0.1 && mod(v, 0.25) < 0.15;
    return btn ? shade(a, 0.72) : shade(mix(a, b, vnoise(u, v, 0.2, 47) * 0.5), 1 + w);
  });
}
fabric('sofa_red', '#b24a52', '#8e3a44');
fabric('sofa_teal', '#3f7f82', '#2f6168');
pat('curtain', 2.6, 64, (u, v) => {
  const w = Math.sin(u * 14 + Math.sin(v * 1.5)) * 0.5 + 0.5;
  return shade(mix(H('#8e2f3c'), H('#5e1d28'), w), mod(v, 2.6) > 2.45 ? 0.75 : 1);
});

// --- bibliotecas y cuadros
pat('books', 1.1, 96, (u, v) => {
  const rowH = 0.3675; // ~3 estantes por mosaico (el alto del mueble es múltiplo)
  const row = Math.floor(v / rowH);
  const y = mod(v, rowH);
  if (y < 0.03) return H('#5a3a22'); // estante
  let x = 0;
  let i = 0;
  const uu = mod(u, 1.1);
  while (x < 1.2) {
    const w = 0.028 + hash2(i, row, 51) * 0.03;
    if (uu < x + w) {
      const h = 0.2 + hash2(i, row, 52) * 0.12;
      if (y > h + 0.03) return H('#2d2017'); // fondo del mueble
      const c = PAL[Math.floor(hash2(i, row, 53) * PAL.length)];
      const band = y > h - 0.035 && y < h - 0.012;
      return band ? shade(c, 0.6) : shade(c, 0.85 + hash2(i, row + 9, 54) * 0.25);
    }
    x += w + 0.004;
    i++;
  }
  return H('#2d2017');
});
function painting(id, seed) {
  pat(id, 1, 64, (u, v) => {
    const uu = mod(u, 1);
    const vv = mod(v, 1);
    if (uu < 0.045 || uu > 0.955 || vv < 0.045 || vv > 0.955) return H('#8a6a30'); // marco dorado
    if (seed % 3 === 0) {
      const k = Math.floor((uu + vv) / 0.18) + seed;
      return PAL[((k % PAL.length) + PAL.length) % PAL.length];
    }
    if (seed % 3 === 1) {
      const d = Math.hypot(uu - 0.5, vv - 0.55);
      const ring = Math.floor(d / 0.09) + seed;
      return shade(PAL[((ring % PAL.length) + PAL.length) % PAL.length], 0.95);
    }
    const n = vnoise(uu * 2 + seed, vv * 2, 0.33, 55 + seed);
    const m = vnoise(uu * 2, vv * 2 + seed, 0.21, 77 + seed);
    return mix(PAL[(seed * 3) % PAL.length], PAL[(seed * 5 + 4) % PAL.length], n > 0.5 ? m : n);
  });
}
painting('art1', 3);
painting('art2', 4);
painting('art3', 5);
painting('art4', 7);

// --- alcantarillas
pat('brick', 1, 64, (u, v) => {
  const rowH = 0.125;
  const row = Math.floor(v / rowH);
  const off = row % 2 ? 0.125 : 0;
  const bw = 0.25;
  const bu = mod(u + off, bw);
  const bv = mod(v, rowH);
  if (bu < 0.014 || bv < 0.014) return H('#5a544e'); // junta
  const i = Math.floor((u + off) / bw);
  const tone = 0.78 + hash2(i, row, 61) * 0.4;
  const damp = vnoise(u, v, 0.9, 62) < 0.3 ? 0.8 : 1;
  return shade(mix(H('#9a5a44'), H('#6e4434'), hash2(i, row, 63) * 0.7), tone * damp);
});
pat('brick_dark', 1, 64, (u, v) => {
  const c = PATTERNS.brick.fn(u, v);
  return shade(c, 0.6);
});
pat('metal', 1.5, 64, (u, v) => {
  const brush = 1 + (vnoise(u * 8, v * 0.6, 0.5, 71) - 0.5) * 0.12;
  const panel = mod(u, 0.75) < 0.015 || mod(v, 0.75) < 0.015 ? 0.7 : 1;
  const rivet = mod(u, 0.75) > 0.05 && mod(u, 0.75) < 0.1 && mod(v, 0.75) > 0.05 && mod(v, 0.75) < 0.1 ? 0.65 : 1;
  return shade(H('#8c9399'), brush * panel * rivet);
});
pat('metal_green', 1.5, 64, (u, v) => {
  const m = PATTERNS.metal.fn(u, v);
  const rust = vnoise(u, v, 0.35, 73);
  return rust > 0.72 ? mix(H('#7a4a2a'), [m[0] * 0.5, m[1] * 0.6, m[2] * 0.4], 0.4) : mix(m, H('#4e7a5a'), 0.55);
});
pat('rust', 1, 48, (u, v) => {
  const n = vnoise(u, v, 0.22, 75);
  return mix(H('#8a4a26'), H('#5e3018'), n);
});
pat('water', 2, 64, (u, v) => {
  const w = Math.sin(u * 4 + Math.sin(v * 3) * 1.5) * 0.5 + Math.sin(v * 5 + u * 2) * 0.5;
  return mix(H('#27555e'), H('#3d7a80'), 0.5 + w * 0.25);
});
pat('moss', 0.8, 48, (u, v) => {
  const n = vnoise(u, v, 0.14, 81);
  return n > 0.55 ? shade(H('#4e7a3a'), 0.8 + n * 0.4) : shade(H('#3a4a38'), 0.8);
});

// --- supermercado
pat('floor_tiles', 1.2, 64, (u, v) => {
  const cx = Math.floor(u / 0.6);
  const cy = Math.floor(v / 0.6);
  if (mod(u, 0.6) < 0.012 || mod(v, 0.6) < 0.012) return H('#9a9a98');
  const special = hash2(cx, cy, 91) > 0.92;
  const base = special ? H('#7fbf9f') : (cx + cy) % 2 ? H('#e8e6e0') : H('#d8d6d0');
  return shade(base, 0.95 + hash2(cx, cy, 92) * 0.1);
});
function products(id, seed) {
  pat(id, 1.5, 96, (u, v) => {
    const rowH = 0.5;
    const row = Math.floor(v / rowH);
    const y = mod(v, rowH);
    if (y < 0.035) return H('#b8bcc0'); // estante metálico
    if (y > 0.42) return H('#3c4046'); // fondo oscuro
    let x = 0;
    let i = 0;
    const uu = mod(u, 1.5);
    while (x < 1.6) {
      const w = 0.1 + hash2(i, row, seed) * 0.12;
      if (uu < x + w) {
        if (uu > x + w - 0.012) return H('#30343a');
        const c = PAL[Math.floor(hash2(i, row, seed + 1) * PAL.length)];
        const label = y > 0.13 && y < 0.3;
        const h = 0.34 + hash2(i, row, seed + 2) * 0.07;
        if (y > h) return H('#3c4046');
        return label ? mix(c, [245, 243, 235], 0.75) : shade(c, 0.95);
      }
      x += w + 0.012;
      i++;
    }
    return H('#3c4046');
  });
}
products('prods1', 101);
products('prods2', 111);
products('prods3', 121);
pat('fridge', 1.4, 64, (u, v) => {
  const door = mod(u, 0.7);
  if (door < 0.03) return H('#7e8890');
  const y = mod(v, 1.4);
  if (y > 1.1) return H('#d8dde2');
  const glass = mix(H('#aee2ef'), H('#7fb8cf'), vnoise(u, v, 0.4, 95));
  const row = mod(v, 0.35) < 0.04 ? 0.7 : 1;
  return shade(glass, row);
});
pat('crate', 0.6, 48, (u, v) => {
  const edge = mod(u, 0.6) < 0.025 || mod(u, 0.6) > 0.575 || mod(v, 0.6) < 0.025 || mod(v, 0.6) > 0.575 ? 0.78 : 1;
  const tape = Math.abs(mod(u, 0.6) - 0.3) < 0.045 ? mix(H('#c8a96a'), H('#b5854a'), 0.3) : null;
  const base = shade(H('#b58a56'), (0.92 + vnoise(u, v, 0.2, 97) * 0.16) * edge);
  return tape && edge === 1 ? tape : base;
});
pat('checkout', 1.2, 64, (u, v) => {
  const y = mod(v, 1.2);
  if (y > 0.92) return H('#d8d5cc');
  const band = y > 0.72 ? H('#4a90c2') : H('#e8e5dc');
  return shade(band, 0.92 + vnoise(u, v, 0.3, 99) * 0.12);
});

// --- museo
pat('museum_wall', 4, 96, (u, v) => {
  const y = mod(v, 4);
  if (y < 0.75) return shade(H('#6a7a88'), 0.95 + vnoise(u, v, 0.4, 131) * 0.1);
  if (y < 0.82) return H('#caa84f');
  return shade(H('#ddd6c4'), 0.96 + vnoise(u, v, 0.5, 132) * 0.08);
});
pat('museum_wall2', 4, 96, (u, v) => {
  const y = mod(v, 4);
  if (y < 0.75) return shade(H('#7a5a52'), 0.95 + vnoise(u, v, 0.4, 133) * 0.1);
  if (y < 0.82) return H('#caa84f');
  const s = Math.sin(u * Math.PI) > 0.6;
  return shade(s ? H('#cfc0a8') : H('#dcd2bd'), 0.97);
});
pat('marble', 1.6, 80, (u, v) => {
  const n = vnoise(u + vnoise(u, v, 0.5, 141) * 0.8, v, 0.33, 142);
  const vein = Math.abs(n - 0.5) < 0.035 ? 0.72 : 1;
  const big = (Math.floor(u / 0.8) + Math.floor(v / 0.8)) % 2 ? 0.93 : 1;
  return shade(H('#e2e0da'), vein * big);
});
flat('pedestal', '#b8b2a4', 0.05, 0.2);

export const PATTERN_IDS = Object.keys(PATTERNS);

// ---------------------------------------------------------------- color de una superficie
/** Patrón de una cara de una caja según su normal (pat puede ser 'id' o { top, bottom, side }). */
export function facePattern(box, ny) {
  const p = box.pat;
  if (typeof p === 'string') return PATTERNS[p];
  if (ny > 0.5) return PATTERNS[p.top || p.side];
  if (ny < -0.5) return PATTERNS[p.bottom || p.side];
  return PATTERNS[p.side];
}

/** (u, v) en metros de un punto sobre una cara con esa normal (la misma convención usa el cliente). */
export function faceUv(x, y, z, nx, ny, nz) {
  if (Math.abs(ny) > 0.5) return [x, z];
  if (Math.abs(nx) > 0.5) return [z, y];
  return [x, y];
}

/** Color base [r,g,b] del escenario en un punto con esa normal. */
export function colorAt(box, x, y, z, nx, ny, nz) {
  const p = facePattern(box, ny);
  const [u, v] = faceUv(x, y, z, nx, ny, nz);
  return p.fn(u, v);
}

/** Rayo contra el mapa con color: { t, x,y,z, nx,ny,nz, color, lit } o null. */
export function raycastColor(map, ox, oy, oz, dx, dy, dz, maxT = Infinity) {
  const h = rayBoxes(map.boxes, ox, oy, oz, dx, dy, dz, maxT);
  if (!h) return null;
  const color = colorAt(h.box, h.x, h.y, h.z, h.nx, h.ny, h.nz);
  const k = lambert(h.nx, h.ny, h.nz);
  return { ...h, color, lit: [color[0] * k, color[1] * k, color[2] * k] };
}

// ---------------------------------------------------------------- armado de mapas
const B = (x1, y1, z1, x2, y2, z2, pat) => ({ min: [Math.min(x1, x2), Math.min(y1, y2), Math.min(z1, z2)], max: [Math.max(x1, x2), Math.max(y1, y2), Math.max(z1, z2)], pat });

/** Pared a lo largo de X en z fijo, con huecos [desdeX, anchoX] (puertas). */
function wallX(out, z, x1, x2, h, p, gaps = [], t = 0.18, y0 = 0) {
  let segs = [[x1, x2]];
  for (const [gx, gw] of gaps) {
    const next = [];
    for (const [a, b] of segs) {
      if (gx > a) next.push([a, Math.min(b, gx)]);
      if (gx + gw < b) next.push([Math.max(a, gx + gw), b]);
    }
    segs = next;
  }
  for (const [a, b] of segs) if (b - a > 0.01) out.push(B(a, y0, z - t / 2, b, h, z + t / 2, p));
}
function wallZ(out, x, z1, z2, h, p, gaps = [], t = 0.18, y0 = 0) {
  let segs = [[z1, z2]];
  for (const [gz, gw] of gaps) {
    const next = [];
    for (const [a, b] of segs) {
      if (gz > a) next.push([a, Math.min(b, gz)]);
      if (gz + gw < b) next.push([Math.max(a, gz + gw), b]);
    }
    segs = next;
  }
  for (const [a, b] of segs) if (b - a > 0.01) out.push(B(x - t / 2, y0, a, x + t / 2, h, b, p));
}
/** Cuadro/placa pegado a una pared (caja finita). side: 'n'|'s'|'e'|'w' (normal hacia afuera). */
function plaque(out, side, x, z, w, y1, y2, p, d = 0.05) {
  if (side === 'n') out.push(B(x - w / 2, y1, z, x + w / 2, y2, z + d, p));
  else if (side === 's') out.push(B(x - w / 2, y1, z - d, x + w / 2, y2, z, p));
  else if (side === 'e') out.push(B(x, y1, z - w / 2, x + d, y2, z + w / 2, p));
  else out.push(B(x - d, y1, z - w / 2, x, y2, z + w / 2, p));
}
function sofa(out, x, z, w, horiz, p) {
  const d = 0.85;
  const [sx, sz] = horiz ? [w, d] : [d, w];
  out.push(B(x - sx / 2, 0, z - sz / 2, x + sx / 2, 0.42, z + sz / 2, p));
  if (horiz) out.push(B(x - sx / 2, 0.42, z - sz / 2, x + sx / 2, 0.95, z - sz / 2 + 0.25, p));
  else out.push(B(x - sx / 2, 0.42, z - sz / 2, x - sx / 2 + 0.25, 0.95, z + sz / 2, p));
  const armW = 0.22;
  if (horiz) {
    out.push(B(x - sx / 2, 0.42, z - sz / 2, x - sx / 2 + armW, 0.62, z + sz / 2, p));
    out.push(B(x + sx / 2 - armW, 0.42, z - sz / 2, x + sx / 2, 0.62, z + sz / 2, p));
  } else {
    out.push(B(x - sx / 2, 0.42, z - sz / 2, x + sx / 2, 0.62, z - sz / 2 + armW, p));
    out.push(B(x - sx / 2, 0.42, z + sz / 2 - armW, x + sx / 2, 0.62, z + sz / 2, p));
  }
}
function table(out, x, z, w, d, h, p) {
  out.push(B(x - w / 2, h - 0.07, z - d / 2, x + w / 2, h, z + d / 2, p));
  const lg = 0.08;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    out.push(B(x + sx * (w / 2 - lg) - lg / 2, 0, z + sz * (d / 2 - lg) - lg / 2, x + sx * (w / 2 - lg) + lg / 2, h - 0.07, z + sz * (d / 2 - lg) + lg / 2, p));
}
function chair(out, x, z, facing, p) {
  out.push(B(x - 0.22, 0, z - 0.22, x + 0.22, 0.45, z + 0.22, p));
  const b = 0.22;
  if (facing === 'n') out.push(B(x - b, 0.45, z - b, x + b, 1.0, z - b + 0.07, p));
  else if (facing === 's') out.push(B(x - b, 0.45, z + b - 0.07, x + b, 1.0, z + b, p));
  else if (facing === 'e') out.push(B(x - b, 0.45, z - b, x - b + 0.07, 1.0, z + b, p));
  else out.push(B(x + b - 0.07, 0.45, z - b, x + b, 1.0, z + b, p));
}
function shelfIsle(out, x, z, len, horiz, p1, p2) {
  const w = 1.0;
  const [sx, sz] = horiz ? [len, w] : [w, len];
  out.push(B(x - sx / 2, 0, z - sz / 2, x + sx / 2, 1.85, z + sz / 2, { side: p1, top: 'metal', bottom: 'metal' }));
  void p2;
}
function pillar(out, x, z, h, p, w = 0.5) {
  out.push(B(x - w / 2, 0, z - w / 2, x + w / 2, h, z + w / 2, p));
}

// ---------------------------------------------------------------- los 4 mapas
function mansionBoxes() {
  const o = [];
  const H1 = 3.2;
  // piso, techo y paredes de todo el lote 24×18 (x −12..12, z −9..9)
  o.push(B(-12, -0.3, -9, 12, 0, 9, { top: 'wood', side: 'wood_dark', bottom: 'wood_dark' }));
  o.push(B(-12, H1, -9, 12, H1 + 0.3, 9, { bottom: 'ceiling', side: 'ceiling', top: 'ceiling' }));
  wallX(o, -9, -12, 12, H1, 'wallpaper1');
  wallX(o, 9, -12, 12, H1, 'wallpaper1', [[-1, 2]]); // entrada al sur (los buscadores llegan por acá)
  wallZ(o, -12, -9, 9, H1, 'wallpaper1');
  wallZ(o, 12, -9, 9, H1, 'wallpaper1');
  // pared interior: biblioteca al este (x>3), comedor al noreste
  wallZ(o, 3, -9, 9, H1, 'wallpaper2', [[-2.2, 1.6], [4.4, 1.6]]);
  wallX(o, 0, 3, 12, H1, 'wainscot', [[6.4, 1.6]]);
  // living (oeste): alfombra, sofás, mesa ratona, chimenea, cuadros
  o.push(B(-9.5, 0, -4.5, -3.5, 0.025, 1.5, 'rug'));
  sofa(o, -6.5, 2.4, 3, true, 'sofa_red');
  sofa(o, -9.1, -1.4, 2.6, false, 'sofa_teal');
  table(o, -6.5, -0.6, 1.3, 0.75, 0.42, 'wood_dark');
  o.push(B(-12, 0, -3.2, -11.35, 1.25, -0.8, { side: 'brick', top: 'stone' })); // chimenea
  plaque(o, 'w', -12 + 0.18, 2.8, 2, 1.1, 2.5, 'art1', 0.06);
  plaque(o, 's', -7, 9 - 0.18, 2.2, 1.2, 2.6, 'art2', 0.06);
  plaque(o, 'n', -4, -9 + 0.18, 1.8, 1.2, 2.4, 'art3', 0.06);
  // bibliotecas (este, z<0) — el alto 2.2 es múltiplo del estante de 0.3675×6
  o.push(B(5, 0, -9 + 0.2, 11.6, 2.205, -8.55, { side: 'books', top: 'wood_dark' }));
  o.push(B(12 - 0.65, 0, -6.5, 12 - 0.2, 2.205, -1.5, { side: 'books', top: 'wood_dark' }));
  table(o, 7.4, -4.4, 1.5, 0.9, 0.76, 'wood_dark');
  chair(o, 6.6, -3.2, 's', 'wood_dark');
  o.push(B(4.4, 0, -5.6, 5.9, 0.025, -3.2, 'rug_blue'));
  plaque(o, 'e', 3 + 0.14, -4, 1.6, 1.1, 2.3, 'art4', 0.06);
  // comedor (este, z>0): mesa larga, sillas, aparador, cortinas
  table(o, 7.5, 4.5, 3.2, 1.3, 0.78, 'wood');
  chair(o, 6.3, 3.3, 'n', 'wood_dark');
  chair(o, 8.1, 3.3, 'n', 'wood_dark');
  chair(o, 6.3, 5.7, 's', 'wood_dark');
  chair(o, 8.1, 5.7, 's', 'wood_dark');
  o.push(B(11.3, 0, 2.2, 11.82, 1.35, 5.2, { side: 'wood_dark', top: 'marble' })); // aparador
  plaque(o, 'e', 12 - 0.16, 7, 2.4, 0.9, 2.7, 'curtain', 0.1);
  plaque(o, 'n', 8, 0.14, 1.6, 1.15, 2.35, 'art1', 0.06);
  // plantas y columnas del hall
  pillar(o, -0.8, 6.8, H1, 'plaster', 0.45);
  pillar(o, -0.8, 2.2, H1, 'plaster', 0.45);
  o.push(B(-1.3, 0, -8.6, -0.3, 0.5, -7.6, { side: 'wood_dark', top: 'leaf' }));
  o.push(B(-0.9, 0.5, -8.3, -0.65, 1.5, -7.95, 'leaf'));
  return o;
}

function sewerBoxes() {
  const o = [];
  const H1 = 2.9;
  // 28×20 (x −14..14, z −10..10): dos túneles largos unidos por tres cruces
  o.push(B(-14, -0.3, -10, 14, 0, 10, 'concrete'));
  o.push(B(-14, H1, -10, 14, H1 + 0.3, 10, { bottom: 'ceiling_dark', side: 'brick_dark', top: 'brick_dark' }));
  wallX(o, -10, -14, 14, H1, 'brick');
  wallX(o, 10, -14, 14, H1, 'brick', [[-1.2, 2.4]]); // entrada
  wallZ(o, -14, -10, 10, H1, 'brick');
  wallZ(o, 14, -10, 10, H1, 'brick');
  // muros centrales que arman los túneles (z −3 y z 3), con pasos
  wallX(o, -3.4, -14, 14, H1, 'brick', [[-11, 2], [-2, 2.2], [8, 2]], 0.5);
  wallX(o, 3.4, -14, 14, H1, 'brick', [[-9.5, 2], [1.5, 2.2], [10, 2]], 0.5);
  // canal de agua en el túnel del medio (hundido): bordes y agua
  o.push(B(-14, 0, -1.1, 14, 0.12, -0.75, 'stone_dark'));
  o.push(B(-14, 0, 0.75, 14, 0.12, 1.1, 'stone_dark'));
  o.push(B(-14, 0.0, -0.75, 14, 0.06, 0.75, 'water'));
  // caños a lo largo de las paredes
  o.push(B(-14, 1.9, -9.82, 14, 2.3, -9.42, 'metal_green'));
  o.push(B(-14, 1.1, -9.78, 14, 1.42, -9.46, 'rust'));
  o.push(B(-14, 2.0, 9.42, 14, 2.4, 9.82, 'metal'));
  o.push(B(-13.82, 0.9, -10, -13.42, 1.3, 10, 'metal_green'));
  // tambores, cajas metálicas y rejas
  for (const [x, z, p] of [[-11.5, -7.8, 'rust'], [-10.7, -7.3, 'metal_green'], [6.2, 8.2, 'metal'], [12.6, -8.3, 'rust'], [1.2, -8.5, 'metal_green']])
    o.push(B(x - 0.38, 0, z - 0.38, x + 0.38, 0.95, z + 0.38, p));
  o.push(B(-5.5, 0, 7.6, -3.5, 1.3, 9.2, { side: 'metal', top: 'metal' }));
  o.push(B(8.5, 0, -6.2, 9.9, 1.1, -4.9, { side: 'rust', top: 'rust' }));
  // musgo y manchas en las paredes
  plaque(o, 'n', -6, -10 + 0.26, 3, 0.1, 1.6, 'moss', 0.04);
  plaque(o, 's', 9, 10 - 0.26, 2.4, 0.1, 1.3, 'moss', 0.04);
  plaque(o, 'n', 4, -3.4 + 0.26, 2.6, 0.1, 1.8, 'moss', 0.04);
  plaque(o, 's', -8, 3.4 - 0.26, 2.2, 0.1, 1.5, 'moss', 0.04);
  // pilares de refuerzo
  pillar(o, -7, 0, H1, 'brick_dark', 0.7);
  pillar(o, 7, 0, H1, 'brick_dark', 0.7);
  return o;
}

function superBoxes() {
  const o = [];
  const H1 = 3.2;
  // 26×20 (x −13..13, z −10..10)
  o.push(B(-13, -0.3, -10, 13, 0, 10, 'floor_tiles'));
  o.push(B(-13, H1, -10, 13, H1 + 0.3, 10, { bottom: 'ceiling', side: 'plaster2', top: 'plaster2' }));
  wallX(o, -10, -13, 13, H1, 'plaster2');
  wallX(o, 10, -13, 13, H1, 'plaster2', [[-1.3, 2.6]]); // entrada
  wallZ(o, -13, -10, 10, H1, 'plaster2');
  wallZ(o, 13, -10, 10, H1, 'plaster2');
  // heladeras a lo largo de la pared norte
  o.push(B(-12.2, 0, -9.82, 12.2, 2.2, -8.9, { side: 'fridge', top: 'metal' }));
  // góndolas (4 dobles) en el medio
  for (let i = 0; i < 4; i++) {
    const x = -7.5 + i * 5;
    shelfIsle(o, x, -1.5, 9, false, ['prods1', 'prods2', 'prods3'][i % 3]);
  }
  // cajas (checkouts) cerca de la entrada
  for (let i = 0; i < 3; i++) {
    const x = -5 + i * 4;
    o.push(B(x - 1.1, 0, 6.8, x + 1.1, 0.95, 7.75, { side: 'checkout', top: 'metal' }));
    o.push(B(x + 1.1, 0, 6.8, x + 1.45, 1.35, 7.15, 'metal'));
  }
  // pilas de cajones y ofertas
  for (const [x, z, n] of [[-11.2, 3.5, 3], [-10.4, 4.3, 2], [11.3, 1.2, 3], [10.5, 2.0, 1], [-2.2, 8.6, 2], [11.5, 8.3, 2]])
    for (let k = 0; k < n; k++) o.push(B(x - 0.35, k * 0.62, z - 0.35, x + 0.35, k * 0.62 + 0.6, z + 0.35, 'crate'));
  // isla de frutas (verduleria)
  o.push(B(-11.9, 0, -3.5, -9.9, 0.9, 0.5, { side: 'wood', top: 'leaf' }));
  return o;
}

function museumBoxes() {
  const o = [];
  const H1 = 3.5;
  // 28×20 (x −14..14, z −10..10), tres salas
  o.push(B(-14, -0.3, -10, 14, 0, 10, 'parquet'));
  o.push(B(-14, H1, -10, 14, H1 + 0.3, 10, { bottom: 'ceiling', side: 'museum_wall', top: 'ceiling' }));
  wallX(o, -10, -14, 14, H1, 'museum_wall');
  wallX(o, 10, -14, 14, H1, 'museum_wall', [[-1.2, 2.4]]); // entrada
  wallZ(o, -14, -10, 10, H1, 'museum_wall');
  wallZ(o, 14, -10, 10, H1, 'museum_wall');
  wallZ(o, -4.6, -10, 10, H1, 'museum_wall2', [[-5.4, 2.2], [3.2, 2.2]]);
  wallZ(o, 4.6, -10, 10, H1, 'museum_wall2', [[-5.4, 2.2], [3.2, 2.2]]);
  // sala oeste: pinturas grandes
  plaque(o, 'w', -14 + 0.16, -4, 3, 1.2, 3, 'art1', 0.08);
  plaque(o, 'w', -14 + 0.16, 2.5, 3, 1.2, 3, 'art2', 0.08);
  plaque(o, 'n', -9.3, -10 + 0.16, 3, 1.2, 2.8, 'art3', 0.08);
  plaque(o, 's', -9.3, 10 - 0.16, 3, 1.2, 2.8, 'art4', 0.08);
  o.push(B(-10.2, 0, -1.2, -8.4, 0.45, 1.2, 'wood_dark')); // banco
  // sala central: esculturas sobre pedestales + cordones
  for (const [x, z, art] of [[-1.8, -4.5, 'marble'], [1.8, -4.5, 'stone'], [0, 0, 'marble'], [-1.8, 4.5, 'stone'], [1.8, 4.5, 'marble']]) {
    o.push(B(x - 0.45, 0, z - 0.45, x + 0.45, 1.0, z + 0.45, 'pedestal'));
    o.push(B(x - 0.3, 1.0, z - 0.3, x + 0.3, 1.75, z + 0.3, art));
    o.push(B(x - 0.14, 1.75, z - 0.14, x + 0.14, 2.15, z + 0.14, art));
  }
  plaque(o, 'n', 0, -10 + 0.16, 4, 1.1, 3.1, 'art2', 0.08);
  plaque(o, 's', 0, 10 - 0.16, 4, 1.1, 3.1, 'art1', 0.08);
  // sala este: tapiz, vitrinas y cortinas
  plaque(o, 'e', 14 - 0.16, 0, 4, 0.9, 3.2, 'rug', 0.07); // tapiz colgado
  plaque(o, 'e', 14 - 0.16, -6.5, 2.2, 0.8, 2.9, 'curtain', 0.1);
  plaque(o, 'e', 14 - 0.16, 6.5, 2.2, 0.8, 2.9, 'curtain', 0.1);
  o.push(B(7.5, 0, -6.8, 9.5, 0.95, -4.8, { side: 'wood_dark', top: 'marble' }));
  o.push(B(10.5, 0, 4.2, 12.5, 0.95, 6.2, { side: 'wood_dark', top: 'marble' }));
  o.push(B(7, 0, 2.2, 8.2, 0.5, 3.4, 'pedestal'));
  o.push(B(7.25, 0.5, 2.45, 7.95, 1.3, 3.15, 'stone_dark'));
  pillar(o, -4.6, -9.2, H1, 'marble', 0.6);
  pillar(o, 4.6, 9.2, H1, 'marble', 0.6);
  return o;
}

const DEFS = {
  mansion: { name: { es: 'Mansión', en: 'Mansion' }, build: mansionBoxes, size: [24, 18], sky: H('#20242e'), spawnS: [[0, 0.01, 8.2], [-1.4, 0.01, 8.2], [1.4, 0.01, 8.2], [0, 0.01, 7]], spawnH: [[-6, 0.01, -1], [-9, 0.01, 3], [7, 0.01, -4], [8, 0.01, 4.8], [-2, 0.01, -6], [5, 0.01, -7], [10, 0.01, 1], [-10, 0.01, -6]] },
  sewer: { name: { es: 'Alcantarillas', en: 'Sewers' }, build: sewerBoxes, size: [28, 20], sky: H('#131619'), spawnS: [[0, 0.01, 9], [-1.5, 0.01, 9], [1.5, 0.01, 9], [0, 0.01, 7.6]], spawnH: [[-11, 0.01, -6], [11, 0.01, -7], [-8, 0.13, 0], [9, 0.13, 0], [-11, 0.01, 6], [5, 0.01, -8], [12, 0.01, 5], [-3, 0.01, -8]] },
  super: { name: { es: 'Supermercado', en: 'Supermarket' }, build: superBoxes, size: [26, 20], sky: H('#1c2026'), spawnS: [[0, 0.01, 9], [-1.6, 0.01, 9], [1.6, 0.01, 9], [0, 0.01, 7.4]], spawnH: [[-10.5, 0.01, -6], [10.5, 0.01, -5], [-5, 0.01, 1], [5, 0.01, -4], [0, 0.01, -7], [-11, 0.01, 7], [11, 0.01, 4], [2.5, 0.01, 3]] },
  museum: { name: { es: 'Museo', en: 'Museum' }, build: museumBoxes, size: [28, 20], sky: H('#1a1e28'), spawnS: [[0, 0.01, 9], [-1.5, 0.01, 9], [1.5, 0.01, 9], [0, 0.01, 7.6]], spawnH: [[-11, 0.01, -5], [-9, 0.01, 5], [0, 0.01, -6.5], [2.5, 0.01, 6], [8, 0.01, -5.8], [11.5, 0.01, 5.2], [-6.5, 0.01, 0], [12, 0.01, -2]] },
};
export const MAP_IDS = Object.keys(DEFS);

const built = {};
/** Mapa listo para usar: cajas, límites, spawns, waypoints y puntos de vista típicos. */
export function getMap(id) {
  if (built[id]) return built[id];
  const def = DEFS[id] || DEFS.mansion;
  const [w, d] = def.size;
  const map = {
    id: DEFS[id] ? id : 'mansion',
    name: def.name,
    sky: def.sky,
    boxes: def.build(),
    bounds: { min: [-w / 2, 0, -d / 2], max: [w / 2, 4, d / 2] },
    spawnS: def.spawnS,
    spawnH: def.spawnH,
    waypoints: [],
  };
  // puntos de paso: grilla de 2 m sobre el piso, donde se puede estar parado
  for (let x = Math.ceil(map.bounds.min[0] + 1); x <= map.bounds.max[0] - 1; x += 2)
    for (let z = Math.ceil(map.bounds.min[2] + 1); z <= map.bounds.max[2] - 1; z += 2) {
      const g = groundAt(map.boxes, x, z, 0.02, 0.25);
      if (g === null || g > 0.4) continue;
      if (validSpot(map, x, g, z, 0.32, 1.7)) map.waypoints.push([x, g, z]);
    }
  built[id] = map;
  return map;
}

export { groundAt };
