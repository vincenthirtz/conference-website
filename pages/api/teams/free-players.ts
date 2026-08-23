// pages/api/teams/free-players.ts
//
// GET — liste les "joueuses libres" du tenant pour que les capitaines puissent
// les recruter. DEUX provenances depuis le lot 1 d'acquisition :
//   - `discord` : membres portant le rôle "Recherche une équipe", synchronisés
//     par le bot via /api/bot/v1/free-players/sync ;
//   - `web` : inscriptions faites depuis /rejoindre, SANS compte. Elles n'ont
//     ni Discord ni auth_user_id — d'où `id` comme clé stable de la réponse, et
//     un bloc `contact` que seule cette route (authentifiée, gate manage_roster)
//     est autorisée à exposer.
//
// Gate : le caller DOIT gérer une équipe (capitaine ou rôle de gestion), sinon
// 403. La liste exclut :
//   - le caller lui-même (par auth_user_id),
//   - toute personne déjà dans une équipe de ce tenant (join team_members).
//
// Pour les rows liées (auth_user_id non null), enrichissement via la RPC
// `admin_get_user_profiles` (battle_tag, display_name) — dégrade gracieusement
// si le compte est introuvable.
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
import { fetchAdminUserProfiles } from '@/utils/adminUserProfiles';
import {
  FREE_PLAYER_SELECT,
  isActive,
  normalizeRoles,
  type FreePlayerRole,
  type FreePlayerRow,
  type FreePlayerSource,
} from '@/utils/freePlayers';
import { logger } from '@/utils/logger';

type FreePlayerOut = {
  /** Clé stable de la réponse : une inscription web n'a pas de discordUserId. */
  id: string;
  source: FreePlayerSource;
  /** null pour une inscription web. */
  discordUserId: string | null;
  discordUsername: string | null;
  linked: boolean;
  authUserId: string | null;
  displayName: string | null;
  battleTag: string | null;
  specialty: string | null;
  /** Renseignés uniquement par les inscriptions web. */
  roles: FreePlayerRole[];
  level: string | null;
  availability: string | null;
  note: string | null;
  /**
   * Moyens de contact. PRIVÉS : ils ne sortent que par cette route, jamais par
   * /api/public/free-players. C'est la contrepartie du « sans compte » — une
   * capitaine doit pouvoir joindre quelqu'un qui n'a pas encore de compte.
   */
  contact: { email: string | null; discord: string | null } | null;
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

  // 1) free_players du tenant, les deux provenances confondues.
  const { data: freeRows, error: freeErr } = await supabaseAdmin
    .from('free_players')
    .select(FREE_PLAYER_SELECT)
    .eq('tenant_id', tenantId)
    .order('marked_at', { ascending: false });
  if (freeErr) {
    logger.error('[teams/free-players] free_players query error', freeErr);
    return res
      .status(500)
      .json({ error: 'Erreur de chargement des joueurs libres.' });
  }

  // Les annonces périmées disparaissent de la liste (filtre en JS et pas en SQL
  // pour laisser passer les rows sans `expires_at` — provenance Discord).
  const now = new Date();
  const rows = ((freeRows ?? []) as FreePlayerRow[]).filter((r) =>
    isActive(r, now)
  );

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

  // 4) Enrichissement profils pour les rows liées à un compte.
  //
  // Via `fetchAdminUserProfiles` (RPC admin_get_user_profiles) et NON via une
  // table `profiles` : celle-ci n'existe pas dans ce projet — tout le profil
  // vit dans `auth.users.raw_user_meta_data`. L'ancienne requête échouait donc
  // systématiquement, et la dégradation gracieuse masquait le bug : la liste
  // s'affichait, avec le nom de CHAQUE joueuse à null.
  const profileById = await fetchAdminUserProfiles(
    filtered.map((r) => r.auth_user_id)
  );

  const players: FreePlayerOut[] = filtered.map((r) => {
    const linked = !!r.auth_user_id;
    const profile = r.auth_user_id
      ? profileById.get(r.auth_user_id)
      : undefined;
    const isWeb = r.source === 'web';
    return {
      id: r.id,
      source: isWeb ? 'web' : 'discord',
      discordUserId: r.discord_user_id ?? null,
      discordUsername: r.discord_username ?? null,
      linked,
      authUserId: r.auth_user_id ?? null,
      // Le nom saisi sur le formulaire fait foi pour une inscription web ; pour
      // une row Discord on retombe sur le profil du compte lié.
      displayName: r.display_name ?? profile?.display_name ?? null,
      battleTag: profile?.battle_tag ?? null,
      // specialty vit sur team_members ; une joueuse libre n'est par définition
      // pas en équipe, donc toujours null ici. Champ conservé pour un contrat
      // de réponse stable.
      specialty: null,
      roles: normalizeRoles(r.roles),
      level: r.level ?? null,
      availability: r.availability ?? null,
      note: r.note ?? null,
      contact: isWeb
        ? { email: r.contact_email ?? null, discord: r.contact_discord ?? null }
        : null,
    };
  });

  return res.status(200).json({ players });
});
