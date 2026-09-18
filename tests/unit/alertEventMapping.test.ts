// D'une charge EventSub à une ligne annonçable.
//
// CE QUI MÉRITE UN TEST ICI, ce sont les trois chausse-trapes du format Twitch.
// Aucune ne se voit en relisant la route, et chacune produit un incident
// visible à l'antenne :
//   1. un sub OFFERT arrive deux fois (le gift + un subscribe par
//      bénéficiaire) → 21 alertes pour une seule générosité ;
//   2. l'anonymat existe → un nom fantôme, ou une alerte tue ;
//   3. un raid porte deux chaînes → « Women's Cup débarque » sur notre propre
//      antenne.

import { describe, it, expect } from 'vitest';
import {
  ALERT_SUBSCRIPTIONS,
  mapAlertEvent,
  readBroadcasterId,
} from '@/utils/twitch/alertEventMapping';

describe('mapAlertEvent — les pièges du format Twitch', () => {
  it('1. jette le `channel.subscribe` d’un sub OFFERT', () => {
    // Offrir 20 abonnements déclenche 1 gift + 20 subscribe `is_gift`. Sans ce
    // filtre, l'antenne est bloquée plusieurs minutes par une seule personne.
    expect(
      mapAlertEvent('channel.subscribe', {
        user_name: 'Bénéficiaire',
        tier: '1000',
        is_gift: true,
      })
    ).toBeNull();
  });

  it('1bis. garde le sub que la spectatrice a payé elle-même', () => {
    expect(
      mapAlertEvent('channel.subscribe', {
        user_name: 'Machine',
        tier: '2000',
        is_gift: false,
      })
    ).toEqual({
      kind: 'sub',
      actorName: 'Machine',
      amount: null,
      tier: '2000',
    });
  });

  it('1ter. garde le gift, avec le NOMBRE d’abonnements offerts', () => {
    expect(
      mapAlertEvent('channel.subscription.gift', {
        user_name: 'Généreuse',
        total: 20,
        tier: '1000',
        is_anonymous: false,
      })
    ).toEqual({
      kind: 'gift',
      actorName: 'Généreuse',
      amount: 20,
      tier: '1000',
    });
  });

  it('2. l’anonymat efface le nom, mais garde l’alerte', () => {
    // Twitch envoie parfois un nom de façade avec `is_anonymous` : c'est le
    // drapeau qui fait foi, pas le nom.
    expect(
      mapAlertEvent('channel.subscription.gift', {
        user_name: 'AnAnonymousGifter',
        total: 5,
        is_anonymous: true,
      })
    ).toEqual({ kind: 'gift', actorName: null, amount: 5, tier: null });

    expect(
      mapAlertEvent('channel.cheer', {
        user_name: 'AnAnonymousCheerer',
        bits: 100,
        is_anonymous: true,
      })
    ).toEqual({ kind: 'cheer', actorName: null, amount: 100, tier: null });
  });

  it('3. un raid se lit du côté de celle qui ARRIVE', () => {
    expect(
      mapAlertEvent('channel.raid', {
        from_broadcaster_user_name: 'Iguel',
        to_broadcaster_user_name: 'Women’s Cup',
        viewers: 42,
      })
    ).toEqual({ kind: 'raid', actorName: 'Iguel', amount: 42, tier: null });
  });

  it('3bis. et la chaîne concernée est la DESTINATAIRE du raid', () => {
    // Sinon on classerait l'event sous l'espace de la chaîne qui nous raid.
    expect(
      readBroadcasterId('channel.raid', {
        from_broadcaster_user_id: '999',
        to_broadcaster_user_id: '1457667837',
      })
    ).toBe('1457667837');
    expect(
      readBroadcasterId('channel.follow', { broadcaster_user_id: '1457667837' })
    ).toBe('1457667837');
  });
});

describe('mapAlertEvent — le reste des types', () => {
  it('un follow n’a ni quantité ni palier', () => {
    expect(mapAlertEvent('channel.follow', { user_name: 'Nova' })).toEqual({
      kind: 'follow',
      actorName: 'Nova',
      amount: null,
      tier: null,
    });
  });

  it('un resub annonce les mois CUMULÉS', () => {
    // C'est le chiffre que la spectatrice annonce elle-même ; la série en cours
    // (`streak_months`) dirait autre chose et surprendrait.
    expect(
      mapAlertEvent('channel.subscription.message', {
        user_name: 'Fidèle',
        cumulative_months: 24,
        streak_months: 3,
        tier: '3000',
      })
    ).toEqual({ kind: 'resub', actorName: 'Fidèle', amount: 24, tier: '3000' });
  });

  it('un cheer porte ses bits', () => {
    expect(
      mapAlertEvent('channel.cheer', { user_name: 'Aru', bits: 1500 })
    ).toEqual({ kind: 'cheer', actorName: 'Aru', amount: 1500, tier: null });
  });
});

describe('mapAlertEvent — ce qui ne doit rien produire', () => {
  it('un type auquel on n’est pas abonné', () => {
    // `null` n'est pas une erreur : l'appelant acquitte en 200, sinon Twitch
    // retente puis désactive la souscription.
    expect(mapAlertEvent('channel.ban', { user_name: 'X' })).toBeNull();
  });

  it('une charge vide ou absurde', () => {
    expect(mapAlertEvent('channel.follow', null)).toBeNull();
    expect(mapAlertEvent('channel.follow', undefined)).toBeNull();
  });
});

describe('mapAlertEvent — nettoyage des valeurs', () => {
  it('retombe sur le login quand le nom d’affichage manque', () => {
    expect(
      mapAlertEvent('channel.follow', { user_login: 'nova_ow' })?.actorName
    ).toBe('nova_ow');
  });

  it('écarte un nom vide plutôt que d’afficher du blanc', () => {
    expect(
      mapAlertEvent('channel.follow', { user_name: '   ' })?.actorName
    ).toBeNull();
  });

  it('borne le nom à ce que la base accepte', () => {
    const long = 'a'.repeat(200);
    expect(
      mapAlertEvent('channel.follow', { user_name: long })?.actorName
    ).toHaveLength(60);
  });

  it('accepte un nombre envoyé en chaîne', () => {
    expect(
      mapAlertEvent('channel.cheer', { user_name: 'A', bits: '250' })?.amount
    ).toBe(250);
  });

  it('écarte une quantité absurde', () => {
    expect(
      mapAlertEvent('channel.cheer', { user_name: 'A', bits: -5 })?.amount
    ).toBeNull();
    expect(
      mapAlertEvent('channel.cheer', { user_name: 'A', bits: 'beaucoup' })
        ?.amount
    ).toBeNull();
  });

  it('n’accepte qu’un palier que la base connaît', () => {
    // Le CHECK de la colonne refuserait le reste : l'insertion échouerait, et
    // l'alerte serait perdue pour une raison sans rapport avec elle.
    expect(
      mapAlertEvent('channel.subscribe', { user_name: 'A', tier: '1000' })?.tier
    ).toBe('1000');
    expect(
      mapAlertEvent('channel.subscribe', { user_name: 'A', tier: 'Prime' })
        ?.tier
    ).toBe('prime');
    expect(
      mapAlertEvent('channel.subscribe', { user_name: 'A', tier: '9999' })?.tier
    ).toBeNull();
  });
});

describe('ALERT_SUBSCRIPTIONS', () => {
  it('déclare le scope exigé par chaque type', () => {
    // Sans scope déclaré, l'abonnement échoue en 403 chez Twitch et personne ne
    // sait pourquoi une alerte ne part jamais.
    const byType = Object.fromEntries(
      ALERT_SUBSCRIPTIONS.map((s) => [s.type, s.scope])
    );
    expect(byType['channel.subscribe']).toBe('channel:read:subscriptions');
    expect(byType['channel.cheer']).toBe('bits:read');
    expect(byType['channel.follow']).toBe('moderator:read:followers');
    // Un raid entrant est public : aucun scope à demander.
    expect(byType['channel.raid']).toBeNull();
  });
});
