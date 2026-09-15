// utils/openapi/assemble.ts
//
// Assemble la spec OpenAPI à partir de ses fragments (`docs/openapi/`).
//
//   docs/openapi/
//     root.yaml                        openapi, info, servers, tags, security
//     components/<section>.yaml        une section entière (ex. parameters)
//     components/<section>/<nom>.yaml  ou une section découpée en fichiers
//     paths/api/…/<handler>.yaml       UN fichier par handler de pages/api
//
// Un fragment de `paths/` contient l'objet « path item » (méthodes, paramètres
// communs) SANS son URL : l'URL se déduit de l'emplacement du fichier, avec la
// règle de routage de Next (`index` retiré, `[x]` et `[...x]` → `{x}`). Le
// fragment de `pages/api/admin/tcg/grant.ts` est donc
// `docs/openapi/paths/api/admin/tcg/grant.yaml` : on ne peut plus documenter
// une URL mal orthographiée, et le fragment se trouve là où l'on cherche.
//
// Les `$ref` restent internes au document assemblé (`#/components/...`).
// Doublons (URL, clé de composant) : erreur, jamais d'écrasement silencieux.
//
// SCHÉMAS ZOD. Partout où un schéma est attendu, un fragment peut écrire
// `x-zod: <nom>` : l'assembleur y met le JSON Schema du schéma zod enregistré
// sous ce nom dans lib/apiContracts (celui-là même que le handler utilise).
// Les clés voisines de `x-zod` (ex. `description`) complètent le résultat.
// Nom inconnu ou schéma non représentable : erreur.
//
// Pas d'alias `@/` ici ni dans les modules importés : l'assembleur tourne
// aussi dans un script de build (scripts/openapi/build.mjs).

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import {
  API_CONTRACT_SCHEMAS,
  type ApiContractEntry,
} from '../../lib/apiContracts';

export type OpenApiDoc = Record<string, unknown>;

export const FRAGMENTS_DIR = path.join('docs', 'openapi');

function readYaml(file: string): unknown {
  return parseYaml(fs.readFileSync(file, 'utf8'));
}

function walkYaml(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkYaml(p, out);
    else if (entry.name.endsWith('.yaml')) out.push(p);
  }
  return out;
}

/**
 * URL d'API d'un fragment, depuis son chemin relatif à `paths/`
 * (`api/teams/[teamId]/index.yaml` → `/api/teams/{teamId}`). Même règle que la
 * correspondance fichier → URL des handlers (cf. openapiContractDrift).
 */
export function fragmentToApiPath(relative: string): string {
  let p = relative.replace(/\\/g, '/').replace(/\.ya?ml$/, '');
  p = p.replace(/\/index$/, '');
  p = p.replace(/\[\.\.\.(.+?)\]/g, '{$1}');
  p = p.replace(/\[(.+?)\]/g, '{$1}');
  return `/${p}`;
}

function isMap(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Remplace chaque `{ 'x-zod': nom, ...voisins }` par le JSON Schema du contrat
 * nommé. Parcours en profondeur, nouvelles valeurs (le document d'entrée n'est
 * pas muté). Rend aussi l'ensemble des noms utilisés.
 */
export function resolveZodSchemas<T>(
  node: T,
  contracts: Record<string, ApiContractEntry> = API_CONTRACT_SCHEMAS,
  used: Set<string> = new Set()
): T {
  if (Array.isArray(node)) {
    return node.map((n) => resolveZodSchemas(n, contracts, used)) as T;
  }
  if (!isMap(node)) return node;
  if ('x-zod' in node) {
    const { 'x-zod': name, ...siblings } = node;
    const entry = typeof name === 'string' ? contracts[name] : undefined;
    if (!entry) {
      throw new Error(
        `openapi: x-zod « ${String(name)} » absent de lib/apiContracts`
      );
    }
    used.add(name as string);
    let generated: Record<string, unknown>;
    try {
      generated = z.toJSONSchema(entry.schema, { io: entry.io }) as Record<
        string,
        unknown
      >;
    } catch (err) {
      throw new Error(
        `openapi: x-zod « ${String(name)} » non représentable en JSON Schema (${(err as Error).message})`
      );
    }
    const { $schema: _dialect, ...schema } = generated;
    return { ...schema, ...siblings } as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] = resolveZodSchemas(v, contracts, used);
  }
  return out as T;
}

export function assembleSpec(root: string = process.cwd()): OpenApiDoc {
  const base = path.join(root, FRAGMENTS_DIR);
  const doc = readYaml(path.join(base, 'root.yaml'));
  if (!isMap(doc)) throw new Error('openapi: root.yaml doit être un objet');
  if ('paths' in doc || 'components' in doc) {
    throw new Error(
      'openapi: root.yaml ne porte ni `paths` ni `components` (ils vivent dans leurs dossiers)'
    );
  }

  // --- components -----------------------------------------------------------
  const components: Record<string, Record<string, unknown>> = {};
  const componentsDir = path.join(base, 'components');
  const add = (section: string, entries: unknown, from: string) => {
    if (!isMap(entries)) {
      throw new Error(`openapi: ${from} doit être un objet`);
    }
    const bucket = (components[section] ??= {});
    for (const [name, def] of Object.entries(entries)) {
      if (name in bucket) {
        throw new Error(
          `openapi: composant ${section}/${name} défini deux fois (${from})`
        );
      }
      bucket[name] = def;
    }
  };
  if (fs.existsSync(componentsDir)) {
    const entries = fs
      .readdirSync(componentsDir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const p = path.join(componentsDir, entry.name);
      if (entry.isDirectory()) {
        components[entry.name] ??= {};
        for (const file of walkYaml(p)) add(entry.name, readYaml(file), file);
      } else if (entry.name.endsWith('.yaml')) {
        add(entry.name.replace(/\.yaml$/, ''), readYaml(p), p);
      }
    }
  }

  // --- paths ----------------------------------------------------------------
  const pathsDir = path.join(base, 'paths');
  const paths: Record<string, unknown> = {};
  const origin = new Map<string, string>();
  for (const file of walkYaml(pathsDir)) {
    const rel = path.relative(pathsDir, file);
    const apiPath = fragmentToApiPath(rel);
    const item = readYaml(file);
    if (!isMap(item)) throw new Error(`openapi: ${file} doit être un objet`);
    if (origin.has(apiPath)) {
      throw new Error(
        `openapi: ${apiPath} décrit deux fois (${origin.get(apiPath)} et ${rel})`
      );
    }
    origin.set(apiPath, rel);
    paths[apiPath] = item;
  }

  return resolveZodSchemas({ ...doc, components, paths });
}
