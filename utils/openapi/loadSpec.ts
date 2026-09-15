// utils/openapi/loadSpec.ts
//
// POINT D'ENTRÉE UNIQUE pour lire la spec OpenAPI complète. Les routes
// (`/api/public/openapi`, `/api/admin/docs/openapi`), la page
// `/developpeurs/reference` et les tests passent tous par ici : quand la source
// de la spec change de forme (fichier unique → fragments assemblés), seul ce
// module bouge.
//
// Le chemin est écrit en `path.join(process.cwd(), …)` littéral exprès : le
// traçage de fichiers de Next ne suit que les lectures qu'il peut résoudre
// statiquement, et c'est ce qui embarque la spec dans la fonction serveur.

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

export type OpenApiDoc = Record<string, unknown>;

let cached: OpenApiDoc | null = null;

/** Spec complète (bot, admin, cron, public), lue une fois puis mémorisée. */
export function loadFullSpec(): OpenApiDoc {
  if (cached) return cached;
  const raw = fs.readFileSync(
    path.join(process.cwd(), 'docs', 'openapi.yaml'),
    'utf8'
  );
  cached = parseYaml(raw) as OpenApiDoc;
  return cached;
}

// Test seam.
export function __resetFullSpecCache(): void {
  cached = null;
}
