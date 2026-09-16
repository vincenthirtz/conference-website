// pages/api/player/tcg/fanart.ts
//
// Proposer une carte FAN ART, et suivre ses propositions.
//   GET    → mes propositions (statut, motif de refus, crédit tel qu'il sera
//            affiché) + le plafond en attente.
//   POST   → proposer une œuvre : image, titre, nom à créditer, lien facultatif.
//   DELETE → retirer une proposition ENCORE EN ATTENTE.
//
// TROIS GARDE-FOUS, REPRIS DE LA PHOTO DE CARTE (docs/TCG.md § 2) :
//   1. PROPOSER VAUT DÉCLARATION. Le corps doit porter `licenceAccepted` :
//      l'œuvre est de la proposante, et elle accepte qu'elle soit diffusée en
//      carte. Sans cette case, on publierait le travail d'autrui.
//   2. RIEN N'EST VISIBLE AVANT MODÉRATION. Le dossier naît `pending` ; seul le
//      staff le fait passer `approved`, et seules les approuvées entrent dans
//      le vivier du tirage.
//   3. LE RETRAIT EXISTE. Une proposition en attente se retire ici ; une œuvre
//      déjà validée se retire par le staff (`revoked`), et les cartes déjà
//      tirées retombent alors sur une face neutre — elles ne disparaissent pas
//      des collections.
//
// LE CONTENU DU FICHIER EST VÉRIFIÉ (magic bytes), pas seulement son type
// déclaré : le bucket est PUBLIC (cf. `utils/uploads/imageBytes.ts`).
//
// UN PLAFOND DE PROPOSITIONS EN ATTENTE (`MAX_PENDING_FANART`) : la file de
// modération est tenue par des humaines, et une personne ne doit pas pouvoir la
// remplir à elle seule.

import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { sanitizeUrl } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';
import {
  IMAGE_MAX_BYTES,
  decodeImagePayload,
} from '@/utils/uploads/imageBytes';
import { TCG_BUCKET } from '@/utils/tcg/teamCardImage';
import { FANART_LIMITS, MAX_PENDING_FANART } from '@/utils/tcg/fanart';

const BUCKET = TCG_BUCKET;
const PREFIX = 'tcg-fanart';

export const config = {
  api: {
    // Le base64 gonfle d'environ un tiers : 4 Mo de corps pour 2 Mio d'image.
    //
    // SANS CETTE LIGNE, la route restait au plafond par défaut de Next (1 Mo) :
    // base64 + JSON faisaient tomber la limite RÉELLE à ~768 Kio d'image, contre
    // « 2 Mo » annoncés, et Next répondait 413 sans `code` — l'interface disait
    // « réessaie » à une artiste dont l'envoi ne pouvait jamais passer. Même
    // réglage que `photo.ts`, qui vérifie le même `IMAGE_MAX_BYTES`.
    bodyParser: { sizeLimit: '4mb' },
  },
};

const SELECT =
  'id, title, artist_name, artist_url, image_path, status, rarity, review_notes, created_at, reviewed_at';

type FanartRow = {
  id: string;
  title: string;
  artist_name: string;
  artist_url: string | null;
  image_path: string;
  status: string;
  rarity: string | null;
  review_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
};

function publicUrl(path: string): string | null {
  return (
    supabaseAdmin!.storage.from(BUCKET).getPublicUrl(path).data?.publicUrl ??
    null
  );
}

function toPayload(row: FanartRow) {
  return {
    id: row.id,
    title: row.title,
    artistName: row.artist_name,
    artistUrl: row.artist_url,
    imageUrl: publicUrl(row.image_path),
    status: row.status,
    rarity: row.rarity,
    reviewNotes: row.review_notes,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
}

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }
  const tenantId = resolveTenantIdForUserRequest(req);
  const method = req.method ?? 'GET';

  if (method === 'GET') return listMine(req, res, user.id, tenantId);
  if (method === 'POST') return submit(req, res, user.id, tenantId);
  if (method === 'DELETE') return withdraw(req, res, user.id, tenantId);

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
});

async function listMine(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string,
  tenantId: string
) {
  if (
    applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'player-tcg-fanart')
  ) {
    return;
  }
  const { data, error } = await supabaseAdmin!
    .from('tcg_fanart_cards')
    .select(SELECT)
    .eq('tenant_id', tenantId)
    .eq('submitted_by', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    logger.error('[tcg/fanart] lecture impossible: %s', error.message);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  const rows = (data ?? []) as unknown as FanartRow[];
  return res.status(200).json({
    submissions: rows.map(toPayload),
    pending: rows.filter((row) => row.status === 'pending').length,
    maxPending: MAX_PENDING_FANART,
    maxBytes: IMAGE_MAX_BYTES,
  });
}

async function submit(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string,
  tenantId: string
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 5, windowMs: 60_000 },
      'player-tcg-fanart-submit'
    )
  ) {
    return;
  }

  const body = (req.body ?? {}) as {
    data?: unknown;
    mimeType?: unknown;
    title?: unknown;
    artistName?: unknown;
    artistUrl?: unknown;
    licenceAccepted?: unknown;
  };

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const artistName =
    typeof body.artistName === 'string' ? body.artistName.trim() : '';
  if (title.length < 2 || title.length > FANART_LIMITS.title) {
    return res.status(400).json({ error: 'Titre invalide.', code: 'title' });
  }
  if (artistName.length < 2 || artistName.length > FANART_LIMITS.artistName) {
    return res
      .status(400)
      .json({ error: 'Nom à créditer invalide.', code: 'artist_name' });
  }
  // La case n'est PAS une formalité : sans elle, on publierait une œuvre sans
  // savoir qui l'a faite ni si sa diffusion est acceptée.
  if (body.licenceAccepted !== true) {
    return res.status(400).json({
      error:
        'Il faut confirmer que l’œuvre est la vôtre et accepter sa diffusion.',
      code: 'licence',
    });
  }
  const artistUrl =
    typeof body.artistUrl === 'string' && body.artistUrl.trim()
      ? sanitizeUrl(body.artistUrl.trim())
      : null;
  if (
    typeof body.artistUrl === 'string' &&
    body.artistUrl.trim() &&
    !artistUrl
  ) {
    return res
      .status(400)
      .json({ error: 'Lien invalide.', code: 'artist_url' });
  }

  const decoded = decodeImagePayload(body.data, body.mimeType);
  if (!decoded.ok) {
    return res.status(400).json({
      error: 'Image refusée.',
      code: decoded.code,
      maxBytes: IMAGE_MAX_BYTES,
    });
  }

  // Plafond de propositions EN ATTENTE : la file est tenue par des humaines.
  const { count, error: countError } = await supabaseAdmin!
    .from('tcg_fanart_cards')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('submitted_by', userId)
    .eq('status', 'pending');
  if (countError) {
    logger.error('[tcg/fanart] comptage impossible: %s', countError.message);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  if ((count ?? 0) >= MAX_PENDING_FANART) {
    return res.status(409).json({
      error: `Vous avez déjà ${MAX_PENDING_FANART} propositions en attente.`,
      code: 'too_many_pending',
    });
  }

  const hash = crypto.randomBytes(8).toString('hex');
  const path = `${PREFIX}/${userId}-${hash}${decoded.ext}`;
  const { error: uploadError } = await supabaseAdmin!.storage
    .from(BUCKET)
    .upload(path, decoded.buffer, {
      contentType: body.mimeType as string,
      upsert: false,
    });
  if (uploadError) {
    logger.error('[tcg/fanart] envoi impossible: %s', uploadError.message);
    return res.status(500).json({ error: 'Envoi impossible.' });
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin!
    .from('tcg_fanart_cards')
    .insert({
      tenant_id: tenantId,
      submitted_by: userId,
      title,
      artist_name: artistName,
      artist_url: artistUrl,
      image_path: path,
      status: 'pending',
      licence_accepted_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select(SELECT)
    .single();

  if (error || !data) {
    // L'image est déjà dans un bucket PUBLIC : sans ligne pour la désigner,
    // personne ne pourrait plus la retirer. On la reprend tout de suite.
    await supabaseAdmin!.storage
      .from(BUCKET)
      .remove([path])
      .catch(() => undefined);
    logger.error(
      '[tcg/fanart] enregistrement impossible: %s',
      error?.message ?? 'aucune ligne'
    );
    return res.status(500).json({ error: 'Proposition impossible.' });
  }

  return res
    .status(201)
    .json({ submission: toPayload(data as unknown as FanartRow) });
}

async function withdraw(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string,
  tenantId: string
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 20, windowMs: 60_000 },
      'player-tcg-fanart-withdraw'
    )
  ) {
    return;
  }
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!id) {
    return res.status(400).json({ error: 'Proposition manquante.' });
  }

  // Retrait conditionné au statut : une œuvre déjà validée est dans des
  // collections, elle ne se retire que par le staff.
  const { data, error } = await supabaseAdmin!
    .from('tcg_fanart_cards')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('submitted_by', userId)
    .eq('id', id)
    .eq('status', 'pending')
    .select('image_path');
  if (error) {
    logger.error('[tcg/fanart] retrait impossible: %s', error.message);
    return res.status(500).json({ error: 'Retrait impossible.' });
  }
  const removed = (data ?? []) as Array<{ image_path: string }>;
  if (removed.length === 0) {
    return res.status(409).json({
      error: 'Cette proposition n’est plus en attente.',
      code: 'not_pending',
    });
  }

  // La ligne est partie : le fichier ne doit pas rester seul dans un bucket
  // public. Un échec ici est journalisé, il ne remet pas la ligne.
  const { error: removeError } = await supabaseAdmin!.storage
    .from(BUCKET)
    .remove(removed.map((row) => row.image_path));
  if (removeError) {
    logger.error(
      '[tcg/fanart] image orpheline dans le bucket: %s',
      removeError.message
    );
  }

  return res.status(200).json({ ok: true });
}
