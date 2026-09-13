// pages/overlay/tcg/[token].tsx
//
// SOURCE NAVIGATEUR OBS / Streamlabs pour le TCG : annonce en surimpression les
// cartes gagnées pendant un direct.
//
// URL : /overlay/tcg/<jeton>  — à coller dans une source « Navigateur ».
//
// - Aucune authentification, par nécessité : une source navigateur ne se
//   connecte pas. L'accès est porté par un jeton opaque RÉVOCABLE, et ce que la
//   page affiche est réduit au déjà-public — un pseudo Twitch (visible de tout
//   le chat) et une origine d'événement. Jamais le nom d'un compte du site,
//   jamais une photo. La règle est tenue côté serveur par
//   `utils/tcg/overlayFeed.ts` : cette page ne peut afficher que ce qu'il rend.
// - Sans habillage de site : `pages/_app.tsx` rend `/overlay/*` nu (ni
//   navigation, ni pied de page, ni bandeau cookies, ni toasts).
// - FOND TRANSPARENT. C'est ce qui distingue une page d'un overlay : OBS
//   compose la page au-dessus de la scène, tout aplat opaque masquerait le jeu.
//
// LA PASTILLE N'EST PAS DESSINÉE ICI. Elle vit dans
// `components/overlay/TcgAnnouncement.tsx`, partagée avec l'aperçu de l'éditeur
// d'habillage côté admin. C'est ce partage qui garantit que l'aperçu montre le
// rendu réel et non une imitation qui divergerait au premier réglage ajouté.
//
// L'HABILLAGE ARRIVE PAR LA MÊME ROUTE que les annonces, et peut donc changer
// PENDANT le direct : régler une couleur côté admin se voit au sondage suivant,
// sans avoir à recharger la source dans OBS — geste qu'on évite en plein live.
//
// CONÇUE POUR ÊTRE AJOUTÉE AVANT LE DIRECT. Une source ouverte une heure trop
// tôt ne doit rien montrer et ne rien casser : l'écran reste vide tant qu'il
// n'y a rien à annoncer, et n'affiche un message que si le jeton est refusé —
// le seul cas où la régie doit intervenir.

import Head from 'next/head';
import { useRouter } from 'next/router';

import { useT } from '@/lib/i18n/useT';
import { useTcgOverlayFeed } from '@/hooks/useTcgOverlayFeed';
import TcgAnnouncement from '@/components/overlay/TcgAnnouncement';
import type { OverlayPosition } from '@/utils/tcg/overlayThemeShape';
import nsOverlayTcg from '@/lib/i18n/locales/fr/overlayTcg';

/** Jeton base64url ; même forme que celle admise par la route. */
const TOKEN_RE = /^[A-Za-z0-9_-]{20,120}$/;

/**
 * Où la pile d'annonces se pose dans la scène.
 *
 * `items-*` aligne aussi les pastilles entre elles : ancrées à droite, elles
 * doivent border le bord droit, sinon des phrases de longueurs différentes
 * produisent un bord gauche en dents de scie.
 */
const ANCHOR: Record<OverlayPosition, string> = {
  'top-left': 'justify-start items-start',
  'top-right': 'justify-start items-end',
  'bottom-left': 'justify-end items-start',
  'bottom-right': 'justify-end items-end',
};

export default function TcgOverlayPage() {
  const router = useRouter();
  const t = useT(nsOverlayTcg);

  const raw = router.query.token;
  const token = typeof raw === 'string' ? raw : '';
  const valid = TOKEN_RE.test(token);

  const { visible, rejected, theme } = useTcgOverlayFeed({
    token: valid ? token : null,
    enabled: valid,
  });

  const labels = {
    dropEyebrow: t.dropEyebrow,
    winEyebrow: t.winEyebrow,
    dropLine: t.dropLine,
    winLine: t.winLine,
    anonymous: t.anonymous,
  };

  return (
    <>
      <Head>
        <title>{t.docTitle}</title>
        <meta name="robots" content="noindex" />
      </Head>

      {/* Fond transparent : OBS compose au-dessus de la scène. */}
      <style jsx global>{`
        html,
        body {
          background: transparent !important;
        }
        @keyframes tcgOverlayIn {
          from {
            opacity: 0;
            transform: translateX(-12px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes tcgOverlayIn {
            from,
            to {
              opacity: 1;
              transform: none;
            }
          }
        }
      `}</style>

      <main
        className={`flex min-h-screen flex-col p-6 ${ANCHOR[theme.position]}`}
      >
        {!valid ? (
          // Erreur de configuration : elle se voit une fois, au montage.
          <p className="rounded-xl bg-black/70 px-4 py-2 text-sm text-red-200">
            {t.invalidToken}
          </p>
        ) : rejected ? (
          <p className="rounded-xl bg-black/70 px-4 py-2 text-sm text-red-200">
            {t.rejected}
          </p>
        ) : (
          // Rien à annoncer = rien à l'écran. Surtout pas d'indicateur de
          // chargement : il resterait affiché pendant tout le direct.
          <ul className="flex flex-col gap-2">
            {visible.map((item) => (
              <TcgAnnouncement
                key={item.id}
                item={item}
                theme={theme}
                labels={labels}
              />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
