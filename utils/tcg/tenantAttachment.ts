// utils/tcg/tenantAttachment.ts
//
// « Cette joueuse est-elle RATTACHÉE à cet espace ? » — la seule définition,
// partagée par la correction de solde (`/api/admin/tcg/grant`), le rattrapage
// Battle.net (`battlenetBackfill.ts`) et, en SQL, la recherche de joueuses
// (`admin_search_tcg_players`, migration `tcg_admin_search_players_scoped.sql`).
//
// POURQUOI UNE DÉFINITION STRICTE (audit du 2026-09-15). Le rattrapage
// considérait « un porte-monnaie dans le tenant » comme un rattachement, et la
// correction de solde acceptait n'importe quel compte de la plateforme. Un
// owner d'espace tiers — un espace développeur se crée en libre-service —
// pouvait donc créditer +1 pièce à une joueuse qui ne joue pas chez lui (ce qui
// crée son porte-monnaie), puis lancer le rattrapage : la récompense Battle.net
// de cette joueuse, UNIQUE tous tenants confondus, était consommée chez lui, et
// l'espace où elle joue ne pourrait plus jamais la lui verser.
//
// RATTACHÉE =
//   - une ligne de roster du tenant (`team_members.tenant_id`), OU
//   - une écriture de GAIN RÉEL au registre du tenant : une source de la liste
//     blanche ci-dessous. Exclus : `admin_grant` (le geste même du staff
//     qu'on veut empêcher de fabriquer un rattachement), `booster_purchase` et
//     `card_recycled` (dérivés de pièces qui peuvent venir d'un `admin_grant`),
//     et toute source que personne n'a pris la décision d'ajouter ici — une
//     liste blanche oublie une joueuse, elle n'invite jamais une étrangère.
//   Le simple fait d'avoir un porte-monnaie ne compte plus : `refreshBalance`
//   en crée un pour n'importe quel crédit.
//
// LIMITE CONNUE, HORS DE CE MODULE. Un owner peut ajouter un compte existant à
// un roster de son espace (`POST /api/admin/teams/[teamId]/members`, par email
// ou par id) sans le consentement de la personne : le rattachement « roster »
// reste donc fabricable par un staff malveillant. Le fermer relève d'un flux
// d'invitation acceptée, pas d'une définition.
//
// UNE ERREUR DE LECTURE N'EST PAS UNE ABSENCE : `{ ok: false }`, jamais un
// ensemble vide qui ferait conclure « pas rattachée ».

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

/**
 * Sources du registre qui prouvent une présence dans l'espace sans qu'un staff
 * ait pu la fabriquer seul. Recopiée À L'IDENTIQUE dans
 * `tcg_admin_search_players_scoped.sql` — un test vérifie l'égalité.
 */
export const TENANT_ATTACHING_WALLET_SOURCES = [
  'match_win',
  'scrim_win',
  'twitch_drop',
  'welcome_gift',
  'supporter_welcome',
  'checkin_streak',
  'tournament_placement',
  'battlenet_verified',
] as const;

/** Taille des listes `in (...)` : des UUID dans l'URL, gardée courte. */
const CHUNK_SIZE = 100;
/** PostgREST coupe à 1000 lignes (`max_rows`) : on pagine. */
const PAGE_SIZE = 1000;

export type AttachmentRead = { ok: true; value: Set<string> } | { ok: false };

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Parmi `batch`, les comptes présents dans `team_members` pour ce tenant. */
async function readRostered(
  tenantId: string,
  batch: string[],
  found: Set<string>
): Promise<boolean> {
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin!
      .from('team_members')
      .select('id, user_id')
      .eq('tenant_id', tenantId)
      .in('user_id', batch)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      logger.error('[tcg/attachment] rosters illisibles: %s', error.message);
      return false;
    }
    const rows = (data ?? []) as Array<{ user_id?: string | null }>;
    for (const row of rows) if (row.user_id) found.add(row.user_id);
    if (rows.length < PAGE_SIZE) return true;
  }
}

/** Parmi `batch`, les comptes qui ont un GAIN RÉEL au registre de ce tenant. */
async function readEarned(
  tenantId: string,
  batch: string[],
  found: Set<string>
): Promise<boolean> {
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin!
      .from('tcg_wallet_entries')
      .select('id, user_id')
      .eq('tenant_id', tenantId)
      .in('user_id', batch)
      .in('source_kind', [...TENANT_ATTACHING_WALLET_SOURCES])
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      logger.error('[tcg/attachment] registre illisible: %s', error.message);
      return false;
    }
    const rows = (data ?? []) as Array<{ user_id?: string | null }>;
    for (const row of rows) if (row.user_id) found.add(row.user_id);
    if (rows.length < PAGE_SIZE) return true;
  }
}

/**
 * Parmi `userIds`, ceux qui sont rattachés à `tenantId` (roster OU gain réel).
 * `{ ok: false }` si une seule lecture échoue.
 */
export async function readTenantAttachedUsers(
  tenantId: string,
  userIds: readonly string[]
): Promise<AttachmentRead> {
  if (!supabaseAdmin || !tenantId) return { ok: false };
  const unique = [...new Set(userIds.filter((id) => typeof id === 'string'))];
  const found = new Set<string>();
  for (const batch of chunks(unique, CHUNK_SIZE)) {
    const [rosterOk, earnedOk] = await Promise.all([
      readRostered(tenantId, batch, found),
      readEarned(tenantId, batch, found),
    ]);
    if (!rosterOk || !earnedOk) return { ok: false };
  }
  return { ok: true, value: found };
}

/** Raccourci pour un seul compte : `null` = lecture en échec. */
export async function isUserAttachedToTenant(
  tenantId: string,
  userId: string
): Promise<boolean | null> {
  const read = await readTenantAttachedUsers(tenantId, [userId]);
  if (!read.ok) return null;
  return read.value.has(userId);
}
