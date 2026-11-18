/**
 * Tuercas — una carrera entera: grilla, cuenta regresiva (con largada turbo), vueltas, puestos, choques entre
 * vehículos, rebufo, aceleradores, cajas sorpresa, tuercas, estorbos de la pista, ítems y llegada.
 * Es de paso fijo (DT) y determinista con su semilla: la misma carrera da lo mismo en el navegador y en las pruebas.
 *
 *   const R = createRace({ track: 'pradera', cls: 'carrera', seed: 7, entries: [{ cfg, human: 0, name: 'Vos' }] });
 *   stepRace(R, [entradasDelJugador0, entradasDelJugador1]);   // 120 veces por segundo
 *   R.events  → lo que pasó en el paso (para sonido, partículas y carteles); quien las usa las vacía.
 */
import { DT, makeKart, placeKart, stepKart, hitKart, addBoost, MAX_NUTS } from './kart.js';
import { getTrack } from './tracks.js';
import { gridSlot } from './track.js';
import { params, randomConfig, sanitize, CLASSES, DRIVERS, byId } from './parts.js';
import { rng, clamp, wrapDelta } from './util.js';
import { makeBrain, think, follow } from './ai.js';
import { rollItem, useItem, stepEnts, ITEMS, ROLL_TIME } from './items.js';

export { DT };
export const COUNT_TIME = 3.6; // segundos de cuenta regresiva
export const POINTS = [15, 12, 10, 8, 6, 4, 2, 1];
export const GRID = 8;
const IDLE = Object.freeze({ steer: 0, accel: false, brake: false, drift: false, item: false });

/**
 * Arma una carrera. `entries` va en orden de grilla (el primero larga adelante); los lugares que falten hasta `size`
 * los ocupan bots con piezas al azar. `mode`: 'race' (con ítems) o 'trial' (contrarreloj: solo, con tres sifones).
 */
export function createRace(opts) {
  const T = getTrack(opts.track);
  const cls = byId(CLASSES, opts.cls || 'carrera');
  const rand = rng(opts.seed ?? 1);
  const mode = opts.mode || 'race';
  const R = {
    T,
    cls,
    mode,
    laps: opts.laps ?? T.laps,
    itemsOn: mode !== 'trial' && opts.items !== false,
    t: -COUNT_TIME,
    dt: DT,
    started: false,
    over: false,
    endT: 0,
    lastCount: 0,
    bandT: 0,
    karts: [],
    order: [],
    humans: [],
    results: null,
    boxes: T.boxes.map((b) => ({ ...b, t: 0 })),
    nuts: T.nuts.map((q) => ({ ...q, t: 0 })),
    obstacles: T.obstacles.map((o) => ({ ...o, downT: 0, now: o.d, x: 0, y: 0, z: 0 })),
    ents: [],
    entSeq: 1,
    events: [],
    rand,
  };
  R.ev = (type, k, a, b, c) => R.events.push({ type, k: k || null, a, b, c });

  const entries = (opts.entries || []).map((e) => ({ ...e, cfg: sanitize(e.cfg) }));
  const size = mode === 'trial' ? entries.length : Math.max(entries.length, opts.size ?? GRID);
  const used = entries.map((e) => e.cfg.driver);
  while (entries.length < size) {
    const cfg = randomConfig(rand, used.length < DRIVERS.length ? used : []);
    used.push(cfg.driver);
    entries.push({ cfg, human: -1, name: byId(DRIVERS, cfg.driver).name });
  }
  let bot = 0;
  entries.forEach((e, idx) => {
    const k = makeKart(idx, e.cfg, params(e.cfg, cls.speed));
    k.human = e.human ?? -1;
    k.name = e.name || byId(DRIVERS, e.cfg.driver).name;
    const skill = k.human >= 0 ? 0.85 : clamp(cls.skill + (rand() - 0.5) * 0.14, 0.45, 1);
    k.brain = makeBrain(rng(Math.floor(rand() * 1e9)), skill);
    k.basePace = k.human >= 0 ? 1 : 0.9 + 0.1 * clamp((skill - 0.5) / 0.5, 0, 1) - (bot++ % 4) * 0.006;
    k.pace = k.basePace;
    k.out = { steer: 0, accel: false, brake: false, drift: false, item: false };
    const slot = gridSlot(T, idx);
    placeKart(k, T, slot.x, slot.z, slot.yaw, slot.i);
    k.prog = slot.s;
    k.frozen = true;
    if (mode === 'trial') {
      k.item = 'sifon3';
      k.itemN = 3;
    }
    R.karts.push(k);
    if (k.human >= 0) R.humans.push(k);
  });
  R.order = R.karts.slice();
  rank(R);
  if (opts.noCount) {
    // sin cuenta regresiva: ya están corriendo (la carrera de fondo del menú)
    R.t = 0;
    R.started = true;
    for (const k of R.karts) k.frozen = false;
  }
  return R;
}

function rank(R) {
  R.order.sort((a, b) => (a.finished || b.finished ? (a.finished ? a.place : 99) - (b.finished ? b.place : 99) : b.prog - a.prog) || a.index - b.index);
  for (let i = 0; i < R.order.length; i++) if (!R.order[i].finished) R.order[i].rank = i + 1;
}

function finish(R, k) {
  const T = R.T;
  k.finished = true;
  k.place = R.karts.filter((o) => o.finished).length;
  k.rank = k.place;
  // el instante exacto en que cruzó, no el del paso
  k.finishT = R.t - (k.prog - R.laps * T.len) / Math.max(1, k.v);
  k.item = null;
  k.itemN = 0;
  k.rollT = 0;
  R.ev('finish', k, k.place);
}

/** Cierra la carrera: los que no llegaron quedan por distancia, con un tiempo estimado. */
function close(R) {
  const T = R.T;
  rank(R);
  let place = R.karts.filter((k) => k.finished).length;
  for (const k of R.order) {
    if (k.finished) continue;
    k.place = ++place;
    k.rank = k.place;
    const speed = Math.max(12, k.prog / Math.max(1, R.t));
    k.finishT = R.t + (R.laps * T.len - k.prog) / speed;
    k.estimated = true;
  }
  R.results = R.karts
    .slice()
    .sort((a, b) => a.place - b.place)
    .map((k) => ({ index: k.index, place: k.place, time: k.finishT, estimated: !!k.estimated, human: k.human, name: k.name, cfg: k.cfg, bestLap: k.bestLap }));
  R.over = true;
  R.ev('over', null);
}

/** Dónde están los estorbos que van y vienen a lo ancho de la pista, a la hora de la carrera `R.t` (el modo online lo repite en el cliente). */
export function placeObstacles(R) {
  const T = R.T;
  for (const o of R.obstacles) {
    o.now = o.d + o.amp * Math.sin((R.t / o.per) * Math.PI * 2 + o.ph);
    o.x = T.x[o.i] + T.nx[o.i] * o.now;
    o.z = T.z[o.i] + T.nz[o.i] * o.now;
    o.y = T.y[o.i];
  }
}

/** Un paso de la carrera. `inputs[h]` son las entradas del jugador h. */
export function stepRace(R, inputs = []) {
  if (R.over) return;
  const T = R.T;
  const dt = DT;
  const ev = R.ev;
  R.t += dt;
  R.stepN = (R.stepN | 0) + 1;

  // ---------- cuenta regresiva: nadie se mueve; se mide cuánto hace que cada uno acelera
  if (R.t < 0) {
    const c = Math.ceil(-R.t);
    if (c !== R.lastCount && c <= 3) {
      R.lastCount = c;
      ev('count', null, c);
    }
    for (const k of R.karts) {
      const gas = k.human >= 0 ? !!(inputs[k.human] || IDLE).accel : k.brain.start > 0 ? R.t > -0.7 : k.brain.start < 0;
      k.revT = gas ? k.revT + dt : 0;
      stepKart(k, T, IDLE, dt, ev);
    }
    return;
  }
  if (!R.started) {
    R.started = true;
    ev('go', null);
    for (const k of R.karts) {
      k.frozen = false;
      k.lapStart = 0;
      if (k.revT >= 0.2 && k.revT <= 1.05) {
        addBoost(k, 1.3, 1.28, false, 'start');
        ev('boost', k, 'start', 1);
      } else if (k.revT > 2.2) {
        k.stallT = 0.9;
        ev('stall', k);
      }
    }
  }

  // ---------- goma elástica suave: los bots aflojan si se escapan del jugador y aprietan si quedan lejos
  if ((R.bandT -= dt) <= 0) {
    R.bandT = 0.5;
    let ref = -Infinity;
    for (const h of R.humans) ref = Math.max(ref, h.prog);
    for (const k of R.karts) if (k.human < 0) k.pace = k.basePace * (1 + (ref > -Infinity ? clamp((ref - k.prog) / 420, -0.035, 0.045) : 0));
  }

  // ---------- cada vehículo
  for (const k of R.karts) {
    let inp;
    if (k.autoT > 0) inp = follow(k, T, k.out);
    else if (k.human >= 0 && !k.finished) inp = inputs[k.human] || IDLE;
    else if (R.aiSkip > 1 && (R.stepN + k.index) % R.aiSkip !== 0) inp = k.out; // (online, con el servidor apretado: los bots deciden menos veces)
    else if (R.aiSkip > 1) {
      R.dt = dt * R.aiSkip; // lo que cuentan sus relojes internos es el tiempo que pasó desde la última decisión
      inp = think(k, T, R, k.out);
      R.dt = dt;
    } else inp = think(k, T, R, k.out);
    const press = !!inp.item && !k.itemPrev;
    k.itemPrev = !!inp.item;
    if (k.rollT > 0) {
      k.rollT -= dt;
      if (k.rollT <= 0 || (press && k.rollT < ROLL_TIME - 0.5)) {
        k.rollT = 0;
        k.item = k.rollItem;
        k.itemN = ITEMS[k.item].uses;
        ev('item', k, k.item);
      }
    } else if (press && k.item && !k.finished && k.spinT <= 0 && k.tumbleT <= 0 && k.fallT <= 0) useItem(R, k, inp);
    if (k.towT > 0) {
      k.towT -= dt;
      const tk = R.karts[k.towTarget];
      if (!tk || tk.prog - k.prog < 2 || tk.fallT > 0 || k.spinT > 0) k.towT = 0;
      else addBoost(k, 0.12, 1.34, true, 'tow');
    }
    if (k.padT > 0) k.padT -= dt;
    stepKart(k, T, inp, dt, ev);
  }

  // ---------- choques entre vehículos
  const ks = R.karts;
  for (let i = 0; i < ks.length; i++) {
    const a = ks[i];
    if (a.fallT > 0) continue;
    for (let j = i + 1; j < ks.length; j++) {
      const b = ks[j];
      if (b.fallT > 0) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const rr = a.P.radius + b.P.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || Math.abs(a.y - b.y) > 1.3) continue;
      const d = Math.sqrt(d2) || 0.01;
      const nx = dx / d;
      const nz = dz / d;
      const sa = a.invT > 0 || a.autoT > 0;
      const sb = b.invT > 0 || b.autoT > 0;
      const ma = a.P.mass * (sa ? 5 : 1);
      const mb = b.P.mass * (sb ? 5 : 1);
      const over = rr - d;
      a.x -= (nx * over * mb) / (ma + mb);
      a.z -= (nz * over * mb) / (ma + mb);
      b.x += (nx * over * ma) / (ma + mb);
      b.z += (nz * over * ma) / (ma + mb);
      const rel = (Math.sin(b.dir) * b.v + b.ex - Math.sin(a.dir) * a.v - a.ex) * nx + (Math.cos(b.dir) * b.v + b.ez - Math.cos(a.dir) * a.v - a.ez) * nz;
      if (rel < 0) {
        const J = (-1.4 * rel) / (1 / ma + 1 / mb);
        a.ex -= (J / ma) * nx;
        a.ez -= (J / ma) * nz;
        b.ex += (J / mb) * nx;
        b.ez += (J / mb) * nz;
        if (rel < -2.5) ev('bump', a, b, -rel);
      }
      if (sa && !sb) hitKart(b, 'spin', ev, a.index);
      else if (sb && !sa) hitKart(a, 'spin', ev, b.index);
    }
  }

  // ---------- rebufo: un rato pegado atrás de otro da un empujón
  for (const k of ks) {
    let behind = false;
    if (k.v > k.P.vmax * 0.6 && !k.air && k.fallT <= 0 && k.spinT <= 0) {
      const fx = Math.sin(k.dir);
      const fz = Math.cos(k.dir);
      for (const o of ks) {
        if (o === k || o.fallT > 0 || o.v < o.P.vmax * 0.5) continue;
        const dx = o.x - k.x;
        const dz = o.z - k.z;
        const along = dx * fx + dz * fz;
        if (along < 2.4 || along > 13) continue;
        if (Math.abs(dx * fz - dz * fx) < 1.6) {
          behind = true;
          break;
        }
      }
    }
    k.draftT = behind ? Math.min(2, k.draftT + dt) : Math.max(0, k.draftT - dt * 2.5);
    const was = k.draft;
    k.draft = k.draftT > 1.05;
    if (k.draft && !was) ev('draft', k);
  }

  // ---------- lo que hay sobre la pista
  placeObstacles(R);
  for (const o of R.obstacles) if (o.downT > 0) o.downT -= dt;
  for (const k of ks) {
    if (k.fallT > 0) continue;
    if (!k.air && k.padT <= 0) {
      for (const p of T.pads) {
        if (Math.abs(wrapDelta(k.s - p.s, T.len)) < p.len / 2 && Math.abs(k.d - p.d) < p.w / 2 + 0.4) {
          addBoost(k, 1.0, 1.3, false, 'pad');
          k.padT = 0.6;
          ev('boost', k, 'pad', 1);
          break;
        }
      }
    }
    for (let q = 0; q < R.boxes.length; q++) {
      const b = R.boxes[q];
      if (b.t > 0) continue;
      const dx = b.x - k.x;
      const dz = b.z - k.z;
      if (dx * dx + dz * dz < 3.1 && Math.abs(b.y - k.y) < 2.6) {
        b.t = 2.6;
        ev('box', k, q);
        if (R.itemsOn && !k.item && k.rollT <= 0 && !k.finished) {
          k.rollItem = rollItem(R, k);
          k.rollT = ROLL_TIME;
          ev('roll', k);
        }
      }
    }
    for (let q = 0; q < R.nuts.length; q++) {
      const nut = R.nuts[q];
      if (nut.t > 0) continue;
      const dx = nut.x - k.x;
      const dz = nut.z - k.z;
      if (dx * dx + dz * dz < 2.6 && Math.abs(nut.y - k.y) < 2.4) {
        nut.t = 9;
        if (k.nuts < MAX_NUTS) k.nuts++;
        ev('nut', k, q);
      }
    }
    for (const o of R.obstacles) {
      if (o.downT > 0) continue;
      const dx = o.x - k.x;
      const dz = o.z - k.z;
      const rr = o.r + k.P.radius * 0.8;
      if (dx * dx + dz * dz < rr * rr && Math.abs(o.y - k.y) < 1.6) {
        if (k.safeT > 0 && k.invT <= 0 && k.autoT <= 0) continue; // recién golpeado: pasa de largo
        o.downT = 5;
        if (k.invT > 0 || k.autoT > 0) ev('obs', k, o, false);
        else {
          hitKart(k, o.kind === 'cono' ? 'slip' : 'spin', ev);
          ev('obs', k, o, true);
        }
      }
    }
  }
  for (const b of R.boxes) if (b.t > 0) b.t -= dt;
  for (const q of R.nuts) if (q.t > 0) q.t -= dt;
  stepEnts(R, dt);

  // ---------- vueltas, llegada y puestos
  for (const k of ks) {
    if (k.finished) continue;
    const lap = Math.floor(k.prog / T.len);
    if (lap > k.lap) {
      const lapTime = R.t - k.lapStart;
      k.lapStart = R.t;
      if (!k.bestLap || lapTime < k.bestLap) k.bestLap = lapTime;
      k.lap = lap;
      if (lap >= R.laps) finish(R, k);
      else ev('lap', k, lap + 1, lapTime);
    }
  }
  rank(R);

  // ---------- final: cuando llegaron los jugadores se espera un poco a los demás
  const humansDone = R.humans.length ? R.humans.every((k) => k.finished) : ks.every((k) => k.finished);
  if (humansDone) {
    R.endT += dt;
    if (ks.every((k) => k.finished) || R.endT > (R.mode === 'trial' ? 0.1 : 9)) close(R);
  }
}

/** Termina la carrera ya mismo (cuando los jugadores llegaron y no se espera más a los demás). */
export function endRace(R) {
  if (!R.over) close(R);
}

/** Puntos de copa por puesto. */
export const pointsFor = (place) => POINTS[place - 1] ?? 0;
