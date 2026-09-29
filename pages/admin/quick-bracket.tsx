// pages/admin/quick-bracket.tsx
//
// "Quick bracket" : créateur de bracket en 30 secondes. Un nom, un format,
// une liste de participants collée → POST /api/admin/quick-bracket, qui crée
// un tournoi public publié avec des équipes « coquilles » et un bracket généré.
//
// Le serveur reste l'autorité : la validation client (min/max, doublons,
// taille de bracket) est un miroir best-effort pour un feedback immédiat.

import { useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import Breadcrumb from '@/components/admin/Breadcrumb';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import type { StaffProps } from '@/types/admin';
import nsAdminQuickBracket from '@/lib/i18n/locales/admin-fr/adminQuickBracket';

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

type BracketFormat = 'single_elim' | 'double_elim';
type BestOf = 1 | 3 | 5;

/** Miroir de la normalisation serveur : retours ligne / virgules / points-virgules. */
function parseParticipants(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Prochaine puissance de 2 >= n, plancher 4, plafond 32 (miroir serveur). */
function bracketSizeFor(n: number): 4 | 8 | 16 | 32 {
  let size = 4;
  while (size < n) size *= 2;
  return Math.min(size, 32) as 4 | 8 | 16 | 32;
}

/** Doublons insensibles à la casse → première occurrence de chaque nom dupliqué. */
function findDuplicates(names: string[]): string[] {
  const seen = new Map<string, string>();
  const dupes = new Set<string>();
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) {
      dupes.add(seen.get(key) as string);
    } else {
      seen.set(key, name);
    }
  }
  return [...dupes];
}

function AdminQuickBracketPage(_props: StaffProps) {
  const t = useAdminT(nsAdminQuickBracket);
  const router = useRouter();
  const { mutateJson } = useIdempotentMutation();
  const { addToast } = useToast();

  const [name, setName] = useState('');
  const [formatType, setFormatType] = useState<BracketFormat>('single_elim');
  const [participantsRaw, setParticipantsRaw] = useState('');
  const [bestOf, setBestOf] = useState<BestOf>(3);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const participants = useMemo(
    () => parseParticipants(participantsRaw),
    [participantsRaw]
  );
  const count = participants.length;
  const duplicates = useMemo(
    () => findDuplicates(participants),
    [participants]
  );
  const size = count >= 2 ? bracketSizeFor(count) : null;
  const byes = size !== null ? Math.max(0, Math.min(size, 32) - count) : 0;

  const tooFew = count < 2;
  const tooMany = count > 32;
  const hasDupes = duplicates.length > 0;
  const nameValid = name.trim().length >= 2;
  const canSubmit =
    !submitting && nameValid && !tooFew && !tooMany && !hasDupes;

  const clientValidationMsg = useMemo(() => {
    if (tooFew) return t.errorMinParticipants;
    if (tooMany) return t.errorMaxParticipants;
    if (hasDupes)
      return format(t.errorDuplicates, { names: duplicates.join(', ') });
    return null;
  }, [tooFew, tooMany, hasDupes, duplicates, t]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Garde-fous client (le serveur reste autoritaire).
    if (!nameValid || tooFew || tooMany || hasDupes) {
      setError(clientValidationMsg);
      return;
    }

    setSubmitting(true);
    try {
      const json = await mutateJson<{ tournamentId: string; slug: string }>(
        '/api/admin/quick-bracket',
        {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            format: formatType,
            participants: participantsRaw,
            bestOf,
          }),
        }
      );
      addToast(t.successToast, 'success');
      router.push(`/tournament/${json.slug}/bracket`);
    } catch (err) {
      setError((err as Error)?.message || t.errorGeneric);
      setSubmitting(false);
    }
  }

  const inputClass =
    'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2.5 text-[var(--t1,#f4edf7)] focus:outline-none focus:ring-2 focus:ring-[var(--or,#b467d1)]';
  const labelClass = 'mb-1 block text-sm text-[var(--t3,#a39ba6)]';

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <div className="mx-auto w-full max-w-2xl">
          <Breadcrumb
            items={[
              { label: t.breadcrumbTournaments, href: '/admin/tournaments' },
              { label: t.heading },
            ]}
          />

          <div className="mt-4">
            <AdminPageHeader title={t.heading} subtitle={t.description} />
          </div>

          <form
            onSubmit={submit}
            className="space-y-6 rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6"
          >
            {/* Nom */}
            <div>
              <label htmlFor="qb-name" className={labelClass}>
                {t.nameLabel}
              </label>
              <input
                id="qb-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.namePlaceholder}
                maxLength={100}
                className={inputClass}
              />
            </div>

            {/* Format */}
            <div>
              <span className={labelClass}>{t.formatLabel}</span>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    { value: 'single_elim', label: t.formatSingleElim },
                    { value: 'double_elim', label: t.formatDoubleElim },
                  ] as { value: BracketFormat; label: string }[]
                ).map((opt) => {
                  const active = formatType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormatType(opt.value)}
                      aria-pressed={active}
                      className={`rounded-[var(--r-ctrl,4px)] border px-4 py-3 text-sm font-medium transition-colors ${
                        active
                          ? 'border-[var(--or,#b467d1)] bg-[rgba(180,103,209,.12)] text-[var(--or-200,#eec4ff)]'
                          : 'border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] text-[var(--t2,#c7bfca)] hover:border-[var(--t4,#807984)] hover:text-[var(--t1,#f4edf7)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Participants */}
            <div>
              <label htmlFor="qb-participants" className={labelClass}>
                {t.participantsLabel}
              </label>
              <textarea
                id="qb-participants"
                value={participantsRaw}
                onChange={(e) => setParticipantsRaw(e.target.value)}
                placeholder={t.participantsPlaceholder}
                rows={8}
                className={`${inputClass} resize-y font-mono text-sm`}
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="text-[var(--t3,#a39ba6)]">
                  {t.participantsHint}
                </span>
                <span
                  data-numeric
                  className={
                    tooFew || tooMany
                      ? 'font-medium text-[var(--warn,#f5a524)]'
                      : 'font-medium text-[var(--t1,#f4edf7)]'
                  }
                >
                  {format(
                    count === 1
                      ? t.participantCount_one
                      : t.participantCount_other,
                    { n: count }
                  )}
                </span>
                {size !== null && !tooMany && (
                  <span className="text-[var(--t3,#a39ba6)]" data-numeric>
                    {format(t.bracketSizeHint, { size })}
                    {byes > 0 && (
                      <>
                        {' · '}
                        {format(
                          byes === 1 ? t.bracketByes_one : t.bracketByes_other,
                          { count: byes }
                        )}
                      </>
                    )}
                  </span>
                )}
              </div>

              {clientValidationMsg && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--warn,#f5a524)]">
                  <svg
                    className="h-4 w-4 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.71-3l-6.93-12a2 2 0 00-3.42 0l-6.93 12a2 2 0 001.71 3z"
                    />
                  </svg>
                  {clientValidationMsg}
                </p>
              )}
            </div>

            {/* Best of */}
            <div>
              <label htmlFor="qb-bestof" className={labelClass}>
                {t.boLabel}
              </label>
              <select
                id="qb-bestof"
                value={bestOf}
                onChange={(e) => setBestOf(Number(e.target.value) as BestOf)}
                className={inputClass}
              >
                <option value={1}>{t.boBo1}</option>
                <option value={3}>{t.boBo3}</option>
                <option value={5}>{t.boBo5}</option>
              </select>
            </div>

            {/* Erreur serveur */}
            {error && (
              <div className="rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-3 py-2 text-sm text-[var(--t1,#f4edf7)]">
                {error}
              </div>
            )}

            {/* Blurb + submit */}
            <p className="text-xs leading-relaxed text-[var(--t4,#807984)]">
              {t.helperBlurb}
            </p>

            <AdminButton
              variant="primary"
              type="submit"
              disabled={!canSubmit}
              className="w-full"
            >
              {submitting ? t.submitting : t.submit}
            </AdminButton>
          </form>
        </div>
      </div>
    </>
  );
}

export default AdminQuickBracketPage;
