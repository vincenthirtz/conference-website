// features/admin/tournaments/hooks/useTournamentPrizePool.ts — cagnotte
// d'un tournoi (pages/admin/tournament/[id]/prize-pool), lot L10.
//
// La fiche est ÉDITÉE : lecture `EDITOR_QUERY_OPTIONS`. L'enregistrement
// reste sur `useIdempotentMutation` (file hors ligne), chemin
// `tournamentUrls.prizePool`.

import { useQuery } from '@tanstack/react-query';
import { adminRequest } from '@/utils/admin/adminHttp';
import { EDITOR_QUERY_OPTIONS } from '../../_shared/query';
import { tournamentUrls, withFallback } from '../client';
import { tournamentKeys } from './keys';

export type PrizePool = {
  id: string;
  tournament_id: string;
  tenant_id: string;
  title: string | null;
  currency: string;
  goal_amount_cents: number | null;
  base_amount_cents: number;
  raised_amount_cents: number;
  is_open: boolean;
  total_cents: number;
  created_at: string;
  updated_at: string;
};

export type Contribution = {
  id: string;
  amount_cents: number;
  contributor_name: string | null;
  is_anonymous: boolean;
  message: string | null;
  helloasso_payment_id: string | null;
  checkout_intent_id: string | null;
  created_at: string;
};

export type PrizePoolResponse = {
  pool: PrizePool | null;
  contributions: Contribution[];
  contributorCount: number;
};

export function useTournamentPrizePool(id: string, loadError: string) {
  return useQuery({
    queryKey: tournamentKeys.part(id, 'prize-pool'),
    queryFn: () =>
      withFallback(
        adminRequest<PrizePoolResponse>(tournamentUrls.prizePool(id)),
        loadError
      ),
    enabled: !!id,
    ...EDITOR_QUERY_OPTIONS,
  });
}
