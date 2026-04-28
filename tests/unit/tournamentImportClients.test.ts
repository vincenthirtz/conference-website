import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchToornamentParticipants } from '../../utils/tournamentImport/toornament';
import { fetchChallongeParticipants } from '../../utils/tournamentImport/challonge';
import { fetchStartGgParticipants } from '../../utils/tournamentImport/startgg';
import { PlatformImportError } from '../../utils/tournamentImport/types';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

function textResponse(text: string, ok = false, status = 500) {
  return {
    ok,
    status,
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(text),
  };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* -----------------------------------------------------------
 * Toornament
 * ---------------------------------------------------------*/

describe('fetchToornamentParticipants', () => {
  it('rejects when api key is missing', async () => {
    await expect(fetchToornamentParticipants('12345', '')).rejects.toThrow(
      /Clé API Toornament manquante/
    );
  });

  it('rejects when sourceRef is invalid', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(
      fetchToornamentParticipants('not a tournament', 'key')
    ).rejects.toThrow(PlatformImportError);
  });

  it('returns normalized rows from a single page', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          id: 'p1',
          name: 'Team Alpha',
          country: 'FR',
          lineup: [{ name: 'Alice#1234' }, { name: 'Bob#5678' }],
        },
        {
          id: 'p2',
          name: 'Team Beta',
          country: null,
          lineup: [],
        },
      ])
    );
    vi.stubGlobal('fetch', mockFetch);

    const rows = await fetchToornamentParticipants('12345', 'key-abc');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: 'Team Alpha',
      country: 'FR',
      players: ['Alice#1234', 'Bob#5678'],
      external_ref: { source: 'toornament', id: 'p1' },
    });
    expect(rows[1]).toMatchObject({
      name: 'Team Beta',
      country: null,
      players: [],
    });

    // Verify URL & headers
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/tournaments/12345/participants');
    expect(opts.headers['X-Api-Key']).toBe('key-abc');
    expect(opts.headers['Range']).toMatch(/^participants=0-/);
  });

  it('paginates until the page is short', async () => {
    const fullPage = Array.from({ length: 50 }, (_, i) => ({
      id: `p${i}`,
      name: `Team ${i}`,
      lineup: [],
    }));
    const tail = [{ id: 'p50', name: 'Team 50', lineup: [] }];

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(fullPage))
      .mockResolvedValueOnce(jsonResponse(tail));
    vi.stubGlobal('fetch', mockFetch);

    const rows = await fetchToornamentParticipants('12345', 'k');

    expect(rows).toHaveLength(51);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][1].headers['Range']).toBe(
      'participants=0-49'
    );
    expect(mockFetch.mock.calls[1][1].headers['Range']).toBe(
      'participants=50-99'
    );
  });

  it('stops paginating when an empty page is returned', async () => {
    const fullPage = Array.from({ length: 50 }, (_, i) => ({
      id: `p${i}`,
      name: `Team ${i}`,
      lineup: [],
    }));
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(fullPage))
      .mockResolvedValueOnce(jsonResponse([]));
    vi.stubGlobal('fetch', mockFetch);

    const rows = await fetchToornamentParticipants('12345', 'k');
    expect(rows).toHaveLength(50);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('throws PlatformImportError on non-2xx response with the upstream status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(textResponse('Not Found', false, 404))
    );

    await expect(
      fetchToornamentParticipants('12345', 'k')
    ).rejects.toMatchObject({
      source: 'toornament',
      status: 404,
    });
  });

  it('filters out lineup entries without a name', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          id: 'p1',
          name: 'Team',
          lineup: [{ name: 'A' }, { name: '' }, { name: null }, {}],
        },
      ])
    );
    vi.stubGlobal('fetch', mockFetch);

    const rows = await fetchToornamentParticipants('12345', 'k');
    expect(rows[0].players).toEqual(['A']);
  });
});

/* -----------------------------------------------------------
 * Challonge
 * ---------------------------------------------------------*/

describe('fetchChallongeParticipants', () => {
  it('rejects when api key is missing', async () => {
    await expect(fetchChallongeParticipants('foo', '')).rejects.toThrow(
      /Clé API Challonge manquante/
    );
  });

  it('extracts participant names and ids', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse([
          { participant: { id: 1, name: 'Alpha' } },
          { participant: { id: 2, name: 'Beta' } },
        ])
      );
    vi.stubGlobal('fetch', mockFetch);

    const rows = await fetchChallongeParticipants('mon-tournoi', 'KEY');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: 'Alpha',
      external_ref: { source: 'challonge', id: '1' },
    });
    expect(rows[1].name).toBe('Beta');

    // Auth via query string
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/tournaments/mon-tournoi/participants.json');
    expect(url).toContain('api_key=KEY');
  });

  it('falls back to display_name and challonge_username when name is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse([
          { participant: { id: 1, name: null, display_name: 'Disp' } },
          {
            participant: {
              id: 2,
              name: '',
              display_name: null,
              challonge_username: 'fallback-user',
            },
          },
        ])
      )
    );

    const rows = await fetchChallongeParticipants('foo', 'k');
    expect(rows[0].name).toBe('Disp');
    expect(rows[1].name).toBe('fallback-user');
  });

  it('drops participants with no usable name', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse([
            { participant: { id: 1, name: null, display_name: null } },
            { participant: { id: 2, name: 'OK' } },
          ])
        )
    );

    const rows = await fetchChallongeParticipants('foo', 'k');
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('OK');
  });

  it('throws PlatformImportError on non-2xx with upstream status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(textResponse('Unauthorized', false, 401))
    );

    await expect(fetchChallongeParticipants('foo', 'k')).rejects.toMatchObject({
      source: 'challonge',
      status: 401,
    });
  });

  it('throws when response is not an array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ unexpected: 'object' }))
    );

    await expect(fetchChallongeParticipants('foo', 'k')).rejects.toMatchObject({
      source: 'challonge',
      status: 502,
    });
  });
});

/* -----------------------------------------------------------
 * start.gg
 * ---------------------------------------------------------*/

describe('fetchStartGgParticipants', () => {
  const slug = 'tournament/genesis-9/event/melee-singles';

  it('rejects when api key is missing', async () => {
    await expect(fetchStartGgParticipants(slug, '')).rejects.toThrow(
      /Clé API start\.gg manquante/
    );
  });

  it('returns rows from a single page event', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          event: {
            id: 1,
            name: 'Melee',
            entrants: {
              pageInfo: { totalPages: 1 },
              nodes: [
                {
                  id: 10,
                  name: 'Player A',
                  participants: [{ gamerTag: 'A' }],
                },
                {
                  id: 11,
                  name: 'Player B',
                  participants: [{ gamerTag: 'B' }, { gamerTag: 'C' }],
                },
              ],
            },
          },
        },
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    const rows = await fetchStartGgParticipants(slug, 'token');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: 'Player A',
      players: ['A'],
      external_ref: { source: 'startgg', id: '10' },
    });
    expect(rows[1].players).toEqual(['B', 'C']);

    // Bearer auth + GraphQL POST
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.start.gg/gql/alpha');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer token');
    const body = JSON.parse(opts.body);
    expect(body.variables.slug).toBe(slug);
    expect(body.variables.page).toBe(1);
  });

  it('paginates across multiple pages', async () => {
    const page1 = {
      data: {
        event: {
          id: 1,
          name: 'X',
          entrants: {
            pageInfo: { totalPages: 2 },
            nodes: [{ id: 1, name: 'A', participants: [] }],
          },
        },
      },
    };
    const page2 = {
      data: {
        event: {
          id: 1,
          name: 'X',
          entrants: {
            pageInfo: { totalPages: 2 },
            nodes: [{ id: 2, name: 'B', participants: [] }],
          },
        },
      },
    };
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(page1))
      .mockResolvedValueOnce(jsonResponse(page2));
    vi.stubGlobal('fetch', mockFetch);

    const rows = await fetchStartGgParticipants(slug, 'k');

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.name)).toEqual(['A', 'B']);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(mockFetch.mock.calls[1][1].body).variables.page).toBe(2);
  });

  it('throws when GraphQL returns errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ errors: [{ message: 'Invalid token' }] })
        )
    );

    await expect(fetchStartGgParticipants(slug, 'k')).rejects.toMatchObject({
      source: 'startgg',
      status: 502,
    });
  });

  it('throws 404 when event is null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ data: { event: null } }))
    );

    await expect(fetchStartGgParticipants(slug, 'k')).rejects.toMatchObject({
      source: 'startgg',
      status: 404,
    });
  });

  it('throws on HTTP non-2xx with upstream status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(textResponse('rate limit', false, 429))
    );

    await expect(fetchStartGgParticipants(slug, 'k')).rejects.toMatchObject({
      source: 'startgg',
      status: 429,
    });
  });

  it('filters participants without a gamerTag', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: {
            event: {
              id: 1,
              name: 'X',
              entrants: {
                pageInfo: { totalPages: 1 },
                nodes: [
                  {
                    id: 1,
                    name: 'Team',
                    participants: [
                      { gamerTag: 'A' },
                      { gamerTag: null },
                      { gamerTag: '' },
                    ],
                  },
                ],
              },
            },
          },
        })
      )
    );

    const rows = await fetchStartGgParticipants(slug, 'k');
    expect(rows[0].players).toEqual(['A']);
  });
});
