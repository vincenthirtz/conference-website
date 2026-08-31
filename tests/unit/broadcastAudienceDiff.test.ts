// `computeUnsentRecipients` — le diff PAR IDENTITÉ d'une campagne.
//
// Il répond à une question que `computeNewRecipients` ne sait pas traiter :
// « j'ai changé l'audience, qui vient d'entrer et n'a pas déjà reçu ce
// message ? ». Le second filtre sur la DATE DE CRÉATION du compte, donc il
// écarte par construction les comptes anciens — c'est-à-dire exactement les
// gens qu'un changement d'audience fait entrer. Le test le plus important de
// ce fichier est celui qui oppose les deux.
//
// L'autre chose à tenir : quand un envoi passé n'a laissé AUCUNE trace par
// destinataire, le diff ne distingue rien. On le SIGNALE (`untracedPreviousSend`)
// au lieu de renvoyer « tout le monde est nouveau » l'air de rien.

import { describe, it, expect, beforeEach } from 'vitest';

import { store, resetSupabaseMock, setAuthListUsers } from './__helpers__/supabaseMock';
import {
  computeUnsentRecipients,
  computeNewRecipients,
} from '../../utils/broadcasts';

const CAMPAIGN = 'annonce-test';
const OLD = '2026-01-01T00:00:00Z';
const RECENT = '2026-08-30T00:00:00Z';

function user(id: string, createdAt: string) {
  return {
    id,
    email: `${id}@x.com`,
    email_confirmed_at: '2026-01-01',
    created_at: createdAt,
  } as any;
}

beforeEach(() => {
  resetSupabaseMock();
  store.teams = [] as any;
  store.team_members = [] as any;
  store.broadcast_recipients = [] as any;
  store.staff_logs = [] as any;
});

describe('computeUnsentRecipients', () => {
  it('écarte les identités déjà servies, garde les autres', () => {
    setAuthListUsers([user('a', OLD), user('b', OLD), user('c', OLD)]);
    store.broadcast_recipients = [
      { campaign_id: CAMPAIGN, user_id: 'a', status: 'sent', sent_at: RECENT },
    ] as any;

    return computeUnsentRecipients(CAMPAIGN, 'all-confirmed-users').then(
      (res) => {
        expect(res.unsentRecipients.map((r) => r.user_id).sort()).toEqual([
          'b',
          'c',
        ]);
        expect(res.alreadySent).toBe(1);
        expect(res.audienceTotal).toBe(3);
        expect(res.tracedSent).toBe(1);
      }
    );
  });

  // LE test : le même jeu de données, deux fonctions, deux réponses.
  it('trouve les comptes ANCIENS que « nouveaux inscrits » rate', async () => {
    setAuthListUsers([user('ancien', OLD), user('servi', OLD)]);
    store.broadcast_recipients = [
      {
        campaign_id: CAMPAIGN,
        user_id: 'servi',
        status: 'sent',
        sent_at: RECENT,
      },
    ] as any;

    // Filtre daté : « ancien » a rejoint AVANT le dernier envoi, donc écarté.
    const dated = await computeNewRecipients(CAMPAIGN, 'all-confirmed-users');
    expect(dated.newRecipients.map((r) => r.user_id)).toEqual([]);

    // Diff d'identité : « ancien » n'a jamais reçu cette campagne, donc gardé.
    const diff = await computeUnsentRecipients(CAMPAIGN, 'all-confirmed-users');
    expect(diff.unsentRecipients.map((r) => r.user_id)).toEqual(['ancien']);
  });

  it('campagne jamais envoyée : toute l’audience est à servir', async () => {
    setAuthListUsers([user('a', OLD), user('b', RECENT)]);
    const res = await computeUnsentRecipients(CAMPAIGN, 'all-confirmed-users');
    expect(res.unsentRecipients).toHaveLength(2);
    expect(res.alreadySent).toBe(0);
    expect(res.lastSentAt).toBeNull();
    // Jamais envoyée ⇒ pas d'envoi sans trace à signaler.
    expect(res.untracedPreviousSend).toBe(false);
  });

  it('signale un envoi passé SANS trace par destinataire', async () => {
    // Le cas piège : un envoi historique n'a laissé qu'un compteur agrégé.
    // Le diff verrait « tout le monde est nouveau » et réexpédierait la
    // campagne entière en croyant bien faire.
    setAuthListUsers([user('a', OLD), user('b', OLD)]);
    store.broadcast_recipients = [] as any;
    // `fetchLastSentAt` lit le journal staff par `entity_type = 'broadcast'`
    // et `payload->>campaign` : c'est la seule trace que laissaient les envois
    // historiques.
    store.staff_logs = [
      {
        action: 'send_broadcast',
        entity_type: 'broadcast',
        entity_id: CAMPAIGN,
        created_at: RECENT,
        payload: { campaign: CAMPAIGN, sent: 2 },
      },
    ] as any;

    const res = await computeUnsentRecipients(CAMPAIGN, 'all-confirmed-users');
    expect(res.lastSentAt).not.toBeNull();
    expect(res.tracedSent).toBe(0);
    expect(res.untracedPreviousSend).toBe(true);
    // On ne cache pas la cible : c'est bien toute l'audience qui sortirait.
    expect(res.unsentRecipients).toHaveLength(2);
  });

  it('ne compte pas deux fois une identité tracée hors audience', async () => {
    // Quelqu'un servi par une audience précédente et qui n'est plus dans
    // l'audience actuelle : il compte dans `tracedSent`, pas dans
    // `alreadySent`, qui ne parle que de l'audience du jour.
    setAuthListUsers([user('a', OLD)]);
    store.broadcast_recipients = [
      { campaign_id: CAMPAIGN, user_id: 'a', status: 'sent', sent_at: RECENT },
      {
        campaign_id: CAMPAIGN,
        user_id: 'parti',
        status: 'sent',
        sent_at: RECENT,
      },
    ] as any;

    const res = await computeUnsentRecipients(CAMPAIGN, 'all-confirmed-users');
    expect(res.unsentRecipients).toHaveLength(0);
    expect(res.alreadySent).toBe(1);
    expect(res.tracedSent).toBe(2);
  });
});
