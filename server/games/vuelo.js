/**
 * Vuelo online: competencia de salto de esquí de hasta 8. Todos saltan el mismo trampolín con los mismos vientos (la
 * semilla de la sala da el viento de cada ronda), cada uno cuando quiere, y se ven como fantasmas. Al terminar sus
 * rondas cada uno manda distancia y estilo de cada salto; el servidor controla que sean posibles (tope de distancia del
 * trampolín, estilo de 0 a 60 en medios puntos, un mínimo de tiempo por salto) y suma los puntos él mismo.
 *
 * Mensajes del cliente: state { s: [fase, s×10, x×10, y×10, ángulo×1000, ronda, total×10, última×10] } ~12 por
 * segundo; finish { jumps: [{ dist, style }] }.
 */
import { randomInt } from 'node:crypto';
import { raceGame } from './_race.js';
import { HILLS, points, maxDist } from '../../public/games/vuelo/shared/hill.js';

const ROUNDS = ['2', '3'];
const MIN_JUMP_MS = 5000; // de la puerta al final del frenado no se baja de esto (en la realidad son más de 10 s)

export default raceGame({
  maxPlayers: 8,
  countdownMs: 4000,
  maxMs: (room) => (Number(room.settings.rounds) || 2) * 120e3,
  graceAfterFirstMs: 90e3,
  defaults: { hill: 'grande', rounds: '2', public: false },
  settings: (cur, s) => ({
    hill: typeof s.hill === 'string' && Object.hasOwn(HILLS, s.hill) ? s.hill : cur.hill,
    rounds: ROUNDS.includes(s.rounds) ? s.rounds : cur.rounds,
    public: typeof s.public === 'boolean' ? s.public : !!cur.public,
  }),
  onStart(room, d) {
    d.pub = { seed: randomInt(1, 2 ** 31), hill: room.settings.hill, rounds: Number(room.settings.rounds) || 2 };
  },
  partial: (s) => ({ total: Math.max(0, Math.min(9999, Math.round(s[6]) / 10 || 0)), dists: [] }),
  validateFinish(room, d, p, msg) {
    const { hill, rounds } = d.pub;
    const jumps = msg.jumps;
    if (!Array.isArray(jumps) || jumps.length !== rounds) return null;
    if (Date.now() - d.startAt < rounds * MIN_JUMP_MS) return null;
    const cap = maxDist(hill);
    let total = 0;
    const dists = [];
    for (const j of jumps) {
      const dist = Number(j?.dist), style = Number(j?.style);
      if (!Number.isFinite(dist) || dist < 0 || dist > cap || Math.round(dist * 2) !== dist * 2) return null;
      if (!Number.isFinite(style) || style < 0 || style > 60 || Math.round(style * 2) !== style * 2) return null;
      total += points(hill, dist, style);
      dists.push(dist);
    }
    return { total: Math.round(total * 10) / 10, dists };
  },
  rank: (list) => list.sort((a, b) => (a.dnf ? 1 : 0) - (b.dnf ? 1 : 0) || (b.total || 0) - (a.total || 0)),
  listable: true,
  listInfo: (room) => ({ name: [...room.players.values()].find((p) => p.id === room.host)?.name, hill: room.settings.hill, rounds: room.settings.rounds }),
});
