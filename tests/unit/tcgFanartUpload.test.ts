// tests/unit/tcgFanartUpload.test.ts
//
// Envoi d'une carte FAN ART : le plafond RÉEL et le message du refus.
// Cibles : pages/api/player/tcg/fanart.ts (`config`),
//          utils/tcg/fanartUploadErrors.ts, lib/i18n/locales/*/tcgFanart.ts.
//
// CE QUE CES CAS PROTÈGENT.
//
//   1. LE PLAFOND ANNONCÉ EST LE PLAFOND RÉEL. La route n'avait pas de
//      `config` : elle restait au 1 Mo de corps par défaut de Next, soit
//      ~768 Kio d'image une fois base64 + JSON, contre « 2 Mo » annoncés.
//   2. UN REFUS DÉFINITIF NE DIT JAMAIS « RÉESSAIE ». Le 413 de Next n'a pas de
//      `code` ; le panneau le traduisait par « Envoi impossible pour le moment.
//      Réessaie. » — l'artiste réessayait un envoi qui ne pouvait pas passer.
//   3. LES MIROIRS CLIENT NE DÉRIVENT PAS. Le panneau ne peut pas importer
//      `imageBytes.ts` (Buffer) : il redéclare taille et types, et ce test les
//      tient égaux.

import { describe, expect, it } from 'vitest';

import { config } from '../../pages/api/player/tcg/fanart';
import { config as photoConfig } from '../../pages/api/player/tcg/photo';
import {
  IMAGE_EXT_BY_MIME,
  IMAGE_MAX_BYTES,
} from '../../utils/uploads/imageBytes';
import {
  FANART_ACCEPTED_TYPES,
  FANART_MAX_BYTES,
  FANART_MAX_MIB,
  checkFanartFile,
  fanartErrorKey,
  type FanartErrorKey,
} from '../../utils/tcg/fanartUploadErrors';
import frFanart from '../../lib/i18n/locales/fr/tcgFanart';
import enFanart from '../../lib/i18n/locales/en/tcgFanart';

/** `'4mb'` → octets, comme le fait le bodyParser de Next (base 1024). */
function parseSizeLimit(limit: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*(kb|mb)$/i.exec(limit);
  if (!m) throw new Error(`limite illisible: ${limit}`);
  const unit = m[2].toLowerCase() === 'mb' ? 1024 * 1024 : 1024;
  return Number(m[1]) * unit;
}

describe('POST /api/player/tcg/fanart — plafond du corps', () => {
  it('déclare un bodyParser de 4 Mo, comme la photo de carte', () => {
    expect(config?.api?.bodyParser?.sizeLimit).toBe('4mb');
    expect(config.api.bodyParser.sizeLimit).toBe(
      photoConfig.api.bodyParser.sizeLimit
    );
  });

  it('une image au plafond, en data-URL base64 dans son JSON, tient dans le corps', () => {
    // base64 = 4 octets pour 3 ; + préfixe data-URL + les autres champs
    // (titre, crédit, lien : quelques centaines d'octets au plus).
    const base64 = Math.ceil(IMAGE_MAX_BYTES / 3) * 4;
    const overhead = 'data:image/webp;base64,'.length + 2_000;
    expect(parseSizeLimit(config.api.bodyParser.sizeLimit)).toBeGreaterThan(
      base64 + overhead
    );
  });
});

describe('miroirs client des règles d’image', () => {
  it('taille et types acceptés égaux à ceux du serveur', () => {
    expect(FANART_MAX_BYTES).toBe(IMAGE_MAX_BYTES);
    expect(FANART_MAX_BYTES).toBe(FANART_MAX_MIB * 1024 * 1024);
    expect([...FANART_ACCEPTED_TYPES].sort()).toEqual(
      Object.keys(IMAGE_EXT_BY_MIME).sort()
    );
  });
});

describe('checkFanartFile — contrôle avant envoi', () => {
  it('refuse l’absence de fichier, un type non supporté, un fichier trop lourd', () => {
    expect(checkFanartFile(undefined)).toBe('errorMissingImage');
    expect(checkFanartFile({ type: 'image/gif', size: 10 })).toBe(
      'errorUnsupportedType'
    );
    expect(checkFanartFile({ type: 'image/svg+xml', size: 10 })).toBe(
      'errorUnsupportedType'
    );
    // Type vide : ce que rendent certains navigateurs pour un format inconnu.
    expect(checkFanartFile({ type: '', size: 10 })).toBe(
      'errorUnsupportedType'
    );
    expect(
      checkFanartFile({ type: 'image/png', size: FANART_MAX_BYTES + 1 })
    ).toBe('errorTooLarge');
  });

  it('laisse partir une image au plafond exact', () => {
    expect(
      checkFanartFile({ type: 'image/webp', size: FANART_MAX_BYTES })
    ).toBeNull();
  });
});

describe('fanartErrorKey — un refus définitif ne dit jamais « réessaie »', () => {
  it('un 413 (Next, corps SANS code) est « trop lourd »', () => {
    expect(fanartErrorKey(413, undefined)).toBe('errorTooLarge');
    // Même si un intermédiaire ajoutait un code qu'on ne connaît pas.
    expect(fanartErrorKey(413, 'whatever')).toBe('errorTooLarge');
  });

  it('chaque code du handler a son message, aucun ne retombe sur le générique', () => {
    const definitive: Array<[string, FanartErrorKey]> = [
      ['too_large', 'errorTooLarge'],
      ['unsupported_type', 'errorUnsupportedType'],
      ['content_mismatch', 'errorContentMismatch'],
      ['invalid_base64', 'errorContentMismatch'],
      ['missing_data', 'errorMissingImage'],
      ['title', 'errorTitle'],
      ['artist_name', 'errorArtistName'],
      ['artist_url', 'errorArtistUrl'],
      ['licence', 'errorLicence'],
      ['too_many_pending', 'errorTooManyPending'],
    ];
    for (const [code, key] of definitive) {
      const status = code === 'too_many_pending' ? 409 : 400;
      expect(fanartErrorKey(status, code)).toBe(key);
    }
  });

  it('seul un incident passager invite à réessayer', () => {
    expect(fanartErrorKey(500, undefined)).toBe('errorGeneric');
    expect(fanartErrorKey(503, undefined)).toBe('errorGeneric');
    expect(fanartErrorKey(429, undefined)).toBe('errorGeneric');
  });

  it('les textes « trop lourd » ne contiennent pas d’invitation à réessayer, et disent le plafond', () => {
    for (const dict of [frFanart.fr, enFanart]) {
      const d = dict as Record<string, string>;
      expect(d.errorTooLarge).not.toMatch(/réessaie|try again/i);
      expect(d.errorTooLarge).toContain('{max}');
      expect(d.errorUnsupportedType).not.toMatch(/réessaie|try again/i);
      expect(d.errorContentMismatch).not.toMatch(/réessaie|try again/i);
      // Mio, pas Mo : le plafond est en base 1024.
      expect(d.hintImage).toMatch(/Mio|MiB/);
    }
  });
});
