// components/News/ShareArticle.tsx
//
// Fin d'article : partager, ou continuer.
//
// CE QU'IL Y AVAIT AVANT : un gros bouton « Flux RSS » en dégradé de marque,
// seule action proposée. Le RSS est utile, mais c'est l'usage d'une minorité
// d'habitués — lui donner le poids visuel le plus fort d'une page d'article,
// c'est mettre en avant ce dont presque personne ne se sert, à l'endroit précis
// où la lectrice vient de finir et se demande quoi faire.
//
// Les liens sont des `a` ordinaires vers les composeurs web des réseaux : pas
// de SDK, pas de script tiers, donc aucun traceur ajouté à une page publique —
// et rien à charger avant que quelqu'un clique.

import Link from 'next/link';
import { useState } from 'react';
import type { JSX } from 'react';

export type ShareLabels = {
  title: string;
  onBluesky: string;
  onX: string;
  onFacebook: string;
  copyLink: string;
  copied: string;
  allNews: string;
  rss: string;
};

export default function ShareArticle({
  url,
  title,
  labels,
}: {
  /** Absolue quand on la connaît ; sinon on la lit dans le navigateur. */
  url: string | null;
  title: string;
  labels: ShareLabels;
}): JSX.Element {
  const [copied, setCopied] = useState(false);

  // `url` vient du rendu statique et peut manquer si NEXT_PUBLIC_SITE_URL n'est
  // pas défini : on retombe alors sur l'adresse courante, connue du navigateur.
  const shareUrl = url ?? '';
  const encoded = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(title);

  async function copy(): Promise<void> {
    const target = shareUrl || window.location.href;
    try {
      await navigator.clipboard.writeText(target);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Presse-papiers refusé (contexte non sécurisé, permission) : on ne
      // prétend pas avoir copié.
    }
  }

  const linkClass =
    'inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-gray-200 transition-colors hover:border-[var(--color-violet)]/50 hover:bg-white/10 hover:text-white';

  return (
    <section className="mt-12 border-t border-white/10 pt-6">
      <h2 className="text-xs uppercase tracking-[0.16em] text-gray-500">
        {labels.title}
      </h2>

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={`https://bsky.app/intent/compose?text=${encodedTitle}%20${encoded}`}
          target="_blank"
          rel="noreferrer noopener"
          className={linkClass}
        >
          {labels.onBluesky}
        </a>
        <a
          href={`https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encoded}`}
          target="_blank"
          rel="noreferrer noopener"
          className={linkClass}
        >
          {labels.onX}
        </a>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encoded}`}
          target="_blank"
          rel="noreferrer noopener"
          className={linkClass}
        >
          {labels.onFacebook}
        </a>
        <button type="button" onClick={copy} className={linkClass}>
          {copied ? labels.copied : labels.copyLink}
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <Link
          href="/news"
          className="font-medium text-[var(--color-violet-light)] hover:text-[var(--color-violet)]"
        >
          {labels.allNews}
        </Link>
        {/* Le RSS descend au rang de lien : présent pour qui le cherche, sans
            occuper la place de l'action principale. */}
        <a
          href="/api/news/rss"
          target="_blank"
          rel="noreferrer noopener"
          className="text-gray-500 hover:text-gray-300"
        >
          {labels.rss}
        </a>
      </div>
    </section>
  );
}
