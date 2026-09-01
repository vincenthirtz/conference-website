// pages/api/admin/documents.ts
//
// Le Drive de l'association — statuts, PV d'AG, rapports, factures, dossier de
// partenariat. Voir docs/ETUDE-drive-et-chat.md pour le pourquoi.
//
// GET    ?folderId=&search=   → liste un dossier            (read_documents)
// POST   { name, mimeType, contentBase64, folderId? } → dépose  (manage_documents)
// DELETE ?fileId=             → met à la corbeille         (manage_documents)
//
// DEUX DROITS, pas un. Consulter les statuts et déposer une pièce ne sont pas
// le même geste : la garde de la route est `read_documents`, et les deux
// méthodes d'écriture re-vérifient `manage_documents`. Ni le caster, ni
// l'arbitre, ni le bénévole n'ont l'un ou l'autre — un PV d'AG nomme des
// personnes physiques.
//
// CE QUE CETTE ROUTE NE FAIT PAS, volontairement : servir le contenu d'un
// fichier. Elle renvoie des liens Drive, donc c'est GOOGLE qui applique le
// partage — une défense de plus, pas une de moins. Une route
// `/documents/[id]/download` ferait de `read_documents` la seule chose entre un
// PV d'AG et Internet.

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { roleHasStaffPermission } from '@/utils/staffPermissions';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import {
  DRIVE_UPLOAD_MAX_BYTES,
  DriveConfigError,
  DriveUploadError,
  isDriveConfigured,
  listDriveFiles,
  trashDriveFile,
  uploadDriveFile,
} from '@/utils/googleDrive';

/** Le corps d'un dépôt. Base64, comme `/api/admin/upload.ts`. */
type UploadBody = {
  name?: unknown;
  mimeType?: unknown;
  contentBase64?: unknown;
  folderId?: unknown;
};

export const config = {
  api: {
    // 25 Mo de fichier ≈ 34 Mo en base64. La marge évite un 413 opaque juste
    // sous la limite annoncée à l'utilisateur.
    bodyParser: { sizeLimit: '36mb' },
  },
};

/**
 * `true` si l'appelant peut écrire. La garde de la route ne couvre que la
 * lecture : l'écriture se re-vérifie ici, sur le rôle réel de l'appelant.
 */
function canWrite(ctx: AuthenticatedStaffContext): boolean {
  return roleHasStaffPermission(ctx.role, 'manage_documents');
}

async function handleList(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const folderId =
    typeof req.query.folderId === 'string' ? req.query.folderId : null;
  const search = typeof req.query.search === 'string' ? req.query.search : null;

  const listing = await listDriveFiles({ folderId, search });

  // Le NOM des fichiers divulgue autant que leur contenu : une liste où figure
  // « Sanction-<pseudo>-2026.pdf » est déjà une information sur quelqu'un. La
  // consultation se journalise donc comme n'importe quelle lecture sensible.
  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'read_association_documents',
    entity_type: 'drive_folder',
    entity_id: listing.folderId,
    tenant_id: ctx.tenantId,
    permission: ctx.permission ?? null,
    payload: {
      folder: listing.folderName,
      count: listing.files.length,
      ...(search ? { search } : {}),
    },
  });

  res
    .status(200)
    .json({ configured: true, canWrite: canWrite(ctx), ...listing });
}

async function handleUpload(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const body = (req.body ?? {}) as UploadBody;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';
  const contentBase64 =
    typeof body.contentBase64 === 'string' ? body.contentBase64 : '';
  const folderId = typeof body.folderId === 'string' ? body.folderId : null;

  if (!name || !mimeType || !contentBase64) {
    res.status(400).json({ error: 'name, mimeType et contentBase64 requis.' });
    return;
  }

  const content = Buffer.from(contentBase64, 'base64');
  if (content.byteLength === 0) {
    res.status(400).json({ error: 'Fichier vide ou base64 invalide.' });
    return;
  }
  if (content.byteLength > DRIVE_UPLOAD_MAX_BYTES) {
    res.status(413).json({ error: 'Fichier trop volumineux (25 Mo maximum).' });
    return;
  }

  const file = await uploadDriveFile({ folderId, name, mimeType, content });

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'upload_association_document',
    entity_type: 'drive_file',
    entity_id: file.id,
    tenant_id: ctx.tenantId,
    permission: 'manage_documents',
    payload: { name: file.name, mimeType, bytes: content.byteLength, folderId },
  });

  res.status(201).json({ file });
}

async function handleTrash(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const fileId = typeof req.query.fileId === 'string' ? req.query.fileId : '';
  if (!fileId) {
    res.status(400).json({ error: 'fileId requis.' });
    return;
  }

  await trashDriveFile(fileId);

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'trash_association_document',
    entity_type: 'drive_file',
    entity_id: fileId,
    tenant_id: ctx.tenantId,
    permission: 'manage_documents',
    payload: null,
  });

  // « Corbeille », pas « supprimé » : Drive garde trente jours, et le message
  // doit dire ce qui s'est réellement passé.
  res.status(200).json({ trashed: true });
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const isList = req.method === 'GET';
  const isUpload = req.method === 'POST';
  const isTrash = req.method === 'DELETE';

  if (!isList && !isUpload && !isTrash) {
    res.setHeader('Allow', 'GET, POST, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Les écritures sont plus rares et plus coûteuses : quota distinct.
  if (
    applyRateLimit(
      req,
      res,
      isList ? { max: 60, windowMs: 60_000 } : { max: 20, windowMs: 60_000 }
    )
  ) {
    return;
  }

  if ((isUpload || isTrash) && !canWrite(ctx)) {
    res.status(403).json({
      error: 'Droit « Déposer des documents » requis.',
    });
    return;
  }

  // Non configuré ≠ en panne. La page affiche alors la marche à suivre, au lieu
  // d'un bandeau rouge qui laisse croire à un incident.
  if (!isDriveConfigured()) {
    if (!isList) {
      res.status(409).json({ error: 'Le Drive n’est pas configuré.' });
      return;
    }
    res
      .status(200)
      .json({ configured: false, canWrite: false, files: [], breadcrumb: [] });
    return;
  }

  try {
    if (isList) return await handleList(req, res, ctx);
    if (isUpload) return await handleUpload(req, res, ctx);
    return await handleTrash(req, res, ctx);
  } catch (err) {
    if (err instanceof DriveUploadError || err instanceof DriveConfigError) {
      res.status(400).json({ configured: true, error: err.message });
      return;
    }
    logger.error('[admin/documents] drive call failed', err);
    res.status(502).json({
      configured: true,
      error: 'Le Drive n’a pas répondu. Réessayer dans un instant.',
    });
  }
}

export default withStaffRoute(handler, { permission: 'read_documents' });
