/**
 * Sudoku online: carrera de hasta 6 con el mismo puzzle (la semilla la pone el servidor y cada navegador arma el mismo
 * con el generador compartido). Cada uno resuelve por su cuenta y va mandando cuántos casilleros tiene bien; gana el
 * primero que termina. El servidor genera el puzzle una vez, guarda la solución (nunca se la manda a nadie) y solo
 * acepta un final si la grilla que llega es exactamente esa, y acota el tiempo a lo posible (no menos que ~0,45 s por casillero).
 *
 * Mensajes del cliente: state { s: [casilleros bien puestos] } ~2 por segundo; finish { time, grid: texto de 81 dígitos }.
 */
import { randomInt } from 'node:crypto';
import { raceGame } from './_race.js';
import { generate, LEVELS } from '../../public/games/sudoku/shared/engine.js';

const MS_PER_CELL = 450;

export default raceGame({
  maxPlayers: 6,
  countdownMs: 5000,
  maxMs: 30 * 60e3,
  graceAfterFirstMs: 120e3,
  defaults: { level: 'medium', public: false },
  settings: (cur, s) => ({
    level: typeof s.level === 'string' && LEVELS.includes(s.level) ? s.level : cur.level,
    public: typeof s.public === 'boolean' ? s.public : !!cur.public,
  }),
  onStart(room, d) {
    const seed = randomInt(1, 2 ** 31);
    const level = room.settings.level;
    const g = generate(String(seed), LEVELS.indexOf(level) + 1);
    d.pub = { seed, level };
    d.sol = g.solution;
    d.empties = [...g.puzzle].filter((c) => c === '0').length;
  },
  partial: (s) => ({ progress: Math.max(0, Math.min(81, Math.round(s[0]))) }),
  validateFinish(room, d, p, msg) {
    // lo que importa es que la grilla sea la solución; el tiempo se acota a lo posible (ni menos que el mínimo ni más que lo que pasó)
    if (typeof msg.grid !== 'string' || msg.grid !== d.sol) return null;
    const time = Number(msg.time);
    if (!Number.isFinite(time)) return null;
    const elapsed = Date.now() - d.startAt;
    return { time: Math.round(Math.max(d.empties * MS_PER_CELL, Math.min(time, elapsed + 2500))) };
  },
  rank: (list) => list.sort((a, b) => (a.dnf ? 1 : 0) - (b.dnf ? 1 : 0) || (a.dnf ? (b.progress || 0) - (a.progress || 0) : a.time - b.time)),
  listable: true,
  listInfo: (room) => ({ name: [...room.players.values()].find((p) => p.id === room.host)?.name, level: room.settings.level }),
});
