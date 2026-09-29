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
          {/* Balisage recopié des écrans actuels : c'est lui que le pont traduit. */}
          <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
            <div className="w-full px-4 pt-header pb-12 sm:px-6 lg:px-8">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-neutral-400">
                    Compétition · données d’exemple
                  </p>
                  <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">
                    Équipes
                  </h1>
                  <p className="mt-2 text-sm text-neutral-400">
                    12 équipes au total · 8 engagées sur la Cup 2026
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-neutral-600 px-4 py-2.5 text-sm font-semibold hover:bg-neutral-800"
                  >
                    Importer
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold hover:bg-purple-700"
                  >
                    Nouvelle équipe
                  </button>
                </div>
              </div>

              <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ['Équipes inscrites', '8/8', 'complet', 'text-purple-300'],
                  ['Matchs joués', '4/28', 'journée 1 terminée', 'text-white'],
                  [
                    'Check-in du jour',
                    '6/8',
                    '2 équipes en retard',
                    'text-amber-400',
                  ],
                  ['Litiges ouverts', '1', 'depuis 12 min', 'text-red-400'],
                ].map(([label, value, hint, tone]) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-neutral-700/50 bg-neutral-800/50 p-6 backdrop-blur"
                  >
                    <h3 className="text-xs text-neutral-400">{label}</h3>
                    <p
                      className={`mt-3 text-3xl font-bold ${tone}`}
                      data-numeric
                    >
                      {value}
                    </p>
                    <p className="mt-2 text-sm text-neutral-500">{hint}</p>
                  </div>
                ))}
              </div>

              <section className="rounded-2xl border border-neutral-700/50 bg-neutral-800/50 p-4 backdrop-blur">
                <h2 className="mb-3 text-lg font-semibold">
                  Journée 2 — vendredi 25 septembre
                </h2>
                <DataTable<Row>
                  rows={ROWS}
                  columns={COLUMNS}
                  rowKey={(r) => r.id}
                  searchPlaceholder="Nom, capitaine, BattleTag…"
                  exportFilename="equipes"
                />
              </section>
            </div>
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
