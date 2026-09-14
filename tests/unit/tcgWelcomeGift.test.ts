// Cadeau d'accueil d'une édition.
// Target: utils/tcg/grantWelcomeGift.ts
//
// CE QUE CES CAS PROTÈGENT, ET POURQUOI C'EST LE MODULE LE PLUS FRAGILE DU LOT.
//
//   1. L'ÉNUMÉRATION PASSE PAR L'ENGAGEMENT, PAS PAR LES FEUILLES DE MATCH.
//      Vérifié en base le 2026-09-14 : la Cup 2026 a 30 matchs planifiés et
//      ZÉRO ligne dans `match_participants`, le tournoi n'ayant pas commencé.
//      Un cadeau calculé sur les feuilles n'aurait crédité PERSONNE — au moment
//      précis où il doit servir. Le cas `match_participants` vide est donc ici,
//      explicitement, pour qu'un futur « simplifions, prenons les participantes
//      du match » échoue au lieu de vider le cadeau en silence.
//
//   2. L'IDEMPOTENCE VIENT DU PORTE-MONNAIE, PAS DES PAQUETS. `tcg_packs` n'a
//      aucune ancre exploitable ici : un cadeau n'a pas de match, donc
//      `source_match_id` est NULL, et deux NULL sont DISTINCTS dans une
//      contrainte UNIQUE. Rien n'empêche d'y insérer dix fois la même ligne.
//      La protection est l'ORDRE : pièces d'abord en `ON CONFLICT DO NOTHING
//      ... RETURNING`, paquet ensuite aux seules lignes rendues.
//
//      Ces cas ne valent que parce que le mock honore `ignoreDuplicates` et
//      rend, sur un `.select()` chaîné, les seules lignes réellement insérées —
//      sémantique vérifiée sur la vraie base avant d'être simulée. Sans cela,
//      un test « rejouer n'ajoute rien » passerait au vert pour la mauvaise
//      raison : la ligne réécrite plutôt que refusée.
//
//   3. LE MONTANT VIENT DU REGISTRE. Écrire « 100 » ici figerait le barème que
//      `earnSources.ts` existe pour rendre réglable.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setTableWriteError,
} from './__helpers__/supabaseMock';
import { grantWelcomeGift } from '../../utils/tcg/grantWelcomeGift';
import { earnReward } from '../../utils/tcg/earnSources';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const OTHER_TENANT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const TOURNAMENT = 'e8fa740c-d92b-49d8-a654-05a37d0eea3b';
const OTHER_TOURNAMENT = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const STAGE = '11111111-1111-4111-8111-111111111111';
const TEAM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEAM_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const ALICE = 'user-alice';
const BEA = 'user-bea';
const CHLOE = 'user-chloe';

const REWARD = earnReward('welcome_gift');

function entries() {
  return (store.tcg_wallet_entries ?? []) as Array<Record<string, unknown>>;
}
function packs() {
  return (store.tcg_packs ?? []) as Array<Record<string, unknown>>;
}
function wallets() {
  return (store.tcg_wallets ?? []) as Array<Record<string, unknown>>;
}

/**
 * Deux équipes engagées dans l'unique phase de l'édition, trois joueuses.
 *
 * BEA est inscrite DANS LES DEUX équipes : le cas s'est produit en base
 * (2 joueuses sur 60 lignes de roster), et sans dédoublonnage elle recevrait
 * deux écritures dont la seconde serait refusée par la contrainte d'unicité.
 */
function seedEngaged() {
  store.tournament_stages = [
    { id: STAGE, tenant_id: TENANT, tournament_id: TOURNAMENT },
    {
      id: 'stage-autre',
      tenant_id: TENANT,
      tournament_id: OTHER_TOURNAMENT,
    },
  ] as never;

  store.stage_teams = [
    { stage_id: STAGE, team_id: TEAM_A, tenant_id: TENANT },
    { stage_id: STAGE, team_id: TEAM_B, tenant_id: TENANT },
    // Équipe d'une AUTRE édition : ne doit jamais être créditée.
    { stage_id: 'stage-autre', team_id: 'team-autre', tenant_id: TENANT },
  ] as never;

  store.team_members = [
    {
      team_id: TEAM_A,
      tenant_id: TENANT,
      user_id: ALICE,
      is_substitute: false,
    },
    { team_id: TEAM_A, tenant_id: TENANT, user_id: BEA, is_substitute: true },
    { team_id: TEAM_B, tenant_id: TENANT, user_id: BEA, is_substitute: false },
    {
      team_id: TEAM_B,
      tenant_id: TENANT,
      user_id: CHLOE,
      is_substitute: false,
    },
    // Ligne sans compte : rien à créditer, et surtout aucun plantage.
    { team_id: TEAM_B, tenant_id: TENANT, user_id: null, is_substitute: false },
    // Roster d'une autre édition.
    {
      team_id: 'team-autre',
      tenant_id: TENANT,
      user_id: 'user-hors-edition',
      is_substitute: false,
    },
  ] as never;
}

beforeEach(() => {
  resetSupabaseMock();
  seedEngaged();
});

describe('grantWelcomeGift — qui est participante', () => {
  it('crédite les rosters ENGAGÉS, dédoublonnés, remplaçantes comprises', async () => {
    const report = await grantWelcomeGift({
      tenantId: TENANT,
      tournamentId: TOURNAMENT,
    });

    // ALICE, BEA (inscrite deux fois), CHLOE — pas la joueuse hors édition,
    // pas la ligne sans compte.
    expect(report.eligible).toBe(3);
    expect(report.granted).toBe(3);
    expect(report.teams).toBe(2);
    expect(entries()).toHaveLength(3);

    const credited = entries()
      .map((e) => e.user_id)
      .sort();
    expect(credited).toEqual([ALICE, BEA, CHLOE].sort());
  });

  it('NE DÉPEND PAS des feuilles de match — le cas qui a décidé du lot', async () => {
    // La Cup 2026 avait 30 matchs planifiés et zéro participation enregistrée.
    // Le cadeau doit fonctionner sur un tournoi qui n'a pas commencé.
    store.match_participants = [] as never;

    const report = await grantWelcomeGift({
      tenantId: TENANT,
      tournamentId: TOURNAMENT,
    });

    expect(report.granted).toBe(3);
  });

  it('ne crédite rien sur une édition sans équipe engagée', async () => {
    const report = await grantWelcomeGift({
      tenantId: TENANT,
      tournamentId: OTHER_TOURNAMENT,
    });

    // Une seule équipe engagée, mais son roster n'a qu'un compte.
    expect(report.teams).toBe(1);
    expect(report.granted).toBe(1);
  });

  it('ignore les équipes d’un AUTRE espace', async () => {
    const report = await grantWelcomeGift({
      tenantId: OTHER_TENANT,
      tournamentId: TOURNAMENT,
    });

    expect(report.eligible).toBe(0);
    expect(report.granted).toBe(0);
    expect(entries()).toHaveLength(0);
  });
});

describe('grantWelcomeGift — ce qui est donné', () => {
  it('crédite le montant du REGISTRE, jamais une valeur recopiée', async () => {
    await grantWelcomeGift({ tenantId: TENANT, tournamentId: TOURNAMENT });

    for (const entry of entries()) {
      expect(entry.amount).toBe(REWARD.coins);
      expect(entry.source_kind).toBe('welcome_gift');
      // `source_ref` = le TOURNOI : c'est lui qui réalise « un cadeau par
      // personne et par édition » via la contrainte d'unicité.
      expect(entry.source_ref).toBe(TOURNAMENT);
    }
  });

  it('accorde un paquet SANS match, marqué `welcome`', async () => {
    await grantWelcomeGift({ tenantId: TENANT, tournamentId: TOURNAMENT });

    expect(packs()).toHaveLength(3);
    for (const pack of packs()) {
      expect(pack.source_kind).toBe('welcome');
      // Le vocabulaire de `tcg_packs` diffère de celui du porte-monnaie, et
      // c'est aussi pourquoi son index unique ne protège de rien ici.
      expect(pack.source_match_id).toBeNull();
    }
  });

  it('écrit le solde comme la somme du registre, pas un incrément', async () => {
    await grantWelcomeGift({ tenantId: TENANT, tournamentId: TOURNAMENT });

    const wallet = wallets().find((w) => w.user_id === ALICE);
    expect(wallet?.balance).toBe(REWARD.coins);
  });
});

describe('grantWelcomeGift — rejeu', () => {
  it('rejoué, n’attribue RIEN de plus — ni pièces, ni paquets', async () => {
    const input = { tenantId: TENANT, tournamentId: TOURNAMENT };

    const first = await grantWelcomeGift(input);
    const second = await grantWelcomeGift(input);

    expect(first.granted).toBe(3);
    // LE point du module : `tcg_packs` n'a aucune unicité exploitable pour un
    // cadeau. Si le second passage accordait des paquets, on en aurait six.
    expect(second.granted).toBe(0);
    expect(second.packsGranted).toBe(0);
    expect(entries()).toHaveLength(3);
    expect(packs()).toHaveLength(3);

    // Et le solde n'a pas doublé : il se recalcule depuis le registre.
    const wallet = wallets().find((w) => w.user_id === ALICE);
    expect(wallet?.balance).toBe(REWARD.coins);
  });

  it('ne crédite QUE les arrivées récentes lors d’un second passage', async () => {
    // L'usage prévu : relancer après qu'une joueuse a rejoint un roster.
    const input = { tenantId: TENANT, tournamentId: TOURNAMENT };
    await grantWelcomeGift(input);

    (store.team_members as Array<Record<string, unknown>>).push({
      team_id: TEAM_A,
      tenant_id: TENANT,
      user_id: 'user-tardive',
      is_substitute: false,
    });

    const second = await grantWelcomeGift(input);

    expect(second.eligible).toBe(4);
    expect(second.alreadyGifted).toBe(3);
    expect(second.granted).toBe(1);
    expect(second.packsGranted).toBe(1);
    expect(entries()).toHaveLength(4);
    expect(packs()).toHaveLength(4);
  });

  it('une édition suivante donne un NOUVEAU cadeau', async () => {
    // Corollaire assumé de `source_ref = tournoi` : c'est un cadeau de
    // bienvenue au TOURNOI, pas au site.
    await grantWelcomeGift({ tenantId: TENANT, tournamentId: TOURNAMENT });
    const next = await grantWelcomeGift({
      tenantId: TENANT,
      tournamentId: OTHER_TOURNAMENT,
    });

    expect(next.granted).toBe(1);
  });
});

describe('grantWelcomeGift — écriture partielle', () => {
  it('rend packsGranted < granted quand les paquets sont refusés — le cas du 2026-09-14', async () => {
    // CE TEST EXISTE PARCE QUE LA PRODUCTION L'A FAIT. `tcg_packs` portait DEUX
    // contraintes sur `source_kind` ; la migration du cadeau n'en avait élargi
    // qu'une, et `tcg_packs_source_coherent` — qui ne nomme pas la colonne —
    // rejetait chaque paquet `welcome` en 23514. 58 comptes ont reçu leurs
    // pièces, aucun son paquet, et l'email annonçant les deux était déjà parti.
    //
    // Aucun test ne pouvait l'attraper : le mock n'évalue pas les `CHECK`. Ce
    // cas ne teste donc pas la contrainte (c'est le rôle de la migration) mais
    // le COMPORTEMENT face à un refus — la partie qui a échoué en silence.
    setTableWriteError('tcg_packs', {
      message: 'new row violates check constraint "tcg_packs_source_coherent"',
    });

    const report = await grantWelcomeGift({
      tenantId: TENANT,
      tournamentId: TOURNAMENT,
    });

    // Les pièces restent écrites, et ne seront pas rejouées : c'est le choix
    // assumé de l'ordre d'écriture, pas un effet de bord.
    expect(report.granted).toBe(3);
    expect(entries()).toHaveLength(3);

    // L'ÉCART EST RENDU, PAS AVALÉ. C'est cette valeur que l'écran compare à
    // `granted` avant d'oser afficher un succès.
    expect(report.packsGranted).toBe(0);
    expect(packs()).toHaveLength(0);
  });

  it('un rejeu après le refus ne répare RIEN — la réparation est manuelle', async () => {
    // Le corollaire cruel de l'idempotence, et la raison pour laquelle les 58
    // paquets ont dû être rattrapés en SQL : le second passage ne crédite que
    // les comptes que le `ON CONFLICT DO NOTHING ... RETURNING` vient de
    // rendre. Les pièces existant déjà, il ne rend personne, donc n'accorde
    // aucun paquet — même une fois la contrainte réparée.
    const input = { tenantId: TENANT, tournamentId: TOURNAMENT };

    setTableWriteError('tcg_packs', { message: 'violates check constraint' });
    await grantWelcomeGift(input);

    setTableWriteError('tcg_packs', null); // la contrainte est réparée
    const second = await grantWelcomeGift(input);

    expect(second.granted).toBe(0);
    expect(second.packsGranted).toBe(0);
    expect(packs()).toHaveLength(0); // toujours rien : il faut réparer à la main
  });
});

describe('grantWelcomeGift — simulation', () => {
  it('dryRun compte sans rien écrire', async () => {
    const report = await grantWelcomeGift({
      tenantId: TENANT,
      tournamentId: TOURNAMENT,
      dryRun: true,
    });

    expect(report.eligible).toBe(3);
    expect(report.teams).toBe(2);
    // Ce qu'annonce l'écran AVANT de laisser cliquer : on ne reprend pas un
    // paquet ouvert.
    expect(report.granted).toBe(0);
    expect(entries()).toHaveLength(0);
    expect(packs()).toHaveLength(0);
  });

  it('dryRun compte ceux qui ont DÉJÀ reçu', async () => {
    await grantWelcomeGift({ tenantId: TENANT, tournamentId: TOURNAMENT });

    const report = await grantWelcomeGift({
      tenantId: TENANT,
      tournamentId: TOURNAMENT,
      dryRun: true,
    });

    expect(report.eligible).toBe(3);
    expect(report.alreadyGifted).toBe(3);
  });
});
