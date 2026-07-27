// GET /api/auth/battlenet/callback
//
// Retour du flux OAuth Battle.net. Valide le state (CSRF double-submit :
// cookie nonce vs state signé + binding session), échange le code, lit le
// BattleTag vérifié, rattache le lien (anti-smurf) et estampille les lignes
// team_members correspondantes. Redirige (302) vers l'espace joueur avec un
// statut ?battlenet=... que l'UI affiche :
//
//   ?battlenet=verified         → lien créé + au moins 1 ligne roster estampillée
//   ?battlenet=linked           → lien créé, l'utilisateur n'a AUCUNE ligne de
//                                 roster (cas normal d'un staff non-joueuse) —
//                                 succès neutre, surtout pas un avertissement
//   ?battlenet=linked_no_match  → lien créé mais aucun battle_tag roster ne matche
//   ?battlenet=already_linked   → compte Blizzard déjà lié à un autre utilisateur
//   ?battlenet=error            → toute autre erreur (state invalide, échange, etc.)
//
// Navigation pleine page → auth via session cookie Supabase (getServerClient).
//
// DEUX FLUX, UNE SEULE redirect_uri (celle déclarée chez Blizzard) :
//   - vérification (défaut) : state signé PORTANT un authUserId, session requise ;
//   - connexion : state signé `purpose: 'login'`, AUCUNE session, cookie de
//     nonce distinct (`bn_login_state`). On branche sur le state AVANT de lire
//     la session, sinon une connexion (par définition anonyme) serait rejetée
//     par le garde-fou de session du flux de vérification.

import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';
import { getServerClient } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import {
  isBattlenetConfigured,
  verifyBattlenetState,
  verifyBattlenetLoginState,
  exchangeCodeForToken,
  fetchBattlenetUserinfo,
} from '@/utils/battlenet';
import {
  upsertBattlenetLink,
  stampVerifiedTeamMembers,
  findAuthUserIdByBattleNetId,
} from '@/utils/auth/battlenetLinks';
import { supabaseAdmin } from '@/utils/supabase';
import { LOGIN_STATE_COOKIE } from './login-start';
import { logger } from '../../../../utils/logger';

const STATE_COOKIE = 'bn_oauth_state';
const DEFAULT_RETURN_TO = '/player/profile';

type BattlenetStatus =
  | 'verified'
  | 'linked'
  | 'linked_no_match'
  | 'already_linked'
  | 'error';

/** Statuts propres au flux de connexion, affichés sur /login. */
type BattlenetLoginStatus = 'not_linked' | 'error';

/** Page qui consomme le token magic-link et pose la session côté client. */
const LOGIN_LANDING = '/auth/battlenet';
const LOGIN_FALLBACK = '/login';

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

function clearCookie(res: NextApiResponse, name: string): void {
  const cookie = serialize(name, '', {
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

function clearStateCookie(res: NextApiResponse): void {
  clearCookie(res, STATE_COOKIE);
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

  // ── Flux CONNEXION ────────────────────────────────────────────────────────
  // Branché AVANT la lecture de session : une connexion est par définition
  // anonyme. Un state de vérification est rejeté ici (purpose absent), et
  // réciproquement un state de connexion n'a pas d'authUserId.
  const stateRaw =
    typeof req.query.state === 'string' ? req.query.state : undefined;
  const loginState = verifyBattlenetLoginState(stateRaw);
  if (loginState) {
    return handleLogin(req, res, loginState.nonce, loginState.returnTo);
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

    const { verifiedCount, mismatchCount } = await stampVerifiedTeamMembers(
      user.id,
      info.battleTag,
      info.battleNetId
    );

    // Aucune ligne estampillée ET aucun mismatch ⇒ l'utilisateur n'est dans
    // aucun roster (staff non-joueuse, joueuse pas encore inscrite). Le lien est
    // valide : c'est un succès neutre, pas le « ton tag ne correspond pas »
    // qui n'aurait aucun sens ici.
    const status: BattlenetStatus =
      verifiedCount > 0
        ? 'verified'
        : mismatchCount > 0
          ? 'linked_no_match'
          : 'linked';

    return redirect(res, withStatus(returnTo, status));
  } catch (err) {
    logger.error('[battlenet/callback] flow error', err);
    return redirect(res, withStatus(returnTo, 'error'));
  }
}

/**
 * Connexion via Battle.net, pour un compte DÉJÀ lié uniquement.
 *
 * Blizzard ne renvoie pas d'email : on ne peut donc ni créer un compte, ni en
 * rattacher un existant sans identifiant commun fiable — ce serait une prise de
 * contrôle de compte. Un compte Blizzard inconnu est renvoyé vers /login avec
 * `?battlenet=not_linked`, jamais créé.
 *
 * La session est posée par le même pont éprouvé que l'accès équipe : on génère
 * un magic-link côté serveur (`admin.generateLink`), on n'utilise PAS
 * l'`action_link` (code PKCE non échangeable côté client) mais le
 * `hashed_token`, consommé par /auth/battlenet via `verifyOtp`.
 */
async function handleLogin(
  req: NextApiRequest,
  res: NextApiResponse,
  stateNonce: string,
  rawReturnTo: string
): Promise<void> {
  const cookieNonce = req.cookies?.[LOGIN_STATE_COOKIE];
  clearCookie(res, LOGIN_STATE_COOKIE);

  const fail = (status: BattlenetLoginStatus) =>
    redirect(res, `${LOGIN_FALLBACK}?battlenet=${status}`);

  // Double-submit : le nonce du state signé doit égaler celui du cookie.
  if (!cookieNonce || cookieNonce !== stateNonce) return fail('error');

  // Refus de consentement côté Blizzard.
  if (typeof req.query.error === 'string' && req.query.error) {
    return fail('error');
  }
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!code) return fail('error');
  if (!supabaseAdmin) return fail('error');

  try {
    const token = await exchangeCodeForToken(code);
    const info = await fetchBattlenetUserinfo(token.accessToken);

    const authUserId = await findAuthUserIdByBattleNetId(info.battleNetId);
    if (!authUserId) {
      // Compte Blizzard valide mais inconnu du site : on n'invente rien.
      return fail('not_linked');
    }

    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.admin.getUserById(authUserId);
    const email = userData?.user?.email;
    if (userErr || !email) {
      logger.error('[battlenet/callback] login: compte lié sans email', {
        authUserId,
        error: userErr?.message,
      });
      return fail('error');
    }

    const returnTo = sanitizeReturnTo(rawReturnTo);
    const { data: linkData, error: linkErr } =
      await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
      });
    const tokenHash = linkData?.properties?.hashed_token;
    if (linkErr || !tokenHash) {
      logger.error('[battlenet/callback] login: generateLink failed', {
        error: linkErr?.message ?? 'no token',
      });
      return fail('error');
    }

    return redirect(
      res,
      `${LOGIN_LANDING}?token_hash=${encodeURIComponent(
        tokenHash
      )}&type=magiclink&next=${encodeURIComponent(returnTo)}`
    );
  } catch (err) {
    logger.error('[battlenet/callback] login flow error', err);
    return fail('error');
  }
}
