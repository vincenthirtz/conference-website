// pages/admin/stages/create.tsx

import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { useTournamentOptions } from '@/features/admin/_shared/tournamentOptions';
import { tournamentUrls } from '@/features/admin/tournaments/client';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminStagesCreate from '@/lib/i18n/locales/admin-fr/adminStagesCreate';
import nsAdminFfa from '@/lib/i18n/locales/admin-fr/adminFfa';
import EntityHeader from '@/features/admin/_shared/ui/EntityHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { FicheLayout, FicheSection } from '@/features/admin/_shared/ui/Fiche';

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

type CreateStageBody = {
  name: string;
  slug?: string | null;
  stage_type?: StageType | null;
  order_index?: number | null;
  is_active?: boolean;
  is_public?: boolean;
  start_date?: string | null;
  end_date?: string | null;
  // JSON libre saisi par l'admin : `unknown`, pas `any`. La différence
  // compte ici — `any` laissait lire `settings.champ` sans vérification sur
  // une valeur qui vient d'un `JSON.parse` de texte tapé à la main.
  settings?: unknown;
};

type CreateStageResponse = {
  stage: {
    id: string;
    tournament_id: string;
  };
};

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

function AdminStageCreatePage(_props: StaffProps) {
  const t = useAdminT(nsAdminStagesCreate);
  const tf = useAdminT(nsAdminFfa);
  const router = useRouter();
  const { addToast } = useToast();
  const { mutateJson } = useIdempotentMutation();

  const tournamentsQuery = useTournamentOptions();
  const tournaments = tournamentsQuery.data?.tournaments || [];
  const loadingTournaments = tournamentsQuery.isPending;
  const [actionError, setErrorMsg] = useState<string | null>(null);
  const errorMsg =
    actionError ??
    (tournamentsQuery.error
      ? (tournamentsQuery.error.message ?? t.errLoadTournaments)
      : null);
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

  function parseSettings(): unknown {
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

    let settings: unknown = null;
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
        tournamentUrls.stages(form.tournamentId),
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

  const formId = 'stage-create-form';
  const inputClass =
    'w-full px-3 py-2 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] text-sm text-[var(--t1,#f4edf7)] focus:outline-none focus:ring-2 focus:ring-[var(--or,#b467d1)]';
  const labelClass = 'block text-sm mb-1 text-[var(--t2,#c7bfca)]';
  const helpClass = 'text-xs text-[var(--t4,#807984)] mt-1';
  const checkboxLabelClass =
    'inline-flex items-center gap-2 text-sm text-[var(--t1,#f4edf7)]';
  const checkboxClass =
    'rounded border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)]';

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="mb-3 inline-flex items-center gap-2 text-sm text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]"
        >
          {t.back}
        </button>

        <EntityHeader
          crest={
            form.name.trim()
              ? form.name.trim().slice(0, 3).toUpperCase()
              : undefined
          }
          title={form.name.trim() || t.heading}
          meta={t.subtitle}
          actions={
            <>
              <AdminButton
                onClick={() => window.history.back()}
                disabled={submitting}
              >
                {t.cancel}
              </AdminButton>
              <AdminButton
                variant="primary"
                type="submit"
                form={formId}
                disabled={submitting}
              >
                {submitting ? t.creating : t.submit}
              </AdminButton>
            </>
          }
        />

        {errorMsg && (
          <div className="mb-6 rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[var(--t1,#f4edf7)]">
            {errorMsg}
          </div>
        )}

        <form id={formId} onSubmit={handleSubmit}>
          <FicheLayout
            main={
              <>
                {/* Infos générales */}
                <FicheSection title={t.generalInfoTitle}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>
                        {t.nameLabel}{' '}
                        <span className="text-[var(--err,#ff6b6b)]">*</span>
                      </label>
                      <input
                        type="text"
                        className={inputClass}
                        value={form.name}
                        onChange={(e) => updateField('name', e.target.value)}
                        placeholder={t.namePlaceholder}
                      />
                    </div>

                    <div>
                      <label className={labelClass}>{t.slugLabel}</label>
                      <input
                        type="text"
                        className={inputClass}
                        value={form.slug}
                        onChange={(e) => updateField('slug', e.target.value)}
                        placeholder={t.slugPlaceholder}
                      />
                      <p className={helpClass}>{t.slugHelp}</p>
                    </div>

                    <div>
                      <label className={labelClass}>{t.stageTypeLabel}</label>
                      <select
                        className={inputClass}
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
                        <option value="round_robin">
                          {t.stageTypeRoundRobin}
                        </option>
                        <option value="showmatch">
                          {t.stageTypeShowmatch}
                        </option>
                        <option value="ffa">{tf.stageTypeFfa}</option>
                        <option value="other">{t.stageTypeOther}</option>
                      </select>
                    </div>

                    <div>
                      <label className={labelClass}>{t.orderLabel}</label>
                      <input
                        type="number"
                        className={inputClass}
                        value={form.order_index}
                        onChange={(e) =>
                          updateField('order_index', e.target.value)
                        }
                        placeholder={t.orderPlaceholder}
                      />
                      <p className={helpClass}>{t.orderHelp}</p>
                    </div>
                  </div>
                </FicheSection>

                {/* FFA settings (structured) */}
                {form.stage_type === 'ffa' && (
                  <FicheSection title={tf.settingsTitle}>
                    <p className="-mt-3 mb-4 text-xs text-[var(--t3,#a39ba6)]">
                      {tf.settingsHelp}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>
                          {tf.lobbySizeLabel}
                        </label>
                        <input
                          type="number"
                          min={2}
                          max={64}
                          className={inputClass}
                          value={ffaLobbySize}
                          onChange={(e) => setFfaLobbySize(e.target.value)}
                        />
                        <p className={helpClass}>{tf.lobbySizeHelp}</p>
                      </div>

                      <div>
                        <label className={labelClass}>{tf.tiebreakLabel}</label>
                        <select
                          className={inputClass}
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

                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between">
                        <label className="text-sm text-[var(--t2,#c7bfca)]">
                          {tf.pointsTableLabel}
                        </label>
                        <AdminButton size="xs" onClick={addFfaRow}>
                          {tf.addRow}
                        </AdminButton>
                      </div>
                      <p className="mb-2 text-xs text-[var(--t4,#807984)]">
                        {tf.pointsTableHelp}
                      </p>
                      <div className="space-y-2">
                        <div className="grid grid-cols-[80px_1fr_40px] gap-2 px-1 text-xs text-[var(--t4,#807984)]">
                          <span>{tf.placement}</span>
                          <span>{tf.points}</span>
                          <span />
                        </div>
                        {ffaPointsRows.map((row, i) => (
                          <div
                            key={i}
                            className="grid grid-cols-[80px_1fr_40px] items-center gap-2"
                          >
                            <input
                              type="number"
                              min={1}
                              className={inputClass}
                              value={row.rank}
                              onChange={(e) =>
                                updateFfaRow(i, 'rank', e.target.value)
                              }
                            />
                            <input
                              type="number"
                              className={inputClass}
                              value={row.points}
                              onChange={(e) =>
                                updateFfaRow(i, 'points', e.target.value)
                              }
                            />
                            <button
                              type="button"
                              onClick={() => removeFfaRow(i)}
                              className="text-sm text-[var(--t3,#a39ba6)] hover:text-[var(--err,#ff6b6b)]"
                              aria-label={tf.removeRow}
                              title={tf.removeRow}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </FicheSection>
                )}

                {/* Settings JSON */}
                <FicheSection title={t.settingsTitle}>
                  <p className="-mt-3 mb-3 text-xs text-[var(--t3,#a39ba6)]">
                    {t.settingsHelp}
                  </p>
                  <textarea
                    className="min-h-[180px] w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-3 font-mono text-xs text-[var(--t1,#f4edf7)] focus:outline-none focus:ring-2 focus:ring-[var(--or,#b467d1)]"
                    value={form.settingsRaw}
                    onChange={(e) => updateField('settingsRaw', e.target.value)}
                    spellCheck={false}
                  />
                </FicheSection>
              </>
            }
            aside={
              <>
                {/* Tournoi */}
                <FicheSection eyebrow title={t.parentTournamentTitle}>
                  <label className={labelClass}>
                    {t.tournamentLabel}{' '}
                    <span className="text-[var(--err,#ff6b6b)]">*</span>
                  </label>
                  <select
                    className={inputClass}
                    value={form.tournamentId}
                    onChange={(e) =>
                      updateField('tournamentId', e.target.value)
                    }
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
                  <p className={helpClass}>{t.tournamentHelp}</p>
                </FicheSection>

                {/* Visibilité & dates */}
                <FicheSection eyebrow title={t.visibilityTitle}>
                  <div className="flex flex-col gap-3">
                    <label className={checkboxLabelClass}>
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        checked={form.is_active}
                        onChange={(e) =>
                          updateField('is_active', e.target.checked)
                        }
                      />
                      <span>{t.activeLabel}</span>
                    </label>

                    <label className={checkboxLabelClass}>
                      <input
                        type="checkbox"
                        className={checkboxClass}
                        checked={form.is_public}
                        onChange={(e) =>
                          updateField('is_public', e.target.checked)
                        }
                      />
                      <span>{t.publicLabel}</span>
                    </label>
                  </div>

                  <div className="mt-4 flex flex-col gap-4">
                    <div>
                      <label className={labelClass}>{t.startLabel}</label>
                      <input
                        type="datetime-local"
                        className={inputClass}
                        value={form.start_date}
                        onChange={(e) =>
                          updateField('start_date', e.target.value)
                        }
                      />
                    </div>
                    <div>
                      <label className={labelClass}>{t.endLabel}</label>
                      <input
                        type="datetime-local"
                        className={`${inputClass} ${
                          dateError ? 'border-[var(--err,#ff6b6b)]' : ''
                        }`}
                        value={form.end_date}
                        onChange={(e) => {
                          updateField('end_date', e.target.value);
                          setDateError(null);
                        }}
                      />
                      {dateError && (
                        <p className="mt-1 text-xs text-[var(--err,#ff6b6b)]">
                          {dateError}
                        </p>
                      )}
                    </div>
                  </div>
                </FicheSection>
              </>
            }
          />
        </form>
      </div>
    </>
  );
}

export default withAdminQuery(AdminStageCreatePage);
