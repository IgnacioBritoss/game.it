/**
 * Tuercas — partículas. Dos sistemas de puntos blandos (uno con mezcla normal para humo y polvo, otro aditivo para
 * chispas y llamas) con un tamaño y un color que cambian durante la vida de cada partícula, y un campo de clima
 * (nieve, brasas) que vive en la GPU y se queda fijo en el mundo mientras la cámara lo atraviesa.
 */
import { THREE } from './models.js';

const _c = new THREE.Color();
const cache = new Map();
/** Color hex → [r, g, b] en el espacio de trabajo de three (el mismo de los demás materiales). */
export function rgb(hex) {
  let v = cache.get(hex);
  if (!v) {
    _c.set(hex);
    v = [_c.r, _c.g, _c.b];
    cache.set(hex, v);
  }
  return v;
}

const VERT = `
attribute vec4 aColor;
attribute float aSize;
uniform float uScale;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.2, -mv.z);
}`;
const FRAG = `
varying vec4 vColor;
void main() {
  float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
  float a = 1.0 - smoothstep(0.5, 1.0, d);
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  #include <colorspace_fragment>
}`;

export class Particles {
  constructor(max, additive) {
    this.max = max;
    this.next = 0;
    this.px = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.span = new Float32Array(max).fill(1);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.alpha = new Float32Array(max).fill(1);
    this.aColor = new Float32Array(max * 4);
    this.aSize = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.attrPos = new THREE.BufferAttribute(this.px, 3).setUsage(THREE.DynamicDrawUsage);
    this.attrColor = new THREE.BufferAttribute(this.aColor, 4).setUsage(THREE.DynamicDrawUsage);
    this.attrSize = new THREE.BufferAttribute(this.aSize, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.attrPos);
    g.setAttribute('aColor', this.attrColor);
    g.setAttribute('aSize', this.attrSize);
    this.uniforms = { uScale: { value: 600 } };
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 12 : 11;
    this.alive = 0;
  }

  /**
   * Una partícula: posición, velocidad, vida (s), tamaño inicial y final (m), color inicial y final (hex),
   * gravedad (m/s², positiva = cae) y rozamiento (1/s). `a` = opacidad máxima.
   */
  emit(x, y, z, vx, vy, vz, life, s0, s1, c0, c1 = c0, grav = 0, drag = 0, a = 1) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const k = i * 3;
    this.px[k] = x;
    this.px[k + 1] = y;
    this.px[k + 2] = z;
    this.v[k] = vx;
    this.v[k + 1] = vy;
    this.v[k + 2] = vz;
    this.life[i] = life;
    this.span[i] = life;
    this.s0[i] = s0;
    this.s1[i] = s1;
    const a0 = rgb(c0);
    const a1 = rgb(c1);
    this.c0.set(a0, k);
    this.c1.set(a1, k);
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.alpha[i] = a;
  }

  update(dt) {
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      const L = this.life[i];
      const k = i * 3;
      if (L <= 0) {
        this.aSize[i] = 0;
        continue;
      }
      alive++;
      const nl = L - dt;
      this.life[i] = nl;
      if (nl <= 0) {
        this.aSize[i] = 0;
        this.aColor[i * 4 + 3] = 0;
        continue;
      }
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.v[k] *= dr;
      this.v[k + 1] = this.v[k + 1] * dr - this.grav[i] * dt;
      this.v[k + 2] *= dr;
      this.px[k] += this.v[k] * dt;
      this.px[k + 1] += this.v[k + 1] * dt;
      this.px[k + 2] += this.v[k + 2] * dt;
      const u = 1 - nl / this.span[i];
      this.aSize[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * u;
      this.aColor[i * 4] = this.c0[k] + (this.c1[k] - this.c0[k]) * u;
      this.aColor[i * 4 + 1] = this.c0[k + 1] + (this.c1[k + 1] - this.c0[k + 1]) * u;
      this.aColor[i * 4 + 2] = this.c0[k + 2] + (this.c1[k + 2] - this.c0[k + 2]) * u;
      // aparece rápido y se desvanece
      this.aColor[i * 4 + 3] = this.alpha[i] * Math.min(1, u * 14) * (1 - u * u);
    }
    this.alive = alive;
    this.attrPos.needsUpdate = true;
    this.attrColor.needsUpdate = true;
    this.attrSize.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.aSize.fill(0);
    this.attrSize.needsUpdate = true;
  }

  setScale(v) {
    this.uniforms.uScale.value = v;
  }

  dispose() {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}

/** Campo de clima fijo en el mundo: nieve que cae o brasas que suben, repetido alrededor de la cámara. */
export class Weather {
  constructor(kind, count = 420) {
    const snow = kind === 'snow';
    const size = 70;
    const pos = new Float32Array(count * 3);
    const R = (() => {
      let a = 12345;
      return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
    })();
    for (let i = 0; i < count; i++) pos.set([R() * size, R() * size * 0.7, R() * size], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.uniforms = {
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uScale: { value: 600 },
      uColor: { value: new THREE.Color(snow ? '#ffffff' : '#ffb03c') },
      uSpeed: { value: snow ? 2.2 : -2.6 },
      uSize: { value: snow ? 0.16 : 0.12 },
    };
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: snow ? THREE.NormalBlending : THREE.AdditiveBlending,
      vertexShader: `
        uniform float uTime; uniform vec3 uCam; uniform float uScale; uniform float uSpeed; uniform float uSize;
        varying float vA;
        void main() {
          vec3 p = position;
          p.y -= uTime * uSpeed;
          p.x += sin(uTime * 0.6 + position.z * 0.7) * 1.4;
          p.z += cos(uTime * 0.5 + position.x * 0.6) * 1.2;
          vec3 box = vec3(${size.toFixed(1)}, ${(size * 0.7).toFixed(1)}, ${size.toFixed(1)});
          vec3 q = mod(p - uCam + box * 0.5, box) - box * 0.5;
          vec3 w = uCam + q;
          vec4 mv = viewMatrix * vec4(w, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = -mv.z;
          gl_PointSize = uSize * uScale / max(0.3, d);
          vA = smoothstep(${(size * 0.5).toFixed(1)}, ${(size * 0.2).toFixed(1)}, length(q));
        }`,
      fragmentShader: `
        uniform vec3 uColor; varying float vA;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
          float a = (1.0 - smoothstep(0.4, 1.0, d)) * vA * 0.85;
          gl_FragColor = vec4(uColor, a);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 13;
  }
  update(t, cam, scale) {
    this.uniforms.uTime.value = t;
    this.uniforms.uCam.value.copy(cam);
    this.uniforms.uScale.value = scale;
  }
  dispose() {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
