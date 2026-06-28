// pages/api/email/unsubscribe.ts
//
// GET /api/email/unsubscribe?token=<signed>
//
// Désabonnement one-click du canal EMAIL (RGPD : lien présent en bas de chaque
// digest). PAS d'auth session : le lien est cliqué depuis un client mail, donc
// la preuve d'identité est le token HMAC auto-portant (cf. emailUnsubscribe.ts).
//
// Effet : opt-out GLOBAL email — on pose une row notification_prefs
// (channel='email', enabled=false) pour CHAQUE EMAIL_EVENT_TYPES du user.
// Le modèle email étant opt-IN (absent = pas d'email), un opt-out explicite
// est belt-and-suspenders : il neutralise aussi tout opt-in existant.
//
// notification_prefs est keyée (user_id, event_type, channel) — PAS de
// tenant_id (la table est globale par user). Aucun scoping tenant nécessaire.
//
// CSRF : non applicable. GET idempotent, aucune mutation déclenchable par un
// tiers sans le token signé. Rejouer le lien ne change rien (idempotent).

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { verifyUnsubscribeToken } from '@/utils/emailUnsubscribe';
import { EMAIL_EVENT_TYPES } from '@/utils/webPushEvents';

const PAGE_STYLE =
  'margin:0;padding:0;background:#1a1430;color:#e9e4f5;font-family:' +
  "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;";
const CARD_STYLE =
  'max-width:480px;margin:64px auto;padding:40px 32px;background:rgba(255,255,255,0.05);' +
  'border:1px solid rgba(255,255,255,0.08);border-radius:16px;text-align:center;';

function htmlPage(opts: {
  title: string;
  heading: string;
  message: string;
}): string {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${opts.title} — OW Women's Cup</title>
  </head>
  <body style="${PAGE_STYLE}">
    <div style="${CARD_STYLE}">
      <h1 style="margin:0 0 16px;font-size:22px;color:#ffffff;">${opts.heading}</h1>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#c6bed9;">${opts.message}</p>
    </div>
  </body>
</html>`;
}

function sendHtml(res: NextApiResponse, status: number, html: string): void {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(html);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const userId = verifyUnsubscribeToken(token);

  if (!userId) {
    return sendHtml(
      res,
      400,
      htmlPage({
        title: 'Lien invalide',
        heading: 'Lien invalide ou expiré',
        message:
          'Ce lien de désabonnement n’est plus valide. Tu peux gérer tes ' +
          'préférences de notification depuis ton espace joueuse.',
      })
    );
  }

  if (!supabaseAdmin) {
    logger.error('[email/unsubscribe] Supabase admin not configured');
    return sendHtml(
      res,
      400,
      htmlPage({
        title: 'Erreur',
        heading: 'Une erreur est survenue',
        message:
          'Impossible de traiter ton désabonnement pour le moment. Réessaie ' +
          'plus tard.',
      })
    );
  }

  // Opt-out global email : on remplace les rows email du user pour TOUS les
  // EMAIL_EVENT_TYPES par des rows enabled=false. Pattern delete+insert (la PK
  // est composite (user_id, event_type, channel) ; on évite upsert onConflict
  // CSV qui ne mappe pas bien à une PK 3-colonnes).
  const eventTypes = EMAIL_EVENT_TYPES as readonly string[] as string[];
  const nowIso = new Date().toISOString();

  const { error: deleteError } = await supabaseAdmin
    .from('notification_prefs')
    .delete()
    .eq('user_id', userId)
    .eq('channel', 'email')
    .in('event_type', eventTypes);
  if (deleteError) {
    logger.error('[email/unsubscribe] delete error', deleteError);
    return sendHtml(
      res,
      400,
      htmlPage({
        title: 'Erreur',
        heading: 'Une erreur est survenue',
        message:
          'Impossible de traiter ton désabonnement pour le moment. Réessaie ' +
          'plus tard.',
      })
    );
  }

  const rows = eventTypes.map((event_type) => ({
    user_id: userId,
    event_type,
    channel: 'email',
    enabled: false,
    updated_at: nowIso,
  }));
  const { error: insertError } = await supabaseAdmin
    .from('notification_prefs')
    .insert(rows);
  if (insertError) {
    logger.error('[email/unsubscribe] insert error', insertError);
    return sendHtml(
      res,
      400,
      htmlPage({
        title: 'Erreur',
        heading: 'Une erreur est survenue',
        message:
          'Impossible de traiter ton désabonnement pour le moment. Réessaie ' +
          'plus tard.',
      })
    );
  }

  logger.info('[email/unsubscribe] user %s opted out of email', userId);
  return sendHtml(
    res,
    200,
    htmlPage({
      title: 'Désabonnement confirmé',
      heading: 'C’est fait',
      message:
        'Tu ne recevras plus d’emails de notification. Tu peux réactiver ce ' +
        'canal à tout moment depuis ton espace joueuse.',
    })
  );
}
