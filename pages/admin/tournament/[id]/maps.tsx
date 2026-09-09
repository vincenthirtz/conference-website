// pages/admin/tournament/[id]/maps.tsx
// Gestion du pool de cartes d'un tournoi — pool par défaut ET pool par JOURNÉE.
//
// Une compétition annonce un pool par journée (« Map Pool 23/09 »). La colonne
// `tournament_maps.round_number` le permet en base, mais cet écran ne
// connaissait qu'un pool par tournoi : il affichait toutes les journées
// mélangées et son « supprimer toutes les maps » les effaçait avec le reste.
// Le sélecteur de journée est donc la structure de l'écran, pas un filtre
// d'affichage : TOUTES les actions sont scopées au pool sélectionné.
//
// Les journées viennent du planning (`matches.round_number`), renvoyées par
// l'API : on ne déclare un pool que pour une journée qui existe au calendrier.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import RoundPoolSelector from '@/components/admin/tournament/mapPool/RoundPoolSelector';
import AddMapForm, {
  type SelectableMap,
} from '@/components/admin/tournament/mapPool/AddMapForm';
import MapPoolGrid from '@/components/admin/tournament/mapPool/MapPoolGrid';
import EditMapModal from '@/components/admin/tournament/mapPool/EditMapModal';
import type {
  RoundOption,
  TournamentMapRow,
} from '@/components/admin/tournament/mapPool/types';
import { getGame, type GameDef } from '@/config/games';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTournamentMaps from '@/lib/i18n/locales/admin-fr/adminTournamentMaps';

type Dict = typeof nsAdminTournamentMaps.fr;

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = { staff: StaffShape };

type TournamentMini = {
  id: string;
  name: string | null;
  slug: string | null;
  game: string | null;
};

type ApiResponse = {
  maps: TournamentMapRow[];
  tournament?: TournamentMini | null;
  round?: number | null;
  rounds?: RoundOption[];
};

function getTypeLabels(t: Dict): Record<string, string> {
  return {
    // Overwatch
    control: t.typeControl,
    hybrid: t.typeHybrid,
    escort: t.typeEscort,
    push: t.typePush,
    flashpoint: t.typeFlashpoint,
    clash: t.typeClash,
    // Valorant
    standard: t.typeStandard,
    // CS2
    'active-duty': t.typeActiveDuty,
  };
}

/** `?round=` à ajouter à l'URL de l'API. Vide pour le pool par défaut. */
function roundQuery(round: number | null): string {
  return round === null ? '' : `round=${round}`;
}

function withRound(url: string, round: number | null): string {
  const q = roundQuery(round);
  if (!q) return url;
  return url.includes('?') ? `${url}&${q}` : `${url}?${q}`;
}

export const getServerSideProps = withStaffPage({ permission: 'manage_tournaments' });

function AdminTournamentMapsPage(_: StaffProps) {
  const t = useAdminT(nsAdminTournamentMaps);
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;
  const { adminFetchJson } = useAdminFetch();
  const { mutate: addMapMutate } = useIdempotentMutation();
  const { mutate: addAllMapsMutate } = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [maps, setMaps] = useState<TournamentMapRow[]>([]);
  const [tournament, setTournament] = useState<TournamentMini | null>(null);

  // Pool édité : `null` = pool par défaut du tournoi.
  //
  // La journée vit dans l'URL, pas dans un état local : un rafraîchissement ou
  // un lien partagé rouvre le même pool, et le retour arrière du navigateur
  // fait ce qu'on attend de lui.
  const round = useMemo(() => {
    const raw = router.query.round;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value || !/^\d+$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
  }, [router.query.round]);

  const [rounds, setRounds] = useState<RoundOption[]>([]);
  const [defaultCount, setDefaultCount] = useState(0);
  // Cartes du pool par défaut : source des propositions pour une journée.
  const [defaultPool, setDefaultPool] = useState<TournamentMapRow[]>([]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addingAll, setAddingAll] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingMap, setEditingMap] = useState<TournamentMapRow | null>(null);
  const [updating, setUpdating] = useState(false);

  const typeLabels = useMemo(() => getTypeLabels(t), [t]);

  /**
   * Charge le pool demandé. Le pool par défaut est chargé EN PLUS dès qu'on
   * édite une journée : c'est lui qui alimente les propositions d'ajout, une
   * journée ne pouvant piocher que dans les cartes retenues pour la compétition.
   */
  const fetchMaps = useCallback(
    async (target: number | null) => {
      if (!tournamentId) return;
      setLoading(true);
      setErrorMsg(null);
      try {
        const base = `/api/tournament/${tournamentId}/maps`;
        const json = await adminFetchJson<ApiResponse>(withRound(base, target));
        setMaps(json.maps || []);
        setTournament(json.tournament ?? null);
        setRounds(json.rounds ?? []);

        if (target === null) {
          setDefaultPool(json.maps || []);
          setDefaultCount((json.maps || []).length);
        } else {
          const def = await adminFetchJson<ApiResponse>(base);
          setDefaultPool(def.maps || []);
          setDefaultCount((def.maps || []).length);
        }
      } catch (err: unknown) {
        setErrorMsg((err as Error)?.message || t.errorLoad);
      } finally {
        setLoading(false);
      }
    },
    [tournamentId, adminFetchJson, t]
  );

  useEffect(() => {
    if (!tournamentId) return;
    fetchMaps(round);
  }, [tournamentId, round, fetchMaps]);

  const gameDef: GameDef | null = tournament?.game
    ? getGame(tournament.game)
    : null;
  const gameLabel = gameDef?.label ?? tournament?.game ?? '';
  const hasMapVeto = !!gameDef?.hasMapVeto;
  const editingRound = round !== null;
  const roundLabel =
    rounds.find((r) => r.round === round)?.label ??
    (round !== null ? `J${round}` : t.roundDefaultPool);

  /**
   * Cartes proposables pour le pool édité, privées de celles déjà présentes.
   * Pour une journée, la source est le pool par défaut du tournoi ; pour le
   * pool par défaut, le catalogue du jeu.
   */
  const availableMaps: SelectableMap[] = useMemo(() => {
    const source: SelectableMap[] = editingRound
      ? defaultPool.map((m) => ({
          name: m.map_name,
          type: m.map_type ?? '',
          image: m.image_url ?? '',
        }))
      : (gameDef?.mapPool ?? []).map((m) => ({
          name: m.name,
          type: m.type ?? '',
          image: m.image ?? '',
        }));
    return source.filter((s) => !maps.some((m) => m.map_name === s.name));
  }, [editingRound, defaultPool, gameDef, maps]);

  // Une journée peut piocher dans le pool du tournoi même si le jeu n'a pas de
  // catalogue prédéfini : la liste de propositions suffit.
  const canPickFromList = editingRound ? defaultPool.length > 0 : hasMapVeto;

  const formatDay = useCallback((day: string) => {
    // `YYYY-MM-DD` est déjà calculé à Paris côté serveur : on le découpe, sans
    // repasser par un Date qui le ramènerait dans le fuseau du navigateur.
    const [, month, dayOfMonth] = day.split('-');
    return month && dayOfMonth ? `${dayOfMonth}/${month}` : day;
  }, []);

  async function handleAddMap(map: { name: string; type: string; image: string }) {
    if (!tournamentId) return;
    setAdding(true);
    setErrorMsg(null);
    try {
      const res = await addMapMutate(
        withRound(`/api/tournament/${tournamentId}/maps`, round),
        {
          method: 'POST',
          body: JSON.stringify({
            map_name: map.name,
            map_type: map.type,
            image_url: map.image || null,
            enabled: true,
          }),
        }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errorAdd);
      }
      setShowAddForm(false);
      await fetchMaps(round);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.errorAdd);
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteMap(mapId: string) {
    if (!tournamentId) return;
    const ok = await confirm({ title: t.confirmDeleteMap, variant: 'danger' });
    if (!ok) return;
    setDeleting(mapId);
    setErrorMsg(null);
    try {
      await adminFetchJson(
        `/api/tournament/${tournamentId}/maps?mapId=${mapId}`,
        { method: 'DELETE' }
      );
      await fetchMaps(round);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.errorDelete);
    } finally {
      setDeleting(null);
    }
  }

  async function handleDeleteAllMaps() {
    if (!tournamentId) return;
    // Le libellé NOMME le pool visé : la même action détruisait auparavant les
    // pools de toutes les journées sans le dire.
    const ok = await confirm({
      title: format(t.confirmDeleteAllScoped, { pool: roundLabel }),
      variant: 'danger',
    });
    if (!ok) return;
    setErrorMsg(null);
    try {
      await adminFetchJson(
        withRound(`/api/tournament/${tournamentId}/maps`, round),
        { method: 'DELETE' }
      );
      await fetchMaps(round);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.errorDelete);
    }
  }

  async function handleUpdateMap(patch: {
    map_name: string;
    map_type: string;
    image_url: string | null;
  }) {
    if (!tournamentId || !editingMap) return;
    setUpdating(true);
    setErrorMsg(null);
    try {
      await adminFetchJson(
        `/api/tournament/${tournamentId}/maps?mapId=${editingMap.id}`,
        { method: 'PATCH', body: JSON.stringify(patch) }
      );
      setEditingMap(null);
      await fetchMaps(round);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.errorUpdate);
    } finally {
      setUpdating(false);
    }
  }

  async function handleAddAllMaps() {
    if (!tournamentId) return;
    const ok = await confirm({
      title: editingRound
        ? format(t.confirmFillRound, { round: roundLabel })
        : format(t.confirmAddAll, { game: gameLabel }),
      variant: 'info',
    });
    if (!ok) return;
    setAddingAll(true);
    setErrorMsg(null);
    try {
      const res = await addAllMapsMutate(
        withRound(`/api/tournament/${tournamentId}/maps`, round),
        { method: 'POST', body: JSON.stringify({ defaults: true }) }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errorAddAll);
      }
      const json = (await res.json().catch(() => ({}))) as { imported?: number };
      if ((json.imported ?? 0) === 0) {
        addToast(t.alertAllMapsPresent, 'info');
      }
      await fetchMaps(round);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.errorAddAll);
    } finally {
      setAddingAll(false);
    }
  }

  return (
    <>
      <Head>
        <title>{t.headTitle}</title>
      </Head>
      <div className="min-h-screen bg-neutral-950 text-white pt-24">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <TournamentTabsNav
            tournamentId={String(tournamentId ?? '')}
            active="settings"
          />
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-purple-200/80">
                {t.eyebrow}
              </p>
              <h1 className="text-2xl font-semibold flex items-center gap-3">
                <span>
                  {format(t.pageTitle, {
                    name: tournament?.name || t.defaultTournamentName,
                  })}
                </span>
                {tournament?.game && (
                  <span
                    className="px-2 py-0.5 rounded-full text-xs border border-purple-400/40 bg-purple-500/10 text-purple-200 font-normal"
                    title={format(t.slugTitle, { slug: tournament.game })}
                  >
                    {format(t.gameBadge, { game: gameLabel })}
                  </span>
                )}
              </h1>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/admin/tournament/${tournamentId}/bracket?tab=map-draw`}
                className="px-3 py-1.5 rounded-lg bg-purple-600/80 border border-purple-500/30 text-sm hover:bg-purple-600"
              >
                {t.linkMapDraw}
              </Link>
              <Link
                href={`/admin/tournament/${tournamentId}/matches`}
                className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-sm hover:bg-white/15"
              >
                {t.linkMatches}
              </Link>
              <button
                onClick={() => fetchMaps(round)}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10"
              >
                {t.refresh}
              </button>
            </div>
          </div>

          <RoundPoolSelector
            rounds={rounds}
            value={round}
            onChange={(next) => {
              setShowAddForm(false);
              const query = { ...router.query };
              if (next === null) delete query.round;
              else query.round = String(next);
              // `shallow` : seul le paramètre change, pas la session staff
              // rechargée par getServerSideProps.
              router.replace({ pathname: router.pathname, query }, undefined, {
                shallow: true,
              });
            }}
            defaultCount={defaultCount}
            disabled={loading}
            formatDay={formatDay}
            labels={{
              legend: t.roundSelectorLegend,
              defaultPool: t.roundDefaultPool,
              defaultPoolHint: t.roundDefaultPoolHint,
              mapsCount: t.roundMapsCount,
              inheritsDefault: t.roundInheritsDefault,
              noRounds: t.roundNoneScheduled,
            }}
          />

          {editingRound && (
            <div className="mb-6 p-3 rounded-lg bg-purple-500/10 border border-purple-400/30 text-purple-100 text-sm">
              {format(t.roundScopeNotice, { round: roundLabel })}
            </div>
          )}

          {loading && (
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              {t.loading}
            </div>
          )}

          {errorMsg && !loading && (
            <div className="p-4 rounded-lg bg-red-900/60 border border-red-500/40 text-red-100">
              {errorMsg}
            </div>
          )}

          {!loading && (
            <>
              <div className="mb-6 flex flex-wrap gap-2">
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm transition-colors"
                >
                  {showAddForm ? t.cancelAddToggle : t.addMapToggle}
                </button>
                {canPickFromList && availableMaps.length > 0 && (
                  <button
                    onClick={handleAddAllMaps}
                    disabled={addingAll}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
                  >
                    {addingAll
                      ? t.addingAll
                      : editingRound
                        ? format(t.fillRoundFromDefault, {
                            count: availableMaps.length,
                          })
                        : format(t.addAllMaps, {
                            game: gameLabel,
                            count: availableMaps.length,
                          })}
                  </button>
                )}
                {maps.length > 0 && (
                  <button
                    onClick={handleDeleteAllMaps}
                    className="px-4 py-2 rounded-lg bg-red-600/80 hover:bg-red-700 text-white font-medium text-sm transition-colors"
                  >
                    {format(t.deleteAllMapsScoped, { pool: roundLabel })}
                  </button>
                )}
              </div>

              {showAddForm && (
                <AddMapForm
                  available={availableMaps}
                  hasMapVeto={canPickFromList}
                  gameLabel={gameLabel}
                  hasGameDef={!!gameDef}
                  typeLabels={typeLabels}
                  adding={adding}
                  onSubmit={handleAddMap}
                  onCancel={() => setShowAddForm(false)}
                  onError={(msg) => addToast(msg, 'error')}
                  labels={{
                    addMapTitle: t.addMapTitle,
                    noVetoGame: t.noVetoGame,
                    noPredefinedPool: t.noPredefinedPool,
                    canAddCustom: t.canAddCustom,
                    mapGameToggle: editingRound
                      ? t.mapRoundPoolToggle
                      : t.mapGameToggle,
                    mapCustomToggle: t.mapCustomToggle,
                    selectMapLabel: editingRound
                      ? t.selectMapFromDefaultLabel
                      : t.selectMapLabel,
                    chooseMapPlaceholder: t.chooseMapPlaceholder,
                    mapNameLabel: t.mapNameLabel,
                    mapNamePlaceholder: t.mapNamePlaceholder,
                    mapTypeLabel: t.mapTypeLabel,
                    imageUrlLabel: t.imageUrlLabel,
                    imageUrlPlaceholder: t.imageUrlPlaceholder,
                    addButton: t.addButton,
                    adding: t.addingAll,
                    cancel: t.cancel,
                    alertEnterMapName: t.alertEnterMapName,
                    alertSelectMap: t.alertSelectMap,
                    typeControl: t.typeControl,
                    typeEscort: t.typeEscort,
                    typeHybrid: t.typeHybrid,
                    typePush: t.typePush,
                    typeFlashpoint: t.typeFlashpoint,
                  }}
                />
              )}
            </>
          )}

          {!loading && !errorMsg && maps.length === 0 && (
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              {editingRound ? format(t.emptyRoundPool, { round: roundLabel }) : t.emptyMaps}
            </div>
          )}

          {maps.length > 0 && (
            <MapPoolGrid
              maps={maps}
              typeLabels={typeLabels}
              deletingId={deleting}
              onEdit={setEditingMap}
              onDelete={handleDeleteMap}
              labels={{
                editTitle: t.editTitle,
                deleteTitle: t.deleteTitle,
                enabled: t.enabled,
                disabled: t.disabled,
                orderLabel: t.orderLabel,
              }}
            />
          )}

          <EditMapModal
            map={editingMap}
            updating={updating}
            onClose={() => setEditingMap(null)}
            onSave={handleUpdateMap}
            labels={{
              editMapTitle: t.editMapTitle,
              mapNameLabel: t.mapNameLabel,
              mapTypeLabel: t.mapTypeLabel,
              imagePreviewLabel: t.imagePreviewLabel,
              previewAlt: t.previewAlt,
              changeImageLabel: t.changeImageLabel,
              imageFormatHint: t.imageFormatHint,
              orEnterUrlLabel: t.orEnterUrlLabel,
              imageUrlPlaceholder: t.imageUrlPlaceholder,
              cancel: t.cancel,
              save: t.save,
              updating: t.updating,
              typeControl: t.typeControl,
              typeEscort: t.typeEscort,
              typeHybrid: t.typeHybrid,
              typePush: t.typePush,
              typeFlashpoint: t.typeFlashpoint,
            }}
          />

          {dialog}
        </div>
      </div>
    </>
  );
}

export default AdminTournamentMapsPage;
