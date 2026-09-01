// utils/googleDrive.ts
//
// Lecture SEULE du Drive de l'association, via un COMPTE DE SERVICE Google.
//
// Pourquoi un compte de service et pas OAuth (cf. docs/ETUDE-drive-et-chat.md) :
// un token OAuth appartient à une personne. Le jour où la trésorière quitte
// l'asso — ou révoque l'accès depuis son compte Google — l'intégration meurt,
// et personne ne saura pourquoi. Un compte de service appartient à
// l'organisation : on partage le dossier avec son adresse
// `…@….iam.gserviceaccount.com`, et il n'y a plus rien à renouveler.
//
// Pas de dépendance `googleapis` : la bibliothèque pèse plusieurs mégaoctets
// pour ce dont on se sert ici — signer un JWT et appeler deux URL. Le JWT est
// signé avec `node:crypto` (RS256), comme le reste du dépôt signe ses jetons.
//
// PÉRIMÈTRE : `drive.readonly`, et un compte de service ne voit QUE ce qu'on
// lui partage explicitement. Le dossier racine configuré est la seule porte ;
// `assertWithinRoot` interdit de sortir de son arborescence.
//
// OÙ VIT LA CLÉ PRIVÉE. En BASE, chiffrée (`utils/integrationSecrets.ts`), pas
// dans l'environnement. Netlify plafonne l'env des fonctions à 4 Ko en mode
// compatibilité Lambda ; ce budget était déjà presque plein, et y ajouter la
// clé (1,7 Ko) a fait échouer les dix-neuf fonctions cron d'un coup. Les
// variables d'environnement ne gardent que l'adresse du compte, l'id du dossier
// et la clé de chiffrement — moins de 200 octets.
//
// Les formes « tout en env » restent acceptées pour le développement local, où
// ce budget n'existe pas.
//
// Configuration absente = fonctionnalité désactivée, pas erreur. Même posture
// que `MATCHES_LIVE_CHANNEL_ID` côté bot : un cran de config manquant éteint sa
// fonctionnalité sans casser ce qui l'entoure.

import crypto from 'node:crypto';
import { DRIVE_UPLOAD_MAX_BYTES } from './documents/driveLimits';
import { getIntegrationSecret } from './integrationSecrets';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

/**
 * DEUX portées, et un jeton par portée.
 *
 * Le chemin de lecture ne détient qu'un jeton `drive.readonly` : même bugué,
 * même appelé par erreur depuis une route d'écriture, il ne PEUT pas écrire —
 * Google refuse. C'est la même séparation que celle des droits staff
 * (`read_documents` / `manage_documents`), appliquée un cran plus bas, là où
 * une erreur de code ne peut plus la contourner.
 */
const SCOPE_READ = 'https://www.googleapis.com/auth/drive.readonly';
const SCOPE_WRITE = 'https://www.googleapis.com/auth/drive';

type DriveScope = typeof SCOPE_READ | typeof SCOPE_WRITE;

/** Profondeur max explorée depuis la racine. Un Drive d'asso est large et plat. */
const MAX_FOLDER_DEPTH = 6;
/** Plafond de dossiers visités par vérification, pour borner le pire cas. */
const MAX_FOLDERS_VISITED = 500;

export const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  /** `true` pour un dossier — la page en fait un lien de navigation. */
  isFolder: boolean;
  /** Octets. `null` pour les dossiers et les fichiers natifs Google (Docs…). */
  size: number | null;
  modifiedTime: string | null;
  /** Qui a modifié en dernier, tel que Google le rapporte. */
  modifiedBy: string | null;
  /** Lien d'ouverture DANS Drive — on ne sert jamais le contenu nous-mêmes. */
  webViewLink: string | null;
};

export type DriveListing = {
  files: DriveFile[];
  /** Dossier effectivement listé (racine si aucun n'est demandé). */
  folderId: string;
  folderName: string | null;
  /** Fil d'Ariane, de la racine au dossier courant (racine incluse). */
  breadcrumb: { id: string; name: string }[];
};

type ServiceAccountKey = {
  client_email: string;
  private_key: string;
};

/** Erreur « la faute est dans la configuration, pas dans l'appel ». */
export class DriveConfigError extends Error {}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Les identifiants du compte de service. DEUX formes acceptées.
 *
 * 1. FORME COURTE (à préférer en production) — deux variables :
 *      GOOGLE_DRIVE_SA_EMAIL        l'adresse …iam.gserviceaccount.com
 *      GOOGLE_DRIVE_SA_PRIVATE_KEY  la clé privée PEM, telle quelle
 *
 * 2. FORME LONGUE — GOOGLE_DRIVE_SA_KEY : la clé JSON entière telle que Google
 *    la télécharge, en clair ou en base64. Pratique en développement, où l'on
 *    colle le fichier sans le découper.
 *
 * POURQUOI DEUX FORMES. Netlify exécute ses fonctions en mode compatibilité
 * Lambda, qui plafonne l'ENSEMBLE des variables d'environnement à 4 Ko. Le JSON
 * complet en base64 pèse ~3,1 Ko : il tient dans la limite tout seul, et fait
 * échouer la création de TOUTES les fonctions dès qu'on l'ajoute aux autres
 * secrets — ce qui s'est produit au premier déploiement. La forme courte ne
 * garde que ce dont on se sert (~1,75 Ko) : le JSON contient une dizaine de
 * champs dont aucun n'est lu ici.
 */
function readServiceAccountKeyFromEnv(): ServiceAccountKey | null {
  const email = process.env.GOOGLE_DRIVE_SA_EMAIL?.trim();
  const pem = process.env.GOOGLE_DRIVE_SA_PRIVATE_KEY?.trim();
  if (email && pem) {
    return { client_email: email, private_key: pem.replace(/\\n/g, '\n') };
  }

  const raw = process.env.GOOGLE_DRIVE_SA_KEY?.trim();
  if (!raw) return null;

  const json = raw.startsWith('{')
    ? raw
    : Buffer.from(raw, 'base64').toString('utf8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new DriveConfigError(
      'GOOGLE_DRIVE_SA_KEY n’est ni un JSON valide ni du base64 de JSON.'
    );
  }

  const key = parsed as Partial<ServiceAccountKey>;
  if (!key.client_email || !key.private_key) {
    throw new DriveConfigError(
      'GOOGLE_DRIVE_SA_KEY ne contient pas client_email / private_key.'
    );
  }

  return {
    client_email: key.client_email,
    // Une clé passée par variable d'environnement arrive souvent avec ses
    // retours à la ligne échappés — RS256 échouerait sans cette normalisation,
    // avec un message d'OpenSSL parfaitement incompréhensible.
    private_key: key.private_key.replace(/\\n/g, '\n'),
  };
}

export function getDriveRootFolderId(): string | null {
  return process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() || null;
}

/**
 * Résout les identifiants du compte de service, dans cet ordre :
 *   1. l'environnement (développement local — voir plus haut) ;
 *   2. l'adresse en environnement + la clé privée CHIFFRÉE EN BASE, qui est
 *      la configuration de production.
 *
 * `tenantId` absent = on s'en tient à l'environnement. Utile aux appels qui
 * n'ont pas de contexte tenant (tests, scripts).
 */
async function resolveServiceAccountKey(
  tenantId?: string | null
): Promise<ServiceAccountKey | null> {
  const fromEnv = readServiceAccountKeyFromEnv();
  if (fromEnv) return fromEnv;

  const email = process.env.GOOGLE_DRIVE_SA_EMAIL?.trim();
  if (!email || !tenantId) return null;

  const pem = await getIntegrationSecret(
    tenantId,
    'google_drive_sa_private_key'
  );
  if (!pem) return null;

  return { client_email: email, private_key: pem.replace(/\\n/g, '\n') };
}

/** `true` quand tous les crans de config sont présents. */
export async function isDriveConfigured(
  tenantId?: string | null
): Promise<boolean> {
  if (!getDriveRootFolderId()) return false;
  try {
    return !!(await resolveServiceAccountKey(tenantId));
  } catch {
    // Clé présente mais illisible : ce n'est PAS « non configuré ». On laisse
    // l'appel réel remonter l'erreur, qui dit quoi corriger.
    return true;
  }
}

/**
 * `true` si l'adresse du compte est posée mais la clé privée introuvable —
 * l'état exact de « il reste à coller la clé ». Le distinguer de « rien n'est
 * configuré » évite de renvoyer quelqu'un vers la création d'un compte de
 * service qu'il a déjà faite.
 */
export async function isDriveAwaitingPrivateKey(
  tenantId?: string | null
): Promise<boolean> {
  if (!process.env.GOOGLE_DRIVE_SA_EMAIL?.trim()) return false;
  if (readServiceAccountKeyFromEnv()) return false;
  return !(await resolveServiceAccountKey(tenantId));
}

// ---------------------------------------------------------------------------
// Jeton d'accès
// ---------------------------------------------------------------------------

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Cache mémoire des jetons, INDEXÉ PAR PORTÉE. Un jeton Google vit une heure ;
 * le re-signer à chaque requête ajouterait un aller-retour réseau à chaque
 * affichage de la page. Marge de 60 s pour ne pas présenter un jeton qui expire
 * en vol.
 */
const tokenCache = new Map<DriveScope, { token: string; expiresAt: number }>();

/** Vide le cache — pour les tests, et après un changement de configuration. */
export function resetDriveTokenCache() {
  tokenCache.clear();
}

async function getAccessToken(
  scope: DriveScope,
  tenantId?: string | null
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(scope);
  if (cached && cached.expiresAt - 60 > now) return cached.token;

  const key = await resolveServiceAccountKey(tenantId);
  if (!key) {
    throw new DriveConfigError(
      'Identifiants du compte de service Drive introuvables (ni en environnement, ni en base).'
    );
  }

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );
  const signature = base64url(
    crypto.sign(
      'RSA-SHA256',
      Buffer.from(`${header}.${claims}`),
      key.private_key
    )
  );

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `Google a refusé le compte de service (${res.status}). ${detail.slice(0, 300)}`
    );
  }

  const payload = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!payload.access_token) {
    throw new Error('Réponse Google sans access_token.');
  }

  tokenCache.set(scope, {
    token: payload.access_token,
    expiresAt: now + (payload.expires_in ?? 3600),
  });
  return payload.access_token;
}

// ---------------------------------------------------------------------------
// Appels Drive
// ---------------------------------------------------------------------------

async function driveGet<T>(
  url: string,
  params: Record<string, string>,
  tenantId?: string | null
): Promise<T> {
  const token = await getAccessToken(SCOPE_READ, tenantId);
  const qs = new URLSearchParams({
    // Un Drive partagé (Shared Drive) est invisible sans ces deux drapeaux, et
    // l'API répond alors une liste VIDE plutôt qu'une erreur — le genre de
    // panne qu'on met une heure à diagnostiquer.
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    ...params,
  });
  const res = await fetch(`${url}?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Drive a répondu ${res.status}. ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

type RawFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  parents?: string[];
  lastModifyingUser?: { displayName?: string };
};

const FILE_FIELDS =
  'id,name,mimeType,size,modifiedTime,webViewLink,lastModifyingUser(displayName)';

function toDriveFile(f: RawFile): DriveFile {
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    isFolder: f.mimeType === DRIVE_FOLDER_MIME,
    // Un Google Doc natif n'a pas de taille : Google n'en renvoie pas, et
    // afficher « 0 o » ferait croire à un fichier vide.
    size: f.size ? Number(f.size) : null,
    modifiedTime: f.modifiedTime ?? null,
    modifiedBy: f.lastModifyingUser?.displayName ?? null,
    webViewLink: f.webViewLink ?? null,
  };
}

/** Échappe une valeur pour la syntaxe `q` de Drive (guillemets simples). */
function escapeQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function getFolderMeta(
  folderId: string,
  tenantId?: string | null
): Promise<{ id: string; name: string }> {
  const f = await driveGet<RawFile>(
    `${FILES_URL}/${encodeURIComponent(folderId)}`,
    { fields: 'id,name,mimeType' },
    tenantId
  );
  return { id: f.id, name: f.name };
}

/** Sous-dossiers DIRECTS d'un dossier. */
async function listChildFolders(
  parentId: string,
  tenantId?: string | null
): Promise<{ id: string; name: string }[]> {
  const payload = await driveGet<{ files?: RawFile[] }>(
    FILES_URL,
    {
      q: `'${escapeQuery(parentId)}' in parents and mimeType = '${DRIVE_FOLDER_MIME}' and trashed = false`,
      orderBy: 'name',
      pageSize: '200',
      fields: 'files(id,name)',
    },
    tenantId
  );
  return (payload.files ?? []).map((f) => ({ id: f.id, name: f.name }));
}

/**
 * Chemin de la racine jusqu'à `folderId`, en DESCENDANT — et donc preuve que ce
 * dossier appartient bien à l'arborescence configurée.
 *
 * POURQUOI EN DESCENDANT. La première version remontait la chaîne des parents
 * (`files.get(id).parents`). Elle ne pouvait pas marcher : **Google n'expose
 * pas `parents` quand l'accès du compte de service vient d'un PARTAGE** et non
 * d'une possession. La réponse est un 200 parfaitement valide, simplement sans
 * ce champ — donc tout sous-dossier était déclaré hors arborescence, et aucun
 * n'était navigable. Constaté sur le Drive de l'asso le 2026-09-01.
 *
 * Descendre depuis la racine n'a pas ce défaut : `'<parent>' in parents` est
 * une requête de RECHERCHE, qui répond sur ce que le compte peut voir. C'est
 * aussi la propriété qu'on veut réellement démontrer — « ce dossier est DANS
 * l'arborescence » — plutôt que son symétrique.
 *
 * Coût : une requête par NIVEAU exploré, pas par dossier. Un Drive d'asso est
 * large et plat ; le plafond de profondeur et celui de dossiers visités
 * bornent le pire cas.
 */
async function resolvePathFromRoot(
  folderId: string,
  rootId: string,
  tenantId?: string | null
): Promise<{ id: string; name: string }[]> {
  const root = await getFolderMeta(rootId, tenantId);
  if (folderId === rootId) return [root];

  // Parcours en largeur : les sous-dossiers cherchés sont presque toujours à un
  // niveau de la racine, et la largeur d'abord les trouve en une requête.
  let frontier: { id: string; name: string }[][] = [[root]];
  const seen = new Set<string>([rootId]);
  let visited = 0;

  for (let depth = 0; depth < MAX_FOLDER_DEPTH; depth += 1) {
    const next: { id: string; name: string }[][] = [];

    for (const path of frontier) {
      const parent = path[path.length - 1]!;
      const children = await listChildFolders(parent.id, tenantId);

      for (const child of children) {
        if (child.id === folderId) return [...path, child];
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        visited += 1;
        if (visited > MAX_FOLDERS_VISITED) {
          throw new DriveConfigError(
            'Arborescence trop vaste pour être vérifiée : réduire le dossier racine configuré.'
          );
        }
        next.push([...path, child]);
      }
    }

    if (next.length === 0) break;
    frontier = next;
  }

  throw new DriveConfigError('Ce dossier n’appartient pas au Drive configuré.');
}

/**
 * `true` si `fileId` est un enfant DIRECT de `folderId`.
 *
 * Combiné à `resolvePathFromRoot(folderId)`, cela prouve que le fichier est
 * dans l'arborescence — sans dépendre de `parents`, que Google n'expose pas
 * ici (voir ci-dessus).
 */
async function isChildOfFolder(
  fileId: string,
  folderId: string,
  tenantId?: string | null
): Promise<boolean> {
  const payload = await driveGet<{ files?: RawFile[] }>(
    FILES_URL,
    {
      q: `'${escapeQuery(folderId)}' in parents and trashed = false`,
      pageSize: '1000',
      fields: 'files(id)',
    },
    tenantId
  );
  return (payload.files ?? []).some((f) => f.id === fileId);
}

export type ListDriveFilesOptions = {
  /** Sous-dossier à lister. Défaut : la racine configurée. */
  folderId?: string | null;
  /** Filtre plein texte sur le nom, appliqué par Google. */
  search?: string | null;
  /** Tenant dont on lit la clé privée en base. */
  tenantId?: string | null;
};

export async function listDriveFiles(
  opts: ListDriveFilesOptions = {}
): Promise<DriveListing> {
  const rootId = getDriveRootFolderId();
  if (!rootId) throw new DriveConfigError('GOOGLE_DRIVE_FOLDER_ID absent.');

  const targetId = opts.folderId?.trim() || rootId;
  const breadcrumb = await resolvePathFromRoot(targetId, rootId, opts.tenantId);

  const clauses = [`'${escapeQuery(targetId)}' in parents`, 'trashed = false'];
  const search = opts.search?.trim();
  if (search) clauses.push(`name contains '${escapeQuery(search)}'`);

  const payload = await driveGet<{ files?: RawFile[] }>(
    FILES_URL,
    {
      q: clauses.join(' and '),
      // Les dossiers en tête, puis l'ordre alphabétique : c'est l'ordre dans
      // lequel Drive lui-même présente un dossier, donc celui que les gens ont
      // en tête.
      orderBy: 'folder,name',
      pageSize: '200',
      fields: `files(${FILE_FIELDS})`,
    },
    opts.tenantId
  );

  return {
    files: (payload.files ?? []).map(toDriveFile),
    folderId: targetId,
    folderName: breadcrumb[breadcrumb.length - 1]?.name ?? null,
    breadcrumb,
  };
}

// ---------------------------------------------------------------------------
// Écriture — dépôt et mise à la corbeille
//
// Séparées de la lecture jusqu'en bas de la pile : droit staff distinct
// (`manage_documents`), portée OAuth distincte (`drive` vs `drive.readonly`),
// jeton distinct. Une erreur dans le chemin de lecture ne peut pas écrire.
// ---------------------------------------------------------------------------

/**
 * Ce qu'on accepte de déposer. Une liste FERMÉE, pas parce que Drive s'en
 * soucierait, mais parce qu'un formulaire d'upload ouvert sur le Drive de
 * l'asso est une porte d'entrée : ce qui y monte est ensuite partagé par des
 * gens qui font confiance à la provenance.
 */
export const DRIVE_UPLOAD_MIME_TYPES: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'text/csv': '.csv',
  'text/plain': '.txt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    '.pptx',
  'application/vnd.oasis.opendocument.text': '.odt',
  'application/vnd.oasis.opendocument.spreadsheet': '.ods',
};

/**
 * 25 Mo. Défini dans `utils/documents/driveLimits.ts` et ré-exporté ici : le
 * bouton de dépôt a besoin de la même valeur, et importer ce module-ci depuis
 * un composant client ferait entrer `node:crypto` dans le bundle navigateur.
 */
export { DRIVE_UPLOAD_MAX_BYTES } from './documents/driveLimits';

export class DriveUploadError extends Error {}

export type UploadDriveFileArgs = {
  /** Dossier cible. Doit être la racine ou l'un de ses descendants. */
  folderId?: string | null;
  name: string;
  mimeType: string;
  content: Buffer;
  /** Tenant dont on lit la clé privée en base. */
  tenantId?: string | null;
};

/**
 * Dépose un fichier. Renvoie la fiche du fichier créé.
 *
 * Le nom est nettoyé : un `/` dans un nom de fichier Drive ne casse rien côté
 * Google, mais rend le fichier pénible à retrouver et le chemin ambigu partout
 * ailleurs. Un nom vide devient `document`.
 */
export async function uploadDriveFile(
  args: UploadDriveFileArgs
): Promise<DriveFile> {
  const rootId = getDriveRootFolderId();
  if (!rootId) throw new DriveConfigError('GOOGLE_DRIVE_FOLDER_ID absent.');

  if (!DRIVE_UPLOAD_MIME_TYPES[args.mimeType]) {
    throw new DriveUploadError(
      `Type de fichier non accepté : ${args.mimeType}`
    );
  }
  if (args.content.byteLength > DRIVE_UPLOAD_MAX_BYTES) {
    throw new DriveUploadError('Fichier trop volumineux (25 Mo maximum).');
  }

  const targetId = args.folderId?.trim() || rootId;
  await resolvePathFromRoot(targetId, rootId, args.tenantId);

  const name = args.name.replace(/[/\\]/g, '-').trim() || 'document';
  const token = await getAccessToken(SCOPE_WRITE, args.tenantId);

  // Upload multipart « à la main » : la requête est un corps en deux parties
  // (métadonnées JSON, puis octets). Une dépendance de plusieurs mégaoctets
  // pour construire ces vingt lignes ne se justifie pas.
  const boundary = `drive-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name, parents: [targetId] });
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: ${args.mimeType}\r\n\r\n`
    ),
    args.content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const res = await fetch(
    `${UPLOAD_URL}?uploadType=multipart&supportsAllDrives=true&fields=${encodeURIComponent(FILE_FIELDS)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: new Uint8Array(body),
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // 403 sur un dépôt = le dossier est partagé en LECTEUR avec le compte de
    // service. C'est la panne la plus probable, et le message générique de
    // Google ne le dit pas.
    if (res.status === 403) {
      throw new DriveUploadError(
        'Google refuse le dépôt. Le dossier est probablement partagé en « Lecteur » avec le compte de service : passer en « Éditeur ».'
      );
    }
    throw new Error(`Drive a répondu ${res.status}. ${detail.slice(0, 300)}`);
  }

  return toDriveFile((await res.json()) as RawFile);
}

/**
 * Met un fichier à la CORBEILLE Drive — pas de suppression définitive.
 *
 * La corbeille est le rattrapage : trente jours pour revenir sur un geste fait
 * de travers, exactement comme si la personne avait supprimé depuis Drive. Une
 * suppression irréversible déclenchée depuis une page web, sur les statuts
 * d'une association, n'a aucune raison d'exister.
 */
export type TrashDriveFileArgs = {
  fileId: string;
  /**
   * Dossier depuis lequel le geste est fait. Nécessaire, et pas déductible :
   * Google n'expose pas `parents` sur un accès obtenu par partage. C'est le
   * dossier qui est vérifié comme appartenant à l'arborescence, puis le fichier
   * comme étant l'un de ses enfants.
   */
  folderId?: string | null;
  tenantId?: string | null;
};

export async function trashDriveFile({
  fileId,
  folderId,
  tenantId,
}: TrashDriveFileArgs): Promise<void> {
  const rootId = getDriveRootFolderId();
  if (!rootId) throw new DriveConfigError('GOOGLE_DRIVE_FOLDER_ID absent.');

  // Deux vérifications, dans cet ordre : le dossier est-il dans l'arborescence
  // configurée, et le fichier est-il bien dedans. Sans elles, le paramètre
  // `fileId` permettrait de jeter n'importe quel fichier visible du compte de
  // service — y compris hors du dossier de l'asso.
  const target = folderId?.trim() || rootId;
  await resolvePathFromRoot(target, rootId, tenantId);
  if (!(await isChildOfFolder(fileId, target, tenantId))) {
    throw new DriveConfigError('Ce fichier n’est pas dans le dossier affiché.');
  }

  const token = await getAccessToken(SCOPE_WRITE, tenantId);
  const res = await fetch(
    `${FILES_URL}/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trashed: true }),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Drive a répondu ${res.status}. ${detail.slice(0, 300)}`);
  }
}
