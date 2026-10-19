/**
 * Espiral online: carrera de hasta 8 en la misma torre (semilla del servidor). Cada uno simula su caída en el navegador
 * y manda su avance; gana quien llega primero al fondo. El servidor fija la semilla y el inicio, reenvía los fantasmas
 * y rechaza tiempos imposibles (menos que caer toda la torre a la velocidad máxima).
 *
 * Mensajes del cliente: state { s: [avance×100, ángulo×1000, y×100, flags] } ~10 por segundo; finish { time, deaths }.
 */
import { randomInt } from 'node:crypto';
import { raceGame } from './_race.js';
import { makeRace, minTimeMs, RACE } from '../../public/games/espiral/shared/tower.js';

// el tiempo mínimo depende solo de la cantidad de anillos (no de la semilla)
const MIN_MS = Object.fromEntries(Object.keys(RACE).map((k) => [k, minTimeMs(makeRace(1, k))]));
const GOAL = Object.fromEntries(Object.keys(RACE).map((k) => [k, makeRace(1, k).goal]));

export default raceGame({
  maxPlayers: 8,
  countdownMs: 4000,
  maxMs: 8 * 60e3,
  graceAfterFirstMs: 40e3,
  defaults: { length: 'medium', public: false },
  settings: (cur, s) => ({
    length: typeof s.length === 'string' && Object.hasOwn(RACE, s.length) ? s.length : cur.length,
    public: typeof s.public === 'boolean' ? s.public : !!cur.public,
  }),
  onStart(room, d) {
    d.pub = { seed: randomInt(1, 2 ** 31), length: room.settings.length };
  },
  partial: (s, d) => ({ depth: Math.max(0, Math.min(GOAL[d.pub.length], Math.round(s[0]) / 100)) }),
  validateFinish(room, d, p, msg) {
    const time = Number(msg.time);
    const elapsed = Date.now() - d.startAt;
    if (!Number.isFinite(time) || time < MIN_MS[d.pub.length] || time > elapsed + 2500) return null;
    const deaths = Math.max(0, Math.min(999, Math.round(Number(msg.deaths) || 0)));
    return { time: Math.round(time), deaths };
  },
  rank: (list) => list.sort((a, b) => (a.dnf ? 1 : 0) - (b.dnf ? 1 : 0) || (a.dnf ? (b.depth || 0) - (a.depth || 0) : a.time - b.time)),
  listable: true,
  listInfo: (room) => ({ name: [...room.players.values()].find((p) => p.id === room.host)?.name, length: room.settings.length }),
});
