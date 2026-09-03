// utils/publicData/tournaments.ts
//
// Chargement de la liste publique des tournois, POUR UN ESPACE.
//
// La requête vivait en double : dans `pages/tournaments.tsx` (espace
// historique, statique) et dans `pages/[tenantSlug]/tournois.tsx`. Deux copies
// d'un filtre `tenant_id`, c'est une occasion d'en oublier un — et un filtre
// oublié n'échoue pas : il affiche les tournois de quelqu'un d'autre.

import type { Tournament } from '@/components/Tournaments/TournamentsList';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

export type PublicTournamentsResult = {
  tournaments: Tournament[];
  /**
   * Distingue une panne (base indisponible / requête en erreur) d'une liste
   * légitimement vide. Sans lui, une panne afficherait « Aucun tournoi » —
   * message faux, et rassurant au mauvais moment.
   */
  loadError: boolean;
};

const SELECT = `
      id,
      name,
      slug,
      short_name,
      game,
      status,
      format,
      start_date,
      end_date,
      max_teams
    `;

export async function loadPublicTournaments(
  tenantId: string
): Promise<PublicTournamentsResult> {
  if (!supabaseAdmin) return { tournaments: [], loadError: true };

  const { data, error } = await supabaseAdmin
    .from('tournaments')
    .select(SELECT)
    .eq('tenant_id', tenantId)
    .in('status', ['published', 'running', 'completed'])
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[publicData/tournaments] fetch error', { tenantId, error });
    return { tournaments: [], loadError: true };
  }

  return { tournaments: (data || []) as Tournament[], loadError: false };
}
