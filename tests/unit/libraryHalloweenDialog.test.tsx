// @vitest-environment happy-dom
//
// Women's Library, lot 16 — l'Event Halloween dans le hall, côté écran, contre
// des clients EN MÉMOIRE (la route `/api/tournament/{id}/pool` est celle de
// l'encart de l'espace joueuse, testée dans conference-api) :
//   * l'entrée sous la scène n'existe que pendant l'événement ; elle, la
//     citrouille (`requestHallSpot('halloween')`) et le fantôme ouvrent le
//     même dialogue « Bouh ! » ;
//   * le dialogue montre ce qui sera envoyé AVANT le clic, inscrit en un
//     clic, puis dit « Tu es inscrite 🎃 » ; inscriptions closes, échec,
//     profil incomplet ou lecture ratée : un message et la page d'inscription ;
//   * l'encart de l'espace joueuse (`EventSignupCard`), qui partage la même
//     logique, montre et envoie toujours la même chose ;
//   * la frontière de chargement : l'inscription (et le client du tableau de
//     bord) ne part qu'à l'ouverture ; rien du moteur du fantôme n'entre dans
//     le premier chargement de /player/library.

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const push = vi.hoisted(() => vi.fn(async () => true));
vi.mock('next/router', () => ({
  default: { asPath: '/player/library', push },
  useRouter: () => ({ asPath: '/player/library', query: {}, push }),
}));
vi.mock('@/utils/supabaseBrowser', () => ({
  supabaseClient: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 't' } } }),
    },
  },
}));

const session = vi.hoisted(() => ({
  meta: {
    display_name: 'Soleil',
    battle_tag: 'Soleil#1234',
  } as Record<string, unknown>,
}));
vi.mock('@/hooks/usePlayerSession', () => ({
  usePlayerSession: () => ({
    user: { id: 'me-0000', user_metadata: session.meta },
    token: 't',
    loading: false,
    ready: true,
  }),
}));

const pool = vi.hoisted(() => ({
  status: vi.fn(),
  register: vi.fn(),
}));
vi.mock('@/features/player/dashboard/client', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('@/features/player/dashboard/client')>();
  return {
    ...real,
    dashboardClient: {
      ...real.dashboardClient,
      eventPoolStatus: pool.status,
      eventPoolRegister: pool.register,
    },
  };
});

import EventSignupCard from '../../components/player/EventSignupCard';
import { homeEventSpotlight } from '../../config/homeEventSpotlight';
import type { HallClient } from '../../features/player/library/hall/client';
import { HallClientProvider } from '../../features/player/library/hall/clientContext';
import { requestHallSpot } from '../../features/player/library/hall/spotRequests';
import type { TeamHqClient } from '../../features/player/library/teamHq/client';
import { TeamHqClientProvider } from '../../features/player/library/teamHq/clientContext';
import HallExtras from '../../features/player/library/ui/hall/HallExtras';
import nsHall from '../../lib/i18n/locales/fr/playerLibraryHall';
import nsHalloween from '../../lib/i18n/locales/fr/playerLibraryHalloween';
import nsSoloSignup from '../../lib/i18n/locales/fr/soloSignup';
import { format } from '../../lib/i18n/useT';
import { PlayerHttpError } from '../../utils/player/playerHttp';
import type { PoolStatusView } from '../../utils/tournaments/pool';

const t = { ...nsHalloween.fr, boo: nsHall.fr.halloween.boo };
const IN_SEASON = Date.parse('2026-10-21T18:00:00+02:00');
const AFTER = Date.parse('2026-11-01T00:00:00+01:00');
const TOURNAMENT_ID = homeEventSpotlight?.tournamentId ?? '';
const SIGNUP_HREF = '/tournament/halloween-2026/inscription-solo';
const VAL = { id: 't-val', name: 'Les Valkyries' };

const VIEW = (over: Partial<PoolStatusView> = {}): PoolStatusView => ({
  entry: null,
  teams: [VAL],
  teamProgress: null,
  ...over,
});

const REGISTERED: PoolStatusView = {
  entry: {
    status: 'waitlist',
    displayName: 'Soleil',
    battleTag: 'Soleil#1234',
    originTeam: VAL,
    placedTeam: null,
  },
  teams: [VAL],
  teamProgress: {
    team: VAL,
    signedUp: 2,
    needed: 5,
    teamRegistered: false,
  },
};

beforeEach(() => {
  session.meta = { display_name: 'Soleil', battle_tag: 'Soleil#1234' };
  pool.status.mockReset();
  pool.register.mockReset();
  pool.status.mockResolvedValue(VIEW());
  pool.register.mockResolvedValue(REGISTERED);
});
afterEach(() => {
  cleanup();
  push.mockClear();
  vi.useRealTimers();
});

const hallClient = {
  commonRoom: vi.fn(),
  announcements: vi.fn(async () => ({ announcements: [] })),
  openRooms: vi.fn(async () => ({ rooms: [], nextCursor: null })),
} as unknown as HallClient;
const teamHqClient = {
  list: vi.fn(async () => ({ teams: [], lentInventoryIds: [] })),
  open: vi.fn(),
} as unknown as TeamHqClient;

function wrap(children: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <HallClientProvider client={hallClient}>
        <TeamHqClientProvider client={teamHqClient}>
          {children}
        </TeamHqClientProvider>
      </HallClientProvider>
    </QueryClientProvider>
  );
}

const mountHall = (nowMs = IN_SEASON) =>
  render(
    wrap(
      <HallExtras room={{ kind: 'hall' }} navigate={vi.fn()} nowMs={nowMs} />
    )
  );

async function openFromEntry() {
  fireEvent.click(await screen.findByRole('button', { name: t.entryOpen }));
  return screen.findByRole('dialog', { name: t.boo });
}

describe('l’entrée sous la scène', () => {
  it('pendant l’événement : un mot, la date, le bouton du dialogue', async () => {
    mountHall();
    const entry = (
      await screen.findByRole('heading', { name: /Event Halloween/ })
    ).closest('section') as HTMLElement;
    expect(entry.textContent).toContain('30 octobre');
    expect(
      within(entry)
        .getByRole('button', { name: t.entryOpen })
        .getAttribute('aria-haspopup')
    ).toBe('dialog');
    // Rien n'est lu avant l'ouverture.
    expect(pool.status).not.toHaveBeenCalled();
  });

  it('après `visibleUntil` : le hall redevient comme avant', () => {
    const { container } = mountHall(AFTER);
    expect(container.querySelector('[data-hall-halloween]')).toBeNull();
    act(() => {
      requestHallSpot('halloween');
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('le dialogue « Bouh ! »', () => {
  it('la citrouille (ou le fantôme) ouvre le même dialogue', async () => {
    mountHall();
    act(() => {
      requestHallSpot('halloween');
    });
    const dialog = await screen.findByRole('dialog', { name: t.boo });
    expect(dialog.getAttribute('data-place-panel')).toBe('halloween');
  });

  it('montre ce qui sera envoyé, inscrit en un clic, puis le dit', async () => {
    mountHall();
    const dialog = await openFromEntry();
    const recap = await within(dialog).findByText(t.recapTitle);
    const list = recap.parentElement as HTMLElement;
    expect(list.textContent).toContain('Soleil');
    expect(list.textContent).toContain('Soleil#1234');
    expect(list.textContent).toContain('Les Valkyries');
    expect(pool.status).toHaveBeenCalledWith(TOURNAMENT_ID);
    expect(pool.register).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: t.oneClick }));
    expect(await within(dialog).findByText(t.registered)).toBeTruthy();
    expect(pool.register).toHaveBeenCalledWith(TOURNAMENT_ID, {
      displayName: 'Soleil',
      battleTag: 'Soleil#1234',
      originTeamId: 't-val',
    });
    expect(
      within(dialog).getByText(
        format(t.waitTeam, { count: 2, needed: 5, team: 'Les Valkyries' })
      )
    ).toBeTruthy();
    expect(
      within(dialog).getByRole('link', { name: t.manage }).getAttribute('href')
    ).toBe(SIGNUP_HREF);
  });

  it('sans équipe : « le staff te placera », rien d’autre à choisir', async () => {
    pool.status.mockResolvedValue(VIEW({ teams: [] }));
    mountHall();
    const dialog = await openFromEntry();
    expect(await within(dialog).findByText(t.noTeam)).toBeTruthy();
  });

  it('déjà inscrite : elle le lit tout de suite', async () => {
    pool.status.mockResolvedValue(REGISTERED);
    mountHall();
    const dialog = await openFromEntry();
    expect(await within(dialog).findByText(t.registered)).toBeTruthy();
    expect(
      within(dialog).queryByRole('button', { name: t.oneClick })
    ).toBeNull();
  });

  it('BattleTag manquant : pas de clic seul, la page d’inscription', async () => {
    session.meta = { display_name: 'Soleil' };
    mountHall();
    const dialog = await openFromEntry();
    expect(await within(dialog).findByText(t.missingProfile)).toBeTruthy();
    expect(
      within(dialog)
        .getByRole('link', { name: t.complete })
        .getAttribute('href')
    ).toBe(SIGNUP_HREF);
    expect(
      within(dialog).queryByRole('button', { name: t.oneClick })
    ).toBeNull();
  });

  it('plusieurs équipes sans équipe active : à choisir sur la page', async () => {
    pool.status.mockResolvedValue(
      VIEW({ teams: [VAL, { id: 't-ora', name: 'Les Oracles' }] })
    );
    mountHall();
    const dialog = await openFromEntry();
    expect(await within(dialog).findByText(t.chooseTeam)).toBeTruthy();
  });

  it('inscriptions closes : le message, et l’événement', async () => {
    pool.register.mockRejectedValue(
      new PlayerHttpError('Fermé', 409, {
        error: 'Fermé',
        code: 'REGISTRATION_CLOSED',
      })
    );
    mountHall();
    const dialog = await openFromEntry();
    fireEvent.click(
      await within(dialog).findByRole('button', { name: t.oneClick })
    );
    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      t.closed
    );
    expect(
      within(dialog).getByRole('link', { name: t.details }).getAttribute('href')
    ).toBe('/tournament/halloween-2026');
  });

  it('autre échec : un message générique et la page d’inscription', async () => {
    pool.register.mockRejectedValue(new TypeError('Failed to fetch'));
    mountHall();
    const dialog = await openFromEntry();
    fireEvent.click(
      await within(dialog).findByRole('button', { name: t.oneClick })
    );
    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      t.error
    );
    expect(
      within(dialog)
        .getByRole('link', { name: t.complete })
        .getAttribute('href')
    ).toBe(SIGNUP_HREF);
  });

  it('lecture ratée : la page d’inscription, sans deviner', async () => {
    pool.status.mockRejectedValue(new TypeError('Failed to fetch'));
    mountHall();
    const dialog = await openFromEntry();
    expect(await within(dialog).findByText(t.loadError)).toBeTruthy();
    expect(
      within(dialog)
        .getByRole('link', { name: t.complete })
        .getAttribute('href')
    ).toBe(SIGNUP_HREF);
  });

  it('Échap ferme', async () => {
    mountHall();
    const dialog = await openFromEntry();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('l’encart de l’espace joueuse (logique partagée)', () => {
  const c = nsSoloSignup.fr;

  it('montre et envoie la même chose qu’avant', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(IN_SEASON);
    render(wrap(<EventSignupCard />));
    expect(
      await screen.findByText(
        format(c.eventCardRecapTeam, {
          pseudo: 'Soleil',
          tag: 'Soleil#1234',
          team: 'Les Valkyries',
        })
      )
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: c.eventCardOneClick }));
    expect(await screen.findByText(c.eventCardRegistered)).toBeTruthy();
    expect(pool.register).toHaveBeenCalledWith(TOURNAMENT_ID, {
      displayName: 'Soleil',
      battleTag: 'Soleil#1234',
      originTeamId: 't-val',
    });
  });

  it('profil incomplet : le lien vers la page, pas le clic', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(IN_SEASON);
    session.meta = { display_name: 'Soleil', battle_tag: 'nope' };
    render(wrap(<EventSignupCard />));
    expect(await screen.findByText(c.eventCardMissingInfo)).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: c.eventCardComplete })
        .getAttribute('href')
    ).toBe(SIGNUP_HREF);
  });
});

/* ---------------------------------------------- frontière de chargement --- */

describe('frontière de chargement de /player/library (lot 16)', () => {
  const ROOT = path.resolve(__dirname, '../..');
  const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const EXTS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

  const resolveLocal = (from: string, spec: string): string | null => {
    let base: string;
    if (spec.startsWith('@/')) base = spec.slice(2);
    else if (spec.startsWith('.'))
      base = path.posix.join(path.posix.dirname(from), spec);
    else return null;
    for (const ext of EXTS) {
      const cand = path.posix.normalize(base + ext);
      const abs = path.join(ROOT, cand);
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return cand;
    }
    return null;
  };

  /** Imports STATIQUES de valeur (ni `import type`, ni `import()`). */
  const staticImports = (src: string): string[] => {
    const out: string[] = [];
    const re =
      /(?:import|export)\s+(?!type\s)[^'"]*?from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g;
    for (const m of src.matchAll(re)) out.push(m[1] ?? m[2]);
    return out;
  };

  const reach = (entry: string): Set<string> => {
    const seen = new Set<string>();
    const stack = [entry];
    while (stack.length) {
      const rel = stack.pop() as string;
      if (seen.has(rel)) continue;
      seen.add(rel);
      for (const spec of staticImports(read(rel))) {
        const next = resolveLocal(rel, spec);
        if (next && !seen.has(next)) stack.push(next);
      }
    }
    return seen;
  };

  /**
   * La saison (à l'entrée dans le hall), l'entrée et le dialogue, puis
   * l'inscription (à l'ouverture).
   */
  const LAZY = [
    'features/player/library/halloween/hallDecor.ts',
    'features/player/library/halloween/event.ts',
    'config/homeEventSpotlight.ts',
    'features/player/library/ui/hall/HalloweenHall.tsx',
    'lib/i18n/locales/fr/playerLibraryHalloween.ts',
    'features/player/library/ui/hall/HalloweenSignupPanel.tsx',
    'features/player/dashboard/hooks/useEventOneClickSignup.ts',
    'features/player/dashboard/eventSignupDraft.ts',
    'features/player/dashboard/client.ts',
  ];
  /** Le fantôme lui-même : chargé par le moteur, seulement s'il y en a un. */
  const NPC_ONLY = [
    'features/player/library/engine/npcLayer.ts',
    'features/player/library/halloween/ghostRoute.ts',
    'features/player/library/halloween/boo.ts',
    'features/player/library/engine/npcSprites.ts',
  ];

  it('le détecteur mord : la saison atteint l’encart, le panneau l’inscription, le PNJ sa ronde', () => {
    const fromSeason = reach(LAZY[0]);
    expect(LAZY.slice(0, 3).filter((f) => !fromSeason.has(f))).toEqual([]);
    const fromPanel = reach(
      'features/player/library/ui/hall/HalloweenSignupPanel.tsx'
    );
    expect(LAZY.slice(5).filter((f) => !fromPanel.has(f))).toEqual([]);
    const fromNpc = reach(NPC_ONLY[0]);
    expect(NPC_ONLY.filter((f) => !fromNpc.has(f))).toEqual([]);
  });

  it('la page n’atteint rien de l’événement : ni saison, ni entrée, ni inscription, ni fantôme', () => {
    const page = reach('pages/player/library.tsx');
    expect(page.has('features/player/library/ui/hall/HallExtras.tsx')).toBe(
      true
    );
    expect(page.has('features/player/library/ui/hall/useHallSeason.ts')).toBe(
      true
    );
    expect(LAZY.filter((f) => page.has(f))).toEqual([]);
    expect(NPC_ONLY.filter((f) => page.has(f))).toEqual([]);
    expect(read('features/player/library/ui/hall/useHallSeason.ts')).toMatch(
      /import\(\s*'\.\.\/\.\.\/halloween\/hallDecor'\s*\)/
    );
  });

  it('le moteur ne charge le PNJ qu’à la demande', () => {
    const engine = reach('features/player/library/engine/controller.ts');
    expect(NPC_ONLY.filter((f) => engine.has(f))).toEqual([]);
    expect(read('features/player/library/engine/npcHost.ts')).toMatch(
      /import\(\s*'\.\/npcLayer'\s*\)/
    );
  });

  it('chaque étage par next/dynamic, et seulement ainsi', () => {
    const extras = read('features/player/library/ui/hall/HallExtras.tsx');
    expect(extras).toMatch(
      /dynamic\(\s*\(\)\s*=>\s*import\(\s*'\.\/HalloweenHall'\s*\)/
    );
    expect(staticImports(extras).some((s) => /Halloween/.test(s))).toBe(false);
    const hall = read('features/player/library/ui/hall/HalloweenHall.tsx');
    expect(hall).toMatch(
      /dynamic\(\s*\(\)\s*=>\s*import\(\s*'\.\/HalloweenSignupPanel'\s*\)/
    );
    expect(
      staticImports(hall).some((s) => /SignupPanel|dashboard/.test(s))
    ).toBe(false);
  });
});
