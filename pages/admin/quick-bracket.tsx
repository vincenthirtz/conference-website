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
import type { StaffProps } from '@/types/admin';
import nsAdminQuickBracket from '@/lib/i18n/locales/admin-fr/adminQuickBracket';

export const getServerSideProps = withStaffPage('admin');

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

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <Breadcrumb
            items={[
              { label: t.breadcrumbTournaments, href: '/admin/tournaments' },
              { label: t.heading },
            ]}
          />

          <div className="mb-6 mt-4">
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
              {t.heading}
            </h1>
            <p className="mt-2 text-sm text-neutral-400">{t.description}</p>
          </div>

          <form
            onSubmit={submit}
            className="space-y-6 rounded-2xl border border-neutral-700/50 bg-neutral-800/50 p-6"
          >
            {/* Nom */}
            <div>
              <label
                htmlFor="qb-name"
                className="mb-1 block text-sm text-neutral-400"
              >
                {t.nameLabel}
              </label>
              <input
                id="qb-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.namePlaceholder}
                maxLength={100}
                className="w-full rounded-lg border border-neutral-600 bg-neutral-900/50 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Format */}
            <div>
              <span className="mb-1 block text-sm text-neutral-400">
                {t.formatLabel}
              </span>
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
                      className={`rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                        active
                          ? 'border-emerald-500 bg-emerald-600/20 text-emerald-200'
                          : 'border-neutral-600 bg-neutral-900/50 text-neutral-300 hover:bg-neutral-700/40'
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
              <label
                htmlFor="qb-participants"
                className="mb-1 block text-sm text-neutral-400"
              >
                {t.participantsLabel}
              </label>
              <textarea
                id="qb-participants"
                value={participantsRaw}
                onChange={(e) => setParticipantsRaw(e.target.value)}
                placeholder={t.participantsPlaceholder}
                rows={8}
                className="w-full resize-y rounded-lg border border-neutral-600 bg-neutral-900/50 px-3 py-2.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="text-neutral-400">{t.participantsHint}</span>
                <span
                  className={
                    tooFew || tooMany
                      ? 'font-medium text-amber-300'
                      : 'font-medium text-neutral-200'
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
                  <span className="text-neutral-400">
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
                <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-300">
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
              <label
                htmlFor="qb-bestof"
                className="mb-1 block text-sm text-neutral-400"
              >
                {t.boLabel}
              </label>
              <select
                id="qb-bestof"
                value={bestOf}
                onChange={(e) => setBestOf(Number(e.target.value) as BestOf)}
                className="w-full rounded-lg border border-neutral-600 bg-neutral-900/50 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={1}>{t.boBo1}</option>
                <option value={3}>{t.boBo3}</option>
                <option value={5}>{t.boBo5}</option>
              </select>
            </div>

            {/* Erreur serveur */}
            {error && (
              <div className="rounded-lg border border-red-500/50 bg-red-900/40 px-3 py-2 text-sm">
                {error}
              </div>
            )}

            {/* Blurb + submit */}
            <p className="text-xs leading-relaxed text-neutral-500">
              {t.helperBlurb}
            </p>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? t.submitting : t.submit}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

export default AdminQuickBracketPage;
