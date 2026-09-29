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
    <div className="inline-flex items-center rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] overflow-hidden">
      <button
        type="button"
        tabIndex={-1}
        aria-label={minusLabel}
        onClick={() => onChange(clampScore(value - 1))}
        className="px-3 py-2 text-[var(--t2,#c7bfca)] hover:bg-[var(--s3,#2f2732)] hover:text-[var(--t1,#f4edf7)] text-lg leading-none"
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
        className="w-14 bg-transparent text-center font-[family-name:var(--fd)] text-[26px] font-extrabold [font-stretch:75%] text-[var(--t1,#f4edf7)] py-1 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={plusLabel}
        onClick={() => onChange(clampScore(value + 1))}
        className="px-3 py-2 text-[var(--t2,#c7bfca)] hover:bg-[var(--s3,#2f2732)] hover:text-[var(--t1,#f4edf7)] text-lg leading-none"
      >
        +
      </button>
    </div>
  );
}
