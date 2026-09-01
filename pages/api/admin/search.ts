// pages/api/admin/search.ts
//
// Recherche transverse de l'espace admin — lot A4 de docs/PLAN-espace-admin.md.
//
// 125 pages, et aucune recherche : pour retrouver une équipe, une joueuse, un
// match ou un ticket, le staff passait par la barre de navigation puis par le
// filtre local de chaque liste. Un soir de journée, retrouver « l'équipe X »
// prenait trois écrans.
//
// Deux règles portent ce fichier :
//
//   1. UN RÉSULTAT N'APPARAÎT JAMAIS SI L'APPELANT NE PEUT PAS L'OUVRIR. Les
//      sections sont filtrées par permission (lot A2) AVANT la requête : une
//      recherche qui liste ce qu'on ne peut pas ouvrir est au mieux frustrante,
//      au pire une fuite d'information.
//   2. Chaque section est bornée (5 résultats) et scopée au tenant actif. La
//      palette sert à ATTEINDRE quelque chose qu'on a en tête, pas à explorer.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import {
  roleHasStaffPermission,
  type StaffPermission,
} from '@/utils/staffPermissions';
import { logger } from '@/utils/logger';

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

// Garde = « être du staff », le rang le plus bas. Ce n'est PAS un relâchement :
// aucune section n'est renvoyée sans la permission correspondante (voir plus
// bas), et la palette doit rester ouvrable par un caster comme par un bénévole,
// chacun n'y voyant que ce qu'il peut ouvrir.
export default withStaffRoute(handler, 'helper');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AdminSearchPayload | { error: string }>,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 120, windowMs: 60_000 }, 'admin-search')
  ) {
    return;
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database unavailable' });
  }

  const raw = req.query.q;
  const q = (Array.isArray(raw) ? raw[0] : (raw ?? '')).trim();
  if (q.length < MIN_QUERY) return res.status(200).json({ hits: [] });

  const pattern = `%${escapeLike(q)}%`;
  const tenantId = ctx.tenantId;
  const can = (p: StaffPermission) => roleHasStaffPermission(ctx.role, p);

  const jobs: Promise<SearchHit[]>[] = [];

  // `Promise.resolve(...)` autour de chaque requête : un builder Supabase est
  // un THENABLE, pas une Promise — `Promise.allSettled` s'en accommode, mais le
  // typage strict, non.

  if (can('manage_teams')) {
    jobs.push(
      Promise.resolve(
        supabaseAdmin
          .from('teams')
          .select('id, name, short_name, slug')
          .eq('tenant_id', tenantId)
          .ilike('name', pattern)
          .limit(PER_KIND)
          .then(({ data, error }) => {
            if (error) throw error;
            return ((data ?? []) as Record<string, unknown>[]).map((t) => ({
              kind: 'team' as const,
              id: t.id as string,
              title: (t.name as string) ?? '',
              subtitle: (t.short_name as string | null) ?? null,
              href: `/admin/teams/${t.id as string}/edit`,
            }));
          })
      )
    );
  }

  if (can('manage_tournaments')) {
    jobs.push(
      Promise.resolve(
        supabaseAdmin
          .from('tournaments')
          .select('id, name, slug, status')
          .eq('tenant_id', tenantId)
          .ilike('name', pattern)
          .limit(PER_KIND)
          .then(({ data, error }) => {
            if (error) throw error;
            return ((data ?? []) as Record<string, unknown>[]).map((t) => ({
              kind: 'tournament' as const,
              id: t.id as string,
              title: (t.name as string) ?? '',
              subtitle: (t.status as string | null) ?? null,
              href: `/admin/tournament/${t.id as string}/dashboard`,
            }));
          })
      )
    );
  }

  // Les matchs se cherchent par ROUND (« J3 ») : personne ne connaît l'UUID
  // d'un match, et le nom des équipes vit dans une autre table — chercher
  // dessus demanderait une jointure que PostgREST ne filtre pas simplement.
  if (can('arbitrate_matches')) {
    jobs.push(
      Promise.resolve(
        supabaseAdmin
          .from('matches')
          .select('id, round_name, scheduled_at, status')
          .eq('tenant_id', tenantId)
          .ilike('round_name', pattern)
          .order('scheduled_at', { ascending: false })
          .limit(PER_KIND)
          .then(({ data, error }) => {
            if (error) throw error;
            return ((data ?? []) as Record<string, unknown>[]).map((m) => ({
              kind: 'match' as const,
              id: m.id as string,
              title: (m.round_name as string) ?? 'Match',
              subtitle: (m.scheduled_at as string | null) ?? null,
              href: `/admin/matches/${m.id as string}`,
            }));
          })
      )
    );
  }

  if (can('moderate_support')) {
    jobs.push(
      Promise.resolve(
        supabaseAdmin
          .from('support_tickets')
          .select('id, subject, status')
          .eq('tenant_id', tenantId)
          .ilike('subject', pattern)
          .limit(PER_KIND)
          .then(({ data, error }) => {
            if (error) throw error;
            return ((data ?? []) as Record<string, unknown>[]).map((t) => ({
              kind: 'ticket' as const,
              id: t.id as string,
              title: (t.subject as string) ?? '',
              subtitle: (t.status as string | null) ?? null,
              href: `/admin/moderation?tab=support&ticket=${t.id as string}`,
            }));
          })
      )
    );
  }

  // Le Kanban exige la MÊME permission que sa page (`manage_tasks`) : une
  // recherche qui remonte ce qu'on ne peut pas ouvrir est le défaut que ce
  // filtrage existe pour éviter.
  if (can('manage_tasks')) {
    jobs.push(
      Promise.resolve(
        supabaseAdmin
          .from('tasks')
          .select('id, title, board_id, status')
          .eq('tenant_id', tenantId)
          .ilike('title', pattern)
          .limit(PER_KIND)
          .then(({ data, error }) => {
            if (error) throw error;
            return ((data ?? []) as Record<string, unknown>[]).map((t) => ({
              kind: 'task' as const,
              id: t.id as string,
              title: (t.title as string) ?? '',
              subtitle: (t.status as string | null) ?? null,
              href: `/admin/tasks?task=${t.id as string}`,
            }));
          })
      )
    );
  }

  const settled = await Promise.allSettled(jobs);
  const hits: SearchHit[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') hits.push(...r.value);
    else logger.error('[admin/search] section error:', r.reason);
    // Une section en erreur n'annule pas les autres : mieux vaut trois
    // familles de résultats sur quatre qu'une page de recherche cassée.
  }

  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({ hits });
}
