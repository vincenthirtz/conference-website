// pages/admin/tournament/[id]/prize-pool.tsx
// Gestion organisateur de la cagnotte (prize pool) crowdfundée d'un tournoi —
// « Profondeur de la monétisation ». Config (seed / objectif / ouverture) +
// vue des contributions collectées.

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { StaffProps } from '@/types/admin';

type PrizePool = {
  id: string;
  tournament_id: string;
  tenant_id: string;
  title: string | null;
  currency: string;
  goal_amount_cents: number | null;
  base_amount_cents: number;
  raised_amount_cents: number;
  is_open: boolean;
  total_cents: number;
  created_at: string;
  updated_at: string;
};

type Contribution = {
  id: string;
  amount_cents: number;
  contributor_name: string | null;
  is_anonymous: boolean;
  message: string | null;
  helloasso_payment_id: string | null;
  checkout_intent_id: string | null;
  created_at: string;
};

type ApiResponse = {
  pool: PrizePool | null;
  contributions: Contribution[];
  contributorCount: number;
};

/**
 * Convertit une saisie euros (chaîne, virgule ou point acceptés) en centimes
 * entiers. Renvoie `null` pour une saisie vide et `NaN` pour une saisie
 * invalide. `Math.round` neutralise les artefacts flottants (ex. 19,99 €).
 */
function eurosToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const normalized = trimmed.replace(/\s/g, '').replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value)) return NaN;
  return Math.round(value * 100);
}

/** Centimes → chaîne euros pour préremplir un champ (jamais de notation exp.). */
function centsToEurosInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return String(cents / 100);
}

function AdminTournamentPrizePoolPage(_: StaffProps) {
  const t = useAdminT('adminTournamentPrizePool');
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;

  const { adminFetchJson } = useAdminFetch();
  const { mutate: saveMutate } = useIdempotentMutation();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pool, setPool] = useState<PrizePool | null>(null);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [contributorCount, setContributorCount] = useState(0);

  // État du formulaire (euros en chaîne pour la config, converti en centimes
  // à l'enregistrement).
  const [titleInput, setTitleInput] = useState('');
  const [baseInput, setBaseInput] = useState('');
  const [goalInput, setGoalInput] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const currency = pool?.currency || 'EUR';

  const formatCents = useCallback(
    (cents: number | null | undefined) =>
      new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency,
      }).format((cents ?? 0) / 100),
    [currency]
  );

  const formatDate = useCallback(
    (iso: string) =>
      new Date(iso).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    []
  );

  const hydrateForm = useCallback((p: PrizePool | null) => {
    setTitleInput(p?.title ?? '');
    setBaseInput(centsToEurosInput(p?.base_amount_cents ?? 0));
    setGoalInput(centsToEurosInput(p?.goal_amount_cents ?? null));
    setIsOpen(p?.is_open ?? false);
  }, []);

  const fetchPool = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const json = await adminFetchJson<ApiResponse>(
        `/api/admin/tournaments/${tournamentId}/prize-pool`
      );
      setPool(json.pool);
      setContributions(json.contributions || []);
      setContributorCount(json.contributorCount || 0);
      hydrateForm(json.pool);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.errorLoad);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, adminFetchJson, hydrateForm, t]);

  useEffect(() => {
    if (!tournamentId) return;
    fetchPool();
  }, [tournamentId, fetchPool]);

  async function handleSave() {
    if (!tournamentId) return;

    // Base : vide = 0, sinon entier >= 0.
    const baseCents = eurosToCents(baseInput);
    if (Number.isNaN(baseCents)) {
      addToast(t.errBaseInvalid, 'error');
      return;
    }
    const base = baseCents ?? 0;
    if (base < 0) {
      addToast(t.errBaseNegative, 'error');
      return;
    }

    // Objectif : vide = pas d'objectif (null), sinon entier > 0.
    const goalCents = eurosToCents(goalInput);
    if (Number.isNaN(goalCents)) {
      addToast(t.errGoalInvalid, 'error');
      return;
    }
    if (goalCents !== null && goalCents <= 0) {
      addToast(t.errGoalPositive, 'error');
      return;
    }

    const wasCreate = pool === null;

    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await saveMutate(
        `/api/admin/tournaments/${tournamentId}/prize-pool`,
        {
          method: 'PUT',
          body: JSON.stringify({
            title: titleInput.trim() || null,
            base_amount_cents: base,
            goal_amount_cents: goalCents,
            is_open: isOpen,
          }),
        }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errorSave);
      }
      addToast(wasCreate ? t.toastCreated : t.toastSaved, 'success');
      await fetchPool();
    } catch (err: unknown) {
      const message = (err as Error)?.message || t.errorSave;
      setErrorMsg(message);
      addToast(message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const goalPercent =
    pool && pool.goal_amount_cents && pool.goal_amount_cents > 0
      ? Math.min(
          100,
          Math.round((pool.total_cents / pool.goal_amount_cents) * 100)
        )
      : null;

  return (
    <>
      <Head>
        <title>{t.headTitle}</title>
      </Head>
      <div className="min-h-screen bg-neutral-950 text-white pt-24">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <TournamentTabsNav
            tournamentId={String(tournamentId ?? '')}
            active="prize-pool"
          />

          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-purple-200/80">
                {t.eyebrow}
              </p>
              <h1 className="text-2xl font-semibold">{t.pageTitle}</h1>
              <p className="text-sm text-neutral-400 mt-2 max-w-2xl">
                {t.intro}
              </p>
            </div>
            <button
              type="button"
              onClick={() => fetchPool()}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10 flex-shrink-0"
            >
              {t.refresh}
            </button>
          </div>

          {loading && (
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              {t.loading}
            </div>
          )}

          {errorMsg && !loading && (
            <div className="p-4 rounded-lg bg-red-900/60 border border-red-500/40 text-red-100 mb-6">
              {errorMsg}
            </div>
          )}

          {!loading && (
            <div className="space-y-6">
              {pool === null && (
                <div className="rounded-2xl border border-purple-500/30 bg-purple-500/5 p-6 text-center">
                  <h2 className="text-lg font-semibold">{t.noPoolTitle}</h2>
                  <p className="text-sm text-neutral-400 mt-2 mb-4">
                    {t.noPoolText}
                  </p>
                </div>
              )}

              {/* Récapitulatif des montants (seulement si la cagnotte existe) */}
              {pool && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                    <p className="text-xs uppercase tracking-wide text-neutral-400">
                      {t.baseSummaryLabel}
                    </p>
                    <p className="text-xl font-semibold mt-1">
                      {formatCents(pool.base_amount_cents)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                    <p className="text-xs uppercase tracking-wide text-neutral-400">
                      {t.raisedLabel}
                    </p>
                    <p className="text-xl font-semibold mt-1">
                      {formatCents(pool.raised_amount_cents)}
                    </p>
                    <p className="text-[11px] text-neutral-500 mt-1">
                      {t.raisedHint}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-purple-500/10 border border-purple-400/30 p-4">
                    <p className="text-xs uppercase tracking-wide text-purple-200/80">
                      {t.totalLabel}
                    </p>
                    <p className="text-xl font-semibold mt-1 text-purple-100">
                      {formatCents(pool.total_cents)}
                    </p>
                    {goalPercent !== null && (
                      <p className="text-[11px] text-purple-200/70 mt-1">
                        {format(t.goalProgress, {
                          percent: goalPercent,
                          goal: formatCents(pool.goal_amount_cents),
                        })}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Formulaire de configuration */}
              <section className="rounded-2xl bg-white/5 border border-white/10 p-6">
                <h2 className="text-lg font-semibold mb-4">{t.configTitle}</h2>

                <div className="space-y-5">
                  <div>
                    <label
                      htmlFor="pp-title"
                      className="block text-sm font-medium text-neutral-200 mb-1"
                    >
                      {t.fieldTitleLabel}
                    </label>
                    <input
                      id="pp-title"
                      type="text"
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                      placeholder={t.fieldTitlePlaceholder}
                      maxLength={200}
                      className="w-full px-3 py-2 rounded-xl bg-neutral-900/60 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    />
                    <p className="text-xs text-neutral-500 mt-1">
                      {t.fieldTitleHint}
                    </p>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="pp-base"
                        className="block text-sm font-medium text-neutral-200 mb-1"
                      >
                        {t.fieldBaseLabel}
                      </label>
                      <div className="relative">
                        <input
                          id="pp-base"
                          type="text"
                          inputMode="decimal"
                          value={baseInput}
                          onChange={(e) => setBaseInput(e.target.value)}
                          placeholder="0"
                          className="w-full px-3 py-2 pr-8 rounded-xl bg-neutral-900/60 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                        />
                        <span
                          aria-hidden="true"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 text-sm"
                        >
                          €
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">
                        {t.fieldBaseHint}
                      </p>
                    </div>

                    <div>
                      <label
                        htmlFor="pp-goal"
                        className="block text-sm font-medium text-neutral-200 mb-1"
                      >
                        {t.fieldGoalLabel}
                      </label>
                      <div className="relative">
                        <input
                          id="pp-goal"
                          type="text"
                          inputMode="decimal"
                          value={goalInput}
                          onChange={(e) => setGoalInput(e.target.value)}
                          placeholder={t.fieldGoalPlaceholder}
                          className="w-full px-3 py-2 pr-8 rounded-xl bg-neutral-900/60 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                        />
                        <span
                          aria-hidden="true"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 text-sm"
                        >
                          €
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">
                        {t.fieldGoalHint}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        role="switch"
                        aria-checked={isOpen}
                        checked={isOpen}
                        onChange={(e) => setIsOpen(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-neutral-600 bg-neutral-900 accent-purple-600"
                      />
                      <span>
                        <span className="block text-sm font-medium text-neutral-200">
                          {t.fieldIsOpenLabel}
                        </span>
                        <span className="block text-xs text-neutral-500">
                          {t.fieldIsOpenHint}
                        </span>
                      </span>
                    </label>
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {saving ? t.saving : pool === null ? t.createCta : t.save}
                    </button>
                  </div>
                </div>
              </section>

              {/* Liste des contributions */}
              {pool && (
                <section className="rounded-2xl bg-white/5 border border-white/10 p-6">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <h2 className="text-lg font-semibold">
                      {t.contributionsTitle}
                    </h2>
                    <span className="text-sm text-neutral-400">
                      {format(
                        contributorCount > 1
                          ? t.contributionsCount_other
                          : t.contributionsCount_one,
                        { count: contributorCount }
                      )}
                    </span>
                  </div>

                  {contributions.length === 0 ? (
                    <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-sm text-neutral-400">
                      {t.contributionsEmpty}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wide text-neutral-400 border-b border-white/10">
                            <th scope="col" className="py-2 pr-4 font-medium">
                              {t.colDate}
                            </th>
                            <th scope="col" className="py-2 pr-4 font-medium">
                              {t.colContributor}
                            </th>
                            <th
                              scope="col"
                              className="py-2 pr-4 font-medium text-right"
                            >
                              {t.colAmount}
                            </th>
                            <th scope="col" className="py-2 font-medium">
                              {t.colMessage}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {contributions.map((c) => (
                            <tr
                              key={c.id}
                              className="border-b border-white/5 last:border-0"
                            >
                              <td className="py-2 pr-4 text-neutral-400 whitespace-nowrap">
                                {formatDate(c.created_at)}
                              </td>
                              <td className="py-2 pr-4">
                                {c.is_anonymous || !c.contributor_name ? (
                                  <span className="text-neutral-500 italic">
                                    {t.anonymous}
                                  </span>
                                ) : (
                                  c.contributor_name
                                )}
                              </td>
                              <td className="py-2 pr-4 text-right font-medium whitespace-nowrap">
                                {formatCents(c.amount_cents)}
                              </td>
                              <td className="py-2 text-neutral-300">
                                {c.message ? (
                                  c.message
                                ) : (
                                  <span className="text-neutral-600">
                                    {t.noValue}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage('manager');

export default AdminTournamentPrizePoolPage;
