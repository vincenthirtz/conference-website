import { supabaseAdmin } from '@/utils/supabase';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Resolve a tournament row by either its UUID or its slug. Slug is the
 * canonical public identifier; UUID stays valid for backwards compatibility
 * with already-shared links.
 */
export async function findTournamentByIdOrSlug<
  T = Record<string, unknown>,
>(idOrSlug: string, columns = '*'): Promise<T | null> {
  if (!supabaseAdmin || !idOrSlug) return null;

  if (UUID_RE.test(idOrSlug)) {
    const { data } = await supabaseAdmin
      .from('tournaments')
      .select(columns)
      .eq('id', idOrSlug)
      .maybeSingle();
    if (data) return data as T;
  }

  const { data } = await supabaseAdmin
    .from('tournaments')
    .select(columns)
    .eq('slug', idOrSlug)
    .maybeSingle();

  return (data as T | null) ?? null;
}
