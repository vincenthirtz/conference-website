// features/player/library/ui/teamHq/TeamHqMoveForm.tsx — déplacer un meuble
// que j'ai prêté au QG, SANS le canevas (lot 9 de docs/PLAN-womens-library.md).
//
// LE CHEMIN ACCESSIBLE DE LA V1. Le mode déco de l'appartement enregistre
// l'ÉTAT COMPLET d'une salle à une seule propriétaire ; un QG est décoré par
// plusieurs membres, chacune ne touche qu'à SES meubles, un geste à la fois.
// Ici, trois champs (colonne, rangée, orientation) suffisent au clavier et au
// lecteur d'écran ; le formulaire dit AVANT l'envoi si le meuble tient
// (`moveIssues`, la même règle que l'API), et l'API le revérifie.

import { useId, useState } from 'react';
import { format, useT } from '@/lib/i18n/useT';
import nsPlayerLibrary from '@/lib/i18n/locales/fr/playerLibrary';
import nsTeamHq from '@/lib/i18n/locales/fr/playerLibraryTeamHq';
import { Button } from '@/features/ruban';
import type { PlacementSpec } from '../../placement';
import { moveIssues } from '../../teamHq/model';
import type { LibraryLentItem } from '../../teamHqResponses';
import { FOCUS_RING, TEXT_ERROR, TEXT_MUTED } from '../social/shared';

const FIELD = `min-h-11 w-24 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1b1320)] px-2 text-[var(--t1,#f4edf7)] ${FOCUS_RING}`;

const ROTATIONS = [0, 1, 2, 3] as const;

export type TeamHqMoveFormProps = {
  item: LibraryLentItem;
  /** Le nom traduit du meuble. */
  name: string;
  room: { width: number; depth: number };
  items: readonly LibraryLentItem[];
  specs: ReadonlyMap<string, PlacementSpec>;
  busy: boolean;
  onSubmit: (place: { gx: number; gy: number; rotation: number }) => void;
  onCancel: () => void;
};

function asInt(raw: string): number | null {
  if (!/^-?\d+$/.test(raw.trim())) return null;
  return Number(raw.trim());
}

export default function TeamHqMoveForm({
  item,
  name,
  room,
  items,
  specs,
  busy,
  onSubmit,
  onCancel,
}: TeamHqMoveFormProps) {
  const t = useT(nsTeamHq);
  const tl = useT(nsPlayerLibrary);
  const id = useId();
  const [gx, setGx] = useState(String(item.gx));
  const [gy, setGy] = useState(String(item.gy));
  const [rotation, setRotation] = useState<number>(item.rotation);

  const x = asInt(gx);
  const y = asInt(gy);
  const issues =
    x === null || y === null
      ? (['out_of_bounds'] as const)
      : moveIssues(room, items, specs, {
          inventoryId: item.inventoryId,
          key: item.key,
          gx: x,
          gy: y,
          rotation,
        });
  const valid = issues.length === 0;
  const message = valid
    ? t.move.valid
    : issues
        .map((reason) =>
          reason === 'unknown_furniture'
            ? t.move.unknown
            : tl.edit.ghostReasons[reason]
        )
        .join(' ');

  return (
    <form
      className="mt-2 flex flex-col gap-3 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] p-3"
      aria-labelledby={`${id}-title`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || x === null || y === null || busy) return;
        onSubmit({ gx: x, gy: y, rotation });
      }}
    >
      <p id={`${id}-title`} className="font-semibold text-[var(--t1,#f4edf7)]">
        {format(t.move.title, { name })}
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm" htmlFor={`${id}-gx`}>
          {format(t.move.gx, { max: room.width - 1 })}
          <input
            id={`${id}-gx`}
            type="number"
            inputMode="numeric"
            min={0}
            max={room.width - 1}
            value={gx}
            onChange={(e) => setGx(e.target.value)}
            className={FIELD}
            data-autofocus=""
          />
        </label>
        <label className="flex flex-col gap-1 text-sm" htmlFor={`${id}-gy`}>
          {format(t.move.gy, { max: room.depth - 1 })}
          <input
            id={`${id}-gy`}
            type="number"
            inputMode="numeric"
            min={0}
            max={room.depth - 1}
            value={gy}
            onChange={(e) => setGy(e.target.value)}
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm" htmlFor={`${id}-rot`}>
          {t.move.rotation}
          <select
            id={`${id}-rot`}
            value={rotation}
            onChange={(e) => setRotation(Number(e.target.value))}
            className={`${FIELD} w-auto`}
          >
            {ROTATIONS.map((r) => (
              <option key={r} value={r}>
                {t.move.rotations[`r${r}`]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p
        role="status"
        aria-live="polite"
        className={valid ? TEXT_MUTED : TEXT_ERROR}
        data-move-valid={valid ? 'true' : 'false'}
      >
        {message}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={!valid || busy}
        >
          {busy ? t.furniture.working : t.move.submit}
        </Button>
        <Button type="button" size="sm" onClick={onCancel}>
          {t.move.cancel}
        </Button>
      </div>
    </form>
  );
}
