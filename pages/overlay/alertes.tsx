// pages/overlay/alertes.tsx
//
// LA SOURCE NAVIGATEUR « BOÎTE D'ALERTES » — subs, réabos, abonnements offerts,
// bits, follows, raids ET dons HelloAsso, dans un seul habillage, sur fond
// transparent. À coller une fois dans OBS pour toute la soirée.
//
// URL :
//   /overlay/alertes
//
// Paramètres :
//   position  top · center (défaut) · bottom
//   scale     0.5 → 2
//   demo      1 pour faire défiler un exemple de chaque type (réglage de scène)
//   tenant    slug d'espace, pour les sources d'un autre organisateur
//
// TOUT LE RESTE SE RÈGLE EN LIGNE, depuis la page Outils du tournoi : quels
// types annoncer, avec quelle phrase, au-dessus de quel seuil, combien de temps,
// avec quel son. Ces réglages voyagent avec les alertes (`/api/overlay/alerts`)
// et s'appliquent en moins de cinq secondes — parce qu'en plein direct, on ne
// recolle pas une URL dans OBS.
//
// CE QUI NE S'AFFICHE JAMAIS : ce qui s'est passé avant l'ouverture de la
// source. Ajouter la source, ou simplement changer de scène (ce qui la
// recharge), ne doit pas rejouer les subs de la soirée — cf. `ingestAlerts`.
//
// Taille conseillée de la source OBS : 1920×1080. Rendue sans chrome par
// `_app.tsx`, `noindex`.

import { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import { useOverlayPoll } from '@/hooks/useOverlayPoll';
import { AlertBoxSource } from '@/components/overlay/match/AlertBoxSource';
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

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function parseScale(raw: string | undefined): number {
  const n = Number.parseFloat(raw ?? '');
  if (!Number.isFinite(n)) return 1;
  return Math.min(2, Math.max(0.5, n));
}

function parsePosition(raw: string | undefined): 'top' | 'center' | 'bottom' {
  return raw === 'top' || raw === 'bottom' ? raw : 'center';
}

/**
 * Un exemple de chaque type, en boucle, pour régler la scène sans attendre un
 * vrai sub. Aucun appel réseau en démo — la source ne doit pas marquer comme
 * « vues » de vraies alertes pendant qu'on cadre l'habillage.
 */
function useDemoFeed(enabled: boolean): OverlayAlertsResponse | null {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 6000);
    return () => clearInterval(id);
  }, [enabled]);

  return useMemo(() => {
    if (!enabled) return null;
    const kind = ALERT_KINDS[tick % ALERT_KINDS.length];
    const amounts: Record<string, number | null> = {
      follow: null,
      sub: null,
      resub: 24,
      gift: 5,
      cheer: 1500,
      raid: 42,
      donation: 2500,
    };
    const alert: StreamAlert = {
      id: `demo-${tick}`,
      kind,
      actorName: kind === 'donation' ? null : 'Machine',
      amount: amounts[kind] ?? null,
      tier: null,
      createdAt: new Date().toISOString(),
    };
    return {
      alerts: [alert],
      settings: {
        enabled: true,
        durationMs: 19_000,
        soundUrl: null,
        soundVolume: 70,
        accentColor: null,
        // La démo montre l'habillage du CODE : régler la scène avec le nœud,
        // puis découvrir un autre habillage en direct, n'aiderait personne.
        frameUrl: null,
        frameKind: null,
      },
      rules: [],
      branding: null,
      serverTime: new Date().toISOString(),
    };
  }, [enabled, tick]);
}

export default function AlertBoxOverlayPage() {
  const router = useRouter();
  const t = useT(nsOverlay);
  const locale = useLocale();

  const demo = firstParam(router.query.demo) === '1';
  const tenant = firstParam(router.query.tenant);

  const url = useMemo(() => {
    if (!router.isReady || demo) return null;
    const params = new URLSearchParams();
    if (tenant) params.set('tenant', tenant);
    const qs = params.toString();
    return `/api/overlay/alerts${qs ? `?${qs}` : ''}`;
  }, [router.isReady, demo, tenant]);

  const { data, fatal } = useOverlayPoll<OverlayAlertsResponse>(url, {
    intervalMs: 5000,
  });
  const demoFeed = useDemoFeed(demo);
  const feed = demo ? demoFeed : data;

  const rules: AlertRuleMap = useMemo(() => {
    const map: AlertRuleMap = {};
    for (const rule of feed?.rules ?? []) map[rule.kind] = rule;
    return map;
  }, [feed?.rules]);

  const [queue, setQueue] = useState(initialAlertQueue);
  const [current, setCurrent] = useState<StreamAlert | null>(null);
  // La file est relue par les minuteries ; une ref évite de les relancer à
  // chaque poll (toutes les 5 s pendant six heures).
  const queueRef = useRef(queue);
  queueRef.current = queue;

  // 1. Absorber le flux.
  useEffect(() => {
    if (!feed) return;
    setQueue((state) =>
      ingestAlerts(
        state,
        { alerts: feed.alerts, serverTime: feed.serverTime },
        rules
      )
    );
  }, [feed, rules]);

  // 2. Sortir la suivante, après une respiration.
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

  // 3. La retirer quand son temps est passé. La durée vient des réglages, donc
  //    d'une modification faite en admin il y a moins de cinq secondes.
  useEffect(() => {
    if (!current) return undefined;
    const ms = feed?.settings.durationMs ?? 19_000;
    const timer = setTimeout(() => setCurrent(null), ms);
    return () => clearTimeout(timer);
  }, [current, feed?.settings.durationMs]);

  return (
    <>
      <Head>
        <title>{t.alertsDocTitle}</title>
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
          <AlertBoxSource
            alert={current}
            rules={rules}
            scale={parseScale(firstParam(router.query.scale))}
            position={parsePosition(firstParam(router.query.position))}
            soundUrl={feed?.settings.soundUrl ?? null}
            soundVolume={feed?.settings.soundVolume ?? 70}
            frameUrl={feed?.settings.frameUrl ?? null}
            frameKind={feed?.settings.frameKind ?? null}
            locale={locale}
          />
        )}

        {demo && (
          <span className="absolute left-8 top-8 rounded-full border border-white/20 bg-black/70 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white/80">
            {t.donAlertDemoBadge}
          </span>
        )}
      </div>
    </>
  );
}
