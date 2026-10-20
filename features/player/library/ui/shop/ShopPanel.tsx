// features/player/library/ui/shop/ShopPanel.tsx — la boutique de meubles
// (lots 4 et 11 de docs/PLAN-womens-library.md). Présentationnel : le
// catalogue, le solde et le geste d'achat arrivent par les props.
//
// LE PRIX AFFICHÉ EST CELUI DU CATALOGUE DE L'API, qui est aussi celui débité.
// Le solde affiché est un cache : le bouton reste actif même quand il paraît
// court (la base décide), mais l'écart est dit à côté du prix. Un refus
// « pièces insuffisantes » rappelle le solde du registre et le manque exact.
//
// LE GRAND CATALOGUE (lot 11) : plus de 200 meubles. Une carte par FAMILLE
// (ses variantes de couleur se choisissent sur la carte), une recherche
// (nom, teinte, catégorie, set), trois filtres (catégorie, set, prix) et une
// pagination. Un meuble d'événement porte sa date de fin, et disparaît de la
// vente à la fermeture de sa fenêtre (l'API refuse de toute façon).

import { useRef, useState } from 'react';
import { format, useT } from '@/lib/i18n/useT';
import nsPlayerLibrary from '@/lib/i18n/locales/fr/playerLibrary';
import { TcgAmount } from '@/components/tcg/TcgCoin';
import {
  FURNITURE_SET_IDS,
  LIBRARY_FURNITURE_SETS,
} from '@/config/library/furnitureSets';
import {
  Button,
  FilterSelect,
  ListSearch,
  ListToolbar,
} from '@/features/ruban';
import type { LibraryManifest } from '../../engine/assets';
import type { ActionResult } from '../../hooks/useLibraryActions';
import {
  furnitureName,
  libraryErrorCode,
  libraryErrorNumber,
} from '../../model';
import type { LibraryBuyResponse, LibraryCatalogItem } from '../../responses';
import ShopFamilyTile from './ShopFamilyTile';
import {
  EMPTY_FILTERS,
  familyOf,
  filterFamilies,
  PRICE_BANDS,
  type PriceBand,
  paginate,
  type ShopFilters,
  setsOf,
  shopFamilies,
} from './shopModel';

type Notice = { tone: 'ok' | 'error'; text: string } | null;

/** Cartes par page : 4 rangées sur ordinateur, une douzaine d'écrans au plus. */
export const SHOP_PAGE_SIZE = 24;

const EVENT_SETS = new Set<string>(
  LIBRARY_FURNITURE_SETS.filter((s) => s.kind === 'event').map((s) => s.id)
);

export default function ShopPanel({
  furniture,
  manifest,
  balance,
  owned,
  buyingKey,
  onBuy,
  now,
}: {
  furniture: readonly LibraryCatalogItem[];
  manifest: LibraryManifest | null;
  balance: number;
  owned: ReadonlyMap<string, number>;
  buyingKey: string | null;
  onBuy: (key: string) => Promise<ActionResult<LibraryBuyResponse> | null>;
  /** Horloge de la boutique (tests) ; l'heure de l'ouverture du panneau sinon. */
  now?: Date;
}) {
  const t = useT(nsPlayerLibrary);
  const tc = t.shopCatalog;
  const names = t.furniture as Readonly<Record<string, string>>;
  const familyNames = t.families as Readonly<Record<string, string>>;
  const colors = t.colors as Readonly<Record<string, string>>;
  const setNames = t.sets as Readonly<Record<string, string>>;
  const categories = t.categories as Readonly<Record<string, string>>;
  const [clock] = useState(() => now ?? new Date());
  const [notice, setNotice] = useState<Notice>(null);
  const [filters, setFilters] = useState<ShopFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [chosen, setChosen] = useState<Readonly<Record<string, string>>>({});
  const listRef = useRef<HTMLUListElement>(null);

  const nameOf = (key: string) => furnitureName(names, key);
  const titleOf = (family: string) =>
    Object.hasOwn(familyNames, family) ? familyNames[family] : nameOf(family);
  const colorOf = (variant: string | null | undefined) =>
    variant && Object.hasOwn(colors, variant) ? colors[variant] : '';
  const setNameOf = (id: string) =>
    Object.hasOwn(setNames, id) ? setNames[id] : id;

  const families = shopFamilies(furniture, clock);
  const shown = filterFamilies(families, filters, (item) => [
    nameOf(item.key),
    titleOf(familyOf(item)),
    colorOf(item.variant),
    categories[item.category] ?? '',
    ...setsOf(item).map(setNameOf),
    item.key,
  ]);
  const current = paginate(shown, page, SHOP_PAGE_SIZE);
  const filtered =
    filters.query !== '' ||
    filters.category !== null ||
    filters.set !== null ||
    filters.price !== null;

  const update = (patch: Partial<ShopFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const goTo = (p: number) => {
    setPage(p);
    listRef.current?.focus();
  };

  // Les catégories et les sets proposés sont ceux qui ont un meuble en vente.
  const categoryOptions = [
    ...new Set(families.map((f) => f.category as string)),
  ].map((c) => ({ value: c, label: categories[c] ?? c }));
  const onSaleSets = new Set(
    families.flatMap((f) => f.members.flatMap((m) => setsOf(m)))
  );
  const setOptions = FURNITURE_SET_IDS.filter((s) => onSaleSets.has(s)).map(
    (s) => ({ value: s, label: setNameOf(s) })
  );
  const priceOptions = PRICE_BANDS.map((b) => ({
    value: b,
    label: tc.priceBands[b],
  }));

  const buy = async (item: LibraryCatalogItem) => {
    const name = nameOf(item.key);
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
    } else if (code === 'furniture_not_on_sale') {
      setNotice({ tone: 'error', text: tc.notOnSale });
    } else if (code === 'balance_changed') {
      setNotice({ tone: 'error', text: t.shopRetry });
    } else {
      setNotice({ tone: 'error', text: t.shopError });
    }
  };

  const count = shown.length;
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

      {families.length === 0 ? (
        <p className="text-sm text-[var(--t3,#a39ba6)]">{t.shopEmpty}</p>
      ) : (
        <>
          <div role="search" aria-label={tc.filtersLabel}>
            <ListToolbar
              search={
                <ListSearch
                  value={filters.query}
                  onChange={(query) => update({ query })}
                  placeholder={tc.searchPlaceholder}
                  label={tc.searchLabel}
                />
              }
              filters={
                <>
                  <FilterSelect
                    label={tc.categoryLabel}
                    allLabel={tc.all}
                    value={filters.category}
                    onChange={(category) => update({ category })}
                    options={categoryOptions}
                  />
                  <FilterSelect
                    label={tc.setLabel}
                    allLabel={tc.all}
                    value={filters.set}
                    onChange={(set) => update({ set })}
                    options={setOptions}
                  />
                  <FilterSelect
                    label={tc.priceLabel}
                    allLabel={tc.all}
                    value={filters.price}
                    onChange={(price) =>
                      update({ price: (price as PriceBand | null) ?? null })
                    }
                    options={priceOptions}
                  />
                  {filtered && (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => update(EMPTY_FILTERS)}
                    >
                      {tc.resetFilters}
                    </Button>
                  )}
                </>
              }
              note={
                <span role="status" aria-live="polite">
                  {format(count === 1 ? tc.results_one : tc.results_other, {
                    count,
                  })}
                </span>
              }
            />
          </div>

          {count === 0 ? (
            <p className="text-sm text-[var(--t3,#a39ba6)]">{tc.noResults}</p>
          ) : (
            <ul
              ref={listRef}
              tabIndex={-1}
              aria-labelledby="library-shop-title"
              className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 outline-none"
            >
              {current.items.map((family) => {
                const selected =
                  family.members.find((m) => m.key === chosen[family.family]) ??
                  family.members[0];
                return (
                  <ShopFamilyTile
                    key={family.family}
                    family={family}
                    title={titleOf(family.family)}
                    selected={selected}
                    onSelect={(key) =>
                      setChosen((c) => ({ ...c, [family.family]: key }))
                    }
                    nameOf={nameOf}
                    colorOf={colorOf}
                    eventSetOf={(item) =>
                      setNameOf(
                        setsOf(item).find((s) => EVENT_SETS.has(s)) ?? ''
                      )
                    }
                    manifest={manifest}
                    owned={owned.get(selected.key) ?? 0}
                    balance={balance}
                    buyingKey={buyingKey}
                    onBuy={(item) => void buy(item)}
                  />
                );
              })}
            </ul>
          )}

          {current.pageCount > 1 && (
            <nav
              aria-label={tc.pagination}
              className="flex flex-wrap items-center justify-center gap-3"
            >
              <Button
                size="xs"
                variant="secondary"
                disabled={current.page <= 1}
                onClick={() => goTo(current.page - 1)}
              >
                {tc.previous}
              </Button>
              <span
                aria-live="polite"
                className="text-sm text-[var(--t2,#c7bfca)]"
              >
                {format(tc.pageOf, {
                  page: current.page,
                  count: current.pageCount,
                })}
              </span>
              <Button
                size="xs"
                variant="secondary"
                disabled={current.page >= current.pageCount}
                onClick={() => goTo(current.page + 1)}
              >
                {tc.next}
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
