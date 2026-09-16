// tests/unit/scoutingPageTeamScope.test.ts
//
// Le dossier d'adversaire (`pages/player/scouting/[teamId].tsx`) doit poser la
// portée équipe (`?teamId=` via `withTeam`) sur son appel à /api/player/scouting.
//
// POURQUOI. La route calcule le dossier du point de vue de NOTRE équipe
// (confrontations directes, adversaires communs, refus de se scouter soi-même)
// et lit `?teamId=` pour savoir laquelle. La page ne l'envoyait pas : pour une
// manageuse de plusieurs équipes, le serveur devinait, et le dossier était
// celui d'une autre équipe que celle du sélecteur — sans aucune erreur visible.
//
// Garde de SOURCE (les suites unitaires tournent sans DOM) : tout appel à
// /api/player/scouting dans la page passe par `withTeam(`, obtenu du contexte.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const PAGE = path.resolve(
  __dirname,
  '..',
  '..',
  'pages',
  'player',
  'scouting',
  '[teamId].tsx'
);

describe('page dossier d’adversaire — portée équipe', () => {
  const src = fs.readFileSync(PAGE, 'utf8').replace(/\r\n/g, '\n');

  it('lit `withTeam` depuis ActiveTeamContext', () => {
    expect(src).toMatch(
      /import \{ useActiveTeam \} from '@\/components\/player\/ActiveTeamContext';/
    );
    expect(src).toMatch(/const \{ withTeam \} = useActiveTeam\(\);/);
  });

  it('chaque appel à /api/player/scouting est enveloppé par withTeam', () => {
    const calls = [...src.matchAll(/`\/api\/player\/scouting[^`]*`/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const before = src.slice(
        Math.max(0, call.index - 'withTeam('.length),
        call.index
      );
      expect(before, call[0]).toBe('withTeam(');
    }
  });
});
