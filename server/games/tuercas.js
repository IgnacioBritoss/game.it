/**
 * Tuercas online: carreras de karts y motos de hasta 12 personas (más bots hasta completar la grilla). El servidor es el
 * árbitro: corre la misma carrera que el modo sin conexión (public/games/tuercas/shared/race.js) a 60 ticks por segundo
 * (2 pasos de física de 1/120 s cada uno) con las entradas de cada persona, y manda snapshots a 20 por segundo. Cada
 * cliente predice su propio vehículo y reconcilia con lo que dice el servidor; los demás se interpolan (shared/net.js).
 *
 * Flujo: lobby (cada uno elige su vehículo en el taller; el anfitrión elige pista, vueltas, cilindrada, tamaño de la
 * grilla y si se completa con bots) → `start`: se arma la carrera y se manda `init` → cada cliente arma la pista y avisa
 * `ready` (o se sigue a los 20 s) → cuenta regresiva y carrera → `end` con los resultados → revancha (vuelta al lobby).
 *
 * Quien se desconecta sigue en la carrera manejado por un bot (si vuelve dentro de la gracia del núcleo, retoma el volante);
 * el que se va para siempre, también. Cuando llega el primero, el resto tiene 45 s para terminar; después se cierra la
 * carrera con los puestos por distancia. Si el paso de la simulación se pone caro (servidor de poco CPU) se aflojan los
 * bots (deciden menos veces por segundo) sin tocar la física de las personas.
 *
 * Mensajes del cliente: cfg { cfg } · ready · i { e: [[seq, tick, d, b], …] } (ver shared/net.js).
 */
import { performance } from 'node:perf_hooks';
import { randomInt } from 'node:crypto';
import { createRace, stepRace, endRace } from '../../public/games/tuercas/shared/race.js';
import { TRACK_DEFS } from '../../public/games/tuercas/shared/tracks.js';
import { CLASSES, DRIVERS, DEFAULT_CONFIG, sanitize, randomConfig, byId } from '../../public/games/tuercas/shared/parts.js';
import { rng } from '../../public/games/tuercas/shared/util.js';
import { TPS, TICK_MS, SUB, SNAP_EVERY, MAX_RACERS, GO_TICK, newInputState, queueInputs, applyInputs, trimInbox, decodeInput, encodeEvent, encodeOwn, commonSnapshot, serializeCommon, finishSnapshot } from '../../public/games/tuercas/shared/net.js';

const TRACK_IDS = TRACK_DEFS.map((t) => t.id);
const CLASS_IDS = CLASSES.map((c) => c.id);
const LAPS = [1, 2, 3, 5];
const SIZES = [6, 8, 10, 12];
const LOAD_MS = 20e3; // cuánto se espera a que todos armen la pista
const FIRST_GRACE_S = 45; // desde que llega el primero
const MAX_RACE_S = 15 * 60;
const IDLE_INPUT_MS = 1500; // sin noticias de una persona: suelta todo (no sigue acelerando contra una pared)
const MAX_BUFFERED = 64 * 1024; // si el socket de alguien tiene más sin enviar, ese snapshot se saltea
const MAX_EVENTS = 48; // por snapshot
const MAX_CATCHUP = 4;
const AI_EVERY = [1, 2, 4]; // niveles del gobernador: cada cuántos pasos deciden los bots

const logError = (...a) => console.error(new Date().toISOString(), 'error', ...a);

function shuffle(list, rand) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Cantidad de jugadores humanos y bots con que arranca la carrera. */
export const gridSize = (humans, settings) => Math.min(MAX_RACERS, Math.max(humans, settings.bots ? settings.size : humans));

/** Pasa al vehículo de una persona a manos de un bot (se fue o se cayó) o se lo devuelve. */
function setHuman(R, k, human) {
  const was = k.human;
  k.human = human;
  if (human >= 0) {
    if (was < 0) R.humans.push(k);
    k.basePace = 1;
    k.pace = 1;
  } else {
    if (was >= 0) R.humans = R.humans.filter((x) => x !== k);
    k.basePace = 0.95;
    k.pace = 0.95;
  }
}

export default {
  realtime: true,
  minPlayers: 1,
  maxPlayers: MAX_RACERS,
  lateJoin: false,
  listable: true,
  defaults: { track: 'pradera', laps: 3, cls: 'carrera', size: 8, bots: true, public: false },

  settings(cur, s) {
    const laps = Number(s.laps);
    const size = Number(s.size);
    return {
      track: typeof s.track === 'string' && TRACK_IDS.includes(s.track) ? s.track : cur.track,
      laps: LAPS.includes(laps) ? laps : cur.laps,
      cls: typeof s.cls === 'string' && CLASS_IDS.includes(s.cls) ? s.cls : cur.cls,
      size: SIZES.includes(size) ? size : cur.size,
      bots: typeof s.bots === 'boolean' ? s.bots : s.bots === 'true' ? true : s.bots === 'false' ? false : cur.bots,
      public: typeof s.public === 'boolean' ? s.public : cur.public,
    };
  },

  view(room) {
    const cfgs = {};
    for (const p of room.players.values()) if (p.cfg) cfgs[p.id] = p.cfg;
    const d = room.data;
    return { cfgs, race: d ? { seed: d.seed, track: d.track, laps: d.laps, cls: d.cls, size: d.R.karts.length, over: d.over } : null };
  },

  listInfo(room) {
    const host = room.players.get(room.host);
    return { name: host?.name || 'Tuercas', track: room.settings.track, laps: room.settings.laps, size: room.settings.size, bots: room.settings.bots };
  },

  start(room, api) {
    const people = [...room.players.values()];
    const s = room.settings;
    const seed = randomInt(1, 2 ** 31);
    const rand = rng(seed);
    // la grilla: personas y bots mezclados
    const roster = people.map((p, i) => ({ cfg: sanitize(p.cfg || DEFAULT_CONFIG), human: i, name: p.name, color: p.color, pid: p.id }));
    const used = roster.map((e) => e.cfg.driver);
    const size = gridSize(roster.length, s);
    while (roster.length < size) {
      const cfg = randomConfig(rand, used.length < DRIVERS.length ? used : []);
      used.push(cfg.driver);
      roster.push({ cfg, human: -1, name: byId(DRIVERS, cfg.driver).name, color: null, pid: null });
    }
    shuffle(roster, rand);
    const R = createRace({ track: s.track, cls: s.cls, laps: s.laps, seed, entries: roster, size: roster.length, mode: 'race' });
    const hum = new Map(); // id de persona → { kart, human, inp, input (lo que se le pasa a stepRace), auto }
    roster.forEach((e, i) => {
      if (e.pid) hum.set(e.pid, { kart: R.karts[i], human: e.human, inp: newInputState(), input: { steer: 0, accel: false, brake: false, drift: false, item: false }, auto: false });
    });
    room.data = {
      R,
      seed,
      track: s.track,
      laps: R.laps,
      cls: s.cls,
      roster,
      hum,
      phase: 'loading',
      ready: new Set(),
      inputs: [], // por índice humano, para stepRace
      ticks: 0,
      t0: 0,
      events: [],
      fails: 0,
      over: false,
      firstDone: -1,
      aiLevel: 0,
      stepN: 0,
      cost: new Float64Array(120),
      costN: 0,
      costI: 0,
      costSum: 0,
      skipped: 0,
    };
    room.avgTickMs = 0;
    for (const [pid, h] of hum) room.data.inputs[h.human] = h.input;
    for (const id of hum.keys()) sendInit(room, api, id);
    api.setTimer('load', LOAD_MS, () => begin(room, api));
  },

  command(room, api, person, msg) {
    if (msg.t === 'cfg') {
      if (room.state === 'playing') return true; // no cambia a mitad de carrera
      if (!msg.cfg || typeof msg.cfg !== 'object') return false;
      const now = Date.now();
      if (now - (person.cfgAt || 0) < 150) return true; // el taller manda un cambio por vez: más seguido es spam, no se reenvía a toda la sala
      person.cfgAt = now;
      person.cfg = sanitize(msg.cfg);
      api.sync();
      return true;
    }
    if (msg.t === 'ready') {
      const d = room.data;
      if (!d || room.state !== 'playing') return true;
      if (d.phase === 'loading' && d.hum.has(person.id)) {
        d.ready.add(person.id);
        prep(room, api);
      }
      return true;
    }
    return undefined;
  },

  message(room, api, person, msg) {
    const d = room.data;
    if (msg.t !== 'i' || !d || d.over) return undefined;
    const h = d.hum.get(person.id);
    if (!h) return undefined;
    h.inp.lastMsg = performance.now();
    return queueInputs(h.inp, msg.e, d.ticks + 1);
  },

  onDisconnect(room, api, id) {
    const d = room.data;
    const h = d?.hum.get(id);
    if (!h) return;
    // sigue corriendo con un bot al volante; si faltaba para empezar, ya no se lo espera
    h.auto = true;
    setHuman(d.R, h.kart, -1);
    if (d.phase === 'loading') prep(room, api);
    else checkEnd(room, api);
  },

  onReconnect(room, api, id) {
    const d = room.data;
    const h = d?.hum.get(id);
    if (!h) return;
    if (d.over) return api.send(id, { t: 'end', ...d.endPayload }); // volvió cuando ya terminó: ve los resultados
    h.auto = false;
    h.inp = newInputState();
    h.inp.lastMsg = performance.now();
    if (!h.kart.finished) setHuman(d.R, h.kart, h.human);
    sendInit(room, api, id);
    if (d.phase === 'loading') d.ready.delete(id);
  },

  removed(room, api, id) {
    const d = room.data;
    const h = d?.hum.get(id);
    if (!h) return;
    setHuman(d.R, h.kart, -1);
    d.hum.delete(id);
    d.ready.delete(id);
    if (d.phase === 'loading') prep(room, api);
    else checkEnd(room, api);
  },
};

// ---------------------------------------------------------------- carga
function initMsg(room, id) {
  const d = room.data;
  const h = d.hum.get(id);
  return {
    t: 'init',
    track: d.track,
    laps: d.laps,
    cls: d.cls,
    seed: d.seed,
    size: d.R.karts.length,
    me: h.kart.index,
    go: GO_TICK,
    karts: d.roster.map((e) => ({ cfg: e.cfg, human: e.pid ? 1 : 0, name: e.name, color: e.color })),
  };
}

function sendInit(room, api, id) {
  if (room.data?.hum.has(id)) api.send(id, initMsg(room, id));
}

/** ¿Faltan personas por armar la pista? Informa cuántas están listas y arranca cuando están todas. */
function prep(room, api) {
  const d = room.data;
  if (!d || d.phase !== 'loading') return;
  const active = [...d.hum.entries()].filter(([, h]) => !h.auto);
  const ready = active.filter(([id]) => d.ready.has(id)).length;
  api.broadcast({ t: 'prep', ready, total: active.length });
  if (ready >= active.length) begin(room, api);
}

function begin(room, api) {
  const d = room.data;
  if (!d || d.phase !== 'loading') return;
  d.phase = 'run';
  api.clearTimer('load');
  d.t0 = performance.now();
  d.ticks = 0;
  const now = performance.now();
  for (const h of d.hum.values()) h.inp.lastMsg = now;
  api.setTimer('loop', TICK_MS, () => loop(room, api));
}

// ---------------------------------------------------------------- bucle
function loop(room, api) {
  const d = room.data;
  if (!d || d.over) return;
  try {
    tick(room, api, d);
    d.fails = 0;
  } catch (e) {
    // un error no puede dejar la carrera congelada: se reprograma. Si se repite, algo está roto y se cierra la sala.
    logError('tuercas', room.code, 'loop', e?.stack || e);
    if (++d.fails >= 5) return api.close('error');
  }
  if (room.data !== d || d.over) return;
  const next = d.t0 + (d.ticks + 1) * TICK_MS - performance.now();
  api.setTimer('loop', Math.max(1, next), () => loop(room, api));
}

function anyConnected(room, d) {
  for (const [id, h] of d.hum) if (!h.auto && room.players.get(id)?.connected) return true;
  return false;
}

function tick(room, api, d) {
  const start = performance.now();
  if (!anyConnected(room, d)) {
    d.t0 = start - d.ticks * TICK_MS; // nadie mira: la carrera se pausa (no gasta CPU)
    return;
  }
  let due = Math.floor((start - d.t0) / TICK_MS) - d.ticks;
  if (due > MAX_CATCHUP) {
    d.t0 += (due - MAX_CATCHUP) * TICK_MS; // el servidor se trabó: no acelerar la carrera
    due = MAX_CATCHUP;
  }
  if (due <= 0) return;
  for (let i = 0; i < due; i++) {
    stepTick(room, api, d, start);
    if (d.over) return;
    if (d.ticks % SNAP_EVERY === 0) sendSnapshots(room, api, d);
  }
  const per = (performance.now() - start) / due;
  govern(room, d, per, due);
}

/** Un tick: entradas, SUB pasos de la carrera y eventos. */
function stepTick(room, api, d, now) {
  const R = d.R;
  const tick = d.ticks + 1;
  for (const h of d.hum.values()) {
    const p = h.inp;
    applyInputs(p, p.inbox, tick);
    trimInbox(p);
    if (now - p.lastMsg > IDLE_INPUT_MS) {
      p.sd = 0;
      p.sb = 0;
    }
    decodeInput(p.sd, p.sb, h.input);
  }
  for (let i = 0; i < SUB; i++) {
    R.aiSkip = AI_EVERY[d.aiLevel];
    stepRace(R, d.inputs);
    d.stepN++;
    if (R.events.length) {
      for (const ev of R.events) {
        if (d.events.length >= MAX_EVENTS) break;
        const e = encodeEvent(ev, R);
        if (e) d.events.push(e);
      }
      R.events.length = 0;
    }
  }
  d.ticks = tick;
  checkEnd(room, api);
}

function sendSnapshots(room, api, d) {
  const R = d.R;
  const common = serializeCommon(commonSnapshot(R, d.events));
  d.events = [];
  for (const [id, h] of d.hum) {
    if (h.auto) continue;
    const person = room.players.get(id);
    if (!person?.connected) continue;
    if (api.bufferedAmount(id) > MAX_BUFFERED) {
      d.skipped++; // el cliente no da abasto: este snapshot se descarta (el siguiente trae todo el estado)
      continue;
    }
    api.sendRaw(id, finishSnapshot(d.ticks, common, encodeOwn(h.kart, h.inp), h.inp.seq));
  }
}

/** Gobernador: promedio móvil del costo por tick. Si pasa de la mitad del intervalo, los bots deciden menos veces. */
function govern(room, d, perTick, n) {
  for (let i = 0; i < n; i++) {
    d.costSum += perTick - d.cost[d.costI];
    d.cost[d.costI] = perTick;
    d.costI = (d.costI + 1) % d.cost.length;
    if (d.costN < d.cost.length) d.costN++;
  }
  const avg = d.costSum / Math.max(1, d.costN);
  room.avgTickMs = avg;
  if (d.costN < d.cost.length || d.ticks % TPS !== 0) return;
  if (avg > 0.5 * TICK_MS && d.aiLevel < AI_EVERY.length - 1) {
    d.aiLevel++;
    d.costN = 0;
    d.costSum = 0;
    d.cost.fill(0);
  } else if (avg < 0.15 * TICK_MS && d.aiLevel > 0) {
    d.aiLevel--;
    d.costN = 0;
    d.costSum = 0;
    d.cost.fill(0);
  }
}

// ---------------------------------------------------------------- final
function checkEnd(room, api) {
  const d = room.data;
  if (!d || d.over || d.phase !== 'run') return;
  const R = d.R;
  if (!R.over) {
    // cuando llegó el primero, el resto tiene un tiempo; y una carrera no dura para siempre
    if (d.firstDone < 0 && [...d.hum.values()].some((h) => !h.auto && h.kart.finished)) d.firstDone = R.t;
    const noHumans = ![...d.hum.values()].some((h) => !h.auto);
    if ((d.firstDone >= 0 && R.t - d.firstDone > FIRST_GRACE_S) || R.t > MAX_RACE_S || (noHumans && d.hum.size === 0)) endRace(R);
  }
  if (R.over) finish(room, api);
}

function finish(room, api) {
  const d = room.data;
  if (!d || d.over) return;
  d.over = true;
  api.clearTimer('loop');
  const results = (d.R.results || []).map((r) => ({
    index: r.index,
    place: r.place,
    time: Math.round(r.time * 1000) / 1000,
    estimated: !!r.estimated,
    name: r.name,
    cfg: r.cfg,
    bestLap: r.bestLap ? Math.round(r.bestLap * 1000) / 1000 : 0,
    player: !!d.roster[r.index]?.pid,
  }));
  d.endPayload = { results };
  api.end(d.endPayload);
}

