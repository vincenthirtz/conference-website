// features/player/library/model.ts — logique PURE de l'écran « Mon
// appartement » (lot 4 de docs/PLAN-womens-library.md) : quelle porte
// montrer, quel message pour quel `code`, quel nom pour quel meuble, quels
// meubles sont posés ou rangés. Sans réseau ni React : testé seul.

import { resolveApartmentDecor } from '@/config/library/decor';
import { placementLayerOf, type PlacementSpec } from './placement';
import type {
  LibraryApartmentAccess,
  LibraryApartmentRoom,
  LibraryBuyResponse,
  LibraryCatalogItem,
  LibraryInventoryItem,
  LibraryMeResponse,
} from './responses';
import type { UpdateApartmentInput } from './schemas';

/**
 * L'écran à montrer, d'après la lecture de `me` :
 *   - `attest`  : 403 `LIBRARY_ADULT_REQUIRED` → la case « 18 ans ou plus » ;
 *   - `minor`   : 403 `LIBRARY_MINOR` → refus bienveillant, lien vers /securite ;
 *   - `banned`  : 403 `LIBRARY_BANNED` → message neutre ;
 *   - `closed`  : 403 `LIBRARY_CLOSED` → « pas encore ouverte » (bêta
 *     fermée, `LIBRARY_ACCESS` côté API), sans réessai ;
 *   - `unavailable` : 503 (migration absente, panne passagère) ;
 *   - `error`   : toute autre panne (jamais une Library vide inventée).
 */
export type LibraryGate =
  | 'loading'
  | 'attest'
  | 'minor'
  | 'banned'
  | 'closed'
  | 'unavailable'
  | 'error'
  | 'ready';

/**
 * La forme d'une `ApiHttpError` (utils/http/authedRequest), lue sans
 * l'importer : ce module reste pur (pas de routeur ni de client Supabase).
 */
type HttpErrorLike = { status: number; code: string | null; payload: unknown };

function asHttpError(err: unknown): HttpErrorLike | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as Partial<HttpErrorLike>;
  return typeof e.status === 'number'
    ? { status: e.status, code: e.code ?? null, payload: e.payload ?? null }
    : null;
}

/** Le `code` stable d'une erreur de l'API, ou null. */
export function libraryErrorCode(err: unknown): string | null {
  return asHttpError(err)?.code ?? null;
}

/** Un champ du corps d'erreur (`balance`, `version`, `issues`…). */
export function libraryErrorField(err: unknown, field: string): unknown {
  const payload = asHttpError(err)?.payload;
  return payload && typeof payload === 'object'
    ? (payload as Record<string, unknown>)[field]
    : undefined;
}

/** Un champ numérique du corps d'erreur, ou null. */
export function libraryErrorNumber(err: unknown, field: string): number | null {
  const value = libraryErrorField(err, field);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function libraryGateOf(state: {
  isPending: boolean;
  error: unknown;
}): LibraryGate {
  if (state.error) {
    switch (libraryErrorCode(state.error)) {
      case 'LIBRARY_ADULT_REQUIRED':
        return 'attest';
      case 'LIBRARY_MINOR':
        return 'minor';
      case 'LIBRARY_BANNED':
        return 'banned';
      case 'LIBRARY_CLOSED':
        return 'closed';
      default:
        return asHttpError(state.error)?.status === 503
          ? 'unavailable'
          : 'error';
    }
  }
  return state.isPending ? 'loading' : 'ready';
}

/** `coffee_table` → « coffee table » : un nom lisible pour une clé non traduite. */
export function humanizeKey(key: string): string {
  return key.replace(/_+/g, ' ').trim();
}

/** Le nom traduit d'un meuble, sinon sa clé lisible. */
export function furnitureName(
  names: Readonly<Record<string, string>>,
  key: string
): string {
  return Object.hasOwn(names, key) ? names[key] : humanizeKey(key);
}

/** Les specs de placement du catalogue de l'API (la même source que l'API). */
export function placementSpecsOf(
  furniture: readonly LibraryCatalogItem[]
): Map<string, PlacementSpec> {
  return new Map(
    furniture.map((f) => [
      f.key,
      { footprint: { ...f.footprint }, layer: placementLayerOf(f) },
    ])
  );
}

/** Un meuble de l'inventaire, regroupé par clé : combien, combien posés. */
export type InventoryGroup = {
  key: string;
  total: number;
  placed: number;
  /** Lignes d'inventaire de ce meuble, rangées d'abord. */
  ids: string[];
};

export function groupInventory(
  inventory: readonly LibraryInventoryItem[],
  placedIds: ReadonlySet<string>
): InventoryGroup[] {
  const groups = new Map<string, InventoryGroup>();
  for (const item of inventory) {
    let g = groups.get(item.key);
    if (!g) {
      g = { key: item.key, total: 0, placed: 0, ids: [] };
      groups.set(item.key, g);
    }
    g.total += 1;
    if (placedIds.has(item.id)) {
      g.placed += 1;
      g.ids.push(item.id);
    } else {
      g.ids.unshift(item.id);
    }
  }
  return [...groups.values()];
}

/**
 * `me` après un achat réussi : le solde du REGISTRE (relu sous verrou) et le
 * meuble ajouté — une seule fois, même pour un achat rejoué (`replayed`).
 */
export function applyPurchase(
  me: LibraryMeResponse,
  purchase: LibraryBuyResponse,
  now: Date = new Date()
): LibraryMeResponse {
  const known = me.inventory.some((i) => i.id === purchase.inventoryId);
  return {
    ...me,
    balance: purchase.balance,
    inventory: known
      ? me.inventory
      : [
          ...me.inventory,
          {
            id: purchase.inventoryId,
            key: purchase.key,
            acquiredAt: now.toISOString(),
          },
        ],
  };
}

/**
 * Le corps du `PATCH apartment` : seulement ce qui diffère de la salle
 * enregistrée. Un nom vidé = `null` (nom par défaut) ; « listé » suppose
 * « ouvert », comme en base. Décor (lot 12) : comparé au décor COMPLET de la
 * salle (`resolveApartmentDecor`) ; quand le formulaire porte `window`, c'est
 * lui qui part (l'API en déduit `wall`), sinon `wall` comme au lot 4.
 */
export function apartmentSettingsPatch(
  room: LibraryApartmentRoom,
  form: {
    name: string;
    access: LibraryApartmentAccess;
    listed: boolean;
    floor: string;
    wall: string;
    finish?: string;
    window?: string;
    door?: string;
  }
): UpdateApartmentInput {
  const out: UpdateApartmentInput = {};
  const name = form.name.trim() === '' ? null : form.name;
  if (name !== room.name) out.name = name;
  if (form.access !== room.access) out.access = form.access;
  const listed = form.access === 'open' && form.listed;
  if (listed !== room.listed) out.listed = listed;
  const saved = resolveApartmentDecor(room.decor);
  const decor: NonNullable<UpdateApartmentInput['decor']> = {};
  if (form.floor !== saved.floor) decor.floor = form.floor;
  if (form.window !== undefined) {
    if (form.window !== saved.window) decor.window = form.window;
  } else if (form.wall !== saved.wall) decor.wall = form.wall;
  if (form.finish !== undefined && form.finish !== saved.finish)
    decor.finish = form.finish;
  if (form.door !== undefined && form.door !== saved.door)
    decor.door = form.door;
  if (Object.keys(decor).length > 0) out.decor = decor;
  return out;
}

/** Combien de lignes d'inventaire par clé (pastille « possédé » de la boutique). */
export function ownedCounts(
  inventory: readonly LibraryInventoryItem[]
): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of inventory) out.set(item.key, (out.get(item.key) ?? 0) + 1);
  return out;
}
