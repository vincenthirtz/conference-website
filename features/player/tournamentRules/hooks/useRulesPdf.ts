// features/player/tournamentRules/hooks/useRulesPdf.ts — le PDF du règlement,
// page par page, pour la liseuse.
//
// Deux temps, et c'est ce qui rend le « défilement obligatoire » honnête :
//
//   1. MISE EN PAGE. Toutes les pages sont ouvertes (dimensions seulement)
//      avant le moindre rendu : la zone qui défile a d'emblée sa hauteur
//      FINALE. Le repère de fin, sous la dernière page, ne peut donc pas être
//      visible « par accident » parce que les pages n'auraient pas encore de
//      hauteur.
//   2. RENDU DE BASE, dans l'ordre, une page après l'autre, en IMAGE (blob
//      PNG) à la largeur ajustée × devicePixelRatio : un canevas par page
//      retiendrait des dizaines de mégaoctets sur mobile ; une image, le
//      navigateur sait la décharger hors écran. Le texte de chaque page est
//      extrait pour les lecteurs d'écran. C'est CE rendu (`rendered`) que la
//      case attend.
//
// Puis, À LA DEMANDE (`sharpen`, le zoom) : les quelques pages près de la vue
// sont re-rendues en haute résolution, une à la fois ; celles qui s'éloignent
// rendent leur image HD. Plafonds et justification : ../zoom.ts. Un échec de
// ce rendu net laisse l'image de base : le document, lui, est déjà affiché.
//
// Toute erreur du rendu de base (PDF injoignable, illisible, page qui ne se
// rend pas) fait passer la liseuse en `error` : jamais de « case active » sur
// un document qu'on n'a pas pu montrer. `retry()` recommence tout.

import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '@/utils/logger';
import { RulesFileError, tournamentRulesClient } from '../client';
import { openRulesPdf, type RulesPdfDocument } from '../pdfEngine';
import {
  cappedPixelWidth,
  MAX_BASE_PIXEL_WIDTH,
  MAX_SHARP_PAGES,
} from '../zoom';

export type RulesPdfPageView = {
  /** Dimensions à l'échelle 1 : fixent le rapport de la page avant rendu. */
  width: number;
  height: number;
  /** URL `blob:` de l'image de base, `null` tant que la page n'est pas rendue. */
  src: string | null;
  /** Image haute résolution (zoom), seulement pour une page près de la vue. */
  sharpSrc: string | null;
  text: string;
};

export type RulesPdfState =
  | { phase: 'loading' }
  | { phase: 'error'; reason: 'file' | 'pdf' }
  | {
      phase: 'ready';
      pages: RulesPdfPageView[];
      rendered: number;
      /** Le PDF tel que chargé (version affichée), pour « Télécharger ». */
      file: Blob;
    };

/** Une page à rendre net : sa largeur AFFICHÉE, en pixels réels. */
export type SharpRequest = { index: number; pixelWidth: number };

/** L'état du rendu net d'un chargement (remis à zéro à chaque chargement). */
type SharpRun = {
  cancelled: boolean;
  doc: RulesPdfDocument | null;
  /** Dimensions des pages à l'échelle 1. */
  sizes: { width: number; height: number }[];
  /** Largeur, en pixels réels, de l'image de base de chaque page. */
  baseWidths: number[];
  /** Le rendu de base est fini : le rendu net peut commencer. */
  baseDone: boolean;
  wanted: SharpRequest[];
  images: Map<number, { url: string; pixelWidth: number }>;
  busy: boolean;
  /** Rendus nets en échec (`page:largeur`) : pas de nouvel essai en boucle. */
  failed: Set<string>;
};

/** Au-delà de 10 % de pixels en plus, l'image de base ne suffit plus. */
const SHARP_MARGIN = 1.1;

function devicePixelRatioNow(): number {
  return typeof window !== 'undefined'
    ? Math.max(1, window.devicePixelRatio || 1)
    : 1;
}

/** Largeur (plafonnée) du rendu net demandé pour une page. */
function sharpTarget(run: SharpRun, req: SharpRequest): number {
  const size = run.sizes[req.index];
  return size
    ? cappedPixelWidth(size.width, size.height, req.pixelWidth)
    : req.pixelWidth;
}

function needsSharp(run: SharpRun, req: SharpRequest): boolean {
  const base = run.baseWidths[req.index];
  return base !== undefined && sharpTarget(run, req) > base * SHARP_MARGIN;
}

export function useRulesPdf({
  tournamentId,
  versionNumber,
  enabled = true,
  measureWidth,
}: {
  tournamentId: string;
  /** La version AFFICHÉE est celle qu'on validera. */
  versionNumber: number | null;
  enabled?: boolean;
  /** Largeur CSS d'une page à 100 % (mesurée au moment du rendu). */
  measureWidth: () => number;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<RulesPdfState>({ phase: 'loading' });
  const measureRef = useRef(measureWidth);
  measureRef.current = measureWidth;
  const runRef = useRef<SharpRun | null>(null);

  const setSharpSrc = useCallback((changes: Map<number, string | null>) => {
    setState((prev) =>
      prev.phase !== 'ready'
        ? prev
        : {
            ...prev,
            pages: prev.pages.map((p, j) =>
              changes.has(j) ? { ...p, sharpSrc: changes.get(j) ?? null } : p
            ),
          }
    );
  }, []);

  /** Évince ce qui n'est plus voulu, puis rend net la page suivante. */
  const pump = useCallback(
    async (run: SharpRun): Promise<void> => {
      if (run.cancelled || run.busy || !run.baseDone || !run.doc) return;

      // 1. Libérer les images HD des pages éloignées (ou revenues à 100 %).
      const evicted = new Map<number, string | null>();
      for (const [index, image] of run.images) {
        const req = run.wanted.find((w) => w.index === index);
        if (req && needsSharp(run, req)) continue;
        URL.revokeObjectURL(image.url);
        run.images.delete(index);
        evicted.set(index, null);
      }
      if (evicted.size > 0) setSharpSrc(evicted);

      // 2. La prochaine page trop floue pour sa taille affichée.
      const job = run.wanted.find((req) => {
        if (!needsSharp(run, req)) return false;
        const target = sharpTarget(run, req);
        if (run.failed.has(`${req.index}:${target}`)) return false;
        const have = run.images.get(req.index)?.pixelWidth ?? 0;
        return have < target / SHARP_MARGIN;
      });
      if (!job) return;

      const target = sharpTarget(run, job);
      run.busy = true;
      try {
        const page = await run.doc.page(job.index + 1);
        let blob: Blob;
        try {
          blob = await page.renderToBlob(target);
        } finally {
          page.release();
        }
        if (run.cancelled) return;
        // Plus voulue entre-temps (la vue a bougé) : rien à garder.
        if (!run.wanted.some((w) => w.index === job.index)) return;
        const url = URL.createObjectURL(blob);
        const previous = run.images.get(job.index);
        run.images.set(job.index, { url, pixelWidth: target });
        setSharpSrc(new Map([[job.index, url]]));
        // L'image affichée garde ses pixels : l'ancienne URL peut partir.
        if (previous) URL.revokeObjectURL(previous.url);
      } catch (err) {
        if (!run.cancelled) {
          logger.warn('[tournamentRules] rendu net impossible', err);
          run.failed.add(`${job.index}:${target}`);
        }
      } finally {
        run.busy = false;
        if (!run.cancelled) void pump(run);
      }
    },
    [setSharpSrc]
  );

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const urls: string[] = [];
    const run: SharpRun = {
      cancelled: false,
      doc: null,
      sizes: [],
      baseWidths: [],
      baseDone: false,
      wanted: [],
      images: new Map(),
      busy: false,
      failed: new Set(),
    };
    runRef.current = run;
    setState({ phase: 'loading' });

    void (async () => {
      try {
        const bytes = await tournamentRulesClient.file(
          tournamentId,
          versionNumber
        );
        if (cancelled) return;
        // Copie AVANT pdf.js, qui transfère (vide) le tableau à son worker :
        // c'est elle que « Télécharger » enregistre, sans nouvelle requête.
        const file = new Blob([bytes], { type: 'application/pdf' });
        const opened = await openRulesPdf(bytes);
        if (cancelled) {
          // Démonté pendant l'ouverture : le nettoyage est déjà passé.
          opened.destroy();
          return;
        }
        run.doc = opened;

        // 1. Mise en page complète avant tout rendu.
        const pages = [];
        for (let n = 1; n <= opened.numPages; n++) {
          pages.push(await opened.page(n));
        }
        if (cancelled) return;
        if (pages.length === 0) throw new Error('PDF sans page');
        run.sizes = pages.map((p) => ({ width: p.width, height: p.height }));
        setState({
          phase: 'ready',
          rendered: 0,
          file,
          pages: pages.map((p) => ({
            width: p.width,
            height: p.height,
            src: null,
            sharpSrc: null,
            text: '',
          })),
        });

        // 2. Rendu de base, dans l'ordre de lecture.
        const ratio = devicePixelRatioNow();
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          const pixelWidth = cappedPixelWidth(
            page.width,
            page.height,
            Math.min(
              MAX_BASE_PIXEL_WIDTH,
              Math.max(320, measureRef.current()) * ratio
            )
          );
          const blob = await page.renderToBlob(pixelWidth);
          const text = await page.text().catch(() => '');
          page.release();
          if (cancelled) return;
          run.baseWidths[i] = pixelWidth;
          const url = URL.createObjectURL(blob);
          urls.push(url);
          setState((prev) =>
            prev.phase !== 'ready'
              ? prev
              : {
                  ...prev,
                  rendered: i + 1,
                  pages: prev.pages.map((p, j) =>
                    j === i ? { ...p, src: url, text } : p
                  ),
                }
          );
        }
        run.baseDone = true;
        void pump(run);
      } catch (err) {
        if (cancelled) return;
        logger.error('[tournamentRules] PDF illisible', err);
        setState({
          phase: 'error',
          reason: err instanceof RulesFileError ? 'file' : 'pdf',
        });
      }
    })();

    return () => {
      cancelled = true;
      run.cancelled = true;
      if (runRef.current === run) runRef.current = null;
      run.doc?.destroy();
      for (const url of urls) URL.revokeObjectURL(url);
      for (const image of run.images.values()) URL.revokeObjectURL(image.url);
      run.images.clear();
    };
  }, [tournamentId, versionNumber, enabled, attempt, pump]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  /**
   * Les pages près de la vue et leur largeur affichée (pixels réels), par
   * ordre de priorité. Au plus MAX_SHARP_PAGES ; les autres retombent sur
   * leur image de base.
   */
  const sharpen = useCallback(
    (requests: SharpRequest[]) => {
      const run = runRef.current;
      if (!run) return;
      run.wanted = requests.slice(0, MAX_SHARP_PAGES);
      void pump(run);
    },
    [pump]
  );

  return { state, retry, sharpen };
}
