// utils/player/exportPersonalData.ts
//
// Lit le registre RGPD (`personalDataTables.ts`) pour l'export du droit
// d'accès. Une section par table exportée, qui dit AUSSI ce que la suppression
// du compte fera de ces lignes : l'export est le seul endroit où la joueuse
// peut vérifier la promesse avant de supprimer.
//
// TROIS CHOIX :
//   - tous les tenants, comme la suppression : on n'exporte pas moins que ce
//     qu'on efface ;
//   - colonnes explicites, jamais `*` : un secret ajouté plus tard à une table
//     n'entre pas dans l'export sans qu'on l'ait décidé ;
//   - une table illisible NE FAIT PAS échouer l'export : la section le dit
//     (`error: true`) et le reste part. Un seul nom de colonne erroné rendait
//     auparavant TOUT l'export impossible.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import {
  PERSONAL_DATA_TABLES,
  type PersonalDataTable,
} from '@/utils/player/personalDataTables';

export type PersonalDataSection = {
  /** Ce que la suppression du compte fera de ces lignes. */
  on_account_deletion: PersonalDataTable['policy']['kind'];
  why: string;
  note?: string;
  rows: Record<string, unknown>[];
  /** Présent si la table n'a pas pu être lue : l'export est alors incomplet. */
  error?: true;
};

export type PersonalDataExportResult = {
  tables: Record<string, PersonalDataSection>;
  /** Tables du registre non exportées, et pourquoi. */
  not_exported: Record<string, string>;
};

/** Clé de dédoublonnage : une ligne trouvée par deux colonnes n'apparaît qu'une fois. */
function rowKey(row: Record<string, unknown>): string {
  return typeof row.id === 'string' ? row.id : JSON.stringify(row);
}

async function readSection(
  userId: string,
  entry: PersonalDataTable
): Promise<PersonalDataSection | null> {
  if ('omit' in entry.export) return null;
  const { columns, embeds, note } = entry.export;
  const select = [...columns, ...(embeds ?? [])].join(', ');

  const section: PersonalDataSection = {
    on_account_deletion: entry.policy.kind,
    why: entry.why,
    ...(note ? { note } : {}),
    rows: [],
  };
  const seen = new Set<string>();

  // Une requête PAR colonne plutôt qu'un `.or()` : l'id n'est jamais
  // interpolé dans une expression de filtre.
  for (const column of entry.columns) {
    const { data, error } = await supabaseAdmin
      .from(entry.table)
      .select(select)
      .eq(column, userId);
    if (error) {
      logger.error(
        `[player/exportPersonalData] ${entry.table}.${column} illisible`,
        { userId, error: error.message }
      );
      section.error = true;
      continue;
    }
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      const key = rowKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      section.rows.push(row);
    }
  }
  return section;
}

export async function exportPersonalData(
  userId: string,
  entries: readonly PersonalDataTable[] = PERSONAL_DATA_TABLES
): Promise<PersonalDataExportResult> {
  const sections = await Promise.all(
    entries.map(
      async (entry) => [entry, await readSection(userId, entry)] as const
    )
  );

  const result: PersonalDataExportResult = { tables: {}, not_exported: {} };
  for (const [entry, section] of sections) {
    if (section) result.tables[entry.table] = section;
    else if ('omit' in entry.export) {
      result.not_exported[entry.table] = entry.export.omit;
    }
  }
  return result;
}
