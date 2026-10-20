// features/player/library/ui/shop/InventoryPanel.tsx — « Mes meubles » : ce
// que la joueuse possède, posé ou rangé (lot 4). Présentationnel. Poser,
// déplacer et ranger se font en mode déco.
//
// Lot 11 : les variantes de couleur d'un même modèle sont REGROUPÉES (une
// carte par famille), avec le compte de chaque teinte. La famille vient du
// catalogue synchronisé (`config/library/furniture.ts`, le même que l'API).

import { format, useT } from '@/lib/i18n/useT';
import nsPlayerLibrary from '@/lib/i18n/locales/fr/playerLibrary';
import { getFurniture } from '@/config/library/furniture';
import type { LibraryManifest } from '../../engine/assets';
import { furnitureName, type InventoryGroup } from '../../model';
import { furnitureFrame } from '../../sprites';
import FurnitureThumb from './FurnitureThumb';
import { swatchOf } from './shopModel';

type FamilyGroup = {
  family: string;
  placed: number;
  total: number;
  /** Une ligne par teinte possédée, dans l'ordre d'arrivée. */
  colors: Array<InventoryGroup & { variant: string | null }>;
};

/** Regroupe les meubles possédés par famille (une clé inconnue est la sienne). */
export function groupByFamily(
  groups: readonly InventoryGroup[]
): FamilyGroup[] {
  const out = new Map<string, FamilyGroup>();
  for (const g of groups) {
    const item = getFurniture(g.key);
    const family = item?.family ?? g.key;
    let f = out.get(family);
    if (!f) {
      f = { family, placed: 0, total: 0, colors: [] };
      out.set(family, f);
    }
    f.placed += g.placed;
    f.total += g.total;
    f.colors.push({ ...g, variant: item?.variant ?? null });
  }
  return [...out.values()];
}

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
  const familyNames = t.families as Readonly<Record<string, string>>;
  const colorNames = t.colors as Readonly<Record<string, string>>;
  const placed = groups.reduce((s, g) => s + g.placed, 0);
  const total = groups.reduce((s, g) => s + g.total, 0);
  const families = groupByFamily(groups);

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
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
          {families.map((f) => {
            const first = f.colors[0];
            const several = f.colors.length > 1;
            const title =
              several && Object.hasOwn(familyNames, f.family)
                ? familyNames[f.family]
                : furnitureName(names, first.key);
            return (
              <li
                key={f.family}
                data-testid={`library-inventory-${f.family}`}
                className="flex items-center gap-3 rounded-[var(--r-card,14px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s1,#100812)] p-3"
              >
                <FurnitureThumb
                  frame={furnitureFrame(manifest, first.key)}
                  size={48}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold text-[var(--t1,#f4edf7)]">
                    {title}
                  </span>
                  <span className="text-xs text-[var(--t3,#a39ba6)]">
                    {format(t.inventoryPlaced, { count: f.placed })}
                  </span>
                  <span className="text-xs text-[var(--t3,#a39ba6)]">
                    {format(t.inventoryStored, { count: f.total - f.placed })}
                  </span>
                  {several && (
                    <ul className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
                      {f.colors.map((c) => (
                        <li
                          key={c.key}
                          data-testid={`library-inventory-color-${c.key}`}
                          className="flex items-center gap-1 text-xs text-[var(--t2,#c7bfca)]"
                        >
                          <span
                            aria-hidden
                            className="inline-block h-2.5 w-2.5 rounded-full border border-[var(--line2,rgba(194,196,201,.2))]"
                            style={{ backgroundColor: swatchOf(c.variant) }}
                          />
                          {format(t.shopCatalog.inventoryColor, {
                            color:
                              c.variant && Object.hasOwn(colorNames, c.variant)
                                ? colorNames[c.variant]
                                : furnitureName(names, c.key),
                            count: c.total,
                          })}
                        </li>
                      ))}
                    </ul>
                  )}
                </span>
              </li>
            );
          })}
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
