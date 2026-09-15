// utils/tcg/battlenetRewardDisplay.ts
//
// Ce que l'espace joueuse montre de la récompense « compte Battle.net vérifié » :
// la promesse avant (« vérifier te rapporte N pièces »), la confirmation après
// (« +N pièces créditées »).
//
// MODULE PUR, sans accès serveur : la carte `BattlenetVerifyCard` l'importe
// (le module de l'écrivain, lui, tire `supabaseAdmin` et `crypto` — l'importer
// côté client ferait entrer le client service-role dans le bundle). Le callback
// l'importe aussi, pour que le paramètre de retour s'écrive au même endroit
// qu'il se lit : deux orthographes libres finiraient par diverger, et le
// bandeau ne s'afficherait plus jamais, sans erreur.
//
// AUCUN MONTANT ICI. Le nombre vient de l'API (`GET /api/player/battlenet-status`,
// champ `reward`), qui le lit dans le registre `earnSources.ts`.

/** Nom du paramètre ajouté au retour d'OAuth quand la récompense est créditée. */
export const TCG_REWARD_QUERY_PARAM = 'tcg';
/** Sa seule valeur : la récompense de vérification Battle.net. */
export const TCG_REWARD_BATTLENET = 'battlenet_reward';

export type BattlenetRewardOffer = {
  /** Montant du registre. */
  coins: number;
  /** Faux si déjà reçue, OU si l'état est illisible : on ne promet pas à l'aveugle. */
  claimable: boolean;
};

/**
 * Ajoute `tcg=battlenet_reward` à une URL de retour déjà munie de ses
 * paramètres. Additif : les autres paramètres (`battlenet`, `welcome`…) restent.
 */
export function withBattlenetRewardParam(url: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${TCG_REWARD_QUERY_PARAM}=${TCG_REWARD_BATTLENET}`;
}

/** Une offre exploitable, ou `null` (absente, désactivée, forme aberrante). */
export function normalizeRewardOffer(
  raw: unknown
): BattlenetRewardOffer | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { coins?: unknown; claimable?: unknown };
  if (
    typeof r.coins !== 'number' ||
    !Number.isInteger(r.coins) ||
    r.coins <= 0 ||
    typeof r.claimable !== 'boolean'
  ) {
    return null;
  }
  return { coins: r.coins, claimable: r.claimable };
}

type StatusLike = {
  configured?: boolean;
  linked?: boolean;
  reward?: unknown;
};

/**
 * Le montant à annoncer sur la carte, ou `null` pour ne rien dire.
 *
 * Seulement quand la vérification est POSSIBLE (feature configurée), PAS
 * ENCORE FAITE, et la récompense encore RÉCLAMABLE : promettre des pièces à
 * qui les a déjà reçues serait un mensonge que le serveur démentirait au retour.
 */
export function rewardHintCoins(status: StatusLike | null): number | null {
  if (!status?.configured || status.linked) return null;
  const offer = normalizeRewardOffer(status.reward);
  return offer?.claimable ? offer.coins : null;
}

/**
 * Le montant à confirmer au retour d'OAuth, ou `null`.
 *
 * Le paramètre seul ne suffit pas : il vient de l'URL, donc de n'importe qui.
 * Le montant, lui, vient de l'API. Un paramètre forgé affiche au pire, à la
 * personne qui l'a forgé, un montant exact qu'elle n'a pas reçu — rien n'est
 * crédité par l'affichage.
 */
export function creditedRewardCoins(
  queryValue: unknown,
  status: StatusLike | null
): number | null {
  if (queryValue !== TCG_REWARD_BATTLENET) return null;
  return normalizeRewardOffer(status?.reward)?.coins ?? null;
}
