// pages/api/player/tcg/photo.ts
//
// La photo de carte TCG d'une joueuse : la déposer (POST) ou retirer son
// accord (DELETE).
//
// TROIS GARDE-FOUS, POSÉS DÈS L'ORIGINE.
//
//   1. OPT-IN EXPLICITE. Aucune photo n'entre dans le TCG sans cet appel. Une
//      joueuse qui n'a jamais posté n'a pas de ligne, donc pas de carte
//      illustrée — et surtout aucune image d'elle en circulation.
//   2. MODÉRATION AVANT PUBLICATION. Une photo déposée est `pending` : elle
//      n'est PAS affichée tant qu'une personne du staff ne l'a pas approuvée.
//      Une photo modifiée redevient `pending` — sans quoi il suffirait de
//      remplacer un cliché approuvé par n'importe quoi.
//   3. RETRAIT RÉTROACTIF. Le DELETE efface le fichier du bucket et vide
//      `photo_path`. Comme `tcg_pack_cards` ne référence QUE la joueuse et
//      jamais son image, le retrait atteint aussi les cartes DÉJÀ distribuées.
//
// Ces trois points valent particulièrement ici : la photo d'une personne
// réelle, sur un objet que d'autres collectionnent, dans un milieu où les
// joueuses subissent du harcèlement. Ce ne sont pas des précautions
// décoratives.
//
// Le contenu du fichier est vérifié (magic bytes), pas seulement son type
// déclaré : le bucket est PUBLIC. Cf. utils/uploads/imageBytes.ts.

import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import {
  IMAGE_MAX_BYTES,
  decodeImagePayload,
} from '@/utils/uploads/imageBytes';
import { revalidatePlayerCard } from '@/utils/tcg/revalidatePlayerCard';
import { logger } from '@/utils/logger';

/** Même bucket public que les logos d'équipe, sous un préfixe dédié. */
const BUCKET = 'teams-images';
const PREFIX = 'tcg';

export const config = {
  api: {
    // Le base64 gonfle d'environ un tiers : 4 Mo de corps pour 2 Mio d'image.
    bodyParser: { sizeLimit: '4mb' },
  },
};

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }

  const tenantId = resolveTenantIdForUserRequest(req);

  if (req.method === 'GET') return readState(res, user.id, tenantId);
  if (req.method === 'POST') return submitPhoto(req, res, user.id, tenantId);
  if (req.method === 'DELETE') return revoke(req, res, user.id, tenantId);

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
});

/* -------------------------------------------------------------------------- */
/* GET — l'état de MA carte                                                    */
/* -------------------------------------------------------------------------- */

/**
 * La joueuse voit sa propre photo même quand elle est `pending` ou `rejected` :
 * c'est son écran, et masquer le fichier qu'elle vient d'envoyer rendrait la
 * relecture incompréhensible. Le gel public — n'afficher que `approved` — est
 * la responsabilité du lecteur PUBLIC des cartes, pas de celui-ci.
 */
async function readState(
  res: NextApiResponse,
  userId: string,
  tenantId: string
) {
  const { data, error } = await supabaseAdmin!
    .from('tcg_player_cards')
    .select(
      'opted_in_at, revoked_at, photo_path, photo_status, photo_rejected_reason'
    )
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.error('[tcg/photo] read error: %s', error.message);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  const row = data as {
    opted_in_at?: string | null;
    revoked_at?: string | null;
    photo_path?: string | null;
    photo_status?: string | null;
    photo_rejected_reason?: string | null;
  } | null;

  // Pas de ligne = jamais d'accord donné. C'est un état normal, pas une erreur.
  if (!row) {
    return res.status(200).json({
      status: 'none',
      photoUrl: null,
      optedIn: false,
      rejectedReason: null,
    });
  }

  const photoUrl = row.photo_path
    ? supabaseAdmin!.storage.from(BUCKET).getPublicUrl(row.photo_path).data
        .publicUrl
    : null;

  return res.status(200).json({
    status: row.photo_status ?? 'none',
    photoUrl,
    optedIn: Boolean(row.opted_in_at) && !row.revoked_at,
    rejectedReason: row.photo_rejected_reason ?? null,
  });
}

/* -------------------------------------------------------------------------- */
/* POST — déposer une photo (et donner son accord)                             */
/* -------------------------------------------------------------------------- */

async function submitPhoto(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string,
  tenantId: string
) {
  if (
    applyRateLimit(req, res, { max: 5, windowMs: 60_000 }, 'player-tcg-photo')
  ) {
    return;
  }

  const { data, mimeType } = req.body || {};
  const decoded = decodeImagePayload(data, mimeType);
  if (!decoded.ok) {
    // `code` stable pour que l'interface traduise ; le message reste un repli.
    return res.status(400).json({
      error: 'Photo refusée.',
      code: decoded.code,
      maxBytes: IMAGE_MAX_BYTES,
    });
  }

  // Un chemin par dépôt (jamais réécrit) : `upsert: false` garantit qu'on
  // n'écrase pas silencieusement un fichier, et l'ancien est supprimé
  // explicitement plus bas une fois le nouveau en place.
  const hash = crypto.randomBytes(8).toString('hex');
  const path = `${PREFIX}/${userId}-${hash}${decoded.ext}`;

  const { error: uploadError } = await supabaseAdmin!.storage
    .from(BUCKET)
    .upload(path, decoded.buffer, {
      contentType: mimeType as string,
      upsert: false,
    });
  if (uploadError) {
    logger.error('[tcg/photo] upload error: %s', uploadError.message);
    return res.status(500).json({ error: 'Envoi impossible.' });
  }

  // On lit l'ancien chemin AVANT d'écrire, pour pouvoir le supprimer ensuite.
  const { data: previous } = await supabaseAdmin!
    .from('tcg_player_cards')
    .select('photo_path, opted_in_at')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();

  const previousPath =
    (previous as { photo_path?: string | null } | null)?.photo_path ?? null;
  const alreadyOptedIn =
    (previous as { opted_in_at?: string | null } | null)?.opted_in_at ?? null;

  const nowIso = new Date().toISOString();
  const { error: writeError } = await supabaseAdmin!
    .from('tcg_player_cards')
    .upsert(
      {
        tenant_id: tenantId,
        user_id: userId,
        // Le premier dépôt VAUT accord ; un second ne réécrit pas la date.
        opted_in_at: alreadyOptedIn ?? nowIso,
        // Redéposer après un retrait annule ce retrait.
        revoked_at: null,
        photo_path: path,
        // Toute nouvelle photo repasse par la modération, y compris en
        // remplacement d'une photo déjà approuvée.
        photo_status: 'pending',
        photo_reviewed_by: null,
        photo_reviewed_at: null,
        photo_rejected_reason: null,
        updated_at: nowIso,
      },
      { onConflict: 'tenant_id,user_id' }
    );

  if (writeError) {
    // L'écriture a échoué : le fichier tout juste envoyé n'est référencé par
    // rien. On le retire pour ne pas laisser d'image orpheline dans un bucket
    // public — une photo sans ligne est une photo que personne ne peut retirer.
    await supabaseAdmin!.storage
      .from(BUCKET)
      .remove([path])
      .catch(() => undefined);
    logger.error('[tcg/photo] write error: %s', writeError.message);
    return res.status(500).json({ error: 'Enregistrement impossible.' });
  }

  // L'ancienne photo n'est plus référencée : best-effort, son échec ne doit pas
  // faire croire à la joueuse que son dépôt a raté.
  if (previousPath && previousPath !== path) {
    const { error } = await supabaseAdmin!.storage
      .from(BUCKET)
      .remove([previousPath]);
    if (error) {
      logger.warn('[tcg/photo] ancien fichier non supprimé: %s', error.message);
    }
  }

  // La fiche publique montre la carte : le passage à `pending` retire la photo
  // précédente de la vue de tout le monde, il faut donc régénérer tout de suite.
  await revalidatePlayerCard(res, userId);

  return res.status(200).json({ status: 'pending' });
}

/* -------------------------------------------------------------------------- */
/* DELETE — retirer son accord                                                 */
/* -------------------------------------------------------------------------- */

async function revoke(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string,
  tenantId: string
) {
  if (
    applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'player-tcg-revoke')
  ) {
    return;
  }

  const { data: existing } = await supabaseAdmin!
    .from('tcg_player_cards')
    .select('photo_path')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();

  const path =
    (existing as { photo_path?: string | null } | null)?.photo_path ?? null;

  const nowIso = new Date().toISOString();
  // On garde la ligne : `revoked_at` est un fait à conserver, et `opted_in_at`
  // atteste qu'il y a eu accord. Effacer la ligne effacerait cette histoire.
  const { error } = await supabaseAdmin!
    .from('tcg_player_cards')
    .update({
      revoked_at: nowIso,
      photo_path: null,
      photo_status: 'none',
      photo_reviewed_by: null,
      photo_reviewed_at: null,
      photo_rejected_reason: null,
      updated_at: nowIso,
    })
    .eq('tenant_id', tenantId)
    .eq('user_id', userId);

  if (error) {
    logger.error('[tcg/photo] revoke error: %s', error.message);
    return res.status(500).json({ error: 'Retrait impossible.' });
  }

  // Le fichier part APRÈS que la base ne le référence plus : dans l'autre
  // ordre, un échec d'écriture laisserait une ligne pointant vers un fichier
  // disparu — une carte cassée plutôt qu'une carte sans photo.
  if (path) {
    const { error: removeError } = await supabaseAdmin!.storage
      .from(BUCKET)
      .remove([path]);
    if (removeError) {
      logger.error(
        '[tcg/photo] fichier non supprimé après retrait: %s',
        removeError.message
      );
    }
  }

  // LE POINT LE PLUS IMPORTANT DE CE FICHIER. Sans cette régénération, la photo
  // resterait affichée sur la fiche publique jusqu'à cinq minutes après le
  // retrait (ISR à 300 s) — et « retrait rétroactif » deviendrait une formule.
  await revalidatePlayerCard(res, userId);

  return res.status(200).json({ status: 'revoked' });
}
