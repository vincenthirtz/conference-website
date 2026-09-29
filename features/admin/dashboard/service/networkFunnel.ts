// features/admin/dashboard/service/networkFunnel.ts — l'entonnoir du réseau
// joueuses, en une requête (lot 10 de docs/BACKLOG-reseau-social.md).
//
// compte créé → Discord lié → BattleTag vérifié → carte joueuse activée
// → au moins un suivi → une demande de scrim ; les deux marchés à côté.
//
// PORTÉE : GLOBALES (couche identité, sans tenant_id) — user_discord_links,
// user_battlenet_links, player_discovery_profiles, player_follows ; SCOPÉES
// tenant — free_players, team_openings, demandes. Les clés le disent (`…Global`).
// Un compte en échec rend `null` (inconnu), jamais 0.

import type { ServiceContext } from '@/utils/admin/serviceContext';

export type NetworkFunnel = {
  /** Comptes existants (auth.users) — via la RPC admin_list_users. */
  accounts: number | null;
  /** Comptes ayant lié Discord (GLOBAL). */
  discordLinkedGlobal: number | null;
  /** Comptes ayant vérifié leur BattleTag (GLOBAL). */
  battlenetLinkedGlobal: number | null;
  /** Cartes joueuses créées, visibles ou non (GLOBAL). */
  discoveryProfilesGlobal: number | null;
  /** Cartes joueuses réellement VISIBLES — le chiffre qui compte (GLOBAL). */
  discoverableGlobal: number | null;
  /** Arêtes de suivi (GLOBAL). */
  followsGlobal: number | null;
  /** Fiches « je cherche une équipe » actives (tenant). */
  freePlayers: number | null;
  /** Annonces « on recrute » actives (tenant). */
  teamOpenings: number | null;
  /** Demandes de scrim, tous statuts (tenant). */
  scrimRequests: number | null;
};

function resolveCount(
  ctx: ServiceContext,
  result: PromiseSettledResult<{ count: number | null; error: unknown }>,
  label: string
): number | null {
  if (result.status !== 'fulfilled') {
    ctx.logger.error(
      `[admin/network-funnel] ${label} rejected:`,
      result.reason
    );
    return null;
  }
  if (result.value.error) {
    ctx.logger.error(
      `[admin/network-funnel] ${label} error:`,
      result.value.error
    );
    return null;
  }
  return result.value.count ?? 0;
}

/**
 * Total des comptes : `auth.users` n'est pas interrogeable en count-only via
 * PostgREST — RPC de /admin/users, UNE ligne (`total_count = count(*) OVER()`).
 */
async function countAccounts(ctx: ServiceContext): Promise<number | null> {
  try {
    const { data, error } = await ctx.db.rpc('admin_list_users', {
      p_limit: 1,
      p_offset: 0,
    });
    if (error) {
      ctx.logger.error('[admin/network-funnel] accounts error:', error);
      return null;
    }
    const rows = (data ?? []) as Array<{ total_count: number | string | null }>;
    if (rows.length === 0) return 0;
    return Number(rows[0]?.total_count ?? 0);
  } catch (err) {
    ctx.logger.error('[admin/network-funnel] accounts rejected:', err);
    return null;
  }
}

export async function getNetworkFunnel(
  ctx: ServiceContext
): Promise<NetworkFunnel> {
  const { db, tenantId } = ctx;
  const nowIso = new Date().toISOString();
  const head = { count: 'exact', head: true } as const;

  const [
    accounts,
    [
      discordR,
      battlenetR,
      profilesR,
      discoverableR,
      followsR,
      freePlayersR,
      openingsR,
      scrimsR,
    ],
  ] = await Promise.all([
    countAccounts(ctx),
    Promise.allSettled([
      // `auth_user_id`, PAS `user_id` (garde-fou discordLinksColumnGuard).
      db.from('user_discord_links').select('auth_user_id', head),
      db.from('user_battlenet_links').select('auth_user_id', head),
      db.from('player_discovery_profiles').select('auth_user_id', head),
      db
        .from('player_discovery_profiles')
        .select('auth_user_id', head)
        .eq('discoverable', true),
      db.from('player_follows').select('follower_id', head),
      // Fiches ENCORE VIVANTES (expires_at NULL = provenance Discord).
      db
        .from('free_players')
        .select('id', head)
        .eq('tenant_id', tenantId)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`),
      db
        .from('team_openings')
        .select('id', head)
        .eq('tenant_id', tenantId)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`),
      db
        .from('demandes')
        .select('id', head)
        .eq('tenant_id', tenantId)
        .eq('type', 'scrim'),
    ]),
  ]);

  return {
    accounts,
    discordLinkedGlobal: resolveCount(ctx, discordR, 'discordLinked'),
    battlenetLinkedGlobal: resolveCount(ctx, battlenetR, 'battlenetLinked'),
    discoveryProfilesGlobal: resolveCount(ctx, profilesR, 'discoveryProfiles'),
    discoverableGlobal: resolveCount(ctx, discoverableR, 'discoverable'),
    followsGlobal: resolveCount(ctx, followsR, 'follows'),
    freePlayers: resolveCount(ctx, freePlayersR, 'freePlayers'),
    teamOpenings: resolveCount(ctx, openingsR, 'teamOpenings'),
    scrimRequests: resolveCount(ctx, scrimsR, 'scrimRequests'),
  };
}
