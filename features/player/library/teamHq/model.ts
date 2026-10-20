// features/player/library/teamHq/model.ts — logique PURE des QG d'équipe de la
// Women's Library (lot 9 de docs/PLAN-womens-library.md) : quel message pour
// quel `code`, où mène la porte d'un QG, et si un meuble prêté tient à la
// place où on veut le déplacer. Sans réseau ni React : testé seul.
//
// LA GÉOMÉTRIE EST CELLE DE L'API (`placement.ts`, copie synchronisée, et
// `service/teamHqSpot.ts` côté API) : un meuble ne sort pas de la salle et ne
// chevauche aucun meuble de son calque, quelle qu'en soit la prêteuse. Le
// formulaire de déplacement le dit AVANT l'envoi ; l'API le revérifie.

import { libraryErrorCode } from '../model';
import {
  type GeometryReason,
  isPlacementInBounds,
  type PlacementSpec,
  placementRect,
  rectsOverlap,
} from '../placement';
import type { LibraryLentItem } from '../teamHqResponses';

/** L'adresse d'une salle de la Library (l'écran `RoomScreen`). */
export function teamHqRoomHref(roomId: string): string {
  return `/player/library?room=${encodeURIComponent(roomId)}`;
}

/** Les codes de refus que le panneau traduit (`playerLibraryTeamHq.codes`). */
export const TEAM_HQ_ERROR_KEYS = [
  'room_forbidden',
  'room_not_found',
  'team_not_found',
  'team_hq_members_only',
  'team_hq_no_space',
  'team_hq_full',
  'item_not_lent',
  'return_forbidden',
  'item_placed_elsewhere',
  'room_conflict',
  'placement_invalid',
  'library_unavailable',
] as const;
export type TeamHqErrorKey = (typeof TEAM_HQ_ERROR_KEYS)[number] | 'generic';

const KNOWN: ReadonlySet<string> = new Set(TEAM_HQ_ERROR_KEYS);

/** La clé de traduction d'une erreur de l'API (`generic` si inconnue). */
export function teamHqErrorKey(err: unknown): TeamHqErrorKey {
  const code = libraryErrorCode(err);
  return code && KNOWN.has(code) ? (code as TeamHqErrorKey) : 'generic';
}

/** L'issue d'un geste : le résultat, ou la clé de traduction du refus. */
export type TeamHqResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: TeamHqErrorKey; error: unknown };

export async function settleTeamHq<T>(
  run: () => Promise<T>
): Promise<TeamHqResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    return { ok: false, code: teamHqErrorKey(error), error };
  }
}

/** Ce qui empêche un meuble prêté de tenir à `target` ; vide = il tient. */
export type MoveIssue = GeometryReason | 'unknown_furniture';

/**
 * La même règle que l'API (`spotIssues`) : `target` dans la salle (un cadre
 * dos au mur du fond), sans chevaucher un meuble du même calque — le meuble
 * déplacé lui-même excepté.
 */
export function moveIssues(
  room: { width: number; depth: number },
  items: readonly Pick<
    LibraryLentItem,
    'inventoryId' | 'key' | 'gx' | 'gy' | 'rotation'
  >[],
  specs: ReadonlyMap<string, PlacementSpec>,
  target: {
    inventoryId: string;
    key: string;
    gx: number;
    gy: number;
    rotation: number;
  }
): MoveIssue[] {
  const spec = specs.get(target.key);
  if (!spec) return ['unknown_furniture'];
  const out: MoveIssue[] = [];
  if (!isPlacementInBounds(target, spec, room)) out.push('out_of_bounds');
  const rect = placementRect(target, spec);
  const overlaps = items.some((other) => {
    if (other.inventoryId === target.inventoryId) return false;
    const otherSpec = specs.get(other.key);
    return (
      !!otherSpec &&
      otherSpec.layer === spec.layer &&
      rectsOverlap(rect, placementRect(other, otherSpec))
    );
  });
  if (overlaps) out.push('overlap');
  return out;
}

/** Les meubles prêtés, les miens d'abord, puis par nom de prêteuse. */
export function sortLentItems(
  items: readonly LibraryLentItem[]
): LibraryLentItem[] {
  return [...items].sort((a, b) => {
    if (a.mine !== b.mine) return a.mine ? -1 : 1;
    return (a.ownerNickname ?? '').localeCompare(b.ownerNickname ?? '');
  });
}
