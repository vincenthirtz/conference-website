// GET /api/bot/v1/role-sync/snapshot
//
// Etat complet "qui doit avoir quel role Discord" cote site. Le bot l'appelle
// au demarrage (rattrapage) ou en periodique (filet de securite) et diffe vs
// l'etat Discord pour appliquer les ajouts/retraits de roles.
//
// Push events (`team.member.added`, `team.member.removed`,
// `team.captain.changed`, `staff.role.changed`) couvrent la reactivite. Le
// snapshot couvre la fiabilite : si un event est perdu (bot down a ce moment),
// la prochaine reconciliation corrige.
//
// Liste tous les comptes Discord LIES (via user_discord_links) avec :
//   - team courante + discord_role_id de l'equipe + capitaine/substitute flags
//   - role staff courant (admin/manager/caster/owner) ou null
//
// Les comptes non-lies ne sont pas dans le snapshot — le bot ne peut rien en
// faire de toute facon.
//
// Auth : x-api-key (BOT_API_KEY).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { logger } from '@/utils/logger';

type SnapshotUser = {
  authUserId: string;
  discordUserId: string;
  discordUsername: string | null;
  team: {
    id: string;
    name: string;
    discordRoleId: string | null;
    isCaptain: boolean;
    isSubstitute: boolean;
    role: string | null;
  } | null;
  staffRole: string | null;
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tenantId = req.botContext!.tenantId;
  // 1) Tous les liens Discord (global table, pas de tenant_id)
  const { data: links, error: linksErr } = await supabaseAdmin!
    .from('user_discord_links')
    .select('auth_user_id, discord_user_id, discord_username');
  if (linksErr) {
    logger.error('[bot/role-sync/snapshot] links error', linksErr);
    return res.status(500).json({ error: 'Erreur de lecture liens' });
  }
  if (!links || links.length === 0) {
    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      users: [],
    });
  }

  const authIds = links.map((l) => l.auth_user_id);

  // 2) team_members pour ces users (au plus un par user — cf. next-match.ts)
  const { data: memberships, error: memErr } = await supabaseAdmin!
    .from('team_members')
    .select(
      'user_id, team_id, role, is_substitute, team:team_id(id, name, captain_id, discord_role_id)'
    )
    .eq('tenant_id', tenantId)
    .in('user_id', authIds);
  if (memErr) {
    logger.error('[bot/role-sync/snapshot] memberships error', memErr);
    return res.status(500).json({ error: 'Erreur de lecture memberships' });
  }

  // 3) staff role pour ces users
  const { data: staffRows, error: staffErr } = await supabaseAdmin!
    .from('staff')
    .select('auth_user_id, role')
    .in('auth_user_id', authIds);
  if (staffErr) {
    logger.error('[bot/role-sync/snapshot] staff error', staffErr);
    return res.status(500).json({ error: 'Erreur de lecture staff' });
  }

  // Indexer pour le merge
  const membershipByUser = new Map<string, any>();
  for (const m of memberships ?? []) {
    membershipByUser.set(m.user_id, m);
  }
  const staffByUser = new Map<string, string>();
  for (const s of staffRows ?? []) {
    if (s.auth_user_id && s.role) staffByUser.set(s.auth_user_id, s.role);
  }

  const users: SnapshotUser[] = links.map((link) => {
    const m = membershipByUser.get(link.auth_user_id);
    const teamRel = m?.team
      ? Array.isArray(m.team)
        ? m.team[0]
        : m.team
      : null;
    return {
      authUserId: link.auth_user_id,
      discordUserId: link.discord_user_id,
      discordUsername: link.discord_username,
      team: teamRel
        ? {
            id: teamRel.id,
            name: teamRel.name,
            discordRoleId: teamRel.discord_role_id ?? null,
            isCaptain: teamRel.captain_id === link.auth_user_id,
            isSubstitute: !!m.is_substitute,
            role: m.role ?? null,
          }
        : null,
      staffRole: staffByUser.get(link.auth_user_id) ?? null,
    };
  });

  return res.status(200).json({
    generatedAt: new Date().toISOString(),
    count: users.length,
    users,
  });
}

// Snapshot peut etre lourd : limite plus stricte que les autres endpoints.
export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 12, key: 'bot-role-sync-snapshot' },
});
