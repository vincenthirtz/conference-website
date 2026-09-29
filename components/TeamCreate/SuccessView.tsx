// components/TeamCreate/SuccessView.tsx — écran de fin : équipe créée, invitations, inscription, pont magic-link
// (lot P11 : extrait de pages/team/create.tsx à l'identique — mêmes classes,
// mêmes textes).

import Link from 'next/link';
import { format } from '@/lib/i18n/useT';
import { getInitials } from './wizardModel';
import { CheckIcon } from './icons';
import type { TeamCreateWizard } from './useTeamCreateWizard';

export default function SuccessView({ w }: { w: TeamCreateWizard }) {
  const {
    t,
    result,
    setResult,
    teamSlug,
    tournamentHalfFailed,
    primaryBtn,
    secondaryBtn,
  } = w;
  if (!result) return null;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="card-brand overflow-hidden rounded-3xl bg-white/[0.05]">
        <div className="relative bg-gradient-to-br from-[var(--color-violet)]/25 via-[#1b0f33] to-[var(--color-green)]/15 px-6 py-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-green)] text-black shadow-lg shadow-[var(--color-green)]/40">
            <CheckIcon className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-black text-white">{t.successHeading}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-emerald-50/80">
            {result.info || t.resultCreatedFallback}
          </p>
        </div>

        <div className="space-y-4 p-6">
          <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-violet)]/70 to-[var(--color-green)]/50 text-lg font-black text-white ring-1 ring-white/15">
              {getInitials(result.team.name) || '?'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-white">
                {result.team.name}
              </p>
              <p className="truncate text-xs text-gray-500">
                {t.resultIdLabel} {result.team.id}
              </p>
            </div>
          </div>

          {result.tournament && (
            <div className="rounded-2xl border border-[var(--color-violet)]/40 bg-[var(--color-violet)]/10 px-4 py-3 text-sm text-[var(--color-violet-light)]">
              {format(t.resultRegistered, {
                name: result.tournament.tournament_name,
              })}
            </div>
          )}

          {result.tournament_application && (
            <div className="rounded-2xl border border-[var(--color-violet)]/40 bg-[var(--color-violet)]/10 px-4 py-3">
              <p className="text-sm font-semibold text-[var(--color-violet-light)]">
                {format(t.resultApplied, {
                  name: result.tournament_application.tournament_name,
                })}
              </p>
              <p className="mt-1 text-xs text-[var(--color-violet-light)]/80">
                {t.resultAppliedDesc}
              </p>
            </div>
          )}

          {tournamentHalfFailed && (
            <div className="rounded-2xl border border-[var(--status-warning)]/50 bg-[var(--status-warning)]/10 px-4 py-3">
              <p className="text-sm font-semibold text-[var(--status-warning)]">
                {t.partialWarningTitle}
              </p>
              <p className="mt-1 text-xs text-amber-100/80">
                {t.partialWarningDesc}
              </p>
              <p className="mt-1 text-xs text-amber-100/80">
                {t.partialWarningAction}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/support"
                  className="inline-flex items-center justify-center rounded-full border border-[var(--status-warning)]/50 bg-[var(--status-warning)]/15 px-4 py-2 text-xs font-semibold text-[var(--status-warning)] transition hover:bg-[var(--status-warning)]/25"
                >
                  {t.contactStaffCta}
                </Link>
              </div>
            </div>
          )}

          {result.accessEmail?.sent && (
            <div className="rounded-2xl border border-[var(--color-green)]/40 bg-[var(--color-green)]/10 px-4 py-4">
              <p className="text-sm font-semibold text-[var(--color-green-light)]">
                {t.accessEmailTitle}
              </p>
              <p className="mt-1 text-xs text-emerald-50/80">
                {format(t.accessEmailSent, { to: result.accessEmail.to })}
              </p>
              <Link
                href="/login"
                className="mt-3 inline-flex items-center justify-center rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
              >
                {t.goToLogin}
              </Link>
            </div>
          )}

          {result.members && result.members.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
              <p className="text-sm font-semibold text-white">
                {t.invitedPlayers}
              </p>
              <p className="mt-0.5 text-[11px] text-gray-400">
                {t.invitedPlayersHint}
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-gray-300">
                {result.members.map((m) => (
                  <li
                    key={`${m.user_id}-${m.id ?? 'new'}`}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span className="font-mono break-all">{m.user_id}</span>
                    <span className="text-gray-500">·</span>
                    <span>
                      {t.memberRoleLabel} {m.role}
                    </span>
                    <span className="text-gray-500">·</span>
                    <span>
                      {t.memberCaptainLabel} {m.captain ? t.yes : t.no}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            {teamSlug && (
              <Link href={`/team/${teamSlug}`} className={primaryBtn}>
                {t.viewTeamPage}
              </Link>
            )}
            <button
              type="button"
              onClick={() => setResult(null)}
              className={secondaryBtn}
            >
              {t.createAnother}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
