/**
 * Nébula — las reglas del pinball (puras): puntos, letras N-É-B-U-L-A, carriles de arriba (multiplicador de bonus),
 * agujero negro que larga misiones, las tres misiones (multibola, hipervelocidad y carrera estelar), combos, tiro de
 * habilidad, pelota salvada, bola extra, bonus de fin de pelota y TILT. Recibe los eventos de la física (physics.js)
 * y deja mensajes para el visor de puntos (`msgs`) y efectos (`fx`).
 */
import { LETTERS, HOLE } from './table.js';


/** Textos del visor (mayúsculas, sin acentos raros: el visor de puntos tiene su propia letra). */
export const MSG = {
  ball: { es: 'PELOTA {n}', en: 'BALL {n}' },
  launch: { es: 'LANZÁ CON ↓', en: 'LAUNCH WITH ↓' },
  ready: { es: 'AGUJERO NEGRO LISTO', en: 'BLACK HOLE IS LIT' },
  letter: { es: 'LETRA {l}', en: 'LETTER {l}' },
  bank: { es: 'BANCO COMPLETO', en: 'BANK COMPLETE' },
  jackpot: { es: 'JACKPOT', en: 'JACKPOT' },
  combo: { es: 'COMBO ×{n}', en: 'COMBO ×{n}' },
  comet: { es: 'COMETA', en: 'COMET' },
  orbit: { es: 'ÓRBITA', en: 'ORBIT' },
  skill: { es: 'TIRO PRECISO', en: 'SKILL SHOT' },
  bonusX: { es: 'BONUS ×{n}', en: 'BONUS ×{n}' },
  lanes: { es: 'CARRILES COMPLETOS', en: 'LANES COMPLETE' },
  hole: { es: 'AGUJERO NEGRO', en: 'BLACK HOLE' },
  lluvia: { es: 'LLUVIA DE COMETAS', en: 'COMET SHOWER' },
  lluviaSub: { es: 'MULTIBOLA · RAMPA = JACKPOT', en: 'MULTIBALL · RAMP = JACKPOT' },
  hiper: { es: 'HIPERVELOCIDAD', en: 'HYPERSPEED' },
  hiperSub: { es: 'TODO VALE ×3 · 30 S', en: 'EVERYTHING ×3 · 30 S' },
  carrera: { es: 'CARRERA ESTELAR', en: 'STAR RUSH' },
  carreraSub: { es: 'SEGUÍ LAS FLECHAS', en: 'FOLLOW THE ARROWS' },
  rush: { es: '+6 S · {p}', en: '+6 S · {p}' },
  rushN: { es: 'TIRO {n}', en: 'SHOT {n}' },
  done: { es: 'MISIÓN CUMPLIDA', en: 'MISSION COMPLETE' },
  supernova: { es: 'SUPERNOVA', en: 'SUPERNOVA' },
  plusExtra: { es: '{p} + BOLA EXTRA', en: '{p} + EXTRA BALL' },
  extra: { es: 'BOLA EXTRA', en: 'EXTRA BALL' },
  oneMore: { es: '¡UNA MÁS!', en: 'ONE MORE!' },
  shootAgain: { es: 'TIRÁ DE NUEVO', en: 'SHOOT AGAIN' },
  tilt: { es: 'TILT', en: 'TILT' },
  tiltSub: { es: 'SE ACABÓ ESTA PELOTA', en: 'THIS BALL IS OVER' },
  careful: { es: 'CUIDADO', en: 'WARNING' },
  carefulSub: { es: 'NO LA SACUDAS TANTO', en: 'EASY ON THE NUDGES' },
  saved: { es: 'PELOTA SALVADA', en: 'BALL SAVED' },
  relaunch: { es: 'LANZÁ DE NUEVO', en: 'LAUNCH AGAIN' },
  bonus: { es: 'BONUS {p}', en: 'BONUS {p}' },
  noBonus: { es: 'SIN BONUS', en: 'NO BONUS' },
  gameOver: { es: 'FIN DEL JUEGO', en: 'GAME OVER' },
};

export const BALLS = 3;
export const MISSIONS = ['lluvia', 'hiper', 'carrera'];
const SAVE_SECS = 12;
const COMBO_SECS = 4;
const RUSH_SHOTS = ['orbit', 'ramp', 'hole', 'targets'];

export class Rules {
  constructor(world, lang = 'es', rnd = Math.random) {
    this.w = world;
    this.lang = lang;
    this.rnd = rnd;
    this.score = 0;
    this.ball = 1;
    this.extra = 0;
    this.over = false;
    this.missionIdx = 0;
    this.missionsDone = 0;
    this.msgs = [];
    this.fx = [];
    this.stats = { bumpers: 0, ramps: 0, orbits: 0, jackpots: 0, missions: 0, letters: 0 };
    this.newBall(true);
  }

  // ------------------------------------------------------------ pelotas
  newBall(first = false) {
    this.lit = Object.fromEntries(LETTERS.map((l) => [l, false]));
    this.lanes = [false, false, false];
    this.bonusX = 1;
    this.holeLit = false;
    this.mission = null;
    this.tilt = 0;
    this.tilted = false;
    this.saveT = SAVE_SECS;
    this.saveArmed = false; // la pelota salvada empieza a correr cuando la pelota sale del lanzador
    this.skill = Math.floor(this.rnd() * 3);
    this.skillOn = true;
    this.combo = 0;
    this.comboT = 0;
    this.rampsBall = 0;
    this.orbitsBall = 0;
    this.bumpersBall = 0;
    this.lettersBall = 0;
    this.orbitT = -1;
    this.holdT = null;
    this.w.resetDrops();
    this.w.addBall();
    if (!first) this.msg({ big: this.T('ball', { n: this.ball }), small: this.T('launch'), dur: 2 });
  }

  /** Puntos con el multiplicador de la hipervelocidad. */
  add(n) {
    const m = this.mission?.kind === 'hiper' ? 3 : 1;
    this.score += n * m;
    return n * m;
  }

  msg(m) {
    this.msgs.push({ dur: 1.6, ...m });
  }

  T(k, v) {
    let s = (MSG[k] || {})[this.lang] ?? MSG[k]?.es ?? k;
    if (v) for (const x in v) s = s.replace(`{${x}}`, v[x]);
    return s;
  }

  // ------------------------------------------------------------ cada cuadro
  update(dt) {
    const w = this.w;
    if (this.saveArmed && this.saveT > 0) this.saveT -= dt;
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }
    this.tilt = Math.max(0, this.tilt - dt * 0.45);
    // agujero negro: espera un poco (más si larga una misión) y escupe
    for (const b of w.balls) if (b.held?.kind === 'hole' && b.held.t > (this.holdT ?? 1.1)) {
      w.kickHole(b);
      this.holdT = null;
      if (this.pendingBalls) {
        // multibola: las pelotas nuevas salen del agujero de a una
        this.pendingBalls--;
        const nb = w.addBall(HOLE.x + 18, HOLE.y + 10, 380, 260);
        nb.noHole = w.t + 0.8;
        if (this.pendingBalls) this.holdAgain = true;
      }
    }
    if (this.holdAgain && this.pendingBalls) {
      this.holdAgain = false;
      const nb = w.addBall(HOLE.x - 18, HOLE.y + 10, -380, 260);
      nb.noHole = w.t + 0.8;
      this.pendingBalls--;
    }
    // misiones con tiempo
    const M = this.mission;
    if (M && M.time != null) {
      M.time -= dt;
      if (M.time <= 0) this.endMission(false);
    }
  }

  // ------------------------------------------------------------ eventos de la física
  on(e) {
    if (this.over) return;
    const w = this.w;
    if (this.tilted && e.t !== 'drain') return;
    switch (e.t) {
      case 'bumper': {
        const p = this.add(1000);
        this.bumpersBall++;
        this.stats.bumpers++;
        this.fx.push({ k: 'bumper', id: e.id, pts: p, x: e.x, y: e.y });
        break;
      }
      case 'sling':
        this.add(110);
        this.fx.push({ k: 'sling', id: e.id });
        break;
      case 'target': {
        const L = e.id;
        if (!this.lit[L]) {
          this.lit[L] = true;
          this.lettersBall++;
          this.stats.letters++;
          this.add(e.kind === 'drop' ? 3000 : 2500);
          this.fx.push({ k: 'letter', id: L });
          if (LETTERS.every((l) => this.lit[l]) && !this.mission) {
            this.holeLit = true;
            this.msg({ big: 'NÉBULA', small: this.T('ready'), dur: 2.2, anim: 'flash' });
            this.fx.push({ k: 'lit' });
          } else this.msg({ big: this.word(), small: this.T('letter', { l: L === 'E' ? 'É' : L }), dur: 1.1 });
        } else this.add(500);
        // banco de caída completo
        if (['U', 'L', 'A'].every((l) => w.dropped.has(l))) {
          const p = this.add(25000);
          this.msg({ big: fmt(p), small: this.T('bank'), dur: 1.4 });
          setTimeoutish(this, 0.8, () => w.resetDrops());
          this.fx.push({ k: 'bank' });
        }
        if (this.mission?.kind === 'carrera' && this.mission.shot === 'targets') this.rushHit();
        break;
      }
      case 'spin':
        this.add(300 * e.n);
        this.fx.push({ k: 'spin', n: e.n });
        break;
      case 'sensor':
        this.sensor(e);
        break;
      case 'ramp':
        this.fx.push({ k: 'rampIn' });
        break;
      case 'rampDone': {
        this.rampsBall++;
        this.stats.ramps++;
        let p = this.add(25000 * this.comboUp());
        if (this.mission?.kind === 'lluvia') {
          p += this.add(250000);
          this.stats.jackpots++;
          this.msg({ big: this.T('jackpot'), small: fmt(p), dur: 1.8, anim: 'flash' });
          this.fx.push({ k: 'jackpot' });
        } else if (this.mission?.kind === 'carrera' && this.mission.shot === 'ramp') this.rushHit();
        else this.msg({ big: this.combo > 1 ? this.T('combo', { n: this.combo }) : this.T('comet'), small: fmt(p), dur: 1.2 });
        this.fx.push({ k: 'ramp', pts: p });
        break;
      }
      case 'hole':
        this.hole(e);
        break;
      case 'drain':
        this.drain();
        break;
      case 'flipUp':
        // los flippers corren las luces de los carriles de arriba
        if (this.lanes.some(Boolean) && !this.lanes.every(Boolean)) {
          const L = this.lanes;
          this.lanes = e.id === 'L' ? [L[1], L[2], L[0]] : [L[2], L[0], L[1]];
        }
        break;
    }
  }

  /** Una pelota más después del fin del juego (premio por mirar un anuncio). */
  continueGame() {
    if (!this.over || this.continued) return false;
    this.continued = true;
    this.over = false;
    this.msgs.length = 0;
    this.extra = 0;
    this.newBall();
    return true;
  }

  word() {
    return LETTERS.map((l) => (this.lit[l] ? (l === 'E' ? 'É' : l) : '·')).join('');
  }

  comboUp() {
    this.combo = this.comboT > 0 ? Math.min(5, this.combo + 1) : 1;
    this.comboT = COMBO_SECS;
    return this.combo;
  }

  sensor(e) {
    const id = e.id;
    if (id.startsWith('lane')) {
      const i = +id.slice(4);
      if (this.skillOn && e.vy > 0) {
        this.skillOn = false;
        if (i === this.skill) {
          const p = this.add(50000);
          this.msg({ big: this.T('skill'), small: fmt(p), dur: 1.6, anim: 'flash' });
          this.fx.push({ k: 'skill' });
        }
      }
      if (!this.lanes[i]) {
        this.lanes[i] = true;
        this.add(1500);
        this.fx.push({ k: 'lane', i });
        if (this.lanes.every(Boolean)) {
          this.lanes = [false, false, false];
          if (this.bonusX < 5) this.bonusX++;
          this.msg({ big: this.T('bonusX', { n: this.bonusX }), small: this.T('lanes'), dur: 1.4 });
          this.fx.push({ k: 'bonusX' });
        }
      } else this.add(300);
    } else if (id === 'orbitIn' && e.vy < -300) this.orbitT = this.w.t;
    else if (id === 'orbitTop' && this.orbitT >= 0 && this.w.t - this.orbitT < 2.5) {
      this.orbitT = -1;
      this.orbitsBall++;
      this.stats.orbits++;
      const p = this.add(15000 * this.comboUp());
      if (this.mission?.kind === 'carrera' && this.mission.shot === 'orbit') this.rushHit();
      else this.msg({ big: this.combo > 1 ? this.T('combo', { n: this.combo }) : this.T('orbit'), small: fmt(p), dur: 1.2 });
      this.fx.push({ k: 'orbit', pts: p });
    } else if (id === 'launch' && e.vy < 0) {
      this.saveArmed = true;
      if (this.mission?.kind !== 'lluvia') this.fx.push({ k: 'launched' });
    } else if (id === 'outL' || id === 'outR') {
      if (this.saveT > 0 && this.saveArmed) this.fx.push({ k: 'saveWarn' });
    } else if (id === 'inL' || id === 'inR') this.add(500);
  }

  hole(e) {
    const p = this.add(10000);
    this.fx.push({ k: 'hole' });
    if (this.mission?.kind === 'carrera' && this.mission.shot === 'hole') {
      this.rushHit();
      this.holdT = 0.8;
      return;
    }
    if (this.holeLit && !this.mission) {
      this.holeLit = false;
      this.startMission();
      return;
    }
    this.holdT = 1.0;
    this.msg({ big: this.T('hole'), small: fmt(p), dur: 1.1 });
  }

  // ------------------------------------------------------------ misiones
  startMission() {
    const kind = MISSIONS[this.missionIdx];
    this.mission = { kind, t: 0 };
    this.holdT = 2.2; // la pelota espera mientras se presenta la misión
    if (kind === 'lluvia') {
      this.pendingBalls = 2;
      this.saveT = 10;
      this.saveArmed = true;
      this.msg({ big: this.T('lluvia'), small: this.T('lluviaSub'), dur: 2.6, anim: 'zoom' });
    } else if (kind === 'hiper') {
      this.mission.time = 30;
      this.msg({ big: this.T('hiper'), small: this.T('hiperSub'), dur: 2.6, anim: 'zoom' });
    } else {
      this.mission.time = 30;
      this.mission.shot = RUSH_SHOTS[0];
      this.mission.hits = 0;
      this.msg({ big: this.T('carrera'), small: this.T('carreraSub'), dur: 2.6, anim: 'zoom' });
    }
    this.fx.push({ k: 'mission', kind });
  }

  rushHit() {
    const M = this.mission;
    M.hits++;
    const p = this.add(60000 + 20000 * M.hits);
    M.time += 6;
    const i = RUSH_SHOTS.indexOf(M.shot);
    let next = RUSH_SHOTS[(i + 1 + Math.floor(this.rnd() * (RUSH_SHOTS.length - 1))) % RUSH_SHOTS.length];
    if (next === M.shot) next = RUSH_SHOTS[(i + 1) % RUSH_SHOTS.length];
    M.shot = next;
    this.msg({ big: this.T('rush', { p: fmt(p) }), small: this.T('rushN', { n: M.hits }), dur: 1.2 });
    this.fx.push({ k: 'rush' });
  }

  endMission(byDrain) {
    const M = this.mission;
    if (!M) return;
    this.mission = null;
    this.missionsDone++;
    this.stats.missions++;
    this.missionIdx = (this.missionIdx + 1) % MISSIONS.length;
    // las letras vuelven a empezar
    this.lit = Object.fromEntries(LETTERS.map((l) => [l, false]));
    this.w.resetDrops();
    const bonus = this.add(M.kind === 'carrera' ? 50000 * (M.hits || 0) : 100000);
    this.msg({ big: this.T('done'), small: fmt(bonus), dur: 2 });
    this.fx.push({ k: 'missionEnd', kind: M.kind });
    if (this.missionsDone % 3 === 0) {
      const p = this.add(1000000);
      this.extra++;
      this.msg({ big: this.T('supernova'), small: this.T('plusExtra', { p: fmt(p) }), dur: 3, anim: 'zoom' });
      this.fx.push({ k: 'supernova' });
    } else if (this.missionsDone === 2) {
      this.extra++;
      this.msg({ big: this.T('extra'), small: this.T('oneMore'), dur: 2, anim: 'flash' });
      this.fx.push({ k: 'extra' });
    }
    void byDrain;
  }

  // ------------------------------------------------------------ empujones y tilt
  nudge() {
    if (this.tilted || this.over) return false;
    this.tilt += 1.05;
    if (this.tilt > 3.1) {
      this.tilted = true;
      this.mission = null;
      this.msg({ big: this.T('tilt'), small: this.T('tiltSub'), dur: 3, anim: 'flash' });
      this.fx.push({ k: 'tilt' });
      for (const f of this.w.flips) f.on = false;
      return false;
    }
    if (this.tilt > 2) {
      this.msg({ big: this.T('careful'), small: this.T('carefulSub'), dur: 1 });
      this.fx.push({ k: 'warning' });
    }
    return true;
  }

  // ------------------------------------------------------------ desagüe
  drain() {
    const w = this.w;
    const left = w.balls.filter((b) => b.live).length;
    // en multibola: se termina cuando queda una sola
    if (this.mission?.kind === 'lluvia') {
      if (this.saveT > 0) {
        w.addBall(); // salvada: vuelve al lanzador
        this.fx.push({ k: 'saved' });
        this.msg({ big: this.T('saved'), small: '', dur: 1.2 });
        return;
      }
      if (left + (this.pendingBalls || 0) <= 1) this.endMission(true);
      if (left > 0) return;
    }
    if (left > 0) return;
    if (this.saveT > 0 && this.saveArmed && !this.tilted) {
      this.saveArmed = false;
      this.saveT = SAVE_SECS;
      w.addBall();
      this.fx.push({ k: 'saved' });
      this.msg({ big: this.T('saved'), small: this.T('relaunch'), dur: 1.8, anim: 'flash' });
      return;
    }
    // fin de la pelota: bonus
    const base = this.lettersBall * 5000 + this.rampsBall * 10000 + this.orbitsBall * 8000 + this.bumpersBall * 500;
    const bonus = this.tilted ? 0 : base * this.bonusX;
    this.score += bonus;
    this.lastBonus = { base, x: this.bonusX, total: bonus, tilted: this.tilted };
    this.mission = null;
    this.fx.push({ k: 'ballEnd', bonus });
    this.msg({ big: this.tilted ? this.T('noBonus') : this.T('bonus', { p: fmt(bonus) }), small: this.tilted ? this.T('tilt') : `${fmt(base)} × ${this.bonusX}`, dur: 2.2 });
    if (this.extra > 0) {
      this.extra--;
      this.msg({ big: this.T('extra'), small: this.T('shootAgain'), dur: 1.6 });
      this.newBall();
      return;
    }
    if (this.ball >= BALLS) {
      this.over = true;
      this.fx.push({ k: 'gameOver' });
      this.msg({ big: this.T('gameOver'), small: fmt(this.score), dur: 99 });
      return;
    }
    this.ball++;
    this.newBall();
  }

  /** Para el dibujo: qué tiro está iluminado. */
  arrows() {
    const M = this.mission;
    return {
      ramp: M?.kind === 'lluvia' || (M?.kind === 'carrera' && M.shot === 'ramp') || M?.kind === 'hiper',
      orbit: (M?.kind === 'carrera' && M.shot === 'orbit') || M?.kind === 'hiper',
      hole: this.holeLit || (M?.kind === 'carrera' && M.shot === 'hole'),
      targets: M?.kind === 'carrera' && M.shot === 'targets',
    };
  }
}

/** Temporizador simple dentro de las reglas (sin depender de setTimeout del navegador). */
function setTimeoutish(r, secs, fn) {
  (r.timers ||= []).push({ t: secs, fn });
}
Rules.prototype.tick = function (dt) {
  if (!this.timers) return;
  for (const tm of this.timers) tm.t -= dt;
  const due = this.timers.filter((tm) => tm.t <= 0);
  this.timers = this.timers.filter((tm) => tm.t > 0);
  for (const tm of due) tm.fn();
};

let LOCALE = 'es-AR';
export const setLocale = (l) => (LOCALE = l === 'en' ? 'en-US' : 'es-AR');
export const fmt = (n) => Math.round(n).toLocaleString(LOCALE);
