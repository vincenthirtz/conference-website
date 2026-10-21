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
//
// Lot 14a : un signataire de test (`./presenceSigner.ts`) joue la clé de
// l'API — il signe MON jeton (entrée simulée) et ceux des joueuses simulées.
// « Forged presences » pose des présences sans jeton valide (autre clé, jeton
// d'une autre, autre salle, échu, sans jeton) : aucune ne doit apparaître,
// ni dans la vue ni dans « Présentes dans la salle ».
//
// Lot 15 : « showcase » (ou `?showcase=<nom>`) pose une vitrine de meubles
// dans leurs 4 rotations, une joueuse assise / allongée sur chaque place
// (`./showcase.ts`) — pour caler les profils d'assise à l'œil.
//
// Lot 16 : `?npc=halloween` fixe la saison du hall pendant l'événement —
// citrouilles, fantôme qui flotte et fait « Bouh ! », même hors de l'affiche —
// et le hall montre sous la scène son écran réel (`./devHalloween.tsx`, à la
// demande) : un appui sur le fantôme ou la citrouille y ouvre le dialogue.
// Sans paramètre, l'heure réelle décide.

import dynamic from 'next/dynamic';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
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
import {
  createDevPresenceSigner,
  type DevPresenceSigner,
  devPresenceSigner,
  signedEnter,
  signedPeerMeta,
  useDevPresenceSigner,
} from './presenceSigner';
import type { ShowcaseLayout } from './showcase';
import { DEV_PEERS, DEV_SPECS, useSimulatedPeers } from './simulatedPeers';
import type { FakeRealtime } from './fakeRealtime';

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

// Lot 16 : l'écran du hall sous la scène, chargé à la demande ; un soir de
// l'Event Halloween, pour `?npc=halloween`.
const DevHallExtras = dynamic(() => import('./devHalloween'), { ssr: false });
const DEV_HALLOWEEN_AT = Date.parse('2026-10-30T20:00:00+01:00');

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

/** Identifiants des présences forgées (aucune ne doit apparaître). */
const FORGED = [1, 2, 3, 4, 5].map(
  (k) => `00000000-0000-4000-8000-0000000000f${k}`
);

/**
 * Des présences qu'une cliente modifiée pourrait poser : chacune doit être
 * IGNORÉE (lot 14a). Une case libre au milieu de la salle.
 */
async function forgePresences(
  bus: FakeRealtime,
  topic: string,
  roomId: string,
  signer: DevPresenceSigner
) {
  const [a, b, c, d, e] = FORGED;
  const at = { gx: 7, gy: 4, dir: 4 };
  const who = { nickname: 'Usurpatrice', avatarId: 'a01' };
  const attacker = await createDevPresenceSigner();
  const metas = [
    // Signée par une AUTRE clé que celle de l'API.
    await signedPeerMeta(attacker, roomId, { userId: a, ...who, ...at }),
    // Le jeton VALIDE d'Iris, sous une autre clé de présence.
    {
      ...(await signedPeerMeta(signer, roomId, { ...DEV_PEERS[0], ...at })),
      userId: b,
    },
    // Un jeton valide… d'une autre salle.
    await signedPeerMeta(signer, 'another-room', { userId: c, ...who, ...at }),
    // Un jeton échu.
    await signedPeerMeta(
      signer,
      roomId,
      { userId: d, ...who, ...at },
      { iat: 1_000, exp: 2_000 }
    ),
  ];
  for (const meta of metas) bus.peerJoin(topic, meta);
  // L'ancienne présence, sans jeton : pseudo et avatar déclarés.
  bus.peerJoin(topic, { userId: e, nickname: 'Iris', avatarId: 'a05', ...at });
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
  showcase,
  seasonAt,
}: {
  kind: LibraryRoomKind;
  entry: EntryMode;
  peers: number;
  showcase: ShowcaseLayout | null;
  seasonAt: number | undefined;
}) {
  // Un bus neuf à chaque montage (`key`) : rien ne survit d'une démonstration
  // à l'autre.
  const [bus] = useState(createFakeRealtime);
  const enter = useMemo(() => {
    if (!showcase) return fakeEnterResponse(kind, { items: DEV_ITEMS });
    // Une vitrine : un appartement assez grand pour ses meubles.
    const base = fakeEnterResponse('apartment');
    return fakeEnterResponse('apartment', {
      items: showcase.items,
      room: { ...base.room, width: showcase.width, depth: showcase.depth },
    });
  }, [kind, showcase]);
  // Lot 14a : l'entrée simulée rend MON jeton, signé par la clé de la page.
  const enterClient = useMemo(
    () => ({
      enter: async () => {
        const refusal = refusalFor(entry);
        if (refusal) throw refusal;
        return signedEnter(enter, await devPresenceSigner());
      },
    }),
    [enter, entry]
  );
  const signer = useDevPresenceSigner();
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
      id: enter.room.id,
      topic: enter.topics.room,
      kind,
      width: enter.room.width,
      depth: enter.room.depth,
      items: enter.items,
    },
    showcase ? 0 : peers,
    peers > 3 ? 160 : 1_400,
    signer
  );
  // Lot 15 : la vitrine — une joueuse installée sur chaque place (à la demande).
  useEffect(() => {
    if (!showcase || !signer) return undefined;
    let off = false;
    let leave: (() => void) | null = null;
    void import('./showcaseSitters').then((m) => {
      if (off) return;
      leave = m.seatShowcaseSitters(
        bus,
        {
          id: enter.room.id,
          topic: enter.topics.room,
          width: enter.room.width,
          depth: enter.room.depth,
          items: enter.items,
        },
        signer
      );
    });
    return () => {
      off = true;
      leave?.();
    };
  }, [bus, enter, showcase, signer]);

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
          seasonAt={seasonAt}
        />
      </LibrarySocialProvider>
      {kind === 'hall' && !showcase && <DevHallExtras seasonAt={seasonAt} />}

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
            onClick={() => {
              if (signer)
                void forgePresences(bus, topics.room, enter.room.id, signer);
            }}
          >
            Forged presences (must not appear)
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
  // Lot 15 : les vitrines, chargées à la demande (`?showcase=<nom>`).
  const [showcase, setShowcase] = useState('');
  const [names, setNames] = useState<string[]>([]);
  const [layout, setLayout] = useState<ShowcaseLayout | null>(null);
  // Lot 16 : `?npc=halloween` fixe la saison du hall pendant l'événement.
  const [seasonAt, setSeasonAt] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('npc') === 'halloween')
      setSeasonAt(DEV_HALLOWEEN_AT);
  }, []);
  useEffect(() => {
    void import('./showcase').then(({ SHOWCASES }) => {
      setNames(Object.keys(SHOWCASES));
      const s = new URLSearchParams(window.location.search).get('showcase');
      if (s && Object.hasOwn(SHOWCASES, s)) setShowcase(s);
    });
  }, []);
  useEffect(() => {
    setLayout(null);
    if (!showcase) return undefined;
    let off = false;
    void import('./showcase').then(({ SHOWCASES, showcaseRoom }) => {
      if (!off && Object.hasOwn(SHOWCASES, showcase))
        setLayout(showcaseRoom(SHOWCASES[showcase]));
    });
    return () => {
      off = true;
    };
  }, [showcase]);
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
              <label>
                showcase{' '}
                <select
                  value={showcase}
                  onChange={(e) => setShowcase(e.target.value)}
                >
                  <option value="">—</option>
                  {names.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <DevButton onClick={() => setRun((n) => n + 1)}>
                Re-enter
              </DevButton>
            </div>
          </section>
          {showcase && !layout ? (
            <p role="status">Loading showcase…</p>
          ) : (
            <Room
              key={`${kind}-${entry}-${peers}-${run}-${showcase}-${seasonAt}`}
              kind={kind}
              entry={entry}
              peers={peers}
              showcase={layout}
              seasonAt={seasonAt}
            />
          )}
        </div>
      </main>
    </QueryClientProvider>
  );
}
