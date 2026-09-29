// Cliquet de dette de l'espace joueuse — lot P1
// (docs/PLAN-industrialisation-joueur.md). Même mécanique que
// `adminDebtRatchet.test.ts`.
//
// Chaque indicateur de `scripts/player-metrics.ts` est gelé dans
// `__fixtures__/player-debt-baseline.json`. Deux règles :
//
//   * un compteur qui MONTE échoue : on n'ajoute plus de route sans
//     `defineSubjectRoute`, de `select('*')`, de `useAdminFetch`, etc. ;
//   * un compteur qui BAISSE échoue aussi, avec la commande pour regeler.
//     Sans ça, la marge gagnée par une migration serait reconsommée en
//     silence par le correctif suivant.
//
// Regeler : `npm run player:metrics -- --write`, et relire le diff du JSON.

import { describe, it, expect } from 'vitest';
import {
  collectPlayerMetrics,
  readBaseline,
} from '../../scripts/player-metrics.ts';

const REGEL = 'npm run player:metrics -- --write';

describe('cliquet de dette joueuse', () => {
  const { debt } = collectPlayerMetrics();
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
        `${key} est monté de ${frozen} à ${now} : nouvelle dette joueuse. Passe par le socle (defineSubjectRoute, schémas zod, colonnes explicites, playerHttp, kit Le Ruban…) plutôt que de relever le gel.`
      ).toBeLessThanOrEqual(frozen);
      expect(
        now,
        `${key} est descendu de ${frozen} à ${now} — bravo. Baisse la baseline à ${now} : ${REGEL}`
      ).toBe(frozen);
    });
  }
});
