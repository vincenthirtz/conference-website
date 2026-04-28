import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sendContactStaffEmail,
  sendPartnershipStaffEmail,
  sendPartnershipConfirmationEmail,
  sendSupportStaffNotificationEmail,
  sendPasswordResetEmail,
} from '../../utils/email';

const origEnv = { ...process.env };

beforeEach(() => {
  process.env.BREVO_API_KEY = 'test-key';
  process.env.EMAIL_FROM = 'noreply@example.com';
  process.env.EMAIL_FROM_NAME = 'OWWC';
});

afterEach(() => {
  process.env = { ...origEnv };
  vi.restoreAllMocks();
});

function mockFetchOk() {
  const fn = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ messageId: 'mid-1' }),
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const DEFAULT_STAFF_EMAIL = 'owwomenscup@gmail.com';

/* -----------------------------------------------------------
 * sendContactStaffEmail
 * ---------------------------------------------------------*/

describe('sendContactStaffEmail', () => {
  const base = {
    name: 'Alice',
    email: 'alice@example.com',
    subject: 'Bonjour',
    message: 'Question sur le tournoi',
  };

  it('sends to the default staff inbox', async () => {
    const fetchMock = mockFetchOk();
    const result = await sendContactStaffEmail(base);
    expect(result.success).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toEqual([{ email: DEFAULT_STAFF_EMAIL }]);
  });

  it('builds subject as "[Contact] <subject> — <name>"', async () => {
    const fetchMock = mockFetchOk();
    await sendContactStaffEmail(base);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.subject).toBe('[Contact] Bonjour — Alice');
  });

  it('exposes a mailto: CTA pointing to the requester', async () => {
    const fetchMock = mockFetchOk();
    await sendContactStaffEmail(base);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.htmlContent).toMatch(/href="mailto:alice@example\.com"/);
  });

  it('escapes user-provided fields to prevent HTML injection', async () => {
    const fetchMock = mockFetchOk();
    await sendContactStaffEmail({
      name: '<script>x</script>',
      email: 'a@b.com',
      subject: '<img src=x>',
      message: '<b>hello</b>',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.htmlContent).toContain('&lt;script&gt;');
    expect(body.htmlContent).toContain('&lt;img');
    expect(body.htmlContent).toContain('&lt;b&gt;hello&lt;/b&gt;');
    expect(body.htmlContent).not.toContain('<script>x</script>');
    expect(body.htmlContent).not.toContain('<img src=x>');
    expect(body.htmlContent).not.toContain('<b>hello</b>');
  });

  it('tags the email for Brevo segmentation', async () => {
    const fetchMock = mockFetchOk();
    await sendContactStaffEmail(base);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tags).toEqual(['contact-staff']);
  });
});

/* -----------------------------------------------------------
 * sendPartnershipStaffEmail
 * ---------------------------------------------------------*/

describe('sendPartnershipStaffEmail', () => {
  const base = {
    companyName: 'Acme Corp',
    contactName: 'Bob',
    email: 'bob@acme.test',
    category: 'major' as const,
    message: 'On veut sponsoriser',
  };

  it('sends to the staff inbox', async () => {
    const fetchMock = mockFetchOk();
    await sendPartnershipStaffEmail(base);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toEqual([{ email: DEFAULT_STAFF_EMAIL }]);
  });

  it('subject embeds the company and the French category label', async () => {
    const fetchMock = mockFetchOk();
    await sendPartnershipStaffEmail(base);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.subject).toBe('[Partenariat] Acme Corp — Partenaire majeur');
  });

  it('omits optional rows (phone, website, budget) when not provided', async () => {
    const fetchMock = mockFetchOk();
    await sendPartnershipStaffEmail(base);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // Label "Site web" appears in the brand footer; assert via the row marker
    // emitted by detailsTable() (uppercase + letter-spacing styling).
    const rowLabel = (label: string) =>
      new RegExp(`letter-spacing:0\\.1em;">${label}</span>`);
    expect(body.htmlContent).not.toMatch(rowLabel('T[ée]l[ée]phone'));
    expect(body.htmlContent).not.toMatch(rowLabel('Site web'));
    expect(body.htmlContent).not.toMatch(rowLabel('Budget'));
  });

  it('renders all optional rows when provided', async () => {
    const fetchMock = mockFetchOk();
    await sendPartnershipStaffEmail({
      ...base,
      phone: '+33 6 12 34 56 78',
      website: 'https://acme.test',
      budgetRange: '1000 - 3000 EUR',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.htmlContent).toMatch(/T[ée]l[ée]phone/);
    expect(body.htmlContent).toContain('+33 6 12 34 56 78');
    expect(body.htmlContent).toContain('https://acme.test');
    expect(body.htmlContent).toContain('1000 - 3000 EUR');
  });

  it('escapes the message body and company name', async () => {
    const fetchMock = mockFetchOk();
    await sendPartnershipStaffEmail({
      ...base,
      companyName: 'Acme <evil>',
      message: '<b>injected</b>',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.htmlContent).toContain('&lt;evil&gt;');
    expect(body.htmlContent).toContain('&lt;b&gt;injected&lt;/b&gt;');
    expect(body.htmlContent).not.toContain('<b>injected</b>');
  });

  it('tags the email for Brevo segmentation', async () => {
    const fetchMock = mockFetchOk();
    await sendPartnershipStaffEmail(base);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tags).toEqual(['partnership-staff']);
  });
});

/* -----------------------------------------------------------
 * sendPartnershipConfirmationEmail
 * ---------------------------------------------------------*/

describe('sendPartnershipConfirmationEmail', () => {
  const base = {
    to: 'bob@acme.test',
    contactName: 'Bob',
    companyName: 'Acme Corp',
  };

  it('sends to the requester (not staff)', async () => {
    const fetchMock = mockFetchOk();
    await sendPartnershipConfirmationEmail(base);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toEqual([{ email: 'bob@acme.test' }]);
  });

  it('addresses the requester by name and mentions the company', async () => {
    const fetchMock = mockFetchOk();
    await sendPartnershipConfirmationEmail(base);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.htmlContent).toContain('Bob');
    expect(body.htmlContent).toContain('Acme Corp');
  });

  it('escapes the contact and company names', async () => {
    const fetchMock = mockFetchOk();
    await sendPartnershipConfirmationEmail({
      ...base,
      contactName: '<b>Bob</b>',
      companyName: '<script>x</script>',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.htmlContent).toContain('&lt;b&gt;Bob&lt;/b&gt;');
    expect(body.htmlContent).toContain('&lt;script&gt;');
    expect(body.htmlContent).not.toContain('<b>Bob</b>');
    expect(body.htmlContent).not.toContain('<script>x</script>');
  });

  it('tags the email for Brevo segmentation', async () => {
    const fetchMock = mockFetchOk();
    await sendPartnershipConfirmationEmail(base);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tags).toEqual(['partnership-confirmation']);
  });
});

/* -----------------------------------------------------------
 * sendSupportStaffNotificationEmail
 * ---------------------------------------------------------*/

describe('sendSupportStaffNotificationEmail', () => {
  const base = {
    ticketId: '0123456789abcdef',
    category: 'behavior' as const,
    severity: 'medium' as const,
    isAnonymous: false,
    reporterName: 'Charlie',
    reporterEmail: 'charlie@test.com',
    subject: 'Comportement toxique',
    message: 'Détails du signalement.',
    adminUrl: 'https://owwomenscup.fr/admin/support',
  };

  it('sends to the staff inbox', async () => {
    const fetchMock = mockFetchOk();
    await sendSupportStaffNotificationEmail(base);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toEqual([{ email: DEFAULT_STAFF_EMAIL }]);
  });

  it('uses [Signalement] prefix and the short ref for non-urgent tickets', async () => {
    const fetchMock = mockFetchOk();
    await sendSupportStaffNotificationEmail(base);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.subject).toBe('[Signalement] Comportement toxique (01234567)');
  });

  it('switches to [URGENT] prefix for HIGH severity', async () => {
    const fetchMock = mockFetchOk();
    await sendSupportStaffNotificationEmail({
      ...base,
      severity: 'high',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.subject).toMatch(/^\[URGENT\]/);
    expect(body.htmlContent).toMatch(/Signalement urgent/);
    expect(body.htmlContent).toMatch(/priorit/i);
    expect(body.tags).toContain('support-urgent');
  });

  it('shows "Anonyme" and tags as support-anonymous when isAnonymous', async () => {
    const fetchMock = mockFetchOk();
    await sendSupportStaffNotificationEmail({
      ...base,
      isAnonymous: true,
      reporterName: null,
      reporterEmail: null,
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.htmlContent).toContain('Anonyme');
    expect(body.htmlContent).toMatch(/Signalement anonyme/);
    expect(body.tags).toContain('support-anonymous');
  });

  it('falls back to the category label when no subject is provided', async () => {
    const fetchMock = mockFetchOk();
    await sendSupportStaffNotificationEmail({ ...base, subject: null });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.subject).toBe('[Signalement] Comportement / Safety (01234567)');
  });

  it('embeds the admin URL in the CTA', async () => {
    const fetchMock = mockFetchOk();
    await sendSupportStaffNotificationEmail(base);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.htmlContent).toContain(
      'href="https://owwomenscup.fr/admin/support"'
    );
  });

  it('escapes the user-provided message and subject', async () => {
    const fetchMock = mockFetchOk();
    await sendSupportStaffNotificationEmail({
      ...base,
      subject: 'Bug <b>critique</b>',
      message: '<script>alert(1)</script>',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.htmlContent).toContain('&lt;b&gt;critique&lt;/b&gt;');
    expect(body.htmlContent).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(body.htmlContent).not.toContain('<script>alert(1)</script>');
  });

  it('always tags as support-staff', async () => {
    const fetchMock = mockFetchOk();
    await sendSupportStaffNotificationEmail(base);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tags).toContain('support-staff');
  });
});

/* -----------------------------------------------------------
 * sendPasswordResetEmail
 * ---------------------------------------------------------*/

describe('sendPasswordResetEmail', () => {
  const base = {
    to: 'user@test.com',
    actionLink:
      'https://owwomenscup.fr/admin/reset-password#access_token=abc&type=recovery',
  };

  it('sends to the requested email', async () => {
    const fetchMock = mockFetchOk();
    await sendPasswordResetEmail(base);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toEqual([{ email: 'user@test.com' }]);
  });

  it('uses the documented subject line', async () => {
    const fetchMock = mockFetchOk();
    await sendPasswordResetEmail(base);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.subject).toContain('Réinitialisation');
  });

  it('embeds the action link twice (CTA button + plain text fallback)', async () => {
    const fetchMock = mockFetchOk();
    await sendPasswordResetEmail(base);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const occurrences = body.htmlContent.split(base.actionLink).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('mentions the 1-hour validity window', async () => {
    const fetchMock = mockFetchOk();
    await sendPasswordResetEmail(base);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.htmlContent).toMatch(/une heure|1 ?h/i);
  });

  it('tags the email for Brevo segmentation', async () => {
    const fetchMock = mockFetchOk();
    await sendPasswordResetEmail(base);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tags).toEqual(['password-reset']);
  });
});
