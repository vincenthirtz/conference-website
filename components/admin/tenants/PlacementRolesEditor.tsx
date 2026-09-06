// components/admin/tenants/PlacementRolesEditor.tsx
//
// Rôles Discord attribués selon le classement final — lot 8 de
// docs/PLAN-plateforme-tournois.md (ticket T3).
//
// Une règle = une PLAGE de rangs et un rôle. Les plages se chevauchent
// volontairement : la gagnante mérite « Vainqueure » ET « Podium » ET
// « Participante », et l'éditeur ne cherche donc pas à les rendre exclusives.
//
// Le champ « jusqu'à » laissé vide signifie « et tout le reste » — c'est ce qui
// permet de configurer « Participante » sans connaître le nombre d'inscrites.
//
// Présentation seule : l'écran parent porte l'enregistrement, comme pour tous
// les autres champs de la configuration Discord.

import { useMemo } from 'react';
import {
  describePlacementRule,
  type PlacementRule,
} from '@/utils/discord/placementRoles';

export type PlacementRolesLabels = {
  title: string;
  help: string;
  empty: string;
  addRule: string;
  removeRule: string;
  fromLabel: string;
  toLabel: string;
  toPlaceholder: string;
  roleLabel: string;
  rolePlaceholder: string;
  nameLabel: string;
  namePlaceholder: string;
  invalidRole: string;
};

type Props = {
  rules: PlacementRule[];
  onChange: (rules: PlacementRule[]) => void;
  labels: PlacementRolesLabels;
  disabled?: boolean;
};

const SNOWFLAKE_RE = /^\d{15,25}$/;

export default function PlacementRolesEditor({
  rules,
  onChange,
  labels,
  disabled,
}: Props) {
  const invalid = useMemo(
    () =>
      new Set(
        rules
          .map((r, i) => (r.roleId && !SNOWFLAKE_RE.test(r.roleId) ? i : -1))
          .filter((i) => i >= 0)
      ),
    [rules]
  );

  function update(index: number, patch: Partial<PlacementRule>) {
    onChange(rules.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-white">{labels.title}</h3>
        <p className="mt-1 max-w-prose text-xs text-neutral-400">
          {labels.help}
        </p>
      </div>

      {rules.length === 0 ? (
        <p className="text-sm text-neutral-500">{labels.empty}</p>
      ) : (
        <ul className="space-y-2">
          {rules.map((rule, i) => (
            <li
              key={i}
              className="rounded-lg border border-neutral-700 bg-neutral-900/40 p-3"
            >
              <div className="grid gap-2 sm:grid-cols-[5rem_5rem_1fr_auto]">
                <label className="block space-y-1">
                  <span className="text-[0.65rem] uppercase tracking-[0.1em] text-neutral-500">
                    {labels.fromLabel}
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={rule.from}
                    disabled={disabled}
                    onChange={(e) =>
                      update(i, { from: Number(e.target.value) || 1 })
                    }
                    className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[0.65rem] uppercase tracking-[0.1em] text-neutral-500">
                    {labels.toLabel}
                  </span>
                  <input
                    type="number"
                    min={rule.from}
                    value={rule.to ?? ''}
                    placeholder={labels.toPlaceholder}
                    disabled={disabled}
                    onChange={(e) =>
                      update(i, {
                        to: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[0.65rem] uppercase tracking-[0.1em] text-neutral-500">
                    {labels.roleLabel}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={rule.roleId}
                    placeholder={labels.rolePlaceholder}
                    disabled={disabled}
                    aria-invalid={invalid.has(i)}
                    onChange={(e) =>
                      update(i, { roleId: e.target.value.trim() })
                    }
                    className={`w-full rounded-lg border bg-neutral-800 px-2 py-1.5 font-mono text-sm ${
                      invalid.has(i)
                        ? 'border-red-500/60'
                        : 'border-neutral-600'
                    }`}
                  />
                </label>

                <button
                  type="button"
                  onClick={() => onChange(rules.filter((_, j) => j !== i))}
                  disabled={disabled}
                  className="self-end rounded-lg border border-neutral-600 px-3 py-1.5 text-xs text-neutral-300 disabled:opacity-50"
                >
                  {labels.removeRule}
                </button>
              </div>

              <label className="mt-2 block space-y-1">
                <span className="text-[0.65rem] uppercase tracking-[0.1em] text-neutral-500">
                  {labels.nameLabel}
                </span>
                <input
                  type="text"
                  value={rule.label ?? ''}
                  placeholder={labels.namePlaceholder}
                  disabled={disabled}
                  onChange={(e) => update(i, { label: e.target.value })}
                  className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm"
                />
              </label>

              <p className="mt-2 text-xs text-neutral-500">
                {describePlacementRule(rule)}
              </p>
              {invalid.has(i) && (
                <p className="mt-1 text-xs text-red-300">{labels.invalidRole}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() =>
          onChange([...rules, { from: 1, to: 1, roleId: '', label: '' }])
        }
        disabled={disabled}
        className="rounded-lg border border-neutral-600 px-3 py-2 text-sm text-neutral-200 disabled:opacity-50"
      >
        {labels.addRule}
      </button>
    </div>
  );
}
