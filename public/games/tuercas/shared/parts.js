/**
 * Tuercas — pilotos, carrocerías (autos y motos), ruedas, accesorios y puesta a punto.
 * Cada pieza suma o resta en seis estadísticas; la suma (de 1 a 10) define cómo se maneja el vehículo (params()).
 * Todo inventado para este juego. Lógica pura: la usan el taller, la carrera, los bots y las pruebas.
 */
import { clamp, lerp } from './util.js';

/** Las seis estadísticas, en el orden de los vectores de cada pieza. */
export const STATS = [
  { id: 'vel', name: { es: 'Velocidad', en: 'Speed' }, hint: { es: 'velocidad máxima', en: 'top speed' } },
  { id: 'ace', name: { es: 'Aceleración', en: 'Acceleration' }, hint: { es: 'qué rápido llega a su máxima', en: 'how fast it reaches top speed' } },
  { id: 'man', name: { es: 'Manejo', en: 'Handling' }, hint: { es: 'cuánto dobla', en: 'how sharply it turns' } },
  { id: 'pes', name: { es: 'Peso', en: 'Weight' }, hint: { es: 'empuja a los livianos y aguanta los choques', en: 'shoves light rivals and shrugs off bumps' } },
  { id: 'aga', name: { es: 'Agarre', en: 'Grip' }, hint: { es: 'fuera de pista y sobre hielo', en: 'off the road and on ice' } },
  { id: 'tur', name: { es: 'Turbo', en: 'Turbo' }, hint: { es: 'miniturbos de derrape más largos', en: 'longer drift mini-turbos' } },
];
const BASE = 3;

/* prettier-ignore */
export const DRIVERS = [
  { id: 'capi',  name: 'Capi',  kind: { es: 'carpincho', en: 'capybara' },  size: 1.0,  color: '#b9793f', s: [0.5, 0.5, 0.5, 1, 1, 0],
    bio: { es: 'Tranquilo en cualquier terreno. Nunca se apura… y siempre llega.', en: 'Calm on any terrain. Never in a hurry… and always gets there.' } },
  { id: 'lola',  name: 'Lola',  kind: { es: 'rana', en: 'frog' },            size: 0.84, color: '#4fc65a', s: [-0.5, 2, 1.5, -1, 0.5, 1],
    bio: { es: 'Sale disparada en cada largada y dobla en una baldosa.', en: 'Rockets off every start line and turns on a dime.' } },
  { id: 'tuco',  name: 'Tuco',  kind: { es: 'tucán', en: 'toucan' },         size: 0.86, color: '#ffb52e', s: [0.5, 1.5, 1, -1, -0.5, 2],
    bio: { es: 'Especialista en derrapes: sus miniturbos duran una eternidad.', en: 'A drift specialist: his mini-turbos last forever.' } },
  { id: 'rulo',  name: 'Rulo',  kind: { es: 'zorro', en: 'fox' },            size: 0.95, color: '#ff7a3c', s: [1, 1, 1.5, 0, 0, 0],
    bio: { es: 'Astuto y prolijo: encuentra la mejor línea en cada curva.', en: 'Sly and tidy: finds the best line through every corner.' } },
  { id: 'lana',  name: 'Lana',  kind: { es: 'llama', en: 'llama' },          size: 1.0,  color: '#f4e7cf', s: [1, 0, 0, 0.5, 2, 0],
    bio: { es: 'Criada en la montaña: ni la arena ni el hielo la frenan.', en: 'Raised in the mountains: neither sand nor ice slows her down.' } },
  { id: 'brava', name: 'Brava', kind: { es: 'puma', en: 'puma' },            size: 1.04, color: '#d9a760', s: [2, 0.5, 0.5, 1, -1, 0.5],
    bio: { es: 'Pura velocidad en el asfalto. Fuera de la pista, no tanto.', en: 'Pure speed on tarmac. Off the track, not so much.' } },
  { id: 'tatu',  name: 'Tatú',  kind: { es: 'mulita', en: 'armadillo' },     size: 1.1,  color: '#a8957c', s: [1.5, -0.5, -0.5, 2.5, 0.5, 0],
    bio: { es: 'Un tanque con ruedas: el que lo choca sale rebotando.', en: 'A tank on wheels: whoever bumps him bounces off.' } },
  { id: 'yaca',  name: 'Yaca',  kind: { es: 'yacaré', en: 'caiman' },        size: 1.12, color: '#3f8f5c', s: [2, -1, 0, 2, 0, 0.5],
    bio: { es: 'Tarda en arrancar, pero lanzado no hay quien lo alcance.', en: 'Slow off the line, but nobody catches him at full tilt.' } },
];

/* prettier-ignore */
export const BODIES = [
  { id: 'clasico',  name: { es: 'Clásico', en: 'Classic' },   bike: false, s: [0.5, 0.5, 0.5, 0.5, 0, 0],
    bio: { es: 'El karting de toda la vida: no le sobra ni le falta nada.', en: 'The everyday kart: nothing missing, nothing extra.' } },
  { id: 'flecha',   name: { es: 'Flecha', en: 'Arrow' },      bike: false, s: [2, -0.5, 0, 0, -1, 1.5],
    bio: { es: 'Bajito y afilado. Vuela en las rectas y sufre en la tierra.', en: 'Low and sharp. Flies down straights and suffers on dirt.' } },
  { id: 'bagual',   name: { es: 'Bagual', en: 'Bronco' },     bike: false, s: [-0.5, 0, -0.5, 1.5, 2.5, -1],
    bio: { es: 'Todoterreno alto y pesado: el pasto es su casa.', en: 'A tall, heavy off-roader: grass is its home.' } },
  { id: 'latita',   name: { es: 'Latita', en: 'Tin Can' },    bike: false, s: [-1, 2, 1.5, -1, 0, 0.5],
    bio: { es: 'Chiquito y nervioso: arranca y dobla como ninguno.', en: 'Tiny and twitchy: launches and turns like no other.' } },
  { id: 'avispa',   name: { es: 'Avispa', en: 'Wasp' },       bike: true,  s: [-0.5, 1.5, 2, -1.5, 0, 0.5],
    bio: { es: 'Motito ágil que se mete por cualquier hueco.', en: 'A nimble scooter that squeezes through any gap.' } },
  { id: 'centella', name: { es: 'Centella', en: 'Spark' },    bike: true,  s: [1.5, 0.5, 1, -1, -1, 1],
    bio: { es: 'Moto de pista: en la recta levanta la rueda y se escapa.', en: 'A track bike: on the straight it pops a wheelie and runs away.' } },
  { id: 'trueno',   name: { es: 'Trueno', en: 'Thunder' },    bike: true,  s: [1.5, -0.5, -0.5, 1, 0.5, 0],
    bio: { es: 'Rutera pesada y cómoda. Dobla ancho, pero no la mueve nadie.', en: 'A heavy, comfy cruiser. Turns wide, but nobody shoves it.' } },
];

/* prettier-ignore */
export const WHEELS = [
  { id: 'estandar', name: { es: 'Estándar', en: 'Standard' },   s: [0.5, 0.5, 0, 0, 0, 0],
    bio: { es: 'Sirven para todo.', en: 'Good for everything.' } },
  { id: 'lisas',    name: { es: 'Lisas', en: 'Slicks' },         s: [1.5, 0, 0.5, 0, -1.5, 0.5],
    bio: { es: 'Más velocidad en asfalto, patinan fuera de él.', en: 'More speed on tarmac, slippery off it.' } },
  { id: 'tacos',    name: { es: 'Con tacos', en: 'Knobbies' },   s: [-0.5, 0, 0, 0.5, 2, -1],
    bio: { es: 'Muerden la tierra, la arena y el hielo.', en: 'They bite into dirt, sand and ice.' } },
  { id: 'rulemanes', name: { es: 'Rulemanes', en: 'Bearings' },  s: [-1, 1.5, 1, -0.5, -0.5, 0.5],
    bio: { es: 'Chiquitas: aceleran y doblan al toque.', en: 'Tiny: they accelerate and turn instantly.' } },
  { id: 'globo',    name: { es: 'Globo', en: 'Balloon' },        s: [0, -0.5, -0.5, 1.5, 1, -0.5],
    bio: { es: 'Gordas y pesadas: pasan por arriba de todo.', en: 'Fat and heavy: they roll over everything.' } },
];

/* prettier-ignore */
export const EXTRAS = [
  { id: 'banderin', name: { es: 'Banderín', en: 'Pennant' },      s: [0.25, 0.25, 0.25, 0, 0.25, 0],
    bio: { es: 'No hace nada… pero queda lindo.', en: 'Does nothing… but looks nice.' } },
  { id: 'aleron',   name: { es: 'Alerón', en: 'Spoiler' },        s: [0.5, -0.5, 1.5, 0, 0, -0.5],
    bio: { es: 'Pega el auto al piso: dobla mucho mejor.', en: 'Glues the car to the ground: much better cornering.' } },
  { id: 'turbina',  name: { es: 'Turbina', en: 'Turbine' },       s: [0.5, -0.5, -0.5, 0, -0.5, 2],
    bio: { es: 'Los miniturbos empujan más y por más tiempo.', en: 'Mini-turbos push harder and for longer.' } },
  { id: 'escape',   name: { es: 'Escape doble', en: 'Twin pipes' }, s: [0, 1.5, 0, 0, -1, 0.5],
    bio: { es: 'Sale como un tiro después de cada golpe.', en: 'Shoots off like a bullet after every hit.' } },
  { id: 'paragolpes', name: { es: 'Paragolpes', en: 'Bull bar' }, s: [-0.5, -0.5, -0.5, 2, 0.5, 0],
    bio: { es: 'Fierro macizo: los choques los ganás vos.', en: 'Solid steel: you win the bumps.' } },
];

/** Puesta a punto: tres perillas de -2 a +2 que cambian una estadística por otra. */
export const TUNING = [
  { id: 'rel', name: { es: 'Relación', en: 'Gearing' }, lo: { es: 'corta', en: 'short' }, hi: { es: 'larga', en: 'long' }, up: 0, down: 1 },
  { id: 'sus', name: { es: 'Suspensión', en: 'Suspension' }, lo: { es: 'blanda', en: 'soft' }, hi: { es: 'dura', en: 'stiff' }, up: 2, down: 4 },
  { id: 'las', name: { es: 'Lastre', en: 'Ballast' }, lo: { es: 'liviano', en: 'light' }, hi: { es: 'pesado', en: 'heavy' }, up: 3, down: 5 },
];
export const TUNE_MAX = 2;

/** Colores de pintura para elegir. */
export const PAINTS = ['#ff4b4b', '#ff8a1f', '#ffd23f', '#5fd35f', '#22c7c7', '#3d8bff', '#9a6bff', '#ff6bb5', '#f4f1ea', '#3a3f55'];

export const byId = (list, id) => list.find((p) => p.id === id) || list[0];

/** Configuración de fábrica (la de alguien que entra por primera vez). */
export const DEFAULT_CONFIG = Object.freeze({ driver: 'capi', body: 'clasico', wheels: 'estandar', extra: 'banderin', paint: 0, tune: [0, 0, 0] });

/** Deja una configuración guardada en algo válido aunque falten piezas o venga rota. */
export function sanitize(cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const tune = Array.isArray(c.tune) ? c.tune : [];
  return {
    driver: byId(DRIVERS, c.driver).id,
    body: byId(BODIES, c.body).id,
    wheels: byId(WHEELS, c.wheels).id,
    extra: byId(EXTRAS, c.extra).id,
    paint: Number.isInteger(c.paint) && c.paint >= 0 && c.paint < PAINTS.length ? c.paint : 0,
    tune: TUNING.map((_, i) => clamp(Math.round(Number(tune[i]) || 0), -TUNE_MAX, TUNE_MAX)),
  };
}

/** Las seis estadísticas (1 a 10) de una configuración. */
export function statsOf(cfg) {
  const c = sanitize(cfg);
  const parts = [byId(DRIVERS, c.driver), byId(BODIES, c.body), byId(WHEELS, c.wheels), byId(EXTRAS, c.extra)];
  const out = STATS.map((_, i) => BASE + parts.reduce((a, p) => a + p.s[i], 0));
  TUNING.forEach((t, i) => {
    out[t.up] += c.tune[i] * 0.5;
    out[t.down] -= c.tune[i] * 0.5;
  });
  return out.map((v) => clamp(v, 1, 10));
}

/** Cilindradas: escalan la velocidad de todos y lo bien que manejan los bots. */
export const CLASSES = [
  { id: 'paseo', name: { es: 'Paseo', en: 'Cruise' }, sub: { es: 'tranqui', en: 'easy' }, speed: 0.86, skill: 0.55 },
  { id: 'carrera', name: { es: 'Carrera', en: 'Race' }, sub: { es: 'normal', en: 'normal' }, speed: 1, skill: 0.78 },
  { id: 'fierro', name: { es: 'A fondo', en: 'Flat out' }, sub: { es: 'difícil', en: 'hard' }, speed: 1.13, skill: 1 },
];

/** De estadísticas a números de la física (ver kart.js). */
export function params(cfg, speedMul = 1) {
  const c = sanitize(cfg);
  const st = statsOf(c);
  const u = st.map((v) => (v - 1) / 9);
  const body = byId(BODIES, c.body);
  const bike = body.bike;
  return {
    bike,
    stats: st,
    vmax: lerp(25.5, 31.5, u[0]) * speedMul,
    accel: lerp(8.5, 16.5, u[1]) * (0.6 + 0.4 * speedMul),
    turn: lerp(1.72, 2.5, u[2]) * (bike ? 1.06 : 1),
    mass: lerp(0.75, 1.65, u[3]),
    off: lerp(0.46, 0.8, u[4]), // fracción de la velocidad máxima fuera de la calzada
    ice: lerp(0.85, 1.3, u[4]), // cuánto agarra en superficies que patinan
    mtRate: lerp(0.9, 1.25, u[5]), // qué rápido carga el miniturbo
    mtDur: lerp(0.75, 1.4, u[5]), // cuánto dura
    mtLevels: bike ? 2 : 3,
    driftGrip: bike ? 5.2 : 3.3, // las motos derrapan cerradas, los autos abiertos
    radius: bike ? 0.85 : 1.05,
  };
}

/** Un bot: piloto y piezas al azar (con semilla), sin repetir el piloto del jugador si se puede. */
export function randomConfig(rand, avoidDrivers = []) {
  const pool = DRIVERS.filter((d) => !avoidDrivers.includes(d.id));
  const pick = (list) => list[Math.floor(rand() * list.length)];
  return sanitize({
    driver: pick(pool.length ? pool : DRIVERS).id,
    body: pick(BODIES).id,
    wheels: pick(WHEELS).id,
    extra: pick(EXTRAS).id,
    paint: Math.floor(rand() * PAINTS.length),
    tune: [0, 0, 0],
  });
}
