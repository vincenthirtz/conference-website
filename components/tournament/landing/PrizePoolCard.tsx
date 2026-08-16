// components/tournament/landing/PrizePoolCard.tsx
//
// Section « Cagnotte » — cash-prize crowdfundé (« Profondeur de la
// monétisation »). Consomme UNIQUEMENT l'endpoint public
// `GET /api/tournaments/{id}/prize-pool` (montants en CENTIMES) et masque la
// section entière tant qu'aucune cagnotte n'existe (exists:false), en erreur,
// ou pendant le chargement initial — pour ne jamais afficher puis retirer un
// bloc (flash de layout).
//
// États :
//   - loading / error / exists:false → section masquée (return null)
//   - exists:true, isOpen:true       → total + jauge + bouton « Contribuer »
//   - exists:true, isOpen:false       → total + pastille « Cagnotte clôturée »
//
// Le paiement passe par une modale de contribution → POST prize-checkout →
// redirection navigateur vers HelloAsso. Au retour, ?prize=success déclenche un
// toast de remerciement (query strippée). Data-fetching client (plain fetch),
// miroir d'ArbitrationPanel : l'agrégat est public et caché côté API.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useT, format } from '@/lib/i18n/useT';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { useToast } from '@/components/Toast';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { Section, SectionHeader, Reveal, GlassCard } from './primitives';
import nsTournamentLanding from '@/lib/i18n/locales/fr/tournamentLanding';

type LandingDict = typeof nsTournamentLanding.fr;

type PublicContributor = {
  name: string | null;
  amountCents: number;
  message: string | null;
  createdAt: string | null;
};

type PrizePool = {
  exists: boolean;
  isOpen: boolean;
  currency: string;
  baseAmountCents: number;
  raisedAmountCents: number;
  totalCents: number;
  goalAmountCents: number | null;
  contributorCount: number;
  recentContributors: PublicContributor[];
};

type FetchState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; pool: PrizePool };

const RECENT_SHOWN = 5;
const PRESET_EUROS = [5, 10, 20, 50];
const MIN_CENTS = 100;
const MAX_CENTS = 100_000_00;

/** Formate des centimes en devise localisée (décimales masquées si rondes). */
function formatMoney(
  cents: number,
  currency: string,
  lang: 'fr' | 'en'
): string {
  const value = cents / 100;
  const locale = lang === 'en' ? 'en-GB' : 'fr-FR';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency || 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
  } catch {
    // Devise inconnue → repli sobre.
    return `${value.toFixed(Number.isInteger(value) ? 0 : 2)} ${currency}`;
  }
}

/** Sélection singulier / pluriel côté composant (clés `_one` / `_other`). */
function plural(
  t: LandingDict,
  base: 'poolContributors',
  count: number
): string {
  const key = count === 1 ? `${base}_one` : `${base}_other`;
  const template = (t as unknown as Record<string, string>)[key] ?? '';
  return format(template, { count });
}

export default function PrizePoolCard({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const t = useT(nsTournamentLanding);
  const { lang } = useLang();
  const { addToast } = useToast();
  const router = useRouter();
  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const [modalOpen, setModalOpen] = useState(false);

  // ── Chargement de la jauge ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    fetch(`/api/tournaments/${encodeURIComponent(tournamentId)}/prize-pool`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as PrizePool;
      })
      .then((pool) => {
        if (!cancelled) setState({ status: 'ready', pool });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  // ── Retour de paiement HelloAsso : ?prize=success | error ─────────────────
  useEffect(() => {
    if (!router.isReady) return;
    const prize = router.query.prize;
    if (prize !== 'success' && prize !== 'error') return;
    addToast(
      prize === 'success' ? t.poolThanks : t.poolPaymentError,
      prize === 'success' ? 'success' : 'error'
    );
    // Strippe le param pour éviter un re-toast au refresh / back.
    const { prize: _omit, ...rest } = router.query;
    void router.replace({ pathname: router.pathname, query: rest }, undefined, {
      shallow: true,
    });
  }, [router, addToast, t.poolThanks, t.poolPaymentError]);

  // loading / error / pas de cagnotte → section masquée (pas de flash).
  if (state.status !== 'ready') return null;
  const pool = state.pool;
  if (!pool.exists) return null;

  const total = formatMoney(pool.totalCents, pool.currency, lang);
  const hasGoal = pool.goalAmountCents != null && pool.goalAmountCents > 0;
  const goalPct = hasGoal
    ? Math.min(
        100,
        Math.round(
          (pool.raisedAmountCents / (pool.goalAmountCents as number)) * 100
        )
      )
    : 0;
  const goalReached =
    hasGoal && pool.raisedAmountCents >= (pool.goalAmountCents as number);
  const recent = pool.recentContributors.slice(0, RECENT_SHOWN);

  return (
    <Section id="prize-pool">
      <SectionHeader
        eyebrow={t.poolEyebrow}
        title={t.poolHeading}
        subtitle={t.poolSubtitle}
      />

      <Reveal className="mx-auto max-w-3xl">
        <GlassCard className="p-6 sm:p-8">
          {/* Total + compteur contributeurs */}
          <div className="flex flex-col items-center text-center">
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-yellow)]">
              {t.poolTotalLabel}
            </span>
            <span className="mt-2 text-5xl font-black tracking-tight tabular-nums text-white sm:text-6xl">
              {total}
            </span>
            <span className="mt-2 text-sm text-gray-400">
              {plural(t, 'poolContributors', pool.contributorCount)}
            </span>
          </div>

          {/* Jauge vers l'objectif (masquée si aucun objectif défini) */}
          {hasGoal && (
            <div className="mt-7">
              <div className="mb-2 flex items-baseline justify-between text-xs">
                <span className="font-medium text-gray-300">
                  {format(t.poolGoalProgress, {
                    raised: formatMoney(
                      pool.raisedAmountCents,
                      pool.currency,
                      lang
                    ),
                    goal: formatMoney(
                      pool.goalAmountCents as number,
                      pool.currency,
                      lang
                    ),
                  })}
                </span>
                <span className="font-bold tabular-nums text-[var(--color-yellow)]">
                  {goalPct}%
                </span>
              </div>
              <div
                className="h-3 w-full overflow-hidden rounded-full border border-white/10 bg-white/5"
                role="progressbar"
                aria-valuenow={pool.raisedAmountCents}
                aria-valuemin={0}
                aria-valuemax={pool.goalAmountCents as number}
                aria-label={t.poolProgressAria}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--color-yellow)] to-[var(--color-green)] transition-[width] duration-700 ease-out"
                  style={{ width: `${goalPct}%` }}
                />
              </div>
              {goalReached && (
                <p className="mt-2 text-center text-xs font-semibold text-[var(--color-green-light)]">
                  {t.poolGoalReached}
                </p>
              )}
            </div>
          )}

          {/* CTA contribuer / état clôturé */}
          <div className="mt-7 flex justify-center">
            {pool.isOpen ? (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--color-yellow)] to-[var(--color-green)] px-7 py-3 text-sm font-bold text-[#0a0a1a] shadow-lg shadow-[var(--color-yellow)]/20 transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a1a]"
                aria-haspopup="dialog"
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
                </svg>
                {t.poolContribute}
              </button>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-gray-300">
                <span
                  className="h-2 w-2 rounded-full bg-gray-500"
                  aria-hidden="true"
                />
                {t.poolClosed}
              </span>
            )}
          </div>

          {/* Dernières contributions */}
          <div className="mt-8 border-t border-white/10 pt-6">
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
              {t.poolRecentHeading}
            </h3>
            {recent.length === 0 ? (
              <p className="mt-3 text-sm text-gray-400">
                {t.poolEmptyContributors}
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {recent.map((c, i) => (
                  <li
                    key={`${c.createdAt ?? 'c'}-${i}`}
                    className="flex items-start justify-between gap-3 rounded-xl bg-white/[0.03] px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">
                        {c.name || t.poolAnonymous}
                      </p>
                      {c.message && (
                        <p className="mt-0.5 truncate text-xs text-gray-400">
                          “{c.message}”
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--color-yellow)]">
                      {formatMoney(c.amountCents, pool.currency, lang)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </GlassCard>
      </Reveal>

      {modalOpen && pool.isOpen && (
        <ContributeModal
          tournamentId={tournamentId}
          currency={pool.currency}
          t={t}
          lang={lang}
          onClose={() => setModalOpen(false)}
        />
      )}
    </Section>
  );
}

/* ═══════════════════════════════════════════════════════════
 * Modale de contribution — montant (chips + libre) + champs optionnels,
 * POST prize-checkout → redirection HelloAsso. Accessible (dialog, focus
 * trap, Escape, labels).
 * ═══════════════════════════════════════════════════════════*/

function ContributeModal({
  tournamentId,
  currency,
  t,
  lang,
  onClose,
}: {
  tournamentId: string;
  currency: string;
  t: LandingDict;
  lang: 'fr' | 'en';
  onClose: () => void;
}) {
  const dialogRef = useFocusTrap<HTMLDivElement>();
  const { addToast } = useToast();

  const [presetEuros, setPresetEuros] = useState<number | null>(10);
  const [customEuros, setCustomEuros] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Montant effectif (euros) : chip sélectionné, ou saisie libre.
  const euros = useMemo(() => {
    if (customEuros.trim() !== '') {
      const n = Number(customEuros.replace(',', '.'));
      return Number.isFinite(n) ? n : NaN;
    }
    return presetEuros ?? NaN;
  }, [customEuros, presetEuros]);

  const amountCents = Number.isFinite(euros) ? Math.round(euros * 100) : NaN;
  const amountValid =
    Number.isFinite(amountCents) &&
    amountCents >= MIN_CENTS &&
    amountCents <= MAX_CENTS;

  // Escape ferme la modale (le focus trap gère Tab + restauration).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const mapError = useCallback(
    (code: string | undefined, status: number): string => {
      if (status === 429) return t.poolErrRate;
      switch (code) {
        case 'POOL_CLOSED':
          return t.poolErrClosed;
        case 'POOL_NOT_FOUND':
          return t.poolErrNotFound;
        case 'INVALID_BODY':
          return t.poolErrInvalid;
        default:
          return t.poolErrGeneric;
      }
    },
    [t]
  );

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    if (!amountValid) {
      setError(t.poolErrInvalid);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        tournamentId,
        amountCents,
        isAnonymous: anonymous,
      };
      if (!anonymous && name.trim()) body.contributorName = name.trim();
      if (message.trim()) body.message = message.trim();
      if (email.trim()) body.email = email.trim();

      const res = await fetch('/api/helloasso/prize-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        let code: string | undefined;
        try {
          const j = (await res.json()) as { code?: string };
          code = j.code;
        } catch {
          /* corps non-JSON */
        }
        const msg = mapError(code, res.status);
        setError(msg);
        addToast(msg, 'error');
        setSubmitting(false);
        return;
      }

      const { redirectUrl } = (await res.json()) as { redirectUrl?: string };
      if (!redirectUrl) {
        setError(t.poolErrGeneric);
        addToast(t.poolErrGeneric, 'error');
        setSubmitting(false);
        return;
      }
      // Redirection vers HelloAsso (garde submitting pour figer l'UI).
      window.location.assign(redirectUrl);
    } catch {
      setError(t.poolErrGeneric);
      addToast(t.poolErrGeneric, 'error');
      setSubmitting(false);
    }
  }, [
    submitting,
    amountValid,
    amountCents,
    anonymous,
    name,
    message,
    email,
    tournamentId,
    mapError,
    addToast,
    t.poolErrInvalid,
    t.poolErrGeneric,
  ]);

  const submitLabel = amountValid
    ? format(t.poolSubmit, {
        amount: formatMoney(amountCents, currency, lang),
      })
    : t.poolSubmitGeneric;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prize-pool-modal-title"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-white/10 bg-[#0d0a1a] text-white shadow-2xl shadow-[var(--color-yellow)]/10 sm:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <h2
            id="prize-pool-modal-title"
            className="text-base font-semibold text-white"
          >
            {t.poolModalTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.poolClose}
            className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <p className="text-sm text-gray-400">{t.poolModalIntro}</p>

          {error && (
            <div
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* Montant : chips presets */}
          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-400">
              {t.poolAmountLabel}
            </span>
            <div className="flex flex-wrap gap-2">
              {PRESET_EUROS.map((v) => {
                const selected = customEuros.trim() === '' && presetEuros === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      setPresetEuros(v);
                      setCustomEuros('');
                    }}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)] ${
                      selected
                        ? 'border-[var(--color-yellow)]/60 bg-[var(--color-yellow)]/15 text-[var(--color-yellow)]'
                        : 'border-white/15 bg-white/5 text-gray-200 hover:border-white/30'
                    }`}
                    aria-pressed={selected}
                  >
                    {v} €
                  </button>
                );
              })}
            </div>
            <div className="mt-3">
              <label
                htmlFor="prize-pool-custom"
                className="mb-1 block text-xs text-gray-400"
              >
                {t.poolAmountCustom}
              </label>
              <div className="relative">
                <input
                  id="prize-pool-custom"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  max={100000}
                  step="1"
                  value={customEuros}
                  onChange={(e) => setCustomEuros(e.target.value)}
                  onFocus={() => setPresetEuros(null)}
                  placeholder={t.poolAmountPlaceholder}
                  className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 pr-9 text-sm text-white placeholder:text-gray-500 focus:border-[var(--color-yellow)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--color-yellow)]/40"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  €
                </span>
              </div>
            </div>
          </div>

          {/* Nom (désactivé si anonyme) */}
          <div>
            <label
              htmlFor="prize-pool-name"
              className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-400"
            >
              {t.poolNameLabel}
            </label>
            <input
              id="prize-pool-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={anonymous}
              maxLength={100}
              placeholder={t.poolNamePlaceholder}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-[var(--color-yellow)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--color-yellow)]/40 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* Message */}
          <div>
            <label
              htmlFor="prize-pool-message"
              className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-400"
            >
              {t.poolMessageLabel}
            </label>
            <textarea
              id="prize-pool-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder={t.poolMessagePlaceholder}
              className="w-full resize-none rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-[var(--color-yellow)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--color-yellow)]/40"
            />
          </div>

          {/* Email */}
          <div>
            <label
              htmlFor="prize-pool-email"
              className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-400"
            >
              {t.poolEmailLabel}
            </label>
            <input
              id="prize-pool-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              placeholder={t.poolEmailPlaceholder}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-[var(--color-yellow)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--color-yellow)]/40"
            />
          </div>

          {/* Anonyme */}
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-white/5 text-[var(--color-yellow)] focus:ring-[var(--color-yellow)]/50"
            />
            {t.poolAnonymousCheckbox}
          </label>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-3 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-gray-200 transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50"
          >
            {t.poolCancel}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !amountValid}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--color-yellow)] to-[var(--color-green)] px-6 py-2.5 text-sm font-bold text-[#0a0a1a] transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0a1a] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {submitting ? t.poolProcessing : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
