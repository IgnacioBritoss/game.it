/**
 * Tuercas — controles. Teclado (un jugador: flechas y WASD juntos; dos jugadores: WASD y flechas), mandos (hasta dos,
 * con gatillos analógicos) y controles táctiles en pantalla (palanca para doblar, derrape, ítem y freno; en el celular
 * se acelera solo). `poll()` devuelve las entradas del paso: { steer -1..1 (+ = derecha), accel, brake, drift, item }.
 */
const G = window.GameIt;

const SOLO = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  drift: ['Space', 'ShiftLeft', 'ShiftRight', 'KeyC', 'KeyZ'],
  item: ['KeyE', 'KeyX', 'Enter', 'KeyF'],
};
const P0 = { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], drift: ['ShiftLeft', 'KeyQ'], item: ['KeyE', 'KeyF'] };
const P1 = { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], drift: ['ShiftRight', 'Slash', 'KeyM'], item: ['Enter', 'NumpadEnter', 'Period', 'KeyN'] };
const BLOCK = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);

const dead = (v, z = 0.14) => (Math.abs(v) < z ? 0 : (v - Math.sign(v) * z) / (1 - z));

export class Input {
  /** `root` = contenedor donde se dibujan los controles táctiles. */
  constructor(root) {
    this.keys = new Set();
    this.players = 1;
    this.pauseCbs = [];
    this.padPrev = [];
    this.touch = { steer: 0, drift: false, item: false, brake: false, active: false };
    this.itemEdge = [false, false];
    this.root = root;
    this.touchOn = false;
    this.ptr = new Map();
    this.padsSeen = false;
    this._down = (e) => {
      if (e.target?.closest?.('input, textarea')) return; // escribiendo (nombre y código de la sala online)
      if (e.repeat) {
        if (BLOCK.has(e.code)) e.preventDefault();
        return;
      }
      this.keys.add(e.code);
      if (BLOCK.has(e.code)) e.preventDefault();
      if (e.code === 'Escape' || e.code === 'KeyP') this.pauseCbs.forEach((f) => f());
    };
    this._up = (e) => this.keys.delete(e.code);
    this._blur = () => this.keys.clear();
    addEventListener('keydown', this._down);
    addEventListener('keyup', this._up);
    addEventListener('blur', this._blur);
    this.buildTouch();
  }

  onPause(f) {
    this.pauseCbs.push(f);
  }

  setPlayers(n) {
    this.players = n;
  }

  /** ¿hay algún mando conectado? */
  get pads() {
    return (navigator.getGamepads?.() || []).filter((p) => p && p.connected);
  }

  any(list) {
    for (const c of list) if (this.keys.has(c)) return true;
    return false;
  }

  /** Teclas de movimiento válidas según la preferencia del portal (flechas, WASD o ambas). */
  solo() {
    const k = G?.prefs?.keys || 'both';
    if (k === 'both') return SOLO;
    const pick = (list) => list.filter((c) => (k === 'arrows' ? c.startsWith('Arrow') : !c.startsWith('Arrow')));
    return { ...SOLO, left: pick(SOLO.left), right: pick(SOLO.right), up: pick(SOLO.up), down: pick(SOLO.down) };
  }

  readPad(p) {
    const b = (i) => !!p.buttons[i]?.pressed;
    const v = (i) => p.buttons[i]?.value || 0;
    const steer = dead(p.axes[0] || 0) || (b(15) ? 1 : b(14) ? -1 : 0);
    return {
      steer,
      accel: b(0) || v(7) > 0.1,
      brake: b(1) || v(6) > 0.1,
      drift: b(4) || b(5) || b(2),
      item: b(3) || b(12),
      start: b(9),
    };
  }

  poll() {
    const out = [];
    const pads = this.pads;
    if (pads.length) this.padsSeen = true;
    // pausa con Start
    pads.forEach((p, i) => {
      const st = !!p.buttons[9]?.pressed;
      if (st && !this.padPrev[i]) this.pauseCbs.forEach((f) => f());
      this.padPrev[i] = st;
    });
    for (let i = 0; i < this.players; i++) {
      const map = this.players === 1 ? this.solo() : i === 0 ? P0 : P1;
      const k = this.keys;
      const l = this.any(map.left);
      const r = this.any(map.right);
      const o = {
        steer: (r ? 1 : 0) - (l ? 1 : 0),
        accel: this.any(map.up),
        brake: this.any(map.down),
        drift: this.any(map.drift),
        item: this.any(map.item),
      };
      void k;
      const pad = this.players === 1 ? pads[0] : pads[i];
      if (pad) {
        const g = this.readPad(pad);
        if (Math.abs(g.steer) > Math.abs(o.steer)) o.steer = g.steer;
        o.accel ||= g.accel;
        o.brake ||= g.brake;
        o.drift ||= g.drift;
        o.item ||= g.item;
      }
      if (i === 0 && this.touchOn) {
        const t = this.touch;
        if (Math.abs(t.steer) > Math.abs(o.steer)) o.steer = t.steer;
        o.accel ||= t.active && !t.brake;
        o.brake ||= t.brake;
        o.drift ||= t.drift;
        o.item ||= t.item;
      }
      out.push(o);
    }
    return out;
  }

  // ------------------------------------------------------------ controles táctiles
  buildTouch() {
    const el = (this.pad = document.createElement('div'));
    el.className = 'touch';
    el.hidden = true;
    el.innerHTML = `
      <div class="stick" id="t-stick"><i class="ring"></i><i class="knob"></i></div>
      <button class="tb brake" id="t-brake" aria-label="brake"><span data-t="tBrake"></span></button>
      <button class="tb item" id="t-item" aria-label="item"><span data-t="tItem"></span></button>
      <button class="tb drift" id="t-drift" aria-label="drift"><span data-t="tDrift"></span></button>`;
    this.root.appendChild(el);
    const stick = el.querySelector('#t-stick');
    const knob = stick.querySelector('.knob');
    const ring = stick.querySelector('.ring');
    let origin = null;
    let id = null;
    const move = (e) => {
      if (e.pointerId !== id || !origin) return;
      const dx = e.clientX - origin.x;
      this.touch.steer = Math.max(-1, Math.min(1, dx / 52));
      knob.style.transform = `translate(${Math.max(-52, Math.min(52, dx))}px, 0)`;
    };
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      origin = null;
      this.touch.steer = 0;
      knob.style.transform = '';
      stick.classList.remove('on');
    };
    stick.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      id = e.pointerId;
      stick.setPointerCapture(id);
      const rc = ring.getBoundingClientRect();
      origin = { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 };
      stick.classList.add('on');
      this.touch.active = true;
      move(e);
    });
    stick.addEventListener('pointermove', move);
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
    const hold = (sel, key) => {
      const b = el.querySelector(sel);
      const set = (v) => {
        this.touch[key] = v;
        b.classList.toggle('on', v);
        if (v) this.touch.active = true;
      };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        set(true);
      });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => set(false));
    };
    hold('#t-drift', 'drift');
    hold('#t-item', 'item');
    hold('#t-brake', 'brake');
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Muestra u oculta los controles táctiles. */
  showTouch(on) {
    this.touchOn = on;
    this.pad.hidden = !on;
    this.touch.active = on;
    if (!on) Object.assign(this.touch, { steer: 0, drift: false, item: false, brake: false, active: false });
  }

  destroy() {
    removeEventListener('keydown', this._down);
    removeEventListener('keyup', this._up);
    removeEventListener('blur', this._blur);
    this.pad.remove();
  }
}
