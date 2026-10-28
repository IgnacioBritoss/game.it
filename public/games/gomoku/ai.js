/** Worker de la compu de 5 en línea: recibe las jugadas hechas y devuelve la cruz que elige (o la mejor, si es una pista). */
import { replay } from './shared/rules.js';
import { Engine } from './shared/engine.js';

const eng = new Engine();
self.onmessage = ({ data }) => {
  const { id, moves, level, side, hint } = data;
  try {
    const r = replay(moves, side);
    if (!r || r.pos.over) return self.postMessage({ id, move: null });
    const res = eng.think(r.pos, { level, hint });
    self.postMessage({ id, move: res.move >= 0 ? String(res.move) : null, exact: !!res.exact });
  } catch {
    self.postMessage({ id, move: null });
  }
};
