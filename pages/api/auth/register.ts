// pages/api/auth/register.ts
// Inscription côté serveur : validation + rate-limit + rôle forcé avant le
// signUp Supabase. Le formulaire (pages/register.tsx) poste ici plutôt que
// d'appeler supabaseClient.auth.signUp directement depuis le navigateur, ce qui
// permet (1) un anti-abus applicatif, (2) une validation serveur, (3) de borner
// le rôle à une liste fermée (le client ne peut pas écrire un rôle arbitraire
// en metadata).
//
// `accountType` (2026-08-20) : on s'inscrit comme JOUEUSE ou comme MANAGER.
// Jusqu'ici le rôle était figé à 'player', et une personne qui encadre une
// équipe sans y jouer n'avait aucune porte d'entrée — elle n'existait qu'en
// creux, créée à la volée par `/team/create` (findOrCreateUserByEmail(email,
// 'manager')). Elle peut désormais créer son compte d'abord.
//
// Ce que ce rôle est, et n'est pas : une ÉTIQUETTE de compte (affichée dans le
// cockpit staff, exportée en RGPD). Il n'accorde AUCUN droit — les droits de
// gestion se lisent sur `team_members.role` (utils/teams/managementAccess.ts),
// et le staff sur la table `staff`. Un compte 'manager' sans équipe ne peut
// donc rien de plus qu'un compte 'player' sans équipe.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAnonServer, supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit, refundRateLimit } from '@/utils/rateLimit';
import { resolveTenantIdForPublicRequestAsync } from '@/utils/tenant';
import { alertIfBlacklisted } from '@/utils/moderation/blacklist';
import { BATTLE_TAG_REGEX } from '@/utils/teams/addMember';
import {
  checkEmailQuality,
  normalizeEmail,
  EMAIL_QUALITY_MESSAGES,
} from '@/utils/emailQuality';
import { checkEmailDomainDns } from '@/utils/emailDns';

import { logger } from '../../../utils/logger';

// Champ texte optionnel : une chaîne vide est traitée comme « non fourni ».
const optionalTrimmed = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().max(max).optional()
  );

/**
 * Rôles ouverts à l'auto-inscription. Liste FERMÉE : tout le reste
 * ('developer', rôles staff…) passe par une autre porte.
 */
const SELF_SERVICE_ROLES = ['player', 'manager'] as const;

/**
 * Attribution d'acquisition envoyée par le formulaire (cf.
 * lib/analytics/attribution.ts). Champs BORNÉS et liste FERMÉE : cette valeur
 * finit en metadata de compte, elle ne doit ni grossir ni transporter autre
 * chose que du signal de canal. Les clés inconnues sont retirées par zod.
 *
 * Aucune de ces valeurs n'est un identifiant personnel : le referrer est réduit
 * à son hôte côté client, la page d'atterrissage à son chemin.
 */
const signupSourceSchema = z
  .object({
    source: z.string().trim().max(120).optional(),
    medium: z.string().trim().max(120).optional(),
    campaign: z.string().trim().max(120).optional(),
    content: z.string().trim().max(120).optional(),
    term: z.string().trim().max(120).optional(),
    referrer: z.string().trim().max(120).optional(),
    landing: z.string().trim().max(120).optional(),
    at: z.string().trim().max(40).optional(),
  })
  .optional();

const registerSchema = z.object({
  email: z.string().email(),
  // bcrypt (Supabase) plafonne à 72 octets ; min aligné sur l'UI.
  password: z.string().min(8).max(72),
  displayName: optionalTrimmed(80),
  // Absent ⇒ 'player' : les clients qui ignorent le champ (et tout appelant
  // antérieur à 2026-08-20) gardent le comportement exact d'avant.
  accountType: z.enum(SELF_SERVICE_ROLES).optional(),
  signupSource: signupSourceSchema,
  battleTag: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z
      .string()
      .trim()
      .regex(
        BATTLE_TAG_REGEX,
        'Format BattleTag invalide (attendu : Pseudo#0000).'
      )
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

  const { password, displayName, battleTag, signupSource } = parsed.data;
  const accountRole = parsed.data.accountType ?? 'player';
  const email = normalizeEmail(parsed.data.email);

  // Durcissement email : syntaxe stricte + domaines jetables/placeholder
  // (a@a.com, x@yopmail.com… passent z.string().email() mais pas ceci).
  const quality = checkEmailQuality(email);
  if (!quality.ok) {
    return res.status(400).json({
      error: EMAIL_QUALITY_MESSAGES[quality.reason],
      code: 'VALIDATION',
    });
  }

  // Existence du domaine (MX, repli A/AAAA). Fail-open sur erreur DNS
  // transitoire — ne bloque que les domaines certains de ne pas exister.
  const domainCheck = await checkEmailDomainDns(email);
  if (!domainCheck.ok) {
    return res.status(400).json({
      error:
        'Le domaine de cette adresse email est introuvable. Vérifie l’adresse saisie.',
      code: 'VALIDATION',
    });
  }

  const tenantId = await resolveTenantIdForPublicRequestAsync(req);

  const { error } = await supabaseAnonServer.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName ?? null,
        // Rôle borné côté serveur à SELF_SERVICE_ROLES : le client choisit
        // entre joueuse et manager, pas au-delà.
        role: accountRole,
        battle_tag: battleTag ?? null,
        // Attribution d'acquisition. Stockée en metadata plutôt qu'en table
        // dédiée : ce projet n'a pas de table `profiles`, tout le profil vit
        // déjà dans `auth.users.raw_user_meta_data`. Un objet vide est
        // normalisé en null pour ne pas polluer les metadata.
        signup_source:
          signupSource && Object.keys(signupSource).length > 0
            ? signupSource
            : null,
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

    // L'échec vient de nous (fournisseur d'auth indisponible, quota d'e-mails
    // épuisé) : on rend la tentative. Sans ça, la personne paie pour notre
    // panne, réessaie, et finit par se voir refuser l'inscription pour « trop
    // de tentatives » — ce qui s'est produit pendant la saturation d'envoi
    // d'e-mails du 29-30 août.
    refundRateLimit(req, 'register');
    logger.error('[api/auth/register] signUp error:', error);
    return res.status(500).json({
      error:
        'Impossible de créer le compte pour le moment. Réessaie plus tard.',
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
