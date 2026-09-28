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
import { withStaffPage } from '@/utils/staff';
import type { StaffProps } from '@/types/admin';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import {
  readOverlayAccess,
  type OverlayAccess,
} from '@/utils/admin/overlayAccess';
import { useAdminT } from '@/lib/i18n/useAdminT';
import DiffusionTabsNav from '@/components/admin/broadcast/DiffusionTabsNav';
import StreamSourcesPanel from '@/components/admin/tournament/StreamSourcesPanel';
import StreamAlertsPanel from '@/components/admin/tournament/StreamAlertsPanel';
import { lazyPanel } from '@/components/admin/lazyPanel';
import nsAdminDiffusionOverlays from '@/lib/i18n/locales/admin-fr/adminDiffusionOverlays';

// Chargée à la demande : seul qui a `manage_tcg` la voit.
const TcgOverlaySection = lazyPanel(
  () => import('@/components/admin/tcg/TcgOverlaySection')
);

type TournamentOption = { id: string; name: string; slug: string | null };

type SsrProps = OverlayAccess & { tournaments: TournamentOption[] };

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

  const [baseUrl, setBaseUrl] = useState<string>(
    process.env.NEXT_PUBLIC_SITE_URL ?? ''
  );
  useEffect(() => {
    if (!baseUrl && typeof window !== 'undefined') {
      setBaseUrl(window.location.origin);
    }
  }, [baseUrl]);

  const elsewhere = [
    {
      href: '/admin/broadcast/live',
      title: t.runOverlay,
      desc: t.runOverlayDesc,
    },
    {
      href: '/admin/caster?tab=obs',
      title: t.sceneOverlays,
      desc: t.sceneOverlaysDesc,
    },
    // Qui a `manage_tcg` règle l'overlay TCG juste au-dessus : le renvoi ne
    // sert qu'aux autres, pour savoir que la source existe et où elle vit.
    ...(canTuneTcg
      ? []
      : [{ href: '/admin/tcg', title: t.tcgOverlay, desc: t.tcgOverlayDesc }]),
  ];

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-black text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12">
          <DiffusionTabsNav active="overlays" />
          <h1 className="text-3xl font-extrabold tracking-tight">
            {t.heading}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-400">
            {t.subtitle}
          </p>

          <section className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
            {tournaments.length === 0 ? (
              <p className="text-sm text-neutral-400">{t.noTournament}</p>
            ) : (
              <label className="block max-w-md text-xs text-neutral-400">
                {t.tournamentLabel}
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
                >
                  {tournaments.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {selected && (
              <div className="mt-4">
                <StreamSourcesPanel
                  key={selected.id}
                  tournamentRef={selected.slug ?? selected.id}
                  tournamentId={selected.id}
                  baseUrl={baseUrl}
                  enabled={canUseMatchOverlays}
                  planLabel={planLabel}
                  showDonation={isDefaultTenant}
                />
              </div>
            )}
          </section>

          {canTuneAlerts && (
            <section className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
              <StreamAlertsPanel />
            </section>
          )}

          {canTuneTcg && (
            <section className="mt-6 space-y-6">
              <TcgOverlaySection />
            </section>
          )}

          <section className="mt-8">
            <h2 className="text-lg font-semibold">{t.elsewhereTitle}</h2>
            <p className="mt-1 text-sm text-neutral-400">{t.elsewhereIntro}</p>
            <ul className="mt-3 grid gap-3 sm:grid-cols-3">
              {elsewhere.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block h-full rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 transition hover:border-rose-500/40"
                  >
                    <span className="block text-sm font-semibold text-white">
                      {item.title}
                    </span>
                    <span className="mt-1 block text-xs text-neutral-400">
                      {item.desc}
                    </span>
                    <span className="mt-2 inline-block text-xs text-rose-300">
                      {t.open} →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
