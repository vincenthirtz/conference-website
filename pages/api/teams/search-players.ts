// pages/api/teams/search-players.ts
// Recherche de joueurs par email ou BattleTag pour les capitaines

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import {
  consumeDurableRateLimit,
  clientKeyFromReq,
} from '@/utils/durableRateLimit';
import { escapePostgrestValue } from '@/utils/apiHelpers';
import { withSubjectRoute, type SubjectContext } from '@/utils/subject';
import {
  assertTeamPermission,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import { getManagedTeamForRequest } from '@/utils/teams/teamScope';
import { fetchAdminUserProfiles } from '@/utils/adminUserProfiles';

import { logger } from '../../../utils/logger';
type PlayerResult = {
  id: string;
  email: string | null;
  display_name: string | null;
  battle_tag: string | null;
  has_team: boolean;
};

type SearchResponse = { players: PlayerResult[] } | { error: string };

// `withSubjectRoute` (et pas `withAuthRoute`) : le cockpit staff /admin/teams/my
// pilote l'équipe SÉLECTIONNÉE, pas celle de l'appelant. Il passe donc
// `?as=<capitaine>` et la recherche s'évalue avec les droits de cette
// capitaine — le gate `getManagedTeam` ci-dessous tourne toujours, sur le
// SUJET. GET uniquement, donc pas d'`allowActAs` : c'est de la consultation,
// tracée en `view_captain_data`.
export default withSubjectRoute(handler, {
  tenantResolution: 'async',
  auditAction: 'view_captain_data',
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SearchResponse>,
  { subject }: { subject: SubjectContext }
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting: 30 searches per minute (L1 mémoire, fail-fast per-process).
  if (
    applyRateLimit(req, res, { max: 30, windowMs: 60 * 1000 }, 'search-players')
  )
    return;

  // L2 — limiteur durable cross-instance (le Map L1 est per-process). FAIL-OPEN
  // si le RPC erre/absent : ne casse jamais la recherche.
  const durableAllowed = await consumeDurableRateLimit(
    `searchplayers:${clientKeyFromReq(req)}`,
    60,
    30
  );
  if (!durableAllowed) {
    res.setHeader('Retry-After', '60');
    return res
      .status(429)
      .json({ error: 'Trop de requêtes. Réessayez plus tard.' });
  }

  const { userId, tenantId } = subject;

  // Check if user can manage a team (captain or manager)
  const access = await getManagedTeamForRequest(req, userId, tenantId);
  if (!access) {
    return res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
  }

  // Permission fine (R2) : le rôle doit couvrir `manage_roster` — un rôle
  // à privilèges partiels n'ouvre plus l'ensemble de la gestion d'équipe.
  const denied = assertTeamPermission(access, 'manage_roster');
  if (denied) return res.status(denied.status).json({ error: denied.error });

  const { q } = req.query;
  const query = typeof q === 'string' ? q.trim() : '';

  if (!query || query.length < 2) {
    return res
      .status(400)
      .json({ error: 'Query must be at least 2 characters' });
  }

  if (query.length > 100) {
    return res
      .status(400)
      .json({ error: 'Query too long (max 100 characters)' });
  }

  const safeQuery = escapePostgrestValue(query);

  try {
    // SÉCURITÉ — scoping tenant strict.
    //
    // L'ancienne implémentation énumérait `auth.users` (listUsers perPage:50)
    // puis filtrait en mémoire. Problème : `auth.users` est GLOBAL à toute
    // l'instance Supabase (tous tenants confondus) → fuite d'emails d'autres
    // tenants + recherche non déterministe (on ne voyait que les 50 premiers
    // users tous tenants). Deux sources, toutes deux non énumérables :
    //   1. `team_members` filtré par tenant_id — recherche par sous-chaîne sur
    //      battle_tag / display_name, donc bornée au tenant courant ;
    //   2. l'adresse email EXACTE (cf. plus bas) — pas de sous-chaîne, donc
    //      aucun balayage possible.
    // Les emails ne sont résolus (via le RPC batch admin_get_user_profiles) QUE
    // pour des candidats déjà confirmés du tenant courant, donc aucun email
    // cross-tenant ne peut être renvoyé par la source 1.
    type Candidate = {
      id: string;
      email: string | null;
      display_name: string | null;
      battle_tag_hint: string | null;
    };
    const candidates: Candidate[] = [];
    const seenUserIds = new Set<string>();

    // 1) Recherche par battle_tag / display_name dans team_members (scopé tenant)
    const { data: membersByTag } = await supabaseAdmin
      .from('team_members')
      .select('user_id, battle_tag, display_name, team_id')
      .eq('tenant_id', tenantId)
      .or(`battle_tag.ilike.%${safeQuery}%,display_name.ilike.%${safeQuery}%`)
      .limit(20);

    if (membersByTag) {
      for (const member of membersByTag) {
        if (member.user_id && !seenUserIds.has(member.user_id)) {
          seenUserIds.add(member.user_id);
          candidates.push({
            id: member.user_id,
            email: null,
            display_name: member.display_name || null,
            battle_tag_hint: member.battle_tag || null,
          });
        }
      }
    }

    // 2) Recherche par EMAIL EXACT.
    //
    // L'étape 1 ne peut trouver QUE des joueuses déjà membres d'une équipe du
    // tenant — c'est la seule table tenant-scopée qui existe. Or cet écran sert
    // précisément à ajouter quelqu'un qui n'y est pas encore : une joueuse sans
    // équipe était introuvable, y compris avec son adresse complète (le
    // placeholder promet pourtant « email@example.com »). L'ancienne 2ᵉ source
    // visait `profiles`, une table qui n'existe dans AUCUN schéma : la requête
    // partait en erreur, ignorée silencieusement, à chaque frappe.
    //
    // On rétablit ce chemin sans rouvrir la fuite d'énumération qui avait fait
    // supprimer `listUsers` : match sur l'adresse EXACTE, jamais une
    // sous-chaîne. On ne peut donc que CONFIRMER une adresse déjà connue, pas
    // balayer l'annuaire. Le RPC fait un LIKE côté SQL ; tout ce qui n'est pas
    // l'égalité stricte est jeté ici.
    const emailNeedle = query.includes('@') ? query.toLowerCase() : null;
    if (emailNeedle) {
      const { data: byEmail, error: rpcErr } = await supabaseAdmin.rpc(
        'admin_search_users',
        { p_query: emailNeedle }
      );
      if (rpcErr) {
        logger.error('[api/teams/search-players] admin_search_users:', rpcErr);
      }
      for (const row of (byEmail ?? []) as {
        id?: string;
        email?: string | null;
        display_name?: string | null;
        battle_tag?: string | null;
      }[]) {
        if (!row?.id || seenUserIds.has(row.id)) continue;
        if (String(row.email ?? '').toLowerCase() !== emailNeedle) continue;
        seenUserIds.add(row.id);
        candidates.push({
          id: row.id,
          email: row.email ?? null,
          display_name: row.display_name ?? null,
          battle_tag_hint: row.battle_tag ?? null,
        });
      }
    }

    // Cap candidates before batch-fetching
    const limitedCandidates = candidates.slice(0, 20);
    const candidateIds = limitedCandidates.map((c) => c.id);

    // Batch-fetch team memberships in a single query (avoids N+1)
    const membershipMap = new Map<
      string,
      { battle_tag: string | null; has_team: boolean }
    >();
    if (candidateIds.length > 0) {
      const { data: allMemberships } = await supabaseAdmin
        .from('team_members')
        .select('user_id, battle_tag')
        .eq('tenant_id', tenantId)
        .in('user_id', candidateIds);

      if (allMemberships) {
        for (const m of allMemberships) {
          if (m.user_id) {
            membershipMap.set(m.user_id, {
              battle_tag: m.battle_tag || null,
              has_team: true,
            });
          }
        }
      }
    }

    // Résolution des emails : UNIQUEMENT pour les candidats confirmés comme
    // membres du tenant courant (présents dans membershipMap). On ne résout
    // jamais l'email d'un id qui ne participe pas au tenant — un id remonté
    // par `profiles` (table non scopée) sans appartenance au tenant reste avec
    // email = null. C'est le garde-fou anti-fuite cross-tenant.
    const needsAuth = limitedCandidates.filter(
      (c) => !c.email && membershipMap.has(c.id)
    );
    // Batch-resolve emails/display_names in ONE RPC instead of N getUserById
    // round-trips. Unknown ids stay absent (email/display_name remain null).
    const authMap = new Map<
      string,
      { email: string | null; display_name: string | null }
    >();
    const authProfiles = await fetchAdminUserProfiles(
      needsAuth.map((c) => c.id)
    );
    for (const c of needsAuth) {
      const p = authProfiles.get(c.id);
      if (p) {
        authMap.set(c.id, {
          email: p.email || null,
          display_name: p.display_name || null,
        });
      }
    }

    // Assemble final results
    const players: PlayerResult[] = limitedCandidates.map((c) => {
      const membership = membershipMap.get(c.id);
      const auth = authMap.get(c.id);
      return {
        id: c.id,
        email: c.email || auth?.email || null,
        display_name: c.display_name || auth?.display_name || null,
        battle_tag: membership?.battle_tag || c.battle_tag_hint || null,
        has_team: membership?.has_team || false,
      };
    });

    return res.status(200).json({ players });
  } catch (err: unknown) {
    logger.error('[api/teams/search-players] error:', err);
    return res.status(500).json({ error: 'Search failed' });
  }
}
