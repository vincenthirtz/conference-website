import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendEmail, sendWelcomeEmail, sendTeamJoinEmail, sendAccountDeletedEmail } from '../../utils/email';

// Save originals
const origEnv = { ...process.env };

beforeEach(() => {
  process.env.RESEND_API_KEY = 'test-key';
  process.env.EMAIL_FROM = 'Test <test@example.com>';
});

afterEach(() => {
  process.env = { ...origEnv };
  vi.restoreAllMocks();
});

describe('sendEmail', () => {
  it('returns error when RESEND_API_KEY is not set', async () => {
    delete process.env.RESEND_API_KEY;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await sendEmail({ to: 'a@b.com', subject: 'Hi', html: '<p>hi</p>' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('RESEND_API_KEY');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('sends email and returns success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'email-123' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await sendEmail({ to: 'user@test.com', subject: 'Test', html: '<p>body</p>' });

    expect(result.success).toBe(true);
    expect(result.id).toBe('email-123');
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('resend.com');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body).to).toEqual(['user@test.com']);
  });

  it('returns error on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ message: 'Forbidden' }),
    }));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await sendEmail({ to: 'a@b.com', subject: 'Hi', html: '' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Forbidden');
  });

  it('returns error on fetch exception', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await sendEmail({ to: 'a@b.com', subject: 'Hi', html: '' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network down');
  });

  it('handles non-ok response with unparseable JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('bad json')),
    }));
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
      json: () => Promise.resolve({ id: 'w1' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await sendWelcomeEmail('user@test.com', 'p@ss<word');

    expect(result.success).toBe(true);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.subject).toContain('Bienvenue');
    // escapeHtml should have escaped < in password
    expect(body.html).toContain('&lt;');
    expect(body.html).not.toContain('<word');
  });
});

describe('sendTeamJoinEmail', () => {
  it('calls sendEmail with team name and role escaped', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 't1' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await sendTeamJoinEmail('u@t.com', 'Team <Script>', 'captain');

    expect(result.success).toBe(true);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.html).toContain('&lt;Script&gt;');
    expect(body.html).not.toContain('<Script>');
    expect(body.subject).toContain('Team <Script>');
  });
});

describe('sendAccountDeletedEmail', () => {
  it('sends deletion notification', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'd1' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await sendAccountDeletedEmail('gone@test.com');

    expect(result.success).toBe(true);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.subject).toContain('supprimé');
    expect(body.to).toEqual(['gone@test.com']);
  });
});
