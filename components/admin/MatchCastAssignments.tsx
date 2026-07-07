// components/admin/MatchCastAssignments.tsx
// Sidebar card on the match-edit page: list & manage cast assignments.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { logger } from '../../utils/logger';

type CastMember = {
  id: string;
  name: string;
  auth_user_id: string | null;
  image_url: string | null;
};

type Assignment = {
  id: string;
  match_id: string;
  cast_member_id: string;
  briefing_at: string;
  briefing_reminder_sent_at: string | null;
  created_at: string;
  cast_member: CastMember | null;
};

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
  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();
  const t = useAdminT('adminMatchCastAssignments');

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [casters, setCasters] = useState<CastMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [castMemberId, setCastMemberId] = useState('');
  const [briefingAt, setBriefingAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, c] = await Promise.all([
        adminFetchJson<{ assignments: Assignment[] }>(
          `/api/admin/matches/${matchId}/cast-assignments`
        ),
        adminFetchJson<{ items?: CastMember[]; castMembers?: CastMember[] }>(
          '/api/admin/cast-members?limit=200&includeInactive=true'
        ),
      ]);
      setAssignments(a?.assignments ?? []);
      // The cast-members endpoint returns rows under different keys depending
      // on version; accept both.
      const list =
        (c as any)?.castMembers ??
        (c as any)?.items ??
        (Array.isArray(c) ? c : []);
      setCasters(list as CastMember[]);
    } catch (e) {
      logger.error('[MatchCastAssignments] load', e);
      addToast(t.loadError, 'error');
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, addToast, matchId, t]);

  useEffect(() => {
    load();
  }, [load]);

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
      await adminFetchJson(`/api/admin/matches/${matchId}/cast-assignments`, {
        method: 'POST',
        body: JSON.stringify({
          castMemberId,
          briefingAt: new Date(briefingAt).toISOString(),
        }),
      });
      addToast(t.assigned, 'success');
      setCastMemberId('');
      setBriefingAt('');
      await load();
    } catch (err) {
      addToast((err as Error).message || t.genericError, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(assignmentId: string) {
    if (!confirm(t.confirmRemove)) return;
    try {
      await adminFetchJson(
        `/api/admin/matches/${matchId}/cast-assignments/${assignmentId}`,
        { method: 'DELETE' }
      );
      addToast(t.assignmentDeleted, 'success');
      await load();
    } catch (err) {
      addToast((err as Error).message || t.genericError, 'error');
    }
  }

  async function handleReschedule(assignmentId: string, isoLocal: string) {
    try {
      await adminFetchJson(
        `/api/admin/matches/${matchId}/cast-assignments/${assignmentId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            briefingAt: new Date(isoLocal).toISOString(),
          }),
        }
      );
      addToast(t.rescheduled, 'success');
      await load();
    } catch (err) {
      addToast((err as Error).message || t.genericError, 'error');
    }
  }

  return (
    <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 space-y-4">
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
                <li
                  key={a.id}
                  className="rounded-lg border border-neutral-700 bg-neutral-900/40 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {a.cast_member?.name || t.unknownCaster}
                      </div>
                      <div className="text-xs text-neutral-400 mt-0.5">
                        {format(t.briefingLabel, { time: fmt(a.briefing_at) })}
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
                    <button
                      type="button"
                      onClick={() => handleDelete(a.id)}
                      className="text-xs text-red-300 hover:text-red-200 flex-shrink-0"
                    >
                      {t.remove}
                    </button>
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
                      className="w-full text-xs px-2 py-1 rounded bg-neutral-900/70 border border-neutral-700"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          {availableCasters.length > 0 ? (
            <form
              onSubmit={handleAdd}
              className="space-y-2 border-t border-neutral-700 pt-3"
            >
              <label className="block text-xs text-neutral-400">
                {t.addLabel}
              </label>
              <select
                value={castMemberId}
                onChange={(e) => setCastMemberId(e.target.value)}
                className="w-full px-2 py-1.5 rounded bg-neutral-900/70 border border-neutral-700 text-sm"
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
                className="w-full px-2 py-1.5 rounded bg-neutral-900/70 border border-neutral-700 text-sm"
              />
              <button
                type="submit"
                disabled={submitting || !castMemberId || !briefingAt}
                className="w-full px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-sm font-medium"
              >
                {submitting ? '…' : t.assign}
              </button>
            </form>
          ) : (
            assignments.length > 0 && (
              <div className="text-xs text-neutral-500 border-t border-neutral-700 pt-3">
                {t.allAssigned}
              </div>
            )
          )}
        </>
      )}
    </section>
  );
}
