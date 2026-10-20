// features/player/library/dev/fakeSocialClient.ts — les routes « sécurité de
// base » de la Library (bloquer, signaler, expulser) EN MÉMOIRE, pour la page
// de développement `/dev/library-room` (404 en production).
//
// Il JOUE L'API sur le Realtime en mémoire (`./fakeRealtime.ts`) : un blocage
// confirmé diffuse `hide` dans MA boîte (`library:user:<moi>`), une
// expulsion diffuse `kicked` sur le canal SERVEUR de la salle — exactement ce
// que fait conference-api après l'écriture. Chaque appel est journalisé.
// `failNext(code, status)` fait échouer l'appel suivant, pour voir les états
// d'erreur de l'interface.

import { PlayerHttpError } from '@/utils/player/playerHttp';
import type { LibraryKickInput, LibraryReportInput } from '../socialSchemas';
import { LIBRARY_KICK_DEFAULT_MINUTES } from '../socialSchemas';
import type {
  LibraryBlockResponse,
  LibraryEnterResponse,
  LibraryKickResponse,
  LibraryReportResponse,
} from '../socialResponses';
import { LIBRARY_SERVER_EVENTS } from '../realtimeTopics';
import type { LibrarySocialActionsClient } from '../hooks/useLibrarySocialActions';
import type { FakeRealtime } from './fakeRealtime';

export type FakeSocialCall = {
  at: number;
  route: 'block' | 'unblock' | 'report' | 'kick';
  input: unknown;
  outcome: string;
};

export type FakeSocialClient = LibrarySocialActionsClient & {
  readonly calls: FakeSocialCall[];
  failNext(code: string, status?: number): void;
  /** Prévenu à chaque appel (la page réaffiche son journal). */
  onCall?: () => void;
};

/** Latence simulée : on voit les états « en cours ». */
const LATENCY_MS = 350;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function referenceShort(): string {
  return Math.random().toString(16).slice(2, 10).padEnd(8, '0');
}

export function createFakeSocialClient(args: {
  bus: FakeRealtime;
  enter: Pick<LibraryEnterResponse, 'topics' | 'me'>;
}): FakeSocialClient {
  const { bus, enter } = args;
  let failure: { code: string; status: number } | null = null;

  const client: FakeSocialClient = {
    calls: [],
    failNext(code, status = 400) {
      failure = { code, status };
    },

    async block(userId: string): Promise<LibraryBlockResponse> {
      await gate('block', { userId });
      bus.server(enter.topics.user, LIBRARY_SERVER_EVENTS.hide, {
        userId,
        leaveRoomId: null,
      });
      log('block', { userId }, 'hide sent');
      return { userId, blocked: true };
    },

    async unblock(userId: string): Promise<LibraryBlockResponse> {
      await gate('unblock', { userId });
      bus.server(enter.topics.user, LIBRARY_SERVER_EVENTS.unhide, { userId });
      log('unblock', { userId }, 'unhide sent');
      return { userId, blocked: false };
    },

    async report(input: LibraryReportInput): Promise<LibraryReportResponse> {
      await gate('report', input);
      const ref = referenceShort();
      log('report', input, `ticket ${ref}`);
      return { reported: true, referenceShort: ref };
    },

    async kick(input: LibraryKickInput): Promise<LibraryKickResponse> {
      await gate('kick', input);
      const minutes = input.minutes ?? LIBRARY_KICK_DEFAULT_MINUTES;
      const until = new Date(Date.now() + minutes * 60_000).toISOString();
      bus.server(enter.topics.chat, LIBRARY_SERVER_EVENTS.kicked, {
        userId: input.userId,
        until,
      });
      log('kick', input, `kicked until ${until}`);
      return { kicked: true, userId: input.userId, until };
    },
  };

  function log(
    route: FakeSocialCall['route'],
    input: unknown,
    outcome: string
  ) {
    client.calls.unshift({ at: Date.now(), route, input, outcome });
    client.onCall?.();
  }

  async function gate(route: FakeSocialCall['route'], input: unknown) {
    await wait(LATENCY_MS);
    const self =
      (input as { userId?: string } | null)?.userId === enter.me.userId;
    const refused =
      failure ?? (self ? { code: `cannot_${route}_self`, status: 400 } : null);
    failure = null;
    if (refused) {
      log(route, input, `refused ${refused.status} ${refused.code}`);
      throw new PlayerHttpError('refus (démo)', refused.status, {
        error: 'refus (démo)',
        code: refused.code,
      });
    }
  }

  return client;
}
