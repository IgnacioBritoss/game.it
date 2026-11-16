/**
 * Bengala — guardado de la gira (sin localStorage: eso lo hace game.js). Empaqueta el estado de la sim con una versión,
 * migra guardados viejos y lo convierte en un código de texto para pasarlo de un dispositivo a otro (no hay cuentas).
 */
import { dump, load } from './sim.js';

export const SAVE_V = 2; // la 1 era el juego sin funciones: esos guardados no se pueden traer
const BITS = ['ups', 'rec', 'nodes', 'ach'];

/** Estado → objeto para guardar. Las listas de sí/no viajan como texto de ceros y unos. */
export function pack(S, t = 0, extra = {}) {
  const s = dump(S, false);
  for (const k of BITS) s[k] = s[k].join('');
  return { v: SAVE_V, t, S: s, ...extra };
}

/** Migraciones de una versión a la siguiente (la clave es la versión de origen). */
const MIGRATE = {
  // 1: (o) => { …cambios…; o.v = 2; },
};

/** Objeto guardado → { S, t, … } o null si no sirve. No tira errores: un guardado roto no puede trabar el juego. */
export function unpack(o) {
  try {
    if (!o || typeof o !== 'object' || !o.S || typeof o.S !== 'object') return null;
    o = JSON.parse(JSON.stringify(o));
    for (let v = o.v | 0; v < SAVE_V; v = o.v | 0) {
      if (!MIGRATE[v]) return null;
      MIGRATE[v](o);
    }
    if ((o.v | 0) !== SAVE_V) return null;
    const s = o.S;
    for (const k of BITS) if (typeof s[k] === 'string') s[k] = [...s[k]].map((c) => (c === '1' ? 1 : 0));
    for (const k of ['ch', 'total', 'life', 'polv', 'stars', 'starsTot', 'ov', 'fuse']) if (!Number.isFinite(s[k]) || s[k] < 0) s[k] = 0;
    s.mode = 'solo';
    s.tick = Math.max(0, Math.floor(Number(s.tick) || 0));
    return { ...o, S: load(s) };
  } catch {
    return null;
  }
}

const fnv = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};
const toB64 = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (b64) => {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

/** Objeto guardado → código "BNG2.<datos>.<control>" para copiar y pegar. */
export function encode(o) {
  const body = toB64(JSON.stringify(o));
  return `BNG2.${body}.${fnv(body)}`;
}

/** Código → objeto guardado, o null si está mal copiado. */
export function decode(code) {
  try {
    const [tag, body, sum] = String(code).trim().split('.');
    if (tag !== 'BNG2' || !body || fnv(body) !== sum) return null;
    return JSON.parse(fromB64(body));
  } catch {
    return null;
  }
}
