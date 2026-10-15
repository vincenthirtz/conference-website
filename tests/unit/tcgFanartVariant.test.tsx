// @vitest-environment happy-dom
//
// Les ILLUSTRATIONS ALTERNATIVES côté écran, contre les formes rendues par
// conference-api (`target: { kind, slug, name, role }` sur une carte `fanart`
// — cf. `tcgFanartTargets.test.ts` côté API, mêmes valeurs).
//
// Ce que ces cas protègent :
//   - la face : le NOM de la cible (pas le titre de l'œuvre), le badge
//     « Illustration alternative », le rôle d'un héros, l'IMAGE de l'œuvre et
//     le crédit de l'autrice — une carte EN PLUS de la voxel, toujours une
//     fan art ; sans cible, la fan art s'affiche exactement comme avant ;
//   - chaque projection (collection, révélation, échanges, vitrine) garde la
//     cible, et nomme la carte comme sa face ;
//   - le formulaire de proposition : le sélecteur n'existe que si l'API ouvre
//     les cibles, et la cible choisie part avec la proposition ;
//   - la file du staff : la cible proposée est montrée, et le staff la garde,
//     la change ou la retire avant de valider.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { adminRequest, tcgClient } = vi.hoisted(() => ({
  adminRequest: vi.fn(),
  tcgClient: {
    fanart: vi.fn(),
    submitFanart: vi.fn(),
    withdrawFanart: vi.fn(),
  },
}));
vi.mock('@/utils/admin/adminHttp', () => ({ adminRequest }));
vi.mock('@/features/player/tcg/client', () => ({ tcgClient }));
vi.mock('next/router', () => ({
  useRouter: () => ({ pathname: '/admin/tcg', query: {}, push: vi.fn() }),
}));

import TcgCard, {
  type TcgCardProps,
  type TcgCardSubject,
} from '@/components/tcg/TcgCard';
import { showcaseCardSubject } from '@/components/tcg/TcgShowcaseSection';
import { collectionToShowcaseCard } from '@/components/tcg/TcgShowcaseEditor';
import FanartSubmitPanel from '@/components/tcg/FanartSubmitPanel';
import TcgFanartPanel from '@/components/admin/moderation/TcgFanartPanel';
import { ToastProvider } from '@/components/Toast';
import {
  cardLabel,
  cardName,
  cardSubject,
  type CollectionCard,
  type DrawnCard,
} from '@/features/player/tcg/model';
import {
  nameOf,
  subjectOf,
  type TradeCardView,
} from '@/features/player/tcg/tradeModel';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';
import nsTcgFanart from '@/lib/i18n/locales/fr/tcgFanart';
import nsAdminTcgFanart from '@/lib/i18n/locales/admin-fr/adminTcgFanart';

const VARIANT = '33333333-0000-4000-8000-000000000003';
const IMAGE =
  'https://example.supabase.co/storage/v1/object/public/teams-images/tcg-fanart/lya.png';
const MERCY = {
  kind: 'hero',
  slug: 'mercy',
  name: 'Mercy',
  role: 'Support',
} as const;

const labels: TcgCardProps['labels'] = {
  rarity: {
    common: 'Commune',
    rare: 'Rare',
    epic: 'Épique',
    legendary: 'Légendaire',
  },
  foil: 'Brillante',
  copies: '×{count}',
  logoCredit: 'Art : {artist}',
  roles: { tank: 'Tank', damage: 'Dégâts', support: 'Soutien' },
  alternateArt: nsPlayerTcg.fr.cardAlternateArt,
  association: 'L’association',
};

/** Une variante de la collection, telle que la rend l'API. */
const COLLECTION_VARIANT: CollectionCard = {
  kind: 'fanart',
  fanartId: VARIANT,
  title: 'Mercy au repos',
  artistName: 'Lya',
  artistUrl: 'https://lya.example/art',
  imageUrl: IMAGE,
  category: 'fanart',
  description: null,
  target: { ...MERCY },
  rarity: 'epic',
  isFoil: false,
  count: 1,
};

beforeEach(() => {
  vi.spyOn(window, 'fetch').mockResolvedValue(
    new Response(null, { status: 204 })
  );
});

afterEach(() => {
  cleanup();
  adminRequest.mockReset();
  tcgClient.fanart.mockReset();
  tcgClient.submitFanart.mockReset();
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* La face                                                                     */
/* -------------------------------------------------------------------------- */

describe('TcgCard — la face d’une illustration alternative', () => {
  const subject = cardSubject(COLLECTION_VARIANT) as Extract<
    TcgCardSubject,
    { kind: 'fanart' }
  >;

  it('porte le nom de la cible, le badge, le rôle, l’œuvre et son crédit', () => {
    const { container } = render(
      <TcgCard subject={subject} rarity="epic" labels={labels} />
    );
    expect(screen.getByText('Mercy')).toBeTruthy();
    expect(screen.queryByText('Mercy au repos')).toBeNull();
    expect(screen.getByText('Illustration alternative')).toBeTruthy();
    // Le rôle, traduit comme sur une carte héros.
    expect(screen.getByText('Soutien')).toBeTruthy();
    // L'image est l'ŒUVRE, jamais la figurine voxel du héros.
    const srcs = [...container.querySelectorAll('img')].map(
      (img) => img.getAttribute('src') ?? ''
    );
    expect(srcs.some((s) => s.includes('lya.png'))).toBe(true);
    expect(srcs.some((s) => s.includes('/api/tcg/hero/'))).toBe(false);
    // Le crédit de l'autrice, lien https compris.
    const credit = container.querySelector('a[href="https://lya.example/art"]');
    expect(credit?.textContent).toContain('Lya');
    // Une fan art n'a pas de page : la carte reste un article.
    expect(container.querySelector('article')).not.toBeNull();
  });

  it('une map : son nom, le badge, pas de rôle', () => {
    render(
      <TcgCard
        subject={{
          ...subject,
          target: {
            kind: 'map',
            slug: 'kings-row',
            name: "King's Row",
            role: null,
          },
        }}
        rarity="epic"
        labels={labels}
      />
    );
    expect(screen.getByText("King's Row")).toBeTruthy();
    expect(screen.getByText('Illustration alternative')).toBeTruthy();
    expect(screen.queryByText('Soutien')).toBeNull();
  });

  it('sans cible, la fan art s’affiche exactement comme avant', () => {
    render(
      <TcgCard
        subject={{ ...subject, target: null }}
        rarity="epic"
        labels={labels}
      />
    );
    expect(screen.getByText('Mercy au repos')).toBeTruthy();
    expect(screen.queryByText('Illustration alternative')).toBeNull();
    expect(screen.queryByText('Soutien')).toBeNull();
  });

  it('une cible sortie du registre garde le titre de l’œuvre', () => {
    render(
      <TcgCard
        subject={{
          ...subject,
          target: { kind: 'map', slug: 'ancienne-map', name: null, role: null },
        }}
        rarity="epic"
        labels={labels}
      />
    );
    expect(screen.getByText('Mercy au repos')).toBeTruthy();
  });

  it('jamais de badge sur une carte de l’association', () => {
    render(
      <TcgCard
        subject={{ ...subject, category: 'association' }}
        rarity="epic"
        labels={labels}
      />
    );
    expect(screen.queryByText('Illustration alternative')).toBeNull();
    expect(screen.getByText('Mercy au repos')).toBeTruthy();
  });

  it('sans libellé fourni, pas de badge plutôt qu’un texte en dur', () => {
    const { alternateArt: _omit, ...legacy } = labels;
    render(<TcgCard subject={subject} rarity="epic" labels={legacy} />);
    expect(screen.queryByText('Illustration alternative')).toBeNull();
    expect(screen.getByText('Mercy')).toBeTruthy();
  });

  it('libellé traduit en FR et EN', async () => {
    const en = (await import('@/lib/i18n/locales/en/playerTcg')).default;
    expect(nsPlayerTcg.fr.cardAlternateArt).toBe('Illustration alternative');
    expect(en.cardAlternateArt).toBe('Alternate art');
  });
});

/* -------------------------------------------------------------------------- */
/* Les projections                                                             */
/* -------------------------------------------------------------------------- */

describe('les projections gardent la cible', () => {
  it('collection et révélation', () => {
    const drawn: DrawnCard = {
      position: 4,
      isNew: true,
      kind: 'fanart',
      fanartId: VARIANT,
      title: 'Mercy au repos',
      artistName: 'Lya',
      artistUrl: 'https://lya.example/art',
      imageUrl: IMAGE,
      category: 'fanart',
      description: null,
      target: { ...MERCY },
      rarity: 'epic',
      isFoil: false,
    };
    for (const card of [COLLECTION_VARIANT, drawn]) {
      expect(cardSubject(card)).toMatchObject({
        kind: 'fanart',
        fanartId: VARIANT,
        name: 'Mercy au repos',
        target: MERCY,
      });
      expect(cardName(card)).toBe('Mercy');
    }
    expect(cardLabel(COLLECTION_VARIANT)).toBe('Mercy');
    // Réponse d'avant la fonctionnalité : pas de cible, le titre.
    const legacy = { ...COLLECTION_VARIANT };
    delete (legacy as { target?: unknown }).target;
    expect(cardSubject(legacy)).toMatchObject({ target: null });
    expect(cardName(legacy)).toBe('Mercy au repos');
  });

  it('échanges', () => {
    const card = {
      kind: 'fanart',
      fanartId: VARIANT,
      title: 'Mercy au repos',
      artistName: 'Lya',
      artistUrl: 'https://lya.example/art',
      imageUrl: IMAGE,
      category: 'fanart',
      target: { ...MERCY },
      rarity: 'epic',
      isFoil: false,
    } as TradeCardView;
    expect(subjectOf(card)).toMatchObject({ kind: 'fanart', target: MERCY });
    expect(nameOf(card)).toBe('Mercy');
  });

  it('vitrine (et carte de la semaine)', () => {
    const showcase = collectionToShowcaseCard(COLLECTION_VARIANT as never);
    expect(showcase.key).toBe(`fanart:${VARIANT}`);
    expect(showcaseCardSubject(showcase)).toMatchObject({
      kind: 'fanart',
      target: MERCY,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* La proposition                                                              */
/* -------------------------------------------------------------------------- */

const TARGETS = {
  hero: [
    { kind: 'hero', slug: 'ana', name: 'Ana', role: 'Support' },
    { kind: 'hero', slug: 'mercy', name: 'Mercy', role: 'Support' },
  ],
  map: [{ kind: 'map', slug: 'kings-row', name: "King's Row", role: null }],
};

function mineResponse(targets: unknown) {
  return {
    submissions: [
      {
        id: VARIANT,
        title: 'Mercy au repos',
        artistName: 'Lya',
        artistUrl: null,
        imageUrl: IMAGE,
        status: 'pending',
        reviewNotes: null,
        target: targets ? { ...MERCY } : null,
      },
    ],
    pending: 1,
    maxPending: 3,
    maxBytes: 2 * 1024 * 1024,
    targets,
  };
}

function renderPanel() {
  return render(
    <ToastProvider>
      <FanartSubmitPanel />
    </ToastProvider>
  );
}

describe('FanartSubmitPanel — « Illustration alternative de… »', () => {
  const t = nsTcgFanart.fr;

  it('pas de sélecteur tant que l’API n’ouvre pas les cibles', async () => {
    tcgClient.fanart.mockResolvedValue(mineResponse(null));
    renderPanel();
    expect(await screen.findByText('Mercy au repos')).toBeTruthy();
    expect(screen.queryByLabelText(t.labelTarget)).toBeNull();
  });

  it('propose héros et maps, montre la cible proposée, et l’envoie', async () => {
    tcgClient.fanart.mockResolvedValue(mineResponse(TARGETS));
    tcgClient.submitFanart.mockResolvedValue({});
    renderPanel();

    const select = (await screen.findByLabelText(
      t.labelTarget
    )) as HTMLSelectElement;
    expect(
      [...select.querySelectorAll('optgroup')].map((g) => g.label)
    ).toEqual([t.targetHeroes, t.targetMaps]);
    expect(select.value).toBe('');
    expect(screen.getByText('Illustration alternative de Mercy')).toBeTruthy();

    const file = new File([new Uint8Array([137, 80, 78, 71])], 'a.png', {
      type: 'image/png',
    });
    const input = document.getElementById('fanart-image') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);
    fireEvent.change(screen.getByLabelText(t.labelTitle), {
      target: { value: 'Mercy en vol' },
    });
    fireEvent.change(screen.getByLabelText(t.labelArtistName), {
      target: { value: 'Lya' },
    });
    fireEvent.change(select, { target: { value: 'hero:mercy' } });
    fireEvent.click(screen.getByLabelText(t.labelLicence));
    fireEvent.click(screen.getByRole('button', { name: t.submit }));

    await waitFor(() => expect(tcgClient.submitFanart).toHaveBeenCalled());
    expect(tcgClient.submitFanart.mock.calls[0][0]).toMatchObject({
      title: 'Mercy en vol',
      artistName: 'Lya',
      licenceAccepted: true,
      target: { kind: 'hero', slug: 'mercy' },
    });
  });

  it('« aucune » n’envoie pas de cible', async () => {
    tcgClient.fanart.mockResolvedValue(mineResponse(TARGETS));
    tcgClient.submitFanart.mockResolvedValue({});
    renderPanel();
    await screen.findByLabelText(t.labelTarget);
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'a.png', {
      type: 'image/png',
    });
    const input = document.getElementById('fanart-image') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(screen.getByLabelText(t.labelTitle), {
      target: { value: 'Libre' },
    });
    fireEvent.change(screen.getByLabelText(t.labelArtistName), {
      target: { value: 'Lya' },
    });
    fireEvent.click(screen.getByLabelText(t.labelLicence));
    fireEvent.click(screen.getByRole('button', { name: t.submit }));
    await waitFor(() => expect(tcgClient.submitFanart).toHaveBeenCalled());
    expect(tcgClient.submitFanart.mock.calls[0][0].target).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* La file du staff                                                            */
/* -------------------------------------------------------------------------- */

function queueResponse(targets: unknown, target: unknown = { ...MERCY }) {
  return {
    items: [
      {
        id: VARIANT,
        title: 'Mercy au repos',
        artistName: 'Lya',
        artistUrl: null,
        imageUrl: IMAGE,
        status: 'pending',
        rarity: null,
        reviewNotes: null,
        createdAt: '2026-10-15T10:00:00.000Z',
        target,
      },
    ],
    status: 'pending',
    rarities: ['common', 'rare', 'epic', 'legendary'],
    defaultRarity: 'rare',
    targets,
  };
}

function renderQueue() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <TcgFanartPanel />
      </ToastProvider>
    </QueryClientProvider>
  );
}

/** Le corps de la décision envoyée (PATCH), ou `undefined`. */
function decisionBody(): Record<string, unknown> | undefined {
  const call = adminRequest.mock.calls.find(
    (c) => (c[1] as { method?: string } | undefined)?.method === 'PATCH'
  );
  return (call?.[1] as { json?: Record<string, unknown> } | undefined)?.json;
}

describe('TcgFanartPanel — la cible avant validation', () => {
  const t = nsAdminTcgFanart.fr;

  beforeEach(() => {
    adminRequest.mockImplementation(async (_url: string, init?: unknown) =>
      (init as { method?: string } | undefined)?.method === 'PATCH'
        ? { item: {} }
        : queueResponse(TARGETS)
    );
  });

  it('montre la cible proposée, pré-choisie dans le sélecteur', async () => {
    renderQueue();
    expect(
      await screen.findByText('Illustration alternative de Mercy')
    ).toBeTruthy();
    const select = screen.getByLabelText(
      new RegExp(t.labelTarget.slice(0, 20))
    ) as HTMLSelectElement;
    expect(select.value).toBe('hero:mercy');
  });

  it('valider sans toucher la cible ne l’envoie pas (elle est gardée)', async () => {
    renderQueue();
    fireEvent.click(await screen.findByRole('button', { name: t.approve }));
    await waitFor(() => expect(decisionBody()).toBeDefined());
    expect(decisionBody()).toMatchObject({ action: 'approve', id: VARIANT });
    expect(decisionBody()).not.toHaveProperty('target');
  });

  it('changer la cible l’envoie ; « aucune » la retire', async () => {
    renderQueue();
    await screen.findByText('Illustration alternative de Mercy');
    const select = screen.getByLabelText(
      new RegExp(t.labelTarget.slice(0, 20))
    ) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'map:kings-row' } });
    fireEvent.click(screen.getByRole('button', { name: t.approve }));
    await waitFor(() => expect(decisionBody()).toBeDefined());
    expect(decisionBody()?.target).toEqual({ kind: 'map', slug: 'kings-row' });

    cleanup();
    adminRequest.mockClear();
    renderQueue();
    await screen.findByText('Illustration alternative de Mercy');
    fireEvent.change(
      screen.getByLabelText(new RegExp(t.labelTarget.slice(0, 20))),
      { target: { value: '' } }
    );
    fireEvent.click(screen.getByRole('button', { name: t.approve }));
    await waitFor(() => expect(decisionBody()).toBeDefined());
    expect(decisionBody()?.target).toBeNull();
  });

  it('pas de sélecteur tant que l’API n’ouvre pas les cibles', async () => {
    adminRequest.mockImplementation(async () => queueResponse(null, null));
    renderQueue();
    expect(await screen.findByText('Mercy au repos')).toBeTruthy();
    expect(
      screen.queryByLabelText(new RegExp(t.labelTarget.slice(0, 20)))
    ).toBeNull();
  });
});
