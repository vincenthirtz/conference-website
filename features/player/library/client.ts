// features/player/library/client.ts — appels typés de la Women's Library
// (lot 4 de docs/PLAN-womens-library.md). Les URLs vivent ici, nulle part
// ailleurs dans le module (ui/ ne touche pas le réseau).
//
// Routes « soi seulement » (`subject: 'self'`) : aucune portée `?as=` n'est
// posée — une inspection staff les recevrait en 403 `subject_unsupported`.
//
// L'ACHAT porte une `Idempotency-Key` (`idempotent: true`) : elle devient la
// référence de l'achat en base, ce qui tient même quand deux requêtes jumelles
// arrivent ensemble. L'ENREGISTREMENT DES MEUBLES n'en porte pas : il envoie
// l'état complet et la version lue, le rejouer ne change rien de plus.
// Une erreur HTTP lève `PlayerHttpError` (`code` stable, `payload` complet).

import { playerRequest } from '@/utils/player/playerHttp';
import type {
  LibraryApartmentResponse,
  LibraryApartmentSettingsResponse,
  LibraryApartmentViewResponse,
  LibraryAttestResponse,
  LibraryAvatarResponse,
  LibraryBuyResponse,
  LibraryCatalogResponse,
  LibraryMeResponse,
} from './responses';
import type {
  SaveApartmentItemsInput,
  UpdateApartmentInput,
  UpdateAvatarInput,
} from './schemas';

export const libraryUrls = {
  catalog: '/api/player/library/catalog',
  me: '/api/player/library/me',
  attestAdult: '/api/player/library/attest-adult',
  buy: '/api/player/library/furniture/buy',
  avatar: '/api/player/library/avatar',
  apartment: '/api/player/library/apartment',
  apartmentItems: '/api/player/library/apartment/items',
} as const;

export const libraryClient = {
  catalog: () => playerRequest<LibraryCatalogResponse>(libraryUrls.catalog),
  /** 403 `LIBRARY_ADULT_REQUIRED` / `LIBRARY_MINOR` / `LIBRARY_BANNED` : la porte. */
  me: () => playerRequest<LibraryMeResponse>(libraryUrls.me),
  attestAdult: () =>
    playerRequest<LibraryAttestResponse>(libraryUrls.attestAdult, {
      method: 'POST',
      json: { adult: true },
      idempotent: true,
    }),
  buy: (key: string) =>
    playerRequest<LibraryBuyResponse>(libraryUrls.buy, {
      method: 'POST',
      json: { key },
      idempotent: true,
    }),
  updateAvatar: (input: UpdateAvatarInput) =>
    playerRequest<LibraryAvatarResponse>(libraryUrls.avatar, {
      method: 'PUT',
      json: input,
      idempotent: true,
    }),
  /** Lot 14d : `starterKit` sur la seule lecture qui vient d'offrir le kit. */
  apartment: () =>
    playerRequest<LibraryApartmentViewResponse>(libraryUrls.apartment),
  updateApartment: (input: UpdateApartmentInput) =>
    playerRequest<LibraryApartmentSettingsResponse>(libraryUrls.apartment, {
      method: 'PATCH',
      json: input,
      idempotent: true,
    }),
  /** État complet + version lue (409 `room_conflict` si elle a bougé). */
  saveItems: (body: SaveApartmentItemsInput) =>
    playerRequest<LibraryApartmentResponse>(libraryUrls.apartmentItems, {
      method: 'PUT',
      json: body,
    }),
};
