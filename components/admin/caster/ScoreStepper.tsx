// components/admin/caster/ScoreStepper.tsx
//
// Champ score avec steppers −/+ (réglage rapide à l'antenne, sans clavier) —
// extrait de MatchSceneEditor (lot 1), réutilisé par l'éditeur results.

/** Clamp d'un score de série : entier entre 0 et 9 (comme le stepper desktop). */
export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(9, Math.max(0, Math.trunc(value)));
}

export default function ScoreStepper({
  value,
  label,
  minusLabel,
  plusLabel,
  onChange,
}: {
  value: number;
  label: string;
  minusLabel: string;
  plusLabel: string;
  onChange: (next: number) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-neutral-700 bg-neutral-950 overflow-hidden">
      <button
        type="button"
        tabIndex={-1}
        aria-label={minusLabel}
        onClick={() => onChange(clampScore(value - 1))}
        className="px-3 py-2 text-neutral-300 hover:bg-neutral-800 text-lg leading-none"
      >
        −
      </button>
      <input
        type="number"
        min={0}
        max={9}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(clampScore(Number(e.target.value)))}
        className="w-14 bg-transparent text-center text-xl font-extrabold text-white py-1.5 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={plusLabel}
        onClick={() => onChange(clampScore(value + 1))}
        className="px-3 py-2 text-neutral-300 hover:bg-neutral-800 text-lg leading-none"
      >
        +
      </button>
    </div>
  );
}
