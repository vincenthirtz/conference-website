// La spec OpenAPI est découpée en fragments (docs/openapi/, cf.
// utils/openapi/assemble.ts). Tant que `docs/openapi.yaml` existe encore, les
// deux doivent décrire EXACTEMENT le même document.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { assembleSpec, fragmentToApiPath } from '../../utils/openapi/assemble';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

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

describe('fragments ↔ docs/openapi.yaml', () => {
  it('les fragments assemblés décrivent exactement docs/openapi.yaml', () => {
    const legacy = parseYaml(
      fs.readFileSync(path.join(REPO_ROOT, 'docs', 'openapi.yaml'), 'utf8')
    );
    expect(assembleSpec(REPO_ROOT)).toEqual(legacy);
  });
});
