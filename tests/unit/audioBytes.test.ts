// Validation d'un son d'alerte avant dépôt dans un bucket PUBLIC.
//
// CE QUI MÉRITE UN TEST ICI : le `mimeType` est une affirmation du client. Sans
// vérification du contenu réel, n'importe quel fichier — script, archive,
// exécutable — atterrit dans un bucket public en se déclarant `audio/mpeg`.
// Les cas « contenu qui ment » sont donc les plus importants du fichier.
//
// Et deux pièges de format, qui ne se devinent pas :
//   - un MP3 a DEUX débuts légitimes (tagué « ID3 », ou trame brute `FF Ex`) —
//     n'en tester qu'un refuserait des fichiers parfaitement valides ;
//   - un WAV et un WebP commencent TOUS DEUX par « RIFF ».

import { describe, it, expect } from 'vitest';
import {
  AUDIO_MAX_BYTES,
  decodeAudioPayload,
  hasAudioMagicBytes,
} from '@/utils/uploads/audioBytes';

/** Un fichier minimal mais crédible, du type demandé. */
function sample(kind: 'mp3-id3' | 'mp3-frame' | 'ogg' | 'wav' | 'webp'): Buffer {
  const pad = Buffer.alloc(32);
  switch (kind) {
    case 'mp3-id3':
      return Buffer.concat([Buffer.from('ID3'), pad]);
    case 'mp3-frame':
      return Buffer.concat([Buffer.from([0xff, 0xfb]), pad]);
    case 'ogg':
      return Buffer.concat([Buffer.from('OggS'), pad]);
    case 'wav':
      return Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.alloc(4),
        Buffer.from('WAVE'),
        pad,
      ]);
    case 'webp':
      return Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.alloc(4),
        Buffer.from('WEBP'),
        pad,
      ]);
  }
}

const b64 = (buf: Buffer) => buf.toString('base64');

describe('hasAudioMagicBytes', () => {
  it('accepte les DEUX débuts légitimes d’un MP3', () => {
    // Un fichier exporté par un éditeur audio est souvent tagué ; un flux brut
    // ne l'est pas. Refuser l'un des deux refuserait des sons valides.
    expect(hasAudioMagicBytes(sample('mp3-id3'), 'audio/mpeg')).toBe(true);
    expect(hasAudioMagicBytes(sample('mp3-frame'), 'audio/mpeg')).toBe(true);
  });

  it('distingue un WAV d’un WebP, qui commencent tous deux par RIFF', () => {
    // C'est le second contrôle (octets 8-11) qui fait la différence : sans lui,
    // une image passerait pour un son.
    expect(hasAudioMagicBytes(sample('wav'), 'audio/wav')).toBe(true);
    expect(hasAudioMagicBytes(sample('webp'), 'audio/wav')).toBe(false);
  });

  it('reconnaît un OGG', () => {
    expect(hasAudioMagicBytes(sample('ogg'), 'audio/ogg')).toBe(true);
  });

  it('refuse un type inconnu, quel que soit le contenu', () => {
    expect(hasAudioMagicBytes(sample('mp3-id3'), 'audio/flac')).toBe(false);
  });

  it('ne déborde pas sur un fichier tronqué', () => {
    expect(hasAudioMagicBytes(Buffer.from([0xff]), 'audio/mpeg')).toBe(false);
    expect(hasAudioMagicBytes(Buffer.from('RIFF'), 'audio/wav')).toBe(false);
  });
});

describe('decodeAudioPayload', () => {
  it('accepte un son valide et rend son extension', () => {
    const out = decodeAudioPayload(b64(sample('mp3-id3')), 'audio/mpeg');
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.ext).toBe('.mp3');
  });

  it('accepte le préfixe `data:` des champs de fichier', () => {
    const out = decodeAudioPayload(
      `data:audio/ogg;base64,${b64(sample('ogg'))}`,
      'audio/ogg'
    );
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.ext).toBe('.ogg');
  });

  it('REFUSE un contenu qui ment sur son type', () => {
    // Le cas qui compte : un fichier quelconque déclaré `audio/mpeg`.
    const out = decodeAudioPayload(
      b64(Buffer.from('#!/bin/sh\nrm -rf /')),
      'audio/mpeg'
    );
    expect(out).toEqual({ ok: false, code: 'content_mismatch' });
  });

  it('refuse un type non servi par un navigateur', () => {
    // Une alerte muette en plein direct, sans erreur visible, est pire qu'un
    // refus à l'envoi.
    expect(decodeAudioPayload(b64(sample('ogg')), 'audio/flac')).toEqual({
      ok: false,
      code: 'unsupported_type',
    });
  });

  it('refuse au-delà du plafond', () => {
    const gros = Buffer.concat([
      Buffer.from('OggS'),
      Buffer.alloc(AUDIO_MAX_BYTES),
    ]);
    expect(decodeAudioPayload(b64(gros), 'audio/ogg')).toEqual({
      ok: false,
      code: 'too_large',
    });
  });

  it('refuse une charge absente ou vide', () => {
    expect(decodeAudioPayload(undefined, 'audio/mpeg')).toEqual({
      ok: false,
      code: 'missing_data',
    });
    expect(decodeAudioPayload(b64(Buffer.alloc(0)), 'audio/mpeg')).toEqual({
      ok: false,
      code: 'invalid_base64',
    });
  });
});
