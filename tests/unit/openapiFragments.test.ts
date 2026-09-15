// La spec OpenAPI est découpée en fragments (docs/openapi/, cf.
// utils/openapi/assemble.ts) : règles de l'assembleur.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { API_CONTRACT_SCHEMAS } from '../../lib/apiContracts';
import {
  assembleSpec,
  fragmentToApiPath,
  resolveZodSchemas,
} from '../../utils/openapi/assemble';

describe('fragmentToApiPath', () => {
  it.each([
    ['api/admin/tcg/grant.yaml', '/api/admin/tcg/grant'],
    ['api/teams/[teamId]/index.yaml', '/api/teams/{teamId}'],
    ['api/teams/[teamId].yaml', '/api/teams/{teamId}'],
    ['api/cast/[...slug].yaml', '/api/cast/{slug}'],
    ['api/index.yaml', '/api'],
  ])('%s → %s', (file, url) => {
    expect(fragmentToApiPath(file)).toBe(url);
  });
});

describe('assembleSpec', () => {
  function fixture(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-frag-'));
    for (const [rel, body] of Object.entries(files)) {
      const p = path.join(dir, 'docs', 'openapi', rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, body);
    }
    return dir;
  }

  it('déduit les URL des emplacements et fusionne les composants découpés', () => {
    const dir = fixture({
      'root.yaml': 'openapi: 3.1.0\ninfo: { title: t, version: "1" }\n',
      'components/schemas/a.yaml': 'A: { type: string }\n',
      'components/schemas/b.yaml': 'B: { type: integer }\n',
      'components/responses.yaml': 'NotFound: { description: nf }\n',
      'paths/api/x/[id].yaml': 'get: { operationId: getX }\n',
    });
    const spec = assembleSpec(dir) as any;
    expect(spec.paths).toEqual({
      '/api/x/{id}': { get: { operationId: 'getX' } },
    });
    expect(Object.keys(spec.components.schemas)).toEqual(['A', 'B']);
    expect(spec.components.responses.NotFound.description).toBe('nf');
  });

  it('refuse une URL décrite deux fois', () => {
    const dir = fixture({
      'root.yaml': 'openapi: 3.1.0\n',
      'paths/api/x/[id].yaml': 'get: {}\n',
      'paths/api/x/[id]/index.yaml': 'post: {}\n',
    });
    expect(() => assembleSpec(dir)).toThrow(/décrit deux fois/);
  });

  it('refuse un composant défini deux fois', () => {
    const dir = fixture({
      'root.yaml': 'openapi: 3.1.0\n',
      'components/schemas/a.yaml': 'A: { type: string }\n',
      'components/schemas/b.yaml': 'A: { type: integer }\n',
    });
    expect(() => assembleSpec(dir)).toThrow(/défini deux fois/);
  });

  it('refuse des paths ou components écrits dans root.yaml', () => {
    const dir = fixture({ 'root.yaml': 'openapi: 3.1.0\npaths: {}\n' });
    expect(() => assembleSpec(dir)).toThrow(/root\.yaml/);
  });
});

describe('x-zod : schémas générés depuis lib/apiContracts', () => {
  const contracts = {
    body: {
      schema: z.object({
        email: z.string().trim().email().max(200),
        note: z.string().optional().meta({ description: 'libre' }),
      }),
      io: 'input' as const,
    },
    reply: { schema: z.object({ ok: z.boolean() }), io: 'output' as const },
    dated: { schema: z.object({ at: z.date() }), io: 'input' as const },
  };

  it('remplace la référence par le JSON Schema, voisins en complément', () => {
    const used = new Set<string>();
    const out = resolveZodSchemas(
      {
        a: { 'x-zod': 'body', description: 'Corps' },
        b: [{ 'x-zod': 'reply' }],
      },
      contracts,
      used
    ) as any;
    expect(out.a).toMatchObject({
      type: 'object',
      required: ['email'],
      description: 'Corps',
      properties: {
        email: { type: 'string', format: 'email', maxLength: 200 },
        note: { type: 'string', description: 'libre' },
      },
    });
    expect(out.a.$schema).toBeUndefined();
    // Sortie : zod ferme l'objet ; entrée : non.
    expect(out.b[0].additionalProperties).toBe(false);
    expect(out.a.additionalProperties).toBeUndefined();
    expect([...used].sort()).toEqual(['body', 'reply']);
  });

  it('fusionne la documentation rédigée dans les propriétés générées', () => {
    const out = resolveZodSchemas(
      {
        'x-zod': 'body',
        properties: { email: { description: 'Contact', example: 'a@b.fr' } },
      },
      contracts
    ) as any;
    expect(out.properties.email).toMatchObject({
      type: 'string',
      maxLength: 200,
      description: 'Contact',
      example: 'a@b.fr',
    });
    expect(out.properties.note.description).toBe('libre');
  });

  it('refuse de documenter une propriété que le schéma zod n’a pas', () => {
    expect(() =>
      resolveZodSchemas(
        { 'x-zod': 'body', properties: { phone: { description: 'x' } } },
        contracts
      )
    ).toThrow(/absent du schéma zod/);
  });

  it('refuse un nom inconnu', () => {
    expect(() => resolveZodSchemas({ 'x-zod': 'nope' }, contracts)).toThrow(
      /absent de lib\/apiContracts/
    );
  });

  it('refuse un schéma non représentable plutôt que de l’appauvrir', () => {
    expect(() => resolveZodSchemas({ 'x-zod': 'dated' }, contracts)).toThrow(
      /non représentable/
    );
  });

  it('chaque contrat enregistré est référencé par la spec réelle', () => {
    const used = new Set<string>();
    resolveZodSchemas(
      // Document brut (avant résolution) : on relit les fragments tels quels.
      JSON.parse(
        JSON.stringify(
          fs
            .readdirSync(path.join(process.cwd(), 'docs', 'openapi'), {
              recursive: true,
              withFileTypes: true,
            })
            .filter((e) => e.isFile() && e.name.endsWith('.yaml'))
            .map((e) =>
              fs.readFileSync(path.join(e.parentPath, e.name), 'utf8')
            )
            .flatMap((src) => [...src.matchAll(/x-zod:\s*(\S+)/g)])
            .map((m) => ({ 'x-zod': m[1] }))
        )
      ),
      API_CONTRACT_SCHEMAS,
      used
    );
    const unused = Object.keys(API_CONTRACT_SCHEMAS).filter(
      (name) => !used.has(name)
    );
    expect(unused, 'contrat zod enregistré mais jamais référencé').toEqual([]);
  });
});
