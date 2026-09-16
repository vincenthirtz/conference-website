// pages/overlay/match/[matchId].tsx
//
// LA SOURCE NAVIGATEUR D'UN MATCH — l'URL qu'une régie colle dans OBS.
//
// C'est ce que l'offre Régie ouvre (capacité `matchOverlays`) : afficher un
// match à l'antenne, sans conducteur ni logiciel à installer. La régie vidéo
// complète — direction automatique, Womenscup OBS — reste l'offre Éditeur ;
// ici, on affiche, on ne dirige pas.
//
// URL :
//   /overlay/match/<uuid>?source=scoreboard
//   /overlay/match/next?tournament=<slug>&source=scoreboard
//
// Paramètres :
//   source   scoreboard (défaut) · teams · maps · countdown · waiting
//   theme    dark (défaut) · light — n'affecte que l'écran d'attente, seul
//            plein cadre ; les autres sources restent sur fond transparent
//   accent   RRGGBB, sinon la couleur de l'espace, sinon le jaune de la Coupe
//   scale    0.5 → 2, pour caler la source dans une scène sans la redimensionner
//            à la souris (une source mise à l'échelle dans OBS devient floue)
//   tenant   slug d'espace, pour les sources d'un autre organisateur
//
// La page est rendue SANS chrome par `_app.tsx` (comme /embed/* et les autres
// overlays) et le fond reste transparent : OBS compose par-dessus la vidéo.
// `noindex` : une source de stream n'a rien à faire dans un moteur de
// recherche.

import Head from 'next/head';
import { useRouter } from 'next/router';
import { useT } from '@/lib/i18n/useT';
import { isValidUUID } from '@/utils/apiHelpers';
import { useMatchOverlay } from '@/hooks/useMatchOverlay';
import { parseOverlaySource } from '@/utils/overlay/matchOverlay';
import {
  MatchSourceSurface,
  DEFAULT_OVERLAY_ACCENT,
} from '@/components/overlay/match/MatchSources';
import nsOverlay from '@/lib/i18n/locales/fr/overlay';

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** `?accent=RRGGBB` → hex strict, sinon null (anti-injection CSS). */
function parseAccent(raw: string | undefined): string | null {
  if (!raw) return null;
  const value = raw.startsWith('#') ? raw.slice(1) : raw;
  return /^[0-9a-fA-F]{6}$/.test(value) ? `#${value}` : null;
}

/** `?scale=1.4` → 1.4, borné. Hors bornes ou illisible → 1. */
function parseScale(raw: string | undefined): number {
  const n = Number.parseFloat(raw ?? '');
  if (!Number.isFinite(n)) return 1;
  return Math.min(2, Math.max(0.5, n));
}

function MatchOverlayPage() {
  const router = useRouter();
  const t = useT(nsOverlay);

  const matchIdRaw = firstParam(router.query.matchId) ?? '';
  const matchId = matchIdRaw.trim();
  const wantsNext = matchId.toLowerCase() === 'next';
  const tournament = firstParam(router.query.tournament) ?? null;
  const tenant = firstParam(router.query.tenant) ?? null;
  const source = parseOverlaySource(firstParam(router.query.source));
  const scale = parseScale(firstParam(router.query.scale));
  const themeLight = firstParam(router.query.theme) === 'light';

  // Une URL mal formée doit se voir TOUT DE SUITE, quand on la colle dans OBS,
  // pas en plein direct. On ne lance donc pas de requête sans identifiant
  // valide, et on affiche la raison à l'écran.
  const configError = !matchId
    ? t.invalidRunId
    : wantsNext && !tournament
      ? t.matchMissingTournament
      : !wantsNext && !isValidUUID(matchId)
        ? t.invalidRunId
        : null;

  const { data, fatal, clockSkewMs } = useMatchOverlay({
    matchId: configError ? null : matchId,
    tournament,
    tenant,
    enabled: router.isReady && !configError,
  });

  const accent =
    parseAccent(firstParam(router.query.accent)) ??
    data?.branding?.accent ??
    DEFAULT_OVERLAY_ACCENT;

  const message = configError ?? fatal;

  return (
    <>
      <Head>
        <title>{t.matchDocTitle}</title>
        <meta name="robots" content="noindex" />
      </Head>
      {/* Fond transparent pour qu'OBS compose l'overlay sur la vidéo. L'écran
          d'attente, lui, peint son propre fond opaque. */}
      <style jsx global>{`
        html,
        body {
          background: transparent !important;
        }
      `}</style>

      <div
        className={`h-screen w-screen overflow-hidden ${
          themeLight ? 'text-neutral-900' : 'text-white'
        }`}
      >
        {message ? (
          // Le message de configuration s'affiche en clair, en grand : c'est
          // une source qu'on regarde dans un aperçu OBS, souvent en petit.
          <div className="flex h-full w-full items-center justify-center p-16">
            <p className="max-w-3xl rounded-2xl border border-red-500/40 bg-black/85 px-10 py-8 text-center text-2xl font-semibold text-red-200">
              {message}
            </p>
          </div>
        ) : (
          <MatchSourceSurface
            source={source}
            payload={data}
            clockSkewMs={clockSkewMs}
            accent={accent}
            scale={scale}
          />
        )}
      </div>
    </>
  );
}

export default MatchOverlayPage;
