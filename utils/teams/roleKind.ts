// utils/teams/roleKind.ts
//
// Nature d'un rôle d'équipe : joue / n'encadre que. Isolé ici pour que LES DEUX
// côtés puissent l'importer.
//
// `utils/teams/addMember.ts` (la moitié serveur) tire supabaseAdmin, la
// résolution d'utilisateur et le role-sync bot : l'importer depuis un composant
// React embarquerait tout ça dans le bundle client. Ce module ne contient que
// des fonctions pures — même découpage que `subjectParam` vs `subject`.
//
// La règle est unique et partagée : un coach ou une manager n'est pas une
// joueuse. Conséquences, à garder cohérentes partout :
//   - pas de BattleTag exigé (roleRequiresBattleTag) ;
//   - hors du roster jouant à l'affichage (section « staff de l'équipe ») ;
//   - hors du décompte d'effectif (cf. `min_players` à l'inscription).

/** Format d'un BattleTag Blizzard : `Nom#1234`. */
export const BATTLE_TAG_REGEX = /^[A-Za-z0-9]{2,}#[0-9]{3,6}$/;

/**
 * Rôles d'encadrement : ils appartiennent au staff de l'équipe, pas au roster
 * jouant. Un coach ou une manager n'a pas forcément de compte Overwatch.
 */
export const NON_PLAYING_TEAM_ROLES = ['coach', 'manager'] as const;

export function isNonPlayingTeamRole(role: string | null | undefined): boolean {
  const normalized = (role ?? '').trim().toLowerCase();
  return (NON_PLAYING_TEAM_ROLES as readonly string[]).includes(normalized);
}

/** Un BattleTag n'est exigé que des rôles qui jouent. */
export function roleRequiresBattleTag(
  role: string | null | undefined
): boolean {
  return !isNonPlayingTeamRole(role);
}

/**
 * Sépare des membres en roster jouant / remplaçantes / encadrement.
 *
 * Utilisé par tous les écrans qui affichent un effectif, pour qu'ils ne
 * re-dérivent pas chacun leur définition (et ne divergent pas au premier rôle
 * ajouté).
 */
export function splitTeamMembers<
  T extends { role?: string | null; is_substitute?: boolean | null },
>(members: readonly T[]): { roster: T[]; subs: T[]; staff: T[] } {
  const roster: T[] = [];
  const subs: T[] = [];
  const staff: T[] = [];
  for (const m of members) {
    if (isNonPlayingTeamRole(m.role)) staff.push(m);
    else if (m.is_substitute) subs.push(m);
    else roster.push(m);
  }
  return { roster, subs, staff };
}
