/** Mancala — la compu piensa en un worker para no trabar la pantalla. */
import { replay, moveStr } from './shared/rules.js';
import { Engine, LEVELS } from './shared/engine.js';

const engine = new Engine();

self.onmessage = ({ data }) => {
  const { id, moves, level, hint, seeds } = data;
  const r = replay(moves || [], seeds || 4);
  if (!r) return self.postMessage({ id, move: null });
  // pistas: una búsqueda pareja y sin ruido, sin importar el nivel de la partida
  const o = hint ? { depth: 14, time: 900, noise: 0 } : { ...LEVELS[level] };
  const res = engine.think(r.pos, o);
  self.postMessage({ id, move: res.move >= 0 ? moveStr(res.move) : null, score: res.score, depth: res.depth });
};
