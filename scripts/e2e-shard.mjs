// scripts/e2e-shard.mjs
//
// Répartit les specs e2e entre les tranches de la CI selon leur DURÉE, pas
// leur nombre de tests.
//
// Pourquoi : `--shard=i/N` de Playwright coupe la liste des tests en parts
// égales en NOMBRE. Or les durées sont très inégales (fichiers admin-* lents
// en tête d'alphabet, fichiers entiers ignorés faute de prérequis) : au
// premier run en 8 tranches, la plus lente jouait 416 s de tests, la plus
// rapide 0 s. On fait donc un bin-packing glouton (LPT : le fichier le plus
// long d'abord, dans la tranche la moins chargée) à partir des durées
// mesurées, rangées dans tests/e2e/shard-durations.json.
//
// Usage :
//   node scripts/e2e-shard.mjs <i> <N>
//       → chemins des specs de la tranche i (1-based), séparés par des espaces
//   node scripts/e2e-shard.mjs --durations <rapport-json-playwright>
//       → JSON { "fichier.spec.ts": secondes } à committer dans
//         tests/e2e/shard-durations.json (le job merge-reports le publie en
//         artefact `e2e-durations` à chaque run).
//
// Un fichier inconnu (spec nouvelle) reçoit la durée médiane : la répartition
// reste correcte, juste moins fine, jusqu'à la prochaine mise à jour.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const E2E_DIR = 'tests/e2e';
const DURATIONS = path.join(E2E_DIR, 'shard-durations.json');

function durationsFromReport(reportPath) {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const out = {};
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        for (const r of test.results ?? []) {
          out[spec.file] = (out[spec.file] ?? 0) + (r.duration ?? 0) / 1000;
        }
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const s of report.suites ?? []) walk(s);
  const sorted = Object.fromEntries(
    Object.entries(out)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([f, s]) => [f, Math.round(s * 10) / 10])
  );
  return JSON.stringify(sorted, null, 2) + '\n';
}

function shardFiles(index, total) {
  let known = {};
  try {
    known = JSON.parse(readFileSync(DURATIONS, 'utf8'));
  } catch {
    // Pas de mesures : toutes les specs pèsent pareil.
  }
  const files = readdirSync(E2E_DIR)
    .filter((f) => f.endsWith('.spec.ts'))
    .sort();
  const values = Object.values(known).sort((a, b) => a - b);
  const median = values.length ? values[Math.floor(values.length / 2)] : 1;
  const weighted = files
    .map((f) => ({ f, w: known[f] ?? median }))
    // Tri stable : poids décroissant, puis nom — même entrée, même sortie,
    // quelle que soit la tranche qui calcule.
    .sort((a, b) => b.w - a.w || a.f.localeCompare(b.f));
  const bins = Array.from({ length: total }, () => ({ load: 0, files: [] }));
  for (const { f, w } of weighted) {
    let target = bins[0];
    for (const b of bins) if (b.load < target.load) target = b;
    target.load += w;
    target.files.push(f);
  }
  const mine = bins[index - 1];
  process.stderr.write(
    `tranche ${index}/${total} : ${mine.files.length} fichiers, ~${Math.round(mine.load)} s de tests (charges : ${bins.map((b) => Math.round(b.load)).join(' / ')})\n`
  );
  return mine.files.map((f) => `${E2E_DIR}/${f}`).join(' ');
}

const args = process.argv.slice(2);
if (args[0] === '--durations') {
  process.stdout.write(durationsFromReport(args[1]));
} else {
  const index = Number(args[0]);
  const total = Number(args[1]);
  if (!Number.isInteger(index) || !Number.isInteger(total) || index < 1 || index > total) {
    process.stderr.write('usage: node scripts/e2e-shard.mjs <i> <N>\n');
    process.exit(2);
  }
  process.stdout.write(shardFiles(index, total) + '\n');
}
