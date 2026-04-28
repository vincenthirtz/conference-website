// utils/tournamentImport/toornament.ts
// Toornament Viewer API v2 — fetch participants of a public tournament.
// Docs: https://developer.toornament.com/v2/doc/viewer

import type { TeamImportRow } from '../teamImport';
import { PlatformImportError } from './types';

const API_BASE = 'https://api.toornament.com/viewer/v2';
const PAGE_SIZE = 50;

type ToornamentParticipant = {
  id: string;
  name: string;
  type?: 'team' | 'player';
  country?: string | null;
  lineup?: { name: string }[];
  custom_user_identifier?: string | null;
};

/**
 * Extracts the tournament ID from a URL or returns the input if it's already an ID.
 * Toornament URLs look like:
 *   https://www.toornament.com/tournaments/<id>/...
 *   https://play.toornament.com/en_US/tournaments/<id>/...
 */
export function parseToornamentRef(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new PlatformImportError(
      'toornament',
      400,
      'Référence Toornament vide.'
    );
  }
  const match = trimmed.match(/toornament\.com\/[^\s]*?tournaments\/(\d+)/i);
  if (match) return match[1];
  if (/^\d+$/.test(trimmed)) return trimmed;
  throw new PlatformImportError(
    'toornament',
    400,
    'URL ou ID Toornament invalide. Attendu : URL toornament.com ou ID numérique.'
  );
}

export async function fetchToornamentParticipants(
  sourceRef: string,
  apiKey: string
): Promise<TeamImportRow[]> {
  if (!apiKey) {
    throw new PlatformImportError(
      'toornament',
      400,
      'Clé API Toornament manquante (toornament_api_key).'
    );
  }

  const tournamentId = parseToornamentRef(sourceRef);
  const rows: TeamImportRow[] = [];
  let offset = 0;

  while (true) {
    const rangeEnd = offset + PAGE_SIZE - 1;
    const res = await fetch(
      `${API_BASE}/tournaments/${encodeURIComponent(tournamentId)}/participants`,
      {
        headers: {
          'X-Api-Key': apiKey,
          Range: `participants=${offset}-${rangeEnd}`,
          Accept: 'application/json',
        },
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new PlatformImportError(
        'toornament',
        res.status,
        `Toornament error ${res.status}: ${text.slice(0, 300)}`
      );
    }

    const items = (await res.json().catch(() => [])) as ToornamentParticipant[];
    if (!Array.isArray(items) || items.length === 0) break;

    for (const p of items) {
      const players = (p.lineup ?? [])
        .map((m) => m?.name)
        .filter((n): n is string => typeof n === 'string' && n.length > 0);
      rows.push({
        name: p.name,
        country: p.country ?? null,
        players,
        external_ref: { source: 'toornament', id: String(p.id) },
      });
    }

    if (items.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;

    if (rows.length > 1000) {
      throw new PlatformImportError(
        'toornament',
        400,
        'Trop de participants (> 1000). Import abandonné.'
      );
    }
  }

  return rows;
}
