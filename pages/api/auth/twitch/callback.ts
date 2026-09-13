// GET /api/auth/twitch/callback
//
// Retour du flux OAuth Twitch côté joueuse. PUBLIC (le navigateur y arrive par
// un 302 de Twitch), mais protégé par un state SIGNÉ + un cookie nonce en
// double-submit : la confiance vient du state émis par `/api/auth/twitch/start`,
// pas de la session.
//
// Déroulé :
//   1. verifyTwitchIdentityState (signature + péremption) puis comparaison au
//      cookie nonce ;
//   2. vérification que la session courante est bien CELLE qui a lancé le flux ;
//   3. échange du code → identité Twitch (aucun scope, aucun jeton conservé) ;
//   4. upsert du lien, refus si le compte Twitch est déjà à quelqu'un d'autre ;
//   5. 302 vers `returnTo` avec un statut lisible par l'interface.
//
// Statuts rendus :
//   ?twitch=linked         → lien créé ou rafraîchi
//   ?twitch=already_linked → ce compte Twitch appartient à un AUTRE compte
//   ?twitch=error          → tout le reste (state invalide, échange raté…)
//
// POURQUOI ON REVÉRIFIE LA SESSION alors que le state est signé : sans cela,
// un state volé encore valide permettrait de rattacher un compte Twitch au
// compte de la personne qui a lancé le flux, depuis n'importe quel navigateur.
// Le state prouve l'origine de la demande ; la session prouve qui la termine.
// Il faut les deux.
//
// AUCUN JETON N'EST ÉCRIT NULLE PART, ni dans l'URL de redirection, ni en base :
// on lit l'identité et on l'oublie.

import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';

import { getServerClient } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import {
  isTwitchIdentityConfigured,
  verifyTwitchIdentityState,
  exchangeCodeForIdentity,
} from '@/utils/twitchIdentity';
import { upsertTwitchLink } from '@/utils/auth/twitchLinks';
import { logger } from '@/utils/logger';
import { STATE_COOKIE } from './start';

const DEFAULT_RETURN_TO = '/player/profile';

type TwitchLinkStatus = 'linked' | 'already_linked' | 'error';

function sanitizeReturnTo(raw: string | undefined): string {
  if (!raw || typeof raw !== 'string') return DEFAULT_RETURN_TO;
  const value = raw.trim();
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return DEFAULT_RETURN_TO;
  }
  return value;
}

function withStatus(returnTo: string, status: TwitchLinkStatus): string {
  const sep = returnTo.includes('?') ? '&' : '?';
  return `${returnTo}${sep}twitch=${status}`;
}

function clearStateCookie(res: NextApiResponse): void {
  res.setHeader(
    'Set-Cookie',
    serialize(STATE_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })
  );
}

function redirect(res: NextApiResponse, url: string): void {
  res.setHeader('Location', url);
  res.status(302).end();
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'twitch-link-cb')
  ) {
    return;
  }

  if (!isTwitchIdentityConfigured()) {
    return res.status(503).json({
      error: 'Liaison Twitch indisponible.',
      code: 'TWITCH_IDENTITY_NOT_CONFIGURED',
    });
  }

  const rawState =
    typeof req.query.state === 'string' ? req.query.state : undefined;
  const payload = verifyTwitchIdentityState(rawState);
  // Sans state exploitable, on ne sait même pas où renvoyer : chemin par défaut.
  const returnTo = sanitizeReturnTo(payload?.returnTo);

  clearStateCookie(res);

  if (!payload) {
    logger.warn('[twitch/callback] state invalide ou périmé');
    return redirect(res, withStatus(DEFAULT_RETURN_TO, 'error'));
  }

  // Double-submit : le nonce du cookie doit valoir celui du state signé.
  const cookieNonce = req.cookies?.[STATE_COOKIE];
  if (!cookieNonce || cookieNonce !== payload.nonce) {
    logger.warn('[twitch/callback] nonce absent ou discordant');
    return redirect(res, withStatus(returnTo, 'error'));
  }

  // La personne qui TERMINE le flux doit être celle qui l'a LANCÉ.
  const supabase = getServerClient(req, res);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== payload.authUserId) {
    logger.warn('[twitch/callback] session absente ou différente du state');
    return redirect(res, withStatus(returnTo, 'error'));
  }

  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!code) {
    // Refus côté Twitch (la personne a annulé) : ce n'est pas une panne, mais
    // il n'y a rien à lier.
    return redirect(res, withStatus(returnTo, 'error'));
  }

  const identity = await exchangeCodeForIdentity(code);
  if (!identity) {
    return redirect(res, withStatus(returnTo, 'error'));
  }

  const result = await upsertTwitchLink(user.id, {
    twitchUserId: identity.twitchUserId,
    twitchLogin: identity.login || identity.displayName || null,
  });

  if (!result.ok) {
    if (result.code === 'ALREADY_LINKED_TO_OTHER') {
      // On ne vole pas un lien : la personne doit délier depuis l'autre compte.
      return redirect(res, withStatus(returnTo, 'already_linked'));
    }
    return redirect(res, withStatus(returnTo, 'error'));
  }

  return redirect(res, withStatus(returnTo, 'linked'));
}
