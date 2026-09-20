// components/player/requests/RequestTabs.tsx
//
// En-tête d'onglets (Transfert / Scrim) de la page « Demandes ». Purement
// présentationnel : l'état `tab` et la logique de reset vivent dans la page
// parent.
//
// POURQUOI LA PRIMITIVE PARTAGÉE PLUTÔT QUE DEUX BOUTONS À LA MAIN. La version
// précédente portait les bons attributs — `role="tablist"`, `role="tab"`,
// `aria-selected`, `aria-controls` — mais PAS le comportement qui va avec :
// aucune gestion des flèches, et les deux boutons dans l'ordre de tabulation.
//
// C'EST PIRE QU'UN SIMPLE MANQUE. En annonçant `tablist`, on promet à un
// lecteur d'écran que les flèches changent d'onglet : il l'annonce à la
// personne (« onglet 1 sur 2 »), qui appuie sur la flèche… et rien ne se
// passe. Un rôle ARIA est un contrat de comportement, pas une étiquette.
//
// `components/ui/Tabs` porte le motif complet : focus roving (un seul arrêt de
// tabulation), flèches, Home et Fin.
//
// LES ICÔNES RESTENT, dans le libellé : elles sont décoratives (`aria-hidden`),
// le mot à côté dit ce que fait l'onglet.

import type { JSX } from 'react';

import Tabs, { type TabItem } from '@/components/ui/Tabs';
import { useT } from '@/lib/i18n/useT';
import nsPlayerRequests from '@/lib/i18n/locales/fr/playerRequests';

type Tab = 'transfer' | 'scrim';

/** L'identifiant partagé avec le panneau, côté page. */
export const REQUESTS_TAB_BASE = 'requests';

function TransferIcon(): JSX.Element {
  return (
    <svg
      className="w-4 h-4"
      aria-hidden="true"
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
  );
}

function ScrimIcon(): JSX.Element {
  return (
    <svg
      className="w-4 h-4"
      aria-hidden="true"
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
  );
}

export default function RequestTabs({
  tab,
  onTabChange,
}: {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
}) {
  const t = useT(nsPlayerRequests);

  const tabs: TabItem[] = [
    {
      id: 'transfer',
      label: (
        <span className="flex items-center justify-center gap-2">
          <TransferIcon />
          {t.tabTransfer}
        </span>
      ),
    },
    {
      id: 'scrim',
      label: (
        <span className="flex items-center justify-center gap-2">
          <ScrimIcon />
          {t.tabScrim}
        </span>
      ),
    },
  ];

  return (
    <Tabs
      tabs={tabs}
      active={tab}
      onChange={(id) => onTabChange(id as Tab)}
      ariaLabel={t.tabsAria}
      idBase={REQUESTS_TAB_BASE}
      className="mb-6"
    />
  );
}
