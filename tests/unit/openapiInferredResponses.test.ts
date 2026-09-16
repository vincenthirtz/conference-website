// Réponses 2xx déduites du code (scripts/openapi/infer-responses.cjs).
//
// 1. Le fichier commité docs/openapi/inferred-responses.json est à jour : la
//    doc suit le code sans que personne ait à y penser.
// 2. Aucune réponse ÉCRITE à la main ne contredit ce que le code renvoie
//    (mêmes propriétés de premier niveau). Constat du 2026-09-15 : 131 sur 753
//    le faisaient (`{ ok }` documenté pour `{ success }` renvoyé, champs en
//    camelCase pour des colonnes snake_case…).
// 3. Règles de fusion de l'assembleur.

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assembleSpec,
  isGenericSchema,
  mergeInferredResponses,
  readInferredResponses,
} from '../../utils/openapi/assemble';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const require = createRequire(import.meta.url);

describe('isGenericSchema', () => {
  it.each([
    [undefined, true],
    [{}, true],
    [{ type: 'object' }, true],
    [{ type: 'object', additionalProperties: true }, true],
    [{ type: 'object', properties: { a: {} } }, false],
    [{ $ref: '#/components/schemas/X' }, false],
    [{ type: 'array', items: {} }, false],
    [{ type: 'string' }, false],
  ])('%j → %s', (schema, expected) => {
    expect(isGenericSchema(schema)).toBe(expected);
  });
});

describe('mergeInferredResponses', () => {
  const inferred = {
    'GET /api/x': {
      '200': { type: 'object', properties: { success: { type: 'boolean' } } },
    },
    'POST /api/x': { '201': { type: 'object', properties: { id: {} } } },
    'DELETE /api/x': {
      '200': { type: 'object', properties: { deleted: { type: 'boolean' } } },
    },
  };

  it('remplace le générique, ajoute le manquant, garde le précis, respecte le refus', () => {
    const stats = { replaced: 0, added: 0, keptWritten: 0 };
    const out = mergeInferredResponses(
      {
        '/api/x': {
          get: {
            responses: {
              '200': {
                description: 'Liste',
                content: {
                  'application/json': {
                    schema: { type: 'object', additionalProperties: true },
                  },
                },
              },
            },
          },
          post: { responses: { '400': { description: 'KO' } } },
          delete: {
            'x-infer-responses': false,
            responses: { '200': { description: 'Écrit' } },
          },
        },
      },
      inferred,
      stats
    ) as any;
    expect(out['/api/x'].get.responses['200']).toEqual({
      description: 'Liste',
      content: {
        'application/json': { schema: inferred['GET /api/x']['200'] },
      },
    });
    expect(
      out['/api/x'].post.responses['201'].content['application/json'].schema
    ).toEqual(inferred['POST /api/x']['201']);
    expect(out['/api/x'].delete).toEqual({
      responses: { '200': { description: 'Écrit' } },
    });
    expect(stats).toEqual({ replaced: 1, added: 1, keptWritten: 0 });
  });
});

describe('docs/openapi/inferred-responses.json', () => {
  it('est à jour avec le code (npm run openapi:responses)', () => {
    const {
      inferResponses,
      serialize,
      OUTPUT,
    } = require('../../scripts/openapi/infer-responses.cjs');
    const expected = serialize(inferResponses(REPO_ROOT));
    // Fins de ligne normalisées : le générateur écrit en LF, le checkout
    // Windows rend du CRLF (le dépôt n'a pas de `.gitattributes`). Sans ça, le
    // test réclame une régénération qui ne change pas un octet de contenu.
    const current = fs
      .readFileSync(path.join(REPO_ROOT, OUTPUT), 'utf8')
      .replace(/\r\n/g, '\n');
    expect(
      current === expected,
      'réponses déduites périmées : lancer `npm run openapi:responses`'
    ).toBe(true);
  }, 180_000);

  it('aucune réponse écrite ne contredit ce que le code renvoie', () => {
    const spec = assembleSpec(REPO_ROOT) as any;
    const inferred = readInferredResponses(REPO_ROOT)?.responses ?? {};
    const schemas = spec.components.schemas;
    const deref = (n: any, depth = 0): any =>
      n?.$ref && depth < 5
        ? deref(schemas[n.$ref.split('/').pop()], depth + 1)
        : n;
    const propsOf = (n: any): Set<string> | null => {
      const s = deref(n);
      if (!s) return null;
      if (s.allOf) {
        const all = new Set<string>();
        for (const part of s.allOf) propsOf(part)?.forEach((k) => all.add(k));
        return all.size ? all : null;
      }
      return s.properties ? new Set(Object.keys(s.properties)) : null;
    };
    const contradictions: string[] = [];
    for (const [url, item] of Object.entries<any>(spec.paths)) {
      for (const [method, op] of Object.entries<any>(item)) {
        const byStatus = inferred[`${method.toUpperCase()} ${url}`];
        if (!byStatus || !op?.responses) continue;
        for (const [status, fromCode] of Object.entries<any>(byStatus)) {
          const written =
            op.responses[status]?.content?.['application/json']?.schema;
          if (!written || written === fromCode) continue;
          const variants = fromCode.anyOf ?? [fromCode];
          if (variants.some((v: any) => !v.properties)) continue;
          const codeProps = new Set<string>(
            variants.flatMap((v: any) => Object.keys(v.properties))
          );
          const docProps = propsOf(written);
          if (!docProps || !codeProps.size) continue;
          const same =
            docProps.size === codeProps.size &&
            [...docProps].every((k) => codeProps.has(k));
          if (!same) {
            contradictions.push(
              `${method.toUpperCase()} ${url} ${status} — doc [${[...docProps]}] ≠ code [${[...codeProps]}]`
            );
          }
        }
      }
    }
    expect(
      contradictions,
      'retirer le schéma écrit (la réponse déduite du code prend le relais) ou le corriger'
    ).toEqual([]);
  });
});
