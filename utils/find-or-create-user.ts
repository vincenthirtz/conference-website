// utils/find-or-create-user.ts
// Shared helper: find a Supabase Auth user by email, or create one on the fly.

import crypto from 'crypto';
import { supabaseAdmin } from '@/utils/supabase';
import { sendWelcomeEmail } from '@/utils/email';

import { logger } from './logger';
/**
 * Build an email→userId map from Supabase Auth (paginated).
 *
 * DEPRECATED (audit perf P8) : scanne jusqu'à 5000 comptes pour résoudre UN
 * email. Ne plus utiliser sur les chemins chauds — préférer le lookup ciblé
 * `lookupUserIdByEmail` (RPC `get_user_id_by_email`). Conservé pour un éventuel
 * besoin de dump complet ; aucun handler applicatif ne l'appelle plus.
 */
export async function listUsersEmailMap(): Promise<Map<string, string>> {
  if (!supabaseAdmin) throw new Error('Supabase admin not configured');

  const emailMap = new Map<string, string>();
  const perPage = 1000;
  const maxPages = 5;

  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      logger.error('[listUsersEmailMap] error:', error);
      throw new Error(error.message || 'Failed to list users');
    }

    data?.users?.forEach((u) => {
      const e = u.email?.toLowerCase();
      if (e) emailMap.set(e, u.id);
    });

    if (!data?.users || data.users.length < perPage) break;
  }

  return emailMap;
}

/**
 * Lookup ciblé email → userId via la RPC `get_user_id_by_email`
 * (SECURITY DEFINER, service_role). UN seul appel indexé côté Postgres, en
 * remplacement du scan complet de `listUsersEmailMap`.
 *
 * Matching insensible à la casse (parité avec la Map JS `toLowerCase()`).
 * Renvoie l'`userId` si un compte correspond, sinon `null`.
 */
export async function lookupUserIdByEmail(
  email: string
): Promise<string | null> {
  if (!supabaseAdmin) throw new Error('Supabase admin not configured');

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const { data, error } = await supabaseAdmin.rpc('get_user_id_by_email', {
    p_email: normalizedEmail,
  });

  if (error) {
    logger.error('[lookupUserIdByEmail] error:', error);
    throw new Error(error.message || 'Failed to look up user by email');
  }

  // La RPC renvoie un scalaire uuid (ou null). On tolère aussi une forme
  // ligne/tableau au cas où le client sérialiserait différemment.
  if (!data) return null;
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) {
    const first = data[0] as { id?: string } | string | undefined;
    if (!first) return null;
    return typeof first === 'string' ? first : (first.id ?? null);
  }
  return (data as { id?: string }).id ?? null;
}

/**
 * Find an existing user by email or create a new Supabase Auth user.
 * Returns the userId and whether the user was newly created.
 *
 * `emailMap` est optionnel :
 *   - fourni → résolution via la Map pré-construite (compat historique) ;
 *   - absent → lookup CIBLÉ via `lookupUserIdByEmail` (RPC), sans scan complet.
 */
export async function findOrCreateUserByEmail(
  email: string,
  role: string,
  emailMap?: Map<string, string>
): Promise<{ userId: string; created: boolean }> {
  if (!supabaseAdmin) throw new Error('Supabase admin not configured');

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error('Email is required to create a user');
  }

  const existingId = emailMap
    ? emailMap.get(normalizedEmail)
    : await lookupUserIdByEmail(normalizedEmail);
  if (existingId) {
    return { userId: existingId, created: false };
  }

  const generatedPassword = generatePassword(16);
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: normalizedEmail,
    password: generatedPassword,
    email_confirm: true,
    user_metadata: { role: role || 'player' },
  });

  if (error || !data?.user?.id) {
    logger.error('[findOrCreateUserByEmail] createUser error:', error);
    throw new Error(error?.message || 'Failed to create user');
  }

  emailMap?.set(normalizedEmail, data.user.id);

  // Send welcome email with credentials (non-blocking)
  sendWelcomeEmail(normalizedEmail, generatedPassword).catch((err) => {
    logger.error('[findOrCreateUserByEmail] welcome email error:', err);
  });

  return { userId: data.user.id, created: true };
}

function generatePassword(length = 16) {
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789!@$%^*';
  const maxValid = 256 - (256 % alphabet.length);
  const result: string[] = [];
  while (result.length < length) {
    const bytes = crypto.randomBytes(length - result.length);
    for (const byte of bytes) {
      if (byte < maxValid && result.length < length) {
        result.push(alphabet[byte % alphabet.length]);
      }
    }
  }
  return result.join('');
}
