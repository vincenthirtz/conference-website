// Récompenses de points de chaîne (Diffusion › Overlays) : validation des
// saisies et chemins d'API, sortis de TwitchRewardsPanel.

import { describe, it, expect } from 'vitest';
import {
  EMPTY_REWARD_DRAFT,
  rewardCreateBody,
  rewardEditPatch,
} from '@/features/admin/twitch/rewardDraft';
import { twitchPaths } from '@/features/admin/twitch/client';

describe('rewardCreateBody', () => {
  it('envoie titre et coût seuls quand le reste est vide', () => {
    expect(
      rewardCreateBody({
        ...EMPTY_REWARD_DRAFT,
        title: '  Hydrate  ',
        cost: '500',
      })
    ).toEqual({ ok: true, value: { title: 'Hydrate', cost: 500 } });
  });

  it('ajoute les champs optionnels renseignés (message et couleur rognés)', () => {
    expect(
      rewardCreateBody({
        title: 'Choisis la map',
        cost: '1000',
        prompt: '  Quelle map ?  ',
        userInput: true,
        skipQueue: true,
        color: ' #00ff00 ',
      })
    ).toEqual({
      ok: true,
      value: {
        title: 'Choisis la map',
        cost: 1000,
        prompt: 'Quelle map ?',
        is_user_input_required: true,
        should_redemptions_skip_request_queue: true,
        background_color: '#00ff00',
      },
    });
  });

  it('refuse un titre vide avant de regarder le coût', () => {
    expect(
      rewardCreateBody({ ...EMPTY_REWARD_DRAFT, title: '   ', cost: 'x' })
    ).toEqual({ ok: false, error: 'titleRequired' });
  });

  it.each(['', '0', '-5', '1.5', 'abc'])('refuse le coût %j', (cost) => {
    expect(
      rewardCreateBody({ ...EMPTY_REWARD_DRAFT, title: 'T', cost })
    ).toEqual({ ok: false, error: 'costInvalid' });
  });
});

describe('rewardEditPatch', () => {
  it('envoie toujours le message, vide compris (pour l’effacer)', () => {
    expect(
      rewardEditPatch({ id: 'r1', title: ' T ', cost: '10', prompt: '   ' })
    ).toEqual({ ok: true, value: { title: 'T', cost: 10, prompt: '' } });
  });

  it('applique la même règle que la création', () => {
    expect(
      rewardEditPatch({ id: 'r1', title: '', cost: '10', prompt: '' })
    ).toEqual({ ok: false, error: 'titleRequired' });
    expect(
      rewardEditPatch({ id: 'r1', title: 'T', cost: '0', prompt: '' })
    ).toEqual({ ok: false, error: 'costInvalid' });
  });
});

describe('twitchPaths', () => {
  it('garde les URLs du contrat', () => {
    expect(twitchPaths.connection).toBe('/api/admin/twitch/connection');
    expect(twitchPaths.rewards).toBe(
      '/api/admin/twitch/channel-points/rewards'
    );
    expect(twitchPaths.allRewards).toBe(
      '/api/admin/twitch/channel-points/rewards?all=1'
    );
    expect(twitchPaths.redemptions).toBe(
      '/api/admin/twitch/channel-points/redemptions'
    );
  });

  it('encode les identifiants', () => {
    expect(twitchPaths.reward('a/b c')).toBe(
      '/api/admin/twitch/channel-points/rewards/a%2Fb%20c'
    );
    expect(twitchPaths.pendingRedemptions('id&x=1')).toBe(
      '/api/admin/twitch/channel-points/redemptions?reward_id=id%26x%3D1&status=UNFULFILLED'
    );
  });
});
