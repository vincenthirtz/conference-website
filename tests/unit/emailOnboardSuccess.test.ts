// tests/unit/emailOnboardSuccess.test.ts
//
// Email « votre bot est prêt » : ce qu'il doit dire en plus des secrets.
//
// Un espace fraîchement créé part avec deux angles morts, et aucun des deux ne
// se signale de lui-même :
//
//   - il n'envoie AUCUN email tant que son compte Brevo n'est pas renseigné
//     (il n'emprunte pas celui de la plateforme). L'apprendre le jour d'un
//     rappel de check-in manqué est trop tard ;
//   - son essai gratuit a une fin, au terme de laquelle le bot cesse de
//     répondre.
//
// Ce test verrouille la présence des deux, et le fait que l'email reste
// correct quand l'essai n'est pas renseigné.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { sendEmail } = vi.hoisted(() => ({
  sendEmail: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/utils/email', () => ({ sendEmail }));

import { sendOnboardSuccessEmail } from '@/utils/emailOnboard';

const BASE = {
  to: 'op@example.test',
  displayName: 'Alex',
  tenantName: 'Cup Estivale',
  tenantSlug: 'cup-estivale',
  revealUrl: 'https://site.test/onboard/secrets/abc',
  siteUrl: 'https://site.test',
};

function sentHtml(): string {
  const call = sendEmail.mock.calls[0] as unknown as [{ html: string }];
  return call[0].html;
}

beforeEach(() => {
  sendEmail.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('email de fin d’onboarding', () => {
  it('renvoie vers le réglage du compte d’envoi, et dit ce qu’il bloque', async () => {
    await sendOnboardSuccessEmail({
      ...BASE,
      trialEndsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    const html = sentHtml();
    expect(html).toContain('/admin/site-settings?tab=email-sender');
    expect(html).toMatch(/aucun email ne part/i);
  });

  it('renvoie aussi vers les réglages Discord', async () => {
    await sendOnboardSuccessEmail({ ...BASE, trialEndsAt: null });
    expect(sentHtml()).toContain('/admin/site-settings?tab=discord');
  });

  it('annonce la fin de l’essai, en clair', async () => {
    await sendOnboardSuccessEmail({
      ...BASE,
      trialEndsAt: '2026-10-03T12:00:00.000Z',
    });
    const html = sentHtml();
    expect(html).toMatch(/essai gratuit jusqu'au/i);
    expect(html).toContain('3 octobre 2026');
  });

  it('sans essai renseigné : pas de bloc d’échéance, et rien de cassé', async () => {
    await sendOnboardSuccessEmail({ ...BASE, trialEndsAt: null });
    const html = sentHtml();
    expect(html).not.toMatch(/essai gratuit jusqu'au/i);
    expect(html).toContain('/admin/site-settings?tab=email-sender');
  });

  it('une date illisible ne fait pas échouer l’envoi', async () => {
    await sendOnboardSuccessEmail({ ...BASE, trialEndsAt: 'pas-une-date' });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sentHtml()).not.toMatch(/essai gratuit jusqu'au/i);
  });
});
