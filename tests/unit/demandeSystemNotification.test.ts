// tests/unit/demandeSystemNotification.test.ts
//
// « Utilisateur inconnu » sur /admin/demandes.
//
// La ligne fautive était une NOTIFICATION : « Scrim accepté : Team Positivité
// vs Venom Valkyries », écrite par la plateforme avec `user_id: null` pour
// prévenir l'équipe cible. La liste l'affichait comme une demande sans auteur,
// sous une silhouette de personne — deux signaux qui annoncent un manque là où
// il n'y en a pas, et qui envoient chercher un compte supprimé qui n'a jamais
// existé.
//
// Ce que ce test tient : la distinction entre « personne ne l'a envoyée » et
// « son auteur a disparu ». Les deux existent, et une seule mérite le libellé.

import { describe, it, expect } from 'vitest';
import { isSystemNotification } from '../../utils/demandes/systemNotification';

describe('isSystemNotification', () => {
  it('reconnaît une notification de scrim accepté', () => {
    // Ligne réellement observée en production le 3 septembre 2026.
    expect(
      isSystemNotification({
        user_id: null,
        payload: {
          notification_type: 'scrim_accepted',
          from_team_name: 'Team Positivité',
          target_team_name: 'Venom Valkyries',
        },
      })
    ).toBe(true);
  });

  it('reconnaît les deux autres écrans qui notifient', () => {
    for (const type of ['tournament_open', 'captain_message']) {
      expect(
        isSystemNotification({ user_id: null, payload: { notification_type: type } })
      ).toBe(true);
    }
  });

  it('une demande dont l’auteur a disparu N’EST PAS une notification', () => {
    // C'est le cas que « Utilisateur inconnu » décrit correctement : un compte
    // supprimé. Le masquer ferait perdre l'information.
    expect(isSystemNotification({ user_id: null, payload: null })).toBe(false);
    expect(
      isSystemNotification({ user_id: null, payload: { user_battle_tag: 'X#1' } })
    ).toBe(false);
  });

  it('une demande avec auteur n’est jamais une notification', () => {
    // Même si son payload en porte le champ : c'est quelqu'un qui a écrit.
    expect(
      isSystemNotification({
        user_id: 'user-1',
        payload: { notification_type: 'scrim_accepted' },
      })
    ).toBe(false);
  });

  it('un type de notification non textuel ne compte pas', () => {
    // Un payload malformé ne doit pas transformer une demande orpheline en
    // notification : on perdrait le signal « compte supprimé ».
    expect(
      isSystemNotification({ user_id: null, payload: { notification_type: 42 } })
    ).toBe(false);
    expect(
      isSystemNotification({ user_id: null, payload: { notification_type: null } })
    ).toBe(false);
  });
});
