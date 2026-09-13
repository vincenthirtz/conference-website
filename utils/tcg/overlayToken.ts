// utils/tcg/overlayToken.ts
//
// Le jeton porteur d'une source navigateur OBS pour le TCG.
//
// MÊME DISCIPLINE QUE `utils/player/calendarToken.ts`, et pour la même raison :
// une URL collée dans une configuration OBS échappe ensuite à notre contrôle —
// elle vit dans un fichier de scènes, elle passe à l'écran pendant un partage,
// elle se transmet entre régisseuses. Elle doit donc être :
//   * opaque et longue (32 octets base64url) — rien n'y est dérivable ;
//   * UNIQUE ACTIVE par tenant : régénérer révoque la précédente, ce qui EST
//     le geste « le lien a fuité » ;
//   * révocable sans toucher à un secret serveur ni casser autre chose.
//
// PORTÉE TENANT, PAS PERSONNE. Un overlay appartient à la régie d'un espace.
// C'est la seule différence de fond avec le jeton d'agenda, et elle explique
// l'index partiel sur `tenant_id` seul.

import crypto from 'crypto';

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

export type OverlayTokenRow = {
  token: string;
  created_at: string;
  last_used_at: string | null;
};

/** 32 octets → 43 caractères base64url. */
export function generateOverlayToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** Le jeton actif du tenant, ou `null` s'il n'en a jamais émis. */
export async function getActiveOverlayToken(
  tenantId: string
): Promise<OverlayTokenRow | null> {
  if (!supabaseAdmin || !tenantId) return null;
  const { data, error } = await supabaseAdmin
    .from('tcg_overlay_tokens')
    .select('token, created_at, last_used_at')
    .eq('tenant_id', tenantId)
    .is('revoked_at', null)
    .maybeSingle();
  if (error) {
    logger.error('[tcg/overlayToken] lecture impossible', error);
    return null;
  }
  return (data as OverlayTokenRow | null) ?? null;
}

/** Révoque le jeton actif, s'il y en a un. Idempotent. */
export async function revokeOverlayToken(tenantId: string): Promise<void> {
  if (!supabaseAdmin || !tenantId) return;
  const { error } = await supabaseAdmin
    .from('tcg_overlay_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .is('revoked_at', null);
  if (error) logger.error('[tcg/overlayToken] révocation impossible', error);
}

/**
 * Émet un jeton neuf APRÈS avoir révoqué le précédent.
 *
 * L'ordre compte : l'index partiel n'admet qu'un actif par tenant, donc
 * insérer avant de révoquer échouerait. Révoquer d'abord laisse au pire un
 * tenant sans overlay quelques millisecondes — un overlay muet le temps d'un
 * rafraîchissement, là où l'ordre inverse rendrait la régénération impossible.
 */
export async function rotateOverlayToken(
  tenantId: string,
  createdBy: string | null
): Promise<string | null> {
  if (!supabaseAdmin || !tenantId) return null;

  await revokeOverlayToken(tenantId);

  const token = generateOverlayToken();
  const { error } = await supabaseAdmin
    .from('tcg_overlay_tokens')
    .insert({ tenant_id: tenantId, token, created_by: createdBy });

  if (error) {
    logger.error('[tcg/overlayToken] émission impossible', error);
    return null;
  }
  return token;
}

/**
 * Le tenant derrière un jeton, ou `null` si le jeton est inconnu ou révoqué.
 *
 * Marque `last_used_at` au passage, en BEST-EFFORT : c'est ce qui permet de
 * constater qu'un lien oublié sert encore. Un échec d'horodatage ne doit
 * jamais empêcher l'overlay de s'afficher — il tourne pendant un direct.
 */
export async function resolveTenantFromOverlayToken(
  token: string
): Promise<string | null> {
  if (!supabaseAdmin || !token) return null;

  const { data, error } = await supabaseAdmin
    .from('tcg_overlay_tokens')
    .select('id, tenant_id')
    .eq('token', token)
    .is('revoked_at', null)
    .maybeSingle();

  if (error) {
    logger.error('[tcg/overlayToken] résolution impossible', error);
    return null;
  }
  if (!data) return null;

  const row = data as { id: string; tenant_id: string };
  void supabaseAdmin
    .from('tcg_overlay_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', row.id)
    .then(({ error: touchErr }) => {
      if (touchErr) {
        logger.warn(
          '[tcg/overlayToken] horodatage non posé: %s',
          touchErr.message
        );
      }
    });

  return row.tenant_id;
}
