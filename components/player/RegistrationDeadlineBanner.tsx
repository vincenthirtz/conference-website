// components/player/RegistrationDeadlineBanner.tsx
//
// Rappel de la date butoir des inscriptions au tournoi 2026, en tête du
// dashboard joueur.
//
// Le problème qu'il traite : la validation d'un roster suppose que chaque
// personne existe des DEUX côtés — sur le serveur Discord ET sur le site, les
// deux comptes liés. Une personne inscrite ici mais absente du Discord (ou
// l'inverse) n'est pas validable, et ne l'apprend aujourd'hui qu'en le
// demandant. Le rappel le dit avant la date butoir, à tout le monde :
// joueuses, capitaines, coachs et managers — le dashboard est la seule page
// que ces quatre rôles ont en commun.
//
// Il ne réimplémente rien : l'état « Discord lié » vient de
// /api/player/network-status (celui de NetworkOnboardingCard), et l'action de
// liaison reste DiscordLinkCard, plus bas sur la même page (ancre
// #discord-link).
//
// Trois choix à ne pas défaire :
//   1. Il DISPARAÎT après la date butoir — un rappel périmé décrédibilise les
//      suivants (getRegistrationDeadlineState → isPast).
//   2. Il n'est refermable QUE lorsqu'il n'y a plus rien à faire. Tant que le
//      Discord n'est pas lié, la personne risque de ne pas être validée :
//      offrir « masquer » reviendrait à offrir de rater le tournoi.
//   3. Le jour est calculé côté CLIENT, dans un effet. Rendu au serveur, le
//      compte à rebours divergerait de l'hydratation dès qu'une requête
//      traverse minuit.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import {
  getRegistrationDeadlineState,
  formatRegistrationDeadline,
  TOURNAMENT_2026_REGISTRATION_DEADLINE,
  type RegistrationDeadlineState,
} from '@/utils/registrationDeadline';
import type { NetworkStatus } from '../../pages/api/player/network-status';
import { logger } from '../../utils/logger';
import nsRegistrationDeadline from '@/lib/i18n/locales/fr/registrationDeadline';

/** Invitation publique du serveur — la même que le header et /inscription-2026. */
const DISCORD_INVITE = 'https://discord.gg/gERSsjC3Vd';

/**
 * Clé de rejet par utilisateur ET par échéance : refermer le rappel de 2026 ne
 * doit pas refermer d'avance celui de la saison suivante.
 */
function dismissKey(userId: string): string {
  return `registration-deadline-dismissed:${TOURNAMENT_2026_REGISTRATION_DEADLINE}:${userId}`;
}

export default function RegistrationDeadlineBanner({
  userId,
}: {
  userId: string;
}) {
  const t = useT(nsRegistrationDeadline);
  const locale = useLocale();
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });

  const [deadline, setDeadline] = useState<RegistrationDeadlineState | null>(
    null
  );
  const [discordLinked, setDiscordLinked] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Compte à rebours : client uniquement (cf. en-tête, choix 3).
  useEffect(() => {
    setDeadline(getRegistrationDeadlineState());
  }, []);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(dismissKey(userId)) === '1');
    } catch {
      // Navigation privée : le rappel réapparaîtra. Acceptable pour 11 jours.
    }
  }, [userId]);

  const load = useCallback(async () => {
    try {
      const data = await adminFetchJson<NetworkStatus>(
        '/api/player/network-status',
        { skipAuthRedirect: true }
      );
      setDiscordLinked(Boolean(data?.discordLinked));
    } catch (err) {
      logger.error('[RegistrationDeadlineBanner] load error', err);
      // On ne sait pas : on affiche quand même le rappel, sans la coche
      // Discord. Masquer sur une erreur réseau serait le pire des deux.
      setDiscordLinked(null);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!deadline || deadline.isPast) return null;
  // Refermable seulement quand il ne reste rien à faire (choix 2).
  if (dismissed && discordLinked) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(dismissKey(userId), '1');
    } catch {
      /* voir plus haut */
    }
  };

  const alarming = deadline.isUrgent || discordLinked === false;
  const tone = alarming
    ? 'border-red-500/40 bg-red-500/10'
    : 'border-amber-500/40 bg-amber-500/10';
  const chipTone = alarming
    ? 'bg-red-500/20 text-red-100 border-red-400/40'
    : 'bg-amber-500/20 text-amber-100 border-amber-400/40';

  const countdown = deadline.isLastDay
    ? t.lastDay
    : format(deadline.daysLeft === 1 ? t.countdown_one : t.countdown_other, {
        count: deadline.daysLeft,
      });

  return (
    <div
      className={`mb-6 rounded-2xl border ${tone} p-5 backdrop-blur-xl`}
      role="status"
    >
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold text-white">{t.title}</h2>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${chipTone}`}
        >
          {countdown}
        </span>
        {discordLinked && (
          <button
            type="button"
            onClick={dismiss}
            className="ml-auto text-xs text-gray-400 underline underline-offset-2 hover:text-gray-200"
          >
            {t.dismiss}
          </button>
        )}
      </div>

      <p className="text-sm text-gray-300">
        {format(t.deadline, {
          date: formatRegistrationDeadline(locale),
        })}
      </p>
      <p className="mt-2 text-sm text-gray-300">{t.body}</p>

      <ul className="mt-4 space-y-2 text-sm">
        <li className="flex items-start gap-2">
          <Check done />
          <span>
            <span className="font-medium text-white">{t.stepSite}</span>
            <span className="text-gray-400"> — {t.stepSiteDone}</span>
          </span>
        </li>
        <li className="flex items-start gap-2">
          <Check done={discordLinked === true} />
          <span>
            <span className="font-medium text-white">{t.stepDiscord}</span>
            <span className="text-gray-400">
              {' — '}
              {discordLinked === true ? t.stepDiscordDone : t.stepDiscordTodo}
            </span>
          </span>
        </li>
      </ul>

      <p className="mt-3 text-xs text-gray-400">{t.joinReminder}</p>

      <div className="mt-4 flex flex-wrap gap-3">
        {discordLinked !== true && (
          <Link
            href="/player#discord-link"
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            {t.ctaLink}
          </Link>
        )}
        <a
          href={DISCORD_INVITE}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-gray-200 hover:bg-white/10"
        >
          {t.ctaJoin}
        </a>
      </div>
    </div>
  );
}

/** Pastille d'état d'une étape. `done` inconnu (null) se lit comme « à faire ». */
function Check({ done }: { done?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border text-[10px] ${
        done
          ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
          : 'border-white/25 bg-white/5 text-transparent'
      }`}
    >
      ✓
    </span>
  );
}
