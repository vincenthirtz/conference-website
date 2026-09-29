// features/player/progression/repository.ts — niveau et historique de
// niveau d'une joueuse, scopés au tenant.

import type { AdminDb } from '@/utils/admin/serviceContext';

export async function readRatingHistory(
  db: AdminDb,
  tenantId: string,
  userId: string
) {
  const { data, error } = await db
    .from('player_rating_history')
    .select('occurred_at, rating_after')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .order('occurred_at', { ascending: true });
  return {
    rows: (data ?? []) as {
      occurred_at: string | null;
      rating_after: number | null;
    }[],
    error,
  };
}

export async function readCurrentRating(
  db: AdminDb,
  tenantId: string,
  userId: string
): Promise<number | null | undefined> {
  const { data } = await db
    .from('player_ratings')
    .select('rating')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { rating?: number | null } | null)?.rating;
}
