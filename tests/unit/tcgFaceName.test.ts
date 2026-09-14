// Unit tests — le NOM porté par une carte TCG.
//
// POURQUOI CE FICHIER : le panneau « Sujets les plus distribués » affichait
// « Sujet inconnu » en tête de classement. Les données étaient pourtant saines —
// le nom était là, dans `battle_tag`. Les joueuses des éditions passées n'ont
// pas de compte auth, donc jamais de `display_name` : leur nom vit dans le
// BattleTag, et le seed qui crée ces lignes le dit en toutes lettres.
//
// `readPlayerFaces` était le SEUL lecteur du dépôt à ne pas appliquer le repli
// `display_name ?? battle_tag` que font déjà le classement, la page de match et
// la carte OG. Comme toutes les surfaces TCG (collection, ouverture de paquet,
// overview staff) passent par lui, elles étaient toutes anonymes d'un coup.
//
// Le tag est MASQUÉ : une carte se regarde dans la collection d'autres joueuses
// et sur une fiche publique — exactement là où `utils/battleTag.ts` proscrit le
// discriminant numérique.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { readPlayerFaces } from '../../utils/tcg/readCardFaces';

const WITH_NAME = '11111111-1111-1111-1111-111111111111';
const TAG_ONLY = '22222222-2222-2222-2222-222222222222';
const NAMELESS = '33333333-3333-3333-3333-333333333333';

beforeEach(() => {
  resetSupabaseMock();
  store.player_ratings = [
    {
      user_id: WITH_NAME,
      tenant_id: CONFERENCE_TENANT_ID,
      display_name: 'Lili',
      battle_tag: 'Lili#1234',
      avatar_url: null,
    },
    {
      user_id: TAG_ONLY,
      tenant_id: CONFERENCE_TENANT_ID,
      display_name: null,
      battle_tag: 'Jaz#4422',
      avatar_url: null,
    },
    {
      user_id: NAMELESS,
      tenant_id: CONFERENCE_TENANT_ID,
      display_name: null,
      battle_tag: null,
      avatar_url: null,
    },
  ] as never;
});

describe('nom d’une face de carte', () => {
  it('garde le display_name quand il existe', async () => {
    const faces = await readPlayerFaces(CONFERENCE_TENANT_ID, [WITH_NAME]);
    expect(faces.get(WITH_NAME)?.displayName).toBe('Lili');
  });

  it('retombe sur le BattleTag, MASQUÉ, quand le display_name manque', async () => {
    // La régression : cette joueuse s'affichait « Sujet inconnu ».
    const faces = await readPlayerFaces(CONFERENCE_TENANT_ID, [TAG_ONLY]);
    expect(faces.get(TAG_ONLY)?.displayName).toBe('Jaz');
    // Le discriminant numérique ne doit JAMAIS sortir sur une carte.
    expect(faces.get(TAG_ONLY)?.displayName).not.toContain('#');
  });

  it('rend null quand il n’y a réellement aucun nom', async () => {
    // Le repli « Sujet inconnu » de l'interface garde alors tout son sens : il
    // ne doit disparaître que là où un nom existait bel et bien.
    const faces = await readPlayerFaces(CONFERENCE_TENANT_ID, [NAMELESS]);
    expect(faces.get(NAMELESS)?.displayName).toBeNull();
  });
});
