// features/admin/tournaments/hooks/useTournamentBulkOps.ts — opérations en
// masse d'un tournoi (pages/admin/tournament/[id]/bulk-ops), lot L10.
//
// L'écran lisait par `fetch()` nu (sans jeton) : il passe désormais par
// `adminRequest`, comme le reste de l'admin.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StageSummary, TournamentMini } from '@/types/admin';
import { adminRequest } from '@/utils/admin/adminHttp';
import { tournamentUrls, withFallback } from '../client';
import { MOUNT_ONLY, tournamentKeys } from './keys';

export type BulkRoundOption = {
  stageId: string;
  roundNumber: number;
  matchCount: number;
};

export type BulkMatchRow = {
  id: string;
  round_name: string | null;
  round_number: number | null;
  status: string;
};

type MatchesResponse = {
  tournament?: TournamentMini | null;
  stages?: StageSummary[];
  matches?: (BulkMatchRow & { stage_id?: string | null })[];
};

/** Phases + rounds (avec leur nombre de matchs) du tournoi. */
export function useBulkOpsOverview(id: string, loadError: string) {
  return useQuery({
    queryKey: tournamentKeys.part(id, 'bulk-ops'),
    queryFn: async () => {
      const json = await withFallback(
        adminRequest<MatchesResponse>(
          tournamentUrls.matches(id, { limit: 1000 })
        ),
        loadError
      );
      const buckets = new Map<string, BulkRoundOption>();
      for (const m of json.matches || []) {
        if (!m.stage_id || m.round_number === null) continue;
        const key = `${m.stage_id}:${m.round_number}`;
        const cur = buckets.get(key);
        if (cur) cur.matchCount += 1;
        else
          buckets.set(key, {
            stageId: m.stage_id,
            roundNumber: m.round_number,
            matchCount: 1,
          });
      }
      return {
        tournament: json.tournament || null,
        stages: json.stages || [],
        roundOptions: Array.from(buckets.values()).sort((a, b) => {
          if (a.stageId !== b.stageId)
            return a.stageId.localeCompare(b.stageId);
          return a.roundNumber - b.roundNumber;
        }),
      };
    },
    enabled: !!id,
    ...MOUNT_ONLY,
  });
}

/** Matchs d'une phase source (formulaire de réaffectation). */
export function useBulkOpsStageMatches(id: string, stageId: string) {
  return useQuery({
    queryKey: tournamentKeys.part(id, 'bulk-ops', 'stage', stageId),
    queryFn: async (): Promise<BulkMatchRow[]> => {
      try {
        const json = await adminRequest<MatchesResponse>(
          tournamentUrls.matches(id, { stageId, limit: 500 })
        );
        return (json.matches || []).map((m) => ({
          id: m.id,
          round_name: m.round_name,
          round_number: m.round_number,
          status: m.status,
        }));
      } catch {
        // Comme avant : un échec laisse la liste vide, sans message.
        return [];
      }
    },
    enabled: !!id && !!stageId,
    ...MOUNT_ONLY,
  });
}

/** Réponse de `bulk-matches` : décalage ou réaffectation. */
export type BulkMatchesResult = {
  shifted: number;
  ignored: number;
  moved: string[];
  skipped?: { matchId: string; reason: string }[];
};

export function useBulkMatchesAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      adminRequest<BulkMatchesResult>(tournamentUrls.bulkMatches(id), {
        method: 'POST',
        json: body,
      }),
    onSuccess: () =>
      void qc.invalidateQueries({
        queryKey: tournamentKeys.part(id, 'bulk-ops'),
      }),
  });
}
