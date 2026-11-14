/**
 * Terco — el camino de referencia por todo el juego, pantalla por pantalla. Cada entrada es [pantalla, metas]:
 * el buscador (tools/terco/solver.mjs) encuentra las teclas para cumplir las metas en orden, y en las salas de jefe
 * juega el piloto (tools/terco/boss-bot.mjs). Con esto se arma el recorrido que prueba que el juego se puede
 * terminar sin morir (tests/fixtures/terco-walk.json).
 *
 * Metas: { cp: 'x_y' } pasar por ese fogón · { carrot: id } · { exit: 'right', to? } · { warp: 'q1' } · { stone: true }
 *        { sig: 'nombre', cells: [[x, y]] } prender una señal (un cencerro) · { at: [x, y] } llegar a un punto
 *        { boss: 'condor' } vencer al jefe de la sala y llevar la piedra
 * Opciones por meta: shoot: true (puede patear piedritas), opts: { K, maxNodes, … }.
 */
const ex = (to, extra = {}) => ({ exit: to.side || 'right', to: to.room || to, ...extra });
export const ROUTE = [
  // ---- El Puesto
  ['p1', [{ cp: '19_13' }, { exit: 'right', to: 'p2' }]],
  ['p2', [{ sig: 'b1', cells: [[10, 13]], shoot: true }, { carrot: 'p2', shoot: true }, { exit: 'right', to: 'p3', shoot: true }]],
  ['p3', [{ carrot: 'p3' }, { exit: 'right', to: 'p4' }]],
  ['p4', [{ carrot: 'p4' }, { warp: 'q1' }]],
  // ---- La Quebrada
  ['q1', [{ cp: '6_13' }, { carrot: 'q1' }, ex('q2')]],
  ['q2', [ex('q3')]],
  ['q3', [ex('q4')]],
  ['q4', [{ sig: 'g1', cells: [[21, 7]], shoot: true }, ex('q5', { shoot: true })]],
  ['q5', [ex('q6')]],
  ['q6', [{ boss: 'condor' }]],
  // ---- La Mina
  ['p4', [{ warp: 'm1' }]],
  ['m1', [{ carrot: 'm1' }, ex('m2')]],
  ['m2', [ex('m3')]],
  ['m3', [{ exit: 'left', to: 'm3s' }]],
  ['m3s', [{ carrot: 'm3s' }, { exit: 'right', to: 'm3' }]],
  ['m3', [ex('m4')]],
  ['m4', [ex('m5')]],
  ['m5', [ex('m6')]],
  ['m6', [{ boss: 'topo' }]],
  // ---- El Salar
  ['p4', [{ warp: 's1' }]],
  ['s1', [{ carrot: 's1' }, ex('s2')]],
  ['s2', [{ carrot: 's2' }, ex('s3')]],
  ['s3', [{ carrot: 's3' }, ex('s4')]],
  ['s4', [ex('s5')]],
  ['s5', [ex('s6')]],
  ['s6', [{ boss: 'flamenco' }]],
  // ---- El Volcán
  ['p4', [{ warp: 'v1' }]],
  ['v1', [ex('v2')]],
  ['v2', [{ carrot: 'v2' }, ex('v3')]],
  ['v3', [ex('v4')]],
  ['v4', [ex('v5')]],
  ['v5', [ex('v6')]],
  ['v6', [{ boss: 'culebra' }]],
  // ---- La Cumbre
  ['p4', [ex('c1')]],
  ['c1', [ex('c2')]],
  ['c2', [{ carrot: 'c2' }, ex('c3')]],
  ['c3', [ex('c4')]],
  ['c4', [{ boss: 'tormenta' }]],
];
