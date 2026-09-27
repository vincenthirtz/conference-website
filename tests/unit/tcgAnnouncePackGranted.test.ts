// L'annonce d'un paquet TCG — `utils/tcg/announcePackGranted`, et ses appelants.
//
// POURQUOI CE FICHIER EXISTE. L'annonce vivait chez `grantVictoryRewards`, donc
// ne couvrait que les victoires. Les paquets d'ACCUEIL — la voie la plus
// nombreuse, un paquet par compte — étaient posés en silence, et la production
// départageait les deux nettement au 2026-09-27 :
//
//   victoire (annoncée)  : 39 paquets, 16 jamais ouverts (41 %)
//   accueil  (silencieux): 61 paquets, 37 jamais ouverts (61 %)
//
// Ces cas verrouillent la correction, et surtout ses DEUX BORDS — une annonce
// qui part quand rien n'a été écrit promet un paquet introuvable, et une
// annonce qui ne part pas laisse la joueuse ignorer ce qu'elle possède. Les
// deux sont silencieux en production : seul un compteur les distingue.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

const { emitBotEvent } = vi.hoisted(() => ({
  emitBotEvent: vi.fn(async () => ({ delivered: true, attempts: 1 })),
}));
vi.mock('@/utils/botEvents', () => ({ emitBotEvent }));

const { getDiscordLinksForUsers } = vi.hoisted(() => ({
  getDiscordLinksForUsers: vi.fn(async (userIds: string[]) => {
    const map = new Map<
      string,
      { discordUserId: string; discordUsername: string }
    >();
    for (const id of userIds) {
      // ALICE seule a lié son Discord : un compte non lié n'est PAS une erreur,
      // l'event part quand même et le bot décide.
      if (id === 'user-alice') {
        map.set(id, { discordUserId: '1', discordUsername: 'alice' });
      }
    }
    return map;
  }),
}));
vi.mock('@/utils/discordLinks', () => ({ getDiscordLinksForUsers }));

import {
  store,
  resetSupabaseMock,
  setTableWriteError,
} from './__helpers__/supabaseMock';
import { grantWelcomeGift } from '../../utils/tcg/grantWelcomeGift';
import { announcePackGranted } from '../../utils/tcg/announcePackGranted';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const TOURNAMENT = 'e8fa740c-d92b-49d8-a654-05a37d0eea3b';
const STAGE = '11111111-1111-4111-8111-111111111111';
const TEAM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ALICE = 'user-alice';
const BEA = 'user-bea';

/** Les events `tcg.pack_granted` émis, payload compris. */
function announced() {
  return emitBotEvent.mock.calls
    .filter((c: unknown[]) => c[0] === 'tcg.pack_granted')
    .map((c: unknown[]) => c[1] as Record<string, unknown>);
}

function seedEngaged() {
  store.tournament_stages = [
    { id: STAGE, tenant_id: TENANT, tournament_id: TOURNAMENT },
  ] as never;
  store.stage_teams = [
    { stage_id: STAGE, team_id: TEAM_A, tenant_id: TENANT },
  ] as never;
  store.team_members = [
    {
      team_id: TEAM_A,
      tenant_id: TENANT,
      user_id: ALICE,
      is_substitute: false,
    },
    { team_id: TEAM_A, tenant_id: TENANT, user_id: BEA, is_substitute: false },
  ] as never;
}

beforeEach(() => {
  resetSupabaseMock();
  emitBotEvent.mockClear();
  seedEngaged();
});

describe('announcePackGranted — le module', () => {
  it('émet un événement PAR destinataire, jamais un groupé', async () => {
    // Un envoi refusé (DM fermés) ne doit pas faire rejouer les autres au
    // retry, et un paquet est de toute façon individuel.
    await announcePackGranted({
      tenantId: TENANT,
      reason: 'welcome',
      coins: 100,
      recipients: [
        { userId: ALICE, packId: 'pack-1' },
        { userId: BEA, packId: 'pack-2' },
      ],
    });

    const events = announced();
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.userId).sort()).toEqual([ALICE, BEA]);
  });

  it('porte le lien Discord quand il existe, `null` sinon', async () => {
    await announcePackGranted({
      tenantId: TENANT,
      reason: 'welcome',
      coins: 100,
      recipients: [{ userId: ALICE }, { userId: BEA }],
    });

    const byUser = Object.fromEntries(announced().map((e) => [e.userId, e]));
    expect(byUser[ALICE].discordUserId).toBe('1');
    // Pas une erreur : juste un canal indisponible pour elle.
    expect(byUser[BEA].discordUserId).toBeNull();
  });

  it('omet `pack` quand l’identifiant est inconnu', async () => {
    // Une clé `pack:null` dédoublonnerait des paquets sans rapport : mieux vaut
    // laisser le bot retomber sur le couple (joueuse, match).
    await announcePackGranted({
      tenantId: TENANT,
      reason: 'victory',
      coins: 100,
      matchId: 'match-1',
      recipients: [{ userId: ALICE }],
    });
    expect(announced()[0]).not.toHaveProperty('pack');

    emitBotEvent.mockClear();
    await announcePackGranted({
      tenantId: TENANT,
      reason: 'welcome',
      coins: 100,
      recipients: [{ userId: ALICE, packId: 'pack-9' }],
    });
    expect(announced()[0].pack).toEqual({ id: 'pack-9' });
  });

  it('ne lève jamais, même si l’émission échoue', async () => {
    // Toutes les appelantes sont des hooks d'attribution : une annonce ratée ne
    // doit pas empêcher un paquet d'exister.
    emitBotEvent.mockRejectedValueOnce(new Error('boom'));
    await expect(
      announcePackGranted({
        tenantId: TENANT,
        reason: 'welcome',
        coins: 100,
        recipients: [{ userId: ALICE }],
      })
    ).resolves.toBeUndefined();
  });

  it('ne fait rien sans destinataire', async () => {
    await announcePackGranted({
      tenantId: TENANT,
      reason: 'welcome',
      coins: 100,
      recipients: [],
    });
    expect(emitBotEvent).not.toHaveBeenCalled();
  });
});

describe('grantWelcomeGift — le cadeau d’accueil s’annonce', () => {
  it('annonce une fois par compte crédité, avec la raison « welcome »', async () => {
    await grantWelcomeGift({ tenantId: TENANT, tournamentId: TOURNAMENT });

    const events = announced();
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.reason === 'welcome')).toBe(true);
    // Pas de match derrière un cadeau : le bot ne doit pas parler de victoire.
    expect(events.every((e) => e.matchId === null)).toBe(true);
    // L'identifiant du paquet sert de clé de déduplication au bot.
    expect(events.every((e) => (e.pack as { id?: string })?.id)).toBe(true);
  });

  it('n’annonce RIEN sur un rejeu', async () => {
    await grantWelcomeGift({ tenantId: TENANT, tournamentId: TOURNAMENT });
    emitBotEvent.mockClear();

    await grantWelcomeGift({ tenantId: TENANT, tournamentId: TOURNAMENT });
    // Le rejeu ne crédite personne, donc n'annonce personne : sans quoi chaque
    // relance du cadeau renotifierait toute l'édition.
    expect(announced()).toHaveLength(0);
  });

  it('n’annonce RIEN quand le paquet n’a pas pu être écrit', async () => {
    // Le cas s'est produit en production le 2026-09-14 : 58 paquets rejetés par
    // un CHECK pendant que les pièces, elles, étaient créditées. Annoncer là
    // enverrait un DM « ouvre ton paquet » vers une page qui n'en a aucun.
    setTableWriteError('tcg_packs', { message: 'contrainte refusée' });

    const report = await grantWelcomeGift({
      tenantId: TENANT,
      tournamentId: TOURNAMENT,
    });

    expect(report.packsGranted).toBe(0);
    expect(announced()).toHaveLength(0);
  });
});
