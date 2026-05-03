// Unit tests for utils/markdown/teamPublicMarkdown.
// Covers:
//   - normalizeAccentColor
//   - renderTeamPublicMarkdown : block parsing, inline parsing, sanitization
//
// We render the React tree via react-dom/server.renderToStaticMarkup so we can
// assert on the produced HTML without needing a DOM testing lib (the project
// is zero-dependency).

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  TEAM_PUBLIC_CONTENT_MAX_LENGTH,
  normalizeAccentColor,
  renderTeamPublicMarkdown,
} from '../../utils/markdown/teamPublicMarkdown';

function html(input: string | null | undefined): string {
  const node = renderTeamPublicMarkdown(input);
  if (node === null) return '';
  return renderToStaticMarkup(
    React.createElement(React.Fragment, null, node)
  );
}

/* -----------------------------------------------------------
 * normalizeAccentColor
 * ---------------------------------------------------------*/

describe('normalizeAccentColor', () => {
  it('accepts #rrggbb', () => {
    expect(normalizeAccentColor('#7C3AED')).toBe('#7c3aed');
  });

  it('accepts shorthand #rgb', () => {
    expect(normalizeAccentColor('#abc')).toBe('#abc');
  });

  it('lowercases and trims', () => {
    expect(normalizeAccentColor('  #FFFFFF  ')).toBe('#ffffff');
  });

  it('rejects missing hash', () => {
    expect(normalizeAccentColor('7c3aed')).toBeNull();
  });

  it('rejects invalid hex', () => {
    expect(normalizeAccentColor('#xyz')).toBeNull();
    expect(normalizeAccentColor('#12345')).toBeNull();
    expect(normalizeAccentColor('#1234567')).toBeNull();
  });

  it('rejects empty / null / undefined', () => {
    expect(normalizeAccentColor('')).toBeNull();
    expect(normalizeAccentColor('   ')).toBeNull();
    expect(normalizeAccentColor(null)).toBeNull();
    expect(normalizeAccentColor(undefined)).toBeNull();
  });
});

/* -----------------------------------------------------------
 * renderTeamPublicMarkdown — empty inputs
 * ---------------------------------------------------------*/

describe('renderTeamPublicMarkdown — empty inputs', () => {
  it('returns null for null / undefined / empty / whitespace', () => {
    expect(renderTeamPublicMarkdown(null)).toBeNull();
    expect(renderTeamPublicMarkdown(undefined)).toBeNull();
    expect(renderTeamPublicMarkdown('')).toBeNull();
    expect(renderTeamPublicMarkdown('   \n\n  ')).toBeNull();
  });
});

/* -----------------------------------------------------------
 * Block-level rendering
 * ---------------------------------------------------------*/

describe('renderTeamPublicMarkdown — block syntax', () => {
  it('renders ## as <h2> and ### as <h3>', () => {
    const out = html('## Title 2\n\n### Title 3');
    expect(out).toContain('<h2');
    expect(out).toContain('Title 2</h2>');
    expect(out).toContain('<h3');
    expect(out).toContain('Title 3</h3>');
  });

  it('does not render single-# as a heading', () => {
    const out = html('# Looks like h1');
    // No <h1>, falls back to a paragraph
    expect(out).not.toMatch(/<h1[\s>]/);
    expect(out).toContain('# Looks like h1');
  });

  it('renders unordered lists with - or *', () => {
    const out = html('- one\n- two\n* three');
    expect(out).toContain('<ul');
    const liCount = (out.match(/<li/g) ?? []).length;
    expect(liCount).toBe(3);
  });

  it('renders horizontal rule from ---', () => {
    const out = html('intro\n\n---\n\noutro');
    expect(out).toMatch(/<hr/);
  });

  it('separates paragraphs by blank lines', () => {
    const out = html('first\n\nsecond');
    const pCount = (out.match(/<p/g) ?? []).length;
    expect(pCount).toBe(2);
  });
});

/* -----------------------------------------------------------
 * Inline rendering
 * ---------------------------------------------------------*/

describe('renderTeamPublicMarkdown — inline syntax', () => {
  it('renders **bold**', () => {
    const out = html('hello **world**');
    expect(out).toMatch(/<strong[^>]*>world<\/strong>/);
  });

  it('renders *italic*', () => {
    const out = html('hello *world*');
    expect(out).toMatch(/<em[^>]*>world<\/em>/);
  });

  it('renders `code`', () => {
    const out = html('use `foo`');
    expect(out).toMatch(/<code[^>]*>foo<\/code>/);
  });

  it('renders [text](https://...) as a safe link', () => {
    const out = html('see [docs](https://example.com/docs)');
    expect(out).toMatch(
      /<a [^>]*href="https:\/\/example.com\/docs"[^>]*>docs<\/a>/
    );
    expect(out).toContain('rel="noreferrer noopener"');
    expect(out).toContain('target="_blank"');
  });

  it('autolinks bare http(s) URLs', () => {
    const out = html('visit https://example.com');
    expect(out).toMatch(/<a [^>]*href="https:\/\/example.com[^"]*"/);
  });
});

/* -----------------------------------------------------------
 * Sanitization
 * ---------------------------------------------------------*/

describe('renderTeamPublicMarkdown — sanitization', () => {
  it('escapes raw <script> tags as text', () => {
    const out = html('<script>alert(1)</script>');
    // React always escapes text content — never produces a real script tag
    expect(out).not.toMatch(/<script[\s>]/i);
    expect(out).toContain('&lt;script&gt;');
  });

  it('rejects javascript: links and renders the markdown as plain text', () => {
    const out = html('[click](javascript:alert(1))');
    expect(out).not.toMatch(/href="javascript/i);
    // Original markdown text is shown verbatim (escaped)
    expect(out).toContain('[click](javascript:alert(1))');
  });

  it('rejects data: URLs in links', () => {
    const out = html('[x](data:text/html,hello)');
    expect(out).not.toMatch(/href="data:/i);
  });

  it('rejects autolink with non-http(s) protocol', () => {
    const out = html('ftp://example.com');
    expect(out).not.toMatch(/<a /);
  });

  it('escapes inline HTML inside paragraphs', () => {
    const out = html('hello <img src=x onerror=alert(1)>');
    expect(out).not.toMatch(/<img[\s>]/);
    expect(out).toContain('&lt;img');
  });

  it('respects a defensive cap of 2x the public limit', () => {
    const long = 'a'.repeat(TEAM_PUBLIC_CONTENT_MAX_LENGTH * 5);
    const out = html(long);
    // The rendered output should be bounded; the visible "a"s are at most 2x
    // the limit (plus minimal HTML markup overhead).
    const visible = out.replace(/<[^>]+>/g, '');
    expect(visible.length).toBeLessThanOrEqual(
      TEAM_PUBLIC_CONTENT_MAX_LENGTH * 2 + 10
    );
  });
});
