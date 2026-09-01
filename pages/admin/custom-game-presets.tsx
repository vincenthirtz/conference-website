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

const SCOPE_BADGE: Record<PresetScope, string> = {
  tenant: 'border-white/20 bg-white/5 text-gray-200',
  tournament: 'border-purple-400/40 bg-purple-500/10 text-purple-200',
  stage: 'border-amber-400/40 bg-amber-500/10 text-amber-200',
};

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

export const getServerSideProps = withStaffPage({ permission: 'manage_tournaments' });

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
      <div className="min-h-screen bg-neutral-950 text-white pt-24">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-amber-200/80">
                {t.eyebrow}
              </p>
              <h1 className="text-2xl font-semibold">{t.pageTitle}</h1>
              <p className="text-sm text-gray-400 mt-1">{t.subtitle}</p>
            </div>
            <button
              onClick={() => fetchPresets()}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10 flex-shrink-0"
            >
              {t.refresh}
            </button>
          </div>

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
              <button
                onClick={openCreate}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm transition-colors"
              >
                {t.addButton}
              </button>
              <span className="ml-auto px-2 py-0.5 rounded-full text-xs border border-amber-400/40 bg-amber-500/10 text-amber-200">
                {format(t.presetCount, { count: presets.length })}
              </span>
            </div>

            <p className="text-xs text-gray-400 mb-6">{t.scopeHint}</p>

            {loading && (
              <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                {t.loading}
              </div>
            )}

            {errorMsg && !loading && (
              <div className="p-4 rounded-lg bg-red-900/60 border border-red-500/40 text-red-100">
                {errorMsg}
              </div>
            )}

            {!loading && !errorMsg && presets.length === 0 && (
              <div className="p-6 rounded-lg bg-white/5 border border-white/10 text-center">
                <p className="text-sm text-gray-200">{t.empty}</p>
                <p className="text-xs text-gray-400 mt-1">{t.emptyHint}</p>
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
                      className={`rounded-xl border p-4 ${
                        p.enabled
                          ? 'bg-white/5 border-white/10'
                          : 'bg-white/[0.02] border-white/5 opacity-70'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] border ${SCOPE_BADGE[scope]}`}
                            >
                              {scopeLabel(t, scope)}
                            </span>
                            <span className="text-sm font-semibold truncate">
                              {p.name}
                            </span>
                            {!p.enabled && (
                              <span className="px-2 py-0.5 rounded-full text-[11px] border border-red-400/30 bg-red-500/10 text-red-200">
                                {t.disabledBadge}
                              </span>
                            )}
                          </div>

                          {scope !== 'tenant' && (
                            <p className="text-xs text-gray-400 mt-1">
                              {tournamentName(p.tournament_id)}
                              {p.stage_id ? ` · ${t.scopeStage}` : ''}
                            </p>
                          )}

                          <div className="flex items-center gap-2 mt-3">
                            <code className="px-2 py-1 rounded-lg bg-black/40 border border-white/10 text-amber-200 text-sm tracking-widest">
                              {p.import_code}
                            </code>
                            <button
                              onClick={() => handleCopy(p)}
                              className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs hover:bg-white/10"
                            >
                              {copiedId === p.id ? t.copied : t.copyCode}
                            </button>
                          </div>

                          {p.description && (
                            <p className="text-xs text-gray-300 mt-2 whitespace-pre-line">
                              {p.description}
                            </p>
                          )}

                          {maps.length > 0 && (
                            <p className="text-xs text-gray-400 mt-2">
                              🗺️ {maps.join(' · ')}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => openEdit(p)}
                            disabled={busyId === p.id}
                            className="px-2 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-200 text-xs transition-colors disabled:opacity-50"
                          >
                            {t.edit}
                          </button>
                          <button
                            onClick={() => handleToggle(p)}
                            disabled={busyId === p.id}
                            className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs transition-colors disabled:opacity-50"
                          >
                            {p.enabled ? t.disable : t.enable}
                          </button>
                          <button
                            onClick={() => handleDelete(p)}
                            disabled={busyId === p.id}
                            className="px-2 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-200 text-xs transition-colors disabled:opacity-50"
                          >
                            {t.delete}
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="text-xs text-gray-500 mt-6">{t.howTo}</p>
          </div>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t.modalTitleEdit : t.modalTitleCreate}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10"
            >
              {t.cancel}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 text-white text-sm font-medium"
            >
              {saving ? t.saving : t.save}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Périmètre — création seulement (immuable ensuite : le changer
              pourrait heurter l'index unique de scope). */}
          {!editing ? (
            <div>
              <label
                htmlFor="preset-scope"
                className="block text-xs text-gray-400 mb-1"
              >
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
                className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-white/10 text-sm"
              >
                <option value="tenant">{t.scopeTenant}</option>
                <option value="tournament">{t.scopeTournament}</option>
                <option value="stage">{t.scopeStage}</option>
              </select>
            </div>
          ) : (
            <p className="text-xs text-gray-400">
              {scopeLabel(t, presetScope(editing))} — {t.scopeLocked}
            </p>
          )}

          {!editing && formScope !== 'tenant' && (
            <div>
              <label
                htmlFor="preset-tournament"
                className="block text-xs text-gray-400 mb-1"
              >
                {t.fieldTournament}
              </label>
              <select
                id="preset-tournament"
                value={formTournamentId}
                onChange={(e) => {
                  setFormTournamentId(e.target.value);
                  setFormStageId('');
                }}
                className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-white/10 text-sm"
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
              <label
                htmlFor="preset-stage"
                className="block text-xs text-gray-400 mb-1"
              >
                {t.fieldStage}
              </label>
              <select
                id="preset-stage"
                value={formStageId}
                onChange={(e) => setFormStageId(e.target.value)}
                disabled={!formTournamentId}
                className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-white/10 text-sm disabled:opacity-50"
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
            <label
              htmlFor="preset-name"
              className="block text-xs text-gray-400 mb-1"
            >
              {t.fieldName}
            </label>
            <input
              id="preset-name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder={t.fieldNamePlaceholder}
              className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-white/10 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="preset-code"
              className="block text-xs text-gray-400 mb-1"
            >
              {t.fieldImportCode}
            </label>
            <input
              id="preset-code"
              value={formCode}
              onChange={(e) => setFormCode(e.target.value)}
              placeholder={t.fieldImportCodePlaceholder}
              className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-white/10 text-sm tracking-widest uppercase"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              {t.fieldImportCodeHint}
            </p>
          </div>

          <div>
            <label
              htmlFor="preset-description"
              className="block text-xs text-gray-400 mb-1"
            >
              {t.fieldDescription}
            </label>
            <textarea
              id="preset-description"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder={t.fieldDescriptionPlaceholder}
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-white/10 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="preset-maps"
              className="block text-xs text-gray-400 mb-1"
            >
              {t.fieldMapPool}
            </label>
            <textarea
              id="preset-maps"
              value={formMapPool}
              onChange={(e) => setFormMapPool(e.target.value)}
              placeholder={t.fieldMapPoolPlaceholder}
              rows={4}
              className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-white/10 text-sm"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              {t.fieldMapPoolHint}
            </p>
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
