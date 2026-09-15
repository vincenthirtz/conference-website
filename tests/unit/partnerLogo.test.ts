// Logos partenaires : jamais servis depuis un hôte tiers (cf.
// utils/partners/partnerLogo.ts). Le 15/09/2026, un logo chargé depuis
// rankedactu.fr, tombé, laissait l'accueil avec une image cassée et une requête
// pendante, et Wix recevait l'IP des visiteuses avant tout consentement.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const rehostImage = vi.hoisted(() => vi.fn());
vi.mock('@/utils/social/rehostImage', () => ({ rehostImage }));

import { resolvePartnerLogo } from '../../utils/partners/partnerLogo';

const COPY =
  'https://example.supabase.co/storage/v1/object/public/teams-images/partners/0f.png';

describe('resolvePartnerLogo', () => {
  beforeEach(() => rehostImage.mockReset());

  it('vide → pas de logo, sans rien télécharger', async () => {
    expect(await resolvePartnerLogo('  ')).toEqual({ ok: true, logoUrl: null });
    expect(await resolvePartnerLogo(undefined)).toEqual({
      ok: true,
      logoUrl: null,
    });
    expect(rehostImage).not.toHaveBeenCalled();
  });

  it('chemin du site gardé tel quel', async () => {
    expect(
      await resolvePartnerLogo('/img/partners/librairie-a-soie.png')
    ).toEqual({
      ok: true,
      logoUrl: '/img/partners/librairie-a-soie.png',
    });
    expect(rehostImage).not.toHaveBeenCalled();
  });

  it('URL protocole-relative jamais prise pour un chemin local (ignorée)', async () => {
    rehostImage.mockResolvedValue({
      url: '//cdn.tiers/x.png',
      rehosted: false,
      error: "L'adresse de l'image est invalide.",
    });
    const out = await resolvePartnerLogo('//cdn.tiers/x.png');
    expect(out).toEqual({ ok: true, logoUrl: null });
  });

  it('schéma refusé (javascript:) → ignoré, comme auparavant', async () => {
    expect(await resolvePartnerLogo('javascript:alert(1)')).toEqual({
      ok: true,
      logoUrl: null,
    });
    expect(rehostImage).not.toHaveBeenCalled();
  });

  it('URL externe → recopiée dans notre stockage', async () => {
    rehostImage.mockResolvedValue({ url: COPY, rehosted: true, error: null });
    const out = await resolvePartnerLogo(
      'https://static.wixstatic.com/media/logo.png'
    );
    expect(rehostImage).toHaveBeenCalledWith(
      'https://static.wixstatic.com/media/logo.png',
      'partners'
    );
    expect(out).toEqual({ ok: true, logoUrl: COPY });
  });

  it('recopie impossible → refus explicite, jamais l’URL tierce', async () => {
    rehostImage.mockResolvedValue({
      url: 'https://tiers.fr/logo.avif',
      rehosted: false,
      error: "Type d'image non pris en charge (image/avif).",
    });
    const out = await resolvePartnerLogo('https://tiers.fr/logo.avif');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain('image/avif');
  });
});
