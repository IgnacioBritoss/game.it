/**
 * Tuercas — los pilotos de la compu. Manejan con las mismas entradas y la misma física que el jugador:
 * apuntan a un punto adelante sobre la línea de carrera (persecución pura), levantan o frenan si la curva que viene
 * pide más giro del que el vehículo da, derrapan en las curvas largas para sacar miniturbos, van a buscar cajas,
 * esquivan estorbos y manchas, y usan los ítems con algo de criterio. La habilidad (0,5 a 1) cambia cuánto se pegan
 * a la línea, si derrapan y qué tan rápido reaccionan.
 * También maneja el vehículo de un jugador que ya llegó y el piloto automático de la cañita voladora.
 */
import { clamp, wrapAngle, wrapDelta } from './util.js';

export function makeBrain(rand, skill = 0.8) {
  return {
    skill,
    lane: (rand() - 0.5) * 0.7, // carril preferido (fracción del medio ancho)
    lineK: 0.5 + 0.5 * skill, // cuánto sigue la línea ideal
    wob: rand() * 20,
    wobAmp: 0.03 + (1 - skill) * 0.16,
    drifts: skill >= 0.7,
    hold: false,
    holdT: 0,
    dir: 0,
    want: 0,
    itemT: 1,
    haveT: 0,
    had: null,
    stuckT: 0,
    backT: 0,
    start: rand() < skill * 0.55 ? 1 : rand() < (1 - skill) * 0.25 ? -1 : 0, // largada: turbo, normal o se ahoga
    trick: rand() < skill * 0.8,
    rand,
  };
}

/** Rumbo hacia un punto de la pista `look` metros adelante con desvío `d`. Devuelve el error de rumbo (+ = izquierda). */
function aim(k, T, look, d) {
  const i = (k.ti + Math.max(1, Math.round(look / T.step))) % T.n;
  const lim = T.hw[i] - 1.7;
  const dd = clamp(d, -lim, lim);
  const tx = T.x[i] + T.nx[i] * dd;
  const tz = T.z[i] + T.nz[i] * dd;
  return wrapAngle(Math.atan2(tx - k.x, tz - k.z) - k.yaw);
}

/** Piloto automático (cañita voladora): por el medio de la pista, a fondo. */
export function follow(k, T, out) {
  const err = aim(k, T, 9 + k.v * 0.3, 0);
  out.steer = clamp(-err * 2.2, -1, 1);
  out.accel = true;
  out.brake = false;
  out.drift = false;
  out.item = false;
  return out;
}

/** Decide las entradas de un bot para este paso. */
export function think(k, T, R, out) {
  const B = k.brain;
  const P = k.P;
  const n = T.n;
  const step = T.step;
  const dt = R.dt;
  const v = Math.max(0, k.v);
  out.steer = 0;
  out.accel = true;
  out.brake = false;
  out.drift = false;
  out.item = false;

  // ---------- qué viene: giro acumulado en ~1,25 s y curvatura máxima cercana
  const m1 = Math.max(5, Math.round((v * 1.25) / step));
  const near = 8 + v * 0.85;
  let turnAhead = 0;
  let kmax = 0;
  let soon = 0;
  for (let q = 2; q <= m1; q++) {
    const c = T.curv[(k.ti + q) % n];
    turnAhead += c * step;
    if (q * step < near) kmax = Math.max(kmax, Math.abs(c));
    if (q * step < 4 + v * 0.45) soon += c * step;
  }

  // ---------- por dónde: línea ideal + carril propio + lo que haya para juntar o esquivar
  const look = 7 + v * 0.42;
  const iL = (k.ti + Math.round(look / step)) % n;
  const hw = T.hw[iL];
  let want = T.line[iL] * B.lineK + B.lane * (hw - 2.4) * (1 - 0.6 * Math.min(1, Math.abs(T.line[iL]) / Math.max(1, hw - 2.4))) + Math.sin(R.t * 0.7 + B.wob) * B.wobAmp * hw;

  // cajas: si no tengo nada, voy a la más cercana a mi carril
  if (!k.item && k.rollT <= 0 && R.itemsOn) {
    let best = 1e9;
    for (const b of R.boxes) {
      if (b.t > 0) continue;
      const ds = wrapDelta(b.s - k.s, T.len);
      if (ds < 5 || ds > 48) continue;
      const cost = Math.abs(b.d - k.d) + ds * 0.02;
      if (cost < best) {
        best = cost;
        want = b.d;
      }
    }
  } else if (k.nuts < 10) {
    let best = 4;
    for (const q of R.nuts) {
      if (q.t > 0) continue;
      const ds = wrapDelta(q.s - k.s, T.len);
      if (ds < 4 || ds > 30) continue;
      const cost = Math.abs(q.d - want);
      if (cost < best) {
        best = cost;
        want = q.d;
      }
    }
  }
  // estorbos de la pista (se mueven: miro dónde van a estar cuando llegue)
  let hazD = 0;
  let hazR = 0;
  let hazS = 1e9;
  for (const o of R.obstacles) {
    if (o.downT > 0) continue;
    const ds = wrapDelta(o.s - k.s, T.len);
    if (ds < 1 || ds > 30 || ds > hazS) continue;
    const when = R.t + ds / Math.max(8, v);
    hazS = ds;
    hazD = o.d + o.amp * Math.sin((when / o.per) * Math.PI * 2 + o.ph);
    hazR = o.r + (o.amp ? 1.2 : 0.4);
  }
  for (const e of R.ents) {
    if (e.type !== 'aceite') continue;
    project2(k, T, e);
    if (e._ds < 1 || e._ds > 26 || e._ds > hazS) continue;
    hazS = e._ds;
    hazD = e._d;
    hazR = e.r;
  }
  if (k.invT <= 0 && hazS < 1e9 && Math.abs(hazD - want) < hazR + 1.9) {
    const room = hw - 1.7;
    let side = want >= hazD ? 1 : -1;
    if (hazD + side * (hazR + 2.1) > room || hazD + side * (hazR + 2.1) < -room) side = -side;
    want = hazD + side * (hazR + 2.1);
  }
  // el de adelante va más lento: lo paso por el costado con más lugar
  for (const o of R.karts) {
    if (o === k || o.fallT > 0) continue;
    const ds = wrapDelta(o.s - k.s, T.len);
    if (ds > 1.5 && ds < 9 && Math.abs(o.d - want) < 2.2 && o.v < v - 1.5) {
      want = o.d + (o.d > 0 ? -1 : 1) * 2.6;
      break;
    }
  }
  const lim = hw - 1.7;
  want = clamp(want, -lim, lim);
  B.want += (want - B.want) * Math.min(1, dt * 3.5);
  const err = aim(k, T, look, B.want);

  // ---------- derrape
  let steer = clamp(-err * 2.6, -1, 1);
  if (B.drifts) {
    if (!B.hold && !k.drift) {
      const sg = Math.sign(turnAhead);
      const ok = Math.abs(turnAhead) > 0.85 && Math.abs(soon) > 0.1 && Math.sign(soon) === sg && v > P.vmax * 0.6 && !k.air && !k.off && k.spinT <= 0 && Math.abs(k.d) < T.hw[k.ti] - 1.2 && (T.grip >= 1 || B.skill > 0.9);
      if (ok) {
        B.hold = true;
        B.holdT = 0;
        B.dir = sg;
      }
    }
    if (B.hold) {
      B.holdT += dt;
      out.drift = true;
      if (!k.drift) {
        steer = -B.dir; // doblando a fondo hasta que agarre el derrape
        if (B.holdT > 0.6) B.hold = false;
      } else {
        const wantRate = clamp(err * 3.4, -3, 3);
        const into = clamp(((wantRate * k.drift) / P.turn - 0.78) / 0.5, -1, 1);
        steer = -into * k.drift;
        let rest = 0;
        const m2 = Math.max(3, Math.round((v * 0.5) / step));
        for (let q = 1; q <= m2; q++) rest += T.curv[(k.ti + q) % n] * step;
        const edgeNear = Math.abs(k.d) > T.hw[k.ti] - 0.6;
        if (rest * k.drift < 0.07 || err * k.drift < -0.32 || k.off || (edgeNear && Math.sign(k.d) !== k.drift)) B.hold = false;
      }
      if (!B.hold) out.drift = false;
    }
  }
  out.steer = steer;

  // ---------- velocidad: ¿alcanza el giro para la curva que viene?
  const have = P.turn * (1 - 0.32 * clamp(v / P.vmax, 0, 1));
  const iceCap = T.grip < 1 ? (27 * P.ice) / Math.max(4, v) : 9;
  const can = Math.min(have, iceCap) * (k.drift ? 1.45 : 1);
  const need = kmax * v;
  if (need > can * 0.9) out.accel = false;
  if (need > can * 1.12 && v > 12) out.brake = true;
  if (Math.abs(err) > 1.15 && v > 9) out.accel = false;
  if (k.air && B.trick && k.rampAir && !k.trick && k.airT > 0.04 && k.airT < 0.3) out.drift = true; // pirueta en los saltos

  // ---------- destrabarse: si quedó parado contra algo, marcha atrás un momento
  if (R.t > 1 && v < 1.5 && k.spinT <= 0 && k.tumbleT <= 0 && k.fallT <= 0 && k.stallT <= 0) B.stuckT += dt;
  else B.stuckT = 0;
  if (B.stuckT > 1.1) {
    B.backT = 0.9;
    B.stuckT = 0;
  }
  if (B.backT > 0) {
    B.backT -= dt;
    out.accel = false;
    out.brake = true;
    out.steer = err > 0 ? 1 : -1;
    out.drift = false;
  }

  // ---------- ítems
  if (k.item !== B.had) {
    B.had = k.item;
    B.haveT = 0;
    B.itemT = 0.5 + B.rand() * (2.6 - B.skill * 1.2);
  }
  if (k.item && k.rollT <= 0 && !k.finished) {
    B.haveT += dt;
    B.itemT -= dt;
    if (B.itemT <= 0 && wantsToUse(k, T, R, B, kmax, out)) {
      out.item = true;
      B.itemT = 0.4 + B.rand() * 0.8;
    }
  }
  return out;
}

const tp = { i: 0, a: 0, d: 0 };
/** Posición de algo suelto respecto de mí: metros adelante por la pista y desvío lateral. */
function project2(k, T, e) {
  // se calcula una vez por trampa (no se mueven) y se guarda
  if (e._s === undefined) {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < T.n; i++) {
      const d = (e.x - T.x[i]) ** 2 + (e.z - T.z[i]) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    tp.i = best;
    e._s = best * T.step + (e.x - T.x[best]) * T.tx[best] + (e.z - T.z[best]) * T.tz[best];
    e._d = (e.x - T.x[best]) * T.nx[best] + (e.z - T.z[best]) * T.nz[best];
  }
  e._ds = wrapDelta(e._s - k.s, T.len);
}

function wantsToUse(k, T, R, B, kmax, out) {
  const late = B.haveT > 9;
  const ahead = k.rank > 1 ? R.order[k.rank - 2] : null;
  const behind = R.order[k.rank] || null;
  const gapA = ahead ? ahead.prog - k.prog : 1e9;
  const gapB = behind ? k.prog - behind.prog : 1e9;
  switch (k.item) {
    case 'sifon':
    case 'sifon3':
      return (kmax < 0.012 && k.boostT <= 0 && !k.air && k.spinT <= 0) || (k.off && k.v > 5) || late;
    case 'aji':
    case 'canita':
    case 'burbuja':
      return k.spinT <= 0 && k.fallT <= 0;
    case 'aceite':
      return gapB < 14 || late;
    case 'ruleman': {
      if (ahead && gapA < 32 && Math.abs(ahead.d - k.d) < 3 && kmax < 0.02) return true;
      if (behind && gapB < 12 && Math.abs(behind.d - k.d) < 2.5 && kmax < 0.02) {
        out.brake = true; // hacia atrás
        return true;
      }
      return late && kmax < 0.02;
    }
    case 'tero':
      return (ahead && gapA < 90) || late;
    case 'nube':
      return k.rank > 1;
    case 'iman':
      return (ahead && gapA < 50 && gapA > 6) || late;
    case 'bocina': {
      for (const o of R.karts) if (o !== k && o.fallT <= 0 && Math.hypot(o.x - k.x, o.z - k.z) < 8) return true;
      for (const e of R.ents) if (e.type !== 'aceite' && e.owner !== k.index && Math.hypot(e.x - k.x, e.z - k.z) < 10) return true;
      return B.haveT > 14;
    }
    default:
      return true;
  }
}
