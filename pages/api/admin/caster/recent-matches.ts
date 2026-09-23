// pages/api/admin/caster/recent-matches.ts
//
// LES DERNIERS MATCHS TERMINÉS, pour que la régie rattache son scrutin MVP à
// l'un d'eux.
//
// POURQUOI UN ENDPOINT DE PLUS ALORS QUE `/api/admin/matches/search` EXISTE.
// Parce qu'il est fermé au caster. Cette route-là est gardée par la permission
// `arbitrate_matches`, et un caster n'en a qu'une seule : `use_cast_cockpit`
// (cf. `utils/staffPermissions.ts` — « le caster garde EXACTEMENT ce qu'il
// avait »). Les personnes qui tiennent réellement la régie auraient donc reçu
// un 403 sur le sélecteur de match, c'est-à-dire sur la seule chose qui
// transforme `!mvp 3` en une voix pour une joueuse identifiée.
//
// Élargir `arbitrate_matches` au caster aurait été le raccourci — et un
// élargissement de droits fait en passant, pour un menu déroulant. On préfère
// une route étroite : lecture seule, matchs TERMINÉS uniquement, rien d'autre
// que de quoi remplir une liste.
//
// PAS DE PAGINATION, VOLONTAIREMENT. On répond au besoin réel : « quel match
// vient de finir ? ». Vingt-cinq lignes couvrent une soirée entière ; au-delà,
// ce n'est plus un choix de régie, c'est de l'archive.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logger } from '@/utils/logger';

const LIMIT = 25;

export type CasterRecentMatch = {
  id: string;
  roundName: string | null;
  team1Name: string | null;
  team2Name: string | null;
  completedAt: string | null;
};

export default withStaffRoute(handler, 'caster');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { data: matches, error } = await supabaseAdmin
    .from('matches')
    .select(
      'id, round_name, team1_id, team2_id, completed_at, is_bye, forfeit_team_id'
    )
    .eq('tenant_id', ctx.tenantId)
    .eq('status', 'finished')
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(LIMIT);

  if (error) {
    logger.error('[caster/recent-matches] error:', error);
    return res.status(500).json({ error: 'Lecture impossible' });
  }

  const rows = matches ?? [];

  // Forfaits et byes écartés : il n'y a pas eu de partie, donc personne à
  // élire. Le laisser dans la liste ne produirait qu'un 409 au clic — même
  // règle que l'ouverture du vote des équipes.
  const jouables = rows.filter((m) => !m.is_bye && !m.forfeit_team_id);

  const teamIds = Array.from(
    new Set(jouables.flatMap((m) => [m.team1_id, m.team2_id]).filter(Boolean))
  ) as string[];

  const noms = new Map<string, string>();
  if (teamIds.length > 0) {
    const { data: teams } = await supabaseAdmin
      .from('teams')
      .select('id, name')
      .eq('tenant_id', ctx.tenantId)
      .in('id', teamIds);
    for (const t of teams ?? []) noms.set(t.id as string, t.name as string);
  }

  const out: CasterRecentMatch[] = jouables.map((m) => ({
    id: m.id as string,
    roundName: (m.round_name as string | null) ?? null,
    team1Name: m.team1_id ? (noms.get(m.team1_id as string) ?? null) : null,
    team2Name: m.team2_id ? (noms.get(m.team2_id as string) ?? null) : null,
    completedAt: (m.completed_at as string | null) ?? null,
  }));

  return res.status(200).json({ matches: out });
}
