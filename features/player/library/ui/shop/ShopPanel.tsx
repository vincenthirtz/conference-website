// features/player/library/ui/shop/ShopPanel.tsx — la boutique de meubles
// (lot 4 de docs/PLAN-womens-library.md). Présentationnel : le catalogue, le
// solde et le geste d'achat arrivent par les props.
//
// LE PRIX AFFICHÉ EST CELUI DU CATALOGUE DE L'API, qui est aussi celui débité.
// Le solde affiché est un cache : le bouton reste actif même quand il paraît
// court (la base décide), mais l'écart est dit à côté du prix. Un refus
// « pièces insuffisantes » rappelle le solde du registre et le manque exact.

import { useState } from 'react';
import { format, useT } from '@/lib/i18n/useT';
import nsPlayerLibrary from '@/lib/i18n/locales/fr/playerLibrary';
import { TcgAmount } from '@/components/tcg/TcgCoin';
import { Button } from '@/features/ruban';
import type { LibraryManifest } from '../../engine/assets';
import type { ActionResult } from '../../hooks/useLibraryActions';
import {
  furnitureName,
  libraryErrorCode,
  libraryErrorNumber,
} from '../../model';
import type { LibraryBuyResponse, LibraryCatalogItem } from '../../responses';
import { furnitureFrame } from '../../sprites';
import FurnitureThumb from './FurnitureThumb';

type Notice = { tone: 'ok' | 'error'; text: string } | null;

export default function ShopPanel({
  furniture,
  manifest,
  balance,
  owned,
  buyingKey,
  onBuy,
}: {
  furniture: readonly LibraryCatalogItem[];
  manifest: LibraryManifest | null;
  balance: number;
  owned: ReadonlyMap<string, number>;
  buyingKey: string | null;
  onBuy: (key: string) => Promise<ActionResult<LibraryBuyResponse> | null>;
}) {
  const t = useT(nsPlayerLibrary);
  const names = t.furniture as Readonly<Record<string, string>>;
  const categories = t.categories as Readonly<Record<string, string>>;
  const [notice, setNotice] = useState<Notice>(null);

  const buy = async (item: LibraryCatalogItem) => {
    const name = furnitureName(names, item.key);
    setNotice(null);
    const result = await onBuy(item.key);
    if (!result) return; // un achat est déjà en cours
    if (result.ok) {
      setNotice({ tone: 'ok', text: format(t.shopBought, { name }) });
      return;
    }
    const code = libraryErrorCode(result.error);
    if (code === 'insufficient_funds') {
      const known = libraryErrorNumber(result.error, 'balance') ?? balance;
      const price = libraryErrorNumber(result.error, 'price') ?? item.price;
      setNotice({
        tone: 'error',
        text: format(t.shopInsufficient, {
          missing: Math.max(1, price - known),
          name,
        }),
      });
    } else if (code === 'unknown_furniture') {
      setNotice({ tone: 'error', text: t.shopUnknown });
    } else if (code === 'balance_changed') {
      setNotice({ tone: 'error', text: t.shopRetry });
    } else {
      setNotice({ tone: 'error', text: t.shopError });
    }
  };

  // Rangé par catégorie, dans l'ordre du catalogue.
  const groups: Array<{ category: string; items: LibraryCatalogItem[] }> = [];
  for (const item of furniture) {
    let g = groups.find((x) => x.category === item.category);
    if (!g) {
      g = { category: item.category, items: [] };
      groups.push(g);
    }
    g.items.push(item);
  }

  return (
    <section
      aria-labelledby="library-shop-title"
      className="flex flex-col gap-4"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2
            id="library-shop-title"
            className="text-lg font-bold text-[var(--t1,#f4edf7)]"
          >
            {t.shopTitle}
          </h2>
          <p className="text-sm text-[var(--t2,#c7bfca)]">{t.shopIntro}</p>
        </div>
        <p className="text-sm text-[var(--t2,#c7bfca)]">
          <span className="mr-2">{t.balanceLabel}</span>
          <TcgAmount
            value={balance}
            className="font-bold text-[var(--t1,#f4edf7)]"
          />
        </p>
      </header>

      <p
        role="status"
        aria-live="polite"
        data-tone={notice?.tone}
        className={`min-h-5 text-sm ${
          notice?.tone === 'error'
            ? 'text-[var(--err,#ff6b6b)]'
            : 'text-[var(--lf,#7fca65)]'
        }`}
      >
        {notice?.text ?? ''}
      </p>

      {furniture.length === 0 ? (
        <p className="text-sm text-[var(--t3,#a39ba6)]">{t.shopEmpty}</p>
      ) : (
        groups.map((group) => (
          <div key={group.category} className="flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--t3,#a39ba6)]">
              {categories[group.category] ?? group.category}
            </h3>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
              {group.items.map((item) => {
                const name = furnitureName(names, item.key);
                const count = owned.get(item.key) ?? 0;
                const busy = buyingKey === item.key;
                const short = item.price > balance;
                return (
                  <li
                    key={item.key}
                    data-testid={`library-shop-${item.key}`}
                    className="flex flex-col items-center gap-2 rounded-[var(--r-card,14px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s1,#100812)] p-3 text-center"
                  >
                    <FurnitureThumb
                      frame={furnitureFrame(manifest, item.key)}
                    />
                    <span className="text-sm font-semibold text-[var(--t1,#f4edf7)]">
                      {name}
                    </span>
                    <span
                      className={`text-sm ${short ? 'text-[var(--t3,#a39ba6)]' : 'text-[var(--t1,#f4edf7)]'}`}
                    >
                      <span className="sr-only">
                        {format(t.shopPriceAria, { price: item.price })}
                      </span>
                      <span aria-hidden>
                        <TcgAmount value={item.price} />
                      </span>
                    </span>
                    {count > 0 && (
                      <span className="text-xs text-[var(--t3,#a39ba6)]">
                        {format(t.shopOwned, { count })}
                      </span>
                    )}
                    <Button
                      size="xs"
                      variant="secondary"
                      disabled={buyingKey !== null}
                      aria-busy={busy}
                      aria-label={format(t.shopBuyAria, {
                        name,
                        price: item.price,
                      })}
                      onClick={() => void buy(item)}
                    >
                      {busy ? t.shopBuying : t.shopBuy}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
