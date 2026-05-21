import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Resolve a tournament row by either its UUID or its slug. Slug is the
 * canonical public identifier; UUID stays valid for backwards compatibility
 * with already-shared links.
 *
 * S5d: accepts an optional `tenantId` — when provided, the lookup is scoped
 * to that tenant. Defaults to `DEFAULT_TENANT_ID` so existing callers (admin
 * helpers, build-time `getStaticProps`) keep working without churn while the
 * multi-tenant migration progresses.
 */
export async function findTournamentByIdOrSlug<
  T = Record<string, unknown>,
>(
  idOrSlug: string,
  columns = '*',
  tenantId: string = DEFAULT_TENANT_ID
): Promise<T | null> {
  if (!supabaseAdmin || !idOrSlug) return null;

  if (UUID_RE.test(idOrSlug)) {
    const { data } = await supabaseAdmin
      .from('tournaments')
      .select(columns)
      .eq('id', idOrSlug)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (data) return data as T;
  }

  const { data } = await supabaseAdmin
    .from('tournaments')
    .select(columns)
    .eq('slug', idOrSlug)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  return (data as T | null) ?? null;
}
