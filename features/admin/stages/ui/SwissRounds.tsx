// features/admin/stages/ui/SwissRounds.tsx — les rondes d'une phase suisse
// (liste des matchs par ronde), sorties de pages/admin/stages/[stageId]/swiss.tsx.
// Purement présentationnel : aucune donnée chargée ici.

import Image from 'next/image';
import Link from 'next/link';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { MatchStatus } from '@/types/admin';
import nsAdminStageSwiss from '@/lib/i18n/locales/admin-fr/adminStageSwiss';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';
import { AdminButtonLink } from '@/features/admin/_shared/ui/AdminButton';

type Dict = typeof nsAdminStageSwiss.fr;

export type TeamMini = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

export type SwissRoundMatch = {
  id: string;
  round_number: number;
  tournament_id: string;
  stage_id: string | null;
  status: MatchStatus;
  best_of: number | null;
  scheduled_at: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1: TeamMini | null;
  team2: TeamMini | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
};

export type SwissRound = {
  round_number: number;
  matches: SwissRoundMatch[];
};

const LOGO =
  'h-5 w-5 rounded-[3px] border border-[var(--line2,rgba(194,196,201,.2))] object-cover';

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusLabel(status: MatchStatus, t: Dict) {
  switch (status) {
    case 'pending':
      return t.statusPending;
    case 'ongoing':
      return t.statusOngoing;
    case 'finished':
      return t.statusFinished;
    case 'cancelled':
      return t.statusCancelled;
    default:
      return status;
  }
}

/** Terminé = ok, en direct = live, annulé/litige = err, le reste = neutre. */
function statusTone(status: MatchStatus): ChipTone {
  switch (status) {
    case 'ongoing':
      return 'live';
    case 'finished':
    case 'walkover':
      return 'ok';
    case 'cancelled':
    case 'disputed':
      return 'err';
    case 'postponed':
      return 'warn';
    default:
      return 'neutral';
  }
}

export function SwissRoundBlock({ round }: { round: SwissRound }) {
  const t = useAdminT(nsAdminStageSwiss);
  return (
    <div className="border-b border-[var(--line2,rgba(194,196,201,.2))] last:border-b-0">
      <div className="flex items-center justify-between bg-[var(--s2,#1d1520)] px-4 py-2">
        <div className="font-[family-name:var(--fd)] text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--t1,#f4edf7)] [font-stretch:75%]">
          {format(t.roundTitle, { round: round.round_number })}
        </div>
        <div className="font-mono text-xs text-[var(--t3,#a39ba6)]">
          {format(
            round.matches.length > 1 ? t.matchCount_other : t.matchCount_one,
            { count: round.matches.length }
          )}
        </div>
      </div>
      <div className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
        {round.matches.map((m) => (
          <SwissMatchRow key={m.id} match={m} />
        ))}
      </div>
    </div>
  );
}

function SwissMatchRow({ match }: { match: SwissRoundMatch }) {
  const t = useAdminT(nsAdminStageSwiss);
  const label1 = match.team1?.name || match.team1_id || 'TBD';
  const label2 = match.team2?.name || match.team2_id || 'TBD';

  const scoreStr =
    match.status === 'finished' || match.status === 'ongoing'
      ? `${match.team1_score ?? 0} - ${match.team2_score ?? 0}`
      : '—';

  const isBo = match.best_of ? `BO${match.best_of}` : '';

  return (
    <div className="flex flex-col gap-2 px-4 py-2 text-xs md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <div className="hidden font-mono text-[11px] text-[var(--t4,#807984)] md:block">
          #{match.id.slice(0, 6)}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            {match.team1?.logo_url && (
              <Image
                src={match.team1.logo_url}
                alt={label1}
                width={20}
                height={20}
                className={LOGO}
              />
            )}
            <span className="font-semibold text-[var(--t1,#f4edf7)]">
              {label1}
            </span>
            <span className="text-[var(--t3,#a39ba6)]">{t.vs}</span>
            {match.team2?.logo_url && (
              <Image
                src={match.team2.logo_url}
                alt={label2}
                width={20}
                height={20}
                className={LOGO}
              />
            )}
            <span className="font-semibold text-[var(--t1,#f4edf7)]">
              {label2}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-[var(--t3,#a39ba6)]">
            <span>
              {isBo && <>{isBo} • </>}
              {t.scorePrefix}{' '}
              <span className="font-mono text-[var(--t1,#f4edf7)]">
                {scoreStr}
              </span>
            </span>
            <span>|</span>
            <span className="font-mono">
              {formatDateTime(match.scheduled_at)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 md:justify-end">
        <Chip tone={statusTone(match.status)}>
          {statusLabel(match.status, t)}
        </Chip>
        <AdminButtonLink
          href={`/admin/matches/${match.id}`}
          variant="ghost"
          size="xs"
        >
          {t.openAdmin}
        </AdminButtonLink>
        <Link
          href={`/match/${match.id}`}
          target="_blank"
          className="inline-flex h-[30px] items-center rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] px-3 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.02em] text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]"
        >
          {t.publicLink}
        </Link>
      </div>
    </div>
  );
}
