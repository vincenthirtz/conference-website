// features/admin/matches/ui/MatchEditHeader.tsx — en-tête et bandeaux de
// l'écran d'édition d'un match (conflit d'édition concurrente, erreur,
// avertissements), sortis de pages/admin/matches/[matchId]/edit.tsx.
// Purement présentationnel : la navigation et le rechargement sont des rappels.

import Link from 'next/link';
import { useAdminT } from '@/lib/i18n/useAdminT';
import type { Match, StageMini, TournamentMini } from '@/types/admin';
import nsAdminMatchEdit from '@/lib/i18n/locales/admin-fr/adminMatchEdit';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import EntityHeader from '@/features/admin/_shared/ui/EntityHeader';
import { matchStatusTone } from './MatchDetailBlocks';
import { matchEditStatusLabel } from './MatchEditForm';

const KICKER =
  'mb-2 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]';
const LINK = 'text-[var(--or-200,#eec4ff)] hover:underline';

export function MatchEditHeader({
  match,
  tournament,
  stage,
  tournamentHref,
  onBack,
}: {
  match: Match | null;
  tournament: TournamentMini | null;
  stage: StageMini | null;
  tournamentHref: string;
  onBack: () => void;
}) {
  const t = useAdminT(nsAdminMatchEdit);
  return (
    <>
      <p className={`mt-4 ${KICKER}`}>{t.kicker}</p>
      <EntityHeader
        title={t.heading}
        meta={
          match && (
            <>
              {t.matchWord}{' '}
              <span className="rounded-[3px] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-2 py-0.5 font-mono text-xs text-[var(--t2,#c7bfca)]">
                #{match.id.slice(0, 8)}
              </span>{' '}
              {tournament && (
                <>
                  {t.tournamentBullet}{' '}
                  <Link
                    href={tournamentHref}
                    className={`font-semibold ${LINK}`}
                  >
                    {tournament.name}
                  </Link>
                </>
              )}
              {stage && (
                <>
                  {' '}
                  {t.phaseBullet}{' '}
                  <Link href={`/admin/stages/${stage.id}`} className={LINK}>
                    {stage.name}
                  </Link>
                </>
              )}
            </>
          )
        }
        status={
          match && (
            <Chip tone={matchStatusTone(match.status)}>
              {matchEditStatusLabel(match.status, t)}
            </Chip>
          )
        }
        actions={
          <>
            <AdminButton variant="ghost" size="sm" onClick={onBack}>
              {t.backToMatch}
            </AdminButton>
            {match && (
              <AdminButtonLink
                href={`/cast/${match.id}`}
                target="_blank"
                variant="secondary"
                size="sm"
                title={t.casterViewTitle}
              >
                {t.casterView}
                <svg
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </AdminButtonLink>
            )}
          </>
        }
      />
    </>
  );
}

/** Conflit d'édition concurrente, erreur, avertissements du serveur. */
export function MatchEditNotices({
  conflictMsg,
  conflictServerTime,
  onCloseConflict,
  errorMsg,
  warningMsgs,
}: {
  conflictMsg: string | null;
  conflictServerTime: string | null;
  onCloseConflict: () => void;
  errorMsg: string | null;
  warningMsgs: string[];
}) {
  const t = useAdminT(nsAdminMatchEdit);
  return (
    <>
      {conflictMsg && (
        <div className="mb-4 flex items-start gap-3 rounded-[var(--r-card,14px)] border border-[rgba(245,165,36,.45)] bg-[rgba(245,165,36,.08)] px-4 py-3 text-sm">
          <span className="mt-0.5 text-lg leading-none text-[var(--warn,#f5a524)]">
            &#9888;
          </span>
          <div>
            <p className="mb-1 font-semibold text-[#ffd9a3]">
              {t.conflictTitle}
            </p>
            <p className="text-[var(--t1,#f4edf7)]">{conflictMsg}</p>
            {conflictServerTime && (
              <p className="mt-1 text-xs text-[var(--t3,#a39ba6)]">
                {t.lastServerEditPrefix}{' '}
                {new Date(conflictServerTime).toLocaleString('fr-FR')}
              </p>
            )}
            <p className="mt-1 text-xs text-[var(--t3,#a39ba6)]">
              {t.conflictReloadedNote}
            </p>
            <AdminButton
              variant="ghost"
              size="xs"
              className="mt-2"
              onClick={onCloseConflict}
            >
              {t.closeAndReload}
            </AdminButton>
          </div>
        </div>
      )}
      {errorMsg && (
        <div className="mb-4 rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]">
          {errorMsg}
        </div>
      )}
      {warningMsgs.length > 0 && (
        <div className="mb-4 rounded-[var(--r-card,14px)] border border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.06)] px-4 py-3 text-sm text-[#ffd9a3]">
          <p className="mb-1 font-semibold">{t.warningsTitle}</p>
          <ul className="list-inside list-disc space-y-0.5">
            {warningMsgs.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
