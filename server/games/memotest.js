/**
 * Memotest online, de 2 a 4: el servidor reparte las cartas (public/games/memotest/shared/deck.js) y las guarda; a los jugadores
 * solo les llega la cara de las cartas que se dan vuelta, así que nadie puede espiar el reparto. En cada turno se dan vuelta dos
 * cartas: si son iguales el jugador se las lleva y sigue; si no, se vuelven a tapar y pasa el turno. Cada turno tiene 25 s; si se
 * vence se pierde el turno y a la segunda vez seguida el jugador queda afuera (sigue mirando). Gana quien junta más pares (si
 * empatan ganan los dos); si quedan menos de dos jugadores en juego, gana el que queda.
 *
 * Mensajes: flip { i } (dar vuelta la carta i). El anfitrión repite con { t: 'again' }.
 */
import { randomInt } from 'node:crypto';
import { SIZES, deal, isSize, isTheme, shuffled } from '../../public/games/memotest/shared/deck.js';

const TURN_MS = 25e3;
const MATCH_MS = 900; // se ve el par antes de llevárselo
const MISS_MS = 1500; // se ven las dos cartas antes de taparlas
const MAX_IDLE = 2;
const rand = () => randomInt(0, 2 ** 32) / 2 ** 32;

const active = (d) => d.seats.filter((_, k) => !d.out[k]).length;

function view(room) {
  const d = room.data;
  if (!d) return { memotest: null };
  const taken = [];
  d.own.forEach((o, i) => o >= 0 && taken.push([i, d.faces[i], o]));
  return {
    memotest: {
      n: d.n,
      size: d.size,
      theme: d.theme,
      count: d.faces.length,
      seats: d.seats,
      scores: d.scores,
      out: d.out,
      turn: d.result ? -1 : d.turn,
      up: d.up.map((i) => [i, d.faces[i]]),
      taken,
      busy: d.busy,
      deadline: d.result || d.busy ? 0 : d.deadline,
      turnMs: TURN_MS,
      moves: d.moves,
      result: d.result,
    },
  };
}

function start(room, api) {
  const mt = (room.mt ||= { n: 0, lastFirst: null });
  const people = api
    .players()
    .filter((p) => p.connected)
    .slice(0, 4);
  let order = shuffled(people, rand);
  // en la revancha no empieza el mismo que la vez anterior
  if (order.length > 1 && order[0].id === mt.lastFirst) order = [...order.slice(1), order[0]];
  mt.lastFirst = order[0].id;
  mt.n++;
  const size = isSize(room.settings.size) ? room.settings.size : 'm';
  const theme = isTheme(room.settings.theme) ? room.settings.theme : 'mix';
  const pairs = SIZES[size];
  const faces = deal(rand, pairs, theme);
  room.data = {
    n: mt.n,
    size,
    theme,
    faces,
    seats: order.map((p) => ({ id: p.id, name: p.name, color: p.color })),
    own: new Array(faces.length).fill(-1),
    up: [],
    scores: order.map(() => 0),
    out: order.map(() => false),
    idle: order.map(() => 0),
    turn: 0,
    busy: false,
    moves: 0,
    deadline: 0,
    result: null,
  };
  armTurn(room, api);
}

function armTurn(room, api) {
  const d = room.data;
  d.deadline = Date.now() + TURN_MS;
  api.setTimer('turn', TURN_MS + 150, () => timeout(room, api));
}

/** Pasa el turno al próximo que sigue en juego. */
function advance(d) {
  for (let k = 1; k <= d.seats.length; k++) {
    const s = (d.turn + k) % d.seats.length;
    if (!d.out[s]) {
      d.turn = s;
      return;
    }
  }
}

function finish(room, api, reason) {
  const d = room.data;
  if (!d || d.result) return;
  api.clearTimer('turn');
  api.clearTimer('resolve');
  d.busy = false;
  d.up = [];
  let winners;
  if (reason === 'done') {
    const best = Math.max(...d.scores);
    winners = d.scores.map((s, k) => (s === best ? k : -1)).filter((k) => k >= 0);
  } else winners = d.seats.map((_, k) => (d.out[k] ? -1 : k)).filter((k) => k >= 0);
  d.result = { reason, scores: d.scores.slice(), winners };
  api.end({ result: d.result });
}

function timeout(room, api) {
  const d = room.data;
  if (!d || d.result || d.busy) return;
  const s = d.turn;
  d.idle[s]++;
  d.up = [];
  if (d.idle[s] >= MAX_IDLE) d.out[s] = true;
  if (active(d) <= 1) return finish(room, api, 'abandon');
  advance(d);
  armTurn(room, api);
  api.sync();
}

/** Las dos cartas dadas vuelta se resuelven: par (se las lleva y sigue) o error (se tapan y pasa el turno). */
function resolve(room, api) {
  const d = room.data;
  if (!d || d.result || !d.busy) return;
  const [a, b] = d.up;
  d.busy = false;
  d.up = [];
  d.moves++;
  if (d.faces[a] === d.faces[b]) {
    d.own[a] = d.own[b] = d.turn;
    d.scores[d.turn]++;
    if (d.own.every((o) => o >= 0)) return finish(room, api, 'done');
  } else advance(d);
  armTurn(room, api);
  api.sync();
}

export default {
  minPlayers: 2,
  maxPlayers: 4,
  defaults: { size: 'm', theme: 'mix', public: false },
  listable: true,

  settings(cur, s) {
    const out = { ...cur };
    if (isSize(s.size)) out.size = s.size;
    if (isTheme(s.theme)) out.theme = s.theme;
    if (typeof s.public === 'boolean') out.public = s.public;
    return out;
  },

  listInfo: (room) => ({ size: room.settings.size, theme: room.settings.theme }),

  view,

  canStart(room) {
    return [...room.players.values()].filter((p) => p.connected).length >= 2 ? null : 'need_players';
  },

  start,

  message(room, api, p, msg) {
    const d = room.data;
    if (!d || d.result) return true;
    if (msg.t !== 'flip') return false;
    const s = d.seats.findIndex((x) => x.id === p.id);
    if (s < 0 || d.out[s]) return false;
    const i = msg.i;
    if (!Number.isInteger(i) || i < 0 || i >= d.faces.length) return false;
    if (d.turn !== s) return api.send(p.id, { t: 'error', code: 'not_your_turn' });
    // mientras se resuelve el par, o con una carta que ya está a la vista, no se hace nada (puede cruzarse con el servidor)
    if (d.busy || d.own[i] >= 0 || d.up.includes(i)) return true;
    d.up.push(i);
    d.idle[s] = 0;
    if (d.up.length === 2) {
      d.busy = true;
      api.clearTimer('turn');
      const match = d.faces[d.up[0]] === d.faces[d.up[1]];
      api.setTimer('resolve', match ? MATCH_MS : MISS_MS, () => resolve(room, api));
    } else armTurn(room, api);
    api.touch();
    api.sync();
    return true;
  },

  /** Otra partida con los que están (solo el anfitrión, con la partida terminada). */
  command(room, api, p, msg) {
    if (msg.t !== 'again') return undefined;
    if (room.state !== 'finished' || room.host !== p.id) return true;
    if (api.players().filter((x) => x.connected).length < 2) return true;
    room.state = 'playing';
    start(room, api);
    api.touch();
    api.sync();
    return true;
  },

  leave(room, api, id) {
    const d = room.data;
    if (!d || d.result) return;
    const s = d.seats.findIndex((x) => x.id === id);
    if (s < 0 || d.out[s]) return;
    d.out[s] = true;
    if (active(d) <= 1) return finish(room, api, 'abandon');
    if (d.turn === s) {
      api.clearTimer('resolve');
      d.busy = false;
      d.up = [];
      advance(d);
      armTurn(room, api);
    }
  },
};
