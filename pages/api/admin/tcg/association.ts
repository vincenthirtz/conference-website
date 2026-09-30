// pages/api/admin/tcg/association.ts
//
// La catégorie « L'association » du TCG : les visuels de l'association, entrés
// par le staff.
//   GET   → les cartes de la catégorie (toutes, retirées comprises) et les
//           logos d'événement qu'on peut importer.
//   POST  → `upload` : déposer une image ; `import_logo` : faire d'un logo
//           d'événement (`site_settings.seasonal_logos`) une carte ;
//           `voxel_logo` : la carte du logo par défaut EN VOXEL (le nœud).
//   PATCH → `update` (titre, crédit, rareté), `revoke`, `restore`.
//
// PAS DE FILE DE MODÉRATION. Une fan art est l'œuvre d'une inconnue, relue
// avant publication ; une carte de l'association est déposée par le staff
// lui-même, sous le même droit (`manage_tcg`) que celui qui valide les fan
// arts. Elle naît donc `approved`, avec sa rareté.
//
// PAS DE PROPOSANTE (`submitted_by` NULL, cf. `tcg_association_cards.sql`) :
// la carte appartient à l'association. L'effacement du compte d'un membre du
// staff ne doit pas retirer une carte que d'autres possèdent. Qui l'a déposée
// reste dans `reviewed_by` et le journal staff.
//
// UN LOGO IMPORTÉ EST COPIÉ, PAS RÉFÉRENCÉ. Le calendrier des logos se modifie
// librement ; si la carte pointait sur le fichier du logo, retirer le logo du
// calendrier pourrait vider des cartes possédées. On copie l'objet sous
// `tcg-association/`. Seuls les logos hébergés dans le bucket se copient — un
// chemin du site (`/img/...`) n'est pas un objet qu'on puisse dupliquer ici.
//
// LE VOXEL DU LOGO EST FIGÉ EN FICHIER. La figurine du nœud
// (`utils/tcg/mascotFigure.ts`) se rend à la volée sur `/api/tcg/figure/...`,
// mais une carte désigne un objet du bucket : on rend le SVG une fois, côté
// serveur, et on le dépose. Le SVG sort de NOTRE moteur — rien de fourni par
// quelqu'un d'autre n'entre dans le bucket par cette voie. La version du
// modèle est dans `source_ref` : une retouche du nœud (`MASCOT_VERSION`)
// ouvre droit à une nouvelle carte sans écraser celles déjà possédées.
//
// RETIRER N'EST PAS SUPPRIMER, comme pour les fan arts : `revoked` sort la
// carte des paquets à venir ; les exemplaires tirés restent, face neutre.

import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import * as z from 'zod';

import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import { getSetting } from '@/utils/siteSettings';
import {
  SEASONAL_LOGOS_SETTING_KEY,
  parseSeasonalLogos,
} from '@/utils/seasonalLogo';
import {
  IMAGE_MAX_BYTES,
  decodeImagePayload,
} from '@/utils/uploads/imageBytes';
import { IMMUTABLE_UPLOAD_CACHE_CONTROL } from '@/utils/uploads/storageCache';
import { TCG_BUCKET } from '@/utils/tcg/teamCardImage';
import {
  ASSOCIATION_DEFAULT_CREDIT,
  ASSOCIATION_STORAGE_PREFIX,
  DEFAULT_FANART_RARITY,
  FANART_LIMITS,
  bucketPathFromPublicUrl,
  seasonalLogoSourceRef,
} from '@/utils/tcg/fanart';
import { RARITY_ORDER } from '@/utils/tcg/rarity';
import {
  MASCOT_VERSION,
  mascotUrl,
  renderMascotSvg,
} from '@/utils/tcg/mascotFigure';

/** `source_ref` de la carte du logo par défaut en voxel. */
const VOXEL_LOGO_REF = `voxel:noeud:v${MASCOT_VERSION}`;
/** Son titre par défaut. */
const VOXEL_LOGO_TITLE = 'Le nœud en briques';

export const config = {
  // Même plafond que le dépôt de fan art : base64 + JSON pour 2 Mio d'image.
  api: { bodyParser: { sizeLimit: '4mb' } },
};

const SELECT =
  'id, title, artist_name, image_path, status, rarity, source_ref, created_at';

const rarityEnum = z.enum(['common', 'rare', 'epic', 'legendary']);
const title = z.string().trim().min(2).max(FANART_LIMITS.title);
const credit = z.string().trim().min(2).max(FANART_LIMITS.artistName);

const postSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('upload'),
      data: z.string().min(1),
      mimeType: z.string().min(1),
      title,
      credit: credit.optional(),
      rarity: rarityEnum.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('import_logo'),
      logoId: z.string().regex(/^[\w-]{1,40}$/),
      title: title.optional(),
      rarity: rarityEnum.optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('voxel_logo'),
      title: title.optional(),
      rarity: rarityEnum.optional(),
    })
    .strict(),
]);

/** Une carte existe-t-elle déjà pour cette origine ? */
async function hasSourceRef(tenantId: string, ref: string): Promise<boolean> {
  const { data } = await supabaseAdmin!
    .from('tcg_fanart_cards')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('source_ref', ref)
    .maybeSingle();
  return Boolean(data);
}

const patchSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('update'),
      id: z.string().uuid(),
      title: title.optional(),
      credit: credit.optional(),
      rarity: rarityEnum.optional(),
    })
    .strict(),
  z.object({ action: z.literal('revoke'), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal('restore'), id: z.string().uuid() }).strict(),
]);

type Row = {
  id: string;
  title: string;
  artist_name: string;
  image_path: string;
  status: string;
  rarity: string | null;
  source_ref: string | null;
  created_at: string;
};

function publicUrl(path: string): string | null {
  return (
    supabaseAdmin!.storage.from(TCG_BUCKET).getPublicUrl(path).data
      ?.publicUrl ?? null
  );
}

function toPayload(row: Row) {
  return {
    id: row.id,
    title: row.title,
    credit: row.artist_name,
    imageUrl: publicUrl(row.image_path),
    status: row.status,
    rarity: row.rarity,
    sourceRef: row.source_ref,
    createdAt: row.created_at,
  };
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  res.setHeader('Cache-Control', 'no-store');
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }
  const method = req.method ?? 'GET';
  if (method === 'GET') return list(req, res, ctx);
  if (method === 'POST') return create(req, res, ctx);
  if (method === 'PATCH') return patch(req, res, ctx);
  res.setHeader('Allow', 'GET, POST, PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function list(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-tcg-association'
    )
  ) {
    return;
  }
  const [cardsRes, rawLogos] = await Promise.all([
    supabaseAdmin!
      .from('tcg_fanart_cards')
      .select(SELECT)
      .eq('tenant_id', ctx.tenantId)
      .eq('category', 'association')
      .order('created_at', { ascending: false })
      .limit(200),
    getSetting(SEASONAL_LOGOS_SETTING_KEY, ctx.tenantId),
  ]);
  if (cardsRes.error) {
    logger.error(
      '[admin/tcg/association] lecture impossible: %s',
      cardsRes.error.message
    );
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  const rows = (cardsRes.data ?? []) as unknown as Row[];
  const cardByRef = new Map(
    rows.filter((r) => r.source_ref).map((r) => [r.source_ref as string, r])
  );

  const eventLogos = parseSeasonalLogos(rawLogos).map((logo) => ({
    id: logo.id,
    name: logo.name,
    url: logo.url,
    // Seul un logo du bucket se copie en carte (cf. l'en-tête).
    importable: bucketPathFromPublicUrl(logo.url, TCG_BUCKET) !== null,
    cardId: cardByRef.get(seasonalLogoSourceRef(logo.id))?.id ?? null,
  }));

  return res.status(200).json({
    items: rows.map(toPayload),
    eventLogos,
    voxelLogo: {
      // Aperçu servi par la route des figurines : ce que la carte montrera.
      previewUrl: mascotUrl(null),
      cardId: cardByRef.get(VOXEL_LOGO_REF)?.id ?? null,
    },
    rarities: RARITY_ORDER,
    defaultRarity: DEFAULT_FANART_RARITY,
    defaultCredit: ASSOCIATION_DEFAULT_CREDIT,
    maxBytes: IMAGE_MAX_BYTES,
  });
}

async function create(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 20, windowMs: 60_000 },
      'admin-tcg-association-create'
    )
  ) {
    return;
  }
  const parsed = postSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Requête invalide.', code: 'VALIDATION' });
  }
  const body = parsed.data;

  let path: string;
  let cardTitle: string;
  let sourceRef: string | null = null;

  if (body.action === 'upload') {
    const decoded = decodeImagePayload(body.data, body.mimeType);
    if (!decoded.ok) {
      return res.status(400).json({
        error: 'Image refusée.',
        code: decoded.code,
        maxBytes: IMAGE_MAX_BYTES,
      });
    }
    path = `${ASSOCIATION_STORAGE_PREFIX}/${crypto.randomBytes(8).toString('hex')}${decoded.ext}`;
    const { error } = await supabaseAdmin!.storage
      .from(TCG_BUCKET)
      .upload(path, decoded.buffer, {
        contentType: body.mimeType,
        upsert: false,
        cacheControl: IMMUTABLE_UPLOAD_CACHE_CONTROL,
      });
    if (error) {
      logger.error(
        '[admin/tcg/association] envoi impossible: %s',
        error.message
      );
      return res.status(500).json({ error: 'Envoi impossible.' });
    }
    cardTitle = body.title;
  } else if (body.action === 'voxel_logo') {
    sourceRef = VOXEL_LOGO_REF;
    if (await hasSourceRef(ctx.tenantId, sourceRef)) {
      return res.status(409).json({
        error: 'Le voxel du logo est déjà une carte.',
        code: 'already_imported',
      });
    }
    path = `${ASSOCIATION_STORAGE_PREFIX}/noeud-voxel-v${MASCOT_VERSION}-${crypto.randomBytes(4).toString('hex')}.svg`;
    const { error } = await supabaseAdmin!.storage
      .from(TCG_BUCKET)
      .upload(path, Buffer.from(renderMascotSvg(null), 'utf8'), {
        contentType: 'image/svg+xml',
        upsert: false,
        cacheControl: IMMUTABLE_UPLOAD_CACHE_CONTROL,
      });
    if (error) {
      logger.error(
        '[admin/tcg/association] dépôt du voxel impossible: %s',
        error.message
      );
      return res.status(500).json({ error: 'Envoi impossible.' });
    }
    cardTitle = body.title ?? VOXEL_LOGO_TITLE;
  } else {
    const logos = parseSeasonalLogos(
      await getSetting(SEASONAL_LOGOS_SETTING_KEY, ctx.tenantId)
    );
    const logo = logos.find((l) => l.id === body.logoId);
    if (!logo) {
      return res
        .status(404)
        .json({ error: 'Logo introuvable.', code: 'logo_not_found' });
    }
    const from = bucketPathFromPublicUrl(logo.url, TCG_BUCKET);
    if (!from) {
      return res.status(422).json({
        error:
          'Ce logo n’est pas hébergé dans le stockage : impossible de le copier.',
        code: 'logo_not_in_bucket',
      });
    }
    sourceRef = seasonalLogoSourceRef(logo.id);
    if (await hasSourceRef(ctx.tenantId, sourceRef)) {
      return res.status(409).json({
        error: 'Ce logo est déjà une carte.',
        code: 'already_imported',
      });
    }
    const ext = from.match(/\.[a-z0-9]{2,5}$/i)?.[0]?.toLowerCase() ?? '';
    path = `${ASSOCIATION_STORAGE_PREFIX}/${crypto.randomBytes(8).toString('hex')}${ext}`;
    const { error } = await supabaseAdmin!.storage
      .from(TCG_BUCKET)
      .copy(from, path);
    if (error) {
      logger.error(
        '[admin/tcg/association] copie impossible: %s',
        error.message
      );
      return res.status(500).json({ error: 'Copie du logo impossible.' });
    }
    cardTitle = body.title ?? logo.name.slice(0, FANART_LIMITS.title);
    if (cardTitle.length < 2) cardTitle = `Logo ${cardTitle}`;
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin!
    .from('tcg_fanart_cards')
    .insert({
      tenant_id: ctx.tenantId,
      category: 'association',
      submitted_by: null,
      source_ref: sourceRef,
      title: cardTitle,
      artist_name:
        body.action === 'upload' && body.credit
          ? body.credit
          : ASSOCIATION_DEFAULT_CREDIT,
      artist_url: null,
      image_path: path,
      status: 'approved',
      rarity: body.rarity ?? DEFAULT_FANART_RARITY,
      // Déposée par l'association elle-même : l'accord de diffusion est le sien.
      licence_accepted_at: nowIso,
      reviewed_by: ctx.staff.id,
      reviewed_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select(SELECT)
    .single();

  if (error || !data) {
    // Bucket PUBLIC : un fichier sans ligne ne pourrait plus être retiré.
    await supabaseAdmin!.storage
      .from(TCG_BUCKET)
      .remove([path])
      .catch(() => undefined);
    const duplicate = error?.code === '23505';
    logger.error(
      '[admin/tcg/association] enregistrement impossible: %s',
      error?.message ?? 'aucune ligne'
    );
    return duplicate
      ? res.status(409).json({
          error: 'Ce logo est déjà une carte.',
          code: 'already_imported',
        })
      : res.status(500).json({ error: 'Enregistrement impossible.' });
  }

  const row = data as unknown as Row;
  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'create_tcg_association_card',
    entity_type: 'tcg_fanart',
    entity_id: row.id,
    tenant_id: ctx.tenantId,
    payload: {
      title: row.title,
      rarity: row.rarity,
      source: sourceRef ?? 'upload',
    },
  });

  return res.status(201).json({ item: toPayload(row) });
}

async function patch(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'admin-tcg-association-update'
    )
  ) {
    return;
  }
  const parsed = patchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Requête invalide.', code: 'VALIDATION' });
  }
  const body = parsed.data;
  const nowIso = new Date().toISOString();

  const update: Record<string, unknown> = { updated_at: nowIso };
  if (body.action === 'update') {
    if (body.title) update.title = body.title;
    if (body.credit) update.artist_name = body.credit;
    if (body.rarity) update.rarity = body.rarity;
  } else {
    update.status = body.action === 'revoke' ? 'revoked' : 'approved';
    update.reviewed_by = ctx.staff.id;
    update.reviewed_at = nowIso;
  }

  let query = supabaseAdmin!
    .from('tcg_fanart_cards')
    .update(update)
    .eq('tenant_id', ctx.tenantId)
    .eq('category', 'association')
    .eq('id', body.id);
  // Le statut de départ conditionne l'écriture : on ne retire que ce qui est
  // publié, on ne rétablit que ce qui est retiré.
  if (body.action === 'revoke') query = query.eq('status', 'approved');
  if (body.action === 'restore') query = query.eq('status', 'revoked');

  const { data, error } = await query.select(SELECT);
  if (error) {
    logger.error(
      '[admin/tcg/association] mise à jour impossible: %s',
      error.message
    );
    return res.status(500).json({ error: 'Mise à jour impossible.' });
  }
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) {
    return res.status(409).json({
      error: 'Carte introuvable ou déjà dans cet état.',
      code: 'conflict',
    });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action:
      body.action === 'update'
        ? 'update_tcg_association_card'
        : body.action === 'revoke'
          ? 'revoke_tcg_association_card'
          : 'restore_tcg_association_card',
    entity_type: 'tcg_fanart',
    entity_id: body.id,
    tenant_id: ctx.tenantId,
    payload: { title: rows[0].title, rarity: rows[0].rarity },
  });

  return res.status(200).json({ item: toPayload(rows[0]) });
}

export default withStaffRoute(handler, { permission: 'manage_tcg' });
