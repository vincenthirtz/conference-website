// pages/admin/broadcast/live.tsx
// Lot 7 — Live Broadcast Console.
// Single-pane view of the active event_run + current segment + casters +
// stream URL + overlay state. Manager+ can edit on_air / lower_third / PiP.

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { StaffProps } from '@/types/admin';

type BroadcastStateV1 = {
  v: 1;
  on_air: boolean;
  lower_third: string | null;
  pip: { enabled: boolean };
};

type LiveResponse = {
  run: {
    id: string;
    name: string;
    slug: string;
    status: 'draft' | 'live' | 'done';
    startedAt: string | null;
    scheduledAt: string | null;
  } | null;
  currentSegment: {
    id: string;
    ord: number;
    type: string;
    title: string;
    status: string;
    match_id: string | null;
    duration_min: number | null;
  } | null;
  match: {
    matchId: string;
    team1: { id: string; name: string; shortName: string | null } | null;
    team2: { id: string; name: string; shortName: string | null } | null;
    team1Score: number | null;
    team2Score: number | null;
    streamUrl: string | null;
  } | null;
  casters: {
    castMemberId: string;
    displayName: string | null;
    discordUserId: string | null;
  }[];
  state: BroadcastStateV1;
  generatedAt: string;
};

const POLL_MS = 15_000;

export const getServerSideProps = withStaffPage('caster');

function BroadcastLivePage({ staff }: StaffProps) {
  const t = useAdminT('adminBroadcastLive');
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation({
    autoRegenerateOnSuccess: true,
  });
  const { addToast } = useToast();

  const [data, setData] = useState<LiveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lowerDraft, setLowerDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canEdit = staff.role !== 'caster';

  const fetchState = useCallback(async () => {
    setError(null);
    try {
      const json = await adminFetchJson<LiveResponse>(
        '/api/admin/broadcast/state'
      );
      setData(json);
      setLowerDraft((prev) =>
        prev === '' && json.state?.lower_third
          ? json.state.lower_third
          : prev
      );
    } catch (err) {
      const e = err as AdminFetchError;
      setError(e.message || t.errorLoad);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, t.errorLoad]);

  useEffect(() => {
    fetchState();
    const handle = setInterval(fetchState, POLL_MS);
    return () => clearInterval(handle);
  }, [fetchState]);

  async function applyPatch(patch: Partial<BroadcastStateV1>) {
    if (!canEdit) return;
    setSubmitting(true);
    try {
      const json = await mutateJson<LiveResponse>('/api/admin/broadcast/state', {
        method: 'POST',
        body: JSON.stringify(patch),
      });
      setData(json);
      addToast(t.stateUpdated, 'success');
    } catch (err) {
      const e = err as AdminFetchError;
      const payloadError =
        typeof e.payload === 'object' && e.payload && 'error' in e.payload
          ? String((e.payload as { error: string }).error)
          : null;
      addToast(payloadError || e.message || t.failure, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const state = data?.state;

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-black text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">
                {t.heading}
              </h1>
              <p className="text-sm text-neutral-400 mt-1">
                {format(t.subtitle, { seconds: POLL_MS / 1000 })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {data?.run && (
                <Link
                  href={`/admin/events/${data.run.id}/director`}
                  className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium"
                >
                  {t.director}
                </Link>
              )}
              <button
                type="button"
                onClick={fetchState}
                className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium"
              >
                {t.refresh}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {loading && !data && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-10 text-center text-neutral-400">
              {t.loading}
            </div>
          )}

          {!loading && !data?.run && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-10 text-center text-sm text-neutral-500">
              {t.noRunPrefix} <span className="font-mono">live</span>{' '}
              {t.noRunSuffix}
            </div>
          )}

          {data?.run && (
            <>
              {/* HUD : on-air + segment + match */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                <div
                  className={`rounded-2xl border px-4 py-4 ${
                    state?.on_air
                      ? 'border-red-500/50 bg-red-900/30'
                      : 'border-neutral-800 bg-neutral-900/60'
                  }`}
                >
                  <div className="text-xs uppercase tracking-widest text-neutral-300">
                    {t.onAir}
                  </div>
                  <div className="text-3xl font-extrabold mt-1">
                    {state?.on_air ? t.live : t.off}
                  </div>
                  <div className="text-xs text-neutral-400 mt-1">
                    {t.runLabel}{' '}
                    <span className="font-mono">{data.run.slug}</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 px-4 py-4">
                  <div className="text-xs uppercase tracking-widest text-neutral-300">
                    {t.segmentHeading}
                  </div>
                  {data.currentSegment ? (
                    <>
                      <div className="text-lg font-bold mt-1">
                        #{data.currentSegment.ord} · {data.currentSegment.title}
                      </div>
                      <div className="text-xs text-neutral-400 mt-1">
                        {format(t.segmentType, {
                          type: data.currentSegment.type,
                          min: data.currentSegment.duration_min ?? '?',
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-neutral-500 mt-1 italic">
                      {t.segmentNone}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 px-4 py-4">
                  <div className="text-xs uppercase tracking-widest text-neutral-300">
                    {t.matchHeading}
                  </div>
                  {data.match ? (
                    <>
                      <div className="text-base font-semibold mt-1">
                        {data.match.team1?.name ?? '?'}{' '}
                        <span className="text-neutral-500">
                          {data.match.team1Score ?? '–'} ·{' '}
                          {data.match.team2Score ?? '–'}
                        </span>{' '}
                        {data.match.team2?.name ?? '?'}
                      </div>
                      {data.match.streamUrl ? (
                        <a
                          href={data.match.streamUrl}
                          target="_blank"
                          rel="noopener"
                          className="text-xs text-purple-300 hover:underline mt-1 inline-block"
                        >
                          {t.stream}
                        </a>
                      ) : (
                        <div className="text-xs text-neutral-500 mt-1">
                          {t.noStream}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-sm text-neutral-500 mt-1 italic">
                      {t.segmentNonMatch}
                    </div>
                  )}
                </div>
              </div>

              {/* Casters */}
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 px-4 py-3 mb-6">
                <div className="text-xs uppercase tracking-widest text-neutral-400 mb-2">
                  {t.castersHeading}
                </div>
                {data.casters.length === 0 ? (
                  <div className="text-sm text-neutral-500 italic">
                    {t.castersEmpty}
                  </div>
                ) : (
                  <ul className="text-sm space-y-1">
                    {data.casters.map((c) => (
                      <li key={c.castMemberId}>
                        <span className="font-medium">
                          {c.displayName ?? t.casterNoName}
                        </span>
                        {c.discordUserId && (
                          <span className="ml-2 text-xs text-neutral-500 font-mono">
                            {c.discordUserId}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Controls */}
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 px-4 py-4 mb-6">
                <div className="text-xs uppercase tracking-widest text-neutral-400 mb-3">
                  {t.overlaysHeading}
                </div>

                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <button
                    type="button"
                    disabled={submitting || !canEdit}
                    onClick={() => applyPatch({ on_air: !state?.on_air })}
                    className={`px-4 py-2 rounded-lg text-sm font-bold ${
                      state?.on_air
                        ? 'bg-red-600 hover:bg-red-500'
                        : 'bg-emerald-600 hover:bg-emerald-500'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    {state?.on_air ? t.goOffAir : t.goOnAir}
                  </button>

                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!state?.pip.enabled}
                      disabled={submitting || !canEdit}
                      onChange={(e) =>
                        applyPatch({ pip: { enabled: e.target.checked } })
                      }
                    />
                    {t.pipEnabled}
                  </label>
                </div>

                <div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    {t.lowerThirdLabel}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={lowerDraft}
                      onChange={(e) => setLowerDraft(e.target.value)}
                      disabled={!canEdit}
                      maxLength={500}
                      placeholder={t.lowerThirdPlaceholder}
                      className="flex-1 rounded-md bg-neutral-950 border border-neutral-700 px-2 py-2 text-sm disabled:opacity-50"
                    />
                    <button
                      type="button"
                      disabled={submitting || !canEdit}
                      onClick={() =>
                        applyPatch({
                          lower_third: lowerDraft.trim() || null,
                        })
                      }
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium disabled:opacity-40"
                    >
                      {t.push}
                    </button>
                    <button
                      type="button"
                      disabled={submitting || !canEdit}
                      onClick={() => {
                        setLowerDraft('');
                        applyPatch({ lower_third: null });
                      }}
                      className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium disabled:opacity-40"
                    >
                      {t.clear}
                    </button>
                  </div>
                  {state?.lower_third && (
                    <div className="mt-2 text-xs text-emerald-300">
                      {t.currentOnScreen}{' '}
                      <span className="italic">{state.lower_third}</span>
                    </div>
                  )}
                </div>
              </div>

              {!canEdit && (
                <div className="text-xs text-neutral-500">{t.readOnly}</div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default BroadcastLivePage;
