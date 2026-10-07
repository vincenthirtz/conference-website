// utils/matches/forfeitProposal.ts
//
// PROPOSITION DE FORFAIT — le forfait n'est plus jamais appliqué tout seul.
//
// Jusqu'au 2026-10-07, le cron de check-in (utils/checkin.ts) appliquait le
// forfait dès qu'une seule équipe avait pointé au coup d'envoi : score
// requiredWins-0, statut `walkover`, bracket propagé, notifications parties.
// Une capitaine présente mais qui avait oublié de pointer suffisait à écrire
// un résultat qu'il fallait ensuite défaire à la main.
//
// Désormais le cron PROPOSE (`createForfeitProposal`) et prévient les
// admins/owners du tenant (`match.forfeit_proposed`, DM Discord). Le forfait
// n'est appliqué que sur confirmation (`resolveForfeitProposal` dans
// ./forfeitProposalResolve.ts). Une saisie de score par le staff écrase la
// proposition (`overridePendingForfeitProposal`, appelé par applyMatchScore).
//
// Stockage : colonnes `matches.forfeit_proposal_*`
// (database/migrations/add_match_forfeit_proposal.sql). Tant qu'elles
// n'existent pas, rien n'est créé — et SURTOUT aucun forfait n'est appliqué.
//
// Ce module n'importe PAS applyScore : applyScore l'importe (écrasement), et
// la confirmation, qui a besoin des deux, vit dans un module à part.

import { supabaseAdmin } from '../supabase';
import { emitBotEvent } from '../botEvents';
import { logger } from '../logger';
import { absoluteSiteUrl } from '../siteUrl';
import { effectiveTenantRole, isAdminOrOwnerRole } from '../staffRoles';
import { oneRelation, type Relation } from '../supabase/relation';

export const FORFEIT_PROPOSAL_STATUSES = [
  'pending',
  'confirmed',
  'declined',
  'overridden',
] as const;

export type ForfeitProposalStatus = (typeof FORFEIT_PROPOSAL_STATUSES)[number];

export type ForfeitProposal = {
  matchId: string;
  status: ForfeitProposalStatus;
  /** Équipe absente au coup d'envoi (celle qui serait déclarée forfait). */
  absentTeamId: string | null;
  /** Équipe présente, vainqueure si le forfait est confirmé. */
  proposedWinnerTeamId: string | null;
  proposedAt: string | null;
  resolvedAt: string | null;
  resolvedByStaffId: string | null;
};

/*
 * Noms de colonnes en constantes `string`, comme utils/tournaments/
 * reviewsPlaylist.ts : la migration peut ne pas être appliquée au moment du
 * déploiement, ces écritures et filtres sont TOLÉRANTS à son absence
 * (`isForfeitProposalSchemaMissing`), et l'instantané de schéma
 * (database/schema-snapshot.json) ne les connaîtra qu'une fois la migration
 * passée. À remplacer par des littéraux après application + régénération.
 */
export const COL_PROPOSED_TEAM: string = 'forfeit_proposed_team_id';
export const COL_PROPOSED_AT: string = 'forfeit_proposed_at';
export const COL_STATUS: string = 'forfeit_proposal_status';
export const COL_RESOLVED_BY: string = 'forfeit_proposal_resolved_by';
export const COL_RESOLVED_AT: string = 'forfeit_proposal_resolved_at';

/** Colonnes de la proposition, lues et écrites ensemble. */
export const FORFEIT_PROPOSAL_COLUMNS =
  'forfeit_proposed_team_id, forfeit_proposed_at, forfeit_proposal_status, forfeit_proposal_resolved_by, forfeit_proposal_resolved_at';

type ProposalRow = {
  id: string;
  team1_id?: string | null;
  team2_id?: string | null;
  forfeit_proposed_team_id?: string | null;
  forfeit_proposed_at?: string | null;
  forfeit_proposal_status?: string | null;
  forfeit_proposal_resolved_by?: string | null;
  forfeit_proposal_resolved_at?: string | null;
};

/**
 * Migration absente : Postgres `42703` (colonne inconnue en lecture/filtre),
 * PostgREST `PGRST204` (colonne absente du cache de schéma, en écriture), ou un
 * message qui nomme nos colonnes.
 */
export function isForfeitProposalSchemaMissing(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  if (e.code === '42703' || e.code === 'PGRST204') return true;
  return typeof e.message === 'string' && e.message.includes('forfeit_propos');
}

function isStatus(v: unknown): v is ForfeitProposalStatus {
  return (
    typeof v === 'string' &&
    (FORFEIT_PROPOSAL_STATUSES as readonly string[]).includes(v)
  );
}

/** Ligne `matches` → proposition, ou `null` si aucune n'a été posée. */
export function toForfeitProposal(row: ProposalRow): ForfeitProposal | null {
  if (!isStatus(row.forfeit_proposal_status)) return null;
  const absent = row.forfeit_proposed_team_id ?? null;
  const winner =
    absent && absent === row.team1_id
      ? (row.team2_id ?? null)
      : absent && absent === row.team2_id
        ? (row.team1_id ?? null)
        : null;
  return {
    matchId: row.id,
    status: row.forfeit_proposal_status,
    absentTeamId: absent,
    proposedWinnerTeamId: winner,
    proposedAt: row.forfeit_proposed_at ?? null,
    resolvedAt: row.forfeit_proposal_resolved_at ?? null,
    resolvedByStaffId: row.forfeit_proposal_resolved_by ?? null,
  };
}

/* -----------------------------------------------------------
 * Lecture
 * ---------------------------------------------------------*/

export type ReadForfeitProposalResult =
  | { ok: true; proposal: ForfeitProposal | null }
  | { ok: false; reason: 'not_found' | 'unavailable' | 'error' };

/**
 * Proposition d'un match. Requête ISOLÉE : les lectures historiques de la
 * fiche match ne nomment pas ces colonnes, et ne tombent donc pas tant que la
 * migration n'est pas passée.
 */
export async function readForfeitProposal(
  tenantId: string,
  matchId: string
): Promise<ReadForfeitProposalResult> {
  const { data, error } = await supabaseAdmin
    .from('matches')
    .select(`id, team1_id, team2_id, ${FORFEIT_PROPOSAL_COLUMNS}`)
    .eq('tenant_id', tenantId)
    .eq('id', matchId)
    .maybeSingle();
  if (error) {
    if (isForfeitProposalSchemaMissing(error)) {
      return { ok: false, reason: 'unavailable' };
    }
    logger.error('[forfeitProposal] read error', error);
    return { ok: false, reason: 'error' };
  }
  if (!data) return { ok: false, reason: 'not_found' };
  return { ok: true, proposal: toForfeitProposal(data as ProposalRow) };
}

/**
 * Propositions EN ATTENTE parmi `matchIds` (console check-in). Best-effort :
 * une erreur, ou la migration absente, rend une liste vide.
 */
export async function listPendingForfeitProposals(
  tenantId: string,
  matchIds: string[]
): Promise<Map<string, ForfeitProposal>> {
  const out = new Map<string, ForfeitProposal>();
  if (matchIds.length === 0) return out;
  try {
    const { data, error } = await supabaseAdmin
      .from('matches')
      .select(`id, team1_id, team2_id, ${FORFEIT_PROPOSAL_COLUMNS}`)
      .eq('tenant_id', tenantId)
      .in('id', matchIds)
      .eq(COL_STATUS, 'pending');
    if (error) {
      if (!isForfeitProposalSchemaMissing(error)) {
        logger.warn('[forfeitProposal] list pending error', error);
      }
      return out;
    }
    for (const row of (data ?? []) as ProposalRow[]) {
      const p = toForfeitProposal(row);
      if (p) out.set(p.matchId, p);
    }
  } catch (e) {
    logger.warn('[forfeitProposal] list pending exception', e);
  }
  return out;
}

/* -----------------------------------------------------------
 * Création (cron check-in)
 * ---------------------------------------------------------*/

export type CreateForfeitProposalResult =
  | { outcome: 'created'; proposal: ForfeitProposal }
  | { outcome: 'exists' }
  | { outcome: 'unavailable' }
  | { outcome: 'error'; error: string };

/**
 * Pose la proposition, UNE fois par match : l'écriture est conditionnée à
 * `forfeit_proposal_status IS NULL`, un second passage (cron relancé, tick
 * en retard) ne recrée rien et n'émet rien.
 *
 * Ne touche NI au score, NI au statut, NI au bracket.
 */
export async function createForfeitProposal(opts: {
  tenantId: string;
  matchId: string;
  absentTeamId: string;
}): Promise<CreateForfeitProposalResult> {
  try {
    const { data, error } = await supabaseAdmin
      .from('matches')
      .update({
        [COL_PROPOSED_TEAM]: opts.absentTeamId,
        [COL_PROPOSED_AT]: new Date().toISOString(),
        [COL_STATUS]: 'pending',
        [COL_RESOLVED_BY]: null,
        [COL_RESOLVED_AT]: null,
      })
      .eq('tenant_id', opts.tenantId)
      .eq('id', opts.matchId)
      .is(COL_STATUS, null)
      .select(`id, team1_id, team2_id, ${FORFEIT_PROPOSAL_COLUMNS}`)
      .maybeSingle();
    if (error) {
      if (isForfeitProposalSchemaMissing(error)) {
        return { outcome: 'unavailable' };
      }
      return { outcome: 'error', error: error.message ?? String(error) };
    }
    if (!data) return { outcome: 'exists' };
    const proposal = toForfeitProposal(data as ProposalRow);
    if (!proposal) return { outcome: 'error', error: 'proposal not readable' };
    return { outcome: 'created', proposal };
  } catch (e) {
    if (isForfeitProposalSchemaMissing(e)) return { outcome: 'unavailable' };
    return {
      outcome: 'error',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/* -----------------------------------------------------------
 * Écrasement par une saisie staff
 * ---------------------------------------------------------*/

/**
 * Une saisie de score par le staff tranche à la place de la proposition :
 * `pending` → `overridden`. Best-effort, jamais bloquant pour le score déjà
 * écrit. Rend `true` si une proposition a effectivement été écrasée.
 */
export async function overridePendingForfeitProposal(opts: {
  tenantId: string;
  matchId: string;
  staffId: string | null;
}): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from('matches')
      .update({
        [COL_STATUS]: 'overridden',
        [COL_RESOLVED_BY]: opts.staffId,
        [COL_RESOLVED_AT]: new Date().toISOString(),
      })
      .eq('tenant_id', opts.tenantId)
      .eq('id', opts.matchId)
      .eq(COL_STATUS, 'pending')
      .select('id')
      .maybeSingle();
    if (error) {
      // Migration absente : aucune proposition ne peut exister, rien à faire.
      if (!isForfeitProposalSchemaMissing(error)) {
        logger.warn('[forfeitProposal] override error', error);
      }
      return false;
    }
    if (!data) return false;
    await emitForfeitResolved({
      tenantId: opts.tenantId,
      matchId: opts.matchId,
      outcome: 'overridden',
      staffId: opts.staffId,
    });
    return true;
  } catch (e) {
    logger.warn('[forfeitProposal] override exception', e);
    return false;
  }
}

/* -----------------------------------------------------------
 * Destinataires : admins/owners du tenant au compte Discord lié
 * ---------------------------------------------------------*/

export type ForfeitProposalRecipient = {
  userId: string;
  discordUserId: string;
};

/**
 * Admins/owners du tenant (rôle effectif), actifs, avec un compte Discord lié.
 * Même audience de départ que les notifications staff
 * (`loadStaffUserIdsForTenant` : `tenant_staff` du tenant + pôle-admins),
 * restreinte à ceux qui peuvent trancher.
 */
export async function loadForfeitProposalRecipients(
  tenantId: string
): Promise<ForfeitProposalRecipient[]> {
  const tenantRoleByStaff = new Map<string, string | null>();
  const { data: tsRows, error: tsErr } = await supabaseAdmin
    .from('tenant_staff')
    .select('staff_id, role')
    .eq('tenant_id', tenantId);
  if (tsErr) logger.error('[forfeitProposal] tenant_staff error', tsErr);
  for (const r of (tsRows ?? []) as Array<{
    staff_id: string;
    role: string | null;
  }>) {
    tenantRoleByStaff.set(r.staff_id, r.role ?? null);
  }

  const { data: poleRows, error: poleErr } = await supabaseAdmin
    .from('staff')
    .select('id')
    .eq('is_pole_admin', true);
  if (poleErr) logger.error('[forfeitProposal] pole admins error', poleErr);
  const staffIds = new Set(tenantRoleByStaff.keys());
  for (const r of (poleRows ?? []) as Array<{ id: string }>) {
    staffIds.add(r.id);
  }
  if (staffIds.size === 0) return [];

  const { data: staffRows, error: staffErr } = await supabaseAdmin
    .from('staff')
    .select('id, auth_user_id, role, is_active, deleted_at')
    .in('id', [...staffIds]);
  if (staffErr) {
    logger.error('[forfeitProposal] staff error', staffErr);
    return [];
  }
  const userIds = new Set<string>();
  for (const s of (staffRows ?? []) as Array<{
    id: string;
    auth_user_id: string | null;
    role: string | null;
    is_active?: boolean | null;
    deleted_at?: string | null;
  }>) {
    if (s.is_active === false || s.deleted_at || !s.auth_user_id) continue;
    const role = effectiveTenantRole(s.role, tenantRoleByStaff.get(s.id));
    if (isAdminOrOwnerRole(role)) userIds.add(s.auth_user_id);
  }
  if (userIds.size === 0) return [];

  const { data: links, error: linkErr } = await supabaseAdmin
    .from('user_discord_links')
    .select('auth_user_id, discord_user_id')
    .in('auth_user_id', [...userIds]);
  if (linkErr) {
    logger.error('[forfeitProposal] discord links error', linkErr);
    return [];
  }
  const seen = new Set<string>();
  const out: ForfeitProposalRecipient[] = [];
  for (const l of (links ?? []) as Array<{
    auth_user_id: string;
    discord_user_id: string | null;
  }>) {
    if (!l.discord_user_id || seen.has(l.auth_user_id)) continue;
    seen.add(l.auth_user_id);
    out.push({ userId: l.auth_user_id, discordUserId: l.discord_user_id });
  }
  return out;
}

/* -----------------------------------------------------------
 * Événements bot
 * ---------------------------------------------------------*/

/** Fiche admin du match : là où l'on tranche sans le bot. */
export function forfeitProposalAdminUrl(matchId: string): string {
  return absoluteSiteUrl(`/admin/matches/${matchId}`);
}

type MatchForEvent = {
  id: string;
  scheduled_at: string | null;
  match_format: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_checked_in_at: string | null;
  team2_checked_in_at: string | null;
  team1: Relation<{ id: string; name: string | null }>;
  team2: Relation<{ id: string; name: string | null }>;
  tournament: Relation<{ id: string; name: string | null }>;
  stage: Relation<{ id: string; name: string | null }>;
};

/** Charge utile de `match.forfeit_proposed` (contrat bot). */
export type ForfeitProposedEventData = {
  matchId: string;
  proposalId: string;
  tournamentId: string | null;
  tournamentName: string | null;
  stageName: string | null;
  scheduledAt: string | null;
  matchFormat: string | null;
  team1: { id: string | null; name: string | null; checkedIn: boolean };
  team2: { id: string | null; name: string | null; checkedIn: boolean };
  absentTeamId: string;
  proposedWinnerTeamId: string | null;
  proposedAt: string | null;
  adminUrl: string;
  recipients: ForfeitProposalRecipient[];
};

/**
 * Émet `match.forfeit_proposed`. Une clé d'idempotence par match : un rejeu
 * de l'émission ne produit pas de second DM.
 */
export async function emitForfeitProposed(opts: {
  tenantId: string;
  proposal: ForfeitProposal;
}): Promise<void> {
  const { tenantId, proposal } = opts;
  if (!proposal.absentTeamId) return;
  try {
    const { data: m, error } = await supabaseAdmin
      .from('matches')
      .select(
        `id, scheduled_at, match_format, team1_id, team2_id,
         team1_checked_in_at, team2_checked_in_at,
         team1:team1_id(id, name),
         team2:team2_id(id, name),
         tournament:tournament_id(id, name),
         stage:stage_id(id, name)`
      )
      .eq('tenant_id', tenantId)
      .eq('id', proposal.matchId)
      .maybeSingle();
    if (error || !m) {
      logger.error('[forfeitProposal] event match load error', error);
      return;
    }
    const row = m as unknown as MatchForEvent;
    const t1 = oneRelation(row.team1);
    const t2 = oneRelation(row.team2);
    const tournament = oneRelation(row.tournament);
    const stage = oneRelation(row.stage);
    const recipients = await loadForfeitProposalRecipients(tenantId);
    const data: ForfeitProposedEventData = {
      matchId: row.id,
      // Une proposition par match : l'id du match l'identifie.
      proposalId: row.id,
      tournamentId: tournament?.id ?? null,
      tournamentName: tournament?.name ?? null,
      stageName: stage?.name ?? null,
      scheduledAt: row.scheduled_at ?? null,
      matchFormat: row.match_format ?? null,
      team1: {
        id: row.team1_id ?? null,
        name: t1?.name ?? null,
        checkedIn: !!row.team1_checked_in_at,
      },
      team2: {
        id: row.team2_id ?? null,
        name: t2?.name ?? null,
        checkedIn: !!row.team2_checked_in_at,
      },
      absentTeamId: proposal.absentTeamId,
      proposedWinnerTeamId: proposal.proposedWinnerTeamId,
      proposedAt: proposal.proposedAt,
      adminUrl: forfeitProposalAdminUrl(row.id),
      recipients,
    };
    await emitBotEvent('match.forfeit_proposed', data, tenantId, {
      idempotencyKey: `match.forfeit_proposed:${row.id}`,
    });
  } catch (e) {
    logger.error('[forfeitProposal] emit forfeit_proposed error', e);
  }
}

export type ForfeitResolvedOutcome = 'confirmed' | 'declined' | 'overridden';

/** Charge utile de `match.forfeit_resolved` (contrat bot). */
export type ForfeitResolvedEventData = {
  matchId: string;
  proposalId: string;
  outcome: ForfeitResolvedOutcome;
  by: { staffId: string | null; discordUserId: string | null } | null;
  adminUrl: string;
};

/**
 * Émet `match.forfeit_resolved` : le bot peut éditer les DM déjà envoyés.
 * Best-effort ; une clé d'idempotence par (match, issue).
 */
export async function emitForfeitResolved(opts: {
  tenantId: string;
  matchId: string;
  outcome: ForfeitResolvedOutcome;
  staffId: string | null;
  discordUserId?: string | null;
}): Promise<void> {
  try {
    const data: ForfeitResolvedEventData = {
      matchId: opts.matchId,
      proposalId: opts.matchId,
      outcome: opts.outcome,
      by:
        opts.staffId || opts.discordUserId
          ? {
              staffId: opts.staffId ?? null,
              discordUserId: opts.discordUserId ?? null,
            }
          : null,
      adminUrl: forfeitProposalAdminUrl(opts.matchId),
    };
    await emitBotEvent('match.forfeit_resolved', data, opts.tenantId, {
      idempotencyKey: `match.forfeit_resolved:${opts.matchId}`,
    });
  } catch (e) {
    logger.error('[forfeitProposal] emit forfeit_resolved error', e);
  }
}
