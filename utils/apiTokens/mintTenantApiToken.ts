// utils/apiTokens/mintTenantApiToken.ts
//
// L'émission d'une clé d'API publique, pour UN espace nommé.
//
// POURQUOI CE MODULE EXISTE. `POST /api/admin/api-tokens` émettait pour
// `ctx.tenantId`, c'est-à-dire pour l'espace ACTIF du sélecteur — que l'écran
// ne nomme nulle part. Une clé destinée à un espace tiers s'est ainsi retrouvée
// rattachée à l'espace historique : le token étant autoritaire sur l'espace,
// elle servait des données parfaitement valides et parfaitement fausses, et
// rien dans l'interface ne pouvait l'annoncer.
//
// Le hub d'onboarding émet désormais depuis la LIGNE de l'espace, où la cible
// est explicite par construction. Deux chemins d'émission, donc — et dans ce
// dépôt, deux implémentations jumelées finissent toujours par diverger (cf.
// `utils/tcg/readTeamRarity.ts` sur le même motif). Une seule fonction sait
// donc fabriquer une clé, se prononcer sur l'exemption partenaire et écrire au
// journal ; les routes ne font plus qu'apporter un `tenantId` et rendre le
// résultat.
//
// LE CLAIR NE SORT QU'ICI, et une seule fois : il n'est ni stocké, ni journalisé.

import crypto from 'node:crypto';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { hasAtLeastRole, type StaffRole } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import { parseScopes, ALL_SCOPES } from '@/utils/apiScopes';

const TOKEN_PLAIN_PREFIX = 'pk_live_';
const DAY_MS = 24 * 60 * 60 * 1000;

/** `pk_live_` + 64 hex. Le préfixe reste en clair pour identifier la clé. */
function generateToken(): { plain: string; hash: string; prefix: string } {
  const plain = TOKEN_PLAIN_PREFIX + crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(plain).digest('hex');
  // `pk_live_` (8) + 6 hex → ex. `pk_live_a1b2c3`.
  const prefix = plain.slice(0, TOKEN_PLAIN_PREFIX.length + 6);
  return { plain, hash, prefix };
}

export const mintTokenBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.string()).min(1),
  /**
   * Exemption partenaire : la clé bypasse le gate de plan (accès gratuit).
   * Poser `true` exige le rôle `owner` — un simple admin ne peut pas
   * s'auto-exempter du modèle payant.
   */
  comp: z.boolean().optional().default(false),
  /** Note libre traçant le partenaire / la raison de l'exemption. */
  comp_note: z.string().trim().max(500).optional(),
  /**
   * Durée de vie optionnelle, en jours. null / absent => pas d'expiration.
   * On accepte des jours (pas un timestamp arbitraire) pour que l'échéance soit
   * toujours calculée serveur, jamais dictée par le client.
   */
  expires_in_days: z.number().int().positive().max(3650).nullable().optional(),
});

export type MintedTokenMeta = {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  created_at: string;
  expires_at: string | null;
  comp: boolean;
  comp_note: string | null;
};

export type MintResult =
  | { ok: true; token: string; tokenMeta: MintedTokenMeta }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Émet une clé pour `tenantId`, au nom de `actor`.
 *
 * Rend un résultat plutôt qu'il n'écrit dans la réponse : les deux routes
 * appelantes ont des gardes d'accès différentes (espace actif ici, owner
 * plateforme là) et doivent rester libres de refuser AVANT d'en arriver ici.
 */
export async function mintTenantApiToken(params: {
  tenantId: string;
  actor: { staffId: string; role: StaffRole };
  body: unknown;
}): Promise<MintResult> {
  if (!supabaseAdmin) {
    return {
      ok: false,
      status: 503,
      body: { error: 'Database service unavailable.' },
    };
  }

  const parsed = mintTokenBodySchema.safeParse(params.body);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      body: { error: 'Invalid body.', code: 'INVALID_BODY' },
    };
  }

  const scopeResult = parseScopes(parsed.data.scopes);
  if (!scopeResult.ok) {
    return {
      ok: false,
      status: 400,
      body: {
        error: `Scopes invalides : ${scopeResult.invalid.join(', ')}.`,
        code: 'INVALID_SCOPES',
        validScopes: ALL_SCOPES,
      },
    };
  }

  const comp = parsed.data.comp === true;
  if (comp && !hasAtLeastRole(params.actor.role, 'owner')) {
    return {
      ok: false,
      status: 403,
      body: {
        error: 'Seul un owner peut émettre une clé partenaire (comp).',
        code: 'FORBIDDEN_COMP',
      },
    };
  }

  const { plain, hash, prefix } = generateToken();
  const expiresAt =
    parsed.data.expires_in_days != null
      ? new Date(
          Date.now() + parsed.data.expires_in_days * DAY_MS
        ).toISOString()
      : null;

  const { data, error } = await supabaseAdmin
    .from('tenant_api_tokens')
    .insert({
      tenant_id: params.tenantId,
      token_hash: hash,
      token_prefix: prefix,
      name: parsed.data.name,
      scopes: scopeResult.scopes,
      comp,
      comp_note: comp ? (parsed.data.comp_note ?? null) : null,
      expires_at: expiresAt,
      created_by: params.actor.staffId,
    })
    .select(
      'id, name, token_prefix, scopes, created_at, expires_at, comp, comp_note'
    )
    .single();

  if (error || !data) {
    logger.error('[apiTokens] insert error', error, {
      tenantId: params.tenantId,
    });
    return {
      ok: false,
      status: 500,
      body: { error: 'Failed to create token.' },
    };
  }

  // Audit — jamais le clair ni le hash. `tenant_id` est celui de la CLÉ, pas
  // celui de l'espace actif de l'émetteur : c'est la seule façon de retrouver
  // plus tard pour qui une clé a été émise depuis le hub.
  await logStaffAction({
    staff_id: params.actor.staffId,
    action: 'other',
    entity_type: 'api_token',
    entity_id: data.id as string,
    tenant_id: params.tenantId,
    payload: {
      action: 'create_api_token',
      name: data.name,
      scopes: scopeResult.scopes,
      prefix,
      comp,
      expires_at: expiresAt,
    },
  });

  return {
    ok: true,
    token: plain,
    tokenMeta: data as unknown as MintedTokenMeta,
  };
}
