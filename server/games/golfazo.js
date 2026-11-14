/**
 * Golfazo online: de 1 a 8 jugando A LA VEZ (cada uno con su pelota, como en Golf It). La física es determinista y la
 * misma en el navegador y acá (public/games/golfazo/shared/physics.js), así que alcanza con mandar el golpe:
 *
 *   cliente → { t: 'shot', a, p, k }   ángulo (0..65535), fuerza (1..1000) y tick del reloj del hoyo en que se pegó.
 *
 * El navegador simula al instante (no hay demora) y el servidor repite el golpe con la misma física para decidir
 * cuántos golpes lleva cada uno y si embocó; los demás ven la pelota de cada rival repitiendo sus golpes. Se rechaza
 * lo que no se puede (tick futuro, pelota en movimiento, golpe de más), avisando con { t: 'reject' } para que el
 * cliente se reajuste. El reloj del hoyo arranca en `startAt` (hora del servidor): todos ven los obstáculos en la misma fase.
 *
 * Por hoyo hay un tiempo máximo; cuando el primero emboca, a los demás les quedan unos segundos. Gana el que menos
 * golpes suma en el recorrido (un hoyo sin terminar vale el máximo de golpes); desempata el tick en que embocó.
 *
 * Vista de la sala (`view`): { course, holes, idx, phase, startAt, deadline, pl: { id: { s: [[a,p,k]…], d: tick en que
 * terminó o null, sc: [puntaje por hoyo], x: 1 si no terminó } } }. Mensajes: done { id, strokes, holed }, reject.
 */
import { COURSE_IDS, courseHoles, holeWorld, HOLES } from '../../public/games/golfazo/shared/holes.js';
import { newBall, HZ, HOLED } from '../../public/games/golfazo/shared/physics.js';
import { playShot, holeOver, holeScore, strokesOf, MAX_STROKES } from '../../public/games/golfazo/shared/rules.js';

const COUNTDOWN_MS = 3500;
const BETWEEN_MS = 6500;
const GRACE_MS = 25e3; // cuando el primero emboca, a los demás les quedan estos segundos
const FUTURE_TICKS = 180; // lo que se tolera de "adelanto" del reloj del cliente (1,5 s)
const LIMITS = [60, 90, 120];

const rel = (room) => room.data;

function finishHole(room, api) {
  const d = rel(room);
  if (!d || d.phase !== 'play') return;
  api.clearTimer('limit');
  for (const [id, pl] of d.pl) {
    if (!pl.done) {
      pl.done = true;
      pl.dnf = true;
      pl.score = Math.max(MAX_STROKES, strokesOf(pl.ball));
    }
    pl.scores.push(pl.score);
    void id;
  }
  d.phase = 'between';
  d.endAt = Date.now();
  if (d.idx >= d.holes.length - 1) {
    api.setTimer('next', 4500, () => finish(room, api));
  } else api.setTimer('next', BETWEEN_MS, () => nextHole(room, api));
  api.broadcast({ t: 'between', idx: d.idx });
  api.sync();
}

function maybeFinishHole(room, api) {
  const d = rel(room);
  if (!d || d.phase !== 'play') return;
  if ([...d.pl.values()].every((p) => p.done)) finishHole(room, api);
}

function nextHole(room, api) {
  const d = rel(room);
  api.clearTimer('next');
  d.idx++;
  if (d.idx >= d.holes.length) return finish(room, api);
  d.world = holeWorld(d.holes[d.idx]);
  d.startAt = Date.now() + COUNTDOWN_MS;
  d.deadline = d.startAt + d.limit * 1000;
  d.phase = 'play';
  d.firstDone = false;
  for (const pl of d.pl.values()) {
    pl.ball = newBall(d.world);
    pl.shots = [];
    pl.done = !!pl.gone; // quien se fue no juega
    pl.dnf = false;
    pl.doneK = null;
    pl.score = pl.gone ? MAX_STROKES : 0;
    if (pl.gone) pl.doneK = 0;
  }
  api.setTimer('limit', d.deadline - Date.now() + 400, () => finishHole(room, api));
  api.broadcast({ t: 'hole', idx: d.idx });
  api.sync();
  maybeFinishHole(room, api);
}

function standings(room, api) {
  const d = rel(room);
  return [...d.pl.entries()]
    .map(([id, pl]) => {
      const p = api.players().find((x) => x.id === id);
      const total = pl.scores.reduce((a, b) => a + b, 0);
      const par = d.holes.reduce((a, h) => a + HOLES[h].par, 0);
      return { id, name: p?.name || pl.name, color: p?.color || pl.color, total, rel: total - par, holes: pl.scores.length, ticks: pl.tickSum, gone: !!pl.gone };
    })
    .sort((a, b) => Number(a.gone) - Number(b.gone) || a.total - b.total || a.ticks - b.ticks);
}

function finish(room, api) {
  const d = rel(room);
  if (!d) return;
  api.clearTimer('limit');
  api.end({ standings: standings(room, api) });
}

export default {
  minPlayers: 1,
  maxPlayers: 8,
  defaults: { course: 'pradera', limit: 90, public: false },
  settings: (cur, s) => ({
    course: typeof s.course === 'string' && COURSE_IDS.includes(s.course) ? s.course : cur.course,
    limit: LIMITS.includes(Number(s.limit)) ? Number(s.limit) : cur.limit,
    public: typeof s.public === 'boolean' ? s.public : !!cur.public,
  }),
  listable: true,
  listInfo: (room) => ({ name: [...room.players.values()].find((p) => p.id === room.host)?.name, course: room.settings.course, limit: room.settings.limit }),

  view(room) {
    const d = rel(room);
    if (!d) return { course: room.settings.course };
    const pl = {};
    for (const [id, p] of d.pl) {
      pl[id] = { s: p.shots.map((s) => [s.a, s.p, s.k]), d: p.doneK, sc: p.scores, ...(p.dnf ? { x: 1 } : {}), ...(p.gone ? { g: 1 } : {}) };
    }
    return { course: room.settings.course, holes: d.holes, idx: d.idx, phase: d.phase, startAt: d.startAt, deadline: d.deadline, limit: d.limit, pl };
  },

  start(room, api) {
    const holes = courseHoles(room.settings.course);
    room.data = {
      holes,
      idx: -1,
      limit: room.settings.limit,
      phase: 'play',
      startAt: 0,
      deadline: 0,
      world: null,
      firstDone: false,
      pl: new Map(),
    };
    for (const p of api.players()) room.data.pl.set(p.id, { name: p.name, color: p.color, ball: null, shots: [], scores: [], done: false, dnf: false, doneK: null, score: 0, tickSum: 0, gone: false });
    nextHole(room, api);
  },

  message(room, api, p, msg) {
    if (msg.t !== 'shot') return false;
    const d = rel(room);
    if (!d || d.phase !== 'play') return;
    const pl = d.pl.get(p.id);
    if (!pl || pl.done) return;
    const a = msg.a;
    const pw = msg.p;
    const k = msg.k;
    const nowK = Math.floor(((Date.now() - d.startAt) * HZ) / 1000);
    if (!Number.isInteger(a) || !Number.isInteger(pw) || !Number.isInteger(k)) return false;
    if (k > nowK + FUTURE_TICKS || k < 0) {
      api.send(p.id, { t: 'reject', why: 'time', n: pl.shots.length });
      return;
    }
    const res = playShot(d.world, pl.ball, a, pw, k);
    if (!res.ok) {
      if (res.why === 'bad_shot') return false;
      api.send(p.id, { t: 'reject', why: res.why, n: pl.shots.length });
      return;
    }
    pl.shots.push({ a, p: pw, k });
    api.touch();
    if (res.holed || holeOver(pl.ball)) {
      pl.done = true;
      pl.doneK = res.k;
      pl.score = holeScore(pl.ball);
      pl.tickSum += res.k;
      api.broadcast({ t: 'done', id: p.id, strokes: strokesOf(pl.ball), holed: pl.ball.mode === HOLED, k: res.k });
      if (!d.firstDone && pl.ball.mode === HOLED) {
        d.firstDone = true;
        const left = Math.min(d.deadline - Date.now(), GRACE_MS);
        d.deadline = Date.now() + left;
        api.setTimer('limit', left + 400, () => finishHole(room, api));
      }
    }
    api.sync();
    maybeFinishHole(room, api);
  },

  /** Si alguien se va, su pelota queda como está y el hoyo no lo espera. */
  leave(room, api, id) {
    const d = rel(room);
    if (!d) return;
    const pl = d.pl.get(id);
    if (!pl) return;
    pl.gone = true;
    if (d.phase === 'play' && !pl.done) {
      pl.done = true;
      pl.dnf = true;
      pl.doneK = null;
      pl.score = MAX_STROKES;
    }
    api.sync();
    maybeFinishHole(room, api);
  },

  /** Quien vuelve a conectarse recibe la sala completa (los golpes de todos) y se pone al día repitiéndolos. */
  onReconnect(room, api) {
    api.sync();
  },
};
