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

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { logger } from '@/utils/logger';

const NAME_MAX_LEN = 64;
const HOLDER_MAX_LEN = 100;
const TTL_MIN = 5;
const TTL_MAX = 3600;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.name;
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name || name.length > NAME_MAX_LEN) {
    return res.status(400).json({ error: 'name invalide (≤ 64 chars).' });
  }

  const body = (req.body ?? {}) as {
    holder?: unknown;
    ttlSeconds?: unknown;
    action?: unknown;
  };
  const holder =
    typeof body.holder === 'string' ? body.holder.trim() : '';
  if (!holder || holder.length > HOLDER_MAX_LEN) {
    return res
      .status(400)
      .json({ error: 'holder requis (≤ 100 chars).' });
  }

  const action = body.action === 'release' ? 'release' : 'claim';

  if (action === 'release') {
    const { error } = await supabaseAdmin
      .from('bot_locks')
      .delete()
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
      .eq('name', name);
    if (updErr) {
      logger.error('[bot/locks] update error', updErr);
      return res.status(500).json({ error: 'Échec du claim.' });
    }
    return res.status(200).json({ acquired: true, expiresAt });
  }

  // Pas de row → INSERT. Race : si un autre process insert en même temps,
  // on rattrape via 23505 et on relit.
  const { error: insErr } = await supabaseAdmin.from('bot_locks').insert({
    name,
    holder,
    acquired_at: new Date().toISOString(),
    expires_at: expiresAt,
  });
  if (insErr) {
    if ((insErr as { code?: string }).code === '23505') {
      const { data: now2 } = await supabaseAdmin
        .from('bot_locks')
        .select('holder, expires_at')
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
});
