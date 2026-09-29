// pages/admin/custom-game-presets.tsx
//
// Gestion des presets de partie personnalisée (`custom_game_presets`).
//
// POURQUOI CETTE PAGE : Overwatch — comme tous les titres qu'on opère — n'expose
// aucune API pour créer ou lancer une partie personnalisée. Le seul artefact
// automatisable est le CODE D'IMPORT généré par le jeu. On le stocke ici par
// périmètre (défaut tenant › tournoi › phase) et le bot le pousse à l'hôte du
// match (thread #matchs-live, /match-meta), ce qui supprime l'étape la plus
// longue et la plus faillible du lancement d'un match.
//
// Un seul preset par périmètre (index unique DB) → la résolution est
// déterministe et l'UI n'a pas à arbitrer.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import Modal from '@/components/admin/Modal';
import Tabs, {
  useQueryTab,
  tabButtonId,
  tabPanelId,
  type TabItem,
} from '@/components/admin/Tabs';
import { listGames } from '@/config/games';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';
import { presetScope, type PresetScope } from '@/utils/customGamePresets';
import nsAdminCustomGamePresets from '@/lib/i18n/locales/admin-fr/adminCustomGamePresets';

type Dict = typeof nsAdminCustomGamePresets.fr;

type StaffShape = { id: string; role: string; display_name: string | null };
type StaffProps = { staff: StaffShape };

type PresetRow = {
  id: string;
  tenant_id: string;
  game: string;
  tournament_id: string | null;
  stage_id: string | null;
  name: string;
  import_code: string;
  description: string | null;
  map_pool: unknown;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
};

type TournamentOption = { id: string; name: string; game?: string | null };
type StageOption = { id: string; name: string };

const ID_BASE = 'custom-game-presets';

function scopeLabel(t: Dict, scope: PresetScope): string {
  if (scope === 'stage') return t.scopeStage;
  if (scope === 'tournament') return t.scopeTournament;
  return t.scopeTenant;
}

const SCOPE_TONE: Record<PresetScope, ChipTone> = {
  tenant: 'neutral',
  tournament: 'brand',
  stage: 'warn',
};

const CARD =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4';
const FIELD =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-[var(--t1,#f4edf7)] outline-none focus-visible:border-[var(--or,#b467d1)]';
const FIELD_LABEL = 'mb-1 block text-xs text-[var(--t3,#a39ba6)]';
const FIELD_HINT = 'mt-1 text-[11px] text-[var(--t4,#807984)]';

/** Textarea (une carte par ligne) ⇄ tableau envoyé à l'API. */
function linesToArray(value: string): string[] {
  return value
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function mapPoolToLines(value: unknown): string {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string').join('\n')
    : '';
}

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

function AdminCustomGamePresetsPage(_: StaffProps) {
  const t = useAdminT(nsAdminCustomGamePresets);
  const { adminFetchJson } = useAdminFetch();
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();

  const createMutation = useIdempotentMutation();
  const editMutation = useIdempotentMutation();
  const toggleMutation = useIdempotentMutation();
  const deleteMutation = useIdempotentMutation();

  const games = useMemo(() => listGames(), []);
  const tabs: TabItem[] = games.map((g) => ({ id: g.slug, label: g.label }));
  const [activeGame, setActiveGame] = useQueryTab(tabs, 'game');

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [presets, setPresets] = useState<PresetRow[]>([]);
  const [tournaments, setTournaments] = useState<TournamentOption[]>([]);
  const [stages, setStages] = useState<StageOption[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Modale création / édition
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PresetRow | null>(null);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formMapPool, setFormMapPool] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [formScope, setFormScope] = useState<PresetScope>('tenant');
  const [formTournamentId, setFormTournamentId] = useState('');
  const [formStageId, setFormStageId] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchPresets = useCallback(async () => {
    if (!activeGame) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const json = await adminFetchJson<{ presets: PresetRow[] }>(
        `/api/admin/custom-game-presets?game=${encodeURIComponent(activeGame)}`
      );
      setPresets(json.presets || []);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.errorLoad);
    } finally {
      setLoading(false);
    }
  }, [activeGame, adminFetchJson, t]);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  // Liste des tournois : uniquement pour peupler le sélecteur de périmètre.
  // Échec silencieux — sans elle on peut encore gérer le preset par défaut.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await adminFetchJson<{ tournaments: TournamentOption[] }>(
          '/api/admin/tournaments?limit=100'
        );
        if (!cancelled) setTournaments(json.tournaments || []);
      } catch {
        if (!cancelled) setTournaments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminFetchJson]);

  // Phases du tournoi choisi dans la modale.
  useEffect(() => {
    let cancelled = false;
    if (!formTournamentId) {
      setStages([]);
      return;
    }
    (async () => {
      try {
        const json = await adminFetchJson<{ stages?: StageOption[] }>(
          `/api/admin/tournament/${encodeURIComponent(formTournamentId)}/stages`
        );
        if (!cancelled) setStages(json.stages || []);
      } catch {
        if (!cancelled) setStages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formTournamentId, adminFetchJson]);

  function openCreate() {
    setEditing(null);
    setFormName('');
    setFormCode('');
    setFormDescription('');
    setFormMapPool('');
    setFormEnabled(true);
    setFormScope('tenant');
    setFormTournamentId('');
    setFormStageId('');
    setModalOpen(true);
  }

  function openEdit(p: PresetRow) {
    setEditing(p);
    setFormName(p.name);
    setFormCode(p.import_code);
    setFormDescription(p.description || '');
    setFormMapPool(mapPoolToLines(p.map_pool));
    setFormEnabled(p.enabled);
    setFormScope(presetScope(p));
    setFormTournamentId(p.tournament_id || '');
    setFormStageId(p.stage_id || '');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!formName.trim()) {
      addToast(t.errorNameRequired, 'error');
      return;
    }
    if (!formCode.trim()) {
      addToast(t.errorCodeRequired, 'error');
      return;
    }
    // Le périmètre n'est demandé qu'à la création (immuable ensuite).
    if (!editing && formScope !== 'tenant' && !formTournamentId) {
      addToast(t.errorTournamentRequired, 'error');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await editMutation.mutateJson(
          `/api/admin/custom-game-presets/${encodeURIComponent(editing.id)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              name: formName.trim(),
              import_code: formCode.trim(),
              description: formDescription.trim() || null,
              map_pool: linesToArray(formMapPool),
              enabled: formEnabled,
            }),
          }
        );
        addToast(t.toastUpdated, 'success');
      } else {
        await createMutation.mutateJson('/api/admin/custom-game-presets', {
          method: 'POST',
          body: JSON.stringify({
            game: activeGame,
            tournament_id: formScope === 'tenant' ? null : formTournamentId,
            stage_id: formScope === 'stage' ? formStageId || null : null,
            name: formName.trim(),
            import_code: formCode.trim(),
            description: formDescription.trim() || null,
            map_pool: linesToArray(formMapPool),
            enabled: formEnabled,
          }),
        });
        addToast(t.toastCreated, 'success');
      }
      setModalOpen(false);
      await fetchPresets();
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorSave, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(p: PresetRow) {
    setBusyId(p.id);
    try {
      const res = await toggleMutation.mutateJson<{ preset: PresetRow }>(
        `/api/admin/custom-game-presets/${encodeURIComponent(p.id)}`,
        { method: 'PATCH', body: JSON.stringify({ enabled: !p.enabled }) }
      );
      setPresets((prev) =>
        prev.map((row) => (row.id === p.id ? res.preset : row))
      );
      addToast(!p.enabled ? t.toastEnabled : t.toastDisabled, 'success');
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorSave, 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(p: PresetRow) {
    const ok = await confirm({
      title: t.confirmDeleteTitle,
      subtitle: t.confirmDeleteSubtitle,
      variant: 'danger',
    });
    if (!ok) return;
    setBusyId(p.id);
    try {
      await deleteMutation.mutateJson(
        `/api/admin/custom-game-presets/${encodeURIComponent(p.id)}`,
        { method: 'DELETE' }
      );
      addToast(t.toastDeleted, 'success');
      await fetchPresets();
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorDelete, 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleCopy(p: PresetRow) {
    try {
      await navigator.clipboard.writeText(p.import_code);
      setCopiedId(p.id);
      addToast(t.copied, 'success');
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard indisponible (contexte non sécurisé) — le code reste
      // sélectionnable à la main dans la carte.
    }
  }

  const tournamentName = useCallback(
    (id: string | null) =>
      id ? (tournaments.find((x) => x.id === id)?.name ?? id) : null,
    [tournaments]
  );

  return (
    <>
      <Head>
        <title>{t.headTitle}</title>
      </Head>
      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <p className="mb-2 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
          {t.eyebrow}
        </p>
        <AdminPageHeader
          title={t.pageTitle}
          subtitle={t.subtitle}
          actions={
            <AdminButton variant="ghost" onClick={() => fetchPresets()}>
              {t.refresh}
            </AdminButton>
          }
        />

        <Tabs
          tabs={tabs}
          active={activeGame}
          onChange={setActiveGame}
          ariaLabel={t.tablistLabel}
          idBase={ID_BASE}
          className="mb-6"
        />

        <div
          role="tabpanel"
          id={tabPanelId(ID_BASE, activeGame)}
          aria-labelledby={tabButtonId(ID_BASE, activeGame)}
        >
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <AdminButton variant="primary" onClick={openCreate}>
              {t.addButton}
            </AdminButton>
            <span className="ml-auto" data-numeric>
              <Chip tone="neutral">
                {format(t.presetCount, { count: presets.length })}
              </Chip>
            </span>
          </div>

          <p className="mb-6 text-xs text-[var(--t3,#a39ba6)]">{t.scopeHint}</p>

          {loading && (
            <div className={`${CARD} text-sm text-[var(--t3,#a39ba6)]`}>
              {t.loading}
            </div>
          )}

          {errorMsg && !loading && (
            <div className="rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.4)] bg-[rgba(255,107,107,.08)] p-4 text-sm text-[#ffc2c2]">
              {errorMsg}
            </div>
          )}

          {!loading && !errorMsg && presets.length === 0 && (
            <div className={`${CARD} py-6 text-center`}>
              <p className="text-sm text-[var(--t1,#f4edf7)]">{t.empty}</p>
              <p className="mt-1 text-xs text-[var(--t3,#a39ba6)]">
                {t.emptyHint}
              </p>
            </div>
          )}

          {!loading && !errorMsg && presets.length > 0 && (
            <ul className="space-y-3">
              {presets.map((p) => {
                const scope = presetScope(p);
                const maps = Array.isArray(p.map_pool)
                  ? (p.map_pool as unknown[]).filter(
                      (v): v is string => typeof v === 'string'
                    )
                  : [];
                return (
                  <li
                    key={p.id}
                    className={`${CARD} ${p.enabled ? '' : 'opacity-70'}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Chip tone={SCOPE_TONE[scope]}>
                            {scopeLabel(t, scope)}
                          </Chip>
                          <span className="truncate text-sm font-semibold text-[var(--t1,#f4edf7)]">
                            {p.name}
                          </span>
                          {!p.enabled && (
                            <Chip tone="warn">{t.disabledBadge}</Chip>
                          )}
                        </div>

                        {scope !== 'tenant' && (
                          <p className="mt-1 text-xs text-[var(--t3,#a39ba6)]">
                            {tournamentName(p.tournament_id)}
                            {p.stage_id ? ` · ${t.scopeStage}` : ''}
                          </p>
                        )}

                        <div className="flex items-center gap-2 mt-3">
                          <code className="rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-2 py-1 text-sm tracking-widest text-[var(--t1,#f4edf7)]">
                            {p.import_code}
                          </code>
                          <AdminButton
                            variant="ghost"
                            size="xs"
                            onClick={() => handleCopy(p)}
                          >
                            {copiedId === p.id ? t.copied : t.copyCode}
                          </AdminButton>
                        </div>

                        {p.description && (
                          <p className="mt-2 whitespace-pre-line text-xs text-[var(--t2,#c7bfca)]">
                            {p.description}
                          </p>
                        )}

                        {maps.length > 0 && (
                          <p className="mt-2 text-xs text-[var(--t3,#a39ba6)]">
                            🗺️ {maps.join(' · ')}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-shrink-0 items-center gap-1.5">
                        <AdminButton
                          variant="secondary"
                          size="xs"
                          onClick={() => openEdit(p)}
                          disabled={busyId === p.id}
                        >
                          {t.edit}
                        </AdminButton>
                        <AdminButton
                          variant="ghost"
                          size="xs"
                          onClick={() => handleToggle(p)}
                          disabled={busyId === p.id}
                        >
                          {p.enabled ? t.disable : t.enable}
                        </AdminButton>
                        <AdminButton
                          variant="danger"
                          size="xs"
                          onClick={() => handleDelete(p)}
                          disabled={busyId === p.id}
                        >
                          {t.delete}
                        </AdminButton>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-6 text-xs text-[var(--t4,#807984)]">{t.howTo}</p>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t.modalTitleEdit : t.modalTitleCreate}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <AdminButton
              variant="ghost"
              size="sm"
              onClick={() => setModalOpen(false)}
            >
              {t.cancel}
            </AdminButton>
            <AdminButton
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? t.saving : t.save}
            </AdminButton>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Périmètre — création seulement (immuable ensuite : le changer
              pourrait heurter l'index unique de scope). */}
          {!editing ? (
            <div>
              <label htmlFor="preset-scope" className={FIELD_LABEL}>
                {t.fieldScope}
              </label>
              <select
                id="preset-scope"
                value={formScope}
                onChange={(e) => {
                  const next = e.target.value as PresetScope;
                  setFormScope(next);
                  if (next === 'tenant') {
                    setFormTournamentId('');
                    setFormStageId('');
                  }
                  if (next === 'tournament') setFormStageId('');
                }}
                className={FIELD}
              >
                <option value="tenant">{t.scopeTenant}</option>
                <option value="tournament">{t.scopeTournament}</option>
                <option value="stage">{t.scopeStage}</option>
              </select>
            </div>
          ) : (
            <p className="text-xs text-[var(--t3,#a39ba6)]">
              {scopeLabel(t, presetScope(editing))} — {t.scopeLocked}
            </p>
          )}

          {!editing && formScope !== 'tenant' && (
            <div>
              <label htmlFor="preset-tournament" className={FIELD_LABEL}>
                {t.fieldTournament}
              </label>
              <select
                id="preset-tournament"
                value={formTournamentId}
                onChange={(e) => {
                  setFormTournamentId(e.target.value);
                  setFormStageId('');
                }}
                className={FIELD}
              >
                <option value="">{t.selectTournamentPlaceholder}</option>
                {tournaments.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!editing && formScope === 'stage' && (
            <div>
              <label htmlFor="preset-stage" className={FIELD_LABEL}>
                {t.fieldStage}
              </label>
              <select
                id="preset-stage"
                value={formStageId}
                onChange={(e) => setFormStageId(e.target.value)}
                disabled={!formTournamentId}
                className={`${FIELD} disabled:opacity-50`}
              >
                <option value="">{t.selectStageAll}</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="preset-name" className={FIELD_LABEL}>
              {t.fieldName}
            </label>
            <input
              id="preset-name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder={t.fieldNamePlaceholder}
              className={FIELD}
            />
          </div>

          <div>
            <label htmlFor="preset-code" className={FIELD_LABEL}>
              {t.fieldImportCode}
            </label>
            <input
              id="preset-code"
              value={formCode}
              onChange={(e) => setFormCode(e.target.value)}
              placeholder={t.fieldImportCodePlaceholder}
              className={`${FIELD} uppercase tracking-widest`}
            />
            <p className={FIELD_HINT}>{t.fieldImportCodeHint}</p>
          </div>

          <div>
            <label htmlFor="preset-description" className={FIELD_LABEL}>
              {t.fieldDescription}
            </label>
            <textarea
              id="preset-description"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder={t.fieldDescriptionPlaceholder}
              rows={3}
              className={FIELD}
            />
          </div>

          <div>
            <label htmlFor="preset-maps" className={FIELD_LABEL}>
              {t.fieldMapPool}
            </label>
            <textarea
              id="preset-maps"
              value={formMapPool}
              onChange={(e) => setFormMapPool(e.target.value)}
              placeholder={t.fieldMapPoolPlaceholder}
              rows={4}
              className={FIELD}
            />
            <p className={FIELD_HINT}>{t.fieldMapPoolHint}</p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={formEnabled}
              onChange={(e) => setFormEnabled(e.target.checked)}
              className="rounded"
            />
            {t.enabledLabel}
          </label>
        </div>
      </Modal>

      {dialog}
    </>
  );
}

export default AdminCustomGamePresetsPage;
