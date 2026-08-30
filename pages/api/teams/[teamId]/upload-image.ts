// pages/api/teams/[teamId]/upload-image.ts
// Image upload reserved to users having the `edit_public_page` permission on
// the target team (captain or member with a privileged role). Mirrors the
// shape of /api/admin/upload but without staff requirement; image-only (no
// PDF) since the team-side feature only customizes the public team page.

import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { withAuthRoute } from '@/utils/staff';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { hasTeamPermission } from '@/utils/teams/permissions';
import { SVG_MAX_BYTES, SVG_MIME, sanitizeSvg } from '@/utils/svgSanitize';
import { logger } from '@/utils/logger';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

const ALLOWED_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  [SVG_MIME]: '.svg',
};

const MAX_BYTES = 2 * 1024 * 1024;
const BUCKET = 'teams-images';

const MAGIC_BYTES: Record<string, number[][]> = {
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
};
const WEBP_MARKER = [0x57, 0x45, 0x42, 0x50];

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signatures = MAGIC_BYTES[mimeType];
  if (!signatures) return false;
  const matchesHeader = signatures.some((sig) =>
    sig.every((byte, i) => buffer[i] === byte)
  );
  if (!matchesHeader) return false;
  if (mimeType === 'image/webp') {
    return (
      buffer.length >= 12 &&
      WEBP_MARKER.every((byte, i) => buffer[8 + i] === byte)
    );
  }
  return true;
}

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'team-upload'))
    return;

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  const { teamId } = req.query;
  if (typeof teamId !== 'string' || !isValidUUID(teamId)) {
    return res.status(400).json({ error: 'teamId invalide.' });
  }

  const allowed = await hasTeamPermission(user.id, teamId, 'edit_public_page');
  if (!allowed) {
    return res
      .status(403)
      .json({ error: "Tu n'as pas la permission d'éditer cette équipe." });
  }

  const { data, mimeType, filename } = req.body || {};
  if (!data || !mimeType) {
    return res.status(400).json({ error: 'Missing data or mimeType' });
  }

  const ext = ALLOWED_TYPES[mimeType];
  if (!ext) {
    return res.status(400).json({
      error: `Type non supporté: ${mimeType}. Formats acceptés: PNG, JPEG, WebP, SVG.`,
    });
  }

  let buffer: Buffer;
  try {
    const base64Data = String(data).replace(/^data:[^;]+;base64,/, '');
    buffer = Buffer.from(base64Data, 'base64');
  } catch {
    return res.status(400).json({ error: 'Données base64 invalides' });
  }

  // Le SVG est un DOCUMENT, pas une image : pas de magic bytes à vérifier, mais
  // du script possible. On ne stocke jamais la source reçue — seulement ce que
  // `sanitizeSvg` a reconstruit à partir d'une liste blanche (cf. le module).
  if (mimeType === SVG_MIME) {
    if (buffer.length > SVG_MAX_BYTES) {
      return res.status(400).json({ error: 'SVG trop lourd (max 512 Ko)' });
    }
    const sanitized = sanitizeSvg(buffer.toString('utf8'));
    if (!sanitized.ok) {
      return res.status(400).json({ error: sanitized.reason });
    }
    buffer = Buffer.from(sanitized.svg, 'utf8');
  } else {
    if (buffer.length > MAX_BYTES) {
      return res.status(400).json({ error: 'Image trop lourde (max 2 Mo)' });
    }

    if (!validateMagicBytes(buffer, mimeType)) {
      return res.status(400).json({
        error: 'Le contenu du fichier ne correspond pas au type MIME déclaré.',
      });
    }
  }

  const hash = crypto.randomBytes(8).toString('hex');
  const safeName =
    typeof filename === 'string'
      ? filename
          .replace(/\.[^.]+$/, '')
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .substring(0, 40) || 'team'
      : 'team';
  const filePath = `team-${teamId}/${safeName}-${hash}${ext}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(filePath, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    logger.error('[team-upload-image] storage error:', uploadError);
    return res.status(500).json({
      error: "Impossible d'uploader le fichier",
    });
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from(BUCKET)
    .getPublicUrl(filePath);

  return res.status(200).json({
    url: publicUrlData.publicUrl,
    filename: filePath,
  });
});
