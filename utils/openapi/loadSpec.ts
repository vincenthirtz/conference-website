// utils/openapi/loadSpec.ts
//
// POINT D'ENTRÉE UNIQUE pour lire la spec OpenAPI complète. Les routes
// (`/api/public/openapi`, `/api/admin/docs/openapi`), la page
// `/developpeurs/reference` et les tests passent tous par ici.
//
// La source est `docs/openapi/` (un fragment par handler, cf. assemble.ts) :
//   - en PRODUCTION, on lit le JSON produit au build par
//     `scripts/openapi/build.mjs` (`prebuild`). Pas de repli sur l'assemblage :
//     un JSON absent est une erreur de build, pas un cas à masquer ;
//   - en dev et en test, on assemble les fragments à la volée.
//
// Le chemin du JSON est écrit en `path.join(process.cwd(), …)` littéral et
// déclaré dans `outputFileTracingIncludes` (next.config.js) : c'est ce qui
// l'embarque dans la fonction serveur.

import fs from 'node:fs';
import path from 'node:path';
import { assembleSpec, type OpenApiDoc } from './assemble';

export type { OpenApiDoc };

let cached: OpenApiDoc | null = null;

/** Spec complète (bot, admin, cron, public), lue une fois puis mémorisée. */
export function loadFullSpec(): OpenApiDoc {
  if (cached) return cached;
  cached =
    process.env.NODE_ENV === 'production'
      ? (JSON.parse(
          fs.readFileSync(
            path.join(process.cwd(), '.generated', 'openapi.json'),
            'utf8'
          )
        ) as OpenApiDoc)
      : assembleSpec();
  return cached;
}

// Test seam.
export function __resetFullSpecCache(): void {
  cached = null;
}
