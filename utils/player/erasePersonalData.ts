// utils/player/erasePersonalData.ts
//
// Exécute le registre RGPD (`personalDataTables.ts`) pour une utilisatrice qui
// supprime son compte. Appelée par `pages/api/player/delete-account.ts` AVANT
// `auth.admin.deleteUser` : une fois le compte auth supprimé, plus rien ne
// permettrait de retrouver ce qui lui appartient dans les tables sans clé
// étrangère.
//
// DEUX RÉGIMES D'ÉCHEC, VOLONTAIREMENT DIFFÉRENTS :
//
//   - FICHIERS : un échec de `storage.remove` NE BLOQUE PAS. La joueuse doit
//     pouvoir partir — la bloquer parce que le stockage hoquette, c'est la
//     retenir sur un site qu'elle quitte peut-être pour fuir un harcèlement. Les
//     chemins exacts partent en `logger.error` pour que le staff les retire à la
//     main ; les lignes, elles, sont bien supprimées ou anonymisées, donc le
//     fichier n'est plus servi par aucune page du site.
//
//   - LIGNES : un échec BLOQUE (la route rend 500 sans appeler `deleteUser`).
//     Chaque étape est idempotente (delete / update filtrés sur son id) : la
//     joueuse peut réessayer, et le compte existe encore pour que ses lignes
//     soient retrouvées. Supprimer le compte malgré l'échec laisserait des
//     données orphelines que plus personne ne saurait lui rattacher.
//
// Tous les tenants : aucune étape ne filtre sur `tenant_id`, délibérément.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { TCG_BUCKET } from '@/utils/tcg/teamCardImage';
import {
  PERSONAL_DATA_TABLES,
  type PersonalDataTable,
} from '@/utils/player/personalDataTables';

export type EraseResult =
  | { ok: true; filesNotRemoved: string[] }
  | { ok: false; table: string; message: string };

type Filterable = {
  eq: (column: string, value: string) => Filterable;
} & PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** Chemins de fichiers du bucket TCG référencés par ses lignes. */
async function collectFilePaths(
  userId: string,
  entries: readonly PersonalDataTable[]
): Promise<{ paths: string[] } | { table: string; message: string }> {
  const paths = new Set<string>();
  for (const entry of entries) {
    if (!entry.files) continue;
    for (const column of entry.columns) {
      const { data, error } = await supabaseAdmin
        .from(entry.table)
        .select(entry.files.column)
        .eq(column, userId);
      if (error) return { table: entry.table, message: error.message };
      for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
        const value = row[entry.files.column];
        if (typeof value === 'string' && value.trim() !== '') paths.add(value);
      }
    }
  }
  return { paths: [...paths] };
}

/** Retire les fichiers ; ne lève jamais, rend ceux qui n'ont pas pu partir. */
async function removeFiles(userId: string, paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  try {
    const { error } = await supabaseAdmin.storage
      .from(TCG_BUCKET)
      .remove(paths);
    if (!error) return [];
    logger.error(
      '[player/erasePersonalData] fichiers NON supprimés du bucket public — à retirer à la main',
      { userId, bucket: TCG_BUCKET, paths, error: error.message }
    );
  } catch (err) {
    logger.error(
      '[player/erasePersonalData] fichiers NON supprimés du bucket public — à retirer à la main',
      { userId, bucket: TCG_BUCKET, paths, error: String(err) }
    );
  }
  return paths;
}

/**
 * Supprime ses lignes que plus aucune ligne de `referencedBy` ne référence.
 * Best-effort : ces lignes sont déjà anonymisées ; un échec (ou une référence
 * apparue entre la lecture et la suppression, refusée par ON DELETE RESTRICT)
 * ne justifie pas de la retenir.
 */
async function purgeUnreferenced(
  userId: string,
  entry: PersonalDataTable
): Promise<void> {
  const purge = entry.purgeUnreferenced;
  if (!purge) return;
  try {
    const ids = new Set<string>();
    for (const column of entry.columns) {
      const { data, error } = await supabaseAdmin
        .from(entry.table)
        .select(purge.key)
        .eq(column, userId);
      if (error) throw new Error(error.message);
      for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
        const id = row[purge.key];
        if (typeof id === 'string') ids.add(id);
      }
    }
    if (ids.size === 0) return;

    const { data: refs, error: refError } = await supabaseAdmin
      .from(purge.referencedBy.table)
      .select(purge.referencedBy.column)
      .in(purge.referencedBy.column, [...ids]);
    if (refError) throw new Error(refError.message);
    for (const row of (refs ?? []) as unknown as Record<string, unknown>[]) {
      const ref = row[purge.referencedBy.column];
      if (typeof ref === 'string') ids.delete(ref);
    }
    if (ids.size === 0) return;

    const { error: delError } = await supabaseAdmin
      .from(entry.table)
      .delete()
      .in(purge.key, [...ids]);
    if (delError) throw new Error(delError.message);
  } catch (err) {
    logger.warn(
      `[player/erasePersonalData] ${entry.table} : purge des lignes non référencées impossible (déjà anonymisées)`,
      { userId, error: err instanceof Error ? err.message : String(err) }
    );
  }
}

async function applyEntry(
  userId: string,
  entry: PersonalDataTable,
  now: string
): Promise<string | null> {
  if (entry.neutralise) {
    const set: Record<string, string | null> = { ...entry.neutralise.set };
    if (entry.neutralise.stampNow) set[entry.neutralise.stampNow] = now;
    for (const column of entry.columns) {
      let query = supabaseAdmin
        .from(entry.table)
        .update(set)
        .eq(column, userId) as unknown as Filterable;
      for (const [k, v] of Object.entries(entry.neutralise.whereEq)) {
        query = query.eq(k, v);
      }
      const { error } = await query;
      if (error) return error.message;
    }
  }

  const { policy } = entry;
  if (policy.kind === 'delete') {
    for (const column of entry.columns) {
      const { error } = await supabaseAdmin
        .from(entry.table)
        .delete()
        .eq(column, userId);
      if (error) return error.message;
    }
  } else if (policy.kind === 'anonymise') {
    for (const column of entry.columns) {
      const { error } = await supabaseAdmin
        .from(entry.table)
        .update({ ...policy.set })
        .eq(column, userId);
      if (error) return error.message;
    }
    await purgeUnreferenced(userId, entry);
  }
  // `cascade` : la clé étrangère agit au `deleteUser`. `keep` : rien.
  return null;
}

/**
 * Applique tout le registre. Les fichiers d'abord, les lignes ensuite — les
 * lignes portent les chemins : les supprimer d'abord perdrait l'adresse des
 * fichiers à retirer.
 */
export async function erasePersonalData(
  userId: string,
  entries: readonly PersonalDataTable[] = PERSONAL_DATA_TABLES
): Promise<EraseResult> {
  const collected = await collectFilePaths(userId, entries);
  if ('table' in collected) {
    logger.error(
      `[player/erasePersonalData] lecture des fichiers de ${collected.table} impossible`,
      { userId, error: collected.message }
    );
    return { ok: false, ...collected };
  }
  const filesNotRemoved = await removeFiles(userId, collected.paths);

  const now = new Date().toISOString();
  for (const entry of entries) {
    const message = await applyEntry(userId, entry, now);
    if (message) {
      logger.error(
        `[player/erasePersonalData] ${entry.table} (${entry.policy.kind}) a échoué — compte NON supprimé`,
        { userId, error: message }
      );
      return { ok: false, table: entry.table, message };
    }
  }
  return { ok: true, filesNotRemoved };
}
