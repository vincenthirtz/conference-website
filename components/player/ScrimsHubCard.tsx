// components/player/ScrimsHubCard.tsx
//
// Carte « Espace scrims » du dashboard joueur — toujours visible pour un
// capitaine ou manager ayant une équipe (contrairement aux blocs de détail qui
// s'auto-masquent quand ils sont vides). Elle sert d'en-tête permanent de la
// catégorie « Scrims » : elle expose la disponibilité aux scrims (toggle),
// des compteurs (négociations en attente / grilles ouvertes) et les 3 CTA
// principaux.
//
// L'état (open_for_scrim, compteurs) reste possédé par la page : la carte est
// contrôlée via `openForScrim` + `onToggle` (cohérent avec la façon dont la
// page possède pendingScrims, la fetch des grilles, etc.). Aucune requête
// réseau n'est déclenchée ici.
//
// Style aligné sur les autres cartes du dashboard : rounded-2xl, border
// translucide, backdrop-blur, accents bleus (couleur « scrim » du site).

import Link from 'next/link';
import type { JSX } from 'react';
import { useT, format } from '@/lib/i18n/useT';
import Switch from '@/components/ui/Switch';

type ScrimsHubTeam = {
  id: string;
  slug?: string | null;
  name: string;
};

export type ScrimsHubCardProps = {
  team: ScrimsHubTeam;
  isCaptain: boolean;
  isManager: boolean;
  /** Négociations de scrim en attente de MON action (pendingScrims.length). */
  pendingCount: number;
  /** Grilles de dispo ouvertes visibles (scrim plannings). */
  gridsCount: number;
  /** Disponibilité aux scrims courante (team.open_for_scrim). */
  openForScrim: boolean;
  /** Bascule la disponibilité — la page possède l'état + le feedback toast. */
  /** Absent ⇒ lecture seule : l'interrupteur est rendu mais inerte. */
  onToggle?: () => void;
  /** Vrai pendant la requête de bascule (désactive le switch). */
  toggling?: boolean;
  t: ReturnType<typeof useT<'playerIndex'>>;
};

export default function ScrimsHubCard({
  team,
  isCaptain,
  isManager,
  pendingCount,
  gridsCount,
  openForScrim,
  onToggle,
  toggling,
  t,
}: ScrimsHubCardProps): JSX.Element | null {
  if (!team || !(isCaptain || isManager)) return null;

  const hasActivity = pendingCount > 0 || gridsCount > 0;

  return (
    <div className="rounded-2xl border border-blue-400/20 bg-blue-500/[0.06] backdrop-blur-xl p-6">
      {/* En-tête : titre + toggle disponibilité */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-white">
            {t.scrimsHubTitle}
          </h3>
          <p className="mt-1 text-sm text-gray-400">{t.scrimsHubSubtitle}</p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <Switch
            checked={openForScrim}
            onChange={() => onToggle?.()}
            disabled={toggling || !onToggle}
            label={t.scrimsHubOpenLabel}
            size="md"
          />
          <span
            className={`text-[11px] font-medium ${
              openForScrim ? 'text-emerald-300' : 'text-gray-500'
            }`}
          >
            {t.scrimsHubOpenLabel}
          </span>
        </div>
      </div>

      {/* Compteurs : chips (masqués/atténués quand 0) */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {pendingCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/40 bg-blue-500/15 px-3 py-1 text-xs font-medium text-blue-100">
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-bold text-white">
              {pendingCount}
            </span>
            {format(
              pendingCount === 1
                ? t.scrimsHubPendingCount_one
                : t.scrimsHubPendingCount_other,
              { count: pendingCount }
            )}
          </span>
        )}
        {gridsCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-100">
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
              {gridsCount}
            </span>
            {format(
              gridsCount === 1
                ? t.scrimsHubGridsCount_one
                : t.scrimsHubGridsCount_other,
              { count: gridsCount }
            )}
          </span>
        )}
        {!hasActivity && (
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-gray-500">
            {t.scrimsHubNoActivity}
          </span>
        )}
      </div>

      {/* Nudge contextuel : fermé aux scrims, ou calme plat */}
      {!openForScrim ? (
        <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-gray-300">
          {t.scrimsHubClosedNudge}
        </p>
      ) : (
        !hasActivity && (
          <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-gray-300">
            {t.scrimsHubEmptyNudge}
          </p>
        )
      )}

      {/* CTA principaux */}
      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href="/player/requests?tab=scrim"
          className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-neutral-900 transition hover:-translate-y-0.5 motion-reduce:transform-none focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          {t.scrimsHubProposeCta}
          <span aria-hidden>→</span>
        </Link>
        {/* Il n'existe pas de page « liste des grilles » côté joueur : chaque
            grille est atteinte via un lien direct. La liste détaillée
            (ScrimPlanningsDashboardCard) est rendue juste en dessous dans la
            même catégorie, on y renvoie donc via une ancre in-page — et
            seulement quand il y a au moins une grille (sinon rien à voir). */}
        {gridsCount > 0 && (
          <a
            href="#scrim-plannings"
            className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            {t.scrimsHubPlanningsCta}
            <span aria-hidden>↓</span>
          </a>
        )}
        {/* R4 : l'annuaire CONNECTÉ remplace la page publique /scrim (ISR
            10 min, sans créneaux ni niveau) — c'est là que se lit qui est
            disponible, quand, et avec quels créneaux en commun. */}
        <Link
          href="/player/teams"
          className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          {t.scrimsHubBrowseCta}
          <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
