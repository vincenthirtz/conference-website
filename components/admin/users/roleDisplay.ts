// components/admin/users/roleDisplay.ts
//
// Présentation des rôles de COMPTE (libellé + pastille de couleur), extraite de
// `pages/admin/users/manage.tsx` — lot A7 : tout lot qui touche un
// god-component en sort au moins un morceau. Le lot A2 y ajoutait deux rôles
// (`referee`, `helper`), donc deux `case` dans chacun des deux `switch` : le
// fichier grossissait pour une raison qui n'avait rien à faire dedans.
//
// Ces deux fonctions sont PURES et ne dépendent que du dictionnaire admin.

/** Sous-ensemble du dictionnaire dont dépend l'affichage d'un rôle. */
export type RoleLabels = {
  roleOwner: string;
  roleAdmin: string;
  roleManager: string;
  roleCaster: string;
  roleReferee: string;
  roleHelper: string;
  rolePlayer: string;
  roleMember: string;
};

export function roleLabel(t: RoleLabels, role: string | null) {
  switch (role?.toLowerCase()) {
    case 'owner':
      return t.roleOwner;
    case 'admin':
      return t.roleAdmin;
    case 'manager':
      return t.roleManager;
    case 'caster':
      return t.roleCaster;
    // Rôles étroits du lot A2. Sans ces deux cas, le `default` affichait le
    // slug brut (« referee ») dans le sélecteur et les badges.
    case 'referee':
      return t.roleReferee;
    case 'helper':
      return t.roleHelper;
    case 'player':
      return t.rolePlayer;
    case 'member':
      return t.roleMember;
    default:
      return role || t.roleMember;
  }
}

export function roleColor(role: string | null) {
  switch (role?.toLowerCase()) {
    case 'owner':
      return 'bg-purple-600 text-white';
    case 'admin':
      return 'bg-red-600 text-white';
    case 'referee':
      return 'bg-amber-600 text-white';
    case 'helper':
      return 'bg-sky-700 text-white';
    case 'manager':
      return 'bg-blue-600 text-white';
    case 'caster':
      return 'bg-amber-600 text-white';
    case 'player':
      return 'bg-emerald-600 text-white';
    default:
      return 'bg-neutral-600 text-neutral-100';
  }
}
