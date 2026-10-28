/**
 * 5 en línea online: el servidor valida cada jugada con las mismas reglas que el cliente
 * (public/games/gomoku/shared/rules.js) y lleva el reloj con incremento. Cada lado tiene 40 s para su primera jugada o se anula la
 * partida; los relojes corren desde la segunda jugada. Rendición, revancha (el que empieza, y con él las negras, se alterna) y victoria
 * si el rival se va.
 */
import { Position, SIZES, fromStr, isSize, moveStr } from '../../public/games/gomoku/shared/rules.js';

const TCS = { '2+0': [120, 0], '3+2': [180, 2], '5+0': [300, 0], '10+0': [600, 0], '15+10': [900, 10] };
const FIRST_MOVE_MS = 40e3;

function state(room) {
  return (room.gm ||= { n: 0, lastFirst: null });
}

function view(room) {
  const d = room.data;
  if (!d) return { gomoku: null };
  return {
    gomoku: {
      n: d.n,
      first: d.first,
      second: d.second,
      moves: d.moves,
      size: d.size,
      tc: d.tc,
      clock: d.clock,
      running: d.result ? -1 : d.running,
      since: d.since,
      result: d.result,
      again: d.again,
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
  let first = ids[Math.random() < 0.5 ? 0 : 1];
  if (st.lastFirst && ids.includes(st.lastFirst)) first = ids.find((id) => id !== st.lastFirst);
  const second = ids.find((id) => id !== first);
  st.lastFirst = first;
  st.n++;
  const tc = Object.hasOwn(TCS, room.settings.tc) ? room.settings.tc : '5+0';
  const size = isSize(room.settings.size) ? room.settings.size : 'm';
  const [base, inc] = TCS[tc];
  room.data = { n: st.n, first, second, size, pos: new Position(SIZES[size]), moves: [], tc, inc: inc * 1000, clock: [base * 1000, base * 1000], running: -1, since: Date.now(), result: null, again: [] };
  api.setTimer('clock', FIRST_MOVE_MS, () => finish(room, api, { winner: null, reason: 'aborted' }));
}

function finish(room, api, result) {
  const d = room.data;
  if (!d || d.result) return;
  if (d.running >= 0) {
    d.clock[d.running] = Math.max(0, d.clock[d.running] - (Date.now() - d.since));
    d.since = Date.now();
  }
  d.result = { ...result, line: d.pos.win ? d.pos.win.slice() : null };
  d.running = -1;
  api.clearTimer('clock');
  api.end({ result: d.result });
}

function schedule(room, api) {
  const d = room.data;
  if (d.moves.length < 2) {
    api.setTimer('clock', FIRST_MOVE_MS, () => finish(room, api, { winner: null, reason: 'aborted' }));
    return;
  }
  const c = d.running;
  api.setTimer('clock', d.clock[c] + 30, () => {
    d.clock[c] = 0;
    d.since = Date.now();
    finish(room, api, { winner: c ^ 1, reason: 'timeout' });
  });
}

const colorOfPlayer = (d, id) => (id === d.first ? 0 : id === d.second ? 1 : -1);

export default {
  minPlayers: 2,
  maxPlayers: 2,
  defaults: { tc: '5+0', size: 'm', public: false },
  listable: true,

  settings(cur, s) {
    const out = { ...cur };
    if (typeof s.tc === 'string' && Object.hasOwn(TCS, s.tc)) out.tc = s.tc;
    if (isSize(s.size)) out.size = s.size;
    if (typeof s.public === 'boolean') out.public = s.public;
    return out;
  },

  listInfo: (room) => ({ tc: room.settings.tc, size: room.settings.size }),

  view,

  canStart(room) {
    return [...room.players.values()].filter((p) => p.connected).length >= 2 ? null : 'need_players';
  },

  start,

  message(room, api, p, msg) {
    const d = room.data;
    if (!d || d.result) return true;
    const me = colorOfPlayer(d, p.id);
    if (me < 0) return false;
    switch (msg.t) {
      case 'move': {
        if (d.pos.turn !== me) return api.send(p.id, { t: 'error', code: 'not_your_turn' });
        const m = fromStr(d.pos.n, String(msg.m ?? ''));
        if (m < 0 || d.pos.b[m]) return false;
        const now = Date.now();
        if (d.running === me) {
          const left = d.clock[me] - (now - d.since);
          if (left <= 0) {
            d.clock[me] = 0;
            finish(room, api, { winner: me ^ 1, reason: 'timeout' });
            return true;
          }
          d.clock[me] = left + d.inc;
        }
        d.pos.play(m);
        d.moves.push(moveStr(m));
        d.since = now;
        d.running = d.moves.length >= 2 ? d.pos.turn : -1;
        api.touch();
        if (d.pos.over) {
          const st = d.pos.status();
          finish(room, api, { winner: st.winner, reason: st.reason });
          return true;
        }
        schedule(room, api);
        api.sync();
        return true;
      }
      case 'resign':
        finish(room, api, { winner: me ^ 1, reason: 'resign', by: p.id });
        return true;
      default:
        return false;
    }
  },

  /** Revancha: cuando los dos la piden, arranca otra partida y empieza el otro. */
  command(room, api, p, msg) {
    if (msg.t !== 'again') return undefined;
    const d = room.data;
    if (room.state !== 'finished' || !d) return true;
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
    // se fue durante la partida (o se venció su tiempo de reconexión)
    const d = room.data;
    if (!d || d.result) return;
    const c = colorOfPlayer(d, id);
    if (c < 0) return;
    if (d.moves.length < 2) finish(room, api, { winner: null, reason: 'aborted' });
    else finish(room, api, { winner: c ^ 1, reason: 'abandon', by: id });
  },
};
