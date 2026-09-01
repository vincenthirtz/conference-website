// utils/integrationSecrets.ts
//
// Secrets d'intégration stockés CHIFFRÉS en base (`integration_secrets`),
// plutôt qu'en variables d'environnement.
//
// POURQUOI. Netlify exécute ses fonctions en mode compatibilité Lambda, qui
// plafonne l'ENSEMBLE des variables d'environnement à 4 Ko. Ce budget était
// déjà presque plein : ajouter la clé privée du compte de service Google
// (1,7 Ko) a fait échouer la création des dix-neuf fonctions cron, et le
// déploiement entier avec — deux fois, le 2026-09-01. Une clé privée n'a de
// toute façon rien à faire dans l'environnement de build : elle y est exposée
// à tout ce qui s'exécute pendant le build, plugins compris.
//
// Le chiffrement est celui de `utils/crypto.ts` (AES-256-GCM, clé dérivée de
// SECRETS_ENC_KEY). La base ne voit jamais le clair, et la table n'est
// accessible qu'à la service role — aucune policy RLS ne l'ouvre.
//
// L'environnement ne garde donc qu'une chose : la clé de chiffrement.

import { supabaseAdmin } from '@/utils/supabase';
import {
  decryptSecret,
  encryptSecret,
  isSecretEncryptionConfigured,
} from '@/utils/crypto';
import { logger } from '@/utils/logger';

/**
 * Clés connues. Liste FERMÉE : un secret se nomme une fois, et une faute de
 * frappe dans un `getIntegrationSecret('gogle_drive…')` renverrait `null`
 * silencieusement, c'est-à-dire « pas configuré » — le pire des diagnostics.
 */
export const INTEGRATION_SECRET_KEYS = ['google_drive_sa_private_key'] as const;

export type IntegrationSecretKey = (typeof INTEGRATION_SECRET_KEYS)[number];

export { isSecretEncryptionConfigured };

/** Lit et déchiffre un secret. `null` si absent — jamais une exception. */
export async function getIntegrationSecret(
  tenantId: string,
  key: IntegrationSecretKey
): Promise<string | null> {
  if (!isSecretEncryptionConfigured()) return null;

  const { data, error } = await supabaseAdmin
    .from('integration_secrets')
    .select('value_encrypted')
    .eq('tenant_id', tenantId)
    .eq('key', key)
    .maybeSingle();

  if (error) {
    logger.error('[integrationSecrets] lecture impossible', error);
    return null;
  }
  if (!data?.value_encrypted) return null;

  try {
    return decryptSecret(data.value_encrypted);
  } catch (err) {
    // Déchiffrement en échec = la clé d'environnement a changé, ou la valeur a
    // été altérée. Dans les deux cas le secret est PERDU, pas absent : le dire
    // évite de chercher pourquoi « ça ne marche plus » après une rotation.
    logger.error(
      '[integrationSecrets] déchiffrement impossible — SECRETS_ENC_KEY a-t-elle changé ?',
      err
    );
    return null;
  }
}

/** Chiffre et enregistre un secret. Écrase la valeur précédente. */
export async function setIntegrationSecret(
  tenantId: string,
  key: IntegrationSecretKey,
  plaintext: string,
  updatedBy: string | null
): Promise<void> {
  if (!isSecretEncryptionConfigured()) {
    throw new Error(
      'SECRETS_ENC_KEY absente : impossible de chiffrer un secret.'
    );
  }
  const { error } = await supabaseAdmin.from('integration_secrets').upsert(
    {
      tenant_id: tenantId,
      key,
      value_encrypted: encryptSecret(plaintext),
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    },
    { onConflict: 'tenant_id,key' }
  );
  if (error) throw error;
}

/** Supprime un secret. */
export async function deleteIntegrationSecret(
  tenantId: string,
  key: IntegrationSecretKey
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('integration_secrets')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('key', key);
  if (error) throw error;
}

/** `true` si le secret existe — sans le déchiffrer ni le rapatrier. */
export async function hasIntegrationSecret(
  tenantId: string,
  key: IntegrationSecretKey
): Promise<boolean> {
  const { count, error } = await supabaseAdmin
    .from('integration_secrets')
    .select('key', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('key', key);
  if (error) {
    logger.error('[integrationSecrets] présence indéterminable', error);
    return false;
  }
  return (count ?? 0) > 0;
}
