// pages/api/teams/[teamId]/public-page.ts
// PATCH : a captain or a team member with the `edit_public_page` permission
// can update the public-facing fields of their team page.
//
// Editable fields: description (short bio), public_content (markdown rich
// content), logo_url, banner_url, twitter, discord, website, accent_color.
// All edits are recorded in `team_audit_logs` so staff can audit / revert.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withAuthRoute } from '@/utils/staff';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID, sanitizeUrl } from '@/utils/apiHelpers';
import { hasTeamPermission } from '@/utils/teams/permissions';
import {
  TEAM_PUBLIC_CONTENT_MAX_LENGTH,
  normalizeAccentColor,
} from '@/utils/markdown/teamPublicMarkdown';
import { logger } from '@/utils/logger';

const DESCRIPTION_MAX = 280;
const HANDLE_MAX = 80;

type Updates = {
  description: string | null;
  public_content: string | null;
  accent_color: string | null;
  logo_url: string | null;
  banner_url: string | null;
  twitter: string | null;
  discord: string | null;
  website: string | null;
};

function trimOrNull(
  raw: unknown,
  max: number
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === '') {
    return { ok: true, value: null };
  }
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Format invalide.' };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > max) {
    return { ok: false, error: `Trop long (max ${max} caractères).` };
  }
  return { ok: true, value: trimmed };
}

function validateLogoUrl(raw: unknown): string | null | 'invalid' {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') return 'invalid';
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Accept Supabase Storage URLs (http/https). Reject anything else.
  if (sanitizeUrl(trimmed)) return trimmed;
  return 'invalid';
}

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(req, res, { max: 12, windowMs: 60_000 }, 'team-public-page')
  )
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

  const body = (req.body ?? {}) as Record<string, unknown>;

  const description = trimOrNull(body.description, DESCRIPTION_MAX);
  if (!description.ok) return res.status(400).json({ error: description.error });

  const publicContent = trimOrNull(
    body.public_content,
    TEAM_PUBLIC_CONTENT_MAX_LENGTH
  );
  if (!publicContent.ok)
    return res.status(400).json({ error: publicContent.error });

  // Accent color: validated only if non-empty
  let accentColor: string | null = null;
  if (body.accent_color !== undefined && body.accent_color !== null) {
    if (typeof body.accent_color !== 'string') {
      return res.status(400).json({ error: 'accent_color invalide.' });
    }
    if (body.accent_color.trim() === '') {
      accentColor = null;
    } else {
      const normalized = normalizeAccentColor(body.accent_color);
      if (!normalized) {
        return res.status(400).json({
          error: 'accent_color doit être un hex (#rgb ou #rrggbb).',
        });
      }
      accentColor = normalized;
    }
  }

  const logo = validateLogoUrl(body.logo_url);
  if (logo === 'invalid')
    return res.status(400).json({ error: 'logo_url invalide.' });
  const banner = validateLogoUrl(body.banner_url);
  if (banner === 'invalid')
    return res.status(400).json({ error: 'banner_url invalide.' });

  const twitter = trimOrNull(body.twitter, HANDLE_MAX);
  if (!twitter.ok) return res.status(400).json({ error: twitter.error });

  // discord: free-form (server invite link or ID), kept short
  const discord = trimOrNull(body.discord, HANDLE_MAX);
  if (!discord.ok) return res.status(400).json({ error: discord.error });

  // website: must be http(s) URL when provided
  let website: string | null = null;
  if (
    body.website !== undefined &&
    body.website !== null &&
    body.website !== ''
  ) {
    if (typeof body.website !== 'string') {
      return res.status(400).json({ error: 'website invalide.' });
    }
    const trimmed = body.website.trim();
    if (trimmed) {
      const safe = sanitizeUrl(trimmed);
      if (!safe) {
        return res
          .status(400)
          .json({ error: 'website doit être une URL http(s) valide.' });
      }
      if (safe.length > 200) {
        return res.status(400).json({ error: 'website trop long.' });
      }
      website = safe;
    }
  }

  const updates: Updates = {
    description: description.value,
    public_content: publicContent.value,
    accent_color: accentColor,
    logo_url: logo,
    banner_url: banner,
    twitter: twitter.value,
    discord: discord.value,
    website,
  };

  // Snapshot previous state for audit
  const { data: before, error: beforeErr } = await supabaseAdmin
    .from('teams')
    .select(
      'description, public_content, accent_color, logo_url, banner_url, twitter, discord, website'
    )
    .eq('id', teamId)
    .maybeSingle();

  if (beforeErr || !before) {
    return res.status(404).json({ error: 'Équipe introuvable.' });
  }

  const { error: updateErr } = await supabaseAdmin
    .from('teams')
    .update(updates)
    .eq('id', teamId);

  if (updateErr) {
    logger.error('[team-public-page] update error:', updateErr);
    return res.status(500).json({ error: 'Échec de la mise à jour.' });
  }

  // Audit log: record only the fields that actually changed
  const beforeRecord = before as Record<string, unknown>;
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(updates) as (keyof Updates)[]) {
    if (beforeRecord[key] !== updates[key]) {
      diff[key] = { from: beforeRecord[key] ?? null, to: updates[key] };
    }
  }

  if (Object.keys(diff).length > 0) {
    const { error: logErr } = await supabaseAdmin.from('team_audit_logs').insert({
      team_id: teamId,
      user_id: user.id,
      action: 'update_public_page',
      payload: { diff },
    });
    if (logErr) {
      logger.error('[team-public-page] audit log error:', logErr);
      // Non-blocking: the update already succeeded.
    }
  }

  return res.status(200).json({
    success: true,
    updatedFields: Object.keys(diff),
  });
});
