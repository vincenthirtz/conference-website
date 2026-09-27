// /api/tournament/[id]/qr — le QR code du lien d'inscription d'un tournoi.
//
//   GET /api/tournament/<uuid>/qr?size=512&format=png|svg
//
// Une image, pas une page : elle se colle dans un email (les clients mail
// bloquent les `data:` URI, il leur faut une URL https), sur une affiche ou
// dans une scène OBS. Le lien encodé est celui que choisit
// `tournamentRegisterHref` — formulaire solo pour un événement « chacune pour
// soi », wizard d'équipe sinon — pour qu'un scan tombe au bon endroit DÈS LE
// DÉPART, sans rebond.
//
// UUID SEULEMENT, jamais le slug. Un slug se devine (`halloween-2026`) : servir
// le QR d'un tournoi encore privé à partir de son slug révélerait qu'il
// existe. L'UUID ne se devine pas, et le staff doit pouvoir imprimer
// l'affiche AVANT la publication. Le QR ne contient que le lien : la page
// d'inscription reste en 404 tant que le tournoi n'est pas public.

import type { NextApiRequest, NextApiResponse } from 'next';
import QRCode from 'qrcode';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { findTournamentByIdOrSlug } from '@/utils/tournamentLookup';
import { tournamentRegisterHref } from '@/utils/tournaments/registerHref';
import { getSiteUrl } from '@/utils/onboard';

const DEFAULT_SIZE = 512;

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Côté du carré en pixels, borné : assez pour une affiche, pas un DoS. */
export function parseQrSize(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return DEFAULT_SIZE;
  return Math.min(1024, Math.max(128, n));
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'tournament-qr'))
    return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = firstParam(req.query.id);
  if (!id || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tournament ID' });
  }

  const tournament = await findTournamentByIdOrSlug<{
    id: string;
    solo_mode: boolean | null;
  }>(id, 'id, solo_mode');
  if (!tournament) {
    return res.status(404).json({ error: 'Tournament not found' });
  }

  const url = `${getSiteUrl()}${tournamentRegisterHref(tournament)}`;
  const size = parseQrSize(firstParam(req.query.size));
  // Correction d'erreur « M » (15 %) : un QR imprimé survit à un pli ou une
  // tache, sans devenir aussi dense qu'en « H ».
  const options = {
    errorCorrectionLevel: 'M' as const,
    margin: 2,
    width: size,
  };

  // Le lien ne change pas pour un tournoi donné (seul `solo_mode` le décide) :
  // un jour de cache CDN suffit, et tolère une bascule solo ↔ équipe.
  res.setHeader(
    'Cache-Control',
    'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'
  );

  if (firstParam(req.query.format) === 'svg') {
    res.setHeader('Content-Type', 'image/svg+xml');
    return res
      .status(200)
      .send(await QRCode.toString(url, { ...options, type: 'svg' }));
  }

  res.setHeader('Content-Type', 'image/png');
  return res.status(200).send(await QRCode.toBuffer(url, options));
}
