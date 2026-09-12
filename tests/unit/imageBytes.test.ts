// Validation d'une image reçue en base64.
// Target: utils/uploads/imageBytes.ts
//
// CE QUE CES TESTS PROTÈGENT. Le bucket visé est PUBLIC. Le `mimeType` d'une
// requête est une affirmation du client, pas un fait : sans vérification du
// contenu réel, n'importe quel fichier peut y être déposé en se déclarant
// `image/png`. Chaque cas ci-dessous correspond à une façon de mentir sur ce
// qu'on envoie.

import { describe, expect, it } from 'vitest';

import {
  IMAGE_MAX_BYTES,
  decodeImagePayload,
  hasImageMagicBytes,
} from '../../utils/uploads/imageBytes';

/** PNG minimal : signature de 8 octets, suffisante pour la validation. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

/** Conteneur RIFF correctement étiqueté WEBP. */
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
]);

/** Même conteneur RIFF, mais c'est un WAV : le piège que le second contrôle attrape. */
const WAV = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('WAVE', 'ascii'),
]);

const b64 = (buf: Buffer) => buf.toString('base64');

describe('hasImageMagicBytes', () => {
  it('reconnaît les trois formats acceptés', () => {
    expect(hasImageMagicBytes(PNG, 'image/png')).toBe(true);
    expect(hasImageMagicBytes(JPEG, 'image/jpeg')).toBe(true);
    expect(hasImageMagicBytes(WEBP, 'image/webp')).toBe(true);
  });

  it('refuse un contenu qui ne correspond pas au type déclaré', () => {
    expect(hasImageMagicBytes(PNG, 'image/jpeg')).toBe(false);
    expect(hasImageMagicBytes(JPEG, 'image/png')).toBe(false);
  });

  it('refuse un WAV déguisé en WebP', () => {
    // RIFF sert aussi au WAV et à l'AVI : sans le contrôle des octets 8-11, un
    // fichier audio entrerait dans le bucket comme une image.
    expect(hasImageMagicBytes(WAV, 'image/webp')).toBe(false);
  });

  it('refuse un RIFF tronqué avant les octets de format', () => {
    expect(hasImageMagicBytes(Buffer.from('RIFF', 'ascii'), 'image/webp')).toBe(
      false
    );
  });

  it('refuse un type inconnu', () => {
    expect(hasImageMagicBytes(PNG, 'image/gif')).toBe(false);
    expect(hasImageMagicBytes(PNG, 'application/pdf')).toBe(false);
  });
});

describe('decodeImagePayload', () => {
  it('accepte une image valide et rend son extension', () => {
    const out = decodeImagePayload(b64(PNG), 'image/png');
    expect(out).toMatchObject({ ok: true, ext: '.png' });
  });

  it('accepte le préfixe `data:` des champs de formulaire', () => {
    const out = decodeImagePayload(
      `data:image/jpeg;base64,${b64(JPEG)}`,
      'image/jpeg'
    );
    expect(out).toMatchObject({ ok: true, ext: '.jpg' });
  });

  it('exige des chaînes en entrée', () => {
    expect(decodeImagePayload(undefined, 'image/png')).toEqual({
      ok: false,
      code: 'missing_data',
    });
    expect(decodeImagePayload(b64(PNG), undefined)).toEqual({
      ok: false,
      code: 'missing_data',
    });
  });

  it('refuse un type non pris en charge', () => {
    // Pas de SVG : c'est un document scriptable, pas une photo.
    expect(decodeImagePayload(b64(PNG), 'image/svg+xml')).toEqual({
      ok: false,
      code: 'unsupported_type',
    });
    expect(decodeImagePayload(b64(PNG), 'image/gif')).toEqual({
      ok: false,
      code: 'unsupported_type',
    });
  });

  it('refuse un base64 vide ou illisible', () => {
    // `Buffer.from(..., 'base64')` NE LÈVE PAS sur une entrée invalide : il
    // rend un tampon vide ou tronqué. C'est la longueur qui trahit.
    expect(decodeImagePayload('', 'image/png')).toEqual({
      ok: false,
      code: 'invalid_base64',
    });
    expect(decodeImagePayload('!!!!', 'image/png')).toEqual({
      ok: false,
      code: 'invalid_base64',
    });
  });

  it('refuse au-delà du plafond', () => {
    const big = Buffer.alloc(IMAGE_MAX_BYTES + 1);
    PNG.copy(big);
    expect(decodeImagePayload(b64(big), 'image/png')).toEqual({
      ok: false,
      code: 'too_large',
    });
  });

  it('refuse un contenu qui ment sur son type', () => {
    // Le cas qui motive tout le module : un fichier quelconque annoncé PNG.
    expect(decodeImagePayload(b64(JPEG), 'image/png')).toEqual({
      ok: false,
      code: 'content_mismatch',
    });
    expect(decodeImagePayload(b64(WAV), 'image/webp')).toEqual({
      ok: false,
      code: 'content_mismatch',
    });
  });
});
