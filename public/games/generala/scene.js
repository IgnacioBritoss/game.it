/**
 * Generala — la mesa en three.js: paño verde con borde de madera, cinco dados de esquinas redondeadas con los puntos
 * pintados, el cubilete de cuero que se sacude y vuelca, y la fila de adelante donde van los dados guardados.
 * No sabe de reglas: game.js le dice qué valores salieron y esta escena anima la tirada para que caigan así.
 */
import * as THREE from '/vendor/three.min.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const easeOut = (u) => 1 - (1 - u) ** 2.4;
const easeInOut = (u) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

export const DIE = 0.62; // lado del dado
const R = DIE / 2;
const FELT = { w: 7.6, d: 5.2 }; // paño
const HELD_Z = 1.72; // fila de los guardados
const CUP_HOME = new THREE.Vector3(2.5, 0, -1.72);

// ---------------------------------------------------------------- texturas
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Paño verde con pelusa y una viñeta suave. */
function feltTex() {
  return canvasTex(1024, 704, (g, w, h) => {
    g.fillStyle = '#1f7a4a';
    g.fillRect(0, 0, w, h);
    const im = g.getImageData(0, 0, w, h);
    let s = 7;
    for (let i = 0; i < im.data.length; i += 4) {
      s = (s * 16807) % 2147483647;
      const n = ((s % 1000) / 1000 - 0.5) * 18;
      im.data[i] = clamp(im.data[i] + n * 0.6, 0, 255);
      im.data[i + 1] = clamp(im.data[i + 1] + n, 0, 255);
      im.data[i + 2] = clamp(im.data[i + 2] + n * 0.7, 0, 255);
    }
    g.putImageData(im, 0, 0);
    const v = g.createRadialGradient(w / 2, h * 0.45, h * 0.2, w / 2, h / 2, w * 0.62);
    v.addColorStop(0, 'rgba(255,255,220,.10)');
    v.addColorStop(1, 'rgba(0,20,10,.45)');
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
    // la fila de los guardados: una franja más oscura con costura
    const yz = ((HELD_Z + FELT.d / 2) / FELT.d) * h;
    const bh = (DIE * 1.45 * h) / FELT.d;
    g.fillStyle = 'rgba(0,30,15,.28)';
    g.beginPath();
    g.roundRect(w * 0.08, yz - bh / 2, w * 0.84, bh, bh * 0.3);
    g.fill();
    g.strokeStyle = 'rgba(240,220,160,.35)';
    g.setLineDash([10, 8]);
    g.lineWidth = 2.5;
    g.beginPath();
    g.roundRect(w * 0.085, yz - bh / 2 + 5, w * 0.83, bh - 10, bh * 0.26);
    g.stroke();
  });
}

function woodTex() {
  return canvasTex(512, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#8a4f24');
    gr.addColorStop(0.5, '#6b3a17');
    gr.addColorStop(1, '#4a260e');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(${30 + Math.random() * 40},${15 + Math.random() * 20},5,${0.12 + Math.random() * 0.18})`;
      g.lineWidth = 0.6 + Math.random() * 1.6;
      const y = Math.random() * h;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + rand(-6, 6), w * 0.7, y + rand(-6, 6), w, y + rand(-4, 4));
      g.stroke();
    }
  });
}

function leatherTex() {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#5b2e14';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,220,180' : '20,8,0'},${Math.random() * 0.06})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 4, 1 + Math.random() * 3);
    }
    // bandas y costuras
    for (const y of [h * 0.1, h * 0.86]) {
      g.fillStyle = '#3f1d0a';
      g.fillRect(0, y - 9, w, 18);
      g.strokeStyle = 'rgba(240,210,150,.75)';
      g.lineWidth = 2;
      g.setLineDash([9, 7]);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    g.setLineDash([]);
    g.fillStyle = 'rgba(255,230,190,.12)';
    g.fillRect(0, h * 0.3, w, h * 0.08);
  });
}

const PIPS = {
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.28, 0.25], [0.72, 0.25], [0.28, 0.5], [0.72, 0.5], [0.28, 0.75], [0.72, 0.75]],
};
function faceTex(v) {
  return canvasTex(256, 256, (g, w) => {
    const bg = g.createRadialGradient(w * 0.4, w * 0.35, w * 0.1, w / 2, w / 2, w * 0.75);
    bg.addColorStop(0, '#fffdf6');
    bg.addColorStop(1, '#ece2cc');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, w);
    const r = v === 1 ? w * 0.13 : w * 0.085;
    for (const [x, y] of PIPS[v]) {
      const px = x * w, py = y * w;
      const pg = g.createRadialGradient(px - r * 0.3, py - r * 0.3, r * 0.1, px, py, r);
      if (v === 1) {
        pg.addColorStop(0, '#ff5a4e');
        pg.addColorStop(1, '#9d140d');
      } else {
        pg.addColorStop(0, '#3a3a44');
        pg.addColorStop(1, '#08080c');
      }
      g.fillStyle = pg;
      g.beginPath();
      g.arc(px, py, r, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,.55)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(px, py, r + 1, Math.PI * 0.15, Math.PI * 0.85);
      g.stroke();
    }
  });
}

/** Caja de esquinas redondeadas (las normales salen del centro de cada redondeo). */
function roundedBox(size, r, seg) {
  const g = new THREE.BoxGeometry(size, size, size, seg, seg, seg);
  const p = g.attributes.position, nrm = g.attributes.normal;
  const h = size / 2 - r;
  const v = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(clamp(v.x, -h, h), clamp(v.y, -h, h), clamp(v.z, -h, h));
    d.subVectors(v, c).normalize();
    v.copy(c).addScaledVector(d, r);
    p.setXYZ(i, v.x, v.y, v.z);
    nrm.setXYZ(i, d.x, d.y, d.z);
  }
  return g;
}

/** Orientación con el valor v arriba (caras: +x 3, −x 4, +y 1, −y 6, +z 2, −z 5). */
const UP = {
  1: new THREE.Quaternion(),
  6: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI),
  3: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
  4: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2),
  2: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
  5: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
};
const Y = new THREE.Vector3(0, 1, 0);
const restQuat = (v, yaw) => new THREE.Quaternion().setFromAxisAngle(Y, yaw).multiply(UP[v]);

// ---------------------------------------------------------------- la mesa
export class DiceTable {
  constructor(mount) {
    this.mount = mount;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    mount.appendChild(r.domElement);
    this.canvas = r.domElement;
    const S = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
    S.add(new THREE.HemisphereLight('#fff6e6', '#30402c', 1.15));
    const key = new THREE.DirectionalLight('#fff1d6', 1.7);
    key.position.set(-3, 9, 4);
    S.add(key);
    const rim = new THREE.DirectionalLight('#bfd8ff', 0.5);
    rim.position.set(4, 4, -6);
    S.add(rim);
    // lámpara cálida sobre la mesa
    const lamp = new THREE.PointLight('#ffd9a0', 9, 14, 1.6);
    lamp.position.set(0, 4.2, 0.4);
    S.add(lamp);

    // paño y borde de madera
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(FELT.w, FELT.d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: feltTex(), roughness: 0.95 }));
    S.add(felt);
    const wood = new THREE.MeshStandardMaterial({ map: woodTex(), roughness: 0.45, metalness: 0.05 });
    const rail = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.28, d), wood);
      m.position.set(x, 0.1, z);
      S.add(m);
    };
    const T = 0.42;
    rail(FELT.w + T * 2, T, 0, -FELT.d / 2 - T / 2);
    rail(FELT.w + T * 2, T, 0, FELT.d / 2 + T / 2);
    rail(T, FELT.d, -FELT.w / 2 - T / 2, 0);
    rail(T, FELT.d, FELT.w / 2 + T / 2, 0);
    // la mesa sigue más allá (madera oscura)
    const under = new THREE.Mesh(new THREE.PlaneGeometry(40, 30).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2a170b', roughness: 0.8 }));
    under.position.y = -0.04;
    S.add(under);

    // sombras redondas
    const sh = canvasTex(64, 64, (g, w) => {
      const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0, 'rgba(0,0,0,.55)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, w);
    });
    this.shadowMat = new THREE.MeshBasicMaterial({ map: sh, transparent: true, depthWrite: false });
    const ring = canvasTex(128, 128, (g, w) => {
      const gr = g.createRadialGradient(w / 2, w / 2, w * 0.28, w / 2, w / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,214,110,0)');
      gr.addColorStop(0.55, 'rgba(255,214,110,.9)');
      gr.addColorStop(1, 'rgba(255,214,110,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, w);
    });

    // dados
    const geo = roundedBox(DIE, 0.11, 5);
    const mats = [3, 4, 1, 6, 2, 5].map((v) => new THREE.MeshStandardMaterial({ map: faceTex(v), roughness: 0.32, metalness: 0, emissive: new THREE.Color('#fff1c2'), emissiveIntensity: 0 }));
    this.dice = [];
    for (let i = 0; i < 5; i++) {
      // cada dado tiene sus propios materiales para poder resaltarlo solo
      const m = new THREE.Mesh(geo, mats.map((x) => x.clone()));
      S.add(m);
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(DIE * 1.9, DIE * 1.9).rotateX(-Math.PI / 2), this.shadowMat);
      shadow.position.y = 0.004;
      S.add(shadow);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(DIE * 2.1, DIE * 2.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ring, transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending }));
      glow.position.y = 0.006;
      S.add(glow);
      const d = { i, m, shadow, glow, value: i + 1, held: false, visible: true, anim: null, rest: new THREE.Vector3(), restQ: new THREE.Quaternion(), mark: 0, markT: 0, hop: 0 };
      this.dice.push(d);
    }

    // cubilete
    const cup = new THREE.Group();
    const leather = new THREE.MeshStandardMaterial({ map: leatherTex(), roughness: 0.62 });
    const inner = new THREE.MeshStandardMaterial({ color: '#1b0d05', roughness: 0.9, side: THREE.BackSide });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.52, 1.25, 40, 1, true), leather);
    body.position.y = 0.625;
    cup.add(body);
    const inside = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.5, 1.22, 40, 1, true), inner);
    inside.position.y = 0.64;
    cup.add(inside);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.52, 40).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#3f1d0a', roughness: 0.7 }));
    bottom.position.y = 0.01;
    cup.add(bottom);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.61, 0.035, 10, 48).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2b1306', roughness: 0.5 }));
    lip.position.y = 1.25;
    cup.add(lip);
    cup.position.copy(CUP_HOME);
    S.add(cup);
    const cupShadow = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), this.shadowMat);
    cupShadow.position.y = 0.005;
    S.add(cupShadow);
    this.cup = { g: cup, shadow: cupShadow, anim: null, hover: 0 };

    this.ray = new THREE.Raycaster();
    this.onHit = null; // (fuerza) cuando un dado golpea el paño
    this.onLand = null;
    this.reduced = false;
    this.time = 0;
    this.layoutRests();
    for (const d of this.dice) this.placeAtRest(d);
  }

  // ---------------------------------------------------------- tamaño y cámara
  resize(w, h) {
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, false);
    const cam = this.camera;
    cam.aspect = w / h;
    // que entre todo el paño a lo ancho y a lo largo
    const fovV = (cam.fov * Math.PI) / 180;
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * cam.aspect);
    // en pantallas angostas se recortan los bordes de madera para que los dados se vean grandes
    const narrow = cam.aspect < 1.5;
    const needW = narrow ? 6.85 : FELT.w + 1.2, needD = narrow ? FELT.d - 0.2 : FELT.d + 1.0;
    const elev = narrow ? 1.08 : 0.98; // ángulo de la cámara sobre la mesa
    const distW = needW / 2 / Math.tan(fovH / 2);
    const distD = (needD * Math.sin(elev)) / 2 / Math.tan(fovV / 2) + needD * 0.45 * Math.cos(elev);
    const dist = Math.max(distW, distD) * 1.02;
    cam.position.set(0, Math.sin(elev) * dist, Math.cos(elev) * dist + 0.25);
    cam.lookAt(0, 0, 0.25);
    cam.updateProjectionMatrix();
  }

  // ---------------------------------------------------------- lugares de los dados
  /** Lugares sueltos (sin encimarse) para los dados recién tirados. */
  layoutRests() {
    const pts = [];
    for (let tries = 0; pts.length < 5 && tries < 400; tries++) {
      const p = new THREE.Vector3(rand(-2.6, 1.55), R, rand(-1.5, 0.75));
      if (pts.every((q) => q.distanceTo(p) > DIE * 1.55)) pts.push(p);
    }
    while (pts.length < 5) pts.push(new THREE.Vector3(-2.4 + pts.length * 1.1, R, -0.3));
    this.free = pts;
  }
  heldSpot(i) {
    return new THREE.Vector3(-2.4 + i * 1.2, R, HELD_Z);
  }

  placeAtRest(d) {
    d.m.position.copy(d.held ? this.heldSpot(d.i) : this.free[d.i]);
    d.rest.copy(d.m.position);
    d.restQ.copy(restQuat(d.value, rand(-0.5, 0.5)));
    d.m.quaternion.copy(d.restQ);
  }

  /** Sin animar: los dados ya están así (al reconectarse o empezar). `visible`: false = adentro del cubilete. */
  set(values, held, visible = true) {
    this.layoutRests();
    this.dice.forEach((d, i) => {
      d.value = values[i];
      d.held = !!held[i];
      d.visible = visible;
      d.anim = null;
      this.placeAtRest(d);
    });
  }

  // ---------------------------------------------------------- animaciones
  /** Los dados vuelven al cubilete (empieza un turno). */
  gather() {
    const mouth = this.cupMouth();
    for (const d of this.dice) {
      d.held = false;
      if (!d.visible) continue;
      const from = d.m.position.clone(), q0 = d.m.quaternion.clone();
      d.anim = { k: 'gather', t: 0, dur: 0.32 + d.i * 0.04, from, to: mouth.clone(), q0 };
    }
  }

  cupMouth() {
    return new THREE.Vector3(CUP_HOME.x, 1.3, CUP_HOME.z);
  }

  /** Un dado pasa a la fila de los guardados (o vuelve a su lugar). */
  setHeld(i, held) {
    const d = this.dice[i];
    if (d.held === held || !d.visible) return;
    d.held = held;
    const to = held ? this.heldSpot(i) : this.free[i];
    d.anim = { k: 'slide', t: 0, dur: this.reduced ? 0.01 : 0.28, from: d.m.position.clone(), to, q0: d.m.quaternion.clone(), q1: d.restQ.clone() };
  }

  /**
   * Tirada: los dados que no están guardados van al cubilete, se sacude, se vuelca y caen con `values`.
   * `done` se llama cuando quedan quietos.
   */
  roll(values, held, done) {
    this.layoutRests();
    const cup = this.cup;
    const fast = this.reduced;
    const back = this.dice.some((d) => !held[d.i] && d.visible) ? 0.28 : 0;
    // los guardados van a su fila
    this.dice.forEach((d) => {
      if (held[d.i]) this.setHeld(d.i, true);
    });
    const shake = fast ? 0.05 : 0.42;
    const tip = fast ? 0.05 : 0.14;
    const pour = back + 0.12 + shake + tip * 0.6;
    cup.anim = { t: 0, back, shake, tip, dur: pour + 0.55 };
    const mouth = this.cupMouth();
    let last = 0;
    this.dice.forEach((d, i) => {
      if (held[i]) return;
      d.value = values[i];
      d.held = false;
      const from = d.visible ? d.m.position.clone() : mouth.clone();
      const q0 = d.m.quaternion.clone();
      const to = this.free[i];
      const q1 = restQuat(values[i], rand(-0.6, 0.6));
      const axis = new THREE.Vector3(rand(-1, 1), rand(-0.3, 0.3), rand(-1, 1)).normalize();
      const delay = pour + i * 0.035 + rand(0, 0.05);
      const dur = fast ? 0.2 : rand(0.72, 0.92);
      last = Math.max(last, delay + dur);
      d.anim = { k: 'roll', t: 0, back: d.visible ? back : 0, from, q0, delay, dur, to, q1, axis, spin: TAU * rand(1.6, 2.8), hits: 0 };
      d.restQ.copy(q1);
      d.rest.copy(to);
    });
    this.onDone = done;
    this.doneAt = this.time + last + 0.05;
  }

  /** Resalta los dados de `mask` (los que cuentan para la categoría que se mira). */
  mark(mask) {
    this.dice.forEach((d, i) => (d.mark = mask ? (mask[i] ? 1 : 0) : 0));
  }

  /** Festejo: los dados saltan uno por uno. */
  celebrate() {
    if (this.reduced) return;
    this.dice.forEach((d, i) => {
      if (d.visible) d.hop = -i * 0.08;
    });
  }

  // ---------------------------------------------------------- tocar
  /** Índice del dado bajo el punto (px dentro del canvas), o −1. 'cup' si es el cubilete. */
  pick(x, y) {
    const v = new THREE.Vector2((x / this.w) * 2 - 1, -(y / this.h) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    const hits = this.ray.intersectObjects([...this.dice.filter((d) => d.visible).map((d) => d.m), this.cup.g], true);
    if (!hits.length) {
      // tolerancia: el dado más cerca del punto en pantalla
      let best = -1, bd = 1e9;
      for (const d of this.dice) {
        if (!d.visible) continue;
        const p = d.m.position.clone().project(this.camera);
        const sx = (p.x * 0.5 + 0.5) * this.w, sy = (-p.y * 0.5 + 0.5) * this.h;
        const dd = Math.hypot(sx - x, sy - y);
        if (dd < bd) {
          bd = dd;
          best = d.i;
        }
      }
      const lim = (Math.min(this.w, this.h) / 9) * 0.9;
      return bd < lim ? best : -1;
    }
    const o = hits[0].object;
    const d = this.dice.find((x) => x.m === o);
    return d ? d.i : 'cup';
  }

  /** Dónde se ve un dado en pantalla (px dentro del canvas). */
  screenOf(i) {
    const p = this.dice[i].m.position.clone();
    p.y += R * 1.4;
    p.project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.w, y: (-p.y * 0.5 + 0.5) * this.h };
  }

  // ---------------------------------------------------------- cada cuadro
  frame(dt) {
    this.time += dt;
    const cup = this.cup;
    // cubilete
    const cg = cup.g;
    if (cup.anim) {
      const a = cup.anim;
      a.t += dt;
      const t = a.t - a.back;
      const lift = new THREE.Vector3(1.9, 0.75, -0.75);
      if (t < 0) {
        cg.position.copy(CUP_HOME);
        cg.rotation.set(0, 0, 0);
      } else if (t < 0.12) {
        cg.position.lerpVectors(CUP_HOME, lift, easeInOut(t / 0.12));
      } else if (t < 0.12 + a.shake) {
        const s = t - 0.12;
        cg.position.copy(lift);
        cg.position.y += Math.abs(Math.sin(s * 34)) * 0.12;
        cg.rotation.set(Math.sin(s * 29) * 0.12, 0, Math.sin(s * 41) * 0.22);
      } else if (t < 0.12 + a.shake + a.tip) {
        const k = easeInOut((t - 0.12 - a.shake) / a.tip);
        cg.position.copy(lift);
        cg.rotation.set(0, 0, k * 1.95);
      } else {
        const k = clamp((t - 0.12 - a.shake - a.tip - 0.12) / 0.38, 0, 1);
        cg.rotation.set(0, 0, 1.95 * (1 - easeInOut(k)));
        cg.position.lerpVectors(lift, CUP_HOME, easeInOut(k));
        if (k >= 1) cup.anim = null;
      }
    } else {
      cg.position.copy(CUP_HOME);
      cg.position.y = cup.hover * 0.08 * (1 + Math.sin(this.time * 4) * 0.4);
      cg.rotation.set(0, 0, cup.hover * Math.sin(this.time * 9) * 0.04);
    }
    cup.shadow.position.set(cg.position.x, 0.005, cg.position.z);
    cup.shadow.scale.setScalar(1.15 - Math.min(0.5, cg.position.y * 0.3));
    // dados
    for (const d of this.dice) {
      const m = d.m;
      const a = d.anim;
      if (a) {
        a.t += dt;
        if (a.k === 'gather') {
          const u = clamp(a.t / a.dur, 0, 1);
          m.position.lerpVectors(a.from, a.to, easeInOut(u));
          m.position.y += Math.sin(u * Math.PI) * 0.6;
          if (u >= 1) {
            d.visible = false;
            d.anim = null;
          }
        } else if (a.k === 'slide') {
          const u = clamp(a.t / a.dur, 0, 1);
          m.position.lerpVectors(a.from, a.to, easeInOut(u));
          m.position.y = R + Math.sin(u * Math.PI) * 0.25;
          m.quaternion.slerpQuaternions(a.q0, a.q1, easeInOut(u));
          if (u >= 1) {
            d.anim = null;
            d.rest.copy(a.to);
          }
        } else if (a.k === 'roll') {
          if (a.t < a.back) {
            // vuelve al cubilete
            const u = clamp(a.t / a.back, 0, 1);
            m.position.lerpVectors(a.from, this.cupMouth(), easeInOut(u));
            m.position.y += Math.sin(u * Math.PI) * 0.5;
            if (u >= 1) d.visible = false;
          } else if (a.t < a.delay) {
            d.visible = false;
          } else {
            d.visible = true;
            const u = clamp((a.t - a.delay) / a.dur, 0, 1);
            const start = this.cupMouthPour();
            // cae del cubilete y rebota dos veces, cada vez más bajo
            const h = easeOut(u);
            m.position.x = start.x + (a.to.x - start.x) * h;
            m.position.z = start.z + (a.to.z - start.z) * h;
            let y;
            if (u < 0.32) {
              const k = u / 0.32;
              y = start.y + (R - start.y) * k * k;
            } else {
              const v = (u - 0.32) / 0.68;
              y = R + 0.42 * (1 - v) ** 2 * Math.abs(Math.sin(v * Math.PI * 2.2));
            }
            m.position.y = y;
            const hit = u >= 0.32 ? (u >= 0.32 + 0.68 / 2.2 ? (u >= 0.32 + (0.68 * 2) / 2.2 ? 3 : 2) : 1) : 0;
            if (hit > a.hits) {
              a.hits = hit;
              this.onHit?.(hit === 1 ? 1 : hit === 2 ? 0.55 : 0.3);
            }
            const spin = a.spin * (1 - easeOut(u));
            m.quaternion.copy(a.q1).multiply(new THREE.Quaternion().setFromAxisAngle(a.axis, spin));
            if (u >= 1) {
              d.anim = null;
              m.position.copy(a.to);
              m.quaternion.copy(a.q1);
            }
          }
        }
      } else if (d.hop) {
        d.hop += dt;
        if (d.hop > 0) {
          const u = d.hop / 0.5;
          m.position.y = R + Math.sin(Math.min(1, u) * Math.PI) * 0.55;
          m.quaternion.copy(d.restQ).multiply(new THREE.Quaternion().setFromAxisAngle(Y, Math.min(1, u) * TAU));
          if (u >= 1) {
            d.hop = 0;
            m.position.y = R;
            m.quaternion.copy(d.restQ);
          }
        }
      }
      m.visible = d.visible;
      d.shadow.visible = d.visible;
      d.shadow.position.set(m.position.x, 0.004, m.position.z);
      const lift = Math.max(0, m.position.y - R);
      d.shadow.scale.setScalar(1 - Math.min(0.45, lift * 0.5));
      d.shadow.material.opacity = 1;
      // aro dorado debajo de los guardados; brillo de los que cuentan
      d.glow.visible = d.visible;
      d.glow.position.set(m.position.x, 0.006, m.position.z);
      d.glow.material.opacity += ((d.held && !d.anim ? 0.75 + 0.2 * Math.sin(this.time * 3 + d.i) : 0) - d.glow.material.opacity) * Math.min(1, dt * 10);
      d.markT += (d.mark - d.markT) * Math.min(1, dt * 10);
      for (const mt of m.material) mt.emissiveIntensity = d.markT * (0.16 + 0.06 * Math.sin(this.time * 6));
    }
    if (this.onDone && this.time >= this.doneAt) {
      const f = this.onDone;
      this.onDone = null;
      f();
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** De dónde salen los dados: la boca del cubilete volcado. */
  cupMouthPour() {
    return new THREE.Vector3(1.25, 0.95, -0.75);
  }
}
