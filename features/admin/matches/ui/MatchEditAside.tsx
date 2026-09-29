// features/admin/matches/ui/MatchEditAside.tsx — la colonne de droite de
// l'écran d'édition d'un match (résumé, équipes, MVP), sortie de
// pages/admin/matches/[matchId]/edit.tsx. Purement présentationnel : le
// chargement et l'enregistrement du MVP restent dans la page.

import Image from 'next/image';
import Link from 'next/link';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { Match, TeamMini } from '@/types/admin';
import nsAdminMatchEdit from '@/lib/i18n/locales/admin-fr/adminMatchEdit';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import { FicheSection, MetaList } from '@/features/admin/_shared/ui/Fiche';
import { matchStatusTone } from './MatchDetailBlocks';
import { MATCH_EDIT_INPUT, matchEditStatusLabel } from './MatchEditForm';

function formatDateTimeNice(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const FOOT =
  'mt-4 border-t border-[var(--line,rgba(194,196,201,.12))] pt-3 text-xs text-[var(--t3,#a39ba6)]';

/** Résumé du match + les deux équipes. */
export function MatchEditSummary({
  match,
  team1,
  team2,
  detailHref,
}: {
  match: Match;
  team1: TeamMini | null;
  team2: TeamMini | null;
  detailHref: string;
}) {
  const t = useAdminT(nsAdminMatchEdit);
  return (
    <>
      <FicheSection title={t.summaryHeading} eyebrow>
        <MetaList
          items={[
            {
              label: t.currentStatus,
              value: (
                <Chip tone={matchStatusTone(match.status)}>
                  {matchEditStatusLabel(match.status, t)}
                </Chip>
              ),
            },
            { label: t.roundLabel, value: match.round_number ?? '—' },
            {
              label: t.formatLabel,
              value: match.best_of ? `BO${match.best_of}` : '—',
            },
            {
              label: t.scheduledSummary,
              value: formatDateTimeNice(match.scheduled_at),
            },
            {
              label: t.startedLabel,
              value: formatDateTimeNice(match.started_at),
            },
            {
              label: t.finishedLabel,
              value: formatDateTimeNice(match.completed_at),
            },
          ]}
        />
        <div className={FOOT}>
          {t.fullIdLabel}{' '}
          <span className="break-all rounded-[3px] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-2 py-1 font-mono text-[var(--t2,#c7bfca)]">
            {match.id}
          </span>
        </div>
      </FicheSection>

      <FicheSection title={t.teamsHeading} eyebrow>
        <div className="space-y-4">
          <TeamSummaryCard
            label={t.team1Fallback}
            team={team1}
            teamId={match.team1_id}
            score={match.team1_score}
            isWinner={match.winner_team_id === match.team1_id}
          />
          <TeamSummaryCard
            label={t.team2Fallback}
            team={team2}
            teamId={match.team2_id}
            score={match.team2_score}
            isWinner={match.winner_team_id === match.team2_id}
          />
        </div>
        <div className={`space-y-1 ${FOOT}`}>
          <p>{t.summaryNote}</p>
          <Link
            href={detailHref}
            className="inline-flex items-center gap-1 text-[var(--or-200,#eec4ff)] hover:underline"
          >
            {t.viewDetail}
          </Link>
        </div>
      </FicheSection>
    </>
  );
}

function TeamSummaryCard({
  label,
  team,
  teamId,
  score,
  isWinner,
}: {
  label: string;
  team: TeamMini | null;
  teamId: string | null;
  score: number | null;
  isWinner: boolean;
}) {
  const t = useAdminT(nsAdminMatchEdit);
  const displayName = team?.name || teamId || t.tbd;
  return (
    <div className="flex items-center gap-3">
      {team?.logo_url && (
        <Image
          src={team.logo_url}
          alt={team.name}
          width={32}
          height={32}
          className="h-8 w-8 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div
              className={`truncate font-semibold ${
                isWinner
                  ? 'text-[var(--lf-200,#b3e7a3)]'
                  : 'text-[var(--t1,#f4edf7)]'
              }`}
            >
              {displayName}
            </div>
            <div className="text-[11px] text-[var(--t4,#807984)]">{label}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-[var(--t3,#a39ba6)]">
              {t.scoreLabelShort}
            </div>
            <div className="font-mono text-lg font-semibold text-[var(--t1,#f4edf7)]">
              {score != null ? score : '—'}
            </div>
          </div>
        </div>
        {team?.short_name && (
          <div className="mt-0.5 text-[11px] text-[var(--t3,#a39ba6)]">
            {team.short_name}
          </div>
        )}
      </div>
    </div>
  );
}

export type MvpCandidate = {
  id: string;
  teamId: string;
  teamName: string | null;
  battleTag: string | null;
  isSubstitute: boolean;
};

export type MvpPollData = {
  matchId: string;
  matchStatus: string;
  poll: {
    id: string;
    posted_at: string | null;
    duration_hours: number;
    winner_member_id: string | null;
    winner_battle_tag: string | null;
    winner_imported_at: string | null;
  } | null;
  candidates: MvpCandidate[];
};

/** Carte MVP : sondage, MVP enregistré, choix et enregistrement. */
export function MatchEditMvpCard({
  data,
  loading,
  selected,
  onSelect,
  saving,
  err,
  onSave,
  onClear,
}: {
  data: MvpPollData | null;
  loading: boolean;
  selected: string;
  onSelect: (id: string) => void;
  saving: boolean;
  err: string | null;
  onSave: () => void;
  onClear: () => void;
}) {
  const t = useAdminT(nsAdminMatchEdit);
  const poll = data?.poll;
  const winnerMember = data?.candidates.find(
    (c) => c.id === poll?.winner_member_id
  );

  // Group candidates by team for the dropdown
  const grouped: Record<string, MvpCandidate[]> = {};
  for (const c of data?.candidates || []) {
    if (c.isSubstitute) continue;
    const k = c.teamName || c.teamId;
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(c);
  }

  return (
    <FicheSection title={t.mvpHeading} eyebrow>
      {loading ? (
        <div className="text-sm text-[var(--t3,#a39ba6)]">{t.mvpLoading}</div>
      ) : (
        <div className="space-y-3">
          <div className="text-xs text-[var(--t3,#a39ba6)]">
            {poll?.posted_at ? (
              <>
                {t.mvpPollPostedPrefix}{' '}
                <span className="text-[var(--t1,#f4edf7)]">
                  {new Date(poll.posted_at).toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Europe/Paris',
                  })}
                </span>{' '}
                {format(t.mvpPollDuration, { hours: poll.duration_hours })}
              </>
            ) : (
              <span>{t.mvpNoPoll}</span>
            )}
          </div>

          {poll?.winner_member_id && winnerMember ? (
            <div className="flex items-center gap-3 rounded-[var(--r-ctrl,4px)] border border-[rgba(127,202,101,.36)] bg-[rgba(127,202,101,.08)] p-3">
              <span className="text-2xl">🏅</span>
              <div className="min-w-0 flex-1">
                <div className="font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--lf-200,#b3e7a3)]">
                  {t.mvpRegistered}
                </div>
                <div className="text-sm font-semibold text-[var(--t1,#f4edf7)]">
                  {winnerMember.battleTag || '—'}
                </div>
                <div className="text-xs text-[var(--t3,#a39ba6)]">
                  {winnerMember.teamName || ''}{' '}
                  {poll.winner_imported_at && (
                    <>
                      {t.mvpImportedPrefix}{' '}
                      {new Date(poll.winner_imported_at).toLocaleString(
                        'fr-FR',
                        { day: '2-digit', month: 'short' }
                      )}
                    </>
                  )}
                </div>
              </div>
              <AdminButton
                variant="danger"
                size="xs"
                onClick={onClear}
                disabled={saving}
              >
                {t.clearBtn}
              </AdminButton>
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-xs text-[var(--t3,#a39ba6)]">
              {t.mvpSelectLabel}
            </label>
            <select
              value={selected}
              onChange={(e) => onSelect(e.target.value)}
              className={MATCH_EDIT_INPUT}
            >
              <option value="">{t.mvpSelectPlaceholder}</option>
              {Object.entries(grouped).map(([teamName, members]) => (
                <optgroup key={teamName} label={teamName}>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.battleTag ||
                        format(t.mvpMemberFallback, { id: m.id.slice(0, 6) })}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {err && (
            <div className="rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-3 py-2 text-xs text-[#ffc2c2]">
              {err}
            </div>
          )}

          <AdminButton
            variant="secondary"
            size="sm"
            onClick={onSave}
            disabled={
              saving || !selected || selected === poll?.winner_member_id
            }
          >
            {saving ? t.mvpSaving : t.mvpSave}
          </AdminButton>
        </div>
      )}
    </FicheSection>
  );
}
