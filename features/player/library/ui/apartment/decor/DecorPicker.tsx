// features/player/library/ui/apartment/decor/DecorPicker.tsx — le choix du
// décor de l'appartement (lot 12 de docs/PLAN-womens-library.md) : sol, murs,
// fenêtres et porte, chacun en groupe de boutons radio avec vignettes, des
// ambiances (un décor complet d'un geste), et un APERÇU de la pièce qui suit
// chaque choix avant l'enregistrement.
//
// Contrôlé : le choix vit dans le formulaire des réglages (ApartmentSettings),
// qui l'enregistre par le `PATCH apartment` habituel. Le décor est gratuit.
// Les emplacements sont des onglets (flèches, Début, Fin) : sur mobile, une
// seule grille à la fois. L'aperçu charge le moteur à la demande
// (DecorPreview) ; les vignettes n'en ont pas besoin (sprites en fond CSS).

import { useId, useState } from 'react';
import { format, useT } from '@/lib/i18n/useT';
import nsPlayerLibrary from '@/lib/i18n/locales/fr/playerLibrary';
import {
  LIBRARY_DECOR_THEME_KEYS,
  type LibraryDecorChoice,
} from '@/config/library/decor';
import type { LibraryManifest } from '../../../engine/assets';
import LibraryTabs from '../LibraryTabs';
import DecorPreview from './DecorPreview';
import DecorThumb from './DecorThumb';
import {
  DECOR_SLOTS,
  type DecorSlot,
  sameChoice,
  slotOptions,
  themeChoice,
  themeOf,
  withSlot,
} from './decorPickerModel';

const BTN =
  'rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[var(--or,#b467d1)] disabled:opacity-50';

export default function DecorPicker({
  value,
  saved,
  onChange,
  width,
  depth,
  manifest,
  disabled = false,
}: {
  value: LibraryDecorChoice;
  /** Le décor enregistré (pour « revenir » et signaler un choix en attente). */
  saved: LibraryDecorChoice;
  onChange: (next: LibraryDecorChoice) => void;
  width: number;
  depth: number;
  manifest: LibraryManifest | null;
  disabled?: boolean;
}) {
  const t = useT(nsPlayerLibrary);
  const d = t.decor;
  const ids = useId();
  const [slot, setSlot] = useState<DecorSlot>('floor');
  const names = {
    floor: d.floors,
    finish: d.finishes,
    window: d.windows,
    door: d.doors,
  } as Record<DecorSlot, Record<string, string>>;
  const nameOf = (s: DecorSlot, v: string) => names[s][v] ?? v;
  const changed = !sameChoice(value, saved);
  const theme = themeOf(value);
  const themes = d.themes as Record<string, string>;

  const tabs = DECOR_SLOTS.map((s) => ({
    id: s,
    label: d.slots[s],
    panel: (
      <fieldset disabled={disabled} className="flex flex-col gap-2">
        <legend className="sr-only">{d.slots[s]}</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2">
          {slotOptions(s).map((v) => {
            const checked = value[s] === v;
            return (
              <label
                key={v}
                data-testid={`library-decor-${s}-${v}`}
                className={`flex cursor-pointer flex-col items-center gap-1 rounded-[var(--r-ctrl,4px)] border p-1.5 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--or,#b467d1)] ${
                  checked
                    ? 'border-[var(--or,#b467d1)] bg-[rgba(180,103,209,.12)]'
                    : 'border-[var(--line,rgba(194,196,201,.12))]'
                }`}
              >
                <input
                  type="radio"
                  name={`${ids}-${s}`}
                  value={v}
                  checked={checked}
                  onChange={() => onChange(withSlot(value, s, v))}
                  className="sr-only"
                />
                <DecorThumb
                  slot={s}
                  value={v}
                  choice={value}
                  manifest={manifest}
                />
                <span className="text-xs leading-tight text-[var(--t2,#c7bfca)]">
                  {nameOf(s, v)}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    ),
  }));

  return (
    <section
      aria-labelledby={`${ids}-title`}
      data-testid="library-decor-picker"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1">
        <h3
          id={`${ids}-title`}
          className="text-base font-bold text-[var(--t1,#f4edf7)]"
        >
          {d.title}
        </h3>
        <p className="text-xs text-[var(--t3,#a39ba6)]">{d.intro}</p>
      </div>

      <DecorPreview
        width={width}
        depth={depth}
        choice={value}
        manifest={manifest}
        label={format(d.previewLabel, {
          floor: nameOf('floor', value.floor),
          finish: nameOf('finish', value.finish),
          window: nameOf('window', value.window),
          door: nameOf('door', value.door),
        })}
      />

      <div className="flex flex-wrap items-center gap-2">
        <p
          role="status"
          aria-live="polite"
          className="text-xs text-[var(--t2,#c7bfca)]"
        >
          {changed ? d.changed : ''}
        </p>
        {changed && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(saved)}
            className={`${BTN} border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t1,#f4edf7)]`}
          >
            {d.reset}
          </button>
        )}
      </div>

      <div
        role="group"
        aria-label={d.themesLabel}
        className="flex flex-wrap items-center gap-2"
      >
        <span
          aria-hidden
          className="text-xs font-semibold text-[var(--t2,#c7bfca)]"
        >
          {d.themesLabel}
        </span>
        {LIBRARY_DECOR_THEME_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            disabled={disabled}
            aria-pressed={theme === k}
            data-testid={`library-decor-theme-${k}`}
            onClick={() => onChange(themeChoice(k))}
            className={`${BTN} ${
              theme === k
                ? 'border-[var(--or,#b467d1)] bg-[rgba(180,103,209,.18)] text-[var(--t1,#f4edf7)]'
                : 'border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t2,#c7bfca)]'
            }`}
          >
            {themes[k] ?? k}
          </button>
        ))}
      </div>

      <LibraryTabs
        tabs={tabs}
        active={slot}
        onChange={(id) => setSlot(id as DecorSlot)}
        label={d.slotsLabel}
      />
    </section>
  );
}
