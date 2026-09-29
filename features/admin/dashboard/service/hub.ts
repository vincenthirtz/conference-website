// features/admin/dashboard/service/hub.ts — KPI du hub (/admin) et recherche
// transverse (palette de commandes).

import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  roleHasStaffPermission,
  type StaffPermission,
} from '@/utils/staffPermissions';
import type { StaffRole } from '@/types/admin';

/* ------------------------------ KPI du hub --------------------------------- */

export type OverviewSummary = {
  tournamentsActive: number | null;
  teams: number | null;
  demandesPending: number | null;
  supportOpen: number | null;
  supportHigh: number | null;
  disputesOpen: number | null;
};

/**
 * Count-only → `number | null` : rejet ou erreur PostgREST → `null`
 * (« inconnu », distinct de zéro côté hub), sinon `count` (0 si absent).
 */
function resolveCount(
  ctx: ServiceContext,
  result: PromiseSettledResult<{ count: number | null; error: unknown }>,
  label: string
): number | null {
  if (result.status !== 'fulfilled') {
    ctx.logger.error(
      `[admin/overview-summary] ${label} rejected:`,
      result.reason
    );
    return null;
  }
  if (result.value.error) {
    ctx.logger.error(
      `[admin/overview-summary] ${label} error:`,
      result.value.error
    );
    return null;
  }
  return result.value.count ?? 0;
}

/**
 * Six comptes count-only (head:true) en parallèle, TOUS scopés par tenant
 * (support compris). Un compte en échec rend `null` pour SA clé seulement.
 */
export async function getOverviewSummary(
  ctx: ServiceContext
): Promise<OverviewSummary> {
  const { db, tenantId } = ctx;
  const head = { count: 'exact', head: true } as const;
  const [tournaments, teams, demandes, supportOpen, supportHigh, disputes] =
    await Promise.allSettled([
      db
        .from('tournaments')
        .select('id', head)
        .eq('tenant_id', tenantId)
        .eq('status', 'running'),
      db.from('teams').select('id', head).eq('tenant_id', tenantId),
      db
        .from('demandes')
        .select('id', head)
        .eq('tenant_id', tenantId)
        .eq('status', 'pending'),
      db
        .from('support_tickets')
        .select('id', head)
        .eq('tenant_id', tenantId)
        .eq('status', 'open'),
      // Réplique /api/admin/support/tickets : severity=high, ni résolu ni fermé.
      db
        .from('support_tickets')
        .select('id', head)
        .eq('tenant_id', tenantId)
        .eq('severity', 'high')
        .neq('status', 'resolved')
        .neq('status', 'closed'),
      // Litiges ouverts = matches `disputed` (board /api/admin/disputes).
      db
        .from('matches')
        .select('id', head)
        .eq('tenant_id', tenantId)
        .eq('status', 'disputed'),
    ]);

  return {
    tournamentsActive: resolveCount(ctx, tournaments, 'tournamentsActive'),
    teams: resolveCount(ctx, teams, 'teams'),
    demandesPending: resolveCount(ctx, demandes, 'demandesPending'),
    supportOpen: resolveCount(ctx, supportOpen, 'supportOpen'),
    supportHigh: resolveCount(ctx, supportHigh, 'supportHigh'),
    disputesOpen: resolveCount(ctx, disputes, 'disputesOpen'),
  };
}

/* --------------------------- Recherche transverse -------------------------- */

export type SearchKind = 'team' | 'tournament' | 'match' | 'ticket' | 'task';

export type SearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

export type AdminSearchPayload = { hits: SearchHit[] };

const PER_KIND = 5;
const MIN_QUERY = 2;

/** Échappe les jokers PostgREST d'un `ilike` (`%` et `_`). */
function escapeLike(raw: string): string {
  return raw.replace(/[%_]/g, (c) => `\\${c}`);
}

type Row = Record<string, unknown>;

function rowsOf({ data, error }: { data: unknown; error: unknown }): Row[] {
  if (error) throw error;
  return (data ?? []) as Row[];
}

/**
 * UN RÉSULTAT N'APPARAÎT JAMAIS SI L'APPELANT NE PEUT PAS L'OUVRIR : les
 * sections sont filtrées par permission AVANT la requête. Chaque section est
 * bornée (5) et scopée au tenant actif ; une section en erreur n'annule pas
 * les autres.
 */
export async function searchAdmin(
  ctx: ServiceContext,
  role: StaffRole,
  rawQ: unknown
): Promise<AdminSearchPayload> {
  const q = ((Array.isArray(rawQ) ? rawQ[0] : (rawQ ?? '')) as string).trim();
  if (q.length < MIN_QUERY) return { hits: [] };

  const pattern = `%${escapeLike(q)}%`;
  const { db, tenantId } = ctx;
  const can = (p: StaffPermission) => roleHasStaffPermission(role, p);
  const jobs: Promise<SearchHit[]>[] = [];

  // `Promise.resolve(...)` : un builder Supabase est un THENABLE, pas une
  // Promise — le typage strict de `allSettled` l'exige.
  if (can('manage_teams')) {
    jobs.push(
      Promise.resolve(
        db
          .from('teams')
          .select('id, name, short_name, slug')
          .eq('tenant_id', tenantId)
          .ilike('name', pattern)
          .limit(PER_KIND)
          .then((r) =>
            rowsOf(r).map((t) => ({
              kind: 'team' as const,
              id: t.id as string,
              title: (t.name as string) ?? '',
              subtitle: (t.short_name as string | null) ?? null,
              href: `/admin/teams/${t.id as string}/edit`,
            }))
          )
      )
    );
  }

  if (can('manage_tournaments')) {
    jobs.push(
      Promise.resolve(
        db
          .from('tournaments')
          .select('id, name, slug, status')
          .eq('tenant_id', tenantId)
          .ilike('name', pattern)
          .limit(PER_KIND)
          .then((r) =>
            rowsOf(r).map((t) => ({
              kind: 'tournament' as const,
              id: t.id as string,
              title: (t.name as string) ?? '',
              // Comportement historique conservé : `column` n'est pas lu par
              // cette requête, le sous-titre vaut donc toujours `null`.
              subtitle:
                ((t.column as { name?: string } | null)?.name as
                  | string
                  | undefined) ?? null,
              href: `/admin/tournament/${t.id as string}/dashboard`,
            }))
          )
      )
    );
  }

  // Les matchs se cherchent par ROUND (« J3 ») : le nom des équipes vit dans
  // une autre table, que PostgREST ne filtre pas simplement.
  if (can('arbitrate_matches')) {
    jobs.push(
      Promise.resolve(
        db
          .from('matches')
          .select('id, round_name, scheduled_at, status')
          .eq('tenant_id', tenantId)
          .ilike('round_name', pattern)
          .order('scheduled_at', { ascending: false })
          .limit(PER_KIND)
          .then((r) =>
            rowsOf(r).map((m) => ({
              kind: 'match' as const,
              id: m.id as string,
              title: (m.round_name as string) ?? 'Match',
              subtitle: (m.scheduled_at as string | null) ?? null,
              href: `/admin/matches/${m.id as string}`,
            }))
          )
      )
    );
  }

  if (can('moderate_support')) {
    jobs.push(
      Promise.resolve(
        db
          .from('support_tickets')
          .select('id, subject, status')
          .eq('tenant_id', tenantId)
          .ilike('subject', pattern)
          .limit(PER_KIND)
          .then((r) =>
            rowsOf(r).map((t) => ({
              kind: 'ticket' as const,
              id: t.id as string,
              title: (t.subject as string) ?? '',
              subtitle: (t.status as string | null) ?? null,
              href: `/admin/moderation?tab=support&ticket=${t.id as string}`,
            }))
          )
      )
    );
  }

  // Le Kanban exige la MÊME permission que sa page (`manage_tasks`).
  if (can('manage_tasks')) {
    jobs.push(
      Promise.resolve(
        db
          .from('tasks')
          // Pas de colonne `status` : le statut d'une carte EST sa colonne.
          .select('id, title, board_id, column:task_columns(name)')
          .eq('tenant_id', tenantId)
          .ilike('title', pattern)
          .limit(PER_KIND)
          .then((r) =>
            rowsOf(r).map((t) => ({
              kind: 'task' as const,
              id: t.id as string,
              title: (t.title as string) ?? '',
              // Comportement historique conservé : `status` n'est pas lu,
              // le sous-titre vaut donc toujours `null`.
              subtitle: (t.status as string | null) ?? null,
              href: `/admin/tasks?task=${t.id as string}`,
            }))
          )
      )
    );
  }

  const settled = await Promise.allSettled(jobs);
  const hits: SearchHit[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') hits.push(...r.value);
    else ctx.logger.error('[admin/search] section error:', r.reason);
  }
  return { hits };
}
