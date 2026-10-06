// features/admin/stages/ui/BatchScoresGrid.tsx — saisie rapide des scores
// d'un round de la phase, enregistrée via `POST …/batch-scores`.
//
// Repliée par défaut : les matchs ne sont lus qu'à l'ouverture. Seules les
// lignes modifiées partent ; les lignes invalides bloquent l'envoi, et les
// échecs serveur (match par match) sont récapitulés sous la grille, saisie
// conservée pour corriger et renvoyer.

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/components/Toast';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { adminRequest } from '@/utils/admin/adminHttp';
import { format } from '@/lib/i18n/useAdminT';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import { tournamentUrls } from '@/features/admin/tournaments/client';
import type { Dict } from '@/components/admin/stages/[stageId]/stageDisplay';
import { type BatchScoresResponse, stageUrls } from '../client';
import {
  buildBatch,
  chunkEntries,
  type GridMatch,
  initialCell,
  isPlayable,
  type RowError,
  roundsOf,
  type ScoreCell,
} from '../batchScoresDraft';
import { stageKeys } from '../hooks/keys';
import { CARD, ERROR_BOX, MUTED, SPINNER, WARN_BOX } from './rubanClasses';

type Props = {
  stageId: string;
  tournamentId: string;
  stageType: string | null;
  /** Après un enregistrement (au moins un succès) : relire l'avancement. */
  onSaved?: () => unknown;
  t: Dict;
};

type Failure = { matchId: string; error: string };

const SCORE_INPUT =
  'h-[34px] w-16 rounded-[var(--r-ctrl,4px)] border bg-[var(--s2,#1d1520)] px-2 text-center font-mono text-sm text-[var(--t1,#f4edf7)] focus:outline-none focus:ring-2 focus:ring-[var(--or,#b467d1)]';

function teamName(
  team: GridMatch['team1'],
  id: string | null,
  fallback: string
): string {
  return team?.name || (id ? id.slice(0, 8) : fallback);
}

export default function BatchScoresGrid({
  stageId,
  tournamentId,
  stageType,
  onSaved,
  t,
}: Props) {
  const { addToast } = useToast();
  const { mutate } = useIdempotentMutation();
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState<number | null | undefined>(undefined);
  const [edits, setEdits] = useState<Record<string, ScoreCell>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, RowError>>({});
  const [failures, setFailures] = useState<Failure[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const query = useQuery({
    queryKey: stageKeys.part(stageId, 'batch-score-matches'),
    queryFn: () =>
      adminRequest<{ matches?: GridMatch[] }>(
        tournamentUrls.matches(tournamentId, {
          stageId,
          includeTeams: '1',
          orderBy: 'round_number',
          orderDir: 'asc',
          limit: 512,
        })
      ),
    enabled: open && !!stageId && !!tournamentId,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const matches = query.data?.matches ?? [];
  const rounds = useMemo(() => roundsOf(matches), [matches]);
  // Round affiché : le choix explicite, sinon le premier round non terminé.
  const activeRound =
    round !== undefined && rounds.includes(round)
      ? round
      : (rounds.find((r) =>
          matches.some(
            (m) =>
              (m.round_number ?? null) === r &&
              isPlayable(m) &&
              m.status !== 'finished'
          )
        ) ??
        rounds[0] ??
        null);
  const roundMatches = useMemo(
    () =>
      matches.filter(
        (m) => (m.round_number ?? null) === activeRound && isPlayable(m)
      ),
    [matches, activeRound]
  );

  const forbidTies = stageType === 'bracket';
  const draft = useMemo(
    () => buildBatch(roundMatches, edits, { forbidTies }),
    [roundMatches, edits, forbidTies]
  );
  const changedCount = draft.entries.length + Object.keys(draft.errors).length;

  const cellOf = (m: GridMatch): ScoreCell => edits[m.id] ?? initialCell(m);
  const setCell = (m: GridMatch, side: 'team1' | 'team2', value: string) => {
    setEdits((prev) => ({
      ...prev,
      [m.id]: { ...(prev[m.id] ?? initialCell(m)), [side]: value },
    }));
    setRowErrors((prev) => {
      if (!prev[m.id]) return prev;
      const { [m.id]: _gone, ...rest } = prev;
      return rest;
    });
  };

  const labelOf = useCallback(
    (matchId: string) => {
      const m = matches.find((x) => x.id === matchId);
      if (!m) return matchId.slice(0, 8);
      return `${teamName(m.team1, m.team1_id, t.bsTbd)} vs ${teamName(
        m.team2,
        m.team2_id,
        t.bsTbd
      )}`;
    },
    [matches, t]
  );

  const handleSubmit = useCallback(async () => {
    setFailures([]);
    if (Object.keys(draft.errors).length > 0) {
      setRowErrors(draft.errors);
      addToast(
        format(t.bsInvalid, { count: Object.keys(draft.errors).length }),
        'error'
      );
      return;
    }
    if (draft.entries.length === 0) {
      addToast(t.bsNothing, 'info');
      return;
    }
    setSubmitting(true);
    const failed: Failure[] = [];
    const succeeded = new Set<string>();
    try {
      // Séquentiel : l'ordre compte pour la propagation du bracket.
      for (const chunk of chunkEntries(draft.entries)) {
        const res = await mutate(stageUrls.batchScores(stageId), {
          method: 'POST',
          body: JSON.stringify({ scores: chunk }),
        });
        const json = (await res
          .json()
          .catch(() => ({}))) as Partial<BatchScoresResponse> & {
          error?: string;
        };
        if (!Array.isArray(json.results)) {
          // Refus global (400/403…) : tout le lot est en échec.
          const error = json.error || t.bsErrRequest;
          for (const e of chunk) failed.push({ matchId: e.matchId, error });
          continue;
        }
        for (const r of json.results) {
          if (r.success) succeeded.add(r.matchId);
          else failed.push({ matchId: r.matchId, error: r.error || '' });
        }
      }
    } catch (err) {
      const error = (err as Error)?.message || t.bsErrRequest;
      for (const e of draft.entries) {
        if (
          !succeeded.has(e.matchId) &&
          !failed.some((f) => f.matchId === e.matchId)
        ) {
          failed.push({ matchId: e.matchId, error });
        }
      }
    } finally {
      setSubmitting(false);
    }

    // Les lignes passées reprennent la valeur serveur ; les autres gardent
    // la saisie pour être corrigées.
    setEdits((prev) => {
      const next = { ...prev };
      for (const id of succeeded) delete next[id];
      return next;
    });
    setFailures(failed);
    if (succeeded.size > 0) {
      addToast(
        failed.length > 0
          ? format(t.bsPartial, {
              success: succeeded.size,
              failure: failed.length,
            })
          : format(t.bsDone, { success: succeeded.size }),
        failed.length > 0 ? 'warning' : 'success'
      );
      await query.refetch();
      await onSaved?.();
    } else {
      addToast(t.bsErrRequest, 'error');
    }
  }, [draft, addToast, t, mutate, stageId, query, onSaved]);

  return (
    <section className={CARD} data-testid="batch-scores-grid">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--t1,#f4edf7)]">
            {t.bsTitle}
          </h2>
          <p className={`mt-1 text-xs ${MUTED}`}>{t.bsIntro}</p>
        </div>
        <AdminButton
          size="sm"
          variant="secondary"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? t.bsClose : t.bsOpen}
        </AdminButton>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          {query.isPending && (
            <div className="flex items-center gap-3 py-6">
              <div className={SPINNER} />
              <span className={`text-sm ${MUTED}`}>{t.bsLoading}</span>
            </div>
          )}

          {query.error && (
            <div className={ERROR_BOX}>
              {query.error.message || t.bsErrLoad}
            </div>
          )}

          {!query.isPending && !query.error && matches.length === 0 && (
            <p className={`py-4 text-center text-sm ${MUTED}`}>{t.bsEmpty}</p>
          )}

          {rounds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs ${MUTED}`}>{t.bsRoundLabel}</span>
              {rounds.map((r) => (
                <AdminButton
                  key={String(r)}
                  size="xs"
                  variant={r === activeRound ? 'primary' : 'ghost'}
                  aria-pressed={r === activeRound}
                  onClick={() => {
                    setRound(r);
                    setRowErrors({});
                    setFailures([]);
                  }}
                >
                  {r === null
                    ? t.bsRoundNone
                    : format(t.bsRoundOption, { round: r })}
                </AdminButton>
              ))}
            </div>
          )}

          {matches.length > 0 && roundMatches.length === 0 && (
            <p className={`py-4 text-center text-sm ${MUTED}`}>
              {t.bsEmptyRound}
            </p>
          )}

          {roundMatches.length > 0 && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSubmit();
              }}
              className="space-y-3"
            >
              <div className="overflow-x-auto rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--s2,#1d1520)] text-left text-xs text-[var(--t3,#a39ba6)]">
                      <th scope="col" className="px-3 py-2">
                        {t.bsThMatch}
                      </th>
                      <th scope="col" className="px-3 py-2 text-center">
                        {t.bsThScore}
                      </th>
                      <th scope="col" className="px-3 py-2 text-right">
                        {t.bsThStatus}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
                    {roundMatches.map((m) => {
                      const cell = cellOf(m);
                      const err = rowErrors[m.id];
                      const n1 = teamName(m.team1, m.team1_id, t.bsTbd);
                      const n2 = teamName(m.team2, m.team2_id, t.bsTbd);
                      const border = err
                        ? 'border-[var(--err,#ff6b6b)]'
                        : 'border-[var(--line2,rgba(194,196,201,.2))]';
                      return (
                        <tr key={m.id} data-testid="batch-score-row">
                          <td className="px-3 py-2 text-[var(--t1,#f4edf7)]">
                            {n1} <span className={MUTED}>vs</span> {n2}
                            {err && (
                              <p
                                role="alert"
                                className="mt-1 text-xs text-[var(--err,#ff6b6b)]"
                              >
                                {t[err]}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-center gap-2">
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                step={1}
                                aria-label={`${n1} — ${t.bsThScore}`}
                                className={`${SCORE_INPUT} ${border}`}
                                value={cell.team1}
                                onChange={(e) =>
                                  setCell(m, 'team1', e.target.value)
                                }
                              />
                              <span className={MUTED}>–</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                step={1}
                                aria-label={`${n2} — ${t.bsThScore}`}
                                className={`${SCORE_INPUT} ${border}`}
                                value={cell.team2}
                                onChange={(e) =>
                                  setCell(m, 'team2', e.target.value)
                                }
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Chip
                              tone={m.status === 'finished' ? 'ok' : 'neutral'}
                            >
                              {m.status ?? '—'}
                            </Chip>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className={`text-xs ${MUTED}`} data-numeric>
                  {format(t.bsChanged, { count: changedCount })}
                </span>
                <div className="flex gap-2">
                  <AdminButton
                    size="sm"
                    variant="ghost"
                    disabled={submitting || changedCount === 0}
                    onClick={() => {
                      setEdits({});
                      setRowErrors({});
                      setFailures([]);
                    }}
                  >
                    {t.bsReset}
                  </AdminButton>
                  <AdminButton
                    type="submit"
                    size="sm"
                    variant="primary"
                    disabled={submitting || changedCount === 0}
                  >
                    {submitting ? t.bsSubmitting : t.bsSubmit}
                  </AdminButton>
                </div>
              </div>
            </form>
          )}

          {failures.length > 0 && (
            <div className={WARN_BOX} data-testid="batch-scores-failures">
              <p className="mb-1 font-semibold">{t.bsRecapTitle}</p>
              <ul className="space-y-1 text-xs">
                {failures.map((f) => (
                  <li key={f.matchId}>
                    <span className="font-medium">{labelOf(f.matchId)}</span>
                    {f.error ? ` — ${f.error}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
