#!/usr/bin/env node
// scripts/merge-openapi.mjs
//
// Merges all admin/cron/public fragment YAMLs into the root docs/openapi.yaml.
// Each fragment has the shape:
//   paths:
//     /api/...: { ... }
//   schemas:           # optional, merged into components.schemas
//     NewSchema: { ... }
//
// Fragments are read in a deterministic order (alphabetical). Conflicts:
//   - duplicate path → error (humans must reconcile)
//   - duplicate schema → error (rename one of them)
//
// Usage: node scripts/merge-openapi.mjs

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const ROOT = path.resolve(process.cwd(), 'docs');
const SPEC = path.join(ROOT, 'openapi.yaml');
const FRAGMENTS = ['openapi-admin.yaml', 'openapi-cron.yaml', 'openapi-public.yaml']
  .map((f) => path.join(ROOT, f))
  .filter((f) => fs.existsSync(f));

function die(msg) {
  console.error(`merge-openapi: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(SPEC)) die(`missing ${SPEC}`);
if (FRAGMENTS.length === 0) die('no fragments found (expected openapi-{admin,cron,public}.yaml)');

const root = parseYaml(fs.readFileSync(SPEC, 'utf8'));
root.paths ??= {};
root.components ??= {};
root.components.schemas ??= {};

let addedPaths = 0;
let addedSchemas = 0;

for (const file of FRAGMENTS) {
  const frag = parseYaml(fs.readFileSync(file, 'utf8'));
  const name = path.basename(file);

  if (frag.paths) {
    for (const [k, v] of Object.entries(frag.paths)) {
      if (root.paths[k]) {
        // Allow merging at method level if both sides are objects and methods disjoint.
        const overlap = Object.keys(v).filter((m) => root.paths[k][m]);
        if (overlap.length > 0) {
          die(`${name}: path ${k} conflicts on methods ${overlap.join(',')}`);
        }
        root.paths[k] = { ...root.paths[k], ...v };
      } else {
        root.paths[k] = v;
        addedPaths++;
      }
    }
  }

  if (frag.schemas) {
    for (const [k, v] of Object.entries(frag.schemas)) {
      if (root.components.schemas[k]) {
        die(`${name}: schema ${k} already exists in root spec (rename it)`);
      }
      root.components.schemas[k] = v;
      addedSchemas++;
    }
  }
}

const out = stringifyYaml(root, { lineWidth: 0, aliasDuplicateObjects: false });
fs.writeFileSync(SPEC, out, 'utf8');

console.log(`merge-openapi: +${addedPaths} paths, +${addedSchemas} schemas`);
console.log(`merge-openapi: ${SPEC} now ${Object.keys(root.paths).length} paths, ${Object.keys(root.components.schemas).length} schemas`);
