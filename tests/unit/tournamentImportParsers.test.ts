import { describe, it, expect } from 'vitest';
import { parseToornamentRef } from '../../utils/tournamentImport/toornament';
import { parseChallongeRef } from '../../utils/tournamentImport/challonge';
import { parseStartGgRef } from '../../utils/tournamentImport/startgg';
import { PlatformImportError } from '../../utils/tournamentImport/types';

describe('parseToornamentRef', () => {
  it('extracts numeric id from a www.toornament.com URL', () => {
    expect(
      parseToornamentRef('https://www.toornament.com/tournaments/12345/info')
    ).toBe('12345');
  });

  it('extracts numeric id from a play.toornament.com URL with locale', () => {
    expect(
      parseToornamentRef(
        'https://play.toornament.com/en_US/tournaments/987654321/structure'
      )
    ).toBe('987654321');
  });

  it('accepts a bare numeric id', () => {
    expect(parseToornamentRef('12345')).toBe('12345');
    expect(parseToornamentRef('  12345  ')).toBe('12345');
  });

  it('rejects empty input', () => {
    expect(() => parseToornamentRef('   ')).toThrow(PlatformImportError);
  });

  it('rejects non-toornament URLs', () => {
    expect(() => parseToornamentRef('https://example.com/foo')).toThrow(
      /URL ou ID Toornament invalide/
    );
  });

  it('rejects toornament URLs without a numeric id', () => {
    expect(() =>
      parseToornamentRef('https://www.toornament.com/tournaments/foo')
    ).toThrow(/invalide/);
  });

  it('rejects free-text non-numeric input', () => {
    expect(() => parseToornamentRef('my-cool-tournament')).toThrow(
      PlatformImportError
    );
  });

  it('throws PlatformImportError with source=toornament and 400 status', () => {
    try {
      parseToornamentRef('not a url');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PlatformImportError);
      expect((err as PlatformImportError).source).toBe('toornament');
      expect((err as PlatformImportError).status).toBe(400);
    }
  });
});

describe('parseChallongeRef', () => {
  it('extracts slug from a plain challonge.com URL', () => {
    expect(parseChallongeRef('https://challonge.com/mon-tournoi')).toBe(
      'mon-tournoi'
    );
  });

  it('strips trailing slash', () => {
    expect(parseChallongeRef('https://challonge.com/mon-tournoi/')).toBe(
      'mon-tournoi'
    );
  });

  it('joins subdomain with slug for community tournaments', () => {
    expect(parseChallongeRef('https://myorg.challonge.com/summer-cup')).toBe(
      'myorg-summer-cup'
    );
  });

  it('treats www subdomain as default (no prefix)', () => {
    expect(parseChallongeRef('https://www.challonge.com/abc123')).toBe(
      'abc123'
    );
  });

  it('returns input as-is for raw slug', () => {
    expect(parseChallongeRef('mon-tournoi')).toBe('mon-tournoi');
  });

  it('returns input as-is for non-URL strings', () => {
    expect(parseChallongeRef('xyz789')).toBe('xyz789');
  });

  it('rejects empty input', () => {
    expect(() => parseChallongeRef('')).toThrow(PlatformImportError);
    expect(() => parseChallongeRef('   ')).toThrow(/Référence Challonge vide/);
  });

  it('handles non-challonge URLs by returning the input unchanged (treated as slug)', () => {
    // The parser falls back to "treat as slug" rather than rejecting random URLs;
    // the API call itself will surface the bad slug as a 404.
    expect(parseChallongeRef('https://example.com/foo')).toBe(
      'https://example.com/foo'
    );
  });
});

describe('parseStartGgRef', () => {
  it('extracts slug from a www.start.gg event URL', () => {
    expect(
      parseStartGgRef(
        'https://www.start.gg/tournament/genesis-9/event/melee-singles'
      )
    ).toBe('tournament/genesis-9/event/melee-singles');
  });

  it('extracts slug from a start.gg URL without www', () => {
    expect(
      parseStartGgRef(
        'https://start.gg/tournament/some-event/event/main-bracket/overview'
      )
    ).toBe('tournament/some-event/event/main-bracket');
  });

  it('accepts a bare slug', () => {
    expect(parseStartGgRef('tournament/genesis-9/event/melee-singles')).toBe(
      'tournament/genesis-9/event/melee-singles'
    );
  });

  it('strips trailing slash and query params from a bare slug', () => {
    expect(parseStartGgRef('tournament/foo/event/bar/?utm=x')).toBe(
      'tournament/foo/event/bar'
    );
  });

  it('rejects empty input', () => {
    expect(() => parseStartGgRef('   ')).toThrow(/start\.gg vide/);
  });

  it('rejects non-start.gg URLs', () => {
    expect(() =>
      parseStartGgRef('https://example.com/tournament/foo/event/bar')
    ).toThrow(PlatformImportError);
  });

  it('rejects partial slugs (tournament without event)', () => {
    expect(() => parseStartGgRef('tournament/foo')).toThrow(
      /URL ou slug start\.gg invalide/
    );
  });

  it('throws PlatformImportError with source=startgg', () => {
    try {
      parseStartGgRef('garbage');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PlatformImportError);
      expect((err as PlatformImportError).source).toBe('startgg');
    }
  });
});

describe('PlatformImportError', () => {
  it('carries source, status, and message', () => {
    const err = new PlatformImportError('challonge', 404, 'Not found');
    expect(err.source).toBe('challonge');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not found');
    expect(err.name).toBe('PlatformImportError');
    expect(err).toBeInstanceOf(Error);
  });
});
