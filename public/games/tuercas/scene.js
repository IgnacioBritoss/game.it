/**
 * Tuercas — el escenario 3D de una carrera: dibuja el mundo de la pista, los vehículos con sus animaciones (ruedas,
 * volante, cabeza, inclinación, derrape, trompos), los ítems sueltos (aceite, rulemán, tero, nubarrón), las partículas
 * y las cámaras de cada jugador (persecución con rebote, intro de largada, pantalla dividida). No sabe de reglas:
 * recibe el estado de la carrera (shared/race.js) y los eventos que dejó.
 */
import { THREE, Builder, inked, paintMat, outlineMat, canvasTex, darker, lighter } from './models.js';
import { makeVehicle } from './vehicles.js';
import { World } from './world.js';
import { Particles, Weather } from './fx.js';
import { shapes } from './props.js';
import { getTrack } from './shared/tracks.js';
import { groundAt } from './shared/track.js';
import { COUNT_TIME } from './shared/race.js';
import { clamp, lerp, damp, wrapAngle, TAU, rng } from './shared/util.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const smooth = (t) => t * t * (3 - 2 * t);

const SPARK = [
  ['#fff3c4', '#ffb03c'],
  ['#9fe6ff', '#1f7bff'],
  ['#ffe27a', '#ff4b2b'],
  ['#f0b0ff', '#8a3dff'],
];
const BOOST_COLOR = { mt: ['#9fe6ff', '#1f7bff'], pad: ['#9fe6ff', '#1f9dd6'], start: ['#ffe27a', '#ff7a1f'], sifon: ['#ffffff', '#7fd0ff'], tow: ['#f0b0ff', '#8a3dff'], trick: ['#ffb0e0', '#ff4b9a'], '': ['#fff3c4', '#ff7a1f'] };

// ---------------------------------------------------------------- vehículo en pista
class KartView {
  constructor(stage, kart) {
    this.stage = stage;
    this.k = kart;
    const v = (this.v = makeVehicle(kart.cfg, { thick: 0.03, outline: stage.outline }));
    // material propio (mismo programa): permite el destello del ají sin teñir a los demás
    const mat = (this.mat = paintMat().clone());
    mat.userData.shared = false;
    v.body.userData.mesh.material = mat;
    v.head.userData.mesh.material = mat;
    for (const w of v.wheels) w.spin.material = mat;
    stage.scene.add(v.root);
    this.root = v.root;
    this.x = this.y = this.z = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.steerVis = 0;
    this.wheelie = 0;
    this.acc = { spark: 0, flame: 0, dust: 0, smoke: 0, star: 0, rain: 0, glint: 0, trail: 0 };
    this.side = 1;
    // sombra
    this.shadow = new THREE.Mesh(stage.shadowGeo, stage.shadowMat);
    this.shadow.rotation.order = 'YXZ';
    this.shadow.renderOrder = 2;
    stage.scene.add(this.shadow);
    // burbuja del escudo
    this.bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: '#9fe6ff', transparent: true, opacity: 0.26, depthWrite: false }));
    this.bubble.visible = false;
    this.bubble.renderOrder = 6;
    v.lean.add(this.bubble);
    this.bubble.position.y = 0.85;
    this.bubble.scale.setScalar(1.75 * Math.max(1, v.size));
    // cañita voladora
    this.rocket = this.makeRocket();
    this.rocket.visible = false;
    v.lean.add(this.rocket);
    // marca de jugador (solo en pantalla dividida)
    if (kart.human >= 0 && stage.marks) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 4), new THREE.MeshBasicMaterial({ color: kart.human === 0 ? '#ff4b4b' : '#3d8bff' }));
      m.rotation.x = Math.PI;
      m.position.y = v.top + 0.75;
      v.lean.add(m);
      this.mark = m;
    }
  }

  makeRocket() {
    const b = new Builder();
    b.cyl(0.3, 0.3, 2.2, '#f4f1ea', { p: [0, 0, 0], r: [Math.PI / 2, 0, 0], seg: 10 });
    for (let k = 0; k < 3; k++) b.cyl(0.31, 0.31, 0.3, '#e8483f', { p: [0, 0, -0.6 + k * 0.6], r: [Math.PI / 2, 0, 0], seg: 10 });
    b.cone(0.3, 0.8, '#e8483f', { p: [0, 0, 1.5], r: [Math.PI / 2, 0, 0], seg: 10 });
    for (let k = 0; k < 3; k++) b.group({ r: [0, 0, (k / 3) * TAU] }, () => b.rbox(0.08, 0.5, 0.6, 0.03, '#ffd23f', { p: [0, 0.4, -0.9] }));
    b.cyl(0.2, 0.26, 0.3, '#3a3f55', { p: [0, 0, -1.25], r: [Math.PI / 2, 0, 0], seg: 8 });
    const g = inked(b.build(), { thick: 0.04 });
    g.position.set(0, 0.7 + this.v.lift, -1.45);
    g.rotation.x = -0.15;
    return g;
  }

  /** Posición en el mundo de un punto local del vehículo. */
  world(x, y, z, out) {
    this.root.updateMatrixWorld(true);
    return out.set(x, y, z).applyMatrix4(this.v.lean.matrixWorld);
  }

  update(R, alpha, dt, t) {
    const k = this.k;
    const T = R.T;
    const v = this.v;
    const st = this.stage;
    const x = k.px + (k.x - k.px) * alpha;
    const y = k.py + (k.y - k.py) * alpha;
    const z = k.pz + (k.z - k.pz) * alpha;
    const yaw = k.pyaw + wrapAngle(k.yaw - k.pyaw) * alpha;
    this.x = x;
    this.y = y;
    this.z = z;
    this.yaw = yaw;
    const sp = Math.abs(k.v);
    const spd = clamp(sp / k.P.vmax, 0, 1.4);

    // inclinación según la pendiente de la pista o el vuelo
    let pitchT;
    if (k.air) pitchT = clamp(Math.atan2(k.vy, Math.max(7, k.v)), -0.55, 0.55);
    else pitchT = Math.atan2(groundAt(T, k.ti, k.ta + 1.3, k.d) - groundAt(T, k.ti, k.ta - 1.3, k.d), 2.6);
    this.pitch = damp(this.pitch, pitchT, 14, dt);
    this.steerVis = damp(this.steerVis, k.steer, 13, dt);
    this.wheelie = damp(this.wheelie, k.wheelie ? 1 : 0, 6, dt);
    // balanceo: los autos se tumban hacia afuera de la curva; las motos hacia adentro
    const drift = k.drift;
    let roll = v.bike ? this.steerVis * (0.28 + 0.3 * spd) - drift * 0.28 : -this.steerVis * 0.07 * spd + drift * 0.03;
    roll += Math.sin(t * 31 + k.index) * 0.004 * spd;
    this.roll = damp(this.roll, roll, 12, dt);

    // trompo y voltereta
    let spinY = 0;
    let flip = 0;
    if (k.spinT > 0) {
      const max = k.spinMax || 1.15;
      spinY = (1 - clamp(k.spinT / max, 0, 1)) * TAU * (max > 1 ? 2 : 1);
    }
    if (k.tumbleT > 0) flip = (1 - clamp(k.tumbleT / 1.5, 0, 1)) * TAU;
    if (k.fallT > 0) spinY = (1.05 - k.fallT) * 5;

    this.root.position.set(x, y, z);
    this.root.rotation.set(0, yaw + spinY, 0);
    v.lean.rotation.set(-(this.pitch + this.wheelie * 0.34) - flip, 0, this.roll);

    // parpadeo mientras es inmune (después de un golpe)
    let vis = true;
    if (k.safeT > 0 && k.safeT < 1.1 && k.spinT <= 0 && k.tumbleT <= 0 && k.fallT <= 0 && k.autoT <= 0) vis = Math.floor(t * 16) % 2 === 0;
    this.root.visible = vis;

    // ruedas: giran con la velocidad; las de adelante doblan con el volante
    for (const w of v.wheels) {
      w.spin.rotation.x += (k.v * dt) / w.r;
      if (w.front) w.pivot.rotation.y = -this.steerVis * 0.55;
    }
    // cabeza: mira hacia donde dobla, vibra con el camino y se marea cuando la golpean
    const head = v.head;
    const hb = v.headBase;
    head.position.set(hb.x, hb.y + Math.sin(t * 23 + k.index) * 0.012 * spd + this.wheelie * 0.06, hb.z - this.wheelie * 0.05);
    head.rotation.set(this.wheelie * 0.25 + Math.sin(t * 1.3 + k.index) * 0.03, clamp(-this.steerVis * 0.5 + drift * 0.38, -0.8, 0.8), 0);
    if (k.spinT > 0 || k.tumbleT > 0) head.rotation.z = Math.sin(t * 24) * 0.45;
    else head.rotation.z = -this.steerVis * 0.1;
    if (k.fallT > 0) head.rotation.x = -0.5;

    // efectos de estado
    const inv = k.invT > 0;
    if (inv) {
      _c.setHSL((t * 2.2 + k.index * 0.13) % 1, 1, 0.55);
      this.mat.emissive.copy(_c);
      this.mat.emissiveIntensity = 0.55;
    } else if (this.mat.emissiveIntensity > 0) this.mat.emissiveIntensity = 0;
    this.bubble.visible = k.shieldT > 0 && (k.shieldT > 2.5 || Math.floor(t * 8) % 2 === 0);
    if (this.bubble.visible) this.bubble.scale.setScalar((1.75 + Math.sin(t * 6) * 0.04) * Math.max(1, v.size));
    this.rocket.visible = k.autoT > 0;
    if (this.mark) this.mark.position.y = v.top + 0.75 + Math.sin(t * 4) * 0.08;

    // sombra apoyada en la pista
    const h = Math.max(0, y - k.gy);
    this.shadow.visible = k.fallT <= 0;
    this.shadow.position.set(x, k.gy + 0.05, z);
    const gp = Math.atan2(groundAt(T, k.ti, k.ta + 1.3, k.d) - groundAt(T, k.ti, k.ta - 1.3, k.d), 2.6);
    this.shadow.rotation.set(-Math.PI / 2 - gp, yaw, 0);
    const sc = (v.bike ? 1.2 : 1.7) * v.size * (1 + h * 0.1);
    this.shadow.scale.set(sc * (v.bike ? 0.7 : 1), sc * 1.25, 1);
    this.shadow.material = st.shadowMat;
    this.continuous(R, dt, t, h);
  }

  /** Partículas que salen mientras dura un estado. */
  continuous(R, dt, t, h) {
    const k = this.k;
    const st = this.stage;
    const v = this.v;
    const a = this.acc;
    const sp = k.v;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const rx = fz;
    const rz = -fx;
    // chispas del derrape (color según el nivel del miniturbo)
    if (k.drift && !k.air && sp > 7) {
      a.spark += dt * 80;
      const [c0, c1] = SPARK[Math.min(3, k.mtLevel)];
      while (a.spark >= 1) {
        a.spark--;
        const w = v.wheels[v.bike ? 1 : (this.side = -this.side) > 0 ? 2 : 3] || v.wheels[v.wheels.length - 1];
        this.world(w.pivot.position.x, w.r * 0.4, w.pivot.position.z - 0.1, _v);
        const out = (Math.random() * 2 - 0.5) * 2.4 * -k.drift;
        st.glow.emit(_v.x, _v.y, _v.z, fx * -sp * 0.25 + rx * out + (Math.random() - 0.5) * 1.5, 1.5 + Math.random() * 3.2, fz * -sp * 0.25 + rz * out + (Math.random() - 0.5) * 1.5, 0.3 + Math.random() * 0.22, 0.2, 0.03, c0, c1, 11, 0, 1);
      }
      a.smoke += dt * 26;
      while (a.smoke >= 1) {
        a.smoke--;
        const w = v.wheels[v.bike ? 1 : Math.random() < 0.5 ? 2 : 3] || v.wheels[v.wheels.length - 1];
        this.world(w.pivot.position.x, w.r * 0.5, w.pivot.position.z, _v);
        st.soft.emit(_v.x, _v.y, _v.z, (Math.random() - 0.5) * 1.2 - fx * 1.5, 0.5 + Math.random(), (Math.random() - 0.5) * 1.2 - fz * 1.5, 0.55, 0.4, 1.5, st.th.smoke || '#f4f1ea', st.th.smoke || '#f4f1ea', -0.4, 1.5, 0.45);
      }
    }
    // llamas del escape: empujes, invencible y cañita
    const boosting = k.boostT > 0 || k.invT > 0 || k.autoT > 0 || k.towT > 0;
    if (boosting && k.fallT <= 0) {
      const kind = k.autoT > 0 ? 'sifon' : k.invT > 0 ? '' : k.boostKind;
      const [c0, c1] = BOOST_COLOR[kind] || BOOST_COLOR[''];
      const big = k.autoT > 0 ? 2.1 : 1;
      a.flame += dt * 110;
      while (a.flame >= 1) {
        a.flame--;
        const p = k.autoT > 0 ? null : v.pipes[Math.floor(Math.random() * v.pipes.length)];
        if (p) this.world(p.x, p.y, p.z - 0.1, _v);
        else this.world(0, 0.8 + v.lift, -2.2, _v);
        st.glow.emit(_v.x, _v.y, _v.z, -fx * (5 + Math.random() * 4) * big + (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.1, -fz * (5 + Math.random() * 4) * big + (Math.random() - 0.5) * 1.2, 0.22 + Math.random() * 0.12, 0.5 * big, 0.08, c0, c1, 0, 2, 1);
      }
    }
    if (k.invT > 0 || k.autoT > 0) {
      a.glint += dt * 36;
      while (a.glint >= 1) {
        a.glint--;
        _c.setHSL(Math.random(), 1, 0.65);
        st.glow.emit(this.x + (Math.random() - 0.5) * 2.4, this.y + 0.3 + Math.random() * 1.6, this.z + (Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2, 0.5, 0.22, 0.02, '#' + _c.getHexString(), '#ffffff', 0, 1, 1);
      }
    }
    // polvo fuera de la pista y salpicado en el hielo
    if ((k.off || (st.world.T.grip < 1 && sp > 14 && Math.abs(k.slip) > 0.2)) && !k.air && sp > 4 && k.fallT <= 0) {
      a.dust += dt * (k.off ? 34 : 22) * clamp(sp / 20, 0.3, 1.2);
      const col = k.off ? st.th.dust || '#c9b27a' : '#ffffff';
      while (a.dust >= 1) {
        a.dust--;
        const w = v.wheels[Math.floor(Math.random() * v.wheels.length)];
        this.world(w.pivot.position.x, w.r * 0.4, w.pivot.position.z, _v);
        st.soft.emit(_v.x, _v.y, _v.z, (Math.random() - 0.5) * 2 - fx * sp * 0.08, 0.8 + Math.random() * 1.2, (Math.random() - 0.5) * 2 - fz * sp * 0.08, 0.6 + Math.random() * 0.3, 0.35, 1.7, col, col, -0.5, 1.2, 0.5);
      }
    }
    // estrellitas dando vueltas cuando la golpean
    if (k.spinT > 0 || k.tumbleT > 0) {
      a.star += dt * 14;
      while (a.star >= 1) {
        a.star--;
        const an = t * 7 + Math.random() * TAU;
        st.glow.emit(this.x + Math.cos(an) * 0.85, this.y + v.top + 0.25, this.z + Math.sin(an) * 0.85, -Math.sin(an) * 3, 0.6, Math.cos(an) * 3, 0.45, 0.26, 0.06, '#ffe27a', '#ffffff', 0, 0, 1);
      }
    }
    // la moto levantada echa humo de goma
    if (v.bike && k.wheelie && !k.air) {
      a.trail += dt * 14;
      while (a.trail >= 1) {
        a.trail--;
        const w = v.wheels[1];
        this.world(0, 0.3, w.pivot.position.z, _v);
        st.soft.emit(_v.x, _v.y, _v.z, -fx * 2 + (Math.random() - 0.5), 0.5, -fz * 2 + (Math.random() - 0.5), 0.5, 0.3, 1.1, '#f4f1ea', '#f4f1ea', -0.3, 1.5, 0.35);
      }
    }
  }

  dispose() {
    this.stage.scene.remove(this.root, this.shadow);
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    this.mat.dispose();
    this.bubble.geometry.dispose();
    this.bubble.material.dispose();
    if (this.mark) {
      this.mark.geometry.dispose();
      this.mark.material.dispose();
    }
  }
}
const _c = new THREE.Color();

// ---------------------------------------------------------------- cámara de persecución
class ChaseCam {
  constructor() {
    this.cam = new THREE.PerspectiveCamera(60, 1, 0.3, 1600);
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.yaw = 0;
    this.fov = 60;
    this.shake = 0;
    this.kick = 0;
    this.swing = 0;
    this.init = false;
    this.victory = 0;
  }
  snap() {
    this.init = false;
  }
  update(kv, R, dt, aspect, t) {
    const k = kv.k;
    const sp = clamp(k.v / k.P.vmax, 0, 1.3);
    const target = k.v < -1 ? kv.yaw : wrapAngle(kv.yaw + 0.5 * wrapAngle(k.dir - kv.yaw));
    if (!this.init) {
      this.yaw = target;
      this.fov = 60;
      this.init = true;
    }
    this.yaw += wrapAngle(target - this.yaw) * (1 - Math.exp(-(k.drift ? 5 : 7.5) * dt));
    this.shake = Math.max(0, this.shake - dt * 2.6);
    this.kick = damp(this.kick, 0, 3.5, dt);
    const calm = window.GameIt?.prefs?.reducedMotion ? 0.2 : 1;

    // base: horizontal ~86° en pantallas anchas; en verticales se abre un poco más
    const vf = 2 * Math.atan(Math.tan((86 * Math.PI) / 360) / aspect);
    const baseFov = clamp((vf * 180) / Math.PI, 52, 84);
    const boost = k.boostT > 0 || k.autoT > 0 || k.invT > 0 ? 7 : 0;
    this.fov = damp(this.fov, baseFov + (sp * 7 + boost + this.kick) * calm, 4, dt);

    let az = this.yaw + Math.PI;
    let dist = 6.3 + sp * 1.2 + (boost ? 0.5 : 0);
    let hgt = 2.85 + sp * 0.35 + kv.v.size * 0.35;
    let lookAhead = 4.2;
    let lookY = 1.25;
    // intro: gira alrededor del vehículo mientras dura la cuenta
    const t01 = clamp((R.t + COUNT_TIME) / (COUNT_TIME - 1.05), 0, 1);
    if (R.t < 0 && R.mode !== 'attract') {
      const e = smooth(t01);
      az += (1 - e) * 2.5;
      dist = lerp(8.6, dist, e);
      hgt = lerp(2.4, hgt, e);
      lookAhead = lerp(0, lookAhead, e);
      lookY = lerp(1.1, lookY, e);
    }
    // vuelta de la victoria: la cámara empieza a girar despacio
    if (k.finished) {
      this.victory = Math.min(1.4, this.victory + dt * 0.35);
      az += this.victory;
      dist += this.victory * 1.2;
    } else this.victory = 0;
    const gy = k.air ? lerp(kv.y, k.gy, 0.45) : kv.y;
    const px = kv.x + Math.sin(az) * dist;
    const pz = kv.z + Math.cos(az) * dist;
    const py = gy + hgt;
    const q = this.init && R.t > -COUNT_TIME + 0.05 ? 1 - Math.exp(-18 * dt) : 1;
    this.pos.x += (px - this.pos.x) * q;
    this.pos.y += (py - this.pos.y) * q;
    this.pos.z += (pz - this.pos.z) * q;
    if (!this.placed) {
      this.pos.set(px, py, pz);
      this.placed = true;
    }
    const lx = kv.x + Math.sin(this.yaw) * lookAhead;
    const lz = kv.z + Math.cos(this.yaw) * lookAhead;
    const ly = gy + lookY;
    this.look.x += (lx - this.look.x) * q;
    this.look.y += (ly - this.look.y) * q;
    this.look.z += (lz - this.look.z) * q;
    const cam = this.cam;
    cam.fov = this.fov;
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    const sh = this.shake * calm;
    cam.position.set(this.pos.x + (Math.random() - 0.5) * sh * 0.35, this.pos.y + (Math.random() - 0.5) * sh * 0.3, this.pos.z + (Math.random() - 0.5) * sh * 0.35);
    cam.lookAt(this.look);
    // un poco de rolido en las curvas
    cam.rotateZ(-kv.steerVis * 0.025 * sp);
  }
}

// ---------------------------------------------------------------- ítems sueltos
function makeBird() {
  const b = new Builder();
  b.sphere(0.5, '#b9bfcc', { p: [0, 0, 0], s: [0.8, 0.75, 1.25], seg: 9, rings: 6 });
  b.sphere(0.4, '#ffffff', { p: [0, -0.1, 0.1], s: [0.75, 0.6, 1.1], seg: 8, rings: 5 });
  b.sphere(0.3, '#1b1722', { p: [0, 0.32, 0.55], seg: 8, rings: 6 });
  b.cone(0.1, 0.4, '#ff9a1f', { p: [0, 0.25, 0.9], r: [Math.PI / 2, 0, 0], seg: 5 });
  b.mirror((s) => {
    b.sphere(0.09, '#ffffff', { p: [s * 0.15, 0.4, 0.75], seg: 6, rings: 4 });
    b.sphere(0.05, '#e8483f', { p: [s * 0.15, 0.4, 0.82], seg: 5, rings: 3 });
    b.dome(0.1, '#1b1722', { p: [s * 0.15, 0.45, 0.76], r: [-0.5, 0, s * 0.5], seg: 6, rings: 2 });
    b.tube([s * 0.1, 0.55, 0.45], [s * 0.2, 0.9, 0.1], 0.025, '#1b1722', { seg: 4 });
  });
  b.rbox(0.3, 0.06, 0.5, 0.02, '#3a3f55', { p: [0, 0.05, -0.75], r: [0.2, 0, 0] });
  const body = inked(b.build(), { thick: 0.03 });
  const wing = (s) => {
    const w = new Builder();
    w.sphere(0.5, '#b9bfcc', { p: [s * 0.55, 0, 0], s: [1.1, 0.12, 0.5], seg: 8, rings: 4 });
    w.sphere(0.3, '#1b1722', { p: [s * 1.0, 0, -0.05], s: [0.9, 0.12, 0.4], seg: 6, rings: 3 });
    const g = inked(w.build(), { thick: 0.025 });
    g.position.set(s * 0.25, 0.1, 0);
    return g;
  };
  const wl = wing(1);
  const wr = wing(-1);
  const g = new THREE.Group();
  g.add(body, wl, wr);
  g.userData.flap = (t) => {
    const a = Math.sin(t * 20) * 0.7;
    wl.rotation.z = a;
    wr.rotation.z = -a;
  };
  return g;
}

function makeStormCloud() {
  const g = new THREE.Group();
  const cloud = new THREE.Mesh(shapes.cloud('#59607a'), paintMat());
  cloud.scale.setScalar(0.34);
  g.add(cloud);
  const sh = [[0, 0], [0.5, 0], [0.1, -1.3], [0.7, -1.3], [-0.6, -3.4], [-0.15, -1.9], [-0.65, -1.9], [-0.1, 0]];
  const bolt = new THREE.Mesh(
    new THREE.ShapeGeometry(new THREE.Shape(sh.map((p) => new THREE.Vector2(p[0] * 1.3, p[1] * 1.6)))),
    new THREE.MeshBasicMaterial({ color: '#fff3a0', side: THREE.DoubleSide, fog: false }),
  );
  bolt.position.set(0, -0.4, 0.6);
  bolt.visible = false;
  g.add(bolt);
  g.userData.bolt = bolt;
  return g;
}

// ---------------------------------------------------------------- escenario
export class Stage {
  /** `opts.quality`: 1 = completo, 0.6 = liviano (celulares). */
  constructor(canvas, { quality = 1, marks = false } = {}) {
    this.canvas = canvas;
    this.quality = quality;
    this.marks = marks;
    this.outline = quality > 0.5;
    const r = (this.r = new THREE.WebGLRenderer({ canvas, antialias: quality > 0.5, powerPreference: 'high-performance' }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.autoClear = false;
    this.maxDpr = quality > 0.8 ? Math.min(2, devicePixelRatio || 1) : Math.min(1.5, devicePixelRatio || 1);
    this.dpr = this.maxDpr;
    this.ema = 1 / 60;
    this.slowT = 0;
    this.fastT = 0;
    this.backoff = 6;
    r.setPixelRatio(this.dpr);
    this.scene = new THREE.Scene();
    this.hemi = new THREE.HemisphereLight('#ffffff', '#888888', 1.5);
    this.sun = new THREE.DirectionalLight('#ffffff', 2.2);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.soft = new Particles(quality > 0.8 ? 700 : 420, false);
    this.glow = new Particles(quality > 0.8 ? 1100 : 650, true);
    this.scene.add(this.soft.points, this.glow.points);
    this.shadowGeo = new THREE.CircleGeometry(1, 20);
    this.shadowTex = canvasTex(64, 64, (g, W, H) => {
      const gr = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
      gr.addColorStop(0, 'rgba(20,10,40,.85)');
      gr.addColorStop(0.55, 'rgba(20,10,40,.5)');
      gr.addColorStop(1, 'rgba(20,10,40,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
    });
    this.shadowMat = new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true });
    this.kviews = [];
    this.ents = new Map();
    this.cams = [];
    this.world = null;
    this.th = {};
    this.weather = null;
    this.focus = new THREE.Vector3();
    this.t = 0;
    this.resize();
  }

  resize() {
    this.W = innerWidth;
    this.H = innerHeight;
    this.r.setSize(this.W, this.H, false);
  }

  /** Ajusta la resolución según lo que tarda cada cuadro, para sostener la fluidez. */
  adapt(dt) {
    if (dt <= 0 || dt > 0.5) return;
    this.ema += (dt - this.ema) * 0.08;
    if (this.ema > 0.0215) {
      this.slowT += dt;
      this.fastT = 0;
      if (this.slowT > 1.2 && this.dpr > 0.7) {
        this.dpr = Math.max(0.7, this.dpr - 0.15);
        this.r.setPixelRatio(this.dpr);
        this.r.setSize(this.W, this.H, false);
        this.slowT = 0;
        this.backoff = Math.min(40, this.backoff * 1.6);
      }
    } else {
      this.slowT = 0;
      if (this.dpr < this.maxDpr && this.ema < 0.0185) {
        this.fastT += dt;
        if (this.fastT > this.backoff) {
          this.dpr = Math.min(this.maxDpr, this.dpr + 0.15);
          this.r.setPixelRatio(this.dpr);
          this.r.setSize(this.W, this.H, false);
          this.fastT = 0;
        }
      }
    }
  }

  loadTrack(id) {
    this.clearRace();
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.dispose();
    }
    if (this.weather) {
      this.scene.remove(this.weather.points);
      this.weather.dispose();
      this.weather = null;
    }
    const T = getTrack(id);
    const w = (this.world = new World(T, this.quality));
    this.th = w.th;
    this.scene.add(w.group);
    const th = w.th;
    this.scene.background = new THREE.Color(th.fog[0]);
    this.scene.fog = new THREE.Fog(th.fog[0], th.fog[1], th.fog[2]);
    this.hemi.color.set(th.hemi[0]);
    this.hemi.groundColor.set(th.hemi[1]);
    this.hemi.intensity = th.hemi[2];
    this.sun.color.set(th.sun.color);
    this.sun.intensity = th.sun.i;
    this.sun.position.set(...th.sun.dir).multiplyScalar(60);
    if (th.particles) {
      this.weather = new Weather(th.particles, this.quality > 0.8 ? 460 : 260);
      this.scene.add(this.weather.points);
    }
    this.soft.clear();
    this.glow.clear();
    for (const c of this.cams) c.snap();
    return w;
  }

  setRace(R) {
    this.clearRace();
    this.R = R;
    this.kviews = R.karts.map((k) => new KartView(this, k));
    for (const c of this.cams) c.snap();
  }

  clearRace() {
    for (const kv of this.kviews) kv.dispose();
    this.kviews = [];
    for (const e of this.ents.values()) this.disposeEnt(e);
    this.ents.clear();
    this.R = null;
    this.soft.clear();
    this.glow.clear();
  }

  snapCameras() {
    for (const c of this.cams) {
      c.snap();
      c.placed = false;
    }
  }

  disposeEnt(e) {
    this.scene.remove(e.obj);
    e.obj.traverse((o) => {
      if (o.geometry && !o.userData.shared) o.geometry.dispose();
      if (o.material && !o.userData.shared && o.material !== paintMat() && !o.material.userData?.shared) o.material.dispose();
    });
  }

  // ------------------------------------------------------------ ítems sueltos
  makeEnt(e) {
    let obj;
    if (e.type === 'aceite') {
      obj = new THREE.Group();
      const base = new THREE.Mesh(this.shadowGeo, new THREE.MeshBasicMaterial({ color: '#17121f', fog: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      base.rotation.x = -Math.PI / 2;
      base.scale.set(e.r, e.r * 0.9, 1);
      const sheen = new THREE.Mesh(this.shadowGeo, new THREE.MeshBasicMaterial({ color: '#6a4bd6', transparent: true, opacity: 0.55, fog: true, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
      sheen.rotation.x = -Math.PI / 2;
      sheen.position.set(-0.35, 0.01, 0.2);
      sheen.scale.set(e.r * 0.45, e.r * 0.3, 1);
      obj.add(base, sheen);
    } else if (e.type === 'ruleman') {
      const b = new Builder();
      b.sphere(0.55, '#c9cfdc', { seg: 12, rings: 8 });
      b.torus(0.56, 0.07, '#5b6078', { r: [0, Math.PI / 2, 0], seg: 12, tube: 4 });
      b.torus(0.56, 0.05, '#5b6078', { r: [0, 0, 0], seg: 12, tube: 4 });
      obj = new THREE.Group();
      this.spinner = null;
      const ball = inked(b.build(), { thick: 0.04 });
      obj.add(ball);
      obj.userData.ball = ball;
    } else if (e.type === 'tero') {
      obj = makeBird();
      obj.scale.setScalar(1.3);
    } else if (e.type === 'nube') {
      obj = makeStormCloud();
      obj.scale.setScalar(1.6);
    } else obj = new THREE.Group();
    this.scene.add(obj);
    return { obj, type: e.type, seen: true, born: this.t, rain: 0 };
  }

  updateEnts(R, dt, t) {
    for (const v of this.ents.values()) v.seen = false;
    for (const e of R.ents) {
      let v = this.ents.get(e.id);
      if (!v) {
        v = this.makeEnt(e);
        this.ents.set(e.id, v);
      }
      v.seen = true;
      const o = v.obj;
      if (e.type === 'aceite') {
        const age = 50 - e.life;
        const g = Math.min(1, age * 5);
        o.position.set(e.x, e.y + 0.06, e.z);
        o.scale.setScalar(Math.max(0.01, g));
        o.rotation.y = e.yaw || 0;
        // un destello que recorre la mancha
        o.children[1].material.opacity = 0.35 + Math.sin(t * 3 + e.id) * 0.2;
      } else if (e.type === 'ruleman') {
        o.position.set(e.x, e.y, e.z);
        const ball = o.userData.ball;
        ball.rotation.y = e.dir;
        ball.rotation.x = e.spin / 0.55;
        // estela de chispas
        this.glow.emit(e.x, e.y, e.z, (Math.random() - 0.5) * 1.2, 0.4 + Math.random(), (Math.random() - 0.5) * 1.2, 0.3, 0.2, 0.02, '#d8e4ff', '#7fa0ff', 0, 0, 0.9);
      } else if (e.type === 'tero') {
        o.position.set(e.x, e.y + Math.sin(t * 9 + e.id) * 0.12, e.z);
        o.rotation.set(Math.sin(t * 9) * 0.1, e.yaw, Math.sin(t * 5) * 0.1);
        o.userData.flap(t + e.id);
        this.glow.emit(e.x, e.y, e.z, (Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5), 0.35, 0.18, 0.02, '#fff3c4', '#ffb03c', 0, 0, 0.8);
      } else if (e.type === 'nube') {
        o.position.set(e.x, e.y, e.z);
        o.rotation.y = Math.sin(t * 0.6) * 0.5;
        const hover = e.state === 'hover';
        const bolt = o.userData.bolt;
        bolt.visible = hover && Math.floor(t * 18) % 3 !== 0;
        v.rain += dt * (hover ? 90 : 36);
        while (v.rain >= 1) {
          v.rain--;
          this.soft.emit(e.x + (Math.random() - 0.5) * 5, e.y - 0.5, e.z + (Math.random() - 0.5) * 5, 0, -9, 0, 0.45, 0.14, 0.1, '#9fc4ff', '#5f8fe0', 0, 0, 0.7);
        }
      }
    }
    for (const [id, v] of this.ents) {
      if (!v.seen) {
        this.disposeEnt(v);
        this.ents.delete(id);
      }
    }
  }

  // ------------------------------------------------------------ eventos → efectos
  /** Convierte un evento de la carrera en partículas y sacudidas. `viewKarts` = vehículos que mira una cámara. */
  fx(ev, viewKarts = []) {
    const T = this.world?.T;
    if (!T) return;
    const k = ev.k;
    const mine = k && viewKarts.includes(k);
    const camOf = (kart) => {
      const i = viewKarts.indexOf(kart);
      return i < 0 ? { shake: 0, kick: 0, snap() {} } : (this.cams[i] ||= new ChaseCam());
    };
    const puff = (x, y, z, n, col, sz = 1.4, up = 1.2) => {
      for (let i = 0; i < n; i++) this.soft.emit(x + (Math.random() - 0.5) * 0.8, y, z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 3, up * (0.4 + Math.random()), (Math.random() - 0.5) * 3, 0.55 + Math.random() * 0.4, 0.3, sz, col, col, -0.4, 1.6, 0.6);
    };
    const burst = (x, y, z, n, c0, c1, speed = 6, size = 0.28, life = 0.6) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const e = Math.random() * 2 - 1;
        const r = Math.sqrt(1 - e * e);
        this.glow.emit(x, y, z, Math.cos(a) * r * speed, e * speed + 2, Math.sin(a) * r * speed, life * (0.6 + Math.random() * 0.6), size, 0.02, c0, c1, 9, 0.6, 1);
      }
    };
    switch (ev.type) {
      case 'hop':
        puff(k.x, k.y + 0.2, k.z, 3, this.th.dust || '#e8e0c8', 1, 0.6);
        break;
      case 'land':
        if ((ev.a || 0) > 4) puff(k.x, k.y + 0.2, k.z, 6, this.th.dust || '#e8e0c8', 1.6, 0.8);
        if (mine && (ev.a || 0) > 6) camOf(k).shake = Math.max(camOf(k).shake, 0.6);
        break;
      case 'wall':
        burst(k.x + Math.sin(k.dir) * 0.6, k.y + 0.5, k.z + Math.cos(k.dir) * 0.6, 8, '#fff3c4', '#ff7a1f', 5, 0.2, 0.4);
        if (mine) camOf(k).shake = Math.max(camOf(k).shake, 0.5 + (ev.a || 0) * 0.8);
        break;
      case 'bump': {
        const o = ev.a;
        if (o) burst((k.x + o.x) / 2, k.y + 0.6, (k.z + o.z) / 2, 5, '#fff3c4', '#ffb03c', 4, 0.2, 0.35);
        if (viewKarts.includes(k)) camOf(k).shake = Math.max(camOf(k).shake, 0.3);
        if (o && viewKarts.includes(o)) camOf(o).shake = Math.max(camOf(o).shake, 0.3);
        break;
      }
      case 'hit':
        burst(k.x, k.y + 1, k.z, ev.a === 'big' ? 22 : 12, '#ffe27a', '#ff7a1f', 6, 0.3, 0.6);
        puff(k.x, k.y + 0.4, k.z, 6, '#e8e8f0', 1.8, 1.4);
        if (mine) camOf(k).shake = 1;
        break;
      case 'boost':
        burst(k.x - Math.sin(k.yaw) * 1.2, k.y + 0.6, k.z - Math.cos(k.yaw) * 1.2, 10, '#ffffff', ev.a === 'mt' ? '#4ee0ff' : '#ffb03c', 6, 0.25, 0.35);
        if (mine) camOf(k).kick = Math.max(camOf(k).kick, ev.a === 'pad' || ev.a === 'start' ? 9 : 6);
        break;
      case 'mt':
        burst(k.x, k.y + 0.5, k.z, 6, SPARK[ev.a][0], SPARK[ev.a][1], 4, 0.22, 0.4);
        break;
      case 'drift':
        puff(k.x, k.y + 0.3, k.z, 4, this.th.smoke || '#f4f1ea', 1.4, 0.6);
        break;
      case 'trick':
        burst(k.x, k.y + 1, k.z, 14, '#ff6bb5', '#ffd23f', 5, 0.26, 0.6);
        break;
      case 'nut': {
        const n = T.nuts[ev.a];
        if (n) burst(n.x, n.y, n.z, 8, '#fff3c4', '#ffc93a', 3.5, 0.2, 0.45);
        break;
      }
      case 'box': {
        const b = T.boxes[ev.a];
        if (b) {
          burst(b.x, b.y, b.z, 18, '#ffffff', '#ff6bb5', 5, 0.3, 0.7);
          burst(b.x, b.y, b.z, 10, '#4ee0ff', '#ffd23f', 4, 0.24, 0.7);
        }
        break;
      }
      case 'item':
        burst(k.x, k.y + 2, k.z, 10, '#ffffff', '#ffd23f', 3, 0.24, 0.6);
        break;
      case 'use':
        if (ev.a === 'bocina') {
          for (let i = 0; i < 34; i++) {
            const a = (i / 34) * TAU;
            this.glow.emit(k.x, k.y + 0.8, k.z, Math.cos(a) * 14, 0.5, Math.sin(a) * 14, 0.5, 0.5, 0.1, '#ffffff', '#ffd23f', 0, 1.5, 0.9);
          }
          if (mine) camOf(k).shake = 0.6;
        } else if (ev.a === 'burbuja') burst(k.x, k.y + 1, k.z, 12, '#ffffff', '#9fe6ff', 4, 0.24, 0.6);
        break;
      case 'shield-pop':
        burst(k.x, k.y + 1, k.z, 26, '#ffffff', '#9fe6ff', 7, 0.28, 0.55);
        break;
      case 'steal':
        burst(ev.a.x, ev.a.y + 1, ev.a.z, 8, '#fff3c4', '#ffc93a', 4, 0.22, 0.5);
        break;
      case 'fall': {
        const water = this.th.base?.water;
        const lava = this.th.base?.emissive;
        const [c0, c1] = water ? ['#ffffff', '#4ec8ff'] : lava ? ['#ffe27a', '#ff4b1f'] : ['#ffffff', '#c9cfdc'];
        burst(k.x, k.y, k.z, 24, c0, c1, 6, 0.34, 0.8);
        puff(k.x, k.y, k.z, 6, water ? '#e8f8ff' : lava ? '#4a3442' : '#e8e0c8', 2, 1.4);
        if (mine) camOf(k).shake = 0.7;
        break;
      }
      case 'respawn':
        burst(k.x, k.y + 1, k.z, 22, '#ffffff', '#4ee0ff', 4, 0.26, 0.7);
        if (mine) camOf(k).snap();
        break;
      case 'finish':
        for (let i = 0; i < 70; i++) {
          _c.setHSL(Math.random(), 1, 0.6);
          const hex = '#' + _c.getHexString();
          this.glow.emit(k.x + (Math.random() - 0.5) * 3, k.y + 2 + Math.random() * 2, k.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 9, 4 + Math.random() * 6, (Math.random() - 0.5) * 9, 1.6 + Math.random(), 0.34, 0.1, hex, hex, 9, 0.4, 1);
        }
        break;
      case 'ent-hit':
      case 'ent-pop': {
        const e = ev.a;
        if (e) {
          burst(e.x, e.y + 0.4, e.z, 12, '#ffffff', ev.type === 'ent-hit' ? '#ff7a1f' : '#9fe6ff', 5, 0.26, 0.5);
          puff(e.x, e.y, e.z, 4, '#e8e8f0', 1.4, 1);
        }
        break;
      }
      case 'ent-bounce':
        burst(ev.k.x, ev.k.y, ev.k.z, 4, '#ffffff', '#c9cfdc', 3, 0.16, 0.3);
        break;
      case 'nube-strike': {
        const e = ev.k;
        burst(ev.b.x, ev.b.y + 1, ev.b.z, 40, '#ffffff', '#ffe27a', 10, 0.4, 0.7);
        puff(ev.b.x, ev.b.y + 0.4, ev.b.z, 10, '#59607a', 2.6, 1.6);
        void e;
        if (viewKarts.includes(ev.b)) camOf(ev.b).shake = 1.5;
        break;
      }
      case 'obs': {
        const o = ev.a;
        if (o) burst(o.x, o.y + 0.8, o.z, ev.b ? 14 : 8, '#ffffff', ev.b ? '#ff7a1f' : '#ffd23f', 6, 0.28, 0.55);
        break;
      }
      case 'go':
        for (const c of this.cams) c.kick = 10;
        break;
    }
  }

  // ------------------------------------------------------------ dibujo
  /** Dibuja otra escena (el taller) en un rectángulo de la pantalla; el resto se limpia con `clear`. */
  renderOther(scene, cam, rect, clear = '#000000') {
    const r = this.r;
    r.setScissorTest(false);
    r.setViewport(0, 0, this.W, this.H);
    r.setClearColor(clear, 1);
    r.clear(true, true, true);
    const gy = this.H - (rect.y + rect.h);
    r.setViewport(rect.x, gy, rect.w, rect.h);
    r.setScissor(rect.x, gy, rect.w, rect.h);
    r.setScissorTest(true);
    r.render(scene, cam);
    r.setScissorTest(false);
  }

  /**
   * `views`: [{ rect: { x, y, w, h } (px, y desde arriba), kart }]. Si `kart` es null se usa `pose`
   * ({ pos: Vector3|[x,y,z], look: [x,y,z], fov }) para cámaras libres de los menús.
   */
  render(R, alpha, dt, t, views) {
    this.t = t;
    const r = this.r;
    if (R && this.kviews.length) {
      for (const kv of this.kviews) kv.update(R, alpha, dt, t);
      this.updateEnts(R, dt, t);
    }
    this.soft.update(dt);
    this.glow.update(dt);
    this.world.update(R, t, dt, this.focus);
    r.setScissorTest(false);
    r.setViewport(0, 0, this.W, this.H);
    r.clear(true, true, true);
    r.setScissorTest(true);
    views.forEach((view, i) => {
      const { x, y, w, h } = view.rect;
      if (w < 2 || h < 2) return;
      const aspect = w / h;
      let cam;
      if (view.kart && this.kviews[view.kart.index]) {
        const cc = (this.cams[i] ||= new ChaseCam());
        cc.update(this.kviews[view.kart.index], R, dt, aspect, t);
        cam = cc.cam;
      } else {
        const cc = (this.cams[i] ||= new ChaseCam());
        cam = cc.cam;
        const p = view.pose;
        cam.fov = p.fov || 60;
        cam.aspect = aspect;
        cam.updateProjectionMatrix();
        cam.position.set(p.pos[0], p.pos[1], p.pos[2]);
        cam.lookAt(p.look[0], p.look[1], p.look[2]);
      }
      if (i === 0) this.focus.copy(cam.position);
      const gy = this.H - (y + h);
      r.setViewport(x, gy, w, h);
      r.setScissor(x, gy, w, h);
      const scale = (h * this.dpr) / (2 * Math.tan((cam.fov * Math.PI) / 360));
      this.soft.setScale(scale);
      this.glow.setScale(scale);
      this.weather?.update(t, cam.position, scale);
      r.render(this.scene, cam);
    });
    r.setScissorTest(false);
    this.adapt(dt);
  }

  dispose() {
    this.clearRace();
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.dispose();
    }
    this.soft.dispose();
    this.glow.dispose();
    this.weather?.dispose();
    this.shadowGeo.dispose();
    this.shadowMat.dispose();
    this.shadowTex.dispose();
    this.r.dispose();
  }
}
