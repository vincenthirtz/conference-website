// pages/api/admin/tcg/players.ts
//
// GET /api/admin/tcg/players?q=… — trouver le compte d'une joueuse pour
// corriger son solde de pièces.
//
// POURQUOI UNE ROUTE À PART, ET NON `/api/admin/users/search`. Cette dernière est
// gardée par `manage_staff` : c'est l'outil de gestion des comptes. Le staff qui
// corrige un solde (`manage_tcg`) n'a aucune raison de recevoir le pouvoir de
// promouvoir quelqu'un au staff pour pouvoir… trouver une joueuse. Avant cette
// route, la carte « Ajuster un solde » lui demandait de coller un uuid lu dans
// l'adresse d'une fiche.
//
// MÊME RECHERCHE, MOINS DE CHAMPS. On réutilise la RPC `admin_search_users`
// (email / pseudo / BattleTag, jointure équipe) plutôt que d'en réécrire une ;
// on ne rend que ce qu'il faut pour DISTINGUER deux homonymes avant de créditer
// la mauvaise personne : pseudo, BattleTag, équipe, email. L'email est déjà
// montré au même droit par la file de relecture des photos.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';

/** Même forme que `/api/admin/users/search` : le sélecteur lit l'une ou l'autre. */
export type TcgPlayerSearchRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  battle_tag: string | null;
  team_name: string | null;
};

type Response = { players: TcgPlayerSearchRow[] } | { error: string };

const MIN_CHARS = 2;
const MAX_CHARS = 100;
/** Une liste déroulante, pas un export : au-delà, il faut préciser la saisie. */
const MAX_RESULTS = 20;

async function handler(req: NextApiRequest, res: NextApiResponse<Response>) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // Une frappe = une requête (débounce 250 ms côté client) : le plafond borne
  // un usage anormal, pas la saisie d'un nom.
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-tcg-players')
  )
    return;
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }

  const raw = req.query.q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
  if (query.length < MIN_CHARS || query.length > MAX_CHARS) {
    return res.status(400).json({
      error: `La recherche doit faire entre ${MIN_CHARS} et ${MAX_CHARS} caractères.`,
    });
  }

  const { data, error } = await supabaseAdmin.rpc('admin_search_users', {
    p_query: query,
  });
  if (error) {
    // Une recherche en échec n'est PAS « personne trouvée » : un 500 laisse le
    // sélecteur dire « recherche indisponible » au lieu de « aucun résultat ».
    logger.error('[admin/tcg/players] recherche impossible: %s', error.message);
    return res.status(500).json({ error: 'Recherche impossible.' });
  }

  const players = ((data as Array<Record<string, unknown>> | null) ?? [])
    .filter((row) => typeof row.id === 'string')
    .slice(0, MAX_RESULTS)
    .map((row) => ({
      id: row.id as string,
      email: typeof row.email === 'string' ? row.email : null,
      display_name:
        typeof row.display_name === 'string' ? row.display_name : null,
      battle_tag: typeof row.battle_tag === 'string' ? row.battle_tag : null,
      team_name: typeof row.team_name === 'string' ? row.team_name : null,
    }));

  return res.status(200).json({ players });
}

export default withStaffRoute(handler, { permission: 'manage_tcg' });
