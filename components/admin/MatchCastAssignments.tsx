// components/admin/MatchCastAssignments.tsx
// Sidebar card on the match-edit page: list & manage cast assignments.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { logger } from '../../utils/logger';
import nsAdminMatchCastAssignments from '@/lib/i18n/locales/admin-fr/adminMatchCastAssignments';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { rubanCardPadded, rubanInset } from '@/features/admin/_shared/ui/ruban';

type CastMember = {
  id: string;
  name: string;
  auth_user_id: string | null;
  image_url: string | null;
};

/** Les trois formes que `/api/admin/cast-members` a portées selon les versions. */
type CastMembersResponse =
  | { items?: CastMember[]; castMembers?: CastMember[] }
  | CastMember[]
  | null;

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
  const { confirm, dialog } = useConfirmDialog();
  const t = useAdminT(nsAdminMatchCastAssignments);

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
        // Les trois formes réellement rencontrées sont déclarées ici plutôt
        // que rattrapées par un cast : `as any` masquait le fait qu'un tableau
        // nu est une réponse possible, et le jour où une quatrième forme
        // apparaîtra, c'est la compilation qui le dira.
        adminFetchJson<CastMembersResponse>(
          '/api/admin/cast-members?limit=200&includeInactive=true'
        ),
      ]);
      setAssignments(a?.assignments ?? []);
      // The cast-members endpoint returns rows under different keys depending
      // on version; accept both.
      const list = Array.isArray(c) ? c : (c?.castMembers ?? c?.items ?? []);
      setCasters(list);
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
    const ok = await confirm({ title: t.confirmRemove, variant: 'danger' });
    if (!ok) return;
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
