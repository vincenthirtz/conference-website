// features/admin/tcg/service/moderation.ts — relecture de ce qui entre dans le
// TCG : photos des joueuses (cartes joueuses) et fan arts de la communauté.
//
// PHOTOS — ON N'APPROUVE QUE LA PHOTO QU'ON A VUE (correctif du 2026-09-15).
// La décision porte `photoPath`, le chemin AFFICHÉ, et l'écriture est
// CONDITIONNELLE (`pending` ET ce chemin) : zéro ligne touchée → 409
// `PHOTO_CHANGED` / `NOT_PENDING`. UNE PHOTO REFUSÉE EST SUPPRIMÉE DU BUCKET
// PUBLIC : mise en file de purge AVANT l'écriture (annulée si la course est
// perdue), purge APRÈS — jamais un fichier orphelin, jamais une carte cassée.
// Les pseudos sont un enrichissement : leur échec n'empêche pas la file.
//
// FAN ARTS — valider, c'est décider d'une rareté ; retirer n'est pas
// supprimer (`revoked`). L'identité de la proposante n'est pas rendue.

import { z } from 'zod';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  AdminError,
  LegacyAdminError,
  adminErrorFromStatus,
} from '@/utils/admin/errors';
import { isValidUUID } from '@/utils/apiHelpers';
import { formatZodError } from '@/utils/validation';
import { readPlayerProfileIds } from '@/utils/tcg/playerProfile';
import {
  fetchAdminUserProfiles,
  type AdminUserProfile,
} from '@/utils/adminUserProfiles';
import {
  cancelPhotoPurge,
  enqueuePhotoPurge,
  tryPurgeNow,
} from '@/utils/tcg/photoPurge';
import { TCG_BUCKET } from '@/utils/tcg/teamCardImage';
import {
  DEFAULT_FANART_RARITY,
  FANART_LIMITS,
  FANART_STATUSES,
} from '@/utils/tcg/fanart';
import { RARITY_ORDER } from '@/utils/tcg/rarity';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository';

/* ---------------------------------------------------------------------------
 * Photos — GET la file (la plus ancienne d'abord), PATCH la décision
 * ------------------------------------------------------------------------ */

const decisionSchema = z.object({
  userId: z.string().uuid(),
  decision: z.enum(['approve', 'reject']),
  photoPath: z.string().trim().min(1).max(512),
  reason: z.string().trim().max(500).optional().nullable(),
});

/** Les profils de la file, sans jamais la faire échouer. */
async function resolveProfiles(
  ctx: ServiceContext,
  userIds: string[]
): Promise<Map<string, AdminUserProfile>> {
  if (userIds.length === 0) return new Map();
  try {
    return await fetchAdminUserProfiles(userIds);
  } catch (err) {
    ctx.logger.warn('[admin/tcg] pseudos non résolus: %s', String(err));
    return new Map();
  }
}

export async function listPendingPhotos(ctx: ServiceContext) {
  const { rows, error } = await repo.listPendingPhotos(ctx.db, ctx.tenantId);
  if (error) {
    ctx.logger.error('[admin/tcg] list error: %s', error.message);
    throw new AdminError(500, 'internal', 'Lecture impossible.');
  }

  const userIds = rows.map((row) => row.user_id);
  // Profil joueuse : sans lui, pas de carte (une photo approuvée ne
  // s'afficherait nulle part). `null` = inconnu.
  const [profiles, playerIds] = await Promise.all([
    resolveProfiles(ctx, userIds),
    readPlayerProfileIds(ctx.tenantId, userIds),
  ]);

  const photos = rows.map((row) => {
    const profile = profiles.get(row.user_id);
    return {
      userId: row.user_id,
      // `display_name` PUIS `full_name` (compte créé via Discord).
      displayName: profile?.display_name || profile?.full_name || null,
      email: profile?.email ?? null,
      hasPlayerProfile: playerIds ? playerIds.has(row.user_id) : null,
      submittedAt: row.updated_at,
      // Le chemin exact de CE fichier : le PATCH le renvoie.
      photoPath: row.photo_path,
      photoUrl: row.photo_path
        ? repo.publicUrl(ctx.db, repo.PHOTO_BUCKET, row.photo_path)
        : null,
    };
  });

  return { photos, total: photos.length };
}

const notPending = () =>
  new LegacyAdminError(409, 'Cette photo n’est plus en attente.', {
    code: 'NOT_PENDING',
  });
const photoChanged = () =>
  new LegacyAdminError(
    409,
    'La photo a été remplacée depuis l’affichage : relis la nouvelle.',
    { code: 'PHOTO_CHANGED' }
  );

export async function decidePhoto(
  ctx: ServiceContext,
  reviewerStaffId: string,
  rawBody: unknown
): Promise<Audited<{ status: 'approved' | 'rejected'; userId: string }>> {
  const parsed = decisionSchema.safeParse(rawBody ?? {});
  if (!parsed.success) {
    throw new LegacyAdminError(400, formatZodError(parsed.error), {
      code: 'INVALID_BODY',
    });
  }
  const { userId, decision, reason, photoPath } = parsed.data;
  if (!isValidUUID(userId)) {
    throw adminErrorFromStatus(400, 'Identifiant invalide.');
  }

  // Relecture : elle ne DÉCIDE rien, elle distingue les deux conflits.
  const { row, error: readError } = await repo.readPhotoState(
    ctx.db,
    ctx.tenantId,
    userId
  );
  if (readError) {
    ctx.logger.error('[admin/tcg] read error: %s', readError.message);
    throw new AdminError(500, 'internal', 'Lecture impossible.');
  }
  if (!row || row.photo_status !== 'pending') throw notPending();
  if (row.photo_path !== photoPath) throw photoChanged();

  const nowIso = new Date().toISOString();
  const approving = decision === 'approve';
  const writeFailed = () =>
    new AdminError(500, 'internal', 'Enregistrement impossible.');

  // LA FILE AVANT LE POINTEUR, pour un refus (cf. l'en-tête).
  if (!approving) {
    const queued = await enqueuePhotoPurge({
      tenantId: ctx.tenantId,
      userId,
      storagePath: photoPath,
      reason: 'rejected',
    });
    if (!queued) throw writeFailed();
  }

  const { rows: written, error: writeError } = await repo.writePhotoDecision(
    ctx.db,
    ctx.tenantId,
    userId,
    photoPath,
    {
      photo_status: approving ? 'approved' : 'rejected',
      photo_path: approving ? photoPath : null,
      photo_reviewed_by: reviewerStaffId,
      photo_reviewed_at: nowIso,
      photo_rejected_reason: approving ? null : (reason ?? null),
      updated_at: nowIso,
    }
  );
  if (writeError) {
    ctx.logger.error('[admin/tcg] decision error: %s', writeError.message);
    throw writeFailed();
  }
  if (!Array.isArray(written) || written.length === 0) {
    // Course perdue : rien d'approuvé, rien de supprimé, la file est annulée.
    if (!approving) await cancelPhotoPurge(photoPath);
    throw photoChanged();
  }

  // Le fichier part APRÈS que la base ne le référence plus (chemin CONFIRMÉ).
  if (!approving) await tryPurgeNow(photoPath);

  return {
    result: { status: approving ? 'approved' : 'rejected', userId },
    audit: {
      action: approving ? 'tcg_photo_approve' : 'tcg_photo_reject',
      entity_type: 'user',
      entity_id: userId,
      payload: approving ? {} : { reason: reason ?? null },
    },
  };
}

/* ---------------------------------------------------------------------------
 * Fan arts — GET la file (`?status=`, défaut pending), PATCH la décision
 * ------------------------------------------------------------------------ */

const fanartDecisionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('approve'),
      id: z.string().uuid(),
      rarity: z.enum(['common', 'rare', 'epic', 'legendary']).optional(),
      notes: z.string().trim().max(FANART_LIMITS.reviewNotes).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('reject'),
      id: z.string().uuid(),
      notes: z.string().trim().min(3).max(FANART_LIMITS.reviewNotes),
    })
    .strict(),
  z
    .object({
      action: z.literal('revoke'),
      id: z.string().uuid(),
      notes: z.string().trim().min(3).max(FANART_LIMITS.reviewNotes),
    })
    .strict(),
]);

type FanartRow = Awaited<ReturnType<typeof repo.listFanart>>['rows'][number];

function fanartPayload(ctx: ServiceContext, row: FanartRow) {
  return {
    id: row.id,
    title: row.title,
    artistName: row.artist_name,
    artistUrl: row.artist_url,
    imageUrl: repo.publicUrl(ctx.db, TCG_BUCKET, row.image_path),
    status: row.status,
    rarity: row.rarity,
    reviewNotes: row.review_notes,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
}

export async function listFanart(ctx: ServiceContext, rawStatus: unknown) {
  const raw = typeof rawStatus === 'string' ? rawStatus : '';
  const status = (FANART_STATUSES as readonly string[]).includes(raw)
    ? raw
    : 'pending';
  const { rows, error } = await repo.listFanart(ctx.db, ctx.tenantId, status);
  if (error) {
    ctx.logger.error(
      '[admin/tcg/fanart] lecture impossible: %s',
      error.message
    );
    throw new AdminError(500, 'internal', 'Lecture impossible.');
  }
  return {
    items: rows.map((row) => fanartPayload(ctx, row)),
    status,
    rarities: RARITY_ORDER,
    defaultRarity: DEFAULT_FANART_RARITY,
  };
}

export async function decideFanart(
  ctx: ServiceContext,
  reviewerStaffId: string,
  rawBody: unknown
) {
  const parsed = fanartDecisionSchema.safeParse(rawBody ?? {});
  if (!parsed.success) {
    throw new LegacyAdminError(400, 'Décision invalide.', {
      code: 'VALIDATION',
    });
  }
  const body = parsed.data;
  const nowIso = new Date().toISOString();

  // On valide ou refuse ce qui attend ; on ne retire que ce qui est validé.
  const from = body.action === 'revoke' ? 'approved' : 'pending';
  const { rows, error } = await repo.decideFanart(
    ctx.db,
    ctx.tenantId,
    body.id,
    from,
    {
      status:
        body.action === 'approve'
          ? 'approved'
          : body.action === 'reject'
            ? 'rejected'
            : 'revoked',
      review_notes: body.notes ?? null,
      reviewed_by: reviewerStaffId,
      reviewed_at: nowIso,
      updated_at: nowIso,
      ...(body.action === 'approve'
        ? { rarity: body.rarity ?? DEFAULT_FANART_RARITY }
        : {}),
    }
  );
  if (error) {
    ctx.logger.error(
      '[admin/tcg/fanart] décision impossible: %s',
      error.message
    );
    throw new AdminError(500, 'internal', 'Décision impossible.');
  }
  if (rows.length === 0) {
    throw new LegacyAdminError(409, 'Cette proposition a déjà été traitée.', {
      code: 'already_reviewed',
    });
  }

  return {
    result: { item: fanartPayload(ctx, rows[0]) },
    audit: {
      action:
        body.action === 'approve'
          ? ('approve_tcg_fanart' as const)
          : body.action === 'reject'
            ? ('reject_tcg_fanart' as const)
            : ('revoke_tcg_fanart' as const),
      entity_type: 'tcg_fanart',
      entity_id: body.id,
      payload: {
        title: rows[0].title,
        artistName: rows[0].artist_name,
        rarity: rows[0].rarity,
        notes: body.notes ?? null,
      },
    },
  };
}
