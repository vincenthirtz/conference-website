#!/usr/bin/env node
// scripts/refresh-schema-snapshot.mjs
//
// Régénère database/schema-snapshot.json : la liste des colonnes réellement
// exposées par PostgREST, table par table.
//
// POURQUOI : le mock Supabase des tests unitaires ne valide pas les noms de
// colonnes. Un `.select('colonne_inexistante')` passe au vert en test et ne
// casse qu'en production, où PostgREST rejette la requête ENTIÈRE
// (42703 undefined_column) — l'endpoint répond 500 et l'écran qui en dépend
// n'affiche plus rien. C'est arrivé deux fois (mvp-leaderboard, puis
// matches.best_of / matches.started_at sur /admin/scrims/[id]).
//
// L'instantané sert de référence au garde-fou tests/unit/supabaseSelectSchema.test.ts,
// qui tourne hors ligne — donc en CI, sans secret.
//
// SOURCE : le document OpenAPI que PostgREST sert à la racine de /rest/v1/.
// C'est la bonne source : exactement la surface que les `.select()` attaquent
// (tables ET vues), et non ce que le SQL brut verrait.
//
// USAGE : node scripts/refresh-schema-snapshot.mjs
//   Lit NEXT_PUBLIC_SUPABASE_URL et NEXT_SUPABASE_SERVICE_ROLE_KEY (ou
//   SUPABASE_SERVICE_ROLE_KEY) depuis l'environnement ou .env.local.
//   À rejouer après toute migration qui ajoute/retire une colonne.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'database/schema-snapshot.json');

// .env.local n'est pas chargé automatiquement hors Next : on le lit à la main,
// sans écraser une variable déjà posée dans l'environnement.
function loadEnvLocal() {
  let raw;
  try {
    raw = readFileSync(resolve(root, '.env.local'), 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, '');
  }
}

loadEnvLocal();

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const key =
  process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    'NEXT_PUBLIC_SUPABASE_URL et NEXT_SUPABASE_SERVICE_ROLE_KEY sont requis ' +
      '(environnement ou .env.local).'
  );
  process.exit(1);
}

const res = await fetch(`${url}/rest/v1/`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
if (!res.ok) {
  console.error(`PostgREST a répondu ${res.status} ${res.statusText}`);
  process.exit(1);
}

const spec = await res.json();
const definitions = spec.definitions || {};
const tables = Object.keys(definitions).sort();

if (tables.length === 0) {
  console.error(
    "Aucune définition dans la réponse OpenAPI — clé invalide ou schéma vide. " +
      "L'instantané n'est PAS écrit (un fichier vide rendrait le garde-fou aveugle)."
  );
  process.exit(1);
}

const snapshot = {};
for (const table of tables) {
  snapshot[table] = Object.keys(definitions[table].properties || {}).sort();
}

// Clés étrangères : leur NOM est ce que citent les indices de relation
// (`teams!matches_team1_fk`). Le document OpenAPI donne la table cible d'une
// colonne, jamais le nom de la contrainte — d'où l'appel à la fonction
// d'introspection (réservée au rôle de service).
const fkRes = await fetch(`${url}/rest/v1/rpc/introspect_foreign_keys`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: '{}',
});
if (!fkRes.ok) {
  console.error(
    `Introspection des cles etrangeres impossible (${fkRes.status}). ` +
      "Migration add_introspect_foreign_keys_function appliquee ? " +
      "L'instantané n'est PAS écrit : le garde-fou deviendrait aveugle aux indices de relation."
  );
  process.exit(1);
}
const fkRows = await fkRes.json();
const foreignKeys = {};
for (const row of fkRows) {
  foreignKeys[row.constraint_name] = {
    source: row.source_table,
    target: row.target_table,
  };
}

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      generatedFrom: 'PostgREST /rest/v1/ OpenAPI + introspect_foreign_keys()',
      tables: snapshot,
      foreignKeys,
    },
    null,
    2
  )}\n`,
  'utf8'
);

const columns = Object.values(snapshot).reduce((n, c) => n + c.length, 0);
console.log(
  `database/schema-snapshot.json écrit : ${tables.length} tables, ${columns} colonnes, ` +
    `${Object.keys(foreignKeys).length} clés étrangères.`
);
