// components/player/TwitchLinkCard.tsx
//
// Carte « Mon compte Twitch » : rattacher son compte pour recevoir les cartes
// distribuées pendant un direct.
//
// POURQUOI CE LIEN EXISTE. Un événement Twitch livre un identifiant Twitch,
// jamais un compte du site. Sans ce pont, un drop réclamé en direct n'a pas de
// destinataire. Et il doit être PROUVÉ par OAuth : le pseudo Twitch saisi dans
// un profil est auto-déclaré, s'en servir laisserait n'importe qui encaisser
// les drops d'une autre.
//
// CE QUI EST DEMANDÉ EST DIT AVANT LE BOUTON. Le flux ne réclame AUCUN scope —
// seulement l'identité — et l'écran l'énonce, parce qu'« autoriser une
// application Twitch » évoque à juste titre des permissions étendues. Il dit
// aussi que c'est facultatif : sans lien, on gagne des cartes en jouant.
//
// MÊME PATRON QUE `BattlenetVerifyCard` : la carte porte son état, lit son
// statut, traite le retour OAuth par `?twitch=…` et nettoie le paramètre. Elle
// ne rend RIEN si la fonctionnalité est dormante, plutôt que d'offrir un bouton
// qui finirait en 503.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';

import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import { logger } from '../../utils/logger';
import nsPlayerTwitchLink from '@/lib/i18n/locales/fr/playerTwitchLink';

export type TwitchLinkStatus = {
  configured: boolean;
  linked: boolean;
  twitchLogin: string | null;
  linkedAt: string | null;
};

type Props = {
  /** Où renvoyer sur 401. `/login` côté joueuse. */
  loginPath?: string;
  /**
   * L'argument, quand la page hôte en a un — « ce qu'on gagne », en une phrase.
   *
   * POURQUOI. Au 2026-09-14, aucune des 58 participantes n'avait rattaché son
   * compte. La carte expliquait POURQUOI le lien est demandé (identifier la
   * destinataire d'un drop) et ce qu'il ne lit pas, mais jamais ce qu'il
   * rapporte : un bouton « Rattacher mon compte Twitch » sans bénéfice visible
   * se lit comme une formalité. Le montant n'est connu que de la page TCG (il
   * vient de l'API, et seulement si le drop est réellement branché), d'où une
   * prop plutôt qu'un texte ici.
   *
   * Absente : la carte reste celle du profil, inchangée. Le flux OAuth, lui,
   * est le même dans les deux cas.
   */
  pitch?: { title: string; body: string };
  /** Prévenir la page hôte de l'état lu, pour qu'elle adapte ses propres renvois. */
  onStatus?: (status: TwitchLinkStatus | null) => void;
  /** Ancre, pour qu'un lien de la page puisse y mener. */
  id?: string;
};

export default function TwitchLinkCard({
  loginPath = '/login',
  pitch,
  onStatus,
  id,
}: Props) {
  const router = useRouter();
  const t = useT(nsPlayerTwitchLink);
  const locale = useLocale();
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch({ loginPath });

  const [status, setStatus] = useState<TwitchLinkStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(
        await adminFetchJson<TwitchLinkStatus>('/api/player/twitch-status', {
          skipAuthRedirect: true,
        })
      );
    } catch (err) {
      logger.error('[player/twitch-link] load error:', err);
      // Lecture impossible : on n'affiche pas la carte plutôt qu'un état faux
      // (« aucun compte lié » alors qu'il y en a peut-être un).
      setStatus(null);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    void load();
  }, [load]);

  // Remonté après chaque lecture, `null` compris : une page qui affiche « Rattacher
  // Twitch » doit cesser de le faire si l'état devient illisible.
  useEffect(() => {
    onStatus?.(status);
  }, [status, onStatus]);

  // Retour du flux OAuth : un toast, puis on nettoie le paramètre pour qu'un
  // rafraîchissement ne le rejoue pas.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dépendances choisies à dessein (exclusion reprise d’ESLint)
  useEffect(() => {
    const raw = router.query.twitch;
    const value = typeof raw === 'string' ? raw : null;
    if (!value) return;

    if (value === 'linked') addToast(t.toastLinked, 'success');
    else if (value === 'already_linked')
      addToast(t.toastAlreadyLinked, 'error');
    else addToast(t.toastError, 'error');

    const { twitch: _drop, ...rest } = router.query;
    void router.replace({ pathname: router.pathname, query: rest }, undefined, {
      shallow: true,
    });
    void load();
    // `router.query` suffit : on ne veut réagir qu'à l'arrivée du paramètre.
  }, [router.query.twitch]);

  const onUnlink = async () => {
    setBusy(true);
    try {
      setStatus(
        await adminFetchJson<TwitchLinkStatus>('/api/player/twitch-status', {
          method: 'DELETE',
        })
      );
      addToast(t.toastUnlinked, 'success');
    } catch (err) {
      logger.error('[player/twitch-link] unlink error:', err);
      addToast((err as Error)?.message || t.toastError, 'error');
    } finally {
      setBusy(false);
    }
  };

  // Fonctionnalité dormante ou état illisible : on ne rend rien.
  if (!status || !status.configured) return null;

  const startHref = `/api/auth/twitch/start?returnTo=${encodeURIComponent(
    router.pathname
  )}`;

  // Variante « argumentaire » : seulement tant que rien n'est lié. Une fois le
  // compte rattaché, répéter ce qu'on gagne n'apprend plus rien ; c'est la
  // confirmation qui rassure.
  if (pitch && !status.linked) {
    return (
      <section
        id={id}
        aria-labelledby={id ? `${id}-title` : undefined}
        className="scroll-mt-24 rounded-2xl border border-purple-400/40 bg-purple-500/[0.08] p-5 sm:p-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2
              id={id ? `${id}-title` : undefined}
              className="text-lg font-semibold text-white"
            >
              {pitch.title}
            </h2>
            <p className="mt-1 max-w-prose text-sm text-gray-200">
              {pitch.body}
            </p>
          </div>
          <a
            href={startHref}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
          >
            {t.linkCta}
          </a>
        </div>
        {/* Ce qui est demandé reste dit AVANT le clic, même en version courte :
            l'argument ne remplace pas l'information. */}
        <p className="mt-3 max-w-prose text-xs text-gray-400">{t.scopeNote}</p>
      </section>
    );
  }

  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6"
    >
      <h2 className="text-lg font-semibold">{t.title}</h2>
      <p className="mt-1 max-w-prose text-sm text-gray-400">{t.intro}</p>
      {/* Ce qui est demandé, dit avant le bouton. */}
      <p className="mt-2 max-w-prose text-xs text-gray-500">{t.scopeNote}</p>
      <p className="mt-1 max-w-prose text-xs text-gray-500">{t.optionalNote}</p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {status.linked ? (
          <>
            <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200">
              {status.twitchLogin
                ? format(t.linkedAs, { login: status.twitchLogin })
                : t.linkedLabel}
            </span>
            {status.linkedAt && (
              <span className="text-xs text-gray-500">
                {format(t.linkedSince, {
                  date: new Date(status.linkedAt).toLocaleDateString(locale),
                })}
              </span>
            )}
            <span className="flex-1" />
            <a
              href={startHref}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm text-gray-300 transition hover:border-white/40 hover:text-white"
            >
              {t.relinkCta}
            </a>
            <button
              type="button"
              onClick={onUnlink}
              disabled={busy}
              className="rounded-xl px-4 py-2 text-sm text-gray-400 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? t.unlinking : t.unlinkCta}
            </button>
          </>
        ) : (
          <>
            <span className="text-sm text-gray-400">{t.notLinked}</span>
            <span className="flex-1" />
            <a
              href={startHref}
              className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium transition hover:bg-purple-500"
            >
              {t.linkCta}
            </a>
          </>
        )}
      </div>
    </section>
  );
}
