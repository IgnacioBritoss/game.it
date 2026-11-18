/**
 * Piñata — simulación pura y determinista (sin DOM, sin Date, sin Math.random).
 *
 * La misma sim corre en el navegador (gira de fiestas, piñata del día, contrarreloj y duelo), en el servidor (lleva una sim por
 * jugador y la avanza con las acciones que recibe) y en las pruebas. Solo usa + − × ÷ √, redondeos y operaciones de bits.
 *
 * - `create(opts)` arma un estado; `step(S, out)` avanza un tick (TPS por segundo) y deja en `out` los eventos para dibujar y
 *   sonar; `act(S, accion, out)` aplica una acción del jugador en el tick actual y devuelve si valió.
 * - Acciones: ['T', punto] golpe a la piñata de ese punto de la soga (en la gigante, el punto débil 0 a 2) · ['C', i] elegir
 *   carta · ['F'] ¡DALE! · ['G'] empezar fiesta · ['B', invitado, n] · ['U', nodo] mantel · ['R', figurita] · ['N', nodo]
 *   torta · ['P'] soplar las velitas · ['H', paso] ensayo del tutorial. En duelo, diario y reto solo valen T, C, F, B y U.
 * - El estado es JSON puro: `dump` lo copia y `load` lo restaura; `S.m` (modificadores) se rearma con `recalc`.
 *
 * Una fiesta (`S.party`) son hasta 8 tandas y la gigante. Al terminar una tanda, si los caramelos llegaron a la cuota se ofrecen
 * cartas y se sigue; si no, se termina. Lo juntado va a la billetera pase lo que pase. En las partidas por tiempo (`S.plan`)
 * no hay cuota: las tandas y los ratos de cartas y mesa van por horario (ver RACE en data.js).
 *
 * La sim decide si un golpe fue de lleno mirando la fase del vaivén (tabla SWING); el cliente solo dice a qué punto pegó.
 */
import {
  TPS, FW, PH, TANDA_LEN, GIANT_LEN, TANDAS, FMAX, FREG, ZONE, TAP_GAP, FREE_GAP, DALE_LEN, ENTER, BEAT, BEAT_WIN, GLOBO_UP, SWING, tri,
  PINS, NP, CLOUDLET, CLOUDLET_HP, GIANT, GIANT_HP, GIANT_PRIZE, GIANT_PER, GIANT_WEAK, GIFT_EU, SPIN_PER, EU_HIT, EU_STREAK, PERFECT, PERFECT_X, PERFECT_EU, GUEST_K, TANDA_MUL, QUOTA_N,
  GUESTS, NG, COST_STEP, LV_STEP, MAX_LV, DOG_FREEZE, TAGS, CARDS, NCARD, JUMP_FRAC, POP_DMG, BURN_T, BURN_DPS, FAST_GUEST, LAST_TICKS,
  MANTEL, TORTA, FLOOR_NEED, FIG_N, FIG_PAGE, FIG_PCT, FIG_PAGE_MUL, FIG_COST, EDADES, NE, EDAD_MUL, EDAD_HARD, LAP_MUL, WIND, GOLD_EVERY,
  NIGHT_EVERY, WIND_EVERY, ROPE2_SPD, FAST_SPD, FAME_PCT, VEL_K, VEL_L0, ACH, ACH_PCT, SPRINT, RACE,
} from './data.js';

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

// ---------------------------------------------------------------- tablas (multiplicación repetida, sin potencias)
const LV = [0, 1];
for (let l = 2; l <= MAX_LV + 1; l++) LV.push(LV[l - 1] * LV_STEP);
const GCOST = GUESTS.map((g) => {
  const a = [g.cost];
  for (let l = 1; l <= MAX_LV; l++) a.push(Math.ceil(a[l - 1] * COST_STEP));
  return a;
});
const SPD = PINS.map((p) => Math.round(PH / p.per));

/** Multiplicador de una edad (y sus vueltas) para premios, cuotas y precios. En las partidas por tiempo, 1. */
export function scale(S) {
  if (S.mode !== 'solo') return 1;
  let s = EDAD_MUL[S.edad];
  for (let i = 0; i < S.laps; i++) s *= LAP_MUL;
  return s;
}
/** La dureza propia de la edad: sube la cuota y la vida de la gigante (las piñatas comunes no, así siempre se junta algo). */
const hard = (S) => (S.mode === 'solo' ? EDAD_HARD[S.edad] : 1);

/** Lo que cuestan los próximos `k` niveles del invitado `g`. */
export function guestCost(S, g, k = 1) {
  const s = scale(S);
  let sum = 0;
  for (let j = 0; j < k && S.guests[g] + j < MAX_LV; j++) sum += Math.ceil(GCOST[g][S.guests[g] + j] * s);
  return sum;
}
export function guestAfford(S, g, max = 50) {
  const s = scale(S);
  let left = S.ca;
  let n = 0;
  while (n < max && S.guests[g] + n < MAX_LV) {
    const c = Math.ceil(GCOST[g][S.guests[g] + n] * s);
    if (c > left) break;
    left -= c;
    n++;
  }
  return n;
}
export const mantelCost = (S, i) => Math.ceil(MANTEL[i].cost * scale(S));
export const mantelAvail = (S, i) => !!MANTEL[i] && !S.mantel[i] && (MANTEL[i].k === 0 || !!S.mantel[i - 1]);
export const floorCount = (S, p) => {
  let n = 0;
  for (let k = 0; k < 6; k++) n += S.torta[p * 6 + k];
  return n;
};
export const tortaAvail = (S, i) => !!TORTA[i] && !S.torta[i] && (TORTA[i].p === 0 || floorCount(S, TORTA[i].p - 1) >= FLOOR_NEED);
export const figCount = (S) => S.album.reduce((a, b) => a + b, 0);
export const figCost = (S) => (figCount(S) < FIG_N ? FIG_COST[figCount(S)] : Infinity);

// ---------------------------------------------------------------- modificadores
function applyFx(m, list) {
  for (let i = 0; i < list.length; i++) {
    const op = list[i][0];
    const key = list[i][1];
    const v = list[i][2];
    if (op === 'mul') m[key] *= v;
    else if (op === 'add') m[key] += v;
    else m[key] = v;
  }
}

/** Cuántas cartas distintas de cada etiqueta hay en la fiesta. */
export function tagCount(cards) {
  const n = TAGS.map(() => 0);
  const seen = new Set();
  for (const c of cards) {
    if (seen.has(c)) continue;
    seen.add(c);
    n[CARDS[c].tag]++;
  }
  return n;
}

export function recalc(S) {
  const m = {
    candy: 1, dmg: 1, hand: 1, handPct: 0.03, guest: GUEST_K, fmax: FMAX, freg: FREG, zone: ZONE, spd: 1, quota: 1,
    euHit: 0, euStart: 0, daleT: DALE_LEN, daleX: 3, daleKeep: 0, llenoX: 0, streakCap: 10, streakStep: 0.2, perHit: 0,
    goldX: 3, lastX: 1, tandaT: 0, free5: 0, first: 0, popF: 0, floor: 0, jump: 0, jumpK: 0, jumpDmg: 1, bolt: 0, stun: 0,
    gJump: 0, popDmg: 0, burn: 0, burnK: 1, burnT: 1, burnPay: 1, spread: 0, daleFire: 0, preBurn: 0, noEscape: 0, fishStop: 0,
    noSpin: 0, robotOff: 0, fastGuest: 0, choco: 0, startT: 1, offerN: 3, reroll: 0, pts: 0, startLv: 0, vel: 1, gHp: 1,
    figPct: FIG_PCT, sets: 0,
  };
  const solo = S.mode === 'solo';
  if (!solo) m.candy *= SPRINT.candy;
  for (let i = 0; i < MANTEL.length; i++) if (S.mantel[i]) applyFx(m, MANTEL[i].fx);
  if (solo) {
    for (let i = 0; i < TORTA.length; i++) if (S.torta[i]) applyFx(m, TORTA[i].fx);
    let n = 0;
    for (let p = 0; p < FIG_N / FIG_PAGE; p++) {
      let k = 0;
      for (let j = 0; j < FIG_PAGE; j++) k += S.album[p * FIG_PAGE + j];
      n += k;
      if (k === FIG_PAGE) m.candy *= FIG_PAGE_MUL;
    }
    m.candy *= 1 + m.figPct * n;
    m.candy *= 1 + ACH_PCT * S.achN;
    m.dmg *= 1 + FAME_PCT * S.fr; // cada fiesta en la edad suma un poco, así nadie se queda trabado
    m.candy *= 1 + FAME_PCT * S.fr;
  }
  const P = S.party;
  if (P) {
    for (const c of P.cards) applyFx(m, CARDS[c].fx);
    const tc = tagCount(P.cards);
    for (let t = 0; t < TAGS.length; t++)
      if (tc[t] >= 3) {
        applyFx(m, TAGS[t].set);
        m.sets++;
      }
  }
  if (m.zone > 60) m.zone = 60;
  S.m = m;
  return m;
}

/** Daño por segundo de los invitados (sin contar el Mago ni el Perro como golpes seguidos). */
export function guestDps(S) {
  let d = 0;
  for (let g = 0; g < NG; g++) {
    if (!S.guests[g]) continue;
    const G = GUESTS[g];
    const hits = G.act === 'two' ? 2 : G.act === 'all' ? 3 : G.act === 'sure' ? 2 : 1;
    d += (G.dmg * LV[S.guests[g]] * hits * TPS) / G.per;
  }
  return d * S.m.guest * S.m.dmg;
}
export const guestDmg = (S, g) => GUESTS[g].dmg * LV[S.guests[g]] * S.m.guest * S.m.dmg;
export const handDmg = (S) => (S.m.hand + S.m.handPct * guestDps(S)) * S.m.dmg;
export const streakMul = (S) => 1 + S.m.streakStep * (S.streak < S.m.streakCap ? S.streak : S.m.streakCap);
export const llenoMul = (S) => 2 + S.m.llenoX;
/** Cuota de la tanda `t` (en caramelos). */
export const quotaOf = (S, t) => QUOTA_N[t] * PINS[0].prize * TANDA_MUL[t] * scale(S) * hard(S) * S.m.quota;
/** Orden de magnitud de un número (≈ log10, lineal entre potencias de 10), solo con divisiones. */
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
/** Velitas en total que corresponden a haber juntado `life` caramelos en toda la partida. */
export function velFor(S, life) {
  const d = mag(life) - VEL_L0;
  return d > 0 ? Math.floor(S.m.vel * VEL_K * d * d) : 0;
}
export const velGain = (S) => Math.max(1, velFor(S, S.life) - S.velTot);
export const velNeed = (S, n) => unmag(VEL_L0 + Math.sqrt(n / (S.m.vel * VEL_K)));
export const flags = (S) => EDADES[S.edad].fl;
/** Cuántos puntos tiene la soga. */
export function nPts(S) {
  let n = 3 + (S.mode === 'solo' ? S.m.pts : 0) + (flags(S).rope2 ? 1 : 0);
  return n > 5 ? 5 : n;
}
export const ptX = (n, i) => Math.round((FW * (i + 1)) / (n + 1));
export const lowRope = (S, i) => !!flags(S).rope2 && i % 2 === 1;

// ---------------------------------------------------------------- estado
const fit = (src, len) => Array.from({ length: len }, (_, i) => (src && src[i] ? 1 : 0));
export function create(o = {}) {
  const seed = String(o.seed ?? 1);
  const S = {
    v: 1,
    mode: o.mode || 'solo',
    seed,
    tick: 0,
    ca: 0, // caramelos en mano
    total: 0, // juntados en esta edad (en las partidas por tiempo: el puntaje)
    life: 0,
    choco: 0,
    vel: 0,
    velTot: 0,
    edad: Math.max(0, Math.min(NE - 1, o.edad | 0)),
    laps: 0,
    only: o.only ? 1 : 0,
    plan: RACE[o.plan] ? Number(o.plan) : 0,
    party: null,
    pts: [],
    q: [],
    force: FMAX,
    streak: 0,
    eu: 0,
    dale: 0,
    lt: -9,
    lit: 0,
    wind: 2,
    nWind: WIND_EVERY,
    nGold: GOLD_EVERY,
    guests: GUESTS.map(() => 0),
    gt: GUESTS.map(() => 0),
    mantel: MANTEL.map(() => 0),
    album: Array(FIG_N).fill(0),
    torta: TORTA.map(() => 0),
    ach: ACH.map(() => 0),
    achN: 0,
    cake: 0, // venció a la gigante: puede soplar las velitas
    best: 0, // la tanda más lejana en esta edad
    fr: 0, // fiestas hechas en esta edad
    last: null, // cómo salió la última fiesta
    sid: 0,
    st: { hits: 0, lleno: 0, bestStreak: 0, dale: 0, pops: 0, giants: 0, parties: 0, edades: 0, unic: 0, cards: 0, ticks: 0, daily: 0, bestT: 0, sets: 0, choco: 0 },
    r: { pin: seedRng(`${seed}:pin`), card: seedRng(`${seed}:card`), ev: seedRng(`${seed}:ev`), gst: seedRng(`${seed}:gst`), wild: seedRng(`${seed}:wild`) },
  };
  recalc(S);
  S.force = S.m.fmax;
  if (S.plan) {
    S.party = newParty(S);
    beginTanda(S, 1, null);
  }
  return S;
}

/** Lo que cambia en la piñata del día: edad (solo vale su regla) y semilla (las cartas y las piñatas), sacadas de la fecha. */
export function dailySetup(key) {
  const r = seedRng(`daily:${key}`);
  return { seed: `d:${key}`, mode: 'daily', edad: rint(r, NE), only: 1, plan: 3 };
}

const DERIVED = { m: 1 };
/** Copia en JSON puro. Con `full = false` deja afuera la fiesta en curso (para el guardado de la gira). */
export function dump(S, full = true) {
  const o = {};
  for (const k in S) if (!DERIVED[k]) o[k] = S[k];
  const c = JSON.parse(JSON.stringify(o));
  if (!full) {
    c.party = null;
    c.pts = [];
    c.q = [];
    c.dale = 0;
    c.eu = 0;
    c.streak = 0;
  }
  return c;
}
export function load(o) {
  const S = create({ seed: o.seed, mode: o.mode, edad: o.edad, only: o.only, plan: o.plan });
  S.party = null;
  for (const k in o) if (k in S && !DERIVED[k] && k !== 'st' && k !== 'r') S[k] = o[k];
  Object.assign(S.st, o.st || {});
  for (const k in S.r) if (Array.isArray(o.r?.[k]) && o.r[k].length === 4) S.r[k] = o.r[k].map((x) => x | 0);
  S.guests = GUESTS.map((_, i) => Math.max(0, Math.min(MAX_LV, Math.floor(Number(o.guests?.[i]) || 0))));
  S.gt = GUESTS.map((_, i) => Math.floor(Number(o.gt?.[i]) || 0));
  S.mantel = fit(o.mantel, MANTEL.length);
  S.album = fit(o.album, FIG_N);
  S.torta = fit(o.torta, TORTA.length);
  S.ach = fit(o.ach, ACH.length);
  S.achN = S.ach.reduce((a, b) => a + b, 0);
  S.edad = Math.max(0, Math.min(NE - 1, S.edad | 0));
  S.laps = Math.max(0, S.laps | 0);
  if (!Array.isArray(S.pts)) S.pts = [];
  if (!Array.isArray(S.q)) S.q = [];
  recalc(S);
  return S;
}

// ---------------------------------------------------------------- piñatas
function newPin(S, k, t) {
  const P = PINS[k] || PINS[0];
  const tm = TANDA_MUL[t > 8 ? 8 : t];
  const hp = k === CLOUDLET ? CLOUDLET_HP * tm : P.hp * tm;
  const prize = k === CLOUDLET ? 0 : P.prize * tm * scale(S);
  const p = { id: ++S.sid, k, hp, max: hp, prize, ph: rint(S.r.pin, 4) * 1024, sp: SPD[k] || SPD[0], gold: 0, burn: 0, stun: 0, hold: 0, up: 0, spin: 0, in: S.tick + ENTER, hits: 0 };
  if (S.m.preBurn) p.burn = Math.round(BURN_T * S.m.burnT);
  return p;
}
function newGiant(S) {
  const hp = GIANT_HP * PINS[0].hp * TANDA_MUL[8] * hard(S) * S.m.gHp;
  return { id: ++S.sid, k: GIANT, hp, max: hp, prize: GIANT_PRIZE * PINS[0].prize * TANDA_MUL[8] * scale(S), ph: 0, sp: Math.round(PH / GIANT_PER), gold: 0, burn: 0, stun: 0, hold: 0, up: 0, spin: 0, in: S.tick + ENTER * 2, hits: 0, weak: 1, wn: S.tick + GIANT_WEAK };
}

/** La próxima piñata de la fila: las nubecitas primero, el Unicornio una vez por tanda y el resto según la tanda. */
function nextType(S) {
  const P = S.party;
  if (S.q.length) return S.q.shift();
  P.spawn++;
  if (P.uAt && P.spawn === P.uAt) return 8;
  if (P.reh) return 0;
  const t = P.t;
  let tot = 0;
  for (let k = 0; k < NP; k++) if (PINS[k].from <= t) tot += PINS[k].w;
  let r = rint(S.r.pin, tot);
  for (let k = 0; k < NP; k++) {
    if (PINS[k].from > t) continue;
    if (r < PINS[k].w) return k;
    r -= PINS[k].w;
  }
  return 0;
}
function fill(S, i, out) {
  const P = S.party;
  if (P.t === 9) return;
  const k = nextType(S);
  S.pts[i] = newPin(S, k, P.t);
  if (out) out.push({ e: 'enter', i, k });
}

/**
 * ¿En qué parte del vaivén está? 0 afuera, 1 en la zona de lleno (el tramo marcado), 2 en el centro (perfecto). Mira la fase del
 * tick anterior, la de este y la del siguiente: lo que se ve en pantalla está entre medio, y así el dedo tiene margen.
 */
function zoneAt(S, p, i) {
  const fl = flags(S);
  if (fl.night && p.k !== GIANT && i !== S.lit) return 0;
  if (p.hold > 0) return 2;
  const z = S.m.zone * 127;
  const zp = (S.m.zone < PERFECT ? S.m.zone : PERFECT) * 127;
  const d = adv(S, p, i);
  const wave = p.k === 2 ? tri : (j) => SWING[j];
  let best = 0;
  for (const ph of [p.ph - d, p.ph, p.ph + d]) {
    const j = (Math.floor((ph < 0 ? ph + PH : ph) / 16) & 255) | 0;
    if (fl.wheel && p.k !== GIANT && SWING[(j + 64) & 255] < 0) continue; // en la rueda, solo abajo
    let v = wave(j);
    if (v < 0) v = -v;
    if (v * 100 <= zp) return 2;
    if (v * 100 <= z) best = 1;
  }
  return best;
}
/** Cuánto avanza la fase en un tick. */
function adv(S, p, i) {
  if (p.stun > 0 || p.hold > 0) return 0;
  const fl = flags(S);
  let v = p.sp * S.m.spd;
  if (fl.wind) v *= WIND[S.wind];
  if (fl.waves) v *= 1 + (0.3 * SWING[(S.tick * 3) & 255]) / 127;
  if (fl.fast) v *= FAST_SPD;
  if (lowRope(S, i)) v *= ROPE2_SPD;
  if (p.k === 2 && S.m.fishStop) {
    const x = tri((Math.floor(p.ph / 16) & 255) | 0);
    if ((x < 0 ? -x : x) * 100 <= S.m.zone * 127 * 2) v *= 0.4;
  }
  return v;
}
/** Lo que avanza la fase de `p` en un tick (para que el dibujo interpole; la sim usa la misma cuenta). */
export const advOf = (S, p, i) => adv(S, p, i);
/** 0 afuera, 1 de lleno, 2 perfecto (para dibujar el tramo encendido). */
export const zoneOf = (S, i) => (S.pts[i] ? zoneAt(S, S.pts[i], i) : 0);
export const isLleno = (S, i) => {
  const p = S.pts[i];
  return !!p && zoneAt(S, p, i) > 0;
};
/** ¿Tiene una punta para abajo la Estrella? (cinco puntas: un 30 % de cada vuelta) */
export const starDown = (p) => {
  const a = (p.spin * 5) % PH;
  return a < PH * 0.15 || a > PH * 0.85;
};

function earn(S, g) {
  S.ca += g;
  S.total += g;
  S.life += g;
  const P = S.party;
  if (P) {
    P.got += g;
    P.sum += g;
  }
}

/** Lo que paga reventar `p` ahora. */
function payOf(S, p) {
  const P = S.party;
  const m = S.m;
  let v = p.prize * m.candy * streakMul(S);
  if (p.gold) v *= m.goldX;
  if (S.dale > 0) v *= m.daleX;
  if (p.burn > 0) v *= m.burnPay;
  if (m.lastX > 1 && P && !P.reh && P.end - S.tick <= LAST_TICKS) v *= m.lastX;
  return v;
}

function pop(S, i, out) {
  const p = S.pts[i];
  const P = S.party;
  const m = S.m;
  S.pts[i] = null;
  S.st.pops++;
  let pay = 0;
  if (p.k === GIANT) {
    pay = payOf(S, p);
    earn(S, pay);
    S.choco += 5;
    S.st.choco += 5;
    S.st.giants++;
    if (S.mode === 'solo') S.cake = 1;
    P.giant = 1;
    if (out) out.push({ e: 'pop', i, k: p.k, pay, gold: 0, x: 0 });
    if (out) out.push({ e: 'giantDown' });
    P.end = S.tick; // la fiesta termina con la gigante
    return;
  }
  if (p.k !== 9) {
    pay = payOf(S, p);
    earn(S, pay);
  }
  if (p.k === 4) for (let j = 0; j < 3; j++) S.q.unshift(CLOUDLET);
  else if (p.k === 8) {
    const c = 1 + m.choco;
    S.choco += c;
    S.st.choco += c;
    S.st.unic++;
    if (out) out.push({ e: 'unic', i, choco: c });
  } else if (p.k === 9) {
    S.force = m.fmax;
    if (S.dale <= 0 && S.eu < 100) S.eu = S.eu + GIFT_EU > 100 ? 100 : S.eu + GIFT_EU;
  }
  if (m.popF) S.force = S.force + m.popF > m.fmax ? m.fmax : S.force + m.popF;
  if (out) out.push({ e: 'pop', i, k: p.k, pay, gold: p.gold });
  if (m.spread && p.burn > 0) for (const j of [i - 1, i + 1]) if (S.pts[j]) S.pts[j].burn = Math.round(BURN_T * m.burnT);
  if (m.popDmg) for (let j = 0; j < S.pts.length; j++) if (j !== i && S.pts[j] && S.pts[j].in <= S.tick) damage(S, j, p.max * POP_DMG, true, 2, out);
  fill(S, i, out);
}

/**
 * Daño a la piñata del punto `i`. `lleno` dice si cuenta como golpe de lleno (el Robot solo cede así). `src`: 0 mano,
 * 1 invitado, 2 efecto (salto, rayo, fuego, onda). Devuelve el daño que hizo.
 */
function damage(S, i, d, lleno, src, out) {
  const p = S.pts[i];
  if (!p || p.in > S.tick || !(d > 0)) return 0;
  const m = S.m;
  if (p.k === 5 && !lleno && !(m.robotOff && p.hits > 0)) d *= 0.1; // blindado: sin lleno casi no le hace
  if (p.k === 1 && !m.noSpin && !starDown(p)) d *= 0.5;
  p.hp -= d;
  if (src < 2) p.hits++;
  if (p.hp <= 0.000001) pop(S, i, out);
  return d;
}

/** Los vecinos de un punto en la soga. */
const near = (S, i) => {
  const a = [];
  if (S.pts[i - 1]) a.push(i - 1);
  if (S.pts[i + 1]) a.push(i + 1);
  return a;
};
function jump(S, i, d, out) {
  const m = S.m;
  const f = (m.jumpK ? 1 : JUMP_FRAC) * m.jumpDmg;
  for (const j of near(S, i)) {
    const q = S.pts[j];
    if (!q || q.in > S.tick) continue;
    damage(S, j, d * f, true, 2, out);
    if (m.stun && S.pts[j]) S.pts[j].stun = m.stun;
    if (out) out.push({ e: 'jump', a: i, b: j });
  }
}
function burnIt(S, p) {
  if (S.m.burn || S.m.preBurn) p.burn = Math.round(BURN_T * S.m.burnT);
}

// ---------------------------------------------------------------- la mano
function hit(S, i, out) {
  const P = S.party;
  if (!P || P.phase !== 'run' || !Number.isInteger(i) || i < 0) return false;
  const m = S.m;
  const giant = P.t === 9;
  const at = giant ? 0 : i;
  if (giant ? i > 2 : i >= S.pts.length) return false;
  const p = S.pts[at];
  if (!p || p.in > S.tick) return false;
  const free = S.dale > 0 || (m.free5 && (P.hits + 1) % 5 === 0) || (m.floor && S.force - 1 < m.floor);
  if (S.tick - S.lt < (free ? FREE_GAP : TAP_GAP)) return false;
  if (!free && S.force < 1) return false;
  const grade = zoneAt(S, p, at);
  let lleno = S.dale > 0 || grade > 0 || (!!m.first && p.hits === 0);
  let perfect = grade === 2 && !(giant && i !== p.weak);
  if (p.k === 6 && !lleno) {
    const b = S.tick % BEAT;
    if (b <= BEAT_WIN || b >= BEAT - BEAT_WIN) lleno = true; // el Tambor: al compás cuenta como de lleno
  }
  let half = false;
  if (giant && i !== p.weak) {
    lleno = false; // fuera del punto débil no hay lleno
    half = true;
  }
  if (!free) {
    S.force -= 1;
    if (p.k === 3 && !lleno) S.force -= 1; // el Cactus pincha
    if (S.force < 0) S.force = 0;
  }
  S.lt = S.tick;
  P.hits++;
  S.st.hits++;
  if (lleno) {
    S.streak++;
    S.st.lleno++;
    if (S.streak > S.st.bestStreak) S.st.bestStreak = S.streak;
    if (S.dale <= 0 && S.eu < 100) {
      S.eu += EU_HIT + EU_STREAK * S.streak + m.euHit;
      if (S.eu >= 100) {
        S.eu = 100;
        if (out) out.push({ e: 'euFull' });
      }
    }
  } else S.streak = 0;
  if (perfect && S.dale <= 0 && S.eu < 100) S.eu = S.eu + PERFECT_EU > 100 ? 100 : S.eu + PERFECT_EU;
  let d = handDmg(S) * (lleno ? llenoMul(S) + (perfect ? PERFECT_X : 0) : 1) * (half ? 0.5 : 1);
  const pk = p.k;
  if (m.perHit && !P.reh) earn(S, m.perHit * PINS[0].prize * 0.1 * TANDA_MUL[P.t > 8 ? 8 : P.t] * scale(S) * m.candy);
  burnIt(S, p);
  const done = damage(S, at, d, lleno, 0, out);
  if (out) out.push({ e: 'hit', i: at, w: i, lleno, perfect, d: done, k: pk, clank: pk === 5 && !lleno && done < d });
  if (lleno && m.jump && !giant) jump(S, at, d, out);
  if (m.bolt && P.hits % m.bolt === 0) {
    for (let j = 0; j < S.pts.length; j++) {
      if (!S.pts[j]) continue;
      damage(S, j, handDmg(S) * 2, true, 2, out);
      if (m.stun && S.pts[j]) S.pts[j].stun = m.stun;
    }
    if (out) out.push({ e: 'bolt' });
  }
  return true;
}

function dale(S, out) {
  const P = S.party;
  if (!P || P.phase !== 'run' || P.reh || S.dale > 0 || S.eu < 100) return false;
  const m = S.m;
  S.dale = m.daleT;
  S.eu = m.daleKeep;
  S.st.dale++;
  if (m.daleFire) for (const p of S.pts) if (p) p.burn = Math.round(BURN_T * m.burnT);
  if (out) out.push({ e: 'dale' });
  return true;
}

// ---------------------------------------------------------------- invitados
function nearestTo(S, x) {
  const n = S.pts.length;
  let best = -1;
  let bd = 1e9;
  for (let i = 0; i < n; i++) {
    const p = S.pts[i];
    if (!p || p.in > S.tick) continue;
    const px = ptX(n, i);
    const d = px > x ? px - x : x - px;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}
function toughest(S) {
  let best = -1;
  for (let i = 0; i < S.pts.length; i++) {
    const p = S.pts[i];
    if (p && p.in <= S.tick && (best < 0 || p.hp > S.pts[best].hp)) best = i;
  }
  return best;
}
function gHit(S, g, i, d, lleno, out) {
  if (i < 0 || !S.pts[i]) return;
  if (out) out.push({ e: 'gHit', g, i });
  const m = S.m;
  const p = S.pts[i];
  if (p.k === GIANT) lleno = true; // contra la gigante los invitados no miran el punto débil
  damage(S, i, d, lleno, 1, out);
  if (m.gJump && S.party.t !== 9) jump(S, i, d, out);
}
function guestAct(S, g, out) {
  const G = GUESTS[g];
  const d = guestDmg(S, g);
  const giant = S.party.t === 9;
  if (out) out.push({ e: 'guest', g });
  switch (G.act) {
    case 'near':
      gHit(S, g, giant ? 0 : nearestTo(S, G.x), d, false, out);
      break;
    case 'dog': {
      const i = giant ? 0 : toughest(S);
      if (i < 0 || !S.pts[i]) break;
      const p = S.pts[i];
      if (p.k !== GIANT) {
        p.hold = DOG_FREEZE;
        p.ph = (Math.floor(p.ph / (PH / 2)) * PH) / 2; // queda colgando en el medio
      }
      gHit(S, g, i, d, false, out);
      break;
    }
    case 'sure':
      gHit(S, g, giant ? 0 : toughest(S), d * 2, true, out);
      break;
    case 'two': {
      if (giant) {
        gHit(S, g, 0, d * 2, false, out);
        break;
      }
      const a = toughest(S);
      gHit(S, g, a, d, false, out);
      let b = -1;
      for (let i = 0; i < S.pts.length; i++) if (i !== a && S.pts[i] && S.pts[i].in <= S.tick && (b < 0 || S.pts[i].hp > S.pts[b].hp)) b = i;
      gHit(S, g, b >= 0 ? b : a, d, false, out);
      break;
    }
    case 'all':
      for (let i = 0; i < S.pts.length; i++) if (S.pts[i] && S.pts[i].in <= S.tick) gHit(S, g, i, d, true, out);
      break;
    case 'gold': {
      const list = [];
      for (let i = 0; i < S.pts.length; i++) if (S.pts[i] && !S.pts[i].gold && S.pts[i].k !== GIANT && S.pts[i].k !== 9) list.push(i);
      if (list.length) {
        const i = list[rint(S.r.gst, list.length)];
        S.pts[i].gold = 1;
        if (out) out.push({ e: 'gold', i });
      }
      gHit(S, g, giant ? 0 : toughest(S), d, false, out);
      break;
    }
    default:
      gHit(S, g, toughest(S), d, true, out);
  }
}

// ---------------------------------------------------------------- tandas y fiestas
function newParty(S, reh = 0) {
  return { t: 0, phase: 'run', got: 0, quota: 0, end: 0, cards: [], offer: null, picked: 0, sum: 0, reh, fast: -1, hits: 0, spawn: 0, uAt: 0, giant: 0, np: 0, ok: 0 };
}

function beginTanda(S, t, out) {
  const P = S.party;
  const m = S.m;
  P.t = t;
  P.phase = 'run';
  P.got = 0;
  P.hits = 0;
  P.spawn = 0;
  P.ok = 0;
  P.offer = null;
  P.picked = 0;
  P.quota = S.plan || P.reh || t === 9 ? 0 : quotaOf(S, t);
  const len = t === 9 ? GIANT_LEN : S.plan ? RACE[S.plan].tanda * TPS : TANDA_LEN + m.tandaT;
  P.end = P.reh ? 1e9 : S.tick + len;
  P.uAt = t >= 2 && !P.reh ? 3 + rint(S.r.pin, 6) : 0;
  S.force = m.fmax;
  S.streak = 0;
  S.eu = m.euStart > 100 ? 100 : m.euStart;
  S.dale = 0;
  S.lt = -9;
  S.q = [];
  for (let g = 0; g < NG; g++) S.gt[g] = S.tick + 20 + g * 7;
  S.nGold = S.tick + GOLD_EVERY;
  S.nWind = S.tick + WIND_EVERY;
  const n = t === 9 ? 1 : P.reh ? 3 : nPts(S);
  P.np = n;
  S.pts = Array(n).fill(null);
  if (t === 9) S.pts[0] = newGiant(S);
  else if (P.reh) fill(S, 1, out);
  else
    for (let i = 0; i < n; i++) {
      fill(S, i, out);
      S.pts[i].in = S.tick + ENTER + i * 6;
    }
  if (out) out.push({ e: 'tandaStart', t });
}

/** Tres cartas (cuatro con la Torta) sacadas del azar de las cartas. */
function makeOffer(S) {
  const P = S.party;
  const n = S.plan ? 3 : S.m.offerN;
  const o = [];
  for (let k = 0; k < n; k++) {
    let c = rint(S.r.card, NCARD);
    for (let tries = 0; tries < 40 && (o.includes(c) || (S.m.reroll && P.cards.includes(c))); tries++) c = rint(S.r.card, NCARD);
    o.push(c);
  }
  P.offer = o;
}

function endTanda(S, out) {
  const P = S.party;
  const t = P.t;
  S.dale = 0;
  if (t > S.best && !S.plan) S.best = t;
  if (t > S.st.bestT && !S.plan && t <= 8) S.st.bestT = t;
  if (S.plan) {
    if (t >= RACE[S.plan].n) {
      P.phase = 'done';
      if (out) out.push({ e: 'tandaEnd', t, ok: 1, last: 1 });
      return;
    }
    makeOffer(S);
    P.phase = 'cards';
    if (out) out.push({ e: 'tandaEnd', t, ok: 1 });
    return;
  }
  const ok = t < 9 && P.got >= P.quota;
  if (out) out.push({ e: 'tandaEnd', t, ok: ok ? 1 : 0 });
  if (ok) {
    makeOffer(S);
    P.phase = 'cards';
  } else endParty(S, out);
}

function endParty(S, out) {
  const P = S.party;
  S.party = null;
  S.pts = [];
  S.q = [];
  S.dale = 0;
  S.eu = 0;
  S.streak = 0;
  S.st.parties++;
  S.fr++;
  if (P.cards.length && tagCount(P.cards).some((n) => n >= 3)) S.st.sets++;
  S.last = { t: P.t, sum: P.sum, giant: P.giant };
  recalc(S);
  if (out) out.push({ e: 'partyEnd', t: P.t, sum: P.sum, giant: P.giant });
}

function pick(S, i, out) {
  const P = S.party;
  if (!P || P.phase !== 'cards' || !P.offer || P.picked || !Number.isInteger(i) || i < 0 || i >= P.offer.length) return false;
  const c = P.offer[i];
  P.cards.push(c);
  P.picked = 1;
  S.st.cards++;
  if (CARDS[c].fx.some((f) => f[1] === 'fastGuest')) {
    const own = [];
    for (let g = 0; g < NG; g++) if (S.guests[g]) own.push(g);
    P.fast = own.length ? own[rint(S.r.gst, own.length)] : -1;
  }
  recalc(S);
  if (out) out.push({ e: 'pick', c });
  if (!S.plan) beginTanda(S, P.t === TANDAS ? 9 : P.t + 1, out);
  return true;
}

function startParty(S, out) {
  if (S.party) {
    if (!S.party.reh) return false;
    S.party = null;
  }
  S.party = newParty(S);
  recalc(S);
  beginTanda(S, Math.max(1, Math.min(TANDAS, S.m.startT)), out);
  return true;
}

/** El ensayo del tutorial (solo antes de la primera fiesta): una piñata en el medio, sin reloj ni cuota. */
function rehearse(S, out) {
  if (S.st.parties > 0 || (S.party && !S.party.reh)) return false;
  if (!S.party) {
    S.party = newParty(S, 1);
    beginTanda(S, 1, out);
  }
  return true;
}

// ---------------------------------------------------------------- compras
function buyGuest(S, g, n) {
  if (!Number.isInteger(g) || g < 0 || g >= NG || !Number.isInteger(n) || n < 1) return 0;
  if (n > 50) n = 50;
  const s = scale(S);
  let got = 0;
  while (got < n && S.guests[g] < MAX_LV) {
    const c = Math.ceil(GCOST[g][S.guests[g]] * s);
    if (c > S.ca) break;
    S.ca -= c;
    S.guests[g]++;
    got++;
  }
  if (got) recalc(S);
  return got;
}
function buyMantel(S, i) {
  if (!Number.isInteger(i) || !mantelAvail(S, i) || mantelCost(S, i) > S.ca) return false;
  S.ca -= mantelCost(S, i);
  S.mantel[i] = 1;
  recalc(S);
  return true;
}
function buyFig(S, i) {
  if (!Number.isInteger(i) || i < 0 || i >= FIG_N || S.album[i] || figCost(S) > S.choco) return false;
  S.choco -= figCost(S);
  S.album[i] = 1;
  recalc(S);
  return true;
}
function buyTorta(S, i) {
  if (!Number.isInteger(i) || !tortaAvail(S, i) || TORTA[i].cost > S.vel) return false;
  S.vel -= TORTA[i].cost;
  S.torta[i] = 1;
  recalc(S);
  return true;
}

/** Soplar las velitas: hay que haber vencido a la gigante. Se cobran las Velitas y quedan Álbum, Chocolatines y Torta. */
function blow(S, out) {
  if (!S.cake || S.party) return false;
  const g = velGain(S);
  S.vel += g;
  S.velTot += g;
  if (S.edad < NE - 1) S.edad++;
  else {
    S.edad = 0;
    S.laps++;
  }
  S.st.edades++;
  S.ca = 0;
  S.total = 0;
  S.guests = GUESTS.map(() => 0);
  S.mantel = MANTEL.map(() => 0);
  S.cake = 0;
  S.best = 0;
  S.fr = 0;
  S.last = null;
  recalc(S);
  if (S.m.startLv) for (let g = 0; g < 3; g++) S.guests[g] = S.m.startLv;
  recalc(S);
  if (out) out.push({ e: 'blow', g });
  return true;
}

function checkAch(S, out) {
  let got = false;
  const st = S.st;
  let lv = 0;
  for (const l of S.guests) lv += l;
  for (let i = 0; i < ACH.length; i++) {
    if (S.ach[i]) continue;
    const a = ACH[i];
    const k = a.k;
    const v =
      k === 'life' ? S.life : k === 'party' ? st.parties : k === 'tanda' ? st.bestT : k === 'giant' ? st.giants : k === 'streak' ? st.bestStreak : k === 'lleno' ? st.lleno : k === 'dale' ? st.dale
        : k === 'pops' ? st.pops : k === 'unic' ? st.unic : k === 'fig' ? figCount(S) : k === 'edad' ? st.edades : k === 'lv' ? lv : k === 'mantel' ? S.mantel.reduce((x, y) => x + y, 0)
          : k === 'torta' ? S.torta.reduce((x, y) => x + y, 0) : k === 'daily' ? st.daily : st.sets;
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
function weather(S, out) {
  const fl = flags(S);
  const t = S.tick;
  if (fl.wind && t >= S.nWind) {
    S.wind = rint(S.r.ev, WIND.length);
    S.nWind = t + WIND_EVERY;
    if (out) out.push({ e: 'wind', w: S.wind });
  }
  if (fl.gold && t >= S.nGold) {
    S.nGold = t + GOLD_EVERY;
    const list = [];
    for (let i = 0; i < S.pts.length; i++) if (S.pts[i] && !S.pts[i].gold && S.pts[i].k !== GIANT) list.push(i);
    const r = rint(S.r.ev, 8);
    if (list.length) {
      const i = list[r % list.length];
      S.pts[i].gold = 1;
      if (out) out.push({ e: 'gold', i });
    }
  }
  if (fl.night) {
    const lit = Math.floor(t / NIGHT_EVERY) % (S.pts.length || 1);
    if (lit !== S.lit) {
      S.lit = lit;
      if (out) out.push({ e: 'lit', i: lit });
    }
  }
}

export function step(S, out) {
  const t = ++S.tick;
  S.st.ticks++;
  const P = S.party;
  if (S.plan && P && P.phase === 'cards') {
    // partida por tiempo: la próxima tanda empieza por horario; si no eligió carta, se toma la primera
    const R = RACE[S.plan];
    const per = (R.tanda + R.brk) * TPS;
    if ((t - 1) % per === 0 && (t - 1) / per < R.n) {
      if (!P.picked) pick(S, 0, out);
      beginTanda(S, P.t + 1, out);
      P.end = t - 1 + R.tanda * TPS;
    }
  }
  if (P && P.phase === 'run') {
    const m = S.m;
    weather(S, out);
    if (S.force < m.fmax) {
      S.force += m.freg;
      if (S.force > m.fmax) S.force = m.fmax;
    }
    if (S.dale > 0) {
      if (--S.dale === 0 && out) out.push({ e: 'daleEnd' });
    } else if (S.eu > 0 && S.eu < 100) {
      S.eu -= 1 / TPS; // la Euforia baja de a poco, pero llena se queda llena
      if (S.eu < 0) S.eu = 0;
    }
    // invitados
    if (!P.reh)
      for (let g = 0; g < NG; g++) {
        if (!S.guests[g] || t < S.gt[g]) continue;
        guestAct(S, g, out);
        if (!S.party) return;
        let per = GUESTS[g].per;
        if (P.fast === g) per = Math.round(per * FAST_GUEST);
        S.gt[g] = t + per;
      }
    // piñatas: vaivén, fuego, globo y punto débil
    for (let i = 0; i < S.pts.length; i++) {
      const p = S.pts[i];
      if (!p) continue;
      p.ph += adv(S, p, i);
      while (p.ph >= PH) p.ph -= PH;
      if (p.stun > 0) p.stun--;
      if (p.hold > 0) p.hold--;
      if (p.k === 1) p.spin = (p.spin + Math.round(PH / SPIN_PER)) % PH;
      if (p.k === 8 && t % TPS === 0) p.sp = Math.round(SPD[8] * (0.6 + 0.1 * rint(S.r.wild, 11)));
      if (p.k === GIANT && t >= p.wn) {
        p.weak = (p.weak + 1 + rint(S.r.ev, 2)) % 3;
        p.wn = t + GIANT_WEAK;
        if (out) out.push({ e: 'weak', w: p.weak });
      }
      if (p.in > t) continue;
      if (p.burn > 0) {
        p.burn--;
        damage(S, i, (BURN_DPS * m.burnK * handDmg(S)) / TPS, true, 2, out);
        if (!S.party) return;
        if (!S.pts[i] || S.pts[i] !== p) continue;
      }
      if (p.k === 7 && !m.noEscape && !P.reh) {
        p.up++;
        if (p.up >= GLOBO_UP) {
          S.pts[i] = null;
          if (out) out.push({ e: 'escape', i });
          fill(S, i, out);
        }
      }
    }
    if (!P.reh && !P.ok && P.quota && P.got >= P.quota) {
      P.ok = 1;
      if (out) out.push({ e: 'quota' });
    }
    if (t >= P.end) endTanda(S, out);
  }
  if (S.mode === 'solo' && t % TPS === 0) checkAch(S, out);
}

// ---------------------------------------------------------------- acciones
export function act(S, a, out) {
  if (!Array.isArray(a)) return false;
  const solo = S.mode === 'solo';
  const P = S.party;
  switch (a[0]) {
    case 'T':
      return hit(S, a[1], out);
    case 'C':
      return pick(S, a[1], out);
    case 'F':
      return dale(S, out);
    case 'B':
      if (solo ? !!P && !P.reh : !P || P.phase !== 'cards') return false;
      return buyGuest(S, a[1], a[2]) > 0;
    case 'U':
      if (solo ? !!P && !P.reh : !P || P.phase !== 'cards') return false;
      return buyMantel(S, a[1]);
    case 'R':
      return solo && !(P && !P.reh) && buyFig(S, a[1]);
    case 'N':
      return solo && !(P && !P.reh) && buyTorta(S, a[1]);
    case 'G':
      return solo && startParty(S, out);
    case 'H':
      return solo && rehearse(S, out);
    case 'P':
      return solo && blow(S, out);
    default:
      return false;
  }
}

/** En qué anda una partida por tiempo en el tick `t`: tanda `i` de `n`, si está jugando (o en cartas) y cuántos ticks le quedan. */
export function raceInfo(plan, t) {
  const R = RACE[plan];
  const per = (R.tanda + R.brk) * TPS;
  const last = (R.n - 1) * per + R.tanda * TPS;
  if (t >= last) return { i: R.n - 1, n: R.n, run: 0, left: 0, end: 1 };
  const i = Math.floor(t / per);
  const off = t - i * per;
  const run = off < R.tanda * TPS ? 1 : 0;
  return { i, n: R.n, run, left: run ? R.tanda * TPS - off : per - off, end: 0 };
}

// ---------------------------------------------------------------- registro de acciones (duelo online)
/** Una acción con su tick en texto corto: tick en base 36, una letra y los argumentos ("2fT1", "30B03", "41U1b", "50F"). */
export function encodeAct(tick, a) {
  const k = a[0];
  let s = tick.toString(36) + k;
  if (k === 'B') s += a[1].toString(36) + a[2].toString(36);
  else if (k !== 'F') s += a[1].toString(36);
  return s;
}
const ENTRY = /^([0-9a-z]{1,5})([TCFBU])([0-9a-z]{0,4})$/;
export function decodeAct(str) {
  const mt = ENTRY.exec(str);
  if (!mt) return null;
  const tick = parseInt(mt[1], 36);
  const k = mt[2];
  const g = mt[3];
  if (k === 'F') return g.length ? null : { tick, a: ['F'] };
  if (k === 'B') return g.length >= 2 ? { tick, a: ['B', parseInt(g[0], 36), parseInt(g.slice(1), 36)] } : null;
  if ((k === 'T' || k === 'C') && g.length !== 1) return null;
  return g.length ? { tick, a: [k, parseInt(g, 36)] } : null;
}

/**
 * Rehace una partida a medida que llegan las tandas del registro. `feed(texto, maxTick, minTick)` aplica las acciones en orden y
 * descarta las mal escritas, las que retroceden, las del futuro y las que llegan demasiado tarde. `end(tick)` avanza hasta el final.
 */
export class Replayer {
  constructor(opts) {
    this.S = create(opts);
    this.bad = 0;
    this.miss = 0;
    this.unics = 0;
  }
  feed(text, maxTick = Infinity, minTick = 0) {
    if (typeof text !== 'string' || !text) return 0;
    const S = this.S;
    let n = 0;
    const out = [];
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
      while (S.tick < d.tick) this.adv(out);
      if (act(S, d.a, out)) n++;
      else this.miss++;
      this.count(out);
    }
    return n;
  }
  adv(out) {
    step(this.S, out);
    this.count(out);
  }
  count(out) {
    for (const e of out) if (e.e === 'unic') this.unics++;
    out.length = 0;
  }
  end(tick) {
    const out = [];
    while (this.S.tick < tick) this.adv(out);
    return this.S;
  }
}
