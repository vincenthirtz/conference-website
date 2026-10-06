// features/admin/recycle-bin/purge.ts — effacement DÉFINITIF d'éléments en
// corbeille : à la main (owner, DELETE /api/admin/recycle-bin) ou au-delà de
// PURGE_RETENTION_DAYS (cron /api/cron/recycle-bin-purge).
//
// Trois verrous, quel que soit l'appelant :
//   1. le type doit être dans PURGEABLE_TYPES (cf. schemas.ts : ce qui porte
//      l'historique des tournois ou l'audit n'est jamais effacé ici) ;
//   2. la ligne doit être EN CORBEILLE (`deleted_at IS NOT NULL`) — la purge
//      ne peut pas atteindre une donnée vivante, même avec un id valide ;
//   3. les tables scopées sont filtrées par `tenant_id`.
//
// Effets en cascade (FK ON DELETE), voulus :
//   - scrim_planning → scrim_planning_availabilities (CASCADE) ;
//     scrims.source_planning_id passe à NULL (SET NULL) ;
//   - task → task_checklist_items, task_comments (CASCADE) ;
//   - news → news_comments (CASCADE) : commentaires d'une actualité effacée ;
//   - partner → aucune référence.
// `adherent` a des cotisations (adherent_payments, CASCADE) qui sont des
// pièces comptables : s'il en a, il est ANONYMISÉ (données personnelles
// effacées, cotisations gardées) au lieu d'être supprimé.

import type { SupabaseClient } from '@supabase/supabase-js';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import { isMissingColumnError } from './missingColumn';
import {
  ANONYMIZED_ADHERENT_EMAIL_SUFFIX,
  type DeletedType,
  PURGE_RETENTION_DAYS,
  PURGEABLE_TYPES,
} from './schemas';

export type PurgeOutcome = 'deleted' | 'anonymized' | 'not_found';

/** Table et portée de chaque type purgeable. */
const PURGE_TABLES: Partial<
  Record<DeletedType, { table: string; scoped: boolean }>
> = {
  scrim_planning: { table: 'scrim_plannings', scoped: true },
  task: { table: 'tasks', scoped: true },
  news: { table: 'news', scoped: true },
  // Tables GLOBALES (pas de tenant_id).
  partner: { table: 'partners', scoped: false },
  adherent: { table: 'adherents', scoped: false },
};

export function isPurgeable(type: DeletedType): boolean {
  return PURGEABLE_TYPES.includes(type);
}

/** Date limite : ce qui a été supprimé AVANT est purgé par le cron. */
export function purgeCutoff(now: Date, days = PURGE_RETENTION_DAYS): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

const NOT_ANONYMIZED = `%${ANONYMIZED_ADHERENT_EMAIL_SUFFIX}`;

/** Ce qui reste d'un adhérent anonymisé : rien qui l'identifie. */
export function anonymizedAdherentPatch(id: string, nowIso: string) {
  return {
    first_name: 'Adhérent',
    last_name: 'anonymisé',
    email: `purged-${id}${ANONYMIZED_ADHERENT_EMAIL_SUFFIX}`,
    phone: null,
    address: null,
    postal_code: null,
    city: null,
    country: null,
    birth_date: null,
    notes: null,
    payment_reference: null,
    auth_user_id: null,
    is_active: false,
    updated_at: nowIso,
  };
}

type PurgeOpts = {
  /** Cron : ne purger que si `deleted_at` est antérieur à cette date. */
  deletedBefore?: string;
};

async function purgeAdherent(
  db: SupabaseClient,
  id: string,
  opts: PurgeOpts
): Promise<{ outcome: PurgeOutcome; error: unknown }> {
  let find = db
    .from('adherents')
    .select('id')
    .eq('id', id)
    .not('deleted_at', 'is', null)
    .not('email', 'like', NOT_ANONYMIZED);
  if (opts.deletedBefore) find = find.lt('deleted_at', opts.deletedBefore);
  const { data: row, error: findError } = await find.maybeSingle();
  if (findError) return { outcome: 'not_found', error: findError };
  if (!row) return { outcome: 'not_found', error: null };

  const { count, error: payError } = await db
    .from('adherent_payments')
    .select('id', { count: 'exact', head: true })
    .eq('adherent_id', id);
  if (payError) return { outcome: 'not_found', error: payError };

  if ((count ?? 0) > 0) {
    const { data, error } = await db
      .from('adherents')
      .update(anonymizedAdherentPatch(id, new Date().toISOString()))
      .eq('id', id)
      .not('deleted_at', 'is', null)
      .select('id');
    if (error) return { outcome: 'not_found', error };
    return {
      outcome: (data ?? []).length > 0 ? 'anonymized' : 'not_found',
      error: null,
    };
  }

  const { data, error } = await db
    .from('adherents')
    .delete()
    .eq('id', id)
    .not('deleted_at', 'is', null)
    .select('id');
  if (error) return { outcome: 'not_found', error };
  return {
    outcome: (data ?? []).length > 0 ? 'deleted' : 'not_found',
    error: null,
  };
}

/**
 * Efface définitivement UN élément en corbeille. `not_found` : absent, pas en
 * corbeille, hors de l'espace, ou (cron) supprimé trop récemment.
 */
export async function purgeDeleted(
  db: SupabaseClient,
  tenantId: string | null,
  type: DeletedType,
  id: string,
  opts: PurgeOpts = {}
): Promise<{ outcome: PurgeOutcome; error: unknown }> {
  const spec = PURGE_TABLES[type];
  if (!spec || !isPurgeable(type)) {
    return { outcome: 'not_found', error: new Error(`not purgeable: ${type}`) };
  }
  if (type === 'adherent') return purgeAdherent(db, id, opts);
  if (spec.scoped && !tenantId) {
    // Sans espace, le filtre tenant sauterait : on refuse.
    return { outcome: 'not_found', error: new Error('tenant required') };
  }

  let q = db
    .from(spec.table)
    .delete()
    .eq('id', id)
    .not('deleted_at', 'is', null);
  if (spec.scoped) q = q.eq('tenant_id', tenantId as string);
  if (opts.deletedBefore) q = q.lt('deleted_at', opts.deletedBefore);
  const { data, error } = await q.select('id');
  if (error) {
    // `news.deleted_at` absente (migration non appliquée) : rien en corbeille.
    if (type === 'news' && isMissingColumnError(error, 'deleted_at')) {
      return { outcome: 'not_found', error: null };
    }
    return { outcome: 'not_found', error };
  }
  return {
    outcome: (data ?? []).length > 0 ? 'deleted' : 'not_found',
    error: null,
  };
}

/* ------------------------------------------------------------------------
 * Balayage automatique (cron)
 * --------------------------------------------------------------------- */

/** Bornes par passage : un balayage quotidien rattrape le reste le lendemain. */
export const PURGE_BATCH_PER_TYPE = 200;

type Candidate = { id: string; tenant_id: string | null };

/** Le sous-ensemble du query builder dont le balayage a besoin. */
type LooseQuery = PromiseLike<{ data: unknown; error: unknown }> & {
  select(columns: string): LooseQuery;
  not(column: string, op: string, value: unknown): LooseQuery;
  lt(column: string, value: string): LooseQuery;
  order(column: string, opts: { ascending: boolean }): LooseQuery;
  limit(n: number): LooseQuery;
};

async function listCandidates(
  db: SupabaseClient,
  type: DeletedType,
  cutoff: string,
  limit: number
): Promise<{ rows: Candidate[]; error: unknown }> {
  const spec = PURGE_TABLES[type];
  if (!spec) return { rows: [], error: null };
  // Table choisie par manifeste : chaîne non typée (le typage générique de
  // PostgREST sur un nom de table dynamique dépasse la profondeur de tsc).
  let q = (db as unknown as { from: (t: string) => LooseQuery })
    .from(spec.table)
    .select(spec.scoped ? 'id, tenant_id' : 'id')
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff);
  if (type === 'adherent') q = q.not('email', 'like', NOT_ANONYMIZED);
  const { data, error } = await q
    .order('deleted_at', { ascending: true })
    .limit(limit);
  if (error) {
    if (type === 'news' && isMissingColumnError(error, 'deleted_at')) {
      return { rows: [], error: null };
    }
    return { rows: [], error };
  }
  const rows = ((data ?? []) as unknown as Array<Partial<Candidate>>).map(
    (r) => ({ id: String(r.id), tenant_id: r.tenant_id ?? null })
  );
  return { rows, error: null };
}

export type PurgeTypeReport = {
  candidates: number;
  deleted: number;
  anonymized: number;
  failed: number;
  error?: string;
};

export type PurgeReport = {
  cutoff: string;
  retention_days: number;
  types: Partial<Record<DeletedType, PurgeTypeReport>>;
};

/**
 * Purge tout ce qui dort en corbeille depuis plus de `retentionDays`. Chaque
 * effacement est journalisé (`purge_deleted_item`, `staff_id` NULL,
 * `payload.automatic`) dans l'espace de l'élément — sans nom ni e-mail : le
 * journal n'a pas à garder la donnée personnelle qu'on vient d'effacer.
 */
export async function runRecycleBinPurge(
  db: SupabaseClient,
  now: Date = new Date(),
  retentionDays = PURGE_RETENTION_DAYS
): Promise<PurgeReport> {
  const cutoff = purgeCutoff(now, retentionDays);
  const report: PurgeReport = {
    cutoff,
    retention_days: retentionDays,
    types: {},
  };

  for (const type of PURGEABLE_TYPES) {
    const r: PurgeTypeReport = {
      candidates: 0,
      deleted: 0,
      anonymized: 0,
      failed: 0,
    };
    report.types[type] = r;

    const { rows, error } = await listCandidates(
      db,
      type,
      cutoff,
      PURGE_BATCH_PER_TYPE
    );
    if (error) {
      logger.error('[recycle-bin/purge] %s candidates error', type, error);
      r.error = 'list_failed';
      continue;
    }
    r.candidates = rows.length;

    for (const row of rows) {
      const { outcome, error: purgeError } = await purgeDeleted(
        db,
        row.tenant_id,
        type,
        row.id,
        { deletedBefore: cutoff }
      );
      if (purgeError) {
        r.failed += 1;
        logger.warn(
          '[recycle-bin/purge] %s %s failed',
          type,
          row.id,
          purgeError
        );
        continue;
      }
      if (outcome === 'not_found') continue; // restauré entre-temps
      if (outcome === 'deleted') r.deleted += 1;
      else r.anonymized += 1;

      await logStaffAction({
        staff_id: null,
        action: 'purge_deleted_item',
        entity_type: type,
        entity_id: row.id,
        tenant_id: row.tenant_id,
        payload: {
          automatic: true,
          type,
          mode: outcome,
          retention_days: retentionDays,
        },
      }).catch((err) => logger.warn('[recycle-bin/purge] log error', err));
    }
  }

  return report;
}
