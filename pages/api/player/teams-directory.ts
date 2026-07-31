// pages/api/player/teams-directory.ts
//
// Annuaire d'équipes CONNECTÉ (R4).
//
// Pourquoi une route dédiée plutôt que `/api/teams` : l'annuaire répond à une
// question que la liste publique ne sait pas poser — « qui puis-je affronter,
// maintenant, à mon niveau ? ». Il croise trois sources que le public n'a pas :
//   - la RECHERCHE de scrim vivante de chaque équipe (créneaux datés, R5) ;
//   - le rating d'équipe (team_ratings) pour situer le niveau ;
//   - le recrutement (is_joinable + effectif) pour les joueuses sans équipe.
//
// Il purge aussi les annonces périmées à la lecture (`expireStaleSearches`) :
// l'annuaire est précisément l'endroit où une dispo morte fait du dégât.
//
// Auth : session joueuse (Bearer). Pas de données sensibles — mais la
// disponibilité datée d'une équipe n'a pas à être exposée publiquement.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
import { getManagedTeam } from '@/utils/teams/managementAccess';
import {
  expireStaleSearches,
  isSearchLive,
  overlappingSlots,
  type ScrimSearchRow,
} from '@/utils/teams/scrimSearch';
import { MAX_TEAM_PLAYERS } from '@/utils/constants';
import { logger } from '@/utils/logger';

export type DirectoryTeam = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  slug: string | null;
  country: string | null;
  member_count: number;
  is_joinable: boolean;
  is_full: boolean;
  /** Rating d'équipe dérivé des matchs (null si jamais noté). */
  rating: number | null;
  /** Recherche de scrim vivante, si l'équipe en a une. */
  scrim_search: {
    slots: string[];
    format: string | null;
    note: string | null;
    expires_at: string;
    /** Créneaux communs avec MA propre recherche — le signal le plus actionnable. */
    common_slots: string[];
  } | null;
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
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'teams-directory')
  ) {
    return;
  }

  const tenantId = await resolveTenantIdForUserRequestAsync(req, {
    authUserId: user.id,
  });

  // Purge paresseuse des annonces périmées (pas de cron pour une règle aussi
  // simple, et c'est ici qu'une dispo morte induirait en erreur).
  await expireStaleSearches(tenantId);

  const access = await getManagedTeam(user.id, tenantId);
  const myTeamId = access?.teamId ?? null;

  const { data: teamRows, error: teamsErr } = await supabaseAdmin
    .from('teams')
    .select(
      'id, name, short_name, logo_url, slug, country, is_joinable, team_members(count)'
    )
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name', { ascending: true });

  if (teamsErr) {
    logger.error('[teams-directory] teams error', teamsErr);
    return res.status(500).json({ error: 'Lecture des équipes impossible.' });
  }

  const teams = (teamRows || []) as Array<Record<string, unknown>>;
  const teamIds = teams.map((t) => t.id as string);

  const [searchesRes, ratingsRes] = await Promise.all([
    supabaseAdmin
      .from('scrim_searches')
      .select('team_id, slots, format, note, status, expires_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'active'),
    supabaseAdmin
      .from('team_ratings')
      .select('team_id, rating')
      .eq('tenant_id', tenantId),
  ]);

  const searchByTeam = new Map<string, ScrimSearchRow>();
  for (const row of (searchesRes.data || []) as ScrimSearchRow[]) {
    if (isSearchLive(row)) searchByTeam.set(row.team_id, row);
  }

  const ratingByTeam = new Map<string, number>();
  for (const row of (ratingsRes.data || []) as Array<{
    team_id: string;
    rating: number | null;
  }>) {
    if (typeof row.rating === 'number')
      ratingByTeam.set(row.team_id, row.rating);
  }

  // Mes propres créneaux : c'est ce qui permet d'afficher « 3 créneaux en
  // commun » plutôt qu'une simple pastille « cherche un scrim ».
  const mySlots = myTeamId ? (searchByTeam.get(myTeamId)?.slots ?? []) : [];

  const directory: DirectoryTeam[] = teams
    .filter((t) => (t.id as string) !== myTeamId)
    .map((t) => {
      const id = t.id as string;
      const memberCount =
        (t.team_members as Array<{ count: number }> | undefined)?.[0]?.count ??
        0;
      const search = searchByTeam.get(id) ?? null;
      return {
        id,
        name: t.name as string,
        short_name: (t.short_name as string | null) ?? null,
        logo_url: (t.logo_url as string | null) ?? null,
        slug: (t.slug as string | null) ?? null,
        country: (t.country as string | null) ?? null,
        member_count: memberCount,
        is_joinable: Boolean(t.is_joinable),
        is_full: memberCount >= MAX_TEAM_PLAYERS,
        rating: ratingByTeam.get(id) ?? null,
        scrim_search: search
          ? {
              slots: search.slots || [],
              format: search.format,
              note: search.note,
              expires_at: search.expires_at,
              common_slots: overlappingSlots(mySlots, search.slots || []),
            }
          : null,
      };
    });

  // Tri : d'abord les créneaux en commun (le plus actionnable), puis les
  // équipes qui cherchent un scrim, puis l'alphabétique. L'ordre porte
  // l'information — il n'y a pas de tri « neutre » utile ici.
  directory.sort((a, b) => {
    const ac = a.scrim_search?.common_slots.length ?? 0;
    const bc = b.scrim_search?.common_slots.length ?? 0;
    if (ac !== bc) return bc - ac;
    const as = a.scrim_search ? 0 : 1;
    const bs = b.scrim_search ? 0 : 1;
    if (as !== bs) return as - bs;
    return a.name.localeCompare(b.name);
  });

  res.setHeader('Cache-Control', 'private, max-age=15');
  return res.status(200).json({
    teams: directory,
    myTeamId,
    hasOwnSearch: mySlots.length > 0,
  });
});
