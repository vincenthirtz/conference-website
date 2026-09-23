// utils/uploads/webmCodec.ts
//
// CE QU'IL Y A VRAIMENT DANS UN WEBM — codec, canal alpha, profil VP9,
// dimensions — lu dans le conteneur, sans décoder une seule image.
//
// POURQUOI CE MODULE EXISTE. Le 2026-09-23, l'habillage de la boîte d'alertes
// n'affichait que le texte en plein direct. Le fichier était servi
// correctement, la CSP l'autorisait, et il se lisait parfaitement dans Chrome
// de bureau. Branché en CDP sur la source navigateur d'OBS, le verdict était
// net : `PIPELINE_ERROR_DECODE`. Le fichier était en VP9 profil 1 (`gbrp`,
// 4:4:4) AVEC canal alpha.
//
// LA COMBINAISON, PAS LE PROFIL. Le premier correctif a conclu trop vite que le
// CEF d'OBS ignorait le profil 1. Mesuré ensuite dans OBS 32.2.2 / Chromium 127 :
//
//     VP9 profil 0 + alpha   ✔        VP9 profil 1 SANS alpha   ✔
//     VP8 + alpha            ✔        VP9 profil 1 AVEC alpha   ✘
//     AV1 sans alpha         ✔        (AV1 + alpha : non testé)
//
// Le profil 1 seul se lit très bien. Ce qui casse, c'est le flux alpha : WebM le
// porte en BlockAdditions, comme un SECOND flux vidéo, confié à un second
// décodeur — et celui-là veut du profil 0. D'où une règle étroite : on ne refuse
// que `alpha + VP9 de profil ≠ 0`. Refuser tout le profil 1 rejetterait des
// fichiers qui marchent, et une validation qui refuse à tort se fait désactiver.
//
// CE QU'ON NE PRÉTEND PAS SAVOIR. L'AV1 avec alpha n'a pas pu être testé
// (ffmpeg déclare `AlphaMode` mais n'écrit aucun flux alpha). Il n'est donc pas
// refusé : une règle non vérifiée dans ce fichier-ci a déjà coûté assez cher.
//
// POURQUOI À L'ENVOI. Une source OBS qui échoue à décoder ne prévient personne :
// l'alerte « passe » sans son habillage, et on ne le découvre qu'en direct, ou
// jamais. Un refus au dépôt coûte une minute à la préparation ; la panne coûte
// une soirée.

/** Ce que le conteneur déclare, sans décoder d'image. */
export type WebmInfo = {
  /** `V_VP9`, `V_VP8`, `V_AV1`… ou `null` si la piste est illisible. */
  codecId: string | null;
  /** Le fichier porte-t-il un flux alpha (AlphaMode + BlockAdditions) ? */
  hasAlpha: boolean;
  /** Profil VP9 (0 à 3), ou `null` hors VP9 / si l'en-tête est illisible. */
  vp9Profile: number | null;
  width: number | null;
  height: number | null;
};

/**
 * Lit un entier EBML à longueur variable.
 * `keepMarker` conserve le bit de longueur : c'est ce qui distingue un
 * identifiant d'élément (0xA3) d'une taille.
 */
function readVint(
  buf: Buffer,
  at: number,
  keepMarker = false
): { value: number; length: number } | null {
  if (at >= buf.length) return null;
  const first = buf[at];
  for (let n = 1; n <= 8; n++) {
    if (first & (0x80 >> (n - 1))) {
      if (at + n > buf.length) return null;
      let value = keepMarker ? first : first & (0xff >> n);
      for (let k = 1; k < n; k++) value = value * 256 + buf[at + k];
      return { value, length: n };
    }
  }
  return null;
}

/** Éléments dans lesquels il faut DESCENDRE pour atteindre les feuilles. */
const CONTAINERS = new Set([
  0x18538067, // Segment
  0x1654ae6b, // Tracks
  0xae, // TrackEntry
  0xe0, // Video
  0x1f43b675, // Cluster
  0xa0, // BlockGroup
]);

/**
 * Le corps du premier élément portant l'un des identifiants demandés.
 *
 * On DESCEND l'arbre au lieu de chercher l'octet dans le fichier : un
 * `indexOf(0xB0)` tombe sur n'importe quel octet de même valeur au milieu d'une
 * image compressée. La première version du garde-fou faisait exactement ça et
 * rendait `NaN`.
 */
function findElement(buf: Buffer, ids: readonly number[]): Buffer | null {
  const wanted = new Set(ids);
  const walk = (start: number, end: number, depth: number): Buffer | null => {
    if (depth > 8) return null;
    let at = start;
    while (at < end) {
      const id = readVint(buf, at, true);
      if (!id) return null;
      const size = readVint(buf, at + id.length);
      if (!size) return null;
      const body = at + id.length + size.length;
      const stop = body + size.value;
      if (stop > buf.length || stop <= body) return null;
      if (wanted.has(id.value)) return buf.subarray(body, stop);
      if (CONTAINERS.has(id.value)) {
        const found = walk(body, stop, depth + 1);
        if (found) return found;
      }
      at = stop;
    }
    return null;
  };
  return walk(0, buf.length, 0);
}

/** Un entier non signé big-endian de longueur variable, tel qu'EBML les stocke. */
function toUint(el: Buffer | null): number | null {
  if (!el || el.length === 0) return null;
  let value = 0;
  for (const byte of el) value = value * 256 + byte;
  return value;
}

/**
 * Le profil VP9, lu dans l'en-tête NON COMPRESSÉ de la première image :
 * marqueur d'image sur 2 bits (0b10), puis le bit BAS du profil, puis le bit
 * HAUT. C'est la toute première chose que regarde un décodeur, et celle sur
 * laquelle celui d'OBS renonce quand un flux alpha l'accompagne.
 */
function vp9ProfileOf(buf: Buffer): number | null {
  const block = findElement(buf, [0xa3, 0xa1]); // SimpleBlock ou Block
  if (!block) return null;
  const track = readVint(block, 0);
  // Numéro de piste (vint) + horodatage (2 octets) + drapeaux (1 octet).
  if (!track || block.length < track.length + 4) return null;
  const header = block[track.length + 3];
  if (((header >> 6) & 0b11) !== 0b10) return null; // marqueur d'image VP9
  return (((header >> 4) & 1) << 1) | ((header >> 5) & 1);
}

/** Inspecte un WebM. Ne lève jamais : un fichier illisible rend des `null`. */
export function inspectWebm(buffer: Buffer): WebmInfo {
  const codecEl = findElement(buffer, [0x86]); // CodecID
  const codecId = codecEl
    ? codecEl.toString('latin1').replace(/\0+$/, '')
    : null;

  // AlphaMode (0x53C0) annonce l'alpha ; les BlockAdditions (0x75A1) le
  // portent. Les deux sont exigés : ffmpeg sait écrire l'un sans l'autre, et un
  // AlphaMode sans flux ne change rien au décodage.
  const alphaMode = toUint(findElement(buffer, [0x53c0]));
  const hasAlpha =
    alphaMode === 1 && buffer.indexOf(Buffer.from([0x75, 0xa1])) !== -1;

  return {
    codecId,
    hasAlpha,
    vp9Profile: codecId === 'V_VP9' ? vp9ProfileOf(buffer) : null,
    width: toUint(findElement(buffer, [0xb0])), // PixelWidth
    height: toUint(findElement(buffer, [0xba])), // PixelHeight
  };
}

/**
 * Le code de refus d'un WebM qu'une source OBS ne saura pas afficher, ou `null`
 * s'il passe.
 *
 * Volontairement ÉTROIT : on ne refuse que ce qui a été vu échouer. Un profil
 * inconnu (en-tête illisible) passe — mieux vaut un habillage qui casse
 * visiblement qu'un dépôt refusé sans raison la veille d'un direct.
 */
export function webmRejectionCode(buffer: Buffer): string | null {
  const info = inspectWebm(buffer);
  if (info.hasAlpha && info.codecId === 'V_VP9' && info.vp9Profile !== null) {
    if (info.vp9Profile !== 0) return 'alpha_needs_vp9_profile0';
  }
  return null;
}
