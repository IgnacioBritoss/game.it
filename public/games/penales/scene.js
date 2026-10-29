/**
 * Penales — la cancha en three.js: pasto con rayas y líneas, el arco con red que se infla, la tribuna, el que patea con su
 * carrera, el arquero que se tira y la pelota. No sabe de reglas ni de turnos: `kick()` anima un remate ya resuelto
 * (shared/rules.js) y avisa cada momento (patada, atajada, palo, red…) para los sonidos y los carteles.
 *
 * Coordenadas en metros: el arco está en z = 0 mirando a +z, x a la derecha y y para arriba; la pelota está en el punto penal
 * (z = 11) y la cámara, atrás. Los puntos del arco (x de -1 a 1 entre los palos, y de 0 a 1 en el travesaño) se pasan a metros
 * con GOAL_W y GOAL_H.
 */
import * as THREE from '/vendor/three.min.js';
import { GOAL_W, GOAL_H, zoneCenter } from './shared/rules.js';

const HW = GOAL_W / 2;
const SPOT = 11;
const BALL_R = 0.16;
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeIn = (t) => t * t;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
const rand = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- texturas
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, { repeat = null, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

const PITCH_W = 120;
const PITCH_H = 80;
const PITCH_ZC = 16; // el pasto va de z = -24 a 56

/** El pasto: franjas de corte y las líneas del área (a escala real). */
function pitchTexture() {
  const W = 2048, H = Math.round((2048 * PITCH_H) / PITCH_W);
  const [c, g] = canvas(W, H);
  const px = (x) => ((x + PITCH_W / 2) / PITCH_W) * W;
  const pz = (z) => ((z - PITCH_ZC + PITCH_H / 2) / PITCH_H) * H;
  // franjas a lo largo de la cancha (cada 4 m de ancho)
  for (let x = -PITCH_W / 2, i = 0; x < PITCH_W / 2; x += 4, i++) {
    g.fillStyle = i % 2 ? '#3f9a45' : '#4aa84f';
    g.fillRect(px(x), 0, px(x + 4) - px(x) + 1, H);
  }
  // un poco de ruido para que no sea plano
  for (let k = 0; k < 9000; k++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '20,70,30' : '120,200,110'},${0.04 + Math.random() * 0.05})`;
    g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 3, 2);
  }
  g.strokeStyle = 'rgba(255,255,255,.95)';
  g.lineWidth = 0.12 * (W / PITCH_W);
  g.lineCap = 'round';
  const line = (x0, z0, x1, z1) => {
    g.beginPath();
    g.moveTo(px(x0), pz(z0));
    g.lineTo(px(x1), pz(z1));
    g.stroke();
  };
  line(-PITCH_W / 2, 0, PITCH_W / 2, 0); // línea de meta
  line(-9.16, 0, -9.16, 5.5);
  line(9.16, 0, 9.16, 5.5);
  line(-9.16, 5.5, 9.16, 5.5); // área chica
  line(-20.16, 0, -20.16, 16.5);
  line(20.16, 0, 20.16, 16.5);
  line(-20.16, 16.5, 20.16, 16.5); // área grande
  // semicírculo del área
  g.beginPath();
  const a0 = Math.acos((16.5 - SPOT) / 9.15);
  g.arc(px(0), pz(SPOT), (9.15 * W) / PITCH_W, Math.PI / 2 - a0, Math.PI / 2 + a0);
  g.stroke();
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(px(0), pz(SPOT), 0.16 * (W / PITCH_W), 0, TAU);
  g.fill();
  return tex(c, { aniso: 8 });
}

function netTexture(rep) {
  const [c, g] = canvas(128, 128);
  g.strokeStyle = 'rgba(255,255,255,.9)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(128, 0);
  g.moveTo(0, 0);
  g.lineTo(0, 128);
  g.moveTo(0, 0);
  g.lineTo(128, 128);
  g.stroke();
  return tex(c, { repeat: rep });
}

/** La tribuna: filas de gente, en grupos del mismo color (las camisetas de los hinchas), con sombra abajo. */
function crowdTexture(w, h) {
  const [c, g] = canvas(w, h);
  const g0 = g.createLinearGradient(0, 0, 0, h);
  g0.addColorStop(0, '#3a4263');
  g0.addColorStop(1, '#232846');
  g.fillStyle = g0;
  g.fillRect(0, 0, w, h);
  const palettes = [['#ff5a4d', '#ffffff', '#ff5a4d'], ['#4aa8ff', '#ffffff', '#2f6fe0'], ['#ffd23c', '#ffd23c', '#3b3b3b'], ['#7de08a', '#ffffff', '#2f9e57'], ['#ff9ad5', '#ffffff', '#ff5aa5'], ['#ff8a3c', '#ffd2a0', '#ff8a3c']];
  const sections = Math.ceil(w / 96);
  const pal = Array.from({ length: sections }, () => palettes[Math.floor(Math.random() * palettes.length)]);
  const step = 14;
  for (let y = 8; y < h + step; y += step) {
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.fillRect(0, y + 8, w, 3);
    for (let x = ((y / step) % 2) * 7; x < w; x += step) {
      const set = pal[Math.floor(x / 96)];
      const col = Math.random() < 0.82 ? set[Math.floor(Math.random() * set.length)] : palettes[Math.floor(Math.random() * palettes.length)][0];
      g.fillStyle = col;
      g.beginPath();
      g.roundRect(x + 1, y + 2, 12, 9, 4);
      g.fill();
      g.fillStyle = Math.random() < 0.5 ? '#e8b48a' : '#c58a62';
      g.beginPath();
      g.arc(x + 7, y - 1, 3.6, 0, TAU);
      g.fill();
    }
  }
  const shade = g.createLinearGradient(0, 0, 0, h);
  shade.addColorStop(0, 'rgba(10,14,40,.05)');
  shade.addColorStop(1, 'rgba(10,14,40,.5)');
  g.fillStyle = shade;
  g.fillRect(0, 0, w, h);
  return tex(c);
}

function adTexture(txt, bg, fg) {
  const [c, g] = canvas(512, 96);
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = fg;
  g.font = '700 54px Fredoka, "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(txt, 256, 52);
  g.fillStyle = 'rgba(255,255,255,.18)';
  g.fillRect(0, 0, 512, 10);
  return tex(c);
}

function skyTexture() {
  const [c, g] = canvas(8, 256);
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#2f7ee8');
  grd.addColorStop(0.55, '#7ec0ff');
  grd.addColorStop(0.85, '#d3ecff');
  grd.addColorStop(1, '#f2f9ff');
  g.fillStyle = grd;
  g.fillRect(0, 0, 8, 256);
  return tex(c);
}

function ballTexture() {
  const [c, g] = canvas(512, 256);
  g.fillStyle = '#fafafa';
  g.fillRect(0, 0, 512, 256);
  // pentágonos negros repartidos (se ven girar)
  g.fillStyle = '#1b1d24';
  const pent = (x, y, r) => {
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 5;
      g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 1.05);
    }
    g.closePath();
    g.fill();
  };
  for (const [x, y] of [[64, 64], [192, 64], [320, 64], [448, 64], [0, 140], [128, 140], [256, 140], [384, 140], [512, 140], [64, 214], [192, 214], [320, 214], [448, 214]]) pent(x, y, 30);
  g.strokeStyle = 'rgba(40,45,60,.55)';
  g.lineWidth = 3;
  for (let x = 0; x < 512; x += 64) {
    g.beginPath();
    g.moveTo(x, 20);
    g.lineTo(x + 64, 90);
    g.moveTo(x + 64, 20);
    g.lineTo(x, 90);
    g.stroke();
  }
  return tex(c);
}

/** Una mancha redonda y suave para las sombras: se usa como mapa de transparencia de un material negro. */
const blobAlpha = (() => {
  let t = null;
  return () => {
    if (t) return t;
    const [c, g] = canvas(64, 64);
    g.fillStyle = '#000';
    g.fillRect(0, 0, 64, 64);
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, '#9a9a9a');
    grd.addColorStop(1, '#000');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    t = new THREE.CanvasTexture(c);
    return t;
  };
})();
const blobMaterial = () => new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: blobAlpha(), transparent: true, depthWrite: false, fog: false });

// ---------------------------------------------------------------- jugadores
const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

/** Un muñeco de cápsulas: piernas y brazos con articulaciones para armar las poses. */
function makeRig({ shirt, shorts, socks, skin = '#e8b48a', hair = '#2a1d14', glove = null }) {
  const root = new THREE.Group();
  const hip = new THREE.Group();
  hip.position.y = 0.93;
  root.add(hip);
  const cap = (r, len, color, y = 0) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), mat(color));
    m.position.y = y;
    return m;
  };
  const torso = new THREE.Group();
  hip.add(torso);
  const chest = cap(0.22, 0.34, shirt, 0.4);
  chest.scale.z = 0.72;
  torso.add(chest);
  const short = cap(0.205, 0.08, shorts, 0.0);
  short.scale.z = 0.8;
  hip.add(short);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 14), mat(skin));
  head.position.y = 0.92;
  torso.add(head);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.147, 18, 10, 0, TAU, 0, Math.PI * 0.58), mat(hair));
  hairCap.position.y = 0.93;
  hairCap.rotation.x = -0.25;
  torso.add(hairCap);
  const arm = (side) => {
    const sh = new THREE.Group();
    sh.position.set(side * 0.29, 0.66, 0);
    const up = cap(0.065, 0.2, shirt, -0.16);
    sh.add(up);
    const el = new THREE.Group();
    el.position.y = -0.33;
    sh.add(el);
    el.add(cap(0.055, 0.2, skin, -0.14));
    if (glove) {
      const gl = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 10), mat(glove));
      gl.position.y = -0.32;
      el.add(gl);
    } else {
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mat(skin));
      fist.position.y = -0.3;
      el.add(fist);
    }
    torso.add(sh);
    return { sh, el };
  };
  const leg = (side) => {
    const th = new THREE.Group();
    th.position.set(side * 0.115, -0.02, 0);
    th.add(cap(0.1, 0.26, skin, -0.21));
    const kn = new THREE.Group();
    kn.position.y = -0.43;
    th.add(kn);
    kn.add(cap(0.075, 0.28, socks, -0.2));
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.27), mat('#16181f'));
    shoe.position.set(0, -0.43, 0.06);
    kn.add(shoe);
    hip.add(th);
    return { th, kn };
  };
  const rig = { root, hip, torso, head, aL: arm(-1), aR: arm(1), lL: leg(-1), lR: leg(1) };
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), blobMaterial());
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  root.add(blob);
  rig.blob = blob;
  return rig;
}

/** Poner un muñeco en una pose: ángulos de cada articulación (radianes). */
function pose(rig, p = {}) {
  const d = { hipY: 0.93, lean: 0, twist: 0, aLx: 0, aLz: 0.12, aLe: -0.15, aRx: 0, aRz: -0.12, aRe: -0.15, lLx: 0, lLk: 0, lRx: 0, lRk: 0, ...p };
  rig.hip.position.y = d.hipY;
  rig.torso.rotation.set(d.lean, d.twist, 0);
  rig.aL.sh.rotation.set(d.aLx, 0, d.aLz);
  rig.aL.el.rotation.set(d.aLe, 0, 0);
  rig.aR.sh.rotation.set(d.aRx, 0, d.aRz);
  rig.aR.el.rotation.set(d.aRe, 0, 0);
  rig.lL.th.rotation.set(d.lLx, 0, 0);
  rig.lL.kn.rotation.set(d.lLk, 0, 0);
  rig.lR.th.rotation.set(d.lRx, 0, 0);
  rig.lR.kn.rotation.set(d.lRk, 0, 0);
}

// ---------------------------------------------------------------- la escena
export class Pitch {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.r = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, powerPreference: 'high-performance' });
    this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xcfe6ff, 70, 150);
    this.cam = new THREE.PerspectiveCamera(48, 1, 0.1, 400);
    this.ray = new THREE.Raycaster();
    this.t = 0;
    this.k = null; // el remate que se está animando
    this.timeScale = 1;
    this.ripple = null;
    this.shake = 0;
    this.crowdBounce = 0;
    this.listeners = {};
    this.build();
    this.resize();
    this.reset();
  }

  on(fn) {
    this.onEvent = fn;
  }
  emit(name, data) {
    this.onEvent?.(name, data);
  }

  build() {
    const s = this.scene;
    // cielo
    const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 24, 16), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }));
    sky.position.y = -10;
    s.add(sky);
    s.add(new THREE.HemisphereLight(0xdcecff, 0x4c8a4c, 1.0));
    const sun = new THREE.DirectionalLight(0xfff1d6, 1.35);
    sun.position.set(-14, 22, 16);
    s.add(sun);
    // pasto
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(PITCH_W, PITCH_H), new THREE.MeshLambertMaterial({ map: pitchTexture() }));
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.set(0, 0, PITCH_ZC);
    s.add(pitch);
    this.buildGoal();
    this.buildStands();
    // pelota y su sombra
    this.ballTex = ballTexture();
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 28, 20), new THREE.MeshLambertMaterial({ map: this.ballTex }));
    s.add(this.ball);
    this.ballBlob = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), blobMaterial());
    this.ballBlob.rotation.x = -Math.PI / 2;
    s.add(this.ballBlob);
    // el punto penal ya está en la textura; los jugadores se arman con los colores de cada turno
    this.setColors('#ff7a59', '#4fd1a5');
  }

  buildGoal() {
    const s = this.scene;
    const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const post = (x, y, z, h, r = 0.06) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), white);
      m.position.set(x, y, z);
      s.add(m);
      return m;
    };
    post(-HW, GOAL_H / 2, 0, GOAL_H);
    post(HW, GOAL_H / 2, 0, GOAL_H);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, GOAL_W + 0.12, 12), white);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, GOAL_H, 0);
    s.add(bar);
    // los palos de atrás
    const DEPTH = 2.1;
    post(-HW, 1.2, -DEPTH, 2.4, 0.04);
    post(HW, 1.2, -DEPTH, 2.4, 0.04);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, GOAL_W, 8), white);
    top.rotation.z = Math.PI / 2;
    top.position.set(0, 2.4, -DEPTH);
    s.add(top);
    // red: fondo (se infla), costados y techo
    const nmat = (rep) => new THREE.MeshBasicMaterial({ map: netTexture(rep), transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.85 });
    const back = new THREE.PlaneGeometry(GOAL_W, 2.4, 22, 11);
    this.netBack = new THREE.Mesh(back, nmat([30, 10]));
    this.netBack.position.set(0, 1.2, -DEPTH);
    s.add(this.netBack);
    this.netBase = Float32Array.from(back.attributes.position.array);
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(DEPTH, 2.4, 1, 1), nmat([9, 10]));
      side.rotation.y = Math.PI / 2;
      side.position.set(sx * HW, 1.2, -DEPTH / 2);
      s.add(side);
    }
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W, DEPTH, 1, 1), nmat([30, 9]));
    roof.rotation.x = Math.PI / 2;
    roof.position.set(0, 2.42, -DEPTH / 2);
    s.add(roof);
    // sombra del arco: una franja oscura en el pasto de atrás
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W, DEPTH), new THREE.MeshBasicMaterial({ color: 0x1d5a27, transparent: true, opacity: 0.35, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.015, -DEPTH / 2);
    s.add(floor);
  }

  buildStands() {
    const s = this.scene;
    // carteles de publicidad detrás del arco
    const ads = [['game.it', '#ff7a59', '#fff'], ['PENALES', '#1d3fa8', '#ffd23c'], ['game.it', '#4fd1a5', '#12301f'], ['¡GOOOL!', '#ffd23c', '#3b1d00'], ['game.it', '#6b4fd1', '#fff'], ['PENALES', '#d8432f', '#fff']];
    const AD_W = 8.2;
    for (let i = -3; i < 3; i++) {
      const [t, bg, fg] = ads[(i + 3) % ads.length];
      const m = new THREE.Mesh(new THREE.BoxGeometry(AD_W, 1.0, 0.15), mat('#ffffff', { map: adTexture(t, bg, fg) }));
      m.position.set((i + 0.5) * AD_W, 0.5, -4.2);
      s.add(m);
    }
    // tribuna de atrás (inclinada) y las de los costados
    this.crowds = [];
    const stand = (w, h, x, y, z, ry, rx = -0.5, rep = [w / 8, h / 6]) => {
      const t = crowdTexture(512, 512);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rep[0], rep[1]);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }));
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, 0, 'YXZ');
      s.add(m);
      this.crowds.push({ m, t, y: t.offset.y });
      // la base de cemento
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, 1.6, 0.6), mat('#8e96a8'));
      base.position.set(x, 0.8, z + (rx ? 0.5 : 0));
      base.rotation.y = ry;
      s.add(base);
      return m;
    };
    stand(130, 17, 0, 8.6, -14.5, 0, -0.55, [5, 1.6]);
    stand(70, 15, -42, 7, 8, Math.PI / 2, -0.5, [3, 1.4]);
    stand(70, 15, 42, 7, 8, -Math.PI / 2, -0.5, [3, 1.4]);
    // techo que asoma arriba de la tribuna de atrás
    const roof = new THREE.Mesh(new THREE.BoxGeometry(134, 0.6, 9), mat('#e8edf6'));
    roof.position.set(0, 17.6, -21);
    roof.rotation.x = 0.14;
    s.add(roof);
    // reflectores
    for (const x of [-40, 40]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 34, 8), mat('#cfd6e4'));
      pole.position.set(x, 17, -14);
      s.add(pole);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(7, 3.6, 0.6), new THREE.MeshBasicMaterial({ color: 0xfff8da }));
      lamp.position.set(x, 35, -13.6);
      lamp.rotation.x = -0.25;
      s.add(lamp);
    }
  }

  /** Los dos muñecos con los colores del que patea y del que ataja. */
  setColors(shooter, keeper) {
    for (const k of ['kicker', 'keeperRig']) if (this[k]) this.scene.remove(this[k].root);
    this.kicker = makeRig({ shirt: shooter, shorts: '#1b2035', socks: shooter, hair: '#2a1d14' });
    this.keeperRig = makeRig({ shirt: keeper, shorts: '#ffffff', socks: '#ffffff', glove: '#ffe14a', skin: '#d99f78', hair: '#18110c' });
    this.kicker.root.rotation.y = Math.PI;
    this.scene.add(this.kicker.root, this.keeperRig.root);
    this.reset();
  }

  /** Todo en su lugar para el próximo remate. */
  reset() {
    this.k = null;
    this.frozen = false;
    this.ripple = null;
    this.ball.position.set(0, BALL_R, SPOT);
    this.ball.rotation.set(0, 0, 0);
    this.ball.visible = true;
    this.ballBlob.position.set(0, 0.012, SPOT);
    this.ballBlob.scale.set(1, 1, 1);
    this.kicker.root.position.set(-2.3, 0, SPOT + 3.4);
    this.kicker.root.rotation.set(0, Math.PI, 0);
    this.keeperRig.root.position.set(0, 0, 0.35);
    this.keeperRig.root.rotation.set(0, 0, 0);
    this.keeperRig.hip.rotation.set(0, 0, 0);
    this.updateNet(0);
    this.setCamera();
  }

  // ---------------------------------------------------------------- cámara y pantalla
  resize() {
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    this.r.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.size = { w, h };
    this.setCamera();
  }

  /** Cámara detrás de la pelota: en vertical, el arco ocupa casi todo el ancho; en horizontal, como una transmisión. */
  setCamera(zoom = 0) {
    this.zoomNow = zoom;
    const a = this.cam.aspect;
    const portrait = a < 1.1;
    let fov, D, h, look;
    if (portrait) {
      fov = clamp((2 * Math.atan(0.24 / a) * 180) / Math.PI, 32, 60);
      const hf = 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * a);
      D = clamp(GOAL_W / 0.8 / 2 / Math.tan(hf / 2), 17, 40);
      h = 3.5;
      look = 0.7;
    } else {
      fov = 38;
      D = 19;
      h = 3.1;
      look = 0.4;
    }
    this.cam.fov = fov * (1 - 0.2 * zoom);
    this.cam.position.set(0, h, D);
    this.cam.lookAt(0, look, 0);
    this.cam.updateProjectionMatrix();
    this.cam.updateMatrixWorld();
  }

  /** De un punto de la pantalla (px respecto del canvas) al arco: { x, y } normalizados (puede caer afuera de los palos). */
  aimAt(px, py) {
    const { w, h } = this.size;
    this.ray.setFromCamera(new THREE.Vector2((px / w) * 2 - 1, -(py / h) * 2 + 1), this.cam);
    const o = this.ray.ray.origin, d = this.ray.ray.direction;
    if (Math.abs(d.z) < 1e-6) return null;
    const t = -o.z / d.z;
    if (t <= 0) return null;
    return { x: (o.x + d.x * t) / HW, y: (o.y + d.y * t) / GOAL_H };
  }
  /** De un punto del arco a píxeles del canvas. */
  project(x, y, z = 0) {
    const v = new THREE.Vector3(x * HW, y * GOAL_H, z).project(this.cam);
    const { w, h } = this.size;
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
  }
  /** El rectángulo del arco en la pantalla. */
  goalRect() {
    const a = this.project(-1, 1), b = this.project(1, 0);
    return { left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y };
  }

  // ---------------------------------------------------------------- red
  updateNet(t) {
    const g = this.netBack.geometry;
    const pos = g.attributes.position;
    const rp = this.ripple;
    for (let i = 0; i < pos.count; i++) {
      const bx = this.netBase[i * 3], by = this.netBase[i * 3 + 1];
      let dz = 0;
      if (rp) {
        const d = Math.hypot(bx - rp.x, by + 1.2 - rp.y);
        const age = t - rp.t0;
        const env = Math.exp(-age * 2.2);
        dz = -rp.amp * Math.exp(-(d * d) / 1.6) * (0.45 + 0.55 * Math.cos(age * 14 - d * 3)) * env;
      }
      pos.setZ(i, dz);
    }
    pos.needsUpdate = true;
  }

  // ---------------------------------------------------------------- remate
  /**
   * Anima un remate ya resuelto. `info`: { shot: { x, y, p }, land: { x, y }, result, dive: { c, r }, meIsKeeper }.
   * Devuelve una promesa que se cumple cuando termina todo (los eventos llegan por `on`).
   */
  kick(info) {
    return new Promise((resolve) => {
      const { shot, land, result, dive } = info;
      const fl = lerp(1.0, 0.46, clamp(shot.p, 0, 1));
      const tx = clamp(land.x, -2.2, 2.2) * HW;
      const ty = Math.max(land.y, 0) * GOAL_H;
      const saved = result === 'saved';
      // a dónde se tira el arquero: a la pelota si ataja, a su zona si no
      const z = zoneCenter(dive.c, dive.r);
      const kx = (saved ? clamp(land.x, -1.1, 1.1) : z.x) * HW;
      const ky = (saved ? clamp(land.y, 0.05, 1.1) : z.y) * GOAL_H;
      this.k = {
        t: 0,
        run: 0.64,
        fl,
        tx,
        ty,
        kx,
        ky,
        saved,
        result,
        shot,
        dive,
        p: clamp(shot.p, 0, 1),
        started: false,
        arrived: false,
        landed: false,
        post: null,
        deflect: null,
        spin: rand(-1, 1),
        done: resolve,
        end: 3.9,
        diveT0: 0.64 + 0.12,
      };
      this.kicker.start = new THREE.Vector3(-2.3, 0, SPOT + 3.4);
      this.kicker.contact = new THREE.Vector3(-0.62, 0, SPOT + 0.5);
      this.emit('run');
    });
  }

  update(dtRaw) {
    const dt = Math.min(dtRaw, 0.05) * this.timeScale;
    this.t += dt;
    const k = this.k;
    if (k) this.stepKick(k, dt);
    else if (!this.frozen) this.idle();
    // la tribuna salta
    if (this.crowdBounce > 0) {
      this.crowdBounce = Math.max(0, this.crowdBounce - dt);
      const a = Math.sin(this.t * 22) * 0.004 * Math.min(1, this.crowdBounce);
      for (const c of this.crowds) c.t.offset.y = c.y + a;
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * 0.12;
      this.cam.position.x += (Math.random() - 0.5) * s;
      this.cam.position.y += (Math.random() - 0.5) * s;
    }
    if (this.ripple) this.updateNet(this.t);
  }

  idle() {
    const t = this.t;
    // el arquero se mece en la línea y el que patea espera
    const kr = this.keeperRig;
    kr.root.position.x = Math.sin(t * 1.4) * 0.35;
    pose(kr, { hipY: 0.88 + Math.sin(t * 3) * 0.015, aLz: 0.75, aRz: -0.75, aLe: -0.35, aRe: -0.35, lLx: -0.22, lLk: 0.4, lRx: -0.22, lRk: 0.4, lean: 0.12 });
    pose(this.kicker, { lean: 0.05, aLz: 0.1, aRz: -0.1 });
    this.kicker.root.position.set(-2.3, 0, SPOT + 3.4);
  }

  stepKick(k, dt) {
    k.t += dt;
    const t = k.t;
    // un acercamiento suave mientras la pelota viaja
    this.setCamera(easeOut(clamp((t - k.run) / (k.fl + 0.3), 0, 1)) * 0.9);
    const kick = this.kicker;
    const kp = kick.root.position;
    // carrera y patada
    if (t < k.run) {
      const u = easeInOut(clamp(t / k.run, 0, 1));
      kp.lerpVectors(kick.start, kick.contact, u);
      kick.root.rotation.y = Math.PI + Math.atan2(kick.contact.x - kick.start.x, -(kick.contact.z - kick.start.z)) * 0.0 + (1 - u) * -0.18;
      const ph = t * 13;
      const sw = Math.sin(ph);
      pose(kick, { lean: 0.18, hipY: 0.93 + Math.abs(Math.sin(ph)) * 0.025, lLx: sw * 0.85, lLk: Math.max(0, -sw) * 0.9, lRx: -sw * 0.85, lRk: Math.max(0, sw) * 0.9, aLx: -sw * 0.7, aRx: sw * 0.7, aLz: 0.18, aRz: -0.18, aLe: -0.6, aRe: -0.6 });
    } else {
      const u = clamp((t - k.run) / 0.42, 0, 1);
      kp.copy(kick.contact);
      // pierna derecha: se va atrás y pega
      const back = clamp((t - k.run + 0.12) / 0.12, 0, 1);
      const swing = clamp((t - k.run) / 0.1, 0, 1);
      const rx = lerp(-0.9 * back, 1.35, easeOut(swing));
      const rk = lerp(0.9 * back, 0.1, swing);
      pose(kick, { lean: lerp(0.2, -0.1, easeOut(swing)), lLx: -0.2, lLk: 0.35, lRx: rx, lRk: rk, aLx: 0.2, aLz: 0.9, aRx: -0.4, aRz: -0.4 });
      if (u > 0.55 && !k.celebrate) this.followThrough(k, t);
    }
    // contacto: la pelota sale
    if (!k.started && t >= k.run) {
      k.started = true;
      this.emit('kick');
    }
    // el arquero espera, reacciona y se tira
    this.stepKeeper(k, t);
    // la pelota
    if (k.started) this.stepBall(k, dt);
    // se termina
    if (t >= k.end) {
      this.k = null;
      this.frozen = true;
      k.done?.();
    }
  }

  followThrough(k, t) {
    // después de patear: festejo o bronca según salió
    const u = clamp((t - k.arriveAt) / 0.6, 0, 1);
    if (!k.arrived) return;
    const kick = this.kicker;
    const w = t * 8;
    if (k.result === 'goal') {
      const j = Math.abs(Math.sin(w)) * 0.18;
      pose(kick, { hipY: 0.93 + j, lean: -0.15, aLx: -2.6, aRx: -2.6, aLz: 0.4, aRz: -0.4, aLe: -0.3, aRe: -0.3, lLx: -0.2, lRx: 0.1, lRk: 0.4 });
      kick.root.position.y = j * 0.9;
    } else pose(kick, { lean: 0.35, aLx: -2.4, aRx: -2.4, aLz: 0.2, aRz: -0.2, aLe: -1.8, aRe: -1.8, lLx: 0.05, lRx: 0.05 });
    void u;
  }

  stepKeeper(k, t) {
    const kr = this.keeperRig;
    if (t < k.diveT0) {
      this.idle();
      return;
    }
    // el arquero está en la línea (x = 0 de base, con el vaivén que dejó); se tira hacia (kx, ky)
    const T = 0.5 + 0.12 * (1 - k.p);
    const u = clamp((t - k.diveT0) / T, 0, 1);
    const e = easeOut(u);
    const dirx = Math.sign(k.kx) || 0;
    const reachY = k.ky;
    // la altura: el cuerpo vuela hacia ky, con las manos adelante
    const startX = k.keeperX0 ?? (k.keeperX0 = kr.root.position.x);
    const x = lerp(startX, k.kx - dirx * Math.min(0.55, Math.abs(k.kx) * 0.25), e);
    const arc = Math.sin(u * Math.PI) * 0.25;
    const y = Math.max(0, lerp(0, Math.max(0, reachY - 0.95), e) + arc);
    // ya en el piso (atajada baja o después del vuelo)
    const fall = u >= 1 ? clamp((t - k.diveT0 - T) / 0.35, 0, 1) : 0;
    kr.root.position.x = x;
    kr.root.position.y = reachY > 1.0 ? Math.max(0, y * (1 - easeIn(fall))) : Math.max(0, y * 0.2 * (1 - fall));
    kr.root.position.z = 0.35 - e * 0.15;
    const tilt = dirx === 0 ? 0 : -dirx * lerp(0.1, 1.25 + 0.2 * Math.min(1, reachY / 1.5), e);
    kr.hip.rotation.z = tilt * (1 - fall * 0.2);
    // el centro: salta recto
    const up = dirx === 0 ? 1 : 0.4;
    pose(kr, { hipY: 0.88 - e * 0.1, aLz: lerp(0.75, 2.8, e), aRz: lerp(-0.75, -2.8, e), aLe: -0.1, aRe: -0.1, lLx: lerp(-0.22, 0.25, e), lLk: lerp(0.4, 0.1, e), lRx: lerp(-0.22, 0.1, e), lRk: lerp(0.4, 0.3, e), lean: dirx === 0 ? lerp(0.12, -0.1, e) : 0 });
    if (dirx === 0) kr.root.position.y = Math.max(0, (reachY > 1.0 ? lerp(0, reachY - 1.0, e) : 0) * (1 - fall * 0.9)) * up;
    // si ataja, se queda con las manos en la pelota; si no, se desploma
    if (k.result === 'goal' && u >= 1) pose(kr, { hipY: 0.5, aLz: 1.6, aRz: -1.6, lLx: 0.3, lRx: 0.3, lean: 0.4 });
  }

  stepBall(k, dt) {
    const b = this.ball;
    const t = k.t - k.run;
    const fl = k.fl;
    if (!k.arrived) {
      const u = clamp(t / fl, 0, 1);
      const zz = SPOT * (1 - Math.pow(u, 0.9));
      const x = lerp(0, k.tx, u);
      const arc = Math.sin(u * Math.PI) * (0.25 + 0.5 * (1 - k.p));
      let y = lerp(BALL_R, Math.max(BALL_R, k.ty), easeIn(u) * 0.35 + u * 0.65) + arc;
      // los tiros por arriba siguen subiendo
      if (k.result === 'over') y = lerp(BALL_R, k.ty, u) + arc * 0.4;
      b.position.set(x, Math.max(BALL_R, y), zz);
      b.rotation.x -= dt * (10 + 30 * k.p);
      b.rotation.z += dt * k.spin * 8;
      if (u >= 1) {
        k.arrived = true;
        k.arriveAt = k.t;
        this.arrive(k);
      }
    } else {
      this.afterArrive(k, dt);
    }
    this.ballBlob.position.set(b.position.x, 0.012, b.position.z);
    const hgt = Math.max(0, b.position.y - BALL_R);
    const sc = 1 / (1 + hgt * 0.7);
    this.ballBlob.scale.set(sc, sc, 1);
    this.ballBlob.material.opacity = sc;
  }

  /** La pelota llega al plano del arco: según el resultado, red, manos, palo o afuera. */
  arrive(k) {
    const b = this.ball;
    const r = k.result;
    if (r === 'goal') {
      this.ripple = { x: clamp(k.tx, -HW + 0.2, HW - 0.2), y: clamp(k.ty, 0.2, 2.2), amp: 0.55, t0: this.t };
      k.v = new THREE.Vector3((k.tx / HW) * 0.6, -0.2, -(8 + 10 * k.p));
      this.emit('goal');
      this.crowdBounce = 2.2;
    } else if (r === 'saved') {
      const sx = (Math.random() < 0.5 ? -1 : 1) * rand(1.2, 3.2);
      k.v = new THREE.Vector3(sx + Math.sign(k.tx) * 1.0, rand(1.5, 3.8), rand(3.5, 7));
      this.emit('save');
      this.shake = 0.5;
    } else if (r === 'post') {
      k.v = new THREE.Vector3(-Math.sign(k.tx || 1) * rand(0.5, 2.5), rand(0.6, 2.8), rand(5, 9));
      this.emit('post');
      this.shake = 1;
    } else {
      // afuera o por arriba: sigue de largo
      k.v = new THREE.Vector3((k.tx / HW) * 1.4, r === 'over' ? 2.2 : -0.5, -(8 + 10 * k.p));
      this.emit('miss', { result: r });
    }
    k.vy = k.v.y;
  }

  afterArrive(k, dt) {
    const b = this.ball;
    const v = k.v;
    const r = k.result;
    v.y -= 9.8 * dt;
    if (r === 'goal') {
      // se frena en la red y cae
      v.z *= Math.pow(0.04, dt);
      v.x *= Math.pow(0.1, dt);
      if (b.position.z < -1.95) {
        b.position.z = -1.95;
        v.z = Math.abs(v.z) * 0.05;
      }
    }
    b.position.addScaledVector(v, dt);
    if (b.position.y < BALL_R) {
      b.position.y = BALL_R;
      v.y = Math.abs(v.y) * 0.38;
      v.x *= 0.85;
      v.z *= 0.85;
      if (Math.abs(v.y) < 0.4) v.y = 0;
    }
    b.rotation.x -= dt * v.z * 1.8;
    b.rotation.z += dt * v.x * 1.5;
    // que no se vaya al infinito
    if (b.position.z > SPOT + 8) b.position.z = SPOT + 8;
  }
}
