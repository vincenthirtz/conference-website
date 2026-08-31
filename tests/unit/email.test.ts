import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sendEmail,
  sendWelcomeEmail,
  sendTeamJoinEmail,
  sendAccountDeletedEmail,
  sendTestEmail,
} from '../../utils/email';

// Save originals
const origEnv = { ...process.env };

beforeEach(() => {
  process.env.BREVO_API_KEY = 'test-key';
  process.env.EMAIL_FROM = 'Test <test@example.com>';
});

afterEach(() => {
  process.env = { ...origEnv };
  vi.restoreAllMocks();
});

describe('sendEmail', () => {
  it('returns error when BREVO_API_KEY is not set', async () => {
    delete process.env.BREVO_API_KEY;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await sendEmail({
      to: 'a@b.com',
      subject: 'Hi',
      html: '<p>hi</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('BREVO_API_KEY');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('sends email and returns success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messageId: 'email-123' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await sendEmail({
      to: 'user@test.com',
      subject: 'Test',
      html: '<p>body</p>',
    });

    expect(result.success).toBe(true);
    expect(result.id).toBe('email-123');
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('brevo.com');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body).to).toEqual([{ email: 'user@test.com' }]);
  });

  it('returns error on non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ message: 'Forbidden' }),
      })
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await sendEmail({ to: 'a@b.com', subject: 'Hi', html: '' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Forbidden');
  });

  it('returns error on fetch exception', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network down'))
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await sendEmail({ to: 'a@b.com', subject: 'Hi', html: '' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network down');
  });

  it('adds List-Unsubscribe headers when listUnsubscribeUrl is provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messageId: 'u1' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const url = 'https://owwomenscup.fr/api/email/unsubscribe?token=t&scope=broadcast';
    await sendEmail({
      to: 'a@b.com',
      subject: 'Hi',
      html: '<p>hi</p>',
      listUnsubscribeUrl: url,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.headers).toEqual({
      'List-Unsubscribe': `<${url}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  it('omits List-Unsubscribe headers when listUnsubscribeUrl is absent', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messageId: 'u2' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await sendEmail({ to: 'a@b.com', subject: 'Hi', html: '<p>hi</p>' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.headers).toBeUndefined();
  });

  it('handles non-ok response with unparseable JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('bad json')),
      })
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await sendEmail({ to: 'a@b.com', subject: 'Hi', html: '' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('500');
  });
});

describe('sendWelcomeEmail', () => {
  it('calls sendEmail with escaped content', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messageId: 'w1' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await sendWelcomeEmail('user@test.com', 'p@ss<word');

    expect(result.success).toBe(true);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.subject).toContain('Bienvenue');
    // escapeHtml should have escaped < in password
    expect(body.htmlContent).toContain('&lt;');
    expect(body.htmlContent).not.toContain('<word');
  });
});

describe('sendTeamJoinEmail', () => {
  it('calls sendEmail with team name and role escaped', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messageId: 't1' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await sendTeamJoinEmail(
      'u@t.com',
      'Team <Script>',
      'captain'
    );

    expect(result.success).toBe(true);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.htmlContent).toContain('&lt;Script&gt;');
    expect(body.htmlContent).not.toContain('<Script>');
    expect(body.subject).toContain('Team <Script>');
  });
});

describe('sendAccountDeletedEmail', () => {
  it('sends deletion notification', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messageId: 'd1' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await sendAccountDeletedEmail('gone@test.com');

    expect(result.success).toBe(true);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.subject).toContain('supprimé');
    expect(body.to).toEqual([{ email: 'gone@test.com' }]);
  });
});

describe('sendTestEmail', () => {
  it('sends test email with correct subject', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messageId: 'test1' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await sendTestEmail('admin@test.com');

    expect(result.success).toBe(true);
    expect(result.id).toBe('test1');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.subject).toContain('[Test]');
    expect(body.to).toEqual([{ email: 'admin@test.com' }]);
  });
});

describe('Brevo API integration', () => {
  it('sends correct headers (api-key, not Bearer)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messageId: 'h1' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await sendEmail({ to: 'a@b.com', subject: 'Hi', html: '<p>hi</p>' });

    const opts = mockFetch.mock.calls[0][1];
    expect(opts.headers['api-key']).toBe('test-key');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(opts.headers['Accept']).toBe('application/json');
    expect(opts.headers['Authorization']).toBeUndefined();
  });

  it('sends sender as object with name and email', async () => {
    process.env.EMAIL_FROM = 'noreply@owwomenscup.fr';
    process.env.EMAIL_FROM_NAME = 'OWWC';
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messageId: 's1' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await sendEmail({ to: 'a@b.com', subject: 'Hi', html: '<p>hi</p>' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.sender).toEqual({
      name: 'OWWC',
      email: 'noreply@owwomenscup.fr',
    });
  });

  it('uses htmlContent key instead of html', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messageId: 'c1' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await sendEmail({ to: 'a@b.com', subject: 'Hi', html: '<p>content</p>' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.htmlContent).toBe('<p>content</p>');
    expect(body.html).toBeUndefined();
  });

  it('uses default sender when env vars are missing', async () => {
    delete process.env.EMAIL_FROM;
    delete process.env.EMAIL_FROM_NAME;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messageId: 'df1' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await sendEmail({ to: 'a@b.com', subject: 'Hi', html: '' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.sender.name).toBe('Tournoi');
    expect(body.sender.email).toBe('noreply@example.com');
  });

  it('formats to as array of {email} objects', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messageId: 'f1' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await sendEmail({ to: 'user@example.com', subject: 'Hi', html: '' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.to).toEqual([{ email: 'user@example.com' }]);
    expect(Array.isArray(body.to)).toBe(true);
  });
});

describe('email templates use branded layout', () => {
  function mockBrevo() {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messageId: 'layout1' }),
    });
    vi.stubGlobal('fetch', mockFetch);
    return mockFetch;
  }

  it('welcome email includes logo, gradient, and CTA', async () => {
    const mockFetch = mockBrevo();
    await sendWelcomeEmail('u@t.com', 'pass123');
    const html = JSON.parse(mockFetch.mock.calls[0][1].body).htmlContent;

    expect(html).toContain('2026-logo.png');
    expect(html).toContain('linear-gradient');
    expect(html).toContain('Se connecter');
    expect(html).toContain('owwomenscup.fr');
    expect(html).toContain('#1b1130');
  });

  it('team join email includes Discord link and CTA', async () => {
    const mockFetch = mockBrevo();
    await sendTeamJoinEmail('u@t.com', 'Les Heroines', 'captain');
    const html = JSON.parse(mockFetch.mock.calls[0][1].body).htmlContent;

    expect(html).toContain('discord.gg');
    expect(html).toContain('Les Heroines');
    expect(html).toContain('captain');
    expect(html).toContain('Voir mon');
  });

  it('account deleted email includes branding but no CTA', async () => {
    const mockFetch = mockBrevo();
    await sendAccountDeletedEmail('u@t.com');
    const html = JSON.parse(mockFetch.mock.calls[0][1].body).htmlContent;

    expect(html).toContain('2026-logo.png');
    expect(html).toContain('supprim');
    expect(html).not.toContain('Se connecter');
  });

  it('test email includes branding', async () => {
    const mockFetch = mockBrevo();
    await sendTestEmail('u@t.com');
    const html = JSON.parse(mockFetch.mock.calls[0][1].body).htmlContent;

    expect(html).toContain('2026-logo.png');
    expect(html).toContain('Brevo fonctionne');
  });
});
