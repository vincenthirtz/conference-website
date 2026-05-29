// POST /api/bot/v1/locks/[name]
//
// Distributed lock claim pour le bot Discord (cf. add_bot_locks_table.sql).
//
// Body : { holder: string, ttlSeconds: number, action: 'claim' | 'release' }
//
// - claim : tente d'acquérir le lock 'name'. Si la row n'existe pas OU est
//           expirée, on UPSERT et retourne wasAcquired=true. Sinon false
//           avec le holder actuel.
// - release : retire la row UNIQUEMENT si holder correspond — évite qu'un
//             autre process release par erreur.
//
// TTL : si le bot crash mid-job, le lock expire après ttlSeconds et un
// autre process peut le reprendre.

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { boundedString } from '@/utils/botValidation';
import { logger } from '@/utils/logger';

const NAME_MAX_LEN = 64;
const HOLDER_MAX_LEN = 100;
const TTL_MIN = 5;
const TTL_MAX = 3600;

// name (path) : string non vide ≤ 64 (trim). holder (body) : string non vide
// ≤ 100 (trim). ttlSeconds / action : sémantique historique PERMISSIVE — pas
// de rejet, `ttlSeconds` est coercé via Number() (défaut 60 si non fini) et
// `action` vaut 'release' seulement si === 'release', sinon 'claim'. On les
// laisse donc en z.unknown() pour ne rejeter aucun type que l'ancien code
// tolérait.
const lockQuerySchema = z.object({ name: boundedString(1, NAME_MAX_LEN) });
const lockBodySchema = z.object({
  holder: boundedString(1, HOLDER_MAX_LEN),
  ttlSeconds: z.unknown().optional(),
  action: z.unknown().optional(),
});

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const { name } = req.botQuery as z.infer<typeof lockQuerySchema>;
  const body = req.botInput as z.infer<typeof lockBodySchema>;

  // Multi-tenant (S3 / Phase 1c) : le lock est scope par tenant. Aujourd'hui
  // le UNIQUE est encore (name) global, mais phase 3 le transformera en
  // PK (tenant_id, name) — on filtre + ecrit deja tenant_id pour preparer
  // cette transition sans rupture.
  const tenantId = req.botContext.tenantId;

  const holder = body.holder;

  const action = body.action === 'release' ? 'release' : 'claim';

  if (action === 'release') {
    const { error } = await supabaseAdmin
      .from('bot_locks')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('name', name)
      .eq('holder', holder);
    if (error) {
      logger.error('[bot/locks] release error', error);
      return res.status(500).json({ error: 'Échec du release.' });
    }
    return res.status(200).json({ released: true });
  }

  // claim
  const ttlRaw = Number(body.ttlSeconds);
  const ttl = Number.isFinite(ttlRaw)
    ? Math.min(Math.max(ttlRaw, TTL_MIN), TTL_MAX)
    : 60;
  const now = Date.now();
  const expiresAt = new Date(now + ttl * 1000).toISOString();

  // Check existing lock — si actif (expires_at > now), on refuse.
  const { data: existing } = await supabaseAdmin
    .from('bot_locks')
    .select('holder, expires_at')
    .eq('tenant_id', tenantId)
    .eq('name', name)
    .maybeSingle();
  if (existing) {
    const exp = Date.parse(existing.expires_at as string);
    const stillActive = Number.isFinite(exp) && exp > now;
    const sameHolder = existing.holder === holder;
    if (stillActive && !sameHolder) {
      return res.status(200).json({
        acquired: false,
        currentHolder: existing.holder,
        expiresAt: existing.expires_at,
      });
    }
    // Lock expiré OU même holder → upsert (renouvellement).
    const { error: updErr } = await supabaseAdmin
      .from('bot_locks')
      .update({
        holder,
        acquired_at: new Date().toISOString(),
        expires_at: expiresAt,
      })
      .eq('tenant_id', tenantId)
      .eq('name', name);
    if (updErr) {
      logger.error('[bot/locks] update error', updErr);
      return res.status(500).json({ error: 'Échec du claim.' });
    }
    return res.status(200).json({ acquired: true, expiresAt });
  }

  // Pas de row → INSERT. Race : si un autre process insert en même temps,
  // on rattrape via 23505 et on relit (filtre par tenant_id).
  const { error: insErr } = await supabaseAdmin.from('bot_locks').insert({
    name,
    holder,
    acquired_at: new Date().toISOString(),
    expires_at: expiresAt,
    tenant_id: tenantId,
  });
  if (insErr) {
    if ((insErr as { code?: string }).code === '23505') {
      const { data: now2 } = await supabaseAdmin
        .from('bot_locks')
        .select('holder, expires_at')
        .eq('tenant_id', tenantId)
        .eq('name', name)
        .maybeSingle();
      return res.status(200).json({
        acquired: false,
        currentHolder: now2?.holder ?? null,
        expiresAt: now2?.expires_at ?? null,
      });
    }
    logger.error('[bot/locks] insert error', insErr);
    return res.status(500).json({ error: 'Échec du claim.' });
  }

  return res.status(201).json({ acquired: true, expiresAt });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 120, key: 'bot-locks' },
  idempotent: false, // l'endpoint est atomique en interne
  bodySchema: lockBodySchema,
  querySchema: lockQuerySchema,
});
