// features/player/library/dev/DevRoomHarness.tsx — une salle MULTIJOUEUSE
// simulée pour la page de développement `/dev/library-room` (404 en
// production). L'écran RÉEL d'une salle (`ui/room/RoomStage` : moteur,
// pseudos, bulles, menu d'un avatar, signalement, signes, mode discret,
// « Présentes dans la salle ») branché sur :
//   - le Realtime EN MÉMOIRE (`./fakeRealtime.ts`) ;
//   - une entrée simulée (`POST enter`, ou son refus au choix) ;
//   - les gestes EN MÉMOIRE (`./fakeSocialClient.ts`), qui rejouent les
//     diffusions de l'API sur le bus.
// Aucun réseau. Des joueuses simulées marchent et font des signes
// (`./simulatedPeers.ts` : 3, ou 29 pour mesurer à 30 avatars). Le panneau de
// dev joue l'API (expulsion, bannissement, blocage) — dont un `kicked` FORGÉ
// sur le canal de la salle, que le client doit ignorer.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  type CSSProperties,
  type ReactNode,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { PlayerHttpError } from '@/utils/player/playerHttp';
import type { LibraryApartmentItem } from '../responses';
import { LibrarySocialProvider } from '../socialContext';
import type { LibraryRoomKind } from '../socialResponses';
import RoomStage from '../ui/room/RoomStage';
import {
  createFakeRealtime,
  FAKE_ROOM_ID,
  FAKE_SELF_ID,
  fakeEnterResponse,
} from './fakeRealtime';
import { createFakeSocialClient } from './fakeSocialClient';
import { DEV_PEERS, DEV_SPECS, useSimulatedPeers } from './simulatedPeers';

const KINDS: LibraryRoomKind[] = ['hall', 'reading_room', 'apartment'];

/** Ce que rend l'entrée : la salle, ou un refus de l'API. */
const ENTRIES = [
  'ok',
  'room_forbidden',
  'room_kicked',
  'room_not_found',
] as const;
type EntryMode = (typeof ENTRIES)[number];

/** Quelques meubles (les mêmes cases que l'appartement de démonstration). */
const DEV_ITEMS: LibraryApartmentItem[] = [
  { inventoryId: 'dev-01', key: 'coffee_table', gx: 6, gy: 6, rotation: 0 },
  { inventoryId: 'dev-02', key: 'armchair', gx: 3, gy: 6, rotation: 1 },
  { inventoryId: 'dev-03', key: 'bookshelf_filled', gx: 5, gy: 0, rotation: 0 },
  { inventoryId: 'dev-04', key: 'floor_lamp', gx: 1, gy: 4, rotation: 0 },
  { inventoryId: 'dev-05', key: 'plant_tall', gx: 12, gy: 1, rotation: 0 },
];

const ROW: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  alignItems: 'center',
};
const PANEL: CSSProperties = {
  display: 'grid',
  gap: 10,
  padding: 12,
  border: '1px dashed rgba(194,196,201,.35)',
  borderRadius: 8,
  fontSize: 13,
};

function refusalFor(mode: EntryMode): PlayerHttpError | null {
  if (mode === 'ok') return null;
  const status = mode === 'room_not_found' ? 404 : 403;
  const until =
    mode === 'room_kicked'
      ? { until: new Date(Date.now() + 25 * 60_000).toISOString() }
      : {};
  return new PlayerHttpError('refused (dev)', status, {
    error: 'refused (dev)',
    code: mode,
    ...until,
  });
}

function DevButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 8px',
        border: '1px solid rgba(194,196,201,.35)',
        borderRadius: 4,
      }}
    >
      {children}
    </button>
  );
}

function Room({
  kind,
  entry,
  peers,
}: {
  kind: LibraryRoomKind;
  entry: EntryMode;
  peers: number;
}) {
  // Un bus neuf à chaque montage (`key`) : rien ne survit d'une démonstration
  // à l'autre.
  const [bus] = useState(createFakeRealtime);
  const enter = useMemo(
    () => fakeEnterResponse(kind, { items: DEV_ITEMS }),
    [kind]
  );
  const enterClient = useMemo(
    () => ({
      enter: async () => {
        const refusal = refusalFor(entry);
        if (refusal) throw refusal;
        return enter;
      },
    }),
    [enter, entry]
  );
  const [fakeApi] = useState(() => createFakeSocialClient({ bus, enter }));
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  fakeApi.onCall = rerender;
  const deps = useMemo(
    () => ({ realtime: bus.client, enter: enterClient, actions: fakeApi }),
    [bus, enterClient, fakeApi]
  );

  useSimulatedPeers(
    bus,
    {
      topic: enter.topics.room,
      kind,
      width: enter.room.width,
      depth: enter.room.depth,
      items: enter.items,
    },
    peers,
    peers > 3 ? 160 : 1_400
  );

  const { topics } = enter;
  const inHalfHour = () => new Date(Date.now() + 30 * 60_000).toISOString();
  const [iris, nova] = DEV_PEERS;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <LibrarySocialProvider deps={deps}>
        <RoomStage
          roomId={FAKE_ROOM_ID}
          specs={DEV_SPECS}
          backHref="/dev/library-apartment"
        />
      </LibrarySocialProvider>

      <section style={PANEL} aria-label="Dev: server events">
        <strong>Server events (what conference-api would broadcast)</strong>
        <div style={ROW}>
          <DevButton
            onClick={() =>
              bus.server(topics.tenant, 'banned', {
                userId: iris.userId,
                until: null,
              })
            }
          >
            Ban Iris
          </DevButton>
          <DevButton
            onClick={() =>
              bus.server(topics.user, 'hide', {
                userId: nova.userId,
                leaveRoomId: null,
              })
            }
          >
            Hide Nova (block)
          </DevButton>
          <DevButton
            onClick={() =>
              bus.server(topics.user, 'unhide', { userId: nova.userId })
            }
          >
            Unhide Nova
          </DevButton>
          <DevButton
            onClick={() =>
              bus.server(topics.user, 'hide', {
                userId: nova.userId,
                leaveRoomId: FAKE_ROOM_ID,
              })
            }
          >
            Nova blocked me in her room (closed)
          </DevButton>
          <DevButton
            onClick={() =>
              bus.peerSend(topics.room, 'kicked', {
                userId: FAKE_SELF_ID,
                until: inHalfHour(),
              })
            }
          >
            Forged kick on room channel (must be ignored)
          </DevButton>
          <DevButton
            onClick={() =>
              bus.server(topics.chat, 'kicked', {
                userId: FAKE_SELF_ID,
                until: inHalfHour(),
              })
            }
          >
            Kick me
          </DevButton>
          <DevButton
            onClick={() =>
              bus.server(topics.tenant, 'banned', {
                userId: FAKE_SELF_ID,
                until: null,
              })
            }
          >
            Ban me
          </DevButton>
        </div>
        <div style={ROW}>
          <span>Fake API, next call fails with:</span>
          <DevButton onClick={() => fakeApi.failNext('report_failed', 500)}>
            report_failed
          </DevButton>
          <DevButton onClick={() => fakeApi.failNext('rate_limited', 429)}>
            429
          </DevButton>
          <DevButton onClick={() => fakeApi.failNext('player_not_found', 404)}>
            player_not_found
          </DevButton>
        </div>
        <p>
          sent by me: <span data-testid="sent">{bus.sent.length}</span>{' '}
          broadcast(s)
        </p>
        <details>
          <summary>Fake API calls ({fakeApi.calls.length})</summary>
          <ul>
            {fakeApi.calls.map((c) => (
              <li key={`${c.at}-${c.route}-${c.outcome}`}>
                {c.route} {JSON.stringify(c.input)} → {c.outcome}
              </li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  );
}

export default function DevRoomHarness() {
  const [kind, setKind] = useState<LibraryRoomKind>('hall');
  const [entry, setEntry] = useState<EntryMode>('ok');
  const [peers, setPeers] = useState(3);
  const [run, setRun] = useState(0);
  // Un cache PROPRE à la démo (les gestes passent par TanStack Query).
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
      })
  );
  return (
    <QueryClientProvider client={queryClient}>
      <main className="pt-header pb-16">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 sm:px-6">
          <section style={PANEL} aria-label="Dev: room">
            <div style={ROW}>
              {KINDS.map((k) => (
                <DevButton key={k} onClick={() => setKind(k)}>
                  {k === kind ? `[${k}]` : k}
                </DevButton>
              ))}
              <label>
                entry{' '}
                <select
                  value={entry}
                  onChange={(e) => setEntry(e.target.value as EntryMode)}
                >
                  {ENTRIES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                peers{' '}
                <select
                  value={peers}
                  onChange={(e) => setPeers(Number(e.target.value))}
                >
                  <option value={3}>3</option>
                  <option value={29}>29 (30 avatars)</option>
                </select>
              </label>
              <DevButton onClick={() => setRun((n) => n + 1)}>
                Re-enter
              </DevButton>
            </div>
          </section>
          <Room
            key={`${kind}-${entry}-${peers}-${run}`}
            kind={kind}
            entry={entry}
            peers={peers}
          />
        </div>
      </main>
    </QueryClientProvider>
  );
}
