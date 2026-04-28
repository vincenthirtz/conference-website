// utils/teams/rosterLock.ts
// Helper qui determine si le roster d'une equipe est verrouille
// (au moins un tournoi auquel elle est inscrite a depasse roster_locked_at).
//
// Usage : appeler avant tout add/remove/swap sur team_members.

import { supabaseAdmin } from '../supabase';

export type RosterLockStatus =
  | { locked: false }
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
 */
export async function isTeamRosterLocked(
  teamId: string
): Promise<RosterLockStatus> {
  if (!supabaseAdmin) {
    return { locked: false };
  }

  // 1) Lister les tournois auxquels la team est inscrite
  const { data: registrations } = await supabaseAdmin
    .from('tournament_teams')
    .select('tournament_id')
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
    .select('id, name, roster_locked_at, status')
    .in('id', tournamentIds);

  const now = Date.now();

  for (const t of tournaments || []) {
    // On ignore les tournois archives / completed (le verrou ne s'applique plus :
    // si on veut faire un transfert post-tournoi, ca doit passer)
    if (t.status === 'archived' || t.status === 'completed') continue;

    if (!t.roster_locked_at) continue;
    const lockedAt = Date.parse(t.roster_locked_at);
    if (Number.isFinite(lockedAt) && lockedAt <= now) {
      return {
        locked: true,
        tournamentId: t.id,
        tournamentName: t.name ?? null,
        lockedAt: t.roster_locked_at,
      };
    }
  }

  return { locked: false };
}

/**
 * Construit un message d'erreur lisible pour un roster verrouille.
 */
export function rosterLockErrorMessage(status: RosterLockStatus): string {
  if (!status.locked) return 'Roster non verrouille';
  const when = new Date(status.lockedAt).toLocaleString('fr-FR');
  const tname = status.tournamentName || status.tournamentId.slice(0, 8);
  return `Roster verrouille (tournoi "${tname}" depuis le ${when}). Pour forcer la modification, utilise force=true (admin uniquement).`;
}
