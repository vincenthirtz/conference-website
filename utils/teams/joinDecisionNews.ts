// utils/teams/joinDecisionNews.ts
//
// Texte de l'actualité automatique produite quand une équipe ACCEPTE une
// demande d'adhésion ou de transfert. Pur : aucune écriture, testable seul.
//
// Ce qu'il corrige :
//   - le rôle brut (« en tant que player ») → un libellé lisible ;
//   - les accents manquants (« transfere », « une equipe ») ;
//   - le transfert publié d'office : l'actu naît désormais en BROUILLON dans
//     les deux cas (c'est l'appelant qui pose `status` / `published_at`), le
//     staff relit et publie s'il y a lieu.
//
// PAS DE VERSION ANGLAISE : la table `news` n'a qu'un jeu de colonnes
// (title / excerpt / content), sans locale. La relecture staff du brouillon
// est le moment d'ajuster le texte.

/** Libellé lisible du rôle d'équipe, au féminin (le circuit est féminin). */
const ROLE_LABELS_FR: Record<string, string> = {
  player: 'joueuse',
  substitute: 'remplaçante',
  coach: 'coach',
  manager: 'manager',
};

export function teamRoleLabelFr(role: string | null | undefined): string {
  return (role && ROLE_LABELS_FR[role]) || ROLE_LABELS_FR.player;
}

export type JoinDecisionNewsText = {
  title: string;
  excerpt: string;
  content: string;
};

export function buildJoinNewsText(input: {
  kind: 'join' | 'transfer';
  playerName: string;
  teamName: string;
  role: string | null | undefined;
  /** Transfert : équipe quittée, si connue. */
  fromTeamName?: string | null;
}): JoinDecisionNewsText {
  const { playerName, teamName } = input;
  const role = teamRoleLabelFr(input.role);
  if (input.kind === 'join') {
    return {
      title: `${playerName} rejoint ${teamName}`,
      excerpt: `${playerName} rejoint ${teamName} en tant que ${role}.`,
      content: `${playerName} a rejoint ${teamName} en tant que ${role}. Bienvenue !`,
    };
  }
  const from = input.fromTeamName?.trim() || 'une autre équipe';
  return {
    title: `${playerName} est transférée vers ${teamName}`,
    excerpt: `${playerName} quitte ${from} et rejoint ${teamName} en tant que ${role}.`,
    content: `${playerName} a été transférée de ${from} vers ${teamName} en tant que ${role}. Bienvenue !`,
  };
}
