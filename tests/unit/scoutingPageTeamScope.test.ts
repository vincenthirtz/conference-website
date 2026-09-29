// tests/unit/scoutingPageTeamScope.test.ts
//
// Le dossier d'adversaire (`pages/player/scouting/[teamId].tsx`) doit poser la
// portée équipe (`?teamId=`) sur son appel à /api/player/scouting.
//
// POURQUOI. La route calcule le dossier du point de vue de NOTRE équipe
// (confrontations directes, adversaires communs, refus de se scouter soi-même)
// et lit `?teamId=` pour savoir laquelle. La page ne l'envoyait pas : pour une
// manageuse de plusieurs équipes, le serveur devinait, et le dossier était
// celui d'une autre équipe que celle du sélecteur — sans aucune erreur visible.
//
// Depuis le lot P15, l'appel vit dans le client du module réseau
// (`networkClient.scouting`) et la page n'écrit plus d'URL. Même garantie,
// vérifiée en deux temps :
//   1. comportement : l'URL produite porte `?teamId=` de l'équipe active et
//      jamais `?as=` (route `self`) ;
//   2. source : aucune URL /api/player/scouting écrite à la main hors du
//      client, et le hook passe la portée courante (`usePlayerScope()`, qui
//      lit l'équipe active d'ActiveTeamContext).

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const request = vi.fn(async (..._args: unknown[]) => ({}));
vi.mock('@/utils/http/authedRequest', async (orig) => ({
  ...(await orig<typeof import('@/utils/http/authedRequest')>()),
  authedRequest: (...args: unknown[]) => request(...args),
}));

import { networkClient } from '../../features/player/network/client';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel: string) =>
  fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

describe('dossier d’adversaire — portée équipe', () => {
  it('porte l’équipe active et jamais le sujet inspecté', async () => {
    await networkClient.scouting(
      { subjectId: 'staff-subject', actAs: true, teamId: 'team-b' },
      'target-1'
    );
    const url = String(request.mock.calls[0][0]);
    expect(url).toContain('/api/player/scouting?');
    expect(url).toContain('team=target-1');
    expect(url).toContain('teamId=team-b');
    expect(url).not.toMatch(/[?&]as=/);
    expect(url).not.toMatch(/[?&]act=/);
  });

  it('le hook passe la portée courante (équipe active) au client', () => {
    const src = read('features/player/network/hooks/useScouting.ts');
    expect(src).toMatch(/const scope = usePlayerScope\(\);/);
    expect(src).toMatch(/networkClient\.scouting\(scope,/);
  });

  it('la page et l’écran n’écrivent aucune URL /api/player/scouting', () => {
    for (const rel of [
      'pages/player/scouting/[teamId].tsx',
      'features/player/network/ui/scouting/ScoutingScreen.tsx',
      'features/player/network/ui/scouting/ScoutingSections.tsx',
    ]) {
      expect(read(rel), rel).not.toMatch(/\/api\/player\/scouting/);
    }
    expect(
      read('features/player/network/ui/scouting/ScoutingScreen.tsx')
    ).toMatch(/useScoutingReport\(/);
  });
});
