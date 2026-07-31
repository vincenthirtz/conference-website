// pages/api/player/scouting.ts
//
// Dossier d'adversaire (N5) — `GET /api/player/scouting?team=<uuid>`.
//
// À J-1 d'un match, une équipe n'avait aucune préparation possible depuis le
// site. Tout existait pourtant en base, éparpillé et jamais recomposé.
//
// LA LIGNE DE CONFIDENTIALITÉ, qui décide de tout le reste :
//
//   - ce qui vient de l'ADVERSAIRE se limite à des RÉSULTATS, publics et connus
//     des deux camps — jamais ses revues (N2), jamais son rythme déclaré (N1),
//     jamais son roster interne. Ses « créneaux habituels » sont dérivés des
//     heures RÉELLEMENT jouées, pas d'une disponibilité déclarée : ce qu'on a
//     joué est public, ce qu'on a déclaré ne l'est pas ;
//   - ce qui vient de MOI peut être privé, puisque c'est le mien. Les revues
//     que mon équipe a écrites sur cet adversaire sont donc jointes au dossier :
//     c'est la matière la plus utile d'une préparation, et la laisser sur un
//     autre écran reviendrait à ne pas la préparer.
//
// Le rating et la fiabilité sont repris tels quels de l'annuaire (R4/R10) —
// déjà exposés là-bas, donc rien de neuf n'est divulgué ici.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
import { findMemberTeam } from '@/utils/teams/memberTeam';
import { loadPlayedGames } from '@/utils/teams/playedGames';
import {
  buildScoutingReport,
  type ScoutingReport,
} from '@/utils/teams/scouting';
import {
  EMPTY_RELIABILITY,
  loadTeamReliability,
  type TeamReliability,
} from '@/utils/teams/reliability';
import { loadMyRhythmTimezone } from '@/utils/teams/teamRhythmStore';
import { getTimeZoneOffsetMinutes } from '@/utils/timezone';
import { logger } from '@/utils/logger';

export type ScoutingResponse = {
  myTeam: { id: string; name: string };
  target: {
    id: string;
    name: string;
    shortName: string | null;
    logoUrl: string | null;
    slug: string | null;
    country: string | null;
    rating: number | null;
    reliability: TeamReliability;
  };
  report: ScoutingReport;
  /** Noms des adversaires communs, pour rendre la section lisible. */
  teamNames: Record<string, string>;
  /** MES revues sur cette équipe (N2) — privées, donc consultables par moi. */
  myNotes: Array<{
    subjectType: 'match' | 'scrim';
    subjectId: string;
    playedAt: string | null;
    vodUrl: string | null;
    notes: string | null;
  }>;
  /** Fuseau dans lequel les créneaux habituels sont exprimés. */
  timezone: string;
};

function safeTimezone(input: unknown): string | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  const tz = input.trim();
  if (tz.length > 64) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return null;
  }
}

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'scouting')) {
    return;
  }

  const targetId =
    typeof req.query.team === 'string' ? req.query.team.trim() : '';
  if (!targetId) {
    return res.status(400).json({ error: 'Équipe cible manquante.' });
  }

  const tenantId = await resolveTenantIdForUserRequestAsync(req, {
    authUserId: user.id,
  });

  const myTeam = await findMemberTeam(user.id, tenantId);
  if (!myTeam) {
    return res
      .status(403)
      .json({ error: 'Tu dois appartenir à une équipe active.' });
  }
  if (myTeam.id === targetId) {
    // Se scouter soi-même n'a pas de sens et produirait un dossier absurde
    // (confrontations directes contre soi).
    return res
      .status(400)
      .json({ error: 'Choisis une autre équipe que la tienne.' });
  }

  const { data: targetRow, error: targetErr } = await supabaseAdmin
    .from('teams')
    .select(
      'id, name, short_name, logo_url, slug, country, is_active, deleted_at'
    )
    .eq('id', targetId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (targetErr) {
    logger.error('[scouting] target error', targetErr);
    return res.status(500).json({ error: "Lecture de l'équipe impossible." });
  }
  const target = targetRow as {
    id: string;
    name: string;
    short_name: string | null;
    logo_url: string | null;
    slug: string | null;
    country: string | null;
    is_active: boolean | null;
    deleted_at: string | null;
  } | null;
  if (!target || target.deleted_at || target.is_active === false) {
    return res.status(404).json({ error: 'Équipe introuvable.' });
  }

  const timezone =
    (await loadMyRhythmTimezone(tenantId, user.id)) ||
    safeTimezone(req.query.tz) ||
    'Europe/Paris';

  const [myGames, theirGames, ratingRes, reliability, notesRes] =
    await Promise.all([
      loadPlayedGames(tenantId, myTeam.id),
      loadPlayedGames(tenantId, target.id),
      supabaseAdmin
        .from('team_ratings')
        .select('rating')
        .eq('tenant_id', tenantId)
        .eq('team_id', target.id)
        .maybeSingle(),
      loadTeamReliability(tenantId, target.id),
      // MES revues sur cet adversaire. Scopées à MON équipe : la requête ne
      // peut pas remonter celles d'autrui, même par accident.
      supabaseAdmin
        .from('team_reviews')
        .select('subject_type, subject_id, played_at, vod_url, notes')
        .eq('tenant_id', tenantId)
        .eq('team_id', myTeam.id)
        .eq('opponent_team_id', target.id)
        .order('played_at', { ascending: false }),
    ]);

  const offsetMinutes = getTimeZoneOffsetMinutes(new Date(), timezone);

  const report = buildScoutingReport(
    myTeam.id,
    target.id,
    myGames,
    theirGames,
    offsetMinutes
  );

  // Noms des adversaires communs — sans eux, la section n'est qu'une liste
  // d'UUID, c'est-à-dire rien.
  const teamNames: Record<string, string> = {};
  const commonIds = report.commonOpponents.map((c) => c.teamId);
  if (commonIds.length > 0) {
    const { data: nameRows } = await supabaseAdmin
      .from('teams')
      .select('id, name')
      .in('id', commonIds);
    for (const row of (nameRows || []) as Array<{ id: string; name: string }>) {
      teamNames[row.id] = row.name;
    }
  }

  const payload: ScoutingResponse = {
    myTeam,
    target: {
      id: target.id,
      name: target.name,
      shortName: target.short_name,
      logoUrl: target.logo_url,
      slug: target.slug,
      country: target.country,
      rating:
        typeof (ratingRes.data as { rating?: number } | null)?.rating ===
        'number'
          ? ((ratingRes.data as { rating: number }).rating ?? null)
          : null,
      reliability: reliability ?? EMPTY_RELIABILITY,
    },
    report,
    teamNames,
    myNotes: ((notesRes.data || []) as Array<Record<string, unknown>>).map(
      (row) => ({
        subjectType: row.subject_type as 'match' | 'scrim',
        subjectId: row.subject_id as string,
        playedAt: (row.played_at as string | null) ?? null,
        vodUrl: (row.vod_url as string | null) ?? null,
        notes: (row.notes as string | null) ?? null,
      })
    ),
    timezone,
  };

  res.setHeader('Cache-Control', 'private, max-age=30');
  return res.status(200).json(payload);
});
