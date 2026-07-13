// GET /api/auth/battlenet/callback
//
// Retour du flux OAuth Battle.net. Valide le state (CSRF double-submit :
// cookie nonce vs state signé + binding session), échange le code, lit le
// BattleTag vérifié, rattache le lien (anti-smurf) et estampille les lignes
// team_members correspondantes. Redirige (302) vers l'espace joueur avec un
// statut ?battlenet=... que l'UI affiche :
//
//   ?battlenet=verified         → lien créé + au moins 1 ligne roster estampillée
//   ?battlenet=linked_no_match  → lien créé mais aucun battle_tag roster ne matche
//   ?battlenet=already_linked   → compte Blizzard déjà lié à un autre utilisateur
//   ?battlenet=error            → toute autre erreur (state invalide, échange, etc.)
//
// Navigation pleine page → auth via session cookie Supabase (getServerClient).

import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';
import { getServerClient } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import {
  isBattlenetConfigured,
  verifyBattlenetState,
  exchangeCodeForToken,
  fetchBattlenetUserinfo,
} from '@/utils/battlenet';
import {
  upsertBattlenetLink,
  stampVerifiedTeamMembers,
} from '@/utils/auth/battlenetLinks';
import { logger } from '../../../../utils/logger';

const STATE_COOKIE = 'bn_oauth_state';
const DEFAULT_RETURN_TO = '/player/profile';

type BattlenetStatus =
  | 'verified'
  | 'linked_no_match'
  | 'already_linked'
  | 'error';

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

function withStatus(returnTo: string, status: BattlenetStatus): string {
  const sep = returnTo.includes('?') ? '&' : '?';
  return `${returnTo}${sep}battlenet=${status}`;
}

function clearStateCookie(res: NextApiResponse): void {
  const cookie = serialize(STATE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  const existing = res.getHeader('Set-Cookie');
  if (!existing) res.setHeader('Set-Cookie', cookie);
  else if (Array.isArray(existing))
    res.setHeader('Set-Cookie', [...existing, cookie]);
  else res.setHeader('Set-Cookie', [existing.toString(), cookie]);
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
    applyRateLimit(
      req,
      res,
      { max: 20, windowMs: 60_000 },
      'battlenet-callback'
    )
  )
    return;

  // Feature dormante : rien à faire, on répond proprement.
  if (!isBattlenetConfigured()) {
    return res.status(503).json({
      error: "La vérification Battle.net n'est pas configurée.",
      code: 'BATTLENET_NOT_CONFIGURED',
    });
  }

  const supabase = getServerClient(req, res);
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    // Session perdue pendant le round-trip OAuth : on renvoie vers le login.
    clearStateCookie(res);
    return redirect(res, '/login');
  }

  // Valide le state signé (CSRF + binding session) contre le cookie nonce.
  const stateParam =
    typeof req.query.state === 'string' ? req.query.state : undefined;
  const payload = verifyBattlenetState(stateParam);
  const cookieNonce = req.cookies?.[STATE_COOKIE];
  clearStateCookie(res);

  if (
    !payload ||
    !cookieNonce ||
    payload.nonce !== cookieNonce ||
    payload.authUserId !== user.id
  ) {
    return redirect(res, withStatus(DEFAULT_RETURN_TO, 'error'));
  }

  const returnTo = sanitizeReturnTo(payload.returnTo);

  // Le provider a renvoyé une erreur (refus de consentement, etc.).
  if (typeof req.query.error === 'string' && req.query.error) {
    return redirect(res, withStatus(returnTo, 'error'));
  }

  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!code) {
    return redirect(res, withStatus(returnTo, 'error'));
  }

  try {
    const token = await exchangeCodeForToken(code);
    const info = await fetchBattlenetUserinfo(token.accessToken);

    const linkResult = await upsertBattlenetLink(user.id, {
      battleNetId: info.battleNetId,
      battleTag: info.battleTag,
      region: info.region,
    });

    if (!linkResult.ok) {
      if (linkResult.code === 'ALREADY_LINKED_TO_OTHER') {
        return redirect(res, withStatus(returnTo, 'already_linked'));
      }
      return redirect(res, withStatus(returnTo, 'error'));
    }

    const { verifiedCount } = await stampVerifiedTeamMembers(
      user.id,
      info.battleTag,
      info.battleNetId
    );

    return redirect(
      res,
      withStatus(returnTo, verifiedCount > 0 ? 'verified' : 'linked_no_match')
    );
  } catch (err) {
    logger.error('[battlenet/callback] flow error', err);
    return redirect(res, withStatus(returnTo, 'error'));
  }
}
