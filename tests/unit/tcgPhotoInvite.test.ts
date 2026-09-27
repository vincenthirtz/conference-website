// « Inviter sans relancer » — la décision de `TcgPhotoInvite`.
//
// POURQUOI CETTE RÈGLE MÉRITE SES PROPRES CAS. Il s'agit d'une invitation à
// déposer une PHOTO DE SOI, sur un objet que d'autres collectionnent, dans un
// milieu où les joueuses subissent du harcèlement. Le garde-fou de docs/TCG.md
// §2 n'est pas seulement « pas de dépôt sans consentement » : c'est aussi
// « pas de pression pour consentir ». Une invitation qui réapparaît après un
// refus, ou qui s'affiche par-dessus une photo en attente, n'est plus une
// invitation.
//
// Les quatre refus ci-dessous sont donc des invariants de consentement, pas des
// détails d'affichage — et aucun ne se voit dans les données : l'erreur
// produirait seulement un bloc de trop, sur l'écran de quelqu'un qui a déjà dit
// non.

import { describe, expect, it } from 'vitest';
import { shouldInvite } from '../../components/tcg/TcgPhotoInvite';

describe('shouldInvite', () => {
  it('invite quand aucune photo n’est en jeu et qu’une carte est possible', () => {
    expect(
      shouldInvite({ status: 'none', photoUrl: null, hasPlayerProfile: true })
    ).toBe(true);
    // `hasPlayerProfile` absent = inconnu, pas « non » : une réponse d'API
    // antérieure ne doit pas faire taire l'invitation.
    expect(shouldInvite({ status: 'none', photoUrl: null })).toBe(true);
  });

  it('se tait quand une photo est déjà là', () => {
    expect(
      shouldInvite({ status: 'approved', photoUrl: 'https://x/p.png' })
    ).toBe(false);
  });

  it('se tait quand une photo est EN ATTENTE', () => {
    // Elle a fait le geste. Le redemander pendant qu'on relit sa photo serait
    // la pire des relances.
    expect(shouldInvite({ status: 'pending', photoUrl: null })).toBe(false);
  });

  it('se tait quand une photo a été REFUSÉE', () => {
    // Inviter par-dessus un refus de modération, c'est relancer quelqu'un sur
    // un échec. Le message qui convient là est celui de la carte de profil,
    // qui dit le motif.
    expect(shouldInvite({ status: 'rejected', photoUrl: null })).toBe(false);
  });

  it('se tait quand aucune carte n’est possible', () => {
    expect(
      shouldInvite({ status: 'none', photoUrl: null, hasPlayerProfile: false })
    ).toBe(false);
  });

  it('se tait quand l’état est illisible', () => {
    // Inviter à déposer une photo qu'on a peut-être déjà serait pire que de
    // ne rien dire.
    expect(shouldInvite(null)).toBe(false);
  });
});
