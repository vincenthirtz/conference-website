// components/admin/AdvancementRulesEditor.tsx
// Formulaire structuré pour éditer les règles d'avancement (advancement_rules)
// d'un stage, à la place d'un JSON brut.

import { useState, useEffect } from 'react';

export type AdvancementRules = {
  advance_top: number;
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
};

const SEED_BY_OPTIONS: { value: AdvancementRules['seed_by']; label: string }[] = [
  { value: 'standings', label: 'Classement (automatique)' },
  { value: 'manual', label: 'Manuel' },
  { value: 'none', label: 'Sans seed' },
];

export default function AdvancementRulesEditor({
  value,
  availableStages,
  onChange,
  disabled = false,
}: Props) {
  const [enabled, setEnabled] = useState(!!value);
  const [advanceTop, setAdvanceTop] = useState(value?.advance_top ?? 4);
  const [targetStageId, setTargetStageId] = useState(value?.target_stage_id ?? '');
  const [seedBy, setSeedBy] = useState<AdvancementRules['seed_by']>(value?.seed_by ?? 'standings');

  // Sync when parent value changes (e.g., after a fresh fetch)
  useEffect(() => {
    if (value) {
      setEnabled(true);
      setAdvanceTop(value.advance_top);
      setTargetStageId(value.target_stage_id);
      setSeedBy(value.seed_by ?? 'standings');
    } else {
      setEnabled(false);
    }
  }, [value]);

  function emitChange(
    nextEnabled: boolean,
    nextTop: number,
    nextTarget: string,
    nextSeedBy: AdvancementRules['seed_by']
  ) {
    if (!nextEnabled) {
      onChange(null);
      return;
    }
    if (!nextTarget || nextTop < 1) {
      // Partial state — don't emit until valid
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
    emitChange(nextEnabled, advanceTop, targetStageId, seedBy);
  }

  function handleTopChange(v: number) {
    setAdvanceTop(v);
    emitChange(enabled, v, targetStageId, seedBy);
  }

  function handleTargetChange(v: string) {
    setTargetStageId(v);
    emitChange(enabled, advanceTop, v, seedBy);
  }

  function handleSeedByChange(v: AdvancementRules['seed_by']) {
    setSeedBy(v);
    emitChange(enabled, advanceTop, targetStageId, v);
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
          Configurer l&apos;avancement automatique
        </span>
      </label>

      {enabled && (
        <div className="pl-1 space-y-4 border-l-2 border-blue-600/30 ml-2 pl-4">
          {/* Target stage */}
          <div>
            <label className="block text-sm mb-1 text-neutral-300">
              Phase cible
            </label>
            {availableStages.length === 0 ? (
              <p className="text-xs text-amber-400">
                Aucune autre phase disponible. Créez d&apos;abord la phase suivante dans le tournoi.
              </p>
            ) : (
              <select
                className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={targetStageId}
                onChange={(e) => handleTargetChange(e.target.value)}
                disabled={disabled}
              >
                <option value="">— Sélectionner —</option>
                {availableStages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.stage_type ? ` (${s.stage_type})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Advance top N */}
          <div>
            <label className="block text-sm mb-1 text-neutral-300">
              Nombre d&apos;equipes qui avancent
            </label>
            <input
              type="number"
              min={1}
              max={128}
              className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={advanceTop}
              onChange={(e) => handleTopChange(Math.max(1, Number(e.target.value) || 1))}
              disabled={disabled}
            />
            <p className="text-xs text-neutral-500 mt-1">
              Les N premieres equipes du classement seront avancees vers la phase cible.
            </p>
          </div>

          {/* Seed mode */}
          <div>
            <label className="block text-sm mb-1 text-neutral-300">
              Mode de seeding
            </label>
            <div className="flex flex-col gap-2">
              {SEED_BY_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
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
