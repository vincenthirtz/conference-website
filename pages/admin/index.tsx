import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { withStaffPage, hasAtLeastRole, getRoleLabel } from '@/utils/staff';
import type { StaffRole } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import StatCard, {
  type StatAccent,
} from '@/components/admin/dashboard/StatCard';
import ActionableAlert, {
  type AlertSeverity,
} from '@/components/admin/dashboard/ActionableAlert';
import { Skeleton } from '@/components/admin/Skeleton';
import EmptyState from '@/components/admin/EmptyState';
import type { AlertsSummary } from '@/utils/dashboard/buildTournamentDashboard';

import { logger } from '../../utils/logger';

type StaffShape = {
  id: string;
  role: StaffRole;
  display_name: string | null;
};

type Props = {
  staff: StaffShape;
};

export const getServerSideProps = withStaffPage('caster');

/* -----------------------------------------------------------
 * KPI globaux : un unique appel à l'endpoint d'agrégat.
 * /api/admin/overview-summary renvoie déjà les 6 counts (200 même
 * en dégradation partielle : une clé à null = ce count a échoué).
 * ---------------------------------------------------------*/

type Kpis = {
  tournamentsActive: number | null;
  teams: number | null;
  demandesPending: number | null;
  supportOpen: number | null;
  supportHigh: number | null;
  disputesOpen: number | null;
};

/* -----------------------------------------------------------
 * Cartes de navigation : grille de raccourcis vers les sections.
 * Chaque carte porte un minRole pour filtrer selon le rôle staff.
 * ---------------------------------------------------------*/

type NavCard = {
  title: string;
  description: string;
  href: string;
  minRole: StaffRole;
  icon: ReactNode;
  accent: string;
};

const ICON = {
  trophy: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      d="M8 21h8m-4-4v4m6-17h2a1 1 0 011 1v1a4 4 0 01-4 4m-10-6H4a1 1 0 00-1 1v1a4 4 0 004 4m1-7h8v4a4 4 0 01-8 0V4z"
    />
  ),
  users: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6-2a3 3 0 10-2-5.24"
    />
  ),
  inbox: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-4l-2 3h-4l-2-3H4"
    />
  ),
  ticket: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      d="M15 5v2m0 4v2m0 4v2M5 5h14a2 2 0 012 2v3a2 2 0 000 4v3a2 2 0 01-2 2H5a2 2 0 01-2-2v-3a2 2 0 000-4V7a2 2 0 012-2z"
    />
  ),
  shield: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
    />
  ),
  mail: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
    />
  ),
  clock: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  ),
  cog: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
  ),
  signal: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      d="M3 13a9 9 0 0118 0M6.5 13a5.5 5.5 0 0111 0M10 13a2 2 0 014 0M12 21h.01"
    />
  ),
  chart: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      d="M9 19v-6m4 6V5m4 14v-9M5 19h14"
    />
  ),
};

const NAV_CARDS: NavCard[] = [
  {
    title: 'Tournoi en cours',
    description: 'Cockpit du tournoi actif : matchs, litiges, check-in.',
    href: '/admin/tournoi-en-cours',
    minRole: 'caster',
    icon: ICON.signal,
    accent: 'border-pink-500/30 from-pink-500/10 text-pink-300',
  },
  {
    title: 'Tournois',
    description: 'Liste, création et gestion des tournois.',
    href: '/admin/tournaments',
    minRole: 'manager',
    icon: ICON.trophy,
    accent: 'border-amber-500/30 from-amber-500/10 text-amber-300',
  },
  {
    title: 'Équipes',
    description: 'Rosters, capitaines et imports.',
    href: '/admin/teams',
    minRole: 'manager',
    icon: ICON.users,
    accent: 'border-blue-500/30 from-blue-500/10 text-blue-300',
  },
  {
    title: 'Demandes',
    description: 'Demandes joueurs, équipes et scrims à traiter.',
    href: '/admin/demandes',
    minRole: 'manager',
    icon: ICON.inbox,
    accent: 'border-emerald-500/30 from-emerald-500/10 text-emerald-300',
  },
  {
    title: 'Support',
    description: 'Tickets de support des utilisateurs.',
    href: '/admin/support',
    minRole: 'manager',
    icon: ICON.ticket,
    accent: 'border-purple-500/30 from-purple-500/10 text-purple-300',
  },
  {
    title: 'Modération',
    description: 'Commentaires et blacklist joueurs.',
    href: '/admin/comments',
    minRole: 'manager',
    icon: ICON.shield,
    accent: 'border-red-500/30 from-red-500/10 text-red-300',
  },
  {
    title: 'Campagnes emails',
    description: 'Envois groupés et suivi des campagnes.',
    href: '/admin/campaigns',
    minRole: 'admin',
    icon: ICON.mail,
    accent: 'border-blue-500/30 from-blue-500/10 text-blue-300',
  },
  {
    title: 'Run-of-show',
    description: 'Conduite live : timeline, segments et timing.',
    href: '/admin/broadcast/live',
    minRole: 'manager',
    icon: ICON.clock,
    accent: 'border-pink-500/30 from-pink-500/10 text-pink-300',
  },
  {
    title: 'Utilisateurs',
    description: 'Gestion des comptes staff et adhérents.',
    href: '/admin/users/manage',
    minRole: 'admin',
    icon: ICON.users,
    accent: 'border-emerald-500/30 from-emerald-500/10 text-emerald-300',
  },
  {
    title: 'Stats',
    description: 'Statistiques équipes et maps.',
    href: '/admin/stats/teams',
    minRole: 'manager',
    icon: ICON.chart,
    accent: 'border-purple-500/30 from-purple-500/10 text-purple-300',
  },
  {
    title: 'Paramètres du site',
    description: 'Configuration générale du site.',
    href: '/admin/site-settings',
    minRole: 'admin',
    icon: ICON.cog,
    accent: 'border-amber-500/30 from-amber-500/10 text-amber-300',
  },
];

function buildAlerts(summary: AlertsSummary | null) {
  if (!summary || summary.total === 0) return [];
  const b = summary.breakdown;
  const out: {
    severity: AlertSeverity;
    title: string;
    message?: string;
    cta?: { label: string; href: string };
  }[] = [];

  if (b.disputes > 0) {
    out.push({
      severity: 'critical',
      title: `${b.disputes} litige${b.disputes > 1 ? 's' : ''} en attente`,
      message: 'Des matchs contestés nécessitent une décision.',
      cta: { label: 'Résoudre', href: '/admin/disputes' },
    });
  }
  if (b.conflicts > 0) {
    out.push({
      severity: 'error',
      title: `${b.conflicts} conflit${b.conflicts > 1 ? 's' : ''} de scores`,
      message: 'Des résultats divergents bloquent la progression.',
      cta: { label: 'Voir le tournoi', href: '/admin/tournoi-en-cours' },
    });
  }
  if (b.supportHigh > 0) {
    out.push({
      severity: 'error',
      title: `${b.supportHigh} ticket${b.supportHigh > 1 ? 's' : ''} support haute priorité`,
      message: 'Des demandes urgentes attendent une réponse.',
      cta: { label: 'Ouvrir le support', href: '/admin/support' },
    });
  }
  if (b.checkinMissing > 0) {
    out.push({
      severity: 'warning',
      title: `${b.checkinMissing} check-in manquant${b.checkinMissing > 1 ? 's' : ''}`,
      message:
        'Des équipes ne se sont pas présentées pour les prochains matchs.',
      cta: { label: 'Voir le tournoi', href: '/admin/tournoi-en-cours' },
    });
  }
  if (b.pendingTeams > 0) {
    out.push({
      severity: 'warning',
      title: `${b.pendingTeams} équipe${b.pendingTeams > 1 ? 's' : ''} en attente de validation`,
      message: 'Des inscriptions doivent être approuvées.',
      cta: { label: 'Voir les demandes', href: '/admin/demandes' },
    });
  }
  if (b.stagesReady > 0) {
    out.push({
      severity: 'info',
      title: `${b.stagesReady} phase${b.stagesReady > 1 ? 's' : ''} prête${b.stagesReady > 1 ? 's' : ''} à avancer`,
      message: 'Tous les matchs sont terminés sur ces phases.',
      cta: { label: 'Voir le tournoi', href: '/admin/tournoi-en-cours' },
    });
  }
  if (b.rosterLockSoon) {
    out.push({
      severity: 'info',
      title: 'Verrouillage des rosters imminent',
      message: 'Le lock des effectifs intervient dans moins de 24h.',
      cta: { label: 'Voir le tournoi', href: '/admin/tournoi-en-cours' },
    });
  }

  return out;
}

function AdminDashboardPage({ staff }: Props) {
  const { adminFetchJson } = useAdminFetch();

  const [alertsSummary, setAlertsSummary] = useState<AlertsSummary | null>(
    null
  );
  const [kpis, setKpis] = useState<Kpis>({
    tournamentsActive: null,
    teams: null,
    demandesPending: null,
    supportOpen: null,
    supportHigh: null,
    disputesOpen: null,
  });
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canManage = hasAtLeastRole(staff.role, 'manager');

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // Les deux agrégats sont indépendants → on les lance en parallèle pour
      // ne pas empiler les latences (alertes = source partagée avec le badge
      // navbar ; KPI globaux = managers+ uniquement, l'endpoint exige ce rôle).
      // Chaque endpoint renvoie 200 même en dégradation partielle (clé à null).
      const [alerts, summary] = await Promise.all([
        adminFetchJson<AlertsSummary>('/api/admin/alerts-summary'),
        canManage
          ? adminFetchJson<Kpis>('/api/admin/overview-summary')
          : Promise.resolve(null),
      ]);

      setAlertsSummary(alerts);

      if (summary) {
        setKpis({
          tournamentsActive: summary.tournamentsActive ?? null,
          teams: summary.teams ?? null,
          demandesPending: summary.demandesPending ?? null,
          supportOpen: summary.supportOpen ?? null,
          supportHigh: summary.supportHigh ?? null,
          disputesOpen: summary.disputesOpen ?? null,
        });
      }
    } catch (err: unknown) {
      logger.error('AdminDashboardPage: load error', err);
      setErrorMsg((err as Error)?.message || 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, canManage]);

  useEffect(() => {
    load();
  }, [load]);

  const alerts = buildAlerts(alertsSummary);
  const navCards = NAV_CARDS.filter((c) =>
    hasAtLeastRole(staff.role, c.minRole)
  );
  const greetName = staff.display_name || 'Staff';

  const fmt = (v: number | null) => (v === null ? '—' : v.toLocaleString());

  return (
    <>
      <Head>
        <title>Admin – Tableau de bord</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-neutral-400">Espace staff</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">
                Tableau de bord
              </h1>
              <p className="mt-2 text-sm text-neutral-400">
                Bonjour {greetName} · {getRoleLabel(staff.role)}
              </p>
            </div>
            <Link
              href="/admin/profile"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-white/[0.08]"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              Mon profil
            </Link>
          </div>

          {errorMsg && (
            <div className="mb-6 flex items-center gap-2 rounded-xl border border-red-500/50 bg-red-900/40 px-4 py-3 text-sm">
              <svg
                className="h-5 w-5 flex-shrink-0 text-red-400"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              {errorMsg}
            </div>
          )}

          {/* Alertes actionnables */}
          <section className="mb-8" aria-labelledby="alerts-heading">
            <h2
              id="alerts-heading"
              className="mb-3 text-[11px] font-medium uppercase tracking-widest text-gray-400"
            >
              Alertes
            </h2>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" rounded="rounded-xl" />
                <Skeleton className="h-16 w-full" rounded="rounded-xl" />
              </div>
            ) : alerts.length === 0 ? (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-4">
                <p className="flex items-center gap-2 text-sm text-emerald-200">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Rien à signaler — aucune alerte active.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map((a, i) => (
                  <ActionableAlert
                    key={`${a.title}-${i}`}
                    severity={a.severity}
                    title={a.title}
                    message={a.message}
                    cta={a.cta}
                  />
                ))}
              </div>
            )}
          </section>

          {/* KPI globaux */}
          {canManage && (
            <section className="mb-8" aria-labelledby="kpis-heading">
              <h2
                id="kpis-heading"
                className="mb-3 text-[11px] font-medium uppercase tracking-widest text-gray-400"
              >
                Vue d&apos;ensemble
              </h2>
              {loading ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton
                      key={i}
                      className="h-24 w-full"
                      rounded="rounded-xl"
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {(
                    [
                      {
                        label: 'Tournois actifs',
                        value: kpis.tournamentsActive,
                        accent: 'pink',
                      },
                      { label: 'Équipes', value: kpis.teams, accent: 'blue' },
                      {
                        label: 'Demandes en attente',
                        value: kpis.demandesPending,
                        accent: 'emerald',
                      },
                      {
                        label: 'Tickets ouverts',
                        value: kpis.supportOpen,
                        accent: 'purple',
                      },
                      {
                        label: 'Support urgent',
                        value: kpis.supportHigh,
                        accent: 'amber',
                      },
                      {
                        label: 'Litiges ouverts',
                        value: kpis.disputesOpen,
                        accent: 'red',
                      },
                    ] as {
                      label: string;
                      value: number | null;
                      accent: StatAccent;
                    }[]
                  ).map((k) => (
                    <StatCard
                      key={k.label}
                      label={k.label}
                      value={fmt(k.value)}
                      accent={k.accent}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Raccourcis de navigation */}
          <section aria-labelledby="nav-heading">
            <h2
              id="nav-heading"
              className="mb-3 text-[11px] font-medium uppercase tracking-widest text-gray-400"
            >
              Sections
            </h2>
            {navCards.length === 0 ? (
              <EmptyState
                title="Aucune section accessible"
                description="Ton rôle ne donne pas accès aux sections de gestion. Tu peux consulter ton profil."
                action={
                  <Link
                    href="/admin/profile"
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                  >
                    Mon profil
                  </Link>
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {navCards.map((card) => (
                  <Link
                    key={card.href + card.title}
                    href={card.href}
                    className={`group rounded-2xl border bg-gradient-to-br to-transparent p-5 transition-all hover:-translate-y-0.5 hover:bg-white/[0.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${card.accent}`}
                  >
                    <div className="mb-3 flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5">
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          {card.icon}
                        </svg>
                      </span>
                      <h3 className="text-base font-semibold text-white">
                        {card.title}
                      </h3>
                    </div>
                    <p className="text-sm text-neutral-400">
                      {card.description}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

export default AdminDashboardPage;
