// pages/api/player/team-reviews.ts
//
// Mémoire d'équipe (N2) — revues des matchs et scrims joués.
//
// GET    : la chronologie des affrontements passés de mon équipe, chacun avec
//          sa revue (ou `null`), plus la liste des adversaires rencontrés.
//          Le filtrage par adversaire est laissé au client : l'historique tient
//          en quelques dizaines de lignes, et « qu'avait-on noté contre X ? »
//          doit répondre instantanément, pas en un aller-retour réseau.
// PUT    : écrire / mettre à jour la revue d'un affrontement.
// DELETE : effacer une revue.
//
// AUTORISATION : ouverte à tout MEMBRE, comme le rythme d'équipe. Une revue est
// le document partagé de l'équipe ; réserver l'écriture à la capitaine ferait
// de la mémoire collective le carnet d'une seule personne.
//
// CONFIDENTIALITÉ : une revue ne sort JAMAIS de l'équipe qui l'écrit. Aucune
// surface publique ne la lit, et cette route ne renvoie que les revues de
// l'équipe de l'appelant.
//
// SÉCURITÉ D'ÉCRITURE : `opponent_team_id` et `played_at` sont dérivés du sujet
// côté serveur, jamais lus dans le body. Et le sujet doit appartenir à mon
// équipe — sans cette vérification, n'importe qui pourrait accrocher une revue
// au match d'une autre équipe et polluer son historique.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
import { findMemberTeam } from '@/utils/teams/memberTeam';
import {
  buildEncounterHistory,
  isReviewSubjectType,
  normalizeReviewContent,
  type Encounter,
  type EncounterInput,
  type ReviewSubjectType,
} from '@/utils/teams/teamReviews';
import { logger } from '@/utils/logger';

/** Profondeur d'historique : au-delà, personne ne fait défiler. */
const HISTORY_LIMIT = 60;

export type TeamReviewsResponse = {
  teamId: string | null;
  teamName: string | null;
  encounters: Encounter[];
  /** Adversaires rencontrés, pour le filtre. */
  opponents: Array<{ id: string; name: string; count: number }>;
  reviewedCount: number;
};

type Row = Record<string, unknown>;

/**
 * Affrontements JOUÉS d'une équipe, matchs et scrims ramenés à la même forme.
 *
 * Un seul chargeur paramétré plutôt que deux : les deux tables portent le même
 * couple team1/team2 et se lisent exactement pareil ; les dupliquer garantirait
 * qu'une correction n'atterrisse que d'un côté.
 */
async function loadEncounters(
  tenantId: string,
  teamId: string,
  subjectType: ReviewSubjectType
): Promise<EncounterInput[]> {
  const isMatch = subjectType === 'match';
  const table = isMatch ? 'matches' : 'scrims';
  const dateColumn = isMatch ? 'scheduled_at' : 'scheduled_date';
  const labelColumn = isMatch ? 'round_name' : 'name';
  const playedStatus = isMatch ? 'finished' : 'completed';

  const { data, error } = await supabaseAdmin
    .from(table)
    .select(
      `id, status, completed_at, team1_id, team2_id, team1_score, team2_score, winner_team_id, ${dateColumn}, ${labelColumn}`
    )
    .eq('tenant_id', tenantId)
    .eq('status', playedStatus)
    .is('deleted_at', null)
    .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
    .order(dateColumn, { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) {
    logger.error(`[team-reviews] ${table} error`, error);
    return [];
  }

  return (
    ((data || []) as Row[])
      // Garde d'appartenance redondante avec le `.or` ci-dessus, et VOULUE : la
      // liste ne doit jamais contenir l'affrontement d'une autre équipe, et une
      // garantie qui ne tient qu'à une chaîne de filtre passée au serveur n'est
      // pas vérifiable ici. Le coût est nul, la propriété devient locale.
      .filter((row) => row.team1_id === teamId || row.team2_id === teamId)
      .map((row) => {
        const isTeam1 = row.team1_id === teamId;
        const myScore = (isTeam1 ? row.team1_score : row.team2_score) as
          | number
          | null;
        const oppScore = (isTeam1 ? row.team2_score : row.team1_score) as
          | number
          | null;
        return {
          subjectType,
          subjectId: row.id as string,
          playedAt:
            ((row.completed_at as string | null) ??
              (row[dateColumn] as string | null)) ||
            null,
          opponentTeamId:
            ((isTeam1 ? row.team2_id : row.team1_id) as string | null) ?? null,
          opponentName: null,
          myScore: myScore ?? null,
          opponentScore: oppScore ?? null,
          result: resultOf(row.winner_team_id as string | null, teamId),
          label: (row[labelColumn] as string | null) ?? null,
        };
      })
  );
}

function resultOf(
  winnerTeamId: string | null,
  teamId: string
): 'win' | 'loss' | 'draw' | null {
  if (!winnerTeamId) return null;
  return winnerTeamId === teamId ? 'win' : 'loss';
}

/**
 * Le sujet appartient-il bien à mon équipe, et est-il joué ?
 * Renvoie les dérivés à stocker, ou `null` si l'écriture doit être refusée.
 */
async function resolveSubject(
  tenantId: string,
  teamId: string,
  subjectType: ReviewSubjectType,
  subjectId: string
): Promise<{ opponentTeamId: string | null; playedAt: string | null } | null> {
  const table = subjectType === 'match' ? 'matches' : 'scrims';
  const dateColumn =
    subjectType === 'match' ? 'scheduled_at' : 'scheduled_date';

  const { data, error } = await supabaseAdmin
    .from(table)
    .select(`id, team1_id, team2_id, completed_at, ${dateColumn}`)
    .eq('id', subjectId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) {
    logger.error('[team-reviews] subject lookup error', error);
    return null;
  }
  const row = data as Row | null;
  if (!row) return null;
  if (row.team1_id !== teamId && row.team2_id !== teamId) return null;

  const opponentTeamId =
    ((row.team1_id === teamId ? row.team2_id : row.team1_id) as
      | string
      | null) ?? null;
  const playedAt =
    ((row.completed_at as string | null) ??
      (row[dateColumn] as string | null)) ||
    null;

  return { opponentTeamId, playedAt };
}

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  const isGet = req.method === 'GET';
  const isPut = req.method === 'PUT';
  const isDelete = req.method === 'DELETE';
  if (!isGet && !isPut && !isDelete) {
    res.setHeader('Allow', 'GET, PUT, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(
      req,
      res,
      isGet ? { max: 60, windowMs: 60_000 } : { max: 30, windowMs: 60_000 },
      'team-reviews'
    )
  ) {
    return;
  }

  const tenantId = await resolveTenantIdForUserRequestAsync(req, {
    authUserId: user.id,
  });

  const team = await findMemberTeam(user.id, tenantId);
  if (!team) {
    if (isGet) {
      // Pas d'équipe : pas d'erreur, simplement aucune mémoire.
      return res.status(200).json({
        teamId: null,
        teamName: null,
        encounters: [],
        opponents: [],
        reviewedCount: 0,
      } satisfies TeamReviewsResponse);
    }
    return res
      .status(403)
      .json({ error: 'Tu dois appartenir à une équipe active.' });
  }

  /* ------------------------------------------------------------ écriture */
  if (isPut || isDelete) {
    const source = (isDelete ? req.query : (req.body ?? {})) as {
      subjectType?: unknown;
      subjectId?: unknown;
      vodUrl?: unknown;
      notes?: unknown;
    };

    if (!isReviewSubjectType(source.subjectType)) {
      return res.status(400).json({ error: 'Type de sujet invalide.' });
    }
    const subjectId =
      typeof source.subjectId === 'string' ? source.subjectId.trim() : '';
    if (!subjectId) {
      return res.status(400).json({ error: 'Sujet manquant.' });
    }

    // Une requête neuve à chaque appel : un builder Supabase ne se rejoue pas.
    const removeReview = () =>
      supabaseAdmin
        .from('team_reviews')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('team_id', team.id)
        .eq('subject_type', source.subjectType as ReviewSubjectType)
        .eq('subject_id', subjectId);

    if (isDelete) {
      const { error } = await removeReview();
      if (error) {
        logger.error('[team-reviews] delete error', error);
        return res.status(500).json({ error: 'Suppression impossible.' });
      }
      return res.status(200).json({ ok: true, review: null });
    }

    const normalized = normalizeReviewContent(source);
    if (!normalized.ok) {
      return res.status(400).json({ error: normalized.error });
    }

    // Une revue vidée est SUPPRIMÉE, pas conservée en coquille : sinon la liste
    // afficherait « déjà débriefé » pour une entrée sans contenu.
    if (normalized.isEmpty) {
      const { error } = await removeReview();
      if (error) {
        logger.error('[team-reviews] empty delete error', error);
        return res.status(500).json({ error: 'Suppression impossible.' });
      }
      return res.status(200).json({ ok: true, review: null });
    }

    const subject = await resolveSubject(
      tenantId,
      team.id,
      source.subjectType,
      subjectId
    );
    if (!subject) {
      return res
        .status(404)
        .json({ error: "Cet affrontement n'est pas celui de ton équipe." });
    }

    const { error } = await supabaseAdmin.from('team_reviews').upsert(
      {
        tenant_id: tenantId,
        team_id: team.id,
        subject_type: source.subjectType,
        subject_id: subjectId,
        opponent_team_id: subject.opponentTeamId,
        played_at: subject.playedAt,
        vod_url: normalized.content.vodUrl,
        notes: normalized.content.notes,
        created_by: user.id,
        updated_by: user.id,
      },
      { onConflict: 'team_id,subject_type,subject_id' }
    );

    if (error) {
      logger.error('[team-reviews] upsert error', error);
      return res.status(500).json({ error: 'Enregistrement impossible.' });
    }
    return res.status(200).json({ ok: true, review: normalized.content });
  }

  /* ------------------------------------------------------------- lecture */
  const [matchEncounters, scrimEncounters, reviewsRes] = await Promise.all([
    loadEncounters(tenantId, team.id, 'match'),
    loadEncounters(tenantId, team.id, 'scrim'),
    supabaseAdmin
      .from('team_reviews')
      .select(
        'subject_type, subject_id, vod_url, notes, updated_at, updated_by'
      )
      .eq('tenant_id', tenantId)
      .eq('team_id', team.id),
  ]);

  if (reviewsRes.error) {
    logger.error('[team-reviews] read error', reviewsRes.error);
    return res.status(500).json({ error: 'Lecture des revues impossible.' });
  }

  const reviews = ((reviewsRes.data || []) as Row[]).map((row) => ({
    subjectType: row.subject_type as ReviewSubjectType,
    subjectId: row.subject_id as string,
    vodUrl: (row.vod_url as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    updatedAt: (row.updated_at as string | null) ?? null,
    updatedBy: (row.updated_by as string | null) ?? null,
  }));

  let encounters = buildEncounterHistory(
    [...matchEncounters, ...scrimEncounters],
    reviews
  ).slice(0, HISTORY_LIMIT);

  // Noms d'adversaires en une requête — l'historique sans noms serait illisible.
  const opponentIds = Array.from(
    new Set(
      encounters.map((e) => e.opponentTeamId).filter((id): id is string => !!id)
    )
  );
  if (opponentIds.length > 0) {
    const { data: teamRows } = await supabaseAdmin
      .from('teams')
      .select('id, name')
      .in('id', opponentIds);
    const nameById = new Map(
      ((teamRows || []) as Array<{ id: string; name: string }>).map((t) => [
        t.id,
        t.name,
      ])
    );
    encounters = encounters.map((e) => ({
      ...e,
      opponentName: e.opponentTeamId
        ? (nameById.get(e.opponentTeamId) ?? null)
        : null,
    }));
  }

  const countByOpponent = new Map<string, { name: string; count: number }>();
  for (const e of encounters) {
    if (!e.opponentTeamId) continue;
    const entry = countByOpponent.get(e.opponentTeamId) ?? {
      name: e.opponentName ?? '—',
      count: 0,
    };
    entry.count += 1;
    countByOpponent.set(e.opponentTeamId, entry);
  }

  const payload: TeamReviewsResponse = {
    teamId: team.id,
    teamName: team.name,
    encounters,
    opponents: Array.from(countByOpponent.entries())
      .map(([id, v]) => ({ id, name: v.name, count: v.count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    reviewedCount: encounters.filter((e) => e.review).length,
  };

  res.setHeader('Cache-Control', 'private, max-age=15');
  return res.status(200).json(payload);
});
