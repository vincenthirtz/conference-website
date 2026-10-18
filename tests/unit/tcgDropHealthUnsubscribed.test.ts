// Carte « Drops TCG » (Diffusion › Overlays, onglet Récompenses) : les
// récompenses désignées qu'aucun abonnement EventSub ne couvre.
// Target : components/admin/broadcast/TcgDropHealthCard.tsx
//          (unsubscribedRewards, repairSteps)
//
// CE QUE CES CAS PROTÈGENT. Twitch filtre chaque abonnement sur UNE récompense.
// Une récompense désignée sans le sien ne livre rien au site : ses échanges
// coûtent des points pour rien, sans remboursement ni message — et la carte se
// disait « saine » dès qu'un seul abonnement était actif (constaté le
// 2026-10-18 : aucun drop ordinaire crédité, jamais ; Octobre Rose
// re-désignée en base le 14 sans passer par Twitch).
//
// ET LA RÉPARATION NE DOIT PAS CRÉER UNE SECONDE RÉCOMPENSE : celle du drop,
// renommée dans Twitch (« Carte à collectionner simple »), n'est plus
// retrouvée par son titre — elle se ré-abonne par son identifiant.

import { describe, expect, it } from 'vitest';
import {
  repairSteps,
  unsubscribedRewards,
} from '@/components/admin/broadcast/TcgDropHealthCard';
import type { TcgDropEventSubState } from '@/features/admin/diffusion/liveClient';

const DROP = '870157ee-45b0-4a37-b61e-3ab1a90d838e';
const HALLOWEEN = '1d830435-5885-4b08-afec-58acddc4fb99';
const ROSE = '3a0d3481-dbfa-4746-a42d-5c26c3274d88';

function state(over: Partial<TcgDropEventSubState> = {}): TcgDropEventSubState {
  return {
    rewardId: DROP,
    featured: [
      {
        rewardId: HALLOWEEN,
        fanartId: 'fan-halloween',
        title: 'Halloween',
        cost: null,
        published: true,
      },
      {
        rewardId: ROSE,
        fanartId: 'fan-rose',
        title: 'Octobre Rose',
        cost: 10000,
        published: true,
      },
    ],
    callbackUrl: 'https://api.owwomenscup.fr/api/webhooks/twitch/tcg-drop',
    secretConfigured: true,
    hasScope: true,
    subscriptions: [
      { id: 's1', status: 'enabled', rewardId: DROP },
      { id: 's2', status: 'enabled', rewardId: HALLOWEEN },
    ],
    ...over,
  };
}

describe('récompenses désignées sans abonnement', () => {
  it('signale la mise en avant qu’aucun abonnement actif ne vise', () => {
    expect(unsubscribedRewards(state())).toEqual([
      { rewardId: ROSE, title: 'Octobre Rose', fanartId: 'fan-rose' },
    ]);
  });

  it('un abonnement en défaut ne couvre pas sa récompense', () => {
    const missing = unsubscribedRewards(
      state({
        subscriptions: [
          {
            id: 's1',
            status: 'notification_failures_exceeded',
            rewardId: DROP,
          },
          { id: 's2', status: 'enabled', rewardId: HALLOWEEN },
          { id: 's3', status: 'enabled', rewardId: ROSE },
        ],
      })
    );
    expect(missing).toEqual([{ rewardId: DROP, title: null }]);
  });

  it('tout couvert : rien à signaler', () => {
    expect(
      unsubscribedRewards(
        state({
          subscriptions: [
            { id: 's1', status: 'enabled', rewardId: DROP },
            { id: 's2', status: 'enabled', rewardId: HALLOWEEN },
            { id: 's3', status: 'enabled', rewardId: ROSE },
          ],
        })
      )
    ).toEqual([]);
  });

  it('se tait quand l’API ne dit pas quelle récompense chaque abonnement vise', () => {
    expect(
      unsubscribedRewards(
        state({
          subscriptions: [{ id: 's1', status: 'enabled', rewardId: null }],
        })
      )
    ).toEqual([]);
    // Liste illisible ou vide : déjà dit par la carte autrement.
    expect(unsubscribedRewards(state({ subscriptions: null }))).toEqual([]);
    expect(unsubscribedRewards(state({ subscriptions: [] }))).toEqual([]);
  });

  it('API plus ancienne : la mise en avant héritée est vérifiée aussi', () => {
    expect(
      unsubscribedRewards(
        state({
          featured: undefined,
          featuredRewardId: ROSE,
          featuredFanartId: 'fan-rose',
          subscriptions: [{ id: 's1', status: 'enabled', rewardId: DROP }],
        })
      )
    ).toEqual([{ rewardId: ROSE, title: null, fanartId: 'fan-rose' }]);
  });
});

describe('mise en service : ce que fait le bouton', () => {
  it('une récompense de drop DÉSIGNÉE se ré-abonne par son identifiant, sans recherche par titre', () => {
    expect(
      repairSteps(
        state({
          subscriptions: [{ id: 's2', status: 'enabled', rewardId: HALLOWEEN }],
        })
      )
    ).toEqual([
      { kind: 'subscribe', rewardId: DROP },
      { kind: 'subscribe', rewardId: ROSE, featuredFanartId: 'fan-rose' },
    ]);
  });

  it('sans récompense désignée : la créer (ou la reprendre par son titre), puis l’abonner', () => {
    expect(
      repairSteps(state({ rewardId: null, featured: [], subscriptions: [] }))
    ).toEqual([{ kind: 'setupThenSubscribe' }]);
  });

  it('état illisible : le chemin de création, comme avant', () => {
    expect(repairSteps(null)).toEqual([{ kind: 'setupThenSubscribe' }]);
  });
});
