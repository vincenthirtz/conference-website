// pages/api/admin/tcg/fanart.ts
//
// La file des cartes FAN ART proposées par la communauté.
//   GET   → la file (par défaut `pending`, la plus ancienne d'abord).
//   PATCH → valider (avec une rareté), refuser (avec un motif), ou RETIRER une
//           œuvre déjà validée.
//
// PERMISSION `manage_tcg`, comme la file des photos : décider ce qui entre dans
// le TCG est un même métier.
//
// VALIDER, C'EST DÉCIDER D'UNE RARETÉ. Le CHECK `tcg_fanart_approved_has_rarity`
// l'impose en base — sans elle, le tirage ne saurait pas quoi écrire sur la
// carte. Le défaut proposé est `DEFAULT_FANART_RARITY`, jamais imposé.
//
// RETIRER N'EST PAS SUPPRIMER. Une œuvre validée puis retirée passe `revoked` :
// elle sort du vivier des paquets à venir, et les cartes déjà tirées retombent
// sur une face neutre (`readFanartFaces` filtre sur `approved`). Supprimer la
// ligne casserait des collections — la clé étrangère l'interdit d'ailleurs.
//
// L'IDENTITÉ DE LA PROPOSANTE N'EST PAS RENDUE : le staff modère une ŒUVRE et
// un crédit, il n'a pas besoin de savoir quel compte l'a déposée pour trancher.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import { TCG_BUCKET } from '@/utils/tcg/teamCardImage';
import {
  DEFAULT_FANART_RARITY,
  FANART_LIMITS,
  FANART_STATUSES,
} from '@/utils/tcg/fanart';
import { RARITY_ORDER } from '@/utils/tcg/rarity';

const SELECT =
  'id, title, artist_name, artist_url, image_path, status, rarity, review_notes, created_at, reviewed_at';

const bodySchema = z.discriminatedUnion('action', [
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

type FanartRow = {
  id: string;
  title: string;
  artist_name: string;
  artist_url: string | null;
  image_path: string;
  status: string;
  rarity: string | null;
  review_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
};

function toPayload(row: FanartRow) {
  return {
    id: row.id,
    title: row.title,
    artistName: row.artist_name,
    artistUrl: row.artist_url,
    imageUrl:
      supabaseAdmin!.storage.from(TCG_BUCKET).getPublicUrl(row.image_path).data
        ?.publicUrl ?? null,
    status: row.status,
    rarity: row.rarity,
    reviewNotes: row.review_notes,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  res.setHeader('Cache-Control', 'no-store');
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }

  const method = req.method ?? 'GET';

  if (method === 'GET') {
    if (
      applyRateLimit(
        req,
        res,
        { max: 60, windowMs: 60_000 },
        'admin-tcg-fanart'
      )
    ) {
      return;
    }
    const raw = typeof req.query.status === 'string' ? req.query.status : '';
    const status = (FANART_STATUSES as readonly string[]).includes(raw)
      ? raw
      : 'pending';
    const { data, error } = await supabaseAdmin
      .from('tcg_fanart_cards')
      .select(SELECT)
      .eq('tenant_id', ctx.tenantId)
      .eq('status', status)
      // La file de modération se prend par le bas : la plus ancienne attend le
      // plus longtemps. Les autres vues, elles, montrent les récentes d'abord.
      .order('created_at', { ascending: status === 'pending' })
      .limit(100);
    if (error) {
      logger.error('[admin/tcg/fanart] lecture impossible: %s', error.message);
      return res.status(500).json({ error: 'Lecture impossible.' });
    }
    const rows = (data ?? []) as unknown as FanartRow[];
    return res.status(200).json({
      items: rows.map(toPayload),
      status,
      rarities: RARITY_ORDER,
      defaultRarity: DEFAULT_FANART_RARITY,
    });
  }

  if (method !== 'PATCH') {
    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'admin-tcg-fanart-review'
    )
  ) {
    return;
  }

  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Décision invalide.', code: 'VALIDATION' });
  }
  const body = parsed.data;
  const nowIso = new Date().toISOString();

  // Le statut de DÉPART conditionne l'écriture : on valide ou refuse ce qui
  // attend, on ne retire que ce qui a été validé. Sans cette condition, deux
  // relectrices simultanées pourraient valider ET refuser la même œuvre.
  const from = body.action === 'revoke' ? 'approved' : 'pending';
  const update: Record<string, unknown> = {
    status:
      body.action === 'approve'
        ? 'approved'
        : body.action === 'reject'
          ? 'rejected'
          : 'revoked',
    review_notes: body.notes ?? null,
    reviewed_by: ctx.staff.id,
    reviewed_at: nowIso,
    updated_at: nowIso,
  };
  if (body.action === 'approve') {
    update.rarity = body.rarity ?? DEFAULT_FANART_RARITY;
  }

  const { data, error } = await supabaseAdmin
    .from('tcg_fanart_cards')
    .update(update)
    .eq('tenant_id', ctx.tenantId)
    .eq('id', body.id)
    .eq('status', from)
    .select(SELECT);
  if (error) {
    logger.error('[admin/tcg/fanart] décision impossible: %s', error.message);
    return res.status(500).json({ error: 'Décision impossible.' });
  }
  const rows = (data ?? []) as unknown as FanartRow[];
  if (rows.length === 0) {
    return res.status(409).json({
      error: 'Cette proposition a déjà été traitée.',
      code: 'already_reviewed',
    });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action:
      body.action === 'approve'
        ? 'approve_tcg_fanart'
        : body.action === 'reject'
          ? 'reject_tcg_fanart'
          : 'revoke_tcg_fanart',
    entity_type: 'tcg_fanart',
    entity_id: body.id,
    tenant_id: ctx.tenantId,
    payload: {
      title: rows[0].title,
      artistName: rows[0].artist_name,
      rarity: rows[0].rarity,
      notes: body.notes ?? null,
    },
  });

  return res.status(200).json({ item: toPayload(rows[0]) });
}

export default withStaffRoute(handler, { permission: 'manage_tcg' });
