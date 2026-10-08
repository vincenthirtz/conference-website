// pages/overlay/regie.tsx
//
// LA SOURCE UNIQUE DE LA RÉGIE — boîte d'alertes, annonces TCG, coup de cœur
// du public, bandeau partenaires et QR de don, dans UNE seule source OBS.
//
// URL :
//   /overlay/regie
//
// Paramètres :
//   alertes      0 pour masquer la boîte d'alertes
//   mvp          0 pour masquer le scrutin public
//   mvpPosition  top · center · bottom — sinon le réglage de Diffusion › Overlays
//   partenaires  0 pour masquer le bandeau
//   don          0 pour masquer le QR · `carte` pour le panneau centré
//   scale        0.5 → 2 (applique à tout)
//   accent       RRGGBB
//   tenant       slug d'espace
//   tcg          0 pour masquer les annonces de cartes TCG (drops, victoires)
//
// LE TCG VOYAGE AVEC LES ALERTES (`?with=tcg`), servi par espace comme elles :
// pas de jeton à coller, pas d'appel de plus. Les annonces se posent dans
// leur emplacement de la mise en page (élément « Drops TCG », par défaut celui
// des alertes) ; le coin de l'habillage TCG ne vaut que pour la source dédiée. Toute autre valeur de
// `tcg` qu'un `0` — un ancien jeton collé dans l'URL — est sans effet.
//
// POURQUOI FUSIONNER. Quatre sources navigateur, c'est quatre fois le tour du
// réseau, en boucle, pendant six heures. Le scrutin public interrogeait toutes
// les 3 s et la boîte d'alertes toutes les 5 s (cadences d'ALORS ; les deux
// sont passées à 10 s depuis) : près de 2 000 appels par
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
import { LIVE_OVERLAY_POLL_MS, useOverlayPoll } from '@/hooks/useOverlayPoll';
import { AlertBoxSource } from '@/components/overlay/match/AlertBoxSource';
import { PublicMvpSource } from '@/components/overlay/match/PublicMvpSource';
import {
  DEFAULT_REGIE_LAYOUT,
  anchorParts,
  SLOT_CONTENT_STYLE,
  slotStyle,
  type RegieSlot,
} from '@/utils/overlay/regieLayout';
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
import nsOverlayTcg from '@/lib/i18n/locales/fr/overlayTcg';
import { useOverlayHeartbeat } from '@/hooks/useOverlayHeartbeat';
import { useTcgAnnouncementQueue } from '@/hooks/useTcgOverlayFeed';
import TcgAnnouncement from '@/components/overlay/TcgAnnouncement';
import { DEFAULT_OVERLAY_THEME } from '@/utils/tcg/overlayThemeShape';

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

/** Position forcée du scrutin, ou `undefined` (réglage de l'espace). */
const mvpPositionOf = (raw: string | undefined) =>
  raw === 'top' || raw === 'center' || raw === 'bottom' ? raw : undefined;

export default function RegieOverlayPage() {
  const router = useRouter();
  // Signal de présence (Diffusion › Overlays : « affichée »).
  useOverlayHeartbeat('regie');
  const t = useT(nsOverlay);
  const locale = useLocale();

  const q = router.query;
  const avecAlertes = actif(firstParam(q.alertes));
  const avecMvp = actif(firstParam(q.mvp));
  const mvpPosition = mvpPositionOf(firstParam(q.mvpPosition));
  const avecPartenaires = actif(firstParam(q.partenaires));
  const donParam = firstParam(q.don);
  const avecDon = actif(donParam);
  const donEnCarte = donParam === 'carte';
  const scale = parseScale(firstParam(q.scale));
  const accent = parseAccent(firstParam(q.accent));
  const tenant = firstParam(q.tenant);
  const avecTcg = actif(firstParam(q.tcg));
  const tTcg = useT(nsOverlayTcg);
  const tcgLabels = {
    dropEyebrow: tTcg.dropEyebrow,
    winEyebrow: tTcg.winEyebrow,
    dropLine: tTcg.dropLine,
    winLine: tTcg.winLine,
    anonymous: tTcg.anonymous,
  };

  // UN SEUL APPEL pour les alertes, le TCG ET le scrutin. `with=mvp` et
  // `with=tcg` ne sont demandés que si l'élément est affiché : une scène qui ne
  // le montre pas n'en paie pas les requêtes.
  const url = useMemo(() => {
    if (!router.isReady) return null;
    const p = new URLSearchParams();
    if (tenant) p.set('tenant', tenant);
    // `layout` : la mise en page, même sans scrutin (cf. l'API).
    const avec = ['layout', avecMvp && 'mvp', avecTcg && 'tcg'].filter(Boolean);
    if (avec.length > 0) p.set('with', avec.join(','));
    const qs = p.toString();
    return `/api/overlay/alerts${qs ? `?${qs}` : ''}`;
  }, [router.isReady, tenant, avecMvp, avecTcg]);

  const { data, fatal } = useOverlayPoll<OverlayAlertsResponse>(url, {
    intervalMs: LIVE_OVERLAY_POLL_MS,
  });

  // Annonces TCG : la file (déjà-vus, amorçage silencieux) est celle de la
  // source dédiée, nourrie ici par la réponse commune.
  const tcgQueue = useTcgAnnouncementQueue();
  const { ingest: ingestTcg } = tcgQueue;
  const tcgTheme = data?.tcg?.theme ?? DEFAULT_OVERLAY_THEME;
  useEffect(() => {
    if (data?.tcg) ingestTcg(data.tcg.items);
  }, [data, ingestTcg]);

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

  // Mise en page servie avec le flux (défauts tant qu'elle n'est pas arrivée).
  const layout = data?.layout ?? DEFAULT_REGIE_LAYOUT;
  const mvpSlot: RegieSlot = mvpPosition
    ? {
        ...layout.mvp,
        anchor:
          mvpPosition === 'top' ? 'tc' : mvpPosition === 'bottom' ? 'bc' : 'mc',
        x: 0,
        y: 0,
      }
    : layout.mvp;
  const donSlot: RegieSlot = donEnCarte
    ? { ...layout.don, anchor: 'mc', x: 0, y: 0 }
    : layout.don;

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
        @keyframes tcgOverlayIn {
          from {
            opacity: 0;
            transform: translateX(-12px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes tcgOverlayIn {
            from,
            to {
              opacity: 1;
              transform: none;
            }
          }
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
            {/* Chaque élément dans son EMPLACEMENT (ancrage, décalage, échelle),
                réglé depuis Diffusion › Overlays › Mise en page de la Régie.
                Les paramètres d'URL (`?mvp=0`, `?don=carte`, `?mvpPosition=`)
                restent prioritaires : une scène OBS déjà réglée ne bouge pas. */}
            {avecPartenaires && layout.partners.visible && (
              <div
                className="pointer-events-none"
                style={slotStyle(layout.partners, { globalScale: scale })}
              >
                <div style={SLOT_CONTENT_STYLE}>
                  <PartnersSource
                    partners={partenaires}
                    accent={accent}
                    scale={1}
                    position="top"
                    align={
                      anchorParts(layout.partners.anchor).h === 'l'
                        ? 'left'
                        : anchorParts(layout.partners.anchor).h === 'r'
                          ? 'right'
                          : 'center'
                    }
                    showHeading={false}
                  />
                </div>
              </div>
            )}

            {avecMvp && mvpSlot.visible && (
              <div
                className="pointer-events-none"
                style={slotStyle(mvpSlot, { globalScale: scale })}
              >
                <div style={SLOT_CONTENT_STYLE}>
                  <PublicMvpSource
                    poll={data?.publicMvp ?? null}
                    scale={1}
                    accent={accent}
                    position="top"
                  />
                </div>
              </div>
            )}

            {/* Le QR est TOUJOURS sur fond blanc : sur fond sombre ou
                transparent, il ne se scanne pas depuis un téléphone pointé sur
                un écran. `don=carte` le met au centre, pour une scène de pause. */}
            {avecDon && donSlot.visible && (
              <div style={slotStyle(donSlot, { globalScale: scale })}>
                <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-black/85 p-4 pr-6 shadow-2xl">
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
              </div>
            )}

            {/* Annonces TCG dans leur EMPLACEMENT de la mise en page (par
                défaut celui des alertes). Rien à annoncer = rien à l'écran. */}
            {avecTcg && layout.tcg.visible && (
              <div
                className="pointer-events-none"
                style={slotStyle(layout.tcg, { globalScale: scale })}
              >
                <ul
                  style={SLOT_CONTENT_STYLE}
                  className={`flex flex-col gap-2 ${
                    anchorParts(layout.tcg.anchor).h === 'l'
                      ? 'items-start'
                      : anchorParts(layout.tcg.anchor).h === 'r'
                        ? 'items-end'
                        : 'items-center'
                  }`}
                >
                  {tcgQueue.visible.map((item) => (
                    <TcgAnnouncement
                      key={item.id}
                      item={item}
                      theme={tcgTheme}
                      labels={tcgLabels}
                    />
                  ))}
                </ul>
              </div>
            )}

            {/* La boîte d'alertes EN DERNIER : elle passe au-dessus de tout.
                Une alerte qui surgit doit être vue, quitte à masquer le reste
                pendant ses dix-neuf secondes. */}
            {avecAlertes && layout.alerts.visible && (
              <div
                className="pointer-events-none"
                style={slotStyle(layout.alerts, { globalScale: scale })}
              >
                <div style={SLOT_CONTENT_STYLE}>
                  <AlertBoxSource
                    alert={current}
                    rules={rules}
                    scale={1}
                    position="center"
                    soundUrl={data?.settings.soundUrl ?? null}
                    soundVolume={data?.settings.soundVolume ?? 70}
                    frameUrl={data?.settings.frameUrl ?? null}
                    frameKind={data?.settings.frameKind ?? null}
                    locale={locale}
                  />
                </div>
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
