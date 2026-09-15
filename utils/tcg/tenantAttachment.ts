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
//   - une appartenance ACCEPTÉE à un roster du tenant (`team_members.tenant_id`
//     avec `accepted_at` non nul : elle a créé l'équipe, demandé à la rejoindre
//     ou accepté une invitation), OU
//   - une écriture de GAIN né de SON geste au registre du tenant (liste blanche
//     ci-dessous : drop Twitch, accueil supportrice réclamé, vérification
//     Battle.net, série de collection).
//   Ne comptent PAS : un ajout au roster par un tiers (staff, capitaine,
//   import), `admin_grant`, et tout gain piloté par l'organisation (victoires,
//   check-ins, palmarès, cadeau d'accueil) — un owner malveillant peut les
//   provoquer pour une personne qu'il a ajoutée de force. Le simple fait
//   d'avoir un porte-monnaie ne compte pas non plus : `refreshBalance` en crée
//   un pour n'importe quel crédit.
//
// CE QUI RESTE HORS DE CE MODULE : un owner peut toujours AJOUTER quelqu'un à
// un roster sans son accord (l'appartenance existe, simplement sans
// `accepted_at`). Il n'en tire plus aucune prise TCG ; empêcher l'ajout
// lui-même relève d'une invitation obligatoire (lot 2).
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
  // SEULS les gains nés d'un geste de la personne elle-même (2026-09-15).
  // Victoires, séries de check-ins, palmarès et cadeau d'accueil sont PILOTÉS
  // par l'organisation : un owner qui ajoute une étrangère à un roster puis lui
  // distribue un cadeau ou fait tourner des check-ins fabriquait un
  // rattachement. Une joueuse de roster reste rattachée par son APPARTENANCE
  // acceptée (`team_members.accepted_at`), qui couvre ces cas légitimes.
  'twitch_drop', // son compte Twitch, ses points de chaîne
  'supporter_welcome', // réclamé par elle
  'battlenet_verified', // son OAuth Blizzard
  'collection_set', // elle a ouvert ses paquets
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
      // Appartenance ACCEPTÉE seulement : un ajout par un tiers (staff,
      // capitaine, import) ne vaut pas rattachement tant qu'elle n'a pas dit oui.
      .not('accepted_at', 'is', null)
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
