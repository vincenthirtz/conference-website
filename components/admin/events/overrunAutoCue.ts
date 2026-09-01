// components/admin/events/overrunAutoCue.ts
//
// Émission du cue automatique « segment en dépassement » (lot Régie 6),
// extraite de `pages/admin/events/[runId]/director.tsx` — lot A7 : tout lot qui
// touche un god-component en sort un morceau. Le lot A6 y ajoutait le bouton
// d'historique, et le garde-fou de taille l'a refusé.
//
// Deux mécanismes complémentaires, PAS redondants :
//   - Idempotency-Key (header) : cache 24 h côté DB (admin_idempotency).
//     Protège contre les RETRIES RÉSEAU du MÊME appelant (re-montage du
//     watcher dans le même onglet, double-clic). Clef stable par segment.
//   - dedup_key (body) : index UNIQUE partiel côté DB (event_cues).
//     Protège contre les écritures CONCURRENTES d'appelants DIFFÉRENTS — ici
//     le client (ce hook) contre le cron `overrun-watcher-cron`, qui écrit le
//     même cue si l'onglet Régie est fermé. Le second writer prend un 23505
//     côté handler, qui répond 200 dedupReplayed=true. Pour nous c'est aussi
//     un succès (res.ok = true).

import type { AdminFetchOptions } from '@/hooks/useAdminFetch';
import { format } from '@/lib/i18n/useAdminT';

export type SendOverrunAutoCueArgs = {
  adminFetch: (input: string, init?: AdminFetchOptions) => Promise<Response>;
  runId: string;
  segmentId: string;
  body: string;
  /** Gabarit d'erreur localisé, attend `{status}`. */
  failedTemplate: string;
};

export async function sendOverrunAutoCue({
  adminFetch,
  runId,
  segmentId,
  body,
  failedTemplate,
}: SendOverrunAutoCueArgs): Promise<void> {
  const dedupKey = `auto-overrun:${runId}:${segmentId}`;
  const res = await adminFetch(`/api/admin/events/${runId}/cues`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': dedupKey,
    },
    body: JSON.stringify({ severity: 'urgent', body, dedup_key: dedupKey }),
  });
  if (res.ok) return;

  let msg = format(failedTemplate, { status: res.status });
  try {
    const payload = await res.json();
    if (payload?.error) msg = String(payload.error);
  } catch {
    // corps illisible : on garde le message générique
  }
  throw new Error(msg);
}
