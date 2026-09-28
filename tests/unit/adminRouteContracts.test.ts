// La spec des routes admin déclaratives EST leur schéma zod — lot L9
// (docs/PLAN-industrialisation-admin.md).
//
// Une route `defineAdminRoute` porte ses schémas (`query`, `body`) dans
// `handler.adminRoute`. Son fragment OpenAPI doit les RÉFÉRENCER
// (`x-zod-query`, `x-zod` dans lib/apiContracts), pas les recopier à la main :
// une copie finit toujours par mentir (un paramètre `limit` documenté que la
// route n'a jamais lu, un `id` annoncé UUID que la route accepte quelconque —
// deux cas trouvés en écrivant ce test).
//
// Ce test compare par IDENTITÉ d'objet : le schéma enregistré sous le nom cité
// par le fragment doit être celui-là même que la route applique.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { API_CONTRACT_SCHEMAS } from '../../lib/apiContracts';
import type { AdminRouteHandler } from '../../utils/admin/defineAdminRoute';

const ROOT = path.resolve(__dirname, '../..');
const API = path.join(ROOT, 'pages/api/admin');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith('.ts') ? [p] : [];
  });
}

/** Routes migrées : elles réexportent un module `features/admin`. */
const DECLARATIVE = walk(API).filter((f) =>
  fs.readFileSync(f, 'utf8').includes('@/features/admin/')
);

function fragmentOf(file: string) {
  const rel = path
    .relative(path.join(ROOT, 'pages'), file)
    .replace(/\.ts$/, '');
  const yamlPath = path.join(ROOT, 'docs/openapi/paths', `${rel}.yaml`);
  return parse(fs.readFileSync(yamlPath, 'utf8')) as Record<
    string,
    Record<string, unknown>
  >;
}

function bodyZodName(op: Record<string, unknown>): string | null {
  const content = (op.requestBody as { content?: Record<string, unknown> })
    ?.content;
  const schema = (content?.['application/json'] as { schema?: unknown })
    ?.schema as Record<string, unknown> | undefined;
  return typeof schema?.['x-zod'] === 'string' ? schema['x-zod'] : null;
}

describe('spec des routes admin déclaratives = leurs schémas zod', () => {
  it('recense les routes migrées', () => {
    expect(DECLARATIVE.length).toBeGreaterThanOrEqual(12);
  });

  for (const file of DECLARATIVE) {
    const rel = path.relative(ROOT, file);
    it(`${rel}`, async () => {
      const route = (await import(file)).default as AdminRouteHandler;
      const fragment = fragmentOf(file);
      const problems: string[] = [];

      for (const [method, meta] of Object.entries(route.adminRoute.methods)) {
        const op = fragment[method.toLowerCase()];
        if (!op) {
          problems.push(`${method} absent du fragment`);
          continue;
        }
        if (meta?.query) {
          const name = op['x-zod-query'];
          const entry =
            typeof name === 'string' ? API_CONTRACT_SCHEMAS[name] : undefined;
          if (!entry) {
            problems.push(
              `${method} : query validée par zod mais pas de x-zod-query (paramètres écrits à la main ?)`
            );
          } else if (entry.schema !== meta.query) {
            problems.push(
              `${method} : x-zod-query « ${name} » n'est PAS le schéma de la route`
            );
          }
        }
        if (meta?.body) {
          const name = bodyZodName(op);
          const entry = name ? API_CONTRACT_SCHEMAS[name] : undefined;
          if (!entry) {
            problems.push(
              `${method} : corps validé par zod mais pas de x-zod (schéma écrit à la main ?)`
            );
          } else if (entry.schema !== meta.body) {
            problems.push(
              `${method} : x-zod « ${name} » n'est PAS le schéma de la route`
            );
          }
        }
      }
      expect(problems).toEqual([]);
    });
  }
});
