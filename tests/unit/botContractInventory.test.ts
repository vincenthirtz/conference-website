// docs/BOT_API_CONTRACT.md ↔ options `withBotRoute` des handlers.
//
// Le tableau récapitulatif du contrat est GÉNÉRÉ (cf.
// utils/openapi/botInventory.ts) ; ce test le garde à jour, et vérifie que les
// tableaux rédigés à la main par domaine ne contredisent pas le code sur les
// méthodes, l'idempotence et la clé de rate-limit.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractBotRoutes,
  INVENTORY_BEGIN,
  INVENTORY_END,
  parseBotRouteOptions,
  renderBotInventory,
  replaceInventoryBlock,
} from '../../utils/openapi/botInventory';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CONTRACT = fs.readFileSync(
  path.join(REPO_ROOT, 'docs', 'BOT_API_CONTRACT.md'),
  'utf8'
);
const ROUTES = extractBotRoutes(REPO_ROOT);

describe('parseBotRouteOptions', () => {
  it('lit les options, en ignorant les commentaires', () => {
    const src = `
      // withBotRoute(handler, { methods: ['DELETE'] }) — ancien appel en commentaire
      export default withBotRoute(handler, {
        methods: ['GET', 'POST'],
        rateLimit: {
          max: 1_200,
          windowMs: 10_000,
          key: 'bot-x', // clé du bucket
          perActor: { max: 5, windowMs: 60_000, actorField: 'discordUserId' },
        },
        /* idempotent: false */
        idempotent: true,
        requireCapability: 'arbitration',
      });`;
    expect(parseBotRouteOptions(src, 'x.ts')).toEqual({
      methods: ['GET', 'POST'],
      idempotent: true,
      rateKey: 'bot-x',
      rateMax: 1200,
      rateWindowMs: 10_000,
      perActorMax: 5,
      crossTenant: false,
      capability: 'arbitration',
    });
  });

  it('échoue plutôt que de produire une ligne incomplète', () => {
    const src = `export default withBotRoute(handler, { methods: METHODS, rateLimit: RL });`;
    expect(() => parseBotRouteOptions(src, 'y.ts')).toThrow(/illisibles/);
  });
});

describe('BOT_API_CONTRACT.md — inventaire', () => {
  it('chaque handler bot est lisible', () => {
    const files = ROUTES.length;
    expect(files).toBeGreaterThan(80);
  });

  it('le tableau généré est à jour (npm run contract:bot-inventory)', () => {
    expect(CONTRACT).toContain(INVENTORY_BEGIN);
    expect(CONTRACT).toContain(INVENTORY_END);
    const expected = replaceInventoryBlock(
      CONTRACT,
      renderBotInventory(ROUTES)
    );
    expect(
      CONTRACT === expected,
      'inventaire bot périmé : lancer `npm run contract:bot-inventory`'
    ).toBe(true);
  });

  it('les tableaux rédigés à la main ne contredisent pas le code', () => {
    const byRoute = new Map(ROUTES.map((r) => [r.route, r]));
    const generated = CONTRACT.slice(
      CONTRACT.indexOf(INVENTORY_BEGIN),
      CONTRACT.indexOf(INVENTORY_END)
    );
    const issues: string[] = [];
    let header: string[] | null = null;
    for (const line of CONTRACT.replace(generated, '').split('\n')) {
      if (!line.startsWith('|')) {
        header = null;
        continue;
      }
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      if (!header) {
        header = cells.map((c) => c.toLowerCase());
        continue;
      }
      if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
      const iRoute = header.indexOf('route');
      const iMethods = header.indexOf('methods');
      const iIdem = header.indexOf('idem.');
      const iKey = header.indexOf('rate-key');
      if (iRoute < 0 || iMethods < 0 || iKey < 0) continue;

      const m = /pages\/api\/bot\/v1\/([^)]+)\.ts\)/.exec(cells[iRoute]);
      if (!m) {
        issues.push(`route illisible : ${cells[iRoute]}`);
        continue;
      }
      const r = byRoute.get(m[1]);
      if (!r) {
        issues.push(`${m[1]} : aucun handler`);
        continue;
      }
      const docMethods = cells[iMethods]
        .split(/[/,\s]+/)
        .filter(Boolean)
        .sort();
      if (docMethods.join(',') !== [...r.methods].sort().join(',')) {
        issues.push(
          `${m[1]} : méthodes doc=${cells[iMethods]} code=${r.methods.join(', ')}`
        );
      }
      const docKey = cells[iKey].replace(/`/g, '');
      if (docKey !== r.rateKey) {
        issues.push(`${m[1]} : rate-key doc=${docKey} code=${r.rateKey}`);
      }
      if (iIdem >= 0) {
        const docSaysNo = /^(—|-|no|non)$/i.test(cells[iIdem]);
        if (docSaysNo === r.idempotent) {
          issues.push(
            `${m[1]} : idempotence doc=${cells[iIdem]} code=${r.idempotent}`
          );
        }
      }
    }
    expect(issues).toEqual([]);
  });
});
