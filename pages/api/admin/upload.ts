// pages/api/admin/upload.ts
// Upload d'image (logo/bannière) vers le serveur
// Reçoit un fichier en base64 dans le body JSON, sauvegarde dans public/img/teams-images/

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute } from '@/utils/staff';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

const ALLOWED_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'img', 'teams-images');

export default withStaffRoute(handler, 'manager');

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { data, mimeType, filename } = req.body;

  if (!data || !mimeType) {
    return res.status(400).json({ error: 'Missing data or mimeType' });
  }

  // Valider le type MIME
  const ext = ALLOWED_TYPES[mimeType];
  if (!ext) {
    return res.status(400).json({
      error: `Type non supporté: ${mimeType}. Formats acceptés: PNG, JPEG, WebP.`,
    });
  }

  // Décoder le base64
  let buffer: Buffer;
  try {
    // Supprimer le préfixe data:image/...;base64, s'il existe
    const base64Data = data.replace(/^data:image\/\w+;base64,/, '');
    buffer = Buffer.from(base64Data, 'base64');
  } catch {
    return res.status(400).json({ error: 'Données base64 invalides' });
  }

  // Vérifier la taille (max 2 Mo)
  if (buffer.length > 2 * 1024 * 1024) {
    return res.status(400).json({ error: 'Image trop lourde (max 2 Mo)' });
  }

  // Générer un nom de fichier unique basé sur le nom original ou un hash
  const hash = crypto.randomBytes(8).toString('hex');
  const safeName = filename
    ? filename
        .replace(/\.[^.]+$/, '') // retirer l'extension
        .replace(/[^a-zA-Z0-9_-]/g, '_') // caractères safe uniquement
        .substring(0, 40)
    : 'logo';
  const finalFilename = `${safeName}-${hash}${ext}`;

  // S'assurer que le dossier existe
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const filePath = path.join(UPLOAD_DIR, finalFilename);

  // Vérifier que le chemin résolu reste bien dans UPLOAD_DIR (sécurité)
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(path.resolve(UPLOAD_DIR))) {
    return res.status(400).json({ error: 'Nom de fichier invalide' });
  }

  try {
    fs.writeFileSync(resolvedPath, buffer);
  } catch (err: any) {
    console.error('[upload] write error:', err);
    return res.status(500).json({ error: "Impossible d'écrire le fichier" });
  }

  const publicUrl = `/img/teams-images/${finalFilename}`;

  return res.status(200).json({
    url: publicUrl,
    filename: finalFilename,
  });
}
