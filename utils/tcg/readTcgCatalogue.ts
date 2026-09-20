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
import {
  GAME_MASCOT_SLUGS,
  gameMascotDisplayName,
  gameMascotUrl,
} from './gameMascots';
import { cardSubjectKey } from './subjectKey';

export type CatalogueKind = 'player' | 'team' | 'map' | 'fanart' | 'mascot';

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
  /**
   * Combien de personnes DIFFÉRENTES possèdent cette carte, dans cet espace.
   *
   * C'est la rareté RÉELLE, celle que le barème ne dit pas : une carte
   * « commune » que personne n'a jamais tirée est plus rare, dans les faits,
   * qu'une légendaire distribuée à tout le monde. Un nombre, jamais un nom —
   * une collection reste personnelle.
   */
  holders: number;
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

/**
 * Combien de personnes distinctes possèdent chaque carte. Ne lève jamais.
 *
 * AGRÉGAT SEUL : on compte des porteuses, on n'en nomme aucune. La question
 * « qui possède quoi » a déjà sa réponse, nominative et gardée, dans le reste
 * de ce module — la mélanger ici l'exposerait à un écran qui n'en a pas besoin.
 */
async function readHolderCounts(
  tenantId: string
): Promise<Map<string, number> | null> {
  if (!supabaseAdmin) return null;

  const holders = new Map<string, Set<string>>();
  const PAGE = 1000;
  for (let page = 0; page < 200; page += 1) {
    const from = page * PAGE;
    const { data, error } = await supabaseAdmin
      .from('tcg_pack_cards')
      .select(
        'subject_kind, card_user_id, card_team_id, card_map_slug, card_fanart_id, card_mascot_slug, tcg_packs!inner(user_id, tenant_id, opened_at)'
      )
      .eq('tcg_packs.tenant_id', tenantId)
      .not('tcg_packs.opened_at', 'is', null)
      .is('recycled_at', null)
      .range(from, from + PAGE - 1);

    if (error) {
      logger.error(
        '[tcg/catalogue] comptage des détentrices impossible',
        error
      );
      return null;
    }
    const rows = (data ?? []) as unknown as Array<
      Record<string, unknown> & { tcg_packs?: { user_id?: string } }
    >;
    for (const row of rows) {
      const key = cardSubjectKey(row as Parameters<typeof cardSubjectKey>[0]);
      const owner = row.tcg_packs?.user_id;
      if (!key || !owner) continue;
      let set = holders.get(key);
      if (!set) {
        set = new Set();
        holders.set(key, set);
      }
      set.add(owner);
    }
    if (rows.length < PAGE) break;
  }

  const counts = new Map<string, number>();
  for (const [key, set] of holders) counts.set(key, set.size);
  return counts;
}

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
        'subject_kind, card_user_id, card_team_id, card_map_slug, card_fanart_id, card_mascot_slug'
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

  const [playerFaces, teamFaces, fanartFaces, mapFaces, ownedKeys, holders] =
    await Promise.all([
      readPlayerFaces(tenantId, playerIds),
      readTeamFaces(tenantId, teamIds),
      readFanartFaces(tenantId, fanartIds),
      readMapFaces(mapSlugs),
      ownerUserId
        ? readOwnedKeys(tenantId, ownerUserId)
        : Promise.resolve(null),
      readHolderCounts(tenantId),
    ]);

  // Une lecture de possession en échec ne doit pas faire passer une collection
  // pour VIDE : mieux vaut refuser que d'afficher « ne possède rien ».
  if (ownerUserId && ownedKeys === null) {
    return { ok: false, error: 'collection illisible' };
  }

  const owns = (key: string) => (ownedKeys ? ownedKeys.has(key) : false);
  // Un comptage indisponible vaut zéro détentrice AFFICHÉE, pas une erreur :
  // le catalogue reste lisible sans lui, c'est une colonne de contexte.
  const holdersOf = (key: string) => holders?.get(key) ?? 0;
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
      holders: holdersOf(key),
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
      holders: holdersOf(key),
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
      holders: holdersOf(key),
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
      holders: holdersOf(key),
    });
  }
  // Les mascottes, comme les maps : leur vivier EST le registre en mémoire,
  // celui que le tirage reçoit (`GAME_MASCOT_SLUGS`). Rien à lire en base, et
  // leur figurine est une route — jamais un fichier stocké.
  for (const slug of GAME_MASCOT_SLUGS) {
    const key = `mascot:${slug}`;
    cards.push({
      key,
      kind: 'mascot',
      id: slug,
      // `?? slug` comme partout ici : un libellé n'est jamais vide.
      label: gameMascotDisplayName(slug) ?? slug,
      imageUrl: gameMascotUrl(slug),
      owned: owns(key),
      holders: holdersOf(key),
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
