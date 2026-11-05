// @vitest-environment happy-dom
//
// Liste admin /admin/demandes : les notifications système (scrim accepté /
// pris en compte, relance de tournoi — `payload.notification_type`, restées
// `pending` en base) ne sont pas des demandes « en attente ».
//
//   - le chargeur SSR (features/admin/demandes/listLoader.ts) retire ces
//     lignes de la liste au filtre « en attente » ET de la tuile « En
//     attente », pas des autres statuts ; « toutes » les garde, et la tuile
//     Total compte toutes les lignes (comme la liste « toutes ») ;
//   - une ligne de notification n'a pas d'actions rapides (Approuver…).
//
// La base est factice : chaque requête est enregistrée telle que construite.
// Le même filtre exécuté sur le moteur D1 (la production) : conference-api
// tests/unit/teamNotificationsD1.test.ts.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { loadDemandesList } from '@/features/admin/demandes/listLoader';
import DemandesListTable, {
  type DemandeRowActions,
} from '@/features/admin/demandes/ui/DemandesListTable';
import type { Demande } from '@/features/admin/demandes/listModel';
import { NOTIFICATION_TYPE_PATH } from '@/utils/demandes/teamNotifications';
import nsAdminDemandesList from '@/lib/i18n/locales/admin-fr/adminDemandesList';

const t = nsAdminDemandesList.fr;

type Call = [string, ...unknown[]];
type Recorded = { table: string; calls: Call[] };

/** Base factice : chaque `from()` enregistre sa chaîne ; résultat par forme. */
function fakeDb(result: (q: Recorded) => unknown) {
  const queries: Recorded[] = [];
  const db = {
    from(table: string) {
      const rec: Recorded = { table, calls: [] };
      queries.push(rec);
      const builder: Record<string, unknown> = {};
      for (const m of [
        'select',
        'eq',
        'neq',
        'in',
        'is',
        'gte',
        'lte',
        'or',
        'order',
        'range',
        'limit',
        'filter',
      ]) {
        builder[m] = (...args: unknown[]) => {
          rec.calls.push([m, ...args]);
          return builder;
        };
      }
      builder.then = (
        resolve: (v: unknown) => unknown,
        reject: (e: unknown) => unknown
      ) => Promise.resolve(result(rec)).then(resolve, reject);
      return builder;
    },
  };
  return { db, queries };
}

const has = (q: Recorded, ...call: unknown[]) =>
  q.calls.some((c) => JSON.stringify(c) === JSON.stringify(call));
const statusOf = (q: Recorded) =>
  (q.calls.find((c) => c[0] === 'eq' && c[1] === 'status')?.[2] as
    | string
    | undefined) ?? null;
const isCount = (q: Recorded) =>
  q.calls.some(
    (c) =>
      c[0] === 'select' &&
      (c[2] as { head?: boolean } | undefined)?.head === true
  );
const EXCLUDES = ['filter', NOTIFICATION_TYPE_PATH, 'is', null] as const;

/** Comptes : 3 par statut, 9 en tout (dont des notifications). */
function answer(q: Recorded) {
  if (q.table !== 'demandes') return { data: [], error: null };
  if (isCount(q)) {
    const s = statusOf(q);
    return { data: null, count: s ? 3 : 20, error: null };
  }
  return { data: [], count: 0, error: null };
}

async function load(status?: string) {
  const { db, queries } = fakeDb(answer);
  const props = await loadDemandesList(status === undefined ? {} : { status }, {
    tenantId: 'tenant-1',
    staffId: 'staff-1',
    db: db as never,
    getAuthUser: vi.fn() as never,
  });
  const demandes = queries.filter((q) => q.table === 'demandes');
  return {
    props,
    list: demandes.find((q) => !isCount(q)) as Recorded,
    counts: demandes.filter(isCount),
  };
}

afterEach(cleanup);

describe('loadDemandesList — les notifications ne sont pas « en attente »', () => {
  it('filtre « en attente » (défaut) : la liste les retire', async () => {
    const { list } = await load();
    expect(has(list, 'eq', 'status', 'pending')).toBe(true);
    expect(has(list, ...EXCLUDES)).toBe(true);
  });

  it('la tuile « En attente » les retire ; les autres statuts non', async () => {
    const { counts } = await load();
    const byStatus = new Map(counts.map((q) => [statusOf(q), q]));
    expect(has(byStatus.get('pending') as Recorded, ...EXCLUDES)).toBe(true);
    for (const s of ['approved', 'rejected', 'cancelled', 'acknowledged']) {
      expect(has(byStatus.get(s) as Recorded, ...EXCLUDES), s).toBe(false);
    }
  });

  it('CONTRE-ÉPREUVE : « toutes » (sans statut) les garde', async () => {
    const { list } = await load('');
    expect(list.calls.some((c) => c[0] === 'eq' && c[1] === 'status')).toBe(
      false
    );
    expect(has(list, ...EXCLUDES)).toBe(false);
  });

  it('un autre statut ne filtre pas les notifications', async () => {
    const { list } = await load('approved');
    expect(has(list, ...EXCLUDES)).toBe(false);
  });

  it('la tuile Total compte toutes les lignes (notifications comprises)', async () => {
    const { props, counts } = await load();
    const all = counts.find((q) => statusOf(q) === null) as Recorded;
    expect(all).toBeTruthy();
    expect(has(all, ...EXCLUDES)).toBe(false);
    expect(props.statusCounts.total).toBe(20);
    expect(props.statusCounts.pending).toBe(3);
  });
});

describe('DemandesListTable — une notification n’a pas d’actions rapides', () => {
  const base: Demande = {
    id: 'd',
    type: 'other',
    status: 'pending',
    created_at: '2026-11-05T10:00:00.000Z',
    updated_at: null,
    tournament_id: null,
    team_id: 'team-a',
    user_id: 'u1',
    comment: null,
    staff_note: null,
    source: 'website',
    payload: null,
    processed_at: null,
    processed_by_staff_id: null,
  };
  const actions = (): DemandeRowActions => ({
    onToggle: vi.fn(),
    onRequestInfo: vi.fn(),
    onNotifyCaptains: vi.fn(),
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onAcknowledge: vi.fn(),
  });
  const table = (demandes: Demande[]) =>
    render(
      <DemandesListTable
        demandes={demandes}
        selected={new Set()}
        processingId={null}
        batchProcessing={false}
        hasActiveFilters={false}
        onToggleSelectAll={() => {}}
        onResetFilters={() => {}}
        actions={actions()}
      />
    );

  it('notification système : badge « Notification », aucun bouton Approuver', () => {
    table([
      {
        ...base,
        id: 'notif',
        user_id: null,
        payload: {
          notification_type: 'scrim_acknowledged',
          from_team_name: 'A',
          target_team_name: 'B',
        } as Demande['payload'],
      },
    ]);
    expect(screen.getAllByText(t.systemNotification).length).toBeGreaterThan(0);
    expect(screen.queryByTitle(t.approveTitle)).toBeNull();
    expect(screen.queryByTestId('request-more-info')).toBeNull();
  });

  it('CONTRE-ÉPREUVE : une vraie demande en attente garde ses actions', () => {
    table([{ ...base, id: 'real' }]);
    expect(screen.getByTitle(t.approveTitle)).toBeTruthy();
    expect(screen.getByTestId('request-more-info')).toBeTruthy();
  });
});
