// tests/unit/googleDrive.test.ts
//
// Le client Drive (compte de service) et la mise en forme des lignes.
//
// Ce qui est réellement testé ici, ce sont les garde-fous : la clé collée avec
// des retours à la ligne échappés, la sortie hors du dossier racine, et
// l'échappement de la requête Drive. Le reste (un GET qui marche) ne casse pas
// tout seul.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { driveTypeKey, formatDriveSize } from '@/utils/documents/driveDisplay';

// Une paire RSA jetable : signer un JWT demande une vraie clé, et en fabriquer
// une au vol évite d'en committer une (fût-elle de test).
import crypto from 'node:crypto';

const { privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const ROOT = 'root-folder-id';

function saKey(): string {
  return JSON.stringify({
    client_email: 'asso@projet.iam.gserviceaccount.com',
    // Échappement volontaire : c'est ainsi qu'une clé arrive d'une variable
    // d'environnement Netlify.
    private_key: privateKey.replace(/\n/g, '\\n'),
  });
}

type FetchCall = { url: string; init?: RequestInit };

function mockFetch(handler: (url: string) => unknown) {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.startsWith('https://oauth2.googleapis.com/token')) {
        return {
          ok: true,
          json: async () => ({ access_token: 'tok', expires_in: 3600 }),
        } as unknown as Response;
      }
      const body = handler(url);
      return {
        ok: true,
        json: async () => body,
        text: async () => JSON.stringify(body),
      } as unknown as Response;
    })
  );
  return calls;
}

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

describe('utils/googleDrive', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.GOOGLE_DRIVE_SA_KEY = saKey();
    process.env.GOOGLE_DRIVE_FOLDER_ID = ROOT;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_DRIVE_SA_KEY;
    delete process.env.GOOGLE_DRIVE_FOLDER_ID;
  });

  it('se déclare non configuré quand un cran manque', async () => {
    delete process.env.GOOGLE_DRIVE_FOLDER_ID;
    const { isDriveConfigured } = await import('@/utils/googleDrive');
    expect(isDriveConfigured()).toBe(false);
  });

  it('accepte la clé en base64 (collage sûr dans Netlify)', async () => {
    process.env.GOOGLE_DRIVE_SA_KEY = Buffer.from(saKey()).toString('base64');
    const { isDriveConfigured } = await import('@/utils/googleDrive');
    expect(isDriveConfigured()).toBe(true);
  });

  it('refuse une clé JSON illisible avec un message qui dit quoi corriger', async () => {
    process.env.GOOGLE_DRIVE_SA_KEY = 'pas du json, pas du base64 non plus !!!';
    const { listDriveFiles, DriveConfigError } =
      await import('@/utils/googleDrive');
    await expect(listDriveFiles()).rejects.toBeInstanceOf(DriveConfigError);
  });

  it('liste la racine et interroge Drive avec supportsAllDrives', async () => {
    // Sans ces drapeaux, un Shared Drive répond une liste VIDE plutôt qu'une
    // erreur — la panne la plus longue à diagnostiquer de cette intégration.
    const calls = mockFetch((url) => {
      if (url.includes(`/files/${ROOT}`)) {
        return { id: ROOT, name: 'Asso', mimeType: 'folder', parents: [] };
      }
      return {
        files: [
          {
            id: 'f1',
            name: 'Statuts.pdf',
            mimeType: 'application/pdf',
            size: '2048',
          },
        ],
      };
    });

    const { listDriveFiles, resetDriveTokenCache } =
      await import('@/utils/googleDrive');
    resetDriveTokenCache();
    const listing = await listDriveFiles();

    expect(listing.files).toHaveLength(1);
    expect(listing.files[0].size).toBe(2048);
    expect(listing.folderName).toBe('Asso');
    expect(listing.breadcrumb).toEqual([{ id: ROOT, name: 'Asso' }]);

    const listCall = calls.find((c) => c.url.includes('drive/v3/files?'));
    expect(listCall?.url).toContain('supportsAllDrives=true');
    expect(listCall?.url).toContain('includeItemsFromAllDrives=true');
  });

  it('refuse un dossier qui n’est pas un descendant de la racine', async () => {
    // Le garde-fou qui compte : sans lui, le paramètre `folderId` de la route
    // laisserait lister n'importe quel dossier visible du compte de service.
    mockFetch((url) => {
      if (url.includes('/files/ailleurs')) {
        return {
          id: 'ailleurs',
          name: 'Perso',
          mimeType: 'folder',
          parents: [],
        };
      }
      return { files: [] };
    });

    const { listDriveFiles, DriveConfigError, resetDriveTokenCache } =
      await import('@/utils/googleDrive');
    resetDriveTokenCache();
    await expect(
      listDriveFiles({ folderId: 'ailleurs' })
    ).rejects.toBeInstanceOf(DriveConfigError);
  });

  it('accepte un sous-dossier et rend le fil d’Ariane complet', async () => {
    mockFetch((url) => {
      if (url.includes('/files/sub')) {
        return {
          id: 'sub',
          name: 'AG 2026',
          mimeType: 'folder',
          parents: [ROOT],
        };
      }
      if (url.includes(`/files/${ROOT}`)) {
        return { id: ROOT, name: 'Asso', mimeType: 'folder', parents: [] };
      }
      return { files: [] };
    });

    const { listDriveFiles, resetDriveTokenCache } =
      await import('@/utils/googleDrive');
    resetDriveTokenCache();
    const listing = await listDriveFiles({ folderId: 'sub' });
    expect(listing.breadcrumb).toEqual([
      { id: ROOT, name: 'Asso' },
      { id: 'sub', name: 'AG 2026' },
    ]);
  });

  it('échappe les apostrophes de la recherche (la syntaxe `q` de Drive)', async () => {
    // « Rapport d'activité » contient une apostrophe droite qui, non échappée,
    // ferme la chaîne côté Google et fait répondre 400.
    const calls = mockFetch((url) => {
      if (url.includes(`/files/${ROOT}`)) {
        return { id: ROOT, name: 'Asso', mimeType: 'folder', parents: [] };
      }
      return { files: [] };
    });

    const { listDriveFiles, resetDriveTokenCache } =
      await import('@/utils/googleDrive');
    resetDriveTokenCache();
    await listDriveFiles({ search: "Rapport d'activité" });

    const listCall = calls.find((c) => c.url.includes('drive/v3/files?'));
    const q = new URL(listCall!.url).searchParams.get('q') ?? '';
    expect(q).toContain("name contains 'Rapport d\\'activité'");
  });
});

describe('utils/googleDrive — écriture', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.GOOGLE_DRIVE_SA_KEY = saKey();
    process.env.GOOGLE_DRIVE_FOLDER_ID = ROOT;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_DRIVE_SA_KEY;
    delete process.env.GOOGLE_DRIVE_FOLDER_ID;
  });

  it('demande une portée en ÉCRITURE pour déposer, en LECTURE pour lister', async () => {
    // Le garde-fou qui compte : le chemin de lecture ne détient qu'un jeton
    // `drive.readonly`. Même bugué, même appelé par erreur, il ne PEUT pas
    // écrire — Google refuse. La séparation des droits staff, appliquée un cran
    // plus bas, là où une erreur de code ne peut plus la contourner.
    const calls = mockFetch((url) => {
      if (url.includes(`/files/${ROOT}`)) {
        return { id: ROOT, name: 'Asso', mimeType: 'folder', parents: [] };
      }
      if (url.includes('/upload/drive/v3/files')) {
        return { id: 'new', name: 'PV.pdf', mimeType: 'application/pdf' };
      }
      return { files: [] };
    });

    const { listDriveFiles, uploadDriveFile, resetDriveTokenCache } =
      await import('@/utils/googleDrive');
    resetDriveTokenCache();

    await listDriveFiles();
    await uploadDriveFile({
      name: 'PV.pdf',
      mimeType: 'application/pdf',
      content: Buffer.from('%PDF-1.4'),
    });

    const scopes = calls
      .filter((c) => c.url.startsWith('https://oauth2.googleapis.com/token'))
      .map((c) => {
        const assertion = String(
          new URLSearchParams(c.init?.body as string).get('assertion')
        );
        const claims = JSON.parse(
          Buffer.from(assertion.split('.')[1], 'base64url').toString('utf8')
        );
        return claims.scope;
      });

    expect(scopes).toContain('https://www.googleapis.com/auth/drive.readonly');
    expect(scopes).toContain('https://www.googleapis.com/auth/drive');
  });

  it('refuse un type de fichier hors de la liste fermée', async () => {
    mockFetch(() => ({}));
    const { uploadDriveFile, DriveUploadError, resetDriveTokenCache } =
      await import('@/utils/googleDrive');
    resetDriveTokenCache();

    await expect(
      uploadDriveFile({
        name: 'charge.html',
        mimeType: 'text/html',
        content: Buffer.from('<script>'),
      })
    ).rejects.toBeInstanceOf(DriveUploadError);
  });

  it('refuse de déposer dans un dossier hors de la racine', async () => {
    mockFetch((url) => {
      if (url.includes('/files/ailleurs')) {
        return {
          id: 'ailleurs',
          name: 'Perso',
          mimeType: 'folder',
          parents: [],
        };
      }
      return {};
    });
    const { uploadDriveFile, DriveConfigError, resetDriveTokenCache } =
      await import('@/utils/googleDrive');
    resetDriveTokenCache();

    await expect(
      uploadDriveFile({
        folderId: 'ailleurs',
        name: 'PV.pdf',
        mimeType: 'application/pdf',
        content: Buffer.from('%PDF'),
      })
    ).rejects.toBeInstanceOf(DriveConfigError);
  });

  it('met à la CORBEILLE plutôt que de supprimer', async () => {
    // Trente jours de rattrapage. Une suppression irréversible déclenchée
    // depuis une page web, sur les statuts d'une asso, n'a pas lieu d'être.
    const calls = mockFetch((url) => {
      if (url.includes('/files/doc1')) {
        return { id: 'doc1', name: 'PV.pdf', parents: [ROOT] };
      }
      if (url.includes(`/files/${ROOT}`)) {
        return { id: ROOT, name: 'Asso', mimeType: 'folder', parents: [] };
      }
      return {};
    });

    const { trashDriveFile, resetDriveTokenCache } =
      await import('@/utils/googleDrive');
    resetDriveTokenCache();
    await trashDriveFile('doc1');

    const patch = calls.find((c) => c.init?.method === 'PATCH');
    expect(patch).toBeDefined();
    expect(JSON.parse(String(patch?.init?.body))).toEqual({ trashed: true });
    // Aucun DELETE : c'est le point du test.
    expect(calls.find((c) => c.init?.method === 'DELETE')).toBeUndefined();
  });

  it('refuse de jeter un fichier qui vit hors de la racine', async () => {
    mockFetch((url) => {
      if (url.includes('/files/etranger')) {
        return { id: 'etranger', name: 'X', parents: ['ailleurs'] };
      }
      if (url.includes('/files/ailleurs')) {
        return { id: 'ailleurs', name: 'Perso', parents: [] };
      }
      return {};
    });
    const { trashDriveFile, DriveConfigError, resetDriveTokenCache } =
      await import('@/utils/googleDrive');
    resetDriveTokenCache();

    await expect(trashDriveFile('etranger')).rejects.toBeInstanceOf(
      DriveConfigError
    );
  });
});

describe('utils/googleDrive — formes de configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.GOOGLE_DRIVE_FOLDER_ID = ROOT;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_DRIVE_SA_KEY;
    delete process.env.GOOGLE_DRIVE_SA_EMAIL;
    delete process.env.GOOGLE_DRIVE_SA_PRIVATE_KEY;
    delete process.env.GOOGLE_DRIVE_FOLDER_ID;
  });

  it('accepte la FORME COURTE : email + PEM en deux variables', async () => {
    // Netlify plafonne l'ensemble des variables à 4 Ko en mode compatibilité
    // Lambda. Le JSON complet en base64 pèse ~3,1 Ko et fait échouer la
    // création de TOUTES les fonctions — c'est arrivé au premier déploiement.
    process.env.GOOGLE_DRIVE_SA_EMAIL = 'asso@projet.iam.gserviceaccount.com';
    process.env.GOOGLE_DRIVE_SA_PRIVATE_KEY = privateKey;
    const { isDriveConfigured } = await import('@/utils/googleDrive');
    expect(isDriveConfigured()).toBe(true);
  });

  it('la forme courte accepte un PEM aux retours à la ligne échappés', async () => {
    process.env.GOOGLE_DRIVE_SA_EMAIL = 'asso@projet.iam.gserviceaccount.com';
    process.env.GOOGLE_DRIVE_SA_PRIVATE_KEY = privateKey.replace(/\n/g, '\\n');

    mockFetch((url) => {
      if (url.includes(`/files/${ROOT}`)) {
        return { id: ROOT, name: 'Asso', mimeType: 'folder', parents: [] };
      }
      return { files: [] };
    });
    const { listDriveFiles, resetDriveTokenCache } =
      await import('@/utils/googleDrive');
    resetDriveTokenCache();
    // Signer exige un PEM réel : si la normalisation n'avait pas lieu, OpenSSL
    // échouerait ici avec un message incompréhensible.
    await expect(listDriveFiles()).resolves.toBeTruthy();
  });

  it('refuse une forme courte à moitié renseignée', async () => {
    // Une seule des deux = erreur de configuration, pas absence. Traiter ça
    // comme « non configuré » ferait chercher pourquoi rien ne se passe.
    process.env.GOOGLE_DRIVE_SA_EMAIL = 'asso@projet.iam.gserviceaccount.com';
    const { listDriveFiles, DriveConfigError } =
      await import('@/utils/googleDrive');
    await expect(listDriveFiles()).rejects.toBeInstanceOf(DriveConfigError);
  });

  it('la forme courte l’emporte sur le JSON complet', async () => {
    // Les deux posées, c'est une migration en cours : on prend la forme qui
    // tient dans le budget, pas celle qui l'a fait exploser.
    process.env.GOOGLE_DRIVE_SA_KEY = saKey();
    process.env.GOOGLE_DRIVE_SA_EMAIL = 'court@projet.iam.gserviceaccount.com';
    process.env.GOOGLE_DRIVE_SA_PRIVATE_KEY = privateKey;

    const calls = mockFetch((url) => {
      if (url.includes(`/files/${ROOT}`)) {
        return { id: ROOT, name: 'Asso', mimeType: 'folder', parents: [] };
      }
      return { files: [] };
    });
    const { listDriveFiles, resetDriveTokenCache } =
      await import('@/utils/googleDrive');
    resetDriveTokenCache();
    await listDriveFiles();

    const tokenCall = calls.find((c) =>
      c.url.startsWith('https://oauth2.googleapis.com/token')
    );
    const assertion = String(
      new URLSearchParams(tokenCall?.init?.body as string).get('assertion')
    );
    const claims = JSON.parse(
      Buffer.from(assertion.split('.')[1], 'base64url').toString('utf8')
    );
    expect(claims.iss).toBe('court@projet.iam.gserviceaccount.com');
  });
});
