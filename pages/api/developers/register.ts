// pages/api/developers/register.ts
//
// Inscription self-service de l'« espace développeur ». Calqué sur
// `pages/api/auth/register.ts` (rate-limit + qualité email + DNS) mais :
//   - crée un compte auth AUTO-CONFIRMÉ (pas de round-trip email : le dev doit
//     pouvoir se connecter immédiatement, comme le flux d'onboarding tenant),
//   - provisionne un tenant marqué `kind='developer'` (tenants → staff →
//     tenant_staff owner), sans Discord / tenant_secrets (≠ auto-claim
//     link-guild.ts qui, lui, part d'une invitation bot).
//
// Anti-énumération : un email déjà pris renvoie un 200 neutre
// ({ status:'ok', alreadyExists:true }) sans créer de tenant — le front
// affiche « connecte-toi ».

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import crypto from 'crypto';

import { supabaseAdmin, supabaseAnonServer } from '@/utils/supabase';
import { applyRateLimit, getClientIp } from '@/utils/rateLimit';
import {
  checkEmailQuality,
  normalizeEmail,
  EMAIL_QUALITY_MESSAGES,
} from '@/utils/emailQuality';
import { checkEmailDomainDns } from '@/utils/emailDns';
// Réutilise la vérification Turnstile serveur (même utilitaire que
// pages/api/onboard/tenant-request.ts). NB : tenant-request.ts lit le token
// dans le champ `turnstile_token`, mais le formulaire développeur l'envoie
// dans `turnstileToken` (camelCase, aligné sur le reste des formulaires de
// l'espace) — on documente donc l'écart ici et on lit `turnstileToken`.
import { verifyTurnstileToken } from '@/utils/turnstile';
import { slugify } from '@/utils/teamImport';
import { isReservedSlug } from '@/utils/onboard';
import { buildTrialFields } from '@/utils/billing/trial';
import { logger } from '@/utils/logger';

const registerSchema = z.object({
  email: z.string().email(),
  // bcrypt (Supabase) plafonne à 72 octets ; min aligné sur l'UI.
  password: z.string().min(8).max(72),
  orgName: z.string().trim().min(2).max(80),
  // supaAnonServer non utilisé ici — voir supabaseAdmin.auth.admin.createUser.
  turnstileToken: z.string().min(1, 'Captcha manquant.'),
});

/**
 * Dérive un slug unique pour un tenant à partir du nom d'organisation.
 * - slugify → si vide/réservé, fallback `dev-<8 hex>`.
 * - boucle avec suffixe `-2`, `-3`… tant que le slug est déjà pris dans
 *   `tenants.slug` (SELECT existence). L'INSERT reste protégé par la
 *   contrainte UNIQUE (23505) que l'appelant gère aussi.
 */
async function deriveUniqueTenantSlug(orgName: string): Promise<string> {
  let base = slugify(orgName);
  if (!base || base.length < 2 || isReservedSlug(base)) {
    base = `dev-${crypto.randomBytes(4).toString('hex')}`;
  }
  // Borne la longueur (CHECK DB : 2-50 chars).
  base = base.slice(0, 40);

  let candidate = base;
  for (let attempt = 2; attempt <= 50; attempt++) {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();
    if (error) {
      logger.error('[developers/register] slug lookup error', error);
      // On laisse la contrainte UNIQUE trancher côté INSERT.
      return candidate;
    }
    if (!data) return candidate;
    candidate = `${base}-${attempt}`;
  }
  // Extrêmement improbable : fallback aléatoire garanti unique.
  return `dev-${crypto.randomBytes(6).toString('hex')}`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Anti-abus : 5 créations / heure / IP.
  if (
    applyRateLimit(req, res, { max: 5, windowMs: 60 * 60_000 }, 'dev-register')
  ) {
    return;
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Service indisponible.', code: 'SERVER' });
  }
  // Réf. explicite pour couper le "unused import" — supabaseAnonServer est
  // conservé par parité avec auth/register.ts (même famille de clients).
  void supabaseAnonServer;

  const parsed = registerSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({
      error:
        'Champs invalides. Vérifie ton email, un mot de passe d’au moins 8 caractères et le nom de ton organisation.',
      code: 'VALIDATION',
    });
  }

  const { password, orgName, turnstileToken } = parsed.data;
  const email = normalizeEmail(parsed.data.email);

  // Turnstile (même utilitaire que tenant-request.ts).
  const ip = getClientIp(req);
  const turnstile = await verifyTurnstileToken(
    turnstileToken,
    ip === 'unknown' ? undefined : ip
  );
  if (!turnstile.ok) {
    return res.status(400).json({
      error: turnstile.error ?? 'Captcha invalide.',
      code: 'CAPTCHA',
    });
  }

  // Durcissement email : syntaxe stricte + domaines jetables/placeholder.
  const quality = checkEmailQuality(email);
  if (!quality.ok) {
    return res.status(400).json({
      error: EMAIL_QUALITY_MESSAGES[quality.reason],
      code: 'VALIDATION',
    });
  }

  // Existence du domaine (MX, repli A/AAAA). Fail-open sur erreur DNS.
  const domainCheck = await checkEmailDomainDns(email);
  if (!domainCheck.ok) {
    return res.status(400).json({
      error:
        'Le domaine de cette adresse email est introuvable. Vérifie l’adresse saisie.',
      code: 'VALIDATION',
    });
  }

  // ---------------------------------------------------------------------
  // 1) Compte auth AUTO-CONFIRMÉ.
  // ---------------------------------------------------------------------
  const { data: created, error: createErr } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'developer', display_name: orgName },
    });

  if (createErr) {
    const status = (createErr as { status?: number }).status;
    const raw = (createErr.message || '').toLowerCase();

    if (
      status === 429 ||
      raw.includes('rate limit') ||
      raw.includes('too many')
    ) {
      return res.status(429).json({
        error:
          'Trop de tentatives. Patiente quelques instants avant de réessayer.',
        code: 'RATE_LIMIT',
      });
    }

    // Email déjà enregistré → réponse neutre, sans provisioning de tenant.
    if (
      raw.includes('already registered') ||
      raw.includes('already been registered') ||
      raw.includes('already exists') ||
      raw.includes('user already') ||
      raw.includes('email address is already') ||
      status === 422
    ) {
      return res.status(200).json({ status: 'ok', alreadyExists: true });
    }

    logger.error('[api/developers/register] createUser error:', createErr);
    return res.status(500).json({
      error:
        'Impossible de créer le compte pour le moment. Réessaie plus tard.',
      code: 'SERVER',
    });
  }

  const newUser = created?.user;
  if (!newUser?.id) {
    logger.error('[api/developers/register] createUser returned no user');
    return res.status(500).json({
      error:
        'Impossible de créer le compte pour le moment. Réessaie plus tard.',
      code: 'SERVER',
    });
  }

  // ---------------------------------------------------------------------
  // 2) Provisioning tenant (kind='developer'). Pas de transaction supabase-js :
  //    on drive les inserts en ordre de dépendance et on rollback best-effort
  //    (children first). Le user auth peut rester si le tenant échoue — on log.
  // ---------------------------------------------------------------------
  let tenantId: string | null = null;
  let createdStaffId: string | null = null;
  let stampedTenantStaff = false;

  const rollback = async (label: string) => {
    logger.warn('[developers/register] rolling back provisioning', {
      label,
      tenantId,
      authUserId: newUser.id,
    });
    if (stampedTenantStaff && tenantId) {
      await supabaseAdmin
        .from('tenant_staff')
        .delete()
        .eq('tenant_id', tenantId)
        .then(undefined, (e) =>
          logger.error('[developers/register/rollback] tenant_staff', e)
        );
    }
    if (createdStaffId) {
      await supabaseAdmin
        .from('staff')
        .delete()
        .eq('id', createdStaffId)
        .then(undefined, (e) =>
          logger.error('[developers/register/rollback] staff', e)
        );
    }
    if (tenantId) {
      await supabaseAdmin
        .from('tenants')
        .delete()
        .eq('id', tenantId)
        .then(undefined, (e) =>
          logger.error('[developers/register/rollback] tenants', e)
        );
    }
    // Le compte auth reste (impossible à supprimer proprement sans risque
    // d'orphelin de session) — on le signale pour un nettoyage manuel.
    logger.error(
      '[developers/register] provisioning failed after auth user creation — orphan auth user',
      { authUserId: newUser.id, email }
    );
  };

  // 2a) Slug unique (boucle -2, -3… + INSERT insert-retry sur 23505).
  let slug = await deriveUniqueTenantSlug(orgName);

  // 2b) tenants — insert avec retry sur collision d'unicité.
  for (let attempt = 0; attempt < 5 && !tenantId; attempt++) {
    const { data: tenantRow, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .insert({
        slug,
        name: orgName,
        kind: 'developer',
        is_active: true,
        // Essai Régie de 30 jours. Sans lui, l'espace naissait sur le défaut de
        // la colonne — `discovery` — qui n'a PAS l'API : on livrait un tunnel
        // « self-service » au bout duquel chaque appel avec la clé fraîchement
        // générée répondait « nécessite au minimum le plan Régie ». Une porte
        // ouverte sur un mur.
        ...buildTrialFields(),
      })
      .select('id')
      .single();

    if (!tenantErr && tenantRow) {
      tenantId = tenantRow.id as string;
      break;
    }

    const code = (tenantErr as { code?: string } | null)?.code;
    if (code === '23505') {
      // Collision slug (course concurrente) → nouveau candidat et on retente.
      slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`;
      continue;
    }

    logger.error('[developers/register] tenants.insert error', tenantErr);
    return res
      .status(500)
      .json({
        error: 'Impossible de créer l’espace développeur.',
        code: 'SERVER',
      });
  }

  if (!tenantId) {
    logger.error('[developers/register] could not allocate a unique slug');
    return res
      .status(500)
      .json({
        error: 'Impossible de créer l’espace développeur.',
        code: 'SERVER',
      });
  }

  // 2c) staff (role 'owner' global — confiné à ce tenant via tenant_staff).
  const { data: insertedStaff, error: staffErr } = await supabaseAdmin
    .from('staff')
    .insert({
      auth_user_id: newUser.id,
      display_name: orgName,
      email,
      role: 'owner',
    })
    .select('id')
    .single();

  if (staffErr || !insertedStaff) {
    logger.error('[developers/register] staff.insert error', staffErr);
    await rollback('staff.insert');
    return res
      .status(500)
      .json({
        error: 'Impossible de créer l’espace développeur.',
        code: 'SERVER',
      });
  }
  createdStaffId = insertedStaff.id as string;

  // 2d) tenant_staff (owner).
  const { error: tsErr } = await supabaseAdmin.from('tenant_staff').insert({
    tenant_id: tenantId,
    staff_id: createdStaffId,
    role: 'owner',
  });
  if (tsErr) {
    logger.error('[developers/register] tenant_staff.insert error', tsErr);
    await rollback('tenant_staff.insert');
    return res
      .status(500)
      .json({
        error: 'Impossible de créer l’espace développeur.',
        code: 'SERVER',
      });
  }
  stampedTenantStaff = true;

  return res.status(200).json({ status: 'ok' });
}
