/** Damas — la compu piensa en un worker para no trabar la pantalla. */
import { replay } from './shared/rules.js';
import { Engine, LEVELS } from './shared/engine.js';
import { moveStr } from './shared/rules.js';

const engine = new Engine();

self.onmessage = ({ data }) => {
  const { id, moves, rules, level, hint, salt, eval: evalOnly } = data;
  const r = replay(moves || [], rules);
  if (!r) return self.postMessage({ id, move: null });
  // pistas y tasaciones: una búsqueda pareja sin ruido, sin importar el nivel de la partida
  const o = hint ? { depth: 12, time: 900, noise: 0 } : evalOnly ? { depth: 9, time: 500, noise: 0 } : { ...LEVELS[level] };
  const res = engine.think(r.pos, { ...o, salt });
  self.postMessage({ id, move: res.move ? moveStr(res.move) : null, score: res.score, depth: res.depth });
};
