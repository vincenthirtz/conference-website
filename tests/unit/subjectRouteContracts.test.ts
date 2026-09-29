// La spec des routes joueuse déclaratives EST leur schéma zod — lot P3
// (docs/PLAN-industrialisation-joueur.md). Pendant de adminRouteContracts.
//
// Une route `defineSubjectRoute` porte ses schémas (`query`, `body`) dans
// `handler.subjectRoute`. Son fragment OpenAPI doit les RÉFÉRENCER
// (`x-zod-query`, `x-zod` dans lib/apiContracts) : comparaison par IDENTITÉ
// d'objet, une copie finit toujours par mentir.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { API_CONTRACT_SCHEMAS } from '../../lib/apiContracts';
import type { SubjectRouteHandler } from '../../utils/player/defineSubjectRoute';
import type { TokenRouteHandler } from '../../utils/player/defineTokenRoute';
import type { PublicRouteHandler } from '../../utils/player/definePublicRoute';

const ROOT = path.resolve(__dirname, '../..');
const API = path.join(ROOT, 'pages/api');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith('.ts') ? [p] : [];
  });
}

/** Routes migrées : elles réexportent un module `features/player`. */
const DECLARATIVE = walk(API).filter((f) =>
  fs.readFileSync(f, 'utf8').includes('@/features/player/')
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

describe('spec des routes joueuse déclaratives = leurs schémas zod', () => {
  it('recense les routes migrées', () => {
    expect(DECLARATIVE.length).toBeGreaterThanOrEqual(3);
  });

  for (const file of DECLARATIVE) {
    const rel = path.relative(ROOT, file);
    it(`${rel}`, async () => {
      const route = (await import(file)).default as SubjectRouteHandler &
        Partial<TokenRouteHandler> &
        Partial<PublicRouteHandler>;
      const fragment = fragmentOf(file);
      const problems: string[] = [];

      // Route de jeton ou anonyme (`defineTokenRoute` / `definePublicRoute`,
      // lot P11) : pas de sujet, mêmes exigences de schéma (`x-zod`…).
      const methods = (
        route.tokenRoute ??
        route.publicRoute ??
        route.subjectRoute
      ).methods as SubjectRouteHandler['subjectRoute']['methods'];
      for (const [method, meta] of Object.entries(methods)) {
        const op = fragment[method.toLowerCase()];
        if (!op) {
          problems.push(`${method} absent du fragment`);
          continue;
        }
        if (meta?.subject === 'follow') {
          const params = JSON.stringify(op.parameters ?? []);
          if (!params.includes('SubjectAs'))
            problems.push(
              `${method} : suit ?as= mais le fragment ne le dit pas`
            );
          if (meta.actAs && !params.includes('ActAs'))
            problems.push(`${method} : actAs mais pas de paramètre ActAs`);
        }
        if (meta?.query) {
          const name = op['x-zod-query'];
          const entry =
            typeof name === 'string' ? API_CONTRACT_SCHEMAS[name] : undefined;
          if (!entry) {
            problems.push(
              `${method} : query validée par zod mais pas de x-zod-query`
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
            problems.push(`${method} : corps validé par zod mais pas de x-zod`);
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
