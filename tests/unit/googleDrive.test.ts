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
      const body = handler(url) as Record<string, unknown>;
      // Les appels de CONTENU (alt=media / export) rendent un flux, pas du
      // JSON : le code relaie `res.body` tel quel.
      const stream =
        body && body.__stream
          ? new ReadableStream({
              start(c) {
                c.enqueue(new Uint8Array([1, 2, 3]));
                c.close();
              },
            })
          : null;
      return {
        ok: true,
        body: stream,
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
    await expect(isDriveConfigured()).resolves.toBe(false);
  });

  it('accepte la clé en base64 (collage sûr dans Netlify)', async () => {
    process.env.GOOGLE_DRIVE_SA_KEY = Buffer.from(saKey()).toString('base64');
    const { isDriveConfigured } = await import('@/utils/googleDrive');
    await expect(isDriveConfigured()).resolves.toBe(true);
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

  it('refuse un dossier qu’on n’atteint pas en descendant depuis la racine', () => {
    // Le garde-fou qui compte : sans lui, le paramètre `folderId` de la route
    // laisserait lister n'importe quel dossier visible du compte de service.
    return (async () => {
      mockFetch((url) => {
        if (url.includes(`/files/${ROOT}`)) {
          return { id: ROOT, name: 'Asso', mimeType: 'folder' };
        }
        // La racine n'a aucun sous-dossier : « ailleurs » est hors arborescence.
        return { files: [] };
      });

      const { listDriveFiles, DriveConfigError, resetDriveTokenCache } =
        await import('@/utils/googleDrive');
      resetDriveTokenCache();
      await expect(
        listDriveFiles({ folderId: 'ailleurs' })
      ).rejects.toBeInstanceOf(DriveConfigError);
    })();
  });

  it('accepte un sous-dossier et rend le fil d’Ariane complet', async () => {
    // RÉGRESSION du 2026-09-01 : Google n'expose PAS `parents` quand l'accès du
    // compte de service vient d'un PARTAGE. Ce mock le reproduit — aucune
    // réponse ne porte `parents`. La vérification doit donc DESCENDRE depuis la
    // racine ; la version qui remontait la chaîne des parents refusait tous les
    // sous-dossiers du Drive de l'asso.
    let listCall = 0;
    mockFetch((url) => {
      if (url.includes(`/files/${ROOT}`)) {
        return { id: ROOT, name: 'Asso', mimeType: 'folder' };
      }
      if (url.includes('drive/v3/files?')) {
        listCall += 1;
        // 1er appel : sous-dossiers de la racine. Suivants : contenu de « sub ».
        return listCall === 1
          ? { files: [{ id: 'sub', name: 'AG 2026' }] }
          : { files: [] };
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
      if (url.includes(`/files/${ROOT}`)) {
        return { id: ROOT, name: 'Asso', mimeType: 'folder' };
      }
      return { files: [] };
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
      if (url.includes(`/files/${ROOT}`)) {
        return { id: ROOT, name: 'Asso', mimeType: 'folder' };
      }
      // Enfants du dossier visé : le fichier en fait partie.
      if (url.includes('drive/v3/files?')) {
        return { files: [{ id: 'doc1', name: 'PV.pdf' }] };
      }
      return {};
    });

    const { trashDriveFile, resetDriveTokenCache } =
      await import('@/utils/googleDrive');
    resetDriveTokenCache();
    await trashDriveFile({ fileId: 'doc1' });

    const patch = calls.find((c) => c.init?.method === 'PATCH');
    expect(patch).toBeDefined();
    expect(JSON.parse(String(patch?.init?.body))).toEqual({ trashed: true });
    // Aucun DELETE : c'est le point du test.
    expect(calls.find((c) => c.init?.method === 'DELETE')).toBeUndefined();
  });

  it('refuse de jeter un fichier absent du dossier affiché', async () => {
    // Le compte de service voit peut-être ce fichier — mais il n'est pas DANS
    // le dossier depuis lequel le geste est fait.
    mockFetch((url) => {
      if (url.includes(`/files/${ROOT}`)) {
        return { id: ROOT, name: 'Asso', mimeType: 'folder' };
      }
      if (url.includes('drive/v3/files?')) {
        return { files: [{ id: 'un-autre', name: 'Autre.pdf' }] };
      }
      return {};
    });
    const { trashDriveFile, DriveConfigError, resetDriveTokenCache } =
      await import('@/utils/googleDrive');
    resetDriveTokenCache();

    await expect(trashDriveFile({ fileId: 'etranger' })).rejects.toBeInstanceOf(
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
    await expect(isDriveConfigured()).resolves.toBe(true);
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

  it('email seul sans clé : « en attente de la clé », pas « non configuré »', async () => {
    // C'est la configuration NORMALE de production : l'adresse en environnement
    // (52 octets), la clé privée chiffrée en base. Sans clé encore posée,
    // l'écran doit proposer de la coller — pas renvoyer vers la création d'un
    // compte de service déjà fait.
    process.env.GOOGLE_DRIVE_SA_EMAIL = 'asso@projet.iam.gserviceaccount.com';
    const { isDriveConfigured, isDriveAwaitingPrivateKey } =
      await import('@/utils/googleDrive');
    await expect(isDriveConfigured()).resolves.toBe(false);
    await expect(isDriveAwaitingPrivateKey()).resolves.toBe(true);
  });

  it('sans même l’adresse : rien n’est configuré, on n’attend aucune clé', async () => {
    const { isDriveAwaitingPrivateKey } = await import('@/utils/googleDrive');
    await expect(isDriveAwaitingPrivateKey()).resolves.toBe(false);
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

describe('utils/googleDrive — téléchargement', () => {
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

  /** Mock qui répond aussi un `body` (flux) pour les appels de contenu. */
  function mockDownload(meta: Record<string, unknown>) {
    return mockFetch((url) => {
      if (url.includes(`/files/${ROOT}`)) {
        return { id: ROOT, name: 'Asso', mimeType: 'folder' };
      }
      if (url.includes('/export?') || url.includes('alt=media')) {
        return { __stream: true };
      }
      if (url.includes('drive/v3/files?')) {
        return { files: [{ id: 'doc1' }] };
      }
      return meta;
    });
  }

  it('demande un jeton en LECTURE SEULE pour télécharger', async () => {
    // Un chemin de téléchargement qui détiendrait un jeton d'écriture pourrait
    // modifier ce qu'il est censé seulement lire.
    const calls = mockDownload({
      id: 'doc1',
      name: 'PV.pdf',
      mimeType: 'application/pdf',
      size: '1024',
    });
    const { downloadDriveFile, resetDriveTokenCache } =
      await import('@/utils/googleDrive');
    resetDriveTokenCache();
    await downloadDriveFile({ fileId: 'doc1' });

    const scopes = calls
      .filter((c) => c.url.startsWith('https://oauth2.googleapis.com/token'))
      .map((c) => {
        const assertion = String(
          new URLSearchParams(c.init?.body as string).get('assertion')
        );
        return JSON.parse(
          Buffer.from(assertion.split('.')[1], 'base64url').toString('utf8')
        ).scope;
      });
    expect(scopes).toContain('https://www.googleapis.com/auth/drive.readonly');
    expect(scopes).not.toContain('https://www.googleapis.com/auth/drive');
  });

  it('EXPORTE un Google Doc en PDF, et corrige l’extension', async () => {
    // Un format natif Google n'a pas de contenu binaire : sans export, le
    // téléchargement rendrait un fichier vide. Et le nom côté Drive ne porte
    // pas l'extension d'arrivée — la laisser mentirait sur le contenu.
    const calls = mockDownload({
      id: 'doc1',
      name: 'PV du 12 mars',
      mimeType: 'application/vnd.google-apps.document',
    });
    const { downloadDriveFile, resetDriveTokenCache } =
      await import('@/utils/googleDrive');
    resetDriveTokenCache();
    const file = await downloadDriveFile({ fileId: 'doc1' });

    expect(file.filename).toBe('PV du 12 mars.pdf');
    expect(file.mimeType).toBe('application/pdf');
    expect(calls.some((c) => c.url.includes('/export?'))).toBe(true);
  });

  it('laisse un PDF tel quel, sans export', async () => {
    const calls = mockDownload({
      id: 'doc1',
      name: 'RIB.pdf',
      mimeType: 'application/pdf',
      size: '2048',
    });
    const { downloadDriveFile, resetDriveTokenCache } =
      await import('@/utils/googleDrive');
    resetDriveTokenCache();
    const file = await downloadDriveFile({ fileId: 'doc1' });

    expect(file.filename).toBe('RIB.pdf');
    expect(file.size).toBe(2048);
    expect(calls.some((c) => c.url.includes('/export?'))).toBe(false);
    expect(calls.some((c) => c.url.includes('alt=media'))).toBe(true);
  });

  it('refuse un fichier absent du dossier affiché', async () => {
    // Même confinement que la liste et la corbeille : sans lui, `fileId`
    // permettrait d'aspirer tout ce que le compte de service voit.
    mockFetch((url) => {
      if (url.includes(`/files/${ROOT}`)) {
        return { id: ROOT, name: 'Asso', mimeType: 'folder' };
      }
      if (url.includes('drive/v3/files?')) {
        return { files: [{ id: 'un-autre' }] };
      }
      return {};
    });
    const { downloadDriveFile, DriveConfigError, resetDriveTokenCache } =
      await import('@/utils/googleDrive');
    resetDriveTokenCache();

    await expect(
      downloadDriveFile({ fileId: 'etranger' })
    ).rejects.toBeInstanceOf(DriveConfigError);
  });
});
