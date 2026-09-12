// components/shared/ShareLinks.tsx
//
// Rangée compacte de liens de partage, à poser dans le pied d'une carte.
//
// POURQUOI DES LIENS INLINE ET PAS UN MENU DÉROULANT. Deux raisons concrètes,
// pas une préférence d'esthétique :
//   - les cartes qui l'accueillent portent `overflow-hidden` sur leur racine
//     (le zoom de la vignette au survol en dépend) : un popover y serait rogné ;
//   - deux des trois actions sont de simples `a` vers les composeurs web des
//     réseaux, donc utilisables même si le JavaScript n'a pas encore chargé.
//     Seule la copie exige du script, et elle le dit quand elle échoue.
//
// AUCUN SDK, AUCUN SCRIPT TIERS. Ces réseaux en fournissent ; ils posent des
// traceurs sur une page publique, et il faudrait les déclarer au bandeau
// cookies. Les intents sont des URLs ordinaires : rien n'est chargé tant que
// personne ne clique. Même parti pris que `components/News/ShareArticle.tsx`.
//
// ⚠️ NE JAMAIS RENDRE CE COMPOSANT À L'INTÉRIEUR D'UNE ANCRE. Il contient des
// liens et un bouton : imbriqués dans un `a`, le HTML est invalide et la
// navigation au clavier casse. Les cartes qui l'utilisent suivent le motif du
// « lien étiré » — la carte est un conteneur, seul le titre est un lien, et le
// pseudo-élément de ce lien couvre la carte. Ce composant se pose AU-DESSUS,
// d'où le `z-10` : sans lui, la zone cliquable du titre le recouvrirait.

import { useCallback, type JSX } from 'react';
import { BlueskyIcon, LinkIcon, XIcon } from '@/components/Icons';
import { useToast } from '@/components/Toast';

export type ShareLinksLabels = {
  /**
   * Nom accessible du groupe, DÉJÀ formaté avec l'intitulé de l'élément
   * partagé. Sans lui, un lecteur d'écran parcourant l'accueil annonce sept
   * fois « Partager sur Bluesky » sans jamais dire de quoi il s'agit.
   */
  group: string;
  bluesky: string;
  x: string;
  copy: string;
  copied: string;
  copyError: string;
};

const ITEM_CLASS =
  'inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]';

export default function ShareLinks({
  url,
  text,
  labels,
  className = '',
}: {
  /** URL ABSOLUE. Une URL relative donnerait un intent cassé — cf. `absoluteUrl`. */
  url: string;
  /** Texte pré-rempli dans le composeur : titre d'article, légende de publication. */
  text: string;
  labels: ShareLinksLabels;
  className?: string;
}): JSX.Element {
  const { addToast } = useToast();

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      addToast(labels.copied, 'success');
    } catch {
      // Presse-papiers refusé (contexte non sécurisé, permission refusée) : on
      // le dit, plutôt que de laisser croire que le lien est copié.
      addToast(labels.copyError, 'error');
    }
  }, [url, addToast, labels.copied, labels.copyError]);

  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text);

  return (
    <div
      role="group"
      aria-label={labels.group}
      className={`relative z-10 flex items-center gap-0.5 ${className}`}
    >
      {/* Bluesky n'a pas de champ `url` séparé : tout va dans le texte. */}
      <a
        href={`https://bsky.app/intent/compose?text=${encodeURIComponent(`${text} ${url}`)}`}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={labels.bluesky}
        title={labels.bluesky}
        className={ITEM_CLASS}
      >
        <BlueskyIcon className="h-3.5 w-3.5" />
      </a>
      {/* `x.com/intent/post` est l'adresse actuelle. `twitter.com/intent/tweet`
          fonctionne encore par redirection, mais faire transiter les gens par
          un domaine mort n'a plus de raison d'être. */}
      <a
        href={`https://x.com/intent/post?text=${encodedText}&url=${encodedUrl}`}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={labels.x}
        title={labels.x}
        className={ITEM_CLASS}
      >
        <XIcon className="h-3.5 w-3.5" />
      </a>
      <button
        type="button"
        onClick={copy}
        aria-label={labels.copy}
        title={labels.copy}
        className={ITEM_CLASS}
      >
        <LinkIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
