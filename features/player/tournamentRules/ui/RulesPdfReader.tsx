// features/player/tournamentRules/ui/RulesPdfReader.tsx — la liseuse PDF :
// les pages l'une sous l'autre dans une zone qui défile, et un repère sous la
// dernière page qui dit « arrivée en bas ».
//
// LA RÈGLE DU BAS. `onReachedEnd` n'est appelé que lorsque le repère de fin
// est VISIBLE dans la zone (IntersectionObserver, racine = la zone) ET que
// toutes les pages sont rendues — en même temps. Passer en trombe devant des
// pages encore blanches ne compte pas ; un PDF en erreur n'appelle jamais
// rien. Une fois appelé, c'est acquis pour cette version (la liseuse est
// remontée, donc remise à zéro, quand la version change).
//
// CLAVIER ET LECTEUR D'ÉCRAN. La zone est focalisable (`tabIndex=0`) : les
// flèches, Page suivante et Fin la font défiler. Chaque page est une image
// décrite (« Page 3 sur 12 ») suivie de son texte, masqué à l'écran mais lu
// par les lecteurs d'écran. Le repère de fin n'est PAS focalisable : un Tab
// ne doit pas sauter tout le document.

import { useEffect, useRef, useState } from 'react';
import { Button, rubanErr, rubanMuted } from '@/features/ruban';
import { format } from '@/lib/i18n/useT';
import type nsPlayerTournamentRules from '@/lib/i18n/locales/fr/playerTournamentRules';
import { useRulesPdf } from '../hooks/useRulesPdf';

type T = typeof nsPlayerTournamentRules.fr;

export default function RulesPdfReader({
  tournamentId,
  versionNumber,
  onReachedEnd,
  t,
}: {
  tournamentId: string;
  versionNumber: number | null;
  /** Appelé une fois, quand le bas du règlement est atteint. */
  onReachedEnd?: () => void;
  t: T;
}) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const { state, retry } = useRulesPdf({
    tournamentId,
    versionNumber,
    measureWidth: () => zoneRef.current?.clientWidth ?? 800,
  });
  const ready = state.phase === 'ready';
  const total = ready ? state.pages.length : 0;
  const fullyRendered = ready && state.rendered === total;
  const [endVisible, setEndVisible] = useState(false);

  // Le repère de fin est-il dans la zone, MAINTENANT ?
  useEffect(() => {
    setEndVisible(false);
    if (!ready) return undefined;
    const zone = zoneRef.current;
    const end = endRef.current;
    if (!zone || !end) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      // Navigateur sans IntersectionObserver : le même test, à la main. Une
      // zone sans hauteur mesurée (pas encore mise en page) n'est « en bas »
      // de rien.
      const onScroll = () =>
        setEndVisible(
          zone.scrollHeight > 0 &&
            zone.scrollTop + zone.clientHeight >= zone.scrollHeight - 4
        );
      onScroll();
      zone.addEventListener('scroll', onScroll, { passive: true });
      return () => zone.removeEventListener('scroll', onScroll);
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setEndVisible(entry.isIntersecting);
      },
      { root: zone, threshold: 0 }
    );
    io.observe(end);
    return () => io.disconnect();
  }, [ready]);

  const firedRef = useRef(false);
  const onReachedEndRef = useRef(onReachedEnd);
  onReachedEndRef.current = onReachedEnd;
  useEffect(() => {
    if (firedRef.current || !endVisible || !fullyRendered) return;
    firedRef.current = true;
    onReachedEndRef.current?.();
  }, [endVisible, fullyRendered]);

  if (state.phase === 'error') {
    return (
      <div role="alert" className={`${rubanErr} space-y-3 p-4 text-sm`}>
        <p>{state.reason === 'file' ? t.pdfErrorFile : t.pdfErrorPdf}</p>
        <p className="text-xs">{t.pdfErrorLocked}</p>
        <Button size="sm" variant="secondary" onClick={retry}>
          {t.retry}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Zone focalisable : elle doit défiler au clavier. */}
      <div
        ref={zoneRef}
        tabIndex={0}
        role="region"
        aria-label={
          ready ? format(t.zoneLabel, { pages: total }) : t.zoneLabelLoading
        }
        aria-describedby="rules-reader-help"
        aria-busy={!fullyRendered}
        data-testid="rules-reader-zone"
        className="h-[70vh] min-h-[320px] overflow-y-auto overscroll-contain rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--or,#b467d1)] sm:p-4"
      >
        {state.phase === 'loading' && (
          <p
            role="status"
            className={`py-10 text-center text-sm ${rubanMuted}`}
          >
            {t.pdfLoading}
          </p>
        )}
        {ready && (
          <ol className="mx-auto flex max-w-[900px] flex-col gap-3">
            {state.pages.map((page, i) => (
              <li
                // Les pages d'un même document ne bougent pas : l'index EST
                // l'identité.
                key={i}
                data-testid="rules-page"
                className="relative w-full overflow-hidden rounded-[3px] bg-[#fff] shadow-[0_1px_6px_rgba(0,0,0,.35)]"
                style={{ aspectRatio: `${page.width} / ${page.height}` }}
              >
                {page.src ? (
                  // biome-ignore lint/performance/noImgElement: image `blob:` rendue localement par pdf.js, hors next/image
                  <img
                    src={page.src}
                    alt={format(t.pageAlt, { n: i + 1, total })}
                    className="block h-full w-full"
                    draggable={false}
                  />
                ) : (
                  <div
                    aria-hidden
                    className="h-full w-full animate-pulse bg-[rgba(0,0,0,.06)]"
                  />
                )}
                {page.text && (
                  <div className="sr-only">
                    <p>{format(t.pageText, { n: i + 1 })}</p>
                    <p>{page.text}</p>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
        {ready && (
          <div
            ref={endRef}
            data-testid="rules-end"
            className={`py-5 text-center text-xs uppercase tracking-[0.18em] ${rubanMuted}`}
          >
            — {t.endMarker} —
          </div>
        )}
      </div>
      <p id="rules-reader-help" className={`text-xs ${rubanMuted}`}>
        {t.zoneHelp}
      </p>
      {ready && !fullyRendered && (
        <p className={`text-xs ${rubanMuted}`} data-numeric>
          {format(t.pdfRendering, { done: state.rendered, total })}
        </p>
      )}
    </div>
  );
}
