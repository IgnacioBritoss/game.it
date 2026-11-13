/**
 * Terco — la simulación de una pantalla, pura y determinista (60 pasos por segundo).
 *
 * Una mulita chiquita que corre a velocidad fija, salta (el salto se corta al soltar), tiene un salto más en el
 * aire y patea piedritas. Cualquier cosa filosa la manda de vuelta al último fogón. Cada pantalla mide 32×16
 * baldosas y se arma con un mapa de texto más una lista de objetos: plataformas que se mueven o se caen,
 * rodadoras, cerbatanas, trampas que se disparan al pasar, géiseres, viento, palancas y compuertas, bichos,
 * fogones (para guardar), zanahorias (secretos) y carteles.
 *
 * Coordenadas en baldosas, "y" crece hacia abajo; la mula se ubica por el centro de sus pies. El estado es un
 * objeto plano que se copia con clone(): lo usan el buscador de soluciones (tools/terco-solver.mjs), que prueba
 * que cada pantalla se puede pasar, y el piloto de los jefes.
 */

export const HZ = 60;
export const RW = 32;
export const RH = 16;
/** Teclas de un paso, como bits: izquierda, derecha, saltar, patear. */
export const IN = { L: 1, R: 2, J: 4, F: 8 };

export const P = {
  hw: 0.25, // medio ancho del cuerpo
  h: 0.7, // alto
  run: 3 / 32, // baldosas por paso (5,6 por segundo), sin inercia
  g: 0.0125,
  jump: 0.27, // sube 2,8 baldosas
  jump2: 0.235, // el del aire, 2,1 más
  cut: 0.45, // soltar el botón subiendo corta el salto
  maxFall: 0.34,
  coyote: 5, // pasos de gracia después de salir de una cornisa
  buffer: 6, // pasos que se recuerda un salto apretado antes de tocar el piso
  shot: 0.42,
  cool: 10,
  shots: 3,
  spring: 0.4,
  belt: 0.04,
};

export const T = { E: 0, S: 1, UP: 2, DN: 3, LF: 4, RT: 5, OW: 6, CR: 7, HID: 8, FAKE: 9, BRK: 10, SPR: 11, LAVA: 12, CL: 13, CRT: 14 };
const CH = { '#': T.S, '^': T.UP, v: T.DN, '<': T.LF, '>': T.RT, '=': T.OW, '%': T.CR, '?': T.HID, ':': T.FAKE, B: T.BRK, S: T.SPR, '~': T.LAVA, '{': T.CL, '}': T.CRT };
const SOLID = new Uint8Array(16);
for (const t of [T.S, T.CR, T.BRK, T.SPR, T.CL, T.CRT]) SOLID[t] = 1;
export const isSolid = (t) => SOLID[t] === 1;

/** Tipos de objeto. */
export const K = { CP: 1, PLAT: 2, FALL: 3, SAW: 4, SHOOT: 5, TRAP: 6, GEYSER: 7, WIND: 8, SWITCH: 9, GATE: 10, WALKER: 11, CARROT: 12, SIGN: 13, WARP: 14, STONE: 15, ZONE: 16, BLINK: 17, BOSS: 18, DECO: 19 };
const KIND = { cp: K.CP, plat: K.PLAT, fall: K.FALL, saw: K.SAW, shooter: K.SHOOT, trap: K.TRAP, geyser: K.GEYSER, wind: K.WIND, switch: K.SWITCH, gate: K.GATE, walker: K.WALKER, carrot: K.CARROT, sign: K.SIGN, warp: K.WARP, stone: K.STONE, zone: K.ZONE, blink: K.BLINK, boss: K.BOSS, deco: K.DECO };

const CRUMBLE = 22; // pasos que aguanta una baldosa floja
const REGEN = 150; // y lo que tarda en volver
const SPIKE_A = 0.12; // la punta de un pincho queda un poquito adentro de su baldosa…
const SPIKE_B = 0.42; // …y la base es un poco más angosta: perdona los roces

/** Los jefes se anotan acá (shared/bosses.js): { init(S, d), step(S), hit(S, x0, y0, x1, y1), shot(S, x, y) }. */
export const BOSS = {};

const sec = (v) => Math.round((v || 0) * HZ);
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a && b ? (a / gcd(a, b)) * b : a || b);

// ---------------------------------------------------------------- armado de una pantalla

/**
 * Convierte la definición de una pantalla (mapa de texto + objetos) en algo listo para simular.
 * En el mapa, las letras minúsculas y los números son marcas: los objetos dicen `at: 'a'` y quedan donde está la
 * letra (si la letra está repetida, se crea un objeto por cada una).
 */
export function compile(def) {
  const rows = def.map;
  if (!rows || rows.length !== RH) throw new Error(`pantalla ${def.id}: el mapa tiene ${rows?.length} filas en vez de ${RH}`);
  const R = { id: def.id, def, zone: def.zone || '', tiles: new Uint8Array(RW * RH), marks: {}, ents: [], sigs: {}, nsig: 0, period: 1, exits: {}, spawns: {}, dark: !!def.dark, solids: [], winds: [], zones: [], targets: [], lava: null, boss: -1 };
  for (let y = 0; y < RH; y++) {
    if (rows[y].length !== RW) throw new Error(`pantalla ${def.id}: la fila ${y} tiene ${rows[y].length} columnas en vez de ${RW}`);
    for (let x = 0; x < RW; x++) {
      const c = rows[y][x];
      if (c === '.' || c === ' ') continue;
      if (CH[c]) R.tiles[y * RW + x] = CH[c];
      else if (/[a-uw-z0-9]/.test(c)) (R.marks[c] ||= []).push([x, y]);
      else throw new Error(`pantalla ${def.id}: símbolo desconocido "${c}" en (${x}, ${y})`);
    }
  }
  const at = (m, what) => {
    if (Array.isArray(m)) return m;
    const p = R.marks[m];
    if (!p) throw new Error(`pantalla ${def.id}: falta la marca "${m}" (${what})`);
    if (p.length > 1) throw new Error(`pantalla ${def.id}: la marca "${m}" está repetida (${what})`);
    return p[0];
  };
  const bit = (name) => {
    if (R.sigs[name] == null) {
      if (R.nsig >= 30) throw new Error(`pantalla ${def.id}: demasiadas señales`);
      R.sigs[name] = 1 << R.nsig++;
    }
    return R.sigs[name];
  };
  let anon = 0;
  /** Disparador de un objeto: el nombre de una señal o una zona [marca, ancho, alto] que la prende al pisarla. */
  const trig = (tr) => {
    if (tr == null) return 0;
    if (typeof tr === 'string') return bit(tr);
    const z = Array.isArray(tr) ? { at: tr[0], w: tr[1], h: tr[2] } : tr;
    const name = `_z${anon++}`;
    addZone({ ...z, sig: name });
    return bit(name);
  };
  const addZone = (o) => {
    const [x, y] = at(o.at, 'zone');
    R.zones.push({ k: K.ZONE, x: x + (o.dx || 0), y: y + (o.dy || 0), w: o.w || 1, h: o.h || 1, bit: bit(o.sig), once: o.once !== false, ground: !!o.ground });
  };
  const DIRS = { up: 0, down: 1, left: 2, right: 3 };

  // salidas: a qué pantalla lleva cada borde (o varias, según la fila o la columna por la que se sale)
  for (const side of ['left', 'right', 'up', 'down']) {
    const e = def.exits?.[side];
    if (!e) continue;
    R.exits[side] = typeof e === 'string' ? [{ to: e, a: -99, b: 99 }] : e.map((o) => ({ to: o.to, a: o.from ?? -99, b: o.until ?? 99 }));
  }
  for (const k in def.spawn || {}) {
    const [x, y] = at(def.spawn[k], 'spawn');
    R.spawns[k] = [x + 0.5, y + 1];
  }

  for (const src of def.ents || []) {
    const k = KIND[src.t];
    if (!k) throw new Error(`pantalla ${def.id}: objeto desconocido "${src.t}"`);
    if (k === K.ZONE) {
      addZone(src);
      continue;
    }
    // una marca repetida crea un objeto por cada aparición
    const spots = typeof src.at === 'string' ? R.marks[src.at] : [src.at || [0, 0]];
    if (!spots) throw new Error(`pantalla ${def.id}: falta la marca "${src.at}" (${src.t})`);
    spots.forEach(([mx, my], n) => {
      mx += src.dx || 0;
      my += src.dy || 0;
      const d = { k, t: src.t, src, n, when: src.when || null, unless: src.unless || null };
      // destino de lo que se mueve entre dos puntos
      const dest = () => {
        if (src.to != null) {
          const [tx, ty] = at(src.to, `${src.t}.to`);
          return [tx - mx + (src.dx || 0), ty - my + (src.dy || 0)];
        }
        return src.by || [0, 0];
      };
      const path = (x, y, cyc) => {
        const [bx, by] = dest();
        d.x = x;
        d.y = y;
        d.x2 = x + bx;
        d.y2 = y + by;
        const len = Math.hypot(bx, by);
        d.wait = sec(src.wait);
        // pasos enteros por tramo: `per` es el ciclo completo (ida, espera, vuelta, espera) en segundos
        d.n = !len ? 0 : src.per ? Math.max(1, Math.round((src.per * HZ) / 2) - d.wait) : Math.max(1, Math.round((len / (src.speed ?? 3)) * HZ));
        d.phase = sec(src.phase);
        if (cyc && d.n) R.period = lcm(R.period, 2 * (d.n + d.wait));
      };
      if (k === K.CP) Object.assign(d, { x: mx + 0.5, y: my + 1, tier: src.tier ?? 1, id: src.id || (typeof src.at === 'string' ? src.at : `cp${R.ents.length}`) });
      else if (k === K.PLAT) {
        const mode = { loop: 0, touch: 1, trig: 2, shuttle: 3 }[src.mode || 'loop'];
        path(mx, my, mode === 0);
        Object.assign(d, { w: src.w || 2, h: src.h || 0.4, ow: src.oneway !== false, mode, bit: trig(src.trig), loop: !!src.loop, skin: src.skin || '' });
      } else if (k === K.FALL) Object.assign(d, { x: mx, y: my, w: src.w || 2, h: 0.4, ow: true, delay: sec(src.delay ?? 0.3), regen: sec(src.regen ?? 3) });
      else if (k === K.SAW) {
        path(mx + 0.5, my + 0.5, !src.orbit && !src.hop);
        Object.assign(d, { r: src.r || 0.42, hp: src.hp || 0, skin: src.skin || '', orbit: null, hop: null });
        if (src.orbit) {
          const [cx, cy] = at(src.orbit.c, 'saw.orbit');
          d.orbit = { cx: cx + 0.5, cy: cy + 0.5, R: src.orbit.R, per: sec(src.orbit.per), a0: src.orbit.a0 || 0 };
          R.period = lcm(R.period, Math.abs(d.orbit.per));
        }
        if (src.hop) {
          d.hop = { H: src.hop.H, air: sec(src.hop.air ?? 1.2), per: sec(src.hop.per ?? 2) };
          R.period = lcm(R.period, d.hop.per);
        }
      } else if (k === K.SHOOT) {
        const sp = (src.speed ?? 6) / HZ;
        const [ax, ay] = src.dir || [1, 0];
        const n2 = Math.hypot(ax, ay) || 1;
        Object.assign(d, { x: mx + 0.5, y: my + 0.5, vx: (ax / n2) * sp, vy: (ay / n2) * sp, sp, aim: !!src.aim, every: sec(src.every ?? 1.5), phase: sec(src.phase), r: src.r || 0.17, grav: (src.grav || 0) / HZ / HZ, bit: trig(src.trig), burst: src.burst || 1, gap: sec(src.gap ?? 0.15), life: sec(src.life ?? 8), skin: src.skin || '' });
        if (!d.bit) R.period = lcm(R.period, d.every);
      } else if (k === K.TRAP) {
        const shape = { spikes: 0, block: 1, ball: 2 }[src.shape || 'spikes'];
        const dir = DIRS[src.dir || 'up'];
        const n3 = src.n || 1;
        const [vx, vy] = src.vel || [0, 0];
        const [ax, ay] = src.acc || [0, 0];
        Object.assign(d, {
          shape,
          dir,
          cnt: n3,
          x: shape === 2 ? mx + 0.5 : mx,
          y: shape === 2 ? my + 0.5 : my,
          w: shape === 0 ? (dir < 2 ? n3 : 1) : src.w || 1,
          h: shape === 0 ? (dir < 2 ? 1 : n3) : src.h || 1,
          r: src.r || 0.45,
          bit: trig(src.trig),
          delay: sec(src.delay),
          vx: vx / HZ,
          vy: vy / HZ,
          ax: ax / HZ / HZ,
          ay: ay / HZ / HZ,
          dist: src.dist || 0,
          ret: src.ret ? { after: sec(src.ret.after ?? 0.6), sp: (src.ret.speed ?? 2) / HZ } : null,
          rearm: !!src.rearm,
          solid: shape === 1 && src.solid !== false,
          deadly: src.deadly ?? shape !== 1,
          hidden: !!src.hidden,
          smash: !!src.smash,
          land: !!src.land,
          skin: src.skin || '',
        });
      } else if (k === K.GEYSER) {
        // el chorro ocupa `h` baldosas desde la marca hacia `dir`, con `w` de grosor
        const len = src.h || 3, th = src.w || 0.7, pad = (1 - th) / 2;
        const dir = DIRS[src.dir || 'up'];
        const rc = dir === 0 ? [mx + pad, my + 1 - len, th, len] : dir === 1 ? [mx + pad, my, th, len] : dir === 2 ? [mx + 1 - len, my + pad, len, th] : [mx, my + pad, len, th];
        Object.assign(d, { x: rc[0], y: rc[1], w: rc[2], h: rc[3], on: sec(src.on ?? 0.8), off: sec(src.off ?? 1.6), phase: sec(src.phase), warn: sec(src.warn ?? 0.5), bit: trig(src.trig), dir, skin: src.skin || '' });
        R.period = lcm(R.period, d.on + d.off);
      } else if (k === K.WIND) {
        const [px, py] = src.push || [0, 0];
        Object.assign(d, { x: mx, y: my, w: src.w || 4, h: src.h || 4, px: px / HZ, py: py / HZ / HZ, on: sec(src.on), off: sec(src.off), phase: sec(src.phase), bit: trig(src.trig) });
        if (d.on + d.off) R.period = lcm(R.period, d.on + d.off);
      } else if (k === K.SWITCH) Object.assign(d, { x: mx + 0.5, y: my + 1, bit: bit(src.sig), once: src.mode === 'once' });
      else if (k === K.GATE) Object.assign(d, { x: mx, y: my, w: src.w || 1, h: src.h || 1, bit: src.sig ? bit(src.sig) : 0, inv: !!src.inv, openIf: src.openIf || null, skin: src.skin || '' });
      else if (k === K.WALKER) {
        const sp = (src.speed ?? 2) / HZ;
        Object.assign(d, { x: mx + 0.5, y: my + 1, hw: src.hw || 0.32, hh: src.hh || 0.62, sp, hp: src.hp ?? 2, x1: 0, x2: 0, skin: src.skin || '' });
        if (src.range) {
          d.x1 = at(src.range[0], 'walker.range')[0] + 0.5;
          d.x2 = at(src.range[1], 'walker.range')[0] + 0.5;
        } else {
          // camina por su cornisa: hasta una pared o el borde
          const floor = (x) => x >= 0 && x < RW && my + 1 < RH && SOLID[R.tiles[(my + 1) * RW + x]] && !SOLID[R.tiles[my * RW + x]];
          let a = mx, b = mx;
          while (floor(a - 1)) a--;
          while (floor(b + 1)) b++;
          d.x1 = a + d.hw + 0.05;
          d.x2 = b + 1 - d.hw - 0.05;
        }
        if (d.x1 > d.x2) [d.x1, d.x2] = [d.x2, d.x1];
      } else if (k === K.CARROT) Object.assign(d, { x: mx + 0.5, y: my + 1, id: src.id });
      else if (k === K.SIGN) Object.assign(d, { x: mx + 0.5, y: my + 1, text: src.text, big: !!src.big });
      else if (k === K.WARP) Object.assign(d, { x: mx, y: my + 1 - (src.h || 2), w: src.w || 1, h: src.h || 2, to: src.to, spawn: src.spawn || 'start', bit: src.sig ? bit(src.sig) : 0, skin: src.skin || '' });
      else if (k === K.STONE) Object.assign(d, { x: mx + 0.5, y: my + 1, zone: src.zone, bit: src.sig ? bit(src.sig) : 0 });
      else if (k === K.BLINK) {
        Object.assign(d, { x: mx, y: my, w: src.w || 1, h: src.h || 1, on: sec(src.on ?? 1.5), off: sec(src.off ?? 1.5), phase: sec(src.phase), warn: sec(src.warn ?? 0.4) });
        R.period = lcm(R.period, d.on + d.off);
      } else if (k === K.BOSS) Object.assign(d, { x: mx + 0.5, y: my + 1, kind: src.kind, bit: bit('bossdead'), go: bit('bossgo') });
      else if (k === K.DECO) Object.assign(d, { x: mx + 0.5, y: my + 1, kind: src.kind, a: src.a || 0 });
      R.ents.push(d);
    });
  }
  if (def.lava) {
    const l = def.lava;
    R.lava = { y0: l.from ?? RH + 1, y1: l.to ?? 2, sp: (l.speed ?? 0.8) / HZ, delay: sec(l.delay), bit: trig(l.trig) };
  }
  if (R.period > 3600) R.period = 0; // sin ciclo común (evitarlo: el buscador no puede reconocer estados repetidos)
  R.ents.forEach((d, i) => {
    if (d.k === K.PLAT || d.k === K.FALL || d.k === K.GATE || d.k === K.BLINK || (d.k === K.TRAP && d.solid)) R.solids.push(i);
    if (d.k === K.WIND) R.winds.push(i);
    if (d.k === K.SWITCH || d.k === K.CP || d.k === K.WALKER || (d.k === K.SAW && d.hp)) R.targets.push(i);
    if (d.k === K.BOSS) R.boss = i;
  });
  return R;
}

// ---------------------------------------------------------------- estado

/**
 * Estado nuevo de una pantalla. ctx = { diff: 0 normal | 1 bravo | 2 terco, flags: {…}, carrots: [ids ya juntados] }.
 * La mula aparece en `spawn` (el nombre de una entrada de la pantalla, o [x, y] de sus pies).
 */
export function load(R, ctx = {}, spawn = 'start') {
  const flags = ctx.flags || {};
  const diff = ctx.diff || 0;
  const S = {
    R,
    t: 0,
    tiles: R.tiles,
    tsh: true,
    th: 0,
    sig: 0,
    h: { x: 0, y: 0, vy: 0, gr: false, aj: 1, jh: 0, coy: 0, buf: 0, face: 1, cool: 0, dead: false, cause: '', ride: -1, walk: 0 },
    e: [],
    shots: [],
    bullets: [],
    crumbs: [],
    lava: R.lava ? { y: R.lava.y0, tm: -1 } : null,
    boss: null,
    cpOn: -1,
    exit: null,
    warp: -1,
    cp: -1,
    pick: null,
    fx: null,
    m: ctx.margin || 0,
  };
  R.ents.forEach((d, i) => {
    let e = null;
    const off = (d.when && !flags[d.when]) || (d.unless && flags[d.unless]);
    if (off) e = { off: 1 };
    else if (d.k === K.CP) e = d.tier > 2 - diff ? { off: 1 } : {};
    else if (d.k === K.PLAT) e = { x: d.x, y: d.y, i: 0, dir: 1, wt: 0, on: d.mode === 0 ? 1 : 0, dx: 0, dy: 0 };
    else if (d.k === K.FALL) e = { x: d.x, y: d.y, st: 0, tm: 0, vy: 0, dx: 0, dy: 0 };
    else if (d.k === K.SAW) e = { x: d.x, y: d.y, i: 0, dir: 1, wt: 0, hp: d.hp, fl: 0, dead: 0, vis: 1 };
    else if (d.k === K.SHOOT) e = { tm: d.bit ? -1 : d.every - (d.phase % d.every), left: 0, gp: 0, fired: 0 };
    else if (d.k === K.TRAP) e = { x: d.x, y: d.y, vx: 0, vy: 0, st: 0, tm: 0, tr: 0, dx: 0, dy: 0 };
    else if (d.k === K.SWITCH) e = { on: 0, cool: 0 };
    else if (d.k === K.GATE) e = { open: d.openIf && flags[d.openIf] ? 2 : 0 };
    else if (d.k === K.WALKER) e = { x: d.x, dir: 1, hp: d.hp, fl: 0, dead: 0 };
    else if (d.k === K.CARROT) e = (ctx.carrots || []).includes(d.id) ? { off: 1 } : { got: 0 };
    else if (d.k === K.STONE) e = { got: 0 };
    else if (d.k === K.BLINK) e = { s: 0 };
    else if (d.k === K.BOSS) {
      if (!BOSS[d.kind]) throw new Error(`falta el jefe "${d.kind}"`);
      S.boss = BOSS[d.kind].init(S, d, ctx);
      S.boss.kind = d.kind;
      S.boss.ent = i;
      e = {};
    }
    S.e.push(e);
  });
  // lo que se mueve en ciclo puede arrancar corrido (phase)
  R.ents.forEach((d, i) => {
    const e = S.e[i];
    if (!e || e.off) return;
    if (d.phase && (d.k === K.SAW || (d.k === K.PLAT && d.mode === 0)) && !d.orbit && !d.hop) {
      for (let n = 0; n < d.phase; n++) glide(d, e);
      e.x = GX;
      e.y = GY;
    }
    if (d.k === K.SAW && (d.orbit || d.hop)) sawPos(S, d, e);
  });
  for (const i of R.solids) blinkNow(S, i);
  const p = Array.isArray(spawn) ? spawn : R.spawns[spawn] || R.spawns.start || Object.values(R.spawns)[0];
  if (!p) throw new Error(`pantalla ${R.id}: no hay punto de entrada "${spawn}"`);
  S.h.x = p[0];
  S.h.y = p[1];
  return S;
}

/** Copia del estado (las baldosas se comparten hasta que alguna cambia). */
export function clone(S) {
  S.tsh = true;
  const c = { ...S };
  c.h = { ...S.h };
  const n = S.e.length;
  const e = new Array(n);
  for (let i = 0; i < n; i++) {
    const o = S.e[i];
    e[i] = o ? { ...o } : null;
  }
  c.e = e;
  c.shots = S.shots.length ? S.shots.map((s) => ({ ...s })) : [];
  c.bullets = S.bullets.length ? S.bullets.map((s) => ({ ...s })) : [];
  c.crumbs = S.crumbs.length ? S.crumbs.map((s) => [s[0], s[1]]) : [];
  if (S.lava) c.lava = { ...S.lava };
  if (S.boss) c.boss = deep(S.boss);
  c.pick = null;
  c.fx = S.fx ? [] : null;
  return c;
}
function deep(o) {
  if (Array.isArray(o)) return o.map(deep);
  if (o && typeof o === 'object') {
    const c = {};
    for (const k in o) c[k] = deep(o[k]);
    return c;
  }
  return o;
}

// ---------------------------------------------------------------- baldosas

export function tileAt(S, tx, ty) {
  if (ty >= RH) return 0;
  if (tx < 0) tx = 0;
  else if (tx >= RW) tx = RW - 1;
  if (ty < 0) return S.tiles[tx] === T.S ? T.S : 0; // las paredes siguen para arriba; el cielo, no
  return S.tiles[ty * RW + tx];
}
function setTile(S, i, v) {
  if (S.tsh) {
    S.tiles = S.tiles.slice();
    S.tsh = false;
  }
  S.th = (S.th ^ Math.imul(i * 16 + S.tiles[i] + 1, 0x9e3779b1) ^ Math.imul(i * 16 + v + 1, 0x9e3779b1)) | 0;
  S.tiles[i] = v;
}
const fx = (S, k, x, y, a) => S.fx && S.fx.push({ k, x, y, a });

export function kill(S, cause) {
  const h = S.h;
  if (h.dead) return;
  h.dead = true;
  h.cause = cause;
  fx(S, 'die', h.x, h.y - P.h / 2, cause);
}

// ---------------------------------------------------------------- cajas sólidas de los objetos

let BX0 = 0, BY0 = 0, BX1 = 0, BY1 = 0, BOW = false, BDY = 0;
/** Deja en BX0… la caja sólida del objeto i; devuelve false si ahora no es sólido. */
function box(S, i) {
  const d = S.R.ents[i], e = S.e[i];
  if (e.off) return false;
  switch (d.k) {
    case K.PLAT:
      break;
    case K.FALL:
      if (e.st === 3) return false;
      break;
    case K.TRAP:
      if (e.st === 5) return false;
      break;
    case K.GATE:
      if (e.open) return false;
      BX0 = d.x; BY0 = d.y; BX1 = d.x + d.w; BY1 = d.y + d.h; BOW = false; BDY = 0;
      return true;
    case K.BLINK:
      if (!e.s) return false;
      BX0 = d.x; BY0 = d.y; BX1 = d.x + d.w; BY1 = d.y + d.h; BOW = false; BDY = 0;
      return true;
  }
  BX0 = e.x; BY0 = e.y; BX1 = e.x + d.w; BY1 = e.y + d.h; BOW = !!d.ow; BDY = e.dy;
  return true;
}
/** ¿La mula está metida en algo sólido (baldosas u objetos, salvo `skip`)? */
function stuck(S, skip) {
  const h = S.h;
  const x0 = h.x - P.hw, x1 = h.x + P.hw, y0 = h.y - P.h, y1 = h.y;
  for (let ty = Math.floor(y0); ty <= Math.ceil(y1) - 1; ty++) for (let tx = Math.floor(x0); tx <= Math.ceil(x1) - 1; tx++) if (SOLID[tileAt(S, tx, ty)]) return true;
  const sol = S.R.solids;
  for (let n = 0; n < sol.length; n++) {
    const i = sol[n];
    if (i === skip || !box(S, i) || BOW) continue;
    if (x1 > BX0 && x0 < BX1 && y1 > BY0 && y0 < BY1) return true;
  }
  return false;
}
/** Cajas de los objetos sólidos en este momento, de a cinco números: x0, y0, x1, y1 y cuál es (para el buscador). */
export function solidBoxes(S, out = []) {
  out.length = 0;
  const sol = S.R.solids;
  for (let n = 0; n < sol.length; n++) if (box(S, sol[n])) out.push(BX0, BY0, BX1, BY1, sol[n]);
  return out;
}
const over = (h, x0, y0, x1, y1) => h.x + P.hw > x0 && h.x - P.hw < x1 && h.y > y0 && h.y - P.h < y1;

// ---------------------------------------------------------------- movimiento de la mula

function moveX(S, dx) {
  const h = S.h;
  h.x += dx;
  const y0 = h.y - P.h, y1 = h.y;
  const ty0 = Math.floor(y0), ty1 = Math.ceil(y1) - 1;
  if (dx > 0) {
    const tx = Math.ceil(h.x + P.hw) - 1;
    for (let ty = ty0; ty <= ty1; ty++) {
      if (SOLID[tileAt(S, tx, ty)]) {
        h.x = tx - P.hw;
        break;
      }
    }
  } else {
    const tx = Math.floor(h.x - P.hw);
    for (let ty = ty0; ty <= ty1; ty++) {
      if (SOLID[tileAt(S, tx, ty)]) {
        h.x = tx + 1 + P.hw;
        break;
      }
    }
  }
  const sol = S.R.solids;
  for (let n = 0; n < sol.length; n++) {
    if (!box(S, sol[n]) || BOW) continue;
    if (h.x + P.hw > BX0 && h.x - P.hw < BX1 && y1 > BY0 && y0 < BY1) h.x = dx > 0 ? BX0 - P.hw : BX1 + P.hw;
  }
}

function moveY(S, dy) {
  const h = S.h;
  const py = h.y;
  h.y += dy;
  h.gr = false;
  h.ride = -1;
  const x0 = h.x - P.hw, x1 = h.x + P.hw;
  const tx0 = Math.floor(x0), tx1 = Math.ceil(x1) - 1;
  const sol = S.R.solids;
  if (dy >= 0) {
    let top = Infinity, ride = -1;
    const ty = Math.ceil(h.y) - 1;
    for (let tx = tx0; tx <= tx1; tx++) {
      const t = tileAt(S, tx, ty);
      if (SOLID[t] || (t === T.OW && py <= ty)) top = ty;
    }
    for (let n = 0; n < sol.length; n++) {
      const i = sol[n];
      if (!box(S, i)) continue;
      if (x1 > BX0 && x0 < BX1 && h.y > BY0 && h.y - P.h < BY1 && BY0 < top && (!BOW || py <= BY0 + Math.abs(BDY) + 1e-6)) {
        top = BY0;
        ride = i;
      }
    }
    if (top < Infinity) {
      const fall = h.vy;
      h.y = top;
      h.vy = 0;
      h.gr = true;
      h.aj = 1;
      h.ride = ride;
      if (ride < 0 && tileAt(S, Math.floor(h.x), top) === T.SPR) {
        h.vy = -P.spring;
        h.gr = false;
        fx(S, 'spring', h.x, h.y);
      } else if (fall > 0.16) fx(S, 'land', h.x, h.y);
    }
  } else {
    let bot = -Infinity;
    const ty = Math.floor(h.y - P.h);
    for (let tx = tx0; tx <= tx1; tx++) {
      let t = tileAt(S, tx, ty);
      if (t === T.HID && ty >= 0 && py - P.h >= ty + 1 - 1e-9) {
        setTile(S, ty * RW + tx, T.S); // el bloque escondido aparece con el cabezazo
        fx(S, 'hid', tx + 0.5, ty + 0.5);
        t = T.S;
      }
      if (SOLID[t]) bot = ty + 1;
    }
    for (let n = 0; n < sol.length; n++) {
      if (!box(S, sol[n]) || BOW) continue;
      if (x1 > BX0 && x0 < BX1 && h.y > BY0 && h.y - P.h < BY1 && BY1 > bot) bot = BY1;
    }
    if (bot > -Infinity) {
      h.y = bot + P.h;
      h.vy = 0;
    }
  }
}

function hero(S, inp) {
  const h = S.h, R = S.R;
  const dir = (inp & IN.R ? 1 : 0) - (inp & IN.L ? 1 : 0);
  if (dir) h.face = dir;
  let dx = dir * P.run;
  if (h.gr && h.ride < 0) {
    const t = tileAt(S, Math.floor(h.x), Math.floor(h.y + 0.01));
    if (t === T.CL) dx -= P.belt;
    else if (t === T.CRT) dx += P.belt;
  }
  for (let n = 0; n < R.winds.length; n++) {
    const d = R.ents[R.winds[n]];
    if (S.e[R.winds[n]]?.off || !active(S, d)) continue;
    if (h.x > d.x && h.x < d.x + d.w && h.y > d.y && h.y - P.h < d.y + d.h) {
      dx += d.px;
      h.vy += d.py;
      if (h.vy < -0.3) h.vy = -0.3;
    }
  }
  // salto: en el piso (o recién salido de una cornisa) el grande; en el aire, el segundo
  const j = inp & IN.J;
  if (j && !h.jh) h.buf = P.buffer;
  else if (h.buf > 0) h.buf--;
  if (h.gr) h.coy = P.coyote;
  else if (h.coy > 0) h.coy--;
  if (h.buf > 0) {
    if (h.coy > 0) {
      h.vy = -P.jump;
      h.coy = 0;
      h.buf = 0;
      fx(S, 'jump', h.x, h.y);
    } else if (h.aj > 0) {
      h.vy = -P.jump2;
      h.aj--;
      h.buf = 0;
      fx(S, 'jump2', h.x, h.y);
    }
  }
  if (!j && h.jh && h.vy < 0) h.vy *= P.cut;
  h.jh = j ? 1 : 0;
  h.vy += P.g;
  if (h.vy > P.maxFall) h.vy = P.maxFall;
  if (dx) moveX(S, dx);
  moveY(S, h.vy);
  if (h.gr && dir) h.walk += P.run;
  // patear una piedrita
  if (h.cool > 0) h.cool--;
  if (inp & IN.F && h.cool === 0 && S.shots.length < P.shots) {
    S.shots.push({ x: h.x + h.face * 0.3, y: h.y - 0.36, vx: h.face * P.shot, life: 90 });
    h.cool = P.cool;
    fx(S, 'shot', h.x, h.y);
  }
}

// ---------------------------------------------------------------- lo que se mueve

/** Avanza un objeto que va y viene entre dos puntos; devuelve su nueva posición en GX, GY. */
let GX = 0, GY = 0;
function glide(d, e) {
  if (e.wt > 0) e.wt--;
  else if (d.n) {
    e.i += e.dir;
    if (e.i >= d.n || e.i <= 0) {
      e.dir = -e.dir;
      e.wt = d.wait;
    }
  }
  const k = d.n ? e.i / d.n : 0;
  GX = d.x + (d.x2 - d.x) * k;
  GY = d.y + (d.y2 - d.y) * k;
  if (d.k === K.SAW) {
    e.x = GX;
    e.y = GY;
  }
}

/** Mueve un objeto sólido: lleva a la mula si la tiene arriba, la empuja si la toca y la aplasta si no hay lugar. */
function moveSolid(S, i, d, e, nx, ny) {
  const dx = nx - e.x, dy = ny - e.y;
  e.dx = dx;
  e.dy = dy;
  e.x = nx;
  e.y = ny;
  if (!dx && !dy) return;
  const h = S.h;
  if (h.dead) return;
  if (h.ride === i) {
    h.y = ny;
    if (dx) {
      const r = h.ride;
      moveX(S, dx);
      h.ride = r;
    }
    if (dy < 0 && stuck(S, i)) kill(S, 'crush');
    return;
  }
  if (d.ow || !over(h, nx, ny, nx + d.w, ny + d.h)) return;
  if (Math.abs(dy) >= Math.abs(dx)) {
    if (dy < 0) {
      h.y = ny;
      h.vy = 0;
      h.gr = true;
      h.aj = 1;
      h.ride = i;
    } else {
      h.y = ny + d.h + P.h;
      if (h.vy < dy) h.vy = dy;
    }
  } else h.x = dx > 0 ? nx + d.w + P.hw : nx - P.hw;
  if (stuck(S, i)) kill(S, 'crush');
}

const active = (S, d) => (!d.bit || (S.sig & d.bit) !== 0) && (!(d.on + d.off) || (S.t + d.phase) % (d.on + d.off) < d.on);
/** Géiser: 2 = quema, 1 = avisa, 0 = apagado. */
export function geyserState(S, d) {
  if (d.bit && !(S.sig & d.bit)) return 0;
  const per = d.on + d.off;
  const ph = (S.t + d.phase) % per;
  return ph < d.on ? 2 : ph >= per - d.warn ? 1 : 0;
}
/** Bloque que parpadea: cuánto falta para que cambie (para dibujar el aviso). */
export function blinkPhase(S, d) {
  const per = d.on + d.off;
  const ph = (S.t + d.phase) % per;
  return ph < d.on ? { solid: true, left: d.on - ph } : { solid: false, left: per - ph };
}
function blinkNow(S, i) {
  const d = S.R.ents[i], e = S.e[i];
  if (d.k !== K.BLINK || !e || e.off) return;
  const want = (S.t + d.phase) % (d.on + d.off) < d.on;
  if (!want) e.s = 0;
  else if (!e.s && !over(S.h, d.x, d.y, d.x + d.w, d.y + d.h)) e.s = 1; // no se cierra con la mula adentro
}
/** Posición de una rodadora que gira o que salta (las demás usan glide). */
function sawPos(S, d, e) {
  if (d.orbit) {
    const o = d.orbit;
    const a = 2 * Math.PI * (S.t / o.per + o.a0);
    e.x = o.cx + o.R * Math.cos(a);
    e.y = o.cy + o.R * Math.sin(a);
  } else if (d.hop) {
    const u = (S.t + d.phase) % d.hop.per;
    if (u < d.hop.air) {
      const s = u / d.hop.air;
      e.y = d.y - d.hop.H * 4 * s * (1 - s);
      e.vis = 1;
    } else {
      e.y = d.y;
      e.vis = 0;
    }
  } else glide(d, e);
}

function movers(S) {
  const R = S.R, h = S.h;
  // zonas que prenden señales
  for (let n = 0; n < R.zones.length; n++) {
    const z = R.zones[n];
    const inside = !h.dead && over(h, z.x, z.y, z.x + z.w, z.y + z.h) && (!z.ground || h.gr);
    if (inside) {
      if (!(S.sig & z.bit)) fx(S, 'zone', z.x, z.y);
      S.sig |= z.bit;
    } else if (!z.once) S.sig &= ~z.bit;
  }
  for (let i = 0; i < R.ents.length; i++) {
    const d = R.ents[i], e = S.e[i];
    if (!e || e.off) continue;
    switch (d.k) {
      case K.PLAT: {
        if (e.on === 0) {
          if (d.mode === 2 ? S.sig & d.bit : h.ride === i) e.on = 1;
          else {
            e.dx = e.dy = 0;
            break;
          }
        }
        if (e.on === 2) {
          e.dx = e.dy = 0;
          break;
        }
        const i0 = e.i;
        glide(d, e);
        moveSolid(S, i, d, e, GX, GY);
        if (e.i === d.n && i0 !== d.n && (d.mode === 1 || (d.mode === 2 && !d.loop))) e.on = 2; // llegó y se queda
        break;
      }
      case K.FALL:
        if (e.st === 0) {
          e.dx = e.dy = 0;
          if (h.ride === i) {
            e.st = 1;
            e.tm = d.delay;
            fx(S, 'creak', e.x + d.w / 2, e.y);
          }
        } else if (e.st === 1) {
          if (--e.tm <= 0) e.st = 2;
        } else if (e.st === 2) {
          e.vy = Math.min(e.vy + P.g, 0.4);
          moveSolid(S, i, d, e, e.x, e.y + e.vy);
          if (e.y > RH + 1) {
            e.st = 3;
            e.tm = d.regen;
          }
        } else if (d.regen && --e.tm <= 0 && !over(h, d.x, d.y, d.x + d.w, d.y + d.h)) {
          e.st = 0;
          e.x = d.x;
          e.y = d.y;
          e.vy = 0;
        }
        break;
      case K.TRAP:
        trap(S, i, d, e);
        break;
      case K.GATE:
        if (e.open === 2) break; // abierta para siempre (por algo que ya pasó en la partida)
        if (d.bit) {
          const want = ((S.sig & d.bit) !== 0) !== d.inv;
          if (want && !e.open) {
            e.open = 1;
            fx(S, 'gate', d.x + d.w / 2, d.y + d.h / 2);
          } else if (!want && e.open && !over(h, d.x, d.y, d.x + d.w, d.y + d.h)) {
            e.open = 0;
            fx(S, 'gate', d.x + d.w / 2, d.y + d.h / 2);
          }
        }
        break;
      case K.BLINK:
        blinkNow(S, i);
        break;
    }
  }
}

function trap(S, i, d, e) {
  const move = (nx, ny) => {
    if (d.solid) moveSolid(S, i, d, e, nx, ny);
    else {
      e.x = nx;
      e.y = ny;
    }
  };
  if (e.st === 0) {
    e.dx = e.dy = 0;
    if (S.sig & d.bit) {
      e.st = 1;
      e.tm = d.delay;
      fx(S, 'trap', e.x, e.y);
    }
  }
  if (e.st === 1) {
    if (e.tm-- <= 0) {
      e.st = 2;
      e.vx = d.vx;
      e.vy = d.vy;
      e.tr = 0;
      fx(S, 'go', e.x, e.y);
    }
  } else if (e.st === 2) {
    e.vx += d.ax;
    e.vy += d.ay;
    let nx = e.x + e.vx, ny = e.y + e.vy;
    e.tr += Math.hypot(e.vx, e.vy);
    let stop = false;
    if (d.dist && e.tr >= d.dist) {
      const len = Math.hypot(nx - d.x, ny - d.y) || 1;
      nx = d.x + ((nx - d.x) / len) * d.dist;
      ny = d.y + ((ny - d.y) / len) * d.dist;
      stop = true;
    }
    if (d.smash || d.land) {
      // choca contra lo sólido: se rompe (smash) o queda apoyado (land, solo cayendo)
      const horiz = Math.abs(e.vx) > Math.abs(e.vy);
      const ball = d.shape === 2;
      const px = horiz ? (ball ? nx + Math.sign(e.vx) * d.r : e.vx > 0 ? nx + d.w : nx) : ball ? nx : nx + d.w / 2;
      const py = horiz ? (ball ? ny : ny + d.h / 2) : ball ? ny + Math.sign(e.vy) * d.r : e.vy > 0 ? ny + d.h : ny;
      const tx = Math.floor(horiz && e.vx > 0 ? px - 1e-9 : px), ty = Math.floor(!horiz && e.vy > 0 ? py - 1e-9 : py);
      if (ty >= 0 && SOLID[tileAt(S, tx, ty)]) {
        if (d.land && !horiz && e.vy > 0) {
          move(nx, ty - (ball ? d.r : d.h));
          e.st = 3;
          e.tm = 1e9;
          fx(S, 'thud', px, ty);
        } else {
          e.st = 5;
          fx(S, 'smash', px, py, d.skin);
        }
        return;
      }
    }
    move(nx, ny);
    if (stop) {
      e.st = 3;
      e.tm = d.ret ? d.ret.after : 1e9;
      fx(S, 'thud', nx, ny);
    } else if (nx < -6 || nx > RW + 6 || ny < -8 || ny > RH + 4) e.st = 5;
  } else if (e.st === 3) {
    e.dx = e.dy = 0;
    if (d.ret && --e.tm <= 0) e.st = 4;
  } else if (e.st === 4) {
    const rx = d.x - e.x, ry = d.y - e.y;
    const len = Math.hypot(rx, ry);
    if (len <= d.ret.sp) {
      move(d.x, d.y);
      e.st = d.rearm ? 0 : 6;
      // una trampa que se rearma espera a que la señal se apague, si es de las que se apagan
    } else move(e.x + (rx / len) * d.ret.sp, e.y + (ry / len) * d.ret.sp);
  }
}

function bullet(S, x, y, vx, vy, r, g, life, skin) {
  S.bullets.push({ x, y, vx, vy, r, g, life, skin });
}
/** Para los jefes: agrega una bala enemiga. */
export const addBullet = bullet;

function hazards(S) {
  const R = S.R, h = S.h;
  for (let i = 0; i < R.ents.length; i++) {
    const d = R.ents[i], e = S.e[i];
    if (!e || e.off) continue;
    if (d.k === K.SAW) {
      if (e.dead) continue;
      sawPos(S, d, e);
      if (e.fl > 0) e.fl--;
    } else if (d.k === K.SHOOT) {
      let fire = false;
      if (d.bit) {
        // ráfaga cuando se prende su señal
        if (S.sig & d.bit) {
          if (!e.fired) {
            e.fired = 1;
            e.left = d.burst;
            e.gp = 0;
          }
        } else e.fired = 0;
        if (e.left > 0) {
          if (e.gp-- <= 0) {
            fire = true;
            e.left--;
            e.gp = d.gap;
          }
        }
      } else if (--e.tm <= 0) {
        fire = true;
        e.tm = d.every;
      }
      if (fire) {
        let vx = d.vx, vy = d.vy;
        if (d.aim) {
          const ax = h.x - d.x, ay = h.y - P.h / 2 - d.y;
          const len = Math.hypot(ax, ay) || 1;
          vx = (ax / len) * d.sp;
          vy = (ay / len) * d.sp;
        }
        bullet(S, d.x, d.y, vx, vy, d.r, d.grav, d.life, d.skin);
        fx(S, 'pew', d.x, d.y);
      }
    } else if (d.k === K.WALKER) {
      if (e.dead) continue;
      e.x += e.dir * d.sp;
      if (e.x >= d.x2) {
        e.x = d.x2;
        e.dir = -1;
      } else if (e.x <= d.x1) {
        e.x = d.x1;
        e.dir = 1;
      }
      if (e.fl > 0) e.fl--;
    } else if (d.k === K.SWITCH) {
      if (e.cool > 0) e.cool--;
    }
  }
  // balas enemigas
  const B = S.bullets;
  for (let n = B.length - 1; n >= 0; n--) {
    const b = B[n];
    b.vy += b.g;
    b.x += b.vx;
    b.y += b.vy;
    if (--b.life <= 0 || b.x < -1 || b.x > RW + 1 || b.y < -6 || b.y > RH + 1 || (b.y > 0 && SOLID[tileAt(S, Math.floor(b.x), Math.floor(b.y))])) {
      if (b.life > 0 && b.y > 0 && b.y < RH) fx(S, 'puff', b.x, b.y);
      B.splice(n, 1);
    }
  }
  // lava que sube
  if (S.lava) {
    const l = R.lava, L = S.lava;
    if (L.tm < 0) {
      if (!l.bit || S.sig & l.bit) L.tm = l.delay;
    } else if (L.tm > 0) L.tm--;
    else if (L.y > l.y1) L.y = Math.max(l.y1, L.y - l.sp);
  }
}

// ---------------------------------------------------------------- piedritas

function shots(S) {
  const R = S.R, A = S.shots;
  for (let n = A.length - 1; n >= 0; n--) {
    const s = A[n];
    const px = s.x;
    s.x += s.vx;
    let gone = --s.life <= 0 || s.x < -0.5 || s.x > RW + 0.5;
    if (!gone) {
      const tx = Math.floor(s.x), ty = Math.floor(s.y);
      const t = tileAt(S, tx, ty);
      if (SOLID[t]) {
        gone = true;
        if (t === T.BRK && tx >= 0 && tx < RW && ty >= 0) {
          setTile(S, ty * RW + tx, T.E);
          fx(S, 'break', tx + 0.5, ty + 0.5);
        } else fx(S, 'tick', s.x, s.y);
      }
    }
    const lo = Math.min(px, s.x) - 0.1, hi = Math.max(px, s.x) + 0.1;
    if (!gone) {
      for (let k = 0; k < R.solids.length; k++) {
        if (!box(S, R.solids[k]) || BOW) continue;
        if (hi > BX0 && lo < BX1 && s.y > BY0 && s.y < BY1) {
          gone = true;
          fx(S, 'tick', s.x, s.y);
          break;
        }
      }
    }
    if (!gone) {
      for (let k = 0; k < R.targets.length; k++) {
        const i = R.targets[k], d = R.ents[i], e = S.e[i];
        if (e.off) continue;
        if (d.k === K.SWITCH) {
          if (hi > d.x - 0.4 && lo < d.x + 0.4 && s.y > d.y - 1 && s.y < d.y) {
            gone = true;
            if (e.cool === 0 && !(d.once && e.on)) {
              e.on ^= 1;
              e.cool = 12;
              S.sig ^= d.bit;
              fx(S, 'switch', d.x, d.y - 0.5);
            }
          }
        } else if (d.k === K.CP) {
          if (S.cpOn !== i && hi > d.x - 0.45 && lo < d.x + 0.45 && s.y > d.y - 1 && s.y < d.y) {
            gone = true;
            S.cpOn = i;
            S.cp = i;
            fx(S, 'cp', d.x, d.y);
          }
        } else if (d.k === K.WALKER) {
          if (!e.dead && hi > e.x - d.hw && lo < e.x + d.hw && s.y > d.y - d.hh && s.y < d.y) {
            gone = true;
            e.fl = 6;
            if (--e.hp <= 0) {
              e.dead = 1;
              fx(S, 'pop', e.x, d.y - d.hh / 2, d.skin);
            } else fx(S, 'hurt', e.x, d.y - d.hh / 2);
          }
        } else if (d.k === K.SAW) {
          if (!e.dead && e.vis && hi > e.x - d.r && lo < e.x + d.r && s.y > e.y - d.r && s.y < e.y + d.r) {
            gone = true;
            e.fl = 6;
            if (--e.hp <= 0) {
              e.dead = 1;
              fx(S, 'pop', e.x, e.y, d.skin);
            } else fx(S, 'hurt', e.x, e.y);
          }
        }
        if (gone) break;
      }
    }
    if (!gone && S.boss && BOSS[S.boss.kind].shot(S, s.x, s.y, lo, hi)) gone = true;
    if (gone) A.splice(n, 1);
  }
}

// ---------------------------------------------------------------- contactos

/** ¿La caja toca el pincho que ocupa la baldosa (sx, sy) y apunta hacia `dir`? (0 arriba, 1 abajo, 2 izquierda, 3 derecha) */
export function hitSpike(dir, sx, sy, x0, y0, x1, y1) {
  if (dir < 2) {
    const cx = sx + 0.5;
    const px = cx < x0 ? x0 : cx > x1 ? x1 : cx;
    const dd = Math.abs(px - cx);
    if (dd >= SPIKE_B) return false;
    const edge = SPIKE_A + (dd / SPIKE_B) * (1 - SPIKE_A);
    return dir === 0 ? y1 > sy + edge && y0 < sy + 1 : y0 < sy + 1 - edge && y1 > sy;
  }
  const cy = sy + 0.5;
  const py = cy < y0 ? y0 : cy > y1 ? y1 : cy;
  const dd = Math.abs(py - cy);
  if (dd >= SPIKE_B) return false;
  const edge = SPIKE_A + (dd / SPIKE_B) * (1 - SPIKE_A);
  return dir === 2 ? x1 > sx + edge && x0 < sx + 1 : x0 < sx + 1 - edge && x1 > sx;
}
const hitCircle = (cx, cy, r, x0, y0, x1, y1) => {
  const px = cx < x0 ? x0 : cx > x1 ? x1 : cx;
  const py = cy < y0 ? y0 : cy > y1 ? y1 : cy;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy) < r * r;
};

function touch(S) {
  const R = S.R, h = S.h, m = S.m;
  const x0 = h.x - P.hw - m, x1 = h.x + P.hw + m, y0 = h.y - P.h - m, y1 = h.y + m;
  // baldosas: pinchos, lava y bloques de mentira
  for (let ty = Math.floor(y0); ty <= Math.ceil(y1) - 1; ty++) {
    if (ty < 0 || ty >= RH) continue;
    for (let tx = Math.floor(x0); tx <= Math.ceil(x1) - 1; tx++) {
      if (tx < 0 || tx >= RW) continue;
      const t = S.tiles[ty * RW + tx];
      if (t >= T.UP && t <= T.RT) {
        if (hitSpike(t - T.UP, tx, ty, x0, y0, x1, y1)) return kill(S, 'spike');
      } else if (t === T.LAVA) {
        if (y1 > ty + 0.2) return kill(S, 'lava');
      } else if (t === T.FAKE && over(h, tx, ty, tx + 1, ty + 1)) dissolve(S, tx, ty);
    }
  }
  if (S.lava && h.y > S.lava.y + 0.15 - m) return kill(S, 'lava');
  for (let i = 0; i < R.ents.length; i++) {
    const d = R.ents[i], e = S.e[i];
    if (e && e.off) continue;
    switch (d.k) {
      case K.SAW:
        if (!e.dead && e.vis && hitCircle(e.x, e.y, d.r * 0.92, x0, y0, x1, y1)) return kill(S, d.hp ? 'bug' : 'saw');
        break;
      case K.WALKER:
        if (!e.dead && x1 > e.x - d.hw && x0 < e.x + d.hw && y1 > d.y - d.hh && y0 < d.y) return kill(S, 'bug');
        break;
      case K.TRAP:
        if (!d.deadly || e.st === 5 || (d.hidden && e.st === 0)) break;
        if (d.shape === 0) {
          for (let n = 0; n < d.cnt; n++) if (hitSpike(d.dir, d.dir < 2 ? e.x + n : e.x, d.dir < 2 ? e.y : e.y + n, x0, y0, x1, y1)) return kill(S, 'spike');
        } else if (d.shape === 1) {
          if (x1 > e.x + 0.06 && x0 < e.x + d.w - 0.06 && y1 > e.y + 0.06 && y0 < e.y + d.h - 0.06) return kill(S, 'crush');
        } else if (hitCircle(e.x, e.y, d.r * 0.92, x0, y0, x1, y1)) return kill(S, 'rock');
        break;
      case K.GEYSER:
        if (geyserState(S, d) === 2 && x1 > d.x && x0 < d.x + d.w && y1 > d.y && y0 < d.y + d.h) return kill(S, 'geyser');
        break;
      case K.CP:
        if (S.cpOn !== i && over(h, d.x - 0.5, d.y - 1, d.x + 0.5, d.y)) {
          S.cpOn = i;
          S.cp = i;
          fx(S, 'cp', d.x, d.y);
        }
        break;
      case K.CARROT:
        if (!e.got && over(h, d.x - 0.4, d.y - 0.95, d.x + 0.4, d.y - 0.05)) {
          e.got = 1;
          (S.pick ||= []).push({ k: 'carrot', id: d.id });
          fx(S, 'carrot', d.x, d.y - 0.5);
        }
        break;
      case K.STONE:
        if (!e.got && (!d.bit || S.sig & d.bit) && over(h, d.x - 0.45, d.y - 0.9, d.x + 0.45, d.y)) {
          e.got = 1;
          (S.pick ||= []).push({ k: 'stone', id: d.zone });
          fx(S, 'stone', d.x, d.y - 0.5);
        }
        break;
      case K.WARP:
        if ((!d.bit || S.sig & d.bit) && h.x > d.x && h.x < d.x + d.w && h.y > d.y && h.y - P.h < d.y + d.h) S.warp = i;
        break;
    }
  }
  const B = S.bullets;
  for (let n = 0; n < B.length; n++) if (hitCircle(B[n].x, B[n].y, B[n].r, x0, y0, x1, y1)) return kill(S, 'shot');
  if (S.boss) {
    const c = BOSS[S.boss.kind].hit(S, x0, y0, x1, y1);
    if (c) return kill(S, c);
  }
  // baldosas flojas: empiezan a romperse cuando se las pisa
  if (h.gr && h.ride < 0) {
    const ty = Math.floor(h.y + 0.01);
    if (ty >= 0 && ty < RH) {
      for (let tx = Math.max(0, Math.floor(h.x - P.hw)); tx <= Math.min(RW - 1, Math.ceil(h.x + P.hw) - 1); tx++) {
        const i = ty * RW + tx;
        if (S.tiles[i] === T.CR && !S.crumbs.some((c) => c[0] === i)) {
          S.crumbs.push([i, CRUMBLE]);
          fx(S, 'creak', tx + 0.5, ty);
        }
      }
    }
  }
  // salidas
  const ex = R.exits;
  const pick = (list, v) => list?.find((o) => v >= o.a && v < o.b)?.to || null;
  if (h.x < 0) {
    S.exit = pick(ex.left, h.y) ? 'left' : null;
    if (!S.exit) h.x = Math.max(h.x, P.hw);
  } else if (h.x > RW) {
    S.exit = pick(ex.right, h.y) ? 'right' : null;
    if (!S.exit) h.x = Math.min(h.x, RW - P.hw);
  } else if (h.y < -0.3 && pick(ex.up, h.x)) S.exit = 'up';
  else if (h.y - P.h > RH) {
    if (pick(ex.down, h.x)) S.exit = 'down';
    else if (h.y - P.h > RH + 0.5) kill(S, 'fall');
  }
}
/** A qué pantalla lleva la salida por la que está saliendo la mula (o null). */
export function exitTo(S) {
  if (!S.exit) return null;
  const list = S.R.exits[S.exit];
  const v = S.exit === 'left' || S.exit === 'right' ? S.h.y : S.h.x;
  return list?.find((o) => v >= o.a && v < o.b)?.to || null;
}

/** Un bloque de mentira se deshace entero al tocarlo. */
function dissolve(S, tx, ty) {
  const st = [[tx, ty]];
  while (st.length) {
    const [x, y] = st.pop();
    if (x < 0 || y < 0 || x >= RW || y >= RH || S.tiles[y * RW + x] !== T.FAKE) continue;
    setTile(S, y * RW + x, T.E);
    fx(S, 'fake', x + 0.5, y + 0.5);
    st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
}

function crumbs(S) {
  const C = S.crumbs;
  for (let n = C.length - 1; n >= 0; n--) {
    const c = C[n];
    if (c[1] > 0) {
      if (--c[1] === 0) {
        setTile(S, c[0], T.E);
        fx(S, 'crumble', (c[0] % RW) + 0.5, Math.floor(c[0] / RW) + 0.5);
        c[1] = -REGEN;
      }
    } else if (++c[1] >= 0) {
      const x = c[0] % RW, y = Math.floor(c[0] / RW);
      if (over(S.h, x, y, x + 1, y + 1)) c[1] = -1;
      else {
        setTile(S, c[0], T.CR);
        C.splice(n, 1);
      }
    }
  }
}

// ---------------------------------------------------------------- un paso

/** Avanza la pantalla un paso con las teclas `inp` (bits de IN). */
export function step(S, inp) {
  S.exit = null;
  S.warp = -1;
  S.cp = -1;
  S.pick = null;
  if (S.fx) S.fx.length = 0;
  S.t++;
  movers(S);
  if (!S.h.dead) hero(S, inp);
  hazards(S);
  shots(S);
  if (S.boss) BOSS[S.boss.kind].step(S);
  if (!S.h.dead) touch(S);
  crumbs(S);
  return S;
}

// ---------------------------------------------------------------- para el buscador de soluciones

/**
 * Clave del estado para no repetir búsquedas: dos estados con la misma clave se consideran iguales.
 * q = { x, y, v }: cuántas divisiones por baldosa (o por unidad de velocidad) se distinguen.
 */
export function key(S, q, useShots) {
  const h = S.h;
  let a = Math.round(h.x * q.x) * 73856093 ^ Math.round(h.y * q.y) * 19349663 ^ Math.round(h.vy * q.v) * 83492791;
  let b = (h.gr ? 1 : 0) | (h.aj << 1) | (h.jh << 2) | (h.coy > 0 ? 8 : 0) | (h.buf > 0 ? 16 : 0);
  if (useShots) b |= (h.face > 0 ? 32 : 0) | (h.cool > 0 ? 64 : 0);
  const mix = (v) => {
    a = Math.imul(a ^ v, 0x85ebca6b);
    a ^= a >>> 13;
    b = Math.imul(b + v, 0xc2b2ae35);
    b ^= b >>> 16;
  };
  mix(S.sig);
  mix(S.th);
  mix(S.cpOn);
  const R = S.R;
  if (R.period) mix(S.t % R.period);
  else mix(S.t);
  for (let i = 0; i < R.ents.length; i++) {
    const e = S.e[i];
    if (!e || e.off) continue;
    switch (R.ents[i].k) {
      case K.PLAT:
        if (R.ents[i].mode !== 0 || !R.period) mix(e.i ^ (e.dir << 14) ^ (e.wt << 16) ^ (e.on << 28));
        break;
      case K.FALL:
        mix(e.st ^ (e.tm << 3) ^ Math.round(e.y * 16) << 12);
        break;
      case K.SAW:
        mix((e.dead << 8) ^ e.hp);
        if (!R.period) mix(e.i ^ (e.dir << 14) ^ (e.wt << 16));
        break;
      case K.SHOOT:
        if (R.ents[i].bit || !R.period) mix(e.tm ^ (e.left << 12) ^ (e.gp << 16) ^ (e.fired << 24));
        break;
      case K.TRAP:
        mix(e.st ^ (Math.round(e.x * 8) << 4) ^ (Math.round(e.y * 8) << 16));
        mix(e.tm);
        break;
      case K.SWITCH:
        mix(e.on);
        break;
      case K.GATE:
        mix(e.open);
        break;
      case K.WALKER:
        mix(Math.round(e.x * 16) ^ (e.dir << 12) ^ (e.dead << 14) ^ (e.hp << 16));
        break;
      case K.CARROT:
      case K.STONE:
        mix(e.got);
        break;
      case K.BLINK:
        mix(e.s);
        break;
    }
  }
  for (let n = 0; n < S.bullets.length; n++) mix(Math.round(S.bullets[n].x * 8) ^ (Math.round(S.bullets[n].y * 8) << 12));
  if (useShots) for (let n = 0; n < S.shots.length; n++) mix(Math.round(S.shots[n].x * 4) ^ (Math.round(S.shots[n].y * 4) << 12));
  for (let n = 0; n < S.crumbs.length; n++) mix(S.crumbs[n][0] ^ (S.crumbs[n][1] << 10));
  if (S.lava) mix(Math.round(S.lava.y * 16) ^ (S.lava.tm << 12));
  return (a >>> 0) * 2097152 + (b & 2097151);
}
