// pages/overlay/regie.tsx
//
// LA SOURCE UNIQUE DE LA RÉGIE — boîte d'alertes, coup de cœur du public,
// bandeau partenaires et QR de don, dans UNE seule source OBS.
//
// URL :
//   /overlay/regie
//
// Paramètres :
//   alertes      0 pour masquer la boîte d'alertes
//   mvp          0 pour masquer le scrutin public
//   partenaires  0 pour masquer le bandeau
//   don          0 pour masquer le QR · `carte` pour le panneau centré
//   scale        0.5 → 2 (applique à tout)
//   accent       RRGGBB
//   tenant       slug d'espace
//
// POURQUOI FUSIONNER. Quatre sources navigateur, c'est quatre fois le tour du
// réseau, en boucle, pendant six heures. Le scrutin public interrogeait toutes
// les 3 s et la boîte d'alertes toutes les 5 s : près de 2 000 appels par
// heure à elles deux, chacun déclenchant plusieurs requêtes en base — d'où
// 8 000 requêtes Supabase en une heure le 2026-09-23. Ici, UN seul appel les
// sert toutes les deux (`?with=mvp`).
//
// LES PARTENAIRES GARDENT LEUR ROUTE, et ce n'est pas une inconséquence :
// `/api/partners` est cachée quinze minutes et n'est pas scopée par espace —
// quelques appels par heure, contre 1 200 pour le scrutin. La fusionner
// n'aurait rien fait gagner et aurait ajouté une seconde version à maintenir.
// Le QR, lui, est un fichier statique : zéro appel.
//
// CHAQUE ÉLÉMENT SE COUPE SÉPARÉMENT. Une scène de pause veut le QR et les
// partenaires sans les alertes ; une scène de jeu veut l'inverse. Sans ces
// interrupteurs, la fusion obligerait à tout prendre — et on retomberait sur
// quatre sources.
//
// Les sources séparées existent toujours (`/overlay/alertes`,
// `/overlay/mvp-public`, `/overlay/partenaires`, `/overlay/don`) : une scène
// déjà réglée ne casse pas.
//
// Taille conseillée de la source OBS : 1920×1080. Rendue sans chrome par
// `_app.tsx`, `noindex`.

import Head from 'next/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';

import { useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import { useOverlayPoll } from '@/hooks/useOverlayPoll';
import { AlertBoxSource } from '@/components/overlay/match/AlertBoxSource';
import { PublicMvpSource } from '@/components/overlay/match/PublicMvpSource';
import { PartnersSource } from '@/components/overlay/match/PartnersSource';
import {
  parsePartnerCategories,
  parsePartnersLimit,
  selectOverlayPartners,
} from '@/utils/overlay/partnersOverlay';
import { DEFAULT_OVERLAY_ACCENT } from '@/components/overlay/match/MatchSources';
import {
  ALERT_KINDS,
  initialAlertQueue,
  ingestAlerts,
  shiftAlertQueue,
  type AlertRuleMap,
  type StreamAlert,
} from '@/utils/overlay/alertBox';
import type { OverlayAlertsResponse } from '@/pages/api/overlay/alerts';
import nsOverlay from '@/lib/i18n/locales/fr/overlay';

/** Respiration entre deux alertes : elles ne doivent pas se coller. */
const GAP_MS = 900;

/** Le QR de don, le même fichier que la page /don. */
const QR_SRC = '/images/qr.png';

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function parseScale(raw: string | undefined): number {
  const n = Number.parseFloat(raw ?? '');
  if (!Number.isFinite(n)) return 1;
  return Math.min(2, Math.max(0.5, n));
}

function parseAccent(raw: string | undefined): string {
  if (!raw) return DEFAULT_OVERLAY_ACCENT;
  const v = raw.startsWith('#') ? raw.slice(1) : raw;
  return /^[0-9a-fA-F]{6}$/.test(v) ? `#${v}` : DEFAULT_OVERLAY_ACCENT;
}

/** Un interrupteur d'élément : absent = allumé, `0` = éteint. */
const actif = (raw: string | undefined) => raw !== '0';

export default function RegieOverlayPage() {
  const router = useRouter();
  const t = useT(nsOverlay);
  const locale = useLocale();

  const q = router.query;
  const avecAlertes = actif(firstParam(q.alertes));
  const avecMvp = actif(firstParam(q.mvp));
  const avecPartenaires = actif(firstParam(q.partenaires));
  const donParam = firstParam(q.don);
  const avecDon = actif(donParam);
  const donEnCarte = donParam === 'carte';
  const scale = parseScale(firstParam(q.scale));
  const accent = parseAccent(firstParam(q.accent));
  const tenant = firstParam(q.tenant);

  // UN SEUL APPEL pour les alertes ET le scrutin. `with=mvp` n'est demandé que
  // si le scrutin est affiché : une scène qui ne le montre pas n'en paie pas
  // les requêtes.
  const url = useMemo(() => {
    if (!router.isReady) return null;
    const p = new URLSearchParams();
    if (tenant) p.set('tenant', tenant);
    if (avecMvp) p.set('with', 'mvp');
    const qs = p.toString();
    return `/api/overlay/alerts${qs ? `?${qs}` : ''}`;
  }, [router.isReady, tenant, avecMvp]);

  const { data, fatal } = useOverlayPoll<OverlayAlertsResponse>(url, {
    intervalMs: 5000,
  });

  // Les partenaires gardent leur route, cachée quinze minutes côté serveur :
  // la rafraîchir souvent ne servirait à rien.
  const { data: partnersData } = useOverlayPoll<{ items: unknown[] }>(
    avecPartenaires && router.isReady ? '/api/partners' : null,
    { intervalMs: 15 * 60_000 }
  );
  const partenaires = selectOverlayPartners(
    (partnersData?.items ?? []) as never[],
    {
      categories: parsePartnerCategories(firstParam(q.categories)),
      limit: parsePartnersLimit(firstParam(q.limit)),
    }
  );

  /* --- La file d'alertes, reprise telle quelle de `/overlay/alertes` ------ */

  const rules: AlertRuleMap = useMemo(() => {
    const map: AlertRuleMap = {};
    for (const rule of data?.rules ?? []) map[rule.kind] = rule;
    return map;
  }, [data?.rules]);

  const [queue, setQueue] = useState(initialAlertQueue);
  const [current, setCurrent] = useState<StreamAlert | null>(null);
  const queueRef = useRef(queue);
  queueRef.current = queue;

  useEffect(() => {
    if (!data || !avecAlertes) return;
    setQueue((state) =>
      ingestAlerts(
        state,
        { alerts: data.alerts, serverTime: data.serverTime },
        rules
      )
    );
  }, [data, rules, avecAlertes]);

  useEffect(() => {
    if (current || queue.queue.length === 0) return undefined;
    const timer = setTimeout(() => {
      const { next, state } = shiftAlertQueue(queueRef.current);
      if (next) {
        setQueue(state);
        setCurrent(next);
      }
    }, GAP_MS);
    return () => clearTimeout(timer);
  }, [current, queue]);

  useEffect(() => {
    if (!current) return undefined;
    const ms = data?.settings.durationMs ?? 19_000;
    const timer = setTimeout(() => setCurrent(null), ms);
    return () => clearTimeout(timer);
  }, [current, data?.settings.durationMs]);

  return (
    <>
      <Head>
        <title>{t.regieDocTitle}</title>
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
          // Erreur de configuration (palier, espace) : visible dans l'aperçu
          // OBS dès qu'on colle l'URL, pas découverte en direct.
          <div className="flex h-full w-full items-center justify-center p-16">
            <p className="max-w-3xl rounded-2xl border border-red-500/40 bg-black/85 px-10 py-8 text-center text-2xl font-semibold text-red-200">
              {fatal}
            </p>
          </div>
        ) : (
          <>
            {/* Le bandeau partenaires, en bas : il ne bouge pas de la soirée. */}
            {avecPartenaires && (
              <PartnersSource
                partners={partenaires}
                accent={accent}
                scale={scale}
                position="bottom"
                align="center"
                showHeading={false}
              />
            )}

            {/* Le scrutin, en haut à gauche : il cohabite avec une alerte qui
                surgit au centre, sans se recouvrir. */}
            {avecMvp && (
              <div className="pointer-events-none absolute inset-0">
                <PublicMvpSource
                  poll={data?.publicMvp ?? null}
                  scale={scale * 0.85}
                  accent={accent}
                  position="top"
                />
              </div>
            )}

            {/* Le QR : encart bas-droite par défaut, pour rester pendant le
                jeu. `don=carte` le met au centre, pour une scène de pause. */}
            {avecDon && (
              <div
                className={`absolute ${
                  donEnCarte
                    ? 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'
                    : // LE QR MONTE QUAND LE BANDEAU EST LÀ. À sa hauteur
                      // habituelle, il recouvrait la dernière pastille
                      // partenaire — constaté au rendu, invisible dans le
                      // code. Un partenaire à moitié caché sur six heures de
                      // direct, c'est un partenaire mécontent.
                      avecPartenaires
                      ? 'bottom-60 right-10'
                      : 'bottom-16 right-10'
                } flex items-center gap-4 rounded-2xl border border-white/10 bg-black/85 p-4 pr-6 shadow-2xl`}
                style={{
                  transform: scale !== 1 ? `scale(${scale})` : undefined,
                }}
              >
                {/* Le QR est TOUJOURS sur fond blanc : sur fond sombre ou
                    transparent, il ne se scanne pas depuis un téléphone pointé
                    sur un écran. */}
                <div className="shrink-0 rounded-xl bg-white p-2">
                  {/* biome-ignore lint/performance/noImgElement: source OBS — pas de next/image */}
                  <img
                    src={QR_SRC}
                    alt={t.donQrAlt}
                    width={112}
                    height={112}
                    className="block aspect-square h-28 w-28 object-contain [image-rendering:pixelated]"
                  />
                </div>
                <div className="min-w-0">
                  <p
                    className="font-extrabold uppercase tracking-wide"
                    style={{ color: accent }}
                  >
                    {t.donTitle}
                  </p>
                  <p className="text-sm text-white/70">{t.donBody}</p>
                </div>
              </div>
            )}

            {/* La boîte d'alertes EN DERNIER : elle passe au-dessus de tout.
                Une alerte qui surgit doit être vue, quitte à masquer le reste
                pendant ses dix-neuf secondes. */}
            {avecAlertes && (
              <div className="pointer-events-none absolute inset-0">
                <AlertBoxSource
                  alert={current}
                  rules={rules}
                  scale={scale}
                  position="center"
                  soundUrl={data?.settings.soundUrl ?? null}
                  soundVolume={data?.settings.soundVolume ?? 70}
                  frameUrl={data?.settings.frameUrl ?? null}
                  frameKind={data?.settings.frameKind ?? null}
                  locale={locale}
                />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

/** Réexporté pour l'éditeur admin, qui propose les mêmes types. */
export { ALERT_KINDS };
