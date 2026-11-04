// utils/db/d1/realtime.ts — le temps réel quand la base sera D1 (lot 4c de
// conference-website docs/D1-MIGRATION.md et docs/REALTIME-DO.md).
//
// Aujourd'hui, un déclencheur Postgres prévient le Worker temps réel par pg_net : `POST /notify`,
// `{ room, table, op, id }` signé HMAC-SHA256 de `<horodatage>.<corps>` (REALTIME_NOTIFY_SECRET).
// D1 n'a pas d'appel réseau. Ses déclencheurs (database/d1/schema.sql) notent les salons à
// prévenir dans la boîte interne `_d1_realtime`, dans la même instruction que l'écriture ; la
// façade la vide DANS LE MÊME ENVOI (atomique : une écriture annulée n'annonce rien) et remet
// les changements à `notify` (client.ts, en fond par runInBackground). `createRealtimeNotifier` les envoie ensuite comme
// Postgres : même corps au caractère près, même signature, une requête par salon. Il ne lève
// jamais : une notification perdue ne défait pas l'écriture (pg_net non plus).
//
// Une écriture hors façade (fonctions réécrites aux lots 4d–4f) vide la boîte de la même façon :
// `REALTIME_DRAIN_SQL` en dernière instruction de son envoi, puis `decodeRealtime`.

import { createHmac } from 'node:crypto';
import { logger } from '@/utils/logger';

export type RealtimeOp = 'INSERT' | 'UPDATE' | 'DELETE';

/** Un salon à prévenir : « la table X, ligne Y, a changé » (aucune donnée de la ligne). */
export interface RealtimeEvent {
  room: string;
  table: string;
  op: RealtimeOp;
  id: string | null;
}

/** Vide la boîte d'envoi ; en dernière instruction de l'envoi qui écrit. */
export const REALTIME_DRAIN_SQL = 'DELETE FROM "_d1_realtime" RETURNING "seq", "room", "table", "op", "id"';

/** Les lignes vidées, dans l'ordre où les déclencheurs les ont notées. */
export function decodeRealtime(rows: Array<Record<string, unknown>>): RealtimeEvent[] {
  return [...rows]
    .sort((a, b) => Number(a.seq) - Number(b.seq))
    .map((r) => ({ room: String(r.room), table: String(r.table), op: String(r.op) as RealtimeOp, id: r.id === null ? null : String(r.id) }));
}

/**
 * Le corps tel que Postgres l'envoie : `jsonb_build_object(…)::text`, clés dans l'ordre de jsonb
 * (longueur, puis octets : id, op, room, table), « ": " » et « ", " ». Le Worker vérifie la
 * signature sur ce texte ; le garder identique laisse son vecteur de test valable des deux côtés.
 */
export function notifyBody(event: RealtimeEvent): string {
  const pairs: Array<[string, string | null]> = [
    ['id', event.id],
    ['op', event.op],
    ['room', event.room],
    ['table', event.table],
  ];
  return `{${pairs.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')}}`;
}

/** La signature de `/notify` : HMAC-SHA256 hex de `<horodatage>.<corps>`. */
export function signNotify(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number }>;

export interface RealtimeNotifierOptions {
  /** `https://realtime.owwomenscup.fr/notify` ; sans adresse ou sans secret, rien ne part. */
  url: string | undefined;
  secret: string | undefined;
  fetch?: FetchLike;
  now?: () => number;
  /** Par requête ; 3 s comme pg_net. */
  timeoutMs?: number;
}

/**
 * Envoie les changements comme Postgres : une requête signée par salon, doublons exacts
 * retirés, en parallèle. Ne lève jamais ; le journal dit le nombre d'échecs, ni salon ni secret.
 */
export function createRealtimeNotifier(options: RealtimeNotifierOptions): (events: RealtimeEvent[]) => Promise<void> {
  return async (events) => {
    const { url, secret } = options;
    if (!url || !secret || events.length === 0) return;
    const doFetch = options.fetch ?? (globalThis.fetch as unknown as FetchLike);
    const bodies = [...new Set(events.map(notifyBody))];
    const results = await Promise.allSettled(
      bodies.map(async (body) => {
        const timestamp = String((options.now ?? Date.now)());
        const res = await doFetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-realtime-timestamp': timestamp,
            'x-realtime-signature': signNotify(secret, timestamp, body),
          },
          body,
          signal: AbortSignal.timeout(options.timeoutMs ?? 3_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      })
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed) logger.warn('[d1/realtime] %d notification(s) sur %d non remise(s)', failed, bodies.length);
  };
}
