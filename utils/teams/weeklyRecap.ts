// utils/teams/weeklyRecap.ts
//
// Récap hebdomadaire d'équipe (N7) — cœur PUR.
//
// Le site attend qu'on vienne. Aucune restitution périodique, aucun bilan,
// aucun « voilà votre semaine » — alors que l'infrastructure existe et est
// éprouvée (outbox, dispatchers push/email, préférences par canal). Le
// déclencheur de retour n'avait simplement jamais été branché sur l'objet
// « équipe ».
//
// LA RÈGLE QUI DÉCIDE DE TOUT : `buildWeeklyRecap` renvoie `null` quand la
// semaine n'a rien à raconter, et l'appelant n'émet alors RIEN.
//
// Le piège à éviter, et il est subtil : certains constats sont CHRONIQUES
// (comptes non liés, créneau de noyau inexploité, débriefs en retard). Les
// traiter comme un motif d'envoi ferait partir le même message toutes les
// semaines à une équipe dormante — c'est-à-dire du spam, et la fin de la
// crédibilité du canal. Ils n'ouvrent donc JAMAIS un récap : ils ne font que
// s'ajouter à un récap qui avait déjà une raison d'exister.
//
// Ce qui ouvre un récap, c'est un ÉVÉNEMENT de la semaine : un affrontement
// joué, une variation de niveau, une proposition reçue.

export type RecapResult = 'win' | 'loss' | 'draw' | null;

export type RecapEncounter = {
  subjectType: 'match' | 'scrim';
  opponentName: string | null;
  result: RecapResult;
};

export type WeeklyRecapFacts = {
  /** Affrontements joués pendant la fenêtre. */
  encounters: RecapEncounter[];
  /**
   * Variation moyenne de niveau des membres notées pendant la fenêtre, déjà
   * arrondie. `null` si personne n'a été noté — pas 0 : ne pas savoir n'est
   * pas « n'a pas bougé ».
   */
  ratingDelta: number | null;
  /** Membres dont le niveau a bougé (donne son poids à `ratingDelta`). */
  ratedPlayers: number;
  /** Propositions de scrim reçues et encore sans réponse. */
  pendingProposals: number;
  /** Créneaux du noyau que l'équipe n'exploite pas (N6). */
  unusedCoreSlots: number;
  /** Affrontements joués et jamais débriefés (N2). */
  unreviewedEncounters: number;
  /** Membres sans Discord lié ou sans BattleTag vérifié (N3). */
  identityGaps: number;
};

export type WeeklyRecap = {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  /** Noms des adversaires de la semaine, dédupliqués, dans l'ordre rencontré. */
  opponents: string[];
  ratingDelta: number | null;
  ratedPlayers: number;
  pendingProposals: number;
  unusedCoreSlots: number;
  unreviewedEncounters: number;
  identityGaps: number;
};

/**
 * Un récap n'existe que si la semaine s'est passée quelque chose.
 *
 * Volontairement restreint aux faits DATÉS de la fenêtre. Les constats
 * chroniques en sont exclus (cf. en-tête) : ils enrichissent un récap, ils ne
 * le déclenchent pas.
 */
export function hasWeeklyActivity(facts: WeeklyRecapFacts): boolean {
  return (
    facts.encounters.length > 0 ||
    facts.pendingProposals > 0 ||
    facts.ratingDelta !== null
  );
}

/** Récap de la semaine, ou `null` s'il n'y a rien à envoyer. */
export function buildWeeklyRecap(facts: WeeklyRecapFacts): WeeklyRecap | null {
  if (!hasWeeklyActivity(facts)) return null;

  let wins = 0;
  let losses = 0;
  let draws = 0;
  const opponents: string[] = [];
  const seen = new Set<string>();

  for (const encounter of facts.encounters) {
    if (encounter.result === 'win') wins += 1;
    else if (encounter.result === 'loss') losses += 1;
    else if (encounter.result === 'draw') draws += 1;

    const name = encounter.opponentName?.trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      opponents.push(name);
    }
  }

  return {
    played: facts.encounters.length,
    wins,
    losses,
    draws,
    opponents,
    ratingDelta: facts.ratingDelta,
    ratedPlayers: facts.ratedPlayers,
    pendingProposals: facts.pendingProposals,
    unusedCoreSlots: facts.unusedCoreSlots,
    unreviewedEncounters: facts.unreviewedEncounters,
    identityGaps: facts.identityGaps,
  };
}

/**
 * Phrase de résumé, en français, telle qu'elle part en notification.
 *
 * Rendue ici plutôt que dans le catalogue d'events pour être testable sans
 * base ni transport, et pour que la règle « on n'écrit que ce qu'on sait »
 * reste au même endroit que le calcul : un récap sans affrontement ne parle
 * pas de bilan, un récap sans notation ne parle pas de niveau.
 */
export function renderRecapSummary(recap: WeeklyRecap): string {
  const parts: string[] = [];

  if (recap.played > 0) {
    const bilan = [
      recap.wins > 0 ? `${recap.wins} V` : null,
      recap.losses > 0 ? `${recap.losses} D` : null,
      recap.draws > 0 ? `${recap.draws} N` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    const nb =
      recap.played === 1 ? '1 affrontement' : `${recap.played} affrontements`;
    parts.push(bilan ? `${nb} (${bilan})` : nb);
  }

  if (recap.ratingDelta !== null && recap.ratingDelta !== 0) {
    const sign = recap.ratingDelta > 0 ? '+' : '';
    parts.push(`niveau ${sign}${recap.ratingDelta}`);
  }

  if (recap.pendingProposals > 0) {
    parts.push(
      recap.pendingProposals === 1
        ? '1 proposition en attente'
        : `${recap.pendingProposals} propositions en attente`
    );
  }

  if (recap.unusedCoreSlots > 0) {
    parts.push(
      recap.unusedCoreSlots === 1
        ? '1 créneau libre inexploité'
        : `${recap.unusedCoreSlots} créneaux libres inexploités`
    );
  }

  if (recap.unreviewedEncounters > 0) {
    parts.push(
      recap.unreviewedEncounters === 1
        ? '1 affrontement à débriefer'
        : `${recap.unreviewedEncounters} affrontements à débriefer`
    );
  }

  if (recap.identityGaps > 0) {
    parts.push(
      recap.identityGaps === 1
        ? '1 profil incomplet'
        : `${recap.identityGaps} profils incomplets`
    );
  }

  return parts.join(' · ');
}
