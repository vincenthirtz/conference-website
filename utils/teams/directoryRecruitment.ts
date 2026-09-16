// utils/teams/directoryRecruitment.ts
//
// Le recrutement tel que l'annuaire connecté (/player/teams) doit le lire.
//
// POURQUOI ce module existe : l'annuaire affichait « recrute » dès que
// `teams.is_joinable && !is_full`. Or `is_joinable` vaut TRUE par défaut
// (database/migrations/default_teams_joinable_and_backfill.sql) : le badge
// tombait sur toute équipe non pleine, y compris celles qui ne cherchent
// personne. Une joueuse candidatait, n'avait pas de réponse, et concluait que
// le site ne servait à rien. Pendant ce temps la déclaration VOLONTAIRE d'une
// capitaine — une annonce dans `team_openings` — n'était lue par aucun écran
// connecté.
//
// On sépare donc deux signaux qui n'ont pas le même poids :
//   - `opening` : une annonce active existe → l'équipe CHERCHE (signal fort) ;
//   - `accepts_requests` : l'équipe accepte des demandes → elle ne dit pas non,
//     sans rien promettre (signal discret, c'est l'état par défaut).
//
// Module PUR (aucun accès base) : importé par la route API ET par la page, et
// testé sans mock Supabase.

import {
  isTeamOpeningActive,
  normalizeOpeningRoles,
  type TeamOpeningRole,
  type TeamOpeningRow,
} from '@/utils/teamOpenings';

/**
 * Colonnes lues par l'annuaire. JAMAIS les contacts (`contact_email`,
 * `contact_discord`) : l'annuaire renvoie vers /recrutement, qui porte déjà le
 * parcours de contact authentifié. Un `TEAM_OPENING_SELECT` réutilisé ici
 * mettrait des emails dans la mémoire d'une route qui n'en a aucun usage.
 */
export const DIRECTORY_OPENING_SELECT =
  'id, team_id, team_name, roles, marked_at, expires_at';

export type DirectoryOpeningRow = Pick<
  TeamOpeningRow,
  'id' | 'team_id' | 'team_name' | 'roles' | 'marked_at' | 'expires_at'
>;

/** Annonce rattachée à une équipe de l'annuaire. */
export type DirectoryOpening = {
  /** Postes recherchés (union des annonces actives de l'équipe). */
  roles: TeamOpeningRole[];
  /** Date de l'annonce la plus récente. */
  since: string | null;
  /**
   * Comment l'annonce a été rattachée : toujours par identifiant d'équipe.
   * Le champ reste exposé pour que le contrat ne change pas le jour où un
   * autre mode de rattachement, vérifié, serait ajouté.
   */
  linked_by: 'team';
};

/**
 * Rattache les annonces ACTIVES aux équipes de l'espace, en une passe.
 *
 * Règles :
 *   1. Seul un `team_id` rattache une annonce — et seulement à une équipe de la
 *      liste fournie : une annonce d'un autre espace ne peut pas s'accrocher.
 *   2. Plusieurs annonces pour une même équipe : union des postes, date la plus
 *      récente.
 *
 * PAS DE RATTACHEMENT PAR NOM — c'est une décision de sécurité, pas un oubli.
 * L'annonce publique se publie SANS COMPTE et porte les coordonnées de qui la
 * dépose. Rattachée par nom, n'importe qui pourrait publier « Team X recrute »
 * avec SES propres coordonnées et obtenir le badge « Annonce publiée » sur la
 * vraie fiche de Team X : une joueuse contacterait l'usurpatrice avec la caution
 * de l'annuaire. Sur un site communautaire féminin, c'est une porte d'entrée au
 * harcèlement. Aujourd'hui le formulaire public n'écrit jamais `team_id` : le
 * badge fort reste donc inactif jusqu'à ce que l'annonce puisse être posée
 * depuis l'espace capitaine, authentifiée et rattachée à son équipe.
 */
export function indexOpeningsByTeam(
  rows: readonly DirectoryOpeningRow[],
  teams: ReadonlyArray<{ id: string; name: string | null | undefined }>,
  now: Date = new Date()
): Map<string, DirectoryOpening> {
  const teamIds = new Set(teams.map((t) => t.id));

  const out = new Map<string, DirectoryOpening>();
  for (const row of rows) {
    if (!isTeamOpeningActive(row as TeamOpeningRow, now)) continue;

    // Sans identifiant, ou identifiant hors de l'espace : pas de rattachement
    // (cf. en-tête — jamais par nom).
    if (!row.team_id || !teamIds.has(row.team_id)) continue;
    const teamId = row.team_id;

    const roles = normalizeOpeningRoles(row.roles);
    const prev = out.get(teamId);
    if (!prev) {
      out.set(teamId, { roles, since: row.marked_at, linked_by: 'team' });
      continue;
    }
    out.set(teamId, {
      roles: normalizeOpeningRoles([...prev.roles, ...roles]),
      since:
        (row.marked_at ?? '') > (prev.since ?? '') ? row.marked_at : prev.since,
      linked_by: 'team',
    });
  }
  return out;
}

/** Ce qu'il faut à la page pour trier et filtrer le recrutement. */
export type RecruitmentFields = {
  opening: DirectoryOpening | null;
  is_joinable: boolean;
  is_full: boolean;
};

/** L'équipe accepte des demandes (état par défaut, signal discret). */
export function acceptsRequests(team: RecruitmentFields): boolean {
  return team.is_joinable && !team.is_full;
}

/**
 * L'équipe relève du filtre « recrutent ». Une annonce publiée suffit, même si
 * l'équipe est pleine ou fermée aux demandes : c'est une déclaration explicite
 * (remplacement d'une joueuse qui part, par exemple), elle prime sur un
 * booléen resté à sa valeur par défaut.
 */
export function isRecruiting(team: RecruitmentFields): boolean {
  return team.opening !== null || acceptsRequests(team);
}

/**
 * Ordre du filtre « recrutent » : les annonces publiées d'abord. Tri STABLE
 * (Array.prototype.sort l'est) : à l'intérieur de chaque groupe, l'ordre reçu —
 * le score de compatibilité de l'API — est conservé.
 */
export function sortRecruitingFirst<T extends RecruitmentFields>(
  teams: readonly T[]
): T[] {
  return [...teams].sort((a, b) => (a.opening ? 0 : 1) - (b.opening ? 0 : 1));
}
