/**
 * Cruce online: carrera de hasta 8 por el mismo camino (semilla del servidor). El tráfico es una función del tiempo
 * desde la largada, así que todos ven los mismos autos, troncos y trenes sin sincronizarlos: cada uno simula sus saltos
 * en el navegador y manda dónde está; gana quien llega primero a la meta. El servidor rechaza tiempos imposibles (menos
 * que saltar sin parar hasta la meta) y ordena a los que no llegaron por la fila más lejana que alcanzaron.
 *
 * Mensajes del cliente: state { s: [x×100, fila, mirada, flags, personaje, mejor fila] } ~10 por segundo; finish { time, deaths }.
 */
import { randomInt } from 'node:crypto';
import { raceGame } from './_race.js';
import { RACE_ROWS, minRaceMs } from '../../public/games/cruce/shared/world.js';

export default raceGame({
  maxPlayers: 8,
  countdownMs: 4000,
  maxMs: 10 * 60e3,
  graceAfterFirstMs: 45e3,
  defaults: { length: 'medium', public: false },
  settings: (cur, s) => ({
    length: typeof s.length === 'string' && Object.hasOwn(RACE_ROWS, s.length) ? s.length : cur.length,
    public: typeof s.public === 'boolean' ? s.public : !!cur.public,
  }),
  onStart(room, d) {
    d.pub = { seed: randomInt(1, 2 ** 31), length: room.settings.length };
  },
  partial: (s, d) => ({ best: Math.max(0, Math.min(RACE_ROWS[d.pub.length], Math.round(s[5]) || 0)) }),
  validateFinish(room, d, p, msg) {
    const time = Number(msg.time);
    const elapsed = Date.now() - d.startAt;
    if (!Number.isFinite(time) || time < minRaceMs(RACE_ROWS[d.pub.length]) || time > elapsed + 2500) return null;
    return { time: Math.round(time), deaths: Math.max(0, Math.min(999, Math.round(Number(msg.deaths) || 0))) };
  },
  rank: (list) => list.sort((a, b) => (a.dnf ? 1 : 0) - (b.dnf ? 1 : 0) || (a.dnf ? (b.best || 0) - (a.best || 0) : a.time - b.time)),
  listable: true,
  listInfo: (room) => ({ name: [...room.players.values()].find((p) => p.id === room.host)?.name, length: room.settings.length }),
});
