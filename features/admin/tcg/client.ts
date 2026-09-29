// features/admin/tcg/client.ts — files de modération TCG (fan-arts, photos
// de carte) affichées dans /admin/tcg, L10. Les autres écrans TCG ne sont pas
// encore migrés.

import { adminRequest } from '@/utils/admin/adminHttp';

export type FanartStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

export type FanartItem = {
  id: string;
  title: string;
  artistName: string;
  artistUrl: string | null;
  imageUrl: string | null;
  status: FanartStatus;
  rarity: string | null;
  reviewNotes: string | null;
  createdAt: string;
};

export type FanartList = {
  items: FanartItem[];
  status: FanartStatus;
  rarities: string[];
  defaultRarity: string;
};

export type FanartDecision = {
  action: 'approve' | 'reject' | 'revoke';
  id: string;
  rarity?: string;
  notes?: string;
};

export type PhotoDecision = {
  userId: string;
  photoPath: string;
  decision: 'approve' | 'reject';
  reason: string | null;
};

const FANART = '/api/admin/tcg/fanart';
const PHOTOS = '/api/admin/tcg/photos';

export const tcgModerationClient = {
  fanart: (status: FanartStatus) =>
    adminRequest<FanartList>(`${FANART}?status=${status}`),
  decideFanart: (body: FanartDecision) =>
    adminRequest(FANART, { method: 'PATCH', json: body, idempotent: true }),
  /** Réponse brute : normalisée par `normalizePendingPhotos`. */
  photos: () => adminRequest<unknown>(PHOTOS),
  decidePhoto: (body: PhotoDecision) =>
    adminRequest(PHOTOS, { method: 'PATCH', json: body, idempotent: true }),
};
