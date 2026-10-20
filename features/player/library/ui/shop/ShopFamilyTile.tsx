// features/player/library/ui/shop/ShopFamilyTile.tsx — une carte de la
// boutique = UNE FAMILLE de meubles (lot 11) : la vignette de la teinte
// choisie, le nom, le choix de teinte, le prix, le bandeau d'événement et le
// bouton d'achat. Présentationnel : la teinte choisie et l'achat viennent du
// panneau.

import { format, useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsPlayerLibrary from '@/lib/i18n/locales/fr/playerLibrary';
import { TcgAmount } from '@/components/tcg/TcgCoin';
import { Button, Chip } from '@/features/ruban';
import type { LibraryManifest } from '../../engine/assets';
import type { LibraryCatalogItem } from '../../responses';
import { furnitureFrame } from '../../sprites';
import FurnitureThumb from './FurnitureThumb';
import { lastDayOf, type ShopFamily } from './shopModel';
import VariantPicker from './VariantPicker';

export default function ShopFamilyTile({
  family,
  title,
  selected,
  onSelect,
  nameOf,
  colorOf,
  eventSetOf,
  manifest,
  owned,
  balance,
  buyingKey,
  onBuy,
}: {
  family: ShopFamily;
  /** Titre de la famille, sans teinte. */
  title: string;
  selected: LibraryCatalogItem;
  onSelect: (key: string) => void;
  nameOf: (key: string) => string;
  colorOf: (variant: string | null | undefined) => string;
  /** Libellé du set d'événement d'une entrée à fenêtre. */
  eventSetOf: (item: LibraryCatalogItem) => string;
  manifest: LibraryManifest | null;
  owned: number;
  balance: number;
  buyingKey: string | null;
  onBuy: (item: LibraryCatalogItem) => void;
}) {
  const t = useT(nsPlayerLibrary);
  const tc = t.shopCatalog;
  const locale = useLocale();
  const name = nameOf(selected.key);
  const busy = buyingKey === selected.key;
  const short = selected.price > balance;
  const date = selected.window
    ? lastDayOf(selected.window).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        timeZone: 'Europe/Paris',
      })
    : null;
  const eventSet = selected.window ? eventSetOf(selected) : '';

  return (
    <li
      data-testid={`library-shop-${family.family}`}
      data-selected={selected.key}
      className="flex flex-col items-center gap-2 rounded-[var(--r-card,14px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s1,#100812)] p-3 text-center"
    >
      <FurnitureThumb frame={furnitureFrame(manifest, selected.key)} />
      <span className="text-sm font-semibold text-[var(--t1,#f4edf7)]">
        {family.members.length > 1 ? title : name}
      </span>
      {family.members.length > 1 && (
        <>
          <VariantPicker
            label={format(tc.colorPicker, { name: title })}
            options={family.members.map((m) => ({
              key: m.key,
              variant: m.variant ?? null,
              label: colorOf(m.variant) || nameOf(m.key),
            }))}
            value={selected.key}
            onChange={onSelect}
          />
          <span className="text-xs text-[var(--t3,#a39ba6)]">
            {format(tc.colorChosen, { color: colorOf(selected.variant) })}
          </span>
        </>
      )}
      {date && (
        // Le set en puce courte, la date en texte qui passe à la ligne : une
        // carte de 150 px (téléphone) garde tout lisible.
        <span
          data-testid="library-shop-event"
          className="flex flex-col items-center gap-1"
        >
          <span className="sr-only">
            {format(tc.eventAria, { set: eventSet, date })}
          </span>
          <span aria-hidden className="flex flex-col items-center gap-1">
            <Chip tone="warn">{eventSet}</Chip>
            <span className="text-xs text-[#ffd9a3]">
              {format(tc.eventEnds, { date })}
            </span>
          </span>
        </span>
      )}
      <span
        className={`text-sm ${short ? 'text-[var(--t3,#a39ba6)]' : 'text-[var(--t1,#f4edf7)]'}`}
      >
        <span className="sr-only">
          {format(t.shopPriceAria, { price: selected.price })}
        </span>
        <span aria-hidden>
          <TcgAmount value={selected.price} />
        </span>
      </span>
      {owned > 0 && (
        <span className="text-xs text-[var(--t3,#a39ba6)]">
          {format(t.shopOwned, { count: owned })}
        </span>
      )}
      <Button
        size="xs"
        variant="secondary"
        disabled={buyingKey !== null}
        aria-busy={busy}
        aria-label={format(t.shopBuyAria, { name, price: selected.price })}
        onClick={() => onBuy(selected)}
      >
        {busy ? t.shopBuying : t.shopBuy}
      </Button>
    </li>
  );
}
