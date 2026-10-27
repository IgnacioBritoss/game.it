/**
 * Escoba de 15 online: la mesa (public/games/escoba/shared/table.js) corre en el servidor, que mezcla y reparte, valida
 * cada jugada (hay que levantar si se puede y tiene que sumar 15) y le manda a cada uno solo lo que puede ver (sus
 * cartas, nunca las de los demás). De a 2, 3 o 4 (en parejas); la compu completa los lugares libres. Si alguien se
 * desconecta juega la compu por él hasta que vuelva; si se va, lo reemplaza.
 *
 * Mensajes: play { card, take: [cartas de la mesa] }, next (listo para la ronda que sigue); again (otra partida, anfitrión).
 */
import { randomInt } from 'node:crypto';
import { Table } from '../../public/games/escoba/shared/table.js';
import { isCard, seatOrder } from '../../public/games/escoba/shared/rules.js';

const TURN_MS = 40e3;
const BOT_NAMES = ['Cacho', 'Pocha', 'Tito'];
const BOT_COLORS = ['#ff8a5c', '#7ad3ff', '#b8f06a'];
const rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

const humans = (api) => api.players().filter((p) => p.connected);

function start(room, api) {
  const st = room.settings;
  const n = st.n;
  const people = humans(api).slice(0, n);
  const at = seatOrder(people.length, n, st.pair);
  const seats = new Array(n).fill(null);
  people.forEach((p, k) => (seats[at[k]] = { id: p.id, name: p.name, color: p.color, bot: 0 }));
  let b = 0;
  for (let i = 0; i < n; i++) if (!seats[i]) seats[i] = { id: `bot${b}`, name: BOT_NAMES[b], color: BOT_COLORS[b++], bot: st.level };
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
  const table = new Table({ seats, opts: { target: st.target, turnMs: TURN_MS }, io, rng });
  room.data = { table, ready: new Set(), readyRound: -1 };
  table.start();
}

const seatOf = (room, pid) => room.data?.table.seats.findIndex((s) => s.id === pid) ?? -1;

export default {
  minPlayers: 1,
  maxPlayers: 4,
  defaults: { n: 2, pair: 0, target: 21, level: 2 },

  settings(cur, s) {
    const n = (v, ok, d) => (ok.includes(Number(v)) ? Number(v) : d);
    return {
      n: n(s.n, [2, 3, 4], cur.n),
      pair: n(s.pair, [0, 1], cur.pair),
      target: n(s.target, [11, 21], cur.target),
      level: n(s.level, [1, 2, 3], cur.level),
    };
  },

  canStart(room) {
    const people = [...room.players.values()].filter((p) => p.connected).length;
    if (people < 2) return 'need_players';
    if (people > room.settings.n) return 'too_many';
    return null;
  },

  view(room) {
    const T = room.data?.table;
    return { escoba: T ? { scores: T.scores.slice(), phase: T.phase, n: T.n } : null };
  },

  start,

  message(room, api, p, msg) {
    const T = room.data?.table;
    if (!T) return true;
    const i = seatOf(room, p.id);
    if (i < 0) return false;
    if (msg.t === 'play') {
      if (!isCard(msg.card)) return false;
      if (msg.take !== undefined && (!Array.isArray(msg.take) || msg.take.length > 12 || !msg.take.every(isCard))) return false;
      // una jugada fuera de turno o que no suma 15 no es un error grave (puede cruzarse con la compu que jugó por él): se ignora
      T.act(i, { t: 'play', card: msg.card, take: msg.take || [] });
    } else if (msg.t === 'next') {
      // entre rondas: cuando todos los que están listos tocaron "siguiente", se sigue sin esperar
      const d = room.data;
      if (T.phase !== 'play' || !T.h?.over) return true;
      if (d.readyRound !== T.h.num) {
        d.ready.clear();
        d.readyRound = T.h.num;
      }
      d.ready.add(i);
      const need = T.seats.map((s, k) => (!s.bot && !s.away ? k : -1)).filter((k) => k >= 0);
      if (need.every((k) => d.ready.has(k))) T.skip();
    } else return false;
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
