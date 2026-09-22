// pages/api/admin/tcg/overlay-theme.ts
//
// L'habillage de la source navigateur OBS du TCG.
//
//   GET — l'habillage courant, plus les bornes que l'éditeur doit respecter.
//   PUT — modifie tout ou partie, et dépose ou retire le média.
//
// MÊME PERMISSION QUE LE LIEN D'OVERLAY (`manage_tcg`) : ce que règle
// cette route s'affiche exactement au même endroit, devant la même audience.
// Un seuil différent pour l'apparence et pour le lien serait arbitraire.
//
// PATCH PARTIEL, PAS REMPLACEMENT. Seules les clés PRÉSENTES dans le corps sont
// écrites — régler la couleur ne doit pas effacer la position au passage. C'est
// aussi ce qui permet à l'éditeur d'enregistrer champ par champ sans avoir à
// renvoyer un état complet qu'il pourrait avoir lu périmé.
//
// `null` VEUT DIRE « REVIENS AU DÉFAUT », ET C'EST UNE VALEUR UTILE : vider la
// formulation restaure la phrase traduite, vider le média retire l'illustration.
// Sans cette distinction entre « absent » et « null », on ne saurait pas
// effacer un champ — seulement en changer la valeur.
//
// LE MÉDIA VA DANS UN BUCKET PUBLIC, d'où la validation par MAGIC BYTES
// (`utils/uploads/mediaBytes.ts`) : le `mimeType` d'une requête est une
// affirmation du client, pas un fait. L'ancien fichier est supprimé APRÈS que
// le nouveau est en place et référencé — l'inverse laisserait un overlay
// pointant vers un fichier disparu si l'écriture échouait entre les deux.

import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import {
  decodeMediaPayload,
  maxBytesForMime,
} from '@/utils/uploads/mediaBytes';
import {
  readOverlayTheme,
  readOverlayMediaPath,
  OVERLAY_MEDIA_BUCKET,
  OVERLAY_MEDIA_PREFIX,
} from '@/utils/tcg/overlayTheme';
import {
  validateThemePatch,
  OVERLAY_LINE_MAX,
  OVERLAY_POSITIONS,
  type OverlayTheme,
} from '@/utils/tcg/overlayThemeShape';
import { IMMUTABLE_UPLOAD_CACHE_CONTROL } from '@/utils/uploads/storageCache';

export type TcgOverlayThemeState = {
  theme: OverlayTheme;
  /** Bornes rendues au client pour qu'il refuse AVANT l'envoi. */
  lineMax: number;
  positions: readonly string[];
};

async function present(tenantId: string): Promise<TcgOverlayThemeState> {
  return {
    theme: await readOverlayTheme(tenantId),
    lineMax: OVERLAY_LINE_MAX,
    positions: OVERLAY_POSITIONS,
  };
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'tcg-overlay-theme')
  ) {
    return;
  }

  res.setHeader('Cache-Control', 'private, no-store');

  const tenantId = ctx.tenantId;
  if (!tenantId) {
    return res.status(400).json({ error: 'Espace non résolu.' });
  }
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Indisponible.' });
  }

  try {
    if (req.method === 'GET') {
      return res.status(200).json(await present(tenantId));
    }

    // Aiguillage en forme POSITIVE, comme `overlay-token.ts` : c'est ce que lit
    // le garde de dérive OpenAPI, qui ne reconnaît pas un `else` final.
    if (req.method === 'PUT') {
      const body = (req.body ?? {}) as Record<string, unknown>;

      const validated = validateThemePatch(body);
      if (!validated.ok) {
        return res
          .status(400)
          .json({ error: 'Réglage refusé.', code: validated.code });
      }
      const row: Record<string, unknown> = { ...validated.row };

      // --- Média : déposer, retirer, ou ne pas y toucher ---------------------
      let previousPath: string | null = null;
      const hasMediaKey = 'media' in body;
      const media = body.media as
        | { data?: unknown; mimeType?: unknown }
        | null
        | undefined;

      if (hasMediaKey) {
        previousPath = await readOverlayMediaPath(tenantId);

        if (media === null) {
          // Retrait explicite.
          row.media_path = null;
          row.media_kind = null;
        } else {
          const decoded = decodeMediaPayload(media?.data, media?.mimeType);
          if (!decoded.ok) {
            return res.status(400).json({
              error: 'Média refusé.',
              code: decoded.code,
              maxBytes: maxBytesForMime(String(media?.mimeType ?? '')),
            });
          }

          // Un chemin par dépôt, jamais réécrit : `upsert: false` garantit
          // qu'on n'écrase pas silencieusement un fichier encore référencé.
          const hash = crypto.randomBytes(8).toString('hex');
          const path = `${OVERLAY_MEDIA_PREFIX}/${tenantId}-${hash}${decoded.ext}`;

          const { error: uploadError } = await supabaseAdmin.storage
            .from(OVERLAY_MEDIA_BUCKET)
            .upload(path, decoded.buffer, {
              contentType: String(media?.mimeType),
              upsert: false,
              cacheControl: IMMUTABLE_UPLOAD_CACHE_CONTROL,
            });
          if (uploadError) {
            logger.error(
              '[tcg/overlay-theme] envoi impossible: %s',
              uploadError.message
            );
            return res.status(500).json({ error: 'Envoi impossible.' });
          }

          row.media_path = path;
          row.media_kind = decoded.kind;
        }
      }

      if (Object.keys(row).length === 0) {
        // Rien à écrire : on rend l'état courant plutôt qu'une erreur. Un
        // formulaire enregistré sans modification n'est pas une faute.
        return res.status(200).json(await present(tenantId));
      }

      row.tenant_id = tenantId;
      row.updated_at = new Date().toISOString();
      row.updated_by = ctx.user?.id ?? null;

      const { error: writeError } = await supabaseAdmin
        .from('tcg_overlay_themes')
        .upsert(row, { onConflict: 'tenant_id' });

      if (writeError) {
        logger.error(
          '[tcg/overlay-theme] écriture impossible: %s',
          writeError.message
        );
        return res.status(500).json({ error: 'Enregistrement impossible.' });
      }

      // L'ancien média part APRÈS que le nouveau est référencé. Un échec ici ne
      // remet pas le réglage en cause : c'est un fichier orphelin, pas une
      // panne visible à l'antenne — on le journalise et on continue.
      if (hasMediaKey && previousPath && previousPath !== row.media_path) {
        const { error: removeError } = await supabaseAdmin.storage
          .from(OVERLAY_MEDIA_BUCKET)
          .remove([previousPath]);
        if (removeError) {
          logger.warn(
            '[tcg/overlay-theme] ancien média non supprimé (%s): %s',
            previousPath,
            removeError.message
          );
        }
      }

      if (ctx.staff?.id) {
        try {
          await logStaffAction({
            staff_id: ctx.staff.id,
            action: 'other',
            entity_type: 'broadcast',
            tenant_id: tenantId,
            payload: {
              mode: 'tcg-overlay-theme-updated',
              fields: Object.keys(validated.row),
              media: hasMediaKey ? (media === null ? 'removed' : 'set') : null,
            },
          });
        } catch (logErr) {
          logger.error('[tcg/overlay-theme] log error:', logErr);
        }
      }

      return res.status(200).json(await present(tenantId));
    }

    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    logger.error('[tcg/overlay-theme] erreur', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
}

export default withStaffRoute(handler, { permission: 'manage_tcg' });
