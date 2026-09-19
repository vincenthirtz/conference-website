// components/tcg/TcgCard.tsx
//
// Une carte du TCG : une joueuse, une équipe ou une map.
//
// LA MAP EST LE SEUL SUJET DONT L'IMAGE EXISTE TOUJOURS. Une maquette voxel est
// un dessin produit par le projet (`npm run maps:render`), pas la photo d'une
// personne : rien à consentir, rien à révoquer, et donc jamais d'aplat de repli
// — sauf si la map a quitté le registre, cas que `readMapFaces` rend
// explicitement sans image plutôt que de pointer vers un fichier absent.
//
// LES COULEURS DE RARETÉ SONT CELLES DES BADGES DU PROFIL, pas une palette
// inventée. `BADGE_TIER_STYLES` (fiche joueuse) habille déjà bronze / silver /
// gold / platinum, et mon barème fait correspondre exactement `common` /
// `rare` / `epic` / `legendary` à ces quatre paliers. Une seconde palette
// aurait donné des couleurs contradictoires sur le profil de la MÊME joueuse —
// le travers que `utils/tcg/rarity.ts` évite déjà côté calcul.
//
// AUCUNE IMAGE GÉNÉRÉE. Sans photo consentie ni avatar, la carte affiche un
// fond de marque et l'initiale du nom. Le projet n'utilise pas d'imagerie IA,
// et un portrait inventé pour représenter une personne réelle serait pire
// qu'un aplat.
//
// LE `foil` EST UN REFLET, PAS UN CINQUIÈME PALIER. Il se superpose à la
// rareté sans la modifier — sinon le barème cesserait de dire la vérité sur le
// parcours de la joueuse (cf. `FOIL_CHANCE`).

import Image from 'next/image';
import Link from 'next/link';
import type { JSX } from 'react';
import LogoCredit from '@/components/Team/LogoCredit';
import { isOptimizableImageUrl } from '@/utils/images/optimizableImage';
import { figureUrl, type FigureRole } from '@/utils/tcg/roleFigures';
import { RARITY_ORDER, type TcgRarity } from '@/utils/tcg/rarity';

/**
 * Habillage par rareté, aligné sur `BADGE_TIER_STYLES` de la fiche joueuse :
 * common↔bronze, rare↔silver, epic↔gold, legendary↔platinum.
 */
const RARITY_STYLES: Record<TcgRarity, string> = {
  common: 'border-amber-700/50 bg-amber-700/10',
  rare: 'border-zinc-400/40 bg-zinc-400/10',
  epic: 'border-yellow-500/40 bg-yellow-500/10',
  legendary: 'border-cyan-400/40 bg-cyan-400/10',
};

/**
 * Exporté pour que `TcgCollectionProgress` habille ses lignes de rareté avec
 * EXACTEMENT ces teintes. Sans cet export, le composant de progression aurait
 * dû recopier la palette — et deux listes de classes libres de diverger
 * finissent par donner deux couleurs à la même rareté.
 */
export const RARITY_TEXT: Record<TcgRarity, string> = {
  common: 'text-amber-300',
  rare: 'text-zinc-200',
  epic: 'text-yellow-300',
  legendary: 'text-cyan-200',
};

/**
 * Repère de rareté qui ne dépend PAS de la couleur : un à quatre losanges.
 *
 * Les quatre teintes (bronze, argent, or, platine) se confondent en daltonisme
 * et sur un écran de téléphone en plein jour — l'argent et le platine surtout.
 * Le nom de la rareté reste écrit à côté ; ce repère le redouble d'une forme
 * qu'on compte d'un coup d'œil, comme les étoiles d'un classement. Décoratif
 * pour un lecteur d'écran, qui entend déjà le libellé.
 */
export function TcgRarityPips({
  rarity,
  className,
}: {
  rarity: TcgRarity;
  className?: string;
}): JSX.Element {
  const filled = RARITY_ORDER.indexOf(rarity) + 1;
  return (
    <span
      aria-hidden
      className={`inline-flex items-center gap-0.5 ${RARITY_TEXT[rarity]} ${className ?? ''}`}
    >
      {RARITY_ORDER.map((r, i) => (
        <span
          key={r}
          className={`inline-block h-1.5 w-1.5 rotate-45 ${
            i < filled ? 'bg-current' : 'border border-current opacity-30'
          }`}
        />
      ))}
    </span>
  );
}

export type TcgCardSubject =
  | {
      kind: 'player';
      userId: string;
      displayName: string | null;
      imageUrl: string | null;
      /**
       * Figurine voxel du RÔLE, affichée seulement sans photo ni avatar
       * (`utils/tcg/roleFigures.ts`). Optionnelle : un appelant qui ne la
       * fournit pas garde l'aplat de marque d'avant.
       */
      figure?: {
        role: FigureRole;
        color: string | null;
        heroName: string | null;
        heroSource: 'pick' | 'role' | null;
      } | null;
    }
  | {
      kind: 'team';
      teamId: string;
      name: string | null;
      slug: string | null;
      logoUrl: string | null;
      /**
       * Illustration déposée pour la carte. Absente ⇒ on retombe sur le logo.
       * Optionnelle pour que les appelants qui n'en disposent pas (aperçus,
       * maquettes) restent valides sans rien changer.
       */
      cardImageUrl?: string | null;
      /**
       * Crédit d'artiste du LOGO (`TeamFace.logoCredit`). Rendu uniquement
       * quand la carte montre le logo : une illustration dédiée n'est pas
       * l'œuvre de l'artiste du logo, et la créditer serait faux.
       */
      logoCredit?: { name: string; url: string | null } | null;
    }
  | {
      kind: 'map';
      slug: string;
      name: string | null;
      imageUrl: string | null;
    };

export type TcgCardProps = {
  subject: TcgCardSubject;
  rarity: TcgRarity;
  isFoil?: boolean;
  /** Nombre d'exemplaires possédés ; masqué si absent ou égal à 1. */
  count?: number;
  /**
   * Rend la carte SANS lien vers son sujet.
   *
   * Utile quand la carte est déjà affichée sur la page de ce sujet — la fiche
   * publique d'une joueuse montre sa propre carte : un lien vers la page en
   * cours n'apprend rien et ajoute une cible de tabulation de plus.
   */
  noLink?: boolean;
  /**
   * La carte est déjà DANS un élément interactif de la page hôte (le bouton de
   * sélection des échanges). `noLink` retire le lien de la carte, mais le
   * crédit poserait alors le sien — et un `<a>` dans un `<button>` est aussi
   * invalide qu'un lien dans un lien : le clic sur le nom choisirait la carte
   * ET ouvrirait la chaîne de l'artiste. Vrai ⇒ le nom est écrit sans lien.
   */
  insideInteractive?: boolean;
  /** Libellés traduits, fournis par la page hôte. */
  labels: {
    rarity: Record<TcgRarity, string>;
    foil: string;
    copies: string;
    /**
     * Gabarit du crédit de logo, avec `{artist}` (« Logo : {artist} »).
     * Optionnel : un écran qui ne le fournit pas n'affiche pas de crédit
     * plutôt qu'un texte en dur dans une seule langue.
     */
    logoCredit?: string;
    /**
     * Nom de chaque rôle, sous la figurine (« Tank »). Optionnel : sans lui,
     * seule une héroïne CHOISIE par la joueuse est nommée — jamais de texte
     * en dur dans une seule langue.
     */
    roles?: Record<FigureRole, string>;
  };
};

/**
 * L'image de la carte peut-elle passer par l'optimiseur de Next ?
 *
 * POURQUOI CE N'EST PAS « TOUJOURS ». `/player/tcg` affiche 40 cartes d'un
 * coup, et une photo consentie peut peser 2 Mio : servie brute dans une
 * vignette de 180 px, c'est toute la collection qui descend en pleine
 * résolution sur un téléphone en 4G. Mais l'ancien `unoptimized`
 * inconditionnel avait une raison réelle : une carte d'ÉQUIPE sans
 * illustration affiche le LOGO, dont l'URL est fournie par l'équipe et peut
 * viser n'importe quel hôte — et `next/image` ÉCHOUE AU RENDU hors
 * `remotePatterns`. D'où l'arbitrage partagé `isOptimizableImageUrl` (même
 * choix que `Team/TeamAvatar.tsx`).
 *
 * LE SVG RESTE SERVI TEL QUEL. Les maquettes de maps sont des SVG locaux
 * (`readMapFaces`) : l'optimiseur n'a rien à réduire dans un vectoriel et le
 * renverrait inchangé — mais depuis une fonction serveur plutôt que le fichier
 * statique en cache, et sous une URL distincte par largeur du `srcset`. Pure
 * perte, et 40 cartes de maps d'un coup dans une collection.
 *
 * Exportée pour être testée sans DOM.
 */
export function shouldOptimizeCardImage(
  url: string | null | undefined
): boolean {
  if (!isOptimizableImageUrl(url)) return false;
  // Le chemin seul : un `?v=` de cache ne doit pas masquer l'extension.
  const path = (url ?? '').trim().split(/[?#]/)[0].toLowerCase();
  return !path.endsWith('.svg');
}

function initial(name: string | null): string {
  const trimmed = (name ?? '').trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

export default function TcgCard({
  subject,
  rarity,
  isFoil = false,
  count,
  noLink = false,
  insideInteractive = false,
  labels,
}: TcgCardProps): JSX.Element {
  const name =
    subject.kind === 'player' ? subject.displayName : (subject.name ?? null);
  // Le cas particulier est l'ÉQUIPE, qui porte un `logoUrl` : joueuses et maps
  // nomment toutes deux leur image `imageUrl`. Écrit dans ce sens pour qu'un
  // quatrième sujet n'ait rien à ajouter ici.
  //
  // Une équipe a deux visuels possibles : l'illustration que sa capitaine a
  // déposée, et son logo. Le repli est ici parce que le CADRAGE en dépend, et
  // que les deux décisions n'en font qu'une : une illustration est faite pour
  // remplir le cadre, un logo pour y flotter sans être rogné.
  const usesTeamLogo = subject.kind === 'team' && !subject.cardImageUrl;
  const imageUrl =
    subject.kind === 'team'
      ? (subject.cardImageUrl ?? subject.logoUrl)
      : subject.imageUrl;
  const href = noLink
    ? null
    : subject.kind === 'player'
      ? `/player/${subject.userId}`
      : subject.kind === 'map'
        ? // Aucune page par map n'existe : on vise l'ancre de la maquette sur
          // la page du pool, que `MapCard` pose sur son article.
          `/maps-voxel#${subject.slug}`
        : subject.slug
          ? // `/team/` au SINGULIER : c'est la route publique réelle
            // (pages/team/[slug]/index.tsx). Le pluriel menait à un 404 sur
            // chaque carte d'équipe.
            `/team/${subject.slug}`
          : null;

  const figure = subject.kind === 'player' ? (subject.figure ?? null) : null;
  // Une héroïne CHOISIE par la joueuse est nommée ; une héroïne seulement
  // DÉDUITE de sa spécialité ne l'est pas — la carte dit alors le rôle, comme
  // la figurine. Affirmer « elle joue Reinhardt » parce qu'elle joue tank
  // serait parler à sa place (cf. utils/heroes/recommendCardHero.ts).
  const figureCaption = figure
    ? figure.heroSource === 'pick' && figure.heroName
      ? `♥ ${figure.heroName}`
      : (labels.roles?.[figure.role] ?? null)
    : null;

  const inner = (
    <>
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-t-xl bg-gradient-to-br from-[var(--color-violet)]/25 to-[var(--color-green)]/15">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 45vw, 180px"
            className={usesTeamLogo ? 'object-contain p-4' : 'object-cover'}
            // Optimisée seulement quand c'est sûr (cf.
            // `shouldOptimizeCardImage`) : c'est ce qui rend son `srcset` à
            // `sizes`, que `unoptimized` rendait lettre morte.
            unoptimized={!shouldOptimizeCardImage(imageUrl)}
          />
        ) : figure ? (
          // Ni photo consentie ni avatar, mais un rôle connu : la figurine de
          // ce rôle, aux couleurs de son équipe. Jamais l'image d'un héros du
          // jeu (aucune n'est sous licence ici, cf. utils/tcg/roleFigures.ts).
          <>
            {/* biome-ignore lint/performance/noImgElement: SVG rendu par nos soins — next/image n'optimise pas le SVG */}
            <img
              src={figureUrl(figure.role, figure.color)}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-contain"
            />
            {figureCaption && (
              <span className="absolute bottom-1.5 left-1/2 max-w-[90%] -translate-x-1/2 truncate rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white/90">
                {figureCaption}
              </span>
            )}
          </>
        ) : (
          // Ni photo, ni avatar, ni rôle connu : un aplat de marque et
          // l'initiale — on n'attribue pas un rôle au hasard.
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center text-4xl font-black text-white/70"
          >
            {initial(name)}
          </span>
        )}

        {isFoil && (
          // Reflet purement décoratif, superposé à la rareté.
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/25 to-transparent mix-blend-screen"
          />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="truncate text-sm font-semibold text-white">
          {name ?? '—'}
        </p>
        <p
          className={`flex flex-wrap items-center gap-x-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] ${RARITY_TEXT[rarity]}`}
        >
          <TcgRarityPips rarity={rarity} />
          <span>
            {labels.rarity[rarity]}
            {isFoil ? ` · ${labels.foil}` : ''}
          </span>
        </p>
        {usesTeamLogo &&
          subject.kind === 'team' &&
          // Sans logo, la carte montre une initiale : rien à créditer.
          subject.logoUrl &&
          subject.logoCredit &&
          labels.logoCredit && (
            <LogoCredit
              name={subject.logoCredit.name}
              url={subject.logoCredit.url}
              label={labels.logoCredit}
              // Carte cliquable, ou posée dans un bouton ⇒ pas de lien imbriqué
              // (cf. `LogoCredit`).
              linkable={!href && !insideInteractive}
              className="truncate text-[11px]"
            />
          )}
        {typeof count === 'number' && count > 1 && (
          <p className="text-[11px] text-gray-400">
            {labels.copies.replace('{count}', String(count))}
          </p>
        )}
      </div>
    </>
  );

  const shell = `card-brand group flex flex-col overflow-hidden rounded-xl border ${RARITY_STYLES[rarity]} transition-transform duration-300 hover:-translate-y-0.5 motion-reduce:transform-none`;

  // Une carte dont le sujet n'a pas de page publique reste une carte : on la
  // rend sans lien plutôt que de fabriquer une URL qui mènerait à un 404.
  return href ? (
    <Link
      href={href}
      className={`${shell} focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]`}
    >
      {inner}
    </Link>
  ) : (
    <article className={shell}>{inner}</article>
  );
}
