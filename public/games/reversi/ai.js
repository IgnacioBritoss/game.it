/** Reversi — la compu piensa en un worker para no trabar la pantalla. */
import { replay, sqName } from './shared/rules.js';
import { Engine, LEVELS } from './shared/engine.js';

const engine = new Engine();

self.onmessage = ({ data }) => {
  const { id, moves, level, hint, salt, eval: evalOnly } = data;
  const r = replay(moves || []);
  if (!r) return self.postMessage({ id, move: null });
  // pistas y tasaciones: una búsqueda pareja y sin ruido, sin importar el nivel de la partida
  const o = hint ? { depth: 10, time: 900, noise: 0, solve: 13 } : evalOnly ? { depth: 8, time: 500, noise: 0, solve: 11 } : { ...LEVELS[level] };
  const res = engine.think(r.pos, { ...o, salt });
  self.postMessage({ id, move: res.move >= 0 ? sqName(res.move) : null, score: res.score, depth: res.depth, exact: !!res.exact });
};
