// features/player/library/ui/shop/VariantPicker.tsx — le choix de la teinte
// d'une famille de meubles (lot 11). Un groupe de boutons radio (pastilles de
// couleur) : un seul arrêt de tabulation, flèches pour changer de teinte,
// Début / Fin pour la première ou la dernière (motif ARIA « radio group »).

import { type KeyboardEvent, useRef } from 'react';
import { swatchOf } from './shopModel';

export type VariantOption = {
  key: string;
  variant: string | null;
  /** Nom de la teinte, lu par les lecteurs d'écran et en info-bulle. */
  label: string;
};

export default function VariantPicker({
  label,
  options,
  value,
  onChange,
}: {
  /** Nom accessible du groupe (« Teintes : Canapé »). */
  label: string;
  options: readonly VariantOption[];
  value: string;
  onChange: (key: string) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = Math.max(
    0,
    options.findIndex((o) => o.key === value)
  );

  const move = (to: number) => {
    const n = options.length;
    const i = ((to % n) + n) % n;
    onChange(options[i].key);
    refs.current[i]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const keys: Record<string, number> = {
      ArrowRight: current + 1,
      ArrowDown: current + 1,
      ArrowLeft: current - 1,
      ArrowUp: current - 1,
      Home: 0,
      End: options.length - 1,
    };
    if (!(e.key in keys)) return;
    e.preventDefault();
    move(keys[e.key]);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap justify-center gap-1.5"
    >
      {options.map((o, i) => {
        const checked = i === current;
        return (
          <button
            key={o.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={o.label}
            title={o.label}
            tabIndex={checked ? 0 : -1}
            data-variant={o.variant ?? ''}
            onClick={() => onChange(o.key)}
            onKeyDown={onKeyDown}
            className={`h-6 w-6 rounded-full border-2 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--or,#b467d1)] ${
              checked
                ? 'border-[var(--t1,#f4edf7)]'
                : 'border-[var(--line2,rgba(194,196,201,.2))]'
            }`}
            style={{ backgroundColor: swatchOf(o.variant) }}
          />
        );
      })}
    </div>
  );
}
