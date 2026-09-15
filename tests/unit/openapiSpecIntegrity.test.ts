// Intégrité interne de la spec OpenAPI.
//
// Le test de dérive (openapiContractDrift) compare la spec au CODE ; rien ne
// vérifiait la spec contre ELLE-MÊME. Résultat constaté le 2026-09-15 : un
// `operationId` en double, 19 tags utilisés sans être déclarés, un schéma et
// deux paramètres morts — invisibles, puisque rien ne lintait le document.
// Ces règles sont celles qu'un générateur de client ou un lint Redocly
// appliqueraient ; on les tient ici, sans dépendance.

import { describe, expect, it } from 'vitest';
import { loadFullSpec } from '../../utils/openapi/loadSpec';

const METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;

type Doc = {
  tags?: { name: string }[];
  paths: Record<string, Record<string, any>>;
  components: Record<string, Record<string, any>>;
};

const doc = loadFullSpec() as unknown as Doc;

function operations() {
  const out: { key: string; path: string; item: any; op: any }[] = [];
  for (const [p, item] of Object.entries(doc.paths)) {
    for (const m of METHODS) {
      if (item[m]) {
        out.push({
          key: `${m.toUpperCase()} ${p}`,
          path: p,
          item,
          op: item[m],
        });
      }
    }
  }
  return out;
}

function collectRefs(node: unknown, acc: Set<string>) {
  if (Array.isArray(node)) {
    for (const v of node) collectRefs(v, acc);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string') acc.add(v);
      else collectRefs(v, acc);
    }
  }
  return acc;
}

function resolve(ref: string): unknown {
  if (!ref.startsWith('#/')) return undefined;
  return ref
    .slice(2)
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce<any>((node, key) => node?.[key], doc);
}

describe('OpenAPI — intégrité interne', () => {
  const ops = operations();

  it('chaque opération a un operationId, et il est unique', () => {
    const seen = new Map<string, string[]>();
    const missing: string[] = [];
    for (const { key, op } of ops) {
      if (!op.operationId) missing.push(key);
      else seen.set(op.operationId, [...(seen.get(op.operationId) ?? []), key]);
    }
    const dups = [...seen].filter(([, keys]) => keys.length > 1);
    expect(missing, 'operationId manquant').toEqual([]);
    expect(dups, 'operationId en double').toEqual([]);
  });

  it('les tags utilisés sont déclarés, et les tags déclarés servent', () => {
    const declared = new Set((doc.tags ?? []).map((t) => t.name));
    const used = new Set(ops.flatMap(({ op }) => op.tags ?? []));
    expect(
      [...used].filter((t) => !declared.has(t)),
      'tag non déclaré'
    ).toEqual([]);
    expect(
      [...declared].filter((t) => !used.has(t)),
      'tag déclaré inutilisé'
    ).toEqual([]);
  });

  it('chaque $ref interne se résout', () => {
    const broken = [...collectRefs(doc, new Set())].filter(
      (ref) => resolve(ref) === undefined
    );
    expect(broken).toEqual([]);
  });

  it('aucun composant mort (schémas, paramètres, réponses)', () => {
    const refs = collectRefs(doc, new Set());
    const dead: string[] = [];
    for (const section of ['schemas', 'parameters', 'responses']) {
      for (const name of Object.keys(doc.components[section] ?? {})) {
        if (!refs.has(`#/components/${section}/${name}`)) {
          dead.push(`${section}/${name}`);
        }
      }
    }
    expect(dead).toEqual([]);
  });

  it('chaque paramètre de chemin {x} est déclaré en `in: path`', () => {
    const undeclared: string[] = [];
    for (const { key, path: p, item, op } of ops) {
      const names = new Set(
        [...(item.parameters ?? []), ...(op.parameters ?? [])]
          .map((prm: any) => (prm.$ref ? (resolve(prm.$ref) as any) : prm))
          .filter((prm: any) => prm?.in === 'path')
          .map((prm: any) => prm.name)
      );
      for (const [, name] of p.matchAll(/\{([^}]+)\}/g)) {
        if (!names.has(name)) undeclared.push(`${key} → {${name}}`);
      }
    }
    expect(undeclared).toEqual([]);
  });
});
