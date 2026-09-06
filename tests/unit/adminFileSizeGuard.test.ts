// Plafond de taille des écrans admin — lot A7 (docs/PLAN-espace-admin.md).
//
// Huit fichiers dépassent 1 400 lignes, dont un à 3 879. Ce n'est pas de
// l'esthétique : c'est le coût de chaque correctif fait dans l'urgence, un soir
// de journée, dans un fichier qu'on ne peut pas lire d'un bloc.
//
// Le lot A7 est une RÈGLE, pas un chantier : « tout lot qui touche un de ces
// fichiers en extrait au moins un panneau ». Ce test en est le garde-fou, et il
// est construit pour ne PAS bloquer le travail en cours :
//
//   * les fichiers déjà trop gros sont gelés à leur taille du jour — ils ne
//     doivent que RÉTRÉCIR ;
//   * tout fichier NOUVEAU au-delà du plafond échoue.
//
// Autrement dit : on arrête l'hémorragie sans imposer une refonte à personne.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MAX_LINES = 800;
const ROOTS = ['pages/admin', 'components/admin'];

/**
 * Fichiers déjà au-dessus du plafond au 2026-09-01, avec leur taille du jour.
 * Un fichier listé ici passe TANT QU'IL NE GROSSIT PAS. Faire baisser un
 * chiffre est un progrès ; le monter fait échouer le test.
 */
const BASELINE: Record<string, number> = {
  'pages/admin/tournament-simulator.tsx': 3880,
  'pages/admin/tasks/index.tsx': 3292,
  'pages/admin/users/manage.tsx': 2451,
  // 2281 écrites : le flux de l'auto-scheduler est parti dans
  // `hooks/useAutoSchedule.tsx` (lot 6), et le plafond suit — un gel qui ne
  // descend jamais finit par ne plus rien geler.
  'pages/admin/tournament/[id]/matches.tsx': 2281,
  'components/admin/communications/CampaignsPanel.tsx': 2283,
  'pages/admin/teams/my.tsx': 1754,
  'pages/admin/demandes/index.tsx': 1664,
  'pages/admin/tournament/[id]/dashboard.tsx': 1627,
  'pages/admin/teams/[teamId]/edit.tsx': 1550,
  'pages/admin/matches/[matchId]/edit.tsx': 1453,
  'pages/admin/teams/index.tsx': 1446,
  'pages/admin/events/[runId]/director.tsx': 1289,
  'components/admin/moderation/SupportPanel.tsx': 1210,
  'components/admin/broadcast/TwitchCommandsPanel.tsx': 1203,
  'pages/admin/regie.tsx': 1185,
  'pages/admin/users/[userId]/player-view.tsx': 1103,
  'pages/admin/tournament/[id]/edit.tsx': 991,
  'pages/admin/stages/[stageId]/seeding.tsx': 970,
  'pages/admin/tenants/[id]/discord-config/[guildId].tsx': 967,
  'pages/admin/stages/[stageId].tsx': 950,
  'pages/admin/users/new.tsx': 930,
  'pages/admin/demandes/[id].tsx': 921,
  // 764 écrites : la fiche a rendu ses secrets bot à un panneau (T8), et le
  // plafond suit — un gel qui ne descend jamais finit par ne plus rien geler.
  'pages/admin/tenants/[id].tsx': 800,
  'components/admin/profile/ProfileModal.tsx': 914,
  'components/admin/navigation/adminNav.ts': 969,
  'pages/admin/stages/[stageId]/groups.tsx': 856,
  'pages/admin/broadcast/live.tsx': 837,
  'pages/admin/leagues/[id].tsx': 825,
  'pages/admin/scrims/plannings/[planningId].tsx': 825,
  'pages/admin/tournament/[id]/maps.tsx': 816,
};

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

function countLines(file: string): number {
  return fs.readFileSync(file, 'utf8').split('\n').length;
}

describe('taille des écrans admin', () => {
  const files = ROOTS.flatMap((root) =>
    walk(path.join(process.cwd(), root))
  ).map((f) => path.relative(process.cwd(), f));

  it('aucun NOUVEAU fichier au-delà du plafond', () => {
    const offenders = files.filter(
      (f) => !(f in BASELINE) && countLines(f) > MAX_LINES
    );
    expect(
      offenders,
      `Fichiers admin > ${MAX_LINES} lignes hors gel :\n  ${offenders
        .map((f) => `${f} (${countLines(f)})`)
        .join(
          '\n  '
        )}\n\nExtrais un panneau, ou ajoute-le au gel en expliquant pourquoi.`
    ).toEqual([]);
  });

  it('les god-components gelés ne grossissent pas', () => {
    const grown: string[] = [];
    for (const [file, frozen] of Object.entries(BASELINE)) {
      if (!fs.existsSync(file)) continue; // supprimé ou renommé : tant mieux
      const now = countLines(file);
      if (now > frozen) grown.push(`${file}: ${frozen} → ${now}`);
    }
    expect(
      grown,
      `God-components qui ont grossi :\n  ${grown.join('\n  ')}`
    ).toEqual([]);
  });
});
