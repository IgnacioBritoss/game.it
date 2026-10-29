/**
 * Penales online (1 contra 1): una tanda de 5 penales por lado y muerte súbita. En cada penal el que patea manda a dónde apunta
 * y con qué fuerza y el que ataja, a qué zona se tira, los dos a la vez y a ciegas; cuando llegaron las dos cosas (o se acaba el
 * tiempo y el servidor elige por el que falta) se resuelve con las mismas reglas que el cliente (public/games/penales/shared/
 * rules.js), con el error de puntería y la suerte del arquero sorteados acá, y se manda el resultado a los dos para que lo animen igual.
 *
 * Mensajes: aim { x, y, p } (el que patea), dive { c, r } (el que ataja); again (revancha, la piden los dos y cambia quién patea primero).
 */
import { randomInt } from 'node:crypto';
import { Shootout } from '../../public/games/penales/shared/match.js';
import { judge, makeNoise, isShot, isDive, cleanShot, COLS, ROWS, AIM } from '../../public/games/penales/shared/rules.js';

// (PENALES_FAST acorta los tiempos: es solo para las pruebas)
const FAST = process.env.PENALES_FAST === '1';
const CHOOSE_MS = FAST ? 700 : 18e3;
const REVEAL_MS = FAST ? 160 : 5600;
const rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

const state = (room) => (room.pn ||= { n: 0, lastFirst: null });

function view(room) {
  const d = room.data;
  if (!d) return { penales: null };
  const so = d.so;
  return {
    penales: {
      n: so.n,
      kicks: so.kicks,
      phase: d.phase,
      shooter: so.shooter,
      score: so.score.slice(),
      first: so.first,
      log: so.log.map((k) => ({ seat: k.seat, result: k.result })),
      marks: [so.marks(0), so.marks(1)],
      results: [so.results(0), so.results(1)],
      sudden: so.sudden,
      seats: d.seats,
      ready: { shot: !!d.pend.shot, dive: !!d.pend.dive },
      left: d.deadline ? Math.max(0, d.deadline - Date.now()) : 0,
      last: d.last,
      winner: so.over ? so.winner : -1,
      again: d.again,
      game: d.game,
    },
  };
}

function start(room, api) {
  const st = state(room);
  const ids = api
    .players()
    .filter((p) => p.connected)
    .map((p) => p.id)
    .slice(0, 2);
  const first = st.lastFirst === null ? (rng() < 0.5 ? 0 : 1) : 1 - st.lastFirst;
  st.lastFirst = first;
  st.n++;
  api.clearTimer('over');
  api.clearTimer('next');
  api.clearTimer('choose');
  const by = new Map(api.players().map((p) => [p.id, p]));
  room.data = {
    game: st.n,
    so: new Shootout({ kicks: 5, first }),
    seats: ids.map((id) => ({ id, name: by.get(id)?.name ?? '?', color: by.get(id)?.color ?? '#fff' })),
    pend: { shot: null, dive: null },
    phase: 'choose',
    last: null,
    deadline: 0,
    again: [],
  };
  choose(room, api);
}

/** Empieza a esperar lo que elige cada uno para el penal que viene. */
function choose(room, api) {
  const d = room.data;
  d.phase = 'choose';
  d.pend = { shot: null, dive: null };
  d.deadline = Date.now() + CHOOSE_MS;
  api.setTimer('choose', CHOOSE_MS, () => {
    // se acabó el tiempo: elige el servidor por el que falta (a un lugar cualquiera, sin mucha fuerza)
    const so = d.so;
    if (!d.pend.shot) d.pend.shot = cleanShot({ x: (rng() * 2 - 1) * 0.8, y: 0.15 + rng() * 0.6, p: 0.4 + rng() * 0.3 });
    if (!d.pend.dive) d.pend.dive = { c: COLS[Math.floor(rng() * 3)], r: ROWS[Math.floor(rng() * 2)] };
    void so;
    resolve(room, api);
    api.touch();
  });
  api.sync();
}

function resolve(room, api) {
  const d = room.data;
  const so = d.so;
  api.clearTimer('choose');
  const { shot, dive } = d.pend;
  const noise = makeNoise(rng);
  const kr = (rng() - 0.5) * 0.24;
  const j = judge(shot, noise, dive, kr);
  const seat = so.shooter;
  so.record(j.result === 'goal', j.result);
  d.last = { id: so.n, seat, shot, land: { x: j.x, y: j.y }, result: j.result, dive };
  d.deadline = 0;
  if (so.over) {
    d.phase = 'over';
    api.setTimer('over', REVEAL_MS, () => {
      if (room.state === 'playing' && room.data === d) api.end({ winner: d.seats[so.winner]?.id ?? null, score: so.score.slice() });
    });
  } else {
    d.phase = 'reveal';
    api.setTimer('next', REVEAL_MS, () => {
      if (room.data !== d || d.phase !== 'reveal') return;
      choose(room, api);
      api.touch();
    });
  }
  api.sync();
}

const seatOf = (d, id) => d.seats.findIndex((s) => s.id === id);

export default {
  minPlayers: 2,
  maxPlayers: 2,
  defaults: {},
  listable: false,

  settings: (cur) => ({ ...cur }),
  view,

  canStart(room) {
    return [...room.players.values()].filter((p) => p.connected).length >= 2 ? null : 'need_players';
  },

  start,

  message(room, api, p, msg) {
    const d = room.data;
    if (!d) return true;
    const seat = seatOf(d, p.id);
    if (seat < 0) return false;
    if (msg.t !== 'aim' && msg.t !== 'dive') return false;
    if (d.phase !== 'choose') return true;
    const so = d.so;
    if (msg.t === 'aim') {
      if (!isShot(msg)) return false;
      if (seat !== so.shooter) return true;
      if (d.pend.shot) return true; // ya mandó
      d.pend.shot = cleanShot(msg);
    } else {
      if (!isDive(msg)) return false;
      if (seat !== so.keeper) return true;
      if (d.pend.dive) return true;
      d.pend.dive = { c: msg.c, r: msg.r };
    }
    api.touch();
    if (d.pend.shot && d.pend.dive) resolve(room, api);
    else api.sync();
    return true;
  },

  /** Revancha: cuando los dos la piden, arranca otra tanda y patea primero el otro. */
  command(room, api, p, msg) {
    if (msg.t !== 'again') return undefined;
    const d = room.data;
    if (!d || (room.state !== 'finished' && d.phase !== 'over')) return true;
    if (!d.again.includes(p.id)) d.again.push(p.id);
    const active = [...room.players.values()].filter((x) => x.connected).map((x) => x.id);
    if (active.length >= 2 && active.every((id) => d.again.includes(id))) {
      room.state = 'playing';
      start(room, api);
    }
    api.touch();
    api.sync();
    return true;
  },

  leave(room, api, id) {
    // se fue durante la tanda: gana el otro
    const d = room.data;
    if (!d || d.so.over) return;
    const s = seatOf(d, id);
    if (s < 0) return;
    api.clearTimer('choose');
    api.clearTimer('next');
    d.so.finish(1 - s);
    d.phase = 'over';
    d.last = d.last ? { ...d.last } : null;
    api.end({ winner: d.seats[1 - s]?.id ?? null, score: d.so.score.slice(), abandon: id });
  },
};

export const _limits = { CHOOSE_MS, REVEAL_MS, AIM };
