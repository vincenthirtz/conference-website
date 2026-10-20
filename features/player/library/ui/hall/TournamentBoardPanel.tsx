// features/player/library/ui/hall/TournamentBoardPanel.tsx — le tableau du
// tournoi en cours, dans le hall (lot 7 de docs/PLAN-womens-library.md) :
// ouvert par la zone `tournament_board` de la vue ou par le bouton sous la
// scène (`HallExtras`), dans le même dialogue.
//
//   - le tournoi : nom, en cours / à venir, dates, phase en cours ;
//   - les matchs : en direct (score du moment), prochains (horaire), derniers
//     résultats (score, ou « Forfait » et la gagnante) ;
//   - la phase en cours : son classement (le tableau de la landing,
//     `StandingsMini`), ou le tour en cours de son arbre ;
//   - « Voir le tournoi » : la page publique.
// Aucun tournoi en cours ni annoncé : un état calme.
//
// CHARGÉ À LA DEMANDE : `HallExtras` l'importe par `next/dynamic`. Ni ce
// panneau, ni le classement de la landing, ni les lectures du tournoi
// n'entrent dans le premier chargement de /player/library, déjà la page la
// plus lourde (garde : tests/unit/libraryHallTournament.test.tsx). Le titre
// du dialogue (« Tournoi en cours ») est posé par `HallExtras` : il existe
// avant que ce module arrive. Le tournoi est RELU à chaque ouverture.

import Link from 'next/link';
import { type ReactNode, useId } from 'react';
import { StandingsMini } from '@/components/tournament/landing/LiveHub';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { format, useT } from '@/lib/i18n/useT';
import nsHall from '@/lib/i18n/locales/fr/playerLibraryHall';
import nsTournamentLanding from '@/lib/i18n/locales/fr/tournamentLanding';
import { Button } from '@/features/ruban';
import type { HubMatch, HubTeam } from '@/utils/tournament/liveHub';
import { formatSiteDate } from '@/utils/timezone';
import { formatDateRange } from '@/utils/tournamentDates';
import {
  type BoardRound,
  type BoardStandings,
  boardMatchState,
  type TournamentBoard,
} from '../../hall/tournamentBoard';
import { useHallTournament } from '../../hall/useHallTournament';
import { LINK, TEXT_ERROR, TEXT_MUTED } from '../social/shared';

type Dict = (typeof nsHall)['fr']['tournament'];

const H4 = 'text-base font-semibold text-[var(--t1,#f4edf7)]';
const H5 =
  'text-xs font-semibold uppercase tracking-wider text-[var(--t2,#c7bfca)]';
const PILL =
  'rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider';
const WHEN: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
};

export default function TournamentBoardPanel() {
  const t = useT(nsHall).tournament;
  const query = useHallTournament();
  if (query.isPending)
    return (
      <p role="status" className={TEXT_MUTED}>
        {t.loading}
      </p>
    );
  if (query.isError && !query.data)
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3">
        <p className={TEXT_ERROR}>{t.error}</p>
        <Button size="sm" onClick={() => void query.refetch()}>
          {t.retry}
        </Button>
      </div>
    );
  if (!query.data)
    return (
      <div className="flex flex-col gap-2" data-tournament-empty="">
        <p className={TEXT_MUTED}>{t.empty}</p>
        <p>
          <Link prefetch={false} href="/tournaments" className={LINK}>
            {t.seeAllTournaments}
          </Link>
        </p>
      </div>
    );
  return <BoardView board={query.data} t={t} />;
}

function BoardView({ board, t }: { board: TournamentBoard; t: Dict }) {
  const { lang } = useLang();
  const nameId = useId();
  const { tournament, stage, hub } = board;
  const base = `/tournament/${encodeURIComponent(tournament.slug || tournament.id)}`;
  const meta = [
    board.phase === 'running' ? t.running : t.upcoming,
    formatDateRange(tournament.start_date, tournament.end_date, lang),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <article
      aria-labelledby={nameId}
      className="flex flex-col gap-5"
      data-tournament-board={tournament.id}
    >
      <header className="flex flex-col gap-1">
        <h3 id={nameId} className="text-lg font-bold text-[var(--t1,#f4edf7)]">
          {tournament.name}
        </h3>
        <p className={TEXT_MUTED}>{meta}</p>
        {stage?.name && (
          <p className={TEXT_MUTED}>{format(t.stage, { stage: stage.name })}</p>
        )}
      </header>

      {hub.live.length > 0 && (
        <MatchGroup title={t.live} matches={hub.live} t={t} group="live" />
      )}
      <MatchGroup
        title={t.next}
        matches={hub.upcoming}
        empty={t.noMatches}
        t={t}
        group="next"
      />
      {hub.recent.length > 0 && (
        <MatchGroup
          title={t.recent}
          matches={hub.recent}
          t={t}
          group="recent"
        />
      )}

      {board.standings && (
        <StandingsBlock standings={board.standings} base={base} t={t} />
      )}
      {board.bracket && (
        <BracketBlock rounds={board.bracket} base={base} t={t} />
      )}

      <p>
        <Link prefetch={false} href={base} className={LINK}>
          {t.seeTournament}
        </Link>
      </p>
    </article>
  );
}

function Section({
  title,
  kind,
  children,
}: {
  title: string;
  kind: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-2"
      data-board-section={kind}
    >
      <h4 id={headingId} className={H4}>
        {title}
      </h4>
      {children}
    </section>
  );
}

function MatchGroup({
  title,
  matches,
  empty,
  t,
  group,
}: {
  title: string;
  matches: HubMatch[];
  empty?: string;
  t: Dict;
  group: string;
}) {
  return (
    <Section title={title} kind={group}>
      {matches.length === 0 ? (
        <p className={TEXT_MUTED}>{empty}</p>
      ) : (
        <MatchList matches={matches} t={t} />
      )}
    </Section>
  );
}

function MatchList({ matches, t }: { matches: HubMatch[]; t: Dict }) {
  return (
    <ul className="flex flex-col gap-2">
      {matches.map((m) => (
        <MatchItem key={m.id} match={m} t={t} />
      ))}
    </ul>
  );
}

const teamName = (team: HubTeam | null, t: Dict) => team?.name || t.tbd;

/** Une affiche : les équipes, puis le score, l'horaire ou le forfait. */
function MatchItem({ match, t }: { match: HubMatch; t: Dict }) {
  const { lang } = useLang();
  const state = boardMatchState(match);
  const score = (s: { score1: number; score2: number }) => (
    <span className="font-bold text-[var(--t1,#f4edf7)]">
      {format(t.score, s)}
    </span>
  );
  let outcome: ReactNode;
  if (state.kind === 'live')
    outcome = (
      <>
        <span
          className={`${PILL} border-[var(--or,#b467d1)] text-[var(--or-200,#eec4ff)]`}
        >
          {t.live}
        </span>
        {score(state)}
      </>
    );
  else if (state.kind === 'result') outcome = score(state);
  else if (state.kind === 'forfeit')
    outcome = (
      <>
        <span
          className={`${PILL} border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t2,#c7bfca)]`}
        >
          {t.forfeit}
        </span>
        {state.score
          ? score(state.score)
          : state.winner && (
              <span>
                {format(t.forfeitWinner, { team: state.winner.name })}
              </span>
            )}
      </>
    );
  else
    outcome = state.at ? (
      <time dateTime={state.at}>{formatSiteDate(state.at, lang, WHEN)}</time>
    ) : (
      <span>{t.noTime}</span>
    );

  return (
    <li
      data-match-id={match.id}
      data-match-state={state.kind}
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[var(--r-card,14px)] border border-[var(--line,rgba(194,196,201,.12))] px-3 py-2"
    >
      <span className="min-w-0 flex-1 text-sm font-semibold text-[var(--t1,#f4edf7)]">
        {teamName(match.team1, t)}{' '}
        <span className="font-normal text-[var(--t2,#c7bfca)]">{t.versus}</span>{' '}
        {teamName(match.team2, t)}
      </span>
      <span className="flex shrink-0 items-center gap-2 text-sm tabular-nums text-[var(--t2,#c7bfca)]">
        {outcome}
      </span>
    </li>
  );
}

function StandingsBlock({
  standings,
  base,
  t,
}: {
  standings: BoardStandings;
  base: string;
  t: Dict;
}) {
  const landing = useT(nsTournamentLanding);
  const tables =
    standings.kind === 'tables'
      ? standings.tables.filter((tb) => tb.rows.length > 0)
      : [];
  const played = tables.some((tb) => tb.rows.some((r) => r.played > 0));
  let body: ReactNode;
  if (standings.kind === 'unavailable')
    body = <p className={TEXT_MUTED}>{t.standingsUnavailable}</p>;
  else if (!played) body = <p className={TEXT_MUTED}>{t.standingsEmpty}</p>;
  else
    body = tables.map((tb) => (
      <div key={tb.key} className="flex flex-col gap-1 overflow-x-auto">
        {tb.groupKey && (
          <h5 className={H5}>{format(t.group, { key: tb.groupKey })}</h5>
        )}
        <StandingsMini table={tb} t={landing} />
      </div>
    ));
  return (
    <Section title={t.standings} kind="standings">
      {body}
      <p>
        <Link prefetch={false} href={`${base}/standings`} className={LINK}>
          {t.seeStandings}
        </Link>
      </p>
    </Section>
  );
}

function roundLabel(r: BoardRound, t: Dict): string {
  if (r.side === 'final') return t.sideFinal;
  const round = format(t.round, { round: r.round });
  return r.side === 'lower' ? `${t.sideLower} · ${round}` : round;
}

function BracketBlock({
  rounds,
  base,
  t,
}: {
  rounds: BoardRound[];
  base: string;
  t: Dict;
}) {
  return (
    <Section title={t.bracket} kind="bracket">
      {rounds.length === 0 ? (
        <p className={TEXT_MUTED}>{t.noMatches}</p>
      ) : (
        rounds.map((r) => (
          <div
            key={`${r.side}-${r.round}`}
            className="flex flex-col gap-2"
            data-bracket-round={`${r.side}-${r.round}`}
          >
            <h5 className={H5}>{roundLabel(r, t)}</h5>
            <MatchList matches={r.matches} t={t} />
          </div>
        ))
      )}
      <p>
        <Link prefetch={false} href={`${base}/bracket`} className={LINK}>
          {t.seeBracket}
        </Link>
      </p>
    </Section>
  );
}
