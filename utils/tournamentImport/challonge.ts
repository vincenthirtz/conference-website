// utils/tournamentImport/challonge.ts
// Challonge v1 REST API — fetch participants of a tournament.
// Docs: https://api.challonge.com/v1

import type { TeamImportRow } from '../teamImport';
import { PlatformImportError } from './types';

const API_BASE = 'https://api.challonge.com/v1';

type ChallongeParticipantWrap = {
  participant: {
    id: number;
    name: string | null;
    display_name?: string | null;
    challonge_username?: string | null;
    group_player_ids?: number[];
    seed?: number;
    misc?: string | null;
  };
};

/**
 * Extracts the tournament identifier from a URL or returns input as-is.
 * Challonge URLs look like:
 *   https://challonge.com/<slug>
 *   https://<subdomain>.challonge.com/<slug>
 *   https://challonge.com/tournament/<id>
 */
export function parseChallongeRef(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new PlatformImportError(
      'challonge',
      400,
      'Référence Challonge vide.'
    );
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname.endsWith('challonge.com')) {
      const subdomain = url.hostname.replace('.challonge.com', '');
      const path = url.pathname.replace(/^\/+|\/+$/g, '');
      if (subdomain && subdomain !== 'challonge' && subdomain !== 'www') {
        return `${subdomain}-${path}`;
      }
      return path;
    }
  } catch {
    // not a URL, treat as id/slug
  }

  return trimmed;
}

export async function fetchChallongeParticipants(
  sourceRef: string,
  apiKey: string
): Promise<TeamImportRow[]> {
  if (!apiKey) {
    throw new PlatformImportError(
      'challonge',
      400,
      'Clé API Challonge manquante (challonge_api_key).'
    );
  }

  const tournament = parseChallongeRef(sourceRef);
  const params = new URLSearchParams({ api_key: apiKey });
  const url = `${API_BASE}/tournaments/${encodeURIComponent(tournament)}/participants.json?${params}`;

  const res = await fetch(url, { headers: { Accept: 'application/json' } });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new PlatformImportError(
      'challonge',
      res.status,
      `Challonge error ${res.status}: ${text.slice(0, 300)}`
    );
  }

  const items = (await res
    .json()
    .catch(() => [])) as ChallongeParticipantWrap[];
  if (!Array.isArray(items)) {
    throw new PlatformImportError(
      'challonge',
      502,
      'Réponse Challonge inattendue.'
    );
  }

  return items
    .map((wrap) => wrap.participant)
    .filter((p) => p && (p.name || p.display_name || p.challonge_username))
    .map((p) => ({
      name: (p.name || p.display_name || p.challonge_username || '').trim(),
      external_ref: { source: 'challonge', id: String(p.id) },
    }));
}
