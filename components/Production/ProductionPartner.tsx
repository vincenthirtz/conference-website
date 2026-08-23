// components/Production/ProductionPartner.tsx
//
// Encart « qui produit la diffusion » — POGTV, le studio qui assure la régie
// des matchs de l'édition 2026.
//
// Deux variantes pour un seul contenu, parce que la même information n'a pas
// le même poids selon la page :
//   - `full`    : bloc éditorial (page association, page partenaires) ;
//   - `compact` : bandeau d'attribution (pages tournoi / live), où l'encart ne
//                 doit pas voler la vedette au calendrier ou aux chaînes.
//
// Les coordonnées (logo, Twitch, Instagram) vivent dans `./pogtv` : la bande
// « soutiens » de l'accueil les réutilise.

import Image from 'next/image';
import { InstagramIcon, TwitchIcon } from '@/components/Icons';
import { useT, format } from '@/lib/i18n/useT';
import nsProductionPartner from '@/lib/i18n/locales/fr/productionPartner';
import {
  POGTV_INSTAGRAM,
  POGTV_LOGO,
  POGTV_NAME,
  POGTV_TWITCH,
} from './pogtv';

type Props = {
  variant?: 'full' | 'compact';
  className?: string;
};

function ProductionPartner({ variant = 'full', className = '' }: Props) {
  const t = useT(nsProductionPartner);

  const links = (
    <>
      <a
        href={POGTV_TWITCH}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={format(t.linkAria, { network: 'Twitch' })}
        className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-[var(--color-violet-light)]/60 hover:bg-[var(--color-violet)]/15 hover:text-[var(--color-violet-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
      >
        <TwitchIcon className="h-4 w-4" />
        {t.twitchCta}
      </a>
      <a
        href={POGTV_INSTAGRAM}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={format(t.linkAria, { network: 'Instagram' })}
        className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-pink-400/60 hover:bg-pink-500/15 hover:text-pink-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400"
      >
        <InstagramIcon className="h-4 w-4" />
        {t.instagramCta}
      </a>
    </>
  );

  if (variant === 'compact') {
    return (
      <div
        className={`flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 ${className}`}
      >
        <Image
          src={POGTV_LOGO}
          alt={t.logoAlt}
          width={56}
          height={56}
          className="h-14 w-14 flex-shrink-0 rounded-xl object-cover ring-1 ring-white/10"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400">
            {t.compactLabel}
          </p>
          <p className="mt-0.5 text-lg font-bold text-white">{POGTV_NAME}</p>
          <p className="text-sm text-gray-400">{t.role}</p>
        </div>
        <div className="flex flex-wrap gap-2">{links}</div>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-white/10 ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--color-violet)]/20 via-pink-600/10 to-cyan-600/10"
        aria-hidden
      />
      <div className="relative flex flex-col gap-6 p-8 sm:p-10 md:flex-row md:items-center">
        <Image
          src={POGTV_LOGO}
          alt={t.logoAlt}
          width={128}
          height={128}
          className="h-28 w-28 flex-shrink-0 self-start rounded-2xl object-cover ring-1 ring-white/15 md:self-center"
        />
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-violet-light)]">
            {t.eyebrow}
          </p>
          <h3 className="mt-2 text-2xl font-bold text-brand-gradient sm:text-3xl">
            {t.title}
          </h3>
          <span className="brand-rule mt-3 block" aria-hidden />
          <p className="mt-4 text-sm leading-relaxed text-gray-300">{t.body}</p>
          <div className="mt-6 flex flex-wrap gap-3">{links}</div>
        </div>
      </div>
    </div>
  );
}

export default ProductionPartner;
