// pages/player/scrim-planning/[planningId].tsx
// Espace joueur/capitaine : détail d'une grille de disponibilités de scrim.
// Gate client (usePlayerSession), fetch Bearer du détail, rendu du panneau de
// peinture. Gère : chargement (skeleton), 403 (non participant), 404
// (introuvable) et statut ≠ open (lecture seule via le panneau).

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useTeamNames } from '@/hooks/useTeamNames';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import ScrimPlanningPanel, {
  type AnonHeatmap,
} from '@/components/player/ScrimPlanningPanel';
import { useT } from '@/lib/i18n/useT';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import type { ScrimPlanning, ScrimPlanningParty } from '@/types/admin';

import { logger } from '../../../utils/logger';

type DetailResponse = {
  planning: ScrimPlanning;
  myParty: ScrimPlanningParty;
  mySlots: string[];
  heatmap: AnonHeatmap;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ok'; data: DetailResponse }
  | { kind: 'forbidden' }
  | { kind: 'notfound' }
  | { kind: 'error' };

export default function ScrimPlanningDetailPage() {
  const router = useRouter();
  const { user, token, loading: authLoading, ready } = usePlayerSession();
  const t = useT('scrimPlanning');

  const rawId = router.query.planningId;
  const planningId = Array.isArray(rawId) ? rawId[0] : rawId;

  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const load = useCallback(async () => {
    if (!planningId || !token) return;
    setState({ kind: 'loading' });
    try {
      const res = await fetch(`/api/teams/scrim-plannings/${planningId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) {
        setState({ kind: 'forbidden' });
        return;
      }
      if (res.status === 404) {
        setState({ kind: 'notfound' });
        return;
      }
      if (!res.ok) {
        setState({ kind: 'error' });
        return;
      }
      const data = (await res.json()) as DetailResponse;
      setState({ kind: 'ok', data });
    } catch (err) {
      logger.error('[scrim-planning] load error:', err);
      setState({ kind: 'error' });
    }
  }, [planningId, token]);

  useEffect(() => {
    if (!ready || !planningId) return;
    load();
  }, [ready, planningId, load]);

  const okData = state.kind === 'ok' ? state.data : null;
  const teamNames = useTeamNames([
    okData?.planning.team1_id,
    okData?.planning.team2_id,
  ]);

  if (authLoading || (!router.isReady && !planningId)) {
    return <PlayerPageSkeleton rows={2} />;
  }

  if (!user) return null;

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="max-w-3xl mx-auto px-4 py-10 pt-24">
        <Link
          href="/player"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6"
        >
          &larr; {t.back}
        </Link>
        {children}
      </main>
    </div>
  );

  if (state.kind === 'loading') {
    return <PlayerPageSkeleton rows={2} />;
  }

  if (state.kind === 'forbidden') {
    return (
      <>
        <Head>
          <title>{t.notParticipantTitle}</title>
        </Head>
        <Shell>
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-5 text-sm text-amber-100">
            <p className="font-semibold mb-1">{t.notParticipantTitle}</p>
            <p>{t.notParticipant}</p>
          </div>
        </Shell>
      </>
    );
  }

  if (state.kind === 'notfound') {
    return (
      <>
        <Head>
          <title>{t.notFoundTitle}</title>
        </Head>
        <Shell>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-5 text-sm text-gray-300">
            <p className="font-semibold mb-1 text-white">{t.notFoundTitle}</p>
            <p>{t.notFound}</p>
          </div>
        </Shell>
      </>
    );
  }

  if (state.kind === 'error' || !okData) {
    return (
      <Shell>
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-5 text-sm text-red-100">
          {t.loadError}
        </div>
      </Shell>
    );
  }

  const { planning, myParty, mySlots, heatmap } = okData;

  return (
    <>
      <Head>
        <title>{planning.title || t.pageTitle}</title>
      </Head>
      <Shell>
        <header className="mb-6">
          <h1 className="text-2xl font-bold">{planning.title || t.pageTitle}</h1>
          <p className="mt-1 text-sm text-gray-400">
            {teamNames[planning.team1_id] || t.dashUnknownTeam}
            <span className="mx-1.5 text-gray-600">vs</span>
            {teamNames[planning.team2_id] || t.dashUnknownTeam}
          </p>
        </header>

        <ScrimPlanningPanel
          planning={planning}
          myParty={myParty}
          mySlots={mySlots}
          heatmap={heatmap}
          teamNames={{
            team1: teamNames[planning.team1_id] ?? null,
            team2: teamNames[planning.team2_id] ?? null,
          }}
          token={token}
        />
      </Shell>
    </>
  );
}

const scrimPlanningSeo: SeoProps = {
  title: {
    fr: 'Grille de disponibilités',
    en: 'Availability grid',
  },
  description: {
    fr: "Peins tes disponibilités pour ce scrim sur l'OW Women's Cup.",
    en: "Paint your availability for this scrim on OW Women's Cup.",
  },
  noindex: true,
};

ScrimPlanningDetailPage.seo = scrimPlanningSeo;
