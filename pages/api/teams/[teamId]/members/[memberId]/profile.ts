// pages/api/teams/[teamId]/members/[memberId]/profile.ts
// PATCH : update a single team member's public-facing profile (display name,
// specialty, avatar, pronouns, tagline, individual socials, substitute flag).
//
// Authorization rules:
//   - the member herself can edit her own profile
//   - the team captain can edit any member of her team
//   - any team member with the `edit_public_page` permission can edit the
//     profiles of teammates (e.g. a manager)
//
// All edits are recorded in `team_audit_logs` so staff can audit / revert.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withAuthRoute } from '@/utils/staff';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID, sanitizeUrl } from '@/utils/apiHelpers';
import { hasTeamPermission } from '@/utils/teams/permissions';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import {
  MEMBER_DISPLAY_NAME_MAX,
  MEMBER_PRONOUNS_MAX,
  MEMBER_TAGLINE_MAX,
  normalizeMemberSpecialty,
  type MemberSpecialty,
} from '@/utils/markdown/teamPublicMarkdown';
import { logger } from '@/utils/logger';

const HANDLE_MAX = 80;

type Updates = {
  display_name: string | null;
  specialty: MemberSpecialty | null;
  avatar_url: string | null;
  pronouns: string | null;
  tagline: string | null;
  twitter: string | null;
  twitch: string | null;
  is_substitute: boolean | null;
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

function validateAvatarUrl(raw: unknown): string | null | 'invalid' {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw !== 'string') return 'invalid';
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > 300) return 'invalid';
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
    applyRateLimit(req, res, { max: 12, windowMs: 60_000 }, 'team-member-profile')
  )
    return;

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  const { teamId, memberId } = req.query;
  if (typeof teamId !== 'string' || !isValidUUID(teamId)) {
    return res.status(400).json({ error: 'teamId invalide.' });
  }
  if (typeof memberId !== 'string' || !isValidUUID(memberId)) {
    return res.status(400).json({ error: 'memberId invalide.' });
  }

  const tenantId = resolveTenantIdForUserRequest(req, { authUserId: user.id });

  // Look up the member to confirm she belongs to the team and to get her
  // user_id (needed for the self-edit allowance).
  const { data: member, error: memberErr } = await supabaseAdmin
    .from('team_members')
    .select(
      'id, team_id, user_id, role, display_name, specialty, avatar_url, pronouns, tagline, twitter, twitch, is_substitute'
    )
    .eq('id', memberId)
    .eq('team_id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (memberErr || !member) {
    return res
      .status(404)
      .json({ error: 'Membre introuvable dans cette équipe.' });
  }

  const isSelf = member.user_id === user.id;
  let allowed = isSelf;
  if (!allowed) {
    allowed = await hasTeamPermission(user.id, teamId, 'edit_public_page');
  }
  if (!allowed) {
    return res
      .status(403)
      .json({ error: "Tu n'as pas la permission d'éditer ce profil." });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const displayName = trimOrNull(body.display_name, MEMBER_DISPLAY_NAME_MAX);
  if (!displayName.ok) return res.status(400).json({ error: displayName.error });

  let specialty: MemberSpecialty | null = null;
  if (body.specialty !== undefined && body.specialty !== null) {
    if (typeof body.specialty !== 'string') {
      return res.status(400).json({ error: 'specialty invalide.' });
    }
    if (body.specialty.trim() === '') {
      specialty = null;
    } else {
      const normalized = normalizeMemberSpecialty(body.specialty);
      if (!normalized) {
        return res.status(400).json({
          error: 'specialty doit être tank, dps, support ou flex.',
        });
      }
      specialty = normalized;
    }
  }

  const avatar = validateAvatarUrl(body.avatar_url);
  if (avatar === 'invalid')
    return res.status(400).json({ error: 'avatar_url invalide.' });

  const pronouns = trimOrNull(body.pronouns, MEMBER_PRONOUNS_MAX);
  if (!pronouns.ok) return res.status(400).json({ error: pronouns.error });

  const tagline = trimOrNull(body.tagline, MEMBER_TAGLINE_MAX);
  if (!tagline.ok) return res.status(400).json({ error: tagline.error });

  const twitter = trimOrNull(body.twitter, HANDLE_MAX);
  if (!twitter.ok) return res.status(400).json({ error: twitter.error });

  const twitch = trimOrNull(body.twitch, HANDLE_MAX);
  if (!twitch.ok) return res.status(400).json({ error: twitch.error });

  // is_substitute: only updatable by team admins, not by the member herself
  // (a substitute shouldn't be able to promote herself to titulaire).
  let isSubstitute: boolean | null = null;
  if (body.is_substitute !== undefined && body.is_substitute !== null) {
    if (typeof body.is_substitute !== 'boolean') {
      return res.status(400).json({ error: 'is_substitute invalide.' });
    }
    if (
      isSelf &&
      !(await hasTeamPermission(user.id, teamId, 'edit_public_page'))
    ) {
      return res.status(403).json({
        error:
          "Seul le capitaine ou un manager peut changer le statut titulaire/remplaçant.",
      });
    }
    isSubstitute = body.is_substitute;
  }

  const updates: Updates = {
    display_name: displayName.value,
    specialty,
    avatar_url: avatar,
    pronouns: pronouns.value,
    tagline: tagline.value,
    twitter: twitter.value,
    twitch: twitch.value,
    is_substitute: isSubstitute,
  };

  // Build the patch — drop is_substitute if not provided (keep existing value).
  const patch: Record<string, unknown> = {
    display_name: updates.display_name,
    specialty: updates.specialty,
    avatar_url: updates.avatar_url,
    pronouns: updates.pronouns,
    tagline: updates.tagline,
    twitter: updates.twitter,
    twitch: updates.twitch,
  };
  if (updates.is_substitute !== null) {
    patch.is_substitute = updates.is_substitute;
  }

  const { error: updateErr } = await supabaseAdmin
    .from('team_members')
    .update(patch)
    .eq('id', memberId)
    .eq('team_id', teamId)
    .eq('tenant_id', tenantId);

  if (updateErr) {
    logger.error('[team-member-profile] update error:', updateErr);
    return res.status(500).json({ error: 'Échec de la mise à jour.' });
  }

  // Audit log: only the fields that actually changed.
  const before = member as Record<string, unknown>;
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(patch)) {
    const fromVal = before[key] ?? null;
    const toVal = patch[key];
    if (fromVal !== toVal) {
      diff[key] = { from: fromVal, to: toVal };
    }
  }

  if (Object.keys(diff).length > 0) {
    const { error: logErr } = await supabaseAdmin.from('team_audit_logs').insert({
      team_id: teamId,
      user_id: user.id,
      action: 'update_member_profile',
      payload: { member_id: memberId, diff },
      tenant_id: tenantId,
    });
    if (logErr) {
      logger.error('[team-member-profile] audit log error:', logErr);
    }
  }

  return res.status(200).json({
    success: true,
    updatedFields: Object.keys(diff),
  });
});
