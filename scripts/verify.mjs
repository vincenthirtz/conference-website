#!/usr/bin/env node
// scripts/verify.mjs
//
// `npm run verify` — les trois portes d'avant-commit (tests unitaires,
// typecheck, lint) LANCÉES EN PARALLÈLE.
//
// Pourquoi : elles ne se parlent pas. En série, on payait la somme des trois
// alors qu'elles tiennent sur des cœurs différents ; le mur, c'est désormais la
// plus lente (les tests).
//
// Le lint est Biome (Rust, ~2 s sur tout le dépôt, sans cache) : ESLint prenait
// 27 s à chaud pour ne bloquer aucune erreur. Les contrôles « code mort » qu'il
// portait (variables, imports, paramètres inutilisés…) sont passés dans
// `tsconfig.json`, donc dans le typecheck.
//
// Sur le bridage des workers — MESURÉ, ne pas refaire l'erreur : plafonner
// vitest aux cœurs physiques (2 workers au lieu de son défaut) fait passer le
// run de 60,6 s à 88,2 s pour un load identique (12,9 → 11,9). Le parallélisme
// par défaut est le bon réglage ; ce sont les runs à CACHE FROID qui coûtent
// cher (typecheck : 11 s à chaud, 177 s à froid). Si le total explose, vérifier
// `tsconfig.tsbuildinfo` avant de soupçonner la concurrence.
//
// Les garde-fous ci-dessous restent disponibles à la demande, pour une machine
// déjà chaude ou occupée — mais ils ne sont PAS le défaut.
//
// Usage :
//   npm run verify                  # tout, sous budget
//   npm run verify -- --quick       # saute les tests (typecheck + lint)
//   npm run verify -- --serial      # une tâche à la fois (machine chaude)
//   VERIFY_JOBS=4 npm run verify    # plafonne le total à 4 threads
//
// Code de sortie : 0 si tout passe, 1 dès qu'une tâche échoue.

import { spawn } from 'node:child_process';
import os from 'node:os';
import process from 'node:process';

const quick = process.argv.includes('--quick');
const serial = process.argv.includes('--serial');

const LOGICAL = os.availableParallelism?.() ?? os.cpus().length;

// Aucun plafond par défaut : vitest gère son propre pool mieux que nous.
// VERIFY_JOBS=<n> impose un budget total (tsc et biome prennent 1 thread
// chacun, vitest reçoit le reste) — utile si on compile ou joue en parallèle.
const BUDGET = Number(process.env.VERIFY_JOBS) || 0;
const VITEST_WORKERS = BUDGET ? Math.max(1, BUDGET - 2) : 0;

/** @type {{ name: string, cmd: string, args: string[] }[]} */
const TASKS = [
  ...(quick
    ? []
    : [
        {
          name: 'tests',
          cmd: 'npx',
          args: [
            'vitest',
            'run',
            '--silent',
            ...(VITEST_WORKERS ? [`--maxWorkers=${VITEST_WORKERS}`] : []),
          ],
        },
      ]),
  { name: 'typecheck', cmd: 'npx', args: ['tsc', '--noEmit'] },
  {
    name: 'lint',
    cmd: 'npx',
    args: ['biome', 'lint', '.'],
  },
];

const fmt = (ms) => `${(ms / 1000).toFixed(1)}s`;

function run(task) {
  const started = Date.now();
  return new Promise((resolve) => {
    // `nice` : priorité basse. Le run prend le CPU disponible mais rend la main
    // à l'interface, ce qui évite les à-coups pendant qu'on continue à coder.
    const child = spawn('nice', ['-n', '10', task.cmd, ...task.args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let output = '';
    child.stdout.on('data', (c) => (output += c));
    child.stderr.on('data', (c) => (output += c));
    child.on('error', (err) => {
      resolve({ ...task, code: 1, output: String(err), ms: Date.now() - started });
    });
    child.on('close', (code) => {
      resolve({
        ...task,
        code: code ?? 1,
        output: output.trim(),
        ms: Date.now() - started,
      });
    });
  });
}

const started = Date.now();
const plan = serial
  ? `${TASKS.map((t) => t.name).join(' → ')} en série`
  : `${TASKS.map((t) => t.name).join(' + ')} en parallèle`;
console.log(
  `▶ verify : ${plan}` +
    (BUDGET ? ` — budget ${BUDGET}/${LOGICAL} threads` : '') +
    '…',
);

let results;
if (serial) {
  results = [];
  for (const t of TASKS) results.push(await run(t));
} else {
  results = await Promise.all(TASKS.map(run));
}
const wall = Date.now() - started;

for (const r of results) {
  const ok = r.code === 0;
  console.log(`\n${ok ? '✅' : '❌'} ${r.name} — ${fmt(r.ms)}`);
  // Une tâche qui passe n'a rien à raconter : on ne rend sa sortie que si elle
  // échoue (ou si elle a tout de même écrit quelque chose d'inattendu).
  if (!ok && r.output) console.log(r.output);
}

const failed = results.filter((r) => r.code !== 0);
const cpu = results.reduce((sum, r) => sum + r.ms, 0);
console.log(
  `\n⏱  ${fmt(wall)} au total (${fmt(cpu)} cumulés) — ` +
    (failed.length
      ? `${failed.length} échec(s) : ${failed.map((f) => f.name).join(', ')}`
      : 'tout est vert.'),
);

process.exit(failed.length ? 1 : 0);
