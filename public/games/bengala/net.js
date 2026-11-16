/**
 * Bengala — duelo online. Usa el flujo común de las carreras (RaceLobby): partida rápida, sala privada con código, sala de espera
 * y revancha. Durante el duelo junta las acciones del jugador en un registro y lo manda en tandas; el servidor lleva la misma
 * sim con eso y decide el puntaje. Cada dos segundos guarda una instantánea en sessionStorage: si se recarga la página, el
 * duelo sigue donde estaba.
 */
import { RaceLobby } from '/shared/race-lobby.js';
import { encodeAct, dump, load } from './shared/sim.js';

const SNAP = 'gameit:bengala:duelo';
const CHUNK = 1400; // caracteres por tanda (el servidor corta los mensajes en 2 KB)

/** `h`: lo que el juego hace con cada momento del duelo (show, begin, lobby, room, closed, end, smoke, smoked, rival). */
export function makeDuel(h) {
  const others = new Map(); // id → { name, color, score, chain, ov, done }
  let buf = [];
  let size = 0;
  let chunk = 0;
  let key = '';
  let lastLog = 0;
  let lastState = 0;
  let lastSnap = 0;
  let bursts = 0;

  const clearSnap = () => {
    try {
      sessionStorage.removeItem(SNAP);
    } catch {}
  };

  const lobby = new RaceLobby({
    game: 'bengala',
    settings: ['time', 'sabotage'],
    defaults: { time: '5', sabotage: 'on' },
    show: (id) => h.show(id),
    onRace: (room) => {
      const r = room.race;
      key = `${r.seed}:${r.startAt}`;
      others.clear();
      for (const p of room.players) if (p.id !== lobby.net.myId) others.set(p.id, { name: p.name, color: p.color, score: 0, chain: 0, ov: 0, done: false });
      buf = [];
      size = 0;
      chunk = 0;
      bursts = 0;
      let snap = null;
      try {
        const s = JSON.parse(sessionStorage.getItem(SNAP));
        if (s && s.key === key) snap = s;
      } catch {}
      if (snap) {
        buf = Array.isArray(snap.buf) ? snap.buf : [];
        size = buf.join(',').length;
        chunk = snap.chunk | 0;
      }
      let S = null;
      try {
        if (snap) S = load(snap.S);
      } catch {}
      h.begin(room, S, snap?.samples || null);
    },
    onLobby: (room) => h.lobby(room),
    onMessage: (m) => {
      if (m.t === 'state') {
        const o = others.get(m.id);
        if (!o) return;
        o.score = +m.s[0] || 0;
        o.chain = +m.s[1] || 0;
        o.ov = +m.s[2] || 0;
        if (m.s[3] > 0) h.rival(o.color, Math.min(6, m.s[3]));
      } else if (m.t === 'finished') {
        const o = others.get(m.id);
        if (o) {
          o.done = true;
          o.score = m.score;
          o.chain = m.chain;
        }
        h.room(lobby.net.room);
      } else if (m.t === 'end') {
        clearSnap();
        h.end(m.results);
      } else if (m.t === 'sab') h.smoke(m.name);
      else if (m.t === 'sabok') h.smoked(m.to);
    },
    onRoom: (room) => h.room(room),
    onClosed: (txt) => {
      clearSnap();
      h.closed(txt);
    },
  });

  function flush() {
    if (!buf.length) return;
    lobby.net.raw({ t: 'log', i: chunk++, d: buf.join(',') });
    buf = [];
    size = 0;
    lastLog = performance.now();
  }

  return {
    lobby,
    others,
    get me() {
      return lobby.net.myId;
    },
    now: () => lobby.net.serverNow(),
    /** Anota una acción que ya valió en la sim local. El Gran Final sale enseguida (puede tirar humo). */
    record(tick, a) {
      const s = encodeAct(tick, a);
      if (size + s.length + 1 > CHUNK) flush();
      buf.push(s);
      size += s.length + 1;
      if (a[0] === 'F') flush();
    },
    burst() {
      bursts++;
    },
    /** Una vez por cuadro durante el duelo: manda lo pendiente, el estado para la tabla y guarda la instantánea. */
    pump(S, samples) {
      const now = performance.now();
      if (buf.length && now - lastLog > 4000) flush();
      if (now - lastState > 500) {
        lastState = now;
        lobby.net.raw({ t: 'state', s: [Math.floor(S.total), S.st.bestK, Math.round(S.ov), bursts] });
        bursts = 0;
      }
      if (now - lastSnap > 2000) {
        lastSnap = now;
        try {
          sessionStorage.setItem(SNAP, JSON.stringify({ key, S: dump(S), buf, chunk, samples }));
        } catch {}
      }
    },
    finish(S) {
      flush();
      lobby.net.send({ t: 'finish', k: S.tick });
      clearSnap();
    },
    leave() {
      clearSnap();
      lobby.leave();
    },
  };
}
