// components/TeamCreate/TeamPreview.tsx — aperçu live : la carte d'équipe se construit en temps réel
// (lot P11 : extrait de pages/team/create.tsx à l'identique — mêmes classes,
// mêmes textes).

import { CrownIcon, GlobeIcon } from './icons';
import type { TeamCreateWizard } from './useTeamCreateWizard';

export default function TeamPreview({ w }: { w: TeamCreateWizard }) {
  const {
    t,
    name,
    shortName,
    country,
    logoUrl,
    members,
    captainIndex,
    isManagerMode,
    hasLogo,
    previewInitials,
    filledMemberIdx,
  } = w;
  return (
    <div className="card-brand rounded-3xl bg-white/[0.05] p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-gray-300">
          {t.previewTitle}
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-green)]/40 bg-[var(--color-green)]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-green-light)]">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-green)]"
          />
          {t.previewLive}
        </span>
      </div>

      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#160b28] via-[#1b0f33] to-[#0f0820] p-5">
        <div className="flex items-center gap-4">
          {hasLogo ? (
            <div
              role="img"
              aria-label={name || t.previewNamePlaceholder}
              className="h-16 w-16 shrink-0 rounded-2xl bg-cover bg-center ring-1 ring-white/15"
              style={{ backgroundImage: `url("${logoUrl.trim()}")` }}
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-violet)]/70 to-[var(--color-green)]/50 text-xl font-black text-white ring-1 ring-white/15">
              {previewInitials}
            </div>
          )}
          <div className="min-w-0">
            <p
              className={`truncate text-lg font-bold ${
                name ? 'text-white' : 'text-gray-500'
              }`}
            >
              {name || t.previewNamePlaceholder}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
              {shortName && (
                <span className="rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono uppercase text-gray-200">
                  {shortName}
                </span>
              )}
              {country && (
                <span className="inline-flex items-center gap-1">
                  <GlobeIcon className="h-3.5 w-3.5 text-[var(--color-violet-light)]" />
                  {country}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5">
          {filledMemberIdx.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {members.map((m, idx) =>
                m.email.trim() ? (
                  <li key={m.id} className="relative">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white ring-1 ring-white/15">
                      {m.email.trim()[0]?.toUpperCase() || '?'}
                    </div>
                    {captainIndex === idx && (
                      <span
                        title={
                          isManagerMode
                            ? t.captainDesignatedLabel
                            : t.captainLabel
                        }
                        className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-yellow)] text-black ring-2 ring-[#160b28]"
                      >
                        <CrownIcon className="h-2.5 w-2.5" />
                        <span className="sr-only">
                          {isManagerMode
                            ? t.captainDesignatedLabel
                            : t.captainLabel}
                        </span>
                      </span>
                    )}
                  </li>
                ) : null
              )}
            </ul>
          ) : (
            <p className="text-xs text-gray-500">{t.previewRosterEmpty}</p>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-1.5 text-xs text-gray-400">
        <p>• {t.note2}</p>
        <p>• {t.note4}</p>
      </div>
    </div>
  );
}
