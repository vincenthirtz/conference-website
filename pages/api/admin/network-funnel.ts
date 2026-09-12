// pages/api/admin/network-funnel.ts
// GET : l'entonnoir du réseau joueuses, en une requête.
//
// POURQUOI. On a construit un annuaire opt-in, un graphe de suivi, deux marchés
// et un parcours scrim complet — sans jamais savoir OÙ les gens décrochent.
// L'inventaire du 2026-09-12 a dû compter à la main pour découvrir qu'il y
// avait 0 profil découvrable sur ~46 comptes. Tant que ce chiffre demande une
// requête SQL manuelle, personne ne le regarde, et on ajoute des
// fonctionnalités sur un réseau vide (lot 10 de docs/BACKLOG-reseau-social.md).
//
// CE QUE MESURE L'ENTONNOIR — chaque marche est un ENGAGEMENT de plus :
//   compte créé → Discord lié → BattleTag vérifié → carte joueuse activée
//   → au moins un suivi → une demande de scrim
// Les deux marchés (fiches « je cherche une équipe » / « on recrute ») sont à
// côté : ce sont des portes d'entrée SANS compte, pas des marches.
//
// PORTÉE DES COMPTES — à ne pas confondre :
//   - GLOBALES (couche identité, aucun tenant_id) : user_discord_links,
//     user_battlenet_links, player_discovery_profiles, player_follows.
//   - TENANT-SCOPED : free_players, team_openings, demandes.
// Mélanger les deux donnerait un taux de conversion faux dès qu'un second
// espace existe. Les clés le disent (`…Global`).
//
// DÉGRADATION : Promise.allSettled + count-only (head:true, aucune ligne
// transférée). Un compte en échec renvoie `null` — jamais 0, qui se lirait
// comme « personne » alors qu'il signifie « on ne sait pas ». Même convention
// que pages/api/admin/overview-summary.ts.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '../../../utils/logger';

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

type ApiResponse = NetworkFunnel | { error: string };

// Garde par PERMISSION (`manage_settings`), la même que la page qui la
// consomme et que les journaux : une garde qui se lit pareil des deux côtés.
// L'entonnoir agrège des volumes d'identité (Discord, BattleTag, découverte) —
// aucune donnée nominative, mais pas non plus de quoi alimenter la curiosité
// d'un rôle plus large.
export default withStaffRoute(handler, { permission: 'manage_settings' });

/** count-only → `number | null` (null = inconnu, pas zéro). */
function resolveCount(
  result: PromiseSettledResult<{ count: number | null; error: unknown }>,
  label: string
): number | null {
  if (result.status !== 'fulfilled') {
    logger.error(`[admin/network-funnel] ${label} rejected:`, result.reason);
    return null;
  }
  if (result.value.error) {
    logger.error(`[admin/network-funnel] ${label} error:`, result.value.error);
    return null;
  }
  return result.value.count ?? 0;
}

/**
 * Total des comptes. `auth.users` n'est pas interrogeable en count-only via
 * PostgREST : on passe par la RPC déjà utilisée par /admin/users, en ne
 * demandant qu'UNE ligne — elle expose `total_count = count(*) OVER()`.
 */
async function countAccounts(): Promise<number | null> {
  try {
    const { data, error } = await supabaseAdmin!.rpc('admin_list_users', {
      p_limit: 1,
      p_offset: 0,
    });
    if (error) {
      logger.error('[admin/network-funnel] accounts error:', error);
      return null;
    }
    const rows = (data ?? []) as Array<{ total_count: number | string | null }>;
    // Aucun compte : la RPC ne renvoie aucune ligne, donc pas de total_count.
    if (rows.length === 0) return 0;
    return Number(rows[0]?.total_count ?? 0);
  } catch (err) {
    logger.error('[admin/network-funnel] accounts rejected:', err);
    return null;
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-funnel')) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  const tenantId = ctx.tenantId;
  const nowIso = new Date().toISOString();

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
    countAccounts(),
    Promise.allSettled([
      // `auth_user_id`, PAS `user_id` : la colonne porte ce nom sur les deux
      // tables d'identité, et un garde-fou dédié existe précisément parce que
      // l'erreur a déjà été commise (tests/unit/discordLinksColumnGuard).
      supabaseAdmin
        .from('user_discord_links')
        .select('auth_user_id', { count: 'exact', head: true }),

      supabaseAdmin
        .from('user_battlenet_links')
        .select('auth_user_id', { count: 'exact', head: true }),

      supabaseAdmin
        .from('player_discovery_profiles')
        .select('auth_user_id', { count: 'exact', head: true }),

      supabaseAdmin
        .from('player_discovery_profiles')
        .select('auth_user_id', { count: 'exact', head: true })
        .eq('discoverable', true),

      supabaseAdmin
        .from('player_follows')
        .select('follower_id', { count: 'exact', head: true }),

      // Fiches ENCORE VIVANTES : une annonce périmée ne dit rien du marché
      // d'aujourd'hui (expires_at NULL = provenance Discord, jamais périmée).
      supabaseAdmin
        .from('free_players')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`),

      supabaseAdmin
        .from('team_openings')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`),

      supabaseAdmin
        .from('demandes')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('type', 'scrim'),
    ]),
  ]);

  return res.status(200).json({
    accounts,
    discordLinkedGlobal: resolveCount(discordR, 'discordLinked'),
    battlenetLinkedGlobal: resolveCount(battlenetR, 'battlenetLinked'),
    discoveryProfilesGlobal: resolveCount(profilesR, 'discoveryProfiles'),
    discoverableGlobal: resolveCount(discoverableR, 'discoverable'),
    followsGlobal: resolveCount(followsR, 'follows'),
    freePlayers: resolveCount(freePlayersR, 'freePlayers'),
    teamOpenings: resolveCount(openingsR, 'teamOpenings'),
    scrimRequests: resolveCount(scrimsR, 'scrimRequests'),
  });
}
