// features/admin/tournaments/ui/TournamentMatchesList.tsx — vue liste de
// l'écran « matchs du tournoi » : chargement, état vide, « tout
// sélectionner », une ligne mémoïsée par match (avec l'éditeur de score
// inline) et la pagination. Présentationnel : la page possède la sélection,
// la ligne en cours de saisie et l'écriture du score.

import { memo, useState } from 'react';
import Image from 'next/image';
import { format } from '@/lib/i18n/useAdminT';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import type { Match, TeamMini } from '@/types/admin';
import { formatMatchDateTime } from '@/utils/matches/adminMatchesTz';
import {
  ConflictIcon,
  TM_CARD,
  TM_CHECKBOX,
  TournamentMatchesSpinner,
  stageLabel,
  statusLabel,
  statusTone,
  type TournamentMatchesDict,
} from './TournamentMatchesShared';

type TeamCellProps = {
  team: TeamMini | null | undefined;
  fallbackId: string | null | undefined;
  isWinner: boolean;
  align?: 'left' | 'right';
};

function TeamCell({
  team,
  fallbackId,
  isWinner,
  align = 'left',
}: TeamCellProps) {
  const label = team?.name || fallbackId || 'TBD';
  const short = team?.short_name || null;

  return (
    <div
      className={`flex w-40 items-center gap-3 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}
    >
      {team?.logo_url ? (
        <Image
          src={team.logo_url}
          alt={team.name}
          width={40}
          height={40}
          className="h-10 w-10 rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s3,#2f2732)] text-xs font-semibold uppercase text-[var(--t3,#a39ba6)]">
          {(label || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-sm font-semibold ${isWinner ? 'text-[var(--lf,#7fca65)]' : 'text-[var(--t1,#f4edf7)]'}`}
        >
          {label}
        </div>
        {short && (
          <div className="truncate text-xs text-[var(--t4,#807984)]">
            {short}
          </div>
        )}
      </div>
    </div>
  );
}

const SCORE_INPUT =
  'w-16 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-2 py-1.5 text-center text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';

// --- Éditeur quick-score inline -------------------------------------------
// L'état d'édition (score1/score2) est LOCAL à ce composant : taper n'entraîne
// donc AUCUN re-render de la page ni des autres lignes. À l'ouverture, les
// valeurs initiales sont dérivées du match (le composant est monté/démonté par
// `quickScoreOpen` côté page, ce qui garantit un reset propre).
type QuickScoreEditorProps = {
  t: TournamentMatchesDict;
  match: Match;
  saving: boolean;
  onSubmit: (matchId: string, s1: string, s2: string) => void;
  onCancel: () => void;
};

function QuickScoreEditor({
  t,
  match,
  saving,
  onSubmit,
  onCancel,
}: QuickScoreEditorProps) {
  const [score1, setScore1] = useState(
    match.team1_score != null ? String(match.team1_score) : ''
  );
  const [score2, setScore2] = useState(
    match.team2_score != null ? String(match.team2_score) : ''
  );

  return (
    <div className="mt-3 flex items-center gap-3 pl-40">
      <span className="w-20 truncate text-right text-xs text-[var(--t3,#a39ba6)]">
        {match.team1?.short_name || match.team1?.name || t.team1Fallback}
      </span>
      <input
        type="number"
        min={0}
        className={SCORE_INPUT}
        value={score1}
        onChange={(e) => setScore1(e.target.value)}
        autoFocus
      />
      <span className="font-bold text-[var(--t4,#807984)]">—</span>
      <input
        type="number"
        min={0}
        className={SCORE_INPUT}
        value={score2}
        onChange={(e) => setScore2(e.target.value)}
      />
      <span className="w-20 truncate text-xs text-[var(--t3,#a39ba6)]">
        {match.team2?.short_name || match.team2?.name || t.team2Fallback}
      </span>
      <AdminButton
        variant="primary"
        size="xs"
        disabled={score1 === '' || score2 === '' || saving}
        onClick={() => onSubmit(match.id, score1, score2)}
      >
        {saving ? t.validating : t.validate}
      </AdminButton>
      <AdminButton variant="ghost" size="xs" onClick={onCancel}>
        {t.cancel}
      </AdminButton>
    </div>
  );
}

// --- Ligne de match (liste principale) ------------------------------------
// Mémoïsée : avec des props stables (handlers en useCallback côté page,
// `t`/`match` stables), une frappe dans le filtre de recherche ou l'ouverture
// d'un quick-score sur une AUTRE ligne ne re-render pas cette ligne.
type MatchRowProps = {
  t: TournamentMatchesDict;
  match: Match;
  selected: boolean;
  hasConflict: boolean;
  timezone: string;
  quickScoreOpen: boolean;
  qsSaving: boolean;
  onToggleSelect: (matchId: string) => void;
  onToggleQuickScore: (matchId: string) => void;
  onQuickScoreSubmit: (matchId: string, s1: string, s2: string) => void;
  onQuickScoreCancel: () => void;
};

const MatchRow = memo(function MatchRow({
  t,
  match: m,
  selected,
  hasConflict,
  timezone,
  quickScoreOpen,
  qsSaving,
  onToggleSelect,
  onToggleQuickScore,
  onQuickScoreSubmit,
  onQuickScoreCancel,
}: MatchRowProps) {
  return (
    <div
      className={`p-4 transition-colors hover:bg-[var(--s2,#1d1520)] ${
        selected ? 'bg-[rgba(180,103,209,.06)]' : ''
      } ${hasConflict ? 'border-l-4 border-l-[var(--warn,#f5a524)]' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-4">
        {/* Conflict indicator */}
        {hasConflict && (
          <span
            title={t.conflictTitle}
            className="flex-shrink-0 text-[var(--warn,#f5a524)]"
          >
            <ConflictIcon className="h-5 w-5" />
          </span>
        )}

        {/* Checkbox */}
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(m.id)}
          className={TM_CHECKBOX}
        />

        {/* Stage & Round info */}
        <div className="w-40 flex-shrink-0">
          <div className="text-sm font-medium text-[var(--t1,#f4edf7)]">
            {stageLabel(t, m.stage)}
          </div>
          <div className="text-xs text-[var(--t3,#a39ba6)]">
            {format(t.roundLabel, {
              round: m.round_number ?? '—',
            })}
            {m.best_of ? ` • BO${m.best_of}` : ''}
          </div>
          <div className="mt-1 font-mono text-[10px] text-[var(--t4,#807984)]">
            #{m.id.slice(0, 8)}
          </div>
        </div>

        {/* Teams & Score */}
        <div className="flex min-w-[300px] flex-1 items-center justify-center gap-4">
          <TeamCell
            team={m.team1}
            fallbackId={m.team1?.name || undefined}
            isWinner={m.winner_team_id === m.team1_id}
            align="right"
          />

          <div className="flex flex-col items-center">
            <div
              className="rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] px-4 py-1 font-[family-name:var(--fd)] text-xl font-bold text-[var(--t1,#f4edf7)] [font-stretch:75%]"
              data-numeric
            >
              {typeof m.team1_score === 'number' ||
              typeof m.team2_score === 'number'
                ? `${m.team1_score ?? 0} - ${m.team2_score ?? 0}`
                : 'vs'}
            </div>
            <span className="mt-2">
              <Chip tone={statusTone(m.status)}>
                {statusLabel(t, m.status)}
              </Chip>
            </span>
          </div>

          <TeamCell
            team={m.team2}
            fallbackId={m.team2?.name || undefined}
            isWinner={m.winner_team_id === m.team2_id}
            align="left"
          />
        </div>

        {/* Schedule */}
        <div className="w-32 flex-shrink-0 text-right">
          <div className="text-sm text-[var(--t2,#c7bfca)]" data-numeric>
            {formatMatchDateTime(m.scheduled_at, timezone)}
          </div>
          {m.completed_at && (
            <div className="text-[10px] text-[var(--t4,#807984)]">
              {format(t.finishedAt, {
                date: formatMatchDateTime(m.completed_at, timezone),
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-shrink-0 gap-2">
          {m.status !== 'cancelled' && (
            <AdminButton
              variant={quickScoreOpen ? 'secondary' : 'ghost'}
              size="xs"
              aria-pressed={quickScoreOpen}
              onClick={() => onToggleQuickScore(m.id)}
            >
              {t.score}
            </AdminButton>
          )}
          <AdminButtonLink
            href={`/admin/matches/${m.id}/edit`}
            variant="ghost"
            size="xs"
          >
            {t.edit}
          </AdminButtonLink>
          <AdminButtonLink href={`/match/${m.id}`} target="_blank" size="xs">
            {t.view}
          </AdminButtonLink>
        </div>
      </div>

      {/* Inline Quick Score */}
      {quickScoreOpen && (
        <QuickScoreEditor
          t={t}
          match={m}
          saving={qsSaving}
          onSubmit={onQuickScoreSubmit}
          onCancel={onQuickScoreCancel}
        />
      )}
    </div>
  );
});

export default function TournamentMatchesList({
  t,
  loading,
  matches,
  selectedMatchIds,
  onToggleSelectAll,
  conflictMatchIds,
  timezone,
  quickScoreId,
  qsSaving,
  onToggleSelect,
  onToggleQuickScore,
  onQuickScoreSubmit,
  onQuickScoreCancel,
}: {
  t: TournamentMatchesDict;
  loading: boolean;
  matches: Match[];
  selectedMatchIds: Set<string>;
  onToggleSelectAll: () => void;
  conflictMatchIds: Set<string>;
  timezone: string;
  quickScoreId: string | null;
  qsSaving: boolean;
  onToggleSelect: (matchId: string) => void;
  onToggleQuickScore: (matchId: string) => void;
  onQuickScoreSubmit: (matchId: string, s1: string, s2: string) => void;
  onQuickScoreCancel: () => void;
}) {
  return (
    <section className={`${TM_CARD} overflow-hidden`}>
      {loading ? (
        <TournamentMatchesSpinner />
      ) : matches.length === 0 ? (
        <div className="py-20 text-center text-[var(--t3,#a39ba6)]">
          <svg
            aria-hidden
            className="mx-auto mb-4 h-12 w-12 text-[var(--t4,#807984)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M12 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {t.emptyMatches}
        </div>
      ) : (
        <div className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
          {/* Select all row */}
          <div className="flex items-center gap-3 bg-[var(--s2,#1d1520)] px-4 py-2">
            <input
              type="checkbox"
              checked={
                selectedMatchIds.size === matches.length && matches.length > 0
              }
              onChange={onToggleSelectAll}
              className={TM_CHECKBOX}
            />
            <span className="text-xs text-[var(--t3,#a39ba6)]">
              {t.selectAll}
            </span>
          </div>

          {matches.map((m) => (
            <MatchRow
              key={m.id}
              t={t}
              match={m}
              selected={selectedMatchIds.has(m.id)}
              hasConflict={conflictMatchIds.has(m.id)}
              timezone={timezone}
              quickScoreOpen={quickScoreId === m.id}
              qsSaving={qsSaving}
              onToggleSelect={onToggleSelect}
              onToggleQuickScore={onToggleQuickScore}
              onQuickScoreSubmit={onQuickScoreSubmit}
              onQuickScoreCancel={onQuickScoreCancel}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/** Pagination — liste seulement : le calendrier charge tout. */
export function TournamentMatchesPagination({
  t,
  offset,
  shown,
  total,
  prevDisabled,
  nextDisabled,
  onPrev,
  onNext,
}: {
  t: TournamentMatchesDict;
  offset: number;
  shown: number;
  total: number | null;
  prevDisabled: boolean;
  nextDisabled: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-6 flex items-center justify-between gap-4 print:hidden">
      <AdminButton
        variant="ghost"
        size="sm"
        disabled={prevDisabled}
        onClick={onPrev}
      >
        <span aria-hidden>‹</span>
        {t.previous}
      </AdminButton>

      <span className="text-sm text-[var(--t3,#a39ba6)]" data-numeric>
        {offset + 1} – {offset + shown}
        {total ? format(t.paginationTotal, { total }) : ''}
      </span>

      <AdminButton
        variant="ghost"
        size="sm"
        disabled={nextDisabled}
        onClick={onNext}
      >
        {t.next}
        <span aria-hidden>›</span>
      </AdminButton>
    </div>
  );
}
