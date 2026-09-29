// features/player/messages/repository.ts — messages entre capitaines
// (`demandes` de type `captain_message`) (lot P15). Colonnes explicites ;
// tenant obligatoire ; la base est REÇUE.
//
// Les identifiants d'équipe interpolés dans les filtres `.or()` PostgREST sont
// des UUID VALIDÉS en amont (service) : un UUID ne peut pas contenir les
// caractères d'opérateur (`, . ( ) :`) — pas d'injection de filtre.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Json } from '@/types/database.generated';
import type { CaptainMessageRow, ConversationOtherTeam } from './schemas';

const MESSAGE_COLS =
  'id, user_id, team_id, comment, payload, status, created_at';

export type MyTeamRow = { id: string; captain_id: string | null; name: string };

export async function readMyTeam(
  db: AdminDb,
  teamId: string,
  tenantId: string
): Promise<MyTeamRow | null> {
  const { data } = await db
    .from('teams')
    .select('id, captain_id, name')
    .eq('id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return (data as MyTeamRow | null) ?? null;
}

/** Messages envoyés PAR l'équipe ou adressés À elle, plus récents d'abord. */
export async function listTeamMessages(
  db: AdminDb,
  teamId: string,
  tenantId: string
) {
  const { data, error } = await db
    .from('demandes')
    .select(MESSAGE_COLS)
    .eq('type', 'captain_message')
    .eq('tenant_id', tenantId)
    .or(`payload->>from_team_id.eq.${teamId},team_id.eq.${teamId}`)
    .order('created_at', { ascending: false });
  return { rows: (data ?? []) as CaptainMessageRow[], error };
}

/** Messages d'une conversation (les deux sens), dans l'ordre. */
export async function listConversationMessages(
  db: AdminDb,
  teamA: string,
  teamB: string,
  tenantId: string
) {
  const { data, error } = await db
    .from('demandes')
    .select(MESSAGE_COLS)
    .eq('type', 'captain_message')
    .eq('tenant_id', tenantId)
    .or(
      `and(payload->>from_team_id.eq.${teamA},team_id.eq.${teamB}),and(payload->>from_team_id.eq.${teamB},team_id.eq.${teamA})`
    )
    .order('created_at', { ascending: true });
  return { rows: (data ?? []) as CaptainMessageRow[], error };
}

/** Équipe active du tenant, cible possible d'un message. */
export async function readActiveTargetTeam(
  db: AdminDb,
  teamId: string,
  tenantId: string
) {
  const { data, error } = await db
    .from('teams')
    .select('id, name')
    .eq('id', teamId)
    .eq('is_active', true)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { team: (data as { id: string; name: string } | null) ?? null, error };
}

export async function readOtherTeam(
  db: AdminDb,
  teamId: string,
  tenantId: string
): Promise<ConversationOtherTeam | null> {
  const { data } = await db
    .from('teams')
    .select('id, name, short_name, logo_url')
    .eq('id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return (data as ConversationOtherTeam | null) ?? null;
}

export async function insertMessage(
  db: AdminDb,
  row: {
    userId: string;
    targetTeamId: string;
    content: string;
    payload: Record<string, unknown>;
    tenantId: string;
  }
) {
  const { data, error } = await db
    .from('demandes')
    .insert({
      user_id: row.userId,
      team_id: row.targetTeamId,
      type: 'captain_message',
      status: 'pending',
      comment: row.content,
      source: 'website',
      payload: row.payload as Json,
      tenant_id: row.tenantId,
    })
    // Colonnes explicites (P4) : jamais `staff_note`, `metadata` ni les
    // identifiants staff de traitement.
    .select('id, type, status, team_id, comment, payload, created_at')
    .single();
  return { message: (data as Record<string, unknown> | null) ?? null, error };
}

/** Passe à `approved` les messages ENTRANTS encore `pending` de `fromTeamId`. */
export async function markIncomingRead(
  db: AdminDb,
  args: { myTeamId: string; fromTeamId: string; tenantId: string }
) {
  const { error, count } = await db
    .from('demandes')
    .update({ status: 'approved' })
    .eq('type', 'captain_message')
    .eq('team_id', args.myTeamId)
    .eq('tenant_id', args.tenantId)
    .eq('status', 'pending')
    .or(`payload->>from_team_id.eq.${args.fromTeamId}`);
  return { count: count ?? 0, error };
}
