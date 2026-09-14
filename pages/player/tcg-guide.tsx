// pages/player/tcg-guide.tsx
//
// « Comment marche le TCG » — le guide, dans l'espace joueuse.
//
// POURQUOI DANS /player ET NON DANS /guide. La page-guide publique existante
// (`/guide/gerer-mon-equipe`) est une vitrine : elle s'adresse à quelqu'un qui
// n'a pas encore de compte. Celle-ci répond à des questions qu'on se pose une
// fois DEDANS — « d'où viennent mes paquets », « que devient ma photo » — et
// elle vit donc derrière la connexion, comme le reste de l'espace. `_app.tsx`
// force `noindex` sur toutes les routes /player.
//
// AUCUN MONTANT N'EST ÉCRIT ICI NI DANS LES TRADUCTIONS. Le barème arrive de
// `/api/player/tcg/packs`, qui le dérive d'`economy.ts` — même discipline que
// la page de collection, et pour la même raison : ce dépôt a déjà payé quatre
// fois le prix d'un barème recopié. Un guide qui annoncerait un prix périmé
// serait le pire endroit où se tromper, puisqu'il prétend énoncer la règle.
//
// LES CHIFFRES ABSENTS NE S'AFFICHENT PAS. Tant que l'appel n'a pas répondu —
// ou s'il échoue — les lignes chiffrées sont simplement omises plutôt que
// rendues « — pièces ». Même stance que le bouton d'achat de la page de
// collection, qui disparaît quand le prix est inconnu : mieux vaut taire un
// montant que d'en annoncer un faux.
//
// LE DROP TWITCH EST CONDITIONNEL. L'API ne rend `earn.twitchDrop` que si une
// chaîne est connectée ET qu'une récompense lui est désignée. Absent, le guide
// dit qu'il n'est pas actif au lieu de décrire une voie qui n'aboutirait pas —
// ce qui compte doublement pour les supportrices, dont c'est la seule voie.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { JSX, ReactNode } from 'react';

import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useT, format } from '@/lib/i18n/useT';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { logger } from '../../utils/logger';
import nsGuidePlayerTcg from '@/lib/i18n/locales/fr/guidePlayerTcg';

/** Le barème, tel que le rend `GET /api/player/tcg/packs`. */
type Bareme = {
  boosterPrice: number;
  recycleRefund: number;
  earn: {
    matchWin: number;
    scrimWin: number;
    /** Absent quand le drop n'est pas branché. Cf. l'en-tête. */
    twitchDrop?: number;
    /** Absent tant que l'API ne le rend pas — le guide s'en passe alors. */
    welcomeGift?: number;
  };
};

function Section({
  index,
  title,
  children,
  t,
}: {
  index: number;
  title: string;
  children: ReactNode;
  t: typeof nsGuidePlayerTcg.fr;
}): JSX.Element {
  return (
    <section className="mb-10">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.16em] text-purple-300/80">
        {format(t.sectionLabel, { number: index })}
      </p>
      <h2 className="mb-3 text-xl font-bold text-white">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-gray-300">
        {children}
      </div>
    </section>
  );
}

/** Une voie de gain : libellé à gauche, montant à droite. */
function EarnRow({
  label,
  coins,
  t,
}: {
  label: string;
  coins: number;
  t: typeof nsGuidePlayerTcg.fr;
}): JSX.Element {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
      <span className="text-gray-200">{label}</span>
      <span className="text-sm font-semibold text-purple-200">
        {format(t.earnCoins, { coins })}{' '}
        <span className="font-normal text-gray-400">{t.earnPackToo}</span>
      </span>
    </li>
  );
}

function TcgGuide(): JSX.Element {
  const t = useT(nsGuidePlayerTcg);
  usePlayerSession({ redirectTo: '/login?next=/player/tcg-guide' });
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });

  const [bareme, setBareme] = useState<Bareme | null>(null);

  const load = useCallback(async () => {
    try {
      // La route de collection rend déjà prix, barème et reprise : demander un
      // endpoint de plus pour trois nombres ferait bouger le contrat OpenAPI
      // sans rien apporter.
      setBareme(
        await adminFetchJson<Bareme>('/api/player/tcg/packs', {
          skipAuthRedirect: true,
        })
      );
    } catch (err) {
      // Un guide sans chiffres reste un guide. On journalise et on rend le
      // texte : l'inverse — une page vide — perdrait aussi les explications.
      logger.error('[tcg-guide] barème illisible', err);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    void load();
  }, [load]);

  const earn = bareme?.earn;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="mx-auto max-w-3xl px-4 pt-24 pb-20">
        <div className="mb-10">
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-gray-300">
            {t.heroBadge}
          </span>
          <h1 className="mt-4 text-3xl font-bold text-white">{t.heroTitle}</h1>
          <p className="mt-3 max-w-prose text-sm leading-relaxed text-gray-300">
            {t.heroSubtitle}
          </p>
          <Link
            href="/player/tcg"
            className="mt-5 inline-flex items-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
          >
            {t.backToCollection}
          </Link>
        </div>

        <Section index={1} title={t.whatTitle} t={t}>
          <p>{t.whatIntro}</p>
          <p>{t.whatPack}</p>
          <p>{t.whatNoNewData}</p>
        </Section>

        <Section index={2} title={t.earnTitle} t={t}>
          <p>{t.earnIntro}</p>
          {earn && (
            <ul className="space-y-2">
              <EarnRow label={t.earnMatchWin} coins={earn.matchWin} t={t} />
              <EarnRow label={t.earnScrimWin} coins={earn.scrimWin} t={t} />
              {typeof earn.welcomeGift === 'number' && (
                <EarnRow
                  label={t.earnWelcome}
                  coins={earn.welcomeGift}
                  t={t}
                />
              )}
              {typeof earn.twitchDrop === 'number' && (
                <EarnRow
                  label={t.earnTwitchDrop}
                  coins={earn.twitchDrop}
                  t={t}
                />
              )}
            </ul>
          )}
          {/* Dire que la voie est éteinte vaut mieux que la passer sous
              silence : c'est la seule ouverte à qui ne joue pas. */}
          <p>
            {earn && typeof earn.twitchDrop !== 'number'
              ? t.earnTwitchOff
              : t.earnTwitchHow}
          </p>
        </Section>

        <Section index={3} title={t.moneyTitle} t={t}>
          <p>{t.moneyBody}</p>
          <p>{t.moneyDonation}</p>
        </Section>

        <Section index={4} title={t.loopTitle} t={t}>
          <p>{t.loopOpen}</p>
          {typeof bareme?.boosterPrice === 'number' && (
            <p>{format(t.loopBuy, { price: bareme.boosterPrice })}</p>
          )}
          {typeof bareme?.recycleRefund === 'number' && (
            <p>{format(t.loopRecycle, { refund: bareme.recycleRefund })}</p>
          )}
          <p>{t.loopRecycleWhich}</p>
        </Section>

        <Section index={5} title={t.rarityTitle} t={t}>
          <p>{t.rarityBody}</p>
          <ul className="space-y-1.5 pl-4">
            <li className="list-disc">{t.rarityCommon}</li>
            <li className="list-disc">{t.rarityRare}</li>
            <li className="list-disc">{t.rarityEpic}</li>
            <li className="list-disc">{t.rarityLegendary}</li>
          </ul>
          <p>{t.rarityFoil}</p>
        </Section>

        <Section index={6} title={t.photoTitle} t={t}>
          <p>{t.photoIntro}</p>
          <div className="space-y-3">
            {[
              { title: t.photoOptIn, body: t.photoOptInBody },
              { title: t.photoModeration, body: t.photoModerationBody },
              { title: t.photoWithdraw, body: t.photoWithdrawBody },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
              >
                <p className="mb-1 font-semibold text-white">{item.title}</p>
                <p className="text-gray-300">{item.body}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section index={7} title={t.supporterTitle} t={t}>
          <p>{t.supporterBody}</p>
          <Link
            href="/player/tcg"
            className="inline-flex items-center text-sm font-medium text-purple-300 transition hover:text-purple-200"
          >
            {t.supporterLink}
          </Link>
        </Section>

        <section className="rounded-2xl border border-[var(--color-violet)]/40 bg-gradient-to-br from-[var(--color-violet)]/20 via-[var(--color-violet)]/10 to-transparent p-6">
          <h2 className="text-lg font-semibold text-white">{t.ctaTitle}</h2>
          <p className="mt-1 text-sm text-gray-300">{t.ctaBody}</p>
          <Link
            href="/player/tcg"
            className="mt-4 inline-flex items-center rounded-xl bg-[var(--color-violet)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            {t.ctaButton}
          </Link>
        </section>
      </main>
    </div>
  );
}

// `noindex` est de toute façon forcé pour toutes les routes /player par
// `_app.tsx` ; le titre passe par le mécanisme `seo`.
const guideSeo: SeoProps = {
  title: {
    fr: 'Comment marche le TCG',
    en: 'How the TCG works',
  },
  description: {
    fr: 'Guide du TCG OW Women’s Cup : comment obtenir des paquets, la monnaie, le recyclage, la rareté et ce que tu contrôles sur ta photo.',
    en: 'OW Women’s Cup TCG guide: how to get packs, the currency, recycling, rarity and what you control on your photo.',
  },
  noindex: true,
};

TcgGuide.seo = guideSeo;

export default TcgGuide;
