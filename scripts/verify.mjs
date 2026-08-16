#!/usr/bin/env node
// scripts/verify.mjs
//
// `npm run verify` — les trois portes d'avant-commit (tests unitaires,
// typecheck, lint) LANCÉES EN PARALLÈLE.
//
// Pourquoi : elles ne se parlent pas. En série, on payait la somme des trois
// alors qu'elles tiennent sur des cœurs différents ; le mur, c'est désormais la
// plus lente (les tests). ESLint garde son cache (`.eslintcache`) : sur un
// second passage, il ne relit que les fichiers touchés.
//
// La sortie de chaque tâche est TAMPONNÉE puis rendue d'un bloc à la fin —
// trois flux entrelacés seraient illisibles. L'ordre d'affichage est fixe
// (tests, typecheck, lint), pas l'ordre d'arrivée.
//
// Usage :
//   npm run verify            # tout
//   npm run verify -- --quick # saute les tests (typecheck + lint seuls)
//
// Code de sortie : 0 si tout passe, 1 dès qu'une tâche échoue.

import { spawn } from 'node:child_process';
import process from 'node:process';

const quick = process.argv.includes('--quick');

/** @type {{ name: string, cmd: string, args: string[] }[]} */
const TASKS = [
  ...(quick
    ? []
    : [{ name: 'tests', cmd: 'npx', args: ['vitest', 'run', '--silent'] }]),
  { name: 'typecheck', cmd: 'npx', args: ['tsc', '--noEmit'] },
  {
    name: 'lint',
    cmd: 'npx',
    args: ['eslint', '.', '--fix', '--cache', '--cache-location', '.eslintcache'],
  },
];

const fmt = (ms) => `${(ms / 1000).toFixed(1)}s`;

function run(task) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(task.cmd, task.args, {
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
console.log(`▶ verify : ${TASKS.map((t) => t.name).join(' + ')} en parallèle…`);

const results = await Promise.all(TASKS.map(run));
const wall = Date.now() - started;

for (const r of results) {
  const ok = r.code === 0;
  console.log(`\n${ok ? '✅' : '❌'} ${r.name} — ${fmt(r.ms)}`);
  // Une tâche qui passe n'a rien à raconter : on ne rend sa sortie que si elle
  // échoue (ou si elle a tout de même écrit quelque chose d'inattendu).
  if (!ok && r.output) console.log(r.output);
}

const failed = results.filter((r) => r.code !== 0);
const serial = results.reduce((sum, r) => sum + r.ms, 0);
console.log(
  `\n⏱  ${fmt(wall)} au total (${fmt(serial)} en série) — ` +
    (failed.length
      ? `${failed.length} échec(s) : ${failed.map((f) => f.name).join(', ')}`
      : 'tout est vert.')
);

process.exit(failed.length ? 1 : 0);
