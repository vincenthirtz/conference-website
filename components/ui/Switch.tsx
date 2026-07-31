// components/ui/Switch.tsx
//
// Interrupteur canonique (piste + pastille), repris du look `/admin`.
//
// Il existait cinq implémentations quasi identiques et légèrement divergentes
// (h-6/h-7, w-11/w-12, emerald-500/emerald-600/purple-500, gray-600/neutral-700
// /white-15, `translate-x` vs `left-*`) : TwitchCommandsPanel, broadcast/live,
// ScrimsHubCard, manage-team ×2, NotificationPrefsGrid. Chacune redécouvrait
// aussi son `role="switch"` + `aria-checked` + anneau de focus — c'est-à-dire
// l'endroit exact où l'accessibilité se perd quand on copie-colle.
//
// Référence retenue : la variante admin (emerald-600 actif, neutral-700 au
// repos), puisque le kit doit rapprocher l'espace joueur de `/admin`.

type SwitchProps = {
  checked: boolean;
  onChange: () => void;
  /** Libellé accessible — obligatoire : un interrupteur nu n'est pas lisible. */
  label: string;
  disabled?: boolean;
  /** 'sm' = h-6 w-11 (défaut, densité admin) ; 'md' = h-7 w-12. */
  size?: 'sm' | 'md';
  /**
   * 'emerald' = activation courante (défaut).
   * 'amber' = action sensible (ex. « agir en tant que »), à réserver aux
   * bascules qui ouvrent un pouvoir d'écriture.
   */
  tone?: 'emerald' | 'amber';
  className?: string;
};

const TRACK = {
  sm: 'h-6 w-11',
  md: 'h-7 w-12',
} as const;

const KNOB = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
} as const;

const KNOB_ON = {
  sm: 'translate-x-6',
  md: 'translate-x-6',
} as const;

const ON_BG = {
  emerald: 'bg-emerald-600',
  amber: 'bg-amber-500',
} as const;

const RING = {
  emerald: 'focus-visible:ring-emerald-400/60',
  amber: 'focus-visible:ring-amber-400/60',
} as const;

export default function Switch({
  checked,
  onChange,
  label,
  disabled = false,
  size = 'sm',
  tone = 'emerald',
  className = '',
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex flex-shrink-0 items-center rounded-full transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${TRACK[size]} ${RING[tone]} ${
        checked ? ON_BG[tone] : 'bg-neutral-700'
      } ${className}`}
    >
      <span
        className={`inline-block transform rounded-full bg-white transition-transform motion-reduce:transition-none ${KNOB[size]} ${
          checked ? KNOB_ON[size] : 'translate-x-1'
        }`}
      />
    </button>
  );
}
