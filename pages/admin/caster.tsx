// pages/admin/caster.tsx
//
// Feature: Cockpit caster web — lots 1-7.
//
// Édition web de la table `caster_scenes` (Supabase, partagée avec l'app
// desktop womenscup-caster) : liste des scènes triées par sort_order à gauche,
// éditeur de la scène sélectionnée à droite. Les 12 types de scènes ont leur
// éditeur (registry EDITORS), y compris les 4 scènes « données du site » du
// lot 6 (bracket, player, leaderboard, standings) qui ne stockent qu'une
// référence et laissent l'overlay lire l'API publique.
//
// Lot 7 — trois ajouts :
//
//  - CRUD DE LA LISTE (SceneList) : créer par type, renommer, dupliquer,
//    supprimer, monter/descendre. Les écritures vivent dans useCasterScenes,
//    la logique pure dans utils/caster/sceneCrud.ts + sceneReorder.ts. Avant ce
//    lot il fallait ouvrir l'app desktop pour créer ou supprimer une scène.
//  - APERÇU LIVE (OverlayPreview) : iframe sur la vraie page overlay de la
//    scène éditée (par UUID), à l'échelle. Zéro plomberie : l'overlay est déjà
//    en Realtime, un changement d'éditeur s'y voit tout seul.
//  - ONGLETS (Tabs + useQueryTab, comme /admin/moderation et les autres hubs) :
//    Scènes · OBS · Chat & MVP · Habillage, deep-linkables via `?tab=`.
//
//    ⚠️ Les quatre panneaux sont TOUJOURS MONTÉS et seulement masqués en CSS
//    (`hidden`), jamais démontés :
//      · CasterChatSection tient la WebSocket IRC + EventSub et l'état du poll
//        MVP — un démontage couperait le chat et perdrait les votes en cours ;
//      · ObsPanel tient la WebSocket OBS — un démontage couperait le pilotage
//        en pleine émission ;
//      · l'éditeur de scène et ThemePanel ont un auto-save DÉBOUNCÉ — un
//        démontage juste après une frappe perdrait la dernière saisie.
//    Le coût (quatre arbres React montés) est négligeable devant ces risques.
//
// Synchro : useCasterScenes (chargement + Realtime + saveSceneData). Le badge
// RealtimeStatusBadge reflète l'état du canal (SUBSCRIBED = temps réel, sinon
// mode dégradé). L'anti-clobber du draft en cours d'édition est géré dans
// MatchSceneEditor (remonté via key={scene.id} au changement de sélection).
//
// Lot 5 — deux ajouts branchés ici :
//
//  - MATCH PICKER (scènes `match` / `results`) : useCasterTournaments lit les GET
//    publics /api/caster/v1/*, MatchPickerPanel choisit, et l'import écrit la
//    scène via saveSceneData (buildSceneDataFromMatch). Le map pool du tournoi
//    descend dans MatchSceneEditor (prop tournamentMaps). Le score des matchs
//    liés est suivi par useLinkedMatchTracker — en POLLING (~10 s) et non en
//    Realtime : `public.matches` n'est pas dans la publication
//    `supabase_realtime`, donc postgres_changes ne livrerait jamais rien (détail
//    dans l'en-tête du hook).
//  - PRÉSENCE MULTI-CASTER : useCasterPresence sur le canal Realtime Presence
//    `caster_presence`, le MÊME que l'app desktop → les deux cockpits se voient.
//    Indicateur consultatif dans la liste des scènes + bandeau d'édition
//    simultanée dans le panneau. Aucun verrou dur.
//
// Gate SSR : réplique de /admin/regie — tout staff (caster/admin/owner) via
// requireStaffRoleFromRequest(_, 'caster') + baseProps { staff,
// activeTenantKind } comme withStaffPage (voir getServerSideProps en bas).

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import type { GetServerSideProps, GetServerSidePropsContext } from 'next';

import EmptyState from '@/components/admin/EmptyState';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import RealtimeStatusBadge from '@/components/admin/RealtimeStatusBadge';
import Tabs, {
  useQueryTab,
  tabPanelId,
  tabButtonId,
} from '@/components/admin/Tabs';
import CasterCollabBanner from '@/components/admin/caster/CasterCollabBanner';
import CasterPresenceBar from '@/components/admin/caster/CasterPresenceBar';
import BracketSceneEditor from '@/components/admin/caster/BracketSceneEditor';
import EndSceneEditor from '@/components/admin/caster/EndSceneEditor';
import LeaderboardSceneEditor from '@/components/admin/caster/LeaderboardSceneEditor';
import MatchPickerPanel from '@/components/admin/caster/MatchPickerPanel';
import MatchSceneEditor from '@/components/admin/caster/MatchSceneEditor';
import MvpSceneEditor from '@/components/admin/caster/MvpSceneEditor';
import OverlayPreview from '@/components/admin/caster/OverlayPreview';
import PauseSceneEditor from '@/components/admin/caster/PauseSceneEditor';
import PlayerSceneEditor from '@/components/admin/caster/PlayerSceneEditor';
import ResultsSceneEditor from '@/components/admin/caster/ResultsSceneEditor';
import SceneList from '@/components/admin/caster/SceneList';
import ScrimSceneEditor from '@/components/admin/caster/ScrimSceneEditor';
import StandingsSceneEditor from '@/components/admin/caster/StandingsSceneEditor';
import StartingSceneEditor from '@/components/admin/caster/StartingSceneEditor';
import ThemePanel from '@/components/admin/caster/ThemePanel';
import WebcamSceneEditor from '@/components/admin/caster/WebcamSceneEditor';
import { useToast } from '@/components/Toast';
import { useCasterPresence } from '@/hooks/useCasterPresence';
import { useCasterScenes } from '@/hooks/useCasterScenes';
import { useCasterTheme } from '@/hooks/useCasterTheme';
import { useCasterTournaments } from '@/hooks/useCasterTournaments';
import { useLinkedMatchTracker } from '@/hooks/useLinkedMatchTracker';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { logger } from '@/utils/logger';
import { logCasterAction } from '@/utils/caster/auditClient';
import { buildSceneDataFromMatch } from '@/utils/caster/matchPickerFormat';
import { othersBySceneId } from '@/utils/caster/presence';
import { fetchCasterMatchDetail } from '@/utils/caster/tournamentsClient';
import {
  CASTER_SCENE_TYPES,
  type CasterApiMatch,
  type CasterScene,
  type CasterSceneType,
} from '@/types/caster';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import {
  requireStaffRoleFromRequest,
  StaffUnauthenticatedError,
  StaffUnauthorizedError,
} from '@/utils/staff';

// Panneau OBS (lot 3) : WebSocket direct navigateur → OBS local + localStorage
// — browser-only, donc chargé côté client uniquement (ssr:false).
const ObsPanel = dynamic(() => import('@/components/admin/caster/ObsPanel'), {
  ssr: false,
});

// Chat Twitch + poll MVP (lot 4) : WebSocket IRC anonyme + EventSub — browser
// only. Monté au niveau PAGE (hors du panneau d'édition) pour que la connexion
// chat et les votes en cours survivent au changement de scène sélectionnée.
const CasterChatSection = dynamic(
  () => import('@/components/admin/caster/CasterChatSection'),
  { ssr: false }
);

type SceneEditorProps = {
  scene: CasterScene;
  onSave: (sceneId: string, data: Record<string, unknown>) => Promise<void>;
  /** Map pool du tournoi sélectionné — seul MatchSceneEditor l'exploite. */
  tournamentMaps?: Array<{ map_name: string }> | null;
};

/** Staff authentifié, fourni par le gate SSR (voir getServerSideProps). */
type StaffProp = { id: string; role: string; display_name: string | null };

type PageProps = { staff: StaffProp };

/** Base des ids ARIA des onglets (Tabs / tabPanelId / tabButtonId). */
const ID_BASE = 'admin-caster';

/** Types de scènes pilotés par un match du site (match picker). */
const TOURNAMENT_SCENE_TYPES: readonly CasterSceneType[] = ['match', 'results'];

function isTournamentScene(scene: CasterScene | null): boolean {
  return !!scene && TOURNAMENT_SCENE_TYPES.includes(scene.type);
}

/** `data.matchId` d'une scène, si c'est bien une chaîne non vide. */
function linkedMatchIdOf(scene: CasterScene): string | null {
  const id = scene.data?.matchId;
  return typeof id === 'string' && id ? id : null;
}

// Registry type de scène → éditeur : les 8 types du lot 2 + les 4 scènes
// « données du site » du lot 6 (bracket, player, leaderboard, standings). Le
// Record est EXHAUSTIF sur CasterSceneType : ajouter un type dans types/caster.ts
// sans son éditeur casse le typecheck (garde-fou volontaire) — le placeholder ne
// sert plus qu'aux lignes d'un type inconnu venues d'une base plus récente.
const EDITORS: Record<CasterSceneType, ComponentType<SceneEditorProps>> = {
  starting: StartingSceneEditor,
  match: MatchSceneEditor,
  pause: PauseSceneEditor,
  results: ResultsSceneEditor,
  end: EndSceneEditor,
  mvp: MvpSceneEditor,
  scrim: ScrimSceneEditor,
  webcam: WebcamSceneEditor,
  bracket: BracketSceneEditor,
  player: PlayerSceneEditor,
  leaderboard: LeaderboardSceneEditor,
  standings: StandingsSceneEditor,
};

function CasterScenesPage({ staff }: PageProps) {
  const t = useAdminT('adminCasterScenes');
  const { addToast } = useToast();

  // Badge temps réel : SUBSCRIBED = frais ; sinon la page vit sur le dernier
  // état chargé (mode dégradé). Callback STABLE (useCallback) sinon le canal
  // Supabase se re-souscrit à chaque render.
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const onStatus = useCallback((status: string) => {
    setRealtimeConnected(status === 'SUBSCRIBED');
  }, []);

  const {
    scenes,
    loading,
    error,
    reload,
    saveSceneData,
    createScene,
    renameScene,
    duplicateScene,
    deleteScene,
    reorderScenes,
  } = useCasterScenes({ onStatus });

  // Mutateurs de la liste passés à SceneList (qui orchestre confirm/toast/audit).
  // Regroupés dans un objet mémoïsé : les callbacks du hook sont stables.
  const crud = useMemo(
    () => ({
      createScene,
      renameScene,
      duplicateScene,
      deleteScene,
      reorderScenes,
    }),
    [createScene, renameScene, duplicateScene, deleteScene, reorderScenes]
  );

  // Habillage des overlays (lot 5) — table `caster_themes`. Canal Realtime
  // distinct de celui des overlays pour ne pas mélanger les abonnements.
  const {
    themes,
    activeId: activeThemeId,
    reload: reloadThemes,
  } = useCasterTheme({ channel: 'caster-themes-admin' });

  // Sélection : la première scène par défaut ; repli sur la première si la
  // scène sélectionnée disparaît (suppression côté app desktop).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = scenes.find((s) => s.id === selectedId) ?? scenes[0] ?? null;

  // Cible de publication du tally MVP (lot 4) — indépendante de la sélection.
  const mvpScene = scenes.find((s) => s.type === 'mvp') ?? null;

  // Origin côté client uniquement (SSR n'a pas window) pour l'URL overlay.
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  /* ---------------------------------------------------------------------- *
   * Lot 5 — match picker + score live des scènes liées
   * ---------------------------------------------------------------------- */

  // Le picker n'est utile que sur les scènes pilotées par un match ; les reads
  // ne partent donc qu'à partir de la première sélection d'une telle scène. Le
  // hook reste monté ensuite (état conservé quand on navigue ailleurs).
  const [pickerUsed, setPickerUsed] = useState(false);
  const showPicker = isTournamentScene(selected);
  useEffect(() => {
    if (showPicker) setPickerUsed(true);
  }, [showPicker]);
  const picker = useCasterTournaments({ enabled: pickerUsed });

  // Scènes lues dans des callbacks stables (pas au render) → latest-ref.
  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;

  // Tous les matchs liés à une scène match/results : le score de chacun est
  // suivi, pas seulement celui de la scène affichée — l'overlay d'une scène non
  // sélectionnée est peut-être justement celui à l'antenne.
  const linkedMatchIds = useMemo(
    () =>
      scenes
        .filter((s) => TOURNAMENT_SCENE_TYPES.includes(s.type))
        .map(linkedMatchIdOf)
        .filter((id): id is string => !!id),
    [scenes]
  );

  // Écrit le score relu dans TOUTES les scènes liées à ce match. On n'écrit que
  // sur différence réelle : sans ça, chaque tour de poll produirait un UPDATE
  // Supabase (donc un écho Realtime) pour rien.
  const applyLiveScore = useCallback(
    async (match: CasterApiMatch) => {
      const score1 = match.team1_score || 0;
      const score2 = match.team2_score || 0;
      for (const scene of scenesRef.current) {
        if (!TOURNAMENT_SCENE_TYPES.includes(scene.type)) continue;
        if (linkedMatchIdOf(scene) !== match.id) continue;
        if (
          Number(scene.data?.score1) === score1 &&
          Number(scene.data?.score2) === score2
        ) {
          continue;
        }
        try {
          await saveSceneData(scene.id, { ...scene.data, score1, score2 });
        } catch (err) {
          logger.error('[admin/caster] live score write error', err);
        }
      }
    },
    [saveSceneData]
  );

  const { tracked: trackedMatches } = useLinkedMatchTracker({
    matchIds: linkedMatchIds,
    onMatchUpdate: applyLiveScore,
  });

  // Import d'un match dans la scène affichée (bouton du picker). Le contexte
  // saisi par le caster est préservé (buildSceneDataFromMatch spread la data).
  const importMatch = useCallback(
    async (matchId: string) => {
      const target = scenesRef.current.find((s) => s.id === selected?.id);
      if (!target) return;
      try {
        const { match, games } = await fetchCasterMatchDetail(matchId);
        if (!match) throw new Error('404');
        await saveSceneData(
          target.id,
          buildSceneDataFromMatch({
            sceneType: target.type,
            prev: target.data,
            match,
            games,
          })
        );
        addToast(
          format(t.pickerImportSuccess, { scene: target.name }),
          'success'
        );
        // Journal (lot 5) : APRÈS le succès uniquement. Un import réécrit une
        // scène potentiellement à l'antenne — c'est exactement ce qu'on veut
        // pouvoir retracer.
        logCasterAction({
          action: 'caster_match_import',
          entityId: target.id,
          details: {
            scene: target.name,
            sceneType: target.type,
            matchId,
            team1: match.team1?.name ?? null,
            team2: match.team2?.name ?? null,
          },
        });
      } catch (err) {
        logger.error('[admin/caster] import match error', err);
        addToast(
          format(t.pickerImportError, {
            message: (err as Error)?.message || '',
          }),
          'error'
        );
      }
    },
    [selected?.id, saveSceneData, addToast, t]
  );

  /** Coupe le lien (matchId → null) : retour à la saisie manuelle du score. */
  const detachMatch = useCallback(async () => {
    const target = scenesRef.current.find((s) => s.id === selected?.id);
    if (!target) return;
    try {
      await saveSceneData(target.id, { ...target.data, matchId: null });
      addToast(t.pickerDetachSuccess, 'success');
    } catch (err) {
      logger.error('[admin/caster] detach match error', err);
      addToast(
        format(t.pickerDetachError, { message: (err as Error)?.message || '' }),
        'error'
      );
    }
  }, [selected?.id, saveSceneData, addToast, t]);

  /* ---------------------------------------------------------------------- *
   * Lot 5 — présence multi-caster (canal partagé avec l'app desktop)
   * ---------------------------------------------------------------------- */

  const { users: presenceUsers, connected: presenceConnected } =
    useCasterPresence({
      staffId: staff?.id ?? null,
      displayName: staff?.display_name || staff?.id || '',
      role: staff?.role || '',
      // Contrat desktop : activeScene = **id** de la scène éditée.
      activeScene: selected?.id ?? null,
    });

  const othersByScene = useMemo(
    () => othersBySceneId(presenceUsers, staff?.id ?? null),
    [presenceUsers, staff?.id]
  );
  const sceneNameById = useMemo(
    () => Object.fromEntries(scenes.map((s) => [s.id, s.name])),
    [scenes]
  );

  const typeLabels: Record<CasterSceneType, string> = {
    starting: t.typeStarting,
    match: t.typeMatch,
    pause: t.typePause,
    results: t.typeResults,
    end: t.typeEnd,
    mvp: t.typeMvp,
    scrim: t.typeScrim,
    webcam: t.typeWebcam,
    bracket: t.typeBracket,
    player: t.typePlayer,
    leaderboard: t.typeLeaderboard,
    standings: t.typeStandings,
  };
  const typeLabel = (type: string) =>
    typeLabels[type as CasterSceneType] ?? type;

  // URL Browser Source de l'overlay hébergé — /overlay/caster/<type> pour
  // chacun des 12 types portés (la route [sceneKey] accepte le type ou l'UUID).
  const overlayUrl =
    selected &&
    origin &&
    (CASTER_SCENE_TYPES as readonly string[]).includes(selected.type)
      ? `${origin}/overlay/caster/${selected.type}`
      : '';

  async function copyOverlayUrl() {
    if (!overlayUrl) return;
    try {
      await navigator.clipboard.writeText(overlayUrl);
      addToast(t.copied, 'success');
    } catch {
      addToast(t.copyFailed, 'error');
    }
  }

  /* ---------------------------------------------------------------------- *
   * Lot 7 — onglets (`?tab=`), même motif que les autres hubs admin
   * ---------------------------------------------------------------------- */
  const tabs = useMemo(
    () => [
      { id: 'scenes', label: t.tabScenes },
      { id: 'obs', label: t.tabObs },
      { id: 'chat', label: t.tabChat },
      { id: 'theme', label: t.tabTheme },
    ],
    [t]
  );
  const [activeTab, setActiveTab] = useQueryTab(tabs);

  /** Attributs d'un panneau : masqué en CSS, JAMAIS démonté (voir l'en-tête). */
  const panelProps = (id: string) => ({
    role: 'tabpanel',
    id: tabPanelId(ID_BASE, id),
    'aria-labelledby': tabButtonId(ID_BASE, id),
    hidden: activeTab !== id,
    className: activeTab === id ? undefined : 'hidden',
  });

  return (
    <>
      <Head>
        <title>{t.docTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-black text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12">
          {/* En-tête */}
          <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-extrabold tracking-tight">
                  {t.heading}
                </h1>
                <RealtimeStatusBadge
                  connected={realtimeConnected}
                  connectedLabel={t.realtimeConnected}
                  degradedLabel={t.realtimeDegraded}
                />
              </div>
              <p className="text-sm text-neutral-400 mt-1">{t.subtitle}</p>
            </div>

            {/* Présence multi-caster (canal partagé avec l'app desktop). */}
            <CasterPresenceBar
              users={presenceUsers}
              selfStaffId={staff?.id ?? null}
              sceneNameById={sceneNameById}
              connected={presenceConnected}
            />
          </div>

          {/* Erreur de chargement (bandeau + retry, non bloquant) */}
          {error && (
            <div className="mb-4 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2">
              <span>{format(t.loadError, { message: error })}</span>
              <button
                type="button"
                onClick={() => void reload()}
                className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium"
              >
                {t.retry}
              </button>
            </div>
          )}

          <Tabs
            tabs={tabs}
            active={activeTab}
            onChange={setActiveTab}
            ariaLabel={t.tabsAriaLabel}
            idBase={ID_BASE}
            className="mb-6"
          />

          {/* --- Onglet « Scènes » : liste + CRUD, aperçu, match picker, éditeur */}
          <div {...panelProps('scenes')}>
            {loading ? (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 py-16">
                <LoadingSpinner label={t.loadingScenes} />
              </div>
            ) : (
              // `minmax(0,1fr)` et non `1fr` : l'iframe d'aperçu fait
              // physiquement 1920 px de large, et `1fr` = `minmax(auto,1fr)`
              // laisserait son min-content faire exploser la colonne (l'échelle
              // convergerait alors vers 1 et le panneau déborderait de l'écran).
              <div className="grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] gap-4 items-start">
                {/* Colonne gauche : liste + CRUD (tri sort_order via le hook).
                    Rendue même sur liste vide : c'est elle qui porte le bouton
                    « + Nouvelle scène ». */}
                <SceneList
                  scenes={scenes}
                  selectedId={selected?.id ?? null}
                  onSelect={setSelectedId}
                  othersByScene={othersByScene}
                  typeLabel={typeLabel}
                  crud={crud}
                />

                {/* Panneau droit : éditeur de la scène sélectionnée */}
                {/* `min-w-0` : même raison que le minmax ci-dessus — sans lui,
                    l'iframe 1920 px imposerait sa largeur au panneau. */}
                <section
                  className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4"
                  data-testid="caster-scene-panel"
                >
                  {selected ? (
                    <>
                      <div className="flex items-center gap-2 mb-4">
                        <h2 className="text-lg font-bold truncate">
                          {selected.name}
                        </h2>
                        <span className="shrink-0 rounded-full border border-neutral-700 bg-neutral-950/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
                          {typeLabel(selected.type)}
                        </span>
                      </div>

                      {/* Aperçu live (lot 7) : vraie page overlay en iframe,
                          ciblée par UUID. PAS de key={selected.id} ici : ce
                          serait la même clé que l'éditeur plus bas (frères dans
                          le même fragment ⇒ collision, React duplique/omet des
                          enfants). Le composant gère lui-même le changement de
                          scène (clé interne de l'iframe), et garder l'instance
                          préserve le pli/dépli et l'échelle mesurée. */}
                      <OverlayPreview scene={selected} />

                      {/* URL Browser Source (overlay hébergé) — type match. */}
                      {overlayUrl && (
                        <div className="mb-4 rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2.5">
                          <p className="text-[11px] text-neutral-500 mb-1.5">
                            {t.overlayUrlLabel}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <code className="text-xs text-cyan-200 break-all">
                              {overlayUrl}
                            </code>
                            <button
                              type="button"
                              onClick={() => void copyOverlayUrl()}
                              className="shrink-0 px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-[11px] font-medium"
                              data-testid="caster-copy-overlay-url"
                            >
                              {t.copy}
                            </button>
                          </div>
                          <p className="text-[11px] text-neutral-600 mt-1.5">
                            {t.overlayUrlHint}
                          </p>
                        </div>
                      )}

                      {/* Édition simultanée : avertissement là où on tape. */}
                      <CasterCollabBanner
                        others={othersByScene[selected.id] || []}
                      />

                      {/* Match picker (lot 5) — scènes match / results
                          seulement, comme toggleMatchPicker côté desktop. */}
                      {showPicker && (
                        <MatchPickerPanel
                          scene={selected}
                          picker={picker}
                          linkedMatch={
                            trackedMatches[linkedMatchIdOf(selected) || ''] ??
                            null
                          }
                          onImport={importMatch}
                          onDetach={detachMatch}
                        />
                      )}

                      {(() => {
                        const Editor = EDITORS[selected.type];
                        if (!Editor) {
                          return (
                            <EmptyState
                              title={t.placeholderTitle}
                              description={format(t.placeholderBody, {
                                type: typeLabel(selected.type),
                              })}
                            />
                          );
                        }
                        // key={id} : remonte l'éditeur (draft ré-initialisé) au
                        // changement de scène sélectionnée.
                        return (
                          <Editor
                            key={selected.id}
                            scene={selected}
                            onSave={saveSceneData}
                            tournamentMaps={picker.maps}
                          />
                        );
                      })()}
                    </>
                  ) : (
                    <EmptyState
                      title={t.emptyTitle}
                      description={t.emptyBody}
                    />
                  )}
                </section>
              </div>
            )}
          </div>

          {/* --- Onglet « OBS » (lot 3). MONTÉ EN PERMANENCE : la WebSocket OBS
              ne doit pas se couper en changeant d'onglet. */}
          <div {...panelProps('obs')}>
            <ObsPanel />
          </div>

          {/* --- Onglet « Chat & MVP » (lot 4). MONTÉ EN PERMANENCE : la
              connexion IRC/EventSub et les votes en cours ne survivraient pas à
              un démontage. `mvpScene` est la cible de publication du tally. */}
          <div {...panelProps('chat')}>
            <CasterChatSection mvpScene={mvpScene} onSave={saveSceneData} />
          </div>

          {/* --- Onglet « Habillage » (lot 5) — transverse aux scènes. Monté en
              permanence aussi : son auto-save des couleurs est débouncé. */}
          <div {...panelProps('theme')}>
            <ThemePanel
              themes={themes}
              activeId={activeThemeId}
              reload={reloadThemes}
            />
          </div>
        </div>
      </div>
    </>
  );
}

const seo: SeoProps = {
  title: {
    fr: 'Scènes caster',
    en: 'Caster scenes',
  },
  noindex: true,
};

CasterScenesPage.seo = seo;

export default CasterScenesPage;

/**
 * Gate SSR : tout staff (caster/admin/owner) — réplique fidèle du gate custom
 * de /admin/regie. `requireStaffRoleFromRequest(_, 'caster')` authentifie le
 * staff (caster est le rôle plancher), puis on reconstruit les baseProps de
 * `withStaffPage` : { staff, activeTenantKind } avec fail-safe 'organizer'.
 */
export const getServerSideProps: GetServerSideProps = async (
  ctx: GetServerSidePropsContext
) => {
  const { req, res } = ctx;
  try {
    const staffCtx = await requireStaffRoleFromRequest(
      req as never,
      res as never,
      'caster'
    );

    // Nature du tenant actif (organizer/developer) — comme withStaffPage.
    // Fail-safe 'organizer' pour ne jamais durcir accidentellement l'accès.
    const { getTenantKind } = await import('@/utils/tenantKind');
    let activeTenantKind: 'organizer' | 'developer' = 'organizer';
    try {
      activeTenantKind = (await getTenantKind(staffCtx.tenantId)) as
        | 'organizer'
        | 'developer';
    } catch (e) {
      logger.error('[admin/caster] getTenantKind error', e);
    }

    return {
      props: {
        staff: {
          id: staffCtx.staff.id,
          role: staffCtx.role,
          display_name: staffCtx.staff.display_name,
        },
        activeTenantKind,
      },
    };
  } catch (err: unknown) {
    if (err instanceof StaffUnauthenticatedError) {
      return {
        redirect: {
          destination: '/admin/login?next=/admin/caster',
          permanent: false,
        },
      };
    }
    if (err instanceof StaffUnauthorizedError) {
      return { redirect: { destination: '/403', permanent: false } };
    }
    logger.error('[admin/caster] getServerSideProps error', err);
    return { redirect: { destination: '/500', permanent: false } };
  }
};
