// features/admin/matches/ui/MatchDetailBlocks.tsx — les blocs de lecture de
// la fiche d'un match (litige, planning/format/résumé, score, maps), sortis de
// pages/admin/matches/[matchId]/index.tsx. Purement présentationnel : la page
// charge le match et le passe ici tel quel.

import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { MatchStatus } from '@/types/admin';
import nsAdminMatchDetail from '@/lib/i18n/locales/admin-fr/adminMatchDetail';
import type { ChipTone } from '@/features/admin/_shared/ui/Chip';
import { FicheSection } from '@/features/admin/_shared/ui/Fiche';

type Dict = typeof nsAdminMatchDetail.fr;

export type TeamMini = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

type StageMini = {
  id: string;
  name: string | null;
  stage_type: string | null;
};

type TournamentMini = {
  id: string;
  name: string | null;
  slug: string | null;
};

type GameRow = {
  id: string;
  match_id: string;
  map_name: string | null;
  map_order: number | null;
  team1_score: number | null;
  team2_score: number | null;
  is_tiebreaker: boolean | null;
  went_overtime: boolean | null;
};

export type MatchRow = {
  id: string;
  tournament_id: string;
  stage_id: string | null;
  status: MatchStatus;
  is_bye: boolean | null;
  match_format: string | null;
  round_name: string | null;
  round_number: number | null;
  group_key: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  stream_url: string | null;
  lobby_code: string | null;
  notes: string | null;
  next_match_win_id: string | null;
  next_match_lose_id: string | null;
  dispute_reason: string | null;
  dispute_opened_by: string | null;
  dispute_opened_at: string | null;
  dispute_resolution: string | null;
  dispute_resolved_by: string | null;
  dispute_resolved_at: string | null;
  team1?: TeamMini | null;
  team2?: TeamMini | null;
  stage?: StageMini | null;
  tournament?: TournamentMini | null;
  games?: GameRow[];
};

const CARD =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-5';
const EYEBROW =
  'mb-2 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]';
const LINE = 'text-sm text-[var(--t2,#c7bfca)]';

/** Terminé = ok, en direct = live, litige/annulé = err, reporté = warn. */
export function matchStatusTone(status: MatchStatus): ChipTone {
  switch (status) {
    case 'ongoing':
      return 'live';
    case 'finished':
    case 'walkover':
      return 'ok';
    case 'disputed':
    case 'cancelled':
      return 'err';
    case 'postponed':
      return 'warn';
    default:
      return 'neutral';
  }
}

export function matchStatusLabel(status: MatchStatus, t: Dict) {
  switch (status) {
    case 'pending':
      return t.statusPending;
    case 'ongoing':
      return t.statusOngoing;
    case 'finished':
      return t.statusFinished;
    case 'cancelled':
      return t.statusCancelled;
    case 'disputed':
      return t.statusDisputed;
    case 'walkover':
      return t.statusWalkover;
    case 'postponed':
      return t.statusPostponed;
    default:
      return status || '—';
  }
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** Encadré du litige (en cours ou tranché). */
export function MatchDisputeCard({ match }: { match: MatchRow }) {
  const t = useAdminT(nsAdminMatchDetail);
  const open = match.status === 'disputed';
  return (
    <div
      className={`rounded-[var(--r-card,14px)] border p-5 ${
        open
          ? 'border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.06)]'
          : 'border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]'
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-4">
        <h2 className="text-[19px] text-[var(--t1,#f4edf7)]">
          {open ? t.disputeOngoingHeading : t.disputeResolvedHeading}
        </h2>
        {match.dispute_opened_at && (
          <span className="font-mono text-xs text-[var(--t3,#a39ba6)]">
            {format(t.disputeOpenedAt, {
              date: formatDateTime(match.dispute_opened_at),
            })}
          </span>
        )}
      </div>
      {match.dispute_reason && (
        <div className="mb-3">
          <p className={EYEBROW}>{t.motifLabel}</p>
          <p className="whitespace-pre-wrap text-sm text-[var(--t1,#f4edf7)]">
            {match.dispute_reason}
          </p>
        </div>
      )}
      {match.dispute_resolution && (
        <div>
          <p className={EYEBROW}>
            {t.decisionLabel}
            {match.dispute_resolved_at &&
              ` · ${formatDateTime(match.dispute_resolved_at)}`}
          </p>
          <p className="whitespace-pre-wrap text-sm text-[var(--t1,#f4edf7)]">
            {match.dispute_resolution}
          </p>
        </div>
      )}
      {open && (
        <p className="mt-3 text-xs text-[#ffc2c2]">{t.disputeBlockedNote}</p>
      )}
    </div>
  );
}

/** Planning, format, résumé : les trois cartes d'information. */
export function MatchInfoCards({ match }: { match: MatchRow }) {
  const t = useAdminT(nsAdminMatchDetail);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div className={CARD}>
        <p className={EYEBROW}>{t.planningHeading}</p>
        <p className={LINE}>
          {format(t.startLabel, { date: formatDateTime(match.scheduled_at) })}
        </p>
        <p className={LINE}>
          {format(t.endLabel, { date: formatDateTime(match.completed_at) })}
        </p>
        {match.stream_url && (
          <p className={`mt-2 break-all ${LINE}`}>
            {t.streamLabel}{' '}
            <a
              href={match.stream_url}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--or-200,#eec4ff)] underline"
            >
              {match.stream_url}
            </a>
          </p>
        )}
      </div>
      <div className={CARD}>
        <p className={EYEBROW}>{t.formatHeading}</p>
        <p className={LINE}>
          {format(t.boLabel, { value: match.match_format || '—' })}
        </p>
        <p className={LINE}>
          {format(t.roundLabel, {
            value: match.round_name || match.round_number || '—',
          })}
        </p>
        {match.lobby_code && (
          <p className={`mt-2 font-mono ${LINE}`}>
            {format(t.lobbyLabel, { code: match.lobby_code })}
          </p>
        )}
      </div>
      <div className={CARD}>
        <p className={EYEBROW}>{t.summaryHeading}</p>
        <p className={LINE}>
          {format(t.scoreLabel, {
            s1: match.team1_score ?? 0,
            s2: match.team2_score ?? 0,
          })}
        </p>
        <p className={LINE}>
          {format(t.winnerLabel, {
            name: match.winner_team_id
              ? match.winner_team_id === match.team1_id
                ? match.team1?.name || t.team1Fallback
                : match.team2?.name || t.team2Fallback
              : '—',
          })}
        </p>
        {match.notes && (
          <p className={`mt-2 whitespace-pre-wrap ${LINE}`}>
            {format(t.notesLabel, { notes: match.notes })}
          </p>
        )}
      </div>
    </div>
  );
}

/** Bandeau du score : équipe 1, score, équipe 2. */
export function MatchScoreLine({ match }: { match: MatchRow }) {
  return (
    <div className={CARD}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <TeamLine team={match.team1} side="home" score={match.team1_score} />
        <div
          className="font-[family-name:var(--fd)] text-[36px] font-extrabold leading-none text-[var(--t1,#f4edf7)] [font-stretch:75%]"
          data-numeric
        >
          {match.team1_score ?? 0} — {match.team2_score ?? 0}
        </div>
        <TeamLine team={match.team2} side="away" score={match.team2_score} />
      </div>
    </div>
  );
}

function TeamLine({
  team,
  side,
  score,
}: {
  team: TeamMini | null | undefined;
  side: 'home' | 'away';
  score: number | null | undefined;
}) {
  const t = useAdminT(nsAdminMatchDetail);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-[var(--r-ctrl,4px)] border-l-[3px] border-[var(--or,#b467d1)] bg-[var(--s3,#2f2732)] font-[family-name:var(--fd)] text-sm font-extrabold text-[var(--t1,#f4edf7)] [font-stretch:75%]">
        {team?.short_name || team?.name?.slice(0, 3) || side.toUpperCase()}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-[var(--t1,#f4edf7)]">
          {team?.name ||
            format(t.teamFallback, { n: side === 'home' ? '1' : '2' })}
        </div>
        <div className="font-mono text-xs text-[var(--t3,#a39ba6)]">
          {format(t.teamScore, { score: score ?? 0 })}
        </div>
      </div>
    </div>
  );
}

/** Les maps jouées, dans l'ordre. Ne s'affiche que s'il y en a. */
export function MatchMapsSection({ games }: { games: GameRow[] }) {
  const t = useAdminT(nsAdminMatchDetail);
  return (
    <FicheSection
      title={t.mapsHeading}
      aside={
        <span className="font-mono text-sm text-[var(--t3,#a39ba6)]">
          {format(t.mapsCount, { count: games.length })}
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {games
          .slice()
          .sort(
            (a, b) =>
              (a.map_order ?? 0) - (b.map_order ?? 0) ||
              a.map_name?.localeCompare(b.map_name || '') ||
              0
          )
          .map((g) => (
            <div
              key={g.id}
              className="rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] p-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[var(--t1,#f4edf7)]">
                    {g.map_name || t.mapFallback}
                  </p>
                  <p className="font-mono text-xs text-[var(--t3,#a39ba6)]">
                    {format(t.orderLabel, { order: g.map_order ?? '—' })}
                  </p>
                </div>
                <div className="rounded-[3px] bg-[var(--s3,#2f2732)] px-2 py-1 font-mono text-sm text-[var(--t1,#f4edf7)]">
                  {g.team1_score ?? 0} - {g.team2_score ?? 0}
                </div>
              </div>
              <div className="mt-1 text-xs text-[var(--t3,#a39ba6)]">
                {g.is_tiebreaker ? t.tiebreakerPrefix : ''}
                {g.went_overtime ? t.overtime : t.regularTime}
              </div>
            </div>
          ))}
      </div>
    </FicheSection>
  );
}
