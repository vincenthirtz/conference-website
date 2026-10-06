// pages/player/scrim-planning/[planningId].tsx
// Espace joueur/capitaine : détail d'une grille de disponibilités de scrim,
// archétype FICHE (lot P13). Lecture sur le cache joueuse
// (features/player/scrims), rendu du panneau de peinture. Gère : chargement
// (skeleton), 403 (non participant), 404 (introuvable) et statut ≠ open
// (lecture seule via le panneau).

import type { ReactNode } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useTeamNames } from '@/hooks/useTeamNames';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import ScrimPlanningPanel from '@/features/player/scrims/ui/ScrimPlanningPanel';
import { useT } from '@/lib/i18n/useT';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import nsScrimPlanning from '@/lib/i18n/locales/fr/scrimPlanning';
import { loginHrefFor } from '@/utils/player/sessionExpiry';
import { withPlayerShell } from '@/features/player/_shared/shell/PlayerShell';
import { withPlayerQuery } from '@/features/player/_shared/query';
import { FicheView } from '@/features/player/_shared/ui';
import { Card, EntityHeader } from '@/features/ruban';
import { useScrimPlanning } from '@/features/player/scrims/hooks/useScrimsQueries';

const statusOf = (err: unknown) =>
  (err as { status?: number } | null)?.status ?? null;

function Notice({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <Card as="section" role="status">
      {title && <p className="mb-1 font-semibold">{title}</p>}
      <p className="text-sm text-[var(--t2,#d6cfd9)]">{children}</p>
    </Card>
  );
}

function ScrimPlanningDetailPage() {
  const router = useRouter();
  // Retour à CETTE page après connexion (`?next=`), requête comprise — sans
  // quoi un lien partagé (un mail, une notification) perdait sa destination.
  // Avant hydratation `asPath` n'est pas fiable (chemin du motif, pas de
  // requête) : la redirection n'est armée qu'une fois le routeur prêt, sinon
  // elle partait avec le repli `/player` et le lien perdait sa destination.
  const {
    user,
    loading: authLoading,
    ready,
  } = usePlayerSession({
    redirect: router.isReady,
    redirectTo: loginHrefFor(router.isReady ? router.asPath : '/player'),
  });
  const t = useT(nsScrimPlanning);

  const rawId = router.query.planningId;
  const planningId = (Array.isArray(rawId) ? rawId[0] : rawId) ?? null;

  const detail = useScrimPlanning(ready ? planningId : null);
  const okData = detail.data ?? null;
  const teamNames = useTeamNames([
    okData?.planning.team1_id,
    okData?.planning.team2_id,
  ]);

  if (authLoading || (!router.isReady && !planningId)) {
    return <PlayerPageSkeleton rows={2} />;
  }
  if (!user) return null;
  if (!okData && !detail.isError) return <PlayerPageSkeleton rows={2} />;

  const back = (
    <Link
      href="/player"
      className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]"
    >
      &larr; {t.back}
    </Link>
  );

  if (!okData) {
    const status = statusOf(detail.error);
    const title =
      status === 403
        ? t.notParticipantTitle
        : status === 404
          ? t.notFoundTitle
          : undefined;
    return (
      <>
        {title && (
          <Head>
            <title>{title}</title>
          </Head>
        )}
        <FicheView header={back}>
          <Notice title={title}>
            {status === 403
              ? t.notParticipant
              : status === 404
                ? t.notFound
                : t.loadError}
          </Notice>
        </FicheView>
      </>
    );
  }

  const { planning, myParty, mySlots, heatmap } = okData;
  const title = planning.title || t.pageTitle;

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <FicheView
        header={
          <div>
            {back}
            <EntityHeader
              title={title}
              meta={
                <>
                  {teamNames[planning.team1_id] || t.dashUnknownTeam}
                  <span className="mx-1.5">vs</span>
                  {teamNames[planning.team2_id] || t.dashUnknownTeam}
                </>
              }
            />
          </div>
        }
      >
        <ScrimPlanningPanel
          // Remonté à chaque session : la peinture locale repart de ses
          // créneaux persistés.
          key={planning.id}
          planning={planning}
          myParty={myParty}
          mySlots={mySlots}
          heatmap={heatmap}
          teamNames={{
            team1: teamNames[planning.team1_id] ?? null,
            team2: teamNames[planning.team2_id] ?? null,
          }}
        />
      </FicheView>
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

// Cache joueuse (lot P13) + coquille (lot P8). La page garde sa propre
// redirection de session (retour `?next=` exact) : `redirectTo` absent.
export default withPlayerQuery(withPlayerShell(ScrimPlanningDetailPage));
