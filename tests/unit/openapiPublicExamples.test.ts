// Exemples de la référence publique ↔ schémas zod.
//
// Pour un partenaire, l'exemple EST la documentation : il le copie dans son
// code. Un exemple qui ne correspond pas à ce que la route renvoie est donc
// une intégration cassée d'avance. Ce test :
//   1. exige un exemple sur chaque réponse 2xx JSON de `/api/public/v1/*` ;
//   2. valide chaque exemple de réponse 2xx contre le schéma zod du handler
//      (le même que celui dont la spec est générée), champ en trop compris ;
//   3. valide les exemples de corps de requête contre leur schéma `x-zod` ;
//   4. valide chaque exemple d'erreur (réponses `Public*` et réponses écrites
//      dans les fragments) contre l'enveloppe d'erreur publique, dont `code`
//      doit appartenir au catalogue `PublicApiErrorCode`.

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { API_CONTRACT_SCHEMAS } from '../../lib/apiContracts';
import { publicV1PaginationSchema } from '../../lib/apiContracts/public/v1/common';
import {
  publicV1StandingSchema,
  publicV1TournamentDetailSchema,
  publicV1TournamentSummarySchema,
} from '../../lib/apiContracts/public/v1/tournaments';
import {
  publicV1MatchDetailSchema,
  publicV1MatchSchema,
} from '../../lib/apiContracts/public/v1/matches';
import { publicV1TeamSchema } from '../../lib/apiContracts/public/v1/teams';
import { publicV1TournamentArbitrationSchema } from '../../lib/apiContracts/public/v1/arbitration';
import {
  leagueDetailResponseSchema,
  publicLeagueSchema,
} from '../../lib/apiContracts/public/v1/leagues';
import {
  leaderboardPlayerSchema,
  playerProfileResponseSchema,
} from '../../lib/apiContracts/public/v1/rating';
import { loadFullSpec } from '../../utils/openapi/loadSpec';

const ROOT = path.resolve(__dirname, '..', '..');
const V1_DIR = path.join(
  ROOT,
  'docs',
  'openapi',
  'paths',
  'api',
  'public',
  'v1'
);
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** Composant de la spec → schéma zod dont il est généré. */
const COMPONENT_ZOD: Record<string, z.ZodType> = {
  PublicV1TournamentSummary: publicV1TournamentSummarySchema,
  PublicV1TournamentDetail: publicV1TournamentDetailSchema,
  PublicV1Standing: publicV1StandingSchema,
  PublicV1Match: publicV1MatchSchema,
  PublicV1MatchDetail: publicV1MatchDetailSchema,
  PublicV1Team: publicV1TeamSchema,
  PublicV1TournamentArbitration: publicV1TournamentArbitrationSchema,
  PublicLeague: publicLeagueSchema,
  LeagueDetailResponse: leagueDetailResponseSchema,
  LeaderboardPlayer: leaderboardPlayerSchema,
  PlayerProfileResponse: playerProfileResponseSchema,
};

function walkYaml(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkYaml(p));
    else if (e.name.endsWith('.yaml')) out.push(p);
  }
  return out.sort();
}

const refName = (ref: string) => ref.split('/').pop() as string;

function componentZod(ref: string, where: string): z.ZodType {
  const schema = COMPONENT_ZOD[refName(ref)];
  if (!schema) {
    throw new Error(
      `${where} : composant ${refName(ref)} sans schéma zod connu (compléter COMPONENT_ZOD)`
    );
  }
  return schema;
}

/** Schéma zod de la réponse, reconstruit depuis le fragment BRUT. */
function responseZod(raw: any, where: string): z.ZodType {
  if (raw['x-zod']) {
    const entry = API_CONTRACT_SCHEMAS[raw['x-zod']];
    if (!entry) throw new Error(`${where} : x-zod inconnu ${raw['x-zod']}`);
    return entry.schema;
  }
  const data = raw.properties?.data;
  if (!data) throw new Error(`${where} : enveloppe { data } attendue`);
  const dataZod = data.$ref
    ? componentZod(data.$ref, where)
    : data.type === 'array' && data.items?.$ref
      ? z.array(componentZod(data.items.$ref, where))
      : null;
  if (!dataZod) throw new Error(`${where} : forme de data non reconnue`);
  return z.object({
    data: dataZod,
    ...(raw.properties.pagination
      ? { pagination: publicV1PaginationSchema.optional() }
      : {}),
  });
}

/** Parse, puis compare : zod retire les champs inconnus, l'égalité les voit. */
function expectValid(schema: z.ZodType, example: unknown, where: string) {
  const parsed = schema.safeParse(example);
  expect(
    parsed.success,
    `${where} : ${parsed.success ? '' : JSON.stringify(parsed.error.issues)}`
  ).toBe(true);
  if (parsed.success) expect(parsed.data, where).toEqual(example);
}

type Fragment = { file: string; item: Record<string, any> };
const FRAGMENTS: Fragment[] = walkYaml(V1_DIR).map((file) => ({
  file: path.relative(ROOT, file).replace(/\\/g, '/'),
  item: parseYaml(fs.readFileSync(file, 'utf8')),
}));

describe('exemples de réponse 2xx de /api/public/v1/*', () => {
  const cases: Array<[string, any]> = [];
  for (const { file, item } of FRAGMENTS) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op?.responses) continue;
      for (const [status, resp] of Object.entries<any>(op.responses)) {
        if (!status.startsWith('2')) continue;
        const media = resp?.content?.['application/json'];
        if (!media) continue;
        cases.push([`${file} ${method.toUpperCase()} ${status}`, media]);
      }
    }
  }

  it('couvre toutes les opérations v1', () => {
    expect(cases.length).toBeGreaterThanOrEqual(12);
  });

  it.each(cases)('%s : exemple présent et conforme au zod', (where, media) => {
    expect(media.example, `${where} : exemple manquant`).toBeDefined();
    expectValid(responseZod(media.schema, where), media.example, where);
  });
});

describe('exemples de corps de requête de /api/public/v1/*', () => {
  const cases: Array<[string, any]> = [];
  for (const { file, item } of FRAGMENTS) {
    for (const method of METHODS) {
      const media = item[method]?.requestBody?.content?.['application/json'];
      if (media) cases.push([`${file} ${method.toUpperCase()}`, media]);
    }
  }

  it.each(cases)('%s : exemple conforme au zod', (where, media) => {
    expect(media.example, `${where} : exemple manquant`).toBeDefined();
    const entry = API_CONTRACT_SCHEMAS[media.schema?.['x-zod']];
    expect(entry, `${where} : corps sans x-zod`).toBeDefined();
    expectValid(entry.schema, media.example, where);
  });
});

describe('exemples d’erreur de la surface publique', () => {
  const spec = loadFullSpec() as any;
  const codes = (
    spec.components.schemas.PublicApiErrorCode.oneOf as Array<{ const: string }>
  ).map((v) => v.const) as [string, ...string[]];
  const errorEnvelope = z.union([
    z.strictObject({
      error: z.string(),
      code: z.enum(codes).optional(),
      fields: z.record(z.string(), z.array(z.string())).optional(),
    }),
    z.strictObject({
      error: z.literal('plan_required'),
      message: z.string(),
      requiredCapability: z.enum(['apiRead', 'apiWrite']),
    }),
  ]);

  function examplesOf(media: any): unknown[] {
    const out: unknown[] = [];
    if (media?.example !== undefined) out.push(media.example);
    for (const ex of Object.values<any>(media?.examples ?? {})) {
      out.push(ex.value);
    }
    return out;
  }

  const cases: Array<[string, unknown]> = [];
  const responses = spec.components.responses as Record<string, any>;
  for (const [name, resp] of Object.entries(responses)) {
    if (!name.startsWith('Public')) continue;
    const examples = examplesOf(resp.content?.['application/json']);
    expect(examples.length, `${name} : exemple manquant`).toBeGreaterThan(0);
    examples.forEach((ex, i) => cases.push([`responses/${name}#${i}`, ex]));
  }
  for (const { file, item } of FRAGMENTS) {
    for (const method of METHODS) {
      for (const [status, resp] of Object.entries<any>(
        item[method]?.responses ?? {}
      )) {
        if (status.startsWith('2') || resp.$ref) continue;
        examplesOf(resp.content?.['application/json']).forEach((ex, i) =>
          cases.push([`${file} ${method.toUpperCase()} ${status}#${i}`, ex])
        );
      }
    }
  }

  it('toutes les réponses d’erreur des fragments v1 sont des composants Public* ou ont un exemple', () => {
    for (const { file, item } of FRAGMENTS) {
      for (const method of METHODS) {
        for (const [status, resp] of Object.entries<any>(
          item[method]?.responses ?? {}
        )) {
          if (status.startsWith('2')) continue;
          if (resp.$ref) {
            expect(refName(resp.$ref), `${file} ${status}`).toMatch(/^Public/);
          } else {
            expect(
              examplesOf(resp.content?.['application/json']).length,
              `${file} ${status}`
            ).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it.each(cases)(
    '%s : conforme à l’enveloppe d’erreur publique',
    (where, ex) => {
      const parsed = errorEnvelope.safeParse(ex);
      expect(
        parsed.success,
        `${where} : ${parsed.success ? '' : JSON.stringify(parsed.error.issues)}`
      ).toBe(true);
    }
  );
});
