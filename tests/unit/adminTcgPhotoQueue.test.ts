// Lecture de `GET /api/admin/tcg/photos` par la file de relecture
// (components/admin/moderation/tcgPhotoQueue.ts).
//
// Les pseudos sont un ENRICHISSEMENT : l'endpoint les rend `null` si la
// résolution des profils échoue, et une route plus ancienne ne les rendait pas.
// La file doit s'afficher dans les trois cas, sans « undefined » et sans
// escamoter une photo parce que son nom manque.

import { describe, expect, it } from 'vitest';

import {
  normalizePendingPhotos,
  photoOwnerLabel,
} from '@/components/admin/moderation/tcgPhotoQueue';

const A = '3f2b8c1e-5d4a-4b7e-8c9d-0a1b2c3d4e5f';
const B = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';

describe('normalizePendingPhotos', () => {
  it('lit la forme enrichie de la route', () => {
    expect(
      normalizePendingPhotos({
        photos: [
          {
            userId: A,
            displayName: 'Marie',
            email: 'marie@example.org',
            photoUrl: 'https://cdn/x.webp',
            submittedAt: '2026-09-14T10:00:00Z',
          },
        ],
        total: 1,
      })
    ).toEqual([
      {
        userId: A,
        displayName: 'Marie',
        email: 'marie@example.org',
        photoUrl: 'https://cdn/x.webp',
        submittedAt: '2026-09-14T10:00:00Z',
      },
    ]);
  });

  it('tient la forme ANCIENNE, sans displayName ni email', () => {
    const [photo] = normalizePendingPhotos({
      photos: [{ userId: A, photoUrl: null, submittedAt: null }],
    });
    expect(photo).toEqual({
      userId: A,
      displayName: null,
      email: null,
      photoUrl: null,
      submittedAt: null,
    });
  });

  it('écarte une ligne inexploitable sans perdre les autres', () => {
    const photos = normalizePendingPhotos({
      photos: [null, 'x', { displayName: 'sans id' }, { userId: B }],
    });
    expect(photos.map((p) => p.userId)).toEqual([B]);
  });

  it('rend une liste vide sur une réponse aberrante', () => {
    expect(normalizePendingPhotos(null)).toEqual([]);
    expect(normalizePendingPhotos({})).toEqual([]);
    expect(normalizePendingPhotos({ photos: 'nope' })).toEqual([]);
  });
});

describe('photoOwnerLabel', () => {
  const base = {
    userId: A,
    displayName: null,
    email: null,
    photoUrl: null,
    submittedAt: null,
  };

  it('affiche le pseudo, puis l’email, puis l’identifiant tronqué', () => {
    expect(
      photoOwnerLabel({ ...base, displayName: 'Marie', email: 'm@x.fr' })
    ).toBe('Marie');
    expect(photoOwnerLabel({ ...base, email: 'm@x.fr' })).toBe('m@x.fr');
    expect(photoOwnerLabel(base)).toBe('3f2b8c1e…');
  });

  it('un pseudo vide dans la réponse retombe sur l’email', () => {
    const [photo] = normalizePendingPhotos({
      photos: [{ userId: A, displayName: '', email: 'm@x.fr' }],
    });
    expect(photoOwnerLabel(photo)).toBe('m@x.fr');
  });
});
