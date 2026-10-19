// features/player/library/ui/apartment/EditPanel.tsx — les commandes du mode
// déco, sous l'appartement (lot 4, phase B). Chaque geste du pointeur y a son
// bouton (et sa touche) : poser depuis l'inventaire, pivoter, poser ici,
// annuler, déplacer, ranger, sélectionner un meuble posé sans viser le
// canvas. Présentationnel : l'état et les gestes viennent de
// `useApartmentEditor`.

import { format, useT } from '@/lib/i18n/useT';
import nsPlayerLibrary from '@/lib/i18n/locales/fr/playerLibrary';
import { Button } from '@/features/ruban';
import type { EditorAction, EditorState } from '../../editing/editor';
import type { GhostReason } from '../../editing/layout';
import type { SaveStatus } from '../../hooks/useApartmentEditor';
import { furnitureName } from '../../model';
import type { LibraryInventoryItem } from '../../responses';

const BOX =
  'flex flex-col gap-2 rounded-[var(--r-card,14px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s1,#100812)] p-3';
const LIST_BUTTON =
  'flex w-full items-center justify-between gap-2 rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] px-3 py-2 text-left text-sm text-[var(--t1,#f4edf7)] hover:border-[var(--or,#b467d1)] focus-visible:outline-2 focus-visible:outline-[var(--or,#b467d1)]';

export default function EditPanel({
  state,
  dispatch,
  status,
  ghostValid,
  ghostProblems,
  inventory,
  onRetry,
  hintId,
  focusFrame,
}: {
  state: EditorState;
  dispatch: (...actions: EditorAction[]) => void;
  status: SaveStatus;
  ghostValid: boolean;
  ghostProblems: readonly GhostReason[];
  inventory: readonly LibraryInventoryItem[];
  onRetry: () => void;
  hintId: string;
  /** Ramène le focus sur le cadre (pour continuer au clavier). */
  focusFrame: () => void;
}) {
  const t = useT(nsPlayerLibrary);
  const e = t.edit;
  const names = t.furniture as Readonly<Record<string, string>>;
  const keyOf = new Map(inventory.map((i) => [i.id, i.key]));
  const nameOfId = (id: string) =>
    furnitureName(
      names,
      keyOf.get(id) ?? state.items.find((i) => i.inventoryId === id)?.key ?? id
    );

  const placedIds = new Set(state.items.map((i) => i.inventoryId));
  const stored = new Map<string, string[]>();
  for (const item of inventory) {
    if (placedIds.has(item.id) || state.ghost?.inventoryId === item.id)
      continue;
    stored.set(item.key, [...(stored.get(item.key) ?? []), item.id]);
  }

  const act = (...actions: EditorAction[]) => {
    dispatch(...actions);
    focusFrame();
  };

  const statusText =
    status.kind === 'invalid'
      ? format(e.status.invalid, {
          names: status.ids.map(nameOfId).join(', '),
        })
      : e.status[status.kind];
  const selected = state.selectedId
    ? (state.items.find((i) => i.inventoryId === state.selectedId) ?? null)
    : null;
  const reasons = e.ghostReasons as Record<GhostReason, string>;

  return (
    <div className="flex flex-col gap-4" data-testid="library-edit-panel">
      <div className="flex flex-wrap items-center gap-3">
        <p
          role="status"
          aria-live="polite"
          data-status={status.kind}
          className={`min-h-5 text-sm ${
            status.kind === 'error' ||
            status.kind === 'invalid' ||
            status.kind === 'conflict'
              ? 'text-[var(--err,#ff6b6b)]'
              : 'text-[var(--t2,#c7bfca)]'
          }`}
        >
          {statusText}
        </p>
        {status.kind === 'error' && (
          <Button size="xs" variant="secondary" onClick={onRetry}>
            {e.retry}
          </Button>
        )}
      </div>
      <div
        id={hintId}
        className="flex flex-col gap-1 text-xs text-[var(--t3,#a39ba6)]"
      >
        <p>{e.hint}</p>
        <p>{e.keys}</p>
        <p>{e.touchHint}</p>
      </div>

      {state.ghost && (
        <section
          className={BOX}
          aria-label={format(e.ghostTitle, {
            name: nameOfId(state.ghost.inventoryId),
          })}
          data-testid="library-edit-ghost"
          data-valid={ghostValid}
        >
          <p className="text-sm font-semibold text-[var(--t1,#f4edf7)]">
            {format(e.ghostTitle, { name: nameOfId(state.ghost.inventoryId) })}
          </p>
          <p
            className={`text-sm ${ghostValid ? 'text-[var(--lf,#7fca65)]' : 'text-[var(--err,#ff6b6b)]'}`}
          >
            {ghostValid
              ? e.ghostValid
              : ghostProblems.map((r) => reasons[r]).join(' ')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="xs"
              variant="ghost"
              onClick={() => act({ type: 'rotate' })}
            >
              {e.rotate}
            </Button>
            <Button
              size="xs"
              variant="primary"
              disabled={!ghostValid}
              onClick={() => act({ type: 'commit' })}
            >
              {e.place}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => act({ type: 'cancel' })}
            >
              {e.cancel}
            </Button>
          </div>
        </section>
      )}

      {!state.ghost && selected && (
        <section
          className={BOX}
          aria-label={format(e.selectedTitle, {
            name: nameOfId(selected.inventoryId),
          })}
          data-testid="library-edit-selection"
        >
          <p className="text-sm font-semibold text-[var(--t1,#f4edf7)]">
            {format(e.selectedTitle, { name: nameOfId(selected.inventoryId) })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="xs"
              variant="secondary"
              onClick={() => act({ type: 'startMove' })}
            >
              {e.move}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => act({ type: 'rotate' })}
            >
              {e.rotate}
            </Button>
            <Button
              size="xs"
              variant="danger"
              onClick={() => act({ type: 'store' })}
            >
              {e.store}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => act({ type: 'select', id: null })}
            >
              {e.deselect}
            </Button>
          </div>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <section
          aria-labelledby={`${hintId}-stored`}
          className="flex flex-col gap-2"
        >
          <h3
            id={`${hintId}-stored`}
            className="text-xs font-bold uppercase tracking-wide text-[var(--t3,#a39ba6)]"
          >
            {e.storedTitle}
          </h3>
          {stored.size === 0 ? (
            <p className="text-sm text-[var(--t3,#a39ba6)]">{e.storedEmpty}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {[...stored].map(([key, ids]) => (
                <li key={key}>
                  <button
                    type="button"
                    data-testid={`library-edit-place-${key}`}
                    aria-label={format(e.placeAria, {
                      name: furnitureName(names, key),
                    })}
                    className={LIST_BUTTON}
                    onClick={() =>
                      act({ type: 'startPlace', inventoryId: ids[0], key })
                    }
                  >
                    <span>{furnitureName(names, key)}</span>
                    <span className="text-xs text-[var(--t3,#a39ba6)]">
                      {format(e.count, { count: ids.length })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section
          aria-labelledby={`${hintId}-placed`}
          className="flex flex-col gap-2"
        >
          <h3
            id={`${hintId}-placed`}
            className="text-xs font-bold uppercase tracking-wide text-[var(--t3,#a39ba6)]"
          >
            {e.placedTitle}
          </h3>
          {state.items.length === 0 ? (
            <p className="text-sm text-[var(--t3,#a39ba6)]">{e.placedEmpty}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {state.items.map((item) => (
                <li key={item.inventoryId}>
                  <button
                    type="button"
                    aria-pressed={item.inventoryId === state.selectedId}
                    aria-label={format(e.selectAria, {
                      name: nameOfId(item.inventoryId),
                    })}
                    className={`${LIST_BUTTON} aria-pressed:border-[var(--or,#b467d1)] aria-pressed:bg-[rgba(180,103,209,.12)]`}
                    onClick={() =>
                      act({ type: 'select', id: item.inventoryId })
                    }
                  >
                    <span>{nameOfId(item.inventoryId)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
