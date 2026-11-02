// tests/unit/dbDirectReadsGuard.test.ts
//
// Le site et la base (lot 1d de docs/D1-MIGRATION.md) : ses sources PROPRES ne font que lire la
// base, sans appel de fonction SQL ni code d'erreur de la base (ceux-là passent par les portes
// de l'API, utils/db/rpc.ts et utils/db/errors.ts, recopiées ici). Et chaque lecture directe est
// comptée par fichier : le jour du moteur suivant, ce sont celles-là qu'il faudra porter, donc
// une nouvelle ne passe pas sans qu'on le sache. Regeler : `npm run db:reads -- --write`.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BASELINE, siteDbReads } from '../../scripts/db-direct-reads.mjs';

const REGEL = 'npm run db:reads -- --write';
const { reads, writes, rpc, errorCodes } = siteDbReads(process.cwd());
const frozen = JSON.parse(readFileSync(BASELINE, 'utf8')) as {
  total: number;
  reads: Record<string, number>;
};

describe('le site et la base', () => {
  it('aucune écriture dans la base depuis le site : elles passent par l’API', () => {
    expect(writes).toEqual([]);
  });

  it('aucun appel de fonction SQL ni code d’erreur de la base hors des portes de l’API', () => {
    expect(rpc).toEqual([]);
    expect(errorCodes).toEqual([]);
  });

  it('les lectures directes, fichier par fichier, sont celles du gel', () => {
    const files = new Set([
      ...Object.keys(reads),
      ...Object.keys(frozen.reads),
    ]);
    for (const file of files) {
      const now = reads[file] ?? 0;
      const was = frozen.reads[file] ?? 0;
      expect(
        now,
        now > was
          ? `${file} : ${now} lecture(s) directe(s) de la base au lieu de ${was}. Lire par l’API, ou, si c’est voulu, ${REGEL} et le dire dans le commit (docs/D1-MIGRATION.md).`
          : `${file} : ${now} lecture(s) directe(s) au lieu de ${was} — bravo. ${REGEL}`
      ).toBe(was);
    }
  });
});
