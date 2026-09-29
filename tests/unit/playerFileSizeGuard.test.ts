// Plafond de taille de l'espace joueuse — lot P2
// (docs/PLAN-industrialisation-joueur.md, docs/adr/0002-player-feature-modules.md).
//
// Même règle que `adminFileSizeGuard.test.ts` : on arrête l'hémorragie sans
// imposer de refonte.
//
//   * les fichiers déjà trop gros sont gelés à leur taille du jour — ils ne
//     doivent que RÉTRÉCIR (un lot qui en touche un en extrait un panneau) ;
//   * tout fichier NOUVEAU au-delà du plafond de sa zone échoue.
//
// Plafonds par zone (§ 1 du plan) : pages 800, composants 600, routes 500.
// Le périmètre est celui du cliquet (`scripts/player-metrics.ts`) plus
// `features/player` ; le site public en est exclu.
//
// Compte = `split('\n').length`, soit `wc -l + 1`, comme le garde admin.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  API,
  COMPONENTS,
  PAGES,
  SHARED,
  walk,
} from '../../scripts/player-metrics.ts';

const ZONES: { roots: string[]; max: number }[] = [
  { roots: PAGES, max: 800 },
  { roots: [...COMPONENTS, ...SHARED, 'features/player'], max: 600 },
  { roots: API, max: 500 },
];

/**
 * Fichiers au-dessus de leur plafond au 2026-09-29, avec leur taille du jour.
 * Un fichier listé ici passe TANT QU'IL NE GROSSIT PAS. Quand il rétrécit,
 * baisse le chiffre : un gel qui ne descend jamais finit par ne plus rien
 * geler.
 */
const BASELINE: Record<string, number> = {
  // Pages (> 800)
  'pages/team/create.tsx': 1984,
  'pages/player/tcg.tsx': 1796,
  'pages/player/tcg/echanges.tsx': 1257,
  'pages/team/[slug]/edit.tsx': 1126,
  'pages/player/profile.tsx': 1075,
  'pages/player/messages.tsx': 899,
  // Composants (> 600)
  'components/player/screens/PlayerManageTeamScreen.tsx': 2222,
  'components/player/screens/PlayerDashboardScreen.tsx': 1224,
  'components/player/screens/PlayerMatchScreen.tsx': 673,
  // Routes (> 500)
  'pages/api/teams/create-with-member.ts': 1387,
  'pages/api/player/tcg/packs.ts': 778,
  'pages/api/player/dashboard.ts': 707,
  'pages/api/player/matches/[matchId]/report-score.ts': 544,
  'pages/api/player/tcg/collection.ts': 539,
  'pages/api/player/teams-directory.ts': 537,
  'pages/api/demandes/register-team.ts': 517,
};

const countLines = (file: string) =>
  fs.readFileSync(file, 'utf8').split('\n').length;

describe('taille des fichiers de l’espace joueuse', () => {
  const files = ZONES.flatMap(({ roots, max }) =>
    roots.flatMap((r) => walk(r)).map((file) => ({ file, max }))
  );

  it('le périmètre est lu (sinon ce test ne vérifierait rien)', () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it('aucun NOUVEAU fichier au-delà du plafond de sa zone', () => {
    const offenders = files
      .filter(({ file, max }) => !(file in BASELINE) && countLines(file) > max)
      .map(({ file, max }) => `${file} (${countLines(file)} > ${max})`);
    expect(
      offenders,
      `Fichiers joueuse hors gel au-delà du plafond :\n  ${offenders.join(
        '\n  '
      )}\n\nExtrais un panneau / un service, ou ajoute-le au gel en expliquant pourquoi.`
    ).toEqual([]);
  });

  it('les fichiers gelés ne grossissent pas', () => {
    const grown: string[] = [];
    for (const [file, frozen] of Object.entries(BASELINE)) {
      if (!fs.existsSync(file)) continue; // supprimé ou renommé : tant mieux
      const now = countLines(file);
      if (now > frozen) grown.push(`${file}: ${frozen} → ${now}`);
    }
    expect(
      grown,
      `Fichiers joueuse qui ont grossi :\n  ${grown.join('\n  ')}`
    ).toEqual([]);
  });
});
