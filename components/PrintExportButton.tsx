// components/PrintExportButton.tsx
//
// « Exporter en PDF », partout de la même façon.
//
// L'export EST un window.print(). Le navigateur sait déjà écrire un PDF, et il
// le fait avec la mise en page qu'on a déjà écrite ; produire le document nous
// -mêmes (jsPDF, pdfmake, un rendu headless côté serveur) aurait ajouté une
// dépendance ET un second moteur de mise en page à tenir en phase avec le
// premier — pour un tableau de matchs, c'est disproportionné. Les règles
// d'impression vivent dans `styles/globals.css` (bloc `@media print`).
//
// Le bouton se cache lui-même à l'impression : il n'a rien à faire sur la
// feuille.

import { useCallback } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsPrintExport from '@/lib/i18n/locales/fr/printExport';

export default function PrintExportButton({
  className = '',
  variant = 'public',
}: {
  className?: string;
  /** `public` suit la charte du site ; `admin` celle des écrans neutres. */
  variant?: 'public' | 'admin';
}) {
  const t = useT(nsPrintExport);

  const handlePrint = useCallback(() => {
    // `window.print()` est bloquant dans certains navigateurs : on laisse le
    // rendu se terminer avant d'ouvrir la boîte de dialogue, sinon un bouton
    // encore en état « pressé » se retrouve figé dans le PDF.
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => window.print());
  }, []);

  const base =
    'print:hidden inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2';
  const skin =
    variant === 'admin'
      ? 'border border-neutral-600 bg-neutral-800 text-neutral-100 hover:bg-neutral-700 focus-visible:ring-neutral-400'
      : 'border border-white/15 bg-white/5 text-white hover:border-[var(--color-green)]/60 hover:bg-[var(--color-green)]/10 hover:text-[var(--color-green-light)] focus-visible:ring-[var(--color-green)]';

  return (
    <button
      type="button"
      onClick={handlePrint}
      className={`${base} ${skin} ${className}`}
      title={t.hint}
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 9V2h12v7" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <path d="M6 14h12v8H6z" />
      </svg>
      {t.label}
    </button>
  );
}
