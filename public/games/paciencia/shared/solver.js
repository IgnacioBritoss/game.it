/**
 * Paciencia — resolvedores. Klondike "sabiendo todo" (búsqueda en profundidad con poda y tabla de estados vistos):
 * sirve para elegir repartos que se pueden ganar (el del día y la opción "solo repartos ganables"). FreeCell: búsqueda
 * por mejor primero con movidas de a una carta; las pruebas la usan para comprobar los repartos de Microsoft.
 * Representación compacta interna: carta = s * 13 + (r - 1).
 */
const S_ = (c) => Math.floor(c / 13);
const R_ = (c) => (c % 13) + 1;
const RED = (c) => {
  const s = S_(c);
  return s === 1 || s === 2;
};
const code = (c) => c.s * 13 + c.r - 1;

// ---------------------------------------------------------------- Klondike
/**
 * ¿Se puede ganar este reparto de Klondike (st recién repartido)? Devuelve { ok, nodes } — ok: true/false, o null si
 * se agotó el límite sin decidir.
 */
export function solveKlondike(st, limit = 60000) {
  const tab = st.tab.map((p) => p.map(code));
  const down = st.tab.map((p) => p.filter((c) => !c.up).length);
  const stock = st.stock.map(code);
  const waste = st.waste.map(code);
  const found = st.found.map((f) => f.length);
  const draw = st.draw || 1;
  const seen = new Set();
  let nodes = 0;
  let aborted = false;

  const fits = (c, t) => t !== undefined && RED(c) !== RED(t) && R_(t) === R_(c) + 1;
  const canFound = (c) => found[S_(c)] === R_(c) - 1;
  const safe = (c) => {
    const r = R_(c);
    if (r <= 2) return true;
    return RED(c) ? found[0] >= r - 1 && found[3] >= r - 1 : found[1] >= r - 1 && found[2] >= r - 1;
  };
  const key = () => {
    let k = found.join(',') + '|' + stock.join('.') + '|' + waste.join('.');
    // las columnas se pueden intercambiar: ordenadas para no repetir estados iguales
    const cols = tab.map((p, i) => down[i] + ':' + p.join('.')).sort();
    return k + '|' + cols.join('/');
  };

  function dfs() {
    if (++nodes > limit) {
      aborted = true;
      return false;
    }
    if (found[0] + found[1] + found[2] + found[3] === 52) return true;
    // subir lo seguro (sin bifurcar)
    const undo = [];
    for (let again = true; again; ) {
      again = false;
      for (let i = 0; i < 7; i++) {
        const p = tab[i];
        const c = p[p.length - 1];
        if (c !== undefined && p.length > down[i] && canFound(c) && safe(c)) {
          p.pop();
          found[S_(c)]++;
          let flipped = false;
          if (p.length && p.length === down[i]) {
            down[i]--;
            flipped = true;
          }
          undo.push(['t', i, c, flipped]);
          again = true;
        }
      }
      const w = waste[waste.length - 1];
      if (w !== undefined && canFound(w) && safe(w)) {
        waste.pop();
        found[S_(w)]++;
        undo.push(['w', 0, w, false]);
        again = true;
      }
    }
    const restore = () => {
      for (let j = undo.length - 1; j >= 0; j--) {
        const [kind, i, c, flipped] = undo[j];
        found[S_(c)]--;
        if (kind === 't') {
          if (flipped) down[i]++;
          tab[i].push(c);
        } else waste.push(c);
      }
    };
    if (found[0] + found[1] + found[2] + found[3] === 52) {
      restore();
      return true;
    }
    const k = key();
    if (seen.has(k)) {
      restore();
      return false;
    }
    seen.add(k);

    const tryMove = (doIt, undoIt) => {
      doIt();
      const ok = dfs();
      undoIt();
      return ok;
    };
    let result = false;
    // 1) a las bases (no seguras)
    for (let i = 0; i < 7 && !result && !aborted; i++) {
      const p = tab[i];
      const c = p[p.length - 1];
      if (c === undefined || p.length <= down[i] || !canFound(c)) continue;
      let flipped = false;
      result = tryMove(
        () => {
          p.pop();
          found[S_(c)]++;
          if (p.length && p.length === down[i]) {
            down[i]--;
            flipped = true;
          }
        },
        () => {
          if (flipped) down[i]++;
          found[S_(c)]--;
          p.push(c);
        },
      );
    }
    const w = waste[waste.length - 1];
    if (!result && !aborted && w !== undefined && canFound(w))
      result = tryMove(
        () => {
          waste.pop();
          found[S_(w)]++;
        },
        () => {
          found[S_(w)]--;
          waste.push(w);
        },
      );
    // 2) columna a columna, primero las que destapan
    if (!result && !aborted) {
      const moves = [];
      for (let i = 0; i < 7; i++) {
        const p = tab[i];
        for (let k = down[i]; k < p.length; k++) {
          const c = p[k];
          for (let j = 0; j < 7; j++) {
            if (j === i) continue;
            const q = tab[j];
            const t = q[q.length - 1];
            const toEmpty = !q.length;
            if (toEmpty ? R_(c) !== 13 : !fits(c, t)) continue;
            // un rey que ya está solo abajo no se mueve a otra columna vacía
            if (toEmpty && k === 0) continue;
            const reveals = k === down[i] && k > 0;
            // mover una parte de la escalera solo si deja subir la carta de abajo
            const partial = k > down[i];
            if (partial) {
              const under = p[k - 1];
              if (!(canFound(under) || false)) continue;
            }
            moves.push({ i, j, k, v: reveals ? 3 : toEmpty ? 1 : partial ? 2 : 0 });
            if (toEmpty) break; // una sola columna vacía alcanza
          }
        }
      }
      moves.sort((a, b) => b.v - a.v);
      for (const mv of moves) {
        if (result || aborted) break;
        if (mv.v === 0 && mv.k !== down[mv.i]) continue;
        const p = tab[mv.i], q = tab[mv.j];
        let moved, flipped = false;
        result = tryMove(
          () => {
            moved = p.splice(mv.k);
            q.push(...moved);
            if (p.length && p.length === down[mv.i]) {
              down[mv.i]--;
              flipped = true;
            }
          },
          () => {
            if (flipped) down[mv.i]++;
            q.splice(q.length - moved.length);
            p.push(...moved);
          },
        );
      }
    }
    // 3) del pozo a una columna
    if (!result && !aborted && w !== undefined)
      for (let j = 0; j < 7 && !result && !aborted; j++) {
        const q = tab[j];
        const t = q[q.length - 1];
        if (q.length ? !fits(w, t) : R_(w) !== 13) continue;
        result = tryMove(
          () => {
            waste.pop();
            q.push(w);
          },
          () => {
            q.pop();
            waste.push(w);
          },
        );
      }
    // 4) robar (o dar vuelta el pozo)
    if (!result && !aborted && (stock.length || waste.length)) {
      if (stock.length) {
        const n = Math.min(draw, stock.length);
        result = tryMove(
          () => {
            for (let x = 0; x < n; x++) waste.push(stock.pop());
          },
          () => {
            for (let x = 0; x < n; x++) stock.push(waste.pop());
          },
        );
      } else {
        const saved = waste.slice();
        result = tryMove(
          () => {
            while (waste.length) stock.push(waste.pop());
          },
          () => {
            stock.length = 0;
            waste.length = 0;
            waste.push(...saved);
          },
        );
      }
    }
    restore();
    return result;
  }
  const ok = dfs();
  return { ok: ok ? true : aborted ? null : false, nodes };
}

// ---------------------------------------------------------------- FreeCell
/** Resuelve un reparto de FreeCell (movidas de a una carta). Devuelve { ok, nodes } (ok null si se agotó el límite). */
export function solveFreecell(st, limit = 200000) {
  const start = {
    tab: st.tab.map((p) => p.map(code)),
    cells: st.cells.map((c) => (c ? code(c) : -1)),
    found: st.found.map((f) => f.length),
  };
  const fits = (c, t) => RED(c) !== RED(t) && R_(t) === R_(c) + 1;
  const keyOf = (s) => s.found.join(',') + '|' + s.cells.slice().sort((a, b) => a - b).join(',') + '|' + s.tab.map((p) => p.join('.')).sort().join('/');
  const done = (s) => s.found[0] + s.found[1] + s.found[2] + s.found[3] === 52;
  // heurística: cartas que faltan subir + cartas tapando a otras más bajas + celdas ocupadas
  const h = (s) => {
    let v = (52 - (s.found[0] + s.found[1] + s.found[2] + s.found[3])) * 3;
    for (const p of s.tab) {
      let mn = 99;
      for (const c of p) {
        if (R_(c) > mn) v += 1;
        mn = Math.min(mn, R_(c));
      }
    }
    v += s.cells.filter((c) => c >= 0).length;
    return v;
  };
  const autoSafe = (s) => {
    for (let again = true; again; ) {
      again = false;
      const safe = (c) => {
        const r = R_(c);
        if (r <= 2) return true;
        return RED(c) ? s.found[0] >= r - 1 && s.found[3] >= r - 1 : s.found[1] >= r - 1 && s.found[2] >= r - 1;
      };
      for (const p of s.tab) {
        const c = p[p.length - 1];
        if (c !== undefined && s.found[S_(c)] === R_(c) - 1 && safe(c)) {
          p.pop();
          s.found[S_(c)]++;
          again = true;
        }
      }
      for (let i = 0; i < 4; i++) {
        const c = s.cells[i];
        if (c >= 0 && s.found[S_(c)] === R_(c) - 1 && safe(c)) {
          s.cells[i] = -1;
          s.found[S_(c)]++;
          again = true;
        }
      }
    }
    return s;
  };
  const copy = (s) => ({ tab: s.tab.map((p) => p.slice()), cells: s.cells.slice(), found: s.found.slice() });
  const next = (s) => {
    const out = [];
    const push = (fn) => {
      const n = copy(s);
      fn(n);
      out.push(autoSafe(n));
    };
    // fuentes: tope de columnas y celdas
    const free = s.cells.indexOf(-1);
    for (let i = 0; i < 8; i++) {
      const p = s.tab[i];
      if (!p.length) continue;
      const c = p[p.length - 1];
      if (s.found[S_(c)] === R_(c) - 1)
        push((n) => {
          n.tab[i].pop();
          n.found[S_(c)]++;
        });
      for (let j = 0; j < 8; j++) {
        if (j === i) continue;
        const q = s.tab[j];
        if (q.length ? fits(c, q[q.length - 1]) : p.length > 1)
          push((n) => {
            n.tab[j].push(n.tab[i].pop());
          });
      }
      if (free >= 0)
        push((n) => {
          n.cells[free] = n.tab[i].pop();
        });
    }
    for (let k = 0; k < 4; k++) {
      const c = s.cells[k];
      if (c < 0) continue;
      if (s.found[S_(c)] === R_(c) - 1)
        push((n) => {
          n.cells[k] = -1;
          n.found[S_(c)]++;
        });
      let emptyDone = false;
      for (let j = 0; j < 8; j++) {
        const q = s.tab[j];
        if (!q.length) {
          if (emptyDone) continue;
          emptyDone = true;
        } else if (!fits(c, q[q.length - 1])) continue;
        push((n) => {
          n.tab[j].push(c);
          n.cells[k] = -1;
        });
      }
    }
    return out;
  };
  // cola de prioridad (montículo binario)
  const heap = [];
  const pushH = (x) => {
    heap.push(x);
    let i = heap.length - 1;
    while (i > 0) {
      const pa = (i - 1) >> 1;
      if (heap[pa].f <= heap[i].f) break;
      [heap[pa], heap[i]] = [heap[i], heap[pa]];
      i = pa;
    }
  };
  const popH = () => {
    const topv = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l].f < heap[m].f) m = l;
        if (r < heap.length && heap[r].f < heap[m].f) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return topv;
  };
  const seen = new Set();
  const s0 = autoSafe(copy(start));
  pushH({ s: s0, f: h(s0) });
  seen.add(keyOf(s0));
  let nodes = 0;
  while (heap.length) {
    const { s } = popH();
    if (done(s)) return { ok: true, nodes };
    if (++nodes > limit) return { ok: null, nodes };
    for (const n of next(s)) {
      const k = keyOf(n);
      if (seen.has(k)) continue;
      seen.add(k);
      pushH({ s: n, f: h(n) });
    }
  }
  return { ok: false, nodes };
}
