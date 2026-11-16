/**
 * Bengala — simulación pura y determinista (sin DOM, sin Date, sin Math.random).
 *
 * La misma sim corre en el navegador (gira, show del día, sprint y duelo), en el servidor (lleva una sim por jugador y la avanza
 * con las acciones que recibe) y en las pruebas. Para que dé exactamente lo mismo en cualquier motor de JavaScript solo usa
 * + − × ÷ √, redondeos y operaciones de bits: nada de sin, cos, pow, exp ni log.
 *
 * - `create(opts)` arma un estado; `step(S, out)` avanza un tick (TPS por segundo) y, si recibe `out`, deja ahí los eventos para
 *   dibujar y sonar; `act(S, accion, out)` aplica una acción del jugador en el tick actual y devuelve si valió.
 * - Acciones: ['T', x, y] toque en el cielo · ['B', mortero, cuántos] · ['U', mejora] · ['R', receta] · ['F'] gran final ·
 *   ['G'] empezar la función · ['H', paso] ensayo del tutorial · ['N', nodo] · ['P'] viajar a la próxima sede ·
 *   ['X'] cobrar doble la última función. En duelo, diario y reto solo valen T, B, U, R y F (las que viajan en el registro).
 * - El estado es JSON puro: `dump` lo copia y `load` lo restaura; `S.m` (modificadores) se rearma con `recalc`.
 *
 * Se juega por funciones: `S.run` existe mientras dura una. En la gira la función empieza con ['G'] y entre una y otra el
 * reloj de la sim está quieto (ahí se compra). En las partidas por tiempo (`S.plan`) las funciones y los ratos de taller van
 * por horario (ver RACE en data.js). Sin función no se lanza ni dispara nada.
 *
 * Cómo se juega la plata: cada mortero dispara cada `period` ticks a su manera y sus cohetes valen lo que el mortero produce en
 * ese tiempo. Al estallar, un cohete deja una onda que dura unos ticks y prende todo cohete en vuelo, farolito o cartel de
 * avión que toque: cada eslabón de esa cadena paga más que el anterior, hasta el tope de cadena. La ovación (0 a 100)
 * multiplica todo y, llena, se queda llena hasta que se usa en el Gran Final.
 */
import {
  TPS, FW, FH, SKY_MAX, GENS, COST_GROWTH, MAX_OWNED, MILESTONES, UPS, REC_N, REC_COST, REC_ROW_MUL, REC_COL_STEP, NC, NS, NODES, CONS, VENUES,
  SHOW_LEN, RACE, GROUND, FAME_PCT, POSTAL_ALL, POSTAL_POLV, LAP_GOAL, STAR_K, STAR_L0, STAR_PCT, SPRINT, ACH, ACH_PCT,
} from './data.js';

const NG = GENS.length;
const MAN_RISE = 7; // ticks que tarda en llegar un cohete lanzado a mano
const IGNITE = 2; // ticks entre que una onda prende un cohete y que estalla (la cadena se ve como una ola)
const FIN_TAP = 3; // en el Gran Final los toques son gratis, pero uno cada 3 ticks como mucho
const TMP = { x: 0, y: 0 };

// ---------------------------------------------------------------- azar con semilla (sfc32 sobre 4 enteros)
export function rnd(st) {
  const a = st[0];
  const b = st[1];
  const c = st[2];
  const d = st[3];
  const t = (((a + b) | 0) + d) | 0;
  st[3] = (d + 1) | 0;
  st[0] = b ^ (b >>> 9);
  st[1] = (c + (c << 3)) | 0;
  st[2] = (((c << 21) | (c >>> 11)) + t) | 0;
  return (t >>> 0) / 4294967296;
}
export const rint = (st, n) => Math.floor(rnd(st) * n);
export function seedRng(str) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const st = [(h1 ^ h2 ^ h3 ^ h4) | 0, (h2 ^ h1) | 0, (h3 ^ h1) | 0, (h4 ^ h1) | 0];
  for (let i = 0; i < 12; i++) rnd(st);
  return st;
}

// ---------------------------------------------------------------- costos (tabla por multiplicación repetida, sin pow)
const COST = GENS.map((g) => [g.cost]);
function unitCost(i, n) {
  const tb = COST[i];
  while (tb.length <= n) tb.push(Math.ceil(tb[tb.length - 1] * COST_GROWTH));
  return tb[n];
}
/** Lo que cuestan los próximos `k` morteros del tipo `i`. */
export function genCost(S, i, k = 1) {
  let sum = 0;
  for (let j = 0; j < k; j++) sum += Math.ceil(unitCost(i, S.gens[i] + j) * S.m.cost);
  return sum;
}
/** Cuántos morteros del tipo `i` alcanza a comprar con lo que tiene (hasta `max`). */
export function genAfford(S, i, max = 1000) {
  let left = S.ch;
  let n = 0;
  while (n < max && S.gens[i] + n < MAX_OWNED) {
    const c = Math.ceil(unitCost(i, S.gens[i] + n) * S.m.cost);
    if (c > left) break;
    left -= c;
    n++;
  }
  return n;
}
export const recCost = (S) => (S.recN - 1 < REC_COST.length ? Math.ceil(REC_COST[S.recN - 1] * S.m.recCost) : Infinity);
export const upAvail = (S, i) => {
  const u = UPS[i];
  return !!u && !S.ups[i] && (u.prev < 0 || !!S.ups[u.prev]) && (u.gen < 0 || S.gens[u.gen] >= u.need);
};
export const nodeAvail = (S, i) => {
  const n = NODES[i];
  return !!n && !S.nodes[i] && (n.k === 0 || !!S.nodes[i - 1]);
};
export const consDone = (S, c) => {
  for (let k = 0; k < 10; k++) if (!S.nodes[c * 10 + k]) return false;
  return true;
};

// ---------------------------------------------------------------- modificadores
function applyFx(m, list) {
  for (let i = 0; i < list.length; i++) {
    const op = list[i][0];
    const key = list[i][1];
    const v = list[i][2];
    if (op === 'gen') {
      if (typeof key === 'number') m.gen[key] *= v;
      else for (let g = key[0]; g <= key[1]; g++) m.gen[g] *= v;
    } else if (op === 'mul') m[key] *= v;
    else if (op === 'add') m[key] += v;
    else m[key] = v;
  }
}

/** Rearma los modificadores (`S.m`), la producción base por segundo (`S.raw`) y la lista de recetas descubiertas (`S.disc`). */
export function recalc(S) {
  const m = {
    all: 1, gen: GENS.map(() => 1), cost: 1, mileMul: 2,
    manBase: 1, manMul: 1, manPct: 0.02, manRad: 1, fuseMax: 6, fuseReg: 0.1, dbl: 0,
    radius: 22, linger: 4, chainCap: 5, chainStep: 0.25, eco: 0,
    ovGain: 0.5, ovDecay: 0.05, ovMax: 2, finDur: 160, finRate: 3, finAfter: 15, finPolv: 1, autoFin: 0,
    lanInt: 160, lanVal: 2, lanMul: 1, lanChain: 0, plaInt: 1500, plaVal: 90, plaPolv: 1,
    star: 1, polv: 1, recPct: 0.02, recCost: 1, conPlus: 0, conCd: 200,
    rise: 1, startCh: 0, startGens: 0, showLen: SHOW_LEN,
  };
  const solo = S.mode === 'solo';
  if (!solo) {
    m.all *= SPRINT.all;
    m.polv *= SPRINT.polv;
    m.lanInt *= SPRINT.lan;
    m.plaInt = SPRINT.pla;
    m.conCd = SPRINT.con;
  }
  for (let i = 0; i < UPS.length; i++) if (S.ups[i]) applyFx(m, UPS[i].fx);
  for (let i = 0; i < NODES.length; i++) if (S.nodes[i]) applyFx(m, NODES[i].fx);
  for (let c = 0; c < CONS.length; c++) if (consDone(S, c)) applyFx(m, CONS[c].fx);
  if (S.only) applyFx(m, VENUES[S.venue].fx);
  else for (let v = 0; v < VENUES.length; v++) if (v <= S.venue || S.laps) applyFx(m, VENUES[v].fx);
  if (solo) {
    for (let v = 0; v < S.venue + S.laps * VENUES.length; v++) {
      m.all *= POSTAL_ALL;
      m.polv *= POSTAL_POLV;
    }
    m.all *= 1 + STAR_PCT * S.starsTot;
    m.all *= 1 + ACH_PCT * S.achN;
    m.all *= 1 + FAME_PCT * S.vr; // la fama: cada función en la sede suma un poco, así nadie se queda trabado
  }
  // hitos por cantidad
  for (let i = 0; i < NG; i++) for (let k = 0; k < MILESTONES.length && S.gens[i] >= MILESTONES[k]; k++) m.gen[i] *= m.mileMul;
  // recetas: cada una suma, y las filas y columnas completas dan su premio
  const disc = [];
  const rows = Array(NC).fill(0);
  const cols = Array(NS).fill(0);
  for (let r = 0; r < REC_N; r++) {
    if (!S.rec[r]) continue;
    disc.push(r);
    rows[(r - (r % NS)) / NS]++;
    cols[r % NS]++;
  }
  m.all *= 1 + m.recPct * disc.length;
  for (let c = 0; c < NC; c++) if (rows[c] === NS) m.all *= REC_ROW_MUL;
  for (let s = 0; s < NS; s++) if (cols[s] === NC) m.chainStep += REC_COL_STEP;
  let raw = 0;
  for (let i = 0; i < NG; i++) raw += S.gens[i] * GENS[i].prod * m.gen[i];
  S.m = m;
  S.raw = raw;
  S.disc = disc;
  S.recN = disc.length;
  return m;
}

/** Chispas por segundo de los morteros solos (sin cadenas ni ovación). */
export const cps = (S) => S.raw * S.m.all;
export const ovMul = (S) => 1 + ((S.m.ovMax - 1) * S.ov) / 100;
export const chainMul = (S, k) => 1 + S.m.chainStep * ((k < S.m.chainCap ? k : S.m.chainCap) - 1);
export const tapValue = (S) => (S.m.manBase * S.m.manMul + S.m.manPct * S.raw) * S.m.all;
/** Orden de magnitud de un número (≈ log10, lineal entre potencias de 10), solo con divisiones para que dé igual en todos lados. */
export function mag(x) {
  if (!(x >= 1)) return 0;
  let e = 0;
  while (x >= 1e10) {
    x /= 1e10;
    e += 10;
  }
  while (x >= 10) {
    x /= 10;
    e++;
  }
  return e + (x - 1) / 9;
}
/** La inversa de `mag`. */
export function unmag(m) {
  let e = Math.floor(m);
  let x = 1 + 9 * (m - e);
  while (e >= 10) {
    x *= 1e10;
    e -= 10;
  }
  while (e > 0) {
    x *= 10;
    e--;
  }
  return x;
}
/** Estrellas en total que corresponden a haber juntado `life` chispas en toda la partida. */
export function starsFor(S, life) {
  const d = mag(life) - STAR_L0;
  return d > 0 ? Math.floor(S.m.star * STAR_K * d * d) : 0;
}
/** Estrellas que daría viajar ahora: las que corresponden a todo lo juntado, menos las ya cobradas. */
export const starGain = (S) => Math.max(0, starsFor(S, S.life) - S.starsTot);
/** Chispas de toda la partida que hacen falta para tener `n` estrellas en total. */
export const starNeed = (S, n) => unmag(STAR_L0 + Math.sqrt(n / (S.m.star * STAR_K)));
export function showGoal(S) {
  let g = VENUES[S.venue].goal;
  for (let i = 0; i < S.laps; i++) g *= LAP_GOAL;
  return g;
}

// ---------------------------------------------------------------- estado
export function create(o = {}) {
  const seed = String(o.seed ?? 1);
  let allow = 0;
  if (Array.isArray(o.colors)) for (const c of o.colors) if (c >= 0 && c < NC) allow |= 1 << c;
  if (!allow) allow = (1 << NC) - 1;
  const S = {
    v: 1,
    mode: o.mode || 'solo',
    seed,
    tick: 0,
    ch: 0, // chispas en mano
    total: 0, // chispas juntadas en esta sede (en duelo: el puntaje)
    life: 0, // chispas de toda la vida
    polv: 0,
    stars: 0,
    starsTot: 0, // estrellas ganadas en toda la partida
    venue: Math.max(0, Math.min(VENUES.length - 1, o.venue | 0)),
    only: o.only ? 1 : 0, // solo vale la regla de esta sede (show del día)
    laps: 0,
    plan: RACE[o.plan] ? Number(o.plan) : 0, // partida por tiempo: 3, 5 o 10 minutos (0 en la gira)
    run: null, // la función en curso: { end, got, k, over, reh }
    best: 0, // la mejor función en esta sede
    full: 0, // ya llenó la plaza (puede viajar)
    vr: 0, // funciones hechas en esta sede
    last: 0, // lo que dejó la última función
    lastX: 0,
    allow,
    gens: GENS.map(() => 0),
    ups: UPS.map(() => 0),
    rec: Array(REC_N).fill(0),
    recN: 1,
    nodes: NODES.map(() => 0),
    ach: ACH.map(() => 0),
    achN: 0,
    fuse: 6,
    ov: 0,
    fin: 0, // ticks que le quedan al Gran Final
    lt: -9, // tick del último toque
    shots: 0,
    sid: 0,
    cid: 0,
    gn: GENS.map(() => 0), // tick del próximo disparo de cada mortero
    sh: [], // cohetes en vuelo
    bl: [], // ondas de estallido
    la: [], // farolitos
    pl: null, // avión
    chains: [],
    wind: 0,
    nLan: 0,
    nPla: 0,
    nWind: 600,
    con: [null], // el pedido del público (uno por vez)
    conCd: [60],
    colWin: [],
    st: { man: 0, auto: 0, bursts: 0, chains: 0, bestK: 0, lan: 0, pla: 0, fin: 0, con: 0, ticks: 0, runs: 0, shows: 0, daily: 0 },
    r: { ev: seedRng(`${seed}:ev`), aim: seedRng(`${seed}:aim`), con: seedRng(`${seed}:con`), rw: seedRng(`${seed}:rw`) },
  };
  let c0 = 0;
  while (!(allow & (1 << c0))) c0++;
  S.rec[c0 * NS] = 1; // la primera receta viene de regalo: la peonía del primer color permitido
  recalc(S);
  S.fuse = S.m.fuseMax;
  S.nLan = 100 + rint(S.r.ev, 80);
  S.nPla = Math.floor(S.m.plaInt * (0.3 + 0.5 * rnd(S.r.ev)));
  if (S.plan) beginRun(S, RACE[S.plan].show * TPS);
  return S;
}

/** Lo que cambia en el show del día: sede (solo vale su regla), tres colores permitidos y semilla, todo sacado de un texto (la fecha). */
export function dailySetup(key) {
  const r = seedRng(`daily:${key}`);
  const venue = rint(r, VENUES.length);
  const colors = [];
  while (colors.length < 3) {
    const c = rint(r, NC);
    if (!colors.includes(c)) colors.push(c);
  }
  colors.sort((a, b) => a - b);
  return { seed: `d:${key}`, mode: 'daily', venue, only: 1, colors, plan: 3 };
}

const DERIVED = { m: 1, raw: 1, disc: 1 };
/** Copia en JSON puro. Con `full = false` deja afuera lo que está en el aire (para el guardado de la gira). */
export function dump(S, full = true) {
  const o = {};
  for (const k in S) if (!DERIVED[k]) o[k] = S[k];
  const c = JSON.parse(JSON.stringify(o));
  if (!full) {
    c.sh = [];
    c.bl = [];
    c.la = [];
    c.pl = null;
    c.chains = [];
    c.run = null;
    c.fin = 0;
    c.ov = 0;
  }
  return c;
}
const fit = (src, len) => Array.from({ length: len }, (_, i) => (src && src[i] ? 1 : 0));
/** Restaura un estado guardado con `dump` (tolera guardados con menos mejoras, nodos o logros que los actuales). */
export function load(o) {
  const colors = [];
  for (let c = 0; c < NC; c++) if (o.allow & (1 << c)) colors.push(c);
  const S = create({ seed: o.seed, mode: o.mode, venue: o.venue, only: o.only, colors, plan: o.plan });
  S.run = null;
  for (const k in o) if (k in S && !DERIVED[k] && k !== 'st' && k !== 'r') S[k] = o[k];
  Object.assign(S.st, o.st || {});
  for (const k in S.r) if (Array.isArray(o.r?.[k]) && o.r[k].length === 4) S.r[k] = o.r[k].map((x) => x | 0);
  S.gens = GENS.map((_, i) => Math.max(0, Math.min(MAX_OWNED, Math.floor(Number(o.gens?.[i]) || 0))));
  S.ups = fit(o.ups, UPS.length);
  S.rec = fit(o.rec, REC_N);
  S.nodes = fit(o.nodes, NODES.length);
  S.ach = fit(o.ach, ACH.length);
  S.achN = S.ach.reduce((a, b) => a + b, 0);
  if (!S.rec.some(Boolean)) S.rec[0] = 1;
  if (!Array.isArray(S.con) || S.con.length !== 1) S.con = [null];
  if (!Array.isArray(S.conCd) || S.conCd.length !== 1) S.conCd = [60];
  recalc(S);
  return S;
}

// ---------------------------------------------------------------- cohetes
const shell = (S, g, x0, tx, ty, tb, val, rec, rm = 0, sub = 0) => ({ id: ++S.sid, g, x0, tx, ty, t0: S.tick, tb, val, rec, c: 0, fz: 0, fx: 0, fy: 0, rm, sub });

/** Posición de un cohete en el tick `t` (puede ser fraccionario, para dibujar suave). Sube frenando hasta su destino. */
export function shellPos(s, t, o = {}) {
  if (s.fz) {
    o.x = s.fx;
    o.y = s.fy;
    return o;
  }
  let p = (t - s.t0) / (s.tb - s.t0);
  if (p > 1) p = 1;
  else if (p < 0) p = 0;
  const q = 1 - p;
  o.x = s.x0 + (s.tx - s.x0) * p;
  o.y = GROUND + (s.ty - GROUND) * (1 - q * q);
  return o;
}
export const lanternX = (l, t) => l.x0 + l.d * l.v * (t - l.t0);
export const planeX = (p, t) => p.x0 + p.d * p.v * (t - p.t0);

function nearestGenX(S, x) {
  let best = x;
  let bd = 1e9;
  for (let i = 0; i < NG; i++) {
    if (!S.gens[i]) continue;
    const d = GENS[i].x > x ? GENS[i].x - x : x - GENS[i].x;
    if (d < bd) {
      bd = d;
      best = GENS[i].x;
    }
  }
  return best;
}

function earn(S, g) {
  S.ch += g;
  S.total += g;
  S.life += g;
  if (S.run) S.run.got += g;
  for (let i = 0; i < S.con.length; i++) {
    const c = S.con[i];
    if (c && c.k === 5 && !c.d) {
      c.p += g;
      if (c.p >= c.n) c.d = 1;
    }
  }
}

function tap(S, x, y, out) {
  if (!S.run || S.run.over || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0) x = 0;
  else if (x > FW - 1) x = FW - 1;
  if (y < 0) y = 0;
  else if (y > SKY_MAX) y = SKY_MAX;
  const m = S.m;
  if (S.fin > 0) {
    if (S.tick - S.lt < FIN_TAP) return false;
  } else {
    if (S.fuse < 1 || S.tick === S.lt) return false;
    S.fuse -= 1;
  }
  S.lt = S.tick;
  const val = tapValue(S);
  const x0 = nearestGenX(S, x);
  const n = S.disc.length;
  S.sh.push(shell(S, -1, x0, x, y, S.tick + MAN_RISE, val, S.disc[S.st.man % n]));
  if (m.dbl) S.sh.push(shell(S, -1, x0, x, y, S.tick + MAN_RISE + 3, val * 0.5, S.disc[(S.st.man + 1) % n]));
  S.st.man++;
  conProg(S, 3, 1, out);
  if (out) out.push({ e: 'launch', g: -1, x: x0 });
  return true;
}

/** Un disparo del mortero `i`. Cada tipo dispara a su manera; entre todos sus cohetes vale lo que el mortero produce en un período. */
function launchAuto(S, i, out) {
  const m = S.m;
  const g = GENS[i];
  // las dos tiradas se hacen siempre igual, así el azar no depende de qué mortero dispara
  const ax = rint(S.r.aim, 200);
  const ay = rint(S.r.aim, 100);
  const w = S.wind * 6;
  const t = S.tick;
  const val = S.gens[i] * g.prod * m.gen[i] * m.all * (g.period / TPS);
  const rise = Math.round(g.rise * m.rise);
  const add = (tx, ty, dt, v, sub) => {
    if (tx < 8) tx = 8;
    else if (tx > FW - 8) tx = FW - 8;
    S.sh.push(shell(S, i, g.x, tx, ty, t + rise + dt, v, S.disc[S.shots++ % S.disc.length], 0, sub));
  };
  const p = g.pat;
  if (p === 'pop') add(28 + ax + w, 172 + Math.floor(ay * 0.4), 0, val, 0);
  else if (p === 'rocket') add(28 + ax + w, 24 + Math.floor(ay * 0.8), 0, val, 0);
  else if (p === 'fountain') add(g.x - 10 + (ax % 21), 186 + (ay % 24), 0, val, 0);
  else if (p === 'triple') for (let j = 0; j < 3; j++) add(28 + ax + w, 70 + Math.floor(ay * 0.9) - j * 24, j * 6, val / 3, 0);
  else if (p === 'fan') {
    const cx = 48 + Math.floor(ax * 0.8) + w;
    for (let j = 0; j < 5; j++) add(cx + (j - 2) * 22, 60 + Math.floor(ay * 0.7) + (j > 2 ? j - 2 : 2 - j) * 12, (j > 2 ? j - 2 : 2 - j) * 2, val / 5, 0);
  } else if (p === 'cake') for (let j = 0; j < 7; j++) add(ax & 1 ? 30 + j * 33 : 228 - j * 33, 50 + Math.floor(ay * 0.7) + (j & 1) * 16, j * 4, val / 7, 0);
  else if (p === 'bomb') add(40 + Math.floor(ax * 0.88) + w, 50 + Math.floor(ay * 0.8), 0, val, 0);
  else add(48 + Math.floor(ax * 0.8) + w, 56 + Math.floor(ay * 0.7), 0, val * 0.6, 1);
  S.st.auto++;
  if (out) out.push({ e: 'launch', g: i, x: g.x });
}

const chainOf = (S, id) => {
  for (let i = 0; i < S.chains.length; i++) if (S.chains[i].id === id) return S.chains[i];
  return null;
};

function distinctColors(S, last) {
  let mask = 0;
  let n = 0;
  const w = S.colWin;
  for (let i = w.length - 1, k = 0; i >= 0 && k < last; i--, k++) {
    const b = 1 << (w[i] & 15);
    if (!(mask & b)) {
      mask |= b;
      n++;
    }
  }
  return n;
}

function burst(S, s, out) {
  const m = S.m;
  shellPos(s, S.tick, TMP);
  const x = TMP.x;
  const y = TMP.y;
  let c = s.c ? chainOf(S, s.c) : null;
  if (c) c.live--;
  else {
    c = { id: ++S.cid, k: 0, q: 1, live: 0, man: 0, x, y }; // k: eslabones que ya estallaron; q: los comprometidos (con los prendidos)
    S.chains.push(c);
  }
  if (s.g < 0) c.man = 1; // el público se entusiasma con las cadenas en las que participó un cohete lanzado a mano
  c.k++;
  c.x = x;
  c.y = y;
  const k = c.k;
  let gain = s.val * chainMul(S, k) * ovMul(S);
  if (m.eco && k >= 3) gain *= 1.5;
  earn(S, gain);
  // ovación: la suben los toques y las cadenas donde hubo un toque; lo que estalla solo apenas la sostiene. La variedad de colores suma.
  const col = (s.rec - (s.rec % NS)) / NS;
  const w = S.colWin;
  w.push(S.tick * 16 + col);
  if (w.length > 40) w.splice(0, w.length - 40);
  if (!(S.fin > 0)) {
    const base = c.man ? (k > 4 ? 4 : k) : 0.1;
    S.ov += base * (1 + 0.15 * (distinctColors(S, 8) - 1)) * m.ovGain;
    if (S.ov > 100) S.ov = 100;
  }
  // pedido "N colores en 20 segundos"
  for (let i = 0; i < S.con.length; i++) {
    const q = S.con[i];
    if (!q || q.k !== 1 || q.d) continue;
    let mask = 0;
    let n = 0;
    for (let j = w.length - 1; j >= 0 && S.tick - (w[j] - (w[j] & 15)) / 16 <= 400; j--) {
      const b = 1 << (w[j] & 15);
      if (!(mask & b)) {
        mask |= b;
        n++;
      }
    }
    if (n > q.p) q.p = n;
    if (q.p >= q.n) {
      q.d = 1;
    }
  }
  const r = m.radius * (s.g < 0 ? m.manRad : s.rm || GENS[s.g].rad);
  S.bl.push({ x, y, r, until: S.tick + m.linger, c: c.id });
  c.live++;
  S.st.bursts++;
  if (s.sub) {
    // el trueno deja cuatro chasquidos alrededor, que estallan enseguida
    const d = r * 0.75;
    for (let j = 0; j < 4; j++) {
      let cx = x + (j & 1 ? d : -d);
      let cy = y + (j & 2 ? d * 0.7 : -d * 0.7);
      if (cx < 6) cx = 6;
      else if (cx > FW - 6) cx = FW - 6;
      if (cy < 6) cy = 6;
      else if (cy > SKY_MAX) cy = SKY_MAX;
      const ch = shell(S, s.g, x, cx, cy, S.tick + 5 + j * 2, s.val / 6, s.rec, 0.7, 0);
      ch.fz = 1;
      ch.fx = cx;
      ch.fy = cy;
      if (c.q < m.chainCap) {
        ch.c = c.id;
        c.live++;
        c.q++;
      }
      S.sh.push(ch);
    }
  }
  if (out) out.push({ e: 'burst', x, y, rec: s.rec, k, gain, man: s.g < 0, r, g: s.g, sub: s.sub ? 1 : 0, mini: s.rm ? 1 : 0 });
}

function endChain(S, c, out) {
  const i = S.chains.indexOf(c);
  if (i >= 0) S.chains.splice(i, 1);
  if (c.k < 2) return;
  S.st.chains++;
  if (c.k > S.st.bestK) S.st.bestK = c.k;
  if (S.run && c.k > S.run.k) S.run.k = c.k;
  for (let j = 0; j < S.con.length; j++) {
    const q = S.con[j];
    if (!q || q.d || (q.k !== 0 && q.k !== 7) || c.k < q.a) continue;
    q.p++;
    if (q.p >= q.n) {
      q.d = 1;
    }
  }
  if (out) out.push({ e: 'chain', k: c.k, x: c.x, y: c.y });
}

/** Las ondas vivas prenden lo que tocan: cohetes en vuelo, farolitos y el cartel del avión. */
function waves(S, out) {
  const t = S.tick;
  const m = S.m;
  const bl = S.bl;
  for (let b = 0; b < bl.length; b++) {
    const B = bl[b];
    const c = chainOf(S, B.c);
    if (!c) continue;
    const r2 = B.r * B.r;
    for (let i = 0; i < S.sh.length && c.q < m.chainCap; i++) {
      const s = S.sh[i];
      if (s.c || s.tb <= t) continue;
      shellPos(s, t, TMP);
      const dx = TMP.x - B.x;
      const dy = TMP.y - B.y;
      if (dx * dx + dy * dy > r2) continue;
      s.c = B.c;
      s.fz = 1;
      s.fx = TMP.x;
      s.fy = TMP.y;
      s.tb = t + IGNITE;
      c.live++;
      c.q++;
    }
    const rl = (B.r + 6) * (B.r + 6);
    for (let i = 0; i < S.la.length; i++) {
      const l = S.la[i];
      if (l.dead || c.q >= m.chainCap) continue;
      const lx = lanternX(l, t);
      const dx = lx - B.x;
      const dy = l.y - B.y;
      if (dx * dx + dy * dy > rl) continue;
      l.dead = 1;
      c.k++;
      c.q++;
      c.x = lx;
      c.y = l.y;
      let base = m.lanVal * cps(S);
      if (base < 10) base = 10;
      const gain = base * m.lanMul * chainMul(S, c.k) * ovMul(S);
      earn(S, gain);
      S.st.lan++;
      if (!(S.fin > 0)) {
        S.ov += (c.man ? 2 : 0.5) * m.ovGain;
        if (S.ov > 100) S.ov = 100;
      }
      conProg(S, 2, 1, out);
      if (m.lanChain) {
        bl.push({ x: lx, y: l.y, r: m.radius * 0.7, until: t + m.linger, c: c.id });
        c.live++;
      }
      if (out) out.push({ e: 'lan', x: lx, y: l.y, gain, k: c.k });
    }
    const p = S.pl;
    if (p && !p.hit) {
      const px = planeX(p, t);
      const dx = px - B.x;
      const dy = p.y - B.y;
      const rp = (B.r + 12) * (B.r + 12);
      if (dx * dx + dy * dy <= rp) {
        p.hit = 1;
        let gain = m.plaVal * cps(S);
        if (gain < 100) gain = 100;
        const polv = Math.round((1 + rint(S.r.rw, 3)) * m.plaPolv * m.polv);
        earn(S, gain);
        S.polv += polv;
        S.st.pla++;
        if (!(S.fin > 0)) {
          S.ov += (c.man ? 8 : 2) * m.ovGain;
          if (S.ov > 100) S.ov = 100;
        }
        conProg(S, 6, 1, out);
        if (out) out.push({ e: 'plane', x: px, y: p.y, gain, polv });
      }
    }
  }
  // las ondas que se apagan; una cadena termina cuando no le queda nada vivo
  let w = 0;
  for (let b = 0; b < bl.length; b++) {
    const B = bl[b];
    if (B.until > t) {
      bl[w++] = B;
      continue;
    }
    const c = chainOf(S, B.c);
    if (c && --c.live <= 0) endChain(S, c, out);
  }
  bl.length = w;
}

// ---------------------------------------------------------------- clima, farolitos y avión
function weather(S, out) {
  const t = S.tick;
  const m = S.m;
  const ev = S.r.ev;
  if (t >= S.nWind) {
    S.wind = rint(ev, 5) - 2;
    S.nWind = t + 600;
    if (out) out.push({ e: 'wind', w: S.wind });
  }
  if (t >= S.nLan) {
    // las tiradas se hacen siempre: con la misma semilla los farolitos salen iguales para todos
    const y = 30 + rint(ev, 150);
    const sp = rint(ev, 6);
    const side = rint(ev, 2);
    const gap = rnd(ev);
    S.nLan = t + Math.max(20, Math.floor(m.lanInt * (0.6 + 0.8 * gap)));
    if (S.la.length < 6) {
      const d = S.wind > 0 ? 1 : S.wind < 0 ? -1 : side ? 1 : -1;
      const aw = S.wind < 0 ? -S.wind : S.wind;
      S.la.push({ id: ++S.sid, t0: t, x0: d > 0 ? -8 : FW + 8, y, d, v: 0.5 + 0.1 * sp + 0.1 * aw, dead: 0 });
    }
  }
  if (t >= S.nPla) {
    const y = 14 + rint(ev, 30);
    const side = rint(ev, 2);
    const gap = rnd(ev);
    S.nPla = t + Math.max(200, Math.floor(m.plaInt * (0.67 + 0.66 * gap)));
    if (!S.pl) S.pl = { t0: t, x0: side ? -24 : FW + 24, y, d: side ? 1 : -1, v: 1.3, hit: 0 };
    if (out && S.pl.t0 === t) out.push({ e: 'planeIn' });
  }
  if (S.la.length) {
    let w = 0;
    for (let i = 0; i < S.la.length; i++) {
      const l = S.la[i];
      const x = lanternX(l, t);
      if (!l.dead && x > -12 && x < FW + 12) S.la[w++] = l;
    }
    S.la.length = w;
  }
  if (S.pl) {
    const x = planeX(S.pl, t);
    if (x < -40 || x > FW + 40) S.pl = null;
  }
}

// ---------------------------------------------------------------- pedidos del público
function conProg(S, k, n, out) {
  for (let i = 0; i < S.con.length; i++) {
    const c = S.con[i];
    if (!c || c.k !== k || c.d) continue;
    c.p += n;
    if (c.p >= c.n) {
      c.d = 1;
    }
  }
}

function colorsKnown(S) {
  let mask = 0;
  let n = 0;
  for (let i = 0; i < S.disc.length; i++) {
    const b = 1 << ((S.disc[i] - (S.disc[i] % NS)) / NS);
    if (!(mask & b)) {
      mask |= b;
      n++;
    }
  }
  return n;
}

function newContract(S, slot, out) {
  const r = S.r.con;
  const m = S.m;
  const known = colorsKnown(S);
  let k = 3;
  for (let tries = 0; tries < 12; tries++) {
    k = rint(r, 8);
    if ((k === 1 && known < 2) || S.con.some((c) => c && c.k === k)) continue;
    break;
  }
  if (k === 1 && known < 2) k = 3;
  const cap = m.chainCap;
  let n = 1;
  let a = 0;
  let rw = 2;
  if (k === 0) {
    a = 2 + rint(r, Math.min(3, cap - 1));
    n = 3 + rint(r, 3);
    rw = a;
  } else if (k === 1) {
    n = 2 + rint(r, Math.min(5, known - 1));
    rw = n - 1;
  } else if (k === 2) n = 4 + rint(r, 7);
  else if (k === 3) {
    n = 20 + 10 * rint(r, 5);
    rw = n >= 40 ? 2 : 1;
  } else if (k === 4) rw = 3;
  else if (k === 5) n = Math.max(200, Math.floor(Math.max(cps(S) * 100, S.last * 0.8)));
  else if (k === 6) rw = 3;
  else {
    a = 3 + rint(r, Math.max(1, Math.min(6, cap - 2)));
    rw = a - 1;
  }
  S.con[slot] = { k, n, a, p: 0, d: 0, rw: Math.round((rw + m.conPlus) * m.polv) };
  if (out) out.push({ e: 'newcon', i: slot });
}

/** Pedido cumplido: paga la Pólvora en el momento y deja lugar para el próximo. */
function conDone(S, i, out) {
  const c = S.con[i];
  S.polv += c.rw;
  S.st.con++;
  S.con[i] = null;
  S.conCd[i] = S.m.conCd > 1 ? S.m.conCd : 1;
  if (out) out.push({ e: 'con', i, rw: c.rw, k: c.k });
}

// ---------------------------------------------------------------- compras
function buyGen(S, i, n) {
  if (!Number.isInteger(i) || i < 0 || i >= NG || !Number.isInteger(n) || n < 1) return 0;
  if (n > 1000) n = 1000;
  let got = 0;
  while (got < n && S.gens[i] < MAX_OWNED) {
    const c = Math.ceil(unitCost(i, S.gens[i]) * S.m.cost);
    if (c > S.ch) break;
    S.ch -= c;
    if (!S.gens[i]) S.gn[i] = S.tick + 10;
    S.gens[i]++;
    got++;
  }
  if (got) recalc(S);
  return got;
}

function buyUp(S, i) {
  if (!Number.isInteger(i) || !upAvail(S, i) || UPS[i].cost > S.ch) return false;
  S.ch -= UPS[i].cost;
  S.ups[i] = 1;
  recalc(S);
  if (S.fuse > S.m.fuseMax) S.fuse = S.m.fuseMax;
  return true;
}

function buyRec(S, r) {
  if (!Number.isInteger(r) || r < 0 || r >= REC_N || S.rec[r]) return false;
  if (!(S.allow & (1 << ((r - (r % NS)) / NS)))) return false;
  const c = recCost(S);
  if (c > S.polv) return false;
  S.polv -= c;
  S.rec[r] = 1;
  recalc(S);
  return true;
}

function buyNode(S, i) {
  if (!Number.isInteger(i) || !nodeAvail(S, i) || NODES[i].cost > S.stars) return false;
  S.stars -= NODES[i].cost;
  S.nodes[i] = 1;
  recalc(S);
  return true;
}

// ---------------------------------------------------------------- gran final, funciones y gira
function finale(S, out) {
  if (S.fin > 0 || S.ov < 100 || !S.run || S.run.over) return false;
  const m = S.m;
  S.fin = m.finDur;
  S.ov = 100;
  S.st.fin++;
  S.polv += Math.round(m.finPolv * m.polv);
  for (let i = 0; i < NG; i++) {
    const per = Math.max(4, Math.floor(GENS[i].period / m.finRate));
    if (S.gens[i] && S.gn[i] > S.tick + per) S.gn[i] = S.tick + 1 + (i % per);
  }
  conProg(S, 4, 1, out);
  if (out) out.push({ e: 'fin' });
  return true;
}

/** Empieza una función que termina en el tick `end`. `reh` es el ensayo del tutorial: sin reloj, sin farolitos ni avión. */
function beginRun(S, end, out, reh = 0) {
  const t = S.tick;
  S.run = { end, got: 0, k: 0, over: 0, reh };
  S.ov = 0;
  S.fin = 0;
  S.fuse = S.m.fuseMax;
  S.lt = -9;
  S.sh = [];
  S.bl = [];
  S.la = [];
  S.pl = null;
  S.chains = [];
  for (let i = 0; i < NG; i++) S.gn[i] = t + 8 + i * 5;
  S.nLan = t + 30 + rint(S.r.ev, 50);
  if (S.nPla < t + 60) S.nPla = t + 60 + rint(S.r.ev, 200);
  if (out) out.push({ e: 'runStart', reh });
}

function endRun(S, out) {
  const r = S.run;
  S.run = null;
  S.fin = 0;
  S.la = [];
  S.pl = null;
  if (r.reh) return;
  S.last = r.got;
  S.lastX = 0;
  S.st.runs++;
  S.vr++;
  recalc(S);
  const rec = r.got > S.best;
  if (rec) S.best = r.got;
  if (out) out.push({ e: 'runEnd', got: r.got, k: r.k, rec });
}

/** El ensayo del tutorial (solo antes de la primera función): `kind` 1 suelta un farolito lento y 2 dos cohetes para encadenar. */
function rehearse(S, kind, out) {
  if (S.st.runs > 0) return false;
  if (!S.run) beginRun(S, 1e9, out, 1);
  if (!S.run.reh) return false;
  const t = S.tick;
  if (kind === 1) S.la.push({ id: ++S.sid, t0: t, x0: 70, y: 120, d: 1, v: 0.3, dead: 0 });
  else if (kind === 2) {
    S.sh.push(shell(S, 1, 128, 112, 104, t + 70, 5, S.disc[0]));
    S.sh.push(shell(S, 1, 128, 140, 96, t + 80, 5, S.disc[0]));
  }
  return true;
}

/** Vuelve a cero lo que se pierde al cambiar de sede. */
function resetVenue(S) {
  S.gens = GENS.map(() => 0);
  S.ups = UPS.map(() => 0);
  S.gn = GENS.map(() => 0);
  S.sh = [];
  S.bl = [];
  S.la = [];
  S.pl = null;
  S.chains = [];
  S.run = null;
  S.fin = 0;
  S.ov = 0;
  S.total = 0;
  S.ch = 0;
  S.best = 0;
  S.full = 0;
  S.vr = 0;
  S.last = 0;
  S.lastX = 0;
  recalc(S);
  if (S.m.startGens) {
    S.gens[0] = 10;
    S.gens[1] = 5;
    recalc(S);
  }
  S.ch = S.m.startCh;
  S.fuse = S.m.fuseMax;
}

/** Viajar a la próxima sede: hay que haber llenado la plaza. Se cobran las estrellas y quedan recetas, Pólvora y constelaciones. */
function travel(S, out) {
  if (!S.full || S.run) return false;
  const g = starGain(S);
  S.stars += g;
  S.starsTot += g;
  if (S.venue < VENUES.length - 1) S.venue++;
  else {
    // pasada la última sede, la gira vuelve a empezar con metas más altas
    S.venue = 0;
    S.laps++;
  }
  S.st.shows++;
  resetVenue(S);
  if (out) out.push({ e: 'travel', g });
  return true;
}

function checkAch(S, out) {
  let got = false;
  const st = S.st;
  for (let i = 0; i < ACH.length; i++) {
    if (S.ach[i]) continue;
    const a = ACH[i];
    const k = a.k;
    const v = k === 'life' ? S.life : k === 'gen' ? S.gens[a.i] : k === 'chain' ? st.bestK : k === 'fin' ? st.fin : k === 'lan' ? st.lan : k === 'pla' ? st.pla : k === 'rec' ? S.recN : k === 'con' ? st.con : k === 'run' ? st.runs : k === 'ven' ? st.shows : k === 'man' ? st.man : st.daily;
    if (v >= a.v) {
      S.ach[i] = 1;
      S.achN++;
      got = true;
      if (out) out.push({ e: 'ach', i });
    }
  }
  if (got) recalc(S);
}

// ---------------------------------------------------------------- un tick
export function step(S, out) {
  const m = S.m;
  const t = ++S.tick;
  S.st.ticks++;
  if (S.plan && !S.run) {
    // partida por tiempo: las funciones empiezan por horario
    const P = RACE[S.plan];
    const per = (P.show + P.brk) * TPS;
    if ((t - 1) % per === 0 && (t - 1) / per < P.n) beginRun(S, t - 1 + P.show * TPS, out);
  }
  const r = S.run;
  if (r && !r.over) {
    if (S.fuse < m.fuseMax) {
      S.fuse += m.fuseReg;
      if (S.fuse > m.fuseMax) S.fuse = m.fuseMax;
    }
    if (S.fin > 0) {
      if (--S.fin === 0) {
        S.ov = m.finAfter;
        if (out) out.push({ e: 'finEnd' });
      }
    } else if (S.ov >= 100) {
      // llena se queda llena: espera al Gran Final
      if (m.autoFin) finale(S, out);
    } else if (S.ov > 0) {
      S.ov -= m.ovDecay;
      if (S.ov < 0) S.ov = 0;
    }
    if (!r.reh) {
      weather(S, out);
      for (let i = 0; i < S.con.length; i++) if (!S.con[i] && --S.conCd[i] <= 0) newContract(S, i, out);
    }
    for (let i = 0; i < NG; i++) {
      if (!S.gens[i] || t < S.gn[i]) continue;
      launchAuto(S, i, out);
      S.gn[i] = t + (S.fin > 0 ? Math.max(4, Math.floor(GENS[i].period / m.finRate)) : GENS[i].period);
    }
  }
  // estallidos (en orden de lanzamiento) y ondas
  const sh = S.sh;
  if (sh.length) {
    let w = 0;
    for (let i = 0; i < sh.length; i++) {
      if (sh[i].tb <= t) burst(S, sh[i], out);
      else sh[w++] = sh[i];
    }
    sh.length = w;
  }
  if (S.bl.length) waves(S, out);
  for (let i = 0; i < S.con.length; i++) if (S.con[i] && S.con[i].d) conDone(S, i, out);
  if (r) {
    if (!r.over) {
      if (S.mode === 'solo' && !S.full && !r.reh && r.got >= showGoal(S)) {
        S.full = 1;
        if (out) out.push({ e: 'full' });
      }
      if (t >= r.end) {
        // se acabó el tiempo: lo que quedó en el aire estalla donde está (el remate)
        r.over = 1;
        S.fin = 0;
        for (let i = 0; i < sh.length; i++) {
          const q = sh[i];
          const lim = t + 3 + (i % 8);
          if (q.tb <= lim) continue;
          if (!q.fz) {
            shellPos(q, t, TMP);
            q.fz = 1;
            q.fx = TMP.x;
            q.fy = TMP.y;
          }
          q.tb = lim;
        }
        if (out) out.push({ e: 'over' });
      }
    } else if ((!sh.length && !S.bl.length) || t >= r.end + 60) endRun(S, out);
  }
  if (S.mode === 'solo' && t % TPS === 0) checkAch(S, out);
}

// ---------------------------------------------------------------- acciones
export function act(S, a, out) {
  if (!Array.isArray(a)) return false;
  const solo = S.mode === 'solo';
  switch (a[0]) {
    case 'T':
      return tap(S, a[1], a[2], out);
    case 'B':
      return buyGen(S, a[1], a[2]) > 0;
    case 'U':
      return buyUp(S, a[1]);
    case 'R':
      return buyRec(S, a[1]);
    case 'F':
      return finale(S, out);
    case 'N':
      return solo && buyNode(S, a[1]);
    case 'G':
      if (!solo) return false;
      if (S.run) {
        if (!S.run.reh) return false;
        S.run = null;
      }
      beginRun(S, S.tick + S.m.showLen, out);
      return true;
    case 'H':
      return solo && rehearse(S, a[1], out);
    case 'P':
      return solo && travel(S, out);
    case 'X':
      if (!solo || S.run || !(S.last > 0) || S.lastX) return false;
      S.ch += S.last;
      S.total += S.last;
      S.life += S.last;
      S.lastX = 1;
      return true;
    default:
      return false;
  }
}

/** En qué anda una partida por tiempo en el tick `t`: función `i` de `n`, si está en función (o en taller) y cuántos ticks le quedan. */
export function raceInfo(plan, t) {
  const P = RACE[plan];
  const per = (P.show + P.brk) * TPS;
  const last = (P.n - 1) * per + P.show * TPS;
  if (t >= last) return { i: P.n - 1, n: P.n, show: 0, left: 0, end: 1 };
  const i = Math.floor(t / per);
  const off = t - i * per;
  const show = off < P.show * TPS ? 1 : 0;
  return { i, n: P.n, show, left: show ? P.show * TPS - off : per - off, end: 0 };
}

// ---------------------------------------------------------------- registro de acciones (duelo online)
const b36 = (n, w) => n.toString(36).padStart(w, '0');
/** Una acción con su tick en texto corto: tick en base 36, una letra y los argumentos ("2fT5a3c", "30B03", "41U1b", "50F"). */
export function encodeAct(tick, a) {
  const k = a[0];
  let s = tick.toString(36) + k;
  if (k === 'T') s += b36(Math.max(0, Math.min(FW - 1, Math.round(a[1]))), 2) + b36(Math.max(0, Math.min(SKY_MAX, Math.round(a[2]))), 2);
  else if (k === 'B') s += a[1].toString(36) + a[2].toString(36);
  else if (k !== 'F') s += a[1].toString(36);
  return s;
}
const ENTRY = /^([0-9a-z]{1,5})([TBURF])([0-9a-z]{0,6})$/;
export function decodeAct(str) {
  const mt = ENTRY.exec(str);
  if (!mt) return null;
  const tick = parseInt(mt[1], 36);
  const k = mt[2];
  const g = mt[3];
  if (k === 'T') return g.length === 4 ? { tick, a: ['T', parseInt(g.slice(0, 2), 36), parseInt(g.slice(2), 36)] } : null;
  if (k === 'B') return g.length >= 2 ? { tick, a: ['B', parseInt(g[0], 36), parseInt(g.slice(1), 36)] } : null;
  if (k === 'F') return g.length ? null : { tick, a: ['F'] };
  return g.length ? { tick, a: [k, parseInt(g, 36)] } : null;
}

/**
 * Rehace una partida a medida que llegan las tandas del registro. `feed(texto, maxTick, minTick)` aplica las acciones en orden:
 * descarta las mal escritas, las que retroceden, las que dicen ser del futuro (`maxTick` es hasta dónde llegó el reloj) y las que
 * llegan demasiado tarde (`minTick`). `end(tick)` avanza hasta el final. El puntaje es `S.total`.
 */
export class Replayer {
  constructor(opts) {
    this.S = create(opts);
    this.bad = 0; // entradas inválidas (posible trampa)
    this.miss = 0; // acciones que no valieron en la sim del servidor
    this.finales = 0;
  }
  feed(text, maxTick = Infinity, minTick = 0) {
    if (typeof text !== 'string' || !text) return 0;
    const S = this.S;
    let n = 0;
    for (const part of text.split(',', 400)) {
      const d = decodeAct(part);
      if (!d || d.tick < S.tick || d.tick > maxTick) {
        this.bad++;
        continue;
      }
      if (d.tick < minTick) {
        this.miss++;
        continue;
      }
      while (S.tick < d.tick) step(S);
      if (act(S, d.a)) {
        n++;
        if (d.a[0] === 'F') this.finales++;
      } else this.miss++;
    }
    return n;
  }
  end(tick) {
    const S = this.S;
    while (S.tick < tick) step(S);
    return S;
  }
}
