// utils/tcg/battlenetBackfillModel.ts
//
// Lecture, côté carte d'administration, des réponses de
// `GET/POST /api/admin/tcg/battlenet-backfill`. Module PUR, sans une ligne de
// JSX ni d'accès serveur : la carte l'importe, les tests aussi.
//
// POURQUOI SÉPARÉ DU MODULE SERVEUR. `battlenetBackfill.ts` importe
// `supabaseAdmin` et `crypto` : l'importer depuis un composant ferait entrer le
// client service-role et des polyfills Node dans le bundle navigateur, sans
// aucune erreur. Les types sont redéclarés ici plutôt qu'importés.
//
// LA CONVENTION DU TABLEAU DE BORD : `null` = « pas mesurable », jamais zéro.

export type BackfillSimulation = {
  eligible: number;
  alreadyRewarded: number;
  wouldGrant: number;
  discordDms: number | null;
  outsideSpace: number;
  ready: boolean;
  reward: { coins: number };
};

export type BackfillReport = {
  eligible: number;
  granted: number;
  already: number;
  errors: number;
  reward: { coins: number };
};

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function coinsOf(raw: unknown): number | null {
  const coins = count((raw as { coins?: unknown } | null)?.coins);
  return coins !== null && coins > 0 ? coins : null;
}

/**
 * Une simulation exploitable, ou `null`.
 *
 * Une réponse de forme inattendue ne doit pas armer le bouton : mieux vaut
 * l'écran d'erreur qu'une confirmation qui annoncerait « NaN comptes ».
 */
export function normalizeBackfillSimulation(
  raw: unknown
): BackfillSimulation | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const eligible = count(r.eligible);
  const alreadyRewarded = count(r.alreadyRewarded);
  const wouldGrant = count(r.wouldGrant);
  const outsideSpace = count(r.outsideSpace);
  const coins = coinsOf(r.reward);
  if (
    eligible === null ||
    alreadyRewarded === null ||
    wouldGrant === null ||
    outsideSpace === null ||
    coins === null ||
    typeof r.ready !== 'boolean'
  ) {
    return null;
  }
  return {
    eligible,
    alreadyRewarded,
    wouldGrant,
    discordDms: count(r.discordDms),
    outsideSpace,
    ready: r.ready,
    reward: { coins },
  };
}

export function normalizeBackfillReport(raw: unknown): BackfillReport | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const eligible = count(r.eligible);
  const granted = count(r.granted);
  const already = count(r.already);
  const errors = count(r.errors);
  const coins = coinsOf(r.reward);
  if (
    eligible === null ||
    granted === null ||
    already === null ||
    errors === null ||
    coins === null
  ) {
    return null;
  }
  return { eligible, granted, already, errors, reward: { coins } };
}

/**
 * Le bouton n'est armé que s'il y a quelque chose à créditer ET que la source
 * est écrivable. Sinon chaque clic produirait des erreurs par dizaines.
 */
export function canDistribute(sim: BackfillSimulation | null): boolean {
  return Boolean(sim?.ready && sim.wouldGrant > 0);
}

/** Ce que la confirmation récapitule : combien, combien chacune, combien au total. */
export function confirmFigures(sim: BackfillSimulation): {
  count: number;
  coins: number;
  total: number;
  dms: number | null;
} {
  return {
    count: sim.wouldGrant,
    coins: sim.reward.coins,
    total: sim.wouldGrant * sim.reward.coins,
    dms: sim.discordDms,
  };
}

/**
 * La tonalité du résultat.
 *
 * `partial` dès qu'UNE écriture a échoué, même si d'autres ont réussi : un
 * succès vert qui cache des échecs est précisément ce qui a laissé 58 comptes
 * sans paquet le 2026-09-14. `nothing` n'est pas une erreur : une relance
 * n'a, par construction, rien à créditer.
 */
export function backfillOutcome(
  report: BackfillReport
): 'granted' | 'partial' | 'nothing' {
  if (report.errors > 0) return 'partial';
  if (report.granted > 0) return 'granted';
  return 'nothing';
}
