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
import { withAdminQuery } from '@/features/admin/_shared/query';
import {
  tournamentsUrls,
  tournamentUrls,
} from '@/features/admin/tournaments/client';
import { useUpdateTournament } from '@/features/admin/tournaments/hooks/useTournamentDetail';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { logger } from '@/utils/logger';
import nsAdminTournamentOverview from '@/lib/i18n/locales/admin-fr/adminTournamentOverview';
import nsAdminTournamentEmbed from '@/lib/i18n/locales/admin-fr/adminTournamentEmbed';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';

const CARD =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4';
const SECTION_TITLE =
  'font-[family-name:var(--fd)] text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--t1,#f4edf7)] [font-stretch:75%]';
const EYEBROW =
  'mb-1 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]';
const SPINNER =
  'h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent';

type TournamentBasics = {
  id: string;
  name: string;
  slug: string | null;
  status: string | null;
  description_info: string | null;
};

// Les sources OBS et les alertes ont rejoint Diffusion › Overlays (lots 5-6) :
// la capacité « overlays de régie » s'y lit (`utils/admin/overlayAccess.ts`),
// cet onglet n'en a plus besoin.
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

    return {
      initialTournament: (data as TournamentBasics | null) ?? null,
    };
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
  const updateTournament = useUpdateTournament<TournamentBasics>(tournamentId);
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

  const notifyCaptains = useCallback(async () => {
    if (!tournamentId || notifyingCaptains) return;
    setNotifyingCaptains(true);
    try {
      const res = await notifyMutate(tournamentsUrls.notifyCaptains, {
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
      const res = await mutateIdempotent(tournamentUrls.clone(tournamentId), {
        method: 'POST',
        body: JSON.stringify({}),
      });
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
      const json = await updateTournament.mutateAsync({
        description_info: null,
      });
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

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <TournamentTabsNav tournamentId={String(tournamentId)} active="tools" />

        <AdminPageHeader
          title={tournament?.name ?? tov.loading}
          subtitle={tov.toolsTitle}
        />

        {actionError && (
          <div className="mb-4 flex items-center gap-2 rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]">
            <svg
              className="h-5 w-5 flex-shrink-0 text-[var(--err,#ff6b6b)]"
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
              className="text-[var(--err,#ff6b6b)] transition-colors hover:text-[var(--t1,#f4edf7)]"
              aria-label="×"
            >
              ×
            </button>
          </div>
        )}

        {!tournament ? (
          <div className={`${CARD} p-8 text-center text-[var(--t3,#a39ba6)]`}>
            {tov.notFound}
          </div>
        ) : (
          <section className={`${CARD} sm:p-6`}>
            {/* Bannière conversion quick-bracket → tournoi complet */}
            {isQuickBracket && (
              <div className="mb-5 rounded-[var(--r-card,14px)] border border-[rgba(180,103,209,.4)] bg-[rgba(180,103,209,.08)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className={SECTION_TITLE}>{tov.quickBracketTitle}</h2>
                    <p className="mt-1 max-w-xl text-xs text-[var(--t2,#c7bfca)]">
                      {tov.quickBracketDesc}
                    </p>
                  </div>
                  <AdminButton
                    variant="primary"
                    size="sm"
                    onClick={convertQuickBracket}
                    disabled={convertingQuickBracket}
                  >
                    {convertingQuickBracket && <span className={SPINNER} />}
                    {convertingQuickBracket
                      ? tov.quickBracketConverting
                      : tov.quickBracketConvertBtn}
                  </AdminButton>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <AdminButton
                variant="danger"
                size="sm"
                onClick={notifyCaptains}
                disabled={notifyingCaptains}
                title={tov.notifyCaptainsTitle}
              >
                {notifyingCaptains ? (
                  <span className={SPINNER} />
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
              </AdminButton>

              {/* Le rapport de conflits vivait ici, en modale, et ne voyait
                  que le chevauchement d'équipe. L'onglet Planning répond à la
                  même question en mieux — contraintes d'équipe, dates hors
                  tournoi, créneaux surchargés, et la correction quand elle est
                  triviale. Deux écrans qui répondent différemment à « qu'est-ce
                  qui cloche dans ce calendrier ? », c'est un de trop. */}
              <AdminButtonLink
                href={`/admin/tournament/${tournamentId}/schedule`}
                variant="ghost"
                size="sm"
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
              </AdminButtonLink>

              <AdminButton
                variant="secondary"
                size="sm"
                onClick={() => setShowCloneConfirm(true)}
                disabled={cloning}
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
              </AdminButton>

              <AdminButton
                variant="ghost"
                size="sm"
                onClick={() => setEmbedPanelOpen((v) => !v)}
                aria-expanded={embedPanelOpen}
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
                <span className="text-[var(--t4,#807984)]">
                  {embedPanelOpen ? te.hide : te.show}
                </span>
              </AdminButton>
            </div>

            {/* Panneau Embed / widgets */}
            {embedPanelOpen && (
              <div className="mt-4 space-y-4 rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-4">
                <p className="text-xs text-[var(--t3,#a39ba6)]">
                  {te.panelDescription}
                </p>

                <div className="flex items-center gap-3">
                  <span className={EYEBROW}>{te.themeLabel}</span>
                  <div className="inline-flex rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-0.5">
                    {(['dark', 'light'] as const).map((th) => (
                      <button
                        key={th}
                        type="button"
                        onClick={() => setEmbedTheme(th)}
                        aria-pressed={embedTheme === th}
                        className={`rounded-[3px] px-3 py-1 text-xs font-medium transition-colors ${
                          embedTheme === th
                            ? 'bg-[rgba(180,103,209,.18)] text-[var(--or-200,#eec4ff)]'
                            : 'text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]'
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
                      <div key={w.key} className={CARD}>
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-[var(--t1,#f4edf7)]">
                              {w.name}
                            </div>
                            <div className="mt-0.5 text-xs text-[var(--t3,#a39ba6)]">
                              {w.desc}
                            </div>
                          </div>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex flex-shrink-0 items-center gap-1 text-xs text-[var(--or-200,#eec4ff)] transition-colors hover:text-[var(--t1,#f4edf7)]"
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
                        <div className={EYEBROW}>{te.snippetLabel}</div>
                        <div className="relative">
                          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-3 pr-24 font-mono text-[11px] text-[var(--t2,#c7bfca)]">
                            {snippet}
                          </pre>
                          <AdminButton
                            variant="ghost"
                            size="xs"
                            onClick={() => copyEmbedSnippet(snippet, w.key)}
                            className="absolute right-2 top-2 bg-[var(--s1,#100812)]"
                          >
                            {copiedWidget === w.key ? te.copiedBtn : te.copyBtn}
                          </AdminButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sources de stream (OBS) : elles ont rejoint Diffusion ›
                Overlays (lot 5), où l'on prépare une soirée sans passer par
                chaque tournoi. Le renvoi reste ici, là où on les cherchait,
                avec CE tournoi présélectionné. */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line,rgba(194,196,201,.12))] pt-5">
              <div>
                <h2 className={SECTION_TITLE}>{te.sourcesTitle}</h2>
                <p className="mt-1 text-xs text-[var(--t3,#a39ba6)]">
                  {te.sourcesMoved}
                </p>
              </div>
              <AdminButtonLink
                href={`/admin/diffusion/overlays?tournament=${tournament.id}`}
                variant="secondary"
                size="sm"
              >
                {te.sourcesMovedCta}
              </AdminButtonLink>
            </div>
          </section>
        )}
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
    </>
  );
}

export default withAdminQuery(TournamentToolsPage);
