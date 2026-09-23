// utils/mvp/awards.ts
//
// Dépouillement PUR du MVP : des voix → une MVP de match, des MVP de match →
// une MVP de journée, des MVP de journée → une MVP de tournoi. Zéro I/O.
//
// TROIS DÉCISIONS ENCODÉES ICI, toutes contre-intuitives au premier regard :
//
// 1. ENTRE DEUX SOURCES, TWITCH PASSE DEVANT — mais seulement s'il a des voix.
//    Le bot ouvre un vote dans le fil de CHAQUE match ; sur un match diffusé,
//    le chat du live vote aussi. Sur ces matchs-là, c'est le public qui a
//    regardé la partie qui tranche. Un vote Twitch VIDE (match non diffusé, ou
//    personne n'a joué le jeu) ne doit évidemment pas annuler 40 voix Discord :
//    le repli est explicite, pas implicite.
//
// 2. LA MVP DE JOURNÉE SE JOUE À LA PART DES VOIX, PAS AU NOMBRE.
//    Une journée = 4 matchs, et une joueuse n'en dispute qu'un. Comparer les
//    voix brutes reviendrait à couronner presque toujours quelqu'un du match
//    diffusé, simplement parce qu'on y vote dix fois plus. La part (voix de la
//    gagnante / voix exprimées dans SON match) compare des adhésions, pas des
//    audiences. Le nombre brut ne sert qu'à départager.
//
// 3. UN VOTE TROP MAIGRE OU UNE ÉGALITÉ EN TÊTE NE DÉSIGNENT PERSONNE.
//    Ces titres s'affichent publiquement et comptent au palmarès. Deux voix,
//    ou deux joueuses à égalité, ne valent pas un titre : on rend la raison
//    (`reason`) pour que le staff tranche à la main, plutôt qu'un vainqueur
//    fabriqué par l'ordre d'une liste — ce que faisait l'ancien `buildTally`,
//    où l'égalité revenait à la première candidate affichée.
//
// La journée est `matches.round_name` ('J1'…'J7'), JAMAIS le jour calendaire :
// après le recalage du planning, J1 s'étale du 18 au 23/09 et l'on joue du J1,
// du J2 et du J3 le même soir. Grouper par date éclaterait chaque journée.
//
// Testé dans tests/unit/mvpAwards.test.ts.

/** Plateforme d'où vient une voix. */
export type MvpVoteSource = 'discord' | 'twitch';

/** Une voix brute, telle que stockée dans `match_mvp_votes`. */
export type MvpVote = {
  memberId: string;
  source: MvpVoteSource;
  /** Identifiant de plateforme du votant — sert à la déduplication. */
  voterKey: string;
};

/** Pourquoi aucun titre n'a pu être décerné automatiquement. */
export type MvpNoAwardReason = 'no_votes' | 'too_few_votes' | 'tie';

/** Décompte d'une source pour un match. */
export type MvpSourceTally = {
  source: MvpVoteSource;
  /** Voix par joueuse, décroissant puis memberId croissant (ordre total). */
  rows: Array<{ memberId: string; votes: number; share: number }>;
  total: number;
};

/** MVP d'un match, telle qu'on la persiste dans `match_mvp_polls`. */
export type MvpMatchAward = {
  matchId: string;
  roundName: string | null;
  memberId: string;
  source: MvpVoteSource;
  winnerVotes: number;
  totalVotes: number;
};

export type MvpMatchOutcome =
  | { award: MvpMatchAward; reason: null }
  | { award: null; reason: MvpNoAwardReason };

/**
 * En dessous, un vote n'est pas un vote. Trois voix, c'est peu — mais c'est le
 * seuil sous lequel une seule personne décide d'un titre public.
 */
export const MIN_VOTES_FOR_AWARD = 3;

/**
 * Dédoublonne défensivement : une personne, une voix, la DERNIÈRE compte.
 * L'unicité est déjà tenue en base (index (tenant, match, source, voter_key)
 * + UPSERT) ; ce filet couvre les appelants qui agrègent plusieurs lots.
 */
function dedupe(votes: readonly MvpVote[]): MvpVote[] {
  const byVoter = new Map<string, MvpVote>();
  for (const v of votes) {
    if (!v?.memberId || !v.voterKey || !v.source) continue;
    byVoter.set(`${v.source}:${v.voterKey}`, v);
  }
  return Array.from(byVoter.values());
}

/** Décompte une source. Rendu trié, ordre total (donc stable en ISR). */
export function tallySource(
  votes: readonly MvpVote[],
  source: MvpVoteSource
): MvpSourceTally {
  const counts = new Map<string, number>();
  let total = 0;
  for (const v of dedupe(votes)) {
    if (v.source !== source) continue;
    counts.set(v.memberId, (counts.get(v.memberId) ?? 0) + 1);
    total += 1;
  }
  const rows = Array.from(counts.entries())
    .map(([memberId, count]) => ({
      memberId,
      votes: count,
      share: total > 0 ? count / total : 0,
    }))
    .sort((a, b) =>
      b.votes !== a.votes
        ? b.votes - a.votes
        : a.memberId.localeCompare(b.memberId)
    );
  return { source, rows, total };
}

/**
 * Désigne la MVP d'un match.
 *
 * Twitch d'abord s'il a des voix, Discord sinon (cf. décision 1 en tête de
 * fichier). Rend la raison plutôt qu'un vainqueur quand le vote est trop
 * maigre ou que deux joueuses sont à égalité en tête.
 */
export function resolveMatchMvp(
  match: { matchId: string; roundName?: string | null },
  votes: readonly MvpVote[],
  minVotes: number = MIN_VOTES_FOR_AWARD
): MvpMatchOutcome {
  const twitch = tallySource(votes, 'twitch');
  const discord = tallySource(votes, 'discord');
  const tally = twitch.total > 0 ? twitch : discord;

  if (tally.total === 0) return { award: null, reason: 'no_votes' };
  if (tally.total < minVotes) return { award: null, reason: 'too_few_votes' };

  const [first, second] = tally.rows;
  if (second && second.votes === first.votes) {
    return { award: null, reason: 'tie' };
  }

  return {
    award: {
      matchId: match.matchId,
      roundName: match.roundName ?? null,
      memberId: first.memberId,
      source: tally.source,
      winnerVotes: first.votes,
      totalVotes: tally.total,
    },
    reason: null,
  };
}

/** MVP du PUBLIC : un titre, deux plateformes qui votent ensemble. */
export type PublicMvpAward = {
  matchId: string;
  roundName: string | null;
  memberId: string;
  winnerVotes: number;
  totalVotes: number;
  /** Ce que chaque plateforme a pesé — pour l'annonce et le panneau staff. */
  bySource: { twitch: number; discord: number };
};

export type PublicMvpOutcome =
  | { award: PublicMvpAward; reason: null }
  | { award: null; reason: MvpNoAwardReason };

/**
 * Désigne la MVP DU PUBLIC : viewers Twitch et supporters Discord ADDITIONNÉS.
 *
 * ICI, PAS DE PRÉCÉDENCE — et c'est la différence de fond avec
 * `resolveMatchMvp`. Là-bas, deux sources s'arbitrent parce qu'elles
 * représentent deux jugements concurrents sur le même titre : le chat qui a
 * regardé la partie passe devant. Ici les deux sources sont UN SEUL
 * électorat, le public, réparti sur deux plateformes par accident de
 * plomberie. Les faire s'arbitrer reviendrait à dire qu'une voix Discord ne
 * vaut rien dès qu'une viewer s'exprime.
 *
 * Une personne présente des deux côtés peut donc peser deux fois. C'est le
 * même compromis assumé qu'à côté : rapprocher les deux identités exigerait
 * une inscription, et exiger une inscription tuerait le vote.
 *
 * Mêmes garde-fous que pour le vote des équipes : un seuil minimal, et aucun
 * titre en cas d'égalité en tête. Pure, donc testable sans base.
 */
export function resolvePublicMvp(
  match: { matchId: string; roundName?: string | null },
  votes: readonly MvpVote[],
  minVotes: number = MIN_VOTES_FOR_AWARD
): PublicMvpOutcome {
  const twitch = tallySource(votes, 'twitch');
  const discord = tallySource(votes, 'discord');

  const counts = new Map<string, number>();
  for (const tally of [twitch, discord]) {
    for (const row of tally.rows) {
      counts.set(row.memberId, (counts.get(row.memberId) ?? 0) + row.votes);
    }
  }

  const total = twitch.total + discord.total;
  if (total === 0) return { award: null, reason: 'no_votes' };
  if (total < minVotes) return { award: null, reason: 'too_few_votes' };

  // Ordre TOTAL : à égalité de voix, le memberId tranche. Sans quoi le
  // classement dépendrait de l'ordre d'insertion et changerait d'un rendu à
  // l'autre.
  const rows = Array.from(counts.entries())
    .map(([memberId, votes_]) => ({ memberId, votes: votes_ }))
    .sort((a, b) =>
      b.votes !== a.votes
        ? b.votes - a.votes
        : a.memberId.localeCompare(b.memberId)
    );

  const [first, second] = rows;
  if (second && second.votes === first.votes) {
    return { award: null, reason: 'tie' };
  }

  return {
    award: {
      matchId: match.matchId,
      roundName: match.roundName ?? null,
      memberId: first.memberId,
      winnerVotes: first.votes,
      totalVotes: total,
      bySource: { twitch: twitch.total, discord: discord.total },
    },
    reason: null,
  };
}

/** MVP d'une journée : une MVP de match promue, avec sa part. */
export type MvpMatchdayAward = {
  roundName: string;
  memberId: string;
  /** Part des voix dans SON match — le critère de sélection. */
  share: number;
  winnerVotes: number;
  totalVotes: number;
  matchId: string;
  /** Matchs de la journée ayant effectivement désigné une MVP. */
  awardedMatches: number;
};

/**
 * `roundName` est porté par les DEUX variantes : un appelant qui liste les
 * journées doit pouvoir nommer celle qui n'a désigné personne sans avoir à
 * tester `award` d'abord.
 */
export type MvpMatchdayOutcome = { roundName: string } & (
  | { award: MvpMatchdayAward; reason: null }
  | { award: null; reason: MvpNoAwardReason }
);

/**
 * Promeut, pour chaque journée, la MVP de match à la plus forte PART de voix.
 *
 * Départages successifs : part, puis voix brutes, puis voix exprimées dans le
 * match, puis `memberId`. Le dernier rend l'ordre total — sans lui, deux
 * rendus ISR successifs pourraient permuter deux ex æquo.
 *
 * Les matchs sans `roundName` (petite et grande finale du format 2026, qui
 * n'appartiennent à aucune journée) sont ignorés : ils ont leur propre place
 * dans le palmarès, pas dans le classement des journées.
 */
export function buildMatchdayAwards(
  awards: readonly MvpMatchAward[]
): MvpMatchdayOutcome[] {
  const byRound = new Map<string, MvpMatchAward[]>();
  for (const a of awards) {
    const round = (a?.roundName ?? '').trim();
    if (!round) continue;
    const list = byRound.get(round);
    if (list) list.push(a);
    else byRound.set(round, [a]);
  }

  const rounds = Array.from(byRound.keys()).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );

  return rounds.map((roundName) => {
    const list = byRound.get(roundName)!;
    const ranked = list
      .map((a) => ({
        ...a,
        share: a.totalVotes > 0 ? a.winnerVotes / a.totalVotes : 0,
      }))
      .sort((a, b) => {
        if (b.share !== a.share) return b.share - a.share;
        if (b.winnerVotes !== a.winnerVotes)
          return b.winnerVotes - a.winnerVotes;
        if (b.totalVotes !== a.totalVotes) return b.totalVotes - a.totalVotes;
        return a.memberId.localeCompare(b.memberId);
      });

    const [first, second] = ranked;
    if (!first) return { roundName, award: null, reason: 'no_votes' };

    // Égalité PARFAITE en tête (même part ET mêmes voix) : personne n'est
    // promue. Deux joueuses à 100 % d'un match à 5 voix chacune ne se
    // départagent pas au hasard d'un identifiant.
    if (
      second &&
      second.share === first.share &&
      second.winnerVotes === first.winnerVotes
    ) {
      return { roundName, award: null, reason: 'tie' };
    }

    return {
      roundName,
      award: {
        roundName,
        memberId: first.memberId,
        share: first.share,
        winnerVotes: first.winnerVotes,
        totalVotes: first.totalVotes,
        matchId: first.matchId,
        awardedMatches: list.length,
      },
      reason: null,
    };
  });
}

/** Une ligne du classement MVP d'un tournoi. */
export type MvpTournamentRow = {
  memberId: string;
  /** Journées gagnées — le critère principal. */
  matchdayTitles: number;
  /** MVP de match — le départage. */
  matchTitles: number;
  /** Voix cumulées sur tous ses titres de match. */
  totalVotes: number;
  /** Journées gagnées, dans l'ordre. */
  rounds: string[];
};

/**
 * Classement MVP du tournoi : journées gagnées d'abord, titres de match
 * ensuite, voix cumulées enfin, `memberId` pour clore l'ordre.
 *
 * La MVP du tournoi est la première ligne — PAS un vote de plus. Une joueuse
 * élue sur une seule journée mais jamais ailleurs passe derrière une joueuse
 * régulière à titres égaux, ce qui est la définition qu'on veut d'un MVP de
 * saison.
 */
export function buildTournamentMvpRanking(
  matchAwards: readonly MvpMatchAward[],
  matchdayAwards: readonly MvpMatchdayOutcome[]
): MvpTournamentRow[] {
  const rows = new Map<string, MvpTournamentRow>();

  const ensure = (memberId: string): MvpTournamentRow => {
    const cur = rows.get(memberId);
    if (cur) return cur;
    const next: MvpTournamentRow = {
      memberId,
      matchdayTitles: 0,
      matchTitles: 0,
      totalVotes: 0,
      rounds: [],
    };
    rows.set(memberId, next);
    return next;
  };

  for (const a of matchAwards) {
    if (!a?.memberId) continue;
    const row = ensure(a.memberId);
    row.matchTitles += 1;
    row.totalVotes += a.winnerVotes;
  }

  for (const d of matchdayAwards) {
    if (!d.award) continue;
    const row = ensure(d.award.memberId);
    row.matchdayTitles += 1;
    row.rounds.push(d.award.roundName);
  }

  return Array.from(rows.values()).sort((a, b) => {
    if (b.matchdayTitles !== a.matchdayTitles)
      return b.matchdayTitles - a.matchdayTitles;
    if (b.matchTitles !== a.matchTitles) return b.matchTitles - a.matchTitles;
    if (b.totalVotes !== a.totalVotes) return b.totalVotes - a.totalVotes;
    return a.memberId.localeCompare(b.memberId);
  });
}
