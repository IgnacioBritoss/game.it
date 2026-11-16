/**
 * Bengala — datos del juego (sin DOM): morteros, mejoras, recetas, constelaciones, sedes, pedidos y logros.
 * Los usan el navegador, el servidor (duelo online) y las pruebas. Los números de equilibrio se calibraron con shared/bot.js.
 *
 * Un efecto es una terna [operación, clave, valor] sobre los modificadores de la sim (ver `recalc` en sim.js):
 *   ['mul', 'all', 1.5]  ['add', 'fuseMax', 2]  ['set', 'toldo', 1]  ['gen', 3, 2]  ['gen', [0, 3], 2] (del mortero 0 al 3)
 */
export const TPS = 20; // pasos de la sim por segundo
export const FW = 256; // el cielo mide 256 × 256 unidades en todos los dispositivos
export const FH = 256;
export const SKY_MAX = 232; // no se apunta más abajo: ahí están los morteros
export const GROUND = 238; // altura de la boca de los morteros

const L = (es, en) => ({ es, en });
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV'];

// ---------------------------------------------------------------- morteros
/**
 * `period` en ticks entre disparos; cada disparo paga lo que el mortero produce en ese tiempo.
 * `pat` es cómo dispara (ver `launchAuto` en sim.js): pop bajito, rocket alto, fountain sobre el mortero, triple en columna,
 * fan en abanico, cake en barrido, bomb grande y thunder enorme con chasquidos. `rad` agranda o achica el estallido y `rise`
 * son los ticks que tarda en subir.
 */
export const GENS = [
  { id: 'chasqui', name: L('Chasquibum', 'Bang Snap'), cost: 10, prod: 0.5, period: 30, x: 28, pat: 'pop', rad: 0.6, rise: 12 },
  { id: 'canita', name: L('Cañita', 'Bottle Rocket'), cost: 150, prod: 2.5, period: 52, x: 56, pat: 'rocket', rad: 0.8, rise: 34 },
  { id: 'volcan', name: L('Volcán', 'Fountain'), cost: 2000, prod: 15, period: 64, x: 84, pat: 'fountain', rad: 1, rise: 10 },
  { id: 'tres', name: L('Tres tiros', 'Triple Shot'), cost: 35000, prod: 100, period: 76, x: 112, pat: 'triple', rad: 0.8, rise: 26 },
  { id: 'bateria', name: L('Batería', 'Battery'), cost: 700000, prod: 700, period: 88, x: 144, pat: 'fan', rad: 0.8, rise: 30 },
  { id: 'torta', name: L('Torta', 'Cake'), cost: 1.6e7, prod: 5500, period: 100, x: 172, pat: 'cake', rad: 0.85, rise: 24 },
  { id: 'bombarda', name: L('Bombarda', 'Bombard'), cost: 4e8, prod: 45000, period: 112, x: 200, pat: 'bomb', rad: 1.6, rise: 44 },
  { id: 'trueno', name: L('Trueno', 'Thunder'), cost: 1.2e10, prod: 400000, period: 124, x: 228, pat: 'thunder', rad: 2, rise: 48 },
];
export const COST_GROWTH = 1.15;
export const MAX_OWNED = 4000;
/** Al llegar a cada cantidad, ese mortero produce el doble. */
export const MILESTONES = [25, 50, 100, 150, 200, 250, 300, 400, 500, 600, 800, 1000];

// ---------------------------------------------------------------- mejoras de la tienda
/** { id, name, cost, fx, prev (índice de la mejora anterior de la serie, o -1), gen y need (hace falta tener `need` de ese mortero) } */
export const UPS = [];
const GEN_TIERS = [
  { need: 10, mul: 50, name: L('Mecha rápida', 'Quick fuse') },
  { need: 40, mul: 1e4, name: L('Pólvora fina', 'Fine powder') },
  { need: 80, mul: 3e6, name: L('Doble carga', 'Double charge') },
  { need: 150, mul: 5e10, name: L('Carga maestra', 'Master charge') },
  { need: 250, mul: 6e16, name: L('Carga de gala', 'Gala charge') },
  { need: 400, mul: 8e25, name: L('Carga legendaria', 'Legendary charge') },
];
GENS.forEach((g, i) =>
  GEN_TIERS.forEach((tier, k) =>
    UPS.push({
      id: `g${i}_${k}`,
      name: L(`${tier.name.es}: ${g.name.es}`, `${tier.name.en}: ${g.name.en}`),
      cost: g.cost * tier.mul,
      fx: [['gen', i, 2]],
      prev: k ? UPS.length - 1 : -1,
      gen: i,
      need: tier.need,
    }),
  ),
);
function series(key, es, en, costs, fx) {
  costs.forEach((cost, k) => UPS.push({ id: `${key}${k}`, name: L(`${es} ${ROMAN[k]}`, `${en} ${ROMAN[k]}`), cost, fx, prev: k ? UPS.length - 1 : -1, gen: -1, need: 0 }));
}
series('todo', 'Pólvora mágica', 'Magic powder', [5e4, 2e6, 1e8, 5e9, 5e11, 5e13, 5e15, 5e17, 5e20, 5e23, 5e26, 5e30, 5e34, 5e38], [['mul', 'all', 1.5]]);
series('pulso', 'Pulso firme', 'Steady hand', [100, 1e3, 2e4, 5e5, 2e7, 1e9, 1e11, 1e13], [['mul', 'manMul', 2], ['add', 'manPct', 0.02]]);
series('caja', 'Caja de mechas', 'Fuse box', [1e3, 1e5, 2e7, 1e10], [['add', 'fuseMax', 2]]);
series('encendedor', 'Encendedor', 'Lighter', [5e3, 5e5, 1e8, 5e10], [['add', 'fuseReg', 0.025]]);
series('ancha', 'Carga ancha', 'Wide burst', [2e4, 2e6, 3e8, 5e10, 1e13], [['mul', 'radius', 1.1]]);
series('tope', 'Mecha en cadena', 'Chain fuse', [5e4, 5e6, 1e9, 2e11, 5e13], [['add', 'chainCap', 1]]);
series('reaccion', 'Reacción', 'Reaction', [1e5, 1e7, 2e9, 5e11, 1e14], [['add', 'chainStep', 0.1]]);
series('animador', 'Animador', 'Hype man', [3e4, 5e6, 2e9], [['mul', 'ovGain', 1.25]]);
series('fiel', 'Público fiel', 'Loyal crowd', [6e4, 1e7, 5e9], [['mul', 'ovDecay', 0.8]]);
series('tribuna', 'Tribuna', 'Grandstand', [3e5, 1e8, 5e10, 5e13], [['add', 'ovMax', 0.5]]);
series('faroleria', 'Farolería', 'Lantern shop', [1e4, 3e6, 1e9], [['mul', 'lanInt', 0.8]]);
series('seda', 'Farol de seda', 'Silk lantern', [2e4, 5e6, 3e9, 5e12], [['mul', 'lanMul', 1.5]]);
series('aeroclub', 'Aeroclub', 'Flying club', [1e6, 1e10], [['mul', 'plaInt', 0.75]]);
series('cartel', 'Cartel gigante', 'Giant banner', [2e6, 2e9, 3e12], [['mul', 'plaVal', 2]]);
series('programa', 'Programa largo', 'Longer program', [400, 2e4, 1e6, 5e7, 5e9, 5e11], [['add', 'showLen', 100]]);
series('bis', 'Bis', 'Encore', [1e6, 1e9, 1e12], [['add', 'finDur', 60]]);

// ---------------------------------------------------------------- recetas (color × forma)
export const COLS = [
  { id: 'rojo', name: L('roja', 'red'), hex: '#ff3b5c' },
  { id: 'naranja', name: L('naranja', 'orange'), hex: '#ff9f1c' },
  { id: 'amarillo', name: L('amarilla', 'yellow'), hex: '#ffe14d' },
  { id: 'verde', name: L('verde', 'green'), hex: '#4dff88' },
  { id: 'cian', name: L('cian', 'cyan'), hex: '#3df5ff' },
  { id: 'azul', name: L('azul', 'blue'), hex: '#5b8cff' },
  { id: 'violeta', name: L('violeta', 'violet'), hex: '#c77dff' },
  { id: 'blanco', name: L('blanca', 'white'), hex: '#fff5e0' },
];
export const SHAPES = [
  { id: 'peonia', name: L('Peonía', 'Peony') },
  { id: 'crisantemo', name: L('Crisantemo', 'Chrysanthemum') },
  { id: 'sauce', name: L('Sauce', 'Willow') },
  { id: 'palmera', name: L('Palmera', 'Palm') },
  { id: 'anillo', name: L('Anillo', 'Ring') },
  { id: 'corazon', name: L('Corazón', 'Heart') },
  { id: 'estrella', name: L('Estrella', 'Star') },
  { id: 'espiral', name: L('Espiral', 'Spiral') },
  { id: 'cascada', name: L('Cascada', 'Waterfall') },
  { id: 'saturno', name: L('Saturno', 'Saturn') },
];
export const NC = COLS.length;
export const NS = SHAPES.length;
export const REC_N = NC * NS; // la receta r es el color floor(r / 10) con la forma r % 10
/** Costo en Pólvora de la receta n.º k+2 (la primera viene de regalo): sube 11,5 % cada vez. */
export const REC_COST = (() => {
  const out = [];
  let c = 2;
  for (let k = 0; k < REC_N; k++) {
    out.push(Math.ceil(c));
    c *= 1.115;
  }
  return out;
})();
export const REC_ROW_MUL = 1.1; // fila de un color completa: producción ×1,1
export const REC_COL_STEP = 0.05; // columna de una forma completa: +5 % por eslabón

// ---------------------------------------------------------------- constelaciones (se pagan con estrellas)
export const NODE_COST = [5, 10, 20, 40, 75, 130, 220, 350, 550, 800];
/** `pts`: las 10 estrellas en una caja de 100 × 100 (se unen en orden); `fx`: poder al completarla. */
export const CONS = [
  {
    id: 'mortero',
    name: L('El Mortero', 'The Mortar'),
    pts: [[20, 80], [40, 86], [60, 80], [63, 60], [58, 40], [42, 40], [37, 60], [50, 26], [34, 12], [66, 12]],
    fx: [['set', 'mileMul', 3]],
    nodes: [
      [['mul', 'all', 1.5]],
      [['gen', [0, 3], 2]],
      [['gen', [4, 7], 2]],
      [['mul', 'cost', 0.9]],
      [['mul', 'all', 2]],
      [['set', 'startGens', 1]],
      [['mul', 'all', 2]],
      [['mul', 'cost', 0.9]],
      [['mul', 'all', 3]],
      [['mul', 'all', 3]],
    ],
  },
  {
    id: 'mano',
    name: L('La Mano', 'The Hand'),
    pts: [[26, 88], [28, 62], [16, 44], [30, 52], [34, 24], [43, 50], [51, 18], [56, 50], [68, 30], [63, 72]],
    fx: [['set', 'dbl', 1]],
    nodes: [
      [['mul', 'manMul', 3]],
      [['add', 'fuseMax', 2]],
      [['mul', 'fuseReg', 1.5]],
      [['add', 'manPct', 0.03]],
      [['mul', 'manMul', 3]],
      [['add', 'fuseMax', 2]],
      [['mul', 'manRad', 1.2]],
      [['add', 'manPct', 0.05]],
      [['mul', 'fuseReg', 1.5]],
      [['mul', 'manMul', 5]],
    ],
  },
  {
    id: 'cadena',
    name: L('La Cadena', 'The Chain'),
    pts: [[10, 50], [22, 34], [34, 50], [46, 34], [58, 50], [70, 34], [84, 50], [70, 66], [46, 66], [22, 66]],
    fx: [['set', 'lanChain', 1]],
    nodes: [
      [['add', 'chainCap', 2]],
      [['add', 'chainStep', 0.25]],
      [['mul', 'radius', 1.15]],
      [['add', 'chainCap', 2]],
      [['add', 'linger', 2]],
      [['add', 'chainStep', 0.25]],
      [['add', 'chainCap', 3]],
      [['mul', 'radius', 1.15]],
      [['add', 'chainStep', 0.5]],
      [['add', 'chainCap', 8]],
    ],
  },
  {
    id: 'publico',
    name: L('El Público', 'The Crowd'),
    pts: [[15, 72], [15, 40], [30, 56], [42, 24], [50, 50], [58, 24], [70, 56], [85, 40], [85, 72], [50, 80]],
    fx: [['set', 'autoFin', 1]],
    nodes: [
      [['mul', 'ovGain', 1.5]],
      [['mul', 'ovDecay', 0.7]],
      [['add', 'ovMax', 1]],
      [['add', 'finDur', 80]],
      [['set', 'finAfter', 60]],
      [['mul', 'ovGain', 1.5]],
      [['add', 'ovMax', 1]],
      [['set', 'finRate', 5]],
      [['mul', 'ovDecay', 0.7]],
      [['add', 'ovMax', 2]],
    ],
  },
  {
    id: 'quimica',
    name: L('La Química', 'The Chemistry'),
    pts: [[42, 12], [58, 12], [58, 36], [78, 74], [70, 88], [50, 90], [30, 88], [22, 74], [42, 36], [50, 64]],
    fx: [['set', 'recPct', 0.04]],
    nodes: [
      [['mul', 'polv', 1.5]],
      [['mul', 'recCost', 0.85]],
      [['add', 'conPlus', 1]],
      [['mul', 'polv', 1.5]],
      [['mul', 'plaPolv', 2]],
      [['mul', 'recCost', 0.85]],
      [['set', 'conCd', 0]],
      [['mul', 'polv', 2]],
      [['add', 'finPolv', 2]],
      [['mul', 'polv', 2]],
    ],
  },
  {
    id: 'reloj',
    name: L('El Reloj', 'The Clock'),
    pts: [[86, 50], [75, 75], [50, 86], [25, 75], [14, 50], [25, 25], [50, 14], [75, 25], [50, 50], [50, 30]],
    fx: [['add', 'showLen', 200]],
    nodes: [
      [['add', 'showLen', 100]],
      [['mul', 'lanInt', 0.7]],
      [['mul', 'star', 1.25]],
      [['add', 'startCh', 5000]],
      [['add', 'showLen', 100]],
      [['mul', 'star', 1.25]],
      [['mul', 'plaInt', 0.7]],
      [['add', 'showLen', 100]],
      [['mul', 'star', 1.5]],
      [['add', 'showLen', 100]],
    ],
  },
];
/** Nodos en una sola lista: el nodo k de la constelación c es el índice c * 10 + k y pide tener el anterior. */
export const NODES = CONS.flatMap((con, c) => con.nodes.map((fx, k) => ({ c, k, cost: NODE_COST[k], fx })));

// ---------------------------------------------------------------- sedes de la gira
/** `goal`: chispas a juntar en una sola función para llenar la plaza y poder viajar. Las reglas de las sedes ya visitadas quedan para siempre; las estrellas y las constelaciones también. */
export const VENUES = [
  { id: 'pueblo', name: L('Pueblo', 'Village'), rule: L('', ''), fx: [], goal: 7e4 },
  { id: 'puerto', name: L('Puerto', 'Harbor'), rule: L('Farolitos x2', 'Lanterns x2'), fx: [['mul', 'lanMul', 2]], goal: 2.6e12 },
  { id: 'sierra', name: L('Sierra', 'Highlands'), rule: L('Cadenas de 3+ pagan 50 % más', 'Chains of 3+ pay 50% more'), fx: [['set', 'eco', 1]], goal: 3.8e17 },
  { id: 'salar', name: L('Salar', 'Salt Flat'), rule: L('La ovación baja la mitad', 'Ovation drops half as fast'), fx: [['mul', 'ovDecay', 0.5]], goal: 2e19 },
  { id: 'metropolis', name: L('Metrópolis', 'Metropolis'), rule: L('Aviones x2', 'Planes x2'), fx: [['mul', 'plaInt', 0.5]], goal: 2.6e21 },
  { id: 'isla', name: L('Isla', 'Island'), rule: L('Tope de cadena +3', 'Chain cap +3'), fx: [['add', 'chainCap', 3]], goal: 2.8e22 },
  { id: 'flotante', name: L('Ciudad flotante', 'Floating City'), rule: L('Mechas x2 de rápido', 'Fuses recharge x2'), fx: [['mul', 'fuseReg', 2]], goal: 1.7e24 },
  { id: 'luna', name: L('Luna', 'Moon'), rule: L('Cohetes lentos, estallidos 25 % más grandes', 'Slow rockets, bursts 25% bigger'), fx: [['mul', 'rise', 1.6], ['mul', 'radius', 1.25]], goal: 2.4e25 },
];
export const SHOW_LEN = 40 * TPS; // lo que dura una función sin mejoras
export const FAME_PCT = 0.03; // cada función en una sede: +3 % (se pierde al viajar)
export const POSTAL_ALL = 5; // cada postal: producción ×5…
export const POSTAL_POLV = 1.5; // …y Pólvora ×1,5
export const LAP_GOAL = 1.5e22; // pasada la Luna, cada vuelta pide esto más

// ---------------------------------------------------------------- estrellas
/** Estrellas en total = STAR_K × (magnitud de todas las chispas juntadas − STAR_L0)², con la magnitud ≈ log10 (ver `mag` en sim.js). */
export const STAR_K = 3;
export const STAR_L0 = 3;
export const STAR_PCT = 0.005; // cada estrella ganada en toda la partida: +0,5 % de producción

// ---------------------------------------------------------------- duelo, diario y reto (todos de cero, misma semilla)
export const SPRINT = { all: 6, polv: 3, lan: 0.6, pla: 700, con: 120 };
/** Un duelo, un sprint o el show del día son varias funciones con un rato de taller entre una y otra (segundos). */
export const RACE = { 3: { n: 3, show: 50, brk: 15 }, 5: { n: 4, show: 60, brk: 20 }, 10: { n: 6, show: 80, brk: 24 } };
export const SPRINT_TIMES = { 3: 180, 5: 300, 10: 600 };
/** Umbrales de medalla (bronce, plata, oro, platino, diamante) por duración, sacados de cinco niveles del bot. */
export const MEDALS = { 3: [9000, 17000, 1.5e5, 2.5e5, 4e5], 5: [4e4, 2e5, 2e6, 5e6, 9e6], 10: [4.5e5, 6e6, 4e8, 1.2e9, 2.5e9] };

// ---------------------------------------------------------------- pedidos del público
/** `{n}` es la cantidad pedida y `{a}` el largo de cadena. */
export const CON_TEXT = [
  L('{n} cadenas de {a}+', '{n} chains of {a}+'),
  L('{n} colores en 20 s', '{n} colors in 20 s'),
  L('{n} farolitos', '{n} lanterns'),
  L('{n} cohetes a mano', '{n} hand rockets'),
  L('Un Gran Final', 'A Grand Finale'),
  L('{n} chispas', '{n} sparks'),
  L('El cartel del avión', 'The plane banner'),
  L('Una cadena de {a}+', 'A chain of {a}+'),
];

// ---------------------------------------------------------------- logros
export const ACH = [];
const ach = (k, v, es, en, i = -1) => ACH.push({ id: `${k}${i < 0 ? '' : i + '_'}${v}`, k, v, i, name: L(es, en) });
[
  [1e3, 'Primeras chispas', 'First sparks'],
  [1e6, 'Fogonazo', 'Flash'],
  [1e9, 'Resplandor', 'Glow'],
  [1e12, 'Cielo encendido', 'Sky on fire'],
  [1e15, 'Aurora', 'Aurora'],
  [1e18, 'Supernova', 'Supernova'],
  [1e21, 'Vía Láctea', 'Milky Way'],
  [1e24, 'Big Bang', 'Big Bang'],
].forEach(([v, es, en]) => ach('life', v, es, en));
GENS.forEach((g, i) => ach('gen', 50, `Arsenal de ${g.name.es}`, `${g.name.en} arsenal`, i));
GENS.forEach((g, i) => ach('gen', 150, `Maestría en ${g.name.es}`, `${g.name.en} mastery`, i));
[
  [3, 'Reacción', 'Reaction'],
  [5, 'En cadena', 'Chained'],
  [8, 'Dominó', 'Dominoes'],
  [12, 'Efecto mariposa', 'Butterfly effect'],
  [18, 'Avalancha', 'Avalanche'],
  [25, 'Cielo en llamas', 'Blazing sky'],
].forEach(([v, es, en]) => ach('chain', v, es, en));
[
  [1, 'Bis', 'Encore'],
  [10, 'Ovación de pie', 'Standing ovation'],
  [50, 'Showman', 'Showman'],
  [200, 'Leyenda del escenario', 'Stage legend'],
].forEach(([v, es, en]) => ach('fin', v, es, en));
[
  [10, 'Farolero', 'Lamplighter'],
  [100, 'Noche de faroles', 'Lantern night'],
  [1000, 'Mil deseos', 'A thousand wishes'],
].forEach(([v, es, en]) => ach('lan', v, es, en));
[
  [1, 'Publicidad gratis', 'Free advertising'],
  [10, 'Cartelera', 'Billboard'],
  [50, 'Dueño del cielo', 'Owner of the sky'],
].forEach(([v, es, en]) => ach('pla', v, es, en));
[
  [5, 'Aprendiz', 'Apprentice'],
  [20, 'Químico', 'Chemist'],
  [40, 'Alquimista', 'Alchemist'],
  [60, 'Maestro pirotécnico', 'Master pyrotechnician'],
  [80, 'Catálogo completo', 'Full catalog'],
].forEach(([v, es, en]) => ach('rec', v, es, en));
[
  [5, 'Cumplidor', 'Reliable'],
  [25, 'Profesional', 'Professional'],
  [100, 'Agenda llena', 'Fully booked'],
].forEach(([v, es, en]) => ach('con', v, es, en));
[
  [10, 'Debut', 'Debut'],
  [100, 'Cien funciones', 'A hundred shows'],
  [500, 'Clásico de cada año', 'Yearly classic'],
].forEach(([v, es, en]) => ach('run', v, es, en));
[
  [1, 'De gira', 'On tour'],
  [3, 'Pasaporte sellado', 'Stamped passport'],
  [5, 'Gira mundial', 'World tour'],
  [7, 'Alunizaje', 'Moon landing'],
].forEach(([v, es, en]) => ach('ven', v, es, en));
[
  [100, 'Dedo inquieto', 'Restless finger'],
  [1000, 'Pulso de cirujano', 'Surgeon hands'],
  [10000, 'Mano de artista', 'Artist touch'],
].forEach(([v, es, en]) => ach('man', v, es, en));
[
  [1, 'Función de hoy', 'Tonight only'],
  [7, 'Abono semanal', 'Weekly pass'],
].forEach(([v, es, en]) => ach('day', v, es, en));
export const ACH_PCT = 0.01; // cada logro: +1 % de producción

/** Qué pide cada tipo de logro (para mostrarlo). `{v}` es la cantidad y `{g}` el mortero. */
export const ACH_TEXT = {
  life: L('Juntá {v} chispas en total', 'Earn {v} sparks in total'),
  gen: L('Tené {v} de {g}', 'Own {v} {g}'),
  chain: L('Hacé una cadena de {v}', 'Make a chain of {v}'),
  fin: L('Hacé {v} Grandes Finales', 'Pull off {v} Grand Finales'),
  lan: L('Reventá {v} farolitos', 'Pop {v} lanterns'),
  pla: L('Iluminá {v} carteles de avión', 'Light up {v} plane banners'),
  rec: L('Descubrí {v} recetas', 'Discover {v} recipes'),
  con: L('Cumplí {v} pedidos', 'Complete {v} requests'),
  run: L('Hacé {v} funciones', 'Play {v} shows'),
  ven: L('Viajá {v} veces', 'Travel {v} times'),
  man: L('Lanzá {v} cohetes a mano', 'Launch {v} rockets by hand'),
  day: L('Jugá el Show del día {v} veces', 'Play the Daily Show {v} times'),
};

// ---------------------------------------------------------------- texto de un efecto
const num = (v, lang) => {
  const s = String(Math.round(v * 100) / 100);
  return lang === 'es' ? s.replace('.', ',') : s;
};
const FX_TEXT = {
  'mul:all': L('Todo x{v}', 'Everything x{v}'),
  'add:showLen': L('Función +{s} s', 'Show +{s} s'),
  'mul:manMul': L('Toques x{v}', 'Taps x{v}'),
  'add:manPct': L('+{p} % de tus morteros por toque', '+{p}% of your mortars per tap'),
  'mul:manRad': L('Toques {q} % más anchos', 'Taps {q}% wider'),
  'add:fuseMax': L('+{v} mechas', '+{v} fuses'),
  'add:fuseReg': L('+{r} mechas por segundo', '+{r} fuses per second'),
  'mul:fuseReg': L('Mechas x{v} de rápido', 'Fuses recharge x{v}'),
  'mul:radius': L('Estallidos {q} % más anchos', 'Bursts {q}% wider'),
  'add:linger': L('Los estallidos duran más', 'Bursts linger longer'),
  'add:chainCap': L('Tope de cadena +{v}', 'Chain cap +{v}'),
  'add:chainStep': L('+{p} % por eslabón', '+{p}% per link'),
  'mul:ovGain': L('Ovación {q} % más rápida', 'Ovation {q}% faster'),
  'mul:ovDecay': L('La ovación baja {d} % menos', 'Ovation drops {d}% less'),
  'add:ovMax': L('Ovación llena +x{v}', 'Full ovation +x{v}'),
  'add:finDur': L('Gran Final +{s} s', 'Grand Finale +{s} s'),
  'set:finAfter': L('Tras el Gran Final, ovación en {v}', 'After the Grand Finale, ovation at {v}'),
  'set:finRate': L('Morteros x{v} en el Gran Final', 'Mortars x{v} in the Grand Finale'),
  'add:finPolv': L('+{v} Pólvora por Gran Final', '+{v} Powder per Grand Finale'),
  'mul:lanInt': L('Farolitos {d} % más seguido', 'Lanterns {d}% more often'),
  'mul:lanMul': L('Farolitos x{v}', 'Lanterns x{v}'),
  'mul:plaInt': L('Aviones {d} % más seguido', 'Planes {d}% more often'),
  'mul:plaVal': L('Avión x{v}', 'Plane x{v}'),
  'mul:plaPolv': L('Pólvora del avión x{v}', 'Plane Powder x{v}'),
  'mul:cost': L('Morteros {d} % más baratos', 'Mortars {d}% cheaper'),
  'mul:star': L('Estrellas x{v}', 'Stars x{v}'),
  'mul:polv': L('Pólvora x{v}', 'Powder x{v}'),
  'mul:recCost': L('Recetas {d} % más baratas', 'Recipes {d}% cheaper'),
  'set:recPct': L('Cada receta da {p} %', 'Each recipe gives {p}%'),
  'set:mileMul': L('Los hitos dan x{v}', 'Milestones give x{v}'),
  'set:autoFin': L('El Gran Final arranca solo', 'The Grand Finale starts by itself'),
  'set:dbl': L('Cada toque lanza dos cohetes', 'Each tap launches two rockets'),
  'set:eco': L('Cadenas de 3+ pagan 50 % más', 'Chains of 3+ pay 50% more'),
  'set:lanChain': L('Los farolitos siguen la cadena', 'Lanterns carry the chain on'),
  'add:conPlus': L('Pedidos +{v} Pólvora', 'Requests +{v} Powder'),
  'set:conCd': L('Pedidos sin espera', 'No wait between requests'),
  'mul:rise': L('Cohetes lentos', 'Slow rockets'),
  'add:startCh': L('Empezás cada sede con {v} chispas', 'Start every venue with {v} sparks'),
  'set:startGens': L('Empezás cada sede con 10 Chasquibum y 5 Cañitas', 'Start every venue with 10 Bang Snaps and 5 Bottle Rockets'),
};
/** Describe una lista de efectos en el idioma pedido ("Toques x2 y cada toque suma 2 % de la producción"). */
export function fxText(fx, lang = 'es') {
  const es = lang === 'es';
  const parts = fx.map(([op, key, v]) => {
    if (op === 'gen') {
      if (Array.isArray(key)) return (es ? `Morteros ${key[0] + 1} a ${key[1] + 1} x` : `Mortars ${key[0] + 1} to ${key[1] + 1} x`) + num(v, lang);
      return `${GENS[key].name[lang] || GENS[key].name.es} x${num(v, lang)}`;
    }
    const tpl = FX_TEXT[`${op}:${key}`];
    if (!tpl) return `${key} ${op} ${v}`;
    return (tpl[lang] || tpl.es)
      .replace('{v}', num(v, lang))
      .replace('{p}', num(v * 100, lang))
      .replace('{q}', num((v - 1) * 100, lang))
      .replace('{d}', num((1 - v) * 100, lang))
      .replace('{r}', num(v * TPS, lang))
      .replace('{s}', num(v / TPS, lang))
      .replace('{h}', num(v / 3600, lang));
  });
  return parts.join(es ? ' y ' : ' and ');
}
