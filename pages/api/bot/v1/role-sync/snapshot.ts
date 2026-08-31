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
//   - `teams[]` : TOUTES les equipes du compte (discord_role_id, flags
//     capitaine/substitute, role d'equipe). Un manager peut en encadrer
//     plusieurs : le bot doit alors poser les deux roles, pas un seul.
//   - `team` : l'appartenance principale, conservee pour la compat descendante
//     (un bot pas encore deploye ne lit que ce champ).
//   - role staff courant (admin/manager/caster/owner) ou null
//
// Les comptes non-lies ne sont pas dans le snapshot — le bot ne peut rien en
// faire de toute facon.
//
// Auth : x-api-key (BOT_API_KEY).

import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { logger } from '@/utils/logger';
import { pickMembership } from '@/utils/teams/memberships';

type SnapshotTeam = {
  id: string;
  name: string;
  discordRoleId: string | null;
  isCaptain: boolean;
  isSubstitute: boolean;
  role: string | null;
};

type SnapshotUser = {
  authUserId: string;
  discordUserId: string;
  discordUsername: string | null;
  /** TOUTES les appartenances du compte (un manager peut en encadrer plusieurs). */
  teams: SnapshotTeam[];
  /** Appartenance principale — compat descendante, cf. pickMembership. */
  team: SnapshotTeam | null;
  staffRole: string | null;
};

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const tenantId = req.botContext.tenantId;
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

  // 2) team_members pour ces users. PLUSIEURS lignes possibles par compte :
  //    l'index unique (tenant_id, user_id) est PARTIEL et exempte le rôle
  //    `manager` (cf. utils/teams/memberships.ts), donc une manager peut
  //    encadrer deux équipes — et doit porter les deux rôles Discord.
  const { data: memberships, error: memErr } = await supabaseAdmin!
    .from('team_members')
    .select(
      'user_id, team_id, role, is_substitute, team:team_id(id, name, captain_id, discord_role_id)'
    )
    .eq('tenant_id', tenantId)
    .in('user_id', authIds)
    // Ordre stable : `pickMembership` retombe sur la premiere ligne, elle doit
    // etre la plus ancienne — sinon `team` sauterait d'un cycle a l'autre.
    .order('created_at', { ascending: true });
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

  // Indexer pour le merge : une LISTE par compte (un Map<user, membership>
  // écrasait silencieusement toutes les appartenances sauf la dernière — le
  // bot ne voyait alors qu'une équipe et retirait le rôle de l'autre).
  const membershipsByUser = new Map<string, any[]>();
  for (const m of memberships ?? []) {
    const list = membershipsByUser.get(m.user_id);
    if (list) list.push(m);
    else membershipsByUser.set(m.user_id, [m]);
  }
  const staffByUser = new Map<string, string>();
  for (const s of staffRows ?? []) {
    if (s.auth_user_id && s.role) staffByUser.set(s.auth_user_id, s.role);
  }

  const users: SnapshotUser[] = links.map((link) => {
    const rows = membershipsByUser.get(link.auth_user_id) ?? [];
    const teams: SnapshotTeam[] = [];
    for (const m of rows) {
      const teamRel = m?.team ? (Array.isArray(m.team) ? m.team[0] : m.team) : null;
      if (!teamRel) continue;
      teams.push({
        id: teamRel.id,
        name: teamRel.name,
        discordRoleId: teamRel.discord_role_id ?? null,
        isCaptain: teamRel.captain_id === link.auth_user_id,
        isSubstitute: !!m.is_substitute,
        role: m.role ?? null,
      });
    }
    // `team` = appartenance principale, pour un bot pas encore à jour.
    const primaryRow = pickMembership(
      rows as { team_id: string; role?: string | null }[]
    );
    const primary =
      (primaryRow && teams.find((t) => t.id === primaryRow.team_id)) || teams[0] || null;
    return {
      authUserId: link.auth_user_id,
      discordUserId: link.discord_user_id,
      discordUsername: link.discord_username,
      teams,
      team: primary,
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
