// pages/admin/caster.tsx
//
// Feature: Cockpit caster web — lot 1 : édition des scènes de stream.
//
// Édition web de la table `caster_scenes` (Supabase, partagée avec l'app
// desktop womenscup-caster) : liste des scènes triées par sort_order à gauche,
// éditeur de la scène sélectionnée à droite. Lot 1 = édition seulement (pas de
// CRUD création/suppression/réordonnancement) ; seul le type `match` a son
// éditeur (MatchSceneEditor), les autres affichent un placeholder.
//
// Synchro : useCasterScenes (chargement + Realtime + saveSceneData). Le badge
// RealtimeStatusBadge reflète l'état du canal (SUBSCRIBED = temps réel, sinon
// mode dégradé). L'anti-clobber du draft en cours d'édition est géré dans
// MatchSceneEditor (remonté via key={scene.id} au changement de sélection).
//
// Gate SSR : réplique de /admin/regie — tout staff (caster/admin/owner) via
// requireStaffRoleFromRequest(_, 'caster') + baseProps { staff,
// activeTenantKind } comme withStaffPage (voir getServerSideProps en bas).

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import type { GetServerSideProps, GetServerSidePropsContext } from 'next';

import EmptyState from '@/components/admin/EmptyState';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import RealtimeStatusBadge from '@/components/admin/RealtimeStatusBadge';
import MatchSceneEditor from '@/components/admin/caster/MatchSceneEditor';
import { useToast } from '@/components/Toast';
import { useCasterScenes } from '@/hooks/useCasterScenes';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { logger } from '@/utils/logger';
import type { CasterSceneType } from '@/types/caster';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import {
  requireStaffRoleFromRequest,
  StaffUnauthenticatedError,
  StaffUnauthorizedError,
} from '@/utils/staff';

function CasterScenesPage() {
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

  // Sélection : la première scène par défaut ; repli sur la première si la
  // scène sélectionnée disparaît (suppression côté app desktop).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = scenes.find((s) => s.id === selectedId) ?? scenes[0] ?? null;

  // Origin côté client uniquement (SSR n'a pas window) pour l'URL overlay.
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

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

  // URL Browser Source de l'overlay hébergé — type match uniquement (lot 1).
  const overlayUrl =
    selected?.type === 'match' && origin
      ? `${origin}/overlay/caster/match`
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
                          <span className="shrink-0 rounded-full border border-neutral-700 bg-neutral-950/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
                            {typeLabel(scene.type)}
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

                    {selected.type === 'match' ? (
                      // key={id} : remonte l'éditeur (draft ré-initialisé) au
                      // changement de scène sélectionnée.
                      <MatchSceneEditor
                        key={selected.id}
                        scene={selected}
                        onSave={saveSceneData}
                      />
                    ) : (
                      <EmptyState
                        title={t.placeholderTitle}
                        description={format(t.placeholderBody, {
                          type: typeLabel(selected.type),
                        })}
                      />
                    )}
                  </>
                )}
              </section>
            </div>
          )}
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
