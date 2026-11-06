// Liseuse du règlement : niveaux de zoom, plafond de pixels d'un rendu, nom du
// fichier téléchargé. Pur (features/player/tournamentRules/zoom.ts,
// download.ts) ; le comportement à l'écran est dans
// tournamentRulesReader.test.tsx.

import { describe, expect, it } from 'vitest';
import {
  cappedPixelWidth,
  MAX_CANVAS_PIXELS,
  ZOOM_MAX,
  ZOOM_MIN,
  zoomIn,
  zoomOut,
  zoomPercent,
} from '@/features/player/tournamentRules/zoom';
import { rulesDownloadName } from '@/features/player/tournamentRules/download';

describe('zoom de la liseuse', () => {
  it('de 100 % (largeur ajustée) à 300 %, par pas, borné aux deux bouts', () => {
    expect(ZOOM_MIN).toBe(1);
    expect(ZOOM_MAX).toBe(3);
    const up: number[] = [];
    let z = ZOOM_MIN;
    while (z < ZOOM_MAX) {
      z = zoomIn(z);
      up.push(zoomPercent(z));
    }
    expect(up).toEqual([125, 150, 175, 200, 250, 300]);
    expect(zoomIn(ZOOM_MAX)).toBe(ZOOM_MAX);
    expect(zoomOut(ZOOM_MIN)).toBe(ZOOM_MIN);
    expect(zoomOut(2)).toBe(1.75);
    expect(zoomOut(1.25)).toBe(1);
  });

  it('un rendu ne dépasse jamais le plafond de pixels d’un canevas', () => {
    // A4 à 300 % sur un téléphone 3x : ~2 800 px de large demandés.
    const width = cappedPixelWidth(595, 842, 2808);
    expect(width).toBeLessThan(2808);
    expect(width * width * (842 / 595)).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
    // Sous le plafond, la largeur demandée est rendue telle quelle.
    expect(cappedPixelWidth(595, 842, 936)).toBe(936);
    // Une page très haute est plafonnée plus tôt.
    expect(cappedPixelWidth(595, 842 * 4, 2000)).toBeLessThan(1200);
    expect(cappedPixelWidth(0, 0, 500)).toBe(500);
  });
});

describe('nom du fichier téléchargé', () => {
  it('celui de la version, sinon reglement-v<n>.pdf ; toujours .pdf, sans chemin', () => {
    expect(rulesDownloadName('reglement-owwc-2027-v2.pdf', 2)).toBe(
      'reglement-owwc-2027-v2.pdf'
    );
    expect(rulesDownloadName('Règlement OWWC', 3)).toBe('Règlement OWWC.pdf');
    expect(rulesDownloadName(null, 4)).toBe('reglement-v4.pdf');
    expect(rulesDownloadName('   ', null)).toBe('reglement.pdf');
    expect(rulesDownloadName('../../etc/passwd', 1)).toBe('etc-passwd.pdf');
    expect(rulesDownloadName('a\u0000b\\c.PDF', 1)).toBe('a-b-c.PDF');
  });
});
