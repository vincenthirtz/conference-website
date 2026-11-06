// features/player/tournamentRules/download.ts — « Télécharger le PDF » depuis
// le fichier DÉJÀ CHARGÉ par la liseuse.
//
// POURQUOI PAS UN LIEN. Un `<a href="/api/tournaments/…/rules/file">` part
// sans la session de la joueuse (une navigation ne porte pas de Bearer) : pour
// un tournoi non public, l'API répondrait 404. Les octets sont déjà là — ceux
// de la version affichée — : on les enregistre tels quels, sans requête.

/** Délai avant de révoquer l'URL : le navigateur a pris le fichier. */
export const DOWNLOAD_REVOKE_DELAY_MS = 10_000;

/**
 * Nom du fichier : celui de la version déposée, sinon `reglement-v<n>.pdf`.
 * Ni chemin ni caractère de contrôle ; toujours `.pdf`.
 */
export function rulesDownloadName(
  fileName: string | null | undefined,
  versionNumber: number | null
): string {
  const cleaned = (fileName ?? '')
    .replace(/[\u0000-\u001f\u007f/\\]+/g, '-')
    .replace(/^[.\s-]+/, '')
    .trim();
  const base =
    cleaned || (versionNumber ? `reglement-v${versionNumber}` : 'reglement');
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
}

/** Enregistre `file` sous `fileName` (URL objet, révoquée après usage). */
export function saveRulesFile(file: Blob, fileName: string): void {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.hidden = true;
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    // Révoquée immédiatement, l'URL peut manquer au téléchargement sur
    // certains navigateurs (Safari) : on la garde quelques secondes.
    setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_REVOKE_DELAY_MS);
  }
}
