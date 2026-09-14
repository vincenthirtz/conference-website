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
      // Marges latérales larges : elles tiennent la phrase À L'INTÉRIEUR des
      // deux crochets. Trop serrées, le texte passe dessous et le motif cesse
      // d'encadrer quoi que ce soit.
      className="relative isolate overflow-hidden rounded-2xl border border-white/15 bg-black/70 px-16 py-6 text-center shadow-2xl backdrop-blur-sm"
      style={{ animation: 'tcgOverlayIn 320ms ease-out' }}
    >
      <PulseFx />

      {/* `relative` : le texte passe AU-DESSUS du FX, qui est en fond absolu.
          L'ombre portée le tient lisible pendant les 0,4 s où la lueur passe
          derrière lui — après quoi elle ne coûte plus rien. */}
      <span
        className="relative flex flex-col items-center gap-1"
        style={{ textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}
      >
        {theme.mediaUrl ? (
          <Media url={theme.mediaUrl} kind={theme.mediaKind} />
        ) : (
          <span
            aria-hidden
            className="text-2xl leading-none"
            // La couleur d'accent ne distingue plus drop et victoire quand la
            // régie en a choisi une : c'est SA charte, elle prime sur notre code
            // de couleur interne.
            style={{ color: theme.accentColor }}
          >
            {isDrop ? '★' : '✦'}
          </span>
        )}

        <span
          className="block text-[10px] font-bold uppercase tracking-[0.18em]"
          style={{ color: theme.accentColor }}
        >
          {isDrop ? labels.dropEyebrow : labels.winEyebrow}
        </span>
        <span className="block max-w-[22ch] truncate text-base font-semibold text-white">
          {interpolate(template, name)}
        </span>
      </span>
    </li>
  );
}

/**
 * L'HABILLAGE : le FX « pulse » de la charte, en fond de l'annonce.
 *
 * Deux crochets néon qui s'écartent puis s'éteignent, autour du vide central où
 * le texte est posé — c'est pour cela que la pastille est désormais CENTRÉE et
 * non plus alignée à gauche : le motif encadre une phrase, il ne la borde pas.
 *
 * `mix-blend-mode: screen` plutôt qu'une vidéo à canal alpha : le rendu est un
 * néon sur NOIR PUR, et le noir est l'élément neutre du mode écran — il
 * disparaît exactement, tandis que la lueur s'ajoute. On garde donc le fond
 * translucide de la pastille (un simple `object-cover` opaque l'aurait masqué),
 * sans dépendre d'un encodage alpha que tous les lecteurs ne servent pas.
 *
 * DEUX SOURCES, WEBM D'ABORD. La source d'origine est en HEVC, que le
 * navigateur embarqué d'OBS ne décode pas : elle ne montrerait rien du tout, et
 * sans erreur. Le VP9 est toujours disponible dans ce moteur ; le H.264 couvre
 * les navigateurs qui n'ont pas VP9. L'ordre compte — le premier lu gagne.
 *
 * JOUÉE UNE FOIS, PAS EN BOUCLE. Le motif dure 0,4 s et se termine sur du noir :
 * c'est un impact à l'apparition, qui s'efface ensuite pour laisser lire la
 * phrase. En boucle, il clignoterait toutes les 400 ms derrière un texte —
 * pénible à regarder, et illisible.
 */
function PulseFx() {
  return (
    <>
      <video
        aria-hidden
        autoPlay
        muted
        playsInline
        // AGRANDIE À 220 % ET CENTRÉE, et c'est le réglage qui fait tout.
        // À l'échelle 1, les deux crochets tombent au milieu du cadre et
        // BARRENT la phrase au lieu de l'encadrer — vérifié au rendu. Zoomer
        // les repousse vers les bords de la pastille, et dégage le centre pour
        // le texte, qui est exactement la composition du motif d'origine.
        //
        // Une source OBS ne reçoit aucun clic ; la vidéo ne doit de toute façon
        // jamais intercepter quoi que ce soit.
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[220%] w-[220%] -translate-x-1/2 -translate-y-1/2 object-cover motion-reduce:hidden"
        style={{ mixBlendMode: 'screen' }}
      >
        <source src="/overlay/tcg/pulse-horizontal.webm" type="video/webm" />
        <source src="/overlay/tcg/pulse-horizontal.mp4" type="video/mp4" />
      </video>

      {/* Voile sombre au centre, SOUS le texte et AU-DESSUS du FX (il est le
          second des deux `-z-10`, donc peint par-dessus). Au pic du flash, la
          lueur traverse la pastille de part en part ; sans ce voile, la phrase
          se lit sur un fond magenta vif pendant une demi-seconde. Il s'efface
          vers les bords pour ne pas éteindre les crochets eux-mêmes. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 motion-reduce:hidden"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 55%, transparent 100%)',
        }}
      />
    </>
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
  // La directive est collée à la balise, PAS avant le `return` : une
  // suppression Biome ne couvre que le nœud qui la suit immédiatement.
  return (
    // biome-ignore lint/performance/noImgElement: URL de bucket de stockage, hors remotePatterns (voir ci-dessus)
    <img
      aria-hidden
      alt=""
      src={url}
      className="h-10 w-10 shrink-0 rounded-lg object-cover"
    />
  );
}
