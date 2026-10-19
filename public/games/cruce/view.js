/**
 * Cruce — la vista en three.js: filas (pasto, calle, vías, río) armadas en una malla por fila, lo que se mueve
 * (autos, troncos, trenes, monedas) puesto cada cuadro según el tiempo del mundo, el personaje con sus saltos y
 * las muertes, fantasmas de la carrera, partículas y la cámara ortográfica en diagonal.
 */
import * as THREE from '/vendor/three.min.js';
import { L, HALF, SPAN, TRAIN_LEN, HOP } from './shared/world.js';
import { Vox, CHARACTERS, carGeo, truckGeo, drawTree, TREE_H, logGeo, padGeo, trainGeo, eagleGeo, coinGeo } from './models.js';

const W = 15; // medio ancho de lo que se dibuja (columnas)
const GROUND_Y = { [L.GRASS]: 0.12, [L.ROAD]: 0, [L.RAIL]: 0.04, [L.RIVER]: -0.18 };
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

function waterTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#3fb5e8';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,255,255,.22)';
  for (let i = 0; i < 22; i++) {
    const x = Math.random() * 128, y = Math.random() * 128;
    g.fillRect(x, y, 10 + Math.random() * 18, 3);
  }
  g.fillStyle = 'rgba(20,90,160,.18)';
  for (let i = 0; i < 14; i++) g.fillRect(Math.random() * 128, Math.random() * 128, 14 + Math.random() * 20, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(SPAN / 4, 0.25);
  t.magFilter = THREE.NearestFilter;
  return t;
}

export class View {
  constructor(mount) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    mount.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#5aa83a');
    this.camera = new THREE.OrthographicCamera(-5, 5, 5, -5, -50, 80);
    this.dir = new THREE.Vector3(3.2, 12.5, 8.4).normalize();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7f99, 1.55));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7);
    sun.position.set(-4, 10, 5);
    this.scene.add(sun);

    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false });
    this.waterTex = waterTexture();
    this.waterMat = new THREE.MeshLambertMaterial({ map: this.waterTex, color: 0xffffff });
    this.coinMat = new THREE.MeshLambertMaterial({ color: '#ffcc00', emissive: '#a86b00', emissiveIntensity: 0.35 });
    this.geo = {
      chars: CHARACTERS.map((c) => c.build()),
      cars: [0, 1, 2, 3, 4, 5].map(carGeo),
      trucks: [0, 1, 2].map(truckGeo),
      logs: new Map(),
      pad: padGeo(),
      train: trainGeo(TRAIN_LEN),
      eagle: eagleGeo(),
      coin: coinGeo(),
      plane: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    };

    this.rows = new Map();
    this.focus = new THREE.Vector3(0, 0, 0);
    this.zoom = 1;
    this.shakeT = 0;
    this.reduced = false;

    // personaje
    this.player = this.makeActor(0);
    this.scene.add(this.player.root);
    this.ghosts = new Map();

    // águila
    this.eagle = new THREE.Mesh(this.geo.eagle, this.mat);
    this.eagle.visible = false;
    this.scene.add(this.eagle);

    // partículas (cubitos)
    this.bits = [];
    const cube = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(cube, new THREE.MeshLambertMaterial({ color: 0xffffff }));
      m.visible = false;
      m.userData = { vx: 0, vy: 0, vz: 0, life: 0, max: 1, s: 0.1, grav: 14 };
      this.scene.add(m);
      this.bits.push(m);
    }
    this.bitNext = 0;
    this.resize();
  }

  makeActor(charIdx, ghost = false, color = null) {
    const root = new THREE.Group();
    const body = new THREE.Group();
    const mat = ghost ? new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false }) : this.mat;
    const mesh = new THREE.Mesh(this.geo.chars[charIdx] || this.geo.chars[0], mat);
    body.add(mesh);
    root.add(body);
    const shadow = new THREE.Mesh(this.geo.plane, this.shadowMat);
    shadow.scale.set(0.62, 1, 0.62);
    root.add(shadow);
    let ring = null;
    if (ghost && color) {
      ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.44, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
      root.add(ring);
    }
    return { root, body, mesh, shadow, ring, face: 0, squash: 0, char: charIdx };
  }

  setChar(actor, idx) {
    actor.char = idx;
    actor.mesh.geometry = this.geo.chars[idx] || this.geo.chars[0];
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    // en vertical entra el ancho jugable con aire; en horizontal, una altura fija
    let vw, vh;
    if (aspect < 0.8) {
      vw = 11.2;
      vh = vw / aspect;
    } else {
      vh = 11.5;
      vw = vh * aspect;
    }
    this.vw = vw;
    this.vh = vh;
    this.updateFrustum();
  }
  updateFrustum() {
    const z = this.zoom;
    this.camera.left = (-this.vw / 2) * z;
    this.camera.right = (this.vw / 2) * z;
    this.camera.top = (this.vh / 2) * z;
    this.camera.bottom = (-this.vh / 2) * z;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ filas
  clearRows() {
    for (const r of this.rows.values()) this.dropRow(r);
    this.rows.clear();
  }
  dropRow(o) {
    this.scene.remove(o.group);
    o.ground.geometry.dispose();
    o.shadows?.geometry.dispose();
  }

  /** Arma (o descarta) las filas entre lo y hi. */
  syncRows(world, lo, hi) {
    for (const [r, o] of this.rows) {
      if (r < lo || r > hi) {
        this.dropRow(o);
        this.rows.delete(r);
      }
    }
    for (let r = lo; r <= hi; r++) if (!this.rows.has(r)) this.rows.set(r, this.makeRow(world, r));
  }

  makeRow(world, r) {
    const row = world.row(r);
    const group = new THREE.Group();
    group.position.z = -r;
    const b = new Vox();
    const sh = new Vox();
    const o = { group, row, r, cars: [], logs: [], coins: [], train: null, signal: null };
    const next = world.row(r + 1);
    const prevRow = world.row(r - 1);
    if (row.type === L.GRASS) {
      const light = row.mark === 'check' ? '#9be35a' : row.shade ? '#8fd14f' : '#84c947';
      const dark = row.shade ? '#5c9632' : '#558e2d';
      b.box(0, -0.6, 0, HALF * 2 + 1, 0.72, 1, light);
      b.box(-(HALF + 0.5 + (W - HALF) / 2), -0.6, 0, W - HALF, 0.72, 1, dark);
      b.box(HALF + 0.5 + (W - HALF) / 2, -0.6, 0, W - HALF, 0.72, 1, dark);
      if (row.mark === 'finish') for (let c = -HALF; c <= HALF; c++) for (const k of [0, 1]) b.box(c + (k ? 0.25 : -0.25), 0.12, 0.25 - k * 0.5, 0.5, 0.012, 0.5, (c + k) % 2 ? '#ffffff' : '#222433');
      if (row.mark) {
        // banderines a los costados
        for (const s of [-1, 1]) {
          b.at(s * (HALF + 0.9), 0.12, 0);
          b.box(0, 0, 0, 0.08, 1.5, 0.08, '#eeeeee');
          b.box(s * -0.22, 1.1, 0, 0.42, 0.3, 0.04, row.mark === 'finish' ? '#ffcc00' : '#ff4d8d');
        }
        b.at(0, 0, 0);
      }
      const trees = [...row.trees, ...row.decor];
      for (const c of trees) {
        const kind = (Math.abs(c * 7 + r * 13) % 5) | 0;
        b.at(c, 0.12, 0);
        b.dim = Math.abs(c) > HALF ? 0.78 : 1;
        drawTree(b, kind);
        sh.box(c + 0.18, 0.125, 0.12, 0.74, 0.004, 0.62, '#000');
      }
      b.at(0, 0, 0);
      b.dim = 1;
      // pastitos y flores sueltas
      for (let k = 0; k < 6; k++) {
        const c = ((r * 31 + k * 17) % (W * 2)) - W + 0.3 * k;
        if (Math.abs(Math.round(c)) <= HALF && row.trees.has(Math.round(c))) continue;
        const z = (((r * 7 + k * 5) % 10) / 10 - 0.5) * 0.8;
        b.box(c, 0.12, z, 0.12, 0.08, 0.12, k % 3 ? '#5f9e32' : k % 2 ? '#ffffff' : '#ffd23f');
      }
    } else if (row.type === L.ROAD) {
      b.box(0, -0.6, 0, W * 2 + 1, 0.6, 1, '#4d5260');
      b.box(-(HALF + 0.5 + (W - HALF) / 2), -0.6, 0, W - HALF, 0.601, 1, '#3a3d48');
      b.box(HALF + 0.5 + (W - HALF) / 2, -0.6, 0, W - HALF, 0.601, 1, '#3a3d48');
      if (next.type === L.ROAD) for (let x = -W; x < W; x += 1.2) b.box(x + 0.3, 0, -0.5, 0.55, 0.012, 0.07, '#e8e8e8');
      if (next.type !== L.ROAD) b.box(0, 0, -0.47, W * 2 + 1, 0.05, 0.06, '#6b707d');
      if (prevRow.type !== L.ROAD) b.box(0, 0, 0.47, W * 2 + 1, 0.05, 0.06, '#6b707d');
      row.cars.forEach((c) => {
        const geo = c.kind === 'truck' ? this.geo.trucks[(r + c.o) % 3 | 0] : this.geo.cars[c.kind];
        const m = new THREE.Mesh(geo, this.mat);
        if (row.dir < 0) m.rotation.y = Math.PI;
        const s = new THREE.Mesh(this.geo.plane, this.shadowMat);
        s.scale.set(c.len + 0.1, 1, 0.9);
        s.position.set(0.12, 0.006, 0.1);
        m.add(s);
        group.add(m);
        o.cars.push(m);
      });
    } else if (row.type === L.RAIL) {
      b.box(0, -0.6, 0, W * 2 + 1, 0.64, 1, '#8c7f73');
      for (let x = -W; x <= W; x += 0.55) b.box(x, 0.04, 0, 0.16, 0.05, 0.86, '#6b4a33');
      for (const z of [-0.24, 0.24]) b.box(0, 0.09, z, W * 2 + 1, 0.06, 0.07, '#c9ced6');
      // poste con la luz
      b.at(HALF + 1, 0.04, -0.42);
      b.box(0, 0, 0, 0.1, 1.1, 0.1, '#55595f');
      b.box(0, 1.0, 0.02, 0.36, 0.2, 0.1, '#2d3036');
      b.at(0, 0, 0);
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.04), new THREE.MeshBasicMaterial({ color: '#4a1414' }));
      light.position.set(HALF + 1, 1.14, -0.36);
      group.add(light);
      o.signal = light;
      const train = new THREE.Mesh(this.geo.train, this.mat);
      if (row.dir < 0) train.rotation.y = Math.PI;
      train.visible = false;
      group.add(train);
      o.train = train;
    } else if (row.type === L.RIVER) {
      b.box(0, -0.6, 0, W * 2 + 1, 0.3, 1, '#1d5f8c');
      const water = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 + 1, 1).rotateX(-Math.PI / 2), this.waterMat);
      water.position.y = -0.2;
      group.add(water);
      o.water = water;
      if (prevRow.type !== L.RIVER) b.box(0, -0.24, 0.46, W * 2 + 1, 0.06, 0.08, '#d8f3ff');
      if (row.pads) {
        for (const c of row.pads) {
          const m = new THREE.Mesh(this.geo.pad, this.mat);
          m.position.x = c;
          group.add(m);
        }
      }
      for (const l of row.logs) {
        if (!this.geo.logs.has(l.len)) this.geo.logs.set(l.len, logGeo(l.len));
        const m = new THREE.Mesh(this.geo.logs.get(l.len), this.mat);
        const s = new THREE.Mesh(this.geo.plane, this.shadowMat);
        s.scale.set(l.len, 1, 0.74);
        s.position.set(0.1, -0.015, 0.08);
        m.add(s);
        group.add(m);
        o.logs.push(m);
      }
    }
    for (const c of row.coins) {
      const m = new THREE.Mesh(this.geo.coin, this.coinMat);
      m.position.set(c, GROUND_Y[row.type] + 0.38, 0);
      m.userData.col = c;
      group.add(m);
      o.coins.push(m);
    }
    o.ground = new THREE.Mesh(b.geometry(), this.mat);
    group.add(o.ground);
    if (!sh.empty) {
      o.shadows = new THREE.Mesh(sh.geometry(), this.shadowMat);
      group.add(o.shadows);
    }
    this.scene.add(group);
    return o;
  }

  /** Mueve autos, troncos y trenes según el tiempo del mundo; devuelve las filas de vías con alarma (para el sonido). */
  updateRows(world, t, dt) {
    const warn = [];
    this.waterTex.offset.x = (this.waterTex.offset.x + dt * 0.03) % 1;
    for (const o of this.rows.values()) {
      const row = o.row;
      if (row.type === L.ROAD) {
        const cars = world.cars(row, t);
        for (let i = 0; i < cars.length; i++) {
          o.cars[i].position.x = cars[i].x;
          o.cars[i].position.y = Math.abs(Math.sin(t * 9 + i * 1.7)) * 0.025;
        }
      } else if (row.type === L.RIVER) {
        const logs = world.logsAt(row, t);
        for (let i = 0; i < logs.length; i++) {
          o.logs[i].position.x = logs[i].x;
          o.logs[i].position.y = Math.sin(t * 2.2 + i) * 0.02;
        }
      } else if (row.type === L.RAIL) {
        const tr = world.train(row, t);
        o.train.visible = !!tr.on;
        if (tr.on) o.train.position.x = (tr.on.x0 + tr.on.x1) / 2;
        const blink = tr.warn && Math.floor(t * 6) % 2 === 0;
        o.signal.material.color.set(blink ? '#ff2a2a' : '#4a1414');
        if (tr.warn) warn.push(o.r);
      }
      for (const c of o.coins) {
        const taken = world.taken.has(`${o.r}:${c.userData.col}`);
        if (taken && c.visible && !c.userData.pop) c.userData.pop = 0.001;
        if (c.userData.pop) {
          c.userData.pop += dt;
          const k = c.userData.pop / 0.35;
          c.position.y = GROUND_Y[row.type] + 0.38 + k * 1.2;
          c.scale.setScalar(Math.max(0.01, 1 - k));
          if (k >= 1) c.visible = false;
        }
        c.rotation.y += dt * 3;
      }
    }
    return warn;
  }

  // ------------------------------------------------------------ personaje
  /** Pone a un actor según el saltador (o un estado de fantasma): x, fila, salto, mirada. */
  pose(actor, s, dt, world) {
    const row = world.row(s.row);
    const toRow = s.hop ? world.row(s.hop.to) : row;
    const k = s.hop ? s.hop.k : 0;
    const groundOf = (rw, onLog) => (rw.type === L.RIVER ? (onLog ? 0.2 : rw.pads ? -0.1 : -0.2) : GROUND_Y[rw.type]);
    const g0 = groundOf(row, !!s.ride || (row.type === L.RIVER && !row.pads));
    const g1 = groundOf(toRow, toRow.type === L.RIVER && !toRow.pads);
    const z = s.hop ? -(s.hop.from + (s.hop.to - s.hop.from) * k) : -s.row;
    const y = g0 + (g1 - g0) * k + Math.sin(k * Math.PI) * 0.52;
    actor.root.position.set(s.x, 0, z);
    actor.body.position.y = y;
    actor.shadow.position.y = (s.hop ? g0 + (g1 - g0) * k : g0) + 0.006;
    actor.shadow.scale.setScalar(0.62 * (1 - Math.sin(k * Math.PI) * 0.35));
    if (actor.ring) actor.ring.position.y = actor.shadow.position.y + 0.004;
    const want = s.face === 'cam' ? Math.atan2(-this.dir.x, -this.dir.z) : ({ up: 0, down: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 }[s.face] ?? 0);
    let d = want - actor.face;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    actor.face += d * Math.min(1, dt * 22);
    actor.body.rotation.y = actor.face;
    // estirar al saltar y aplastar al caer
    if (actor.squash > 0) actor.squash = Math.max(0, actor.squash - dt * 7);
    const sq = Math.sin(actor.squash * Math.PI) * 0.22;
    const st = s.hop ? Math.sin(k * Math.PI) * 0.12 : 0;
    actor.body.scale.set(1 + sq - st * 0.5, 1 - sq + st, 1 + sq - st * 0.5);
  }

  // ------------------------------------------------------------ fantasmas
  ghost(id, charIdx, color) {
    let g = this.ghosts.get(id);
    if (!g) {
      g = this.makeActor(charIdx, true, color);
      g.state = null;
      this.scene.add(g.root);
      this.ghosts.set(id, g);
    } else if (g.char !== charIdx) this.setChar(g, charIdx);
    return g;
  }
  dropGhosts() {
    for (const g of this.ghosts.values()) {
      this.scene.remove(g.root);
      g.mesh.material.dispose();
    }
    this.ghosts.clear();
  }

  // ------------------------------------------------------------ efectos
  bit(x, y, z, color, { s = 0.1, sp = 3, up = 3, life = 0.6, grav = 14 } = {}) {
    if (this.reduced && Math.random() < 0.6) return;
    const m = this.bits[this.bitNext];
    this.bitNext = (this.bitNext + 1) % this.bits.length;
    m.visible = true;
    m.material.color.set(color);
    m.position.set(x, y, z);
    const a = rand(0, TAU);
    const v = rand(0.3, 1) * sp;
    Object.assign(m.userData, { vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: rand(0.5, 1) * up, life: 0, max: life * rand(0.7, 1.2), s, grav });
    m.scale.setScalar(s);
    m.rotation.set(rand(0, 3), rand(0, 3), 0);
  }
  dust(x, y, z) {
    for (let i = 0; i < 5; i++) this.bit(x, y + 0.05, z, '#e9e4d6', { s: 0.09, sp: 1.6, up: 1.2, life: 0.35, grav: 4 });
  }
  splash(x, z) {
    for (let i = 0; i < 16; i++) this.bit(x, -0.15, z, i % 3 ? '#bfeeff' : '#ffffff', { s: 0.11, sp: 2.2, up: 5, life: 0.7 });
  }
  burst(x, y, z, color) {
    for (let i = 0; i < 18; i++) this.bit(x, y, z, i % 2 ? color : '#ffffff', { s: 0.12, sp: 4, up: 5, life: 0.8 });
  }
  shake(t = 0.25) {
    if (!this.reduced) this.shakeT = Math.max(this.shakeT, t);
  }

  // ------------------------------------------------------------ cuadro
  frame(dt) {
    for (const m of this.bits) {
      if (!m.visible) continue;
      const u = m.userData;
      u.life += dt;
      if (u.life >= u.max) {
        m.visible = false;
        continue;
      }
      u.vy -= u.grav * dt;
      m.position.x += u.vx * dt;
      m.position.y += u.vy * dt;
      m.position.z += u.vz * dt;
      m.scale.setScalar(u.s * (1 - (u.life / u.max) ** 2));
    }
    let sx = 0, sz = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      sx = rand(-0.12, 0.12);
      sz = rand(-0.12, 0.12);
    }
    const f = this.focus;
    const d = this.dir;
    this.camera.position.set(f.x + d.x * 30 + sx, f.y + d.y * 30, f.z + d.z * 30 + sz);
    this.camera.lookAt(f.x + sx, f.y, f.z + sz);
    this.renderer.render(this.scene, this.camera);
  }

  toScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  }
}

export { HOP };
