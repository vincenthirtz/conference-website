// pages/api/admin/notifications/subscribe.ts
//
// POST /api/admin/notifications/subscribe
//
// Enregistre (ou met à jour) une subscription Web Push pour le user staff
// courant et le device courant. L'identifiant naturel est `endpoint` (URL du
// push service du browser : Mozilla / Google / Apple).
//
// Idempotent par endpoint :
//   - Si l'endpoint existe déjà dans la table → UPDATE (re-assign user_id,
//     refresh p256dh/auth/user_agent, bump last_seen_at). Réponse : 200.
//   - Sinon → INSERT. Réponse : 201.
//
// On bypasse RLS via supabaseAdmin : le ON CONFLICT (endpoint) DO UPDATE
// pourrait sinon être refusé par la policy update si l'endpoint
// appartenait précédemment à un autre user (cas "device prêté" / re-login).
// L'auth (et donc le user_id à enregistrer) est garantie par withStaffRoute.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logger } from '@/utils/logger';

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().trim().url('endpoint must be a valid URL').max(2048),
    keys: z.object({
      p256dh: z.string().trim().min(1, 'p256dh required').max(512),
      auth: z.string().trim().min(1, 'auth required').max(256),
    }),
  }),
  user_agent: z
    .union([z.string().trim().max(512), z.null()])
    .optional()
    .transform((v) => (v === undefined ? null : v)),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 20, windowMs: 60_000 },
      'admin-notif-subscribe'
    )
  ) {
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = subscribeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation échouée.',
      code: 'INVALID_BODY',
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const { subscription, user_agent } = parsed.data;
  const authUserId = ctx.user.id; // auth.users.id — FK target pour push_subscriptions.user_id.

  // 1) Cherche d'abord par endpoint pour savoir si on est en CREATE ou UPDATE.
  //    On a besoin de cette info pour renvoyer 200 vs 201, et l'upsert ne
  //    distingue pas les deux cas avec supabase-js.
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id')
    .eq('endpoint', subscription.endpoint)
    .maybeSingle();

  if (lookupError) {
    logger.error('[admin/notif/subscribe] lookup error', lookupError);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }

  const nowIso = new Date().toISOString();

  if (existing?.id) {
    // UPDATE existing row. Bypass RLS via supabaseAdmin : on autorise le
    // re-assign du user_id (un même device peut changer d'user).
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('push_subscriptions')
      .update({
        user_id: authUserId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent,
        last_seen_at: nowIso,
      })
      .eq('endpoint', subscription.endpoint)
      .select('id, endpoint')
      .maybeSingle();

    if (updateError || !updated) {
      logger.error('[admin/notif/subscribe] update error', updateError);
      return res.status(500).json({ error: 'Erreur serveur.' });
    }

    return res.status(200).json({
      id: updated.id,
      endpoint: updated.endpoint,
      created: false,
    });
  }

  // INSERT new row.
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('push_subscriptions')
    .insert({
      user_id: authUserId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent,
      last_seen_at: nowIso,
    })
    .select('id, endpoint')
    .maybeSingle();

  if (insertError || !inserted) {
    // Race condition : un autre device avec le même endpoint vient d'être
    // inséré entre notre lookup et l'insert. Retombe sur l'update path en
    // refaisant un upsert.
    if (
      insertError &&
      typeof insertError === 'object' &&
      (insertError as { code?: string }).code === '23505'
    ) {
      const { data: retryUpdated, error: retryError } = await supabaseAdmin
        .from('push_subscriptions')
        .update({
          user_id: authUserId,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          user_agent,
          last_seen_at: nowIso,
        })
        .eq('endpoint', subscription.endpoint)
        .select('id, endpoint')
        .maybeSingle();

      if (retryError || !retryUpdated) {
        logger.error('[admin/notif/subscribe] retry update error', retryError);
        return res.status(500).json({ error: 'Erreur serveur.' });
      }

      return res.status(200).json({
        id: retryUpdated.id,
        endpoint: retryUpdated.endpoint,
        created: false,
      });
    }

    logger.error('[admin/notif/subscribe] insert error', insertError);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }

  return res.status(201).json({
    id: inserted.id,
    endpoint: inserted.endpoint,
    created: true,
  });
}

// `caster` est le rôle minimum : tout staff doit pouvoir s'abonner aux Web
// Push depuis sa PWA, indépendamment de son niveau de permissions admin.
export default withStaffRoute(handler, 'caster');
