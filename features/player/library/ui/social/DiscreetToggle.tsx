// features/player/library/ui/social/DiscreetToggle.tsx — le mode discret de la
// Grande salle de lecture (lots 5 et 8 de docs/PLAN-womens-library.md). On y
// ENTRE DISCRÈTE : personne ne nous voit, on voit celles qui ont choisi
// d'être visibles. Se montrer est un choix explicite, réversible à tout
// moment.
//
// Rien hors de la salle de lecture (le composant ne rend rien). Deux boutons
// radio natifs (flèches du clavier comprises), la phrase qui explique l'état
// courant juste dessous, annoncée quand il change. Présentationnel : le
// parent branche `onChange` sur `useLibraryRoomChannel().setVisible`.

import { useId } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsSocial from '@/lib/i18n/locales/fr/playerLibrarySocial';
import type { LibraryRoomKind } from '../../socialResponses';

export type DiscreetToggleProps = {
  roomKind: LibraryRoomKind;
  visible: boolean;
  /** `false` (réservé côté API) : rester discrète est la seule option. */
  canBeVisible?: boolean;
  onChange: (visible: boolean) => void;
};

const OPTION =
  'relative inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[var(--r-ctrl,4px)] px-4 text-sm font-semibold transition-colors has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--or,#b467d1)]';

export default function DiscreetToggle({
  roomKind,
  visible,
  canBeVisible = true,
  onChange,
}: DiscreetToggleProps) {
  const t = useT(nsSocial);
  const ids = useId();
  if (roomKind !== 'reading_room') return null;

  const options = [
    { value: false, label: t.discreet.stay },
    { value: true, label: t.discreet.show },
  ];

  return (
    <fieldset
      aria-describedby={`${ids}-explain`}
      data-library-discreet={visible ? 'visible' : 'discreet'}
      className="flex flex-col gap-2"
    >
      <legend className="mb-1 text-sm font-semibold text-[var(--t2,#c7bfca)]">
        {t.discreet.legend}
      </legend>
      <div className="inline-flex w-fit flex-wrap gap-1 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-1">
        {options.map((option) => {
          const checked = visible === option.value;
          return (
            <label
              key={String(option.value)}
              className={`${OPTION} ${
                checked
                  ? 'bg-[rgba(180,103,209,.18)] text-[var(--t1,#f4edf7)]'
                  : 'text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]'
              }`}
            >
              <input
                type="radio"
                name={`${ids}-presence`}
                checked={checked}
                disabled={option.value && !canBeVisible}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
      <p
        id={`${ids}-explain`}
        aria-live="polite"
        className="text-sm text-[var(--t2,#c7bfca)]"
      >
        {visible ? t.discreet.explainVisible : t.discreet.explainDiscreet}
      </p>
      {!canBeVisible && (
        <p className="text-xs text-[var(--t3,#a39ba6)]">
          {t.discreet.cannotShow}
        </p>
      )}
    </fieldset>
  );
}
