// components/player/requests/RequestTabs.tsx
//
// En-tête d'onglets (Transfert / Scrim) de la page « Demandes ». Purement
// présentationnel : l'état `tab` et la logique de reset vivent dans la page
// parent. Extrait de pages/player/requests.tsx sans changement de comportement.

import { useT } from '@/lib/i18n/useT';

type Tab = 'transfer' | 'scrim';

export default function RequestTabs({
  tab,
  onTabChange,
}: {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
}) {
  const t = useT('playerRequests');
  return (
    <div role="tablist" aria-label={t.tabsAria} className="flex gap-2 mb-6">
      <button
        type="button"
        role="tab"
        id="requests-tab-transfer"
        aria-selected={tab === 'transfer'}
        aria-controls="requests-tabpanel"
        onClick={() => onTabChange('transfer')}
        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition border ${
          tab === 'transfer'
            ? 'bg-purple-600/30 border-purple-400/50 text-white'
            : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
        }`}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M16 3h5v5" />
          <line x1="21" y1="3" x2="14" y2="10" />
          <path d="M8 21H3v-5" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
        {t.tabTransfer}
      </button>
      <button
        type="button"
        role="tab"
        id="requests-tab-scrim"
        aria-selected={tab === 'scrim'}
        aria-controls="requests-tabpanel"
        onClick={() => onTabChange('scrim')}
        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition border ${
          tab === 'scrim'
            ? 'bg-blue-600/30 border-blue-400/50 text-white'
            : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
        }`}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <polygon points="10 8 16 12 10 16 10 8" />
        </svg>
        {t.tabScrim}
      </button>
    </div>
  );
}
