// tests/unit/teamOpeningsContactUi.test.ts
//
// Bouton « Contacter cette équipe » de components/TeamOpenings/TeamOpeningsList.
//
// On teste la seule logique qui décide de ce que voit la joueuse après un
// échec : le statut HTTP de /api/team-openings/contact → message. Confondre
// « trop de demandes » (429) et « annonce expirée » (404) ferait réessayer en
// boucle sur une annonce morte.

import { describe, it, expect, vi } from 'vitest';

// Le composant lit la session partagée ; son module importe le client Supabase
// navigateur, inutile ici.
vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({
    user: null,
    token: null,
    loading: true,
    lastEvent: null,
  }),
}));

import {
  CONTACT_LOGIN_HREF,
  contactErrorKind,
} from '../../components/TeamOpenings/TeamOpeningsList';

describe('contactErrorKind', () => {
  it('429 → limite de débit', () => {
    expect(contactErrorKind(429)).toBe('rateLimited');
  });

  it('404 → annonce plus disponible', () => {
    expect(contactErrorKind(404)).toBe('gone');
  });

  it('401 / 403 → session à renouveler', () => {
    expect(contactErrorKind(401)).toBe('session');
    expect(contactErrorKind(403)).toBe('session');
  });

  it('autres statuts → erreur générique', () => {
    expect(contactErrorKind(500)).toBe('generic');
    expect(contactErrorKind(400)).toBe('generic');
    expect(contactErrorKind(503)).toBe('generic');
  });
});

describe('CONTACT_LOGIN_HREF', () => {
  it('ramène sur /recrutement après connexion', () => {
    expect(CONTACT_LOGIN_HREF).toBe('/login?next=/recrutement');
  });
});
