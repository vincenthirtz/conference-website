// pages/api/player/tcg/showcase.ts
//
//   GET → ma vitrine : activée ou non, et les cartes exposées (relues).
//   PUT → la régler : `{ enabled, cards: [clé de sujet, …] }`.
//
// OPT-IN. Sans réglage, la vitrine est désactivée et la fiche publique n'en
// montre rien. Désactiver la retire IMMÉDIATEMENT : la fiche est régénérée
// (`revalidatePlayerCard`) au lieu d'attendre les 300 s de l'ISR — même
// exigence que le retrait d'une photo, puisqu'il s'agit ici aussi de retirer
// quelque chose de public.
//
// ON NE PEUT EXPOSER QUE CE QU'ON POSSÈDE, et c'est vérifié deux fois : à
// l'enregistrement (`409 not_owned`) et à chaque affichage, où la vitrine se
// relit contre la possession réelle (une carte cédée ou recyclée en sort
// d'elle-même). Seules des RÉFÉRENCES de sujet sont stockées.
//
// PAS DE `?as=` : régler la vitrine de quelqu'un d'autre n'a pas de sens.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import {
  DEFAULT_TENANT_ID,
  resolveTenantIdForUserRequest,
} from '@/utils/tenant';
import { logger } from '@/utils/logger';
import { revalidatePlayerCard } from '@/utils/tcg/revalidatePlayerCard';
import {
  MAX_SHOWCASE_CARDS,
  parseShowcaseKey,
  readShowcaseRow,
  resolveShowcaseCards,
  showcaseKey,
  type ShowcaseSubject,
} from '@/utils/tcg/showcase';

const putSchema = z.object({
  enabled: z.boolean(),
  cards: z.array(z.string()).max(MAX_SHOWCASE_CARDS),
});

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }
  res.setHeader('Cache-Control', 'private, no-store');
  const tenantId = resolveTenantIdForUserRequest(req);

  if (req.method === 'GET') {
    if (
      applyRateLimit(
        req,
        res,
        { max: 60, windowMs: 60_000 },
        'player-tcg-showcase'
      )
    ) {
      return;
    }
    return respondWithShowcase(res, tenantId, user.id);
  }

  if (req.method === 'PUT') {
    if (
      applyRateLimit(
        req,
        res,
        { max: 20, windowMs: 60_000 },
        'player-tcg-showcase-put'
      )
    ) {
      return;
    }

    const parsed = putSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Réglage invalide.', code: 'invalid_body' });
    }
    const subjects = parsed.data.cards.map(parseShowcaseKey);
    if (subjects.some((s) => s === null)) {
      return res
        .status(400)
        .json({ error: 'Carte invalide.', code: 'invalid_card' });
    }
    const keys = [...new Set((subjects as ShowcaseSubject[]).map(showcaseKey))];

    // Possession vérifiée À L'ENREGISTREMENT : exposer une carte qu'on n'a pas
    // serait une affirmation fausse sur une page publique.
    //
    // SEULEMENT POUR ACTIVER. Désactiver ne dépend de RIEN : ni d'une
    // collection lisible, ni de cartes encore possédées. Un retrait qui
    // échouerait parce qu'une carte a été cédée entre-temps laisserait en ligne
    // exactement ce qu'on demande de retirer.
    if (parsed.data.enabled && keys.length > 0) {
      const resolved = await resolveShowcaseCards(tenantId, user.id, keys);
      if (!resolved.ok) {
        logger.error('[tcg/showcase] collection illisible: %s', resolved.error);
        return res.status(500).json({ error: 'Lecture impossible.' });
      }
      if (resolved.unavailable > 0) {
        return res
          .status(409)
          .json({ error: 'Carte non possédée.', code: 'not_owned' });
      }
    }

    const { error } = await supabaseAdmin.from('tcg_showcases').upsert(
      {
        tenant_id: tenantId,
        user_id: user.id,
        enabled: parsed.data.enabled,
        subject_keys: keys,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,user_id' }
    );
    if (error) {
      logger.error('[tcg/showcase] réglage non écrit: %s', error.message);
      return res.status(500).json({ error: 'Enregistrement impossible.' });
    }

    // La fiche publique change (apparition, contenu ou RETRAIT) : régénérée
    // tout de suite. Best-effort, la mutation est déjà écrite.
    await revalidatePlayerCard(res, user.id);

    return respondWithShowcase(res, tenantId, user.id);
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
});

/** L'état de ma vitrine, cartes relues contre ma possession. */
async function respondWithShowcase(
  res: NextApiResponse,
  tenantId: string,
  userId: string
) {
  const row = await readShowcaseRow(tenantId, userId);
  if (!row.ok) {
    logger.error('[tcg/showcase] vitrine illisible: %s', row.error);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  const enabled = row.row?.enabled ?? false;
  const stored = row.row?.subjectKeys ?? [];

  const resolved = await resolveShowcaseCards(tenantId, userId, stored);
  if (!resolved.ok) {
    logger.error('[tcg/showcase] collection illisible: %s', resolved.error);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  return res.status(200).json({
    enabled,
    cards: resolved.cards,
    // Des cartes choisies qui ne sont plus possédées : l'écran le dit, au lieu
    // de laisser croire qu'elles sont toujours exposées.
    unavailable: resolved.unavailable,
    maxCards: MAX_SHOWCASE_CARDS,
    publicProfileUrl: await publicProfileUrl(tenantId, userId),
  });
}

/**
 * L'URL de la fiche publique où la vitrine s'affiche, ou `null` si elle
 * n'existe pas.
 *
 * La fiche n'existe que pour une joueuse classée ou sur un roster, et elle lit
 * l'espace par défaut (`/player/[userId]`, ISR sans requête). Une supportrice
 * sans roster peut régler sa vitrine, mais l'écran doit lui dire qu'elle ne
 * s'affiche nulle part — plutôt que de promettre une page qui répond 404.
 */
async function publicProfileUrl(
  tenantId: string,
  userId: string
): Promise<string | null> {
  if (!supabaseAdmin || tenantId !== DEFAULT_TENANT_ID) return null;
  const [ratingRes, memberRes] = await Promise.all([
    supabaseAdmin
      .from('player_ratings')
      .select('user_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('user_id', userId),
    supabaseAdmin
      .from('team_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('user_id', userId),
  ]);
  const exists =
    (!ratingRes.error && (ratingRes.count ?? 0) > 0) ||
    (!memberRes.error && (memberRes.count ?? 0) > 0);
  return exists ? `/player/${userId}` : null;
}
