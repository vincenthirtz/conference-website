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
// Les clés voisines de `x-zod` se FUSIONNENT dans le résultat : c'est là que
// vivent les textes (description, exemples) que zod ne porte pas. La fusion
// descend dans `properties` et `items` ; documenter une propriété que le
// schéma zod n'a pas est une erreur (la doc décrirait un champ que le code
// n'accepte pas). Nom inconnu ou schéma non représentable : erreur.
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

/** Fusionne la documentation rédigée (`overlay`) dans un schéma généré. */
function mergeOverlay(
  generated: Record<string, unknown>,
  overlay: Record<string, unknown>,
  where: string
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...generated };
  for (const [key, value] of Object.entries(overlay)) {
    if (key === 'properties' && isMap(value)) {
      const props = isMap(generated.properties) ? generated.properties : {};
      const merged: Record<string, unknown> = { ...props };
      for (const [prop, doc] of Object.entries(value)) {
        if (!(prop in props)) {
          throw new Error(
            `openapi: x-zod « ${where} » documente \`${prop}\`, absent du schéma zod`
          );
        }
        merged[prop] =
          isMap(doc) && isMap(props[prop])
            ? mergeOverlay(
                props[prop] as Record<string, unknown>,
                doc,
                `${where}.${prop}`
              )
            : doc;
      }
      out.properties = merged;
    } else if (key === 'items' && isMap(value) && isMap(generated.items)) {
      out.items = mergeOverlay(generated.items, value, `${where}[]`);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** État partagé d'une résolution `x-zod` sur tout un document. */
export type ZodResolution = {
  /** Noms de contrats référencés. */
  used: Set<string>;
  /**
   * Sous-schémas NOMMÉS (`.meta({ id })`) rencontrés : zod les extrait en
   * `$defs`, l'assembleur les remonte dans `components.schemas` pour que la
   * doc garde des types nommés et liés entre eux.
   */
  named: Map<string, { schema: unknown; from: string }>;
  /** Composants écrits `Nom: { x-zod }` dont le schéma racine porte l'id `Nom`. */
  declared: Set<string>;
};

export function newZodResolution(): ZodResolution {
  return { used: new Set(), named: new Map(), declared: new Set() };
}

const ZOD_DEFS = '#/$defs/';
const COMPONENT_SCHEMAS = '#/components/schemas/';

function rewriteDefRefs(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(rewriteDefRefs);
  if (!isMap(node)) return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] =
      k === '$ref' && typeof v === 'string' && v.startsWith(ZOD_DEFS)
        ? COMPONENT_SCHEMAS + v.slice(ZOD_DEFS.length)
        : rewriteDefRefs(v);
  }
  return out;
}

/**
 * Remplace chaque `{ 'x-zod': nom, ...voisins }` par le JSON Schema du contrat
 * nommé. Parcours en profondeur, nouvelles valeurs (le document d'entrée n'est
 * pas muté). Les sous-schémas nommés sont collectés dans `ctx.named`.
 */
export function resolveZodSchemas<T>(
  node: T,
  contracts: Record<string, ApiContractEntry> = API_CONTRACT_SCHEMAS,
  ctx: ZodResolution = newZodResolution(),
  key?: string
): T {
  if (Array.isArray(node)) {
    return node.map((n) => resolveZodSchemas(n, contracts, ctx)) as T;
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
    ctx.used.add(name as string);
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
    const { $schema: _dialect, $defs, ...rawRoot } = generated;
    const defs = (rewriteDefRefs($defs ?? {}) ?? {}) as Record<string, unknown>;
    for (const [id, def] of Object.entries(defs)) {
      const known = ctx.named.get(id);
      if (known && JSON.stringify(known.schema) !== JSON.stringify(def)) {
        throw new Error(
          `openapi: deux schémas zod différents portent l'id « ${id} » (${known.from}, ${String(name)})`
        );
      }
      if (!known) ctx.named.set(id, { schema: def, from: String(name) });
    }
    let schema = rewriteDefRefs(rawRoot) as Record<string, unknown>;
    const rootRef =
      Object.keys(schema).length === 1 && typeof schema.$ref === 'string'
        ? schema.$ref
        : null;
    if (rootRef?.startsWith(COMPONENT_SCHEMAS)) {
      const id = rootRef.slice(COMPONENT_SCHEMAS.length);
      // `Nom: { x-zod }` dont la racine s'appelle `Nom` : le composant EST ce
      // schéma, on y met son corps plutôt qu'une référence à lui-même.
      if (key === id) {
        ctx.declared.add(id);
        schema = defs[id] as Record<string, unknown>;
      }
    }
    return mergeOverlay(schema, siblings, String(name)) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] = resolveZodSchemas(v, contracts, ctx, k);
  }
  return out as T;
}

const HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;

/**
 * PARAMÈTRES depuis zod. Une opération qui porte `x-zod-query: <nom>` voit ses
 * paramètres générés depuis ce `z.object` (celui que le handler passe en
 * `querySchema`) :
 *   - propriété présente dans l'URL (`{matchId}`) → `in: path`, requise ;
 *     les autres → `in: query`, requises selon le schéma ;
 *   - un paramètre déjà écrit (même `name` + `in`) garde ses textes
 *     (description, exemple) mais prend le schéma et `required` générés ;
 *   - un paramètre `in: query` écrit à la main mais absent du schéma zod est
 *     une ERREUR (la doc annoncerait un filtre que le code ignore) ;
 *   - un paramètre de chemin déjà déclaré au niveau du chemin n'est pas
 *     redoublé.
 */
export function expandZodQueryParameters(
  apiPath: string,
  item: Record<string, unknown>,
  contracts: Record<string, ApiContractEntry> = API_CONTRACT_SCHEMAS,
  used?: Set<string>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...item };
  const pathParams = new Set(
    [...apiPath.matchAll(/\{([^}]+)\}/g)].map((m) => m[1])
  );
  const declaredAtPath = new Set(
    (Array.isArray(item.parameters) ? item.parameters : [])
      .filter((p) => isMap(p) && p.in === 'path')
      .map((p) => (p as Record<string, unknown>).name)
  );
  for (const method of HTTP_METHODS) {
    const op = item[method];
    if (!isMap(op) || !('x-zod-query' in op)) continue;
    const { 'x-zod-query': name, ...rest } = op;
    const where = `${method.toUpperCase()} ${apiPath}`;
    const entry = typeof name === 'string' ? contracts[name] : undefined;
    if (!entry) {
      throw new Error(
        `openapi: x-zod-query « ${String(name)} » absent de lib/apiContracts (${where})`
      );
    }
    used?.add(name as string);
    let generated: Record<string, unknown>;
    try {
      generated = z.toJSONSchema(entry.schema, { io: 'input' }) as Record<
        string,
        unknown
      >;
    } catch (err) {
      throw new Error(
        `openapi: x-zod-query « ${String(name)} » non représentable (${(err as Error).message})`
      );
    }
    if (generated.type !== 'object' || !isMap(generated.properties)) {
      throw new Error(
        `openapi: x-zod-query « ${String(name)} » doit être un z.object (${where})`
      );
    }
    const required = new Set(
      Array.isArray(generated.required) ? generated.required : []
    );
    const written = (Array.isArray(op.parameters) ? op.parameters : []).filter(
      isMap
    );
    const byKey = new Map(
      written.map((p) => [`${String(p.in)}:${String(p.name)}`, p])
    );
    const params: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    for (const [prop, schema] of Object.entries(generated.properties)) {
      const inPath = pathParams.has(prop);
      if (inPath && declaredAtPath.has(prop)) continue;
      const key = `${inPath ? 'path' : 'query'}:${prop}`;
      seen.add(key);
      const doc = byKey.get(key) ?? {};
      const { schema: _hand, required: _req, ...texts } = doc;
      params.push({
        name: prop,
        in: inPath ? 'path' : 'query',
        ...texts,
        required: inPath || required.has(prop),
        schema,
      });
    }
    for (const p of written) {
      const key = `${String(p.in)}:${String(p.name)}`;
      if (seen.has(key)) continue;
      if (p.in === 'query') {
        throw new Error(
          `openapi: ${where} documente le paramètre de requête \`${String(p.name)}\`, absent du schéma zod « ${String(name)} »`
        );
      }
      params.push(p); // en-têtes, cookies, chemin : hors du schéma de query
    }
    out[method] = { ...rest, parameters: params };
  }
  return out;
}

/** Réponses déduites du code (scripts/openapi/infer-responses.cjs). */
export type InferredResponses = {
  responses: Record<string, Record<string, unknown>>;
  unattributed: string[];
};

export const INFERRED_RESPONSES_FILE = path.join(
  'docs',
  'openapi',
  'inferred-responses.json'
);

/**
 * Un schéma qui ne dit rien de la réponse : absent, `{}`, ou un objet sans
 * propriétés ni composition (`type: object, additionalProperties: true`).
 */
export function isGenericSchema(schema: unknown): boolean {
  if (!isMap(schema)) return true;
  const informative = [
    'properties',
    'items',
    '$ref',
    'anyOf',
    'oneOf',
    'allOf',
    'x-zod',
    'enum',
    'const',
  ];
  if (informative.some((k) => k in schema)) return false;
  if (schema.type && schema.type !== 'object') return false;
  return (
    schema.additionalProperties === undefined ||
    schema.additionalProperties === true
  );
}

export type InferredMergeStats = {
  replaced: number;
  added: number;
  keptWritten: number;
};

/**
 * RÉPONSES DÉDUITES. Pour chaque opération, la réponse 2xx déduite du type
 * réellement passé à `res.json()` :
 *   - remplace un schéma écrit GÉNÉRIQUE ou absent (la description reste) ;
 *   - ajoute un code 2xx que le code renvoie mais que la spec ne documente pas ;
 *   - ne touche PAS un schéma écrit précis (composants nommés, textes) ;
 *   - rien du tout si l'opération porte `x-infer-responses: false`.
 */
export function mergeInferredResponses(
  paths: Record<string, unknown>,
  inferred: InferredResponses['responses'],
  stats: InferredMergeStats = { replaced: 0, added: 0, keptWritten: 0 }
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [url, rawItem] of Object.entries(paths)) {
    if (!isMap(rawItem)) {
      out[url] = rawItem;
      continue;
    }
    const item: Record<string, unknown> = { ...rawItem };
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!isMap(op)) continue;
      const { 'x-infer-responses': infer, ...rest } = op;
      const byStatus = inferred[`${method.toUpperCase()} ${url}`];
      if (infer === false || !byStatus) {
        item[method] = rest;
        continue;
      }
      const responses: Record<string, unknown> = isMap(rest.responses)
        ? { ...rest.responses }
        : {};
      for (const [status, schema] of Object.entries(byStatus)) {
        const written = responses[status];
        if (!isMap(written)) {
          responses[status] = {
            description: 'Succès (schéma déduit du code du handler).',
            content: { 'application/json': { schema } },
          };
          stats.added++;
          continue;
        }
        if ('$ref' in written) {
          stats.keptWritten++;
          continue;
        }
        const content = isMap(written.content) ? written.content : {};
        const json = isMap(content['application/json'])
          ? content['application/json']
          : null;
        if (
          !Object.keys(content).length ||
          (json && isGenericSchema(json.schema))
        ) {
          responses[status] = {
            ...written,
            content: {
              ...content,
              'application/json': { ...(json ?? {}), schema },
            },
          };
          stats.replaced++;
        } else {
          stats.keptWritten++;
        }
      }
      item[method] = { ...rest, responses };
    }
    out[url] = item;
  }
  return out;
}

export function readInferredResponses(root: string): InferredResponses | null {
  const file = path.join(root, INFERRED_RESPONSES_FILE);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as InferredResponses;
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
  const zodQueryUsed = new Set<string>();
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
    paths[apiPath] = expandZodQueryParameters(
      apiPath,
      item,
      undefined,
      zodQueryUsed
    );
  }

  const ctx = newZodResolution();
  for (const name of zodQueryUsed) ctx.used.add(name);
  const inferred = readInferredResponses(root);
  const mergedPaths = inferred
    ? mergeInferredResponses(paths, inferred.responses)
    : paths;
  const resolved = resolveZodSchemas(
    { ...doc, components, paths: mergedPaths },
    undefined,
    ctx
  );
  const schemas = ((resolved.components as Record<string, unknown>).schemas ??=
    {}) as Record<string, unknown>;
  for (const [id, { from }] of ctx.named) {
    if (ctx.declared.has(id)) continue;
    if (id in schemas) {
      throw new Error(
        `openapi: le schéma zod nommé « ${id} » (${from}) entre en conflit avec le composant écrit à la main du même nom`
      );
    }
    schemas[id] = ctx.named.get(id)?.schema;
  }
  return resolved;
}
