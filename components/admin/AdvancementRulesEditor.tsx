// components/admin/AdvancementRulesEditor.tsx
// Formulaire structuré pour éditer les règles d'avancement (advancement_rules)
// d'un stage, à la place d'un JSON brut.

import { useState, useEffect } from 'react';
import { useAdminT } from '@/lib/i18n/useAdminT';

type Dict = ReturnType<typeof useAdminT<'adminAdvancementRulesEditor'>>;

export type AdvancementRules = {
  advance_top?: number;
  /** Top N par groupe (uniquement pertinent pour les stages 'group') */
  advance_per_group?: number;
  target_stage_id: string;
  seed_by?: 'standings' | 'manual' | 'none';
};

type Props = {
  /** Valeur actuelle des rules (peut être undefined si pas encore configuré) */
  value: AdvancementRules | null | undefined;
  /** Liste des phases disponibles comme cible (exclure le stage courant) */
  availableStages: { id: string; name: string; stage_type: string | null }[];
  /** Callback quand l'utilisateur modifie les rules */
  onChange: (rules: AdvancementRules | null) => void;
  /** Désactiver les inputs (pendant un save, par ex.) */
  disabled?: boolean;
  /**
   * Type du stage source. Si 'group', le mode 'per_group' devient disponible
   * (top N par poule).
   */
  sourceStageType?: string | null;
};

function getSeedByOptions(
  t: Dict
): { value: AdvancementRules['seed_by']; label: string }[] {
  return [
    { value: 'standings', label: t.seedByStandings },
    { value: 'manual', label: t.seedByManual },
    { value: 'none', label: t.seedByNone },
  ];
}

type Mode = 'top_n' | 'per_group';

export default function AdvancementRulesEditor({
  value,
  availableStages,
  onChange,
  disabled = false,
  sourceStageType,
}: Props) {
  const t = useAdminT('adminAdvancementRulesEditor');
  const seedByOptions = getSeedByOptions(t);
  const isGroup = sourceStageType === 'group';

  const initialMode: Mode =
    value?.advance_per_group !== undefined ? 'per_group' : 'top_n';

  const [enabled, setEnabled] = useState(!!value);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [advanceTop, setAdvanceTop] = useState(value?.advance_top ?? 4);
  const [advancePerGroup, setAdvancePerGroup] = useState(
    value?.advance_per_group ?? 2
  );
  const [targetStageId, setTargetStageId] = useState(
    value?.target_stage_id ?? ''
  );
  const [seedBy, setSeedBy] = useState<AdvancementRules['seed_by']>(
    value?.seed_by ?? 'standings'
  );

  // Sync when parent value changes (e.g., after a fresh fetch)
  useEffect(() => {
    if (value) {
      setEnabled(true);
      const nextMode: Mode =
        value.advance_per_group !== undefined ? 'per_group' : 'top_n';
      setMode(nextMode);
      if (value.advance_top !== undefined) setAdvanceTop(value.advance_top);
      if (value.advance_per_group !== undefined)
        setAdvancePerGroup(value.advance_per_group);
      setTargetStageId(value.target_stage_id);
      setSeedBy(value.seed_by ?? 'standings');
    } else {
      setEnabled(false);
    }
  }, [value]);

  function emitChange(
    nextEnabled: boolean,
    nextMode: Mode,
    nextTop: number,
    nextPerGroup: number,
    nextTarget: string,
    nextSeedBy: AdvancementRules['seed_by']
  ) {
    if (!nextEnabled || !nextTarget) {
      onChange(null);
      return;
    }

    if (nextMode === 'per_group') {
      if (nextPerGroup < 1) {
        onChange(null);
        return;
      }
      onChange({
        advance_per_group: nextPerGroup,
        target_stage_id: nextTarget,
        seed_by: nextSeedBy,
      });
      return;
    }

    if (nextTop < 1) {
      onChange(null);
      return;
    }
    onChange({
      advance_top: nextTop,
      target_stage_id: nextTarget,
      seed_by: nextSeedBy,
    });
  }

  function handleToggle(nextEnabled: boolean) {
    setEnabled(nextEnabled);
    emitChange(
      nextEnabled,
      mode,
      advanceTop,
      advancePerGroup,
      targetStageId,
      seedBy
    );
  }

  function handleModeChange(nextMode: Mode) {
    setMode(nextMode);
    emitChange(
      enabled,
      nextMode,
      advanceTop,
      advancePerGroup,
      targetStageId,
      seedBy
    );
  }

  function handleTopChange(v: number) {
    setAdvanceTop(v);
    emitChange(enabled, mode, v, advancePerGroup, targetStageId, seedBy);
  }

  function handlePerGroupChange(v: number) {
    setAdvancePerGroup(v);
    emitChange(enabled, mode, advanceTop, v, targetStageId, seedBy);
  }

  function handleTargetChange(v: string) {
    setTargetStageId(v);
    emitChange(enabled, mode, advanceTop, advancePerGroup, v, seedBy);
  }

  function handleSeedByChange(v: AdvancementRules['seed_by']) {
    setSeedBy(v);
    emitChange(enabled, mode, advanceTop, advancePerGroup, targetStageId, v);
  }

  return (
    <div className="space-y-4">
      {/* Toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => handleToggle(e.target.checked)}
          disabled={disabled}
          className="rounded border-neutral-600 bg-neutral-700 text-blue-500 focus:ring-blue-500"
        />
        <span className="text-sm font-medium text-neutral-200">
          {t.enableLabel}
        </span>
      </label>

      {enabled && (
        <div className="pl-1 space-y-4 border-l-2 border-blue-600/30 ml-2 pl-4">
          {/* Target stage */}
          <div>
            <label className="block text-sm mb-1 text-neutral-300">
              {t.targetStageLabel}
            </label>
            {availableStages.length === 0 ? (
              <p className="text-xs text-amber-400">{t.noOtherStage}</p>
            ) : (
              <select
                className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={targetStageId}
                onChange={(e) => handleTargetChange(e.target.value)}
                disabled={disabled}
              >
                <option value="">{t.selectPlaceholder}</option>
                {availableStages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.stage_type ? ` (${s.stage_type})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Mode (uniquement utile pour les stages 'group') */}
          {isGroup && (
            <div>
              <label className="block text-sm mb-1 text-neutral-300">
                {t.modeLabel}
              </label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
                  <input
                    type="radio"
                    name="advance_mode"
                    value="top_n"
                    checked={mode === 'top_n'}
                    onChange={() => handleModeChange('top_n')}
                    disabled={disabled}
                    className="border-neutral-600 bg-neutral-700 text-blue-500 focus:ring-blue-500"
                  />
                  {t.modeTopGlobal}
                </label>
                <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
                  <input
                    type="radio"
                    name="advance_mode"
                    value="per_group"
                    checked={mode === 'per_group'}
                    onChange={() => handleModeChange('per_group')}
                    disabled={disabled}
                    className="border-neutral-600 bg-neutral-700 text-blue-500 focus:ring-blue-500"
                  />
                  {t.modePerGroup}
                </label>
              </div>
            </div>
          )}

          {/* Advance top N (par groupe ou global) */}
          {mode === 'per_group' ? (
            <div>
              <label className="block text-sm mb-1 text-neutral-300">
                {t.perGroupCountLabel}
              </label>
              <input
                type="number"
                min={1}
                max={32}
                className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={advancePerGroup}
                onChange={(e) =>
                  handlePerGroupChange(Math.max(1, Number(e.target.value) || 1))
                }
                disabled={disabled}
              />
              <p className="text-xs text-neutral-500 mt-1">
                {t.perGroupHintPre}
                <strong>{t.perGroupHintStrong}</strong>
                {t.perGroupHintPost}
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-sm mb-1 text-neutral-300">
                {t.topCountLabel}
              </label>
              <input
                type="number"
                min={1}
                max={128}
                className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={advanceTop}
                onChange={(e) =>
                  handleTopChange(Math.max(1, Number(e.target.value) || 1))
                }
                disabled={disabled}
              />
              <p className="text-xs text-neutral-500 mt-1">{t.topHint}</p>
            </div>
          )}

          {/* Seed mode */}
          <div>
            <label className="block text-sm mb-1 text-neutral-300">
              {t.seedModeLabel}
            </label>
            <div className="flex flex-col gap-2">
              {seedByOptions.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="seed_by"
                    value={opt.value}
                    checked={seedBy === opt.value}
                    onChange={() => handleSeedByChange(opt.value)}
                    disabled={disabled}
                    className="border-neutral-600 bg-neutral-700 text-blue-500 focus:ring-blue-500"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
