// L'HABILLAGE DE LA BOÎTE D'ALERTES DOIT ÊTRE DÉCODABLE PAR OBS.
//
// Le 2026-09-23, la boîte d'alertes n'affichait que le texte en direct : pas de
// nœud, pas d'habillage. Le fichier était pourtant servi correctement (200,
// `video/webm`), la CSP l'autorisait, et il se lisait parfaitement dans Chrome
// de bureau. Branché en CDP sur la source OBS, le verdict était net :
//
//     PIPELINE_ERROR_DECODE
//
// La cause : `noeud.webm` était encodé en **VP9 profil 1** (`gbrp`, 4:4:4).
// Le CEF embarqué dans OBS ne décode que les profils 0 et 2 — le profil 1 lui
// est inconnu, et il échoue à la première image. Chrome de bureau, lui, l'avale
// sans broncher : AUCUN test en navigateur n'aurait attrapé ça.
//
// Deux correctifs successifs sont passés à côté avant ce diagnostic, parce que
// l'en-tête du composant affirmait que « le navigateur embarqué d'OBS décode le
// VP9 ». C'est vrai du codec, faux du profil. Ce test fige la différence.
//
// CE QU'IL VÉRIFIE, et pourquoi chaque point a compté :
//   * profil 0 — la seule chose qui cassait réellement ;
//   * canal alpha présent — un ré-encodage qui perd la transparence afficherait
//     un rectangle opaque en plein direct, panne pire que celle qu'on répare ;
//   * dimensions paires — le 4:2:0 les exige, et l'original en 500×281 avait une
//     hauteur impaire ;
//   * rapport d'image 500∕281 — les bornes de la bande verte
//     (`BAND`, `CARD_RATIO`) sont des FRACTIONS mesurées sur ce rapport-là.
//     Le changer sans les remesurer décale le texte hors de la bande.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const FRAME_PATH = path.join(
  process.cwd(),
  'public',
  'overlay',
  'alerts',
  'noeud.webm'
);

/** Lit un entier EBML à longueur variable. Rend la valeur et sa longueur. */
function readVint(
  buf: Buffer,
  at: number,
  keepMarker = false
): { value: number; length: number } {
  const first = buf[at];
  for (let n = 1; n <= 8; n++) {
    if (first & (0x80 >> (n - 1))) {
      let value = keepMarker ? first : first & (0xff >> n);
      for (let k = 1; k < n; k++) value = value * 256 + buf[at + k];
      return { value, length: n };
    }
  }
  return { value: 0, length: 1 };
}

/** Lit un identifiant d'élément EBML (marqueur conservé). */
function readId(buf: Buffer, at: number) {
  return readVint(buf, at, true);
}

/** Éléments dans lesquels il faut DESCENDRE pour atteindre les feuilles. */
const CONTAINERS = new Set([
  0x18538067, // Segment
  0x1f43b675, // Cluster
  0xa0, // BlockGroup
  0x1654ae6b, // Tracks
  0xae, // TrackEntry
  0xe0, // Video
]);

/**
 * Le corps du premier élément portant l'un des identifiants demandés, trouvé en
 * descendant l'arbre EBML. Chercher l'octet à la main dans le fichier — ce que
 * faisait la première version de ce test — tombe sur n'importe quel octet de
 * même valeur au milieu d'une image compressée, et rend `NaN`.
 */
function findElement(buf: Buffer, ids: number[]): Buffer | null {
  const wanted = new Set(ids);
  const walk = (start: number, end: number): Buffer | null => {
    let at = start;
    while (at < end) {
      const id = readId(buf, at);
      const size = readVint(buf, at + id.length);
      const body = at + id.length + size.length;
      if (body + size.value > buf.length) return null;
      if (wanted.has(id.value)) return buf.subarray(body, body + size.value);
      if (CONTAINERS.has(id.value)) {
        const found = walk(body, body + size.value);
        if (found) return found;
      }
      at = body + size.value;
    }
    return null;
  };
  return walk(0, buf.length);
}

/**
 * La charge utile de la première image vidéo du fichier : ce qui suit le
 * numéro de piste, l'horodatage (2 octets) et les drapeaux (1 octet) d'un
 * SimpleBlock ou d'un Block.
 */
function firstFramePayload(buf: Buffer): Buffer | null {
  const block = findElement(buf, [0xa3, 0xa1]);
  if (!block) return null;
  const track = readVint(block, 0);
  return block.subarray(track.length + 3);
}

/**
 * Le profil VP9, lu dans l'en-tête non compressé : marqueur d'image (2 bits),
 * puis le bit bas et le bit haut du profil. C'est la première chose que le
 * décodeur regarde, et celle sur laquelle celui d'OBS renonce.
 */
function vp9Profile(frame: Buffer): { marker: number; profile: number } {
  const b = frame[0];
  return {
    marker: (b >> 6) & 0b11,
    profile: (((b >> 4) & 1) << 1) | ((b >> 5) & 1),
  };
}

/** Les dimensions déclarées dans la piste vidéo (PixelWidth / PixelHeight). */
function pixelSize(buf: Buffer): { width: number; height: number } {
  const uint = (el: Buffer | null): number => {
    if (!el) return Number.NaN;
    let value = 0;
    for (const byte of el) value = value * 256 + byte;
    return value;
  };
  return {
    width: uint(findElement(buf, [0xb0])),
    height: uint(findElement(buf, [0xba])),
  };
}

describe("habillage de la boîte d'alertes", () => {
  const buf = fs.readFileSync(FRAME_PATH);

  it('est un WebM', () => {
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    expect(buf.indexOf(Buffer.from('webm'))).toBeGreaterThan(-1);
  });

  it("est en VP9 profil 0 — le profil 1 est indécodable par le CEF d'OBS", () => {
    const frame = firstFramePayload(buf);
    expect(frame, 'aucune image trouvée dans le fichier').not.toBeNull();
    const { marker, profile } = vp9Profile(frame as Buffer);
    expect(marker, "marqueur d'image VP9 attendu (0b10)").toBe(0b10);
    expect(profile).toBe(0);
  });

  it('porte un canal alpha', () => {
    // AlphaMode (0x53C0) dans la piste, et le flux alpha lui-même en
    // BlockAdditions (0x75A1) — une image par image.
    expect(buf.indexOf(Buffer.from([0x53, 0xc0]))).toBeGreaterThan(-1);
    const additions = buf.toString('binary').split('\x75\xa1').length - 1;
    expect(additions).toBeGreaterThan(500);
  });

  it('a des dimensions paires et le rapport 500∕281 des bornes mesurées', () => {
    const { width, height } = pixelSize(buf);
    expect(width % 2, 'le 4:2:0 exige une largeur paire').toBe(0);
    expect(height % 2, 'le 4:2:0 exige une hauteur paire').toBe(0);
    // BAND et CARD_RATIO sont des fractions de CE rapport-là.
    expect(width / height).toBeCloseTo(500 / 281, 3);
  });
});
