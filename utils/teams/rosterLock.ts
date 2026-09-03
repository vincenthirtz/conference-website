// utils/teams/rosterLock.ts
// Helper qui determine si le roster d'une equipe est verrouille
// (au moins un tournoi auquel elle est inscrite a depasse roster_locked_at).
//
// Usage : appeler avant tout add/remove/swap sur team_members.
//
// DÉROGATION TEMPORAIRE. Un admin peut ouvrir une fenêtre par tournoi
// (`tournaments.roster_unlocked_until`, cf. la migration du même nom) : tant
// qu'elle est dans le futur, le verrou de CE tournoi ne s'applique pas et les
// capitaines et managers travaillent normalement. Avant, la seule issue était
// `force=true` côté admin — donc à l'admin de faire la manipulation à la place
// du capitaine, en devinant qui ajouter.
//
// La fenêtre ne dispense QUE du tournoi qui l'ouvre : une équipe inscrite à
// deux tournois dont un seul est déverrouillé reste verrouillée par l'autre.
// C'est la boucle ci-dessous qui le garantit — elle ne s'arrête que sur un
// tournoi qui verrouille vraiment.

import { supabaseAdmin } from '../supabase';

export type RosterLockStatus =
  | {
      locked: false;
      /**
       * Fin de la fenêtre de dérogation, quand c'est ELLE qui explique
       * l'absence de verrou. Permet à l'appelant de le dire (« déverrouillé
       * jusqu'à 18 h ») plutôt que de laisser croire qu'il n'y a pas de verrou.
       */
      unlockedUntil?: string | null;
      /** Tournoi dont la fenêtre est ouverte. */
      unlockedTournamentId?: string;
      unlockedTournamentName?: string | null;
    }
  | {
      locked: true;
      tournamentId: string;
      tournamentName: string | null;
      lockedAt: string;
    };

/**
 * Verifie si le roster d'une equipe est verrouille du fait d'au moins un tournoi
 * auquel elle est inscrite.
 *
 * Retourne le premier tournoi qui verrouille (utile pour le message d'erreur).
 * Si aucune inscription verrouillee, retourne `{ locked: false }`.
 *
 * @param tenantId Tenant scope — defense-in-depth (S5a). Filtre tournament_teams
 *                 et tournaments pour s'assurer qu'on ne croise pas une inscription
 *                 d'un autre tenant.
 * @param teamId   Id de l'equipe a verifier.
 */
export async function isTeamRosterLocked(
  tenantId: string,
  teamId: string
): Promise<RosterLockStatus> {
  if (!supabaseAdmin) {
    return { locked: false };
  }

  // 1) Lister les tournois auxquels la team est inscrite
  const { data: registrations } = await supabaseAdmin
    .from('tournament_teams')
    .select('tournament_id')
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId);

  const tournamentIds = (registrations || [])
    .map((r: any) => r.tournament_id)
    .filter((x): x is string => !!x);

  if (tournamentIds.length === 0) {
    return { locked: false };
  }

  // 2) Charger ces tournois et identifier ceux dont la date de verrouillage est passee
  const { data: tournaments } = await supabaseAdmin
    .from('tournaments')
    .select('id, name, roster_locked_at, roster_unlocked_until, status')
    .eq('tenant_id', tenantId)
    .in('id', tournamentIds);

  const now = Date.now();
  // Retenu pour le cas où AUCUN tournoi ne verrouille : on veut alors pouvoir
  // dire « déverrouillé jusqu'à … » plutôt que « pas de verrou », qui laisserait
  // croire qu'il n'y a rien à surveiller.
  let openWindow: {
    until: string;
    tournamentId: string;
    tournamentName: string | null;
  } | null = null;

  for (const t of tournaments || []) {
    // On ignore les tournois archives / completed (le verrou ne s'applique plus :
    // si on veut faire un transfert post-tournoi, ca doit passer)
    if (t.status === 'archived' || t.status === 'completed') continue;

    if (!t.roster_locked_at) continue;
    const lockedAt = Date.parse(t.roster_locked_at);
    if (!Number.isFinite(lockedAt) || lockedAt > now) continue;

    // Dérogation en cours pour CE tournoi : il ne verrouille pas, mais on garde
    // l'échéance la plus PROCHE — c'est elle qui fixe la fin du répit.
    const unlockUntil = t.roster_unlocked_until
      ? Date.parse(t.roster_unlocked_until)
      : NaN;
    if (Number.isFinite(unlockUntil) && unlockUntil > now) {
      if (!openWindow || unlockUntil < Date.parse(openWindow.until)) {
        openWindow = {
          until: t.roster_unlocked_until as string,
          tournamentId: t.id,
          tournamentName: t.name ?? null,
        };
      }
      continue;
    }

    return {
      locked: true,
      tournamentId: t.id,
      tournamentName: t.name ?? null,
      lockedAt: t.roster_locked_at,
    };
  }

  if (openWindow) {
    return {
      locked: false,
      unlockedUntil: openWindow.until,
      unlockedTournamentId: openWindow.tournamentId,
      unlockedTournamentName: openWindow.tournamentName,
    };
  }

  return { locked: false };
}

/**
 * Construit un message d'erreur lisible pour un roster verrouille.
 */
export function rosterLockErrorMessage(status: RosterLockStatus): string {
  if (!status.locked) return 'Roster non verrouillé';
  const when = new Date(status.lockedAt).toLocaleString('fr-FR');
  const tname = status.tournamentName || status.tournamentId.slice(0, 8);
  // Ce message est lu par des CAPITAINES, pas par des développeurs : la version
  // précédente leur soufflait « utilise force=true (admin uniquement) », un
  // drapeau interne qu'ils ne peuvent pas utiliser et qui ne leur dit pas quoi
  // faire. On nomme la seule action qui leur est ouverte : demander une
  // fenêtre.
  return `Roster verrouillé depuis le ${when} pour le tournoi « ${tname} ». Un administrateur peut ouvrir une fenêtre de modification temporaire si le changement est justifié.`;
}
