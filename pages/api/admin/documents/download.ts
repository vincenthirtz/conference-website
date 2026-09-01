// pages/api/admin/documents/download.ts
//
// Télécharge un document du Drive de l'association, à travers le site.
//
// GET ?fileId=<id>&folderId=<id>
//
// Auth : `read_documents`. Route SÉPARÉE de /api/admin/documents parce qu'elle
// répond un flux binaire, pas du JSON — les mélanger obligerait le handler à
// changer de nature selon un paramètre.
//
// POURQUOI SERVIR LE CONTENU, alors que la v1 s'y refusait : quelqu'un qui a le
// droit sur le site mais n'est pas dans la liste de partage Google se prenait un
// refus en cliquant « Ouvrir dans Drive ». Le site disait oui, Google non.
//
// Ce que ça déplace : `read_documents` devient la seule chose entre un PV d'AG
// et Internet. D'où trois précautions, et pas une de moins :
//   - le confinement (dossier dans l'arborescence, fichier enfant de ce
//     dossier) est celui de la liste et de la corbeille, pas une variante ;
//   - le jeton demandé est en LECTURE SEULE ;
//   - chaque téléchargement est journalisé, nommément.

import type { NextApiRequest, NextApiResponse } from 'next';
import { Readable } from 'node:stream';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import {
  DriveConfigError,
  downloadDriveFile,
  isDriveConfigured,
} from '@/utils/googleDrive';

export const config = {
  api: {
    // On relaie un flux : Next ne doit pas tenter d'en faire du JSON, et la
    // limite de taille par défaut ne s'applique pas à une réponse.
    bodyParser: false,
    responseLimit: false,
  },
};

/**
 * Nom de fichier pour `Content-Disposition`. Deux formes, comme le veut la
 * RFC 6266 : une version ASCII sûre pour les clients anciens, et `filename*`
 * en UTF-8 pour tous les autres — sans quoi « Règlement.pdf » arrive en
 * « R_glement.pdf » chez les uns et casse l'en-tête chez les autres.
 */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  // Plus serré que la liste : un téléchargement coûte de la bande passante, et
  // une boucle qui aspire le Drive se remarque ici.
  if (applyRateLimit(req, res, { max: 30, windowMs: 60_000 })) return;

  if (!(await isDriveConfigured(ctx.tenantId))) {
    res.status(409).json({ error: 'Le Drive n’est pas configuré.' });
    return;
  }

  const fileId = typeof req.query.fileId === 'string' ? req.query.fileId : '';
  const folderId =
    typeof req.query.folderId === 'string' ? req.query.folderId : null;
  if (!fileId) {
    res.status(400).json({ error: 'fileId requis.' });
    return;
  }

  try {
    const file = await downloadDriveFile({
      fileId,
      folderId,
      tenantId: ctx.tenantId,
    });

    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'download_association_document',
      entity_type: 'drive_file',
      entity_id: fileId,
      tenant_id: ctx.tenantId,
      permission: ctx.permission ?? null,
      payload: { name: file.filename, folderId },
    });

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', contentDisposition(file.filename));
    if (file.size) res.setHeader('Content-Length', String(file.size));
    // Un document de l'asso n'a rien à faire dans un cache partagé.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Relais en FLUX : un PV scanné de 40 Mo ne passe pas par la mémoire du
    // serveur, et le téléchargement démarre sans attendre la fin.
    await new Promise<void>((resolve, reject) => {
      const stream = Readable.fromWeb(file.body as never);
      stream.on('error', reject);
      res.on('close', resolve);
      stream.pipe(res).on('finish', resolve);
    });
  } catch (err) {
    if (err instanceof DriveConfigError) {
      res.status(400).json({ error: err.message });
      return;
    }
    logger.error('[admin/documents/download] failed', err);
    // Si l'en-tête est déjà parti, on ne peut plus répondre proprement : on
    // coupe, et le client verra un téléchargement incomplet plutôt qu'un
    // fichier valide et tronqué.
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.status(502).json({ error: 'Le Drive n’a pas répondu.' });
  }
}

export default withStaffRoute(handler, { permission: 'read_documents' });
