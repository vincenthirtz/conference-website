// features/admin/tournaments/rulesUpload.ts — préparation d'un dépôt de
// règlement (PDF) avant l'envoi : contrôles côté navigateur et lecture du
// fichier. Pur hors `FileReader` ; aucun appel réseau.
//
// Le serveur refait TOUS ces contrôles (signature `%PDF-`, 15 Mo) : ceux-ci
// n'existent que pour dire tout de suite « ce n'est pas un PDF » plutôt
// qu'après l'envoi de 15 Mo.

/** Taille maximale d'une version du règlement (contrat : ≤ 15 Mo). */
export const RULES_MAX_BYTES = 15 * 1024 * 1024;

/** Longueur maximale de la note « ce qui change ». */
export const RULES_NOTE_MAX = 500;

export type RulesFileProblem = 'not_pdf_type' | 'too_large' | 'bad_signature';

/** Les 5 premiers octets d'un PDF : `%PDF-`. */
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

async function headBytes(file: Blob, n: number): Promise<Uint8Array> {
  const slice = file.slice(0, n);
  if (typeof slice.arrayBuffer === 'function') {
    return new Uint8Array(await slice.arrayBuffer());
  }
  return new Uint8Array(
    await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error ?? new Error('read failed'));
      reader.readAsArrayBuffer(slice);
    })
  );
}

/** Le fichier choisi peut-il partir ? `null` si oui, sinon le problème. */
export async function checkRulesFile(
  file: File
): Promise<RulesFileProblem | null> {
  const looksPdf =
    file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '');
  if (!looksPdf) return 'not_pdf_type';
  if (file.size > RULES_MAX_BYTES) return 'too_large';
  const head = await headBytes(file, PDF_SIGNATURE.length);
  const ok = PDF_SIGNATURE.every((b, i) => head[i] === b);
  return ok ? null : 'bad_signature';
}

/** Le fichier en data URL (`data:application/pdf;base64,…`). */
export function readAsPdfDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? '');
      // Certains navigateurs donnent `application/octet-stream` à un PDF
      // déposé sans type : on annonce le bon, le serveur vérifie la signature.
      resolve(raw.replace(/^data:[^;,]*/, 'data:application/pdf'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

/** « 1,2 Mo », « 340 Ko » — taille lisible d'un fichier. */
export function formatFileSize(
  bytes: number | null | undefined,
  locale: string
): string {
  if (bytes == null || !Number.isFinite(bytes)) return '';
  const fr = locale.startsWith('fr');
  if (bytes >= 1024 * 1024) {
    const mb = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 1,
    }).format(bytes / (1024 * 1024));
    return `${mb} ${fr ? 'Mo' : 'MB'}`;
  }
  const kb = Math.max(1, Math.round(bytes / 1024));
  return `${kb} ${fr ? 'Ko' : 'KB'}`;
}
