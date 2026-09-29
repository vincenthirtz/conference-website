// features/player/network/ui/scouting/ScoutingScreen.tsx — dossier
// d'adversaire (N5), archétype FICHE (lot P15). Lecture sur le cache joueuse
// (`useScoutingReport` : équipe active, jamais de sujet) ; les sections vivent
// dans `ScoutingSections`.

import Head from 'next/head';
import Link from 'next/link';
import { Button, ButtonLink, Card, EntityHeader } from '@/features/ruban';
import { FicheView } from '@/features/player/_shared/ui';
import { usePlayerErrorText } from '@/features/player/_shared/useErrorText';
import { useManagedTeam } from '@/hooks/useManagedTeam';
import { format, useT } from '@/lib/i18n/useT';
import nsScouting from '@/lib/i18n/locales/fr/scouting';
import { useScoutingReport } from '../../hooks/useScouting';
import { isScoutingDossierEmpty, proposeScrimHref } from '../../scoutingModel';
import ScoutingSections from './ScoutingSections';

export default function ScoutingScreen({
  targetTeamId,
}: {
  targetTeamId: string | null;
}) {
  const t = useT(nsScouting);
  const errorText = usePlayerErrorText();
  const dossier = useScoutingReport(targetTeamId);
  // « Proposer un scrim » n'est offert qu'à qui peut le faire : la page de
  // demande refuserait sinon. Lecture partagée et mise en cache.
  const { data: managedTeam } = useManagedTeam();
  const canProposeScrim =
    managedTeam?.permissions.includes('manage_scrims') ?? false;

  const data = dossier.data ?? null;
  const back = (
    <Link
      href="/player/teams"
      className="mb-4 inline-flex min-h-11 items-center text-xs font-semibold text-[var(--t3,#a39ba6)] underline hover:text-[var(--t1,#f4edf7)]"
    >
      {t.backToDirectory}
    </Link>
  );

  if (!data) {
    return (
      <>
        <Head>
          <title>{t.title}</title>
        </Head>
        <FicheView header={back}>
          {dossier.isError ? (
            <Card as="section" role="alert">
              <p className="text-sm text-[#ffc2c2]">
                {errorText(dossier.error, t.errorLoad)}
              </p>
              <Button
                variant="danger"
                size="sm"
                className="mt-3"
                onClick={() => void dossier.refetch()}
              >
                {t.retry}
              </Button>
            </Card>
          ) : (
            <p className="text-sm text-[var(--t3,#a39ba6)]">{t.loading}</p>
          )}
        </FicheView>
      </>
    );
  }

  const title = format(t.pageTitle, { team: data.target.name });
  const { target } = data;

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
                  <span className="block">{t.subtitle}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                    {target.country && <span>{target.country}</span>}
                    {typeof target.rating === 'number' && (
                      <span>
                        {format(t.rating, {
                          rating: Math.round(target.rating),
                        })}
                      </span>
                    )}
                    {target.reliability.responseRate != null && (
                      <span>
                        {format(t.responseRate, {
                          rate: target.reliability.responseRate,
                        })}
                      </span>
                    )}
                    {target.slug && (
                      <Link
                        href={`/team/${target.slug}`}
                        className="underline hover:text-[var(--t1,#f4edf7)]"
                      >
                        {t.viewProfile}
                      </Link>
                    )}
                  </span>
                </>
              }
            />
          </div>
        }
        actions={
          canProposeScrim ? (
            <ButtonLink href={proposeScrimHref(target.id)} variant="primary">
              {t.proposeScrim}
            </ButtonLink>
          ) : undefined
        }
      >
        {isScoutingDossierEmpty(data) ? (
          <Card as="section">
            <h2 className="text-lg font-semibold">{t.emptyTitle}</h2>
            <p className="mt-2 text-sm text-[var(--t2,#d6cfd9)]">
              {t.emptyBody}
            </p>
          </Card>
        ) : (
          <ScoutingSections data={data} t={t} />
        )}
      </FicheView>
    </>
  );
}
