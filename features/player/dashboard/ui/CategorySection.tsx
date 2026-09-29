// features/player/dashboard/ui/CategorySection.tsx — une catégorie repliable
// du tableau de bord (lot J6, extraite au lot P12). Le pli est mémorisé par
// personne et par navigateur ; un lien vers une ancre de la section la déplie
// temporairement.

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Router from 'next/router';
import { useT } from '@/lib/i18n/useT';
import nsPlayerIndex from '@/lib/i18n/locales/fr/playerIndex';
import {
  sectionPanelId,
  shouldExpandForHash,
} from '@/utils/player/dashboardAnchors';

// Section de catégorie du dashboard : un « eyebrow » discret (muet, uppercase,
// tracking large — le style de label du site) suivi des cartes de la catégorie
// avec un rythme vertical constant. À ne rendre QUE si la catégorie contient au
// moins une carte visible (l'appelant décide via `visible`).
export default function CategorySection({
  id,
  label,
  action,
  children,
}: {
  /** Clé de mémorisation du pli — stable, jamais le libellé traduit. */
  id: string;
  label: string;
  /**
   * Lien d'en-tête, à droite du libellé (« Voir tous mes matchs »). Hors du
   * bouton de pli : il reste atteignable section repliée.
   */
  action?: ReactNode;
  children: ReactNode;
}) {
  const t = useT(nsPlayerIndex);
  // Pli mémorisé PAR PERSONNE et par navigateur (lot J6). Ouvert par défaut :
  // on ne cache rien à quelqu'un qui n'a rien demandé — on lui donne le moyen
  // de ranger ce qu'il ne regarde jamais.
  const storageKey = `player.section.${id}.collapsed`;
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(storageKey) === '1');
    } catch {
      /* navigation privée / stockage bloqué : on reste déplié */
    }
  }, [storageKey]);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, next ? '1' : '0');
      } catch {
        /* idem : le pli reste alors le temps de la page */
      }
      return next;
    });
  };

  const panelId = sectionPanelId(id);
  const panelRef = useRef<HTMLDivElement>(null);

  // Un lien vers une ancre de CETTE section (mail « on veut jouer contre
  // vous » → `#section-scrims`, bandeau « à faire » → `#pending-scrims`) doit
  // l'ouvrir : une ancre dans un élément `hidden` ne fait pas défiler, et le
  // pli est mémorisé — quelqu'un qui avait replié « Scrims » ne pouvait plus y
  // être amené par aucun lien. Le dépli est TEMPORAIRE (non écrit en
  // localStorage) : suivre un lien n'est pas changer d'avis sur le rangement.
  //
  // Déclaré APRÈS l'effet de restauration : au montage, le dépli passe après
  // la lecture du pli mémorisé. `hashChangeComplete` couvre le clic sur un
  // `<Link>` depuis /player même (Next pousse l'URL sans `hashchange` natif) ;
  // `hashchange` couvre le reste. Le défilement lui-même est fait par l'écran.
  useEffect(() => {
    const reveal = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const expand = shouldExpandForHash(
        window.location.hash,
        panelId,
        (targetId) => {
          const el = document.getElementById(targetId);
          return !!el && panel.contains(el);
        }
      );
      if (expand) setCollapsed(false);
    };
    reveal();
    window.addEventListener('hashchange', reveal);
    Router.events.on('hashChangeComplete', reveal);
    return () => {
      window.removeEventListener('hashchange', reveal);
      Router.events.off('hashChangeComplete', reveal);
    };
  }, [panelId]);

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="min-w-0 flex-1">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-controls={panelId}
            className="flex w-full items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 transition hover:text-gray-300"
          >
            <span
              aria-hidden
              className={`inline-block transition-transform ${collapsed ? '' : 'rotate-90'}`}
            >
              ›
            </span>
            {label}
            <span className="sr-only">
              {collapsed ? t.sectionExpand : t.sectionCollapse}
            </span>
          </button>
        </h2>
        {action}
      </div>
      <div
        id={panelId}
        ref={panelRef}
        hidden={collapsed}
        className="scroll-mt-24 space-y-6"
      >
        {children}
      </div>
    </section>
  );
}
