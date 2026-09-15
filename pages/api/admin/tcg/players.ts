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
// CANTONNÉE À L'ESPACE (correctif du 2026-09-15). La route réutilisait la RPC
// GLOBALE `admin_search_users` : `manage_tcg` appartenant à tout owner d'espace
// — y compris un espace développeur créé en libre-service — n'importe qui
// obtenait email, BattleTag et équipe de TOUS les comptes de la plateforme.
// Elle appelle désormais `admin_search_tcg_players(tenant, q)`
// (migration `tcg_admin_search_players_scoped.sql`), qui ne considère que les
// comptes RATTACHÉS au tenant du staff — roster du tenant, ou gain réel à son
// registre (cf. `utils/tcg/tenantAttachment.ts`) — et filtre EN BASE, avant
// qu'une ligne ne sorte. Filtrer ici le résultat de la RPC globale aurait laissé
// sa limite de candidats s'appliquer avant le filtre, et fait transiter les
// données d'autrui par ce serveur.
//
// PLUS D'EMAIL. Pseudo, BattleTag et équipe (de cet espace) suffisent à
// distinguer deux homonymes avant de créditer ; l'email n'est ni rendu ni
// cherché (sinon il servirait d'oracle « cet email a-t-il un compte ici ? »).
// Le champ `email` reste dans la forme de réponse, toujours `null`, pour les
// sélecteurs qui lisent aussi `/api/admin/users/search`.
//
// MIGRATION ABSENTE : 503 `SEARCH_UNAVAILABLE`, JAMAIS de repli sur la RPC
// globale — une recherche indisponible vaut mieux qu'une fuite.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';
import { isMissingRpc } from '@/utils/tcg/walletRpc';

/** Même forme que `/api/admin/users/search` : le sélecteur lit l'une ou l'autre. */
export type TcgPlayerSearchRow = {
  id: string;
  /** Toujours `null` ici : cf. l'en-tête. */
  email: null;
  display_name: string | null;
  battle_tag: string | null;
  team_name: string | null;
};

type Response =
  | { players: TcgPlayerSearchRow[] }
  | { error: string; code?: string };

const MIN_CHARS = 2;
const MAX_CHARS = 100;
/** Une liste déroulante, pas un export : au-delà, il faut préciser la saisie. */
const MAX_RESULTS = 20;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Response>,
  ctx: AuthenticatedStaffContext
) {
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

  const tenantId = ctx.tenantId;
  if (!tenantId) {
    return res.status(400).json({ error: 'Espace non résolu.' });
  }
  res.setHeader('Cache-Control', 'private, no-store');

  const { data, error } = await supabaseAdmin.rpc('admin_search_tcg_players', {
    p_tenant_id: tenantId,
    p_query: query,
  });
  if (error) {
    if (isMissingRpc(error)) {
      logger.error(
        '[admin/tcg/players] admin_search_tcg_players absente (migration tcg_admin_search_players_scoped.sql)'
      );
      return res.status(503).json({
        error: 'Recherche momentanément indisponible.',
        code: 'SEARCH_UNAVAILABLE',
      });
    }
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
      // Jamais rendu, même si une fonction SQL future le renvoyait (cf. l'en-tête).
      email: null,
      display_name:
        typeof row.display_name === 'string' ? row.display_name : null,
      battle_tag: typeof row.battle_tag === 'string' ? row.battle_tag : null,
      team_name: typeof row.team_name === 'string' ? row.team_name : null,
    }));

  return res.status(200).json({ players });
}

export default withStaffRoute(handler, { permission: 'manage_tcg' });
