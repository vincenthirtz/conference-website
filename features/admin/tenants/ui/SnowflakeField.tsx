// features/admin/tenants/ui/SnowflakeField.tsx — un champ d'identifiant
// Discord (« snowflake ») de la configuration d'un serveur : libellé, choix
// dans l'inventaire du serveur quand il est chargé, saisie libre, « Effacer »
// pour revenir au repli, aide et erreur. Présentationnel.
//
// Sorti de pages/admin/tenants/[id]/discord-config/[guildId].tsx (fichier
// gelé, règle A7) lors de sa passe « Le Ruban ».

import AdminButton from '../../_shared/ui/AdminButton';

// Couleur de bordure À PART : deux classes `border-[…]` sur un même élément
// laisseraient l'ordre de génération de Tailwind choisir.
const FIELD =
  'rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border text-sm text-[var(--t1,#f4edf7)] focus:outline-none focus:ring-2 focus:ring-[var(--or,#b467d1)]';
const LINE = 'border-[var(--line2,rgba(194,196,201,.2))]';
const LINE_ERR = 'border-[rgba(255,107,107,.6)]';

export type SnowflakeOption = { id: string; label: string };

export default function SnowflakeField({
  id,
  label,
  value,
  onChange,
  options,
  showOptions,
  noneLabel,
  unknownLabel,
  placeholder,
  help,
  error,
  onClear,
  clearLabel,
  clearTitle,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SnowflakeOption[];
  /** L'inventaire du serveur est chargé : proposer la liste. */
  showOptions: boolean;
  noneLabel: string;
  /** Libellé d'une valeur saisie absente de l'inventaire. */
  unknownLabel: string;
  placeholder: string;
  help?: string | null;
  error?: string | null;
  onClear: () => void;
  clearLabel: string;
  clearTitle: string;
}) {
  const unknownValue = value !== '' && !options.some((o) => o.id === value);
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-sm font-medium text-[var(--t2,#c7bfca)]"
      >
        {label}
      </label>
      {showOptions && options.length > 0 && (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`mb-2 w-full px-3 py-2 ${FIELD} ${LINE}`}
        >
          <option value="">{noneLabel}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
          {unknownValue && <option value={value}>{unknownLabel}</option>}
        </select>
      )}
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`flex-1 px-3 py-2 font-mono ${FIELD} ${error ? LINE_ERR : LINE}`}
        />
        {value && (
          <AdminButton size="sm" onClick={onClear} title={clearTitle}>
            {clearLabel}
          </AdminButton>
        )}
      </div>
      {help && <p className="mt-1 text-xs text-[var(--t4,#807984)]">{help}</p>}
      {error && (
        <p className="mt-1 text-xs text-[var(--err,#ff6b6b)]">{error}</p>
      )}
    </div>
  );
}
