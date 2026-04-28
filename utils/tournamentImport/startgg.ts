// utils/tournamentImport/startgg.ts
// start.gg GraphQL API — fetch entrants of an event.
// Docs: https://developer.start.gg/docs/intro

import type { TeamImportRow } from '../teamImport';
import { PlatformImportError } from './types';

const API_URL = 'https://api.start.gg/gql/alpha';
const PAGE_SIZE = 100;

const QUERY = `
  query EventEntrants($slug: String!, $page: Int!, $perPage: Int!) {
    event(slug: $slug) {
      id
      name
      entrants(query: { page: $page, perPage: $perPage }) {
        pageInfo { totalPages }
        nodes {
          id
          name
          participants {
            gamerTag
            user { genderPronoun }
          }
        }
      }
    }
  }
`;

type StartGgEntrant = {
  id: number;
  name: string;
  participants: { gamerTag: string | null }[];
};

type StartGgResponse = {
  data?: {
    event: {
      id: number;
      name: string;
      entrants: {
        pageInfo: { totalPages: number };
        nodes: StartGgEntrant[];
      } | null;
    } | null;
  };
  errors?: { message: string }[];
};

/**
 * Extracts the event slug from a URL or returns input as-is.
 * start.gg event URLs look like:
 *   https://www.start.gg/tournament/<tslug>/event/<eslug>
 *   https://start.gg/tournament/<tslug>/event/<eslug>/...
 */
export function parseStartGgRef(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new PlatformImportError('startgg', 400, 'Référence start.gg vide.');
  }

  const match = trimmed.match(
    /start\.gg\/(tournament\/[^/?#]+\/event\/[^/?#]+)/i
  );
  if (match) return match[1];

  if (trimmed.startsWith('tournament/') && trimmed.includes('/event/')) {
    return trimmed.replace(/[?#].*$/, '').replace(/\/$/, '');
  }

  throw new PlatformImportError(
    'startgg',
    400,
    "URL ou slug start.gg invalide. Attendu : URL d'event ou slug tournament/.../event/..."
  );
}

export async function fetchStartGgParticipants(
  sourceRef: string,
  apiKey: string
): Promise<TeamImportRow[]> {
  if (!apiKey) {
    throw new PlatformImportError(
      'startgg',
      400,
      'Clé API start.gg manquante (startgg_api_key).'
    );
  }

  const slug = parseStartGgRef(sourceRef);
  const rows: TeamImportRow[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: QUERY,
        variables: { slug, page, perPage: PAGE_SIZE },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new PlatformImportError(
        'startgg',
        res.status,
        `start.gg error ${res.status}: ${text.slice(0, 300)}`
      );
    }

    const json = (await res.json().catch(() => ({}))) as StartGgResponse;

    if (json.errors?.length) {
      throw new PlatformImportError(
        'startgg',
        502,
        `start.gg GraphQL error: ${json.errors
          .map((e) => e.message)
          .join('; ')
          .slice(0, 300)}`
      );
    }

    const event = json.data?.event;
    if (!event) {
      throw new PlatformImportError(
        'startgg',
        404,
        `Event start.gg introuvable: ${slug}`
      );
    }

    const entrants = event.entrants;
    if (!entrants) break;

    totalPages = entrants.pageInfo?.totalPages ?? 1;

    for (const e of entrants.nodes ?? []) {
      const players = (e.participants ?? [])
        .map((p) => p.gamerTag)
        .filter((g): g is string => typeof g === 'string' && g.length > 0);
      rows.push({
        name: e.name,
        players,
        external_ref: { source: 'startgg', id: String(e.id) },
      });
    }

    page += 1;

    if (rows.length > 1000) {
      throw new PlatformImportError(
        'startgg',
        400,
        'Trop de participants (> 1000). Import abandonné.'
      );
    }
  } while (page <= totalPages);

  return rows;
}
