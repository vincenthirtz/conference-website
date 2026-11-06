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
//   2. RENDU, dans l'ordre, une page après l'autre, en IMAGE (blob PNG) : un
//      canevas par page retiendrait des dizaines de mégaoctets sur mobile ; une
//      image, le navigateur sait la décharger hors écran. Le texte de chaque
//      page est extrait pour les lecteurs d'écran.
//
// Toute erreur (PDF injoignable, illisible, page qui ne se rend pas) fait
// passer la liseuse en `error` : jamais de « case active » sur un document
// qu'on n'a pas pu montrer. `retry()` recommence tout.

import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '@/utils/logger';
import { RulesFileError, tournamentRulesClient } from '../client';
import { openRulesPdf, type RulesPdfDocument } from '../pdfEngine';

export type RulesPdfPageView = {
  /** Dimensions à l'échelle 1 : fixent le rapport de la page avant rendu. */
  width: number;
  height: number;
  /** URL `blob:` de l'image, `null` tant que la page n'est pas rendue. */
  src: string | null;
  text: string;
};

export type RulesPdfState =
  | { phase: 'loading' }
  | { phase: 'error'; reason: 'file' | 'pdf' }
  | { phase: 'ready'; pages: RulesPdfPageView[]; rendered: number };

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
  /** Largeur CSS disponible pour une page (mesurée au moment du rendu). */
  measureWidth: () => number;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<RulesPdfState>({ phase: 'loading' });
  const measureRef = useRef(measureWidth);
  measureRef.current = measureWidth;

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let doc: RulesPdfDocument | null = null;
    const urls: string[] = [];
    setState({ phase: 'loading' });

    void (async () => {
      try {
        const bytes = await tournamentRulesClient.file(
          tournamentId,
          versionNumber
        );
        if (cancelled) return;
        const opened = await openRulesPdf(bytes);
        if (cancelled) {
          // Démonté pendant l'ouverture : le nettoyage est déjà passé.
          opened.destroy();
          return;
        }
        doc = opened;

        // 1. Mise en page complète avant tout rendu.
        const pages = [];
        for (let n = 1; n <= doc.numPages; n++) pages.push(await doc.page(n));
        if (cancelled) return;
        if (pages.length === 0) throw new Error('PDF sans page');
        setState({
          phase: 'ready',
          rendered: 0,
          pages: pages.map((p) => ({
            width: p.width,
            height: p.height,
            src: null,
            text: '',
          })),
        });

        // 2. Rendu dans l'ordre de lecture.
        const ratio =
          typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          const blob = await page.renderToBlob(
            Math.max(320, measureRef.current()),
            ratio
          );
          const text = await page.text().catch(() => '');
          page.release();
          if (cancelled) return;
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
      doc?.destroy();
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [tournamentId, versionNumber, enabled, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, retry };
}
