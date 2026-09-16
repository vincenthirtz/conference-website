// tests/unit/navbarHeaderNeverEmpty.test.ts
//
// UNE PAGE N'EST JAMAIS SANS EN-TÊTE.
//
// `components/Navbar/navbar.tsx` masque la nav publique quand une barre la
// remplace (`hideMarketingNav`). Mais `AdminTopBar` SE SUPPRIME ELLE-MÊME
// lorsqu'elle n'a aucun lien à montrer (`return null`). Conditionner le masquage
// au seul `isStaff` a donc un mode d'échec silencieux : un compte staff dont
// aucun lien ne passe le filtre voit la nav publique disparaître au profit
// d'une barre qui ne s'affiche pas — plus rien en haut de page, sur le site
// public comme dans l'admin.
//
// Ce test fige les deux moitiés du raisonnement :
//   1. quels rôles produisent zéro lien — c'est la condition qui déclenche
//      l'auto-suppression de la barre ;
//   2. le fait qu'aucun staff « réel » n'y tombe, pour que le jour où un rôle
//      perd sa dernière entrée de menu, quelqu'un le voie ici plutôt qu'en
//      production.
//
// Il ne monte pas React : la règle testée est un prédicat, et le rendu n'ajoute
// rien à la démonstration.

import { describe, expect, it } from 'vitest';
import { filterAdminLinks, ADMIN_LINKS } from '@/components/Navbar/adminLinks';
import { isStaffRole } from '@/hooks/useStaffSession';

/** Reproduit la décision de `navbar.tsx`, telle qu'elle est écrite. */
function showAdminBar(
  isStaff: boolean,
  loading: boolean,
  linkCount: number
): boolean {
  return !loading && isStaff && linkCount > 0;
}

function linksFor(role: string | null): number {
  return filterAdminLinks(role as never, ADMIN_LINKS, 'organizer' as never, [])
    .length;
}

describe('la nav publique ne se masque que si une barre la remplace', () => {
  it('tout rôle de staff a au moins une entrée de menu', () => {
    const empty = (['owner', 'admin', 'caster'] as const).filter(
      (role) => linksFor(role) === 0
    );
    expect(
      empty,
      `Ces rôles de staff n'ont plus aucune entrée de menu : ${empty.join(', ')}.\n` +
        'AdminTopBar se supprimerait, et la nav publique resterait masquée : page sans en-tête.'
    ).toEqual([]);
  });

  it('un rôle NON-staff ne produit aucun lien — d’où la garde', () => {
    // C'est le cas qui a motivé le correctif : si un tel rôle atterrit dans
    // l'état `isStaff`, la barre est vide.
    for (const role of ['captain', 'manager', 'player', null]) {
      expect(
        isStaffRole(role),
        `${role} ne doit pas passer pour du staff`
      ).toBe(false);
      expect(linksFor(role), `${role} ne doit ouvrir aucun lien admin`).toBe(0);
    }
  });

  it('zéro lien ⇒ on garde la nav publique, même pour un staff', () => {
    expect(showAdminBar(true, false, 0)).toBe(false);
    expect(showAdminBar(true, false, 3)).toBe(true);
    // Pendant le chargement, rien ne remplace encore la nav publique.
    expect(showAdminBar(true, true, 3)).toBe(false);
  });
});
