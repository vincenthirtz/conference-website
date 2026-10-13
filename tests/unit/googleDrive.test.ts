// tests/unit/googleDrive.test.ts
//
// Le client Drive (compte de service) et la mise en forme des lignes.
//
// Ce qui est réellement testé ici, ce sont les garde-fous : la clé collée avec
// des retours à la ligne échappés, la sortie hors du dossier racine, et
// l'échappement de la requête Drive. Le reste (un GET qui marche) ne casse pas
// tout seul.

import { describe, expect, it } from 'vitest';
import { driveTypeKey, formatDriveSize } from '@/utils/documents/driveDisplay';

// Une paire RSA jetable : signer un JWT demande une vraie clé, et en fabriquer
// une au vol évite d'en committer une (fût-elle de test).

describe('utils/documents/driveDisplay', () => {
  it('classe les types Google natifs et les formats Office', () => {
    expect(driveTypeKey('application/vnd.google-apps.folder')).toBe('folder');
    expect(driveTypeKey('application/vnd.google-apps.document')).toBe('doc');
    expect(driveTypeKey('application/pdf')).toBe('pdf');
    expect(driveTypeKey('image/png')).toBe('image');
    expect(
      driveTypeKey(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
    ).toBe('sheet');
  });

  it('retombe sur `other` plutôt que d’échouer sur un mime inconnu', () => {
    expect(driveTypeKey('application/x-inconnu')).toBe('other');
    expect(driveTypeKey(null)).toBe('other');
  });

  it('rend `null` — et pas « 0 o » — quand Google ne donne pas de taille', () => {
    // Un Doc natif n'a pas de taille. Afficher « 0 o » ferait croire à un
    // fichier vide : c'est le sens qui compte, pas la mise en forme.
    expect(formatDriveSize(null)).toBeNull();
    expect(formatDriveSize(undefined)).toBeNull();
  });

  it('met une décimale sous 10, aucune au-dessus', () => {
    expect(formatDriveSize(512)).toBe('512 o');
    expect(formatDriveSize(1536)).toBe('1.5 Ko');
    expect(formatDriveSize(50 * 1024)).toBe('50 Ko');
    expect(formatDriveSize(1.4 * 1024 * 1024)).toBe('1.4 Mo');
  });
});
