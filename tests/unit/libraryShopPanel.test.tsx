// @vitest-environment happy-dom
//
// Women's Library, lot 11 — la boutique du grand catalogue (ShopPanel) et
// « Mes meubles » (InventoryPanel), rendues sur le VRAI catalogue (copie
// synchronisée de l'API, plus de 200 entrées). Ce que ces cas protègent :
//   * une carte par famille, 24 par page, une navigation de pages ;
//   * la recherche (« rose ») et les filtres (set, catégorie) trouvent un
//     meuble par teinte, par set ou par nom, et la carte s'ouvre sur la bonne
//     teinte ;
//   * le choix de teinte est un groupe radio au clavier (flèches) et l'achat
//     part avec la clé de la teinte choisie ;
//   * un meuble d'événement porte sa date de fin, et n'est plus en vente
//     après ; un refus `furniture_not_on_sale` est expliqué ;
//   * « Mes meubles » regroupe les teintes d'une même famille.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import {
  type Furniture,
  LIBRARY_FURNITURE,
} from '../../config/library/furniture';
import { placementLayerOf } from '../../features/player/library/placement';
import type { LibraryCatalogItem } from '../../features/player/library/responses';
import InventoryPanel, {
  groupByFamily,
} from '../../features/player/library/ui/shop/InventoryPanel';
import ShopPanel, {
  SHOP_PAGE_SIZE,
} from '../../features/player/library/ui/shop/ShopPanel';
import nsPlayerLibrary from '../../lib/i18n/locales/fr/playerLibrary';
import { format } from '../../lib/i18n/useT';

afterEach(cleanup);

const t = nsPlayerLibrary.fr;
const asItem = (f: Furniture): LibraryCatalogItem => ({
  key: f.key,
  category: f.category,
  footprint: { ...f.footprint },
  heightM: f.heightM,
  price: f.price,
  sittable: f.sittable,
  stackable: f.stackable,
  layer: placementLayerOf(f),
  family: f.family,
  variant: f.variant ?? null,
  sets: [...f.sets],
  window: f.window ?? null,
});
const CATALOG = LIBRARY_FURNITURE.map(asItem);
const HALLOWEEN = new Date('2026-10-31T18:00:00Z');
const DECEMBER = new Date('2026-12-10T10:00:00Z');

function renderShop(over: Partial<Parameters<typeof ShopPanel>[0]> = {}) {
  const onBuy = vi.fn(async (key: string) => ({
    ok: true as const,
    data: { inventoryId: 'i1', key, price: 1, balance: 1, replayed: false },
  }));
  render(
    <ShopPanel
      furniture={CATALOG}
      manifest={null}
      balance={5000}
      owned={new Map()}
      buyingKey={null}
      onBuy={onBuy as never}
      now={HALLOWEEN}
      {...over}
    />
  );
  return { onBuy };
}

const cards = () =>
  screen
    .getAllByRole('listitem')
    .filter((li) => li.dataset.testid?.startsWith('library-shop-'));

describe('ShopPanel — grand catalogue', () => {
  it('une carte par famille, 24 par page, et des pages', () => {
    renderShop();
    expect(cards()).toHaveLength(SHOP_PAGE_SIZE);
    const nav = screen.getByRole('navigation', {
      name: t.shopCatalog.pagination,
    });
    const next = within(nav).getByRole('button', { name: t.shopCatalog.next });
    expect(
      within(nav).getByRole('button', { name: t.shopCatalog.previous })
    ).toHaveProperty('disabled', true);
    fireEvent.click(next);
    expect(within(nav).getByText(/Page 2 sur/)).toBeTruthy();
    // Le canapé n'a qu'UNE carte, malgré ses 7 teintes.
    expect(screen.queryAllByTestId('library-shop-sofa_blue')).toHaveLength(0);
  });

  it('recherche « canapé rose » : la carte du canapé, ouverte sur sa teinte rose', () => {
    renderShop();
    fireEvent.change(screen.getByLabelText(t.shopCatalog.searchLabel), {
      target: { value: 'canapé rose' },
    });
    const sofa = screen.getByTestId('library-shop-sofa');
    expect(sofa.dataset.selected).toBe('sofa_pink');
    expect(cards().map((c) => c.dataset.testid)).toEqual(['library-shop-sofa']);
    expect(
      screen.getByText(format(t.shopCatalog.results_one, { count: 1 }))
    ).toBeTruthy();
  });

  it('filtre de set « Halloween » : seulement ses meubles, avec leur date de fin', () => {
    renderShop();
    fireEvent.change(screen.getByLabelText(`${t.shopCatalog.setLabel} :`), {
      target: { value: 'halloween' },
    });
    const all = cards();
    expect(all.length).toBeGreaterThanOrEqual(8);
    expect(screen.getByTestId('library-shop-sofa').dataset.selected).toBe(
      'sofa_pumpkin'
    );
    const tags = screen.getAllByTestId('library-shop-event');
    expect(tags.length).toBe(all.length);
    expect(tags[0].textContent).toContain('2 novembre');
    expect(tags[0].textContent).toContain(t.sets.halloween);
  });

  it('hors fenêtre : ni le set Halloween ni ses teintes ne sont en vente', () => {
    renderShop({ now: DECEMBER });
    const select = screen.getByLabelText(
      `${t.shopCatalog.setLabel} :`
    ) as HTMLSelectElement;
    const values = [...select.options].map((o) => o.value);
    expect(values).not.toContain('halloween');
    expect(values).toContain('library');
    fireEvent.change(screen.getByLabelText(t.shopCatalog.searchLabel), {
      target: { value: 'citrouille' },
    });
    expect(screen.getByText(t.shopCatalog.noResults)).toBeTruthy();
  });

  it('filtre de catégorie, puis « Effacer les filtres »', () => {
    renderShop();
    fireEvent.change(
      screen.getByLabelText(`${t.shopCatalog.categoryLabel} :`),
      {
        target: { value: 'rug' },
      }
    );
    const rugs = cards();
    expect(rugs.length).toBeGreaterThan(0);
    expect(rugs.length).toBeLessThan(SHOP_PAGE_SIZE);
    fireEvent.click(
      screen.getByRole('button', { name: t.shopCatalog.resetFilters })
    );
    expect(cards()).toHaveLength(SHOP_PAGE_SIZE);
  });

  it('teinte au clavier (groupe radio), puis achat de CETTE teinte', async () => {
    const { onBuy } = renderShop();
    fireEvent.change(screen.getByLabelText(t.shopCatalog.searchLabel), {
      target: { value: 'canapé' },
    });
    const sofa = screen.getByTestId('library-shop-sofa');
    const group = within(sofa).getByRole('radiogroup', {
      name: format(t.shopCatalog.colorPicker, { name: t.families.sofa }),
    });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-label'))).toContain(
      t.colors.blue
    );
    expect(radios[0].getAttribute('aria-checked')).toBe('true');
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    fireEvent.keyDown(radios[0], { key: 'ArrowRight' });
    expect(sofa.dataset.selected).toBe('sofa_blue');
    expect(
      within(sofa).getByText(
        format(t.shopCatalog.colorChosen, { color: t.colors.blue })
      )
    ).toBeTruthy();
    fireEvent.keyDown(within(group).getAllByRole('radio')[1], { key: 'End' });
    expect(sofa.dataset.selected).toBe('sofa_pumpkin');
    fireEvent.keyDown(within(group).getAllByRole('radio')[6], { key: 'Home' });
    fireEvent.click(within(group).getAllByRole('radio')[3]);
    expect(sofa.dataset.selected).toBe('sofa_pink');
    fireEvent.click(
      within(sofa).getByRole('button', {
        name: format(t.shopBuyAria, {
          name: t.furniture.sofa_pink,
          price: 500,
        }),
      })
    );
    expect(onBuy).toHaveBeenCalledWith('sofa_pink');
  });

  it('refus « pas en vente » : expliqué, sans planter', async () => {
    const onBuy = vi.fn(async () => ({
      ok: false as const,
      error: { status: 409, code: 'furniture_not_on_sale', payload: {} },
    }));
    renderShop({ onBuy: onBuy as never });
    fireEvent.change(screen.getByLabelText(t.shopCatalog.searchLabel), {
      target: { value: 'chaudron' },
    });
    fireEvent.click(
      within(screen.getByTestId('library-shop-cauldron')).getByRole('button')
    );
    expect(await screen.findByText(t.shopCatalog.notOnSale)).toBeTruthy();
  });
});

describe('InventoryPanel — teintes regroupées', () => {
  const groups = [
    { key: 'sofa', total: 1, placed: 1, ids: ['a'] },
    { key: 'sofa_blue', total: 2, placed: 0, ids: ['b', 'c'] },
    { key: 'lamp', total: 1, placed: 0, ids: ['d'] },
    { key: 'armchair_club_navy', total: 1, placed: 0, ids: ['e'] },
  ];

  it('groupByFamily : une famille par modèle, les teintes comptées', () => {
    const fams = groupByFamily(groups);
    expect(fams.map((f) => [f.family, f.total, f.placed])).toEqual([
      ['sofa', 3, 1],
      ['lamp', 1, 0],
      ['armchair_green', 1, 0],
    ]);
    expect(fams[0].colors.map((c) => c.variant)).toEqual(['linen', 'blue']);
  });

  it('une carte par famille, avec chaque teinte et son nombre', () => {
    render(
      <InventoryPanel groups={groups} manifest={null} truncated={false} />
    );
    const sofa = screen.getByTestId('library-inventory-sofa');
    expect(within(sofa).getByText(t.families.sofa)).toBeTruthy();
    expect(
      within(sofa).getByText(
        format(t.shopCatalog.inventoryColor, { color: t.colors.blue, count: 2 })
      )
    ).toBeTruthy();
    // Une famille d'une seule teinte possédée garde le nom du meuble.
    const club = screen.getByTestId('library-inventory-armchair_green');
    expect(within(club).getByText(t.furniture.armchair_club_navy)).toBeTruthy();
    expect(screen.getByTestId('library-inventory-lamp')).toBeTruthy();
  });
});
