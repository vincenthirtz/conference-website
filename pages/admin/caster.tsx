// pages/admin/caster.tsx
//
// Feature: Cockpit caster web — lots 1-5.
//
// Édition web de la table `caster_scenes` (Supabase, partagée avec l'app
// desktop womenscup-caster) : liste des scènes triées par sort_order à gauche,
// éditeur de la scène sélectionnée à droite. Édition seulement (pas de CRUD
// création/suppression/réordonnancement) ; les 8 types de scènes ont leur
// éditeur (registry EDITORS) — un type inconnu (ex. bracket, créé côté app
// desktop) garde le placeholder.
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
import CasterCollabBanner from '@/components/admin/caster/CasterCollabBanner';
import CasterPresenceBar from '@/components/admin/caster/CasterPresenceBar';
import EndSceneEditor from '@/components/admin/caster/EndSceneEditor';
import MatchPickerPanel from '@/components/admin/caster/MatchPickerPanel';
import MatchSceneEditor from '@/components/admin/caster/MatchSceneEditor';
import MvpSceneEditor from '@/components/admin/caster/MvpSceneEditor';
import PauseSceneEditor from '@/components/admin/caster/PauseSceneEditor';
import ResultsSceneEditor from '@/components/admin/caster/ResultsSceneEditor';
import ScrimSceneEditor from '@/components/admin/caster/ScrimSceneEditor';
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

// Registry type de scène → éditeur (lot 2 : les 8 types). Un type hors
// registry (scène desktop d'un type plus récent) retombe sur le placeholder.
const EDITORS: Record<CasterSceneType, ComponentType<SceneEditorProps>> = {
  starting: StartingSceneEditor,
  match: MatchSceneEditor,
  pause: PauseSceneEditor,
  results: ResultsSceneEditor,
  end: EndSceneEditor,
  mvp: MvpSceneEditor,
  scrim: ScrimSceneEditor,
  webcam: WebcamSceneEditor,
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

  const { scenes, loading, error, reload, saveSceneData } = useCasterScenes({
    onStatus,
  });

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
  };
  const typeLabel = (type: string) =>
    typeLabels[type as CasterSceneType] ?? type;

  // URL Browser Source de l'overlay hébergé — /overlay/caster/<type> pour
  // chacun des 8 types portés (les overlays sont livrés au lot 2 aussi).
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

          {loading ? (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 py-16">
              <LoadingSpinner label={t.loadingScenes} />
            </div>
          ) : scenes.length === 0 ? (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50">
              <EmptyState title={t.emptyTitle} description={t.emptyBody} />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-[260px,1fr] gap-4 items-start">
              {/* Colonne gauche : liste des scènes (tri sort_order via le hook) */}
              <nav
                aria-label={t.sceneListTitle}
                className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-2"
                data-testid="caster-scene-list"
              >
                <ul className="space-y-1">
                  {scenes.map((scene) => {
                    const isSelected = selected?.id === scene.id;
                    // Indicateur consultatif : un autre caster (web OU desktop)
                    // a cette scène ouverte. Jamais bloquant.
                    const others = othersByScene[scene.id] || [];
                    return (
                      <li key={scene.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(scene.id)}
                          aria-current={isSelected ? 'true' : undefined}
                          className={`w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                            isSelected
                              ? 'bg-purple-600/20 border border-purple-500/40 text-white'
                              : 'border border-transparent text-neutral-300 hover:bg-neutral-800/60'
                          }`}
                        >
                          <span className="font-medium truncate">
                            {scene.name}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {others.length > 0 && (
                              <span
                                title={format(t.sceneOpenByOthers, {
                                  names: others
                                    .map((u) => u.displayName)
                                    .join(', '),
                                })}
                                className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200"
                                data-testid="caster-scene-presence-dot"
                              >
                                <span aria-hidden="true">👁</span>
                                {others.length > 1 && others.length}
                                <span className="sr-only">
                                  {format(t.sceneOpenByOthers, {
                                    names: others
                                      .map((u) => u.displayName)
                                      .join(', '),
                                  })}
                                </span>
                              </span>
                            )}
                            <span className="rounded-full border border-neutral-700 bg-neutral-950/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
                              {typeLabel(scene.type)}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              {/* Panneau droit : éditeur de la scène sélectionnée */}
              <section
                className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4"
                data-testid="caster-scene-panel"
              >
                {selected && (
                  <>
                    <div className="flex items-center gap-2 mb-4">
                      <h2 className="text-lg font-bold truncate">
                        {selected.name}
                      </h2>
                      <span className="shrink-0 rounded-full border border-neutral-700 bg-neutral-950/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
                        {typeLabel(selected.type)}
                      </span>
                    </div>

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

                    {/* Match picker (lot 5) — scènes match / results seulement,
                        comme toggleMatchPicker côté desktop. */}
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
                )}
              </section>
            </div>
          )}

          {/* Pilotage OBS (lot 3) — indépendant de la liste des scènes
              Supabase : rendu même pendant le chargement / liste vide. */}
          <div className="mt-4">
            <ObsPanel />
          </div>

          {/* Chat Twitch + poll MVP (lot 4) — hors du panneau d'édition : le
              chat reste connecté et les votes vivants quand on change de
              scène. `mvpScene` est la cible de publication du tally. */}
          <div className="mt-4">
            <CasterChatSection mvpScene={mvpScene} onSave={saveSceneData} />
          </div>

          {/* Habillage des overlays (lot 5) — transverse aux scènes, donc en
              bas de page plutôt que dans le panneau d'édition. */}
          <div className="mt-4">
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
