// pages/admin/tournament/[id]/prize-pool.tsx
// Gestion organisateur de la cagnotte (prize pool) crowdfundée d'un tournoi —
// « Profondeur de la monétisation ». Config (seed / objectif / ouverture) +
// vue des contributions collectées.

import { useCallback, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { useHydrateOnce } from '@/features/admin/_shared/useHydrateOnce';
import { tournamentUrls } from '@/features/admin/tournaments/client';
import {
  type PrizePool,
  useTournamentPrizePool,
} from '@/features/admin/tournaments/hooks/useTournamentPrizePool';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import StatTile from '@/features/admin/_shared/ui/StatTile';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { StaffProps } from '@/types/admin';
import nsAdminTournamentPrizePool from '@/lib/i18n/locales/admin-fr/adminTournamentPrizePool';

const EYEBROW =
  'mb-2 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]';
const CARD =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]';
const SECTION_TITLE =
  'font-[family-name:var(--fd)] text-[13px] font-bold uppercase tracking-[0.18em] text-[var(--t1,#f4edf7)] [font-stretch:75%]';
const LABEL = 'mb-1 block text-sm font-medium text-[var(--t2,#c7bfca)]';
const INPUT =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';
const HINT = 'mt-1 text-xs text-[var(--t4,#807984)]';

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
  const t = useAdminT(nsAdminTournamentPrizePool);
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;

  const { mutate: saveMutate } = useIdempotentMutation();
  const { addToast } = useToast();

  const poolQuery = useTournamentPrizePool(tournamentId ?? '', t.errorLoad);
  const [actionError, setErrorMsg] = useState<string | null>(null);
  const { refetch: refetchPool } = poolQuery;
  const pool = poolQuery.data?.pool ?? null;
  const contributions = poolQuery.data?.contributions || [];
  const contributorCount = poolQuery.data?.contributorCount || 0;

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

  const hydrated = useHydrateOnce(tournamentId ?? null, poolQuery.data, (d) =>
    hydrateForm(d.pool)
  );
  const loading =
    poolQuery.isFetching || (!hydrated && !poolQuery.error && !!tournamentId);
  const errorMsg =
    actionError ??
    (poolQuery.error ? poolQuery.error.message || t.errorLoad : null);

  // Relire ET réhydrater le formulaire (bouton « rafraîchir », après
  // enregistrement) — comme avant.
  const fetchPool = useCallback(async () => {
    setErrorMsg(null);
    const { data } = await refetchPool();
    if (data) hydrateForm(data.pool);
  }, [refetchPool, hydrateForm]);

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
      const res = await saveMutate(tournamentUrls.prizePool(tournamentId), {
        method: 'PUT',
        body: JSON.stringify({
          title: titleInput.trim() || null,
          base_amount_cents: base,
          goal_amount_cents: goalCents,
          is_open: isOpen,
        }),
      });
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
      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <div className="max-w-4xl">
          <TournamentTabsNav
            tournamentId={String(tournamentId ?? '')}
            active="settings"
          />

          <p className={EYEBROW}>{t.eyebrow}</p>
          <AdminPageHeader
            title={t.pageTitle}
            subtitle={<span className="block max-w-2xl">{t.intro}</span>}
            actions={
              <AdminButton size="sm" onClick={() => fetchPool()}>
                {t.refresh}
              </AdminButton>
            }
          />

          {loading && (
            <div className={`${CARD} p-4 text-[var(--t2,#c7bfca)]`}>
              {t.loading}
            </div>
          )}

          {errorMsg && !loading && (
            <div className="mb-6 rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] p-4 text-[#ffc2c2]">
              {errorMsg}
            </div>
          )}

          {!loading && (
            <div className="space-y-6">
              {pool === null && (
                <div className="rounded-[var(--r-card,14px)] border border-[rgba(180,103,209,.4)] bg-[rgba(180,103,209,.08)] p-6 text-center">
                  <h2 className={SECTION_TITLE}>{t.noPoolTitle}</h2>
                  <p className="mt-2 mb-4 text-sm text-[var(--t3,#a39ba6)]">
                    {t.noPoolText}
                  </p>
                </div>
              )}

              {/* Récapitulatif des montants (seulement si la cagnotte existe) */}
              {pool && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <StatTile
                    label={t.baseSummaryLabel}
                    value={formatCents(pool.base_amount_cents)}
                  />
                  <StatTile
                    label={t.raisedLabel}
                    value={formatCents(pool.raised_amount_cents)}
                    hint={t.raisedHint}
                  />
                  <StatTile
                    tone="brand"
                    label={t.totalLabel}
                    value={formatCents(pool.total_cents)}
                    hint={
                      goalPercent !== null
                        ? format(t.goalProgress, {
                            percent: goalPercent,
                            goal: formatCents(pool.goal_amount_cents),
                          })
                        : undefined
                    }
                  />
                </div>
              )}

              {/* Formulaire de configuration */}
              <section className={`${CARD} p-6`}>
                <h2 className={`${SECTION_TITLE} mb-4`}>{t.configTitle}</h2>

                <div className="space-y-5">
                  <div>
                    <label htmlFor="pp-title" className={LABEL}>
                      {t.fieldTitleLabel}
                    </label>
                    <input
                      id="pp-title"
                      type="text"
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                      placeholder={t.fieldTitlePlaceholder}
                      maxLength={200}
                      className={INPUT}
                    />
                    <p className={HINT}>{t.fieldTitleHint}</p>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label htmlFor="pp-base" className={LABEL}>
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
                          className={`${INPUT} pr-8`}
                        />
                        <span
                          aria-hidden="true"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--t4,#807984)]"
                        >
                          €
                        </span>
                      </div>
                      <p className={HINT}>{t.fieldBaseHint}</p>
                    </div>

                    <div>
                      <label htmlFor="pp-goal" className={LABEL}>
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
                          className={`${INPUT} pr-8`}
                        />
                        <span
                          aria-hidden="true"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--t4,#807984)]"
                        >
                          €
                        </span>
                      </div>
                      <p className={HINT}>{t.fieldGoalHint}</p>
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
                        className="mt-0.5 h-4 w-4 accent-[var(--or,#b467d1)]"
                      />
                      <span>
                        <span className="block text-sm font-medium text-[var(--t2,#c7bfca)]">
                          {t.fieldIsOpenLabel}
                        </span>
                        <span className="block text-xs text-[var(--t4,#807984)]">
                          {t.fieldIsOpenHint}
                        </span>
                      </span>
                    </label>
                  </div>

                  <div>
                    <AdminButton
                      variant="primary"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? t.saving : pool === null ? t.createCta : t.save}
                    </AdminButton>
                  </div>
                </div>
              </section>

              {/* Liste des contributions */}
              {pool && (
                <section className={`${CARD} p-6`}>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className={SECTION_TITLE}>{t.contributionsTitle}</h2>
                    <span
                      className="text-sm text-[var(--t3,#a39ba6)]"
                      data-numeric
                    >
                      {format(
                        contributorCount > 1
                          ? t.contributionsCount_other
                          : t.contributionsCount_one,
                        { count: contributorCount }
                      )}
                    </span>
                  </div>

                  {contributions.length === 0 ? (
                    <div className="rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-4 text-sm text-[var(--t3,#a39ba6)]">
                      {t.contributionsEmpty}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--line2,rgba(194,196,201,.2))] text-left font-[family-name:var(--fd)] text-[11px] uppercase tracking-[0.12em] text-[var(--t3,#a39ba6)]">
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
                              className="border-b border-[var(--line,rgba(194,196,201,.12))] last:border-0"
                            >
                              <td className="whitespace-nowrap py-2 pr-4 text-[var(--t3,#a39ba6)]">
                                {formatDate(c.created_at)}
                              </td>
                              <td className="py-2 pr-4 text-[var(--t1,#f4edf7)]">
                                {c.is_anonymous || !c.contributor_name ? (
                                  <span className="italic text-[var(--t4,#807984)]">
                                    {t.anonymous}
                                  </span>
                                ) : (
                                  c.contributor_name
                                )}
                              </td>
                              <td
                                className="whitespace-nowrap py-2 pr-4 text-right font-medium text-[var(--t1,#f4edf7)]"
                                data-numeric
                              >
                                {formatCents(c.amount_cents)}
                              </td>
                              <td className="py-2 text-[var(--t2,#c7bfca)]">
                                {c.message ? (
                                  c.message
                                ) : (
                                  <span className="text-[var(--t4,#807984)]">
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

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

export default withAdminQuery(AdminTournamentPrizePoolPage);
