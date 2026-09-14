// pages/api/teams/[teamId]/tcg-image.ts
//
// L'illustration de la carte TCG d'une équipe.
//
//   POST   { data, mimeType } → dépose (ou remplace) l'image, et la publie
//   DELETE                    → retire l'image ; la carte retombe sur le logo
//
// Qui a le droit : quiconque porte `manage_team_info` sur CETTE équipe —
// capitaine, rôle d'équipe habilité, et le staff `>= admin`, que
// `hasTeamPermission` laisse passer sur toutes les équipes. Une seule garde
// couvre donc « capitaine ou staff » sans route d'administration parallèle,
// dont la seconde implémentation finirait par diverger de la première.
//
// `manage_team_info` plutôt que `edit_public_page` (la permission retenue par
// upload-image.ts) : cette image n'habille pas la page publique, elle EST
// l'identité de l'équipe dans le jeu, au même titre que son nom et son logo —
// que cette même permission gouverne déjà (cf. utils/teamRoles.ts).
//
// Publication immédiate, sans file de modération : voir le WHY de la migration
// database/migrations/add_tcg_team_card_image.sql.
//
// On stocke un CHEMIN, jamais une URL — c'est ce qui permet de supprimer le
// fichier précédent à chaque remplacement, et donc de ne pas laisser le bucket
// se remplir d'orphelins.

import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { withAuthRoute } from '@/utils/staff';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { hasTeamPermission } from '@/utils/teams/permissions';
import { decodeImagePayload } from '@/utils/uploads/imageBytes';
import { TCG_BUCKET, tcgTeamImagePrefix } from '@/utils/tcg/teamCardImage';
import { logger } from '@/utils/logger';

export const config = {
  // 4 Mo de corps pour 2 Mio d'image : le base64 enfle d'un tiers.
  api: { bodyParser: { sizeLimit: '4mb' } },
};

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  const isPost = req.method === 'POST';
  const isDelete = req.method === 'DELETE';
  if (!isPost && !isDelete) {
    res.setHeader('Allow', 'POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'team-tcg-image'))
    return;

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service unavailable.' });
  }

  const { teamId } = req.query;
  if (typeof teamId !== 'string' || !isValidUUID(teamId)) {
    return res.status(400).json({ error: 'teamId invalide.' });
  }

  const allowed = await hasTeamPermission(user.id, teamId, 'manage_team_info');
  if (!allowed) {
    return res.status(403).json({
      error:
        "Tu n'as pas la permission de modifier l'identité de cette équipe.",
      code: 'FORBIDDEN',
    });
  }

  // Le chemin actuel est lu AVANT toute écriture : c'est lui qu'on supprimera
  // du bucket, et seulement une fois la base à jour.
  const { data: teamRow, error: readErr } = await supabaseAdmin
    .from('teams')
    .select('id, tcg_image_path')
    .eq('id', teamId)
    .maybeSingle();

  if (readErr) {
    logger.error('[tcg-image] team read error', readErr);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
  if (!teamRow) {
    return res.status(404).json({ error: 'Équipe introuvable.' });
  }
  const previousPath = (teamRow as { tcg_image_path: string | null })
    .tcg_image_path;

  /**
   * Supprime un fichier devenu inutile. Jamais bloquant : la base fait foi, et
   * un orphelin dans le bucket est un désagrément, pas une erreur à renvoyer à
   * quelqu'un dont le dépôt a réussi.
   */
  const forget = async (path: string | null) => {
    if (!path) return;
    const { error } = await supabaseAdmin!.storage
      .from(TCG_BUCKET)
      .remove([path]);
    if (error) logger.warn('[tcg-image] orphan left in bucket: %s', path);
  };

  // ---------- DELETE : retirer l'image ----------
  if (isDelete) {
    const { error: clearErr } = await supabaseAdmin
      .from('teams')
      .update({ tcg_image_path: null })
      .eq('id', teamId);
    if (clearErr) {
      logger.error('[tcg-image] clear error', clearErr);
      return res.status(500).json({ error: 'Erreur serveur.' });
    }
    await forget(previousPath);
    return res.status(200).json({ url: null });
  }

  // ---------- POST : déposer ou remplacer ----------
  const { data, mimeType } = (req.body ?? {}) as {
    data?: unknown;
    mimeType?: unknown;
  };
  const decoded = decodeImagePayload(data, mimeType);
  if (!decoded.ok) {
    // Code stable, message traduit côté client : le serveur ne connaît pas la
    // langue de la personne en face.
    return res
      .status(400)
      .json({ error: 'Image refusée.', code: decoded.code });
  }

  const filePath = `${tcgTeamImagePrefix(teamId)}-${crypto
    .randomBytes(8)
    .toString('hex')}${decoded.ext}`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(TCG_BUCKET)
    .upload(filePath, decoded.buffer, {
      contentType: mimeType as string,
      upsert: false,
    });

  if (uploadErr) {
    logger.error('[tcg-image] storage error', uploadErr);
    return res.status(500).json({ error: "Impossible d'envoyer l'image." });
  }

  const { error: saveErr } = await supabaseAdmin
    .from('teams')
    .update({ tcg_image_path: filePath })
    .eq('id', teamId);

  if (saveErr) {
    logger.error('[tcg-image] save error', saveErr);
    // L'écriture a échoué : le fichier qu'on vient de poser ne sera référencé
    // par personne. On le retire plutôt que de le laisser derrière.
    await forget(filePath);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }

  // L'ancien ne part qu'une fois le nouveau enregistré : dans l'ordre inverse,
  // un échec d'écriture laisserait la carte sans image du tout.
  await forget(previousPath);

  const { data: publicUrl } = supabaseAdmin.storage
    .from(TCG_BUCKET)
    .getPublicUrl(filePath);

  return res.status(200).json({ url: publicUrl.publicUrl, path: filePath });
});
