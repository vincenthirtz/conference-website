// features/admin/moderation/repository.ts — accès base des blacklists, des
// alertes et des tickets support. Tables service-role only (RLS
// default-deny) : chaque requête est scopée EXPLICITEMENT par `tenantId`,
// paramètre obligatoire.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { TablesInsert, TablesUpdate } from '@/types/database.generated';
import {
  BLACKLIST_ALERT_COLUMNS,
  ENTITY_BLACKLIST_COLUMNS,
  PLAYER_BLACKLIST_COLUMNS,
  SUPPORT_TICKET_LIST_COLUMNS,
  SUPPORT_TICKET_ROW_COLUMNS,
} from './schemas';

type Page = { offset: number; limit: number };

/* ---- Blacklist joueurs ---- */

export async function listPlayerBlacklist(
  db: AdminDb,
  tenantId: string,
  f: Page & { searchPattern: string | null; active: boolean | null }
) {
  let query = db
    .from('player_blacklist')
    .select(PLAYER_BLACKLIST_COLUMNS, { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(f.offset, f.offset + f.limit - 1);
  if (f.searchPattern) {
    const s = f.searchPattern;
    query = query.or(
      `battle_tag.ilike.${s},display_name.ilike.${s},discord_user_id.ilike.${s}`
    );
  }
  if (f.active !== null) query = query.eq('active', f.active);
  const { data, error, count } = await query;
  return { rows: data ?? [], count, error };
}

export async function insertPlayerBlacklist(
  db: AdminDb,
  row: TablesInsert<'player_blacklist'> & { tenant_id: string }
) {
  const { data, error } = await db
    .from('player_blacklist')
    .insert(row)
    .select(PLAYER_BLACKLIST_COLUMNS)
    .single();
  return { row: data ?? null, error };
}

export async function updatePlayerBlacklist(
  db: AdminDb,
  tenantId: string,
  id: string,
  patch: TablesUpdate<'player_blacklist'>
) {
  const { data, error } = await db
    .from('player_blacklist')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(PLAYER_BLACKLIST_COLUMNS)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function deletePlayerBlacklist(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { data, error } = await db
    .from('player_blacklist')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('id')
    .maybeSingle();
  return { row: data ?? null, error };
}

/* ---- Blacklist entités ---- */

export async function listEntityBlacklist(
  db: AdminDb,
  tenantId: string,
  f: Page & {
    namePattern: string | null;
    active: boolean | null;
    entityType: 'team' | 'org' | null;
  }
) {
  let query = db
    .from('entity_blacklist')
    .select(ENTITY_BLACKLIST_COLUMNS, { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(f.offset, f.offset + f.limit - 1);
  if (f.namePattern) query = query.ilike('name', f.namePattern);
  if (f.active !== null) query = query.eq('active', f.active);
  if (f.entityType) query = query.eq('entity_type', f.entityType);
  const { data, error, count } = await query;
  return { rows: data ?? [], count, error };
}

export async function insertEntityBlacklist(
  db: AdminDb,
  row: TablesInsert<'entity_blacklist'> & { tenant_id: string }
) {
  const { data, error } = await db
    .from('entity_blacklist')
    .insert(row)
    .select(ENTITY_BLACKLIST_COLUMNS)
    .single();
  return { row: data ?? null, error };
}

export async function updateEntityBlacklist(
  db: AdminDb,
  tenantId: string,
  id: string,
  patch: TablesUpdate<'entity_blacklist'>
) {
  const { data, error } = await db
    .from('entity_blacklist')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(ENTITY_BLACKLIST_COLUMNS)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function deleteEntityBlacklist(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { data, error } = await db
    .from('entity_blacklist')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('id')
    .maybeSingle();
  return { row: data ?? null, error };
}

/* ---- Alertes de détection ---- */

export async function listBlacklistAlerts(
  db: AdminDb,
  tenantId: string,
  f: {
    limit: number;
    before: string | null;
    strength: string | null;
    source: string | null;
    discordUserId: string | null;
  }
) {
  let query = db
    .from('blacklist_alerts')
    .select(BLACKLIST_ALERT_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(f.limit);
  if (f.before) query = query.lt('created_at', f.before);
  if (f.strength) query = query.eq('strength', f.strength);
  if (f.source) query = query.eq('source', f.source);
  if (f.discordUserId) query = query.eq('discord_user_id', f.discordUserId);
  const { data, error } = await query;
  return { rows: data ?? [], error };
}

/* ---- Tickets support ---- */

export type TicketFilters = {
  status: string | null;
  severity: string | null;
  category: string | null;
  tournamentId: string | null;
  searchPattern: string | null;
};

// Signatures ouvertes : les filtres PostgREST sont des méthodes génériques,
// seul leur type de retour (le même builder) compte ici.
type TicketFilterable<Q> = {
  eq: (...args: any[]) => Q;
  or: (...args: any[]) => Q;
};

/**
 * Les mêmes filtres (statut, sévérité, catégorie, tournoi, recherche) sur la
 * page ET sur les compteurs : les cartes du tableau de bord reflètent le jeu
 * filtré entier, pas la page.
 */
function withTicketFilters<Q extends TicketFilterable<Q>>(
  q: Q,
  f: TicketFilters
): Q {
  let out = q;
  if (f.status) out = out.eq('status', f.status);
  if (f.severity) out = out.eq('severity', f.severity);
  if (f.category) out = out.eq('category', f.category);
  if (f.tournamentId) out = out.eq('tournament_id', f.tournamentId);
  if (f.searchPattern) {
    const p = f.searchPattern;
    out = out.or(
      `subject.ilike.${p},message.ilike.${p},reporter_name.ilike.${p}`
    );
  }
  return out;
}

function countTickets(db: AdminDb, tenantId: string, f: TicketFilters) {
  return withTicketFilters(
    db
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
    f
  );
}

export async function listSupportTickets(
  db: AdminDb,
  tenantId: string,
  f: TicketFilters & Page
) {
  const pageQuery = withTicketFilters(
    db
      .from('support_tickets')
      .select(SUPPORT_TICKET_LIST_COLUMNS, { count: 'exact' })
      .eq('tenant_id', tenantId),
    f
  )
    .order('created_at', { ascending: false })
    .range(f.offset, f.offset + f.limit - 1);

  const openCountQuery = countTickets(db, tenantId, f).eq('status', 'open');
  // "Haute sévérité (actifs)" = high ET encore à traiter (ni resolved ni
  // closed) : deux .neq() plutôt qu'un NOT IN, équivalents.
  const highCountQuery = countTickets(db, tenantId, f)
    .eq('severity', 'high')
    .neq('status', 'resolved')
    .neq('status', 'closed');
  // "Résolus / fermés" = resolved OU closed.
  const resolvedCountQuery = countTickets(db, tenantId, f).in('status', [
    'resolved',
    'closed',
  ]);

  const [page, open, high, resolved] = await Promise.all([
    pageQuery,
    openCountQuery,
    highCountQuery,
    resolvedCountQuery,
  ]);
  return { page, open, high, resolved };
}

export async function getSupportTicket(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { data, error } = await db
    .from('support_tickets')
    .select(SUPPORT_TICKET_ROW_COLUMNS)
    // Borne tenant : un ticket d'un autre espace doit être introuvable,
    // pas seulement non modifiable.
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function updateSupportTicket(
  db: AdminDb,
  tenantId: string,
  id: string,
  patch: TablesUpdate<'support_tickets'>
) {
  const { data, error } = await db
    .from('support_tickets')
    .update(patch)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select(SUPPORT_TICKET_ROW_COLUMNS)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function deleteSupportTicket(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { error } = await db
    .from('support_tickets')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', id);
  return { error };
}

/** État de conversion d'un ticket (déjà converti joueur / entité ?). */
export async function getTicketConversionState(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { data, error } = await db
    .from('support_tickets')
    .select('id, converted_player_blacklist_id, converted_entity_blacklist_id')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function linkTicketConversion(
  db: AdminDb,
  tenantId: string,
  id: string,
  column: 'converted_player_blacklist_id' | 'converted_entity_blacklist_id',
  entryId: string
) {
  const updated_at = new Date().toISOString();
  const patch: TablesUpdate<'support_tickets'> =
    column === 'converted_player_blacklist_id'
      ? { converted_player_blacklist_id: entryId, updated_at }
      : { converted_entity_blacklist_id: entryId, updated_at };
  const { error } = await db
    .from('support_tickets')
    .update(patch)
    .eq('tenant_id', tenantId)
    .eq('id', id);
  return { error };
}
