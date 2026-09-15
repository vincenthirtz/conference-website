// scripts/openapi/build.mjs
//
// Assemble la spec OpenAPI depuis ses fragments (docs/openapi/) et écrit :
//   .generated/openapi.json         spec complète (bot, admin, cron, public)
//   .generated/openapi.public.json  surface publique seule (/api/public/*)
//
// Lancé par `prebuild` : en production, les routes et la page de référence
// lisent ces JSON (lecture ~10 ms, contre ~0,5 s pour parser l'ancien YAML de
// 1,27 Mo au démarrage à froid). En dev et en test, la spec est assemblée à la
// volée (cf. utils/openapi/loadSpec.ts) : rien à relancer après une retouche.
//
//   npm run openapi:build

import fs from 'node:fs';
import path from 'node:path';

const { assembleSpec } = await import('../../utils/openapi/assemble.ts');
const { filterPublicSpec } = await import('../../utils/openapi/publicSpec.ts');

const out = path.join(process.cwd(), '.generated');
fs.mkdirSync(out, { recursive: true });

const full = assembleSpec();
const pub = filterPublicSpec(full);
fs.writeFileSync(path.join(out, 'openapi.json'), JSON.stringify(full));
fs.writeFileSync(path.join(out, 'openapi.public.json'), JSON.stringify(pub));

console.log(
  `openapi: ${Object.keys(full.paths).length} chemins → .generated/openapi.json, ` +
    `${Object.keys(pub.paths).length} publics → .generated/openapi.public.json`
);
