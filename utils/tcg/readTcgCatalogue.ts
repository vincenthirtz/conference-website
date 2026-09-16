// utils/tcg/readTcgCatalogue.ts
//
// LE CATALOGUE d'un espace : toutes les cartes qui peuvent exister, et — quand
// on nomme une joueuse — lesquelles elle possède.
//
// POURQUOI PAS LA ROUTE JOUEUSE. `/api/player/tcg/collection` répond la même
// question pour SOI, mais sa logique vit dans son handler, avec sa pagination,
// ses curseurs et ses séries. L'extraire pour la partager aurait restructuré un
// endpoint du parcours joueuse — en production, très lu — pour le confort d'une
// vue de staff. Ce module compose donc les MÊMES briques partagées
// (`readDrawPool`, les lecteurs de faces) plutôt que de déplacer du code éprouvé.
//
// UNE LECTURE À PART POUR LES CARTES POSSÉDÉES. `readOwnedCardRows` ne
// sélectionne pas `card_fanart_id` : son appelant historique n'en avait pas
// besoin. L'élargir aurait changé ce que reçoit le parcours joueuse ; on lit
// donc ici, avec la colonne en plus, en réutilisant `readOpenedPackIds` pour la
// partie délicate — un paquet FERMÉ ne contient encore rien, et ses cartes
// n'existent en base qu'à l'ouverture.
//
// LE VIVIER, PAS LA TABLE. Les cartes listées sont celles qu'un paquet peut
// donner (`readDrawPool` + le registre de maps), et non toutes les lignes déjà
// distribuées : une carte retirée du vivier n'a plus à figurer dans ce qu'on
// présente comme « le TCG de cet espace ».

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { readDrawPool } from './readDrawPool';
import { readOpenedPackIds } from './readOwnedCards';
import {
  readPlayerFaces,
  readTeamFaces,
  readFanartFaces,
} from './readCardFaces';
import { readMapFaces, MAP_POOL_SLUGS } from './readMapFaces';
import { cardSubjectKey } from './subjectKey';

export type CatalogueKind = 'player' | 'team' | 'map' | 'fanart';

export type CatalogueCard = {
  /** `<type>:<identifiant>` — la même clé que partout ailleurs. */
  key: string;
  kind: CatalogueKind;
  id: string;
  /** Ce qu'on lit sur la carte. Jamais vide : repli sur l'identifiant. */
  label: string;
  imageUrl: string | null;
  /** Toujours `false` quand aucune joueuse n'est demandée. */
  owned: boolean;
};

export type CatalogueResult =
  | {
      ok: true;
      value: {
        cards: CatalogueCard[];
        /** Cartes distinctes possédées par la joueuse demandée. */
        ownedCount: number;
      };
    }
  | { ok: false; error: string };

/** Les cartes encore possédées, par clé de sujet. Ne lève jamais. */
async function readOwnedKeys(
  tenantId: string,
  userId: string
): Promise<Set<string> | null> {
  if (!supabaseAdmin) return null;

  const packs = await readOpenedPackIds(tenantId, userId);
  if (!packs.ok) return null;
  if (packs.value.length === 0) return new Set();

  const keys = new Set<string>();
  // Par tranches : PostgREST plafonne une réponse, et un `.in()` trop long
  // devient une URL refusée par le serveur.
  const CHUNK = 200;
  for (let i = 0; i < packs.value.length; i += CHUNK) {
    const chunk = packs.value.slice(i, i + CHUNK);
    const { data, error } = await supabaseAdmin
      .from('tcg_pack_cards')
      .select(
        'subject_kind, card_user_id, card_team_id, card_map_slug, card_fanart_id'
      )
      .in('pack_id', chunk)
      // Une carte recyclée a été rendue : elle n'est plus possédée.
      .is('recycled_at', null);

    if (error) {
      logger.error('[tcg/catalogue] cartes possédées illisibles', error);
      return null;
    }
    for (const row of data ?? []) {
      const key = cardSubjectKey(row as Parameters<typeof cardSubjectKey>[0]);
      if (key) keys.add(key);
    }
  }
  return keys;
}

/**
 * Le catalogue de l'espace, éventuellement annoté pour une joueuse.
 *
 * `ownerUserId` doit avoir été VÉRIFIÉ rattaché à l'espace par l'appelant : ce
 * module lit une collection personnelle, il ne décide pas qui a le droit de la
 * voir.
 */
export async function readTcgCatalogue(
  tenantId: string,
  ownerUserId: string | null
): Promise<CatalogueResult> {
  const pool = await readDrawPool(tenantId);
  if (!pool.ok) return { ok: false, error: pool.error };

  const { playerIds, teamIds, fanartIds } = pool.value;
  const mapSlugs = [...MAP_POOL_SLUGS];

  const [playerFaces, teamFaces, fanartFaces, mapFaces, ownedKeys] =
    await Promise.all([
      readPlayerFaces(tenantId, playerIds),
      readTeamFaces(tenantId, teamIds),
      readFanartFaces(tenantId, fanartIds),
      readMapFaces(mapSlugs),
      ownerUserId
        ? readOwnedKeys(tenantId, ownerUserId)
        : Promise.resolve(null),
    ]);

  // Une lecture de possession en échec ne doit pas faire passer une collection
  // pour VIDE : mieux vaut refuser que d'afficher « ne possède rien ».
  if (ownerUserId && ownedKeys === null) {
    return { ok: false, error: 'collection illisible' };
  }

  const owns = (key: string) => (ownedKeys ? ownedKeys.has(key) : false);
  const cards: CatalogueCard[] = [];

  for (const id of playerIds) {
    const face = playerFaces.get(id);
    const key = `player:${id}`;
    cards.push({
      key,
      kind: 'player',
      id,
      label: face?.displayName ?? id,
      imageUrl: face?.imageUrl ?? null,
      owned: owns(key),
    });
  }
  for (const id of teamIds) {
    const face = teamFaces.get(id);
    const key = `team:${id}`;
    cards.push({
      key,
      kind: 'team',
      id,
      label: face?.name ?? face?.shortName ?? id,
      imageUrl: face?.logoUrl ?? null,
      owned: owns(key),
    });
  }
  for (const slug of mapSlugs) {
    const face = mapFaces.get(slug);
    const key = `map:${slug}`;
    cards.push({
      key,
      kind: 'map',
      id: slug,
      label: face?.name ?? slug,
      imageUrl: face?.imageUrl ?? null,
      owned: owns(key),
    });
  }
  for (const id of fanartIds) {
    const face = fanartFaces.get(id);
    const key = `fanart:${id}`;
    cards.push({
      key,
      kind: 'fanart',
      id,
      label: face?.title ?? id,
      imageUrl: face?.imageUrl ?? null,
      owned: owns(key),
    });
  }

  return {
    ok: true,
    value: {
      cards,
      ownedCount: cards.reduce((n, c) => n + (c.owned ? 1 : 0), 0),
    },
  };
}
