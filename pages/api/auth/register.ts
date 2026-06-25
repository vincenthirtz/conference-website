// pages/api/auth/register.ts
// Inscription côté serveur : validation + rate-limit + rôle forcé avant le
// signUp Supabase. Le formulaire (pages/register.tsx) poste ici plutôt que
// d'appeler supabaseClient.auth.signUp directement depuis le navigateur, ce qui
// permet (1) un anti-abus applicatif, (2) une validation serveur, (3) de forcer
// role:'player' (le client ne peut plus écrire un rôle arbitraire en metadata).

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAnonServer, supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { resolveTenantIdForPublicRequest } from '@/utils/tenant';
import { alertIfBlacklisted } from '@/utils/moderation/blacklist';

import { logger } from '../../../utils/logger';

// Format BattleTag annoncé côté UI : Pseudo#0000 (4 ou 5 chiffres).
const BATTLETAG_RE = /^.+#[0-9]{4,5}$/;

// Champ texte optionnel : une chaîne vide est traitée comme « non fourni ».
const optionalTrimmed = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(max).optional()
  );

const registerSchema = z.object({
  email: z.string().email(),
  // bcrypt (Supabase) plafonne à 72 octets ; min aligné sur l'UI.
  password: z.string().min(8).max(72),
  displayName: optionalTrimmed(80),
  battleTag: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z
      .string()
      .trim()
      .regex(BATTLETAG_RE, 'Format BattleTag invalide (attendu : Pseudo#0000).')
      .optional()
  ),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Anti-abus : 5 créations / heure / IP (mémoire process, cf. utils/rateLimit).
  if (applyRateLimit(req, res, { max: 5, windowMs: 60 * 60_000 }, 'register')) {
    return;
  }

  const parsed = registerSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error:
        'Champs invalides. Vérifie ton email, un mot de passe d’au moins 8 caractères et le format du BattleTag.',
      code: 'VALIDATION',
    });
  }

  const { email, password, displayName, battleTag } = parsed.data;

  const tenantId = resolveTenantIdForPublicRequest(req);

  const { error } = await supabaseAnonServer.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: {
        display_name: displayName ?? null,
        // Rôle forcé côté serveur : le client ne décide pas de son rôle.
        role: 'player',
        battle_tag: battleTag ?? null,
      },
    },
  });

  if (error) {
    const status = (error as { status?: number }).status;
    const raw = (error.message || '').toLowerCase();

    if (
      status === 429 ||
      raw.includes('rate limit') ||
      raw.includes('for security') ||
      raw.includes('too many')
    ) {
      return res.status(429).json({
        error:
          'Trop de tentatives. Patiente quelques instants avant de réessayer.',
        code: 'RATE_LIMIT',
      });
    }

    // Email déjà enregistré → réponse neutre identique au succès
    // (anti-énumération : on ne révèle pas l'existence d'un compte).
    if (
      raw.includes('already registered') ||
      raw.includes('already been registered') ||
      raw.includes('user already')
    ) {
      return res.status(200).json({ status: 'ok' });
    }

    logger.error('[api/auth/register] signUp error:', error);
    return res.status(500).json({
      error: 'Impossible de créer le compte pour le moment. Réessaie plus tard.',
      code: 'SERVER',
    });
  }

  // Blacklist : alerte (ne bloque pas) si le pseudo/battletag est banni. On le
  // fait APRÈS un signUp sans erreur pour ne pas alerter sur un échec d'autre
  // nature. Fire-and-forget : l'inscription répond OK quoi qu'il arrive.
  void alertIfBlacklisted(supabaseAdmin, tenantId, 'register', {
    battleTag,
    displayName,
  });

  // Supabase renvoie un succès neutre (sans erreur) même pour un email déjà
  // pris quand la confirmation email est active → on reste neutre nous aussi.
  return res.status(200).json({ status: 'ok' });
}
