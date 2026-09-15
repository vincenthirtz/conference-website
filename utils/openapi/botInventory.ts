// utils/openapi/botInventory.ts
//
// Inventaire des routes bot (`pages/api/bot/v1/**`) lu dans les options
// `withBotRoute(handler, { … })` de chaque handler : méthodes, idempotence,
// clé et plafond de rate-limit, sous-limite par acteur, `crossTenant`,
// capacité de plan exigée.
//
// Ces faits étaient recopiés à la main dans docs/BOT_API_CONTRACT.md, en une
// vingtaine de tableaux. Le tableau récapitulatif est désormais GÉNÉRÉ entre
// deux balises (`npm run contract:bot-inventory`), et un test vérifie qu'il
// est à jour ET que les tableaux rédigés à la main ne contredisent pas le code.
//
// Lecture du SOURCE (pas d'import des handlers : ils chargent Supabase, qui
// exige un environnement). Une route dont une option attendue est illisible
// fait échouer l'extraction — jamais de ligne silencieusement incomplète.

import fs from 'node:fs';
import path from 'node:path';

export type BotRouteInfo = {
  /** Chemin relatif à pages/api/bot/v1, sans extension (`matches/[matchId]/report`). */
  route: string;
  methods: string[];
  idempotent: boolean;
  rateKey: string;
  rateMax: number;
  /** Fenêtre en ms (défaut de withBotRoute : 60 000). */
  rateWindowMs: number;
  perActorMax: number | null;
  crossTenant: boolean;
  capability: string | null;
};

export const BOT_ROUTES_DIR = path.join('pages', 'api', 'bot', 'v1');
export const INVENTORY_BEGIN = '<!-- BEGIN GENERATED: bot-inventory -->';
export const INVENTORY_END = '<!-- END GENERATED: bot-inventory -->';

/** Corps entre parenthèses de l'appel `withBotRoute(` exporté. */
function withBotRouteArgs(src: string, file: string): string {
  const exported = /export\s+default\s+withBotRoute\s*\(/.exec(src);
  const all = [...src.matchAll(/withBotRoute\s*\(/g)];
  const call = exported ?? all.at(-1);
  if (!call) throw new Error(`bot inventory: aucun withBotRoute( dans ${file}`);
  let i = call.index + call[0].length;
  const start = i;
  let depth = 1;
  let quote: string | null = null;
  while (depth > 0 && i < src.length) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === "'" || c === '"' || c === '`') {
      quote = c;
    } else if (c === '/' && src[i + 1] === '/') {
      i = src.indexOf('\n', i);
      if (i === -1) break;
    } else if (c === '/' && src[i + 1] === '*') {
      i = src.indexOf('*/', i) + 1;
    } else if ('({['.includes(c)) depth++;
    else if (')}]'.includes(c)) depth--;
    i++;
  }
  return src.slice(start, i - 1);
}

/** Retire commentaires (ligne et bloc) pour que les regex ne lisent que du code. */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
}

export function parseBotRouteOptions(
  src: string,
  file: string
): Omit<BotRouteInfo, 'route'> {
  const args = stripComments(withBotRouteArgs(src, file));
  const methods = /methods:\s*\[([^\]]*)\]/.exec(args);
  const rateLimit = /rateLimit:\s*\{([\s\S]*?)\}\s*,?\s*(?:[a-zA-Z]+:|$)/.exec(
    args
  );
  const key = /key:\s*['"]([^'"]+)['"]/.exec(args);
  const max = rateLimit ? /^\s*max:\s*([\d_]+)/m.exec(rateLimit[1]) : null;
  const perActor = /perActor:\s*\{[^}]*?max:\s*([\d_]+)/.exec(args);
  const windowMs = rateLimit
    ? /^\s*windowMs:\s*([\d_]+)/m.exec(rateLimit[1])
    : null;
  const capability = /requireCapability:\s*['"]([^'"]+)['"]/.exec(args);
  if (!methods || !key || !max) {
    throw new Error(
      `bot inventory: options illisibles dans ${file} (methods=${!!methods}, key=${!!key}, max=${!!max})`
    );
  }
  return {
    methods: [...methods[1].matchAll(/['"]([A-Z]+)['"]/g)].map((m) => m[1]),
    idempotent: /idempotent:\s*true/.test(args),
    rateKey: key[1],
    rateMax: Number(max[1].replace(/_/g, '')),
    rateWindowMs: windowMs ? Number(windowMs[1].replace(/_/g, '')) : 60_000,
    perActorMax: perActor ? Number(perActor[1].replace(/_/g, '')) : null,
    crossTenant: /crossTenant:\s*true/.test(args),
    capability: capability ? capability[1] : null,
  };
}

export function extractBotRoutes(root: string = process.cwd()): BotRouteInfo[] {
  const base = path.join(root, BOT_ROUTES_DIR);
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts'))
        files.push(p);
    }
  };
  walk(base);
  return files
    .map((file) => ({
      route: path.relative(base, file).replace(/\\/g, '/').replace(/\.ts$/, ''),
      ...parseBotRouteOptions(fs.readFileSync(file, 'utf8'), file),
    }))
    .sort((a, b) => a.route.localeCompare(b.route));
}

export function renderBotInventory(routes: BotRouteInfo[]): string {
  const rows = routes.map((r) => {
    const flags = [
      r.crossTenant ? '`crossTenant`' : '',
      r.capability ? `plan \`${r.capability}\`` : '',
    ]
      .filter(Boolean)
      .join(', ');
    const per =
      r.rateWindowMs === 60_000
        ? 'min'
        : `${Math.round(r.rateWindowMs / 1000)} s`;
    const rate = `${r.rateMax}/${per}${r.perActorMax ? ` (+${r.perActorMax}/acteur)` : ''}`;
    return `| [\`${r.route}.ts\`](../pages/api/bot/v1/${r.route}.ts) | ${r.methods.join(', ')} | ${r.idempotent ? 'oui' : '—'} | \`${r.rateKey}\` | ${rate} | ${flags || '—'} |`;
  });
  return [
    `_Tableau généré depuis les options \`withBotRoute\` des handlers — ne pas éditer à la main : \`npm run contract:bot-inventory\`. ${routes.length} routes._`,
    '',
    '| Route | Méthodes | Idem. | Rate-key | Plafond | Portée / plan |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

/** Remplace le bloc généré ; lève si les balises manquent. */
export function replaceInventoryBlock(markdown: string, table: string): string {
  const begin = markdown.indexOf(INVENTORY_BEGIN);
  const end = markdown.indexOf(INVENTORY_END);
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error(
      'bot inventory: balises BEGIN/END GENERATED absentes du contrat'
    );
  }
  return `${markdown.slice(0, begin + INVENTORY_BEGIN.length)}\n${table}\n${markdown.slice(end)}`;
}
