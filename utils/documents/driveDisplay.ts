// utils/documents/driveDisplay.ts
//
// Mise en forme des lignes du Drive : famille de type, et taille lisible.
// Fonctions PURES — elles ne connaissent ni React, ni le dictionnaire : elles
// rendent une CLE de type, que la page traduit. Un libellé calculé ici serait
// un libellé qui échappe au garde-fou de parité FR/EN.

/** Familles affichées. `other` est le repli, jamais une erreur. */
export type DriveTypeKey =
  | 'folder'
  | 'pdf'
  | 'doc'
  | 'sheet'
  | 'slides'
  | 'image'
  | 'other';

const MIME_PREFIXES: [string, DriveTypeKey][] = [
  ['application/vnd.google-apps.folder', 'folder'],
  ['application/pdf', 'pdf'],
  ['application/vnd.google-apps.document', 'doc'],
  ['application/vnd.google-apps.spreadsheet', 'sheet'],
  ['application/vnd.google-apps.presentation', 'slides'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml', 'doc'],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml', 'sheet'],
  ['application/vnd.openxmlformats-officedocument.presentationml', 'slides'],
  ['application/msword', 'doc'],
  ['application/vnd.ms-excel', 'sheet'],
  ['application/vnd.ms-powerpoint', 'slides'],
  ['image/', 'image'],
];

export function driveTypeKey(
  mimeType: string | null | undefined
): DriveTypeKey {
  if (!mimeType) return 'other';
  for (const [prefix, key] of MIME_PREFIXES) {
    if (mimeType.startsWith(prefix)) return key;
  }
  return 'other';
}

/**
 * Taille lisible, ou `null` quand Google n'en donne pas — c'est le cas des
 * dossiers ET des fichiers natifs Google (Docs, Sheets). Renvoyer « 0 o »
 * ferait croire à un fichier vide, ce qui est faux et inquiétant.
 */
export function formatDriveSize(
  bytes: number | null | undefined
): string | null {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return null;
  if (bytes < 1024) return `${bytes} o`;
  const units = ['Ko', 'Mo', 'Go', 'To'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // Une décimale sous 10, aucune au-dessus : « 1,4 Mo » informe, « 847,3 Ko »
  // fait du bruit.
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
