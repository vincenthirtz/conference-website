// Cadeau d'accueil d'une supportrice.
// Target: utils/tcg/grantSelfWelcome.ts
//
// CE QUE CES CAS PROTÈGENT.
//
//   1. LA CLÉ D'UNICITÉ EST LE TENANT, PAS LE TOURNOI. C'est la seule chose qui
//      distingue ce cadeau de celui des participantes, et elle vit dans
//      `source_ref`. Un jour où quelqu'un « harmonisera » les deux sources, ces
//      cas diront pourquoi elles sont séparées.
//
//   2. LE RÔLE EST UNE ÉTIQUETTE, DONC IL SE VÉRIFIE. Rien n'empêche une
//      joueuse de cocher « supportrice » à l'inscription : sans le refus sur
//      roster, elle encaisserait ce cadeau EN PLUS de celui de son édition.
//
//   3. UNE ERREUR DE LECTURE N'EST PAS UN REFUS. Un compte sans rôle est « pas
//      supportrice » ; une base injoignable est une panne. Les confondre
//      afficherait « tu n'y as pas droit » à cause d'un incident réseau.
//
//   4. L'ÉCRITURE PARTIELLE EST RENDUE, PAS AVALÉE. Le mock n'évalue aucun
//      `CHECK` — c'est ainsi que 58 paquets ont été perdus en silence le
//      2026-09-14. `setTableWriteError` ne simule pas la contrainte : il teste
//      ce que le code FAIT quand une écriture est refusée.

import { beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAdminUser,
  setTableWriteError,
} from './__helpers__/supabaseMock';
import { grantSelfWelcome } from '../../utils/tcg/grantSelfWelcome';
import { earnReward } from '../../utils/tcg/earnSources';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const SUPPORTER = '3f2a1c44-5b6d-4e7f-8a9b-0c1d2e3f4a5b';
const JOUEUSE = '7c8d9e01-2f3a-4b5c-8d6e-7f8091a2b3c4';
const TEAM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
/** Une owner de l'espace, qui ne figure sur aucun roster. */
const OWNER = '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b';

const REWARD = earnReward('supporter_welcome');

const entries = () =>
  (store.tcg_wallet_entries ?? []) as Array<Record<string, unknown>>;
const packs = () => (store.tcg_packs ?? []) as Array<Record<string, unknown>>;

beforeEach(() => {
  resetSupabaseMock();
  setAdminUser(SUPPORTER, 'supportrice@example.org', {
    user_metadata: { role: 'supporter' },
  });
  setAdminUser(JOUEUSE, 'joueuse@example.org', {
    user_metadata: { role: 'player' },
  });
  setAdminUser(OWNER, 'owner@example.org', {
    user_metadata: { role: 'owner' },
  });
  store.team_members = [] as never;
  store.staff = [] as never;
});

/** Inscrit un compte au staff de la plateforme. */
function seedStaff(
  userId: string,
  over: { isActive?: boolean; deletedAt?: string | null } = {}
) {
  (store.staff ||= []).push({
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    auth_user_id: userId,
    role: 'owner',
    is_active: over.isActive ?? true,
    deleted_at: over.deletedAt ?? null,
  } as never);
}

describe('grantSelfWelcome — qui y a droit', () => {
  it('ouvre la porte à un compte STAFF hors roster', async () => {
    // LE TROU QUE CE LOT BOUCHE. Six des sept comptes staff n'avaient aucune
    // voie d'entrée : le cadeau d'édition énumère les rosters, celui de
    // supportrice exige l'étiquette `supporter`, les pronostics refusent le
    // staff, et victoires comme séries de check-ins supposent qu'on joue.
    seedStaff(OWNER);

    const out = await grantSelfWelcome({ tenantId: TENANT, userId: OWNER });

    expect(out).toEqual({
      status: 'granted',
      coins: REWARD.coins,
      packGranted: true,
      ground: 'staff',
    });
  });

  it('laisse au registre une étiquette DISTINCTE de celle des supportrices', async () => {
    // Ce n'est pas un détail de vocabulaire : `supporter_welcome` figure dans
    // `TENANT_ATTACHING_WALLET_SOURCES`, la liste des gains qui prouvent une
    // présence qu'un staff n'a PAS pu fabriquer. Y faire entrer un cadeau que
    // le staff se réclame à lui-même viderait cette garde de son sens.
    seedStaff(OWNER);

    await grantSelfWelcome({ tenantId: TENANT, userId: OWNER });

    expect(entries()).toHaveLength(1);
    expect(entries()[0].source_kind).toBe('staff_welcome');
  });

  it('donne au staff EXACTEMENT ce qu’il donne à une supportrice', async () => {
    // Un staff qui s'accorderait plus qu'une joueuse ne jouerait plus au même
    // jeu qu'elle.
    expect(earnReward('staff_welcome')).toEqual(
      earnReward('supporter_welcome')
    );
  });

  it('ne le donne qu’une fois, même au staff', async () => {
    seedStaff(OWNER);

    await grantSelfWelcome({ tenantId: TENANT, userId: OWNER });
    const second = await grantSelfWelcome({ tenantId: TENANT, userId: OWNER });

    expect(second).toEqual({ status: 'already' });
    expect(entries()).toHaveLength(1);
    expect(packs()).toHaveLength(1);
  });

  it('renvoie un staff SUR UN ROSTER vers le cadeau d’édition', async () => {
    // Les deux accueils ne se cumulent pas. Un staff qui joue reçoit le sien
    // comme n'importe quelle joueuse, par la même voie.
    seedStaff(OWNER);
    (store.team_members ||= []).push({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      tenant_id: TENANT,
      user_id: OWNER,
      team_id: TEAM,
      accepted_at: '2026-01-01T00:00:00.000Z',
    } as never);

    const out = await grantSelfWelcome({ tenantId: TENANT, userId: OWNER });

    expect(out).toEqual({ status: 'on_roster' });
    expect(entries()).toHaveLength(0);
  });

  it('refuse un staff DÉSACTIVÉ', async () => {
    // Un staff désactivé est traité comme s'il n'existait pas partout ailleurs
    // pour les droits ; un accueil est un droit comme un autre.
    seedStaff(OWNER, { isActive: false });

    const out = await grantSelfWelcome({ tenantId: TENANT, userId: OWNER });

    expect(out).toEqual({ status: 'not_eligible' });
    expect(entries()).toHaveLength(0);
  });

  it('accorde le cadeau à une supportrice hors roster', async () => {
    const out = await grantSelfWelcome({
      tenantId: TENANT,
      userId: SUPPORTER,
    });

    expect(out).toEqual({
      status: 'granted',
      coins: REWARD.coins,
      packGranted: true,
      // Le MOTIF est rendu : c'est lui qui décide de l'étiquette laissée au
      // registre (`supporter_welcome` ou `staff_welcome`), et le savoir évite
      // de le redéduire ailleurs.
      ground: 'supporter',
    });
    expect(entries()).toHaveLength(1);
    expect(packs()).toHaveLength(1);
  });

  it('refuse un compte qui n’est pas supportrice', async () => {
    const out = await grantSelfWelcome({
      tenantId: TENANT,
      userId: JOUEUSE,
    });

    expect(out).toEqual({ status: 'not_eligible' });
    expect(entries()).toHaveLength(0);
    expect(packs()).toHaveLength(0);
  });

  it('traite un compte SANS rôle comme « pas supportrice », pas comme une panne', async () => {
    // Le travers inverse — `if (error) return null` — transforme une absence en
    // décision. Ici l'absence est bien une décision, et il faut que ce soit la
    // BONNE : un refus lisible, pas un 500.
    setAdminUser(SUPPORTER, 'sansrole@example.org', { user_metadata: {} });

    const out = await grantSelfWelcome({
      tenantId: TENANT,
      userId: SUPPORTER,
    });

    expect(out).toEqual({ status: 'not_eligible' });
  });

  it('refuse une supportrice qui figure sur un roster', async () => {
    // Le rôle de compte est choisi à l'inscription : sans ce garde-fou, une
    // joueuse cocherait « supportrice » et cumulerait les deux accueils.
    store.team_members = [
      { team_id: TEAM, tenant_id: TENANT, user_id: SUPPORTER },
    ] as never;

    const out = await grantSelfWelcome({
      tenantId: TENANT,
      userId: SUPPORTER,
    });

    expect(out).toEqual({ status: 'on_roster' });
    expect(entries()).toHaveLength(0);
  });
});

describe('grantSelfWelcome — ce qui est écrit', () => {
  it('ancre l’unicité sur le TENANT, jamais sur un tournoi', async () => {
    // LE point du module : c'est `source_ref = tenant` qui réalise « une fois
    // par compte ». Le cadeau d'édition, lui, porte le tournoi.
    await grantSelfWelcome({ tenantId: TENANT, userId: SUPPORTER });

    const entry = entries()[0];
    expect(entry.source_kind).toBe('supporter_welcome');
    expect(entry.source_ref).toBe(TENANT);
    expect(entry.amount).toBe(REWARD.coins);
  });

  it('accorde un paquet SANS match, marqué `welcome`', async () => {
    await grantSelfWelcome({ tenantId: TENANT, userId: SUPPORTER });

    const pack = packs()[0];
    // `welcome` était DÉJÀ admis par les deux CHECK de `tcg_packs` : aucune
    // migration de cette table n'a été nécessaire, et c'est vérifié, pas supposé.
    expect(pack.source_kind).toBe('welcome');
    expect(pack.source_match_id).toBeNull();
  });
});

describe('grantSelfWelcome — rejeu', () => {
  it('rejoué, n’accorde RIEN de plus', async () => {
    const input = { tenantId: TENANT, userId: SUPPORTER };

    const first = await grantSelfWelcome(input);
    const second = await grantSelfWelcome(input);

    expect(first.status).toBe('granted');
    // `tcg_packs` n'a aucune unicité exploitable ici (source_match_id NULL, et
    // deux NULL sont distincts) : si le second passage accordait un paquet, on
    // en aurait deux.
    expect(second).toEqual({ status: 'already' });
    expect(entries()).toHaveLength(1);
    expect(packs()).toHaveLength(1);
  });
});

describe('grantSelfWelcome — simulation', () => {
  it('dryRun annonce « réclamable » sans rien écrire', async () => {
    const out = await grantSelfWelcome({
      tenantId: TENANT,
      userId: SUPPORTER,
      dryRun: true,
    });

    expect(out).toEqual({
      status: 'claimable',
      coins: REWARD.coins,
      ground: 'supporter',
    });
    expect(entries()).toHaveLength(0);
    expect(packs()).toHaveLength(0);
  });

  it('dryRun applique les MÊMES refus que l’écriture', async () => {
    // C'est la raison d'être du `dryRun` partagé : la carte ne doit jamais
    // proposer un bouton que le POST refuserait ensuite.
    expect(
      await grantSelfWelcome({
        tenantId: TENANT,
        userId: JOUEUSE,
        dryRun: true,
      })
    ).toEqual({ status: 'not_eligible' });
  });

  it('dryRun voit le cadeau déjà pris', async () => {
    await grantSelfWelcome({ tenantId: TENANT, userId: SUPPORTER });

    expect(
      await grantSelfWelcome({
        tenantId: TENANT,
        userId: SUPPORTER,
        dryRun: true,
      })
    ).toEqual({ status: 'already' });
  });
});

describe('grantSelfWelcome — écriture partielle', () => {
  it('rend packGranted:false quand le paquet est refusé — le cas du 2026-09-14', async () => {
    setTableWriteError('tcg_packs', {
      message: 'new row violates check constraint',
    });

    const out = await grantSelfWelcome({
      tenantId: TENANT,
      userId: SUPPORTER,
    });

    // Les pièces sont écrites et ne seront PAS rejouées : c'est le choix assumé
    // de l'ordre d'écriture.
    expect(out).toEqual({
      status: 'granted',
      coins: REWARD.coins,
      packGranted: false,
      ground: 'supporter',
    });
    expect(entries()).toHaveLength(1);
    expect(packs()).toHaveLength(0);
  });

  it('après un échec de paquet, le rejeu ne répare rien', async () => {
    // Corollaire de l'idempotence : les pièces existant déjà, le `RETURNING` ne
    // rend plus personne. La réparation est manuelle — c'est exactement
    // pourquoi l'écran doit AFFICHER l'écart plutôt qu'un succès.
    const input = { tenantId: TENANT, userId: SUPPORTER };

    setTableWriteError('tcg_packs', { message: 'violates check constraint' });
    await grantSelfWelcome(input);

    setTableWriteError('tcg_packs', null);
    expect(await grantSelfWelcome(input)).toEqual({ status: 'already' });
    expect(packs()).toHaveLength(0);
  });
});
