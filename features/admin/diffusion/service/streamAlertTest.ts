// features/admin/diffusion/service/streamAlertTest.ts — alerte de TEST dans la
// boîte d'alertes (`/overlay/alertes`), par le même chemin qu'un vrai
// événement Twitch (table → poll → source).
//
// Même table que le webhook, marquée par sa clé : `twitch_message_id` vaut
// `test-<uuid>`, jamais un identifiant Twitch. Les règles (type éteint, seuil)
// s'appliquent VOLONTAIREMENT. Pas de don ici : les dons viennent de HelloAsso.

import crypto from 'node:crypto';
import { z } from 'zod';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { LegacyAdminError } from '@/utils/admin/errors';
import { TWITCH_ALERT_KINDS, type AlertKind } from '@/utils/overlay/alertBox';

/** Une quantité plausible par type — assez pour passer un seuil modeste. */
const SAMPLE_AMOUNT: Partial<Record<AlertKind, number>> = {
  resub: 6,
  gift: 5,
  cheer: 500,
  raid: 42,
};

const BodySchema = z.object({
  // Les types qu'un webhook Twitch dépose — pas `donation`.
  kind: z
    .string()
    .refine((k): k is AlertKind =>
      (TWITCH_ALERT_KINDS as readonly string[]).includes(k)
    ),
  name: z.string().trim().min(1).max(60).optional(),
});

const DEFAULT_NAME = 'Test';

export async function fireTestAlert(ctx: ServiceContext, raw: unknown) {
  const parsed = BodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new LegacyAdminError(400, 'Type d’alerte invalide.');
  }
  const kind = parsed.data.kind as AlertKind;

  const { error } = await ctx.db.from('stream_alert_events').insert({
    tenant_id: ctx.tenantId,
    twitch_message_id: `test-${crypto.randomUUID()}`,
    kind,
    actor_name: parsed.data.name ?? DEFAULT_NAME,
    amount: SAMPLE_AMOUNT[kind] ?? null,
    tier: kind === 'sub' || kind === 'resub' ? '1000' : null,
  });
  if (error) {
    ctx.logger.error(
      '[admin/stream-alert-test] écriture impossible: %s',
      (error as { message?: string }).message ?? String(error)
    );
    throw new LegacyAdminError(500, 'Écriture impossible.');
  }
  return { ok: true as const, kind };
}
