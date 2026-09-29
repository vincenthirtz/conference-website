// features/player/network/ui/DiscoveryScreen.tsx — « Réseau joueuses » sur
// l'archétype LISTE (lot P15).
//
// Annuaire opt-in GLOBAL, INVISIBLE par défaut, DERRIÈRE LE LOGIN : seules
// les joueuses qui ont activé leur visibilité y figurent (jamais d'annuaire
// public ni indexé). Trois onglets, une seule forme de ligne :
//   - « Découvrir » : recherche débouncée (/api/player/discovery/search) ;
//   - « Je suis » / « Mes abonnés » : /api/player/follows?type=….
// Bandeau : tant que la joueuse n'est pas découvrable, il porte
// l'interrupteur lui-même (même écriture que la carte du profil, un PUT qui
// POSE une valeur — un double clic ne produit rien de plus).
//
// PAS EN INSPECTION : le réseau est personnel (routes `subject: 'self'`).

import Link from 'next/link';
import { useState } from 'react';
import Tabs, { tabButtonId, tabPanelId } from '@/components/ui/Tabs';
import Switch from '@/components/ui/Switch';
import { useToast } from '@/components/Toast';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';

import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useDebounce } from '@/hooks/useDebounce';
import {
  Button,
  ButtonLink,
  Card,
  ListSearch,
  rubanErrBox,
  rubanHelp,
  rubanInset,
  rubanStrong,
} from '@/features/ruban';
import { format, useT } from '@/lib/i18n/useT';
import nsPlayerDiscovery from '@/lib/i18n/locales/fr/playerDiscovery';
import { ListeView } from '../../_shared/ui';
import { usePlayerErrorText } from '../../_shared/useErrorText';
import {
  useDirectory,
  useFollowChange,
  useMyDiscoveryCard,
  useUpdateDiscoveryCard,
  type DirectoryTab,
} from '../hooks/useDiscovery';
import { DISCOVERY_ANCHOR } from '../schemas';
import DirectoryPlayerRow from './DirectoryPlayerRow';

export default function DiscoveryScreen() {
  const { isInspecting } = usePlayerArea();
  if (isInspecting) return null;
  return <Discovery />;
}

function Discovery() {
  const t = useT(nsPlayerDiscovery);
  const { addToast } = useToast();
  const errorText = usePlayerErrorText();
  // La coquille redirige la visiteuse non connectée.
  const { user, ready } = usePlayerSession({ redirect: false });

  const [tab, setTab] = useState<DirectoryTab>('discover');
  const [query, setQuery] = useState('');
  const q = useDebounce(query, 300);

  const card = useMyDiscoveryCard(ready);
  const enable = useUpdateDiscoveryCard();
  const list = useDirectory(tab, q, ready);
  const onFollowChange = useFollowChange(tab, q);

  const enableSelf = () => {
    if (enable.isPending) return;
    enable.mutate(
      { discoverable: true },
      {
        onSuccess: () => addToast(t.saved, 'success'),
        onError: (err) => addToast(errorText(err, t.saveError), 'error'),
      }
    );
  };

  const players = list.data?.pages.flatMap((p) => p.players) ?? [];
  const pages = list.data?.pages ?? [];
  const total = pages.length > 0 ? pages[pages.length - 1].total : 0;
  const firstPageFailed = list.isError && !list.data;
  const loadMoreFailed = list.isFetchNextPageError;

  const emptyCopy: Record<DirectoryTab, { title: string; hint: string }> = {
    discover: { title: t.emptyTitle, hint: t.emptyHint },
    following: { title: t.followingEmptyTitle, hint: t.followingEmptyHint },
    followers: { title: t.followersEmptyTitle, hint: t.followersEmptyHint },
  };

  const lead = (
    <>
      <div className="mb-4">
        <ButtonLink href="/player" variant="ghost" size="sm">
          &larr; {t.backToDashboard}
        </ButtonLink>
      </div>
      {card.data?.discoverable === false && (
        <Card
          padding="sm"
          className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className={`text-sm ${rubanStrong}`}>
              {t.notDiscoverableBanner}
            </p>
            <Link
              href={`/player/profile#${DISCOVERY_ANCHOR}`}
              className="mt-1 inline-block text-xs font-medium text-[var(--or-300,#dea3f6)] underline underline-offset-2"
            >
              {t.notDiscoverableCta}
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className={`text-sm font-medium ${rubanStrong}`}>
              {t.masterSwitchLabel}
            </span>
            <Switch
              checked={false}
              disabled={enable.isPending}
              onChange={enableSelf}
              label={t.masterAriaLabel}
            />
          </div>
        </Card>
      )}
      <Tabs
        tabs={[
          { id: 'discover', label: t.tabDiscover },
          { id: 'following', label: t.tabFollowing },
          { id: 'followers', label: t.tabFollowers },
        ]}
        active={tab}
        onChange={(id) => setTab(id as DirectoryTab)}
        ariaLabel={t.tabsAria}
        idBase="discovery"
        variant="segmented"
        className="mb-6"
      />
    </>
  );

  return (
    <div className="pt-header pb-16">
      <ListeView
        title={t.pageTitle}
        subtitle={t.pageSubtitle}
        lead={lead}
        resultsProps={{
          role: 'tabpanel',
          id: tabPanelId('discovery', tab),
          'aria-labelledby': tabButtonId('discovery', tab),
        }}
        search={
          tab === 'discover' ? (
            <ListSearch
              value={query}
              onChange={setQuery}
              placeholder={t.searchPlaceholder}
              label={t.searchLabel}
            />
          ) : undefined
        }
        summary={
          tab === 'discover' && players.length > 0
            ? format(t.resultsCount, { count: total })
            : null
        }
        labels={{
          filters: t.tabsAria,
          closeFilters: t.tabsAria,
          loading: t.loading,
          loadMore: list.isFetchingNextPage
            ? t.loading
            : loadMoreFailed
              ? t.retry
              : t.loadMore,
        }}
        loading={!ready || list.isPending}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={() => void list.fetchNextPage()}
        empty={
          firstPageFailed ? (
            // Un échec ne se déguise pas en « aucun résultat ».
            <div
              role="alert"
              aria-live="assertive"
              className={`${rubanErrBox} p-8 text-center`}
            >
              <p className="text-sm font-medium">{t.listError}</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-4"
                onClick={() => void list.refetch()}
              >
                {t.retry}
              </Button>
            </div>
          ) : (
            <div className={`${rubanInset} p-10 text-center`}>
              <p className={`text-sm font-medium ${rubanStrong}`}>
                {emptyCopy[tab].title}
              </p>
              <p className={`mx-auto max-w-prose ${rubanHelp}`}>
                {emptyCopy[tab].hint}
              </p>
            </div>
          )
        }
        after={
          loadMoreFailed ? (
            <div
              role="alert"
              aria-live="assertive"
              className={`${rubanErrBox} mt-6 text-center`}
            >
              {t.loadMoreError}
            </div>
          ) : null
        }
      >
        {players.map((p) => (
          <DirectoryPlayerRow
            key={p.authUserId}
            player={p}
            currentUserId={user?.id}
            onFollowChange={onFollowChange}
          />
        ))}
      </ListeView>
    </div>
  );
}
