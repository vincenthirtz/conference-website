// GET /api/bot/v1/players/by-discord/[discordUserId]/twitch
//
// L'état du rattachement Twitch d'une joueuse, vu du bot Discord.
//
// À QUOI ÇA SERT. Une carte réclamée pendant un direct n'a de destinataire que
// si le compte Twitch est relié au compte du site. Le bot est là où les
// joueuses sont déjà : `/twitch` leur dit où elles en sont et leur donne le
// lien. Sans cette route, la commande devrait soit deviner, soit répéter
// l'invitation à quelqu'un de déjà rattaché.
//
// LE SITE COMPOSE `ctaUrl`, PAS LE BOT. Même discipline que `tcg.pack_granted` :
// une base d'URL recopiée côté bot mentirait le jour où elle change, et le site
// est seul à savoir où vit sa page de profil. Le lien vise `/player/profile`
// (et non la route OAuth) parce qu'un lien reçu en message privé arrive très
// souvent sur un navigateur DÉCONNECTÉ : la page redirige alors proprement vers
// la connexion, là où `/api/auth/twitch/start` rendrait un 401 JSON — un
// cul-de-sac.
//
// AUCUN IDENTIFIANT TWITCH N'EST RENDU, seulement le pseudo. `twitch_user_id`
// n'apprendrait rien à personne et n'a pas à circuler ; le pseudo, lui, est
// déjà public et sert à confirmer QUEL compte est relié — une joueuse peut en
// avoir plusieurs.
//
// Auth : x-api-key (per-tenant) via withBotRoute. Le lien Twitch, lui, est
// GLOBAL au compte — comme `user_discord_links` : une identité Twitch ne change
// pas d'une organisation à l'autre. Le tenant reste porté par la récompense.

import type { NextApiResponse } from 'next';

import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { resolveActorPlayer } from '@/utils/botActor';
import { getTwitchLinkStatus } from '@/utils/auth/twitchLinks';
import { isTwitchIdentityConfigured } from '@/utils/twitchIdentity';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { logger } from '@/utils/logger';

// Volontairement identique aux autres routes bot (`{15,25}`) : un identifiant
// Discord court existe encore chez les comptes les plus anciens.
const DISCORD_ID_RE = /^[0-9]{15,25}$/;

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const raw = req.query.discordUserId;
  const discordUserId = typeof raw === 'string' ? raw : '';

  if (!DISCORD_ID_RE.test(discordUserId)) {
    return res
      .status(400)
      .json({ error: 'discordUserId invalide', code: 'INVALID_DISCORD_ID' });
  }

  // Un seul argument : le lien Discord est GLOBAL au compte, pas scopé tenant
  // (comme `user_discord_links` elle-même). Le tenant reste porté par la
  // récompense, pas par l'identité.
  const actor = await resolveActorPlayer(discordUserId);
  if (!actor) {
    // 404 NOT_LINKED : le compte Discord n'est relié à aucun compte du site.
    // C'est le message que la commande traduit en « utilise /inscription ».
    return res
      .status(404)
      .json({ error: 'Compte non relié', code: 'NOT_LINKED' });
  }

  try {
    const status = await getTwitchLinkStatus(actor.authUserId);
    return res.status(200).json({
      authUserId: actor.authUserId,
      discordUserId,
      configured: isTwitchIdentityConfigured(),
      linked: status.linked,
      twitchLogin: status.twitchLogin,
      linkedAt: status.linkedAt,
      ctaUrl: absoluteSiteUrl('/player/profile'),
    });
  } catch (err) {
    logger.error('[bot/player/twitch] lecture impossible', err);
    return res.status(500).json({ error: 'Erreur de lecture' });
  }
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 60, windowMs: 60_000, key: 'bot-player-twitch' },
});
