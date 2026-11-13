/**
 * Tuercas — ítems de las cajas sorpresa. Todos inventados para este juego:
 *   sifón (empujón), aceite (trampa), rulemán (bola que rebota), tero (persigue al de adelante), nubarrón (va por el
 *   puntero), burbuja (escudo), bocinazo (onda expansiva), imán (remolque + roba tuercas), ají (invencible) y cañita
 *   voladora (piloto automático a toda velocidad).
 * La ruleta reparte según el puesto: adelante salen defensas, atrás salen los que ayudan a remontar.
 * Lógica pura: la usa race.js (navegador y pruebas).
 */
import { clamp, wrapAngle, wrapDelta, mod, weighted, lerp } from './util.js';
import { project, groundAt, pointAt, FALL } from './track.js';
import { hitKart, addBoost, MAX_NUTS } from './kart.js';

/* prettier-ignore */
export const ITEMS = {
  sifon:   { uses: 1, name: { es: 'Sifón', en: 'Soda siphon' },        tip: { es: 'Un chorro de soda que te empuja, incluso sobre el pasto.', en: 'A blast of soda that pushes you forward, even on grass.' } },
  sifon3:  { uses: 3, name: { es: 'Sifón triple', en: 'Triple siphon' }, tip: { es: 'Tres chorros para usar cuando quieras.', en: 'Three blasts to use whenever you like.' } },
  aceite:  { uses: 1, name: { es: 'Aceite', en: 'Oil slick' },          tip: { es: 'Una mancha que queda atrás tuyo: el que la pisa, patina.', en: 'A slick left behind you: whoever drives over it slips.' } },
  ruleman: { uses: 1, name: { es: 'Rulemán', en: 'Ball bearing' },      tip: { es: 'Una bola de acero que sale derecho y rebota en las vallas. Frenando, sale hacia atrás.', en: 'A steel ball that shoots straight and bounces off walls. Hold brake to fire it backwards.' } },
  tero:    { uses: 1, name: { es: 'Tero', en: 'Lapwing' },              tip: { es: 'Un tero enojado que persigue al que va adelante tuyo.', en: 'An angry lapwing that chases the racer ahead of you.' } },
  nube:    { uses: 1, name: { es: 'Nubarrón', en: 'Storm cloud' },      tip: { es: 'Vuela hasta el puntero y le descarga la tormenta.', en: 'Flies to the leader and unloads a storm on them.' } },
  burbuja: { uses: 1, name: { es: 'Burbuja', en: 'Bubble' },            tip: { es: 'Te cubre un rato y aguanta un golpe.', en: 'Covers you for a while and soaks up one hit.' } },
  bocina:  { uses: 1, name: { es: 'Bocinazo', en: 'Big honk' },         tip: { es: 'Hace girar a los que tengas cerca y rompe lo que venga volando.', en: 'Spins everyone nearby and breaks anything flying at you.' } },
  iman:    { uses: 1, name: { es: 'Imán', en: 'Magnet' },               tip: { es: 'Te remolca hacia el de adelante y le saca dos tuercas.', en: 'Tows you toward the racer ahead and grabs two of their nuts.' } },
  aji:     { uses: 1, name: { es: 'Ají', en: 'Chili' },                 tip: { es: 'Unos segundos de pura furia: más rápido e invencible.', en: 'A few seconds of pure fury: faster and invincible.' } },
  canita:  { uses: 1, name: { es: 'Cañita voladora', en: 'Skyrocket' }, tip: { es: 'Te lleva volando por la pista y se lleva puesto al que se cruce.', en: 'Rockets you along the track, knocking away anyone in the way.' } },
};
export const ITEM_IDS = Object.keys(ITEMS);
export const ROLL_TIME = 1.6;

// peso de cada ítem según el puesto: [puntero, …, último]
/* prettier-ignore */
const TABLE = {
  sifon:   [ 8, 22, 18,  8],
  sifon3:  [ 0,  3, 12, 16],
  aceite:  [34, 16,  6,  0],
  ruleman: [22, 20, 10,  2],
  tero:    [ 0, 16, 16,  8],
  burbuja: [24, 10,  5,  2],
  bocina:  [12,  6,  4,  0],
  iman:    [ 0,  5, 12, 12],
  aji:     [ 0,  0,  8, 20],
  nube:    [ 0,  2,  7, 10],
  canita:  [ 0,  0,  2, 22],
};

/** Pesos de la ruleta para un puesto `rank` (1 = puntero) entre `n` corredores. */
export function itemWeights(rank, n) {
  const u = n > 1 ? clamp((rank - 1) / (n - 1), 0, 1) * 3 : 1.5;
  const i = Math.min(2, Math.floor(u));
  const W = {};
  for (const id in TABLE) W[id] = lerp(TABLE[id][i], TABLE[id][i + 1], u - i);
  return W;
}

/** Qué sale de la caja para este corredor, ahora. */
export function rollItem(R, k) {
  const W = itemWeights(k.rank, R.karts.length);
  const leader = R.order[0];
  const gap = leader ? leader.prog - k.prog : 0;
  if (k.rank === 1) W.nube = W.tero = W.iman = W.canita = 0;
  if (R.t < 8) W.nube = W.canita = W.aji = 0;
  if (R.ents.some((e) => e.type === 'nube')) W.nube = 0;
  if (gap < 55) W.canita = 0;
  if (gap < 25) W.nube *= 0.3;
  return weighted(W, R.rand());
}

const tmp = { i: 0, a: 0, d: 0 };

/** El corredor usa lo que tiene. */
export function useItem(R, k, inp) {
  const id = k.item;
  if (!id) return;
  const ev = R.ev;
  const fx = Math.sin(k.yaw);
  const fz = Math.cos(k.yaw);
  switch (id) {
    case 'sifon':
    case 'sifon3':
      addBoost(k, 1.45, 1.36, true, 'sifon');
      ev('boost', k, 'sifon', 1);
      break;
    case 'aji':
      k.invT = 7;
      k.spinT = 0;
      break;
    case 'burbuja':
      k.shieldT = 14;
      break;
    case 'canita': {
      const gap = R.order[0] ? R.order[0].prog - k.prog : 0;
      k.autoT = clamp(2.4 + gap / 70, 2.6, 4.4);
      k.spinT = k.tumbleT = 0;
      k.drift = 0;
      k.pend = false;
      break;
    }
    case 'bocina':
      honk(R, k);
      break;
    case 'iman': {
      const tk = k.rank > 1 ? R.order[k.rank - 2] : null;
      if (tk && tk.prog - k.prog < 55 && !tk.finished) {
        k.towT = 2.4;
        k.towTarget = tk.index;
        const got = Math.min(2, tk.nuts, MAX_NUTS - k.nuts);
        if (got > 0) {
          tk.nuts -= got;
          k.nuts += got;
          ev('steal', k, tk, got);
        }
      } else {
        addBoost(k, 0.7, 1.25, true, 'sifon');
        ev('boost', k, 'sifon', 1);
      }
      break;
    }
    case 'aceite':
      R.ents.push({ type: 'aceite', id: R.entSeq++, x: k.x - fx * 2.6, z: k.z - fz * 2.6, y: k.gy, r: 1.75, life: 50, arm: 0.5, owner: k.index, yaw: k.yaw });
      break;
    case 'ruleman': {
      const back = !!inp.brake;
      const s = back ? -1 : 1;
      R.ents.push({ type: 'ruleman', id: R.entSeq++, x: k.x + fx * 2.3 * s, z: k.z + fz * 2.3 * s, y: k.y + 0.6, dir: back ? wrapAngle(k.yaw + Math.PI) : k.yaw, v: back ? 26 : Math.max(40, k.v + 16), ti: k.ti, life: 9, bounces: 5, arm: 0.5, owner: k.index, spin: 0 });
      break;
    }
    case 'tero': {
      const tk = k.rank > 1 ? R.order[k.rank - 2] : null;
      R.ents.push({ type: 'tero', id: R.entSeq++, x: k.x + fx * 2, z: k.z + fz * 2, y: k.y + 1.5, yaw: k.yaw, s: k.s + 2, d: k.d, ti: k.ti, v: Math.max(38, k.v + 12), life: 14, owner: k.index, target: tk && !tk.finished ? tk.index : -1 });
      break;
    }
    case 'nube':
      R.ents.push({ type: 'nube', id: R.entSeq++, x: k.x, z: k.z, y: k.y + 6.5, prog: k.prog + 3, d: k.d, state: 'fly', t: 0, owner: k.index, target: -1, warned: false });
      break;
  }
  ev('use', k, id);
  if (--k.itemN <= 0) {
    k.item = null;
    k.itemN = 0;
  }
}

function honk(R, k) {
  const ev = R.ev;
  for (const o of R.karts) {
    if (o === k || o.fallT > 0) continue;
    if (Math.hypot(o.x - k.x, o.z - k.z) < 9.5 && Math.abs(o.y - k.y) < 4) hitKart(o, 'spin', ev, k.index);
  }
  for (const e of R.ents) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - k.x, e.z - k.z);
    if (d < (e.type === 'nube' ? 14 : 11)) {
      e.dead = true;
      ev('ent-pop', e, k);
    }
  }
}

/** Mueve todo lo que quedó suelto en la pista (trampas, bolas, teros, nubes) y resuelve a quién le pega. */
export function stepEnts(R, dt) {
  const T = R.T;
  const ev = R.ev;
  for (const e of R.ents) {
    if (e.dead) continue;
    if (e.type === 'aceite') {
      e.life -= dt;
      e.arm -= dt;
      if (e.life <= 0) {
        e.dead = true;
        continue;
      }
      for (const k of R.karts) {
        if (k.fallT > 0 || k.air || (k.index === e.owner && e.arm > 0)) continue;
        if (Math.hypot(k.x - e.x, k.z - e.z) < e.r + 0.35 && Math.abs(k.y - e.y) < 1.5) {
          e.dead = true;
          if (k.invT > 0 || k.autoT > 0) ev('ent-pop', e, k);
          else {
            hitKart(k, 'slip', ev, e.owner);
            ev('ent-hit', e, k);
          }
          break;
        }
      }
    } else if (e.type === 'ruleman') {
      e.life -= dt;
      e.arm -= dt;
      e.spin += e.v * dt;
      e.x += Math.sin(e.dir) * e.v * dt;
      e.z += Math.cos(e.dir) * e.v * dt;
      project(T, e.x, e.z, e.ti, tmp);
      e.ti = tmp.i;
      const i = tmp.i;
      const side = tmp.d > 0 ? 1 : -1;
      const lim = T.hw[i] + (side > 0 ? T.mL[i] : T.mR[i]) - 0.6;
      if (side * tmp.d > lim) {
        if ((side > 0 ? T.eL[i] : T.eR[i]) === FALL) {
          e.dead = true;
          ev('ent-gone', e);
          continue;
        }
        const nx = T.nx[i] * side;
        const nz = T.nz[i] * side;
        const over = side * tmp.d - lim;
        e.x -= nx * over;
        e.z -= nz * over;
        let vx = Math.sin(e.dir);
        let vz = Math.cos(e.dir);
        const vn = vx * nx + vz * nz;
        if (vn > 0) {
          vx -= 2 * vn * nx;
          vz -= 2 * vn * nz;
          e.dir = Math.atan2(vx, vz);
          e.bounces--;
          ev('ent-bounce', e);
        }
      }
      e.y = groundAt(T, tmp.i, tmp.a, tmp.d) + 0.6;
      if (e.life <= 0 || e.bounces < 0) {
        e.dead = true;
        ev('ent-gone', e);
        continue;
      }
      for (const k of R.karts) {
        if (k.fallT > 0 || (k.index === e.owner && e.arm > 0)) continue;
        if (Math.hypot(k.x - e.x, k.z - e.z) < 1.15 + k.P.radius && Math.abs(k.y + 0.6 - e.y) < 1.8) {
          e.dead = true;
          hitKart(k, 'spin', ev, e.owner);
          ev('ent-hit', e, k);
          break;
        }
      }
      if (!e.dead) {
        for (const o of R.ents) {
          if (o.dead || o.type !== 'aceite') continue;
          if (Math.hypot(o.x - e.x, o.z - e.z) < o.r) {
            o.dead = e.dead = true;
            ev('ent-pop', o, null);
            ev('ent-gone', e);
            break;
          }
        }
      }
    } else if (e.type === 'tero') {
      e.life -= dt;
      let tk = e.target >= 0 ? R.karts[e.target] : null;
      if (tk && (tk.finished || tk.fallT > 0)) {
        tk = null;
        e.target = -1;
      }
      let direct = false;
      if (tk) {
        const dist = Math.hypot(tk.x - e.x, tk.z - e.z);
        if (dist < 15) {
          direct = true;
          const q = Math.min(1, (e.v * dt) / Math.max(0.01, dist));
          e.yaw = Math.atan2(tk.x - e.x, tk.z - e.z);
          e.x += (tk.x - e.x) * q;
          e.z += (tk.z - e.z) * q;
          project(T, e.x, e.z, e.ti, tmp);
          e.ti = tmp.i;
          e.s = mod(tmp.i * T.step + tmp.a, T.len);
          e.d = tmp.d;
          e.y += (tk.y + 1.1 - e.y) * Math.min(1, dt * 8);
        }
      }
      if (!direct) {
        e.s = mod(e.s + e.v * dt, T.len);
        const wantD = tk ? tk.d : 0;
        e.d += clamp(wantD - e.d, -6 * dt, 6 * dt);
        const P = pointAt(T, e.s, e.d);
        e.x = P.x;
        e.z = P.z;
        e.yaw = P.yaw;
        e.ti = P.i;
        e.y += (P.y + 1.6 - e.y) * Math.min(1, dt * 6);
      }
      if (e.life <= 0) {
        e.dead = true;
        ev('ent-gone', e);
        continue;
      }
      for (const k of R.karts) {
        if (k.index === e.owner || k.fallT > 0) continue;
        if (Math.hypot(k.x - e.x, k.z - e.z) < 1.3 + k.P.radius && Math.abs(k.y + 1 - e.y) < 2.4) {
          e.dead = true;
          hitKart(k, 'spin', ev, e.owner);
          ev('ent-hit', e, k);
          break;
        }
      }
    } else if (e.type === 'nube') {
      const L = R.order.find((k) => !k.finished) || null;
      if (!L || L.index === e.owner) {
        // el que la tiró pasó a la punta (o ya no hay a quién): se deshace
        e.dead = true;
        ev('ent-gone', e);
        continue;
      }
      e.target = L.index;
      if (e.state === 'fly') {
        e.prog += 58 * dt;
        const gap = L.prog - e.prog;
        if (gap < 95 && !e.warned) {
          e.warned = true;
          ev('nube-warn', L);
        }
        e.d += clamp(L.d - e.d, -8 * dt, 8 * dt);
        const P = pointAt(T, mod(e.prog, T.len), e.d);
        e.x = P.x;
        e.z = P.z;
        e.y += (P.y + 6.5 - e.y) * Math.min(1, dt * 5);
        if (gap < 5) {
          e.state = 'hover';
          e.t = 0.95;
          ev('nube-over', L);
        }
      } else {
        const q = Math.min(1, dt * 9);
        e.x += (L.x - e.x) * q;
        e.z += (L.z - e.z) * q;
        e.y += (L.y + 5 - e.y) * q;
        e.t -= dt;
        if (e.t <= 0) {
          e.dead = true;
          ev('nube-strike', e, L);
          hitKart(L, 'big', ev, e.owner);
          for (const k of R.karts) {
            if (k === L || k.index === e.owner || k.fallT > 0) continue;
            if (Math.hypot(k.x - L.x, k.z - L.z) < 5.5) hitKart(k, 'spin', ev, e.owner);
          }
        }
      }
    }
  }
  if (R.ents.some((e) => e.dead)) R.ents = R.ents.filter((e) => !e.dead);
}
