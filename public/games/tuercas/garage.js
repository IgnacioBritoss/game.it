/**
 * Tuercas — el taller: escena 3D donde gira el vehículo en una plataforma y el panel para armarlo (piloto, carrocería,
 * ruedas, accesorio, pintura y puesta a punto) viendo cómo cambian las seis estadísticas. Las miniaturas de cada pieza
 * se renderizan una sola vez con un contexto WebGL temporal. La configuración se guarda por jugador.
 */
import { THREE, Builder, inked, paintMat, canvasTex } from './models.js';
import { makeVehicle } from './vehicles.js';
import { Particles } from './fx.js';
import { shapes, instanced } from './props.js';
import { DRIVERS, BODIES, WHEELS, EXTRAS, PAINTS, STATS, TUNING, TUNE_MAX, DEFAULT_CONFIG, sanitize, statsOf, byId, randomConfig } from './shared/parts.js';
import { rng, clamp, damp, TAU } from './shared/util.js';
import { esc } from './hud.js';

const G = window.GameIt;
const KEY = (i) => `gameit:tuercas:cfg${i}`;

export function loadConfig(i) {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(i)));
    if (raw) return sanitize(raw);
  } catch {}
  // el segundo jugador arranca con otras piezas para distinguirse
  return sanitize(i === 1 ? { driver: 'lola', body: 'flecha', wheels: 'lisas', extra: 'aleron', paint: 5 } : DEFAULT_CONFIG);
}
export function saveConfig(i, cfg) {
  try {
    localStorage.setItem(KEY(i), JSON.stringify(sanitize(cfg)));
  } catch {}
}

// ---------------------------------------------------------------- miniaturas de las piezas
let thumbs = null;
function makeThumbs(cfg) {
  const out = { driver: {}, body: {}, wheels: {}, extra: {} };
  let r;
  try {
    const c = document.createElement('canvas');
    r = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    return out;
  }
  const S = 132;
  r.setPixelRatio(1);
  r.setSize(S, S, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#9a8fb8', 1.8));
  const sun = new THREE.DirectionalLight('#fff4d6', 2.4);
  sun.position.set(-3, 6, 5);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  const base = { ...cfg, paint: cfg.paint };
  const shot = (c, kind) => {
    const v = makeVehicle(c, { thick: 0.035 });
    scene.add(v.root);
    v.root.updateMatrixWorld(true);
    const at = new THREE.Vector3();
    if (kind === 'driver') {
      v.root.rotation.y = 0.45;
      v.root.updateMatrixWorld(true);
      v.head.getWorldPosition(at);
      cam.position.set(at.x + 0.8, at.y + 0.25, at.z + 1.9);
    } else if (kind === 'body') {
      v.root.rotation.y = -0.55;
      v.root.updateMatrixWorld(true);
      at.set(0, 0.75, 0);
      cam.position.set(2.7, 2.1, 4.1);
    } else if (kind === 'wheels') {
      v.root.rotation.y = 0.4;
      v.root.updateMatrixWorld(true);
      v.wheels[0].pivot.getWorldPosition(at);
      cam.position.set(at.x + 1.6, at.y + 0.5, at.z + 2.4);
    } else {
      v.root.rotation.y = 0.5;
      v.root.updateMatrixWorld(true);
      at.set(0, 0.85, -1.0);
      cam.position.set(-2.4, 2.2, -4.2);
    }
    cam.lookAt(at);
    r.render(scene, cam);
    const url = r.domElement.toDataURL('image/png');
    scene.remove(v.root);
    v.root.traverse((o) => o.geometry?.dispose());
    return url;
  };
  try {
    for (const d of DRIVERS) out.driver[d.id] = shot({ ...base, driver: d.id }, 'driver');
    for (const b of BODIES) out.body[b.id] = shot({ ...base, body: b.id }, 'body');
    for (const w of WHEELS) out.wheels[w.id] = shot({ ...base, wheels: w.id }, 'wheels');
    for (const e of EXTRAS) out.extra[e.id] = shot({ ...base, extra: e.id }, 'extra');
  } catch {}
  r.dispose();
  r.forceContextLoss?.();
  return out;
}

// ---------------------------------------------------------------- escena del taller
class Showroom {
  constructor() {
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(34, 1, 0.1, 120);
    const bg = canvasTex(8, 256, (g, W, H) => {
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, '#6a4bd6');
      gr.addColorStop(0.55, '#a468e8');
      gr.addColorStop(1, '#ff9ac4');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
    });
    this.scene.background = bg;
    this.bgTex = bg;
    this.scene.add(new THREE.HemisphereLight('#fff3ff', '#7a5ad0', 1.7));
    const sun = new THREE.DirectionalLight('#fff4d6', 2.6);
    sun.position.set(-4, 8, 6);
    this.scene.add(sun);
    // plataforma
    const plat = new Builder();
    plat.cyl(3.6, 3.8, 0.5, '#3a2f6b', { p: [0, -0.25, 0], seg: 28 });
    plat.cyl(3.3, 3.3, 0.06, '#f4f1ea', { p: [0, 0.03, 0], seg: 28 });
    plat.cyl(2.5, 2.5, 0.08, '#ff6bb5', { p: [0, 0.04, 0], seg: 28 });
    plat.cyl(2.2, 2.2, 0.1, '#ffd23f', { p: [0, 0.045, 0], seg: 28 });
    for (let k = 0; k < 12; k++) plat.sphere(0.13, k % 2 ? '#4ee0ff' : '#ffffff', { p: [Math.cos((k / 12) * TAU) * 3.0, 0.08, Math.sin((k / 12) * TAU) * 3.0], seg: 6, rings: 4 });
    this.platform = inked(plat.build(), { thick: 0.04 });
    this.scene.add(this.platform);
    // tuercas y tornillos flotando de fondo
    const R = rng(9);
    const bits = [];
    const geos = [shapes.nutBig('#ffc93a'), shapes.bolt('#c9cfdc'), shapes.block('#4ea8ff'), shapes.spool('#e8483f')];
    this.bits = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const g = inked(geos[i % geos.length], { thick: 0.07 });
      const a = (i / 14) * TAU;
      const d = 9 + R() * 8;
      g.position.set(Math.cos(a) * d, -2 + R() * 9, Math.sin(a) * d - 4);
      g.scale.setScalar(0.35 + R() * 0.5);
      g.userData.spin = (R() - 0.5) * 0.8;
      g.userData.ph = R() * 6;
      this.bits.add(g);
    }
    void bits;
    this.scene.add(this.bits);
    this.sparks = new Particles(260, true);
    this.scene.add(this.sparks.points);
    this.vehicle = null;
    this.spin = 0.6;
    this.drag = 0;
    this.idle = 0;
    this.pop = 1;
    this.t = 0;
    this.accSpark = 0;
  }

  set(cfg, pop = true) {
    if (this.vehicle) {
      this.scene.remove(this.vehicle.root);
      this.vehicle.root.traverse((o) => o.geometry?.dispose());
    }
    const v = (this.vehicle = makeVehicle(cfg, { thick: 0.03 }));
    v.root.rotation.y = this.spin;
    this.scene.add(v.root);
    v.root.position.y = 0.05;
    if (pop) {
      this.pop = 0;
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * TAU;
        const col = ['#ffd23f', '#ffffff', '#4ee0ff', '#ff6bb5'][i % 4];
        this.sparks.emit(Math.cos(a) * 1.2, 0.4 + Math.random() * 1.6, Math.sin(a) * 1.2, Math.cos(a) * 2.6, 2 + Math.random() * 2.5, Math.sin(a) * 2.6, 0.8, 0.26, 0.02, col, '#ffffff', 5, 0.8, 1);
      }
    }
    this.paintHex = v.paint;
  }

  update(dt, t, rect) {
    this.t = t;
    const v = this.vehicle;
    if (v) {
      this.idle += dt;
      if (this.dragging) this.idle = 0;
      else if (this.idle > 1.2) this.spin += dt * 0.55;
      v.root.rotation.y = this.spin;
      this.pop = Math.min(1, this.pop + dt * 3.2);
      const e = this.pop;
      const s = e < 1 ? 1 + Math.sin(e * Math.PI) * 0.12 * (1 - e) - (1 - e) * 0.12 : 1;
      v.root.scale.setScalar(s);
      v.root.position.y = 0.05 + Math.sin(t * 1.6) * 0.03 + Math.sin(e * Math.PI) * 0.25 * (1 - e);
      for (const w of v.wheels) w.spin.rotation.x += dt * 2.4;
      v.head.rotation.y = Math.sin(t * 1.1) * 0.35;
      v.head.position.y = v.headBase.y + Math.sin(t * 2.2) * 0.012;
      v.lean.rotation.z = Math.sin(t * 1.4) * 0.012;
    }
    this.bits.children.forEach((g, i) => {
      g.rotation.y += dt * g.userData.spin;
      g.rotation.x += dt * g.userData.spin * 0.6;
      g.position.y += Math.sin(t * 0.8 + g.userData.ph) * dt * 0.25;
    });
    this.accSpark += dt * 6;
    while (this.accSpark >= 1) {
      this.accSpark--;
      const a = Math.random() * TAU;
      this.sparks.emit(Math.cos(a) * 3, 0.1, Math.sin(a) * 3, 0, 1.2 + Math.random(), 0, 1.2, 0.18, 0.02, '#fff3c4', '#ffd23f', 0, 0, 0.8);
    }
    this.sparks.update(dt);
    // encuadre: más lejos si la vista es angosta
    const aspect = rect.w / rect.h;
    const cam = this.cam;
    cam.aspect = aspect;
    const dist = aspect < 0.8 ? 10.5 : aspect < 1.2 ? 9 : 7.6;
    cam.position.set(0.0, 3.2 + (aspect < 0.8 ? 0.6 : 0), dist);
    cam.lookAt(0, 1.05, 0);
    cam.updateProjectionMatrix();
    this.sparks.setScale((rect.h * Math.min(2, devicePixelRatio || 1)) / (2 * Math.tan((cam.fov * Math.PI) / 360)));
  }

  dispose() {
    if (this.vehicle) this.vehicle.root.traverse((o) => o.geometry?.dispose());
    this.platform.traverse((o) => o.geometry?.dispose());
    this.bits.traverse((o) => o.geometry?.dispose());
    this.sparks.dispose();
    this.bgTex.dispose();
  }
}

// ---------------------------------------------------------------- el taller (panel y lógica)
const TABS = ['driver', 'body', 'wheels', 'extra', 'paint', 'tune'];

export class Garage {
  /** `root` = #s-garage; `tr` = textos; `onDone(i, cfg)` al terminar; `audio` = efectos de los toques. */
  constructor(root, tr, { onDone, audio, stage }) {
    this.root = root;
    this.t = tr;
    this.onDone = onDone;
    this.audio = audio;
    this.stage = stage;
    this.tab = 'driver';
    this.player = 0;
    this.players = 1;
    this.cfg = loadConfig(0);
    this.prev = statsOf(this.cfg);
    this.show = null;
    this.open_ = false;
    this.$ = (s) => root.querySelector(s);
    this.view = this.$('#g-view');
    this.build();
    // arrastrar para girar el vehículo
    let last = null;
    const v = this.view;
    v.addEventListener('pointerdown', (e) => {
      if (!this.show) return;
      last = e.clientX;
      this.show.dragging = true;
      v.setPointerCapture(e.pointerId);
    });
    v.addEventListener('pointermove', (e) => {
      if (last === null || !this.show) return;
      this.show.spin += (e.clientX - last) * 0.012;
      last = e.clientX;
    });
    const end = () => {
      last = null;
      if (this.show) this.show.dragging = false;
    };
    v.addEventListener('pointerup', end);
    v.addEventListener('pointercancel', end);
  }

  build() {
    const tabs = this.$('#g-tabs');
    tabs.innerHTML = TABS.map((k) => `<button class="tab" data-tab="${k}"><span data-t="tab_${k}"></span></button>`).join('');
    tabs.addEventListener('click', (e) => {
      const b = e.target.closest('.tab');
      if (!b) return;
      this.tab = b.dataset.tab;
      this.audio.jingle('click');
      this.renderTab();
    });
    this.$('#g-opts').addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      if (!b) return;
      this.pick(b.dataset.id);
    });
    this.$('#g-opts').addEventListener('input', (e) => {
      const r = e.target.closest('input[type=range]');
      if (!r) return;
      const tune = this.cfg.tune.slice();
      tune[+r.dataset.i] = +r.value;
      this.apply({ ...this.cfg, tune }, false);
    });
    this.$('#g-done').addEventListener('click', () => this.finish());
    this.$('#g-random').addEventListener('click', () => {
      const cfg = randomConfig(Math.random, []);
      cfg.tune = [0, 0, 0].map(() => Math.floor(Math.random() * 3) - 1);
      this.audio.jingle('pick');
      this.apply(cfg, true);
    });
    this.$('#g-reset').addEventListener('click', () => {
      this.audio.jingle('back');
      this.apply({ ...this.cfg, tune: [0, 0, 0] }, false);
    });
    this.$('#g-players').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.switchPlayer(+b.dataset.p);
    });
  }

  open(player = 0, players = 1) {
    this.players = players;
    this.root.classList.add('on');
    this.open_ = true;
    if (!this.show) this.show = new Showroom();
    if (!thumbs) {
      // las miniaturas se generan en el siguiente cuadro para no trabar la apertura
      requestAnimationFrame(() => {
        thumbs = makeThumbs(this.cfg);
        this.renderTab();
      });
    }
    this.$('#g-players').hidden = players < 2;
    this.switchPlayer(player, true);
  }

  switchPlayer(i, first = false) {
    if (!first) saveConfig(this.player, this.cfg);
    this.player = i;
    this.cfg = loadConfig(i);
    this.prev = statsOf(this.cfg);
    for (const b of this.$('#g-players').children) b.classList.toggle('on', +b.dataset.p === i);
    this.show.set(this.cfg, !first);
    this.renderTab();
    this.renderStats(true);
    this.i18n();
  }

  close() {
    this.root.classList.remove('on');
    this.open_ = false;
  }

  finish() {
    saveConfig(this.player, this.cfg);
    this.audio.jingle('ok');
    this.close();
    this.onDone(this.player, this.cfg);
  }

  pick(id) {
    const key = { driver: 'driver', body: 'body', wheels: 'wheels', extra: 'extra', paint: 'paint' }[this.tab];
    if (!key) return;
    const val = key === 'paint' ? +id : id;
    if (this.cfg[key] === val) return;
    this.audio.jingle('pick');
    this.apply({ ...this.cfg, [key]: val }, true);
  }

  apply(cfg, pop) {
    this.cfg = sanitize(cfg);
    saveConfig(this.player, this.cfg);
    if (pop || this.show) this.show.set(this.cfg, pop);
    this.renderTab(true);
    this.renderStats();
  }

  /** Lista de piezas del tab actual. */
  list() {
    return { driver: DRIVERS, body: BODIES, wheels: WHEELS, extra: EXTRAS }[this.tab];
  }

  renderTab(keep = false) {
    const lang = G.prefs.lang;
    for (const b of this.$('#g-tabs').children) b.classList.toggle('on', b.dataset.tab === this.tab);
    const box = this.$('#g-opts');
    const desc = this.$('#g-desc');
    if (this.tab === 'paint') {
      box.className = 'opts paint';
      box.innerHTML = PAINTS.map((c, i) => `<button class="sw ${this.cfg.paint === i ? 'on' : ''}" data-id="${i}" style="--c:${c}" aria-label="${c}"></button>`).join('');
      desc.innerHTML = `<b>${esc(this.t('tab_paint'))}</b><span>${esc(this.t('paintHint'))}</span>`;
      return;
    }
    if (this.tab === 'tune') {
      box.className = 'opts tune';
      box.innerHTML = TUNING.map((tu, i) => {
        const up = STATS[tu.up].name[lang];
        const down = STATS[tu.down].name[lang];
        return `<label class="tu"><span class="tn"><b>${esc(tu.name[lang])}</b><em>${esc(tu.lo[lang])} ⇄ ${esc(tu.hi[lang])}</em></span>
          <input type="range" min="${-TUNE_MAX}" max="${TUNE_MAX}" step="1" value="${this.cfg.tune[i]}" data-i="${i}" aria-label="${esc(tu.name[lang])}">
          <span class="tr">+ ${esc(up)} · − ${esc(down)}</span></label>`;
      }).join('');
      desc.innerHTML = `<b>${esc(this.t('tab_tune'))}</b><span>${esc(this.t('tuneHint'))}</span>`;
      return;
    }
    const list = this.list();
    const cur = this.cfg[this.tab];
    box.className = 'opts';
    const th = thumbs?.[this.tab] || {};
    box.innerHTML = list.map((p) => `<button class="opt ${p.id === cur ? 'on' : ''}" data-id="${p.id}"><span class="th">${th[p.id] ? `<img alt="" src="${th[p.id]}">` : ''}</span><b>${esc(typeof p.name === 'string' ? p.name : p.name[lang])}</b></button>`).join('');
    const part = byId(list, cur);
    const name = typeof part.name === 'string' ? part.name : part.name[lang];
    const chips = part.s
      .map((v, i) => (v ? `<i class="${v > 0 ? 'up' : 'dn'}">${v > 0 ? '+' : '−'}${Math.abs(v)} ${esc(STATS[i].name[lang])}</i>` : ''))
      .join('');
    const sub = part.kind ? ` · ${esc(part.kind[lang])}` : '';
    desc.innerHTML = `<b>${esc(name)}${sub}</b><span>${esc(part.bio[lang])}</span><div class="chips">${chips}</div>`;
    void keep;
  }

  renderStats(instant = false) {
    const lang = G.prefs.lang;
    const now = statsOf(this.cfg);
    const box = this.$('#g-stats');
    if (!box.children.length || box.dataset.lang !== lang) {
      box.dataset.lang = lang;
      box.innerHTML = STATS.map((s, i) => `<div class="st"><span>${esc(s.name[lang])}</span><div class="bar"><i></i><u></u></div><b></b><em></em></div>`).join('');
    }
    now.forEach((v, i) => {
      const row = box.children[i];
      const d = v - this.prev[i];
      row.querySelector('i').style.width = `${(v / 10) * 100}%`;
      row.querySelector('u').style.width = `${(this.prev[i] / 10) * 100}%`;
      row.querySelector('b').textContent = v.toFixed(1).replace('.0', '');
      const em = row.querySelector('em');
      if (!instant && Math.abs(d) >= 0.05) {
        em.textContent = `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1).replace('.0', '')}`;
        em.className = d > 0 ? 'up on' : 'dn on';
        clearTimeout(em._t);
        em._t = setTimeout(() => em.classList.remove('on'), 1400);
      } else if (instant) em.className = '';
      // la barra "fantasma" queda en el valor anterior un momento
    });
    clearTimeout(this._pt);
    this._pt = setTimeout(() => (this.prev = statsOf(this.cfg)), 900);
    if (instant) this.prev = now;
  }

  i18n() {
    for (const el of this.root.querySelectorAll('[data-t]')) el.textContent = this.t(el.dataset.t);
  }

  /** Cada cuadro mientras el taller está abierto. */
  frame(dt, t) {
    if (!this.open_ || !this.show) return;
    const r = this.view.getBoundingClientRect();
    const rect = { x: r.left, y: r.top, w: r.width, h: r.height };
    this.show.update(dt, t, rect);
    this.stage.renderOther(this.show.scene, this.show.cam, rect, '#6a4bd6');
  }

  dispose() {
    this.show?.dispose();
  }
}
