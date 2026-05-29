// POST /api/bot/v1/announcements
//
// Commande /annoncer (admin) : cree une annonce site-wide. Mirror du admin
// route admin/announcements (POST). Si l'annonce est active, le webhook
// Discord notifyAnnouncement est declenche en async (comme cote site).
//
// Body :
//   actorDiscordUserId (staff admin/owner)
//   title, message              (requis)
//   ctaLabel?, ctaUrl?          (optionnel)
//   startsAt?, endsAt?          (ISO 8601)
//   isActive?                   (defaut true)
//   priority?                   (defaut 0)

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import { discordIdSchema } from '@/utils/botValidation';
import { sanitizeUrl } from '@/utils/apiHelpers';
import { notifyAnnouncement } from '@/utils/discord';
import { logger } from '@/utils/logger';

const TITLE_MAX = 200;
const MESSAGE_MAX = 5000;

// Sémantique historique préservée :
//   - title/message : trim, non vide, bornes 200 / 5000.
//   - ctaLabel : trim → null si vide.
//   - ctaUrl : si fourni, doit passer sanitizeUrl (http/https) sinon REJET ;
//     normalisé en null s'il est absent/vide.
//   - startsAt/endsAt : si fournis (non vides), doivent être des dates
//     parseables (→ ISO) sinon REJET ; absents → null.
//   - isActive : défaut true (seul `false` désactive).
//   - priority : nombre fini tronqué, défaut 0.
//   - actorDiscordUserId : lu par requireBotStaff sur le body brut (non muté) ;
//     validé ici aussi pour la cohérence du contrat.
const announcementsBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  title: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1).max(TITLE_MAX)),
  message: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1).max(MESSAGE_MAX)),
  ctaLabel: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v.trim() || null : null)),
  // ctaUrl / startsAt / endsAt : rejet CONDITIONNEL (fourni-mais-invalide →
  // 400 avec message dédié, absent → null). La sémantique historique ne se
  // mappe pas sur un simple schéma (pas de rejet si absent), donc ces champs
  // restent validés inline dans le handler à partir du body brut.
  ctaUrl: z.string().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  // isActive / priority : sémantique historique tolérante (n'importe quel type
  // accepté ; seul `isActive === false` désactive, priority n'est utilisé que
  // si c'est un number fini, sinon 0). On garde `z.unknown()` pour ne PAS
  // rejeter un type inattendu que l'ancien code ignorait silencieusement.
  isActive: z.unknown().optional(),
  priority: z.unknown().optional(),
});

function toISO(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const input = req.botInput as z.infer<typeof announcementsBodySchema>;

  // requireBotStaff lit actorDiscordUserId sur req.body brut (non muté).
  const actor = await requireBotStaff(
    req,
    res,
    (req.body ?? {}) as Record<string, unknown>
  );
  if (!actor) return;

  const title = input.title;
  const message = input.message;
  const ctaLabel = input.ctaLabel ?? null;

  const ctaUrl =
    typeof input.ctaUrl === 'string' ? sanitizeUrl(input.ctaUrl) : null;
  if (input.ctaUrl && !ctaUrl) {
    return res
      .status(400)
      .json({ error: 'ctaUrl invalide (http/https attendu)' });
  }

  const isActive = input.isActive !== false; // defaut true
  const priority =
    typeof input.priority === 'number' && Number.isFinite(input.priority)
      ? Math.trunc(input.priority)
      : 0;

  const startsAt = toISO(input.startsAt);
  const endsAt = toISO(input.endsAt);
  if (input.startsAt && !startsAt) {
    return res.status(400).json({ error: 'startsAt invalide (ISO 8601)' });
  }
  if (input.endsAt && !endsAt) {
    return res.status(400).json({ error: 'endsAt invalide (ISO 8601)' });
  }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('announcements')
    .insert({
      tenant_id: req.botContext.tenantId,
      title,
      message,
      cta_label: ctaLabel,
      cta_url: ctaUrl,
      is_active: isActive,
      priority,
      starts_at: startsAt,
      ends_at: endsAt,
    })
    .select('*')
    .single();
  if (insErr || !inserted) {
    logger.error('[bot/announcements] insert error', insErr);
    return res.status(500).json({ error: 'Échec de la création' });
  }

  if (isActive) {
    void notifyAnnouncement({
      tournamentId: null,
      title,
      message,
      ctaLabel,
      ctaUrl,
    }).catch((e) =>
      logger.error('[bot/announcements] discord notify error', e)
    );
  }

  await logBotStaffAction({
    staffId: actor.staffId,
    action: 'other',
    entity_type: 'announcement',
    entity_id: inserted.id,
    payload: {
      action_type: 'create_announcement',
      title,
      is_active: isActive,
      priority,
    },
  });

  return res.status(201).json({ announcement: inserted });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: {
    max: 20,
    key: 'bot-announcements',
    perActor: { max: 3, windowMs: 60_000 },
  },
  idempotent: true,
  bodySchema: announcementsBodySchema,
});
