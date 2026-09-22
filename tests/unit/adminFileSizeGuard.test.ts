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
 *
 * UNE LIMITE DE CE COMPTEUR, découverte le 2026-09-21 et qu'il faut connaître
 * avant de lire les `+1` ci-dessous : sortir un type ou un helper d'un fichier
 * gelé y laisse une ligne d'`import`. Un compteur de lignes brut enregistre
 * donc une CROISSANCE pour une extraction — exactement le geste que la règle
 * A7 demande. `pages/admin/stages/[stageId].tsx` en est l'illustration : il
 * est monté à 969 en typant quatre lectures, puis redescendu à 953 en sortant
 * `StageOption` — soit +1 sur son gel, pour un fichier de 16 lignes plus
 * court qu'au pire moment.
 *
 * Les relèvements datés de ce jour sont tous de cet ordre : des déclarations
 * de type qui retirent un `any`, jamais de l'écran en plus.
 */
const BASELINE: Record<string, number> = {
  // 2026-09-15 : passage de Prettier au formateur Biome. Les coupures de ligne
  // diffèrent légèrement (±10 lignes par fichier, aucun code ajouté) : tous les
  // chiffres ci-dessous ont été recalés sur le rendu Biome, à la hausse comme
  // à la baisse. `tournaments/create.tsx` est entré à 801 par ce seul effet.
  'pages/admin/tournaments/create.tsx': 801,
  'pages/admin/tournament-simulator.tsx': 3204,
  'pages/admin/tasks/index.tsx': 3292,
  'pages/admin/users/manage.tsx': 2421,
  // 2281 écrites : le flux de l'auto-scheduler est parti dans
  // `hooks/useAutoSchedule.tsx` (lot 6), et le plafond suit — un gel qui ne
  // descend jamais finit par ne plus rien geler.
  'pages/admin/tournament/[id]/matches.tsx': 2253,
  'components/admin/communications/CampaignsPanel.tsx': 1164,
  // 2026-09-21, +2 : `payload: any` → `DemandePayload` (lot 6).
  'pages/admin/teams/my.tsx': 1752,
  // 2026-09-21, +1 : `payload: any | null` → `DemandePayload | null` (lot 6).
  'pages/admin/demandes/index.tsx': 1615,
  // 2026-09-22, +1 : `hasAtLeastRole` importé de `utils/staffRoles` et non plus
  // de `utils/staff`, qui embarquait le client Supabase serveur (lot 8).
  'pages/admin/tournament/[id]/dashboard.tsx': 1615,
  'pages/admin/teams/[teamId]/edit.tsx': 1503,
  'pages/admin/matches/[matchId]/edit.tsx': 1315,
  'pages/admin/teams/index.tsx': 1445,
  'pages/admin/events/[runId]/director.tsx': 1277,
  'components/admin/moderation/SupportPanel.tsx': 1167,
  'components/admin/broadcast/TwitchCommandsPanel.tsx': 1203,
  'pages/admin/regie.tsx': 1038,
  'pages/admin/users/[userId]/player-view.tsx': 1092,
  // 860 écrites : le panneau « Visuels » (logo, bannière, règlement PDF, et
  // désormais la chaîne de diffusion par défaut) est parti dans
  // `components/admin/tournament/TournamentVisualsSection.tsx`, avec l'upload
  // du PDF — le seul endroit qui s'en servait. Le gel suit la baisse : un
  // plafond qui ne descend jamais finit par ne plus rien geler.
  'pages/admin/tournament/[id]/edit.tsx': 859,
  // 2026-09-21, +4 : `{} as any` → un `Partial` nommé (lot 6). Le cast cachait
  // que les deux camps se remplissent l'un après l'autre, donc que l'un des
  // deux manque forcément à mi-parcours.
  'pages/admin/stages/[stageId]/seeding.tsx': 968,
  // 692 écrites : la liste des champs et le type de la config sont partis dans
  // `utils/discord/discordConfigFields.ts` — non pour gagner des lignes, mais
  // pour que le test de whitelist puisse les confronter au handler PUT sans
  // charger un écran React.
  // 693 : +1 ligne pour le salon des équipes qui recrutent
  // (team_openings_channel_id). Un salon de plus coûte une ligne dans l'objet
  // de repli de la page — la LISTE des champs, elle, vit déjà dans
  // `utils/discord/discordConfigFields.ts`. Le prochain qui ajoute un salon
  // paiera pareil : c'est le prix admis, pas une dérive.
  'pages/admin/tenants/[id]/discord-config/[guildId].tsx': 692,
  // 2026-09-21 : de 952 à 969 en typant quatre lectures, puis RAMENÉ à 953 en
  // sortant `StageOption` dans `utils/stages/stageOption.ts` (règle A7).
  'pages/admin/stages/[stageId].tsx': 953,
  'pages/admin/users/new.tsx': 903,
  'pages/admin/demandes/[id].tsx': 923,
  // 764 écrites : la fiche a rendu ses secrets bot à un panneau (T8), et le
  // plafond suit — un gel qui ne descend jamais finit par ne plus rien geler.
  'pages/admin/tenants/[id].tsx': 794,
  'components/admin/profile/ProfileModal.tsx': 914,
  'components/admin/navigation/adminNav.ts': 881,
  'pages/admin/stages/[stageId]/groups.tsx': 858,
  'pages/admin/broadcast/live.tsx': 837,
  'pages/admin/leagues/[id].tsx': 827,
  'pages/admin/scrims/plannings/[planningId].tsx': 813,
  // 576 écrites : le sélecteur de journée, la grille, le formulaire d'ajout et
  // la modale d'édition sont partis dans `components/admin/tournament/mapPool/`
  // (pool par journée), et le plafond suit. 546 : la portée (journée/date), les
  // libellés et les types de carte sont partis dans `mapPool/usePoolScope.ts`
  // (pool par date).
  'pages/admin/tournament/[id]/maps.tsx': 546,
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
  const files = ROOTS.flatMap(
    (root) => walk(path.join(process.cwd(), root))
    // Séparateurs POSIX : le gel est écrit avec des `/`. Sous Windows, les `\`
    // de path.relative faisaient échouer le garde sur TOUS les fichiers gelés —
    // un échec permanent, donc ignoré, qui a masqué un vrai dépassement
    // (SocialPostsPanel, 2026-09-11).
  ).map((f) => path.relative(process.cwd(), f).split(path.sep).join('/'));

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
