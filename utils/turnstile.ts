// utils/turnstile.ts
//
// Server-side Cloudflare Turnstile verification.
//
// Flow:
//   1. Front mounts <Turnstile siteKey={NEXT_PUBLIC_TURNSTILE_SITE_KEY} ... />
//      and POSTs the resulting token alongside the form payload.
//   2. API handler calls `verifyTurnstileToken(token, remoteIp)` which hits
//      Cloudflare's siteverify endpoint and returns { ok, errorCodes? }.
//
// Required env:
//   TURNSTILE_SECRET_KEY — server-side secret from Cloudflare dashboard.
//     If unset, verification is a no-op in non-production (so local dev / unit
//     tests don't need a Cloudflare account) but a hard failure in production.
//
// Zero-dependency : uses fetch only.
//
// Reference: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

import { logger } from './logger';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 5_000;

export type TurnstileVerifyResult = {
  ok: boolean;
  /** Cloudflare error codes, if any (see CF docs for the catalog). */
  errorCodes?: string[];
  /** Human-readable hint, surfaced to the API caller on failure. */
  error?: string;
};

/**
 * Verify a Cloudflare Turnstile token server-side.
 *
 * @param token   The `cf-turnstile-response` token submitted by the client.
 * @param remoteIp Optional client IP (improves CF risk scoring).
 */
export async function verifyTurnstileToken(
  token: string | undefined | null,
  remoteIp?: string
): Promise<TurnstileVerifyResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  // Dev-friendly bypass : if no secret is configured we only fail closed in
  // production. Unit tests + local dev can run without a Cloudflare account.
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      logger.error(
        '[turnstile] TURNSTILE_SECRET_KEY missing in production — failing closed'
      );
      return {
        ok: false,
        error: 'Captcha indisponible côté serveur.',
        errorCodes: ['missing-server-secret'],
      };
    }
    logger.warn('[turnstile] TURNSTILE_SECRET_KEY unset — skipping verification (non-prod)');
    return { ok: true };
  }

  if (!token || typeof token !== 'string') {
    return {
      ok: false,
      error: 'Captcha manquant.',
      errorCodes: ['missing-input-response'],
    };
  }

  const params = new URLSearchParams();
  params.set('secret', secret);
  params.set('response', token);
  if (remoteIp && remoteIp !== 'unknown') {
    params.set('remoteip', remoteIp);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = (await res.json().catch(() => null)) as {
      success?: boolean;
      'error-codes'?: string[];
    } | null;

    if (!res.ok || !data) {
      logger.warn('[turnstile] non-OK response', {
        status: res.status,
        data,
      });
      return {
        ok: false,
        error: 'Captcha non vérifiable.',
        errorCodes: ['siteverify-http-error'],
      };
    }

    if (!data.success) {
      return {
        ok: false,
        error: 'Captcha invalide ou expiré.',
        errorCodes: data['error-codes'] ?? [],
      };
    }

    return { ok: true };
  } catch (err) {
    logger.error('[turnstile] fetch error', err);
    return {
      ok: false,
      error: 'Captcha non vérifiable (erreur réseau).',
      errorCodes: ['network-error'],
    };
  }
}
