// components/Analytics/AnalyticsScript.tsx
//
// Injection du script de mesure d'audience + émission des pageviews.
//
// Deux conditions cumulatives pour que quoi que ce soit parte sur le réseau :
//   1. un fournisseur configuré (NEXT_PUBLIC_ANALYTICS_*) ;
//   2. la catégorie `analytics` acceptée dans le bandeau cookies.
// Tant que l'une manque, ce composant ne rend rien du tout — pas de balise,
// pas de requête, et la CSP reste inchangée (cf. proxy.ts).
//
// Les scripts sont chargés en mode MANUEL : ni Plausible ni Umami ne doivent
// suivre les navigations tout seuls, sinon chaque changement de route serait
// compté deux fois (une par le script via l'API History, une par nous).

import Script from 'next/script';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useCookieConsent } from '@/hooks/useCookieConsent';
import { readAnalyticsConfig } from '@/lib/analytics/config';
import { markAnalyticsReady, trackPageview } from '@/lib/analytics/track';
import { captureAttribution } from '@/lib/analytics/attribution';

export default function AnalyticsScript() {
  const router = useRouter();
  const { isLoaded, preferences } = useCookieConsent();
  const config = readAnalyticsConfig();
  const granted = isLoaded && preferences.analytics === true;
  const active = granted && !!config;

  // Première touche d'attribution : mémorisée dès que le consentement est
  // acquis, indépendamment du chargement du script (elle sert à l'inscription,
  // pas au collecteur).
  useEffect(() => {
    if (!granted) return;
    captureAttribution();
  }, [granted]);

  // Pageviews des navigations SPA. La toute première pageview est émise par
  // `onLoad` ci-dessous, quand le collecteur est prêt.
  useEffect(() => {
    if (!active) return;
    const handleRouteChange = (url: string) => trackPageview(url);
    router.events.on('routeChangeComplete', handleRouteChange);
    return () => router.events.off('routeChangeComplete', handleRouteChange);
  }, [active, router.events]);

  if (!active || !config) return null;

  const dataAttrs =
    config.provider === 'plausible'
      ? { 'data-domain': config.siteId }
      : { 'data-website-id': config.siteId, 'data-auto-track': 'false' };

  return (
    <Script
      id="analytics"
      src={config.scriptSrc}
      strategy="afterInteractive"
      onLoad={() => {
        markAnalyticsReady();
        trackPageview();
      }}
      {...dataAttrs}
    />
  );
}
