// features/admin/tournaments/hooks/useTournamentMatchesConflicts.ts — détection
// des conflits horaires de l'écran « matchs du tournoi »
// (pages/admin/tournament/[id]/matches.tsx) : une même équipe, ou un même
// stream, planifiés à moins de 30 min d'écart.
//
// Sortie telle quelle de la page (gelée en taille, lot 8A) : mêmes useMemo,
// même calcul, mêmes dépendances. La page lui passe ses matchs et son fuseau.

import { useMemo } from 'react';
import type { Match } from '@/types/admin';
import { formatMatchDateTime } from '@/utils/matches/adminMatchesTz';
import type { TournamentMatchesConflict } from '@/features/admin/tournaments/ui/TournamentMatchesViewBar';

type Conflict = TournamentMatchesConflict;

export function useTournamentMatchesConflicts(
  matches: Match[],
  timezone: string
) {
  // Conflict detection: find teams and resources scheduled at overlapping times
  const conflicts = useMemo(() => {
    const scheduled = matches.filter(
      (m) => m.scheduled_at && m.status !== 'cancelled'
    );
    const found: Map<string, Conflict> = new Map();
    const OVERLAP_WINDOW = 30 * 60 * 1000;

    for (let i = 0; i < scheduled.length; i++) {
      for (let j = i + 1; j < scheduled.length; j++) {
        const a = scheduled[i];
        const b = scheduled[j];
        const aStart = new Date(a.scheduled_at!).getTime();
        const bStart = new Date(b.scheduled_at!).getTime();
        if (Math.abs(aStart - bStart) >= OVERLAP_WINDOW) continue;

        // Team conflicts
        const sharedTeams: { id: string; name: string }[] = [];
        if (
          a.team1_id &&
          (a.team1_id === b.team1_id || a.team1_id === b.team2_id)
        ) {
          sharedTeams.push({
            id: a.team1_id,
            name: a.team1?.name || a.team1_id,
          });
        }
        if (
          a.team2_id &&
          (a.team2_id === b.team1_id || a.team2_id === b.team2_id)
        ) {
          sharedTeams.push({
            id: a.team2_id,
            name: a.team2?.name || a.team2_id,
          });
        }

        for (const team of sharedTeams) {
          const key = `team-${team.id}-${Math.min(aStart, bStart)}`;
          const existing = found.get(key);
          if (existing) {
            if (!existing.matchIds.includes(a.id)) existing.matchIds.push(a.id);
            if (!existing.matchIds.includes(b.id)) existing.matchIds.push(b.id);
          } else {
            found.set(key, {
              matchIds: [a.id, b.id],
              label: team.name,
              type: 'team',
              time: formatMatchDateTime(a.scheduled_at, timezone),
            });
          }
        }

        // Resource (stream) conflicts — same stream_url at same time
        if (
          a.stream_url &&
          b.stream_url &&
          a.stream_url.trim().toLowerCase() ===
            b.stream_url.trim().toLowerCase()
        ) {
          const key = `stream-${a.stream_url.trim().toLowerCase()}-${Math.min(aStart, bStart)}`;
          const existing = found.get(key);
          if (existing) {
            if (!existing.matchIds.includes(a.id)) existing.matchIds.push(a.id);
            if (!existing.matchIds.includes(b.id)) existing.matchIds.push(b.id);
          } else {
            found.set(key, {
              matchIds: [a.id, b.id],
              label: a.stream_url,
              type: 'resource',
              time: formatMatchDateTime(a.scheduled_at, timezone),
            });
          }
        }
      }
    }
    return found;
  }, [matches, timezone]);

  // Set of match IDs involved in conflicts (for highlighting)
  const conflictMatchIds = useMemo(() => {
    const ids = new Set<string>();
    conflicts.forEach((c) => c.matchIds.forEach((id) => ids.add(id)));
    return ids;
  }, [conflicts]);

  return { conflicts, conflictMatchIds };
}
