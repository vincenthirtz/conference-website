// components/player/SupporterWelcomeCard.tsx
//
// « Ton cadeau de bienvenue t'attend » — la carte de réclamation d'une
// supportrice.
//
// POURQUOI UNE CARTE SÉPARÉE DE `WelcomeGiftCard`. Celle-là ANNONCE un cadeau
// déjà reçu et son en-tête le dit : « pas de mutation, donc pas de readOnly ».
// Celle-ci en RÉCLAME un — un bouton, un état d'envoi, un échec possible.
// Fondre les deux aurait fait porter à un composant informatif la
// responsabilité d'une écriture, et rendu son contrat faux en inspection admin.
//
// ELLE DISPARAÎT QUAND IL N'Y A RIEN À PROPOSER, comme le reste de cet écran.
// `supporterClaimable` vient de la route, qui l'évalue avec
// `grantSupporterWelcome({ dryRun: true })` — donc avec EXACTEMENT les
// conditions du POST. Proposer un bouton que le serveur refuserait ensuite
// serait pire que ne rien proposer.
//
// ELLE NE SUIT PAS LE SUJET POUR L'ÉCRITURE, et c'est voulu. La lecture passe
// par `withSubject` comme les autres cartes ; le POST, lui, part sans `?as=` :
// la route n'active pas `allowActAs`, donc un staff qui inspecte ne peut pas
// réclamer à la place de quelqu'un. Un cadeau réclamé ne se rend pas.
//
// L'ÉCHEC PARTIEL EST DIT. Si les pièces passent mais pas le paquet, le serveur
// rend `packGranted: false` et la carte l'affiche au lieu d'un succès vert :
// c'est exactement l'écart qu'un écran a masqué le 2026-09-14, laissant 58
// comptes crédités sans paquet.

import { useCallback, useEffect, useState } from 'react';

import { useAdminFetch } from '@/hooks/useAdminFetch';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import { useT, format } from '@/lib/i18n/useT';
import type {
  PlayerWelcomeGiftResponse,
  PlayerWelcomeClaimResponse,
} from '../../pages/api/player/tcg/welcome-gift';
import { logger } from '../../utils/logger';
import nsPlayerIndex from '@/lib/i18n/locales/fr/playerIndex';

export default function SupporterWelcomeCard() {
  const t = useT(nsPlayerIndex);
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { withSubject, readOnly } = usePlayerArea();

  // `undefined` = pas encore lu. Aucun indicateur de chargement : la carte
  // n'apparaîtra pas la plupart du temps, et un squelette ferait clignoter le
  // tableau de bord à chaque visite.
  const [claimable, setClaimable] = useState<boolean | undefined>(undefined);
  const [coins, setCoins] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const payload = await adminFetchJson<PlayerWelcomeGiftResponse>(
        withSubject('/api/player/tcg/welcome-gift'),
        { skipAuthRedirect: true }
      );
      setClaimable(payload.supporterClaimable);
    } catch (err) {
      logger.error('[SupporterWelcomeCard] load error', err);
      // `false` et non `undefined` : la carte se retire au lieu de rester en
      // attente indéfinie.
      setClaimable(false);
    }
  }, [adminFetchJson, withSubject]);

  useEffect(() => {
    void load();
  }, [load]);

  const claim = async () => {
    setBusy(true);
    setNotice(null);
    try {
      // Sans `withSubject` : l'écriture est toujours pour soi. Cf. l'en-tête.
      const out = await adminFetchJson<PlayerWelcomeClaimResponse>(
        '/api/player/tcg/welcome-gift',
        { method: 'POST', skipAuthRedirect: true }
      );
      if (out.status === 'granted' && !out.packGranted) {
        // Les pièces sont écrites et ne seront pas rejouées : on le DIT.
        setNotice(t.supporterWelcomePartial);
        setClaimable(false);
        return;
      }
      // Reçu, ou déjà reçu, ou plus éligible : dans tous les cas il n'y a plus
      // rien à réclamer. `WelcomeGiftCard` prendra le relais au prochain
      // chargement pour annoncer le cadeau.
      setCoins(out.status === 'granted' ? out.coins : null);
      setClaimable(false);
    } catch (err) {
      logger.error('[SupporterWelcomeCard] claim error', err);
      setNotice(t.supporterWelcomeError);
    } finally {
      setBusy(false);
    }
  };

  // Un message d'échec partiel survit à la disparition du bouton : c'est la
  // seule chose que la personne doit encore lire.
  if (!claimable) {
    if (!notice) return null;
    return (
      <p
        role="status"
        className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
      >
        {notice}
      </p>
    );
  }

  return (
    <section
      aria-labelledby="supporter-welcome-heading"
      className="mb-4 overflow-hidden rounded-2xl border border-[var(--color-violet)]/40 bg-gradient-to-br from-[var(--color-violet)]/20 via-[var(--color-violet)]/10 to-transparent p-5"
    >
      <div className="flex flex-wrap items-center gap-4">
        <span
          aria-hidden
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--color-violet)]/25 text-2xl"
        >
          🎁
        </span>

        <div className="min-w-0 flex-1">
          <h2
            id="supporter-welcome-heading"
            className="text-lg font-semibold text-white"
          >
            {t.supporterWelcomeTitle}
          </h2>
          <p className="mt-1 text-sm text-gray-300">
            {format(t.supporterWelcomeBody, { coins: coins ?? '' })}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void claim()}
          // En inspection admin, le bouton est inerte : la route refuserait de
          // toute façon, autant ne pas le laisser croire le contraire.
          disabled={busy || readOnly}
          className="rounded-xl bg-[var(--color-violet-cta)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? t.supporterWelcomeClaiming : t.supporterWelcomeCta}
        </button>
      </div>
    </section>
  );
}
