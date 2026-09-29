// components/admin/MatchCastAssignments.tsx
// Sidebar card on the match-edit page: list & manage cast assignments.

import { useEffect, useMemo, useState } from 'react';
import {
  useCastAssignmentMutations,
  useCastMemberOptions,
  useMatchCastAssignments,
} from '@/features/admin/matches/hooks/useMatch';
import type {
  CastAssignment,
  CastMemberLite,
} from '@/features/admin/matches/client';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { logger } from '../../utils/logger';
import nsAdminMatchCastAssignments from '@/lib/i18n/locales/admin-fr/adminMatchCastAssignments';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { rubanCardPadded, rubanInset } from '@/features/admin/_shared/ui/ruban';

const EMPTY_ASSIGNMENTS: CastAssignment[] = [];
const EMPTY_CASTERS: CastMemberLite[] = [];

type Props = {
  matchId: string;
};

function toInputDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function MatchCastAssignments({ matchId }: Props) {
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const t = useAdminT(nsAdminMatchCastAssignments);

  const assignmentsQuery = useMatchCastAssignments(matchId);
  const castersQuery = useCastMemberOptions();
  const mutations = useCastAssignmentMutations(matchId);
  const assignments = assignmentsQuery.data ?? EMPTY_ASSIGNMENTS;
  const casters = castersQuery.data ?? EMPTY_CASTERS;
  const loading = assignmentsQuery.isPending || castersQuery.isPending;

  const loadFailed = !!assignmentsQuery.error || !!castersQuery.error;
  // biome-ignore lint/correctness/useExhaustiveDependencies: un toast par échec, pas par rendu
  useEffect(() => {
    if (!loadFailed) return;
    logger.error('[MatchCastAssignments] load', {
      assignments: assignmentsQuery.error,
      casters: castersQuery.error,
    });
    addToast(t.loadError, 'error');
  }, [loadFailed]);

  const [castMemberId, setCastMemberId] = useState('');
  const [briefingAt, setBriefingAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const assignedIds = useMemo(
    () => new Set(assignments.map((a) => a.cast_member_id)),
    [assignments]
  );
  const availableCasters = useMemo(
    () => casters.filter((c) => !assignedIds.has(c.id)),
    [casters, assignedIds]
  );

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!castMemberId || !briefingAt) {
      addToast(t.chooseError, 'error');
      return;
    }
    setSubmitting(true);
    try {
      await mutations.add.mutateAsync({
        castMemberId,
        briefingAt: new Date(briefingAt).toISOString(),
      });
      addToast(t.assigned, 'success');
      setCastMemberId('');
      setBriefingAt('');
    } catch (err) {
      addToast((err as Error).message || t.genericError, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(assignmentId: string) {
    const ok = await confirm({ title: t.confirmRemove, variant: 'danger' });
    if (!ok) return;
    try {
      await mutations.remove.mutateAsync(assignmentId);
      addToast(t.assignmentDeleted, 'success');
    } catch (err) {
      addToast((err as Error).message || t.genericError, 'error');
    }
  }

  async function handleReschedule(assignmentId: string, isoLocal: string) {
    try {
      await mutations.reschedule.mutateAsync({
        assignmentId,
        briefingAt: new Date(isoLocal).toISOString(),
      });
      addToast(t.rescheduled, 'success');
    } catch (err) {
      addToast((err as Error).message || t.genericError, 'error');
    }
  }

  return (
    <>
      {dialog}
      <section className={`space-y-4 ${rubanCardPadded}`}>
        <div>
          <h2 className="text-lg font-semibold">{t.heading}</h2>
          <p className="text-xs text-neutral-500 mt-0.5">{t.headingDesc}</p>
        </div>

        {loading ? (
          <div className="text-sm text-neutral-500">{t.loading}</div>
        ) : (
          <>
            {assignments.length === 0 ? (
              <div className="text-sm text-neutral-500">{t.empty}</div>
            ) : (
              <ul className="space-y-2">
                {assignments.map((a) => (
                  <li key={a.id} className={`p-3 ${rubanInset}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {a.cast_member?.name || t.unknownCaster}
                        </div>
                        <div className="text-xs text-neutral-400 mt-0.5">
                          {format(t.briefingLabel, {
                            time: fmt(a.briefing_at),
                          })}
                        </div>
                        {a.briefing_reminder_sent_at && (
                          <div className="text-xs text-emerald-400 mt-0.5">
                            {format(t.dmSent, {
                              time: fmt(a.briefing_reminder_sent_at),
                            })}
                          </div>
                        )}
                        {!a.cast_member?.auth_user_id && (
                          <div className="text-xs text-amber-400 mt-0.5">
                            {t.notLinkedWarning}
                          </div>
                        )}
                      </div>
                      <AdminButton
                        variant="danger"
                        size="xs"
                        onClick={() => handleDelete(a.id)}
                      >
                        {t.remove}
                      </AdminButton>
                    </div>
                    <div className="mt-2">
                      <input
                        type="datetime-local"
                        defaultValue={toInputDateTime(a.briefing_at)}
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (v && v !== toInputDateTime(a.briefing_at)) {
                            handleReschedule(a.id, v);
                          }
                        }}
                        className="w-full px-2 py-1 text-xs rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {availableCasters.length > 0 ? (
              <form
                onSubmit={handleAdd}
                className="space-y-2 border-t border-[var(--line,rgba(194,196,201,.12))] pt-3"
              >
                <label className="block text-xs text-neutral-400">
                  {t.addLabel}
                </label>
                <select
                  value={castMemberId}
                  onChange={(e) => setCastMemberId(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none"
                >
                  <option value="">{t.choosePlaceholder}</option>
                  {availableCasters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {!c.auth_user_id ? t.notLinkedSuffix : ''}
                    </option>
                  ))}
                </select>
                <input
                  type="datetime-local"
                  value={briefingAt}
                  onChange={(e) => setBriefingAt(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none"
                />
                <AdminButton
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={submitting || !castMemberId || !briefingAt}
                  className="w-full"
                >
                  {submitting ? '…' : t.assign}
                </AdminButton>
              </form>
            ) : (
              assignments.length > 0 && (
                <div className="border-t border-[var(--line,rgba(194,196,201,.12))] pt-3 text-xs text-[var(--t4,#807984)]">
                  {t.allAssigned}
                </div>
              )
            )}
          </>
        )}
      </section>
    </>
  );
}
