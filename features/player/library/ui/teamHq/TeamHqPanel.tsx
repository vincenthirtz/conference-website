// features/player/library/ui/teamHq/TeamHqPanel.tsx — ce que le QG d'une équipe
// ajoute SOUS la scène (lot 9 de docs/PLAN-womens-library.md). Monté dans
// l'emplacement « Lot 9 » de `ui/room/RoomExtras` ; ne rend RIEN hors d'un QG.
//
//   1. l'équipe (logo, nom) ;
//   2. son prochain match (les données du tableau de bord) et la porte vers
//      son salon Discord (`TeamHqMatch`) ;
//   3. les meubles prêtés et le prêt des miens (`TeamHqFurniture`).
//
// LA SCÈNE NE SE MET PAS À JOUR SEULE : le moteur lit les meubles à l'entrée
// dans la salle (`POST rooms/:id/enter`). Après un prêt, un déplacement ou un
// retour, le panneau est relu tout de suite et propose « Voir le QG à jour »,
// qui recharge la salle. (Une diffusion serveur « meubles changés » sur le
// canal de la salle la remplacerait : c'est au temps réel de la porter.)
//
// SANS LE CACHE JOUEUSE, RIEN. L'écran de la salle est rendu sous le
// `PlayerQueryProvider` de /player/library ; monté hors de lui (un test de
// `RoomExtras` qui ne pose aucun fournisseur), le panneau se tait au lieu de
// lever. Il ne dépend pas du routeur (la salle se recharge par `location`).

import { useContext, useMemo, useState } from 'react';
import { QueryClientContext, useQuery } from '@tanstack/react-query';
import { format, useT } from '@/lib/i18n/useT';
import nsPlayerLibrary from '@/lib/i18n/locales/fr/playerLibrary';
import nsTeamHq from '@/lib/i18n/locales/fr/playerLibraryTeamHq';
import { Button } from '@/features/ruban';
import { PLAYER_QUERY_OPTIONS, usePlayerScope } from '../../../_shared/query';
import { useLibraryClient } from '../../clientContext';
import { libraryKeys } from '../../hooks/useLibraryHome';
import { furnitureName, placementSpecsOf } from '../../model';
import type { LibraryRoomKind } from '../../socialResponses';
import type { TeamHqResult } from '../../teamHq/model';
import { useTeamHqActions, useTeamHqSummary } from '../../teamHq/useTeamHq';
import type { LibraryLentItem } from '../../teamHqResponses';
import { TEXT_ERROR, TEXT_MUTED } from '../social/shared';
import TeamHqFurniture from './TeamHqFurniture';
import TeamHqLogo from './TeamHqLogo';
import TeamHqMatch from './TeamHqMatch';

/** Le catalogue est en code : il ne change qu'au déploiement. */
const CATALOG_STALE_MS = 5 * 60_000;

export type TeamHqPanelProps = {
  room: { id: string; kind: LibraryRoomKind };
  /**
   * Recharger la salle pour voir les meubles à leur nouvelle place. Défaut :
   * recharger la page (une nouvelle entrée, de nouveaux canaux).
   */
  onReloadRoom?: () => void;
};

/** Défaut de « Voir le QG à jour » : une nouvelle entrée, de nouveaux canaux. */
function reloadPage() {
  window.location.reload();
}

export default function TeamHqPanel({ room, onReloadRoom }: TeamHqPanelProps) {
  const queryClient = useContext(QueryClientContext);
  if (room.kind !== 'team_hq' || !queryClient) return null;
  return (
    <TeamHqPanelInner
      roomId={room.id}
      onReloadRoom={onReloadRoom ?? reloadPage}
    />
  );
}

type Notice = { tone: 'ok' | 'error'; text: string } | null;

function TeamHqPanelInner({
  roomId,
  onReloadRoom,
}: {
  roomId: string;
  onReloadRoom: () => void;
}) {
  const t = useT(nsTeamHq);
  const tl = useT(nsPlayerLibrary);
  const scope = usePlayerScope();
  const libraryClient = useLibraryClient();
  // Le même cache que l'écran de la salle : aucune lecture de plus.
  const catalog = useQuery({
    queryKey: libraryKeys.catalog(scope),
    queryFn: () => libraryClient.catalog(),
    staleTime: CATALOG_STALE_MS,
    ...PLAYER_QUERY_OPTIONS,
  });
  const specs = useMemo(
    () => placementSpecsOf(catalog.data?.furniture ?? []),
    [catalog.data]
  );
  const summary = useTeamHqSummary(roomId);
  const actions = useTeamHqActions(roomId);
  const [notice, setNotice] = useState<Notice>(null);
  const [changed, setChanged] = useState(false);

  const nameOf = (key: string) => furnitureName(tl.furniture, key);

  function report<T>(
    result: TeamHqResult<T> | null,
    done: (data: T) => string
  ) {
    if (!result) return; // un geste est déjà en cours
    if (result.ok) {
      setNotice({ tone: 'ok', text: done(result.data) });
      setChanged(true);
    } else {
      setNotice({ tone: 'error', text: t.codes[result.code] });
    }
  }

  const onLend = async (inventoryId: string) =>
    report(await actions.lend({ inventoryId }), (data) =>
      format(t.furniture.done.lent, { name: nameOf(data.item.key) })
    );
  const onMove = async (
    item: LibraryLentItem,
    place: { gx: number; gy: number; rotation: number }
  ) =>
    report(
      await actions.lend({ inventoryId: item.inventoryId, ...place }),
      () => format(t.furniture.done.moved, { name: nameOf(item.key) })
    );
  const onGiveBack = async (item: LibraryLentItem) =>
    report(await actions.giveBack(item.inventoryId), () =>
      format(t.furniture.done.returned, { name: nameOf(item.key) })
    );

  if (summary.isPending) {
    return (
      <p role="status" className={TEXT_MUTED} data-team-hq="loading">
        {t.panel.loading}
      </p>
    );
  }
  if (summary.isError || !summary.data) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-4"
        data-team-hq="error"
      >
        <p className={TEXT_ERROR}>{t.panel.error}</p>
        <Button size="sm" onClick={() => void summary.refetch()}>
          {t.panel.retry}
        </Button>
      </div>
    );
  }

  const data = summary.data;
  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby="team-hq-title"
      data-team-hq="ready"
    >
      <header className="flex items-center gap-3">
        <TeamHqLogo
          src={data.team.logoUrl}
          alt={format(t.panel.logoAlt, { team: data.team.name })}
        />
        <h2
          id="team-hq-title"
          className="text-lg font-bold text-[var(--t1,#f4edf7)]"
        >
          {format(t.panel.title, { team: data.team.name })}
        </h2>
      </header>
      {data.me.staff && <p className={TEXT_MUTED}>{t.panel.staffNote}</p>}

      <TeamHqMatch
        teamName={data.team.name}
        nextMatch={data.nextMatch}
        discordUrl={data.discordUrl}
      />

      <div aria-live="polite" className="flex flex-col gap-2">
        {notice && (
          <p
            className={notice.tone === 'ok' ? TEXT_MUTED : TEXT_ERROR}
            data-team-hq-notice={notice.tone}
          >
            {notice.text}
          </p>
        )}
        {changed && (
          <div className="flex flex-wrap items-center gap-3">
            <p className={TEXT_MUTED}>{t.furniture.changed}</p>
            <Button size="sm" variant="secondary" onClick={onReloadRoom}>
              {t.furniture.refresh}
            </Button>
          </div>
        )}
      </div>

      <TeamHqFurniture
        summary={data}
        specs={specs}
        pending={actions.pending}
        onLend={(id) => void onLend(id)}
        onMove={(item, place) => void onMove(item, place)}
        onGiveBack={(item) => void onGiveBack(item)}
      />
    </section>
  );
}
