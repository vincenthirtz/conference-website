// features/player/tournamentRules/ui/RulesPdfReader.tsx — la liseuse PDF :
// les pages l'une sous l'autre dans une zone qui défile, un repère sous la
// dernière page qui dit « arrivée en bas », le zoom et « Télécharger ».
//
// LA RÈGLE DU BAS. `onReachedEnd` n'est appelé que lorsque le repère de fin
// est VISIBLE dans la zone (IntersectionObserver, racine = la zone) ET que
// toutes les pages sont rendues — en même temps. Passer en trombe devant des
// pages encore blanches ne compte pas ; un PDF en erreur n'appelle jamais
// rien. Une fois appelé, c'est acquis pour cette version (la liseuse est
// remontée, donc remise à zéro, quand la version change ; le zoom, lui, ne
// remonte rien : une case débloquée le reste).
//
// LE ZOOM NE DÉBLOQUE RIEN. Deux protections :
//   - la position de lecture est recalée à chaque changement d'échelle (zoom,
//     largeur de la zone) : au zoom avant, le point au CENTRE de la vue y
//     reste ; au zoom arrière, c'est le point en BAS de la vue qui reste en
//     bas — la vue ne découvre alors que ce qui PRÉCÈDE, jamais la suite. Sans
//     ce recalage, un zoom arrière garderait le décalage en pixels et
//     sauterait, contenu raccourci, tout en bas ;
//   - garde-fou : un repère que le changement d'échelle fait apparaître (il
//     n'était pas dans la zone juste avant) NE COMPTE PAS. Il ne comptera
//     qu'une fois sorti de la zone puis revenu — par un défilement.
//
// ZOOM ET MÉMOIRE : ../zoom.ts. La zone défile alors aussi de côté, en elle-
// même : la page, elle, ne défile jamais horizontalement.
//
// CLAVIER ET LECTEUR D'ÉCRAN. La zone est focalisable (`tabIndex=0`) : les
// flèches, Page suivante et Fin la font défiler. Chaque page est une image
// décrite (« Page 3 sur 12 ») suivie de son texte, masqué à l'écran mais lu
// par les lecteurs d'écran. Le repère de fin n'est PAS focalisable : un Tab
// ne doit pas sauter tout le document. Les boutons du zoom ont un nom, le
// niveau est annoncé (région polie), et un bouton qui se désactive à une
// borne rend le focus à son voisin.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { Button, rubanErr, rubanMuted } from '@/features/ruban';
import { format } from '@/lib/i18n/useT';
import type nsPlayerTournamentRules from '@/lib/i18n/locales/fr/playerTournamentRules';
import { rulesDownloadName, saveRulesFile } from '../download';
import { useRulesPdf } from '../hooks/useRulesPdf';
import {
  MAX_PAGE_CSS_WIDTH,
  MAX_SHARP_PAGES,
  ZOOM_MAX,
  ZOOM_MIN,
  zoomIn,
  zoomOut,
  zoomPercent,
} from '../zoom';

type T = typeof nsPlayerTournamentRules.fr;

/** Point de lecture à garder au changement d'échelle. */
type Anchor = {
  /** Page sous le point, et position relative dans cette page. */
  index: number;
  fy: number;
  /** Position horizontale relative dans la feuille. */
  fx: number;
  /** Le point est au centre de la vue (zoom avant) ou en bas (arrière). */
  edge: 'center' | 'bottom';
};

/** Repli sans IntersectionObserver : la zone est-elle défilée jusqu'en bas ? */
function bottomReached(zone: HTMLElement): boolean {
  return (
    zone.scrollHeight > 0 &&
    zone.scrollTop + zone.clientHeight >= zone.scrollHeight - 4
  );
}

/** Le repère est-il dans la zone, d'après la mise en page de CET instant ? */
function endInView(zone: HTMLElement, end: HTMLElement | null): boolean {
  if (!end) return false;
  if (typeof IntersectionObserver === 'undefined') return bottomReached(zone);
  const z = zone.getBoundingClientRect();
  const e = end.getBoundingClientRect();
  if (z.height <= 0 || e.height <= 0) return false;
  return e.top < z.bottom && e.bottom > z.top;
}

/** Largeur du contenu de la zone, marges intérieures déduites. */
function contentWidthOf(zone: HTMLElement): number {
  const style = getComputedStyle(zone);
  const pad =
    (Number.parseFloat(style.paddingLeft) || 0) +
    (Number.parseFloat(style.paddingRight) || 0);
  return Math.max(0, Math.round(zone.clientWidth - pad));
}

function pagesOf(sheet: HTMLElement): HTMLElement[] {
  return Array.from(sheet.querySelectorAll<HTMLElement>('[data-page]'));
}

function captureAnchor(
  zone: HTMLElement,
  sheet: HTMLElement | null,
  edge: Anchor['edge']
): Anchor | null {
  if (!sheet) return null;
  const pages = pagesOf(sheet);
  if (pages.length === 0) return null;
  const z = zone.getBoundingClientRect();
  const y =
    z.top +
    zone.clientTop +
    (edge === 'center' ? zone.clientHeight / 2 : zone.clientHeight);
  let index = pages.length - 1;
  for (let i = 0; i < pages.length; i++) {
    if (y <= pages[i].getBoundingClientRect().bottom) {
      index = i;
      break;
    }
  }
  const r = pages[index].getBoundingClientRect();
  const s = sheet.getBoundingClientRect();
  const x = z.left + zone.clientLeft + zone.clientWidth / 2;
  return {
    index,
    edge,
    fy: r.height > 0 ? (y - r.top) / r.height : 0,
    fx: s.width > 0 ? (x - s.left) / s.width : 0.5,
  };
}

function restoreAnchor(
  zone: HTMLElement,
  sheet: HTMLElement | null,
  anchor: Anchor
): void {
  if (!sheet) return;
  const page = pagesOf(sheet)[anchor.index];
  if (!page) return;
  const z = zone.getBoundingClientRect();
  const r = page.getBoundingClientRect();
  const y =
    r.top - (z.top + zone.clientTop) + zone.scrollTop + anchor.fy * r.height;
  const offset =
    anchor.edge === 'center' ? zone.clientHeight / 2 : zone.clientHeight;
  zone.scrollTop = Math.max(0, y - offset);
  const s = sheet.getBoundingClientRect();
  const x =
    s.left - (z.left + zone.clientLeft) + zone.scrollLeft + anchor.fx * s.width;
  zone.scrollLeft = Math.max(0, x - zone.clientWidth / 2);
}

/** Si le bouton actif va se désactiver, le focus passe à son voisin. */
function handFocus(from: HTMLElement, to: HTMLElement | null) {
  if (to && document.activeElement === from) to.focus();
}

export default function RulesPdfReader({
  tournamentId,
  versionNumber,
  fileName = null,
  onReachedEnd,
  t,
}: {
  tournamentId: string;
  versionNumber: number | null;
  /** Nom du fichier de la version, pour « Télécharger ». */
  fileName?: string | null;
  /** Appelé une fois, quand le bas du règlement est atteint. */
  onReachedEnd?: () => void;
  t: T;
}) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const zoomInRef = useRef<HTMLButtonElement>(null);
  const zoomOutRef = useRef<HTMLButtonElement>(null);

  const [zoom, setZoom] = useState<number>(ZOOM_MIN);
  const [contentWidth, setContentWidth] = useState(0);
  // 100 % : la largeur de la zone, plafonnée ; 0 tant qu'elle n'est pas mesurée.
  const fitWidth =
    contentWidth > 0 ? Math.min(MAX_PAGE_CSS_WIDTH, contentWidth) : 0;
  const pageWidth = fitWidth * zoom;
  const fitRef = useRef(fitWidth);
  fitRef.current = fitWidth;

  const { state, retry, sharpen } = useRulesPdf({
    tournamentId,
    versionNumber,
    measureWidth: () => {
      if (fitRef.current > 0) return fitRef.current;
      const zone = zoneRef.current;
      return zone
        ? Math.min(MAX_PAGE_CSS_WIDTH, contentWidthOf(zone))
        : MAX_PAGE_CSS_WIDTH;
    },
  });
  const ready = state.phase === 'ready';
  const total = ready ? state.pages.length : 0;
  const fullyRendered = ready && state.rendered === total;
  const hasZone = state.phase !== 'error';

  // ── Le repère de fin ────────────────────────────────────────────────────
  // `endSeenRef` : le dernier constat brut (dans la zone ou non) ;
  // `revealedRef` : il y est arrivé par un changement d'échelle → ne compte
  // pas tant qu'il n'est pas sorti puis revenu ; `endVisible` : ce qui compte.
  const endSeenRef = useRef(false);
  const revealedRef = useRef(false);
  const [endVisible, setEndVisible] = useState(false);
  const report = useCallback((visible: boolean) => {
    endSeenRef.current = visible;
    if (!visible) revealedRef.current = false;
    setEndVisible(visible && !revealedRef.current);
  }, []);

  // Le repère de fin est-il dans la zone, MAINTENANT ?
  useEffect(() => {
    endSeenRef.current = false;
    revealedRef.current = false;
    setEndVisible(false);
    if (!ready) return undefined;
    const zone = zoneRef.current;
    const end = endRef.current;
    if (!zone || !end) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      // Navigateur sans IntersectionObserver : le même test, à la main. Une
      // zone sans hauteur mesurée (pas encore mise en page) n'est « en bas »
      // de rien.
      const onScroll = () => report(bottomReached(zone));
      onScroll();
      zone.addEventListener('scroll', onScroll, { passive: true });
      return () => zone.removeEventListener('scroll', onScroll);
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) report(entry.isIntersecting);
      },
      { root: zone, threshold: 0 }
    );
    io.observe(end);
    return () => io.disconnect();
  }, [ready, report]);

  const firedRef = useRef(false);
  const onReachedEndRef = useRef(onReachedEnd);
  onReachedEndRef.current = onReachedEnd;
  useEffect(() => {
    if (firedRef.current || !endVisible || !fullyRendered) return;
    firedRef.current = true;
    onReachedEndRef.current?.();
  }, [endVisible, fullyRendered]);

  // ── Changement d'échelle : recalage, puis garde-fou ────────────────────
  const anchorRef = useRef<Anchor | null>(null);
  const contentWidthRef = useRef(0);

  // Largeur de la zone (« ajuster à la largeur » la suit : rotation, fenêtre).
  useLayoutEffect(() => {
    if (!hasZone) return undefined;
    const zone = zoneRef.current;
    if (!zone) return undefined;
    const measure = () => {
      const next = contentWidthOf(zone);
      const prev = contentWidthRef.current;
      if (next === prev) return;
      if (prev > 0) {
        // Les pages ont encore leur ancienne largeur (fixée en px) : c'est
        // le bon moment pour noter le point de lecture.
        anchorRef.current = captureAnchor(
          zone,
          sheetRef.current,
          next > prev ? 'center' : 'bottom'
        );
      }
      contentWidthRef.current = next;
      setContentWidth(next);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(zone);
    return () => ro.disconnect();
  }, [hasZone]);

  useLayoutEffect(() => {
    void zoom;
    void fitWidth;
    const anchor = anchorRef.current;
    anchorRef.current = null;
    const zone = zoneRef.current;
    if (!anchor || !zone) return;
    restoreAnchor(zone, sheetRef.current, anchor);
    // GARDE-FOU : un repère que CE changement d'échelle fait apparaître ne
    // compte pas (cf. en-tête).
    if (!endSeenRef.current && endInView(zone, endRef.current)) {
      revealedRef.current = true;
      setEndVisible(false);
    }
  }, [zoom, fitWidth]);

  const [announce, setAnnounce] = useState(false);
  const applyZoom = (next: number) => {
    if (next === zoom) return;
    const zone = zoneRef.current;
    if (zone) {
      anchorRef.current = captureAnchor(
        zone,
        sheetRef.current,
        next > zoom ? 'center' : 'bottom'
      );
    }
    setAnnounce(true);
    setZoom(next);
  };
  const onZoomIn = (e: MouseEvent<HTMLButtonElement>) => {
    const next = zoomIn(zoom);
    if (next >= ZOOM_MAX) handFocus(e.currentTarget, zoomOutRef.current);
    applyZoom(next);
  };
  const onZoomOut = (e: MouseEvent<HTMLButtonElement>) => {
    const next = zoomOut(zoom);
    if (next <= ZOOM_MIN) handFocus(e.currentTarget, zoomInRef.current);
    applyZoom(next);
  };
  const onFit = (e: MouseEvent<HTMLButtonElement>) => {
    handFocus(e.currentTarget, zoomInRef.current);
    applyZoom(ZOOM_MIN);
  };

  // ── Pages près de la vue : rendues net au zoom ─────────────────────────
  const nearRef = useRef(new Set<number>());
  const [nearTick, setNearTick] = useState(0);
  useEffect(() => {
    nearRef.current = new Set();
    if (!ready) return undefined;
    const zone = zoneRef.current;
    if (!zone || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        let changed = false;
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.page);
          if (entry.isIntersecting && !nearRef.current.has(index)) {
            nearRef.current.add(index);
            changed = true;
          } else if (!entry.isIntersecting && nearRef.current.delete(index)) {
            changed = true;
          }
        }
        if (changed) setNearTick((n) => n + 1);
      },
      // La vue, plus une demi-hauteur au-dessus et au-dessous.
      { root: zone, rootMargin: '50% 0px' }
    );
    const sheet = sheetRef.current;
    if (sheet) for (const page of pagesOf(sheet)) io.observe(page);
    return () => io.disconnect();
  }, [ready, total]);

  useEffect(() => {
    void nearTick;
    if (!ready || pageWidth <= 0) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const near = [...nearRef.current].sort((a, b) => a - b);
    // Les pages du milieu de la vue d'abord : ce sont elles qu'on lit.
    const middle = (near.length - 1) / 2;
    const ordered = near
      .map((index, pos) => ({ index, distance: Math.abs(pos - middle) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MAX_SHARP_PAGES);
    sharpen(
      ordered.map(({ index }) => ({
        index,
        pixelWidth: Math.round(pageWidth * ratio),
      }))
    );
  }, [ready, pageWidth, nearTick, sharpen]);

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

  const percent = zoomPercent(zoom);

  return (
    <div className="min-w-0 space-y-2">
      <div
        role="group"
        aria-label={t.zoomGroup}
        className="flex flex-wrap items-center gap-2"
      >
        <Button
          ref={zoomOutRef}
          size="sm"
          variant="ghost"
          onClick={onZoomOut}
          disabled={!ready || zoom <= ZOOM_MIN}
          aria-label={t.zoomOut}
          aria-controls="rules-reader-zone"
          className="min-w-11 text-base"
        >
          <span aria-hidden>−</span>
        </Button>
        <span
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid="rules-zoom-level"
          className="min-w-[4.5rem] text-center text-sm font-semibold text-[var(--t1,#f4edf7)]"
          data-numeric
        >
          {/* Annoncé à chaque changement, jamais au chargement. */}
          {announce && <span className="sr-only">{t.zoomLevelPrefix} </span>}
          {format(t.zoomLevel, { percent })}
        </span>
        <Button
          ref={zoomInRef}
          size="sm"
          variant="ghost"
          onClick={onZoomIn}
          disabled={!ready || zoom >= ZOOM_MAX}
          aria-label={t.zoomIn}
          aria-controls="rules-reader-zone"
          className="min-w-11 text-base"
        >
          <span aria-hidden>+</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onFit}
          disabled={!ready || zoom <= ZOOM_MIN}
          aria-label={t.zoomFit}
          aria-controls="rules-reader-zone"
        >
          {/* Libellé court sur téléphone : les boutons du zoom tiennent sur
              une ligne à 360 px. Le nom accessible reste le libellé entier. */}
          <span className="sm:hidden">{t.zoomFitShort}</span>
          <span className="hidden sm:inline">{t.zoomFit}</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="sm:ml-auto"
          disabled={!ready}
          onClick={() => {
            if (state.phase !== 'ready') return;
            saveRulesFile(
              state.file,
              rulesDownloadName(fileName, versionNumber)
            );
          }}
        >
          {t.download}
        </Button>
      </div>

      {/* Zone focalisable : elle doit défiler au clavier. */}
      <div
        ref={zoneRef}
        id="rules-reader-zone"
        tabIndex={0}
        role="region"
        aria-label={
          ready ? format(t.zoneLabel, { pages: total }) : t.zoneLabelLoading
        }
        aria-describedby="rules-reader-help"
        aria-busy={!fullyRendered}
        data-testid="rules-reader-zone"
        data-zoom={percent}
        className="h-[70vh] min-h-[320px] overflow-auto overscroll-contain rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-2 [overflow-anchor:none] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--or,#b467d1)] sm:p-4"
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
          // La feuille : largeur fixée en px une fois la zone mesurée (100 %
          // = la zone) ; plus large que la zone, elle la fait défiler de côté.
          <div
            ref={sheetRef}
            data-testid="rules-sheet"
            className="mx-auto"
            style={
              pageWidth > 0
                ? { width: `${pageWidth}px` }
                : { maxWidth: `${MAX_PAGE_CSS_WIDTH}px` }
            }
          >
            <ol className="flex flex-col gap-3">
              {state.pages.map((page, i) => (
                <li
                  // Les pages d'un même document ne bougent pas : l'index EST
                  // l'identité.
                  key={i}
                  data-page={i}
                  data-testid="rules-page"
                  className="relative w-full overflow-hidden rounded-[3px] bg-[#fff] shadow-[0_1px_6px_rgba(0,0,0,.35)]"
                  style={{ aspectRatio: `${page.width} / ${page.height}` }}
                >
                  {page.src ? (
                    // biome-ignore lint/performance/noImgElement: image `blob:` rendue localement par pdf.js, hors next/image
                    <img
                      src={page.sharpSrc ?? page.src}
                      alt={format(t.pageAlt, { n: i + 1, total })}
                      className="block h-full w-full"
                      decoding="async"
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
            {/* Aussi large que la feuille : visible quelle que soit la
                position horizontale ; le texte, lui, reste dans la vue. */}
            <div
              ref={endRef}
              data-testid="rules-end"
              className={`py-5 text-xs uppercase tracking-[0.18em] ${rubanMuted}`}
            >
              <span
                className="sticky left-0 block text-center"
                style={fitWidth > 0 ? { width: `${fitWidth}px` } : undefined}
              >
                — {t.endMarker} —
              </span>
            </div>
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
