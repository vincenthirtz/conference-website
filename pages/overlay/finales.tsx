// pages/overlay/finales.tsx
//
// LA SOURCE NAVIGATEUR « FINALES » — la petite et la grande finale de la
// soirée, une carte chacune, à coller une fois dans OBS.
//
// URL :
//   /overlay/finales?tournament=<slug>
//
// Paramètres :
//   tournament  identifiant ou slug du tournoi (requis)
//   date        AAAA-MM-JJ ; absent = aujourd'hui, heure de Paris (ou le jour
//               forcé depuis Diffusion › Overlays, comme « Matchs du jour »)
//   header      0 = sans le bandeau « tournoi · Les finales »
//   scale       0.5 → 2
//   tenant      slug d'espace, pour les sources d'un autre organisateur
//   preview     1 = fond sombre, pour tester la source dans un onglet
//
// Mêmes données que « Matchs du jour » (`GET /api/overlay/day`) : la journée
// du tournoi, dont la source ne garde que les finales (cf. finalsRounds).
// Rendue sans chrome par `_app.tsx` (préfixe `/overlay`), fond transparent,
// `noindex`.

import Head from 'next/head';
import { useRouter } from 'next/router';
import { useT } from '@/lib/i18n/useT';
import { useDayOverlay } from '@/hooks/useDayOverlay';
import { FinalsSource } from '@/components/overlay/finals/FinalsSource';
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

export default function FinalsOverlayPage() {
  const router = useRouter();
  // Signal de présence (Diffusion › Overlays : « affichée »).
  useOverlayHeartbeat('finals');
  const t = useT(nsOverlay);

  const tournament = firstParam(router.query.tournament)?.trim() || null;
  const date = firstParam(router.query.date) ?? null;
  const tenant = firstParam(router.query.tenant) ?? null;
  // Aperçu dans un navigateur : un fond transparent y devient blanc.
  const preview = firstParam(router.query.preview) === '1';
  const header = firstParam(router.query.header) !== '0';

  // Une URL incomplète doit se voir dès qu'on la colle dans OBS.
  const configError =
    router.isReady && !tournament ? t.finalsMissingTournament : null;

  const { data, fatal } = useDayOverlay({
    tournament,
    date,
    tenant,
    enabled: router.isReady && !configError,
  });

  const message = configError ?? fatal;

  return (
    <>
      <Head>
        <title>{t.finalsDocTitle}</title>
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
          <FinalsSource
            payload={data}
            scale={parseScale(firstParam(router.query.scale))}
            header={header}
            preview={preview}
          />
        )}
      </div>
    </>
  );
}
