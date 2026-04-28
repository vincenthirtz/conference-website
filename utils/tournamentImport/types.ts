// utils/tournamentImport/types.ts
// Types partagés entre les clients de plateformes.

import type { TeamImportRow } from '../teamImport';

export type PlatformSource = 'toornament' | 'challonge' | 'startgg';

export class PlatformImportError extends Error {
  status: number;
  source: PlatformSource;

  constructor(source: PlatformSource, status: number, message: string) {
    super(message);
    this.name = 'PlatformImportError';
    this.status = status;
    this.source = source;
  }
}

export type FetchParticipants = (
  sourceRef: string,
  apiKey: string
) => Promise<TeamImportRow[]>;
