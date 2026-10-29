// utils/realtime/rooms.ts
//
// Règles pures du temps réel côté écrans (docs/REALTIME-DO.md, étape 3) :
// quel transport (Supabase Realtime ou salons du Worker Cloudflare), quel
// salon pour une écoute `useRealtimeChannel`, quelle route de l'API donne le
// ticket d'un salon privé, et lecture des messages reçus. Aucun accès réseau :
// la connexion vit dans utils/realtime/cloudflareRealtime.ts.

import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { formatPresenceState } from '@/utils/caster/presence';
import type { CasterPresenceUser } from '@/types/caster';

export type RealtimeBackend = 'supabase' | 'cloudflare';

/**
 * Transport choisi : `?realtime=cloudflare|supabase` dans l'adresse de la
 * page (essai d'un écran, ou repli d'un seul écran), sinon l'interrupteur du
 * build `NEXT_PUBLIC_REALTIME_BACKEND`. Par défaut : Supabase.
 */
export function pickRealtimeBackend(
  envValue: string | undefined,
  search: string | undefined
): RealtimeBackend {
  const override = search ? new URLSearchParams(search).get('realtime') : null;
  if (override === 'cloudflare' || override === 'supabase') return override;
  return envValue === 'cloudflare' ? 'cloudflare' : 'supabase';
}

const FILTER_EQ = /^([a-z_]+)=eq\.([A-Za-z0-9_-]{1,64})$/;

/**
 * Salon du Worker qui correspond à une écoute `postgres_changes` (table +
 * filtre `colonne=eq.valeur`), comme les déclencheurs de la base les
 * nomment (conference-api add_realtime_notify_triggers.sql). `null` = pas
 * de salon prévu : l'écoute reste sur Supabase.
 */
export function roomFor(table: string, filter?: string): string | null {
  const m = filter ? FILTER_EQ.exec(filter) : null;
  if (filter && !m) return null;
  const col = m?.[1];
  const val = m?.[2];
  switch (table) {
    case 'matches':
      return col === 'tournament_id' ? `matches:tournament:${val}` : null;
    case 'match_drafts':
      return col === 'id' ? `draft:${val}` : null;
    case 'match_draft_steps':
      return col === 'draft_id' ? `draft:${val}` : null;
    case 'demandes':
      return col === 'team_id' ? `demandes:team:${val}` : null;
    case 'caster_scenes':
      if (!col) return 'caster:scenes';
      return col === 'id' ? `caster:scene:${val}` : null;
    case 'caster_themes':
      return col ? null : 'caster:themes';
    default:
      return null;
  }
}

/** Présence des casters du cockpit (ticket staff, identité = staffId). */
export const CASTER_PRESENCE_ROOM = 'caster:presence';

/**
 * Route de l'API qui délivre le ticket d'un salon privé ; `null` pour un
 * salon public (realtime/protocol.ts `isPublicRoom`).
 */
export function ticketPathFor(room: string): string | null {
  if (room.startsWith('demandes:team:')) return '/api/player/realtime/ticket';
  if (room.startsWith('matches:tournament:') || room === CASTER_PRESENCE_ROOM) {
    return '/api/admin/realtime/ticket';
  }
  return null;
}

type ChangeOp = 'INSERT' | 'UPDATE' | 'DELETE';
type PresenceValue = string | number | boolean;

export type RoomMessage =
  | {
      type: 'change';
      table: string;
      op: ChangeOp;
      id: string | null;
      at: number;
    }
  | {
      type: 'presence';
      users: { user: string | null; state: Record<string, PresenceValue> }[];
    };

const OPS: readonly string[] = ['INSERT', 'UPDATE', 'DELETE'];

/** Message envoyé par un salon (realtime/worker.mjs) ; sinon `null`. */
export function parseRoomMessage(raw: unknown): RoomMessage | null {
  if (typeof raw !== 'string' || raw === 'pong') return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object') return null;
  const m = v as Record<string, unknown>;
  if (m.type === 'change') {
    if (typeof m.table !== 'string' || !OPS.includes(m.op as string)) {
      return null;
    }
    return {
      type: 'change',
      table: m.table,
      op: m.op as ChangeOp,
      id: typeof m.id === 'string' ? m.id : null,
      at: typeof m.at === 'number' ? m.at : Date.now(),
    };
  }
  if (m.type === 'presence' && Array.isArray(m.users)) {
    const users: Extract<RoomMessage, { type: 'presence' }>['users'] = [];
    for (const u of m.users as unknown[]) {
      if (!u || typeof u !== 'object') continue;
      const { user, state } = u as Record<string, unknown>;
      if (!state || typeof state !== 'object') continue;
      users.push({
        user: typeof user === 'string' ? user : null,
        state: state as Record<string, PresenceValue>,
      });
    }
    return { type: 'presence', users };
  }
  return null;
}

/**
 * Charge utile `postgres_changes` SANS données de ligne (`new` et `old`
 * vides) : les écrans rechargent avec leurs propres droits. Même forme que
 * Supabase, pour que les écrans n'aient qu'un seul cas à gérer.
 */
export function changePayload(
  m: Extract<RoomMessage, { type: 'change' }>
): RealtimePostgresChangesPayload<Record<string, unknown>> {
  return {
    schema: 'public',
    table: m.table,
    commit_timestamp: new Date(m.at).toISOString(),
    eventType: m.op,
    new: {},
    old: {},
    errors: [],
  } as unknown as RealtimePostgresChangesPayload<Record<string, unknown>>;
}

/**
 * État de présence envoyé au salon : valeurs plates et courtes (règles de
 * realtime/protocol.ts `parsePresence`), sans `staffId` — l'identité vient du
 * ticket, pas de l'écran.
 */
export function presenceStateFor(
  payload: Record<string, unknown>
): Record<string, PresenceValue> {
  const out: Record<string, PresenceValue> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (k === 'staffId' || !/^[A-Za-z0-9_]{1,32}$/.test(k)) continue;
    if (typeof v === 'string' && v) out[k] = v.slice(0, 100);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
    if (Object.keys(out).length === 10) break;
  }
  return out;
}

/** Liste du bandeau de présence, à partir d'un message `presence`. */
export function presenceUsersFrom(
  users: Extract<RoomMessage, { type: 'presence' }>['users']
): CasterPresenceUser[] {
  const state: Record<string, Record<string, unknown>[]> = {};
  for (const { user, state: s } of users) {
    if (!user) continue;
    (state[user] ??= []).push({ ...s, staffId: user });
  }
  return formatPresenceState(state);
}
