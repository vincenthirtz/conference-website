// pages/admin/diffusion/overlays.tsx
//
// Diffusion › Overlays — toutes les sources OBS au même endroit.
//
// POURQUOI CETTE PAGE. Les URL d'overlay vivaient dans l'onglet Outils de
// CHAQUE tournoi : pour préparer une soirée, il fallait savoir qu'elles
// étaient là, ouvrir le bon tournoi, puis descendre sous les widgets embed.
// Les overlays qui ne dépendent d'aucun tournoi (régie, dons, partenaires,
// scrims) y étaient pourtant rangés aussi. Ici : un sélecteur de tournoi, le
// même panneau de sources (`StreamSourcesPanel`, une seule implémentation), et
// les renvois vers les overlays réglés sur leur propre écran.
//
// Ouverte à tout le staff, comme les autres écrans de la diffusion : ce ne
// sont que des URL publiques et leur mode d'emploi. Le seul geste d'écriture
// du panneau (forcer le jour de « Matchs du jour ») garde son contrôle côté
// API.

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';

// Chargé à la demande : le panneau (cache de requêtes + suivi en direct)
// pèserait ~45 ko sur le premier chargement d'une page qu'on ouvre surtout
// pour copier une URL (bundle-budget).
const PublicMvpOverlayPanel = dynamic(
  () => import('@/features/admin/diffusion/ui/PublicMvpOverlayPanel'),
  { ssr: false }
);
const RegieLayoutPanel = dynamic(
  () => import('@/features/admin/diffusion/ui/RegieLayoutPanel'),
  { ssr: false }
);
import { withStaffPage } from '@/utils/staff';
import type { StaffProps } from '@/types/admin';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import {
  readOverlayAccess,
  type OverlayAccess,
} from '@/utils/admin/overlayAccess';
import { useAdminT } from '@/lib/i18n/useAdminT';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import DiffusionTabsNav from '@/components/admin/broadcast/DiffusionTabsNav';
import StreamSourcesPanel from '@/components/admin/tournament/StreamSourcesPanel';
import StreamAlertsPanel from '@/components/admin/tournament/StreamAlertsPanel';
import { lazyPanel } from '@/components/admin/lazyPanel';
import Tabs, {
  useQueryTab,
  tabPanelId,
  tabButtonId,
} from '@/components/admin/Tabs';
import nsAdminDiffusionOverlays from '@/lib/i18n/locales/admin-fr/adminDiffusionOverlays';
import { useOverlayPresence } from '@/hooks/useOverlayPresence';

// Chargée à la demande : seul qui a `manage_tcg` la voit.
const TcgOverlaySection = lazyPanel(
  () => import('@/components/admin/tcg/TcgOverlaySection')
);

type TournamentOption = { id: string; name: string; slug: string | null };

type SsrProps = OverlayAccess & { tournaments: TournamentOption[] };

const TABS_ID = 'diffusion-overlays';

/** Les plus récents d'abord : c'est le tournoi en cours qu'on prépare. */
const TOURNAMENT_LIMIT = 30;

export const getServerSideProps = withStaffPage<SsrProps>(
  'caster',
  async (_ctx, staffCtx) => {
    const access = await readOverlayAccess(staffCtx.tenantId);
    if (!supabaseAdmin) return { ...access, tournaments: [] };
    const { data, error } = await supabaseAdmin
      .from('tournaments')
      .select('id, name, slug')
      .eq('tenant_id', staffCtx.tenantId)
      .order('created_at', { ascending: false })
      .limit(TOURNAMENT_LIMIT);
    if (error) logger.error('[diffusion/overlays] tournois illisibles', error);
    return {
      ...access,
      tournaments: ((data ?? []) as TournamentOption[]).map((x) => ({
        id: x.id,
        name: x.name,
        slug: x.slug ?? null,
      })),
    };
  }
);

type Props = StaffProps & SsrProps;

export default function DiffusionOverlaysPage({
  staff,
  tournaments,
  canUseMatchOverlays,
  planLabel,
  isDefaultTenant,
}: Props) {
  const t = useAdminT(nsAdminDiffusionOverlays);
  const router = useRouter();

  // `?tournament=<id>` : l'onglet Outils d'un tournoi renvoie ici avec le sien.
  const wanted =
    typeof router.query.tournament === 'string' ? router.query.tournament : '';
  const [selectedId, setSelectedId] = useState<string>(
    tournaments.find((x) => x.id === wanted)?.id ?? tournaments[0]?.id ?? ''
  );
  useEffect(() => {
    if (wanted && tournaments.some((x) => x.id === wanted)) {
      setSelectedId(wanted);
    }
  }, [wanted, tournaments]);
  const selected = tournaments.find((x) => x.id === selectedId) ?? null;
  // Quelles sources s'affichent MAINTENANT dans OBS (signal des overlays).
  const presence = useOverlayPresence();

  // Les réglages de la boîte d'alertes : mêmes conditions que sa source (elle
  // n'existe que pour l'espace de l'association, avec la capacité de régie),
  // plus le droit que l'API exige. Dans l'onglet Outils, la page demandait
  // `manage_tournaments` quand l'API demande `manage_broadcast` : un
  // responsable tournoi voyait un panneau qui échouait à chaque geste.
  const canTuneAlerts =
    isDefaultTenant &&
    canUseMatchOverlays &&
    (staff?.permissions ?? []).includes('manage_broadcast');
  // L'overlay TCG : le droit de ses routes (jeton, habillage).
  const canTuneTcg = (staff?.permissions ?? []).includes('manage_tcg');
  // « Forcer le jour » de la source « Matchs du jour » écrit via une route
  // `manage_tournaments` : sans ce droit, le panneau ne reçoit pas le tournoi
  // à piloter et n'affiche que les URL, au lieu d'un bouton qui échoue.
  const canForceDay = (staff?.permissions ?? []).includes('manage_tournaments');

  const [baseUrl, setBaseUrl] = useState<string>(
    process.env.NEXT_PUBLIC_SITE_URL ?? ''
  );
  useEffect(() => {
    if (!baseUrl && typeof window !== 'undefined') {
      setBaseUrl(window.location.origin);
    }
  }, [baseUrl]);

  // `?tab=mvp-public` : lien direct vers le pilotage du vote, partageable à
  // la régie. L'onglet n'existe qu'avec la capacité de régie (comme le panneau).
  const tabs = [
    { id: 'sources', label: t.tabSources },
    ...(canUseMatchOverlays
      ? [{ id: 'mvp-public', label: t.tabMvpPublic }]
      : []),
  ];
  const [active, setActive] = useQueryTab(tabs);

  const elsewhere = [
    {
      href: '/admin/broadcast/live',
      title: t.twitchInteractions,
      desc: t.twitchInteractionsDesc,
    },
    {
      href: '/admin/caster?tab=obs',
      title: t.sceneOverlays,
      desc: t.sceneOverlaysDesc,
    },
    // Qui a `manage_tcg` règle l'overlay TCG juste au-dessus. Pour les
    // autres, une carte qui dit que la source existe et QUI la règle — sans
    // lien : /admin/tcg exige ce même droit, le lien menait à un 403.
    ...(canTuneTcg
      ? []
      : [
          {
            href: null,
            title: t.tcgOverlay,
            desc: `${t.tcgOverlayDesc} ${t.tcgOverlayNoAccess}`,
          },
        ]),
  ];

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>
      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <DiffusionTabsNav active="overlays" />
        <AdminPageHeader title={t.heading} subtitle={t.subtitle} />

        <section className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4">
          {tournaments.length === 0 ? (
            <p className="text-sm text-[var(--t3,#a39ba6)]">{t.noTournament}</p>
          ) : (
            <label className="block max-w-md text-xs text-[var(--t3,#a39ba6)]">
              {t.tournamentLabel}
              <select
                value={selectedId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedId(id);
                  // Dans l'URL : un rechargement (ou un lien partagé à la
                  // régie) rouvre CE tournoi, pas le plus récent.
                  void router.replace(
                    {
                      pathname: router.pathname,
                      query: { ...router.query, tournament: id },
                    },
                    undefined,
                    { shallow: true }
                  );
                }}
                className="mt-1 h-[38px] w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 text-sm text-[var(--t1,#f4edf7)]"
              >
                {tournaments.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>

        {/* Deux onglets sous le MÊME tournoi : les sources OBS d'un côté, le
            pilotage du vote MVP du public de l'autre — ce dernier se manie
            en plein direct, il ne doit pas se chercher sous dix panneaux. */}
        <Tabs
          tabs={tabs}
          active={active}
          onChange={setActive}
          ariaLabel={t.tabsAriaLabel}
          idBase={TABS_ID}
          className="mt-6 mb-6"
        />

        <div
          role="tabpanel"
          id={tabPanelId(TABS_ID, active)}
          aria-labelledby={tabButtonId(TABS_ID, active)}
        >
          {active === 'mvp-public' && canUseMatchOverlays ? (
            <section className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4">
              <PublicMvpOverlayPanel
                tournamentId={selected?.id ?? null}
                canTuneSettings={(staff?.permissions ?? []).includes(
                  'manage_broadcast'
                )}
              />
            </section>
          ) : (
            <>
              {selected && (
                <section className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4">
                  <StreamSourcesPanel
                    key={selected.id}
                    tournamentRef={selected.slug ?? selected.id}
                    tournamentId={canForceDay ? selected.id : undefined}
                    baseUrl={baseUrl}
                    enabled={canUseMatchOverlays}
                    planLabel={planLabel}
                    showDonation={isDefaultTenant}
                    presence={presence}
                  />
                </section>
              )}

              {canTuneAlerts && (
                <section className="mt-6 rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4">
                  <StreamAlertsPanel />
                </section>
              )}

              {/* La source Régie est plein écran : où poser chacun de ses éléments. */}
              {canUseMatchOverlays && (
                <section className="mt-6 rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4">
                  <RegieLayoutPanel
                    canEdit={(staff?.permissions ?? []).includes(
                      'manage_broadcast'
                    )}
                  />
                </section>
              )}

              {canTuneTcg && (
                <section className="mt-6 space-y-6">
                  <TcgOverlaySection />
                </section>
              )}

              <section className="mt-8">
                <h2 className="font-[family-name:var(--fd)] text-lg font-bold uppercase tracking-[0.02em] text-[var(--t1,#f4edf7)]">
                  {t.elsewhereTitle}
                </h2>
                <p className="mt-1 text-sm text-[var(--t3,#a39ba6)]">
                  {t.elsewhereIntro}
                </p>
                <ul className="mt-3 grid gap-3 sm:grid-cols-3">
                  {elsewhere.map((item) =>
                    item.href ? (
                      <li key={item.title}>
                        <Link
                          href={item.href}
                          className="block h-full rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4 transition-colors hover:border-[rgba(180,103,209,.45)]"
                        >
                          <span className="block text-sm font-semibold text-[var(--t1,#f4edf7)]">
                            {item.title}
                          </span>
                          <span className="mt-1 block text-xs text-[var(--t3,#a39ba6)]">
                            {item.desc}
                          </span>
                          <span className="mt-2 inline-block text-xs text-[var(--or-200,#eec4ff)]">
                            {t.open} →
                          </span>
                        </Link>
                      </li>
                    ) : (
                      <li
                        key={item.title}
                        className="h-full rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4 opacity-80"
                      >
                        <span className="block text-sm font-semibold text-[var(--t1,#f4edf7)]">
                          {item.title}
                        </span>
                        <span className="mt-1 block text-xs text-[var(--t3,#a39ba6)]">
                          {item.desc}
                        </span>
                      </li>
                    )
                  )}
                </ul>
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
