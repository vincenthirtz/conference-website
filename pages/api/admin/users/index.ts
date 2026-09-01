// pages/api/admin/users/index.ts
// Admin: création d'un utilisateur Supabase à la volée (page /admin/users/new).
//
// Aligné sur PATCH /api/admin/users/manage (changement de rôle), qui est
// l'autre porte d'entrée vers le même état : mêmes gardes d'escalade, même
// synchronisation de la table `staff`, même trace dans `staff_logs`. Sans ça,
// créer un compte « admin » ici produisait un compte SANS accès back-office
// (rôle écrit dans user_metadata seulement) et invisible dans le journal.

import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { supabaseAdmin } from '@/utils/supabase';
import {
  withStaffRoute,
  STAFF_ROLES,
  STAFF_ROLE_RANK,
  type AuthenticatedStaffContext,
  type StaffRole,
} from '@/utils/staff';
import { sendWelcomeEmail } from '@/utils/email';
import { logStaffAction } from '@/utils/staffLogs';

import { logger } from '../../../../utils/logger';

/**
 * Codes d'erreur stables consommés par l'UI (/admin/users/new) pour afficher
 * un message localisé — le `error` textuel reste le fallback.
 */
export type CreateUserErrorCode =
  | 'invalid_email'
  | 'email_exists'
  | 'weak_password'
  | 'invalid_role'
  | 'role_forbidden';

type CreateUserResponse =
  | {
      userId: string;
      email: string;
      passwordSentByEmail: boolean;
      /** Rôle staff réellement accordé (row `staff` créée), sinon null. */
      staffRoleGranted: StaffRole | null;
    }
  | { error: string; code?: CreateUserErrorCode };

/** Rôles assignables depuis le formulaire (miroir de la liste UI). */
const ASSIGNABLE_ROLES = [
  'member',
  'player',
  'caster',
  'admin',
  'owner',
] as const;

/**
 * Plancher Supabase Auth. En dessous, `createUser` refuse — on préfère un 400
 * explicite au silence d'avant (le mot de passe trop court était ignoré et
 * remplacé par un aléatoire, sans que l'admin le sache).
 */
const MIN_PASSWORD_LENGTH = 6;

// Validation volontairement permissive (le vrai juge est Supabase Auth) :
// elle sert à renvoyer 400 « email invalide » plutôt qu'un 500 opaque.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default withStaffRoute(handler, { permission: 'manage_staff' });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateUserResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  const { email, password, display_name, role } = req.body || {};

  if (typeof email !== 'string' || email.trim().length === 0) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const safeEmail = email.trim();
  if (!EMAIL_RE.test(safeEmail)) {
    return res
      .status(400)
      .json({ error: 'Invalid email address', code: 'invalid_email' });
  }

  const providedPassword =
    typeof password === 'string' && password.trim().length > 0
      ? password.trim()
      : null;
  if (providedPassword && providedPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      code: 'weak_password',
    });
  }
  const plainPassword = providedPassword ?? generatePassword(16);

  const requestedRole =
    typeof role === 'string' && role.trim()
      ? role.trim().toLowerCase()
      : 'player';
  if (!(ASSIGNABLE_ROLES as readonly string[]).includes(requestedRole)) {
    return res
      .status(400)
      .json({ error: 'Invalid role', code: 'invalid_role' });
  }

  // Anti-escalade, identique au PATCH rôle : un non-owner ne peut pas créer un
  // compte doté d'un rôle staff supérieur ou égal au sien. Sans cette garde, la
  // création contournait la règle appliquée à la promotion.
  const requesterRole = (ctx.staff?.role ?? null) as StaffRole | null;
  const isStaffRole = (STAFF_ROLES as readonly string[]).includes(
    requestedRole
  );
  if (isStaffRole && requesterRole !== 'owner') {
    const newRank = STAFF_ROLE_RANK[requestedRole as StaffRole];
    const requesterRank = requesterRole ? STAFF_ROLE_RANK[requesterRole] : -1;
    if (newRank >= requesterRank) {
      return res.status(403).json({
        error: 'You cannot grant a role equal to or above your own.',
        code: 'role_forbidden',
      });
    }
  }

  const safeDisplayName =
    typeof display_name === 'string' && display_name.trim()
      ? display_name.trim()
      : null;

  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: safeEmail,
      password: plainPassword,
      email_confirm: true,
      user_metadata: {
        display_name: safeDisplayName,
        role: requestedRole,
      },
    });

    if (error || !data?.user?.id) {
      logger.error('[/api/admin/users] createUser error:', error);
      // Doublon : Supabase répond 422 « already been registered ». Le 500
      // générique d'avant laissait l'admin sans indice sur la vraie cause.
      if (isDuplicateEmailError(error)) {
        return res.status(409).json({
          error: 'An account already exists with this email address',
          code: 'email_exists',
        });
      }
      return res.status(500).json({ error: 'Failed to create user' });
    }

    const userId = data.user.id;

    // Synchronisation `staff` : un rôle staff n'est effectif QUE via cette
    // table (withStaffRoute / withStaffPage ne lisent pas user_metadata).
    let staffRoleGranted: StaffRole | null = null;
    if (isStaffRole) {
      const { error: staffErr } = await supabaseAdmin.from('staff').insert({
        auth_user_id: userId,
        role: requestedRole,
        display_name: safeDisplayName,
        email: safeEmail,
      });
      if (staffErr) {
        logger.error('[/api/admin/users] staff row insert error:', staffErr);
      } else {
        staffRoleGranted = requestedRole as StaffRole;
      }
    }
    // Pas d'emitRoleSyncEvent ici : le compte vient de naître, il ne peut pas
    // encore avoir de lien Discord à synchroniser.

    // `sendWelcomeEmail` NE LÈVE PAS en cas d'échec (Brevo down, clé API
    // absente) : elle renvoie { success: false }. L'ancien try/catch annonçait
    // donc « mot de passe envoyé » même quand rien n'était parti — et comme le
    // mot de passe n'est jamais renvoyé par l'API, le compte devenait
    // inaccessible en silence. On lit le résultat.
    let passwordSentByEmail = false;
    try {
      const emailResult = await sendWelcomeEmail(safeEmail, plainPassword);
      passwordSentByEmail = emailResult?.success === true;
      if (!passwordSentByEmail) {
        logger.error(
          '[/api/admin/users] welcome email not sent:',
          emailResult?.error
        );
      }
    } catch (emailErr) {
      logger.error('[/api/admin/users] welcome email error:', emailErr);
    }

    // Création de compte = action sensible : elle rejoint suspend / delete /
    // changement de rôle dans le journal d'audit.
    void logStaffAction({
      staff_id: ctx.staff.id,
      action: 'create_user',
      entity_type: 'user',
      entity_id: userId,
      tenant_id: ctx.tenantId,
      payload: {
        targetEmail: safeEmail,
        metadataRole: requestedRole,
        staffRoleGranted,
        passwordProvided: Boolean(providedPassword),
        passwordSentByEmail,
      },
    });

    return res.status(201).json({
      userId,
      email: safeEmail,
      passwordSentByEmail,
      staffRoleGranted,
    });
  } catch (err: unknown) {
    logger.error('[/api/admin/users] internal error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** Supabase Auth ne typant pas ses codes, on reconnaît le doublon au message. */
function isDuplicateEmailError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { status?: number; code?: string; message?: string };
  if (e.code === 'email_exists') return true;
  if (e.status === 422 || e.status === 409) return true;
  return /already (been )?registered|already exists/i.test(e.message ?? '');
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
