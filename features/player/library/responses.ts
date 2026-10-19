// features/player/library/responses.ts — réponses des routes de la Women's
// Library, lues par l'interface du site (copie synchronisée).
//
// Types et constantes PURS, à part des services : le site ne tire jamais un
// `service/` ni un `repository/` (apiOwnershipGuard), même pour un type. Les
// services importent leurs types de réponse d'ici ; une forme qui change ici
// change là-bas, à la synchro suivante.

import type { FurnitureCategory } from '../../../config/library/furniture';
import type { LibraryApartmentDecor } from '../../../config/library/decor';

/**
 * Les refus d'ACCÈS (403) : le client les lit pour choisir un écran, pas un
 * message. Le lot 5 (policy temps réel) réutilise les mêmes.
 */
export const LIBRARY_ACCESS_CODES = {
  /** Pas d'attestation de majorité : l'écran « j'ai 18 ans ou plus ». */
  adultRequired: 'LIBRARY_ADULT_REQUIRED',
  /** Bannissement en cours, posé par le staff. */
  banned: 'LIBRARY_BANNED',
  /** Adhérente dont la date de naissance connue la rend mineure. */
  minor: 'LIBRARY_MINOR',
} as const;
export type LibraryAccessCode =
  (typeof LIBRARY_ACCESS_CODES)[keyof typeof LIBRARY_ACCESS_CODES];

export type LibraryAvatarView = {
  nickname: string;
  avatarId: string;
  /** Apparence libre (lot 10) ; `{}` tant qu'elle n'existe pas. */
  look: Record<string, unknown>;
};

/** `GET /api/player/library/catalog` — une entrée du catalogue. */
export type LibraryCatalogItem = {
  key: string;
  category: FurnitureCategory;
  /** Empreinte au sol à la rotation 0, en cases de `tileSizeM`. */
  footprint: { w: number; d: number };
  heightM: number;
  price: number;
  sittable: boolean;
  stackable: boolean;
  /**
   * Calque de collision : `object` (bloque la marche, aucune case partagée
   * avec un autre objet), `floor` (tapis), `wall` (accroché au mur du fond).
   */
  layer: 'object' | 'floor' | 'wall';
};

/** `GET /api/player/library/catalog`. */
export type LibraryCatalogResponse = {
  tileSizeM: number;
  rotations: number;
  furniture: LibraryCatalogItem[];
  avatars: string[];
};

/** `POST /api/player/library/attest-adult`. */
export type LibraryAttestResponse = {
  attested: true;
  /** Date de la PREMIÈRE attestation. */
  attestedAt: string;
  avatar: LibraryAvatarView;
};

export type LibraryInventoryItem = {
  id: string;
  key: string;
  acquiredAt: string;
};

/** `GET /api/player/library/me`. */
export type LibraryMeResponse = {
  attested: true;
  attestedAt: string;
  avatar: LibraryAvatarView;
  inventory: LibraryInventoryItem[];
  /** La borne de lecture est atteinte : d'autres meubles existent. */
  inventoryTruncated: boolean;
  /** Solde en cache du porte-monnaie TCG (le même que l'écran TCG). */
  balance: number;
};

/** `POST /api/player/library/furniture/buy`. */
export type LibraryBuyResponse = {
  inventoryId: string;
  key: string;
  price: number;
  /** Solde après l'achat (celui du registre, relu sous verrou). */
  balance: number;
  /** Vrai si cette requête REJOUE un achat déjà fait : rien n'a été débité. */
  replayed: boolean;
};

/** `PUT /api/player/library/avatar`. */
export type LibraryAvatarResponse = { avatar: LibraryAvatarView };

/* ------------------------------------------- Mon appartement (lot 4) --- */

/** Qui entre : la propriétaire seule (`private`) ou toute joueuse (`open`). */
export type LibraryApartmentAccess = 'private' | 'open';

/** L'appartement de la joueuse, tel que l'interface l'affiche. */
export type LibraryApartmentRoom = {
  id: string;
  /** `null` = pas de nom choisi : l'interface affiche un nom par défaut. */
  name: string | null;
  access: LibraryApartmentAccess;
  /** Listé dans le hall ; seulement possible si `access` vaut `open`. */
  listed: boolean;
  /** Dimensions en cases de 0,5 m. */
  width: number;
  depth: number;
  decor: LibraryApartmentDecor;
  /** À renvoyer à l'enregistrement des meubles (contrôle de concurrence). */
  version: number;
};

/** Un meuble posé : sa ligne d'inventaire, sa clé du catalogue, sa case. */
export type LibraryApartmentItem = {
  inventoryId: string;
  key: string;
  gx: number;
  gy: number;
  /** Quart de tour horaire, 0 à 3. */
  rotation: number;
};

/**
 * `GET /api/player/library/apartment` et `PUT …/apartment/items` : la salle
 * et ses meubles posés (les autres meubles de l'inventaire sont rangés).
 */
export type LibraryApartmentResponse = {
  room: LibraryApartmentRoom;
  items: LibraryApartmentItem[];
};

/** `PATCH /api/player/library/apartment`. */
export type LibraryApartmentSettingsResponse = { room: LibraryApartmentRoom };

/**
 * Pourquoi un meuble ne peut pas être posé là (400 `placement_invalid`,
 * `issues[]`). `unknown_furniture` : sa clé est sortie du catalogue.
 */
export const LIBRARY_PLACEMENT_REASONS = [
  'out_of_bounds',
  'overlap',
  'not_owned',
  'duplicate',
  'unknown_furniture',
] as const;
export type LibraryPlacementReason = (typeof LIBRARY_PLACEMENT_REASONS)[number];

export type LibraryPlacementIssue = {
  inventoryId: string;
  reason: LibraryPlacementReason;
};

/** Codes des refus de l'appartement que l'interface traduit. */
export const LIBRARY_APARTMENT_CODES = {
  placementInvalid: 'placement_invalid',
  /** La version envoyée n'est plus la bonne : recharger (`version` rendue). */
  roomConflict: 'room_conflict',
  itemPlacedElsewhere: 'item_placed_elsewhere',
  roomNameInvalid: 'room_name_invalid',
  roomNameRefused: 'room_name_refused',
  decorInvalid: 'decor_invalid',
  /** `listed: true` sur un appartement privé. */
  listedRequiresOpen: 'listed_requires_open',
} as const;
