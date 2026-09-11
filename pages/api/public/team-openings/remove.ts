// pages/api/public/team-openings/remove.ts
//
// Retrait autonome d'une annonce « cette équipe cherche une joueuse ».
// Miroir de /api/public/free-players/remove.
//
// POURQUOI cette route existe : la publication se fait SANS COMPTE. Sans porte
// de sortie autonome, une équipe au complet devrait écrire au staff pour
// disparaître d'une liste publique qu'elle a elle-même alimentée — et en
// attendant, une joueuse perdrait son temps à répondre à une annonce morte.
//
// Preuve d'identité : un token HMAC reçu par email à la publication
// (utils/teamOpeningRemoval.ts).
//
//   GET  ?token=… — décrit l'annonce visée (pour que la page de confirmation
//                   montre CE qu'on s'apprête à retirer). Ne supprime rien.
//   POST ?token=… — supprime effectivement.
//
// La séparation GET/POST n'est pas cosmétique : les clients mail et les
// antivirus « pré-visitent » les liens d'un email. Un GET destructeur ferait
// disparaître des annonces sans que personne n'ait cliqué.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { verifyTeamOpeningRemovalToken } from '@/utils/teamOpeningRemoval';
import { logger } from '@/utils/logger';

type Row = { id: string; team_name: string | null; source: string | null };

function readToken(req: NextApiRequest): string {
  const raw = req.method === 'GET' ? req.query.token : (req.body ?? {}).token;
  if (Array.isArray(raw)) return raw[0] ?? '';
  return typeof raw === 'string' ? raw : '';
}

/**
 * Message unique pour « token invalide » ET « annonce introuvable ». Distinguer
 * les deux transformerait la route en oracle : on pourrait tester quels ids
 * existent encore.
 */
const INVALID = 'Ce lien de retrait n’est plus valide.';

async function loadRow(id: string): Promise<Row | null> {
  const { data, error } = await supabaseAdmin
    .from('team_openings')
    .select('id, team_name, source')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    logger.error('[team-openings/remove] lookup error', error);
    return null;
  }
  const row = data as Row | null;
  // Un token ne vaut QUE pour une annonce d'origine web : une future row
  // poussée par le bot appartiendrait au serveur Discord, pas à ce lien.
  if (!row || row.source !== 'web') return null;
  return row;
}

/** Vérifie le token puis charge l'annonce. Renvoie la réponse d'erreur, ou la row. */
async function resolveRow(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<Row | null> {
  const id = verifyTeamOpeningRemovalToken(readToken(req));
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
    applyRateLimit(
      req,
      res,
      { max: 20, windowMs: 60_000 },
      'team-openings-remove'
    )
  ) {
    return;
  }

  if (req.method === 'GET') {
    const row = await resolveRow(req, res);
    if (!row) return;
    // Pas de cache : l'annonce peut disparaître entre deux visites.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ teamName: row.team_name ?? null });
  }

  if (req.method === 'POST') {
    const row = await resolveRow(req, res);
    if (!row) return;

    const { error } = await supabaseAdmin
      .from('team_openings')
      .delete()
      .eq('id', row.id)
      .eq('source', 'web');
    if (error) {
      logger.error('[team-openings/remove] delete error', error);
      return res
        .status(500)
        .json({ error: 'Le retrait a échoué. Réessaie dans un instant.' });
    }

    logger.info('[team-openings/remove] annonce retirée par son équipe');
    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
