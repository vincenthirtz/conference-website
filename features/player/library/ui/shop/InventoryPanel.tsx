// features/player/library/ui/shop/InventoryPanel.tsx — « Mes meubles » : ce
// que la joueuse possède, regroupé par meuble, posé ou rangé (lot 4).
// Présentationnel. Poser, déplacer et ranger viendront avec le mode déco.

import { format, useT } from '@/lib/i18n/useT';
import nsPlayerLibrary from '@/lib/i18n/locales/fr/playerLibrary';
import type { LibraryManifest } from '../../engine/assets';
import { furnitureName, type InventoryGroup } from '../../model';
import { furnitureFrame } from '../../sprites';
import FurnitureThumb from './FurnitureThumb';

export default function InventoryPanel({
  groups,
  manifest,
  truncated,
}: {
  groups: readonly InventoryGroup[];
  manifest: LibraryManifest | null;
  truncated: boolean;
}) {
  const t = useT(nsPlayerLibrary);
  const names = t.furniture as Readonly<Record<string, string>>;
  const placed = groups.reduce((s, g) => s + g.placed, 0);
  const total = groups.reduce((s, g) => s + g.total, 0);

  return (
    <section
      aria-labelledby="library-inventory-title"
      className="flex flex-col gap-4"
    >
      <header>
        <h2
          id="library-inventory-title"
          className="text-lg font-bold text-[var(--t1,#f4edf7)]"
        >
          {t.inventoryTitle}
        </h2>
        {total > 0 && (
          <p className="text-sm text-[var(--t2,#c7bfca)]">
            {format(t.inventorySummary, { placed, stored: total - placed })}
          </p>
        )}
      </header>
      {total === 0 ? (
        <p className="text-sm text-[var(--t3,#a39ba6)]">{t.inventoryEmpty}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          {groups.map((g) => (
            <li
              key={g.key}
              data-testid={`library-inventory-${g.key}`}
              className="flex items-center gap-3 rounded-[var(--r-card,14px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s1,#100812)] p-3"
            >
              <FurnitureThumb
                frame={furnitureFrame(manifest, g.key)}
                size={48}
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold text-[var(--t1,#f4edf7)]">
                  {furnitureName(names, g.key)}
                </span>
                <span className="text-xs text-[var(--t3,#a39ba6)]">
                  {format(t.inventoryPlaced, { count: g.placed })}
                </span>
                <span className="text-xs text-[var(--t3,#a39ba6)]">
                  {format(t.inventoryStored, { count: g.total - g.placed })}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {truncated && (
        <p className="text-xs text-[var(--t3,#a39ba6)]">
          {t.inventoryTruncated}
        </p>
      )}
    </section>
  );
}
