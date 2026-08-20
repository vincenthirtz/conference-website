// pages/api/teams/free-players.ts
//
// GET — liste les "joueurs libres" du tenant (membres Discord portant le rôle
// "Recherche une équipe", synchronisés via /api/bot/v1/free-players/sync) pour
// que les capitaines puissent les recruter.
//
// Gate : le caller DOIT gérer une équipe (capitaine ou rôle de gestion), sinon
// 403. La liste exclut :
//   - le caller lui-même (par auth_user_id),
//   - toute personne déjà dans une équipe de ce tenant (join team_members).
//
// Pour les rows liées (auth_user_id non null), enrichissement depuis `profiles`
// (battle_tag, display_name) — dégrade gracieusement si la row profile est
// absente.
//
// Auth : Bearer (withAuthRoute). Tenant : resolveTenantIdForUserRequestAsync.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import {
  assertTeamPermission,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import { getManagedTeamForRequest } from '@/utils/teams/teamScope';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
import { logger } from '@/utils/logger';

type FreePlayerOut = {
  discordUserId: string;
  discordUsername: string | null;
  linked: boolean;
  authUserId: string | null;
  displayName: string | null;
  battleTag: string | null;
  specialty: string | null;
};

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'teams-free-players'
    )
  ) {
    return;
  }

  const tenantId = await resolveTenantIdForUserRequestAsync(req, {
    authUserId: user.id,
  });

  // Gate : le caller doit gérer une équipe (capitaine ou manager).
  const access = await getManagedTeamForRequest(req, user.id, tenantId);
  if (!access) {
    return res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
  }

  // Permission fine (R2) : le rôle doit couvrir `manage_roster` — un rôle
  // à privilèges partiels n'ouvre plus l'ensemble de la gestion d'équipe.
  const denied = assertTeamPermission(access, 'manage_roster');
  if (denied) return res.status(denied.status).json({ error: denied.error });

  // 1) free_players du tenant.
  const { data: freeRows, error: freeErr } = await supabaseAdmin
    .from('free_players')
    .select('discord_user_id, discord_username, auth_user_id')
    .eq('tenant_id', tenantId);
  if (freeErr) {
    logger.error('[teams/free-players] free_players query error', freeErr);
    return res
      .status(500)
      .json({ error: 'Erreur de chargement des joueurs libres.' });
  }

  const rows = (freeRows ?? []) as Array<{
    discord_user_id: string;
    discord_username: string | null;
    auth_user_id: string | null;
  }>;

  // 2) Ensemble des auth_user_id déjà membres d'une équipe de ce tenant.
  const { data: memberRows, error: memberErr } = await supabaseAdmin
    .from('team_members')
    .select('user_id')
    .eq('tenant_id', tenantId);
  if (memberErr) {
    logger.error('[teams/free-players] team_members query error', memberErr);
    return res.status(500).json({ error: 'Erreur de chargement des équipes.' });
  }
  const teamedUserIds = new Set(
    (memberRows ?? [])
      .map((r) => (r as Record<string, unknown>).user_id)
      .filter((v): v is string => typeof v === 'string')
  );

  // 3) Filtrage : exclure le caller + toute personne déjà en équipe.
  const filtered = rows.filter((r) => {
    if (r.auth_user_id && r.auth_user_id === user.id) return false;
    if (r.auth_user_id && teamedUserIds.has(r.auth_user_id)) return false;
    return true;
  });

  // 4) Enrichissement profils pour les rows liées.
  const linkedIds = filtered
    .map((r) => r.auth_user_id)
    .filter((v): v is string => typeof v === 'string');

  const profileById = new Map<
    string,
    { display_name: string | null; battle_tag: string | null }
  >();
  if (linkedIds.length > 0) {
    const { data: profiles, error: profilesErr } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name, battle_tag')
      .in('id', linkedIds);
    // Dégradation gracieuse : une erreur profils ne casse pas la liste.
    if (profilesErr) {
      logger.warn('[teams/free-players] profiles enrich error', profilesErr);
    } else {
      for (const p of profiles ?? []) {
        const id = (p as Record<string, unknown>).id;
        if (typeof id === 'string') {
          profileById.set(id, {
            display_name:
              ((p as Record<string, unknown>).display_name as string) ?? null,
            battle_tag:
              ((p as Record<string, unknown>).battle_tag as string) ?? null,
          });
        }
      }
    }
  }

  const players: FreePlayerOut[] = filtered.map((r) => {
    const linked = !!r.auth_user_id;
    const profile = r.auth_user_id
      ? profileById.get(r.auth_user_id)
      : undefined;
    return {
      discordUserId: r.discord_user_id,
      discordUsername: r.discord_username ?? null,
      linked,
      authUserId: r.auth_user_id ?? null,
      displayName: profile?.display_name ?? null,
      battleTag: profile?.battle_tag ?? null,
      // specialty vit sur team_members ; un joueur libre n'est par définition
      // pas en équipe, donc toujours null ici. Champ conservé pour un contrat
      // de réponse stable.
      specialty: null,
    };
  });

  return res.status(200).json({ players });
});
