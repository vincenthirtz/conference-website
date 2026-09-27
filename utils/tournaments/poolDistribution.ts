// utils/tournaments/poolDistribution.ts
//
// PROPOSER UNE RÉPARTITION de la liste d'attente d'un tournoi regroupé en
// équipes de 5 (`tournaments.pooled_teams`, cf. utils/tournaments/pool.ts).
//
// Une PROPOSITION, jamais une décision : l'écran staff la montre, chaque
// équipe proposée se valide (ou se corrige) une à une. Le staff connaît les
// joueuses — niveaux, affinités, rôles — que ces données ignorent.
//
// LA RÈGLE, telle que décidée avec l'orga (2026-09-27) :
//   1. Un NOYAU = des joueuses en attente issues de la même équipe réelle
//      (3 d'Alpha, par exemple). On complète d'abord les plus gros noyaux :
//      ils sont le plus près de jouer ensemble.
//   2. On complète avec des joueuses SANS équipe.
//   3. S'il n'y en a plus assez, on prend dans un AUTRE noyau pour boucher les
//      trous — le plus petit d'abord : c'est celui qui avait le moins de chances
//      de former une équipe à lui seul.
//   4. Les joueuses sans équipe qui restent forment des équipes entre elles, par
//      paquets de 5.
//   5. Ce qui ne remplit pas une équipe complète reste en attente — signalé,
//      pas forcé : une équipe à 4 ne joue pas un 5v5.
//
// LES RESTES D'UNE ÉQUIPE DÉJÀ INSCRITE (la 6e, la 7e d'Alpha, arrivées après
// l'inscription automatique des 5 premières) ne forment PAS un noyau : leur
// équipe joue déjà, on ne peut pas l'inscrire deux fois. Elles comptent comme
// des joueuses sans équipe.
//
// Déterministe (tris explicites, départage par date d'inscription puis id) :
// la même liste donne la même proposition, rechargement après rechargement.
//
// PUR : aucune dépendance, testable tel quel.

export type PoolWaitingEntry = {
  id: string;
  originTeamId: string | null;
  /** ISO — l'ordre d'arrivée départage à taille égale. */
  createdAt: string;
};

export type ProposedSquad =
  | {
      /** Joue sous l'identité de l'équipe réelle du noyau. */
      kind: 'core';
      teamId: string;
      entryIds: string[];
    }
  | {
      /** Équipe mixte à créer pour la soirée. */
      kind: 'mixed';
      entryIds: string[];
    };

export type PoolProposal = {
  squads: ProposedSquad[];
  /** Restent en attente : pas de quoi former une équipe complète. */
  leftoverIds: string[];
};

function byArrival(a: PoolWaitingEntry, b: PoolWaitingEntry): number {
  return a.createdAt === b.createdAt
    ? a.id.localeCompare(b.id)
    : a.createdAt.localeCompare(b.createdAt);
}

export function proposePoolSquads(
  waiting: PoolWaitingEntry[],
  opts: {
    teamSize: number;
    /** Équipes déjà inscrites au tournoi : leurs restes ne font pas noyau. */
    registeredTeamIds: Iterable<string>;
  }
): PoolProposal {
  const size = opts.teamSize;
  const registered = new Set(opts.registeredTeamIds);
  const sorted = [...waiting].sort(byArrival);

  const solos: PoolWaitingEntry[] = [];
  const coreMap = new Map<string, PoolWaitingEntry[]>();
  for (const e of sorted) {
    if (!e.originTeamId || registered.has(e.originTeamId)) {
      solos.push(e);
      continue;
    }
    const list = coreMap.get(e.originTeamId) ?? [];
    list.push(e);
    coreMap.set(e.originTeamId, list);
  }

  // Plus gros noyau d'abord ; à taille égale, celui dont la première
  // inscription est la plus ancienne (il attend depuis plus longtemps).
  const cores = [...coreMap.entries()]
    .map(([teamId, members]) => ({ teamId, members }))
    .sort(
      (a, b) =>
        b.members.length - a.members.length ||
        byArrival(a.members[0], b.members[0])
    );

  const squads: ProposedSquad[] = [];
  // Index des noyaux encore disponibles comme donneurs / à compléter.
  const pending = [...cores];

  while (pending.length > 0) {
    const core = pending.shift()!;
    // Un noyau de plus de 5 ne peut exister (le 5e inscrit l'équipe
    // automatiquement), mais on reste défensif : le surplus retourne aux solos.
    const members = core.members.slice(0, size);
    solos.push(...core.members.slice(size));

    let need = size - members.length;
    const fill: PoolWaitingEntry[] = [];

    // 2) Les sans-équipe, par ordre d'arrivée.
    solos.sort(byArrival);
    while (need > 0 && solos.length > 0) {
      fill.push(solos.shift()!);
      need--;
    }

    // 3) Puis les plus petits noyaux restants, dissous pour boucher le trou.
    while (need > 0 && pending.length > 0) {
      pending.sort(
        (a, b) =>
          a.members.length - b.members.length ||
          byArrival(b.members[0], a.members[0])
      );
      const donor = pending[0];
      fill.push(donor.members.shift()!);
      need--;
      if (donor.members.length === 0) pending.shift();
    }
    // Remettre les noyaux restants dans l'ordre « plus gros d'abord ».
    pending.sort(
      (a, b) =>
        b.members.length - a.members.length ||
        byArrival(a.members[0], b.members[0])
    );

    if (need === 0) {
      squads.push({
        kind: 'core',
        teamId: core.teamId,
        entryIds: [...members, ...fill].map((e) => e.id),
      });
    } else {
      // Pas de quoi compléter : tout le monde repart en attente — et il n'y a
      // plus aucun donneur, donc la boucle s'arrête d'elle-même.
      solos.push(...members, ...fill);
    }
  }

  // 4) Équipes mixtes de sans-équipe.
  solos.sort(byArrival);
  while (solos.length >= size) {
    squads.push({
      kind: 'mixed',
      entryIds: solos.splice(0, size).map((e) => e.id),
    });
  }

  return { squads, leftoverIds: solos.map((e) => e.id) };
}
