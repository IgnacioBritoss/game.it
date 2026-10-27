/**
 * Generala online: la mesa (public/games/generala/shared/table.js) corre en el servidor, que tira los dados (nadie
 * puede inventar una generala), valida cada jugada y le manda a todos lo que pasa. El anfitrión puede sumar jugadores
 * de la compu. Si alguien se desconecta, juega la compu por él hasta que vuelva; si se va, lo reemplaza.
 *
 * Mensajes: roll { hold: [5 × bool] }, hold { hold }, score { cat }; again (otra partida, anfitrión).
 */
import { randomInt } from 'node:crypto';
import { Table } from '../../public/games/generala/shared/table.js';
import { CATS } from '../../public/games/generala/shared/rules.js';

const TURN_MS = 45e3;
const MAX = 6;
const BOT_NAMES = ['Coco', 'Tota', 'Pocho', 'Lula', 'Beto', 'Chiqui', 'Nico', 'Mimí'];
const BOT_COLORS = ['#ff8a5c', '#7ad3ff', '#b8f06a', '#d9a6ff', '#ffd166'];
const rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

const humans = (api) => api.players().filter((p) => p.connected);

function start(room, api) {
  const st = room.settings;
  const people = humans(api).slice(0, MAX);
  const bots = Math.max(0, Math.min(st.bots, MAX - people.length));
  const seats = people.map((p) => ({ id: p.id, name: p.name, color: p.color, bot: 0 }));
  for (let i = 0; i < bots; i++) seats.push({ id: `bot${i}`, name: BOT_NAMES[i], color: BOT_COLORS[i], bot: st.level });
  const io = {
    emit: (i, view) => api.send(seats[i].id, { t: 'g', s: view }),
    timer: (k, ms, fn) =>
      api.setTimer(k, ms, () => {
        fn();
        api.touch();
      }),
    clear: (k) => api.clearTimer(k),
    over: (standings) => setTimeout(() => room.data?.table === table && room.state === 'playing' && api.end({ standings }), 0),
  };
  const table = new Table({ seats, opts: { servida: !!st.servida, turnMs: TURN_MS }, io, rng });
  room.data = { table };
  table.start();
}

const seatOf = (room, pid) => room.data?.table.seats.findIndex((s) => s.id === pid) ?? -1;
const isHold = (h) => Array.isArray(h) && h.length === 5 && h.every((x) => typeof x === 'boolean');

export default {
  minPlayers: 1,
  maxPlayers: MAX,
  defaults: { bots: 0, level: 2, servida: 1 },

  settings(cur, s) {
    const n = (v, ok, d) => (ok.includes(Number(v)) ? Number(v) : d);
    return {
      bots: n(s.bots, [0, 1, 2, 3, 4], cur.bots),
      level: n(s.level, [1, 2, 3], cur.level),
      servida: n(s.servida, [0, 1], cur.servida),
    };
  },

  canStart(room) {
    const people = [...room.players.values()].filter((p) => p.connected).length;
    return people + Math.min(room.settings.bots, MAX - people) >= 2 ? null : 'need_players';
  },

  view(room) {
    const T = room.data?.table;
    return { generala: T ? { round: T.round, phase: T.phase, n: T.n } : null };
  },

  start,

  message(room, api, p, msg) {
    const T = room.data?.table;
    if (!T) return true;
    const i = seatOf(room, p.id);
    if (i < 0) return false;
    if (msg.t === 'roll' || msg.t === 'hold') {
      if (msg.hold !== undefined && !isHold(msg.hold)) return false;
    } else if (msg.t === 'score') {
      if (!CATS.includes(msg.cat)) return false;
    } else return false;
    T.act(i, msg);
    api.touch();
    return true;
  },

  /** Otra partida con la misma mesa (solo el anfitrión, con la partida terminada). */
  command(room, api, p, msg) {
    if (msg.t !== 'again') return undefined;
    if (room.state !== 'finished' || room.host !== p.id) return true;
    room.state = 'playing';
    start(room, api);
    api.touch();
    api.sync();
    return true;
  },

  onReconnect(room, api, pid) {
    const T = room.data?.table;
    if (!T) return;
    const i = seatOf(room, pid);
    if (i < 0) return;
    T.setAway(i, false);
    api.send(pid, { t: 'g', s: T.view(i) });
  },

  onDisconnect(room, api, pid) {
    const i = seatOf(room, pid);
    if (i >= 0) room.data.table.setAway(i, true);
  },

  leave(room, api, pid) {
    const T = room.data?.table;
    if (!T || T.phase === 'over') return;
    const i = seatOf(room, pid);
    if (i >= 0) T.toBot(i);
    // si no queda ninguna persona, se corta
    if (!T.seats.some((s) => !s.bot)) api.toLobby();
  },
};
