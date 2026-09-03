// tests/unit/emailTenantSender.test.ts
//
// Compte d'envoi et marque des emails, par espace.
//
// Deux problèmes réglés ici :
//
//   1. Le compte. Tous les emails partaient du compte Brevo de l'association.
//      Un autre espace aurait donc expédié depuis notre domaine, sur notre
//      quota, avec nos plaintes pour spam à la clé. Un espace sans
//      identifiants n'envoie plus — il n'emprunte pas les nôtres.
//
//   2. La marque. Le gabarit figeait « OW Women's Cup », le logo et
//      owwomenscup.fr. Les joueuses d'un autre tournoi recevaient des emails
//      signés d'une association inconnue d'elles, au moment (invitation,
//      check-in) où la confiance compte le plus.
//
// Le contrat : sans tenant, l'email est identique à l'octet près à ce qu'il
// était — c'est ce qui permet de brancher les envois un par un.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { sendEmail } from '../../utils/email';
import {
  applyBrand,
  resolveEmailBrand,
  DEFAULT_EMAIL_BRAND,
  BRAND_TOKENS,
  __resetEmailBrandCacheForTests,
} from '../../utils/emailBrand';

const TENANT_B = '11111111-2222-4333-8444-555555555555';
const DEFAULT_TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

const ORIG_ENV = { ...process.env };

/** Capture le payload envoyé à Brevo. */
function captureFetch() {
  const calls: Array<{ url: string; body: any; headers: any }> = [];
  global.fetch = (async (url: any, init: any) => {
    calls.push({
      url: String(url),
      body: JSON.parse(init?.body ?? '{}'),
      headers: init?.headers ?? {},
    });
    return {
      ok: true,
      status: 200,
      json: async () => ({ messageId: 'mid-1' }),
    };
  }) as any;
  return calls;
}

beforeEach(() => {
  resetSupabaseMock();
  __resetEmailBrandCacheForTests();
  process.env.BREVO_API_KEY = 'platform-key';
  process.env.EMAIL_FROM = 'noreply@owwomenscup.fr';
  process.env.EMAIL_FROM_NAME = 'OWWC';
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
  vi.restoreAllMocks();
});

describe('compte d’envoi', () => {
  it('sans tenant : compte de la plateforme (comportement historique)', async () => {
    const calls = captureFetch();
    const r = await sendEmail({
      to: 'a@b.fr',
      subject: 'Hello',
      html: '<p>x</p>',
    });
    expect(r.success).toBe(true);
    expect(calls[0].headers['api-key']).toBe('platform-key');
    expect(calls[0].body.sender.email).toBe('noreply@owwomenscup.fr');
  });

  it('tenant historique : compte de la plateforme aussi', async () => {
    const calls = captureFetch();
    await sendEmail({
      to: 'a@b.fr',
      subject: 'Hello',
      html: '<p>x</p>',
      tenantId: DEFAULT_TENANT,
    });
    expect(calls[0].headers['api-key']).toBe('platform-key');
  });

  it('autre tenant sans identifiants : REFUS, pas d’emprunt du compte plateforme', async () => {
    const calls = captureFetch();
    const r = await sendEmail({
      to: 'a@b.fr',
      subject: 'Hello',
      html: '<p>x</p>',
      tenantId: TENANT_B,
    });
    expect(r.success).toBe(false);
    expect(r.error).toBe('email_not_configured');
    // Le point qui compte : rien n'est parti.
    expect(calls).toHaveLength(0);
  });
});

describe('marque appliquée au gabarit', () => {
  it('marque par défaut : les jetons rendent les valeurs historiques', () => {
    const html = `<img src="${BRAND_TOKENS.logoUrl}"><a href="${BRAND_TOKENS.siteUrl}">${BRAND_TOKENS.name}</a>`;
    const out = applyBrand(html, DEFAULT_EMAIL_BRAND);
    expect(out).toContain(DEFAULT_EMAIL_BRAND.logoUrl);
    expect(out).toContain(DEFAULT_EMAIL_BRAND.siteUrl);
    expect(out).toContain("OW Women's Cup");
    expect(out).not.toContain('{{BRAND_');
  });

  it('marque d’un tenant : nom, site et logo remplacés — jetons ET littéraux', () => {
    const brand = {
      name: 'Cup Estivale',
      siteUrl: 'https://cup-estivale.fr',
      logoUrl: 'https://cup-estivale.fr/logo.png',
    };
    const html = `${BRAND_TOKENS.name} — bienvenue à la OW Women's Cup ! https://owwomenscup.fr/tournois`;
    const out = applyBrand(html, brand);
    expect(out).toContain('Cup Estivale — bienvenue à la Cup Estivale !');
    expect(out).toContain('https://cup-estivale.fr/tournois');
    expect(out).not.toContain("OW Women's Cup");
    expect(out).not.toContain('owwomenscup.fr');
  });

  it('le bloc « plateforme uniquement » disparaît pour un autre espace', () => {
    const html =
      'a<!--BRAND_PLATFORM_ONLY--><a href="https://discord.gg/x">Discord</a><!--/BRAND_PLATFORM_ONLY-->b';
    expect(applyBrand(html, DEFAULT_EMAIL_BRAND)).toBe(
      'a<a href="https://discord.gg/x">Discord</a>b'
    );
    expect(
      applyBrand(html, {
        name: 'Autre',
        siteUrl: 'https://autre.fr',
        logoUrl: 'https://autre.fr/l.png',
      })
    ).toBe('ab');
  });
});

describe('resolveEmailBrand', () => {
  it('tenant inconnu → marque par défaut (jamais d’email sans identité)', async () => {
    expect(await resolveEmailBrand(TENANT_B)).toEqual(DEFAULT_EMAIL_BRAND);
  });

  it('le nom et le site suivent le tenant même sur le palier gratuit', async () => {
    store.tenants = [
      {
        id: TENANT_B,
        name: 'Cup Estivale',
        slug: 'cup-estivale',
        is_active: true,
        logo_url: '/img/custom.png',
        custom_domain: null,
        plan: 'discovery',
        plan_status: 'active',
        plan_expires_at: null,
      },
    ] as any;
    const brand = await resolveEmailBrand(TENANT_B);
    expect(brand.name).toBe('Cup Estivale');
    // Pas de domaine propre déclaré → lien vers la plateforme. Un espace n'a
    // pas de site public : `/cup-estivale` n'existe pas, et un 404 en pied
    // d'email est pire que pas de lien personnalisé.
    expect(brand.siteUrl).toBe(DEFAULT_EMAIL_BRAND.siteUrl);
    // Le logo, lui, est du white-label : le palier gratuit garde le nôtre.
    expect(brand.logoUrl).toBe(DEFAULT_EMAIL_BRAND.logoUrl);
  });

  it('domaine propre + plan payant → site et logo du tenant', async () => {
    store.tenants = [
      {
        id: TENANT_B,
        name: 'Cup Estivale',
        slug: 'cup-estivale',
        is_active: true,
        logo_url: '/img/custom.png',
        custom_domain: 'cup-estivale.fr',
        plan: 'regie',
        plan_status: 'active',
        plan_expires_at: null,
      },
    ] as any;
    const brand = await resolveEmailBrand(TENANT_B);
    expect(brand.siteUrl).toBe('https://cup-estivale.fr');
    expect(brand.logoUrl).toBe('https://cup-estivale.fr/img/custom.png');
  });

  it('tenant désactivé → marque par défaut', async () => {
    store.tenants = [
      {
        id: TENANT_B,
        name: 'Cup Estivale',
        slug: 'cup-estivale',
        is_active: false,
        plan: 'regie',
        plan_status: 'active',
        plan_expires_at: null,
      },
    ] as any;
    expect(await resolveEmailBrand(TENANT_B)).toEqual(DEFAULT_EMAIL_BRAND);
  });
});
