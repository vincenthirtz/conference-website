// Cadeau d'accueil d'une supportrice.
// Target: utils/tcg/grantSupporterWelcome.ts
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
import { grantSupporterWelcome } from '../../utils/tcg/grantSupporterWelcome';
import { earnReward } from '../../utils/tcg/earnSources';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const SUPPORTER = '3f2a1c44-5b6d-4e7f-8a9b-0c1d2e3f4a5b';
const JOUEUSE = '7c8d9e01-2f3a-4b5c-8d6e-7f8091a2b3c4';
const TEAM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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
  store.team_members = [] as never;
});

describe('grantSupporterWelcome — qui y a droit', () => {
  it('accorde le cadeau à une supportrice hors roster', async () => {
    const out = await grantSupporterWelcome({
      tenantId: TENANT,
      userId: SUPPORTER,
    });

    expect(out).toEqual({
      status: 'granted',
      coins: REWARD.coins,
      packGranted: true,
    });
    expect(entries()).toHaveLength(1);
    expect(packs()).toHaveLength(1);
  });

  it('refuse un compte qui n’est pas supportrice', async () => {
    const out = await grantSupporterWelcome({
      tenantId: TENANT,
      userId: JOUEUSE,
    });

    expect(out).toEqual({ status: 'not_supporter' });
    expect(entries()).toHaveLength(0);
    expect(packs()).toHaveLength(0);
  });

  it('traite un compte SANS rôle comme « pas supportrice », pas comme une panne', async () => {
    // Le travers inverse — `if (error) return null` — transforme une absence en
    // décision. Ici l'absence est bien une décision, et il faut que ce soit la
    // BONNE : un refus lisible, pas un 500.
    setAdminUser(SUPPORTER, 'sansrole@example.org', { user_metadata: {} });

    const out = await grantSupporterWelcome({
      tenantId: TENANT,
      userId: SUPPORTER,
    });

    expect(out).toEqual({ status: 'not_supporter' });
  });

  it('refuse une supportrice qui figure sur un roster', async () => {
    // Le rôle de compte est choisi à l'inscription : sans ce garde-fou, une
    // joueuse cocherait « supportrice » et cumulerait les deux accueils.
    store.team_members = [
      { team_id: TEAM, tenant_id: TENANT, user_id: SUPPORTER },
    ] as never;

    const out = await grantSupporterWelcome({
      tenantId: TENANT,
      userId: SUPPORTER,
    });

    expect(out).toEqual({ status: 'on_roster' });
    expect(entries()).toHaveLength(0);
  });
});

describe('grantSupporterWelcome — ce qui est écrit', () => {
  it('ancre l’unicité sur le TENANT, jamais sur un tournoi', async () => {
    // LE point du module : c'est `source_ref = tenant` qui réalise « une fois
    // par compte ». Le cadeau d'édition, lui, porte le tournoi.
    await grantSupporterWelcome({ tenantId: TENANT, userId: SUPPORTER });

    const entry = entries()[0];
    expect(entry.source_kind).toBe('supporter_welcome');
    expect(entry.source_ref).toBe(TENANT);
    expect(entry.amount).toBe(REWARD.coins);
  });

  it('accorde un paquet SANS match, marqué `welcome`', async () => {
    await grantSupporterWelcome({ tenantId: TENANT, userId: SUPPORTER });

    const pack = packs()[0];
    // `welcome` était DÉJÀ admis par les deux CHECK de `tcg_packs` : aucune
    // migration de cette table n'a été nécessaire, et c'est vérifié, pas supposé.
    expect(pack.source_kind).toBe('welcome');
    expect(pack.source_match_id).toBeNull();
  });
});

describe('grantSupporterWelcome — rejeu', () => {
  it('rejoué, n’accorde RIEN de plus', async () => {
    const input = { tenantId: TENANT, userId: SUPPORTER };

    const first = await grantSupporterWelcome(input);
    const second = await grantSupporterWelcome(input);

    expect(first.status).toBe('granted');
    // `tcg_packs` n'a aucune unicité exploitable ici (source_match_id NULL, et
    // deux NULL sont distincts) : si le second passage accordait un paquet, on
    // en aurait deux.
    expect(second).toEqual({ status: 'already' });
    expect(entries()).toHaveLength(1);
    expect(packs()).toHaveLength(1);
  });
});

describe('grantSupporterWelcome — simulation', () => {
  it('dryRun annonce « réclamable » sans rien écrire', async () => {
    const out = await grantSupporterWelcome({
      tenantId: TENANT,
      userId: SUPPORTER,
      dryRun: true,
    });

    expect(out).toEqual({ status: 'claimable', coins: REWARD.coins });
    expect(entries()).toHaveLength(0);
    expect(packs()).toHaveLength(0);
  });

  it('dryRun applique les MÊMES refus que l’écriture', async () => {
    // C'est la raison d'être du `dryRun` partagé : la carte ne doit jamais
    // proposer un bouton que le POST refuserait ensuite.
    expect(
      await grantSupporterWelcome({
        tenantId: TENANT,
        userId: JOUEUSE,
        dryRun: true,
      })
    ).toEqual({ status: 'not_supporter' });
  });

  it('dryRun voit le cadeau déjà pris', async () => {
    await grantSupporterWelcome({ tenantId: TENANT, userId: SUPPORTER });

    expect(
      await grantSupporterWelcome({
        tenantId: TENANT,
        userId: SUPPORTER,
        dryRun: true,
      })
    ).toEqual({ status: 'already' });
  });
});

describe('grantSupporterWelcome — écriture partielle', () => {
  it('rend packGranted:false quand le paquet est refusé — le cas du 2026-09-14', async () => {
    setTableWriteError('tcg_packs', {
      message: 'new row violates check constraint',
    });

    const out = await grantSupporterWelcome({
      tenantId: TENANT,
      userId: SUPPORTER,
    });

    // Les pièces sont écrites et ne seront PAS rejouées : c'est le choix assumé
    // de l'ordre d'écriture.
    expect(out).toEqual({
      status: 'granted',
      coins: REWARD.coins,
      packGranted: false,
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
    await grantSupporterWelcome(input);

    setTableWriteError('tcg_packs', null);
    expect(await grantSupporterWelcome(input)).toEqual({ status: 'already' });
    expect(packs()).toHaveLength(0);
  });
});
