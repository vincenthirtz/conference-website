// features/player/library/ui/apartment/ApartmentScreen.tsx — « Mon
// appartement » dans la Women's Library (lot 4 de docs/PLAN-womens-library.md).
// Écran de `/player/library` ; état et gestes dans `../../hooks`, panneaux à
// côté.
//
//   1. LA PORTE : tant que `me` refuse (pas d'attestation, mineure connue,
//      bannie), seul l'écran de la porte s'affiche — rien d'autre n'est lu ;
//   2. L'APPARTEMENT : le moteur (chargé à la demande, `ssr: false`) montre la
//      salle ; « Décorer » ouvre le mode déco (ApartmentStage) ;
//   3. LES PANNEAUX : boutique, meubles (posés / rangés), avatar, réglages.

import { type ReactNode, useMemo, useState } from 'react';
import { format, useT } from '@/lib/i18n/useT';
import nsPlayerLibrary from '@/lib/i18n/locales/fr/playerLibrary';
import { TcgAmount } from '@/components/tcg/TcgCoin';
import { Button, PageHeader } from '@/features/ruban';
import { useLibraryActions } from '../../hooks/useLibraryActions';
import { useLibraryHome, useLibraryManifest } from '../../hooks/useLibraryHome';
import { groupInventory, ownedCounts, placementSpecsOf } from '../../model';
import AvatarChooser from '../avatar/AvatarChooser';
import LibraryGate from '../gate/LibraryGate';
import InventoryPanel from '../shop/InventoryPanel';
import ShopPanel from '../shop/ShopPanel';
import ApartmentSettings from './ApartmentSettings';
import ApartmentStage from './ApartmentStage';
import LibraryTabs from './LibraryTabs';

type TabId = 'shop' | 'inventory' | 'avatar' | 'settings';

export default function ApartmentScreen() {
  const t = useT(nsPlayerLibrary);
  const home = useLibraryHome();
  const actions = useLibraryActions();
  const manifest = useLibraryManifest(home.gate === 'ready');
  const [tab, setTab] = useState<TabId>('shop');

  const { me, catalog, apartment } = home;
  const specs = useMemo(
    () => placementSpecsOf(catalog?.furniture ?? []),
    [catalog]
  );
  const placedIds = useMemo(
    () => new Set((apartment?.items ?? []).map((i) => i.inventoryId)),
    [apartment]
  );
  const groups = useMemo(
    () => groupInventory(me?.inventory ?? [], placedIds),
    [me, placedIds]
  );
  const owned = useMemo(() => ownedCounts(me?.inventory ?? []), [me]);
  const sprites = manifest.data ?? null;

  const roomName = apartment
    ? (apartment.room.name ??
      format(t.apartmentDefaultName, { nickname: me?.avatar.nickname ?? '' }))
    : null;

  const header = (
    <PageHeader
      title={t.title}
      subtitle={roomName ?? t.subtitle}
      actions={
        me ? (
          <p className="flex items-center gap-2 text-sm text-[var(--t2,#c7bfca)]">
            <span>{t.balanceLabel}</span>
            <TcgAmount
              value={me.balance}
              size={18}
              className="text-base font-bold text-[var(--t1,#f4edf7)]"
            />
          </p>
        ) : undefined
      }
    />
  );

  let body: ReactNode;
  if (home.gate === 'loading') {
    body = <p className="text-sm text-[var(--t2,#c7bfca)]">{t.loading}</p>;
  } else if (home.gate !== 'ready') {
    body = (
      <LibraryGate
        gate={home.gate}
        attesting={actions.attesting}
        onAttest={actions.attest}
        onRetry={home.retry}
      />
    );
  } else if (home.catalogFailed || home.apartmentFailed) {
    body = (
      <div role="alert" className="flex flex-wrap items-center gap-4">
        <p className="text-sm text-[var(--err,#ff6b6b)]">{t.loadError}</p>
        <Button variant="secondary" size="sm" onClick={home.retry}>
          {t.retry}
        </Button>
      </div>
    );
  } else if (!me || !catalog || !apartment) {
    body = <p className="text-sm text-[var(--t2,#c7bfca)]">{t.loading}</p>;
  } else {
    const tabs = [
      {
        id: 'shop',
        label: t.tabShop,
        panel: (
          <ShopPanel
            furniture={catalog.furniture}
            manifest={sprites}
            balance={me.balance}
            owned={owned}
            buyingKey={actions.buyingKey}
            onBuy={actions.buy}
          />
        ),
      },
      {
        id: 'inventory',
        label: t.tabInventory,
        panel: (
          <InventoryPanel
            groups={groups}
            manifest={sprites}
            truncated={me.inventoryTruncated}
          />
        ),
      },
      {
        id: 'avatar',
        label: t.tabAvatar,
        panel: (
          <AvatarChooser
            avatar={me.avatar}
            avatarIds={catalog.avatars}
            manifest={sprites}
            saving={actions.savingAvatar}
            onSave={actions.updateAvatar}
          />
        ),
      },
      {
        id: 'settings',
        label: t.tabSettings,
        panel: (
          <ApartmentSettings
            room={apartment.room}
            saving={actions.savingSettings}
            onSave={actions.updateSettings}
          />
        ),
      },
    ];
    body = (
      <div className="flex flex-col gap-6">
        <section
          aria-label={roomName ?? t.title}
          className="flex flex-col gap-2"
        >
          <ApartmentStage
            apartment={apartment}
            specs={specs}
            avatarId={me.avatar.avatarId}
            inventory={me.inventory}
            label={t.apartmentCanvasLabel}
            saveItems={actions.saveItems}
            onSaved={actions.applySavedApartment}
            onConflict={() => void actions.reloadApartment()}
          />
          <p className="flex flex-wrap gap-x-3 text-xs text-[var(--t3,#a39ba6)]">
            <span data-testid="library-apartment-access">
              {apartment.room.access === 'open'
                ? t.apartmentOpen
                : t.apartmentPrivate}
            </span>
            <span>{t.apartmentHint}</span>
          </p>
        </section>
        <LibraryTabs
          tabs={tabs}
          active={tab}
          onChange={(id) => setTab(id as TabId)}
          label={t.panelsLabel}
        />
      </div>
    );
  }

  return (
    <main
      className="pt-header pb-16"
      aria-busy={home.gate === 'loading'}
      data-gate={home.gate}
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {header}
        {body}
      </div>
    </main>
  );
}
