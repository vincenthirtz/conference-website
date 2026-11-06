// features/player/tournamentRules/pdfEngine.ts — pdf.js derrière une façade
// minuscule, chargé À LA DEMANDE.
//
// POURQUOI UN IMPORT DYNAMIQUE. pdf.js pèse ~130 ko gzippés côté page et son
// worker ~370 ko : ils ne servent qu'à la liseuse du règlement
// (/player/tournaments/[id]/reglement). `import('pdfjs-dist')` en fait un
// chunk asynchrone, chargé quand la liseuse s'ouvre — jamais dans le premier
// chargement d'une page, publique ou joueuse (scripts/bundle-budget.mjs).
//
// LE WORKER EST SERVI PAR LE SITE. `new URL(…, import.meta.url)` fait émettre
// le fichier par le bundler sous /_next/static/ : même origine, donc permis
// par `worker-src 'self'` de proxy.ts, sans CDN tiers ni `blob:`. Les
// fichiers /_next/static/ ne reçoivent pas d'en-tête CSP (matcher de
// proxy.ts, cloudflare/_headers) : le worker garde le droit de compiler son
// WebAssembly interne (fonctions PostScript, repli JS en cas de refus).
//
// LES OCTETS ARRIVENT DÉJÀ LUS (client.ts, même origine) : pdf.js ne fait
// aucune requête lui-même — l'erreur HTTP est la nôtre, avec son « Réessayer ».
//
// Pas d'eval : `isEvalSupported` n'existe plus depuis pdf.js 5 et rien ici ne
// demande `'unsafe-eval'` à la page.

import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

/** Largeur maximale du rendu en pixels réels : au-delà, la mémoire explose. */
const MAX_PIXEL_WIDTH = 1800;

export type RulesPdfPage = {
  /** Dimensions à l'échelle 1 (points PDF) : rapport hauteur / largeur. */
  width: number;
  height: number;
  /** La page en image PNG, à la largeur CSS demandée. */
  renderToBlob: (cssWidth: number, pixelRatio: number) => Promise<Blob>;
  /** Le texte de la page, pour les lecteurs d'écran. */
  text: () => Promise<string>;
  /** Libère les ressources de la page côté pdf.js. */
  release: () => void;
};

export type RulesPdfDocument = {
  numPages: number;
  page: (pageNumber: number) => Promise<RulesPdfPage>;
  destroy: () => void;
};

type PdfJs = typeof import('pdfjs-dist');

let enginePromise: Promise<PdfJs> | null = null;

function loadEngine(): Promise<PdfJs> {
  enginePromise ??= import('pdfjs-dist')
    .then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
      return pdfjs;
    })
    .catch((err: unknown) => {
      // Chunk introuvable (déploiement entre-temps, réseau) : « Réessayer »
      // doit retenter le chargement, pas resservir l'échec mémorisé.
      enginePromise = null;
      throw err;
    });
  return enginePromise;
}

function wrapPage(page: PDFPageProxy): RulesPdfPage {
  const base = page.getViewport({ scale: 1 });
  return {
    width: base.width,
    height: base.height,
    renderToBlob: async (cssWidth, pixelRatio) => {
      const wanted = (cssWidth / base.width) * Math.max(1, pixelRatio);
      const scale = Math.min(wanted, MAX_PIXEL_WIDTH / base.width);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      try {
        await page.render({ canvas, viewport }).promise;
        return await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (blob) =>
              blob ? resolve(blob) : reject(new Error('toBlob a échoué')),
            'image/png'
          );
        });
      } finally {
        // Une image garde la page ; le canevas, lui, retient des mégaoctets.
        canvas.width = 0;
        canvas.height = 0;
      }
    },
    text: async () => {
      const content = await page.getTextContent();
      return content.items
        .map((item) =>
          'str' in item ? `${item.str}${item.hasEOL ? '\n' : ''}` : ''
        )
        .join('')
        .trim();
    },
    release: () => {
      page.cleanup();
    },
  };
}

/** Ouvre un PDF déjà téléchargé. Rejette si les octets ne sont pas un PDF. */
export async function openRulesPdf(
  data: Uint8Array
): Promise<RulesPdfDocument> {
  const pdfjs = await loadEngine();
  const task = pdfjs.getDocument({
    data,
    // Pas de WebAssembly ni de fichiers annexes à aller chercher : aucune
    // requête de plus que celle du PDF, rien à ouvrir dans la CSP.
    useWasm: false,
    verbosity: 0,
  });
  let doc: PDFDocumentProxy;
  try {
    doc = await task.promise;
  } catch (err) {
    void task.destroy();
    throw err;
  }
  return {
    numPages: doc.numPages,
    page: async (n) => wrapPage(await doc.getPage(n)),
    destroy: () => {
      void task.destroy();
    },
  };
}
