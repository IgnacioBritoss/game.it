/**
 * Disimulá — el maniquí en pantalla.
 *
 * Las mallas salen de shared/body.js (misma geometría y UVs que usa el CPU) y las
 * matrices de cada parte se calculan con body.transforms y se setean a mano: lo que
 * valida el servidor es exactamente lo que se ve. La pintura es una CanvasTexture del
 * atlas 128×128 (como mucho una subida por cuadro).
 */
import { THREE, bodyMaterial } from './world.js';
import { ATLAS, BASE_COLOR, PARTS, POSES, transforms, headPos, partMesh as partMeshData } from './shared/body.js';

function nameTexture(name, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 64);
  g.fillStyle = 'rgba(8,8,14,.72)';
  g.beginPath();
  g.roundRect(8, 10, 240, 44, 22);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.arc(34, 32, 12, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = '700 26px system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.fillText(name.slice(0, 14), 56, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export class Avatar {
  constructor(world, { name = '', color = '#3ec1ff', seeker = false } = {}) {
    this.world = world;
    this.group = new THREE.Group();
    this.state = { pos: [0, 0, 0], yaw: 0, pose: 'stand', joints: [0, 0, 0, 0, 0, 0], anim: null };
    this.color = color;
    this.walkPhase = 0;
    this.speed = 0;
    this.blinkAt = 1 + Math.random() * 3;
    this.blinkT = 0;
    this.surpriseT = 0;
    this.dirtyPaint = true;
    this.needsPose = true;

    // atlas de pintura → textura
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = ATLAS;
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(ATLAS, ATLAS);
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.NoColorSpace;
    this.paintData = null; // Uint8ClampedArray RGBA del atlas (alfa 0 = blanco de base)

    // una malla por parte, con el material del cuerpo
    this.meshes = PARTS.map((part, i) => {
      const data = meshData(i);
      const mesh = new THREE.Mesh(data, bodyMaterial(this.tex));
      mesh.matrixAutoUpdate = false;
      mesh.userData.region = part.region;
      this.group.add(mesh);
      return mesh;
    });

    // ojos (dos bloques blancos con pupila) + antena con bolita (toma el color del atlas de la cabeza)
    this.eyes = new THREE.Group();
    const eyeGeo = new THREE.SphereGeometry(0.036, 10, 8);
    const pupGeo = new THREE.SphereGeometry(0.0165, 8, 6);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupMat = new THREE.MeshBasicMaterial({ color: 0x15151c });
    for (const sx of [-1, 1]) {
      const e = new THREE.Group();
      const ball = new THREE.Mesh(eyeGeo, eyeMat);
      ball.scale.z = 0.55;
      const pup = new THREE.Mesh(pupGeo, pupMat);
      pup.position.z = 0.024;
      e.add(ball, pup);
      e.position.set(sx * 0.058, 0.205, 0.138);
      this.eyes.add(e);
    }
    this.group.add(this.eyes);
    this.eyes.matrixAutoUpdate = false;

    const antGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.1, 6);
    const ballGeo = new THREE.SphereGeometry(0.028, 8, 6);
    const headRect = PARTS[0].rect;
    const au = (headRect[0] + headRect[2] / 2 + 0.5) / ATLAS;
    const av = 1 - (headRect[1] + 1) / ATLAS; // texel de arriba de la cabeza: la antena se pinta con ella
    for (const geo of [antGeo, ballGeo]) {
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, au, av);
    }
    this.antenna = new THREE.Group();
    const rod = new THREE.Mesh(antGeo, bodyMaterial(this.tex));
    rod.position.y = 0.21;
    const ball2 = new THREE.Mesh(ballGeo, bodyMaterial(this.tex));
    ball2.position.y = 0.27;
    this.antenna.add(rod, ball2);
    this.antenna.matrixAutoUpdate = false;
    this.group.add(this.antenna);

    // visera del buscador (lleva el color del jugador) + cartel con el nombre
    this.visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.1), new THREE.MeshBasicMaterial({ color }));
    this.visor.matrixAutoUpdate = false;
    this.group.add(this.visor);
    this.nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(name || ' ', color), depthTest: true, transparent: true }));
    this.nameSprite.scale.set(1.15, 0.29, 1);
    this.group.add(this.nameSprite);

    // sombra falsa
    const sc = document.createElement('canvas');
    sc.width = sc.height = 64;
    const sg = sc.getContext('2d');
    const grad = sg.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(0,0,0,.42)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = grad;
    sg.fillRect(0, 0, 64, 64);
    const st = new THREE.CanvasTexture(sc);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.group.add(this.shadow);

    this.setSeeker(seeker);
    this.setName(name, color);
    world.scene.add(this.group);
    this.flushPaint();
    this.refresh();
  }

  setName(name, color) {
    this.name = name;
    if (color) this.color = color;
    this.nameSprite.material.map?.dispose();
    this.nameSprite.material.map = nameTexture(name || ' ', this.color);
    this.visor.material.color.set(this.color);
  }

  setSeeker(on) {
    this.seeker = on;
    this.visor.visible = on;
    this.nameSprite.visible = on;
  }

  showName(on) {
    this.nameSprite.visible = on;
  }

  setState(partial) {
    Object.assign(this.state, partial);
    this.needsPose = true;
  }

  /** Marca el atlas para subirlo a la GPU (hasta una vez por cuadro). */
  setPaint(data) {
    this.paintData = data;
    this.dirtyPaint = true;
  }

  setMats(mats) {
    this.mats = mats;
    for (const mesh of this.meshes) {
      const m = mats?.[mesh.userData.region];
      mesh.material.uniforms.bright.value = m?.bright ?? 1;
      mesh.material.uniforms.gloss.value = m?.gloss ?? 0;
    }
  }

  highlight(on) {
    this.glow = on;
    if (!on) for (const mesh of this.meshes) mesh.material.uniforms.glow.value = 0;
  }

  surprise() {
    this.surpriseT = 0.9;
    this.setState({ anim: { uarmL: [0, 0, -2.4], uarmR: [0, 0, 2.4], head: [-0.3, 0, 0] } });
  }

  flushPaint() {
    const d = this.img.data;
    const p = this.paintData;
    for (let i = 0; i < ATLAS * ATLAS; i++) {
      const o = i * 4;
      if (p && p[o + 3]) {
        d[o] = p[o];
        d[o + 1] = p[o + 1];
        d[o + 2] = p[o + 2];
      } else {
        d[o] = BASE_COLOR[0];
        d[o + 1] = BASE_COLOR[1];
        d[o + 2] = BASE_COLOR[2];
      }
      d[o + 3] = 255;
    }
    this.ctx.putImageData(this.img, 0, 0);
    this.tex.needsUpdate = true;
    this.dirtyPaint = false;
  }

  refresh() {
    const tf = transforms(this.state);
    tf.parts.forEach((t, i) => {
      const m = this.meshes[i].matrix;
      const q = t.m;
      m.set(q[0], q[1], q[2], t.p[0], q[3], q[4], q[5], t.p[1], q[6], q[7], q[8], t.p[2], 0, 0, 0, 1);
    });
    const head = tf.bones[2];
    const hm = head.m;
    for (const node of [this.eyes, this.antenna]) node.matrix.set(hm[0], hm[1], hm[2], head.p[0], hm[3], hm[4], hm[5], head.p[1], hm[6], hm[7], hm[8], head.p[2], 0, 0, 0, 1);
    // visera sobre los ojos
    const vm = this.visor.matrix;
    const off = [0, 0.245, 0.1];
    vm.set(hm[0], hm[1], hm[2], head.p[0] + hm[0] * off[0] + hm[1] * off[1] + hm[2] * off[2], hm[3], hm[4], hm[5], head.p[1] + hm[3] * off[0] + hm[4] * off[1] + hm[5] * off[2], hm[6], hm[7], hm[8], head.p[2] + hm[6] * off[0] + hm[7] * off[1] + hm[8] * off[2], 0, 0, 0, 1);
    const hp = headPos(this.state);
    this.nameSprite.position.set(hp[0], hp[1] + 0.42, hp[2]);
    const pose = POSES[this.state.pose] || POSES.stand;
    this.shadow.position.set(this.state.pos[0], this.state.pos[1] + 0.015, this.state.pos[2]);
    const sw = pose.hitR * 2.4;
    this.shadow.scale.set(sw, sw, 1);
    this.needsPose = false;
  }

  /** Por cuadro: caminar, parpadeo, sorpresa y subida de la pintura. */
  update(dt, time) {
    if (this.speed > 0.2) {
      this.walkPhase += dt * this.speed * 2.6;
      const s = Math.sin(this.walkPhase) * 0.55;
      const a = Math.sin(this.walkPhase) * 0.3;
      this.state.anim = { thighL: [s, 0, 0], thighR: [-s, 0, 0], shinL: [Math.max(0, -s) * 0.9, 0, 0], shinR: [Math.max(0, s) * 0.9, 0, 0], uarmL: [-a, 0, -0.06], uarmR: [a, 0, 0.06] };
      this.needsPose = true;
    } else if (this.surpriseT <= 0 && this.state.anim && !this.animHold) {
      this.state.anim = null;
      this.needsPose = true;
    }
    if (this.surpriseT > 0) {
      this.surpriseT -= dt;
      const k = 1 + Math.max(0, this.surpriseT - 0.55) * 2.2;
      for (const e of this.eyes.children) e.scale.setScalar(k);
      if (this.surpriseT <= 0) {
        this.state.anim = null;
        this.needsPose = true;
        for (const e of this.eyes.children) e.scale.setScalar(1);
      }
    } else {
      // parpadeo
      this.blinkT += dt;
      if (this.blinkT > this.blinkAt) {
        this.blinkT = 0;
        this.blinkAt = 1.6 + Math.random() * 3.4;
      }
      const b = this.blinkT < 0.13 ? Math.max(0.12, Math.abs(this.blinkT / 0.065 - 1)) : 1;
      for (const e of this.eyes.children) e.scale.y = b;
    }
    if (this.glow) for (const mesh of this.meshes) {
      mesh.material.uniforms.glow.value = 0.4;
      mesh.material.uniforms.time.value = time;
    }
    if (this.needsPose) this.refresh();
    if (this.dirtyPaint) this.flushPaint();
  }

  dispose() {
    this.world.scene.remove(this.group);
    this.group.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) {
        o.material.map?.dispose?.();
        o.material.dispose?.();
      }
    });
    this.tex.dispose();
  }
}

// geometrías de las partes compartidas entre todos los avatares
const geoCache = [];
function meshData(i) {
  if (geoCache[i]) return geoCache[i];
  const { pos, nor, uv, idx } = partMeshData(i);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geoCache[i] = geo;
  return geo;
}
