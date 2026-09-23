// Le contrôle d'encodage des WebM déposés comme habillage.
//
// LES ÉCHANTILLONS SONT DE VRAIS FICHIERS, pas des tampons fabriqués : la règle
// qu'ils vérifient vient d'une panne en direct, et un octet mal deviné dans une
// fausse structure EBML rendrait ce test rassurant et faux. `vp9p1-alpha.webm`
// est l'habillage qui a réellement échoué dans OBS le 2026-09-23, recopié flux
// pour flux sur 0,4 s pour tenir en 5 ko.
//
// LES QUATRE CAS SONT LA MATRICE MESURÉE dans OBS 32.2.2 / Chromium 127, et ils
// comptent autant pour ce qu'ils ACCEPTENT que pour ce qu'ils refusent : la
// première version de ce correctif rejetait tout le profil 1, alors que sans
// alpha il se décode très bien. Une validation qui refuse à tort se fait
// désactiver, et on perd la protection entière.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { inspectWebm, webmRejectionCode } from '../../utils/uploads/webmCodec';
import { decodeMediaPayload } from '../../utils/uploads/mediaBytes';

const fixture = (name: string): Buffer =>
  fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'webm', name));

describe('inspectWebm', () => {
  it('lit codec, alpha, profil et dimensions', () => {
    expect(inspectWebm(fixture('vp9p0-alpha.webm'))).toEqual({
      codecId: 'V_VP9',
      hasAlpha: true,
      vp9Profile: 0,
      width: 1000,
      height: 562,
    });
  });

  it('distingue le profil 1 du profil 0', () => {
    expect(inspectWebm(fixture('vp9p1-alpha.webm')).vp9Profile).toBe(1);
  });

  it("voit l'absence d'alpha sur un fichier de même profil", () => {
    expect(inspectWebm(fixture('vp9p1-sans-alpha.webm')).hasAlpha).toBe(false);
  });

  it('ne lit pas de profil VP9 sur un fichier VP8', () => {
    const info = inspectWebm(fixture('vp8-alpha.webm'));
    expect(info.codecId).toBe('V_VP8');
    expect(info.vp9Profile).toBeNull();
  });

  it('ne lève pas sur un fichier tronqué ou absurde', () => {
    expect(() => inspectWebm(Buffer.alloc(0))).not.toThrow();
    expect(() =>
      inspectWebm(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    ).not.toThrow();
    expect(() =>
      inspectWebm(fixture('vp9p1-alpha.webm').subarray(0, 40))
    ).not.toThrow();
    expect(() => inspectWebm(Buffer.alloc(2048, 0xff))).not.toThrow();
  });
});

describe('webmRejectionCode', () => {
  it('refuse le VP9 profil 1 AVEC alpha — la combinaison qui a cassé le direct', () => {
    expect(webmRejectionCode(fixture('vp9p1-alpha.webm'))).toBe(
      'alpha_needs_vp9_profile0'
    );
  });

  it('accepte le VP9 profil 0 avec alpha', () => {
    expect(webmRejectionCode(fixture('vp9p0-alpha.webm'))).toBeNull();
  });

  it('accepte le VP9 profil 1 SANS alpha — il se décode très bien', () => {
    expect(webmRejectionCode(fixture('vp9p1-sans-alpha.webm'))).toBeNull();
  });

  it('accepte le VP8 avec alpha', () => {
    expect(webmRejectionCode(fixture('vp8-alpha.webm'))).toBeNull();
  });

  it("laisse passer ce qu'il ne sait pas lire, plutôt que de refuser à tort", () => {
    expect(webmRejectionCode(Buffer.alloc(0))).toBeNull();
    expect(webmRejectionCode(Buffer.alloc(512, 0x00))).toBeNull();
  });
});

describe('decodeMediaPayload — la porte que franchit une régie', () => {
  const asPayload = (buf: Buffer) =>
    `data:video/webm;base64,${buf.toString('base64')}`;

  it("refuse l'habillage indécodable avec le code attendu par l'interface", () => {
    const res = decodeMediaPayload(
      asPayload(fixture('vp9p1-alpha.webm')),
      'video/webm'
    );
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.code).toBe('alpha_needs_vp9_profile0');
  });

  it('laisse passer un habillage sain', () => {
    const res = decodeMediaPayload(
      asPayload(fixture('vp9p0-alpha.webm')),
      'video/webm'
    );
    expect(res.ok).toBe(true);
    expect(res.ok === true && res.kind).toBe('video');
    expect(res.ok === true && res.ext).toBe('.webm');
  });
});
