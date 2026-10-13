// @vitest-environment happy-dom
//
// Récompenses Twitch à carte garantie — PLUSIEURS à la fois (lot 1 de
// docs/PLAN-tcg-2.md). Le bloc liste ce qui est en service, ne propose à
// l'ajout que les cartes pas encore liées, et retire UNE récompense sans
// toucher aux autres. Face à une API plus ancienne (un seul couple hérité),
// il reconstitue la liste depuis les deux champs.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

vi.mock('@/lib/i18n/useAdminT', async (orig) => {
  const mod = await orig<typeof import('@/lib/i18n/useAdminT')>();
  return {
    ...mod,
    // Les clés telles quelles : le test lit des identifiants, pas des phrases.
    useAdminT: () =>
      new Proxy({}, { get: (_t, key) => (typeof key === 'string' ? key : '') }),
  };
});

const setupReward = vi.fn();
const subscribe = vi.fn();
const removeFeatured = vi.fn();
vi.mock('../../features/admin/diffusion/liveClient', () => ({
  broadcastCardsClient: {
    tcgDropSetupReward: (...a: unknown[]) => setupReward(...a),
    tcgDropSubscribe: (...a: unknown[]) => subscribe(...a),
    tcgDropFeaturedRemove: (...a: unknown[]) => removeFeatured(...a),
  },
}));

import TcgFeaturedRewardsBlock, {
  featuredRewardsOf,
} from '../../features/admin/diffusion/ui/TcgFeaturedRewardsBlock';
import type { TcgDropEventSubState } from '../../features/admin/diffusion/liveClient';

const ROSE = '44444444-0000-4000-8000-000000000004';
const HALLOWEEN = '55555555-0000-4000-8000-000000000005';
const NOEUD = '66666666-0000-4000-8000-000000000006';

const baseState: TcgDropEventSubState = {
  rewardId: 'rw-drop',
  callbackUrl: 'https://api.owwomenscup.fr/api/webhooks/twitch/tcg-drop',
  secretConfigured: true,
  hasScope: true,
  canManageRewards: true,
  subscriptions: [],
  featuredCandidates: [
    { id: ROSE, title: 'Octobre Rose' },
    { id: HALLOWEEN, title: 'Halloween' },
    { id: NOEUD, title: 'Le nœud en briques' },
  ],
  featured: [
    {
      rewardId: 'rw-rose',
      fanartId: ROSE,
      title: 'Octobre Rose',
      cost: 10_000,
      published: true,
    },
    {
      rewardId: 'rw-halloween',
      fanartId: HALLOWEEN,
      title: 'Halloween',
      cost: null,
      published: false,
    },
  ],
};

afterEach(() => {
  cleanup();
  setupReward.mockReset();
  subscribe.mockReset();
  removeFeatured.mockReset();
});

describe('featuredRewardsOf', () => {
  it('rend la liste de l’API telle quelle', () => {
    expect(featuredRewardsOf(baseState)).toBe(baseState.featured);
  });

  it('reconstitue UNE récompense depuis les champs hérités (API plus ancienne)', () => {
    const { featured: _omit, ...legacy } = baseState;
    expect(
      featuredRewardsOf({
        ...legacy,
        featuredRewardId: 'rw-legacy',
        featuredFanartId: HALLOWEEN,
      })
    ).toEqual([
      {
        rewardId: 'rw-legacy',
        fanartId: HALLOWEEN,
        title: 'Halloween',
        cost: null,
        published: true,
      },
    ]);
    expect(featuredRewardsOf({ ...legacy, featuredRewardId: null })).toEqual(
      []
    );
  });
});

describe('TcgFeaturedRewardsBlock', () => {
  it('liste chaque récompense en service, avec son coût et son état', () => {
    render(
      <TcgFeaturedRewardsBlock state={baseState} reload={async () => {}} />
    );
    const items = screen
      .getAllByRole('listitem')
      .map((li) => li.textContent ?? '');
    expect(items).toHaveLength(2);
    expect(items[0]).toContain('Octobre Rose');
    expect(items[0]).toContain('dropFeaturedCostValue');
    expect(items[0]).toContain('dropFeaturedLive');
    // Carte révoquée : désignée encore, mais le paquet retombe sur un tirage ordinaire.
    expect(items[1]).toContain('dropFeaturedUnpublished');
    expect(items[1]).not.toContain('dropFeaturedCostValue');
  });

  it('ne propose à l’ajout que les cartes pas encore liées', () => {
    render(
      <TcgFeaturedRewardsBlock state={baseState} reload={async () => {}} />
    );
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Le nœud en briques']);
  });

  it('quand toutes les cartes ont leur récompense, pas de formulaire', () => {
    const state: TcgDropEventSubState = {
      ...baseState,
      featuredCandidates: baseState.featuredCandidates!.slice(0, 2),
    };
    render(<TcgFeaturedRewardsBlock state={state} reload={async () => {}} />);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('dropFeaturedAllBound')).toBeTruthy();
  });

  it('ajouter : la récompense PUIS l’abonnement, avec la carte et le coût', async () => {
    setupReward.mockResolvedValue({ rewardId: 'rw-noeud' });
    subscribe.mockResolvedValue({});
    const reload = vi.fn(async () => {});
    render(<TcgFeaturedRewardsBlock state={baseState} reload={reload} />);

    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '2500' },
    });
    fireEvent.click(screen.getByText('dropFeaturedAdd'));

    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(setupReward).toHaveBeenCalledWith({
      cost: 2500,
      featuredFanartId: NOEUD,
    });
    expect(subscribe).toHaveBeenCalledWith({
      rewardId: 'rw-noeud',
      featuredFanartId: NOEUD,
      cost: 2500,
    });
    expect(setupReward.mock.invocationCallOrder[0]).toBeLessThan(
      subscribe.mock.invocationCallOrder[0]
    );
  });

  it('retirer : SA récompense seulement, puis relecture', async () => {
    removeFeatured.mockResolvedValue({
      rewardId: 'rw-rose',
      removedSubscriptions: 1,
      rewardDisabled: true,
    });
    const reload = vi.fn(async () => {});
    render(<TcgFeaturedRewardsBlock state={baseState} reload={reload} />);

    fireEvent.click(screen.getAllByText('dropFeaturedRemove')[0]);

    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(removeFeatured).toHaveBeenCalledTimes(1);
    expect(removeFeatured).toHaveBeenCalledWith('rw-rose');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retirée chez nous mais pas désactivée chez Twitch : l’écran le dit', async () => {
    removeFeatured.mockResolvedValue({
      rewardId: 'rw-rose',
      removedSubscriptions: 1,
      rewardDisabled: false,
    });
    render(
      <TcgFeaturedRewardsBlock state={baseState} reload={async () => {}} />
    );
    fireEvent.click(screen.getAllByText('dropFeaturedRemove')[0]);
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'dropFeaturedRemovedStillEnabled'
      )
    );
  });

  it('un retrait refusé laisse la liste intacte et dit l’échec', async () => {
    removeFeatured.mockRejectedValue(new Error('502'));
    render(
      <TcgFeaturedRewardsBlock state={baseState} reload={async () => {}} />
    );
    fireEvent.click(screen.getAllByText('dropFeaturedRemove')[1]);
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'dropFeaturedRemoveError'
      )
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
