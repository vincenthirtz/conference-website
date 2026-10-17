// pages/overlay/standings.tsx
//
// LA SOURCE NAVIGATEUR « CLASSEMENT » — le classement EN COURS d'un tournoi,
// à coller une fois dans OBS. Mêmes lignes que la page publique « Classement ».
// (La scène `standings` du cockpit caster, elle, montre le classement FINAL.)
//
// URL :
//   /overlay/standings?tournament=<slug>
//
// Paramètres :
//   tournament  identifiant ou slug du tournoi (requis)
//   stage       clé de la table (phase, ou phase + poule) ; absent = la phase
//               en cours
//   limit       1 → 20 lignes ; absent = toutes
//   qualify     places qualificatives à marquer (0 = aucune) ; absent = 2 par
//               match de finale hors phase, comme la page « Phase finale »
//   scale       0.5 → 2
//   tenant      slug d'espace, pour les sources d'un autre organisateur
//   preview     1 = fond sombre, pour tester la source dans un onglet ; OBS,
//               lui, veut le transparent
//
// Rendue sans chrome par `_app.tsx` (préfixe `/overlay`), fond transparent,
// `noindex`. Mêmes restrictions que les autres sources de match (cf. l'API).

import Head from 'next/head';
import { useRouter } from 'next/router';
import { useT } from '@/lib/i18n/useT';
import { useStandingsOverlay } from '@/hooks/useStandingsOverlay';
import { StandingsSource } from '@/components/overlay/match/StandingsSource';
import {
  parseQualifyParam,
  parseStandingsLimit,
} from '@/utils/overlay/standingsOverlay';
import nsOverlay from '@/lib/i18n/locales/fr/overlay';
import { useOverlayHeartbeat } from '@/hooks/useOverlayHeartbeat';

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function parseScale(raw: string | undefined): number {
  const n = Number.parseFloat(raw ?? '');
  if (!Number.isFinite(n)) return 1;
  return Math.min(2, Math.max(0.5, n));
}

export default function StandingsOverlayPage() {
  const router = useRouter();
  // Signal de présence (Diffusion › Overlays : « affichée »).
  useOverlayHeartbeat('standings');
  const t = useT(nsOverlay);

  const tournament = firstParam(router.query.tournament)?.trim() || null;
  const tenant = firstParam(router.query.tenant) ?? null;
  // Aperçu dans un navigateur : un fond transparent y devient blanc, et le
  // texte clair de la source disparaît.
  const preview = firstParam(router.query.preview) === '1';

  // Une URL incomplète doit se voir dès qu'on la colle dans OBS.
  const configError =
    router.isReady && !tournament ? t.standingsMissingTournament : null;

  const { data, fatal } = useStandingsOverlay({
    tournament,
    tenant,
    enabled: router.isReady && !configError,
  });

  const message = configError ?? fatal;

  return (
    <>
      <Head>
        <title>{t.standingsDocTitle}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <style jsx global>{`
        html,
        body {
          background: ${preview ? '#0b0b14' : 'transparent'} !important;
        }
      `}</style>

      <div className="h-screen w-screen overflow-hidden text-white">
        {message ? (
          <div className="flex h-full w-full items-center justify-center p-16">
            <p className="max-w-3xl rounded-2xl border border-red-500/40 bg-black/85 px-10 py-8 text-center text-2xl font-semibold text-red-200">
              {message}
            </p>
          </div>
        ) : (
          <StandingsSource
            payload={data}
            scale={parseScale(firstParam(router.query.scale))}
            limit={parseStandingsLimit(firstParam(router.query.limit))}
            stageKey={firstParam(router.query.stage)?.trim() || null}
            qualify={parseQualifyParam(firstParam(router.query.qualify))}
          />
        )}
      </div>
    </>
  );
}
