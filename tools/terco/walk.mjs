/**
 * Terco — arma el recorrido de referencia: juega ROUTE de punta a punta con el buscador y guarda las teclas en
 * tests/fixtures/terco-walk.json (la prueba lo reproduce y comprueba que el juego se termina).
 *   node tools/terco/walk.mjs [desde] [hasta]     (por ejemplo: node tools/terco/walk.mjs q1 q3 para probar de a tramos)
 */
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { newGame, stepGame, enter, ROOMS } from '../../public/games/terco/shared/world.js';
import { solvePath, pack, trace } from './solver.mjs';
import { ROUTE } from './routes.mjs';
import { playBoss } from './boss-bot.mjs';

const ONLY = process.env.BOSS_ONLY;
const OUT = new URL('../../tests/fixtures/terco-walk.json', import.meta.url).pathname;
const [from, to] = process.argv.slice(2);
const MARGIN = 0.1;
let G = newGame(0, { margin: MARGIN });
const all = [];
let skipping = !!from && from !== ROUTE[0][0];
let failed = 0;
const t00 = Date.now();

const doStep = (a) => {
  all.push(a);
  stepGame(G, a);
};

for (const [room, goals, extra] of ROUTE) {
  if (skipping && room === from) skipping = false;
  if (skipping) continue;
  if (G.room !== room) {
    console.log(`✗ ${room}: la partida está en ${G.room}`);
    process.exit(1);
  }
  const t0 = Date.now();
  const R = ROOMS[room];
  if (R.boss >= 0 && process.env.CHEAT) {
    // para probar las demás pantallas mientras no hay piloto de jefes: se da la piedra por ganada
    const zone = R.zone;
    if (zone !== 'cumbre') {
      G.stones.push(zone);
      G.flags[`stone:${zone}`] = 1;
      if (G.stones.length >= 4) G.flags.stones = 1;
      enter(G, 'p4', 'cairn');
    }
    console.log(`~ ${room}: jefe salteado (CHEAT)`);
  } else if (R.boss >= 0) {
    // jefe: lo juega el bot (tools/terco/boss-bot.mjs)
    const r = playBoss(G, goals, doStep);
    console.log(`${r.ok ? '✓' : '✗'} ${room}: jefe ${r.ok ? 'vencido' : 'NO vencido'} en ${r.steps} pasos (${r.deaths} muertes del bot) ${Date.now() - t0} ms`);
    if (!r.ok) {
      failed++;
      break;
    }
  } else {
    const S0 = G.S;
    const r = solvePath(S0, goals, extra || {});
    if (r.fail) {
      failed++;
      console.log(`✗ ${room}: sin solución para ${JSON.stringify(r.at)} (${r.nodes} nodos, ${Date.now() - t0} ms)`);
      process.exit(1);
    }
    for (const a of r.inputs) doStep(a);
    // la espera más larga con las manos quietas: si es enorme, la pantalla pide una sincronía demasiado fina
    let idle = 0, maxIdle = 0;
    for (const a of r.inputs) {
      idle = a === 0 ? idle + 1 : 0;
      if (idle > maxIdle) maxIdle = idle;
    }
    console.log(`✓ ${room} → ${G.room}  ${r.inputs.length} pasos  ${r.nodes} nodos  ${Date.now() - t0} ms${maxIdle > 240 ? `  ⚠ espera de ${(maxIdle / 60).toFixed(1)} s` : ''}`);
    if (process.env.TRACE) console.log(trace(S0, r.inputs));
  }
  if (to && room === to) break;
}
console.log(`\n${all.length} pasos (${(all.length / 60).toFixed(0)} s de juego) · ${G.deaths} muertes · ${G.carrots.length} zanahorias · ${G.stones.length} piedras · ${((Date.now() - t00) / 1000).toFixed(1)} s${G.won ? ' · ¡GANÓ!' : ''}`);
if (!from && !to && !failed) {
  writeFileSync(OUT, JSON.stringify({ diff: 0, steps: all.length, won: G.won, inputs: pack(all) }));
  console.log('guardado', OUT);
}
process.exit(failed ? 1 : 0);
