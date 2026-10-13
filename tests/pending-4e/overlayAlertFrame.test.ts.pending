// L'HABILLAGE DE LA BOÎTE D'ALERTES DOIT ÊTRE DÉCODABLE PAR OBS.
//
// Le 2026-09-23, la boîte d'alertes n'affichait que le texte en direct : pas de
// nœud, pas d'habillage. Le fichier était pourtant servi correctement (200,
// `video/webm`), la CSP l'autorisait, et il se lisait parfaitement dans Chrome
// de bureau. Branché en CDP sur la source OBS, le verdict était net :
//
//     PIPELINE_ERROR_DECODE
//
// La cause : `noeud.webm` était en VP9 profil 1 (`gbrp`, 4:4:4) AVEC canal
// alpha. WebM porte l'alpha en BlockAdditions, comme un second flux vidéo confié
// à un second décodeur — et celui-là, dans le CEF d'OBS, veut du profil 0.
// Le profil 1 SANS alpha, lui, se lit très bien : c'est la combinaison qui
// casse, et la première version de ce test l'avait conclu trop vite. La matrice
// mesurée est dans `utils/uploads/webmCodec.ts`.
//
// AUCUN TEST EN NAVIGATEUR N'AURAIT ATTRAPÉ ÇA — Chrome de bureau décode le
// fichier sans broncher. Ce test lit donc le CONTENEUR, sur le fichier
// réellement livré, et fige ce dont dépend le direct.
//
// Il partage son inspecteur avec le contrôle à l'envoi (`webmCodec.ts`) : les
// deux portes — le fichier du dépôt et celui qu'une régie dépose — appliquent
// ainsi exactement la même lecture.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { inspectWebm, webmRejectionCode } from '../../utils/uploads/webmCodec';

const FRAME_PATH = path.join(
  process.cwd(),
  'public',
  'overlay',
  'alerts',
  'noeud.webm'
);

describe("habillage de la boîte d'alertes", () => {
  const buf = fs.readFileSync(FRAME_PATH);
  const info = inspectWebm(buf);

  it('est un WebM en VP9', () => {
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    expect(info.codecId).toBe('V_VP9');
  });

  it('porte un canal alpha — sans lui, un rectangle opaque en plein direct', () => {
    expect(info.hasAlpha).toBe(true);
  });

  it("est en profil 0, le seul décodable par OBS avec de l'alpha", () => {
    expect(info.vp9Profile).toBe(0);
    expect(webmRejectionCode(buf)).toBeNull();
  });

  it('a des dimensions paires et le rapport 500∕281 des bornes mesurées', () => {
    const { width, height } = info;
    expect(width).not.toBeNull();
    expect(height).not.toBeNull();
    expect((width as number) % 2, 'le 4:2:0 exige une largeur paire').toBe(0);
    expect((height as number) % 2, 'le 4:2:0 exige une hauteur paire').toBe(0);
    // `BAND` et `CARD_RATIO` sont des fractions de CE rapport-là : le changer
    // sans les remesurer décale le texte hors de la bande verte.
    expect((width as number) / (height as number)).toBeCloseTo(500 / 281, 3);
  });
});
