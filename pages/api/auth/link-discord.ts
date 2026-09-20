// POST /api/auth/link-discord
//
// Reads the current Supabase session, extracts the Discord identity attached
// to the user (provider='discord' in auth.users.identities), and persists it
// into the user_discord_links table so the bot can later DM the user.
//
// No body required. The endpoint is idempotent: re-calling it refreshes the
// stored Discord username.
//
// `{ transfer: true }` REPREND le lien quand ce compte Discord est déjà
// rattaché à un autre compte du site. C'est la sortie du piège du double
// compte (un compte e-mail au roster + un compte Discord OAuth hors roster),
// qui faisait retirer le rôle d'équipe toutes les 30 minutes sans que
// personne puisse rien y faire sans passer par la base. L'identifiant Discord
// vient de l'identité OAuth de la session, jamais d'une saisie : le reprendre
// exige donc de prouver qu'on contrôle ce compte Discord.

import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerClient, supabaseAdmin } from '@/utils/supabase';
import { claimDiscordLink } from '@/utils/discordLinks';
import { claimFreePlayerRows } from '@/utils/freePlayers/claimForAccount';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
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

  const allowTransfer =
    (req.body as { transfer?: unknown } | null)?.transfer === true;

  const result = await claimDiscordLink(user.id, discordUserId, username, {
    allowTransfer,
  });

  if (!result.ok) {
    if (result.code === 'held_by_other') {
      // 409 AVEC un code et l'adresse masquée de l'autre compte : sans ça,
      // l'écran ne peut que dire « déjà lié » et laisser la personne devant
      // un mur. Avec, il peut proposer la reprise — et elle reconnaît son
      // propre second compte.
      const { data: other } = await supabaseAdmin.auth.admin.getUserById(
        result.heldBy
      );
      return res.status(409).json({
        error: 'Ce compte Discord est déjà lié à un autre compte du site.',
        code: 'HELD_BY_OTHER',
        heldByEmail: maskEmail(other?.user?.email ?? null),
        canTransfer: true,
      });
    }
    return res
      .status(500)
      .json({ error: 'Échec de l’enregistrement du lien Discord' });
  }

  if (result.transferredFrom) {
    logger.info(
      '[link-discord] lien repris discord=%s de=%s vers=%s',
      discordUserId,
      result.transferredFrom,
      user.id
    );
  }

  // La fiche « joueuse libre » poussée par le rôle Discord « Recherche une
  // équipe » ne portait qu'un identifiant : elle est maintenant rattachable à
  // ce compte, ce qui rend l'invitation en un clic possible sur elle.
  // Fire-and-forget : la liaison Discord ne doit pas échouer pour autant.
  void claimFreePlayerRows({
    tenantId: await resolveTenantIdForUserRequestAsync(req),
    authUserId: user.id,
    email: user.email ?? null,
    discordUserId,
  });

  return res.status(200).json({
    success: true,
    discordUserId,
    discordUsername: username,
    transferred: !!result.transferredFrom,
  });
}

/**
 * `ve***@gmail.com` — assez pour reconnaître SON propre second compte, pas
 * assez pour apprendre l'adresse de quelqu'un d'autre. Le cas nominal est une
 * personne qui a deux comptes ; le cas à protéger est celui où ce n'en est
 * pas une.
 */
function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return null;
  const head = local.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}
