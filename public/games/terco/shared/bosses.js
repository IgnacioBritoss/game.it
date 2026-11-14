/**
 * Terco — los cinco jefes, uno por zona. Cada uno se anota en BOSS (shared/sim.js) con init/step/hit/shot y es
 * puro y determinista: ninguna tirada al azar, todo sale del reloj de la pantalla (S.t) y del contador del jefe.
 * Se pelea a piedrazos (las piedritas de la mula): cada impacto en el punto débil le saca un punto de vida.
 * Las fases cambian a 2/3 y 1/3 de la vida: ataques más rápidos y alguno nuevo.
 */
import { BOSS, addBullet, addFx } from './sim.js';

export const BOSS_NAMES = {
  condor: { es: 'El Cóndor', en: 'The Condor' },
  topo: { es: 'El Topo', en: 'The Mole' },
  flamenco: { es: 'El Flamenco', en: 'The Flamingo' },
  culebra: { es: 'La Culebra', en: 'The Serpent' },
  tormenta: { es: 'La Tormenta', en: 'The Storm' },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** Número entre 0 y 1 que sale solo de `n` (siempre el mismo). */
export function hash(n) {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const touches = (r, x0, y0, x1, y1) => x1 > r[0] && x0 < r[2] && y1 > r[1] && y0 < r[3];

function hurt(S, b) {
  b.hp--;
  b.flash = 6;
  addFx(S, 'bosshit', b.x, b.y);
  if (b.hp > 0) return;
  b.dead = true;
  b.hp = 0;
  b.dieT = 0;
  S.sig |= S.R.ents[b.ent].bit;
  S.bullets.length = 0;
  addFx(S, 'bossdie', b.x, b.y);
}

function define(kind, spec) {
  BOSS[kind] = {
    weak: spec.weak, // para el piloto de pruebas (tools/terco/boss-bot.mjs)
    deadly: spec.deadly,
    init(S, d) {
      return { kind, on: false, dead: false, hp: spec.hp, max: spec.hp, t: 0, x: d.x, y: d.y, flash: 0, dieT: 0, ph: 0, ...spec.init(S, d) };
    },
    step(S) {
      const b = S.boss, d = S.R.ents[b.ent];
      if (b.flash > 0) b.flash--;
      if (b.dead) {
        b.dieT++;
        if (b.dieT % 8 === 1 && b.dieT < 80) addFx(S, 'boom', b.x + (hash(b.dieT) - 0.5) * 3, b.y + (hash(b.dieT + 9) - 0.5) * 2);
        return;
      }
      if (!b.on) {
        if (S.sig & d.go && !S.h.dead) {
          b.on = true;
          b.t = 0;
          addFx(S, 'warn', b.x, b.y);
        } else {
          spec.idle(S, b);
          return;
        }
      }
      b.t++;
      const f = b.hp / b.max;
      b.ph = f > 0.66 ? 0 : f > 0.33 ? 1 : 2;
      spec.step(S, b);
      // las gotas y rayos que quedaron pendientes los resuelve cada jefe en su step
    },
    hit(S, x0, y0, x1, y1) {
      const b = S.boss;
      if (!b.on || b.dead) return null;
      for (const r of spec.deadly(b)) if (touches(r, x0, y0, x1, y1)) return r[4] || 'boss';
      return null;
    },
    shot(S, x, y, lo, hi) {
      const b = S.boss;
      if (!b.on || b.dead) return false;
      for (const r of spec.weak(b)) {
        if (hi > r[0] && lo < r[2] && y > r[1] && y < r[3]) {
          hurt(S, b);
          return true;
        }
      }
      for (const r of spec.solid?.(b) || []) {
        if (hi > r[0] && lo < r[2] && y > r[1] && y < r[3]) {
          addFx(S, 'tick', x, y);
          return true;
        }
      }
      return false;
    },
  };
}

/** Cosas que caen del techo con aviso: [{x, t}] → cuando t llega a 0 sale la bala. */
function drops(S, b, skin = 'roca', r = 0.32) {
  for (let i = b.drops.length - 1; i >= 0; i--) {
    const dr = b.drops[i];
    if (dr.t % 9 === 0) addFx(S, 'puff', dr.x, 1.2);
    if (--dr.t <= 0) {
      addBullet(S, dr.x, 1.3, 0, 0.05, r, 0.0125, 220, skin);
      b.drops.splice(i, 1);
    }
  }
}

// ================================================================ El Cóndor (quebrada)
// Vuela de un lado a otro soltando plumas; marca una columna, se tira en picada, aterriza y es el momento de
// pegarle: desde el piso mientras está parado, o desde las cornisas altas mientras vuela.
define('condor', {
  hp: 24,
  init: () => ({ mode: 'hover', mt: 0, tx: 16, vy: 0, face: 1, atk: 0, sy: 9, sdir: 1 }),
  idle(S, b) {
    b.x = 16 + Math.sin(S.t / 60) * 0.5;
    b.y = 3.4 + Math.sin(S.t / 33) * 0.15;
  },
  step(S, b) {
    const ph = b.ph;
    const HOV = 5.2, GROUND = 12.0;
    if (b.mode === 'hover') {
      const target = 16 + 10.5 * Math.sin(b.t / [70, 56, 46][ph]);
      b.face = target >= b.x ? 1 : -1;
      b.x += clamp(target - b.x, -0.24, 0.24);
      b.y += (HOV + Math.sin(b.t / 17) * 0.25 - b.y) * 0.1;
      if (b.mt > 12 && b.mt % [50, 42, 36][ph] === 0) {
        const n = [1, 2, 3][ph];
        for (let i = 0; i < n; i++) {
          const o = i - (n - 1) / 2;
          addBullet(S, b.x + o * 1.4, b.y + 0.7, o * 0.025, 0.06, 0.2, 0.0006, 400, 'pluma');
        }
      }
      if (++b.mt > [170, 140, 110][ph]) {
        b.atk++;
        b.mt = 0;
        addFx(S, 'warn', b.x, b.y);
        if (ph >= 1 && b.atk % 2 === 0) {
          // pasada rasante: cruza la pantalla entera a la altura de la mula
          b.mode = 'stele';
          b.sdir = S.h.x > 16 ? -1 : 1;
        } else b.mode = 'tele';
      }
    } else if (b.mode === 'tele') {
      const len = [50, 44, 38][ph];
      if (b.mt === 0) b.tx = S.h.x;
      if (b.mt < len - 18) b.x += clamp(b.tx - b.x, -0.4, 0.4); // los últimos pasos queda fija: la columna se ve
      b.y += (3.6 - b.y) * 0.1;
      if (++b.mt > len) {
        b.mode = 'dive';
        b.mt = 0;
        b.vy = 0.1;
      }
    } else if (b.mode === 'stele') {
      const len = [0, 58, 48][ph];
      if (b.mt < len - 20) b.sy = clamp(S.h.y - 0.5, 5.5, 12.6);
      b.y += (-3 - b.y) * 0.15;
      if (++b.mt > len) {
        b.mode = 'swoop';
        b.mt = 0;
        b.x = b.sdir > 0 ? -3.5 : 35.5;
        b.y = b.sy;
        b.face = b.sdir;
      }
    } else if (b.mode === 'swoop') {
      b.x += b.sdir * [0, 0.38, 0.44][ph];
      b.y = b.sy + Math.sin(b.mt / 6) * 0.15;
      if (++b.mt > 400 || b.x < -4 || b.x > 36) {
        b.mode = 'hover';
        b.mt = 0;
        b.x = 16;
        b.y = -3;
      }
    } else if (b.mode === 'dive') {
      b.vy = Math.min(b.vy + 0.045, [0.36, 0.42, 0.48][ph]);
      b.y += b.vy;
      if (b.y >= GROUND) {
        b.y = GROUND;
        b.mode = 'ground';
        b.mt = 0;
        addFx(S, 'thud', b.x, 13);
        // dos ondas rastreras que corren por el piso: se saltan
        addBullet(S, b.x - 1.7, 12.7, -(0.15 + ph * 0.02), 0, 0.3, 0, 260, 'roca');
        addBullet(S, b.x + 1.7, 12.7, 0.15 + ph * 0.02, 0, 0.3, 0, 260, 'roca');
      }
    } else if (b.mode === 'ground') {
      if (++b.mt > [150, 124, 100][ph]) {
        b.mode = 'rise';
        b.mt = 0;
      }
    } else if (b.mode === 'rise') {
      b.y -= 0.15;
      if (b.y <= HOV) {
        b.y = HOV;
        b.mode = 'hover';
        b.mt = 0;
      }
    }
  },
  deadly: (b) => [[b.x - 1.25, b.y - 0.75, b.x + 1.25, b.y + 0.8, 'condor']],
  weak: (b) => [[b.x - 1.7, b.y - 1.1, b.x + 1.7, b.y + 1.1]],
});

// ================================================================ El Topo (mina)
// Sale de cuatro cuevas del piso en un orden fijo: tiembla el piso, aparece, tira piedras en arco y vuelve a
// meterse. En la segunda fase caen estalactitas del techo (con aviso de polvo).
define('topo', {
  hp: 24,
  init: (S, d) => ({ holes: d.src.holes || [5, 12, 20, 27], seq: 0, mode: 'under', mt: 0, hole: 0, up: 0, drops: [], since: 0 }),
  idle(S, b) {
    b.x = 16;
    b.y = 20;
  },
  step(S, b) {
    const ph = b.ph, FLOOR = 13;
    const SEQ = [1, 3, 0, 2, 2, 0, 3, 1];
    if (b.mode === 'under') {
      b.y = FLOOR + 3.2;
      b.up = 0;
      if (b.mt === 0) {
        b.hole = SEQ[b.seq++ % SEQ.length] % b.holes.length;
        b.x = b.holes[b.hole] + 0.5;
      }
      if (++b.mt > [46, 36, 26][ph]) {
        b.mode = 'tele';
        b.mt = 0;
      }
    } else if (b.mode === 'tele') {
      if (b.mt % 9 === 0) addFx(S, 'puff', b.x + (b.mt % 18 ? -0.7 : 0.7), FLOOR);
      if (b.mt % 24 === 0) addFx(S, 'warn', b.x, FLOOR);
      if (++b.mt > 42) {
        b.mode = 'up';
        b.mt = 0;
        addFx(S, 'thud', b.x, FLOOR);
      }
    } else if (b.mode === 'up') {
      b.up = Math.min(1, b.up + 1 / 14);
      b.y = FLOOR + 3.2 * (1 - b.up);
      if (b.up >= 1) {
        b.mode = 'out';
        b.mt = 0;
      }
    } else if (b.mode === 'out') {
      b.y = FLOOR;
      if ([[22, 62], [18, 48, 78], [14, 38, 62, 86]][ph].includes(b.mt)) {
        const x0 = b.x, y0 = b.y - 2.4, T = 46, g = 0.0085;
        const tx = clamp(S.h.x + (S.h.face || 1) * 0.6, 1.5, 30.5), ty = S.h.y - 0.4;
        addBullet(S, x0, y0, (tx - x0) / T, (ty - y0) / T - 0.5 * g * T, 0.36, g, 160, 'roca');
      }
      if (++b.mt > [112, 96, 100][ph]) {
        b.mode = 'down';
        b.mt = 0;
      }
    } else if (b.mode === 'down') {
      b.up = Math.max(0, b.up - 1 / 14);
      b.y = FLOOR + 3.2 * (1 - b.up);
      if (b.up <= 0) {
        b.mode = 'under';
        b.mt = 0;
      }
    }
    if (ph >= 1 && ++b.since >= [999, 78, 56][ph]) {
      b.since = 0;
      b.drops.push({ x: 3 + Math.floor(hash(S.t) * 26) + 0.5, t: 30 });
    }
    drops(S, b);
  },
  deadly: (b) => (b.up > 0.12 ? [[b.x - 1.15, b.y - 2.8, b.x + 1.15, b.y, 'topo']] : []),
  weak: (b) => (b.mode === 'out' ? [[b.x - 1.05, b.y - 2.8, b.x + 1.05, b.y + 0.05]] : []),
  solid: (b) => (b.up > 0.12 && b.mode !== 'out' ? [[b.x - 1.15, b.y - 2.8, b.x + 1.15, b.y]] : []),
});

// ================================================================ El Flamenco (salar)
// Se mece en un costado: dispara salvas de sal apuntadas, manda olas de sal a ras del piso y, de a poco, hace
// llover cristales. La cabeza sube y baja: hay que pegarle desde las plataformas, cuando pasa a la altura justa.
define('flamenco', {
  hp: 20,
  init: () => ({ hx: 23, hy: 8, drops: [], since: 0 }),
  idle(S, b) {
    b.x = 25.5;
    b.y = 13;
    b.hx = 24;
    b.hy = 7.5;
  },
  step(S, b) {
    const ph = b.ph;
    b.x = 25.5 + Math.sin(b.t / 110) * 2.2;
    b.y = 13;
    const w = [44, 36, 30][ph];
    b.hy = 8.0 + Math.sin(b.t / w) * 1.9;
    b.hx = b.x - 1.5 - Math.cos(b.t / w) * 0.6;
    if (b.t % [120, 100, 84][ph] === 40) {
      const n = [2, 3, 3][ph];
      const base = Math.atan2(S.h.y - 0.6 - b.hy, S.h.x - b.hx);
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.2;
        addBullet(S, b.hx, b.hy, Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0.2, 0, 260, 'sal');
      }
      addFx(S, 'pew', b.hx, b.hy);
    }
    const per = [220, 190, 170][ph];
    if (b.t % per === 130 || (ph >= 1 && b.t % per === 130 + 34)) {
      addBullet(S, b.x - 1.9, 12.7, -0.16, 0, 0.3, 0, 300, 'sal');
      addFx(S, 'thud', b.x - 1.9, 13);
    }
    if (ph >= 1 && ++b.since >= [999, 90, 64][ph]) {
      b.since = 0;
      b.drops.push({ x: 2 + Math.floor(hash(S.t * 3) * 20) + 0.5, t: 30 });
    }
    drops(S, b, 'sal', 0.3);
  },
  deadly: (b) => [
    [b.x - 1.5, 9.4, b.x + 1.5, 13.2, 'flamenco'],
    [b.hx - 0.75, b.hy - 0.7, b.hx + 0.75, b.hy + 0.7, 'flamenco'],
    [Math.min(b.hx, b.x) - 0.3, Math.min(b.hy, 9.4) - 0.2, Math.max(b.hx, b.x) + 0.3, 9.7, 'flamenco'],
  ],
  weak: (b) => [[b.hx - 1.0, b.hy - 1.0, b.hx + 1.0, b.hy + 1.0]],
  solid: (b) => [[b.x - 1.5, 9.4, b.x + 1.5, 13.2]],
});

// ================================================================ La Culebra (volcán)
// Una serpiente de fuego cruza la pantalla de lado a lado a distintas alturas (un aviso marca por dónde entra),
// escupiendo bolas de fuego. Solo la cabeza se puede lastimar y el cuerpo, corto, quema. Se le pega desde el nivel
// por el que va a pasar y se esquiva saltando o cambiando de nivel: islas abajo, plataformas arriba.
const PASSES = [[9.4, 0.6, 0.5], [12.0, 0.5, 0.5], [7.2, 0.8, 0.5], [10.6, 0.7, 0.45], [12.0, 0.5, 0.5], [8.4, 0.7, 0.5]];
const SEGS = 7, GAP = 5;
function culebraPass(b) {
  const [y0, amp, k] = PASSES[b.pass % PASSES.length];
  b.dir = b.pass % 2 ? -1 : 1;
  b.y0 = y0;
  b.amp = amp;
  b.k = k;
}
define('culebra', {
  hp: 22,
  init: () => {
    const b = { hist: [], seg: [], hx: -6, hy: 6, dir: 1, wait: 70, p: -1, pass: 0, y0: 9.4, amp: 0.6, k: 0.5, sp: 0.15, shoot: 0 };
    culebraPass(b);
    return b;
  },
  idle(S, b) {
    b.hx = -8;
    b.hy = 6;
    b.x = -8;
    b.y = 6;
  },
  step(S, b) {
    const ph = b.ph;
    if (b.p < 0) {
      if (--b.wait > 0) return;
      b.sp = [0.15, 0.18, 0.21][ph];
      b.p = 0;
      b.hist.length = 0;
      b.shoot = 30;
    }
    b.p++;
    b.hx = b.dir > 0 ? -3 + b.sp * b.p : 35 - b.sp * b.p;
    b.hy = b.y0 + b.amp * Math.sin(b.hx * b.k + b.pass * 1.3);
    b.x = b.hx;
    b.y = b.hy;
    b.hist.push([b.hx, b.hy]);
    if (b.hist.length > SEGS * GAP + 2) b.hist.shift();
    b.seg.length = 0;
    for (let i = 1; i < SEGS; i++) {
      const j = b.hist.length - 1 - i * GAP;
      if (j >= 0) b.seg.push(b.hist[j]);
    }
    if (b.hx > 1 && b.hx < 31 && --b.shoot <= 0) {
      b.shoot = [84, 66, 54][ph];
      const a = Math.atan2(S.h.y - 0.5 - b.hy, S.h.x - b.hx);
      const n = ph >= 2 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const aa = a + (i - (n - 1) / 2) * 0.3;
        addBullet(S, b.hx, b.hy, Math.cos(aa) * 0.17, Math.sin(aa) * 0.17, 0.24, 0, 220, 'fuego');
      }
      addFx(S, 'pew', b.hx, b.hy);
    }
    const off = b.dir > 0 ? b.hx - SEGS * GAP * b.sp > 33 : b.hx + SEGS * GAP * b.sp < -1;
    if (off) {
      b.p = -1;
      b.wait = [80, 64, 50][ph];
      b.pass++;
      b.seg.length = 0;
      culebraPass(b);
    }
  },
  deadly: (b) => [[b.hx - 0.7, b.hy - 0.7, b.hx + 0.7, b.hy + 0.7, 'culebra'], ...b.seg.map((s) => [s[0] - 0.52, s[1] - 0.52, s[0] + 0.52, s[1] + 0.52, 'culebra'])],
  weak: (b) => [[b.hx - 0.95, b.hy - 0.95, b.hx + 0.95, b.hy + 0.95]],
  solid: (b) => b.seg.map((s) => [s[0] - 0.55, s[1] - 0.55, s[0] + 0.55, s[1] + 0.55]),
});

// ================================================================ La Tormenta (cumbre)
// Una nube enorme que sube y baja cruzando la cima. Marca columnas donde va a caer un rayo, tira granizo en
// abanico y, ya enojada, cae por dos lados a la vez. Hay que subirse a las cornisas (o a las corrientes de aire)
// para pegarle cuando baja.
define('tormenta', {
  hp: 26,
  init: () => ({ bolts: [] }),
  idle(S, b) {
    b.x = 16;
    b.y = 3.4;
  },
  step(S, b) {
    const ph = b.ph;
    b.x = 16 + Math.sin(b.t / [95, 80, 66][ph]) * 11;
    b.y = 5.2 + Math.sin(b.t / [60, 50, 42][ph] + 1) * 1.5;
    const per = [150, 124, 100][ph];
    const bolt = (x) => {
      b.bolts.push({ x: clamp(x, 1.5, 30.5), t: 64 });
      addFx(S, 'warn', x, 8);
    };
    if (b.t % per === 30) bolt(S.h.x);
    if (ph >= 1 && b.t % per === 30 + (per >> 1)) bolt(S.h.x + (hash(b.t) < 0.5 ? -5.5 : 5.5));
    if (ph >= 2 && b.t % per === 30 + (per >> 2)) bolt(S.h.x + (hash(b.t + 7) < 0.5 ? -9 : 9));
    for (let i = b.bolts.length - 1; i >= 0; i--) {
      const o = b.bolts[i];
      if (o.t === 20) addFx(S, 'boom', o.x, 12);
      if (--o.t <= 0) b.bolts.splice(i, 1);
    }
    if (b.t % [110, 92, 76][ph] === 70) {
      const n = [3, 5, 5][ph];
      for (let i = 0; i < n; i++) {
        const a = (i - (n - 1) / 2) * 0.34;
        addBullet(S, b.x, b.y + 1, Math.sin(a) * 0.11, Math.cos(a) * 0.11, 0.2, 0.0005, 300, 'hielo');
      }
      addFx(S, 'pew', b.x, b.y);
    }
  },
  deadly: (b) => [[b.x - 2.0, b.y - 0.9, b.x + 2.0, b.y + 1.0, 'tormenta'], ...b.bolts.filter((o) => o.t <= 20).map((o) => [o.x - 0.6, 0, o.x + 0.6, 13.6, 'rayo'])],
  weak: (b) => [[b.x - 2.3, b.y - 1.1, b.x + 2.3, b.y + 1.3]],
});
