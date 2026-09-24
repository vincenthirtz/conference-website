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
// UN QUATRIÈME, AJOUTÉ LE 2026-09-24 : PAS DE PHOTO SANS CARTE. Un compte sans
// profil joueuse dans l'espace n'a pas de carte (cf. utils/tcg/playerProfile.ts) :
// sa photo, même validée, ne s'affichait nulle part. Cas réel — une joueuse
// connectée avec un compte e-mail à côté de son compte Discord d'équipe. Le
// dépôt est refusé avec un code dédié, et le GET le dit avant qu'elle essaie.
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
import { enqueuePhotoPurge, tryPurgeNow } from '@/utils/tcg/photoPurge';
import { IMMUTABLE_UPLOAD_CACHE_CONTROL } from '@/utils/uploads/storageCache';
import { hasPlayerProfile } from '@/utils/tcg/playerProfile';

/** Même bucket public que les logos d'équipe, sous un préfixe dédié. */
const BUCKET = 'teams-images';
const PREFIX = 'tcg';

/** Relectures du retrait si un dépôt s'intercale : à vitesse humaine, une suffit. */
const REVOKE_ATTEMPTS = 3;

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

  if (req.method === 'GET') return readState(req, res, user.id, tenantId);
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
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string,
  tenantId: string
) {
  // LE GET AUSSI. Il était la seule méthode de ce fichier sans plafond — une
  // asymétrie sans justification, dans un fichier qui documente tout le reste.
  // Lecture authentifiée et bon marché, donc le plafond est large : il n'est
  // pas là contre un abus coûteux, il est là pour qu'aucune méthode ne soit
  // l'exception qu'on oublie.
  //
  // `true` = REQUÊTE BLOQUÉE, réponse déjà envoyée (convention du helper, et
  // celle des deux autres méthodes ci-dessous).
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'player-tcg-photo-read'
    )
  ) {
    return;
  }

  const [{ data, error }, profile] = await Promise.all([
    supabaseAdmin!
      .from('tcg_player_cards')
      .select(
        'opted_in_at, revoked_at, photo_path, photo_status, photo_rejected_reason'
      )
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle(),
    // `null` (lecture en échec) = inconnu : l'écran ne bloque pas sur un doute,
    // le POST tranchera.
    hasPlayerProfile(tenantId, userId),
  ]);

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
      hasPlayerProfile: profile,
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
    hasPlayerProfile: profile,
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

  // Avant tout envoi : sans profil joueuse, aucune carte ne portera la photo.
  // Refusée ici, elle n'entre ni dans le bucket public ni dans la file de
  // relecture du staff.
  const profile = await hasPlayerProfile(tenantId, userId);
  if (profile === null) {
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  if (!profile) {
    return res.status(409).json({
      error:
        "Ce compte n'a pas de profil joueuse : connecte-toi avec le compte de ton équipe.",
      code: 'no_player_profile',
    });
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

  // On lit l'ancien chemin AVANT tout envoi, pour pouvoir le supprimer ensuite.
  // UNE LECTURE EN ÉCHEC ARRÊTE LE DÉPÔT (correctif du 2026-09-15) : l'ancien
  // code l'ignorait, l'upsert écrasait `photo_path`, et l'ancienne photo restait
  // dans le bucket PUBLIC sans plus aucune ligne pour la désigner — un fichier
  // que ni la joueuse ni le staff ne pouvaient plus retirer.
  const { data: previous, error: previousError } = await supabaseAdmin!
    .from('tcg_player_cards')
    .select('photo_path, opted_in_at')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();
  if (previousError) {
    logger.error('[tcg/photo] read error: %s', previousError.message);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }

  const previousPath =
    (previous as { photo_path?: string | null } | null)?.photo_path ?? null;
  const alreadyOptedIn =
    (previous as { opted_in_at?: string | null } | null)?.opted_in_at ?? null;

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
      cacheControl: IMMUTABLE_UPLOAD_CACHE_CONTROL,
    });
  if (uploadError) {
    logger.error('[tcg/photo] upload error: %s', uploadError.message);
    return res.status(500).json({ error: 'Envoi impossible.' });
  }

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

  // LIRE PUIS EFFACER, SANS PERDRE LE FICHIER (correctif du 2026-09-15).
  // L'ancien code ignorait l'erreur de lecture : sur un 504, `path` valait
  // `null`, la base était vidée quand même, et la photo restait dans le bucket
  // PUBLIC sans plus aucune ligne pour la désigner. Désormais une lecture en
  // échec rend 500 sans rien écrire, et l'effacement est CONDITIONNEL au chemin
  // lu : si un dépôt s'intercale, zéro ligne n'est touchée et on relit, au lieu
  // d'effacer en base la référence d'un fichier qu'on ne supprimerait pas.
  let path: string | null = null;
  let revoked = false;
  for (let attempt = 0; attempt < REVOKE_ATTEMPTS && !revoked; attempt += 1) {
    const { data: existing, error: readError } = await supabaseAdmin!
      .from('tcg_player_cards')
      .select('photo_path')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle();
    if (readError) {
      logger.error('[tcg/photo] revoke read error: %s', readError.message);
      return res.status(500).json({ error: 'Retrait impossible.' });
    }
    path =
      (existing as { photo_path?: string | null } | null)?.photo_path ?? null;

    // LA FILE D'ABORD, LE POINTEUR ENSUITE. Couper `photo_path` avant d'avoir
    // mis le chemin à l'abri, c'était accepter de le perdre si la suppression
    // échouait — et laisser la photo joignable par son URL pour toujours, dans
    // un bucket public (cf. `utils/tcg/photoPurge.ts`). On refuse plutôt de
    // continuer : un retrait à recommencer vaut mieux qu'un fichier orphelin.
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

    const nowIso = new Date().toISOString();
    // On garde la ligne : `revoked_at` est un fait à conserver, et `opted_in_at`
    // atteste qu'il y a eu accord. Effacer la ligne effacerait cette histoire.
    let update = supabaseAdmin!
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
    update = path
      ? update.eq('photo_path', path)
      : update.is('photo_path', null);
    const { data: written, error } = await update.select('user_id');

    if (error) {
      logger.error('[tcg/photo] revoke error: %s', error.message);
      return res.status(500).json({ error: 'Retrait impossible.' });
    }
    // Aucune ligne : soit la joueuse n'a jamais déposé (rien à retirer, le
    // retrait est acquis), soit un dépôt s'est intercalé — on relit.
    if (Array.isArray(written) && written.length > 0) revoked = true;
    else if (!existing) revoked = true;
  }
  if (!revoked) {
    return res.status(409).json({
      error: 'La photo a changé pendant le retrait, réessaie.',
      code: 'PHOTO_CHANGED',
    });
  }

  // Le fichier part APRÈS que la base ne le référence plus : dans l'autre
  // ordre, un échec d'écriture laisserait une ligne pointant vers un fichier
  // disparu — une carte cassée plutôt qu'une carte sans photo.
  //
  // L'échec n'est plus une impasse : le chemin est en file depuis l'étape
  // précédente, et le balayage horaire reprendra.
  if (path) await tryPurgeNow(path);

  // LE POINT LE PLUS IMPORTANT DE CE FICHIER. Sans cette régénération, la photo
  // resterait affichée sur la fiche publique jusqu'à cinq minutes après le
  // retrait (ISR à 300 s) — et « retrait rétroactif » deviendrait une formule.
  await revalidatePlayerCard(res, userId);

  return res.status(200).json({ status: 'revoked' });
}
