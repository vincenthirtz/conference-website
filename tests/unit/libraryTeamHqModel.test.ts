// Women's Library, lot 9 — la logique PURE des QG d'équipe
// (`features/player/library/teamHq/model.ts`) :
//   * un refus de l'API devient une clé de traduction connue (sinon `generic`),
//     et chaque clé a sa traduction, en français et en anglais ;
//   * le formulaire de déplacement juge une place comme l'API (`spotIssues`) :
//     dans la salle, un cadre dos au mur, aucun chevauchement d'un meuble du
//     même calque — le meuble déplacé excepté ;
//   * la porte mène à `/player/library?room=<id>`.

import { describe, expect, it } from 'vitest';
import { PlayerHttpError } from '../../utils/player/playerHttp';
import {
  moveIssues,
  sortLentItems,
  TEAM_HQ_ERROR_KEYS,
  teamHqErrorKey,
  teamHqRoomHref,
} from '../../features/player/library/teamHq/model';
import { LIBRARY_TEAM_HQ_CODES } from '../../features/player/library/teamHqResponses';
import type { PlacementSpec } from '../../features/player/library/placement';
import nsTeamHq from '../../lib/i18n/locales/fr/playerLibraryTeamHq';
import enTeamHq from '../../lib/i18n/locales/en/playerLibraryTeamHq';

const refusal = (status: number, code?: string) =>
  new PlayerHttpError('refus', status, { error: 'refus', code });

const SPECS = new Map<string, PlacementSpec>([
  ['chair', { footprint: { w: 1, d: 1 }, layer: 'object' }],
  ['armchair', { footprint: { w: 2, d: 2 }, layer: 'object' }],
  ['rug_red', { footprint: { w: 3, d: 2 }, layer: 'floor' }],
  ['frame_painting', { footprint: { w: 2, d: 1 }, layer: 'wall' }],
]);
const ROOM = { width: 20, depth: 16 };

const lent = (
  inventoryId: string,
  key: string,
  gx: number,
  gy: number,
  over: Partial<{
    mine: boolean;
    ownerNickname: string | null;
    rotation: number;
  }> = {}
) => ({
  inventoryId,
  key,
  gx,
  gy,
  rotation: over.rotation ?? 0,
  ownerUserId: `owner-${inventoryId}`,
  ownerNickname: over.ownerNickname ?? null,
  mine: over.mine ?? false,
});

describe('teamHqErrorKey', () => {
  it('les codes du QG et du placement sont des clés connues', () => {
    expect(teamHqErrorKey(refusal(409, 'team_hq_no_space'))).toBe(
      'team_hq_no_space'
    );
    expect(teamHqErrorKey(refusal(403, 'room_forbidden'))).toBe(
      'room_forbidden'
    );
    expect(teamHqErrorKey(refusal(409, 'item_placed_elsewhere'))).toBe(
      'item_placed_elsewhere'
    );
  });

  it('un code inconnu, une panne réseau : generic', () => {
    expect(teamHqErrorKey(refusal(500, 'boom'))).toBe('generic');
    expect(teamHqErrorKey(new Error('offline'))).toBe('generic');
  });

  it('chaque code du QG rendu par l’API est traduit', () => {
    for (const code of Object.values(LIBRARY_TEAM_HQ_CODES)) {
      expect(TEAM_HQ_ERROR_KEYS as readonly string[]).toContain(code);
    }
  });

  it('chaque clé a sa traduction, en français et en anglais', () => {
    for (const key of [...TEAM_HQ_ERROR_KEYS, 'generic' as const]) {
      expect(nsTeamHq.fr.codes[key], key).toBeTruthy();
      expect(enTeamHq.codes[key], key).toBeTruthy();
    }
  });
});

describe('moveIssues — la règle de l’API, avant l’envoi', () => {
  const items = [
    lent('mine', 'chair', 0, 0, { mine: true }),
    lent('other', 'armchair', 4, 4),
  ];

  it('une place libre : rien', () => {
    expect(
      moveIssues(ROOM, items, SPECS, {
        inventoryId: 'mine',
        key: 'chair',
        gx: 10,
        gy: 10,
        rotation: 0,
      })
    ).toEqual([]);
  });

  it('sur le meuble d’une autre : overlap ; hors de la salle : out_of_bounds', () => {
    expect(
      moveIssues(ROOM, items, SPECS, {
        inventoryId: 'mine',
        key: 'chair',
        gx: 5,
        gy: 5,
        rotation: 0,
      })
    ).toEqual(['overlap']);
    expect(
      moveIssues(ROOM, items, SPECS, {
        inventoryId: 'mine',
        key: 'chair',
        gx: 20,
        gy: 0,
        rotation: 0,
      })
    ).toEqual(['out_of_bounds']);
  });

  it('le meuble déplacé ne se gêne pas lui-même ; un tapis passe sous un fauteuil', () => {
    expect(
      moveIssues(ROOM, items, SPECS, {
        inventoryId: 'mine',
        key: 'chair',
        gx: 0,
        gy: 0,
        rotation: 1,
      })
    ).toEqual([]);
    expect(
      moveIssues(ROOM, items, SPECS, {
        inventoryId: 'rug',
        key: 'rug_red',
        gx: 4,
        gy: 4,
        rotation: 0,
      })
    ).toEqual([]);
  });

  it('un cadre ne va que dos au mur du fond', () => {
    expect(
      moveIssues(ROOM, [], SPECS, {
        inventoryId: 'f',
        key: 'frame_painting',
        gx: 3,
        gy: 0,
        rotation: 0,
      })
    ).toEqual([]);
    expect(
      moveIssues(ROOM, [], SPECS, {
        inventoryId: 'f',
        key: 'frame_painting',
        gx: 3,
        gy: 2,
        rotation: 0,
      })
    ).toEqual(['out_of_bounds']);
  });

  it('un meuble sorti du catalogue : unknown_furniture', () => {
    expect(
      moveIssues(ROOM, items, SPECS, {
        inventoryId: 'x',
        key: 'gone',
        gx: 1,
        gy: 1,
        rotation: 0,
      })
    ).toEqual(['unknown_furniture']);
  });
});

describe('teamHqRoomHref et sortLentItems', () => {
  it('la porte mène à l’écran de la salle', () => {
    expect(teamHqRoomHref('00000000-0000-4000-8000-0000000000a1')).toBe(
      '/player/library?room=00000000-0000-4000-8000-0000000000a1'
    );
  });

  it('mes meubles d’abord, puis par prêteuse', () => {
    const sorted = sortLentItems([
      lent('a', 'chair', 0, 0, { ownerNickname: 'Zoé' }),
      lent('b', 'chair', 1, 0, { mine: true }),
      lent('c', 'chair', 2, 0, { ownerNickname: 'Alba' }),
    ]);
    expect(sorted.map((i) => i.inventoryId)).toEqual(['b', 'c', 'a']);
  });
});
