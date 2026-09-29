// pages/dev/admin-preview.tsx — aperçu de développement de l'admin en
// « Le Ruban » (docs/PLAN-industrialisation-admin.md, L12).
//
// POURQUOI. L'admin exige une session staff : impossible d'y prendre une
// capture sans compte. Cette page monte la VRAIE coquille (menu réel d'une
// propriétaire) et des blocs écrits avec les classes Tailwind qu'utilisent les
// écrans existants — c'est ce que le pont de styles/admin-ruban.css doit
// transformer. Données d'exemple, affichées comme telles.
//
// 404 en production : ce n'est pas une page du produit.

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { ToastProvider } from '@/components/Toast';
import AdminShell from '@/features/admin/_shared/shell/AdminShell';
import { ADMIN_LINKS, filterAdminLinks } from '@/components/Navbar/adminLinks';
import DataTable, { type DataTableColumn } from '@/components/admin/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import StatTile from '@/features/admin/_shared/ui/StatTile';
import Chip from '@/features/admin/_shared/ui/Chip';
import ListToolbar, {
  FilterSelect,
  ListSearch,
} from '@/features/admin/_shared/ui/ListToolbar';
import type { MatchStatus } from '@/types/admin';

export const getServerSideProps: GetServerSideProps = async () =>
  process.env.NODE_ENV === 'production' ? { notFound: true } : { props: {} };

type Row = {
  id: string;
  tag: string;
  name: string;
  captain: string;
  players: number;
  status: MatchStatus;
};

const ROWS: Row[] = [
  {
    id: '1',
    tag: 'HSP',
    name: 'Hinode Sparkles',
    captain: 'MissKiwiii',
    players: 5,
    status: 'finished',
  },
  {
    id: '2',
    tag: 'ECL',
    name: 'Eclypse',
    captain: 'Claro',
    players: 5,
    status: 'ongoing',
  },
  {
    id: '3',
    tag: 'CHO',
    name: 'Chocomates',
    captain: 'Exemple',
    players: 5,
    status: 'pending',
  },
  {
    id: '4',
    tag: 'NON',
    name: 'Noname',
    captain: 'Exemple',
    players: 4,
    status: 'disputed',
  },
];

const COLUMNS: DataTableColumn<Row>[] = [
  {
    key: 'name',
    header: 'Équipe',
    value: (r) => r.name,
    render: (r) => (
      <span className="flex items-center gap-3">
        <span className="rounded border-l-2 border-purple-500 bg-neutral-800 px-1.5 py-0.5 font-mono text-[11px] text-neutral-200">
          {r.tag}
        </span>
        <span className="text-white">{r.name}</span>
      </span>
    ),
  },
  {
    key: 'captain',
    header: 'Capitaine',
    value: (r) => r.captain,
    className: 'text-neutral-400',
  },
  { key: 'players', header: 'Joueuses', value: (r) => `${r.players}/5` },
  {
    key: 'status',
    header: 'État',
    render: (r) => <StatusBadge status={r.status} />,
  },
];

export default function AdminPreviewPage() {
  const links = filterAdminLinks('owner', ADMIN_LINKS);
  return (
    // Page « nue » (appChrome) : on remonte les fournisseurs dont la coquille
    // a besoin (toasts du profil).
    <ToastProvider>
      <div
        data-surface="admin"
        style={{ ['--app-header-h' as string]: '60px' }}
      >
        <Head>
          <title>Aperçu admin — Le Ruban</title>
        </Head>
        <AdminShell
          staffName="Vincent"
          staffRole="owner"
          links={links}
          height={60}
          onLogout={() => {}}
        />
        <main id="main-content">
          <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
            <AdminPageHeader
              title="Équipes"
              subtitle="12 équipes au total · 8 engagées sur la Cup 2026"
              actions={
                <>
                  <AdminButton>Importer</AdminButton>
                  <AdminButtonLink variant="primary" href="#">
                    Nouvelle équipe
                  </AdminButtonLink>
                </>
              }
            />
            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                label="Équipes inscrites"
                value="8 / 8"
                hint="complet"
                tone="brand"
              />
              <StatTile
                label="Matchs joués"
                value="4 / 28"
                hint="journée 1 terminée"
              />
              <StatTile
                label="Check-in du jour"
                value="6 / 8"
                hint="2 équipes en retard"
                tone="warn"
              />
              <StatTile
                label="Litiges ouverts"
                value="1"
                hint="depuis 12 min"
                tone="err"
              />
            </div>
            <ListToolbar
              search={
                <ListSearch
                  value=""
                  onChange={() => {}}
                  placeholder="Nom, capitaine, BattleTag…"
                  label="Rechercher une équipe"
                />
              }
              filters={
                <>
                  <FilterSelect
                    label="Tournoi"
                    allLabel="Tous"
                    value={null}
                    onChange={() => {}}
                    options={[{ value: 'cup', label: 'Cup 2026' }]}
                  />
                  <FilterSelect
                    label="Statut"
                    allLabel="Toutes"
                    value="ok"
                    onChange={() => {}}
                    options={[{ value: 'ok', label: 'Validées' }]}
                  />
                </>
              }
              note="Trié par nom"
            />
            <div className="rounded-[var(--r-card)] border border-[var(--line2)] bg-[var(--s1)] p-4">
              <DataTable<Row>
                rows={ROWS}
                columns={COLUMNS}
                rowKey={(r) => r.id}
                server={{ total: 12, pageSize: 4 }}
                selection={{
                  actions: [
                    { label: 'Assigner à un tournoi', run: () => {} },
                    { label: 'Archiver', run: () => {}, variant: 'danger' },
                  ],
                  selected: new Set(['1', '2', '3']),
                  onChange: () => {},
                }}
              />
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Chip tone="live">En direct</Chip>
              <Chip tone="ok">Validée</Chip>
              <Chip tone="warn">Roster incomplet</Chip>
              <Chip tone="err">Litige</Chip>
              <Chip>En attente</Chip>
            </div>
            <div className="mt-6 rounded-[var(--r-card)] border border-[var(--line2)] bg-[var(--s1)] p-4">
              <DataTable<Row>
                rows={[]}
                columns={COLUMNS}
                rowKey={(r) => r.id}
                emptyTitle="Aucune équipe ne correspond à ces filtres"
              />
            </div>
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
