// pages/api/caster/briefing/[matchId].ts
//
// Feature: Run-of-show — Lot 2.
// GET : briefing automatique pour le caster — compos des 2 equipes, H2H,
// news recentes liees aux equipes.
//
// Auth : withCasterRoute. Cross-tenant ferme : le match doit etre dans le
// meme tenant que le caster (sinon 404, pas 403 pour ne pas leaker
// l'existence d'un match dans un autre tenant).
//
// Data shape :
// {
//   match: { id, scheduledAt, status, matchFormat, roundName, tournamentName },
//   teams: [
//     { id, name, shortName, logoUrl, country, members: [{ battle_tag, role, is_captain, is_substitute }] }
//   ],
//   headToHead: { totalMeetings, aWins, bWins, draws, lastPlayedAt, lastMatchId },
//   recentNews: [{ id, title, slug, tag, publishedAt, excerpt }]
// }
//
// Logique news : news n'a pas de FK vers team, mais une colonne `tag` (slug
// libre). On filtre les news publiees du tenant dont le `tag` matche le slug
// du nom complet ou du short_name d'une des 2 equipes.

import type { NextApiRequest, NextApiResponse } from 'next';
import slugify from 'slugify';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import {
  withCasterRoute,
  type AuthenticatedCasterContext,
} from '@/utils/casterAuth';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

type TeamMember = {
  id: string;
  battle_tag: string | null;
  role: string;
  is_substitute: boolean;
  is_captain: boolean;
  is_manager: boolean;
};

type TeamRaw = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  country: string | null;
  captain_id: string | null;
};

function teamNameTags(t: TeamRaw | null): string[] {
  if (!t) return [];
  const tags = new Set<string>();
  if (t.name) tags.add(slugify(t.name, { lower: true, strict: true }));
  if (t.short_name)
    tags.add(slugify(t.short_name, { lower: true, strict: true }));
  return [...tags].filter(Boolean);
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedCasterContext
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'caster-briefing')
  )
    return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service unavailable.' });
  }
  const admin = supabaseAdmin;

  const { matchId } = req.query;
  if (!matchId || Array.isArray(matchId) || !isValidUUID(matchId)) {
    return res.status(400).json({ error: 'Invalid matchId.' });
  }

  // SECURITE CRITIQUE : on scope par tenant_id du caster. Un match d'un autre
  // tenant doit renvoyer 404 (pas 403 — ne pas leaker l'existence).
  const { data: match, error: matchErr } = await admin
    .from('matches')
    .select(
      `
      id, status, match_format, round_name, scheduled_at,
      team1_id, team2_id,
      team1:team1_id(id, name, short_name, logo_url, country, captain_id),
      team2:team2_id(id, name, short_name, logo_url, country, captain_id),
      tournament:tournament_id(id, name, slug)
      `
    )
    .eq('id', matchId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (matchErr) {
    logger.error('[caster/briefing] match lookup error', matchErr);
    return res.status(500).json({ error: 'Failed to load match.' });
  }
  if (!match) {
    return res.status(404).json({ error: 'Match not found.' });
  }

  const team1 = (
    Array.isArray(match.team1) ? match.team1[0] : match.team1
  ) as TeamRaw | null;
  const team2 = (
    Array.isArray(match.team2) ? match.team2[0] : match.team2
  ) as TeamRaw | null;
  const tournament = Array.isArray(match.tournament)
    ? match.tournament[0]
    : match.tournament;

  // Rosters.
  const teamIds = [match.team1_id, match.team2_id].filter(
    (x): x is string => !!x
  );
  const team1Members: TeamMember[] = [];
  const team2Members: TeamMember[] = [];

  if (teamIds.length > 0) {
    const { data: members } = await admin
      .from('team_members')
      .select('id, team_id, user_id, role, battle_tag, is_substitute')
      .eq('tenant_id', ctx.tenantId)
      .in('team_id', teamIds);

    for (const m of members ?? []) {
      const enriched: TeamMember = {
        id: m.id as string,
        battle_tag: (m.battle_tag as string | null) ?? null,
        role: m.role as string,
        is_substitute: !!m.is_substitute,
        is_captain:
          (m.team_id === match.team1_id && team1?.captain_id === m.user_id) ||
          (m.team_id === match.team2_id && team2?.captain_id === m.user_id),
        is_manager: m.role === 'manager',
      };
      if (m.team_id === match.team1_id) team1Members.push(enriched);
      else if (m.team_id === match.team2_id) team2Members.push(enriched);
    }
    const sortMembers = (a: TeamMember, b: TeamMember) => {
      if (a.is_captain !== b.is_captain) return a.is_captain ? -1 : 1;
      if (a.is_manager !== b.is_manager) return a.is_manager ? -1 : 1;
      if (a.is_substitute !== b.is_substitute) return a.is_substitute ? 1 : -1;
      return (a.battle_tag || '').localeCompare(b.battle_tag || '');
    };
    team1Members.sort(sortMembers);
    team2Members.sort(sortMembers);
  }

  // H2H.
  let aWins = 0;
  let bWins = 0;
  let draws = 0;
  let totalMeetings = 0;
  let lastPlayedAt: string | null = null;
  let lastMatchId: string | null = null;

  if (match.team1_id && match.team2_id) {
    const a = match.team1_id as string;
    const b = match.team2_id as string;
    const { data: pastMatches } = await admin
      .from('matches')
      .select('id, team1_id, team2_id, winner_team_id, completed_at, status')
      .or(
        `and(team1_id.eq.${a},team2_id.eq.${b}),and(team1_id.eq.${b},team2_id.eq.${a})`
      )
      .eq('tenant_id', ctx.tenantId)
      .in('status', ['finished', 'walkover'])
      .neq('id', matchId)
      .order('completed_at', { ascending: false })
      .limit(50);

    for (const pm of pastMatches ?? []) {
      totalMeetings += 1;
      if (pm.winner_team_id === a) aWins += 1;
      else if (pm.winner_team_id === b) bWins += 1;
      else draws += 1;
      if (!lastPlayedAt && pm.completed_at) {
        lastPlayedAt = pm.completed_at as string;
        lastMatchId = pm.id as string;
      }
    }
  }

  // News recentes : on filtre par tag matchant les slugs des noms d'equipe.
  const teamTags = [...teamNameTags(team1), ...teamNameTags(team2)];
  let recentNews: Array<{
    id: string;
    title: string;
    slug: string;
    tag: string | null;
    publishedAt: string | null;
    excerpt: string | null;
  }> = [];

  if (teamTags.length > 0) {
    const { data: news } = await admin
      .from('news')
      .select('id, title, slug, tag, published_at, excerpt')
      .eq('tenant_id', ctx.tenantId)
      .eq('status', 'published')
      .in('tag', teamTags)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(10);
    recentNews =
      (news ?? []).map((n) => ({
        id: n.id as string,
        title: n.title as string,
        slug: n.slug as string,
        tag: (n.tag as string | null) ?? null,
        publishedAt: (n.published_at as string | null) ?? null,
        excerpt: (n.excerpt as string | null) ?? null,
      })) ?? [];
  }

  return res.status(200).json({
    match: {
      id: match.id,
      scheduledAt: match.scheduled_at,
      status: match.status,
      matchFormat: match.match_format,
      roundName: match.round_name,
      tournament: tournament
        ? {
            id: (tournament as Record<string, unknown>).id,
            name: (tournament as Record<string, unknown>).name,
            slug: (tournament as Record<string, unknown>).slug,
          }
        : null,
    },
    teams: [
      team1
        ? {
            id: team1.id,
            name: team1.name,
            shortName: team1.short_name,
            logoUrl: team1.logo_url,
            country: team1.country,
            members: team1Members,
          }
        : null,
      team2
        ? {
            id: team2.id,
            name: team2.name,
            shortName: team2.short_name,
            logoUrl: team2.logo_url,
            country: team2.country,
            members: team2Members,
          }
        : null,
    ].filter(Boolean),
    headToHead: {
      totalMeetings,
      aWins,
      bWins,
      draws,
      lastPlayedAt,
      lastMatchId,
    },
    recentNews,
  });
}

export default withCasterRoute(handler);
