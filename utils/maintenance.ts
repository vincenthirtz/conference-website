// utils/maintenance.ts
//
// Lecture cache du flag site_settings.bot_maintenance_mode. Sert a
// suspendre les writes du bot pendant un deploiement ou une migration.
//
// Cache TTL court (30s) : assez pour eviter de hit la DB a chaque request
// bot (≈100/min en pointe), assez court pour qu'un toggle prenne effet
// rapidement sans necessiter de redeploiement.

import { supabaseAdmin } from './supabase';
import { DEFAULT_TENANT_ID } from './tenant';
import { logger } from './logger';

const CACHE_TTL_MS = 30_000;
const SETTING_KEY = 'bot_maintenance_mode';

let cached: { value: boolean; expiresAt: number } | null = null;

/**
 * Returns true if writes from the bot should be rejected (503).
 * On any error (DB unavailable, row missing, parse failure), returns
 * false — we prefer false negatives over locking out the bot.
 */
export async function isBotMaintenanceMode(): Promise<boolean> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  if (!supabaseAdmin) {
    cached = { value: false, expiresAt: now + CACHE_TTL_MS };
    return false;
  }

  try {
    const { data } = await supabaseAdmin
      .from('site_settings')
      .select('value')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('key', SETTING_KEY)
      .maybeSingle();
    const raw = (data?.value ?? '').toString().toLowerCase();
    const value = raw === 'true' || raw === '1';
    cached = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch (e) {
    logger.error('[maintenance] lookup error', e);
    cached = { value: false, expiresAt: now + CACHE_TTL_MS };
    return false;
  }
}

/**
 * Test helper — force-clear the cache between scenarios.
 */
export function __resetMaintenanceCache() {
  cached = null;
}
