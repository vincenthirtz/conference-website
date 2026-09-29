// @vitest-environment happy-dom
//
// DataTable en mode `server` (lot L13) : la table rend la page reçue telle
// quelle, ne trie que les colonnes que le serveur accepte, et écrit tri et
// page dans l'URL — c'est l'URL qui fait la requête.

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';

const router = vi.hoisted(() => ({
  pathname: '/admin/association',
  query: {} as Record<string, string>,
  replace: vi.fn(),
}));
vi.mock('next/router', () => ({ useRouter: () => router }));

import DataTable, {
  type DataTableColumn,
} from '../../components/admin/DataTable';

type Row = { id: string; name: string; email: string };
const rows: Row[] = [
  { id: 'b', name: 'Zed', email: 'z@x.fr' },
  { id: 'a', name: 'Alpha', email: 'a@x.fr' },
];
const columns: DataTableColumn<Row>[] = [
  { key: 'last_name', header: 'Nom', value: (r) => r.name, sortable: true },
  { key: 'email', header: 'Email', value: (r) => r.email },
];

beforeEach(() => {
  router.query = {};
  router.replace.mockClear();
});
afterEach(cleanup);

const names = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => r.querySelector('td')?.textContent);

describe('DataTable — mode serveur', () => {
  it('rend la page reçue sans la retrier, même avec un tri dans l’URL', () => {
    router.query = { sort: 'last_name', dir: 'asc' };
    render(
      <DataTable<Row>
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        server={{ total: 60, pageSize: 25 }}
      />
    );
    expect(names()).toEqual(['Zed', 'Alpha']);
  });

  it('seules les colonnes `sortable: true` sont triables, et le tri va dans l’URL', () => {
    render(
      <DataTable<Row>
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        server={{ total: 60, pageSize: 25 }}
      />
    );
    expect(screen.queryByRole('button', { name: /Email/ })).toBeNull();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Nom/ }));
    });
    expect(router.replace.mock.calls.at(-1)?.[0]).toMatchObject({
      query: { sort: 'last_name', dir: 'asc' },
    });
  });

  it('pagine d’après le total serveur et écrit la page dans l’URL', () => {
    render(
      <DataTable<Row>
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        server={{ total: 60, pageSize: 25 }}
      />
    );
    expect(screen.getByText(/2 sur 60 · page 1 sur 3/)).toBeTruthy();
    act(() => {
      fireEvent.click(screen.getByTestId('pagination-next'));
    });
    expect(router.replace.mock.calls.at(-1)?.[0]).toMatchObject({
      query: { page: '2' },
    });
  });

  it('estompe la page affichée pendant que la suivante charge', () => {
    const { container } = render(
      <DataTable<Row>
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        server={{ total: 60, pageSize: 25, fetching: true }}
      />
    );
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });
});
