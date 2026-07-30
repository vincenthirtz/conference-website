// tests/unit/openapiContractDrift.test.ts
//
// Détecte la drift entre les 3 sources de vérité de la surface HTTP :
//   1. `docs/openapi.yaml` — la spec (machine-readable).
//   2. `pages/api/**/*.ts` — les handlers Next.js (canonique).
//   3. `../docker-box/services/discord-bot/**/*.{js,ts}` — le client bot
//      (consumer cross-repo).
//
// Le test ne *corrige* pas la drift : il la *rapporte*. Une entrée dans
// `ALLOWLIST_*` ci-dessous est la voie d'évacuation pour les cas connus
// (handlers générés, routes en cours de retrait, etc.) — toute autre
// drift fait échouer le test.
//
// Cross-repo : le bot vit dans `docker-box`, son chemin est résolu depuis
// `BOT_CLIENT_ROOT` (env override) ou `../docker-box/services/discord-bot`.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

// ---------------------------------------------------------------------------
// Roots
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SPEC_PATH = path.join(REPO_ROOT, 'docs', 'openapi.yaml');
const API_ROOT = path.join(REPO_ROOT, 'pages', 'api');
const BOT_CLIENT_ROOT =
  process.env.BOT_CLIENT_ROOT ??
  path.resolve(REPO_ROOT, '..', 'docker-box', 'services', 'discord-bot');

// ---------------------------------------------------------------------------
// Allowlists — known drift entries that should NOT fail the test
// ---------------------------------------------------------------------------

/** Path entries that exist in openapi.yaml but have no matching handler. */
const ALLOWLIST_SPEC_WITHOUT_HANDLER = new Set<string>([
  // Add `'/api/foo/bar'` entries here as needed.
  // Servi par une fonction Netlify (netlify/functions/builds.ts), pas un
  // handler Next — documenté dans openapi.yaml mais sans fichier pages/api.
  '/api/netlify-builds',
]);

/** Handler files whose path is intentionally missing from openapi.yaml. */
const ALLOWLIST_HANDLER_WITHOUT_SPEC = new Set<string>([
  // Internal / temporary endpoints not yet documented.
]);

/**
 * Path+method combos where openapi method ≠ handler-declared method.
 *
 * Every entry here is a TODO: either the openapi spec needs updating to
 * match the handler, or the handler is exposing an undocumented method.
 * Drain this set over time — do NOT add new entries without filing a fix.
 */
const ALLOWLIST_METHOD_MISMATCH = new Set<string>([
  // Heuristic limitations only — handler truly accepts the method, but the
  // regex-based `detectMethods()` misses it because the file uses a compound
  // negative form `req.method !== 'POST' && req.method !== 'DELETE'` instead
  // of a switch/case. Spec is correct; do not "fix" it by removing entries.
  'DELETE /api/admin/staff/{staffId}/pole-admin',
  // Heuristic limitation — handler accepts GET + POST, but detector only sees
  // POST because the GET path is gated by `if (req.method !== 'GET')`.
  'GET /api/news',
  // Heuristic limitation — broadcast index accepts GET + POST (campaign create),
  // but the detector only reports POST: the positive `req.method === 'POST'`
  // check fires first, so the later `if (req.method !== 'GET')` negative form is
  // ignored (rule 4 only runs when found.size === 0). Spec documents both; the
  // handler genuinely accepts GET.
  'GET /api/admin/broadcast',
  // Heuristic limitation — the [campaignId] handler accepts POST (send) + PATCH
  // (edit) + DELETE (delete). The detector sees PATCH/DELETE via positive
  // `req.method === ...` checks, which suppresses the negative-form POST gate
  // (`if (req.method !== 'POST')`). Spec documents all three; POST is real.
  'POST /api/admin/broadcast/{campaignId}',
]);

/**
 * Path+method combos where openapi security scheme ≠ handler wrapper.
 *
 * Every entry here is a TODO: the openapi-gen agents over-assumed StaffSession
 * for everything under `/api/admin/*` even when the handler uses bearer or is
 * actually public. Fix the spec, then drop the entry.
 */
const ALLOWLIST_AUTH_MISMATCH = new Set<string>([
  // Legacy bot ingest: handler verifies BOT_API_KEY env inline (no
  // withBotRoute wrapper), so `detectAuth()` reports `public`. The spec
  // legitimately declares BotApiKey+BotTenantId security. Keep entry
  // until the handler migrates to withBotRoute.
  'POST /api/news',
  // Lien privé d'invitation : un seul fichier sert DEUX surfaces — un GET
  // PUBLIC (métadonnées de l'invitation, affichées avant connexion) et un POST
  // sous `withAuthRoute` (accepter/refuser). `detectAuth()` raisonne au fichier
  // et voit donc `player` pour les deux ; côté spec, seul le POST porte
  // PlayerBearer. La divergence est voulue, pas une dérive.
  'GET /api/teams/invitations/by-token',
]);

/** Bot client URLs that intentionally don't have a matching openapi entry. */
const ALLOWLIST_BOT_CALL_WITHOUT_SPEC = new Set<string>([
  // 'GET /api/bot/v1/legacy/whatever'
]);

// ---------------------------------------------------------------------------
// OpenAPI spec → operation inventory
// ---------------------------------------------------------------------------

type SpecOp = {
  apiPath: string;
  method: string;
  security: string[]; // scheme names (BotApiKey, StaffSession, PlayerBearer, CronSecret, [])
};

function loadSpec(): { paths: Record<string, any>; defaultSecurity: string[] } {
  const raw = fs.readFileSync(SPEC_PATH, 'utf8');
  const spec = parseYaml(raw);
  const defaultSecurity = (spec.security ?? []).flatMap(
    (s: Record<string, unknown>) => Object.keys(s)
  ) as string[];
  return { paths: spec.paths ?? {}, defaultSecurity };
}

function listSpecOps(): SpecOp[] {
  const { paths, defaultSecurity } = loadSpec();
  const out: SpecOp[] = [];
  const httpVerbs = ['get', 'post', 'put', 'patch', 'delete'] as const;
  for (const [apiPath, pathItem] of Object.entries(paths)) {
    for (const [verb, op] of Object.entries(pathItem as Record<string, any>)) {
      if (!(httpVerbs as readonly string[]).includes(verb)) continue;
      const sec = (op as any).security ?? null;
      const schemes: string[] = sec
        ? sec.flatMap((s: Record<string, unknown>) => Object.keys(s))
        : defaultSecurity;
      out.push({
        apiPath,
        method: verb.toUpperCase(),
        security: [...new Set(schemes)],
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Handler files → operation inventory
// ---------------------------------------------------------------------------

type AuthKind =
  | 'bot'
  | 'bot-crossTenant'
  | 'staff-owner'
  | 'staff-admin'
  | 'staff-manager'
  | 'staff-caster'
  | 'player'
  | 'public-token'
  | 'cron'
  | 'public'
  | 'unknown';

type HandlerInfo = {
  file: string;
  apiPath: string;
  methods: string[];
  auth: AuthKind;
};

function fileToApiPath(file: string): string {
  const rel = path.relative(path.join(REPO_ROOT, 'pages'), file);
  let p = rel.replace(/\\/g, '/').replace(/\.ts$/, '');
  p = p.replace(/\/index$/, '');
  p = p.replace(/\[\.\.\.(.+?)\]/g, '{$1}'); // catch-all
  p = p.replace(/\[(.+?)\]/g, '{$1}');
  return '/' + p;
}

function walkTs(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTs(p, out);
    } else if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      out.push(p);
    }
  }
  return out;
}

function detectAuth(src: string): AuthKind {
  if (/\bwithBotRoute\s*\(/.test(src)) {
    if (/crossTenant\s*:\s*true/.test(src)) return 'bot-crossTenant';
    return 'bot';
  }
  if (/\bwithCasterRoute\s*\(/.test(src)) return 'staff-caster';
  const staff = src.match(/\bwithStaffRoute\s*\([^,)]+(?:,\s*['"](\w+)['"])?/);
  if (staff) {
    const role = staff[1] ?? 'admin';
    if (role === 'owner') return 'staff-owner';
    if (role === 'manager') return 'staff-manager';
    if (role === 'caster') return 'staff-caster';
    return 'staff-admin';
  }
  if (/\bwithAuthRoute\s*\(/.test(src)) return 'player';
  if (/\bwithPublicWrite\s*(?:<[^>]*>)?\s*\(/.test(src)) return 'public-token';
  if (/CRON_SECRET|requireCronAuth|isCronAuthorized|x-cron-secret/i.test(src))
    return 'cron';
  return 'public';
}

function detectMethods(src: string): string[] {
  const verbs = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
  const found = new Set<string>();

  // 1. withBotRoute(_, { methods: ['GET', 'POST'] })
  const botMethods = src.match(/methods\s*:\s*\[([^\]]+)\]/);
  if (botMethods) {
    for (const m of botMethods[1].matchAll(
      /['"](GET|POST|PUT|PATCH|DELETE)['"]/g
    )) {
      found.add(m[1]);
    }
  }

  // 2. req.method === 'GET' (positive match)
  for (const m of src.matchAll(/req\.method\s*===?\s*['"](\w+)['"]/g)) {
    if (verbs.has(m[1].toUpperCase())) found.add(m[1].toUpperCase());
  }

  // 3. switch case 'GET':
  for (const m of src.matchAll(/case\s+['"](GET|POST|PUT|PATCH|DELETE)['"]/g)) {
    found.add(m[1]);
  }

  // 4. Negative form: req.method !== 'POST' (means only POST allowed)
  if (found.size === 0) {
    const neg = [...src.matchAll(/req\.method\s*!==\s*['"](\w+)['"]/g)];
    if (neg.length === 1 && verbs.has(neg[0][1].toUpperCase())) {
      found.add(neg[0][1].toUpperCase());
    }
  }

  // 5. setHeader('Allow', 'GET, POST')
  if (found.size === 0) {
    const allow = src.match(
      /setHeader\(\s*['"]Allow['"]\s*,\s*['"]([^'"]+)['"]/i
    );
    if (allow) {
      for (const v of allow[1].split(',').map((s) => s.trim().toUpperCase())) {
        if (verbs.has(v)) found.add(v);
      }
    }
  }

  return [...found].sort();
}

function listHandlers(): HandlerInfo[] {
  return walkTs(API_ROOT).map((file) => {
    const src = fs.readFileSync(file, 'utf8');
    return {
      file,
      apiPath: fileToApiPath(file),
      methods: detectMethods(src),
      auth: detectAuth(src),
    };
  });
}

// ---------------------------------------------------------------------------
// Bot client → call inventory
// ---------------------------------------------------------------------------

type BotCall = {
  file: string;
  method: string;
  rawUrl: string;
  normalized: string;
};

function resolveTemplate(src: string, expr: string): string {
  // Resolve module-level `const NAME = \`...\`` substitutions.
  let out = expr;
  for (const m of src.matchAll(/const\s+([A-Z_][A-Z0-9_]*)\s*=\s*`([^`]+)`/g)) {
    out = out.replace(new RegExp(`\\$\\{${m[1]}\\}`, 'g'), m[2]);
  }
  // Replace any remaining `${...}` with `{param}` so paths match openapi.
  out = out.replace(/\$\{[^}]+\}/g, '{param}');
  // Trim query string for path matching.
  out = out.split('?')[0];
  // Replace numeric / uuid trailing segments that look like params.
  return out;
}

function normalizeBotPath(p: string): string {
  // Replace UUIDs and numeric ids with {param}; keeps semantic match against
  // openapi {paramName}.
  return p
    .replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      '/{param}'
    )
    .replace(/\/\d{10,}/g, '/{param}'); // Discord snowflakes
}

function listBotCalls(): BotCall[] {
  if (!fs.existsSync(BOT_CLIENT_ROOT)) return [];
  const out: BotCall[] = [];
  const files: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
      } else if (/\.(js|ts|mjs)$/.test(entry.name)) {
        files.push(p);
      }
    }
  };
  walk(BOT_CLIENT_ROOT);

  const callRe =
    /(getBotApi|postBotApi|patchBotApi|deleteBotApi)\s*\(\s*(`[^`]+`|'[^']+'|"[^"]+")/g;
  const methodOf: Record<string, string> = {
    getBotApi: 'GET',
    postBotApi: 'POST',
    patchBotApi: 'PATCH',
    deleteBotApi: 'DELETE',
  };

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(callRe)) {
      const fn = m[1];
      const raw = m[2].slice(1, -1); // strip quotes/backticks
      const resolved = resolveTemplate(src, raw);
      if (!resolved.includes('/api/bot/v1/') && !resolved.startsWith('/'))
        continue;
      const idx = resolved.indexOf('/api/bot/v1/');
      const apiPath = idx >= 0 ? resolved.slice(idx) : resolved;
      out.push({
        file,
        method: methodOf[fn],
        rawUrl: raw,
        normalized: normalizeBotPath(apiPath),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers shared by tests
// ---------------------------------------------------------------------------

function authToSecurity(auth: AuthKind): Set<string> {
  switch (auth) {
    case 'bot':
    case 'bot-crossTenant':
      return new Set(['BotApiKey']); // BotTenantId is "optional with"
    case 'staff-owner':
    case 'staff-admin':
    case 'staff-manager':
    case 'staff-caster':
      return new Set(['StaffSession']);
    case 'player':
      return new Set(['PlayerBearer']);
    case 'public-token':
      return new Set(['PublicApiToken']);
    case 'cron':
      return new Set(['CronSecret']);
    case 'public':
      return new Set([]); // no security
    default:
      return new Set();
  }
}

function pathTemplateEquivalent(a: string, b: string): boolean {
  // Allow {x} vs {y} to match (param names differ between bot client and spec).
  const normalize = (s: string) => s.replace(/\{[^}]+\}/g, '{param}');
  return normalize(a) === normalize(b);
}

function findSpecMatch(
  specOps: SpecOp[],
  apiPath: string,
  method?: string
): SpecOp | null {
  return (
    specOps.find(
      (s) =>
        pathTemplateEquivalent(s.apiPath, apiPath) &&
        (!method || s.method === method)
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const SPEC_OPS = listSpecOps();
const HANDLERS = listHandlers();
const BOT_CALLS = listBotCalls();

describe('OpenAPI ↔ handlers', () => {
  it('every handler file has a matching openapi path', () => {
    const specPaths = new Set(SPEC_OPS.map((o) => o.apiPath));
    const missing: string[] = [];
    for (const h of HANDLERS) {
      if (ALLOWLIST_HANDLER_WITHOUT_SPEC.has(h.apiPath)) continue;
      if (h.methods.length === 0) continue; // not a route handler (helper file)
      const hit = [...specPaths].some((p) =>
        pathTemplateEquivalent(p, h.apiPath)
      );
      if (!hit) missing.push(h.apiPath);
    }
    expect(
      missing,
      `${missing.length} handler(s) missing from openapi.yaml:\n  ${missing.join('\n  ')}`
    ).toEqual([]);
  });

  it('every openapi path has a matching handler file', () => {
    const handlerPaths = new Set(HANDLERS.map((h) => h.apiPath));
    const phantom: string[] = [];
    for (const op of SPEC_OPS) {
      if (ALLOWLIST_SPEC_WITHOUT_HANDLER.has(op.apiPath)) continue;
      const hit = [...handlerPaths].some((p) =>
        pathTemplateEquivalent(p, op.apiPath)
      );
      if (!hit) phantom.push(op.apiPath);
    }
    const unique = [...new Set(phantom)].sort();
    expect(
      unique,
      `${unique.length} phantom path(s) in openapi.yaml (no handler file):\n  ${unique.join('\n  ')}`
    ).toEqual([]);
  });

  it('methods declared in openapi match methods accepted by handler', () => {
    const drifts: string[] = [];
    for (const h of HANDLERS) {
      if (h.methods.length === 0) continue;
      const specForPath = SPEC_OPS.filter((o) =>
        pathTemplateEquivalent(o.apiPath, h.apiPath)
      );
      if (specForPath.length === 0) continue; // covered by other test
      const specMethods = new Set(specForPath.map((o) => o.method));
      const handlerMethods = new Set(h.methods);

      // Methods in spec but NOT in handler
      for (const m of specMethods) {
        if (!handlerMethods.has(m)) {
          const key = `${m} ${h.apiPath}`;
          if (!ALLOWLIST_METHOD_MISMATCH.has(key)) {
            drifts.push(
              `spec says ${m} but handler doesn't accept it: ${h.apiPath}`
            );
          }
        }
      }
      // Methods in handler but NOT in spec
      for (const m of handlerMethods) {
        if (!specMethods.has(m)) {
          const key = `${m} ${h.apiPath}`;
          if (!ALLOWLIST_METHOD_MISMATCH.has(key)) {
            drifts.push(
              `handler accepts ${m} but spec doesn't document it: ${h.apiPath}`
            );
          }
        }
      }
    }
    expect(
      drifts,
      `${drifts.length} method drift(s):\n  ${drifts.join('\n  ')}`
    ).toEqual([]);
  });

  it('handler auth wrapper matches openapi security scheme', () => {
    const drifts: string[] = [];
    for (const h of HANDLERS) {
      if (h.methods.length === 0) continue;
      const specForPath = SPEC_OPS.filter((o) =>
        pathTemplateEquivalent(o.apiPath, h.apiPath)
      );
      if (specForPath.length === 0) continue;
      const expected = authToSecurity(h.auth);
      for (const op of specForPath) {
        const specSchemes = new Set(op.security);
        const key = `${op.method} ${h.apiPath}`;
        if (ALLOWLIST_AUTH_MISMATCH.has(key)) continue;

        if (expected.size === 0) {
          if (specSchemes.size > 0) {
            drifts.push(
              `${key}: handler is public but spec requires ${[...specSchemes].join(',')}`
            );
          }
          continue;
        }
        // Spec must include at least one of the expected schemes.
        const overlap = [...expected].some((s) => specSchemes.has(s));
        if (!overlap) {
          drifts.push(
            `${key}: handler auth=${h.auth} (expected ${[...expected].join('|')}) but spec security=${[...specSchemes].join(',') || '(none)'}`
          );
        }
      }
    }
    expect(
      drifts,
      `${drifts.length} auth drift(s):\n  ${drifts.join('\n  ')}`
    ).toEqual([]);
  });
});

describe('OpenAPI ↔ bot client (cross-repo)', () => {
  it('the bot client root is reachable', () => {
    expect(
      fs.existsSync(BOT_CLIENT_ROOT),
      `BOT_CLIENT_ROOT not found: ${BOT_CLIENT_ROOT}\n` +
        `Set BOT_CLIENT_ROOT env var to override, or check the sibling repo path.`
    ).toBe(true);
  });

  it('every bot client call resolves to an openapi /api/bot/v1/* operation', () => {
    if (BOT_CALLS.length === 0) return; // no bot to check against
    const missing: string[] = [];
    for (const call of BOT_CALLS) {
      const key = `${call.method} ${call.normalized}`;
      if (ALLOWLIST_BOT_CALL_WITHOUT_SPEC.has(key)) continue;
      const match = findSpecMatch(SPEC_OPS, call.normalized, call.method);
      if (!match) missing.push(`${key}  (${path.basename(call.file)})`);
    }
    const unique = [...new Set(missing)].sort();
    expect(
      unique,
      `${unique.length} bot call(s) not documented in openapi.yaml:\n  ${unique.join('\n  ')}`
    ).toEqual([]);
  });
});
