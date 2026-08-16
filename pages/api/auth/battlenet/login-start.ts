// GET /api/auth/battlenet/login-start
//
// Démarre le flux de CONNEXION Battle.net — pendant anonyme de
// `/api/auth/battlenet/start` (qui, lui, exige une session : c'est le flux de
// vérification d'identité).
//
// Différences essentielles avec le flux de vérification :
//   - aucune session requise (c'est le but : se connecter) ;
//   - le state ne peut donc pas être lié à un utilisateur → la protection CSRF
//     repose sur le double-submit du nonce (cookie httpOnly vs state signé) et
//     sur le discriminant `purpose: 'login'` du state ;
//   - le cookie de nonce porte un nom DISTINCT (`bn_login_state`) : les deux
//     flux ne doivent jamais pouvoir consommer le nonce l'un de l'autre.
//
// La `redirect_uri` déclarée chez Blizzard est UNIQUE et partagée : c'est
// toujours `/api/auth/battlenet/callback`, qui branche sur le `purpose` du
// state. Ajouter un login n'a donc demandé aucun changement côté Blizzard.
//
// Cette connexion ne fonctionne QUE pour un compte déjà lié : Blizzard ne
// renvoie pas d'email (`oauth/userinfo` = `sub` + `battletag`), donc on ne peut
// ni créer un compte ni le rattacher sans ouvrir une prise de contrôle. Un
// compte inconnu est renvoyé vers /login avec `?battlenet=not_linked`.

import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';
import { applyRateLimit } from '@/utils/rateLimit';
import {
  isBattlenetConfigured,
  buildAuthorizeUrl,
  signBattlenetLoginState,
  generateStateNonce,
} from '@/utils/battlenet';

export const LOGIN_STATE_COOKIE = 'bn_login_state';
const STATE_COOKIE_MAX_AGE = 600; // 10 minutes, en secondes
const DEFAULT_RETURN_TO = '/player';

/**
 * N'accepte qu'un chemin interne relatif (anti open-redirect). Même règle que
 * le flux de vérification.
 */
function sanitizeReturnTo(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_RETURN_TO;
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Endpoint anonyme : le rate-limit est la seule barrière, on le serre un peu
  // plus que le flux authentifié.
  if (
    applyRateLimit(
      req,
      res,
      { max: 15, windowMs: 60_000 },
      'battlenet-login-start'
    )
  )
    return;

  if (!isBattlenetConfigured()) {
    return res.status(503).json({
      error: "La connexion Battle.net n'est pas configurée.",
      code: 'BATTLENET_NOT_CONFIGURED',
    });
  }

  const returnTo = sanitizeReturnTo(req.query.returnTo);
  const nonce = generateStateNonce();
  const state = signBattlenetLoginState({ nonce, returnTo });

  res.setHeader(
    'Set-Cookie',
    serialize(LOGIN_STATE_COOKIE, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: STATE_COOKIE_MAX_AGE,
    })
  );

  res.setHeader('Location', buildAuthorizeUrl(state));
  return res.status(302).end();
}
