// components/overlay/TcgAnnouncement.tsx
//
// UNE annonce de l'overlay TCG : la pastille qui apparaît en surimpression
// quand une carte est gagnée pendant un direct.
//
// POURQUOI CE COMPOSANT EXISTE SÉPARÉMENT, et c'est toute sa raison d'être :
// il est rendu à DEUX endroits — la source navigateur réelle
// (`pages/overlay/tcg/[token].tsx`) et l'aperçu de l'éditeur d'habillage côté
// admin. Si l'aperçu redessinait sa propre imitation de la pastille, les deux
// divergeraient au premier réglage ajouté, et l'aperçu mentirait précisément
// sur ce qu'il est censé montrer. Un aperçu qui n'est pas le rendu réel est
// pire qu'une absence d'aperçu : il donne confiance à tort.
//
// AUCUNE I/O, AUCUNE TRADUCTION. Le composant reçoit son texte et son habillage
// par prop. L'overlay public les tire de `useT` + de la route porteuse du
// jeton ; l'aperçu admin les tire de l'état du formulaire, sans rien écrire.
// C'est ce qui rend l'aperçu instantané et sans effet de bord.
//
// LE TEXTE PERSONNALISÉ EST RENDU EN TEXTE, JAMAIS EN HTML. Une régie saisit
// une phrase libre qui s'affichera devant l'audience d'un direct ; React
// l'échappe par construction, et il n'y a délibérément aucun
// `dangerouslySetInnerHTML` ici. Ce n'est pas une précaution théorique : le
// champ est éditable par tout compte staff de l'espace.

// Depuis le module de FORME, jamais depuis `overlayTheme.ts` : celui-là importe
// `supabaseAdmin`, et un composant client qui y puise entraîne les polyfills
// Node dans le bundle — sans erreur ni avertissement.
import type { OverlayTheme } from '@/utils/tcg/overlayThemeShape';

/** Ce qu'une annonce a besoin de savoir de l'événement. */
export type AnnouncementItem = {
  kind: 'twitch_drop' | 'match_win' | 'scrim_win';
  /** Pseudo Twitch, ou `null` : cf. `utils/tcg/overlayFeed.ts`. */
  twitchLogin: string | null;
};

/** Les libellés traduits, que le thème peut remplacer. */
export type AnnouncementLabels = {
  dropEyebrow: string;
  winEyebrow: string;
  /** Interpolent `{name}`. */
  dropLine: string;
  winLine: string;
  anonymous: string;
};

function interpolate(template: string, name: string): string {
  return template.split('{name}').join(name);
}

export default function TcgAnnouncement({
  item,
  theme,
  labels,
}: {
  item: AnnouncementItem;
  theme: OverlayTheme;
  labels: AnnouncementLabels;
}) {
  const isDrop = item.kind === 'twitch_drop';
  // Sans pseudo Twitch, un libellé neutre — jamais le nom du compte du site.
  const name = item.twitchLogin ?? labels.anonymous;

  // La formulation de la régie l'emporte sur la traduction, si elle existe.
  // `null` (champ vidé) veut dire « reviens au défaut traduit », pas « vide ».
  const template = isDrop
    ? (theme.dropLine ?? labels.dropLine)
    : (theme.winLine ?? labels.winLine);

  return (
    <li
      className="flex items-center gap-3 rounded-2xl border border-white/15 bg-black/70 px-5 py-3 shadow-2xl backdrop-blur-sm"
      style={{ animation: 'tcgOverlayIn 320ms ease-out' }}
    >
      {theme.mediaUrl ? (
        <Media url={theme.mediaUrl} kind={theme.mediaKind} />
      ) : (
        <span
          aria-hidden
          className="text-2xl"
          // La couleur d'accent ne distingue plus drop et victoire quand la
          // régie en a choisi une : c'est SA charte, elle prime sur notre code
          // de couleur interne.
          style={{ color: theme.accentColor }}
        >
          {isDrop ? '★' : '✦'}
        </span>
      )}

      <span className="min-w-0">
        <span
          className="block text-[10px] font-bold uppercase tracking-[0.18em]"
          style={{ color: theme.accentColor }}
        >
          {isDrop ? labels.dropEyebrow : labels.winEyebrow}
        </span>
        <span className="block truncate text-base font-semibold text-white">
          {interpolate(template, name)}
        </span>
      </span>
    </li>
  );
}

/**
 * Le média d'habillage, à la place du glyphe.
 *
 * `aria-hidden` et pas de texte alternatif : c'est une décoration, et la phrase
 * à côté porte déjà toute l'information. Un overlay n'est de toute façon lu par
 * aucun lecteur d'écran — il vit dans une source navigateur d'OBS.
 *
 * La vidéo est MUETTE, en boucle et jouée automatiquement : une source OBS ne
 * reçoit aucun clic, donc un média qui attend une interaction resterait figé
 * sur sa première image. `playsInline` évite qu'un navigateur mobile — un
 * aperçu ouvert sur téléphone, par exemple — la passe en plein écran.
 */
function Media({ url, kind }: { url: string; kind: 'image' | 'video' | null }) {
  if (kind === 'video') {
    return (
      <video
        aria-hidden
        src={url}
        autoPlay
        loop
        muted
        playsInline
        className="h-10 w-10 shrink-0 rounded-lg object-cover"
      />
    );
  }

  // `<img>` et non `next/image` : l'URL vient d'un bucket de stockage, et
  // l'optimiseur exigerait de déclarer ce domaine dans `remotePatterns` — un
  // hôte manquant y rend l'image invisible sans la moindre erreur serveur.
  //
  // La directive est collée à la balise, PAS avant le `return` : `eslint .`
  // tourne avec `--fix` dans ce dépôt, et une directive qui ne couvre pas la
  // bonne ligne est jugée inutilisée, donc SUPPRIMÉE au prochain lint.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      aria-hidden
      alt=""
      src={url}
      className="h-10 w-10 shrink-0 rounded-lg object-cover"
    />
  );
}
