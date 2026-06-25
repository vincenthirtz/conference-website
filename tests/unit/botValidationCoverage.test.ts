// tests/unit/botValidationCoverage.test.ts
//
// Garde-fou statique : empêche un FUTUR write route Discord-bot d'expédier
// sans validation d'entrée.
//
// Contexte : ~33 routes /api/bot/v1/* en écriture (POST/PATCH/PUT/DELETE) ont
// été migrées vers la validation zod co-localisée passée à
// `withBotRoute(handler, { bodySchema|querySchema })`. Ce test scanne tous les
// handlers, détecte ceux qui acceptent une méthode d'écriture, et exige que
// chacun référence `bodySchema` OU `querySchema` — c.-à-d. qu'il engage la
// couche de validation du middleware.
//
// Style : scan statique par regex sur le source (cf.
// tests/unit/openapiContractDrift.test.ts), pas d'exécution des handlers. On
// lit tout le fichier — un `bodySchema`/`querySchema` présent N'IMPORTE OÙ
// dans le fichier suffit (ils sont co-localisés au-dessus du handler), ce qui
// reste robuste aux blocs d'options `withBotRoute` multi-lignes.
//
// ALLOWLIST : routes qui valident inline plutôt que via l'option. Toute autre
// route d'écriture sans schéma fait ÉCHOUER le test avec la liste des
// coupables.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BOT_API_ROOT = path.join(REPO_ROOT, 'pages', 'api', 'bot', 'v1');

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Routes qui valident leur entrée INLINE (pas via bodySchema/querySchema) et
 * sont donc volontairement exemptées de la garde. Chemin POSIX relatif au
 * repo. Chaque entrée doit porter une raison d'une ligne.
 */
const INLINE_VALIDATION_ALLOWLIST = new Map<string, string>([
  [
    'pages/api/bot/v1/tenants/link-guild.ts',
    // Renvoie des codes d'erreur champ-spécifiques (INVALID_GUILD_ID /
    // INVALID_OWNER_ID) que le schéma générique INVALID_BODY n'exprime pas.
    'inline: returns field-specific error codes INVALID_GUILD_ID/INVALID_OWNER_ID',
  ],
  [
    'pages/api/bot/v1/tenants/request-onboard.ts',
    // Fait son propre safeParse zod et renvoie une forme INVALID_BODY maison
    // (flow onboarding, contrat de réponse spécifique).
    'inline: own safeParse with bespoke INVALID_BODY response shape',
  ],
  [
    'pages/api/bot/v1/moderation/blacklist.ts',
    // Handler unique GET/POST/DELETE avec un schéma zod distinct par méthode
    // (addSchema vs removeSchema, GET sans body) — pas exprimable par un seul
    // bodySchema sur withBotRoute. Chaque write fait son propre safeParse.
    'inline: per-method zod schemas (addSchema/removeSchema), single GET/POST/DELETE handler',
  ],
]);

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

function toRepoRelPosix(file: string): string {
  return path.relative(REPO_ROOT, file).split(path.sep).join('/');
}

/** Méthodes déclarées dans `withBotRoute(_, { methods: [...] })`. */
function detectBotMethods(src: string): string[] {
  const found = new Set<string>();
  const mm = src.match(/methods\s*:\s*\[([^\]]+)\]/);
  if (mm) {
    for (const m of mm[1].matchAll(/['"](GET|POST|PUT|PATCH|DELETE)['"]/g)) {
      found.add(m[1]);
    }
  }
  return [...found];
}

type BotWriteRoute = {
  rel: string;
  methods: string[];
  hasSchema: boolean;
};

function listBotWriteRoutes(): BotWriteRoute[] {
  const files = walkTs(BOT_API_ROOT);
  const out: BotWriteRoute[] = [];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    if (!/\bwithBotRoute\s*\(/.test(src)) continue; // helper / non-route file
    const methods = detectBotMethods(src);
    const isWrite = methods.some((m) => WRITE_METHODS.has(m));
    if (!isWrite) continue;
    // bodySchema/querySchema référencé n'importe où dans le fichier (schémas
    // co-localisés) → robuste aux options multi-lignes.
    const hasSchema = /\bbodySchema\b/.test(src) || /\bquerySchema\b/.test(src);
    out.push({ rel: toRepoRelPosix(file), methods, hasSchema });
  }
  return out;
}

const WRITE_ROUTES = listBotWriteRoutes();

describe('bot write routes engage the validation framework', () => {
  it('found a non-trivial set of bot write routes (scanner sanity check)', () => {
    // Garde contre un scanner cassé (chemin déplacé, glob vide…) qui rendrait
    // le test vert sans rien vérifier.
    expect(WRITE_ROUTES.length).toBeGreaterThan(20);
  });

  it('every bot write route declares bodySchema/querySchema or is allowlisted', () => {
    const offenders: string[] = [];
    for (const r of WRITE_ROUTES) {
      if (r.hasSchema) continue;
      if (INLINE_VALIDATION_ALLOWLIST.has(r.rel)) continue;
      offenders.push(`${r.rel} [${r.methods.join(',')}]`);
    }
    expect(
      offenders,
      `${offenders.length} bot write route(s) ship with NO schema option ` +
        `and NO allowlist entry — they bypass the validation framework.\n` +
        `Add a bodySchema/querySchema to withBotRoute (preferred), or, if the ` +
        `route validates inline, add it to INLINE_VALIDATION_ALLOWLIST with a ` +
        `one-line reason:\n  ${offenders.join('\n  ')}`
    ).toEqual([]);
  });

  it('allowlist has no stale entries (each one still exists and still lacks a schema)', () => {
    const stale: string[] = [];
    const byRel = new Map(WRITE_ROUTES.map((r) => [r.rel, r]));
    for (const [rel] of INLINE_VALIDATION_ALLOWLIST) {
      const route = byRel.get(rel);
      if (!route) {
        stale.push(
          `${rel} — no longer a bot write route (remove from allowlist)`
        );
      } else if (route.hasSchema) {
        stale.push(
          `${rel} — now declares a schema option (remove from allowlist)`
        );
      }
    }
    expect(
      stale,
      `${stale.length} stale allowlist entr(y/ies):\n  ${stale.join('\n  ')}`
    ).toEqual([]);
  });
});
