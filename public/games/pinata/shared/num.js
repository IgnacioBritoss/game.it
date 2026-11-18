/** Piñata — formato de números y tiempos (solo para mostrar: la sim no pasa por acá). */
const SUF = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

const cut = (v, d, dec) => {
  const p = 10 ** d;
  const s = (Math.floor(v * p + 1e-9) / p).toFixed(d);
  return dec === '.' ? s : s.replace('.', dec);
};

/**
 * 1234567 → "1,23 M" (o "1,23e6" en notación científica), con coma decimal en español. Siempre redondea para abajo:
 * nunca muestra más de lo que hay, así un botón no dice "alcanza" cuando falta un poquito.
 */
export function fmt(n, lang = 'es', sci = false) {
  if (!Number.isFinite(n)) return '∞';
  if (n < 0) return `-${fmt(-n, lang, sci)}`;
  const dec = lang === 'es' ? ',' : '.';
  if (n < 1000) return n < 10 && n % 1 ? cut(n, 1, dec) : String(Math.floor(n));
  let e = Math.floor(Math.log10(n));
  if (10 ** (e + 1) <= n) e++;
  else if (10 ** e > n) e--;
  const g = Math.floor(e / 3);
  if (sci || g >= SUF.length) return `${cut(n / 10 ** e, 2, dec)}e${e}`;
  const v = n / 10 ** (g * 3);
  return `${cut(v, v >= 100 ? 0 : v >= 10 ? 1 : 2, dec)} ${SUF[g]}`;
}

/** 7384 → "2 h 3 min", 95 → "1 min 35 s", 12 → "12 s". */
export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return m ? `${h} h ${m} min` : `${h} h`;
  if (m) return s && m < 10 ? `${m} min ${s} s` : `${m} min`;
  return `${s} s`;
}

/** 185 → "3:05" (reloj del sprint). */
export const fmtClock = (sec) => {
  sec = Math.max(0, Math.ceil(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};
