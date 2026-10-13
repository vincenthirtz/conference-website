// Cliquet des tests mis de côté à la bascule 4e (tests/pending-4e/README.md).
//
// Un `.pending` est un bloc route → UI qui attend d'être réécrit contre une
// fixture de réponse. Le stock ne peut que baisser : un fichier réécrit doit
// sortir de FROZEN, un nouveau `.pending` est refusé.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(__dirname, '../pending-4e');

/** Fichier → nombre de blocs de premier niveau (`describe(`/`it(` en colonne 0). */
// 2026-10-13 soir : 22 fichiers / 38 blocs à la bascule, 7 / 9 après le
// second tri (les blocs purement route ou purement UI ont rejoint leur dépôt).
const FROZEN: Record<string, number> = {
  'circuitPartners.test.ts.pending': 1,
  'overlayAlertFrame.test.ts.pending': 1,
  'playerDashboardNavigation.test.ts.pending': 1,
  'playerSecurityP0.test.ts.pending': 2,
  'staffPlanningView.test.ts.pending': 1,
  'teamLogoCredit.test.ts.pending': 1,
  'teamNamesBatch.test.ts.pending': 2,
};

const countBlocks = (src: string) =>
  (src.match(/^(describe|it|test)(\.\w+)?\(/gm) ?? []).length;

describe('tests en attente de réécriture (4e)', () => {
  const now: Record<string, number> = {};
  for (const name of fs.readdirSync(DIR)) {
    if (!name.endsWith('.pending')) continue;
    now[name] = countBlocks(fs.readFileSync(path.join(DIR, name), 'utf8'));
  }

  it('aucun nouveau fichier en attente', () => {
    const extra = Object.keys(now).filter((n) => !(n in FROZEN));
    expect(
      extra,
      'Un test route → UI nouveau se réécrit directement contre une fixture : pas de nouveau .pending.'
    ).toEqual([]);
  });

  it('chaque fichier gelé existe encore ou a été retiré du gel', () => {
    const gone = Object.keys(FROZEN).filter((n) => !(n in now));
    expect(gone, 'Fichier réécrit : retire-le de FROZEN.').toEqual([]);
  });

  it('le nombre de blocs ne monte pas', () => {
    const grew = Object.entries(now).filter(([n, c]) => c > (FROZEN[n] ?? 0));
    expect(grew).toEqual([]);
    const shrank = Object.entries(now).filter(([n, c]) => c < (FROZEN[n] ?? 0));
    expect(shrank, 'Bloc réécrit — bravo. Baisse FROZEN.').toEqual([]);
  });
});
