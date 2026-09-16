// components/admin/tournament/StreamSourcesPanel.tsx
//
// « Sources de stream (OBS) » — le panneau d'où une régie copie les URLs à
// coller dans OBS, sur l'onglet Outils du tournoi.
//
// Sans cet écran, la fonctionnalité n'existe pas : personne ne devine une URL
// d'overlay. C'est ici que la capacité de plan `matchOverlays` devient quelque
// chose qu'on utilise — et, pour un espace qui ne l'a pas, quelque chose qu'on
// comprend (l'encart nomme l'offre au lieu de cacher le panneau).
//
// TOUTES LES URLS PROPOSÉES VISENT `next` : elles suivent le match du moment,
// donc on les colle une fois pour la journée. C'est le vrai usage d'une régie
// amateur, où personne n'a le temps d'aller rechercher un identifiant entre
// deux rencontres. Figer une source sur un match précis reste possible (la
// note le dit), mais ce n'est pas le défaut.

import { useState } from 'react';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTournamentEmbed from '@/lib/i18n/locales/admin-fr/adminTournamentEmbed';

type Props = {
  /** Slug (ou id) du tournoi, tel qu'il ira dans l'URL. */
  tournamentRef: string;
  /** Base absolue du site, déjà résolue par la page. */
  baseUrl: string;
  /** Le palier de l'espace ouvre-t-il les sources par match ? */
  enabled: boolean;
  /** Palier en cours, nommé dans l'encart quand la capacité manque. */
  planLabel: string;
};

/** Les sources, dans l'ordre où une régie les ajoute à sa scène. */
const SOURCES = [
  { key: 'scoreboard', size: '1920×250' },
  { key: 'teams', size: '1920×1080' },
  { key: 'maps', size: '600×600' },
  { key: 'countdown', size: '1920×1080' },
  { key: 'waiting', size: '1920×1080' },
] as const;

export default function StreamSourcesPanel({
  tournamentRef,
  baseUrl,
  enabled,
  planLabel,
}: Props) {
  const t = useAdminT(nsAdminTournamentEmbed);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // Presse-papiers refusé (contexte non sécurisé, permission) : l'URL
      // reste sélectionnable à la main, rien à signaler bruyamment.
    }
  };

  if (!enabled) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
        <h3 className="text-sm font-semibold text-amber-100">
          {t.sourcesTitle}
        </h3>
        <p className="mt-1 text-xs text-amber-100/80">
          {t.sourcesLockedBody.replace('{plan}', planLabel)}
        </p>
        <a
          href="/organisateurs#offres"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex rounded-lg border border-amber-400/40 px-3 py-1.5 text-xs font-semibold text-amber-100 transition-colors hover:border-amber-300"
        >
          {t.sourcesLockedCta}
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-400">{t.sourcesDescription}</p>

      <div className="space-y-2">
        {SOURCES.map((s) => {
          const url = `${baseUrl}/overlay/match/next?tournament=${encodeURIComponent(
            tournamentRef
          )}&source=${s.key}`;
          const label = t[`source_${s.key}_name` as keyof typeof t] as string;
          const desc = t[`source_${s.key}_desc` as keyof typeof t] as string;
          return (
            <div
              key={s.key}
              className="rounded-xl border border-neutral-700/40 bg-neutral-900/50 p-4"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white">{label}</div>
                  <div className="mt-0.5 text-xs text-neutral-500">{desc}</div>
                </div>
                <span className="shrink-0 rounded-md bg-neutral-800 px-2 py-1 font-mono text-[10px] text-neutral-400">
                  {s.size}
                </span>
              </div>
              <div className="relative">
                <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-neutral-700/60 bg-neutral-950/70 p-3 pr-20 font-mono text-[11px] text-neutral-300">
                  {url}
                </pre>
                <button
                  type="button"
                  onClick={() => copy(url, s.key)}
                  className="absolute right-2 top-2 rounded-md bg-neutral-700 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-neutral-600"
                >
                  {copied === s.key ? t.copiedBtn : t.copyBtn}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] leading-relaxed text-neutral-500">
        {t.sourcesHint}
      </p>
    </div>
  );
}
