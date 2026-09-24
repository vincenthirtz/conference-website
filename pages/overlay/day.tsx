// pages/overlay/day.tsx
//
// LA SOURCE NAVIGATEUR « MATCHS DU JOUR » — le programme d'une journée d'un
// tournoi, à coller une fois dans OBS.
//
// URL :
//   /overlay/day?tournament=<slug>
//
// Paramètres :
//   tournament  identifiant ou slug du tournoi (requis)
//   date        AAAA-MM-JJ ; absent = aujourd'hui, heure de Paris
//   limit       1 → 12 lignes (8 par défaut) ; au-delà, la liste suit le match
//               du moment
//   scale       0.5 → 2
//   tenant      slug d'espace, pour les sources d'un autre organisateur
//   preview     1 = fond sombre, pour tester la source dans un onglet (bouton
//               « Tester » de l'onglet Outils) ; OBS, lui, veut le transparent
//
// Rendue sans chrome par `_app.tsx` (préfixe `/overlay`), fond transparent,
// `noindex`. Mêmes restrictions que les sources par match (cf. l'API).

import Head from 'next/head';
import { useRouter } from 'next/router';
import { useT } from '@/lib/i18n/useT';
import { useDayOverlay } from '@/hooks/useDayOverlay';
import { DayScheduleSource } from '@/components/overlay/match/DayScheduleSource';
import { parseDayLimit } from '@/utils/overlay/dayOverlay';
import nsOverlay from '@/lib/i18n/locales/fr/overlay';

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function parseScale(raw: string | undefined): number {
  const n = Number.parseFloat(raw ?? '');
  if (!Number.isFinite(n)) return 1;
  return Math.min(2, Math.max(0.5, n));
}

export default function DayOverlayPage() {
  const router = useRouter();
  const t = useT(nsOverlay);

  const tournament = firstParam(router.query.tournament)?.trim() || null;
  const date = firstParam(router.query.date) ?? null;
  const tenant = firstParam(router.query.tenant) ?? null;
  // Aperçu dans un navigateur : un fond transparent y devient blanc, et le
  // texte clair de la source disparaît.
  const preview = firstParam(router.query.preview) === '1';

  // Une URL incomplète doit se voir dès qu'on la colle dans OBS.
  const configError =
    router.isReady && !tournament ? t.dayMissingTournament : null;

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
        <title>{t.dayDocTitle}</title>
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
          <DayScheduleSource
            payload={data}
            scale={parseScale(firstParam(router.query.scale))}
            limit={parseDayLimit(firstParam(router.query.limit))}
          />
        )}
      </div>
    </>
  );
}
