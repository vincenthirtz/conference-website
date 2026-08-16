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
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import {
  TEAM_PUBLIC_CONTENT_MAX_LENGTH,
  normalizeAccentColor,
  normalizeBannerOverlay,
  normalizeBannerFocal,
  normalizeAchievement,
  normalizeSponsor,
  normalizePinnedAnnouncement,
  normalizeTimestamp,
  parseEmbedUrl,
  ACHIEVEMENTS_MAX,
  SPONSORS_MAX,
  type Achievement,
  type Sponsor,
  type EmbedProvider,
} from '@/utils/markdown/teamPublicMarkdown';
import { logger } from '@/utils/logger';

const DESCRIPTION_MAX = 280;
const HANDLE_MAX = 80;

type Updates = {
  description: string | null;
  public_content: string | null;
  accent_color: string | null;
  secondary_color: string | null;
  banner_overlay: string | null;
  banner_focal: string | null;
  logo_url: string | null;
  banner_url: string | null;
  twitter: string | null;
  discord: string | null;
  website: string | null;
  youtube: string | null;
  twitch: string | null;
  instagram: string | null;
  tiktok: string | null;
  achievements: Achievement[];
  sponsors: Sponsor[];
  embed_provider: EmbedProvider | null;
  embed_id: string | null;
  pinned_announcement: string | null;
  pinned_announcement_until: string | null;
};

function normalizeHexInput(
  raw: unknown,
  fieldName: string
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== 'string') {
    return { ok: false, error: `${fieldName} invalide.` };
  }
  if (raw.trim() === '') return { ok: true, value: null };
  const normalized = normalizeAccentColor(raw);
  if (!normalized) {
    return {
      ok: false,
      error: `${fieldName} doit être un hex (#rgb ou #rrggbb).`,
    };
  }
  return { ok: true, value: normalized };
}

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

  const tenantId = resolveTenantIdForUserRequest(req, { authUserId: user.id });

  const allowed = await hasTeamPermission(user.id, teamId, 'edit_public_page');
  if (!allowed) {
    return res
      .status(403)
      .json({ error: "Tu n'as pas la permission d'éditer cette équipe." });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const description = trimOrNull(body.description, DESCRIPTION_MAX);
  if (!description.ok)
    return res.status(400).json({ error: description.error });

  const publicContent = trimOrNull(
    body.public_content,
    TEAM_PUBLIC_CONTENT_MAX_LENGTH
  );
  if (!publicContent.ok)
    return res.status(400).json({ error: publicContent.error });

  const accentResult = normalizeHexInput(body.accent_color, 'accent_color');
  if (!accentResult.ok)
    return res.status(400).json({ error: accentResult.error });
  const accentColor = accentResult.value;

  const secondaryResult = normalizeHexInput(
    body.secondary_color,
    'secondary_color'
  );
  if (!secondaryResult.ok)
    return res.status(400).json({ error: secondaryResult.error });
  const secondaryColor = secondaryResult.value;

  let bannerOverlay: string | null = null;
  if (body.banner_overlay !== undefined && body.banner_overlay !== null) {
    if (typeof body.banner_overlay !== 'string') {
      return res.status(400).json({ error: 'banner_overlay invalide.' });
    }
    if (body.banner_overlay.trim() === '') {
      bannerOverlay = null;
    } else {
      const normalized = normalizeBannerOverlay(body.banner_overlay);
      if (!normalized) {
        return res.status(400).json({
          error: 'banner_overlay doit être gradient, dark, none, grid ou dots.',
        });
      }
      bannerOverlay = normalized;
    }
  }

  let bannerFocal: string | null = null;
  if (body.banner_focal !== undefined && body.banner_focal !== null) {
    if (typeof body.banner_focal !== 'string') {
      return res.status(400).json({ error: 'banner_focal invalide.' });
    }
    if (body.banner_focal.trim() === '') {
      bannerFocal = null;
    } else {
      const normalized = normalizeBannerFocal(body.banner_focal);
      if (!normalized) {
        return res.status(400).json({
          error: 'banner_focal doit être center, top, bottom, left ou right.',
        });
      }
      bannerFocal = normalized;
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

  const youtube = trimOrNull(body.youtube, HANDLE_MAX);
  if (!youtube.ok) return res.status(400).json({ error: youtube.error });

  const twitch = trimOrNull(body.twitch, HANDLE_MAX);
  if (!twitch.ok) return res.status(400).json({ error: twitch.error });

  const instagram = trimOrNull(body.instagram, HANDLE_MAX);
  if (!instagram.ok) return res.status(400).json({ error: instagram.error });

  const tiktok = trimOrNull(body.tiktok, HANDLE_MAX);
  if (!tiktok.ok) return res.status(400).json({ error: tiktok.error });

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

  // Achievements: array of {title, date, tournament}, capped at ACHIEVEMENTS_MAX
  let achievements: Achievement[] = [];
  if (body.achievements !== undefined && body.achievements !== null) {
    if (!Array.isArray(body.achievements)) {
      return res
        .status(400)
        .json({ error: 'achievements doit être un tableau.' });
    }
    if (body.achievements.length > ACHIEVEMENTS_MAX) {
      return res
        .status(400)
        .json({ error: `Trop d'achievements (max ${ACHIEVEMENTS_MAX}).` });
    }
    for (const raw of body.achievements) {
      const r = normalizeAchievement(raw);
      if (!r.ok) return res.status(400).json({ error: r.error });
      achievements.push(r.value);
    }
  }

  // Sponsors: array of {name, logo_url, url}, capped at SPONSORS_MAX
  let sponsors: Sponsor[] = [];
  if (body.sponsors !== undefined && body.sponsors !== null) {
    if (!Array.isArray(body.sponsors)) {
      return res.status(400).json({ error: 'sponsors doit être un tableau.' });
    }
    if (body.sponsors.length > SPONSORS_MAX) {
      return res
        .status(400)
        .json({ error: `Trop de sponsors (max ${SPONSORS_MAX}).` });
    }
    for (const raw of body.sponsors) {
      const r = normalizeSponsor(raw);
      if (!r.ok) return res.status(400).json({ error: r.error });
      sponsors.push(r.value);
    }
  }

  // Embed: client sends `embed_url` (or null). We parse it server-side and
  // store provider+id separately so the iframe URL is deterministic.
  let embedProvider: EmbedProvider | null = null;
  let embedId: string | null = null;
  if (
    body.embed_url !== undefined &&
    body.embed_url !== null &&
    body.embed_url !== ''
  ) {
    if (typeof body.embed_url !== 'string') {
      return res.status(400).json({ error: 'embed_url invalide.' });
    }
    const trimmed = body.embed_url.trim();
    if (trimmed) {
      const parsed = parseEmbedUrl(trimmed);
      if (!parsed) {
        return res
          .status(400)
          .json({ error: 'embed_url doit être une URL YouTube ou Twitch.' });
      }
      embedProvider = parsed.provider;
      embedId = parsed.id;
    }
  }

  const announcement = normalizePinnedAnnouncement(body.pinned_announcement);
  if (!announcement.ok)
    return res.status(400).json({ error: announcement.error });

  const announcementUntil = normalizeTimestamp(body.pinned_announcement_until);
  if (!announcementUntil.ok)
    return res.status(400).json({ error: announcementUntil.error });

  const updates: Updates = {
    description: description.value,
    public_content: publicContent.value,
    accent_color: accentColor,
    secondary_color: secondaryColor,
    banner_overlay: bannerOverlay,
    banner_focal: bannerFocal,
    logo_url: logo,
    banner_url: banner,
    twitter: twitter.value,
    discord: discord.value,
    website,
    youtube: youtube.value,
    twitch: twitch.value,
    instagram: instagram.value,
    tiktok: tiktok.value,
    achievements,
    sponsors,
    embed_provider: embedProvider,
    embed_id: embedId,
    pinned_announcement: announcement.value,
    pinned_announcement_until: announcementUntil.value,
  };

  // Snapshot previous state for audit
  const { data: before, error: beforeErr } = await supabaseAdmin
    .from('teams')
    .select(
      'description, public_content, accent_color, secondary_color, banner_overlay, banner_focal, logo_url, banner_url, twitter, discord, website, youtube, twitch, instagram, tiktok, achievements, sponsors, embed_provider, embed_id, pinned_announcement, pinned_announcement_until'
    )
    .eq('id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (beforeErr || !before) {
    return res.status(404).json({ error: 'Équipe introuvable.' });
  }

  const { error: updateErr } = await supabaseAdmin
    .from('teams')
    .update(updates)
    .eq('id', teamId)
    .eq('tenant_id', tenantId);

  if (updateErr) {
    logger.error('[team-public-page] update error:', updateErr);
    return res.status(500).json({ error: 'Échec de la mise à jour.' });
  }

  // Audit log: record only the fields that actually changed.
  // JSONB fields (achievements, sponsors) are deep-compared via JSON.stringify
  // since the snapshot returns fresh references on every read.
  const JSONB_KEYS = new Set<keyof Updates>(['achievements', 'sponsors']);
  const beforeRecord = before as Record<string, unknown>;
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(updates) as (keyof Updates)[]) {
    const fromVal = beforeRecord[key] ?? null;
    const toVal = updates[key];
    const changed = JSONB_KEYS.has(key)
      ? JSON.stringify(fromVal ?? []) !== JSON.stringify(toVal ?? [])
      : fromVal !== toVal;
    if (changed) {
      diff[key] = { from: fromVal, to: toVal };
    }
  }

  if (Object.keys(diff).length > 0) {
    const { error: logErr } = await supabaseAdmin
      .from('team_audit_logs')
      .insert({
        team_id: teamId,
        user_id: user.id,
        action: 'update_public_page',
        payload: { diff },
        tenant_id: tenantId,
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
