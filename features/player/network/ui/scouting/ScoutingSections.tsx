// features/player/network/ui/scouting/ScoutingSections.tsx — les sections du
// dossier d'adversaire (N5, lot P15), dans l'ordre où on s'en sert la veille
// d'un match :
//   1. le bilan direct — « on les a déjà jouées, et voilà ce que ça a donné » ;
//   2. leur forme et leur bilan récents ;
//   3. les adversaires communs, qui situent mieux qu'un rating ;
//   4. leurs créneaux habituels, dérivés des heures RÉELLEMENT jouées ;
//   5. MES notes de revue sur elles (N2) — la seule matière privée.
//
// Chaque section se tait sous le seuil d'échantillon : une « forme » calculée
// sur un match est une anecdote présentée comme une tendance.

import { Chip, type ChipTone } from '@/features/ruban';
import { FicheFold } from '@/features/player/_shared/ui';
import { useLocale } from '@/lib/i18n/useLocale';
import { format } from '@/lib/i18n/useT';
import type nsScouting from '@/lib/i18n/locales/fr/scouting';
import type { GameResult } from '@/utils/teams/scouting';
import type { ScoutingResponse } from '../../schemas';

type T = typeof nsScouting.fr;

/** Lundi 1er janvier 2024 — base neutre pour nommer les jours. */
const REFERENCE_MONDAY = Date.UTC(2024, 0, 1);

const RESULT_TONE: Record<GameResult, ChipTone> = {
  win: 'ok',
  loss: 'err',
  draw: 'neutral',
};

const ROW =
  'flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] px-4 py-2.5';
const MUTED = 'text-sm text-[var(--t3,#a39ba6)]';
const BODY = 'text-sm text-[var(--t2,#d6cfd9)]';
const HINT = 'text-xs text-[var(--t3,#a39ba6)]';

export default function ScoutingSections({
  data,
  t,
}: {
  data: ScoutingResponse;
  t: T;
}) {
  const locale = useLocale();
  const { report } = data;

  const dayName = (weekday: number) =>
    new Date(REFERENCE_MONDAY + (weekday - 1) * 86_400_000).toLocaleString(
      locale,
      { weekday: 'long', timeZone: 'UTC' }
    );
  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(locale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '—';
  const resultLabel = (r: GameResult) =>
    r === 'win' ? t.win : r === 'loss' ? t.loss : t.draw;

  return (
    <>
      <FicheFold title={t.headToHead}>
        {report.headToHead.played === 0 ? (
          <p className={MUTED}>{t.neverPlayed}</p>
        ) : (
          <>
            <p className={BODY}>
              {format(t.headToHeadSummary, {
                played: report.headToHead.played,
                wins: report.headToHead.wins,
                losses: report.headToHead.losses,
              })}
            </p>
            <ul className="mt-3 space-y-2">
              {report.headToHead.recent.map((game) => (
                <li
                  key={`${game.subjectType}:${game.subjectId}`}
                  className={ROW}
                >
                  <span className={`flex flex-wrap items-center gap-2 ${HINT}`}>
                    <Chip tone={RESULT_TONE[game.result]}>
                      {resultLabel(game.result)}
                    </Chip>
                    <span>{fmtDate(game.playedAt)}</span>
                    <span className="uppercase tracking-wide">
                      {game.subjectType === 'match' ? t.typeMatch : t.typeScrim}
                    </span>
                  </span>
                  {game.myScore != null && game.opponentScore != null && (
                    <span className="text-sm font-semibold text-[var(--t1,#f4edf7)]">
                      {game.myScore} – {game.opponentScore}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </FicheFold>

      <FicheFold title={t.form}>
        {!report.recentForm || !report.record ? (
          <p className={MUTED}>{t.notEnoughData}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {report.recentForm.map((r, i) => (
                <span key={i} title={resultLabel(r)}>
                  <Chip tone={RESULT_TONE[r]}>
                    {resultLabel(r).charAt(0).toUpperCase()}
                  </Chip>
                </span>
              ))}
            </div>
            <p className={`mt-3 ${BODY}`}>
              {format(t.recordSummary, {
                played: report.record.played,
                wins: report.record.wins,
                losses: report.record.losses,
              })}
            </p>
          </>
        )}
      </FicheFold>

      {report.commonOpponents.length > 0 && (
        <FicheFold title={t.commonOpponents}>
          <p className={HINT}>{t.commonOpponentsHint}</p>
          <ul className="mt-3 space-y-2">
            {report.commonOpponents.map((c) => (
              <li key={c.teamId} className={ROW}>
                <span className="text-sm text-[var(--t1,#f4edf7)]">
                  {data.teamNames[c.teamId] ?? '—'}
                </span>
                <span className={HINT}>
                  {format(t.commonOpponentLine, {
                    myWins: c.myWins,
                    myLosses: c.myLosses,
                    theirWins: c.theirWins,
                    theirLosses: c.theirLosses,
                  })}
                </span>
              </li>
            ))}
          </ul>
        </FicheFold>
      )}

      <FicheFold title={t.usualSlots}>
        {!report.usualSlots || report.usualSlots.length === 0 ? (
          <p className={MUTED}>{t.notEnoughData}</p>
        ) : (
          <>
            <p className={BODY}>
              {report.usualSlots
                .map((s) => `${dayName(s.weekday)} ${s.hour}h (${s.count})`)
                .join(' · ')}
            </p>
            <p className={`mt-1 ${HINT}`}>
              {format(t.usualSlotsHint, { timezone: data.timezone })}
            </p>
          </>
        )}
      </FicheFold>

      {data.myNotes.length > 0 && (
        <FicheFold title={t.myNotes}>
          <p className={HINT}>{t.myNotesHint}</p>
          <ul className="mt-3 space-y-3">
            {data.myNotes.map((note) => (
              <li
                key={`${note.subjectType}:${note.subjectId}`}
                className={`${ROW} flex-col items-start`}
              >
                <p className={HINT}>{fmtDate(note.playedAt)}</p>
                {note.notes && (
                  <p className="whitespace-pre-wrap text-sm text-[var(--t1,#f4edf7)]">
                    {note.notes}
                  </p>
                )}
                {note.vodUrl && (
                  <a
                    href={note.vodUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-xs font-semibold text-[var(--or-200,#eec4ff)] underline"
                  >
                    {t.watchVod}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </FicheFold>
      )}
    </>
  );
}
