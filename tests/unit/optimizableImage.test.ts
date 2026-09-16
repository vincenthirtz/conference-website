// tests/unit/optimizableImage.test.ts
//
// Le point sensible n'est pas la fonction, c'est sa SYNCHRONISATION avec
// `next.config.js`. Un hôte listé ici mais absent de `remotePatterns` fait
// échouer `next/image` au rendu — une page blanche, pas un repli.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isOptimizableImageUrl,
  OPTIMIZABLE_REMOTE_HOSTS,
} from '@/utils/images/optimizableImage';

const SUPABASE =
  'https://yhfdhpqgmazfxyyklomp.supabase.co/storage/v1/object/public/teams-images/logo.png';

describe('isOptimizableImageUrl', () => {
  it('accepte un chemin local', () => {
    expect(isOptimizableImageUrl('/img/teams/hinode.png')).toBe(true);
  });

  it('refuse une URL protocol-relative, qui n’est pas un chemin local', () => {
    expect(isOptimizableImageUrl('//evil.example/logo.png')).toBe(false);
  });

  it('accepte le stockage public Supabase', () => {
    expect(isOptimizableImageUrl(SUPABASE)).toBe(true);
  });

  it('refuse Supabase hors du préfixe public — le motif porte un pathname', () => {
    expect(
      isOptimizableImageUrl(
        'https://yhfdhpqgmazfxyyklomp.supabase.co/storage/v1/object/sign/x.png'
      )
    ).toBe(false);
  });

  it('accepte les CDN déclarés', () => {
    expect(
      isOptimizableImageUrl('https://cdn.discordapp.com/avatars/1/a.png')
    ).toBe(true);
    expect(
      isOptimizableImageUrl('https://static-cdn.jtvnw.net/jtv_user_pictures/a')
    ).toBe(true);
  });

  it('refuse un hôte inconnu — c’est tout l’objet du repli <img>', () => {
    expect(isOptimizableImageUrl('https://i.imgur.com/abc.png')).toBe(false);
  });

  it('refuse http, que remotePatterns ne déclare pas', () => {
    expect(isOptimizableImageUrl('http://overwatch.blizzard.com/a.png')).toBe(
      false
    );
  });

  it('refuse le vide et l’illisible plutôt que de risquer une page cassée', () => {
    expect(isOptimizableImageUrl(null)).toBe(false);
    expect(isOptimizableImageUrl(undefined)).toBe(false);
    expect(isOptimizableImageUrl('   ')).toBe(false);
    expect(isOptimizableImageUrl('pas une url')).toBe(false);
  });
});

describe('synchronisation avec next.config.js', () => {
  it('chaque hôte déclaré ici figure dans images.remotePatterns', () => {
    const config = fs.readFileSync(
      path.join(process.cwd(), 'next.config.js'),
      'utf8'
    );
    const missing = OPTIMIZABLE_REMOTE_HOSTS.filter((host) => {
      // `.supabase.co` est déclaré sous la forme d'un motif `**.supabase.co`.
      const needle = host.startsWith('.') ? `**${host}` : host;
      return !config.includes(needle);
    });
    expect(
      missing,
      `Hôtes absents de next.config.js : ${missing.join(', ')}.\n` +
        'Un hôte optimisable non déclaré fait échouer next/image AU RENDU.'
    ).toEqual([]);
  });
});
