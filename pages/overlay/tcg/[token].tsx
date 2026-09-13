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
// - Sans habillage : `pages/_app.tsx` rend `/overlay/*` nu (ni navigation, ni
//   pied de page, ni bandeau cookies, ni toasts).
// - FOND TRANSPARENT. C'est ce qui distingue une page d'un overlay : OBS
//   compose la page au-dessus de la scène, tout aplat opaque masquerait le jeu.
//
// CONÇUE POUR ÊTRE AJOUTÉE AVANT LE DIRECT. Une source ouverte une heure trop
// tôt ne doit rien montrer et ne rien casser : l'écran reste vide tant qu'il
// n'y a rien à annoncer, et n'affiche un message que si le jeton est refusé —
// le seul cas où la régie doit intervenir.

import Head from 'next/head';
import { useRouter } from 'next/router';

import { useT, format } from '@/lib/i18n/useT';
import {
  useTcgOverlayFeed,
  type TcgOverlayItem,
} from '@/hooks/useTcgOverlayFeed';
import nsOverlayTcg from '@/lib/i18n/locales/fr/overlayTcg';

/** Jeton base64url ; même forme que celle admise par la route. */
const TOKEN_RE = /^[A-Za-z0-9_-]{20,120}$/;

/**
 * `typeof nsOverlayTcg.fr` et non `ReturnType<typeof useT<…>>` : `useT` prend le
 * MODULE de namespace et rend son dictionnaire. L'annotation par `ReturnType`
 * résolvait vers le module lui-même — le typecheck ne trouvait alors aucune des
 * clés de traduction.
 */
type OverlayDict = typeof nsOverlayTcg.fr;

function Announcement({ item, t }: { item: TcgOverlayItem; t: OverlayDict }) {
  const isDrop = item.kind === 'twitch_drop';
  // Sans pseudo Twitch, un libellé neutre : cf. l'en-tête du namespace.
  const name = item.twitchLogin ?? t.anonymous;

  return (
    <li
      className="flex items-center gap-3 rounded-2xl border border-white/15 bg-black/70 px-5 py-3 shadow-2xl backdrop-blur-sm"
      style={{ animation: 'tcgOverlayIn 320ms ease-out' }}
    >
      <span
        aria-hidden
        className={`text-2xl ${isDrop ? 'text-[var(--color-yellow)]' : 'text-[var(--color-green)]'}`}
      >
        {isDrop ? '★' : '✦'}
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">
          {isDrop ? t.dropEyebrow : t.winEyebrow}
        </span>
        <span className="block truncate text-base font-semibold text-white">
          {format(isDrop ? t.dropLine : t.winLine, { name })}
        </span>
      </span>
    </li>
  );
}

export default function TcgOverlayPage() {
  const router = useRouter();
  const t = useT(nsOverlayTcg);

  const raw = router.query.token;
  const token = typeof raw === 'string' ? raw : '';
  const valid = TOKEN_RE.test(token);

  const { visible, rejected } = useTcgOverlayFeed({
    token: valid ? token : null,
    enabled: valid,
  });

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

      <main className="min-h-screen p-6">
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
              <Announcement key={item.id} item={item} t={t} />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
