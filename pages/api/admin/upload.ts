// pages/api/admin/upload.ts
// Upload d'image (logo/bannière) ou de PDF (règlement) vers Supabase Storage
// Reçoit un fichier en base64 dans le body JSON, sauvegarde dans le bucket "teams-images"
// (les PDFs sont rangés sous le préfixe "documents/")

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute } from '@/utils/staff';
import crypto from 'crypto';
import { supabaseAdmin } from '@/utils/supabase';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
};

const ALLOWED_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

const MAX_BYTES_BY_TYPE: Record<string, number> = {
  'image/png': 2 * 1024 * 1024,
  'image/jpeg': 2 * 1024 * 1024,
  'image/webp': 2 * 1024 * 1024,
  'application/pdf': 5 * 1024 * 1024,
};

const BUCKET = 'teams-images';

// Magic bytes signatures for allowed mime types
const MAGIC_BYTES: Record<string, number[][]> = {
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF header (bytes 8-11 checked separately)
  'application/pdf': [[0x25, 0x50, 0x44, 0x46, 0x2d]], // "%PDF-"
};

// "WEBP" at bytes 8-11 distinguishes WebP from other RIFF formats (WAV, AVI)
const WEBP_MARKER = [0x57, 0x45, 0x42, 0x50]; // "WEBP"

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signatures = MAGIC_BYTES[mimeType];
  if (!signatures) return false;
  const matchesHeader = signatures.some((sig) =>
    sig.every((byte, i) => buffer[i] === byte)
  );
  if (!matchesHeader) return false;
  // For WebP, also verify bytes 8-11 contain "WEBP"
  if (mimeType === 'image/webp') {
    return (
      buffer.length >= 12 &&
      WEBP_MARKER.every((byte, i) => buffer[8 + i] === byte)
    );
  }
  return true;
}

export default withStaffRoute(handler, 'manager');

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Service role key manquante côté serveur.' });
  }

  const { data, mimeType, filename } = req.body;

  if (!data || !mimeType) {
    return res.status(400).json({ error: 'Missing data or mimeType' });
  }

  // Valider le type MIME
  const ext = ALLOWED_TYPES[mimeType];
  if (!ext) {
    return res.status(400).json({
      error: `Type non supporté: ${mimeType}. Formats acceptés: PNG, JPEG, WebP, PDF.`,
    });
  }

  // Décoder le base64
  let buffer: Buffer;
  try {
    const base64Data = data.replace(/^data:[^;]+;base64,/, '');
    buffer = Buffer.from(base64Data, 'base64');
  } catch {
    return res.status(400).json({ error: 'Données base64 invalides' });
  }

  // Vérifier la taille
  const maxBytes = MAX_BYTES_BY_TYPE[mimeType];
  if (buffer.length > maxBytes) {
    const maxMo = Math.round(maxBytes / (1024 * 1024));
    return res
      .status(400)
      .json({ error: `Fichier trop lourd (max ${maxMo} Mo)` });
  }

  // Vérifier les magic bytes (le contenu correspond bien au type MIME déclaré)
  if (!validateMagicBytes(buffer, mimeType)) {
    return res.status(400).json({
      error: 'Le contenu du fichier ne correspond pas au type MIME déclaré.',
    });
  }

  // Générer un nom de fichier unique
  const hash = crypto.randomBytes(8).toString('hex');
  const isPdf = mimeType === 'application/pdf';
  const safeName = filename
    ? filename
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .substring(0, 40)
    : isPdf
      ? 'document'
      : 'logo';
  const filePath = isPdf
    ? `documents/${safeName}-${hash}${ext}`
    : `${safeName}-${hash}${ext}`;

  // Upload vers Supabase Storage
  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(filePath, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    console.error('[upload] Supabase Storage error:', uploadError);
    return res.status(500).json({
      error: "Impossible d'uploader le fichier",
      detail: uploadError.message,
    });
  }

  // Obtenir l'URL publique
  const { data: publicUrlData } = supabaseAdmin.storage
    .from(BUCKET)
    .getPublicUrl(filePath);

  return res.status(200).json({
    url: publicUrlData.publicUrl,
    filename: filePath,
  });
}
