// pages/api/admin/matches/[matchId]/evidence.ts
//
// Feature "Integrite des resultats & anti-triche", slice 1 : preuve (cote staff).
//
// GET  — liste les preuves d'un match avec URLs signees courte-duree. C'est ce
//        que consomme l'UI d'arbitrage admin.
// POST — le staff attache une preuve NEUTRE (team_side null) pendant
//        l'arbitrage. Memes mecaniques d'upload/validation que le POST bot
//        (utils/matches/evidence.ts).
//
// Auth : withStaffRoute(handler, 'manager') — meme niveau que le workflow de
// dispute (pages/api/admin/matches/[matchId]/dispute.ts).

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import crypto from 'crypto';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import { logStaffAction } from '@/utils/staffLogs';
import { httpUrlSchema, boundedString } from '@/utils/botValidation';
import {
  decodeEvidencePayload,
  buildEvidencePath,
  uploadEvidenceObject,
  signEvidenceUrl,
} from '@/utils/matches/evidence';
import { logger } from '../../../../../utils/logger';

// Le POST peut porter un binaire base64 (~10 Mo) — releve la limite bodyParser.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb',
    },
  },
};

const noteSchema = boundedString(1, 1000).optional();

const adminEvidencePostSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('screenshot'),
    file_base64: z.string().min(1),
    filename: boundedString(1, 255),
    note: noteSchema,
  }),
  z.object({
    kind: z.literal('replay_file'),
    file_base64: z.string().min(1),
    filename: boundedString(1, 255),
    note: noteSchema,
  }),
  z.object({
    kind: z.literal('replay_url'),
    external_url: httpUrlSchema,
    note: noteSchema,
  }),
]);

export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { matchId } = req.query;
  if (!matchId || Array.isArray(matchId) || !isValidUUID(matchId)) {
    return res.status(400).json({ error: 'Invalid matchId' });
  }
  const id = String(matchId);

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(id, res, ctx);
      case 'POST':
        return await handlePost(id, req, res, ctx);
      default:
        res.setHeader('Allow', 'GET,POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    logger.error('[/api/admin/matches/[matchId]/evidence] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleGet(
  matchId: string,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  // Verifie que le match existe dans le tenant du staff (scoping).
  const { data: match, error: mErr } = await supabaseAdmin
    .from('matches')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', matchId)
    .maybeSingle();
  if (mErr) {
    logger.error('[admin/matches/evidence] match lookup error', mErr);
    return res.status(500).json({ error: 'Erreur de lecture du match' });
  }
  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  const { data: rows, error } = await supabaseAdmin
    .from('match_evidence')
    .select(
      'id, team_side, kind, external_url, mime_type, size_bytes, sha256, note, created_at, storage_path, discord_user_id, submitted_by_auth_user_id'
    )
    .eq('tenant_id', ctx.tenantId)
    .eq('match_id', matchId)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('[admin/matches/evidence] list error', error);
    return res.status(500).json({ error: 'Erreur de lecture des preuves' });
  }

  const evidence = await Promise.all(
    (rows ?? []).map(async (r) => {
      const rec = r as Record<string, unknown>;
      const storagePath = rec.storage_path as string | null;
      const signedUrl = storagePath ? await signEvidenceUrl(storagePath) : null;
      return {
        id: rec.id as string,
        teamSide: (rec.team_side as number | null) ?? null,
        kind: rec.kind as string,
        externalUrl: (rec.external_url as string | null) ?? null,
        signedUrl,
        mimeType: (rec.mime_type as string | null) ?? null,
        sizeBytes: (rec.size_bytes as number | null) ?? null,
        sha256: (rec.sha256 as string | null) ?? null,
        note: (rec.note as string | null) ?? null,
        submittedByDiscordUserId:
          (rec.discord_user_id as string | null) ?? null,
        submittedByAuthUserId:
          (rec.submitted_by_auth_user_id as string | null) ?? null,
        createdAt: (rec.created_at as string | null) ?? null,
      };
    })
  );

  return res.status(200).json({ matchId, evidence });
}

async function handlePost(
  matchId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const parsed = adminEvidencePostSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid body',
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const input = parsed.data;

  const { data: match, error: mErr } = await supabaseAdmin
    .from('matches')
    .select('id, tournament_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', matchId)
    .maybeSingle();
  if (mErr) {
    logger.error('[admin/matches/evidence] match lookup error', mErr);
    return res.status(500).json({ error: 'Erreur de lecture du match' });
  }
  if (!match) {
    return res.status(404).json({ error: 'Match not found' });
  }

  const evidenceId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  let row: Record<string, unknown>;

  if (input.kind === 'replay_url') {
    row = {
      id: evidenceId,
      match_id: matchId,
      tenant_id: ctx.tenantId,
      team_side: null, // preuve neutre staff
      submitted_by_auth_user_id: ctx.staff?.id ?? null,
      discord_user_id: null,
      kind: 'replay_url',
      storage_path: null,
      external_url: input.external_url,
      mime_type: null,
      size_bytes: null,
      sha256: null,
      note: input.note ?? null,
      created_at: nowIso,
    };
  } else {
    const decoded = decodeEvidencePayload(
      input.kind,
      input.file_base64,
      input.filename
    );
    if (!decoded.ok) {
      return res.status(400).json({ error: decoded.error });
    }
    const { buffer, mime, ext, sizeBytes, sha256 } = decoded.value;
    const path = buildEvidencePath(ctx.tenantId, matchId, evidenceId, ext);

    const up = await uploadEvidenceObject(path, buffer, mime);
    if (up.error) {
      logger.error('[admin/matches/evidence] upload error', up.error);
      return res.status(500).json({ error: "Impossible d'uploader la preuve" });
    }

    row = {
      id: evidenceId,
      match_id: matchId,
      tenant_id: ctx.tenantId,
      team_side: null,
      submitted_by_auth_user_id: ctx.staff?.id ?? null,
      discord_user_id: null,
      kind: input.kind,
      storage_path: path,
      external_url: null,
      mime_type: mime,
      size_bytes: sizeBytes,
      sha256,
      note: input.note ?? null,
      created_at: nowIso,
    };
  }

  const { error: insErr } = await supabaseAdmin
    .from('match_evidence')
    .insert(row);
  if (insErr) {
    logger.error('[admin/matches/evidence] insert error', insErr);
    return res
      .status(500)
      .json({ error: "Echec de l'enregistrement de la preuve" });
  }

  if (ctx.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'attach_match_evidence',
      entity_type: 'match',
      entity_id: matchId,
      tournament_id: (match as { tournament_id: string | null }).tournament_id,
      payload: { kind: input.kind, evidence_id: evidenceId },
    });
  }

  return res.status(201).json({ id: evidenceId, kind: input.kind });
}
