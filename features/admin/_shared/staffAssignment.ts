// features/admin/_shared/staffAssignment.ts — « Je prends » / « Libérer » sur
// une file de traitement (demandes, tickets support).
//
// Colonnes `assigned_staff_id` (FK staff.id) + `assigned_at`, ajoutées par
// database/migrations/add_staff_assignment_to_demandes_and_support_tickets.sql.
// TANT QUE LA MIGRATION N'EST PAS APPLIQUÉE : les listes se lisent sans ces
// colonnes (`withAssignmentFallback`) et l'assignation répond 503 — rien ne
// casse, la fonctionnalité est simplement absente.
//
// Règles :
//  - prendre un dossier libre, ou déjà à soi (no-op) ; un dossier pris par
//    quelqu'un d'autre → 409 nommant la personne (pas de vol silencieux).
//    L'écriture est CONDITIONNELLE (`assigned_staff_id IS NULL`) : deux
//    « Je prends » simultanés ne peuvent pas réussir tous les deux ;
//  - libérer : tout staff ayant accès à la file (un dossier oublié par une
//    personne absente doit pouvoir être rendu) — le journal garde qui l'avait.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  AdminError,
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
} from '@/utils/admin/errors';

export const ASSIGNMENT_ACTIONS = ['claim', 'release'] as const;
export type AssignmentAction = (typeof ASSIGNMENT_ACTIONS)[number];

/** Filtre de liste : « à moi » / « non assignées ». */
export const ASSIGNMENT_FILTERS = ['me', 'unassigned'] as const;
export type AssignmentFilter = (typeof ASSIGNMENT_FILTERS)[number];

export type AssignableTable = 'demandes' | 'support_tickets';

export type StaffBrief = { id: string; display_name: string | null };

export type AssignmentResult = {
  id: string;
  assigned_staff_id: string | null;
  assigned_at: string | null;
  assigned_to: StaffBrief | null;
};

export const ASSIGNMENT_COLUMNS = 'assigned_staff_id, assigned_at';

export const ASSIGNMENT_MIGRATION_PENDING =
  'L’assignation n’est pas encore disponible : la migration add_staff_assignment_to_demandes_and_support_tickets n’est pas appliquée.';

const PG_UNDEFINED_COLUMN = '42703';

/** Colonne inconnue : migration pas encore appliquée. */
export function isMissingColumnError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  if (e.code === PG_UNDEFINED_COLUMN) return true;
  // PostgREST remonte parfois l'erreur en message (cache de schéma).
  return (
    typeof e.message === 'string' &&
    /assigned_(staff_id|at)/.test(e.message) &&
    /(does not exist|could not find|schema cache)/i.test(e.message)
  );
}

export function parseAssignmentFilter(raw: unknown): AssignmentFilter | null {
  return typeof raw === 'string' &&
    (ASSIGNMENT_FILTERS as readonly string[]).includes(raw)
    ? (raw as AssignmentFilter)
    : null;
}

/**
 * Lit une liste AVEC les colonnes d'assignation, et se replie sans elles (ni
 * filtre d'assignation) si la migration manque. `run(true)` = avec.
 */
export async function withAssignmentFallback<
  R extends { error: unknown | null },
>(
  run: (withAssignment: boolean) => PromiseLike<R>
): Promise<R & { assignmentAvailable: boolean }> {
  const first = await run(true);
  if (!isMissingColumnError(first.error)) {
    return { ...first, assignmentAvailable: true };
  }
  const second = await run(false);
  return { ...second, assignmentAvailable: false };
}

/** Noms des staffs assignés d'une page (une requête, bornée par la page). */
export async function loadStaffBriefs(
  db: SupabaseClient<any>,
  ids: Array<string | null | undefined>
): Promise<Map<string, StaffBrief>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const map = new Map<string, StaffBrief>();
  if (unique.length === 0) return map;
  const { data } = await db
    .from('staff')
    .select('id, display_name')
    .in('id', unique);
  for (const s of (data ?? []) as StaffBrief[]) {
    map.set(s.id, { id: s.id, display_name: s.display_name ?? null });
  }
  return map;
}

function staffIdOf(ctx: ServiceContext): string {
  if (ctx.actor.kind !== 'staff') {
    throw new AdminError(403, 'forbidden', 'Accès refusé.');
  }
  return ctx.actor.staffId;
}

/**
 * Prend ou libère un dossier. Rend l'état final + l'assignation précédente
 * (pour le journal).
 */
export async function setAssignment(
  ctx: ServiceContext,
  table: AssignableTable,
  id: string,
  action: AssignmentAction
): Promise<{ before: string | null; after: AssignmentResult }> {
  const me = staffIdOf(ctx);
  // Table choisie à l'exécution (`demandes` | `support_tickets`) : client non
  // typé plutôt qu'une union de builders, le périmètre (tenant + id) reste
  // explicite.
  const db = ctx.db as unknown as SupabaseClient<any>;

  const current = await db
    .from(table)
    .select(`id, ${ASSIGNMENT_COLUMNS}`)
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id)
    .maybeSingle();
  if (current.error) {
    if (isMissingColumnError(current.error)) {
      throw new ServiceUnavailableError(ASSIGNMENT_MIGRATION_PENDING);
    }
    ctx.logger.error(`[admin/${table}/assign] read error:`, current.error);
    throw new AdminError(500, 'internal', 'Échec de la lecture');
  }
  if (!current.data) throw new NotFoundError('Introuvable.');
  const before =
    (current.data as { assigned_staff_id?: string | null }).assigned_staff_id ??
    null;

  if (action === 'claim' && before && before !== me) {
    const holder = (await loadStaffBriefs(db, [before])).get(before);
    throw new ConflictError(
      `Déjà pris en charge par ${holder?.display_name || 'un autre membre du staff'}.`,
      'already_assigned'
    );
  }

  const now = new Date().toISOString();
  // Reprendre un dossier déjà à soi ne remet pas son horloge à zéro.
  const patch: Record<string, string | null> =
    action === 'release'
      ? { assigned_staff_id: null, assigned_at: null }
      : before === me
        ? { assigned_staff_id: me }
        : { assigned_staff_id: me, assigned_at: now };

  let q = db
    .from(table)
    .update(patch)
    .eq('tenant_id', ctx.tenantId)
    .eq('id', id);
  // Garde de course : on ne prend qu'un dossier encore libre.
  if (action === 'claim' && !before) q = q.is('assigned_staff_id', null);
  const written = await q.select(`id, ${ASSIGNMENT_COLUMNS}`).maybeSingle();
  if (written.error) {
    ctx.logger.error(`[admin/${table}/assign] write error:`, written.error);
    throw new AdminError(500, 'internal', 'Échec de la mise à jour');
  }
  if (!written.data) {
    // La condition a échoué : quelqu'un a pris le dossier entre-temps.
    throw new ConflictError(
      'Ce dossier vient d’être pris par quelqu’un d’autre.',
      'already_assigned'
    );
  }

  const row = written.data as {
    id: string;
    assigned_staff_id: string | null;
    assigned_at: string | null;
  };
  const briefs = await loadStaffBriefs(db, [row.assigned_staff_id]);
  return {
    before,
    after: {
      id: row.id,
      assigned_staff_id: row.assigned_staff_id,
      assigned_at: row.assigned_at,
      assigned_to: row.assigned_staff_id
        ? (briefs.get(row.assigned_staff_id) ?? null)
        : null,
    },
  };
}
