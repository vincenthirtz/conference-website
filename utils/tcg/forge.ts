// utils/tcg/forge.ts
//
// LA FORGE — trois doublons d'une même rareté, plus des pièces, contre UNE
// carte d'une rareté supérieure que l'on ne possède pas.
//
// POURQUOI ELLE EXISTE. Au 2026-09-27, la production disait : 10 805 pièces
// gagnées, **zéro dépensée**. Le booster à 300 pièces était le seul débit, et
// il offrait « plus de la même chose » — douze comptes pouvaient se l'offrir,
// aucun ne l'a fait. Pendant ce temps les doublons s'entassaient : le recyclage
// à 30 pièces avait servi UNE fois en tout.
//
// La forge relie les deux : elle consomme ce qui ne servait à rien pour rendre
// ce qui manque. Car ce qui manque est identifiable — la meilleure collection
// réunissait 3 équipes sur 10 et 3 maps sur 22, et personne n'avait jamais
// complété une série.
//
// LA CONTREPARTIE EST DÉFAVORABLE AU VOLUME, FAVORABLE À LA COLLECTION. On
// abandonne 3 doublons (90 pièces au recyclage) et on en paie 150, soit 240
// pièces pour UNE carte — contre 300 pour cinq. Mais cette carte-là est d'un
// palier supérieur et n'est pas déjà dans la collection. On ne fabrique donc
// pas une légendaire à bon compte ; on cible.
//
// CE MODULE EST PUR. Les règles se lisent et se testent sans base : c'est lui
// qui décide ce qu'une joueuse peut forger, et l'endpoint ne fait qu'écrire.

import { FORGE_DUPLICATES_REQUIRED, FORGE_FEE_COINS } from './economy';
import { RARITY_ORDER, type TcgRarity } from './rarity';

export { FORGE_DUPLICATES_REQUIRED, FORGE_FEE_COINS };

/**
 * La rareté juste au-dessus, ou `null` au sommet.
 *
 * `legendary` ne se forge pas EN une rareté supérieure : il n'y en a pas. C'est
 * un refus explicite et non un repli silencieux sur le même palier — sinon on
 * prendrait trois légendaires pour en rendre une.
 */
export function nextRarity(rarity: TcgRarity): TcgRarity | null {
  const index = RARITY_ORDER.indexOf(rarity);
  if (index < 0 || index >= RARITY_ORDER.length - 1) return null;
  return RARITY_ORDER[index + 1] ?? null;
}

/** Une carte possédée, réduite à ce dont la forge a besoin. */
export type ForgeCandidate = {
  packId: string;
  position: number;
  rarity: TcgRarity;
  /**
   * Identité du SUJET, pas de l'exemplaire : c'est elle qui fait le doublon.
   * Deux cartes de la même joueuse partagent leur clé, quel que soit le paquet
   * dont elles sortent.
   */
  subjectKey: string;
  /** Une carte déjà recyclée n'existe plus, même si la ligne reste. */
  recycled: boolean;
};

export type ForgeRefusal =
  /** Moins de trois cartes désignées, ou des doublons ailleurs. */
  | 'not_enough'
  /** Les cartes désignées ne sont pas toutes de la même rareté. */
  | 'mixed_rarity'
  /** Rareté au sommet : rien au-dessus à forger. */
  | 'top_rarity'
  /** Une des cartes désignées n'est pas un doublon, ou n'existe pas. */
  | 'not_a_duplicate'
  /** Solde insuffisant. */
  | 'insufficient_funds';

export type ForgePlan =
  | {
      ok: true;
      /** Les cartes à consommer, dans l'ordre reçu. */
      consume: readonly ForgeCandidate[];
      fromRarity: TcgRarity;
      /** Palier dans lequel tirer la carte rendue. */
      targetRarity: TcgRarity;
      feeCoins: number;
    }
  | { ok: false; reason: ForgeRefusal };

/**
 * Peut-on forger avec ces cartes, et que faut-il consommer ?
 *
 * `owned` est la collection ENTIÈRE de la joueuse : la notion de doublon n'a de
 * sens que sur l'ensemble. Une carte désignée qui serait son seul exemplaire
 * d'un sujet est refusée — « forger un doublon » ne doit jamais devenir
 * « détruire sa collection », même par un clic mal placé. C'est le même refus
 * explicite que le recyclage (`not_a_duplicate`).
 */
export function planForge(input: {
  /** Cartes désignées par la joueuse (paquet + position). */
  selection: readonly { packId: string; position: number }[];
  /** Toute la collection, doublons compris. */
  owned: readonly ForgeCandidate[];
  balance: number;
}): ForgePlan {
  if (input.selection.length !== FORGE_DUPLICATES_REQUIRED) {
    return { ok: false, reason: 'not_enough' };
  }

  const byKey = new Map(
    input.owned
      .filter((c) => !c.recycled)
      .map((c) => [`${c.packId}:${c.position}`, c] as const)
  );

  const consume: ForgeCandidate[] = [];
  for (const wanted of input.selection) {
    const card = byKey.get(`${wanted.packId}:${wanted.position}`);
    if (!card) return { ok: false, reason: 'not_a_duplicate' };
    // Une même carte désignée deux fois ne fait pas deux cartes.
    if (
      consume.some(
        (c) => c.packId === card.packId && c.position === card.position
      )
    ) {
      return { ok: false, reason: 'not_enough' };
    }
    consume.push(card);
  }

  // Chaque carte consommée doit rester un DOUBLON une fois retirée : on compte
  // les exemplaires vivants de son sujet, et on retranche ceux que cette même
  // forge consomme déjà.
  const liveBySubject = new Map<string, number>();
  for (const card of input.owned) {
    if (card.recycled) continue;
    liveBySubject.set(
      card.subjectKey,
      (liveBySubject.get(card.subjectKey) ?? 0) + 1
    );
  }
  const consumedBySubject = new Map<string, number>();
  for (const card of consume) {
    consumedBySubject.set(
      card.subjectKey,
      (consumedBySubject.get(card.subjectKey) ?? 0) + 1
    );
  }
  for (const [subjectKey, taken] of consumedBySubject) {
    const live = liveBySubject.get(subjectKey) ?? 0;
    // Il doit rester au moins un exemplaire du sujet APRÈS la forge.
    if (live - taken < 1) return { ok: false, reason: 'not_a_duplicate' };
  }

  const rarities = new Set(consume.map((c) => c.rarity));
  if (rarities.size !== 1) return { ok: false, reason: 'mixed_rarity' };
  const fromRarity = consume[0].rarity;

  const targetRarity = nextRarity(fromRarity);
  if (!targetRarity) return { ok: false, reason: 'top_rarity' };

  if (input.balance < FORGE_FEE_COINS) {
    return { ok: false, reason: 'insufficient_funds' };
  }

  return {
    ok: true,
    consume,
    fromRarity,
    targetRarity,
    feeCoins: FORGE_FEE_COINS,
  };
}
