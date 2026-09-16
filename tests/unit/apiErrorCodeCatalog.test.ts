// Catalogues des codes d'erreur ↔ codes réellement émis.
//
// Un intégrateur branche son code sur `body.code` : un code émis mais absent
// du catalogue est une branche qu'il ne peut pas écrire, un code catalogué
// mais plus émis est une branche morte qu'il maintient pour rien. Trois
// catalogues, trois sources :
//
//   1. Surface publique (`/api/public/*`) → schéma `PublicApiErrorCode` de la
//      spec (docs/openapi/components/schemas/public-v1.yaml).
//   2. GraphQL (`/api/graphql`, hors chemins de la spec) → introduction de la
//      spec publique (`x-public-description` de docs/openapi/root.yaml).
//   3. Bot (`/api/bot/v1/*`) → tableau « Catalogue des codes d'erreur » de
//      docs/BOT_API_CONTRACT.md, entre deux marqueurs.
//
// L'extraction est volontairement littérale (lecture des sources, pas
// d'exécution). Ses limites sont assumées et listées ci-dessous : un code
// relayé dynamiquement (`code: result.code`) n'est visible que si son module
// source est déclaré ici.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadFullSpec } from '../../utils/openapi/loadSpec';
import { filterPublicSpec } from '../../utils/openapi/publicSpec';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel: string) =>
  fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

function walkTs(relDir: string): string[] {
  const out: string[] = [];
  const walk = (abs: string) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const p = path.join(abs, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) {
        out.push(path.relative(ROOT, p).replace(/\\/g, '/'));
      }
    }
  };
  walk(path.join(ROOT, relDir));
  return out.sort();
}

/** `code: 'X'` / `code = 'X'` (hors commentaires de fin de ligne). */
function literalCodes(src: string): string[] {
  return [
    ...src.matchAll(/\bcode\s*[:=]\s*['"]([A-Za-z][A-Za-z0-9_]*)['"]/g),
  ].map((m) => m[1]);
}

/** Membres d'une union de littéraux : `export type Name = | 'A' | 'B';`. */
function unionMembers(src: string, typeName: string): string[] {
  const m = new RegExp(`export type ${typeName}\\s*=([^;]+);`).exec(src);
  if (!m) throw new Error(`type ${typeName} introuvable`);
  return [...m[1].matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)].map((x) => x[1]);
}

const sorted = (xs: Iterable<string>) => [...new Set(xs)].sort();

// ---------------------------------------------------------------------------
// 1. Surface publique
// ---------------------------------------------------------------------------

function emittedPublicCodes(): string[] {
  const codes: string[] = [];
  const publicApi = read('utils/publicApi.ts');
  codes.push(...unionMembers(publicApi, 'PublicApiErrorCode'));
  codes.push(...literalCodes(publicApi));
  const publicWrite = read('utils/publicWriteApi.ts');
  codes.push(...unionMembers(publicWrite, 'PublicWriteErrorCode'));
  codes.push(...literalCodes(publicWrite));
  // Limiteur par jeton, utilisé par withPublicWrite.
  codes.push(...literalCodes(read('utils/rateLimit.ts')));
  for (const file of walkTs('pages/api/public')) {
    codes.push(...literalCodes(read(file)));
  }
  return sorted(codes);
}

describe('catalogue public (PublicApiErrorCode)', () => {
  const spec = loadFullSpec() as any;
  const schemas = spec.components.schemas;

  it('liste exactement les codes émis par la surface publique', () => {
    const catalogue = sorted(
      (schemas.PublicApiErrorCode.oneOf as Array<{ const: string }>).map(
        (v) => v.const
      )
    );
    expect(catalogue).toEqual(emittedPublicCodes());
  });

  it('chaque code est décrit', () => {
    for (const v of schemas.PublicApiErrorCode.oneOf) {
      expect(v.description, v.const).toBeTruthy();
    }
  });

  it('le 403 de plan porte `plan_required` dans `error`, sans `code`', () => {
    const gate = read('utils/billing/apiPlanGate.ts');
    expect(gate).toMatch(/error:\s*'plan_required'/);
    expect(schemas.PublicPlanDenial.properties.error.const).toBe(
      'plan_required'
    );
    expect(schemas.PublicPlanDenial.properties.code).toBeUndefined();
  });

  it('le corps d’erreur public référence le catalogue', () => {
    expect(schemas.PublicApiError.properties.code.$ref).toBe(
      '#/components/schemas/PublicApiErrorCode'
    );
  });
});

// ---------------------------------------------------------------------------
// 2. GraphQL
// ---------------------------------------------------------------------------

describe('catalogue GraphQL (introduction de la spec publique)', () => {
  it('chaque code `extensions.code` émis est cité dans l’introduction', () => {
    const src = read('utils/graphql/schema.ts');
    // Tous les littéraux en capitales : codes d'extension, y compris ceux
    // choisis par un ternaire (`… ? 'QUOTA_EXCEEDED' : 'RATE_LIMITED'`).
    const codes = sorted(
      [...src.matchAll(/'([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|[A-Z]{5,})'/g)].map(
        (m) => m[1]
      )
    );
    expect(codes.length).toBeGreaterThan(5);
    const intro = String(
      (filterPublicSpec(loadFullSpec()) as any).info.description
    );
    const missing = codes.filter((c) => !intro.includes(`\`${c}\``));
    expect(missing).toEqual([]);
    expect(intro).toContain('`reason: plan_required`');
  });
});

// ---------------------------------------------------------------------------
// 3. Bot
// ---------------------------------------------------------------------------

/**
 * Codes relayés dynamiquement vers une réponse bot, depuis un module dont
 * seules CERTAINES fonctions sont atteignables par une route bot. Listés à la
 * main (lire le module entier ramènerait des codes que le bot ne voit jamais),
 * et chacun est vérifié présent dans sa source.
 */
const RELAYED_BOT_CODES: Record<string, { source: string; codes: string[] }> = {
  // matches/[matchId]/drafts.ts → initDraft (et les chargeurs qu'il appelle).
  draftEngine: {
    source: 'utils/draftEngine.ts',
    codes: [
      'DB_ERROR',
      'MATCH_NOT_FOUND',
      'TOURNAMENT_NOT_FOUND',
      'GAME_NOT_DRAFTABLE',
      'GAME_INDEX_OUT_OF_RANGE',
      'FORMAT_NOT_SUPPORTED',
      'DRAFT_ALREADY_EXISTS',
      'PICK_TIMER_INVALID',
      'DRAFT_NOT_FOUND',
    ],
  },
  // tasks/index.ts, tasks/[id]/move.ts, tasks/[id]/assign.ts →
  // createTaskCore, moveTaskCore, assignTaskCore.
  taskBoard: {
    source: 'utils/taskBoard.ts',
    codes: [
      'column_not_found',
      'column_not_in_board',
      'board_not_found',
      'task_not_found',
      'wip_exceeded',
      'assignee_not_staff',
    ],
  },
};

/** Modules lus en entier : chacun de leurs codes atteint une réponse bot. */
const BOT_SOURCES = [
  ...walkTs('pages/api/bot'),
  'utils/botAuth.ts',
  'utils/rateLimit.ts', // ACTOR_RATE_LIMIT (perActor de withBotRoute)
  'utils/swiss/runNextRound.ts', // relayé par stages/[stageId]/next-round.ts
];

function emittedBotCodes(): string[] {
  const codes: string[] = [];
  // `export const NAME = 'VALUE'` des modules utilitaires, pour résoudre
  // `code: NAME` (ex. DISPUTE_UNDER_STAFF_REVIEW).
  const constants = new Map<string, string>();
  for (const file of walkTs('utils')) {
    for (const m of read(file).matchAll(
      /export const ([A-Z][A-Z0-9_]+)\s*=\s*'([A-Za-z][A-Za-z0-9_]*)'/g
    )) {
      constants.set(m[1], m[2]);
    }
  }
  for (const file of BOT_SOURCES) {
    const src = read(file);
    codes.push(...literalCodes(src));
    for (const m of src.matchAll(/\bcode\s*:\s*([A-Z][A-Z0-9_]+)\b/g)) {
      const value = constants.get(m[1]);
      if (!value) throw new Error(`${file} : constante ${m[1]} non résolue`);
      codes.push(value);
    }
  }
  for (const { source, codes: relayed } of Object.values(RELAYED_BOT_CODES)) {
    const src = read(source);
    for (const c of relayed) {
      expect(src, `${c} absent de ${source}`).toContain(`'${c}'`);
    }
    codes.push(...relayed);
  }
  return sorted(codes);
}

const BEGIN = '<!-- BOT_ERROR_CODES:BEGIN -->';
const END = '<!-- BOT_ERROR_CODES:END -->';

describe('catalogue bot (BOT_API_CONTRACT.md)', () => {
  it('liste exactement les codes émis par les routes bot', () => {
    const doc = read('docs/BOT_API_CONTRACT.md');
    expect(doc).toContain(BEGIN);
    expect(doc).toContain(END);
    const block = doc.slice(doc.indexOf(BEGIN), doc.indexOf(END));
    const catalogue = sorted(
      [...block.matchAll(/^\|\s*`([A-Za-z][A-Za-z0-9_]*)`\s*\|/gm)].map(
        (m) => m[1]
      )
    );
    expect(catalogue).toEqual(emittedBotCodes());
  });
});
