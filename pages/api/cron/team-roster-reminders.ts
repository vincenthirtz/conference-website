// pages/api/cron/team-roster-reminders.ts
//
// Relance AUTOMATIQUE des équipes dans leur salon textuel Discord : rappel de
// complétion du roster à intervalles décroissants avant la deadline.
//
// Fenêtre de tir — le cron tourne tous les jours mais n'envoie QUE aux jalons
// J-21, J-14, J-7, J-3, J-1 avant la deadline de verrouillage des rosters
// (`site_settings.roster_lock_deadline`). Ce ciblage sur un jour exact tient
// lieu de déduplication : une équipe ne peut pas recevoir deux fois le même
// jalon, sans table d'état supplémentaire (même pattern que
// /api/cron/task-due-reminders).
//
// Sans deadline configurée, on retombe sur `tournaments.start_date` — et si le
// tournoi n'a pas de date non plus, on ne fait RIEN (pas de relance à
// l'aveugle, cf. le garde-fou `min_players` des audiences broadcast).
//
// Ciblage : par défaut seules les équipes qui ont un vrai motif de relance
// (roster incomplet, comptes jamais connectés, BattleTag manquant) reçoivent
// un message — une équipe en règle n'est pas notifiée. `?only=all` force tout
// le monde (usage manuel).
//
// Auth : Bearer CRON_SECRET (header) ou ?secret=... (query). GET + POST.

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  loadTeamRosterStates,
  composeTeamMessages,
  sendTeamMessages,
} from '@/utils/teamMessages';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { logger } from '@/utils/logger';

/** Jalons (en jours avant la deadline) auxquels une relance part. */
export const REMINDER_MILESTONES = [21, 14, 7, 3, 1];

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[cron/team-roster-reminders] CRON_SECRET absent — refus');
    return false;
  }
  if (req.headers.authorization === `Bearer ${secret}`) return true;
  const q = req.query.secret;
  return typeof q === 'string' && q === secret;
}

/** Nombre de jours calendaires (UTC) entre aujourd'hui et une date cible. */
export function daysUntil(target: string, now: number = Date.now()): number {
  const t = new Date(target.length === 10 ? `${target}T00:00:00Z` : target);
  if (Number.isNaN(t.getTime())) return NaN;
  const startOfDay = (ms: number) => Math.floor(ms / 86_400_000);
  return startOfDay(t.getTime()) - startOfDay(now);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // `force=1` court-circuite la fenêtre de jalons (déclenchement manuel).
  const force = req.query.force === '1' || req.query.force === 'true';
  const dryRun = req.query.dry_run === '1' || req.query.dry_run === 'true';
  const only =
    req.query.only === 'all'
      ? ('all' as const)
      : req.query.only === 'incomplete'
        ? ('incomplete' as const)
        : ('needs_attention' as const);

  try {
    const ctx = await loadTeamRosterStates(null, DEFAULT_TENANT_ID);
    if (!ctx) {
      return res
        .status(200)
        .json({ skipped: 'no_active_tournament', sent: 0, teams: [] });
    }

    const reference = ctx.deadline ?? ctx.startDate;
    if (!reference) {
      return res
        .status(200)
        .json({ skipped: 'no_deadline_configured', sent: 0, teams: [] });
    }

    const remaining = daysUntil(reference);
    if (!force) {
      if (!Number.isFinite(remaining)) {
        return res
          .status(200)
          .json({ skipped: 'unparseable_deadline', sent: 0, teams: [] });
      }
      if (!REMINDER_MILESTONES.includes(remaining)) {
        return res.status(200).json({
          skipped: 'not_a_milestone',
          daysRemaining: remaining,
          milestones: REMINDER_MILESTONES,
          sent: 0,
          teams: [],
        });
      }
    }

    const messages = composeTeamMessages(ctx, {
      preset: 'roster-reminder',
      // Le rappel automatique PING le rôle d'équipe : sans notification, un
      // message dans un salon peu fréquenté ne sert à rien.
      mention: true,
      only,
    });

    if (dryRun) {
      return res.status(200).json({
        dryRun: true,
        daysRemaining: remaining,
        messages: messages.map((m) => ({
          teamName: m.team.teamName,
          kind: m.kind,
          deliverable: m.deliverable,
          content: m.content,
        })),
      });
    }

    const result = await sendTeamMessages(messages, {
      tenantId: DEFAULT_TENANT_ID,
      tournamentId: ctx.tournamentId,
      source: 'cron',
    });

    logger.info(
      '[cron/team-roster-reminders] J-%s tournoi=%s envoyés=%d ignorés=%d',
      remaining,
      ctx.tournamentName,
      result.sent,
      result.skipped
    );

    return res.status(200).json({ daysRemaining: remaining, ...result });
  } catch (err) {
    logger.error('[cron/team-roster-reminders] error:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
