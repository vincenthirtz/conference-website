// tests/unit/personalDataErasure.test.ts
//
// Suppression de compte et export RGPD, tels que les routes les exécutent à
// partir du registre `utils/player/personalDataTables.ts`.
//
// CE QUI MÉRITE UN TEST n'est pas « les lignes disparaissent », c'est ce que
// l'on a PROMIS et qui ne se voit pas à la lecture du chemin heureux :
//   1. les FICHIERS partent avant les LIGNES — les lignes portent les chemins ;
//   2. un stockage en panne ne retient pas la joueuse, mais le staff reçoit
//      les chemins exacts à nettoyer ;
//   3. une base en panne, elle, retient le compte : sinon ses lignes sans clé
//      étrangère deviendraient introuvables ;
//   4. le classement est ANONYMISÉ, pas supprimé : les autres équipes en
//      dépendent ;
//   5. ce qui est l'histoire d'une autre joueuse (échanges, collections) reste ;
//   6. l'export a une section par table exportée, et aucun secret.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendAccountDeletedEmail, loggerError } = vi.hoisted(() => ({
  sendAccountDeletedEmail: vi.fn(async () => undefined),
  loggerError: vi.fn(),
}));
vi.mock('@/utils/email', () => ({ sendAccountDeletedEmail }));
vi.mock('@/utils/logger', () => ({
  logger: { error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../utils/logger', () => ({
  logger: { error: loggerError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  resetSupabaseMock,
  setAuthUser,
  setStorageRemoveResult,
  setTableWriteError,
  store,
  storageRemovals,
  supabaseAdmin,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import {
  PERSONAL_DATA_TABLES,
  REMOVED_PLAYER_NAME,
} from '../../utils/player/personalDataTables';
import deleteAccountHandler from '../../pages/api/player/delete-account';
import dataExportHandler from '../../pages/api/player/data-export';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const T = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

let _token = 0;
function makeReq(method: string): any {
  _token += 1;
  return {
    method,
    headers: {
      host: 'h',
      authorization: `Bearer rgpd-${Date.now()}-${_token}`,
    },
    query: {},
    body: {},
    socket: { remoteAddress: `10.0.0.${_token % 250}` },
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

function seed() {
  store.tcg_player_cards = [
    {
      tenant_id: T,
      user_id: ME,
      photo_path: 'tcg/me.png',
      photo_status: 'approved',
    },
    {
      tenant_id: T,
      user_id: OTHER,
      photo_path: 'tcg/other.png',
      photo_status: 'approved',
    },
  ];
  store.tcg_fanart_cards = [
    // Tirée dans un paquet d'une autre joueuse : ne peut pas être supprimée.
    {
      id: 'fa-drawn',
      tenant_id: T,
      submitted_by: ME,
      title: 'Mon dessin',
      artist_name: 'Signature',
      artist_url: 'https://moi.example',
      image_path: 'tcg-fanart/drawn.png',
      status: 'approved',
    },
    // Refusée, jamais tirée : supprimée — et son fichier aussi, tous statuts.
    {
      id: 'fa-rejected',
      tenant_id: T,
      submitted_by: ME,
      title: 'Autre',
      artist_name: 'Signature',
      artist_url: null,
      image_path: 'tcg-fanart/rejected.png',
      status: 'rejected',
    },
  ];
  store.tcg_packs = [
    { id: 'pack-me', tenant_id: T, user_id: ME },
    { id: 'pack-other', tenant_id: T, user_id: OTHER },
  ];
  store.tcg_pack_cards = [
    {
      pack_id: 'pack-other',
      position: 0,
      subject_kind: 'fanart',
      card_fanart_id: 'fa-drawn',
    },
    {
      pack_id: 'pack-other',
      position: 1,
      subject_kind: 'player',
      card_user_id: ME,
    },
  ];
  store.tcg_trades = [
    {
      id: 'tr-pending',
      tenant_id: T,
      proposer_id: OTHER,
      recipient_id: ME,
      status: 'pending',
      resolved_at: null,
    },
    {
      id: 'tr-done',
      tenant_id: T,
      proposer_id: ME,
      recipient_id: OTHER,
      status: 'accepted',
      resolved_at: '2026-09-01T00:00:00Z',
    },
  ];
  store.tcg_trade_items = [
    { trade_id: 'tr-done', side: 'offered', ordinal: 0, card_user_id: ME },
  ];
  store.tcg_showcases = [{ tenant_id: T, user_id: ME, subject_keys: [] }];
  store.tcg_trade_settings = [
    { tenant_id: T, user_id: ME, accepts_proposals: true },
  ];
  store.tcg_wallets = [{ tenant_id: T, user_id: ME, balance: 40 }];
  store.tcg_wallet_entries = [
    { id: 'we1', tenant_id: T, user_id: ME, amount: 40 },
  ];
  store.match_predictions = [{ id: 'mp1', tenant_id: T, user_id: ME }];
  store.player_calendar_tokens = [
    { id: 'ct1', tenant_id: T, auth_user_id: ME, token: 'SECRET-ICS-TOKEN' },
  ];
  store.player_ratings = [
    {
      id: 'pr-me',
      tenant_id: T,
      user_id: ME,
      display_name: 'Aru',
      battle_tag: 'Aru#1234',
      avatar_url: 'https://cdn/aru.png',
      rating: 1612,
    },
    {
      id: 'pr-other',
      tenant_id: T,
      user_id: OTHER,
      display_name: 'Bee',
      battle_tag: 'Bee#1',
      avatar_url: null,
      rating: 1500,
    },
  ];
  store.match_participants = [
    {
      id: 'mpa1',
      tenant_id: T,
      match_id: 'm1',
      team_id: 't1',
      user_id: ME,
      battle_tag: 'Aru#1234',
    },
  ];
  store.player_rating_history = [
    { id: 'h1', tenant_id: T, user_id: ME, match_id: 'm1' },
  ];
  store.free_players = [
    {
      id: 'fp1',
      tenant_id: T,
      auth_user_id: ME,
      contact_email: 'aru@example.org',
    },
  ];
  store.push_subscriptions = [
    {
      id: 'ps1',
      tenant_id: T,
      user_id: ME,
      endpoint: 'https://push/secret',
      p256dh: 'k',
      auth: 'a',
    },
  ];
  store.team_members = [
    { id: 'tm1', user_id: ME, team_id: 't1' },
    { id: 'tm2', user_id: OTHER, team_id: 't1' },
  ];
  store.demandes = [
    { id: 'd1', user_id: ME },
    { id: 'd2', auth_user_id: ME, user_id: null },
  ];
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  sendAccountDeletedEmail.mockClear();
  loggerError.mockClear();
  setAuthUser({ id: ME, email: 'aru@example.org', user_metadata: {} });
  seed();
});

describe('DELETE /api/player/delete-account — registre RGPD', () => {
  it('retire les fichiers AVANT de toucher aux lignes qui portent leurs chemins', async () => {
    const snapshots: Array<{ cards: number; fanarts: number }> = [];
    const realFrom = supabaseAdmin.storage.from;
    const spy = vi
      .spyOn(supabaseAdmin.storage, 'from')
      .mockImplementation((bucket: string) => {
        const bucketApi = realFrom(bucket);
        return {
          ...bucketApi,
          remove: (paths: string[]) => {
            snapshots.push({
              cards: store.tcg_player_cards.filter((r) => r.user_id === ME)
                .length,
              fanarts: store.tcg_fanart_cards.filter(
                (r) => r.status !== 'revoked'
              ).length,
            });
            return bucketApi.remove(paths);
          },
        };
      });

    const res = makeRes();
    await deleteAccountHandler(makeReq('DELETE'), res);
    spy.mockRestore();

    expect(res.statusCode).toBe(200);
    expect(storageRemovals).toHaveLength(1);
    expect(storageRemovals[0].bucket).toBe('teams-images');
    expect([...storageRemovals[0].paths].sort()).toEqual(
      ['tcg-fanart/drawn.png', 'tcg-fanart/rejected.png', 'tcg/me.png'].sort()
    );
    // Au moment du `remove`, rien n'avait encore été supprimé ni anonymisé.
    expect(snapshots).toEqual([{ cards: 1, fanarts: 2 }]);
  });

  it('un stockage en panne ne bloque pas deleteUser, et journalise les chemins exacts', async () => {
    setStorageRemoveResult({ data: null, error: { message: 'storage down' } });
    const deleteUser = vi.spyOn(supabaseAdmin.auth.admin, 'deleteUser');

    const res = makeRes();
    await deleteAccountHandler(makeReq('DELETE'), res);

    expect(res.statusCode).toBe(200);
    expect(deleteUser).toHaveBeenCalledWith(ME);
    deleteUser.mockRestore();

    const logged = loggerError.mock.calls.find((call) =>
      String(call[0]).includes('NON supprimés')
    );
    expect(logged, 'le staff doit être prévenu').toBeDefined();
    const payload = logged![1] as { paths: string[]; userId: string };
    expect(payload.userId).toBe(ME);
    expect([...payload.paths].sort()).toEqual(
      ['tcg-fanart/drawn.png', 'tcg-fanart/rejected.png', 'tcg/me.png'].sort()
    );
    // Les lignes sont traitées malgré tout.
    expect(store.tcg_player_cards.some((r) => r.user_id === ME)).toBe(false);
  });

  it('une écriture en base qui échoue retient le compte (500, pas de deleteUser, pas d’email)', async () => {
    setTableWriteError('player_ratings', { message: 'boom' });
    const deleteUser = vi.spyOn(supabaseAdmin.auth.admin, 'deleteUser');

    const res = makeRes();
    await deleteAccountHandler(makeReq('DELETE'), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('personal_data_erase_failed');
    expect(deleteUser).not.toHaveBeenCalled();
    expect(sendAccountDeletedEmail).not.toHaveBeenCalled();
    deleteUser.mockRestore();
  });

  it('anonymise player_ratings au lieu de supprimer la ligne', async () => {
    const res = makeRes();
    await deleteAccountHandler(makeReq('DELETE'), res);
    expect(res.statusCode).toBe(200);

    const mine = store.player_ratings.find((r) => r.id === 'pr-me');
    expect(
      mine,
      'la ligne doit rester pour les classements des autres'
    ).toBeDefined();
    expect(mine).toMatchObject({
      display_name: REMOVED_PLAYER_NAME,
      battle_tag: null,
      avatar_url: null,
      rating: 1612,
    });
    expect(store.player_ratings.find((r) => r.id === 'pr-other')).toMatchObject(
      {
        display_name: 'Bee',
        battle_tag: 'Bee#1',
      }
    );
    // Le recalcul complet relit ce BattleTag : il doit partir aussi.
    expect(store.match_participants[0]).toMatchObject({
      user_id: ME,
      battle_tag: null,
    });
    expect(store.player_rating_history).toHaveLength(1);
  });

  it('supprime ce qui n’appartient qu’à elle, garde l’histoire des autres', async () => {
    const res = makeRes();
    await deleteAccountHandler(makeReq('DELETE'), res);
    expect(res.statusCode).toBe(200);

    const mineIn = (table: string, column = 'user_id') =>
      store[table].filter((r) => r[column] === ME).length;
    expect(mineIn('tcg_player_cards')).toBe(0);
    expect(mineIn('tcg_showcases')).toBe(0);
    expect(mineIn('tcg_trade_settings')).toBe(0);
    expect(mineIn('tcg_wallets')).toBe(0);
    expect(mineIn('tcg_wallet_entries')).toBe(0);
    expect(mineIn('tcg_packs')).toBe(0);
    expect(mineIn('match_predictions')).toBe(0);
    expect(mineIn('player_calendar_tokens', 'auth_user_id')).toBe(0);
    expect(mineIn('free_players', 'auth_user_id')).toBe(0);
    expect(mineIn('team_members')).toBe(0);
    expect(store.demandes).toHaveLength(0);

    // Les données des autres ne bougent pas.
    expect(store.tcg_player_cards).toHaveLength(1);
    expect(store.tcg_packs.map((p) => p.id)).toEqual(['pack-other']);
    expect(store.team_members.map((m) => m.id)).toEqual(['tm2']);

    // Sa carte dans la collection d'une autre, et l'échange passé : conservés.
    expect(store.tcg_pack_cards).toHaveLength(2);
    expect(store.tcg_trade_items).toHaveLength(1);
    expect(store.tcg_trades.find((t) => t.id === 'tr-done')).toMatchObject({
      status: 'accepted',
      proposer_id: ME,
    });
    // L'échange en attente est clos : sa partenaire ne peut plus l'accepter.
    const pending = store.tcg_trades.find((t) => t.id === 'tr-pending')!;
    expect(pending.status).toBe('cancelled');
    expect(pending.resolution_reason).toBe('trading_disabled');
    expect(typeof pending.resolved_at).toBe('string');

    // Fan art tiré : retiré et dépersonnalisé. Fan art jamais tiré : supprimé.
    expect(store.tcg_fanart_cards).toHaveLength(1);
    expect(store.tcg_fanart_cards[0]).toMatchObject({
      id: 'fa-drawn',
      status: 'revoked',
      artist_url: null,
    });
    expect(store.tcg_fanart_cards[0].artist_name).not.toBe('Signature');
    expect(store.tcg_fanart_cards[0].title).not.toBe('Mon dessin');
  });

  it('l’email part après la suppression effective', async () => {
    const res = makeRes();
    await deleteAccountHandler(makeReq('DELETE'), res);
    expect(res.statusCode).toBe(200);
    expect(sendAccountDeletedEmail).toHaveBeenCalledWith('aru@example.org');
  });
});

describe('GET /api/player/data-export — registre RGPD', () => {
  it('a une section par table exportée du registre, et liste les autres avec leur raison', async () => {
    const res = makeRes();
    await dataExportHandler(makeReq('GET'), res);
    expect(res.statusCode).toBe(200);

    const body = res.body as any;
    for (const entry of PERSONAL_DATA_TABLES) {
      if ('omit' in entry.export) {
        expect(body.not_exported[entry.table], entry.table).toBe(
          entry.export.omit
        );
        expect(body.tables[entry.table]).toBeUndefined();
      } else {
        const section = body.tables[entry.table];
        expect(section, entry.table).toBeDefined();
        expect(section.on_account_deletion).toBe(entry.policy.kind);
        expect(section.why).toBe(entry.why);
        expect(Array.isArray(section.rows)).toBe(true);
      }
    }
  });

  it('retrouve ses lignes par toutes les colonnes qui la désignent, sans doublon', async () => {
    const res = makeRes();
    await dataExportHandler(makeReq('GET'), res);
    const body = res.body as any;

    expect(body.tables.demandes.rows.map((r: any) => r.id).sort()).toEqual([
      'd1',
      'd2',
    ]);
    expect(body.tables.tcg_trades.rows.map((r: any) => r.id).sort()).toEqual([
      'tr-done',
      'tr-pending',
    ]);
    expect(body.tables.player_ratings.rows).toHaveLength(1);
    // Alias de l'ancien format.
    expect(body.team_membership).toHaveLength(1);
    expect(body.demandes).toHaveLength(2);
  });

  it('les sections exposent le libellé de ce qui leur arrivera', async () => {
    const res = makeRes();
    await dataExportHandler(makeReq('GET'), res);
    const body = res.body as any;
    expect(body.tables.player_ratings.on_account_deletion).toBe('anonymise');
    expect(body.tables.tcg_player_cards.on_account_deletion).toBe('delete');
    expect(body.tables.player_calendar_tokens.note).toMatch(/omise/);
  });
});
