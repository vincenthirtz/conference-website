// pages/api/public/free-players/renew.ts
//
// « Je cherche toujours » — prolonge une fiche « joueuse libre » de soixante
// jours. Cible du bouton de la relance envoyée avant péremption
// (cron `free-players-expiry`).
//
// POURQUOI. Une annonce web expire au bout de soixante jours, et jusqu'ici
// sans que personne ne le sache : la joueuse disparaissait de la liste en
// croyant être encore visible. Sa seule issue était de remplir à nouveau le
// formulaire complet, captcha compris. Un clic suffit désormais.
//
// Preuve d'identité : le MÊME token que le retrait (cf.
// `buildFreePlayerRenewUrl`). Qui peut retirer la fiche peut la garder.
//
//   GET  ?token=… — décrit la fiche (nom, échéance, déjà expirée ?). Ne change
//                   rien : les clients mail pré-visitent les liens.
//   POST { token } — repousse l'échéance et réarme la relance.
//
// Une fiche DÉJÀ expirée se prolonge aussi : elle n'est pas purgée, seulement
// masquée, et c'est souvent au moment où elle a disparu qu'on s'en rend compte.
// Son annonce Discord ayant été retirée à l'expiration, elle est réannoncée.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { verifyFreePlayerRemovalToken } from '@/utils/freePlayerRemoval';
import { computeExpiresAt, normalizeRoles } from '@/utils/freePlayers';
import { emitBotEvent } from '@/utils/botEvents';
import { logger } from '@/utils/logger';

type Row = {
  id: string;
  tenant_id: string;
  display_name: string | null;
  source: string | null;
  expires_at: string | null;
  roles: string[] | null;
  level: string | null;
  availability: string | null;
  discord_announce_message_id: string | null;
};

/** Même message pour « token invalide » et « fiche introuvable » (pas d'oracle). */
const INVALID = 'Ce lien n’est plus valide.';

function readToken(req: NextApiRequest): string {
  const raw = req.method === 'GET' ? req.query.token : (req.body ?? {}).token;
  if (Array.isArray(raw)) return raw[0] ?? '';
  return typeof raw === 'string' ? raw : '';
}

function isExpired(row: Row, now = new Date()): boolean {
  return (
    !!row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()
  );
}

async function resolveRow(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<Row | null> {
  const id = verifyFreePlayerRemovalToken(readToken(req));
  if (!id) {
    res.status(400).json({ error: INVALID, code: 'INVALID_TOKEN' });
    return null;
  }
  const { data, error } = await supabaseAdmin
    .from('free_players')
    .select(
      'id, tenant_id, display_name, source, expires_at, roles, level, availability, discord_announce_message_id'
    )
    .eq('id', id)
    .maybeSingle();
  if (error) {
    logger.error('[free-players/renew] lookup error', error);
  }
  const row = data as Row | null;
  if (!row || row.source !== 'web') {
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
    applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'free-players-renew')
  ) {
    return;
  }

  if (req.method === 'GET') {
    const row = await resolveRow(req, res);
    if (!row) return;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      name: row.display_name ?? null,
      expiresAt: row.expires_at,
      expired: isExpired(row),
    });
  }

  if (req.method === 'POST') {
    const row = await resolveRow(req, res);
    if (!row) return;

    const wasExpired = isExpired(row);
    const expiresAt = computeExpiresAt();
    const { error } = await supabaseAdmin
      .from('free_players')
      .update({
        expires_at: expiresAt,
        // Un nouveau cycle mérite sa propre relance.
        expiry_reminder_sent_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('source', 'web');
    if (error) {
      logger.error('[free-players/renew] update error', error);
      return res
        .status(500)
        .json({ error: 'La prolongation a échoué. Réessaie dans un instant.' });
    }

    // Revenue d'une expiration : son annonce Discord a été retirée avec elle.
    // Les capitaines doivent réapprendre qu'elle cherche — c'est le but même
    // du clic. Une fiche encore vivante garde son annonce telle quelle.
    if (wasExpired && !row.discord_announce_message_id) {
      void emitBotEvent(
        'free_player.registered',
        {
          freePlayerId: row.id,
          displayName: row.display_name,
          roles: normalizeRoles(row.roles),
          level: row.level,
          availability: row.availability,
        },
        row.tenant_id
      ).catch(() => {
        /* déjà journalisé par emitBotEvent ; jamais bloquant */
      });
    }

    logger.info('[free-players/renew] fiche prolongée par sa titulaire');
    return res.status(200).json({ success: true, expiresAt });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
