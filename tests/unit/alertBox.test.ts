// La boîte d'alertes : ce qui part à l'antenne, et surtout ce qui n'y part pas.
//
// CE QUI MÉRITE UN TEST ICI, ce sont les trois garde-fous de la file. Ils ne se
// voient pas en relisant le code, et chacun correspond à un incident de direct
// bien réel :
//   1. ajouter la source dans OBS (ou changer de scène, ce qui la recharge) ne
//      doit PAS rejouer les subs de la soirée ;
//   2. le serveur renvoie une fenêtre d'alertes à chaque poll — aucune ne doit
//      être annoncée deux fois ;
//   3. au retour d'une coupure réseau, on reprend le direct, on ne rattrape pas
//      un quart d'heure d'historique.
//
// L'horloge est injectée (`serverTime`) : sans ça, ces tests changeraient de
// verdict selon le jour où on les lance.

import { describe, it, expect } from 'vitest';
import { fitAlertFontSize } from '@/components/overlay/match/AlertBoxSource';
import {
  ALERT_DURATION_DEFAULT_MS,
  ALERT_KINDS,
  ALERT_MAX_AGE_MS,
  ANONYMOUS_ACTOR,
  DEFAULT_ALERT_MESSAGES,
  alertPassesRule,
  clampAlertDurationMs,
  clampVolume,
  formatAlertAmount,
  ingestAlerts,
  initialAlertQueue,
  isAlertKind,
  mergeAlertSources,
  renderAlertMessage,
  resolveRule,
  shiftAlertQueue,
  type AlertRuleMap,
  type StreamAlert,
} from '@/utils/overlay/alertBox';

const NOW = '2026-09-18T20:00:00.000Z';

function alert(over: Partial<StreamAlert> & { id: string }): StreamAlert {
  return {
    kind: 'sub',
    actorName: 'Machine',
    amount: null,
    tier: null,
    createdAt: NOW,
    ...over,
  };
}

function feed(alerts: StreamAlert[], serverTime = NOW) {
  return { alerts, serverTime };
}

/* ── Fusion des deux sources ───────────────────────────────────────────── */

describe('mergeAlertSources', () => {
  it('préfixe les identifiants par source', () => {
    // Deux lignes peuvent porter le même UUID dans deux tables différentes.
    // Sans préfixe, l'une ferait taire l'autre dans le registre « déjà vu ».
    const same = '11111111-1111-1111-1111-111111111111';
    const out = mergeAlertSources(
      [
        {
          id: same,
          kind: 'follow',
          actor_name: 'Aru',
          amount: null,
          tier: null,
          created_at: NOW,
        },
      ],
      [{ id: same, amount_cents: 1000, created_at: NOW }]
    );
    expect(out.map((a) => a.id).sort()).toEqual([`don:${same}`, `tw:${same}`]);
  });

  it('classe le plus récent d’abord, avec un départage stable', () => {
    const out = mergeAlertSources(
      [
        {
          id: 'b',
          kind: 'follow',
          actor_name: null,
          amount: null,
          tier: null,
          created_at: '2026-09-18T20:00:00.000Z',
        },
        {
          id: 'a',
          kind: 'follow',
          actor_name: null,
          amount: null,
          tier: null,
          created_at: '2026-09-18T20:00:00.000Z',
        },
      ],
      [{ id: 'c', amount_cents: 500, created_at: '2026-09-18T21:00:00.000Z' }]
    );
    // Le don est le plus récent ; les deux ex æquo sortent toujours pareil.
    expect(out.map((a) => a.id)).toEqual(['don:c', 'tw:b', 'tw:a']);
  });

  it('ignore un type inconnu plutôt que de l’inventer', () => {
    // Une valeur ajoutée en base sans passer par le code ne doit pas produire
    // un gabarit vide à l'écran, en direct.
    const out = mergeAlertSources(
      [
        {
          id: 'x',
          kind: 'chaos',
          actor_name: null,
          amount: null,
          tier: null,
          created_at: NOW,
        },
      ],
      []
    );
    expect(out).toEqual([]);
  });

  it('un don n’a jamais de nom', () => {
    const [don] = mergeAlertSources(
      [],
      [{ id: 'd', amount_cents: 2500, created_at: NOW }]
    );
    expect(don.kind).toBe('donation');
    expect(don.actorName).toBeNull();
    expect(don.amount).toBe(2500);
  });
});

/* ── Les règles de la régie ────────────────────────────────────────────── */

describe('resolveRule / alertPassesRule', () => {
  it('une règle ABSENTE vaut « activé »', () => {
    // Sinon, installer la source sur un espace neuf donnerait une boîte muette
    // et il faudrait deviner qu'il manque sept lignes en base.
    const rule = resolveRule({}, 'cheer');
    expect(rule.enabled).toBe(true);
    expect(rule.message).toBeNull();
  });

  it('une règle désactivée fait taire son type', () => {
    const rule = {
      kind: 'follow' as const,
      enabled: false,
      message: null,
      minAmount: null,
    };
    expect(alertPassesRule(alert({ id: 'x', kind: 'follow' }), rule)).toBe(
      false
    );
  });

  it('le seuil écarte ce qui est sous la barre', () => {
    const rule = {
      kind: 'cheer' as const,
      enabled: true,
      message: null,
      minAmount: 100,
    };
    expect(
      alertPassesRule(alert({ id: 'a', kind: 'cheer', amount: 50 }), rule)
    ).toBe(false);
    expect(
      alertPassesRule(alert({ id: 'b', kind: 'cheer', amount: 100 }), rule)
    ).toBe(true);
  });

  it('un seuil posé sur un type SANS montant n’éteint pas ce type', () => {
    // Un follow n'a pas de quantité : un `min_amount` saisi par erreur ne doit
    // pas faire disparaître les follows sans que personne comprenne pourquoi.
    const rule = {
      kind: 'follow' as const,
      enabled: true,
      message: null,
      minAmount: 100,
    };
    expect(
      alertPassesRule(alert({ id: 'f', kind: 'follow', amount: null }), rule)
    ).toBe(true);
  });
});

/* ── Les phrases ───────────────────────────────────────────────────────── */

describe('formatAlertAmount', () => {
  it('donne à `amount` le sens de son type', () => {
    // Une seule colonne en base, sept lectures possibles : c'est ici que le
    // sens se décide, et nulle part ailleurs.
    expect(formatAlertAmount('cheer', 1500)).toContain('bits');
    expect(formatAlertAmount('resub', 12)).toBe('12 mois');
    expect(formatAlertAmount('gift', 1)).toBe('1 abonnement');
    expect(formatAlertAmount('gift', 5)).toBe('5 abonnements');
    expect(formatAlertAmount('raid', 1)).toBe('1 spectateur');
    expect(formatAlertAmount('raid', 42)).toBe('42 spectateurs');
    // Les dons sont en CENTIMES, comme partout ailleurs dans le dépôt.
    expect(formatAlertAmount('donation', 1000).replace(/\s/g, ' ')).toBe(
      '10 €'
    );
  });

  it('sans quantité, ne dit rien', () => {
    expect(formatAlertAmount('follow', null)).toBe('');
  });
});

describe('renderAlertMessage', () => {
  it('interpole le nom et la quantité', () => {
    expect(
      renderAlertMessage(
        alert({ id: 'a', kind: 'cheer', actorName: 'Aru', amount: 200 }),
        {}
      )
    ).toBe('Aru envoie 200 bits !');
  });

  it('un sub anonyme reste une alerte', () => {
    // Twitch permet d'offrir ou de s'abonner anonymement : taire l'alerte
    // priverait la chaîne d'un remerciement qu'elle doit.
    const out = renderAlertMessage(
      alert({ id: 'a', kind: 'sub', actorName: null }),
      {}
    );
    expect(out).toContain(ANONYMOUS_ACTOR);
  });

  it('la phrase de la régie l’emporte sur le défaut', () => {
    const rules: AlertRuleMap = {
      follow: {
        kind: 'follow',
        enabled: true,
        message: 'Bienvenue {name} !',
        minAmount: null,
      },
    };
    expect(
      renderAlertMessage(
        alert({ id: 'a', kind: 'follow', actorName: 'Nova' }),
        rules
      )
    ).toBe('Bienvenue Nova !');
  });

  it('une phrase vide retombe sur le défaut', () => {
    const rules: AlertRuleMap = {
      follow: {
        kind: 'follow',
        enabled: true,
        message: '   ',
        minAmount: null,
      },
    };
    expect(
      renderAlertMessage(
        alert({ id: 'a', kind: 'follow', actorName: 'Nova' }),
        rules
      )
    ).toBe(DEFAULT_ALERT_MESSAGES.follow.replace('{name}', 'Nova'));
  });

  it('chaque type a une phrase par défaut', () => {
    // Un type sans défaut afficherait un gabarit brut (« {name} ») à l'antenne.
    for (const kind of ALERT_KINDS) {
      expect(DEFAULT_ALERT_MESSAGES[kind]).toBeTruthy();
    }
  });

  it('n’interprète pas ce qui vient d’un tiers', () => {
    // Le pseudo vient de Twitch, la phrase de la régie : ni l'un ni l'autre
    // n'est de confiance. Le module rend une CHAÎNE, que la source pose en
    // texte — rien n'est échappé ici, donc rien ne doit être construit en HTML.
    const out = renderAlertMessage(
      alert({
        id: 'a',
        kind: 'follow',
        actorName: '<img src=x onerror=alert(1)>',
      }),
      {}
    );
    expect(out).toContain('<img src=x onerror=alert(1)>');
    expect(out).not.toContain('&lt;');
  });
});

/* ── La file ───────────────────────────────────────────────────────────── */

describe('ingestAlerts — les trois garde-fous', () => {
  it('1. n’annonce RIEN au premier flux, mais se souvient de tout', () => {
    const state = ingestAlerts(
      initialAlertQueue(),
      feed([alert({ id: 'a' }), alert({ id: 'b' })])
    );
    expect(state.queue).toEqual([]);
    expect(state.primed).toBe(true);
    expect(state.seen).toEqual(['a', 'b']);
  });

  it('1bis. un premier flux VIDE amorce quand même', () => {
    // Sinon la toute première alerte de la soirée serait avalée.
    const state = ingestAlerts(initialAlertQueue(), feed([]));
    expect(state.primed).toBe(true);
    const next = ingestAlerts(state, feed([alert({ id: 'a' })]));
    expect(next.queue.map((a) => a.id)).toEqual(['a']);
  });

  it('2. n’annonce jamais deux fois la même alerte', () => {
    let state = ingestAlerts(initialAlertQueue(), feed([]));
    state = ingestAlerts(state, feed([alert({ id: 'a' })]));
    expect(state.queue).toHaveLength(1);
    // Le serveur renvoie la même fenêtre au poll suivant.
    const again = ingestAlerts(state, feed([alert({ id: 'a' })]));
    expect(again.queue).toHaveLength(1);
    expect(again).toBe(state); // même référence : pas de rendu inutile
  });

  it('3. écarte une alerte périmée, mais la marque vue', () => {
    let state = ingestAlerts(initialAlertQueue(), feed([]));
    const vieux = new Date(
      Date.parse(NOW) - ALERT_MAX_AGE_MS - 1000
    ).toISOString();
    state = ingestAlerts(
      state,
      feed([alert({ id: 'vieux', createdAt: vieux })])
    );
    expect(state.queue).toEqual([]);
    expect(state.seen).toContain('vieux');
  });

  it('annonce dans l’ordre où c’est arrivé', () => {
    let state = ingestAlerts(initialAlertQueue(), feed([]));
    state = ingestAlerts(
      state,
      feed([
        alert({ id: 'recent', createdAt: '2026-09-18T20:00:10.000Z' }),
        alert({ id: 'ancien', createdAt: '2026-09-18T20:00:01.000Z' }),
      ])
    );
    expect(state.queue.map((a) => a.id)).toEqual(['ancien', 'recent']);
  });

  it('n’enfile pas ce qu’une règle éteint', () => {
    // Le filtre est AVANT la file : une alerte désactivée ne doit pas occuper
    // une place, sinon elle retarde les suivantes sans jamais s'afficher.
    let state = ingestAlerts(initialAlertQueue(), feed([]));
    const rules: AlertRuleMap = {
      follow: {
        kind: 'follow',
        enabled: false,
        message: null,
        minAmount: null,
      },
    };
    state = ingestAlerts(
      state,
      feed([
        alert({ id: 'f', kind: 'follow' }),
        alert({ id: 's', kind: 'sub' }),
      ]),
      rules
    );
    expect(state.queue.map((a) => a.id)).toEqual(['s']);
    // …et elle est quand même marquée vue : réactiver la règle ne doit pas
    // faire surgir l'historique.
    expect(state.seen).toContain('f');
  });

  it('borne le registre des alertes vues', () => {
    let state = ingestAlerts(initialAlertQueue(), feed([]));
    for (let i = 0; i < 400; i += 1) {
      state = ingestAlerts(state, feed([alert({ id: `a${i}` })]));
    }
    expect(state.seen.length).toBeLessThanOrEqual(300);
    // Les plus récentes sont celles qu'on garde.
    expect(state.seen).toContain('a399');
  });
});

describe('shiftAlertQueue', () => {
  it('sort les alertes une à une, sans muter l’état reçu', () => {
    let state = ingestAlerts(initialAlertQueue(), feed([]));
    state = ingestAlerts(state, feed([alert({ id: 'a' }), alert({ id: 'b' })]));
    const before = state.queue.length;

    const first = shiftAlertQueue(state);
    expect(first.next?.id).toBe('a');
    expect(state.queue).toHaveLength(before); // l'original est intact

    const second = shiftAlertQueue(first.state);
    expect(second.next?.id).toBe('b');
    expect(shiftAlertQueue(second.state).next).toBeNull();
  });
});

/* ── Bornes ────────────────────────────────────────────────────────────── */

describe('bornes des réglages', () => {
  it('la durée retombe sur celle de l’animation, et reste bornée', () => {
    expect(clampAlertDurationMs(null)).toBe(ALERT_DURATION_DEFAULT_MS);
    expect(clampAlertDurationMs(Number.NaN)).toBe(ALERT_DURATION_DEFAULT_MS);
    expect(clampAlertDurationMs(10)).toBe(3000);
    expect(clampAlertDurationMs(999_999)).toBe(60_000);
    expect(clampAlertDurationMs(12_000)).toBe(12_000);
  });

  it('le volume reste un pourcentage', () => {
    expect(clampVolume(null)).toBe(70);
    expect(clampVolume(-5)).toBe(0);
    expect(clampVolume(300)).toBe(100);
    expect(clampVolume(42)).toBe(42);
  });
});

describe('isAlertKind', () => {
  it('ne laisse passer que les types connus', () => {
    expect(isAlertKind('cheer')).toBe(true);
    expect(isAlertKind('donation')).toBe(true);
    expect(isAlertKind('chaos')).toBe(false);
    expect(isAlertKind(null)).toBe(false);
  });
});

describe('fitAlertFontSize', () => {
  // Ce n'est qu'un POINT DE DÉPART : le composant mesure ensuite le texte rendu
  // et le réduit s'il déborde. L'estimation a été prise en défaut une fois
  // (« Machine se réabonne pour 24 mois ! » passait à la ligne et le « ! »
  // débordait sous la bande) — d'où la mesure. Ce qu'on fige ici, c'est qu'elle
  // reste dans des bornes lisibles et qu'elle décroît avec la longueur.
  it('rétrécit quand la phrase s’allonge', () => {
    const court = fitAlertFontSize('Aru nous suit !', 900);
    const long = fitAlertFontSize('Machine se réabonne pour 24 mois !', 900);
    expect(long).toBeLessThan(court);
  });

  it('ne dépasse jamais le plafond, si courte que soit la phrase', () => {
    // Sans plafond, « Hé ! » s'afficherait en énorme et déborderait en hauteur.
    expect(fitAlertFontSize('Hé !', 900)).toBeLessThanOrEqual(900 * 0.045);
  });

  it('garde un plancher lisible, si longue que soit la phrase', () => {
    // Sous ce plancher, plus personne ne lit à l'antenne : mieux vaut laisser
    // la mesure réduire le tout que de rendre du 3 px.
    expect(fitAlertFontSize('x'.repeat(200), 900)).toBeGreaterThanOrEqual(
      900 * 0.018
    );
  });

  it('suit la taille de la carte', () => {
    const phrase = 'Aru nous suit !';
    expect(fitAlertFontSize(phrase, 1800)).toBeGreaterThan(
      fitAlertFontSize(phrase, 900)
    );
  });
});
