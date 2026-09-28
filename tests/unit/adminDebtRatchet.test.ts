// Cliquet de dette de l'espace admin — lot L1
// (docs/PLAN-industrialisation-admin.md).
//
// Chaque indicateur de `scripts/admin-metrics.ts` est gelé dans
// `__fixtures__/admin-debt-baseline.json`. Deux règles :
//
//   * un compteur qui MONTE échoue : on n'ajoute plus de route sans
//     `defineAdminRoute`, de `select('*')`, de `req.body as`, etc. ;
//   * un compteur qui BAISSE échoue aussi, avec la commande pour regeler.
//     Sans ça, la marge gagnée par une migration serait reconsommée en
//     silence par le correctif suivant.
//
// Regeler : `npm run admin:metrics -- --write`, et relire le diff du JSON.

import { describe, it, expect } from 'vitest';
import {
  collectAdminMetrics,
  readBaseline,
} from '../../scripts/admin-metrics.ts';

const REGEL = 'npm run admin:metrics -- --write';

describe('cliquet de dette admin', () => {
  const { debt } = collectAdminMetrics();
  const baseline: Record<string, number> = readBaseline().debt;

  it('chaque indicateur mesuré a un gel (et inversement)', () => {
    expect(Object.keys(debt).sort()).toEqual(Object.keys(baseline).sort());
  });

  for (const key of Object.keys(baseline)) {
    it(`${key} ne dépasse pas son gel`, () => {
      const now = debt[key];
      const frozen = baseline[key];
      expect(
        now,
        `${key} est monté de ${frozen} à ${now} : nouvelle dette admin. Passe par le socle (defineAdminRoute, schémas zod, colonnes explicites…) plutôt que de relever le gel.`
      ).toBeLessThanOrEqual(frozen);
      expect(
        now,
        `${key} est descendu de ${frozen} à ${now} — bravo. Regèle pour verrouiller le gain : ${REGEL}`
      ).toBe(frozen);
    });
  }
});
