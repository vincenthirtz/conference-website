// pages/overlay/partenaires.tsx
//
// LA SOURCE NAVIGATEUR « PARTENAIRES » — les partenaires de l'association
// alignés en bandeau sur fond transparent, à coller une fois dans OBS.
//
// URL :
//   /overlay/partenaires
//
// Paramètres :
//   categories  super · major · cultural, séparés par des virgules (toutes par
//               défaut) — pour un bandeau qui ne montre qu'un palier
//   limit       1 → 12 (tous par défaut)
//   position    top · center · bottom (défaut) — où le bandeau se pose
//   align       left · center (défaut) · right — de quel côté il se range
//   heading     0 pour masquer l'accroche et ne laisser que les logos
//   accent      RRGGBB (teinte des contours), sinon le jaune de la Coupe
//   scale       0.5 → 2
//
// Taille conseillée de la source OBS : 1920×160. Le bandeau s'agrandit pour
// remplir ce qu'on lui donne (cf. partnersFit), donc une source plus haute
// grossit les pastilles au lieu de laisser du vide.
//
// PAS DE ROUTE `/api/overlay/*` À ELLE : les partenaires ne sont scopés ni par
// tournoi ni par espace (la table `partners` n'a pas de `tenant_id`), et
// `GET /api/partners` sert déjà exactement cette liste, cachée 15 min. Une
// route de plus n'aurait rien ajouté qu'une seconde version à maintenir.
// Rendue sans chrome par `_app.tsx`, `noindex`.

import Head from 'next/head';
import { useRouter } from 'next/router';
import { useT } from '@/lib/i18n/useT';
import { useOverlayPoll } from '@/hooks/useOverlayPoll';
import { DEFAULT_OVERLAY_ACCENT } from '@/components/overlay/match/MatchSources';
import {
  PartnersSource,
  parsePartnersAlign,
  parsePartnersPosition,
} from '@/components/overlay/match/PartnersSource';
import {
  parsePartnerCategories,
  parsePartnersLimit,
  selectOverlayPartners,
  type PartnerRow,
} from '@/utils/overlay/partnersOverlay';
import nsOverlay from '@/lib/i18n/locales/fr/overlay';

type PartnersApiResponse = { items: PartnerRow[] };

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function parseAccent(raw: string | undefined): string | null {
  if (!raw) return null;
  const value = raw.startsWith('#') ? raw.slice(1) : raw;
  return /^[0-9a-fA-F]{6}$/.test(value) ? `#${value}` : null;
}

function parseScale(raw: string | undefined): number {
  const n = Number.parseFloat(raw ?? '');
  if (!Number.isFinite(n)) return 1;
  return Math.min(2, Math.max(0.5, n));
}

export default function PartnersOverlayPage() {
  const router = useRouter();
  const t = useT(nsOverlay);

  // 15 min : c'est le cache de l'API, et la liste des partenaires ne bouge
  // qu'à la main depuis l'admin. Poller plus vite ne rendrait rien de plus
  // frais — mais la boucle existe pour qu'un ajout finisse par apparaître sans
  // aller recharger la source dans OBS en plein direct.
  const { data, fatal } = useOverlayPoll<PartnersApiResponse>(
    router.isReady ? '/api/partners' : null,
    { intervalMs: 15 * 60_000 }
  );

  const partners = selectOverlayPartners(data?.items ?? [], {
    categories: parsePartnerCategories(firstParam(router.query.categories)),
    limit: parsePartnersLimit(firstParam(router.query.limit)),
  });

  const accent =
    parseAccent(firstParam(router.query.accent)) ?? DEFAULT_OVERLAY_ACCENT;

  return (
    <>
      <Head>
        <title>{t.partnersDocTitle}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <style jsx global>{`
        html,
        body {
          background: transparent !important;
        }
      `}</style>

      <div className="relative h-screen w-screen overflow-hidden text-white">
        {fatal ? (
          // Erreur de configuration : visible dans l'aperçu OBS dès qu'on colle
          // l'URL, pas découverte en direct.
          <div className="flex h-full w-full items-center justify-center p-16">
            <p className="max-w-3xl rounded-2xl border border-red-500/40 bg-black/85 px-10 py-8 text-center text-2xl font-semibold text-red-200">
              {fatal}
            </p>
          </div>
        ) : (
          <PartnersSource
            partners={partners}
            accent={accent}
            scale={parseScale(firstParam(router.query.scale))}
            position={parsePartnersPosition(firstParam(router.query.position))}
            align={parsePartnersAlign(firstParam(router.query.align))}
            showHeading={firstParam(router.query.heading) !== '0'}
          />
        )}
      </div>
    </>
  );
}
