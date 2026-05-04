// Minimal, dependency-free markdown subset used on team public pages.
//
// Why a custom parser:
//   - Project policy is zero-dependency
//   - Input is small (capped at 5000 chars), authored by team members and
//     audited by staff — we only need a subset (headings, paragraphs, lists,
//     bold, italic, links, code spans, horizontal rule)
//   - Output is React nodes, never HTML strings, so XSS via raw HTML is
//     structurally impossible (React escapes text content). We still validate
//     URLs to avoid `javascript:` payloads on links.
//
// Supported syntax:
//   ## / ### headings (single-line, must be at start of line)
//   - / *  unordered list items
//   ---    horizontal rule (line of 3+ dashes)
//   blank line  separates paragraphs
//   **bold**   *italic*   `code`   [text](url)   bare http(s) URL
//
// Anything else is rendered as plain text.

import type { ReactNode } from 'react';
import React from 'react';

export const TEAM_PUBLIC_CONTENT_MAX_LENGTH = 5000;

type Block =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'hr' };

function parseBlocks(input: string): Block[] {
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraphBuf: string[] = [];
  let listBuf: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuf.length > 0) {
      blocks.push({ kind: 'paragraph', text: paragraphBuf.join(' ').trim() });
      paragraphBuf = [];
    }
  };
  const flushList = () => {
    if (listBuf.length > 0) {
      blocks.push({ kind: 'list', items: listBuf.slice() });
      listBuf = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }

    if (/^-{3,}\s*$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'hr' });
      continue;
    }

    const headingMatch = /^(#{2,3})\s+(.+)$/.exec(line);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({
        kind: 'heading',
        level: headingMatch[1].length === 2 ? 2 : 3,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    const listMatch = /^[-*]\s+(.+)$/.exec(line.trim());
    if (listMatch) {
      flushParagraph();
      listBuf.push(listMatch[1].trim());
      continue;
    }

    flushList();
    paragraphBuf.push(line.trim());
  }

  flushParagraph();
  flushList();
  return blocks;
}

function safeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}

// Inline parser: produces an array of React nodes from a single line of text.
// Supports: **bold**, *italic*, `code`, [text](url), bare http(s) URLs.
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let i = 0;
  let buf = '';
  let nodeIndex = 0;
  const pushBuf = () => {
    if (buf) {
      nodes.push(buf);
      buf = '';
    }
  };
  const pushNode = (node: ReactNode) => {
    pushBuf();
    nodes.push(
      React.createElement(
        React.Fragment,
        { key: `${keyPrefix}-${nodeIndex++}` },
        node
      )
    );
  };

  while (i < text.length) {
    const rest = text.slice(i);

    // Code span: `code`
    const codeMatch = /^`([^`\n]+)`/.exec(rest);
    if (codeMatch) {
      pushNode(
        React.createElement(
          'code',
          {
            key: `${keyPrefix}-code-${nodeIndex}`,
            className: 'px-1 py-0.5 rounded bg-white/10 text-xs font-mono',
          },
          codeMatch[1]
        )
      );
      i += codeMatch[0].length;
      continue;
    }

    // Bold: **text**
    const boldMatch = /^\*\*([^*\n]+)\*\*/.exec(rest);
    if (boldMatch) {
      pushNode(
        React.createElement(
          'strong',
          { key: `${keyPrefix}-b-${nodeIndex}`, className: 'font-semibold' },
          renderInline(boldMatch[1], `${keyPrefix}-b${nodeIndex}`)
        )
      );
      i += boldMatch[0].length;
      continue;
    }

    // Italic: *text*  (single asterisk, no inner asterisk)
    const italicMatch = /^\*([^*\n]+)\*/.exec(rest);
    if (italicMatch) {
      pushNode(
        React.createElement(
          'em',
          { key: `${keyPrefix}-i-${nodeIndex}`, className: 'italic' },
          renderInline(italicMatch[1], `${keyPrefix}-i${nodeIndex}`)
        )
      );
      i += italicMatch[0].length;
      continue;
    }

    // Link: [text](url)
    const linkMatch = /^\[([^\]\n]+)\]\(([^()\s]+)\)/.exec(rest);
    if (linkMatch) {
      const href = safeUrl(linkMatch[2]);
      if (href) {
        pushNode(
          React.createElement(
            'a',
            {
              key: `${keyPrefix}-l-${nodeIndex}`,
              href,
              target: '_blank',
              rel: 'noreferrer noopener',
              className: 'text-cyan-300 underline hover:text-cyan-200',
            },
            renderInline(linkMatch[1], `${keyPrefix}-l${nodeIndex}`)
          )
        );
        i += linkMatch[0].length;
        continue;
      }
      // Invalid URL → render as plain text
      buf += linkMatch[0];
      i += linkMatch[0].length;
      continue;
    }

    // Bare http(s) autolink
    const autolinkMatch = /^https?:\/\/[^\s<>]+/.exec(rest);
    if (autolinkMatch) {
      const href = safeUrl(autolinkMatch[0]);
      if (href) {
        pushNode(
          React.createElement(
            'a',
            {
              key: `${keyPrefix}-al-${nodeIndex}`,
              href,
              target: '_blank',
              rel: 'noreferrer noopener',
              className: 'text-cyan-300 underline hover:text-cyan-200 break-all',
            },
            autolinkMatch[0]
          )
        );
        i += autolinkMatch[0].length;
        continue;
      }
    }

    buf += text[i];
    i += 1;
  }
  pushBuf();
  return nodes;
}

/**
 * Render team public-page markdown as React nodes.
 *
 * Returns null when the input is empty / whitespace only.
 */
export function renderTeamPublicMarkdown(
  input: string | null | undefined
): ReactNode | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Defensive cap: even if a stale row exceeds the limit, never render more
  // than 2x the cap to avoid pathological inputs slowing the page.
  const truncated = trimmed.slice(0, TEAM_PUBLIC_CONTENT_MAX_LENGTH * 2);

  const blocks = parseBlocks(truncated);
  return blocks.map((block, idx) => {
    const key = `b-${idx}`;
    if (block.kind === 'hr') {
      return React.createElement('hr', {
        key,
        className: 'my-4 border-white/10',
      });
    }
    if (block.kind === 'heading') {
      const Tag = block.level === 2 ? 'h2' : 'h3';
      const className =
        block.level === 2
          ? 'text-xl font-semibold text-white mt-5 mb-2'
          : 'text-lg font-semibold text-white mt-4 mb-2';
      return React.createElement(
        Tag,
        { key, className },
        renderInline(block.text, key)
      );
    }
    if (block.kind === 'list') {
      return React.createElement(
        'ul',
        {
          key,
          className: 'list-disc list-inside space-y-1 my-3 text-gray-300',
        },
        block.items.map((item, i) =>
          React.createElement(
            'li',
            { key: `${key}-${i}` },
            renderInline(item, `${key}-${i}`)
          )
        )
      );
    }
    return React.createElement(
      'p',
      { key, className: 'text-gray-300 leading-relaxed my-3' },
      renderInline(block.text, key)
    );
  });
}

/**
 * Validate an accent color string. Accepts `#rgb` or `#rrggbb` hex.
 * Returns the normalized lowercase value or null when invalid.
 */
export function normalizeAccentColor(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(value)) {
    return value;
  }
  return null;
}

export const BANNER_OVERLAY_VALUES = [
  'gradient',
  'dark',
  'none',
  'grid',
  'dots',
] as const;
export type BannerOverlay = (typeof BANNER_OVERLAY_VALUES)[number];

/**
 * Validate a banner overlay style. Returns the normalized value or null when
 * invalid / empty.
 */
export function normalizeBannerOverlay(
  raw: string | null | undefined
): BannerOverlay | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  return (BANNER_OVERLAY_VALUES as readonly string[]).includes(value)
    ? (value as BannerOverlay)
    : null;
}

export const ACHIEVEMENT_TITLE_MAX = 120;
export const ACHIEVEMENT_TOURNAMENT_MAX = 120;
export const ACHIEVEMENTS_MAX = 12;

export const SPONSOR_NAME_MAX = 80;
export const SPONSORS_MAX = 8;

export const PINNED_ANNOUNCEMENT_MAX = 200;

export type Achievement = {
  title: string;
  date: string | null; // YYYY-MM-DD
  tournament: string | null;
};

export type Sponsor = {
  name: string;
  logo_url: string | null;
  url: string | null;
};

export const EMBED_PROVIDERS = ['youtube', 'twitch'] as const;
export type EmbedProvider = (typeof EMBED_PROVIDERS)[number];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate an achievement entry. Returns the normalized object or a string
 * error message describing the first invalid field.
 */
export function normalizeAchievement(
  raw: unknown
): { ok: true; value: Achievement } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Achievement: format invalide.' };
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.title !== 'string') {
    return { ok: false, error: 'Achievement: titre requis.' };
  }
  const title = r.title.trim();
  if (!title) return { ok: false, error: 'Achievement: titre requis.' };
  if (title.length > ACHIEVEMENT_TITLE_MAX) {
    return {
      ok: false,
      error: `Achievement: titre trop long (max ${ACHIEVEMENT_TITLE_MAX}).`,
    };
  }

  let date: string | null = null;
  if (r.date !== null && r.date !== undefined && r.date !== '') {
    if (typeof r.date !== 'string' || !ISO_DATE_RE.test(r.date.trim())) {
      return { ok: false, error: 'Achievement: date au format YYYY-MM-DD.' };
    }
    date = r.date.trim();
  }

  let tournament: string | null = null;
  if (
    r.tournament !== null &&
    r.tournament !== undefined &&
    r.tournament !== ''
  ) {
    if (typeof r.tournament !== 'string') {
      return { ok: false, error: 'Achievement: tournoi invalide.' };
    }
    const trimmed = r.tournament.trim();
    if (trimmed.length > ACHIEVEMENT_TOURNAMENT_MAX) {
      return {
        ok: false,
        error: `Achievement: tournoi trop long (max ${ACHIEVEMENT_TOURNAMENT_MAX}).`,
      };
    }
    tournament = trimmed || null;
  }

  return { ok: true, value: { title, date, tournament } };
}

/**
 * Validate a sponsor entry. URL fields use http(s) only.
 */
export function normalizeSponsor(
  raw: unknown
): { ok: true; value: Sponsor } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Sponsor: format invalide.' };
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.name !== 'string') {
    return { ok: false, error: 'Sponsor: nom requis.' };
  }
  const name = r.name.trim();
  if (!name) return { ok: false, error: 'Sponsor: nom requis.' };
  if (name.length > SPONSOR_NAME_MAX) {
    return {
      ok: false,
      error: `Sponsor: nom trop long (max ${SPONSOR_NAME_MAX}).`,
    };
  }

  const checkUrl = (raw: unknown): string | null | 'invalid' => {
    if (raw === null || raw === undefined || raw === '') return null;
    if (typeof raw !== 'string') return 'invalid';
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      const u = new URL(trimmed);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'invalid';
      if (trimmed.length > 300) return 'invalid';
      return trimmed;
    } catch {
      return 'invalid';
    }
  };

  const logo = checkUrl(r.logo_url);
  if (logo === 'invalid') {
    return { ok: false, error: 'Sponsor: logo_url doit être une URL http(s).' };
  }
  const url = checkUrl(r.url);
  if (url === 'invalid') {
    return { ok: false, error: 'Sponsor: url doit être une URL http(s).' };
  }

  return { ok: true, value: { name, logo_url: logo, url } };
}

/**
 * Parse a YouTube/Twitch URL into a `{ provider, id }` pair. Returns null if
 * the URL doesn't match either platform.
 */
export function parseEmbedUrl(
  raw: string | null | undefined
): { provider: EmbedProvider; id: string } | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(
      trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
    );
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  // YouTube: watch?v=ID, /embed/ID, /shorts/ID  ;  youtu.be: /ID
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = url.searchParams.get('v');
    if (v && /^[\w-]{6,32}$/.test(v)) {
      return { provider: 'youtube', id: v };
    }
    const m = url.pathname.match(/^\/(?:embed|shorts)\/([\w-]{6,32})/);
    if (m) return { provider: 'youtube', id: m[1] };
    return null;
  }
  if (host === 'youtu.be') {
    const m = url.pathname.match(/^\/([\w-]{6,32})/);
    if (m) return { provider: 'youtube', id: m[1] };
    return null;
  }

  // Twitch: twitch.tv/CHANNEL  (channel name 4..25 alphanum/underscore)
  if (host === 'twitch.tv') {
    const m = url.pathname.match(/^\/([a-zA-Z0-9_]{3,25})\/?$/);
    if (m) return { provider: 'twitch', id: m[1].toLowerCase() };
    return null;
  }

  return null;
}

/**
 * Validate a pinned announcement string.
 */
export function normalizePinnedAnnouncement(
  raw: unknown
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === '') {
    return { ok: true, value: null };
  }
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Annonce invalide.' };
  }
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > PINNED_ANNOUNCEMENT_MAX) {
    return {
      ok: false,
      error: `Annonce trop longue (max ${PINNED_ANNOUNCEMENT_MAX}).`,
    };
  }
  return { ok: true, value: trimmed };
}

/**
 * Validate an optional ISO timestamp (used for pinned_announcement_until).
 * Accepts ISO-8601 strings parsable by Date; returns the canonical ISO form
 * or null.
 */
export function normalizeTimestamp(
  raw: unknown
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === '') {
    return { ok: true, value: null };
  }
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Date invalide.' };
  }
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: 'Date invalide.' };
  }
  return { ok: true, value: parsed.toISOString() };
}

export const BANNER_FOCAL_VALUES = [
  'center',
  'top',
  'bottom',
  'left',
  'right',
] as const;
export type BannerFocal = (typeof BANNER_FOCAL_VALUES)[number];

/**
 * Validate a banner focal point. Maps to a CSS object-position keyword.
 */
export function normalizeBannerFocal(
  raw: string | null | undefined
): BannerFocal | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  return (BANNER_FOCAL_VALUES as readonly string[]).includes(value)
    ? (value as BannerFocal)
    : null;
}
