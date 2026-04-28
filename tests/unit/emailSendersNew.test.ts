import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sendTournamentNotificationEmail,
  sendMatchCheckinEmail,
  sendSupportConfirmationEmail,
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

/* -----------------------------------------------------------
 * sendTournamentNotificationEmail
 * ---------------------------------------------------------*/

describe('sendTournamentNotificationEmail', () => {
  it('sends with subject prefixed by "Tournoi ouvert"', async () => {
    const fetchMock = mockFetchOk();
    const result = await sendTournamentNotificationEmail(
      'captain@test.com',
      'Coupe du printemps',
      '2026-05-01T18:00:00Z',
      'coupe-printemps'
    );

    expect(result.success).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.subject).toBe('Tournoi ouvert : Coupe du printemps');
    expect(body.to).toEqual([{ email: 'captain@test.com' }]);
  });

  it('includes the formatted date when provided', async () => {
    const fetchMock = mockFetchOk();
    await sendTournamentNotificationEmail(
      'a@b.com',
      'Coupe',
      '2026-05-01T18:00:00Z',
      'coupe'
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // fr-FR formatting: includes "mai" or "1" as day, year 2026
    expect(body.htmlContent).toMatch(/2026/);
    expect(body.htmlContent).toMatch(/mai/i);
  });

  it('omits the date phrase entirely when startDate is null', async () => {
    const fetchMock = mockFetchOk();
    await sendTournamentNotificationEmail('a@b.com', 'Coupe', null, 'coupe');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.htmlContent).not.toMatch(/d&eacute;butera/);
  });

  it('falls back to /tournaments when slug is null', async () => {
    const fetchMock = mockFetchOk();
    await sendTournamentNotificationEmail('a@b.com', 'Coupe', null, null);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // CTA href contains the fallback path and not a stray "/null"
    expect(body.htmlContent).toMatch(/href="[^"]*\/tournaments"/);
    expect(body.htmlContent).not.toMatch(/\/tournaments\/null/);
  });

  it('escapes the tournament name to prevent HTML injection', async () => {
    const fetchMock = mockFetchOk();
    await sendTournamentNotificationEmail(
      'a@b.com',
      'Coupe <script>alert(1)</script>',
      null,
      's'
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.htmlContent).toContain('&lt;script&gt;');
    expect(body.htmlContent).not.toContain('<script>alert(1)');
  });

  it('tags the email for Brevo segmentation', async () => {
    const fetchMock = mockFetchOk();
    await sendTournamentNotificationEmail('a@b.com', 'Coupe', null, 's');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tags).toEqual(['tournament-notification']);
  });
});

/* -----------------------------------------------------------
 * sendMatchCheckinEmail
 * ---------------------------------------------------------*/

describe('sendMatchCheckinEmail', () => {
  const baseOpts = {
    to: 'captain@test.com',
    teamName: 'Alpha',
    opponentName: 'Beta',
    scheduledAt: '2026-04-15T18:00:00Z',
    checkinUrl: 'https://example.com/checkin/abc123',
    tournamentName: 'Coupe',
  };

  it('builds subject as "Check-in : <team> vs <opponent>"', async () => {
    const fetchMock = mockFetchOk();
    await sendMatchCheckinEmail(baseOpts);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.subject).toBe('Check-in : Alpha vs Beta');
  });

  it('embeds the check-in URL twice (CTA button + plain text fallback)', async () => {
    const fetchMock = mockFetchOk();
    await sendMatchCheckinEmail(baseOpts);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const occurrences = body.htmlContent.split(baseOpts.checkinUrl).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('warns about automatic forfeit', async () => {
    const fetchMock = mockFetchOk();
    await sendMatchCheckinEmail(baseOpts);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.htmlContent).toMatch(/forfait/i);
  });

  it('escapes team names to prevent HTML injection', async () => {
    const fetchMock = mockFetchOk();
    await sendMatchCheckinEmail({
      ...baseOpts,
      teamName: 'Team <img src=x>',
      opponentName: 'B',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.htmlContent).toContain('&lt;img');
    expect(body.htmlContent).not.toContain('<img src=x>');
  });

  it('formats the scheduled time in fr-FR with Europe/Paris timezone', async () => {
    const fetchMock = mockFetchOk();
    await sendMatchCheckinEmail(baseOpts);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // 18:00 UTC = 20:00 Paris (CEST in April)
    expect(body.htmlContent).toMatch(/20:00/);
  });

  it('tags the email for Brevo segmentation', async () => {
    const fetchMock = mockFetchOk();
    await sendMatchCheckinEmail(baseOpts);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tags).toEqual(['match-checkin']);
  });
});

/* -----------------------------------------------------------
 * sendSupportConfirmationEmail
 * ---------------------------------------------------------*/

describe('sendSupportConfirmationEmail', () => {
  const baseOpts = {
    to: 'reporter@test.com',
    ticketId: '0123456789abcdef',
    category: 'dispute' as const,
    severity: 'medium' as const,
    subject: 'Mon souci',
  };

  it('uses the documented subject line', async () => {
    const fetchMock = mockFetchOk();
    await sendSupportConfirmationEmail(baseOpts);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.subject).toContain('Signalement reçu');
  });

  it('shows the first 8 chars of the ticket id', async () => {
    const fetchMock = mockFetchOk();
    await sendSupportConfirmationEmail(baseOpts);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.htmlContent).toContain('01234567');
    expect(body.htmlContent).not.toContain(baseOpts.ticketId);
  });

  it('translates category and severity to French labels', async () => {
    const fetchMock = mockFetchOk();
    await sendSupportConfirmationEmail({
      ...baseOpts,
      category: 'behavior',
      severity: 'high',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.htmlContent).toContain('Comportement');
    expect(body.htmlContent).toContain('Haute');
  });

  it('mentions priority handling for high severity', async () => {
    const fetchMock = mockFetchOk();
    await sendSupportConfirmationEmail({ ...baseOpts, severity: 'high' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.htmlContent).toMatch(/priorit/);
  });

  it('does NOT mention priority handling for low severity', async () => {
    const fetchMock = mockFetchOk();
    await sendSupportConfirmationEmail({ ...baseOpts, severity: 'low' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.htmlContent).not.toMatch(/priorit/);
  });

  it('omits the subject row when subject is null', async () => {
    const fetchMock = mockFetchOk();
    await sendSupportConfirmationEmail({ ...baseOpts, subject: null });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // Subject label only appears when present
    expect(body.htmlContent).not.toMatch(/>Sujet</);
  });

  it('escapes the user-provided subject', async () => {
    const fetchMock = mockFetchOk();
    await sendSupportConfirmationEmail({
      ...baseOpts,
      subject: 'Bug <strong>critique</strong>',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.htmlContent).toContain('&lt;strong&gt;');
    expect(body.htmlContent).not.toContain('<strong>critique');
  });

  it('tags the email for Brevo segmentation', async () => {
    const fetchMock = mockFetchOk();
    await sendSupportConfirmationEmail(baseOpts);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tags).toEqual(['support-confirmation']);
  });
});
