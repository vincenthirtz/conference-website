// features/player/library/ui/avatar/LookFields.tsx — les choix de l'éditeur
// d'avatar (lot 13) : un groupe de boutons radio par calque. Carnation et
// couleurs en PASTILLES (le nom de la couleur est lu, et s'affiche au survol),
// coiffure et tenue en étiquettes. Clavier natif des radios : Tab entre les
// groupes, flèches dans un groupe.

import { useId } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsPlayerLibrary from '@/lib/i18n/locales/fr/playerLibrary';
import {
  LIBRARY_LOOK_HAIR_COLORS,
  LIBRARY_LOOK_HAIRS,
  LIBRARY_LOOK_OUTFIT_COLORS,
  LIBRARY_LOOK_OUTFITS,
  LIBRARY_LOOK_SKINS,
  type LibraryAvatarLook,
  type LibraryLookColor,
  type LibraryLookField,
} from '@/config/library/avatarLook';

type Names = Readonly<Record<string, string>>;

const nameOf = (names: Names, id: string) => names[id] ?? id.replace(/_/g, ' ');

const LEGEND = 'mb-2 text-sm font-semibold text-[var(--t2,#c7bfca)]';
const RING =
  'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--or,#b467d1)] has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-[var(--s1,#120b16)]';

function Swatches({
  field,
  legend,
  colors,
  names,
  value,
  onPick,
}: {
  field: LibraryLookField;
  legend: string;
  colors: readonly LibraryLookColor[];
  names: Names;
  value: string;
  onPick: (field: LibraryLookField, value: string) => void;
}) {
  const group = useId();
  const current = nameOf(names, value);
  return (
    <fieldset className="flex flex-col" data-testid={`library-look-${field}`}>
      <legend className={LEGEND}>
        {legend}
        {/* Le nom choisi, pour l'œil ; la radio cochée le dit déjà. */}
        <span aria-hidden className="ml-2 font-normal text-[var(--t3,#a39ba6)]">
          {current}
        </span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {colors.map((c) => {
          const checked = c.id === value;
          const name = nameOf(names, c.id);
          return (
            <label
              key={c.id}
              title={name}
              className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-2 ${RING} ${
                checked
                  ? 'border-[var(--or,#b467d1)]'
                  : 'border-[var(--line2,rgba(194,196,201,.2))]'
              }`}
            >
              <input
                type="radio"
                name={group}
                value={c.id}
                checked={checked}
                onChange={() => onPick(field, c.id)}
                className="sr-only"
              />
              <span
                aria-hidden
                className="block h-6 w-6 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,.25)]"
                style={{ background: `rgb(${c.rgb.join(' ')})` }}
              />
              <span className="sr-only">{name}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Chips({
  field,
  legend,
  ids,
  names,
  value,
  onPick,
}: {
  field: LibraryLookField;
  legend: string;
  ids: readonly string[];
  names: Names;
  value: string;
  onPick: (field: LibraryLookField, value: string) => void;
}) {
  const group = useId();
  return (
    <fieldset className="flex flex-col" data-testid={`library-look-${field}`}>
      <legend className={LEGEND}>{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {ids.map((id) => {
          const checked = id === value;
          return (
            <label
              key={id}
              className={`cursor-pointer rounded-[var(--r-ctrl,4px)] border px-3 py-1.5 text-sm ${RING} ${
                checked
                  ? 'border-[var(--or,#b467d1)] bg-[rgba(180,103,209,.14)] text-[var(--t1,#f4edf7)]'
                  : 'border-[var(--line,rgba(194,196,201,.12))] text-[var(--t2,#c7bfca)]'
              }`}
            >
              <input
                type="radio"
                name={group}
                value={id}
                checked={checked}
                onChange={() => onPick(field, id)}
                className="sr-only"
              />
              {nameOf(names, id)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function LookFields({
  look,
  onPick,
}: {
  look: LibraryAvatarLook;
  onPick: (field: LibraryLookField, value: string) => void;
}) {
  const t = useT(nsPlayerLibrary);
  const l = t.look;
  return (
    <div className="flex flex-col gap-4">
      <Swatches
        field="skin"
        legend={l.fields.skin}
        colors={LIBRARY_LOOK_SKINS}
        names={l.skins}
        value={look.skin}
        onPick={onPick}
      />
      <Chips
        field="hair"
        legend={l.fields.hair}
        ids={LIBRARY_LOOK_HAIRS}
        names={l.hairs}
        value={look.hair}
        onPick={onPick}
      />
      <Swatches
        field="hairColor"
        legend={look.hair === 'headscarf' ? l.scarfColor : l.fields.hairColor}
        colors={LIBRARY_LOOK_HAIR_COLORS}
        names={l.hairColors}
        value={look.hairColor}
        onPick={onPick}
      />
      <Chips
        field="outfit"
        legend={l.fields.outfit}
        ids={LIBRARY_LOOK_OUTFITS}
        names={l.outfits}
        value={look.outfit}
        onPick={onPick}
      />
      <Swatches
        field="outfitColor"
        legend={l.fields.outfitColor}
        colors={LIBRARY_LOOK_OUTFIT_COLORS}
        names={l.outfitColors}
        value={look.outfitColor}
        onPick={onPick}
      />
      <Swatches
        field="bottomColor"
        legend={l.fields.bottomColor}
        colors={LIBRARY_LOOK_OUTFIT_COLORS}
        names={l.outfitColors}
        value={look.bottomColor}
        onPick={onPick}
      />
    </div>
  );
}
