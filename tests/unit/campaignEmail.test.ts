// tests/unit/campaignEmail.test.ts
//
// Pure unit tests for the DB-backed email-campaign building blocks:
//   - buildCampaignEmailHtml (renderer — escaping, greeting, CTA, footer)
//   - campaignInputSchema / slugifyCampaignName (validation + slug)
//
// No supabase / network mocks needed: these are pure functions. The renderer
// is the security-critical surface (admin text is escaped), so the escaping
// assertions check the *negative* (no raw markup) as well as the positive.

import { describe, it, expect } from 'vitest';
import { buildCampaignEmailHtml, type CampaignBody } from '../../utils/email';
import {
  campaignInputSchema,
  slugifyCampaignName,
} from '../../utils/campaignSchema';

function baseBody(over: Partial<CampaignBody> = {}): CampaignBody {
  return {
    heading: 'Titre de campagne',
    bodyParagraphs: ['Premier paragraphe.'],
    ...over,
  };
}

/* -----------------------------------------------------------
 * buildCampaignEmailHtml
 * ---------------------------------------------------------*/

describe('buildCampaignEmailHtml', () => {
  it('renders the heading and a single paragraph', () => {
    const html = buildCampaignEmailHtml(
      baseBody({ heading: 'Mon titre', bodyParagraphs: ['Bonjour le monde.'] }),
      null
    );
    expect(html).toContain('Mon titre');
    expect(html).toContain('Bonjour le monde.');
  });

  it('renders one <p> per paragraph', () => {
    const html = buildCampaignEmailHtml(
      baseBody({ bodyParagraphs: ['Para un.', 'Para deux.', 'Para trois.'] }),
      null
    );
    expect(html).toContain('Para un.');
    expect(html).toContain('Para deux.');
    expect(html).toContain('Para trois.');
    // Each non-empty paragraph becomes its own styled <p> block. Count the
    // body-paragraph style signature rather than all <p> (layout has others).
    const occurrences =
      html.split('font-size:15px;color:#C6BED9;line-height:1.6;').length - 1;
    // 3 paragraphs (greeting absent because displayLabel is null).
    expect(occurrences).toBe(3);
  });

  it('drops empty / whitespace-only paragraphs', () => {
    const html = buildCampaignEmailHtml(
      baseBody({ bodyParagraphs: ['Gardé.', '   ', ''] }),
      null
    );
    const occurrences =
      html.split('font-size:15px;color:#C6BED9;line-height:1.6;').length - 1;
    expect(occurrences).toBe(1);
    expect(html).toContain('Gardé.');
  });

  // ── Greeting ──────────────────────────────────────────────

  it('renders "Hey {label}," when greeting enabled and a label is provided', () => {
    const html = buildCampaignEmailHtml(
      baseBody({ greetingEnabled: true }),
      'Alpha'
    );
    expect(html).toContain('Hey Alpha,');
  });

  it('renders the greeting by default (greetingEnabled undefined)', () => {
    const html = buildCampaignEmailHtml(baseBody(), 'Bravo');
    expect(html).toContain('Hey Bravo,');
  });

  it('omits the greeting when displayLabel is null', () => {
    const html = buildCampaignEmailHtml(
      baseBody({ greetingEnabled: true }),
      null
    );
    expect(html).not.toContain('Hey');
  });

  it('omits the greeting when greetingEnabled is false even with a label', () => {
    const html = buildCampaignEmailHtml(
      baseBody({ greetingEnabled: false }),
      'Charlie'
    );
    expect(html).not.toContain('Hey Charlie,');
  });

  it('escapes the display label in the greeting', () => {
    const html = buildCampaignEmailHtml(baseBody(), '<b>x</b>');
    expect(html).not.toContain('Hey <b>x</b>,');
    expect(html).toContain('Hey &lt;b&gt;x&lt;/b&gt;,');
  });

  // ── HTML escaping (security-critical) ─────────────────────

  it('escapes <script> in the heading (no raw script tag survives)', () => {
    const html = buildCampaignEmailHtml(
      baseBody({ heading: 'Hi <script>alert(1)</script>' }),
      null
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes <script> and quotes/ampersand in a paragraph', () => {
    const html = buildCampaignEmailHtml(
      baseBody({
        bodyParagraphs: ['evil <script>x</script> "quote" & amp'],
      }),
      null
    );
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain('&quot;quote&quot;');
    expect(html).toContain('&amp; amp');
  });

  // ── CTA ───────────────────────────────────────────────────

  it('renders the CTA button only when both label and url are set', () => {
    const html = buildCampaignEmailHtml(
      baseBody({ ctaLabel: 'Voir le live', ctaUrl: 'https://example.com/x' }),
      null
    );
    expect(html).toContain('Voir le live');
    expect(html).toContain('https://example.com/x');
  });

  it('omits the CTA when only ctaLabel is set', () => {
    const html = buildCampaignEmailHtml(
      baseBody({ ctaLabel: 'Lonely label', ctaUrl: null }),
      null
    );
    expect(html).not.toContain('Lonely label');
  });

  it('omits the CTA when only ctaUrl is set', () => {
    const html = buildCampaignEmailHtml(
      baseBody({ ctaLabel: null, ctaUrl: 'https://example.com/only' }),
      null
    );
    expect(html).not.toContain('https://example.com/only');
  });

  it('escapes the CTA url and label (attribute + text context)', () => {
    const html = buildCampaignEmailHtml(
      baseBody({
        ctaLabel: 'Click "me"',
        ctaUrl: 'https://example.com/?a=1&b=2"x',
      }),
      null
    );
    // The double-quote that could break out of the href attribute is escaped.
    expect(html).toContain('https://example.com/?a=1&amp;b=2&quot;x');
    expect(html).toContain('Click &quot;me&quot;');
  });

  // ── Footer note ───────────────────────────────────────────

  it('renders the footer note when present', () => {
    const html = buildCampaignEmailHtml(
      baseBody({ footerNote: 'Pas dispo ? VOD plus tard.' }),
      null
    );
    expect(html).toContain('Pas dispo ? VOD plus tard.');
  });

  it('omits the footer note when absent or blank', () => {
    const absent = buildCampaignEmailHtml(baseBody({ footerNote: null }), null);
    const blank = buildCampaignEmailHtml(baseBody({ footerNote: '   ' }), null);
    // The footer note uses a distinctive centered small style; assert it's not
    // emitted by checking the specific signature isn't present for our text.
    expect(absent).not.toContain('text-align:center;">Pas');
    expect(blank).not.toContain('text-align:center;">   ');
  });

  it('escapes the footer note', () => {
    const html = buildCampaignEmailHtml(
      baseBody({ footerNote: '<i>note</i>' }),
      null
    );
    expect(html).not.toContain('<i>note</i>');
    expect(html).toContain('&lt;i&gt;note&lt;/i&gt;');
  });

  // ── Unsubscribe link (RGPD broadcast) ─────────────────────

  it('renders the unsubscribe link when unsubscribeUrl is provided', () => {
    const url =
      'https://owwomenscup.fr/api/email/unsubscribe?token=abc.def&scope=broadcast';
    const html = buildCampaignEmailHtml(baseBody(), null, url);
    expect(html).toContain('Se désinscrire des annonces');
    expect(html).toContain(
      'https://owwomenscup.fr/api/email/unsubscribe?token=abc.def&amp;scope=broadcast'
    );
  });

  it('omits the unsubscribe link when unsubscribeUrl is absent (transactional intact)', () => {
    const html = buildCampaignEmailHtml(baseBody(), null);
    expect(html).not.toContain('Se désinscrire des annonces');
  });

  it('omits the unsubscribe link when unsubscribeUrl is blank', () => {
    const html = buildCampaignEmailHtml(baseBody(), null, '   ');
    expect(html).not.toContain('Se désinscrire des annonces');
  });
});

/* -----------------------------------------------------------
 * campaignInputSchema
 * ---------------------------------------------------------*/

function validInput(over: Record<string, unknown> = {}) {
  return {
    name: 'Ma campagne',
    subject: 'Un objet',
    heading: 'Un titre',
    bodyParagraphs: ['Un paragraphe.'],
    ...over,
  };
}

describe('campaignInputSchema', () => {
  it('parses a minimal valid input and applies defaults', () => {
    const parsed = campaignInputSchema.safeParse(validInput());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.audience).toBe('all-confirmed-users');
      expect(parsed.data.status).toBe('draft');
      expect(parsed.data.greetingEnabled).toBe(true);
      expect(parsed.data.description).toBe('');
    }
  });

  it('parses a full valid input including CTA + footer', () => {
    const parsed = campaignInputSchema.safeParse(
      validInput({
        description: 'desc',
        status: 'active',
        greetingEnabled: false,
        ctaLabel: 'Voir',
        ctaUrl: 'https://example.com/go',
        footerNote: 'note',
        bodyParagraphs: ['p1', 'p2'],
      })
    );
    expect(parsed.success).toBe(true);
  });

  it('fails when name is missing', () => {
    const parsed = campaignInputSchema.safeParse(
      validInput({ name: undefined })
    );
    expect(parsed.success).toBe(false);
  });

  it('fails when name is empty after trim', () => {
    const parsed = campaignInputSchema.safeParse(validInput({ name: '   ' }));
    expect(parsed.success).toBe(false);
  });

  it('fails when subject is missing', () => {
    const parsed = campaignInputSchema.safeParse(
      validInput({ subject: undefined })
    );
    expect(parsed.success).toBe(false);
  });

  it('fails when heading is missing', () => {
    const parsed = campaignInputSchema.safeParse(
      validInput({ heading: undefined })
    );
    expect(parsed.success).toBe(false);
  });

  it('fails when bodyParagraphs is empty', () => {
    const parsed = campaignInputSchema.safeParse(
      validInput({ bodyParagraphs: [] })
    );
    expect(parsed.success).toBe(false);
  });

  it('fails when a paragraph is blank', () => {
    const parsed = campaignInputSchema.safeParse(
      validInput({ bodyParagraphs: ['   '] })
    );
    expect(parsed.success).toBe(false);
  });

  // ── CTA pairing refine ────────────────────────────────────

  it('fails when ctaLabel is set without ctaUrl', () => {
    const parsed = campaignInputSchema.safeParse(
      validInput({ ctaLabel: 'Voir' })
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].path).toContain('ctaUrl');
    }
  });

  it('fails when ctaUrl is set without ctaLabel', () => {
    const parsed = campaignInputSchema.safeParse(
      validInput({ ctaUrl: 'https://example.com' })
    );
    expect(parsed.success).toBe(false);
  });

  it('passes when neither ctaLabel nor ctaUrl is set', () => {
    const parsed = campaignInputSchema.safeParse(validInput());
    expect(parsed.success).toBe(true);
  });

  // ── ctaUrl scheme guard ───────────────────────────────────

  it('rejects a javascript: ctaUrl', () => {
    const parsed = campaignInputSchema.safeParse(
      validInput({ ctaLabel: 'X', ctaUrl: 'javascript:alert(1)' })
    );
    expect(parsed.success).toBe(false);
  });

  it('rejects a non-http(s) ctaUrl (mailto)', () => {
    const parsed = campaignInputSchema.safeParse(
      validInput({ ctaLabel: 'X', ctaUrl: 'mailto:a@b.com' })
    );
    expect(parsed.success).toBe(false);
  });

  it('accepts an http and an https ctaUrl', () => {
    expect(
      campaignInputSchema.safeParse(
        validInput({ ctaLabel: 'X', ctaUrl: 'http://example.com' })
      ).success
    ).toBe(true);
    expect(
      campaignInputSchema.safeParse(
        validInput({ ctaLabel: 'X', ctaUrl: 'https://example.com' })
      ).success
    ).toBe(true);
  });

  // ── audience enum ─────────────────────────────────────────

  it('accepts every allowed audience id', () => {
    for (const audience of [
      'all-confirmed-users',
      'team-captains',
      'team-members',
      'staff',
      'adherents',
    ]) {
      const parsed = campaignInputSchema.safeParse(validInput({ audience }));
      expect(parsed.success, audience).toBe(true);
      if (parsed.success) expect(parsed.data.audience).toBe(audience);
    }
  });

  it('defaults audience to all-confirmed-users when omitted', () => {
    const parsed = campaignInputSchema.safeParse(validInput());
    expect(parsed.success).toBe(true);
    if (parsed.success)
      expect(parsed.data.audience).toBe('all-confirmed-users');
  });

  it('rejects an unknown audience', () => {
    const parsed = campaignInputSchema.safeParse(
      validInput({ audience: 'everyone' })
    );
    expect(parsed.success).toBe(false);
  });
});

/* -----------------------------------------------------------
 * slugifyCampaignName
 * ---------------------------------------------------------*/

describe('slugifyCampaignName', () => {
  it('strips accents and spaces into kebab-case', () => {
    expect(slugifyCampaignName('Été 2026 !')).toBe('ete-2026');
  });

  it('lowercases and collapses non-alphanumerics', () => {
    expect(slugifyCampaignName('Hello   World__Test')).toBe('hello-world-test');
  });

  it('trims leading/trailing separators', () => {
    expect(slugifyCampaignName('  --Bonjour--  ')).toBe('bonjour');
  });

  it('falls back to "campagne" when nothing usable remains', () => {
    expect(slugifyCampaignName('!!!')).toBe('campagne');
    expect(slugifyCampaignName('   ')).toBe('campagne');
  });

  it('caps the slug length and trims a trailing dash', () => {
    const long = 'a'.repeat(80);
    const slug = slugifyCampaignName(long);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });
});

/* -----------------------------------------------------------
 * Mode HTML libre (bodyFormat: 'html')
 * ---------------------------------------------------------*/

describe('buildCampaignEmailHtml — bodyFormat html', () => {
  it('rend le HTML fourni à la place du template structuré', () => {
    const html = buildCampaignEmailHtml(
      baseBody({
        bodyFormat: 'html',
        bodyHtml: '<h2>Mon titre</h2><p>Mon paragraphe.</p>',
        heading: 'Titre ignoré',
        bodyParagraphs: ['Paragraphe ignoré.'],
      }),
      null
    );
    expect(html).toContain('<h2>Mon titre</h2>');
    expect(html).toContain('Mon paragraphe.');
    // Les champs du mode structuré ne sont plus rendus.
    expect(html).not.toContain('Titre ignoré');
    expect(html).not.toContain('Paragraphe ignoré.');
  });

  it('nettoie le HTML avant de le rendre', () => {
    const html = buildCampaignEmailHtml(
      baseBody({
        bodyFormat: 'html',
        bodyHtml: '<p onclick="x()">ok</p><script>alert(1)</script>',
      }),
      null
    );
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('alert(1)');
    expect(html).toContain('ok');
  });

  it('absolutise les chemins relatifs sur le domaine du site', () => {
    const html = buildCampaignEmailHtml(
      baseBody({
        bodyFormat: 'html',
        bodyHtml: '<img src="/img/logos/pogtv.png" alt="POGTV" />',
      }),
      null
    );
    expect(html).toContain('https://owwomenscup.fr/img/logos/pogtv.png');
  });

  it('conserve le greeting, le wrapper de marque et la désinscription', () => {
    const html = buildCampaignEmailHtml(
      baseBody({ bodyFormat: 'html', bodyHtml: '<p>corps</p>' }),
      'Vincent',
      'https://owwomenscup.fr/unsub?token=abc'
    );
    expect(html).toContain('Hey Vincent,');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Se désinscrire des annonces');
    expect(html).toContain('unsub?token=abc');
  });

  it('reste sur le template structuré quand bodyFormat est absent', () => {
    const html = buildCampaignEmailHtml(
      baseBody({ bodyHtml: '<p>ne doit pas apparaître</p>' }),
      null
    );
    expect(html).not.toContain('ne doit pas apparaître');
    expect(html).toContain('Premier paragraphe.');
  });
});

describe('campaignInputSchema — bodyFormat', () => {
  it("vaut 'structured' par défaut", () => {
    const parsed = campaignInputSchema.safeParse(validInput());
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.bodyFormat).toBe('structured');
  });

  it('accepte un corps HTML sans paragraphes', () => {
    const parsed = campaignInputSchema.safeParse({
      ...validInput({ bodyFormat: 'html', bodyHtml: '<p>Coucou</p>' }),
      bodyParagraphs: undefined,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejette un mode html au corps HTML vide', () => {
    const parsed = campaignInputSchema.safeParse(
      validInput({ bodyFormat: 'html', bodyHtml: '   ' })
    );
    expect(parsed.success).toBe(false);
  });

  it('exige toujours un paragraphe en mode structuré', () => {
    const parsed = campaignInputSchema.safeParse({
      ...validInput(),
      bodyParagraphs: [],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejette un bodyFormat inconnu', () => {
    const parsed = campaignInputSchema.safeParse(
      validInput({ bodyFormat: 'markdown' })
    );
    expect(parsed.success).toBe(false);
  });
});
