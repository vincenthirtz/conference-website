// utils/player/calendarToken.ts
//
// Jeton d'abonnement au flux ICS personnel (lot J2, table
// `player_calendar_tokens` — cf. database/migrations/add_player_calendar_tokens.sql).
//
// Le jeton est PORTEUR : quiconque l'a lit l'agenda de la personne. Trois
// conséquences, toutes portées ici pour qu'aucune route ne les réinvente :
//
//   * opaque et long (32 octets base64url) — rien n'y est dérivable ;
//   * UN seul actif par (tenant, compte) : émettre en révoque un précédent, ce
//     qui EST le geste « mon lien a fuité » ;
//   * jamais renvoyé en clair par une lecture de liste — seule la personne qui
//     le demande pour elle-même le reçoit.

import crypto from 'crypto';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

export type CalendarTokenRow = {
  token: string;
  created_at: string;
  last_used_at: string | null;
};

/** 32 octets → 43 caractères base64url. */
export function generateCalendarToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** Le jeton actif de la personne, ou `null` si elle n'en a jamais créé. */
export async function getActiveCalendarToken(
  userId: string,
  tenantId: string
): Promise<CalendarTokenRow | null> {
  if (!supabaseAdmin || !userId) return null;
  const { data, error } = await supabaseAdmin
    .from('player_calendar_tokens')
    .select('token, created_at, last_used_at')
    .eq('auth_user_id', userId)
    .eq('tenant_id', tenantId)
    .is('revoked_at', null)
    .maybeSingle();
  if (error) {
    logger.error('[calendarToken] read error:', error);
    return null;
  }
  return (data as CalendarTokenRow | null) ?? null;
}

/**
 * Émet un jeton neuf et révoque le précédent, dans cet ordre : une révocation
 * qui échouerait APRÈS l'insertion laisserait deux jetons actifs et violerait
 * l'index partiel. On révoque donc d'abord, puis on insère.
 */
export async function rotateCalendarToken(
  userId: string,
  tenantId: string
): Promise<string | null> {
  if (!supabaseAdmin || !userId) return null;

  await revokeCalendarToken(userId, tenantId);

  const token = generateCalendarToken();
  const { error } = await supabaseAdmin
    .from('player_calendar_tokens')
    .insert({ tenant_id: tenantId, auth_user_id: userId, token });

  if (error) {
    logger.error('[calendarToken] insert error:', error);
    return null;
  }
  return token;
}

/** Révoque le jeton actif. Sans jeton actif : no-op silencieux. */
export async function revokeCalendarToken(
  userId: string,
  tenantId: string
): Promise<void> {
  if (!supabaseAdmin || !userId) return;
  const { error } = await supabaseAdmin
    .from('player_calendar_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('auth_user_id', userId)
    .eq('tenant_id', tenantId)
    .is('revoked_at', null);
  if (error) logger.error('[calendarToken] revoke error:', error);
}

/**
 * Résout un jeton porteur → (compte, tenant), et note son usage.
 *
 * `null` couvre indistinctement « inconnu » et « révoqué » : l'appelant répond
 * 404 dans les deux cas, sans dire lequel — un flux ICS est appelé par des
 * clients qu'on ne contrôle pas, on ne les aide pas à distinguer.
 */
export async function resolveCalendarToken(
  token: string
): Promise<{ userId: string; tenantId: string } | null> {
  if (!supabaseAdmin || !token) return null;
  // Charset base64url : on refuse avant de requêter, comme le fait le jeton de
  // check-in (utils/checkin.ts).
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) return null;

  const { data, error } = await supabaseAdmin
    .from('player_calendar_tokens')
    .select('auth_user_id, tenant_id')
    .eq('token', token)
    .is('revoked_at', null)
    .maybeSingle();

  if (error) {
    logger.error('[calendarToken] resolve error:', error);
    return null;
  }
  const row = data as {
    auth_user_id?: string;
    tenant_id?: string;
  } | null;
  if (!row?.auth_user_id || !row?.tenant_id) return null;

  // Trace d'usage — best-effort : un agenda qui se rafraîchit ne doit pas
  // échouer parce qu'on n'a pas su écrire une date.
  void supabaseAdmin
    .from('player_calendar_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('token', token)
    .then(undefined, (err: unknown) =>
      logger.warn('[calendarToken] touch failed: %s', String(err))
    );

  return { userId: row.auth_user_id, tenantId: row.tenant_id };
}
