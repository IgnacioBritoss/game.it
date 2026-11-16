/**
 * Disimulá — controles de cámara y movimiento.
 *  - FPS: primera persona con pointer lock en compu; en el celular, joystick + arrastrar para mirar.
 *  - Orbit: cámara orbital alrededor del propio personaje (preparación): arrastrar gira,
 *    rueda o pinza hace zoom; en el celular gira con un dedo (fuera del joystick) y pinza con dos.
 * El movimiento (teclas/joystick) lo consume main.js; acá solo se juntan entradas.
 */
const G = window.GameIt;

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.mode = 'none'; // none | fps | orbit
    this.sens = 1;
    this.orbit = { dist: 3.2, phi: 0.35, theta: 0 };
    this.joy = { x: 0, y: 0, active: false, id: -1 };
    this.onTap = null; // (x, y) toque/clic que no fue arrastre (atrapar / pintar)
    this.onDrag = null; // (x, y, phase) arrastre para pintar
    this.paintMode = false; // en modo pintura, el arrastre con un dedo pinta en vez de orbitar
    this.locked = false;
    this.zoomHeld = false;
    this.touch = matchMedia('(pointer: coarse)').matches;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const d = G.dir(e);
      if (d) this.keys.add(d);
      this.keys.add(e.code);
      this.onKey?.(e.code, true);
    });
    addEventListener('keyup', (e) => {
      const d = G.dir(e);
      if (d) this.keys.delete(d);
      this.keys.delete(e.code);
      this.onKey?.(e.code, false);
    });
    addEventListener('blur', () => this.keys.clear());

    document.addEventListener('pointerlockchange', () => {
      const nowLocked = document.pointerLockElement === canvas;
      if (nowLocked) this.lockAt = performance.now();
      // solo avisa si veníamos capturados de verdad y lo sostuvimos un momento (Esc del
      // jugador), no cuando el navegador concede y revoca al toque sin gesto (headless)
      else if (this.locked && performance.now() - (this.lockAt || 0) > 350) this.onUnlock?.();
      this.locked = nowLocked;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || this.mode !== 'fps') return;
      if (Math.abs(e.movementX) > 350 || Math.abs(e.movementY) > 350) return;
      const k = 0.0021 * this.sens;
      this.yaw -= e.movementX * k;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - e.movementY * k));
    });

    canvas.addEventListener('mousedown', (e) => {
      if (this.mode === 'fps' && !this.touch) {
        if (!this.locked) {
          this.lock();
          return;
        }
        if (e.button === 0) this.onTap?.(innerWidth / 2, innerHeight / 2);
        if (e.button === 2) this.zoomHeld = true;
      }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 2) this.zoomHeld = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      if (this.mode === 'orbit') {
        this.orbit.dist = Math.max(1.4, Math.min(8, this.orbit.dist + Math.sign(e.deltaY) * 0.35));
        e.preventDefault();
      }
    }, { passive: false });

    // punteros sobre el canvas: orbitar, pintar o tocar
    this.pointers = new Map();
    canvas.addEventListener('pointerdown', (e) => {
      if (this.mode === 'none') return;
      if (this.mode === 'fps' && !this.touch) return; // lo maneja mousedown
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: 0, t: performance.now() });
      if (this.mode === 'orbit' && this.paintMode && this.pointers.size === 1) this.onDrag?.(e.clientX, e.clientY, 'start');
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.moved += Math.abs(dx) + Math.abs(dy);
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.mode === 'fps') {
        // mirar arrastrando (celular)
        const k = 0.0042 * this.sens;
        this.yaw -= dx * k;
        this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * k));
      } else if (this.mode === 'orbit') {
        if (this.pointers.size === 2) {
          // pinza: zoom + giro
          const pts = [...this.pointers.values()];
          const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          if (this.lastPinch) this.orbit.dist = Math.max(1.4, Math.min(8, this.orbit.dist * (this.lastPinch / d)));
          this.lastPinch = d;
          this.orbit.theta -= dx * 0.004;
        } else if (this.paintMode && !this.touchOrbitOnly) {
          this.onDrag?.(e.clientX, e.clientY, 'move');
        } else {
          this.orbit.theta -= dx * 0.0065;
          this.orbit.phi = Math.max(-0.2, Math.min(1.25, this.orbit.phi + dy * 0.005));
        }
      }
    });
    const up = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      this.pointers.delete(e.pointerId);
      this.lastPinch = null;
      if (this.mode === 'orbit' && this.paintMode) this.onDrag?.(e.clientX, e.clientY, 'end');
      // toque corto sin arrastre = tap (atrapar en celular / elegir en pantalla)
      if (p.moved < 12 && performance.now() - p.t < 450) this.onTap?.(e.clientX, e.clientY);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }

  lock() {
    if (this.touch) return;
    const plain = () => {
      try {
        this.canvas.requestPointerLock()?.catch?.(() => {});
      } catch {}
    };
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      p?.catch?.(plain);
    } catch {
      plain();
    }
  }
  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Vector de movimiento (-1..1) combinando teclas y joystick. */
  moveVec() {
    let x = (this.keys.has('right') ? 1 : 0) - (this.keys.has('left') ? 1 : 0);
    let y = (this.keys.has('down') ? 1 : 0) - (this.keys.has('up') ? 1 : 0);
    if (this.joy.active) {
      x += this.joy.x;
      y += this.joy.y;
    }
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l } : { x, y };
  }

  /** Joystick táctil sobre un div (#joystick). */
  bindJoystick(el) {
    const knob = el.querySelector('i');
    const set = (x, y) => {
      this.joy.x = x;
      this.joy.y = y;
      knob.style.transform = `translate(calc(-50% + ${x * 32}px), calc(-50% + ${y * 32}px))`;
    };
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.joy.active = true;
      this.joy.id = e.pointerId;
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joy.id) return;
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - r.left - r.width / 2) / (r.width / 2);
      const dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
      const l = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, l);
      set((dx / l) * k, (dy / l) * k);
    });
    const end = (e) => {
      if (e.pointerId !== this.joy.id) return;
      this.joy.active = false;
      this.joy.id = -1;
      set(0, 0);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /** Posición de cámara orbital alrededor de un punto. */
  orbitCam(camera, cx, cy, cz) {
    const o = this.orbit;
    const x = cx + Math.sin(o.theta) * Math.cos(o.phi) * o.dist;
    const z = cz + Math.cos(o.theta) * Math.cos(o.phi) * o.dist;
    const y = cy + Math.sin(o.phi) * o.dist;
    camera.position.set(x, Math.max(0.25, y), z);
    camera.lookAt(cx, cy, cz);
  }
}
