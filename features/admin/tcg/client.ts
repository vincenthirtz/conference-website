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

// --- Autres écrans TCG (vague client 2). Les formes de réponse sont
// décrites par les panneaux qui les affichent (génériques), les réponses
// brutes sont normalisées par leur écran.

const TCG = '/api/admin/tcg';

export const tcgPaths = {
  battlenetBackfill: `${TCG}/battlenet-backfill`,
  grant: `${TCG}/grant`,
  welcomeGift: `${TCG}/welcome-gift`,
} as const;

export type TcgAssociationWrite = {
  method: 'POST' | 'PATCH';
  json: Record<string, unknown>;
};

export const tcgAdminClient = {
  overview: () => adminRequest<unknown>(`${TCG}/overview`),
  catalogue: <T>(userId: string | null) =>
    adminRequest<T>(
      `${TCG}/catalogue${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`
    ),
  engagement: <T>(weeks: number) =>
    adminRequest<T>(`${TCG}/engagement?weeks=${weeks}`),
  association: <T>() => adminRequest<T>(`${TCG}/association`),
  associationWrite: ({ method, json }: TcgAssociationWrite) =>
    adminRequest(`${TCG}/association`, { method, json, idempotent: true }),
  /** Recherche de joueuses (garde `manage_tcg`). */
  players: <T>(q: string, init?: { signal?: AbortSignal }) =>
    adminRequest<T>(`${TCG}/players?q=${encodeURIComponent(q)}`, init),
  battlenetBackfill: () => adminRequest<unknown>(tcgPaths.battlenetBackfill),
  welcomeGift: <T>() => adminRequest<T>(tcgPaths.welcomeGift),
  /**
   * Jeton d'overlay OBS : jamais mis en cache de requêtes (il donne accès à
   * l'overlay) — lu et gardé en état local par sa carte.
   */
  overlayToken: <T>() => adminRequest<T>(`${TCG}/overlay-token`),
  rotateOverlayToken: <T>(init: { method: 'POST' | 'DELETE' }) =>
    adminRequest<T>(`${TCG}/overlay-token`, { ...init, idempotent: true }),
  overlayTheme: <T>() => adminRequest<T>(`${TCG}/overlay-theme`),
  saveOverlayTheme: <T>(json: unknown) =>
    adminRequest<T>(`${TCG}/overlay-theme`, {
      method: 'PUT',
      json,
      idempotent: true,
    }),
};
