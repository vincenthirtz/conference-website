// pages/admin/tournament/[id]/tools.tsx
// Onglet "Outils & Gestion" du tournoi : actions à effet qui ne rentrent pas
// dans le flux quotidien du dashboard — notifier les capitaines, détecter les
// conflits d'horaire, cloner le tournoi, générer les widgets embed, et
// convertir un quick-bracket en tournoi complet.

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import type { StaffProps } from '@/types/admin';
import { supabaseAdmin } from '@/utils/supabase';
import { isValidUUID } from '@/utils/apiHelpers';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import WidgetCard from '@/components/admin/dashboard/WidgetCard';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import Modal from '@/components/admin/Modal';
import ConflictRow from '@/components/admin/tournament/overview/ConflictRow';
import type { Conflict } from '@/components/admin/tournament/overview/types';
import { logger } from '@/utils/logger';
import nsAdminTournamentOverview from '@/lib/i18n/locales/admin-fr/adminTournamentOverview';
import nsAdminTournamentEmbed from '@/lib/i18n/locales/admin-fr/adminTournamentEmbed';

type TournamentBasics = {
  id: string;
  name: string;
  slug: string | null;
  status: string | null;
  description_info: string | null;
};

type SsrProps = {
  initialTournament: TournamentBasics | null;
};

export const getServerSideProps = withStaffPage<SsrProps>(
  { permission: 'manage_tournaments' },
  async (ctx, staffCtx) => {
    const rawId = ctx.params?.id ?? ctx.query.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id || !isValidUUID(String(id)) || !supabaseAdmin) {
      return { initialTournament: null };
    }
    const { data, error } = await supabaseAdmin
      .from('tournaments')
      .select('id, name, slug, status, description_info')
      .eq('tenant_id', staffCtx.tenantId)
      .eq('id', String(id))
      .maybeSingle();
    if (error) {
      logger.error('tools SSR tournament fetch error:', error);
    }
    return { initialTournament: (data as TournamentBasics | null) ?? null };
  }
);

type Props = StaffProps & SsrProps;

function TournamentToolsPage({ initialTournament }: Props) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : (id ?? '');

  const tov = useAdminT(nsAdminTournamentOverview);
  const te = useAdminT(nsAdminTournamentEmbed);
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const { mutate: mutateIdempotent } = useIdempotentMutation();
  const { mutate: notifyMutate } = useIdempotentMutation();

  // Copie locale du tournoi (rafraîchie après conversion quick-bracket).
  const [tournament, setTournament] = useState<TournamentBasics | null>(
    initialTournament
  );
  const [actionError, setActionError] = useState<string | null>(null);

  // Notifier les capitaines
  const [notifyingCaptains, setNotifyingCaptains] = useState(false);

  // Cloner le tournoi
  const [cloning, setCloning] = useState(false);
  const [showCloneConfirm, setShowCloneConfirm] = useState(false);

  // Détection de conflits d'horaire
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [loadingConflicts, setLoadingConflicts] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);

  // Conversion quick-bracket → tournoi complet
  const [convertingQuickBracket, setConvertingQuickBracket] = useState(false);

  // Panneau Embed / widgets
  const [embedPanelOpen, setEmbedPanelOpen] = useState(false);
  const [embedTheme, setEmbedTheme] = useState<'light' | 'dark'>('dark');
  const [embedBase, setEmbedBase] = useState<string>(
    process.env.NEXT_PUBLIC_SITE_URL ?? ''
  );
  const [copiedWidget, setCopiedWidget] = useState<string | null>(null);

  const isQuickBracket = tournament?.description_info === 'Quick bracket';

  // Fallback origin quand NEXT_PUBLIC_SITE_URL est absent (client-only).
  useEffect(() => {
    if (!embedBase && typeof window !== 'undefined') {
      setEmbedBase(window.location.origin);
    }
  }, [embedBase]);

  const fetchConflicts = useCallback(async () => {
    if (!tournamentId) return;
    setLoadingConflicts(true);
    try {
      const json = await adminFetchJson<{ conflicts: Conflict[] }>(
        `/api/admin/tournament/${tournamentId}/conflicts`
      );
      setConflicts(json.conflicts || []);
    } catch {
      setConflicts(null);
    } finally {
      setLoadingConflicts(false);
    }
  }, [tournamentId, adminFetchJson]);

  const notifyCaptains = useCallback(async () => {
    if (!tournamentId || notifyingCaptains) return;
    setNotifyingCaptains(true);
    try {
      const res = await notifyMutate('/api/admin/tournaments/notify-captains', {
        method: 'POST',
        body: JSON.stringify({ tournamentId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        addToast(json.error || tov.errorNotify, 'error');
        return;
      }
      const errCount = json.errors?.length ?? 0;
      const baseMsg = format(tov.notifyBaseMsg, {
        notified: json.notified ?? 0,
        emails: json.emailsSent ?? 0,
        messages: json.messagesSent ?? 0,
      });
      if (errCount > 0) {
        addToast(
          baseMsg + ' ' + format(tov.notifyErrorsSuffix, { count: errCount }),
          'info'
        );
      } else {
        addToast(baseMsg, 'success');
      }
    } catch (err: unknown) {
      addToast((err as Error)?.message || tov.errorNotify, 'error');
    } finally {
      setNotifyingCaptains(false);
    }
  }, [tournamentId, notifyingCaptains, addToast, notifyMutate, tov]);

  async function handleCloneTournament() {
    if (!tournamentId || cloning) return;
    setCloning(true);
    setActionError(null);
    try {
      const res = await mutateIdempotent(
        `/api/admin/tournament/${tournamentId}/clone`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || tov.errorClone);
      }
      const json = await res.json();
      if (json.tournament?.id) {
        router.push(`/admin/tournament/${json.tournament.id}/dashboard`);
      }
    } catch (err: unknown) {
      setActionError((err as Error)?.message ?? tov.errorCloneGeneric);
    } finally {
      setCloning(false);
      setShowCloneConfirm(false);
    }
  }

  async function convertQuickBracket() {
    if (!tournamentId || convertingQuickBracket) return;
    setConvertingQuickBracket(true);
    setActionError(null);
    try {
      const json = await adminFetchJson<{ tournament: TournamentBasics }>(
        `/api/admin/tournament/${tournamentId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ description_info: null }),
        }
      );
      // Refetch local : le tournoi n'est plus un quick-bracket.
      setTournament((prev) =>
        prev
          ? {
              ...prev,
              description_info: json.tournament?.description_info ?? null,
              slug: json.tournament?.slug ?? prev.slug,
              name: json.tournament?.name ?? prev.name,
              status: json.tournament?.status ?? prev.status,
            }
          : prev
      );
      addToast(tov.quickBracketConverted, 'success');
    } catch (err: unknown) {
      setActionError((err as Error)?.message ?? tov.errorUnexpected);
    } finally {
      setConvertingQuickBracket(false);
    }
  }

  const copyEmbedSnippet = useCallback(
    async (snippet: string, widgetKey: string) => {
      try {
        await navigator.clipboard.writeText(snippet);
        setCopiedWidget(widgetKey);
        window.setTimeout(() => {
          setCopiedWidget((v) => (v === widgetKey ? null : v));
        }, 1500);
        addToast(te.copiedToast, 'success');
      } catch {
        // Clipboard refusé : on ignore.
      }
    },
    [addToast, te.copiedToast]
  );

  return (
    <>
      <Head>
        <title>
          {tournament
            ? format(tov.pageTitleWith, { name: tournament.name })
            : tov.pageTitle}
        </title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="mx-auto max-w-[1500px] px-4 pb-14 pt-20 sm:px-6 lg:px-8">
          <TournamentTabsNav
            tournamentId={String(tournamentId)}
            active="tools"
          />

          <div className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight">
              {tournament?.name ?? tov.loading}
            </h1>
            <p className="mt-1 text-sm text-neutral-400">{tov.toolsTitle}</p>
          </div>

          {actionError && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/50 bg-red-900/40 px-4 py-3 text-sm text-red-100">
              <svg
                className="h-5 w-5 flex-shrink-0 text-red-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="flex-1">{actionError}</span>
              <button
                type="button"
                onClick={() => setActionError(null)}
                className="text-red-300 transition-colors hover:text-white"
                aria-label="×"
              >
                ×
              </button>
            </div>
          )}

          {!tournament ? (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-8 text-center text-neutral-400">
              {tov.notFound}
            </div>
          ) : (
            <WidgetCard title={tov.toolsTitle}>
              {/* Bannière conversion quick-bracket → tournoi complet */}
              {isQuickBracket && (
                <div className="mb-4 rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-900/25 via-neutral-900/30 to-indigo-900/15 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-white">
                        {tov.quickBracketTitle}
                      </h4>
                      <p className="mt-1 max-w-xl text-xs text-neutral-300">
                        {tov.quickBracketDesc}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={convertQuickBracket}
                      disabled={convertingQuickBracket}
                      className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-purple-500 disabled:cursor-wait disabled:opacity-60"
                    >
                      {convertingQuickBracket && (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      )}
                      {convertingQuickBracket
                        ? tov.quickBracketConverting
                        : tov.quickBracketConvertBtn}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={notifyCaptains}
                  disabled={notifyingCaptains}
                  title={tov.notifyCaptainsTitle}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {notifyingCaptains ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                      />
                    </svg>
                  )}
                  {notifyingCaptains ? tov.notifying : tov.notifyCaptains}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowConflicts(true);
                    fetchConflicts();
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-neutral-700"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  {tov.conflicts}
                </button>

                <button
                  type="button"
                  onClick={() => setShowCloneConfirm(true)}
                  disabled={cloning}
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  {tov.clone}
                </button>

                <button
                  type="button"
                  onClick={() => setEmbedPanelOpen((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-neutral-700"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                    />
                  </svg>
                  {te.panelTitle}
                  <span className="text-neutral-400">
                    {embedPanelOpen ? te.hide : te.show}
                  </span>
                </button>
              </div>

              {/* Panneau Embed / widgets */}
              {embedPanelOpen && (
                <div className="mt-4 space-y-4 rounded-xl border border-neutral-700/40 bg-neutral-900/40 p-4">
                  <p className="text-xs text-neutral-400">
                    {te.panelDescription}
                  </p>

                  <div className="flex items-center gap-3">
                    <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                      {te.themeLabel}
                    </span>
                    <div className="inline-flex rounded-lg border border-neutral-700 bg-neutral-900/50 p-0.5">
                      {(['dark', 'light'] as const).map((th) => (
                        <button
                          key={th}
                          type="button"
                          onClick={() => setEmbedTheme(th)}
                          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                            embedTheme === th
                              ? 'bg-neutral-700 text-white'
                              : 'text-neutral-400 hover:text-white'
                          }`}
                        >
                          {th === 'dark' ? te.themeDark : te.themeLight}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {(
                      [
                        {
                          key: 'bracket',
                          name: te.bracketName,
                          desc: te.bracketDesc,
                          height: 600,
                        },
                        {
                          key: 'standings',
                          name: te.standingsName,
                          desc: te.standingsDesc,
                          height: 480,
                        },
                        {
                          key: 'schedule',
                          name: te.scheduleName,
                          desc: te.scheduleDesc,
                          height: 520,
                        },
                      ] as const
                    ).map((w) => {
                      const slugOrId = tournament.slug ?? tournament.id;
                      const url = `${embedBase}/embed/tournament/${slugOrId}/${w.key}?theme=${embedTheme}`;
                      const snippet = `<iframe src="${url}" width="100%" height="${w.height}" style="border:0;border-radius:12px" loading="lazy" title="${w.name}"></iframe>`;
                      return (
                        <div
                          key={w.key}
                          className="rounded-xl border border-neutral-700/40 bg-neutral-900/50 p-4"
                        >
                          <div className="mb-2 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-white">
                                {w.name}
                              </div>
                              <div className="mt-0.5 text-xs text-neutral-500">
                                {w.desc}
                              </div>
                            </div>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex flex-shrink-0 items-center gap-1 text-xs text-blue-400 transition-colors hover:text-blue-300"
                            >
                              {te.openWidget}
                              <svg
                                className="h-3.5 w-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                />
                              </svg>
                            </a>
                          </div>
                          <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-600">
                            {te.snippetLabel}
                          </div>
                          <div className="relative">
                            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-neutral-700/60 bg-neutral-950/70 p-3 pr-20 font-mono text-[11px] text-neutral-300">
                              {snippet}
                            </pre>
                            <button
                              type="button"
                              onClick={() => copyEmbedSnippet(snippet, w.key)}
                              className="absolute right-2 top-2 rounded-md bg-neutral-700 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-neutral-600"
                            >
                              {copiedWidget === w.key
                                ? te.copiedBtn
                                : te.copyBtn}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </WidgetCard>
          )}
        </div>
      </div>

      {/* Confirmation de clonage */}
      {showCloneConfirm && (
        <ConfirmDialog
          title={tov.cloneTitle}
          subtitle={format(tov.cloneSubtitle, {
            name: tournament?.name ?? '',
          })}
          variant="warning"
          loading={cloning}
          confirmLabel={tov.clone}
          confirmingLabel={tov.cloning}
          onCancel={() => setShowCloneConfirm(false)}
          onConfirm={handleCloneTournament}
        />
      )}

      {/* Rapport de conflits d'horaire */}
      <Modal
        open={showConflicts}
        onClose={() => {
          setShowConflicts(false);
          setConflicts(null);
        }}
        size="2xl"
        panelClassName="max-h-[80vh]"
        title={
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <svg
              className="h-5 w-5 text-amber-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            {tov.conflictsReportTitle}
          </h3>
        }
        footer={
          <>
            <button
              onClick={() => {
                setShowConflicts(false);
                setConflicts(null);
              }}
              className="rounded-lg bg-neutral-700 px-4 py-2 text-sm font-medium transition-colors hover:bg-neutral-600"
            >
              {tov.close}
            </button>
            <button
              onClick={fetchConflicts}
              disabled={loadingConflicts}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {loadingConflicts ? tov.analyzing : tov.reanalyze}
            </button>
          </>
        }
      >
        {loadingConflicts ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-600 border-t-white" />
          </div>
        ) : conflicts === null ? (
          <div className="py-8 text-center text-sm text-neutral-400">
            {tov.conflictsLoadError}
          </div>
        ) : conflicts.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <svg
              className="mb-3 h-12 w-12 text-emerald-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="font-medium text-emerald-300">{tov.noConflict}</p>
            <p className="mt-1 text-xs text-neutral-500">
              {tov.noConflictDesc}
            </p>
          </div>
        ) : (
          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            <div className="mb-3 rounded-lg border border-amber-500/20 bg-amber-900/30 px-3 py-2 text-sm text-amber-300">
              {format(
                conflicts.length > 1
                  ? tov.conflictsCount_other
                  : tov.conflictsCount_one,
                { count: conflicts.length }
              )}
            </div>
            {conflicts.map((c, i) => (
              <ConflictRow key={i} conflict={c} tx={tov} />
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}

export default TournamentToolsPage;
