// pages/api/public/free-players/remove.ts
//
// Retrait autonome d'une fiche « joueuse libre » publiée depuis /rejoindre.
//
// POURQUOI cette route existe : l'inscription se fait SANS COMPTE. Sans porte
// de sortie autonome, une joueuse qui trouve une équipe (ou change simplement
// d'avis) devrait écrire au staff pour disparaître d'une liste publique —
// inacceptable pour une donnée qu'elle a publiée elle-même.
//
// Preuve d'identité : un token HMAC reçu par email à l'inscription
// (utils/freePlayerRemoval.ts). Posséder le lien = avoir accès à la boîte, soit
// exactement la garantie qui a servi à créer la fiche.
//
//   GET  ?token=… — décrit la fiche visée (pour que la page de confirmation
//                   montre CE qu'on s'apprête à retirer). Ne supprime rien.
//   POST ?token=… — supprime effectivement.
//
// La séparation GET/POST n'est pas cosmétique : les clients mail et les
// antivirus « pré-visitent » les liens d'un email. Un GET destructeur ferait
// disparaître des fiches sans que personne n'ait cliqué.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { verifyFreePlayerRemovalToken } from '@/utils/freePlayerRemoval';
import { logger } from '@/utils/logger';

type Row = { id: string; display_name: string | null; source: string | null };

function readToken(req: NextApiRequest): string {
  const raw = req.method === 'GET' ? req.query.token : (req.body ?? {}).token;
  if (Array.isArray(raw)) return raw[0] ?? '';
  return typeof raw === 'string' ? raw : '';
}

/**
 * Message unique pour « token invalide » ET « fiche introuvable ». Distinguer
 * les deux transformerait la route en oracle : on pourrait tester quels ids de
 * fiche existent encore.
 */
const INVALID = 'Ce lien de retrait n’est plus valide.';

async function loadRow(id: string): Promise<Row | null> {
  const { data, error } = await supabaseAdmin
    .from('free_players')
    .select('id, display_name, source')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    logger.error('[free-players/remove] lookup error', error);
    return null;
  }
  const row = data as Row | null;
  // Un token ne vaut QUE pour une fiche d'origine web : les rows Discord
  // appartiennent au bot et se retirent en enlevant le rôle sur le serveur.
  if (!row || row.source !== 'web') return null;
  return row;
}

/** Vérifie le token puis charge la fiche. Renvoie la réponse d'erreur, ou la row. */
async function resolveRow(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<Row | null> {
  const id = verifyFreePlayerRemovalToken(readToken(req));
  if (!id) {
    res.status(400).json({ error: INVALID, code: 'INVALID_TOKEN' });
    return null;
  }
  const row = await loadRow(id);
  if (!row) {
    res.status(404).json({ error: INVALID, code: 'NOT_FOUND' });
    return null;
  }
  return row;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (
    applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'free-players-remove')
  ) {
    return;
  }

  if (req.method === 'GET') {
    const row = await resolveRow(req, res);
    if (!row) return;
    // Pas de cache : la fiche peut disparaître entre deux visites.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ name: row.display_name ?? null });
  }

  if (req.method === 'POST') {
    const row = await resolveRow(req, res);
    if (!row) return;

    const { error } = await supabaseAdmin
      .from('free_players')
      .delete()
      .eq('id', row.id)
      .eq('source', 'web');
    if (error) {
      logger.error('[free-players/remove] delete error', error);
      return res
        .status(500)
        .json({ error: 'Le retrait a échoué. Réessaie dans un instant.' });
    }

    logger.info('[free-players/remove] fiche retirée par sa titulaire');
    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
