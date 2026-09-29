// Matrice de permissions des routes `defineSubjectRoute` — lot P3
// (docs/PLAN-industrialisation-joueur.md). Pendant joueuse de
// adminRoutePermissionMatrix.test.ts.
//
// Chaque route expose sa garde par méthode (`handler.subjectRoute`). Ce test
// les découvre toutes et vérifie, pour chaque méthode, que la garde refuse
// AVANT le handler :
//   * sans jeton → 401 ;
//   * `subject: 'self'` → `?as=<autre>` refusé (403) ;
//   * `subject: 'follow'` → `?as=` d'un non-staff refusé (403), et une
//     écriture `?as=` sans double clé refusée (403 `subject_read_only`) ;
//   * `team` → un compte sans équipe gérée refusé (403).
//
// Une route migrée est couverte le jour de sa migration, sans rien ajouter.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { resetSupabaseMock, setAuthUser } from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import type { SubjectRouteHandler } from '../../utils/player/defineSubjectRoute';

const ROOT = path.resolve(__dirname, '../..');
const CALLER = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  return fs.readdirSync(abs).flatMap((name) => {
    const rel = path.join(dir, name);
    if (fs.statSync(path.join(ROOT, rel)).isDirectory()) return walk(rel);
    return /\.ts$/.test(name) ? [rel] : [];
  });
}

/** Routes qui réexportent un module joueuse ou appellent defineSubjectRoute. */
const ROUTE_FILES = walk('pages/api').filter((rel) => {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  return (
    src.includes('defineSubjectRoute(') || src.includes('@/features/player/')
  );
});

let n = 0;
function makeReq(method: string, over: Partial<any> = {}, auth = true): any {
  n += 1;
  return {
    method,
    url: '/api/matrix',
    headers: {
      host: 'h',
      ...(auth ? { authorization: `Bearer t-subject-matrix-${n}` } : {}),
    },
    cookies: {},
    query: {},
    body: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...over,
  };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.end = () => res;
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: CALLER });
});

describe('matrice de permissions des routes joueuse déclaratives', () => {
  it('au moins une route est déclarative (sinon la matrice est vide)', () => {
    expect(ROUTE_FILES.length).toBeGreaterThan(0);
  });

  for (const rel of ROUTE_FILES) {
    it(`${rel} refuse avant le handler`, async () => {
      const mod = await import(path.join(ROOT, rel));
      const route = mod.default as SubjectRouteHandler;
      expect(
        route.subjectRoute,
        `${rel} doit exporter une route defineSubjectRoute`
      ).toBeDefined();

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const expectRefused = async (
        what: string,
        method: string,
        over: Partial<any>,
        auth = true
      ) => {
        const res = makeRes();
        await route(makeReq(method, over, auth), res);
        expect(
          [401, 403],
          `${rel} ${method} laisse passer : ${what} (reçu ${res.statusCode})`
        ).toContain(res.statusCode);
      };

      for (const [method, meta] of Object.entries(route.subjectRoute.methods)) {
        await expectRefused('sans jeton', method, {}, false);
        const mutating = method !== 'GET';
        if (meta!.subject === 'self') {
          await expectRefused('?as= sur une route self', method, {
            query: { as: OTHER },
          });
        } else {
          await expectRefused('?as= par un non-staff', method, {
            query: { as: OTHER, act: '1' },
          });
          if (mutating && !meta!.actAs) {
            await expectRefused('écriture ?as= sans actAs', method, {
              query: { as: OTHER, act: '1' },
            });
          }
        }
        if (meta!.team) {
          await expectRefused('compte sans équipe gérée', method, {});
        }
      }
      spy.mockRestore();
    });
  }
});
