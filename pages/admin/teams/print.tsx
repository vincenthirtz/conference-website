// pages/admin/teams/print.tsx
//
// Export PDF des équipes = cette page + la boîte d'impression du navigateur,
// convention du site (cf. components/PrintExportButton.tsx) : pas de moteur PDF
// à embarquer ni à tenir en phase avec la mise en page.
//
// Lit `?teamId=` (une équipe) ou les filtres de la liste (`search`, `isActive`,
// `tournamentId`), charge `GET /api/admin/teams/export` en JSON et rend la
// feuille (TeamExportSheet). `?autoprint=1` — posé par le bouton « Exporter
// PDF » — ouvre l'impression dès que les données ET les logos sont là.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import PrintExportButton from '@/components/PrintExportButton';
import AlertBanner from '@/components/admin/AlertBanner';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import TeamExportSheet, {
  teamExportTitle,
} from '@/components/admin/teams/TeamExportSheet';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTeamExport from '@/lib/i18n/locales/admin-fr/adminTeamExport';
import {
  buildTeamExportApiUrl,
  isAutoprintRequested,
  isSingleTeamTarget,
  normalizeTeamExportPayload,
  parseTeamExportTarget,
  teamExportParams,
  type TeamExportPayload,
} from '@/utils/teams/teamExportClient';

export const getServerSideProps = withStaffPage({ permission: 'manage_teams' });

/** Un logo pas encore chargé sortirait en cadre vide sur le PDF. */
function waitForImages(
  root: HTMLElement | null,
  timeoutMs: number
): Promise<void> {
  if (!root) return Promise.resolve();
  const pending = Array.from(root.querySelectorAll('img')).filter(
    (img) => !img.complete
  );
  if (pending.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let left = pending.length;
    const timer = window.setTimeout(resolve, timeoutMs);
    const done = () => {
      left -= 1;
      if (left === 0) {
        window.clearTimeout(timer);
        resolve();
      }
    };
    for (const img of pending) {
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    }
  });
}

function AdminTeamsPrintPage() {
  const t = useAdminT(nsAdminTeamExport);
  const router = useRouter();
  const { adminFetchJson } = useAdminFetch();

  const target = useMemo(
    () => (router.isReady ? parseTeamExportTarget(router.query) : null),
    [router.isReady, router.query]
  );
  const apiUrl = target ? buildTeamExportApiUrl(target, 'json') : null;
  const autoprint = router.isReady && isAutoprintRequested(router.query);

  const [data, setData] = useState<TeamExportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const printedRef = useRef(false);

  const load = useCallback(async () => {
    if (!apiUrl) return;
    setLoading(true);
    setError(null);
    try {
      const json = await adminFetchJson<unknown>(apiUrl);
      setData(normalizeTeamExportPayload(json));
    } catch (err: unknown) {
      setData(null);
      setError((err as Error)?.message ?? '');
    } finally {
      setLoading(false);
    }
  }, [apiUrl, adminFetchJson]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoprint || !data || data.teams.length === 0) return;
    let cancelled = false;
    waitForImages(sheetRef.current, 3000).then(() => {
      // Le drapeau n'est posé qu'au moment d'imprimer : en StrictMode l'effet
      // est joué deux fois, et un drapeau posé trop tôt n'imprimerait jamais.
      if (cancelled || printedRef.current) return;
      printedRef.current = true;
      window.requestAnimationFrame(() => window.print());
      // Recharger l'onglet ne doit pas rouvrir la boîte d'impression.
      const query = { ...router.query };
      delete query.autoprint;
      router.replace({ pathname: router.pathname, query }, undefined, {
        shallow: true,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [autoprint, data, router]);

  const single = target ? isSingleTeamTarget(target) : false;
  const backHref = (() => {
    if (!target) return '/admin/teams';
    if (isSingleTeamTarget(target)) {
      return `/admin/teams/${encodeURIComponent(target.teamId)}`;
    }
    const qs = teamExportParams(target).toString();
    return qs ? `/admin/teams?${qs}` : '/admin/teams';
  })();
  const hasTeams = Boolean(data && data.teams.length > 0);
  // Le titre de l'onglet devient le nom proposé pour le PDF.
  const docTitle =
    data && target && hasTeams
      ? `${teamExportTitle(data, target, t)} – ${data.generatedAt.slice(0, 10)}`
      : t.headTitle;

  return (
    <>
      <Head>
        <title>{docTitle}</title>
      </Head>

      <div
        data-print-sheet
        className="print-document min-h-screen bg-surface-deep text-white"
      >
        <div className="mx-auto w-full max-w-5xl px-4 pt-20 pb-12 sm:px-6 print:max-w-none print:p-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
            <Link
              href={backHref}
              className="text-sm text-neutral-400 hover:text-white"
            >
              {single ? t.backToTeam : t.backToList}
            </Link>
            {hasTeams && <PrintExportButton variant="admin" />}
          </div>

          {data?.truncated && (
            <AlertBanner
              className="mb-4 print:hidden"
              variant="warning"
              message={t.truncated}
            />
          )}

          {loading ? (
            <LoadingSpinner className="py-24" size="lg" label={t.loading} />
          ) : error !== null ? (
            <div className="space-y-3">
              <AlertBanner message={format(t.loadError, { message: error })} />
              <button
                type="button"
                onClick={load}
                className="px-4 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
              >
                {t.retry}
              </button>
            </div>
          ) : !data || !target || !hasTeams ? (
            <EmptyState title={t.emptyTitle} description={t.emptyDesc} />
          ) : (
            <div
              ref={sheetRef}
              className="rounded-2xl bg-white p-6 shadow-2xl sm:p-10 print:rounded-none print:p-0 print:shadow-none"
            >
              <TeamExportSheet payload={data} target={target} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default AdminTeamsPrintPage;
