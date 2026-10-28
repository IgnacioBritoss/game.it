/**
 * Memotest — la memoria de la compu. No ve las cartas boca abajo: solo se acuerda (a veces) de las que vio dar vuelta, las suyas
 * y las de los demás. Cada nivel se acuerda de más cartas y se olvida de menos. Todo es puro (el azar lo pone quien la usa).
 *
 *   keep:  chance de acordarse de una carta al verla
 *   decay: chance de olvidarse de cada carta que sabe, al terminar cada turno
 *   slip:  chance de desaprovechar un par que sabe y jugar a ciegas
 */
export const LEVELS = {
  1: { keep: 0.45, decay: 0.1, slip: 0.2 },
  2: { keep: 0.72, decay: 0.05, slip: 0.08 },
  3: { keep: 0.93, decay: 0.025, slip: 0.02 },
};

export class Brain {
  constructor(level, rand) {
    this.cfg = LEVELS[level] || LEVELS[2];
    this.rand = rand;
    /** posición → cara de las cartas que recuerda */
    this.known = new Map();
  }

  /** Vio dar vuelta la carta `i` (de cualquiera): se acuerda con cierta chance. */
  see(i, face) {
    if (this.rand() < this.cfg.keep) this.known.set(i, face);
  }

  /** Esas dos cartas se llevaron: ya no importan. */
  taken(a, b) {
    this.known.delete(a);
    this.known.delete(b);
  }

  /** Termina un turno: se olvida de algunas. */
  endTurn() {
    for (const i of [...this.known.keys()]) if (this.rand() < this.cfg.decay) this.known.delete(i);
  }

  pick(list) {
    return list[Math.floor(this.rand() * list.length)];
  }

  /** Primera carta de su turno: un par que sepa (devuelve también la otra), o una al azar entre las que no conoce. */
  first(down) {
    const live = new Set(down);
    const seen = new Map();
    for (const [i, f] of this.known) {
      if (!live.has(i)) continue;
      if (seen.has(f)) {
        if (this.rand() >= this.cfg.slip) return { i: seen.get(f), pair: i };
        break;
      }
      seen.set(f, i);
    }
    const blind = down.filter((i) => !this.known.has(i));
    return { i: this.pick(blind.length ? blind : down), pair: -1 };
  }

  /** Segunda carta, ya vista la primera (`i1` con cara `f1`): la pareja si la sabe; si no, una al azar entre las que no conoce. */
  second(i1, f1, down) {
    const live = new Set(down);
    for (const [j, f] of this.known) if (j !== i1 && f === f1 && live.has(j) && this.rand() >= this.cfg.slip) return j;
    const rest = down.filter((j) => j !== i1);
    const blind = rest.filter((j) => !this.known.has(j));
    return this.pick(blind.length ? blind : rest);
  }
}
