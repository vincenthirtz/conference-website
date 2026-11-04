// components/TeamOpenings/TeamOpeningsList.tsx
//
// Liste PUBLIQUE et anonymisée des équipes qui recrutent — onglet « Équipes
// qui recrutent » du hub mercato (/mercato). Les filtres sont posés par la page
// et appliqués ici (`openingMatchesFilters`, utils/mercato.ts).
//
// Comme la liste des joueuses libres, son rôle est d'abord une PREUVE : une
// joueuse qui hésite doit voir qu'il y a des places à prendre. L'API publique
// ne renvoie donc aucun moyen de contact (cf. utils/teamOpenings.ts).
//
// Mais une annonce à laquelle on ne peut pas répondre ne sert à rien : la seule
// porte était « réponds depuis le Discord », et personne ne la prenait. Chaque
// carte porte donc un bouton « Contacter cette équipe » qui interroge la route
// AUTHENTIFIÉE /api/team-openings/contact — le compte est la seule gate, comme
// documenté dans la route. Les coordonnées ne sont chargées qu'au clic, une
// annonce à la fois : la page reste sans adresse tant que personne ne demande.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/hooks/useSession';
import CopyButton from '@/components/player/CopyButton';
import { useT, format as fmt } from '@/lib/i18n/useT';
import nsRecrutementPage from '@/lib/i18n/locales/fr/recrutementPage';
import nsMercato from '@/lib/i18n/locales/fr/mercato';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { formatSiteDate } from '@/utils/timezone';
import type {
  ContactTeamOpening,
  PublicTeamOpening,
  TeamOpeningRole,
} from '@/utils/teamOpenings';
import { openingMatchesFilters, type MercatoFilters } from '@/utils/mercato';
import {
  INPUT_LABEL,
  PLATFORM_LABEL,
  POSITION_LABEL,
  SOUGHT_LABEL,
  openingRankLabel,
} from '@/components/Mercato/mercatoLabels';
import { withOpeningDefaults } from '@/components/Mercato/defaults';

type Dict = typeof nsRecrutementPage.fr;

const ROLE_LABEL: Record<TeamOpeningRole, keyof Dict> = {
  tank: 'roleTank',
  dps: 'roleDps',
  support: 'roleSupport',
  flex: 'roleFlex',
};

/** Retour vers la liste après connexion : la joueuse revient là où elle était. */
export const CONTACT_LOGIN_HREF = `/login?next=${encodeURIComponent(
  '/mercato?onglet=equipes'
)}`;

const NO_FILTERS: MercatoFilters = {};

export type ContactErrorKind = 'rateLimited' | 'gone' | 'session' | 'generic';

/**
 * Traduit le statut HTTP de /api/team-openings/contact en cas d'erreur affiché.
 *
 * Distinguer n'est pas du zèle : « réessaie dans une minute » (429), « cette
 * équipe ne cherche plus » (404 — annonce expirée ou retirée) et « ta session a
 * expiré » (401) appellent trois gestes différents. Un message unique ferait
 * réessayer en boucle sur une annonce morte.
 */
export function contactErrorKind(status: number): ContactErrorKind {
  if (status === 429) return 'rateLimited';
  if (status === 404) return 'gone';
  if (status === 401 || status === 403) return 'session';
  return 'generic';
}

type ContactState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; contact: ContactTeamOpening['contact'] }
  | { status: 'error'; kind: ContactErrorKind };

const CONTACT_ERROR_LABEL: Record<ContactErrorKind, keyof Dict> = {
  rateLimited: 'contactRateLimited',
  gone: 'contactGone',
  session: 'contactSession',
  generic: 'contactError',
};

const ROLE_CHIP =
  'rounded-full border border-[var(--color-green)]/30 bg-[var(--color-green)]/15 px-2.5 py-1 text-xs text-gray-100';

/** Profils, rang, plateformes et contrôles recherchés, en une ou deux lignes. */
function OpeningFacts({
  opening,
  tm,
}: {
  opening: PublicTeamOpening;
  tm: typeof nsMercato.fr;
}) {
  const rank = openingRankLabel(tm, opening);
  const sought = opening.soughtGenders.map((g) => tm[SOUGHT_LABEL[g]]);
  const gear = [
    ...opening.platforms.map((x) => tm[PLATFORM_LABEL[x]]),
    ...opening.inputs.map((x) => tm[INPUT_LABEL[x]]),
  ];
  if (!rank && sought.length === 0 && gear.length === 0) return null;
  return (
    <div className="space-y-1 text-xs text-gray-300">
      {sought.length > 0 && (
        <p>{fmt(tm.cardSought, { list: sought.join(', ') })}</p>
      )}
      {(rank || gear.length > 0) && (
        <p className="text-gray-400">
          {[rank, ...gear].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  );
}

const CONTACT_CTA_CLASS =
  'inline-flex items-center justify-center rounded-lg border border-[var(--color-violet-light)]/50 bg-[var(--color-violet-cta)]/20 px-3 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-violet-cta)]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-60';

function OpeningContact({ openingId, t }: { openingId: string; t: Dict }) {
  const { user, token, loading: sessionLoading } = useSession();
  const [state, setState] = useState<ContactState>({ status: 'idle' });

  const reveal = async () => {
    if (!token) return;
    setState({ status: 'loading' });
    try {
      const res = await fetch(
        `/api/team-openings/contact?id=${encodeURIComponent(openingId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        setState({ status: 'error', kind: contactErrorKind(res.status) });
        return;
      }
      const data = (await res.json()) as { opening?: ContactTeamOpening };
      // La route ne renvoie que les coordonnées (`{ opening: { contact } }`) :
      // l'annonce est déjà affichée, et rien de plus n'a à sortir d'une route
      // qui donne un email.
      setState({
        status: 'ready',
        contact: data.opening?.contact ?? { email: null, discord: null },
      });
    } catch {
      setState({ status: 'error', kind: 'generic' });
    }
  };

  // Anonyme, session résolue : un lien vers la connexion plutôt qu'un bouton
  // voué au 401. Tant que la session charge, on montre le bouton inerte — pas
  // un « connecte-toi » à une joueuse qui l'est déjà.
  if (!sessionLoading && !user) {
    return (
      <div className="mt-auto flex flex-col gap-1">
        <Link href={CONTACT_LOGIN_HREF} className={CONTACT_CTA_CLASS}>
          {t.contactCta}
        </Link>
        <p className="text-xs text-gray-500">{t.contactLoginHint}</p>
      </div>
    );
  }

  if (state.status === 'ready') {
    const { email, discord } = state.contact;
    return (
      <div
        className="mt-auto rounded-lg border border-white/10 bg-white/[0.04] p-3"
        role="status"
        aria-live="polite"
      >
        {!email && !discord ? (
          <p className="text-sm text-gray-300">{t.contactNone}</p>
        ) : (
          <dl className="flex flex-col gap-2 text-sm">
            {email && (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-gray-500">
                    {t.contactEmailLabel}
                  </dt>
                  <dd className="break-all text-gray-100">
                    <a
                      href={`mailto:${email}`}
                      className="underline underline-offset-2 hover:text-white"
                    >
                      {email}
                    </a>
                  </dd>
                </div>
                <CopyButton
                  value={email}
                  label={t.contactCopyEmail}
                  className="h-8 w-8 shrink-0"
                />
              </div>
            )}
            {discord && (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-gray-500">
                    {t.contactDiscordLabel}
                  </dt>
                  <dd className="break-all text-gray-100">{discord}</dd>
                </div>
                <CopyButton
                  value={discord}
                  label={t.contactCopyDiscord}
                  className="h-8 w-8 shrink-0"
                />
              </div>
            )}
          </dl>
        )}
      </div>
    );
  }

  const isLoading = state.status === 'loading';
  return (
    <div className="mt-auto flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void reveal()}
        disabled={isLoading || sessionLoading || !token}
        aria-busy={isLoading}
        className={CONTACT_CTA_CLASS}
      >
        {isLoading ? t.contactLoading : t.contactCta}
      </button>
      {state.status === 'error' && (
        <p role="alert" className="text-xs text-red-300">
          {t[CONTACT_ERROR_LABEL[state.kind]] as string}
          {state.kind === 'session' && (
            <>
              {' '}
              <Link
                href={CONTACT_LOGIN_HREF}
                className="font-semibold underline underline-offset-2"
              >
                {t.contactLoginAgain}
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}

export default function TeamOpeningsList({
  /** Incrémenté par la page après une publication : force un rechargement. */
  refreshKey = 0,
  filters = NO_FILTERS,
}: {
  refreshKey?: number;
  filters?: MercatoFilters;
}) {
  const t = useT(nsRecrutementPage);
  const tm = useT(nsMercato);
  const { lang } = useLang();
  const [openings, setOpenings] = useState<PublicTeamOpening[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/public/team-openings');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setOpenings(
        Array.isArray(data.openings)
          ? data.openings.map(withOpeningDefaults)
          : []
      );
    } catch {
      // Un échec réseau ne doit pas se déguiser en « personne ne recrute » :
      // les deux états se ressemblent à l'écran et ne disent pas du tout la
      // même chose à une joueuse qui cherche une équipe.
      setError(true);
      setOpenings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const visible = useMemo(
    () => openings.filter((o) => openingMatchesFilters(o, filters)),
    [openings, filters]
  );
  const filtered = visible.length !== openings.length;

  return (
    <section aria-labelledby="team-openings-list-title">
      <div className="mb-6">
        <h2
          id="team-openings-list-title"
          className="text-2xl font-extrabold tracking-tight text-white"
        >
          {t.listTitle}
        </h2>
        <p className="mt-1 text-sm text-gray-400" aria-live="polite">
          {loading
            ? t.listSubtitle
            : filtered
              ? fmt(tm.resultCount, {
                  shown: visible.length,
                  total: openings.length,
                })
              : fmt(t.listCount, { count: openings.length })}
        </p>
      </div>

      {loading && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="h-32 animate-pulse rounded-xl border border-white/10 bg-white/[0.03]"
            />
          ))}
        </ul>
      )}

      {!loading && error && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center"
        >
          <p className="text-sm text-red-200">{t.listError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-2 text-sm font-semibold text-red-100 underline underline-offset-2"
          >
            {t.listRetry}
          </button>
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-gray-300">
          {openings.length > 0 ? tm.noMatch : t.listEmpty}
        </p>
      )}

      {!loading && !error && visible.length > 0 && (
        <>
          <ul
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            data-test="mercato-openings-list"
          >
            {visible.map((opening) => (
              <li
                key={opening.id}
                className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[var(--bg-elevated)] p-5"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-white">{opening.teamName}</p>
                    {opening.from?.name && (
                      <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-gray-300">
                        {fmt(t.fromSpace, { name: opening.from.name })}
                      </span>
                    )}
                  </div>
                  {opening.since && (
                    <p className="text-xs text-gray-500">
                      {fmt(t.listSince, {
                        // Fuseau du site : sinon la date rendue côté serveur
                        // (Netlify, en UTC) saute à l'hydratation.
                        date: formatSiteDate(opening.since, lang, {
                          day: 'numeric',
                          month: 'long',
                        }),
                      })}
                    </p>
                  )}
                </div>

                {opening.positions.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {opening.positions.map((pos) => (
                      <li key={pos} className={ROLE_CHIP}>
                        {tm[POSITION_LABEL[pos]]}
                      </li>
                    ))}
                  </ul>
                ) : (
                  opening.roles.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                      {opening.roles.map((role) => (
                        <li key={role} className={ROLE_CHIP}>
                          {t[ROLE_LABEL[role]] as string}
                        </li>
                      ))}
                    </ul>
                  )
                )}

                <OpeningFacts opening={opening} tm={tm} />

                {opening.availability && (
                  <p className="text-sm text-gray-300">
                    {opening.availability}
                  </p>
                )}
                {opening.note && (
                  <p className="text-sm italic text-gray-400">{opening.note}</p>
                )}

                <OpeningContact openingId={opening.id} t={t} />
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-gray-500">{t.listNoContact}</p>
        </>
      )}
    </section>
  );
}
