// pages/api/player/tcg/exclusion.ts
//
// « NE PAS FIGURER DANS LE TCG » — le consentement qui manquait.
//
// POURQUOI. Les trois garde-fous de docs/TCG.md §2 couvrent la PHOTO : rien
// n'entre sans un geste de la joueuse, tout se retire. Mais une carte existe
// SANS photo — avec un nom, une équipe, une rareté tirée de son palmarès — et
// rien ne permettait de ne pas figurer du tout. On pouvait retirer son visage,
// pas son nom.
//
// CE QUE LE RETRAIT FAIT, dans cet ordre, et pourquoi l'ordre compte :
//   1. la PHOTO part la première, par le chemin existant (file de purge puis
//      coupure du pointeur). C'est l'opération qui peut échouer et laisser un
//      fichier joignable dans un bucket public ; on la fait tant qu'on n'a
//      rien écrit d'autre, et on ABANDONNE si elle échoue ;
//   2. `excluded_at` est posé, ce qui la sort du vivier (`poolQueries`) et
//      anonymise ses cartes déjà tirées (`readPlayerFaces`).
//   L'ordre inverse la déclarerait retirée avec sa photo encore en ligne.
//
// CE QU'IL NE FAIT PAS : supprimer les cartes des collections d'autrui. Elles
// restent, ANONYMES. Les détruire punirait des tiers, parfois pour une carte
// obtenue par échange — c'est-à-dire payée. On ne répare pas un défaut de
// consentement en en créant un autre.
//
// RÉVERSIBLE, et c'est essentiel : un retrait qu'on ne peut pas défaire est une
// décision qu'on hésite à prendre, donc un consentement qu'on n'ose pas
// retirer. Revenir ne rend PAS la photo — elle a été purgée, et c'est bien ce
// qui était demandé.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { enqueuePhotoPurge } from '@/utils/tcg/photoPurge';
import { logger } from '@/utils/logger';

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }: { user: { id: string } }
) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }
  res.setHeader('Cache-Control', 'private, no-store');

  const tenantId = resolveTenantIdForUserRequest(req);
  const userId = user.id;

  switch (req.method) {
    case 'GET':
      if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'tcg-excl')) {
        return;
      }
      return readState(res, tenantId, userId);
    case 'POST':
      if (
        applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'tcg-excl-w')
      ) {
        return;
      }
      return withdraw(res, tenantId, userId);
    case 'DELETE':
      if (
        applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'tcg-excl-r')
      ) {
        return;
      }
      return rejoin(res, tenantId, userId);
    default:
      res.setHeader('Allow', 'GET, POST, DELETE');
      return res.status(405).json({ error: 'Method not allowed.' });
  }
});

async function readState(
  res: NextApiResponse,
  tenantId: string,
  userId: string
) {
  const { data, error } = await supabaseAdmin!
    .from('tcg_player_cards')
    .select('excluded_at')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    logger.error('[tcg/exclusion] lecture impossible: %s', error.message);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  const excludedAt =
    (data as { excluded_at?: string | null } | null)?.excluded_at ?? null;
  return res.status(200).json({ excluded: Boolean(excludedAt), excludedAt });
}

async function withdraw(
  res: NextApiResponse,
  tenantId: string,
  userId: string
) {
  // 1) La photo d'abord. Cf. l'en-tête : c'est la seule étape qui peut laisser
  //    un fichier joignable dans un bucket public, et on refuse de continuer
  //    plutôt que de déclarer quelqu'un retirée avec son visage encore en ligne.
  const { data: existing, error: readError } = await supabaseAdmin!
    .from('tcg_player_cards')
    .select('photo_path')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();
  if (readError) {
    logger.error('[tcg/exclusion] lecture photo: %s', readError.message);
    return res.status(500).json({ error: 'Retrait impossible.' });
  }
  const path =
    (existing as { photo_path?: string | null } | null)?.photo_path ?? null;
  if (path) {
    const queued = await enqueuePhotoPurge({
      tenantId,
      userId,
      storagePath: path,
      reason: 'revoked',
    });
    if (!queued) {
      return res.status(500).json({ error: 'Retrait impossible.' });
    }
  }

  // 2) Le retrait. `upsert` parce que la ligne n'existe probablement PAS : le
  //    cas le plus fréquent est quelqu'un qui n'a jamais rien déposé — c'est
  //    justement de celle-là qu'on parle.
  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin!.from('tcg_player_cards').upsert(
    {
      tenant_id: tenantId,
      user_id: userId,
      excluded_at: nowIso,
      // La photo part avec : `revoked_at` garde le fait, `opted_in_at` reste
      // s'il existait — effacer la ligne effacerait cette histoire.
      ...(path
        ? {
            revoked_at: nowIso,
            photo_path: null,
            photo_status: 'none',
            photo_reviewed_by: null,
            photo_reviewed_at: null,
            photo_rejected_reason: null,
          }
        : {}),
      updated_at: nowIso,
    },
    { onConflict: 'tenant_id,user_id' }
  );
  if (error) {
    logger.error('[tcg/exclusion] retrait impossible: %s', error.message);
    return res.status(500).json({ error: 'Retrait impossible.' });
  }

  return res.status(200).json({ excluded: true, excludedAt: nowIso });
}

async function rejoin(res: NextApiResponse, tenantId: string, userId: string) {
  const { error } = await supabaseAdmin!
    .from('tcg_player_cards')
    .update({ excluded_at: null, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('user_id', userId);
  if (error) {
    logger.error('[tcg/exclusion] retour impossible: %s', error.message);
    return res.status(500).json({ error: 'Opération impossible.' });
  }
  // La photo ne revient PAS : elle a été purgée, et c'est ce qui était demandé.
  // Ses cartes redeviennent nominatives — elles n'ont jamais cessé d'être les
  // siennes.
  return res.status(200).json({ excluded: false, excludedAt: null });
}
