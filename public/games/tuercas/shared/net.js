/**
 * Tuercas online — lo que comparten el servidor, el cliente y las pruebas (lógica pura: sin DOM ni red).
 *
 * El servidor (server/games/tuercas.js) corre la carrera de verdad con `stepRace` y manda snapshots. El cliente arma una
 * carrera "espejo" (`makeMirror`) con la misma pista y los mismos vehículos, que nunca simula: la rellena con lo que llega
 * (los demás vehículos se interpolan; el propio se predice con `stepOwn` y se reconcilia, ver /shared/net/predict.js).
 *
 * Tiempo: un "paso de red" (tick) dura 1/60 s = 2 pasos de la física (DT = 1/120 s). El servidor cuenta los ticks desde
 * que empieza la cuenta regresiva: la hora de la carrera es `R.t = tick / TPS − COUNT_TIME`.
 *
 * Mensajes (JSON):
 *   cliente → servidor
 *     { t: 'cfg', cfg }                       mi vehículo (piloto, carrocería, ruedas, accesorio, pintura y ajustes)
 *     { t: 'ready' }                          ya armé la pista: puede arrancar la cuenta
 *     { t: 'i', e: [[seq, tick, d, b], …] }   entradas (ver encodeInput); las últimas 3 con redundancia
 *   servidor → cliente
 *     { t: 'init', track, laps, cls, seed, size, me, go, karts: [{ cfg, human, name, color }] }   una vez por carrera (y al reconectar)
 *     { t: 'prep', ready, total }             cuántos ya armaron la pista
 *     { t: 's', k, f, e, n, x, o, a }         snapshot (ver encodeSnapshot)
 *     { t: 'end', results }                   terminó la carrera
 */
import { DT, COUNT_TIME, createRace } from './race.js';
import { stepKart } from './kart.js';
import { follow } from './ai.js';
import { ITEM_IDS } from './items.js';
import { project, groundAt } from './track.js';
import { clamp, mod } from './util.js';

export const TPS = 60;
export const SUB = Math.round(1 / TPS / DT); // pasos de física por tick (2)
export const TICK_MS = 1000 / TPS;
export const SNAP_EVERY = 3; // un snapshot cada 3 ticks: 20 por segundo
export const MAX_RACERS = 12;
export const GO_TICK = Math.round(COUNT_TIME * TPS);
export const STEER_Q = 16; // el volante viaja en 1/16: de −16 a 16
export const K_PAST = 12; // una entrada puede llegar hasta 12 ticks tarde (200 ms) y se aplica de inmediato
export const K_AHEAD = 36; // y no se acepta con más de 36 ticks (600 ms) de anticipación
export const INBOX_MAX = 24;

const NOOP = () => {};

// ---------------------------------------------------------------- entradas
/** Entradas del jugador ({ steer, accel, brake, drift, item }) → [d, b] enteros para la red. */
export function encodeInput(inp) {
  return [Math.round(clamp(inp.steer || 0, -1, 1) * STEER_Q), (inp.accel ? 1 : 0) | (inp.brake ? 2 : 0) | (inp.drift ? 4 : 0) | (inp.item ? 8 : 0)];
}

/** Al revés: escribe las entradas en `out` (se reusa para no crear objetos). */
export function decodeInput(d, b, out = {}) {
  out.steer = d / STEER_Q;
  out.accel = !!(b & 1);
  out.brake = !!(b & 2);
  out.drift = !!(b & 4);
  out.item = !!(b & 8);
  return out;
}

/**
 * Estado de entradas de una persona: lo último que se aplicó (`seq`) y lo que tiene apretado (`sd` volante, `sb` botones;
 * no se llaman `d` porque en el vehículo `d` es la distancia al eje de la pista) y lo que espera en la bandeja.
 */
export const newInputState = () => ({ seq: 0, inSeq: 0, lastK: 0, inbox: [], sd: 0, sb: 0, lastMsg: 0 });

/** ¿Una entrada [seq, tick, d, b] bien formada? */
export const validInput = (e) => Array.isArray(e) && e.length >= 4 && Number.isInteger(e[0]) && e[0] > 0 && Number.isInteger(e[1]) && Number.isInteger(e[2]) && Math.abs(e[2]) <= STEER_Q && Number.isInteger(e[3]) && e[3] >= 0 && e[3] <= 15;

/**
 * Servidor: valida y encola las entradas que llegan ([[s, k, d, b], …], con redundancia: las repetidas se descartan).
 * El paso `k` en que debe valer se acota a [tick − K_PAST, tick + K_AHEAD] y nunca retrocede. Devuelve false si el
 * mensaje está mal formado.
 */
export function queueInputs(p, list, tick) {
  if (!Array.isArray(list) || list.length > 6) return false;
  for (const e of list) if (!validInput(e)) return false;
  for (const [s, k, d, b] of list) {
    if (s <= p.inSeq) continue;
    if (p.inbox.length >= INBOX_MAX) break;
    const kk = Math.max(p.lastK, clamp(k, tick - K_PAST, tick + K_AHEAD));
    p.lastK = kk;
    p.inSeq = s;
    p.inbox.push({ s, k: kk, d, b });
  }
  return true;
}

/**
 * Aplica la entrada que ya le toca (k <= tick) de `list` (la bandeja del servidor o el historial del cliente): una por
 * tick, así un toque rápido (apretar y soltar el ítem) no se pierde. Es la misma función en los dos lados.
 */
export function applyInputs(p, list, tick) {
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.s <= p.seq) continue;
    if (e.k > tick) return 0;
    p.seq = e.s;
    p.sd = e.d;
    p.sb = e.b;
    return 1;
  }
  return 0;
}

/** Saca de la bandeja lo que ya se aplicó (el servidor lo hace en cada tick, si no la bandeja se llena y se descartan entradas). */
export function trimInbox(p) {
  while (p.inbox.length && p.inbox[0].s <= p.seq) p.inbox.shift();
}

// ---------------------------------------------------------------- predicción del vehículo propio
/** Copia de un vehículo para predecir (los números se copian; `cfg`, `P` y demás objetos se comparten: no se tocan). */
export const cloneKart = (k) => ({ ...k });

/**
 * Un tick del vehículo propio en el cliente: aplica la entrada que toca y avanza la física `SUB` pasos. Es lo que hace
 * `stepRace` con un vehículo humano, menos los choques, las cajas, los ítems y los aceleradores (eso lo corrige el servidor).
 */
export function stepOwn(st, list, tick, T) {
  applyInputs(st, list, tick);
  if (st.frozen && tick > GO_TICK + 1) st.frozen = false; // la cuenta regresiva ya terminó
  let inp;
  if (st.autoT > 0) inp = follow(st, T, (st._out ||= { steer: 0, accel: false, brake: false, drift: false, item: false }));
  else inp = decodeInput(st.sd, st.sb, (st._inp ||= {}));
  for (let i = 0; i < SUB; i++) {
    if (st.padT > 0) st.padT -= DT;
    stepKart(st, T, inp, DT, NOOP);
  }
}

/** Posición en el plano (para medir el error de la predicción). */
export const ownPos = (st, out) => {
  out.x = st.x;
  out.y = st.z;
};

// ---------------------------------------------------------------- esquemas de los vehículos
const BOOST_KINDS = ['', 'mt', 'pad', 'sifon', 'start', 'trick', 'tow', 'other'];
const ITEMS = [null, ...ITEM_IDS];
const idx = (list, v) => {
  const i = list.indexOf(v ?? null);
  return i < 0 ? 0 : i;
};

/* Estado completo del vehículo propio: [nombre, escala]. El servidor lo manda en cada snapshot: de ahí parte la reconciliación. */
const OWN_NUM = [
  ['x', 1000], ['y', 1000], ['z', 1000], ['vy', 1000], ['yaw', 10000], ['dir', 10000], ['v', 1000], ['ex', 1000], ['ez', 1000], ['yawRate', 10000], ['slip', 10000], ['steer', 10000],
  ['ti', 1], ['ta', 1000], ['d', 1000], ['s', 100], ['prog', 100], ['gy', 1000], ['wrongT', 1000], ['airT', 1000], ['pressT', 1000], ['slope', 1000],
  ['drift', 1], ['driftT', 1000], ['mt', 1000], ['mtLevel', 1], ['boostT', 1000], ['boostK', 1000], ['padT', 1000], ['draftT', 1000], ['pace', 10000], ['top', 100], ['wheelT', 1000],
  ['spinT', 1000], ['spinMax', 1000], ['tumbleT', 1000], ['safeT', 1000], ['fallT', 1000], ['stallT', 1000], ['wallT', 1000],
  ['itemN', 1], ['rollT', 1000], ['shieldT', 1000], ['invT', 1000], ['towT', 1000], ['towTarget', 1], ['autoT', 1000],
  ['nuts', 1], ['rank', 1], ['lap', 1], ['finishT', 100], ['place', 1], ['revT', 1000], ['bestLap', 1000], ['lapStart', 1000],
];
const OWN_BOOL = ['off', 'air', 'hop', 'rampAir', 'trick', 'pend', 'holdPrev', 'boostHard', 'draft', 'wheelie', 'frozen', 'itemPrev', 'finished'];
/** Campos de `makeKart` que no viajan: son de la configuración, del dibujo o se rehacen solos. */
export const OWN_SKIP = new Set(['index', 'cfg', 'P', 'human', 'name', 'px', 'py', 'pz', 'pyaw', 'brain', 'out', 'basePace']);
export const OWN_FIELDS = [...OWN_NUM.map((f) => f[0]), ...OWN_BOOL, 'boostKind', 'item', 'rollItem'];

const q = (v, s) => Math.round((Number(v) || 0) * s);

/** Estado completo de un vehículo → arreglo de enteros: [números…, bits de banderas, boostKind, item, rollItem, volante, botones]. `inp` = estado de entradas. */
export function encodeOwn(k, inp) {
  const out = new Array(OWN_NUM.length + 6);
  let n = 0;
  for (const [name, scale] of OWN_NUM) out[n++] = q(k[name], scale);
  let bits = 0;
  for (let i = 0; i < OWN_BOOL.length; i++) if (k[OWN_BOOL[i]]) bits |= 1 << i;
  out[n++] = bits;
  out[n++] = idx(BOOST_KINDS, k.boostKind || '');
  out[n++] = idx(ITEMS, k.item);
  out[n++] = idx(ITEMS, k.rollItem);
  out[n++] = inp?.sd ?? 0;
  out[n++] = inp?.sb ?? 0;
  return out;
}

/** Al revés: un vehículo nuevo a partir de `template` (el del espejo: conserva `cfg`, `P`, `index`…) con `seq` = último aplicado. */
export function decodeOwn(arr, template, seq = 0) {
  const k = { ...template };
  let n = 0;
  for (const [name, scale] of OWN_NUM) k[name] = arr[n++] / scale;
  const bits = arr[n++];
  for (let i = 0; i < OWN_BOOL.length; i++) k[OWN_BOOL[i]] = !!(bits & (1 << i));
  k.boostKind = BOOST_KINDS[arr[n++]] ?? '';
  k.item = ITEMS[arr[n++]] ?? null;
  k.rollItem = ITEMS[arr[n++]] ?? null;
  k.sd = arr[n++]; // la entrada que tenía apretada el servidor: la predicción sigue con ella
  k.sb = arr[n++];
  k.seq = seq;
  k.px = k.x;
  k.py = k.y;
  k.pz = k.z;
  k.pyaw = k.yaw;
  return k;
}

/* Lo que se ve de los demás: [nombre, escala]. Todo número viaja por la interpolación (SnapshotBuffer); las banderas van en un texto. */
const LITE_NUM = [
  ['x', 100], ['y', 100], ['z', 100], ['yaw', 1000], ['v', 10], ['steer', 100], ['slip', 100], ['vy', 10],
  ['spinT', 100], ['spinMax', 100], ['tumbleT', 100], ['fallT', 100], ['safeT', 100], ['shieldT', 100], ['invT', 100], ['autoT', 100], ['boostT', 100], ['towT', 100],
  ['mtLevel', 1], ['drift', 1], ['rank', 1], ['lap', 1],
];

/** Un vehículo → [índice, números…, banderas (texto en base 36)]. */
export function encodeLite(k) {
  const out = new Array(LITE_NUM.length + 2);
  out[0] = k.index;
  let n = 1;
  for (const [name, scale] of LITE_NUM) out[n++] = q(k[name], scale);
  out[n] = ((k.air ? 1 : 0) | (k.wheelie ? 2 : 0) | (k.finished ? 4 : 0) | (idx(BOOST_KINDS, k.boostKind || '') << 3)).toString(36);
  return out;
}

/** Al revés: { id, x, y, … , fl } (para el SnapshotBuffer; `fl` queda como texto y no se interpola). */
export function decodeLite(arr) {
  const e = { id: arr[0] };
  let n = 1;
  for (const [name, scale] of LITE_NUM) e[name] = arr[n++] / scale;
  e.fl = arr[n];
  return e;
}

/** Escribe una entrada interpolada en un vehículo del espejo y rehace lo que depende de la pista. */
export function applyLite(k, e, T) {
  k.px = k.x = e.x;
  k.py = k.y = e.y;
  k.pz = k.z = e.z;
  k.pyaw = k.yaw = e.yaw;
  k.v = e.v;
  k.steer = e.steer;
  k.slip = e.slip;
  k.vy = e.vy;
  k.spinT = e.spinT;
  k.spinMax = e.spinMax;
  k.tumbleT = e.tumbleT;
  k.fallT = e.fallT;
  k.safeT = e.safeT;
  k.shieldT = e.shieldT;
  k.invT = e.invT;
  k.autoT = e.autoT;
  k.boostT = e.boostT;
  k.towT = e.towT;
  k.mtLevel = Math.round(e.mtLevel);
  k.drift = Math.round(e.drift);
  k.rank = Math.round(e.rank);
  k.lap = Math.round(e.lap);
  const fl = parseInt(e.fl, 36) || 0;
  k.air = !!(fl & 1);
  k.wheelie = !!(fl & 2);
  k.finished = !!(fl & 4);
  k.boostKind = BOOST_KINDS[(fl >> 3) & 7] || '';
  k.dir = k.yaw;
  refreshTrack(k, T);
}

const tmp = { i: 0, a: 0, d: 0 };
/** Dónde está el vehículo sobre la pista (índice, posición, distancia al eje, altura del piso). */
export function refreshTrack(k, T) {
  project(T, k.x, k.z, k.ti, tmp);
  // `project` solo camina unas muestras desde la anterior: tras un corte, una reconexión o un salto de posición se perdió el hilo y se busca en toda la pista
  const ex = k.x - T.x[tmp.i];
  const ez = k.z - T.z[tmp.i];
  if (ex * ex + ez * ez > 900) project(T, k.x, k.z, -1, tmp);
  k.ti = tmp.i;
  k.ta = tmp.a;
  k.d = tmp.d;
  k.s = mod(tmp.i * T.step + tmp.a, T.len);
  k.gy = groundAt(T, k.ti, k.ta, k.d);
  k.off = Math.abs(k.d) > T.hw[k.ti] + 0.3;
}

// ---------------------------------------------------------------- ítems sueltos (entidades)
const ENT_TYPES = ['aceite', 'ruleman', 'tero', 'nube'];
const ENT_STATES = ['', 'fly', 'hover'];

/** Una entidad de la pista → [id, tipo, x, y, z, yaw, dir, giro, vida, radio, estado, objetivo]. */
export function encodeEnt(e) {
  return [e.id, Math.max(0, ENT_TYPES.indexOf(e.type)), q(e.x, 100), q(e.y, 100), q(e.z, 100), q(e.yaw, 1000), q(e.dir, 1000), q(e.spin, 10), q(e.life, 100), q(e.r, 100), Math.max(0, ENT_STATES.indexOf(e.state || '')), e.target ?? -1];
}

export function decodeEnt(a) {
  return { id: 1000 + a[0], eid: a[0], type: ENT_TYPES[a[1]] || 'aceite', x: a[2] / 100, y: a[3] / 100, z: a[4] / 100, yaw: a[5] / 1000, dir: a[6] / 1000, spin: a[7] / 10, life: a[8] / 100, r: a[9] / 100, state: ENT_STATES[a[10]] || '', target: a[11] };
}

// ---------------------------------------------------------------- eventos (efectos, sonido y carteles)
/* Tipo → qué es cada argumento [k, a, b, c]: K vehículo · P punto {x,y,z} · O estorbo · N número (×100; true/false van como 1/0) · I entero · S texto · - nada. */
const EV = {
  count: '-N', go: '-', boost: 'KSN', stall: 'K', item: 'KS', hit: 'KSNI', respawn: 'K', fall: 'K', wall: 'KN', bump: 'KKN', draft: 'K', lap: 'KNN', finish: 'KN', over: '-',
  box: 'KN', nut: 'KN', obs: 'KON', roll: 'K', 'shield-pop': 'K', use: 'KS', steal: 'KKN', 'ent-pop': 'PK', 'ent-hit': 'PK', 'ent-gone': 'P', 'ent-bounce': 'P',
  'nube-warn': 'K', 'nube-over': 'K', 'nube-strike': 'PK', hop: 'K', land: 'KN', mt: 'KN', trick: 'K', jump: 'K', wheelie: 'K', drift: 'K', 'shield-end': 'K', 'inv-end': 'K', 'auto-end': 'K',
};
export const EVENT_TYPES = Object.keys(EV);
const EV_ID = new Map(EVENT_TYPES.map((t, i) => [t, i]));

function encArg(kind, v, R) {
  switch (kind) {
    case 'K':
      return v && Number.isInteger(v.index) ? v.index : -1;
    case 'I':
      return Number.isInteger(v) ? v : -1;
    case 'P':
      return v && Number.isFinite(v.x) ? [q(v.x, 100), q(v.y, 100), q(v.z, 100)] : null;
    case 'O':
      return v ? R.obstacles.indexOf(v) : -1;
    case 'N':
      return v === true ? 100 : Number.isFinite(v) ? q(v, 100) : 0;
    case 'S':
      return typeof v === 'string' ? v : '';
    default:
      return 0;
  }
}

function decArg(kind, v, R) {
  switch (kind) {
    case 'K':
      return v >= 0 ? R.karts[v] || null : null;
    case 'I':
      return v;
    case 'P':
      return Array.isArray(v) ? { x: v[0] / 100, y: v[1] / 100, z: v[2] / 100 } : null;
    case 'O':
      return v >= 0 ? R.obstacles[v] || null : null;
    case 'N':
      return v / 100;
    case 'S':
      return v || '';
    default:
      return undefined;
  }
}

/** Un evento del paso → [tipo, k, a, b, c] (sin los argumentos que sobran). */
export function encodeEvent(ev, R) {
  const spec = EV[ev.type];
  const id = EV_ID.get(ev.type);
  if (spec === undefined || id === undefined) return null;
  const out = [id];
  const vals = [ev.k, ev.a, ev.b, ev.c];
  for (let i = 0; i < spec.length; i++) out.push(encArg(spec[i], vals[i], R));
  return out;
}

/** Al revés: { type, k, a, b, c } con los vehículos del espejo. */
export function decodeEvent(arr, R) {
  const type = EVENT_TYPES[arr[0]];
  if (!type) return null;
  const spec = EV[type];
  const ev = { type, k: null, a: undefined, b: undefined, c: undefined };
  const names = ['k', 'a', 'b', 'c'];
  for (let i = 0; i < spec.length; i++) if (spec[i] !== '-') ev[names[i]] = decArg(spec[i], arr[1 + i], R);
  return ev;
}

// ---------------------------------------------------------------- máscaras de cajas, tuercas y estorbos
/** Lista de [t] → bits de los que están "usados" (t > 0). Hasta 30 elementos. */
export function takenMask(list, f = (e) => e.t > 0) {
  let m = 0;
  for (let i = 0; i < list.length && i < 30; i++) if (f(list[i])) m |= 1 << i;
  return m;
}

// ---------------------------------------------------------------- snapshot
/**
 * Parte común del snapshot (la misma para todos): { f: vehículos, e: eventos, n: entidades, x: [cajas, tuercas, estorbos] }.
 * Cada persona recibe además `o` (su estado completo) y `a` (la última entrada aplicada): ver `finishSnapshot`.
 */
export function commonSnapshot(R, events) {
  return {
    f: R.karts.map(encodeLite),
    e: events,
    n: R.ents.map(encodeEnt),
    x: [takenMask(R.boxes), takenMask(R.nuts), takenMask(R.obstacles, (o) => o.downT > 0)],
  };
}

/** Texto JSON del snapshot de una persona: la parte común ya serializada (`common`) más lo suyo, sin volver a serializarla. */
export function finishSnapshot(tick, common, own, ack) {
  return `{"t":"s","k":${tick},"f":${common.f},"e":${common.e},"n":${common.n},"x":${common.x},"o":${JSON.stringify(own)},"a":${ack}}`;
}

/** Serializa la parte común una vez. */
export function serializeCommon(c) {
  return { f: JSON.stringify(c.f), e: JSON.stringify(c.e), n: JSON.stringify(c.n), x: JSON.stringify(c.x) };
}

// ---------------------------------------------------------------- espejo del cliente
/**
 * Carrera "espejo": la misma pista, vehículos y ubicación en la grilla que el servidor, pero que no se simula. El vehículo
 * propio es el humano 0 (lo que mira la cámara y el HUD); los demás humanos quedan marcados (`remote`) y los bots no.
 * `init` es el mensaje del servidor (ver arriba).
 */
export function makeMirror(init) {
  const entries = init.karts.map((e, i) => ({ cfg: e.cfg, human: i === init.me ? 0 : -1, name: e.name }));
  const R = createRace({ track: init.track, cls: init.cls, laps: init.laps, seed: init.seed, entries, size: entries.length, mode: 'race' });
  R.online = true;
  R.me = init.me;
  R.go = init.go ?? GO_TICK;
  init.karts.forEach((e, i) => {
    const k = R.karts[i];
    k.color = e.color;
    k.tag = i !== init.me; // los demás llevan su nombre encima
    k.remote = i !== init.me && e.human > 0 ? true : false;
    if (i !== init.me && e.human > 0) k.human = 1; // los demás humanos se ven con punto grande en el minimapa
    k.frozen = true;
  });
  return R;
}

/** Hora de la carrera de un tick del servidor. */
export const raceTime = (tick) => tick / TPS - COUNT_TIME;

/** Ordena `R.order` por puesto (lo usa el HUD). */
export function sortOrder(R) {
  R.order = R.karts.slice().sort((a, b) => a.rank - b.rank || a.index - b.index);
}
