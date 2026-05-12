// POST /api/auth/link-discord
//
// Reads the current Supabase session, extracts the Discord identity attached
// to the user (provider='discord' in auth.users.identities), and persists it
// into the user_discord_links table so the bot can later DM the user.
//
// No body required. The endpoint is idempotent: re-calling it refreshes the
// stored Discord username.

import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerClient, supabaseAdmin } from '@/utils/supabase';
import { upsertDiscordLink } from '@/utils/discordLinks';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '../../../utils/logger';

const DISCORD_ID_RE = /^[0-9]{15,25}$/;

type DiscordIdentityData = {
  provider_id?: string;
  sub?: string;
  user_name?: string;
  preferred_username?: string;
  full_name?: string;
  name?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'link-discord'))
    return;

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible' });
  }

  const supabase = getServerClient(req, res);
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return res.status(401).json({ error: 'Non authentifié' });
  }

  // The Supabase client surfaces external identities on auth.users via the
  // `identities` array. We need the admin client to read it reliably across
  // SDK versions.
  const { data: adminUser, error: adminErr } =
    await supabaseAdmin.auth.admin.getUserById(user.id);

  if (adminErr || !adminUser?.user) {
    logger.error('[link-discord] admin getUser error', adminErr);
    return res.status(500).json({ error: 'Impossible de lire le profil' });
  }

  const identities = adminUser.user.identities ?? [];
  const discordIdentity = identities.find((i) => i.provider === 'discord');

  if (!discordIdentity) {
    return res.status(400).json({
      error:
        "Aucune identité Discord liée à ce compte. Connecte-toi via Discord d'abord.",
    });
  }

  const identityData = (discordIdentity.identity_data ??
    {}) as DiscordIdentityData;
  // Supabase stores the Discord snowflake under `provider_id` (or `sub` on
  // older sessions). Both are the raw user ID string.
  const discordUserId = identityData.provider_id || identityData.sub || '';
  if (!DISCORD_ID_RE.test(discordUserId)) {
    return res.status(400).json({ error: 'Discord user ID invalide' });
  }

  const username =
    identityData.user_name ||
    identityData.preferred_username ||
    identityData.full_name ||
    identityData.name ||
    null;

  const result = await upsertDiscordLink(user.id, discordUserId, username);
  if (!result.ok) {
    // Most common failure is the UNIQUE constraint on discord_user_id —
    // surface a clearer message in that case.
    if (result.error?.includes('duplicate key')) {
      return res.status(409).json({
        error:
          "Ce compte Discord est déjà lié à un autre utilisateur du site.",
      });
    }
    return res
      .status(500)
      .json({ error: 'Échec de l’enregistrement du lien Discord' });
  }

  return res.status(200).json({
    success: true,
    discordUserId,
    discordUsername: username,
  });
}
