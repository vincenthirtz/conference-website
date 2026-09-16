// utils/tenants/tenantStaffRoles.ts
//
// Les rôles qu'on peut donner à quelqu'un SUR UN ESPACE.
//
// POURQUOI PAS `STAFF_ROLES`. Cette liste-là vit dans `utils/staff.ts`, qui
// importe `supabaseAdmin` : l'importer depuis un composant entraînerait du code
// serveur dans le bundle client. Et elle ne dit pas la même chose : elle porte
// aussi `referee` et `helper`, qui décrivent un rôle le jour d'un tournoi, pas
// une capacité d'administration d'espace.
//
// Ce module est PUR — aucune I/O, aucun import serveur — précisément pour que
// les écrans puissent s'en servir. La validation reste côté serveur, sur
// `STAFF_ROLES` : cette liste restreint ce qu'on PROPOSE, elle n'est pas la
// garde.
//
// Elle existe parce que la fiche d'un espace écrit déjà ses trois options en
// dur dans le JSX (`pages/admin/tenants/[id].tsx`). Une deuxième copie dans le
// hub aurait garanti la dérive au premier rôle ajouté.
//
// Cette fiche-là n'a PAS été basculée sur ce module : elle figure dans le gel
// de `tests/unit/adminFileSizeGuard.test.ts`, qui ne l'autorise qu'à rétrécir,
// et l'y brancher lui ajoutait trois lignes. À faire au prochain lot qui
// l'ouvre pour de bon — la règle du gel étant justement d'en extraire un
// panneau à cette occasion.

import type { StaffRole } from '@/types/admin';

/**
 * Du moins au plus capable — c'est l'ordre d'affichage dans un sélecteur, et
 * il se lit comme une échelle parce que, pour un espace, c'en est une.
 */
export const TENANT_STAFF_ROLES: readonly StaffRole[] = [
  'caster',
  'admin',
  'owner',
] as const;

/**
 * Ce que chaque rôle ouvre, en une ligne, pour le sélecteur.
 *
 * Un rôle nommé sans être expliqué se choisit au hasard — et c'est ainsi qu'on
 * accorde `owner` à quelqu'un qui n'avait besoin que de lire.
 */
export const TENANT_STAFF_ROLE_HINTS: Readonly<Record<StaffRole, string>> = {
  owner: 'Administre l’espace et ouvre l’accès aux autres.',
  admin: 'Administre l’espace, sans gérer les accès.',
  caster: 'Cockpit de régie seulement.',
  referee: 'Arbitrage des matchs, le jour J.',
  helper: 'Check-in et tableau de tâches.',
};
