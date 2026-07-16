// pages/admin/stages/create.tsx

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminT } from '@/lib/i18n/useAdminT';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};
type StageType =
  | 'group'
  | 'bracket'
  | 'swiss'
  | 'round_robin'
  | 'showmatch'
  | 'ffa'
  | 'other';

type FfaTiebreak = 'total_points' | 'best_placement' | 'most_firsts';

type FfaPointsRow = { rank: string; points: string };

const FFA_DEFAULT_POINTS_ROWS: FfaPointsRow[] = [
  { rank: '1', points: '100' },
  { rank: '2', points: '80' },
  { rank: '3', points: '60' },
  { rank: '4', points: '50' },
  { rank: '5', points: '40' },
  { rank: '6', points: '30' },
  { rank: '7', points: '20' },
  { rank: '8', points: '10' },
];

type Tournament = {
  id: string;
  name: string;
  slug: string | null;
};

type TournamentsApiResponse = {
  tournaments: Tournament[];
  total: number | null;
};

type CreateStageBody = {
  name: string;
  slug?: string | null;
  stage_type?: StageType | null;
  order_index?: number | null;
  is_active?: boolean;
  is_public?: boolean;
  start_date?: string | null;
  end_date?: string | null;
  settings?: any | null;
};

type CreateStageResponse = {
  stage: {
    id: string;
    tournament_id: string;
  };
};

export const getServerSideProps = withStaffPage('admin');

function AdminStageCreatePage({ staff }: StaffProps) {
  const t = useAdminT('adminStagesCreate');
  const tf = useAdminT('adminFfa');
  const router = useRouter();
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loadingTournaments, setLoadingTournaments] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  const [form, setForm] = useState<{
    tournamentId: string;
    name: string;
    slug: string;
    stage_type: StageType | '';
    order_index: string;
    is_active: boolean;
    is_public: boolean;
    start_date: string;
    end_date: string;
    settingsRaw: string;
  }>({
    tournamentId: '',
    name: '',
    slug: '',
    stage_type: '',
    order_index: '',
    is_active: true,
    is_public: true,
    start_date: '',
    end_date: '',
    settingsRaw: '{\n  \n}',
  });

  // FFA settings (only used when stage_type === 'ffa')
  const [ffaLobbySize, setFfaLobbySize] = useState('8');
  const [ffaTiebreak, setFfaTiebreak] = useState<FfaTiebreak>('best_placement');
  const [ffaPointsRows, setFfaPointsRows] = useState<FfaPointsRow[]>(
    FFA_DEFAULT_POINTS_ROWS
  );

  function updateFfaRow(index: number, key: keyof FfaPointsRow, value: string) {
    setFfaPointsRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [key]: value } : r))
    );
  }

  function addFfaRow() {
    setFfaPointsRows((prev) => {
      const nextRank = String(prev.length + 1);
      return [...prev, { rank: nextRank, points: '0' }];
    });
  }

  function removeFfaRow(index: number) {
    setFfaPointsRows((prev) => prev.filter((_, i) => i !== index));
  }

  function buildFfaSettings(): {
    lobby_size: number;
    points_table: Record<string, number>;
    tiebreak: FfaTiebreak;
  } {
    const points_table: Record<string, number> = {};
    for (const row of ffaPointsRows) {
      const rank = row.rank.trim();
      if (!rank) continue;
      const pts = Number(row.points);
      if (!Number.isFinite(pts)) continue;
      points_table[rank] = pts;
    }
    const lobbySize = Number(ffaLobbySize);
    return {
      lobby_size: Number.isInteger(lobbySize) && lobbySize >= 2 ? lobbySize : 8,
      points_table,
      tiebreak: ffaTiebreak,
    };
  }

  function updateField<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const fetchTournaments = useCallback(async () => {
    setLoadingTournaments(true);
    setErrorMsg(null);
    try {
      const json = await adminFetchJson<TournamentsApiResponse>(
        '/api/admin/tournaments?limit=200'
      );
      setTournaments(json.tournaments || []);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errLoadTournaments);
    } finally {
      setLoadingTournaments(false);
    }
  }, [adminFetchJson, t]);

  useEffect(() => {
    fetchTournaments();
  }, [fetchTournaments]);

  function parseSettings(): any | null {
    const raw = form.settingsRaw.trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new Error(t.errSettingsInvalid);
    }
  }

  function toIsoOrNull(v: string): string | null {
    if (!v) return null;
    try {
      return new Date(v).toISOString();
    } catch {
      return null;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!form.tournamentId) {
      setErrorMsg(t.errSelectTournament);
      return;
    }
    setDateError(null);

    if (!form.name.trim()) {
      setErrorMsg(t.errNameRequired);
      return;
    }

    if (form.start_date && form.end_date) {
      if (new Date(form.start_date) >= new Date(form.end_date)) {
        setDateError(t.errDateOrder);
        setErrorMsg(t.errDateOrder);
        return;
      }
    }

    let settings: any | null = null;
    try {
      settings = parseSettings();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errSettingsGeneric);
      return;
    }

    // Pour une phase FFA, on injecte les réglages structurés dans settings.
    if (form.stage_type === 'ffa') {
      const ffa = buildFfaSettings();
      if (Object.keys(ffa.points_table).length === 0) {
        setErrorMsg(tf.errPointsTableEmpty);
        return;
      }
      settings = { ...(settings || {}), ...ffa };
    }

    setSubmitting(true);

    const payload: CreateStageBody = {
      name: form.name.trim(),
      slug: form.slug.trim() || null,
      stage_type: (form.stage_type as StageType) || null,
      order_index: form.order_index ? Number(form.order_index) : null,
      is_active: form.is_active,
      is_public: form.is_public,
      start_date: toIsoOrNull(form.start_date),
      end_date: toIsoOrNull(form.end_date),
      settings,
    };

    try {
      // On s'aligne sur le pattern utilisé côté API:
      // POST /api/admin/tournament/[id]/stages
      const json = await mutateJson<CreateStageResponse>(
        `/api/admin/tournament/${form.tournamentId}/stages`,
        {
          method: 'POST',
          body: JSON.stringify({ stage: payload }),
        }
      );
      const created = json.stage;

      addToast(t.toastCreated, 'success');
      if (created?.id) {
        router.push(`/admin/stages/${created.id}`);
      } else {
        router.push(`/admin/tournament/${form.tournamentId}`);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errCreate);
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <button
              type="button"
              onClick={() => window.history.back()}
              className="mb-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
            >
              {t.back}
            </button>
            <h1 className="text-3xl font-bold">{t.heading}</h1>
            <p className="text-neutral-400 text-sm mt-1">{t.subtitle}</p>
          </div>
        </div>

        <div className="max-w-3xl bg-neutral-800 border border-neutral-700 rounded-xl p-6 pt-20">
          {errorMsg && (
            <div className="mb-4 rounded bg-red-900/60 border border-red-600 px-4 py-3 text-sm">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Tournoi */}
            <section className="space-y-4">
              <h2 className="font-semibold text-lg">
                {t.parentTournamentTitle}
              </h2>
              <div>
                <label className="block text-sm mb-1 text-neutral-300">
                  {t.tournamentLabel} <span className="text-red-400">*</span>
                </label>
                <select
                  className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.tournamentId}
                  onChange={(e) => updateField('tournamentId', e.target.value)}
                  disabled={loadingTournaments || submitting}
                >
                  <option value="">
                    {loadingTournaments
                      ? t.loadingTournaments
                      : t.selectTournament}
                  </option>
                  {tournaments.map((tm) => (
                    <option key={tm.id} value={tm.id}>
                      {tm.name} {tm.slug ? `(${tm.slug})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-neutral-500 mt-1">
                  {t.tournamentHelp}
                </p>
              </div>
            </section>

            {/* Infos générales */}
            <section className="space-y-4">
              <h2 className="font-semibold text-lg">{t.generalInfoTitle}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1 text-neutral-300">
                    {t.nameLabel} <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder={t.namePlaceholder}
                  />
                </div>

                <div>
                  <label className="block text-sm mb-1 text-neutral-300">
                    {t.slugLabel}
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.slug}
                    onChange={(e) => updateField('slug', e.target.value)}
                    placeholder={t.slugPlaceholder}
                  />
                  <p className="text-xs text-neutral-500 mt-1">{t.slugHelp}</p>
                </div>

                <div>
                  <label className="block text-sm mb-1 text-neutral-300">
                    {t.stageTypeLabel}
                  </label>
                  <select
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.stage_type}
                    onChange={(e) =>
                      updateField(
                        'stage_type',
                        e.target.value as StageType | ''
                      )
                    }
                  >
                    <option value="">{t.stageTypeNone}</option>
                    <option value="group">{t.stageTypeGroup}</option>
                    <option value="bracket">{t.stageTypeBracket}</option>
                    <option value="swiss">{t.stageTypeSwiss}</option>
                    <option value="round_robin">{t.stageTypeRoundRobin}</option>
                    <option value="showmatch">{t.stageTypeShowmatch}</option>
                    <option value="ffa">{tf.stageTypeFfa}</option>
                    <option value="other">{t.stageTypeOther}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm mb-1 text-neutral-300">
                    {t.orderLabel}
                  </label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.order_index}
                    onChange={(e) => updateField('order_index', e.target.value)}
                    placeholder={t.orderPlaceholder}
                  />
                  <p className="text-xs text-neutral-500 mt-1">{t.orderHelp}</p>
                </div>
              </div>
            </section>

            {/* Visibilité & dates */}
            <section className="space-y-4">
              <h2 className="font-semibold text-lg">{t.visibilityTitle}</h2>

              <div className="flex flex-col gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-neutral-200">
                  <input
                    type="checkbox"
                    className="rounded border-neutral-500 bg-neutral-700"
                    checked={form.is_active}
                    onChange={(e) => updateField('is_active', e.target.checked)}
                  />
                  <span>{t.activeLabel}</span>
                </label>

                <label className="inline-flex items-center gap-2 text-sm text-neutral-200">
                  <input
                    type="checkbox"
                    className="rounded border-neutral-500 bg-neutral-700"
                    checked={form.is_public}
                    onChange={(e) => updateField('is_public', e.target.checked)}
                  />
                  <span>{t.publicLabel}</span>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1 text-neutral-300">
                    {t.startLabel}
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.start_date}
                    onChange={(e) => updateField('start_date', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1 text-neutral-300">
                    {t.endLabel}
                  </label>
                  <input
                    type="datetime-local"
                    className={`w-full px-3 py-2 rounded bg-neutral-700 border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      dateError ? 'border-red-500' : 'border-neutral-600'
                    }`}
                    value={form.end_date}
                    onChange={(e) => {
                      updateField('end_date', e.target.value);
                      setDateError(null);
                    }}
                  />
                  {dateError && (
                    <p className="text-xs text-red-400 mt-1">{dateError}</p>
                  )}
                </div>
              </div>
            </section>

            {/* FFA settings (structured) */}
            {form.stage_type === 'ffa' && (
              <section className="space-y-4 rounded-xl border border-indigo-700/40 bg-indigo-900/10 p-4">
                <div>
                  <h2 className="font-semibold text-lg">{tf.settingsTitle}</h2>
                  <p className="text-xs text-neutral-400">{tf.settingsHelp}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm mb-1 text-neutral-300">
                      {tf.lobbySizeLabel}
                    </label>
                    <input
                      type="number"
                      min={2}
                      max={64}
                      className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={ffaLobbySize}
                      onChange={(e) => setFfaLobbySize(e.target.value)}
                    />
                    <p className="text-xs text-neutral-500 mt-1">
                      {tf.lobbySizeHelp}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm mb-1 text-neutral-300">
                      {tf.tiebreakLabel}
                    </label>
                    <select
                      className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      value={ffaTiebreak}
                      onChange={(e) =>
                        setFfaTiebreak(e.target.value as FfaTiebreak)
                      }
                    >
                      <option value="best_placement">
                        {tf.tiebreakBestPlacement}
                      </option>
                      <option value="total_points">
                        {tf.tiebreakTotalPoints}
                      </option>
                      <option value="most_firsts">
                        {tf.tiebreakMostFirsts}
                      </option>
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-neutral-300">
                      {tf.pointsTableLabel}
                    </label>
                    <button
                      type="button"
                      onClick={addFfaRow}
                      className="text-xs px-2 py-1 rounded border border-neutral-600 text-neutral-200 hover:bg-neutral-700"
                    >
                      {tf.addRow}
                    </button>
                  </div>
                  <p className="text-xs text-neutral-500 mb-2">
                    {tf.pointsTableHelp}
                  </p>
                  <div className="space-y-2">
                    <div className="grid grid-cols-[80px_1fr_40px] gap-2 text-xs text-neutral-500 px-1">
                      <span>{tf.placement}</span>
                      <span>{tf.points}</span>
                      <span />
                    </div>
                    {ffaPointsRows.map((row, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-[80px_1fr_40px] gap-2 items-center"
                      >
                        <input
                          type="number"
                          min={1}
                          className="w-full px-2 py-1.5 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          value={row.rank}
                          onChange={(e) =>
                            updateFfaRow(i, 'rank', e.target.value)
                          }
                        />
                        <input
                          type="number"
                          className="w-full px-2 py-1.5 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          value={row.points}
                          onChange={(e) =>
                            updateFfaRow(i, 'points', e.target.value)
                          }
                        />
                        <button
                          type="button"
                          onClick={() => removeFfaRow(i)}
                          className="text-neutral-400 hover:text-red-400 text-sm"
                          aria-label={tf.removeRow}
                          title={tf.removeRow}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Settings JSON */}
            <section className="space-y-3">
              <h2 className="font-semibold text-lg">{t.settingsTitle}</h2>
              <p className="text-xs text-neutral-400">{t.settingsHelp}</p>
              <textarea
                className="w-full min-h-[180px] font-mono text-xs bg-neutral-900 border border-neutral-700 rounded p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.settingsRaw}
                onChange={(e) => updateField('settingsRaw', e.target.value)}
                spellCheck={false}
              />
            </section>

            {/* Actions */}
            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                className="px-4 py-2 rounded border border-neutral-600 text-neutral-200 hover:bg-neutral-800 text-sm"
                onClick={() => window.history.back()}
                disabled={submitting}
              >
                {t.cancel}
              </button>

              <button
                type="submit"
                disabled={submitting}
                className={`px-5 py-2 rounded font-semibold text-sm ${
                  submitting
                    ? 'bg-blue-800 cursor-wait'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {submitting ? t.creating : t.submit}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export default AdminStageCreatePage;
