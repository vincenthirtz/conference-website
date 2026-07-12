// utils/openapi/publicSpec.ts
//
// Derives the PUBLIC OpenAPI surface from the canonical `docs/openapi.yaml`
// (which covers the full bot/admin/cron/public API). We keep only the
// `/api/public/*` paths and the components they transitively reference, so we
// can serve a machine-readable public spec (`/api/public/openapi`) and render
// an always-in-sync developer reference (`/developpeurs/reference`) without
// leaking internal (bot/admin) endpoints or schema shapes.
//
// Pure filtering lives in `filterPublicSpec` (unit-tested); `buildPublicSpec`
// reads + parses the YAML once and memoises the result.

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

// Loose typing on purpose — OpenAPI documents are deeply dynamic and fully
// modelling 3.1 here would add friction without real safety.
export type OpenApiDoc = Record<string, unknown>;

const SPEC_PATH = path.join(process.cwd(), 'docs', 'openapi.yaml');
const PUBLIC_PREFIX = '/api/public/';
const COMPONENTS_REF = '#/components/';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Walk any node collecting the component keys it references. A component key is
 * the `type/name` tail of a `#/components/<type>/<name>` $ref (e.g.
 * `schemas/PublicV1Match`, `responses/NotFound`) or `securitySchemes/<Name>`
 * pulled from `security` requirement objects.
 */
function collectRefsInto(node: unknown, acc: Set<string>): void {
  if (Array.isArray(node)) {
    for (const el of node) collectRefsInto(el, acc);
    return;
  }
  if (!isObject(node)) return;

  for (const [key, value] of Object.entries(node)) {
    if (
      key === '$ref' &&
      typeof value === 'string' &&
      value.startsWith(COMPONENTS_REF)
    ) {
      acc.add(value.slice(COMPONENTS_REF.length));
      continue;
    }
    if (key === 'security' && Array.isArray(value)) {
      for (const requirement of value) {
        if (isObject(requirement)) {
          for (const scheme of Object.keys(requirement)) {
            acc.add(`securitySchemes/${scheme}`);
          }
        }
      }
      continue;
    }
    collectRefsInto(value, acc);
  }
}

function resolveComponent(
  components: Record<string, unknown>,
  ref: string
): unknown {
  const slash = ref.indexOf('/');
  if (slash === -1) return undefined;
  const type = ref.slice(0, slash);
  const name = ref.slice(slash + 1);
  const bucket = components[type];
  return isObject(bucket) ? bucket[name] : undefined;
}

/** Grow the referenced set until closure (components referencing components). */
function closeRefs(
  components: Record<string, unknown>,
  initial: Set<string>
): Set<string> {
  const wanted = new Set(initial);
  const queue = [...initial];
  while (queue.length) {
    const ref = queue.pop() as string;
    const def = resolveComponent(components, ref);
    if (def === undefined) continue;
    const found = new Set<string>();
    collectRefsInto(def, found);
    for (const f of found) {
      if (!wanted.has(f)) {
        wanted.add(f);
        queue.push(f);
      }
    }
  }
  return wanted;
}

function pruneComponents(
  components: Record<string, unknown>,
  wanted: Set<string>
): Record<string, unknown> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [type, entries] of Object.entries(components)) {
    if (!isObject(entries)) continue;
    for (const [name, def] of Object.entries(entries)) {
      if (wanted.has(`${type}/${name}`)) {
        (out[type] ??= {})[name] = def;
      }
    }
  }
  return out;
}

/**
 * Pure transform: full spec → public-only spec. Keeps `/api/public/*` paths,
 * the components they transitively reference, and only the tags actually used.
 */
export function filterPublicSpec(full: OpenApiDoc): OpenApiDoc {
  const fullPaths = isObject(full.paths) ? full.paths : {};
  const publicPaths: Record<string, unknown> = {};
  for (const [p, item] of Object.entries(fullPaths)) {
    if (p.startsWith(PUBLIC_PREFIX)) publicPaths[p] = item;
  }

  const fullComponents = isObject(full.components) ? full.components : {};
  const initial = new Set<string>();
  collectRefsInto(publicPaths, initial);
  const wanted = closeRefs(fullComponents, initial);
  const components = pruneComponents(fullComponents, wanted);

  const usedTags = new Set<string>();
  for (const item of Object.values(publicPaths)) {
    if (!isObject(item)) continue;
    for (const op of Object.values(item)) {
      if (isObject(op) && Array.isArray(op.tags)) {
        for (const tag of op.tags) if (typeof tag === 'string') usedTags.add(tag);
      }
    }
  }
  const fullTags = Array.isArray(full.tags) ? full.tags : [];
  const info = isObject(full.info) ? full.info : {};

  return {
    openapi: full.openapi ?? '3.1.0',
    info: {
      title: 'Conference Website — API publique',
      version: info.version ?? '1.0.0',
      description:
        "Surface publique de l'API conference-website : lecture anonyme " +
        '(`/api/public/v1/*`, CORS `*`, rate-limitée ~120 req/min/IP) et ' +
        'écriture authentifiée par token scopé ' +
        '(`Authorization: Bearer pk_live_…`). Cette spec ne couvre que les ' +
        'endpoints publics ; les surfaces bot/admin/cron sont internes et ne ' +
        'sont pas documentées ici.',
      contact: info.contact,
      license: info.license,
    },
    servers: full.servers,
    tags: fullTags.filter(
      (tag) => isObject(tag) && usedTags.has(tag.name as string)
    ),
    // Public default: no global auth requirement. Each operation still
    // declares its own `security` (none for reads, PublicApiToken for writes).
    security: [],
    paths: publicPaths,
    components,
  };
}

let cached: OpenApiDoc | null = null;

/** Read + parse `docs/openapi.yaml`, filter to public, memoise. */
export function buildPublicSpec(): OpenApiDoc {
  if (cached) return cached;
  const raw = fs.readFileSync(SPEC_PATH, 'utf8');
  const full = parseYaml(raw) as OpenApiDoc;
  cached = filterPublicSpec(full);
  return cached;
}

export function publicSpecAsYaml(): string {
  return stringifyYaml(buildPublicSpec());
}

// Test seam — lets unit tests reset the memo between fixtures.
export function __resetPublicSpecCache(): void {
  cached = null;
}
