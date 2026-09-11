// components/admin/teams/TeamExportSheet.tsx
//
// La FEUILLE de l'export PDF des équipes : ce qui part à l'imprimante.
//
// Purement présentationnel (données en props, aucun fetch) : la page
// `pages/admin/teams/print.tsx` s'occupe du chargement et de l'impression, ce
// composant du papier. Rendu testé en SSR (tests/unit/teamExportSheet.test.ts).
//
// Sobre par construction : fond blanc / texte sombre à l'écran (c'est un aperçu
// de la feuille), noir sur blanc à l'impression (`.print-document`). Chaque
// équipe est un bloc `team-export-card` qu'on ne coupe pas entre deux pages
// (styles/globals.css) ; plusieurs équipes partagent une page — un saut par
// équipe ferait 100 pages pour 100 équipes.

import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTeamExport from '@/lib/i18n/locales/admin-fr/adminTeamExport';
import {
  isSingleTeamTarget,
  type ExportMember,
  type ExportTeam,
  type TeamExportPayload,
  type TeamExportTarget,
} from '@/utils/teams/teamExportClient';

type Dict = (typeof nsAdminTeamExport)['fr'];

/** Titre de la feuille — sert aussi de titre d'onglet, donc de nom de PDF. */
export function teamExportTitle(
  payload: TeamExportPayload,
  target: TeamExportTarget,
  t: Dict
): string {
  if (isSingleTeamTarget(target)) {
    return payload.teams[0]?.name || t.titleTeamFallback;
  }
  if (payload.tournament) {
    return format(t.titleTournament, { name: payload.tournament.name });
  }
  return t.titleAll;
}

export function formatGeneratedAt(iso: string, locale: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' });
}

/** Libellé connu, sinon la valeur brute : un statut inédit reste lisible. */
function lookup(
  labels: Record<string, string>,
  value: string | null | undefined
): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  return labels[raw.toLowerCase()] ?? raw;
}

function filtersSummary(target: TeamExportTarget, t: Dict): string | null {
  if (isSingleTeamTarget(target)) return null;
  const parts: string[] = [];
  if (target.filters.search) {
    parts.push(format(t.filterSearch, { q: target.filters.search }));
  }
  if (target.filters.isActive === 'true') parts.push(t.filterActive);
  if (target.filters.isActive === 'false') parts.push(t.filterInactive);
  return parts.length > 0 ? `${t.filtersPrefix}${parts.join(', ')}` : null;
}

/**
 * Même règle que la colonne `role` du CSV (`exportMemberRoleLabel`, côté
 * route) : l'encadrement se lit par son rôle (coach, manager…), une joueuse par
 * son poste — son `role` technique (`player`) n'apprend rien sur papier.
 */
function memberDetail(
  m: ExportMember,
  isStaff: boolean,
  t: Dict
): string | null {
  return isStaff ? m.role?.trim() || null : lookup(t.specialty, m.specialty);
}

function MemberBlock({
  title,
  members,
  isStaff = false,
  t,
}: {
  title: string;
  members: ExportMember[];
  isStaff?: boolean;
  t: Dict;
}) {
  return (
    <div className="mt-3">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-600">
        {title} <span className="font-normal">({members.length})</span>
      </h3>
      {members.length === 0 ? (
        <p className="text-sm italic text-neutral-500">{t.none}</p>
      ) : (
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-xs text-neutral-600">
              <th scope="col" className="w-[30%] py-1 pr-3 font-medium">
                {t.colPseudo}
              </th>
              <th scope="col" className="w-[24%] py-1 pr-3 font-medium">
                {t.colBattleTag}
              </th>
              <th scope="col" className="w-[24%] py-1 pr-3 font-medium">
                {t.colDiscord}
              </th>
              <th scope="col" className="py-1 font-medium">
                {t.colRole}
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((m, i) => {
              const roleText = memberDetail(m, isStaff, t);
              return (
                <tr
                  key={`${m.pseudo ?? ''}-${i}`}
                  className="border-b border-neutral-200 last:border-b-0 align-top"
                >
                  <td className="py-1 pr-3 font-medium break-words">
                    {m.pseudo || '—'}
                    {m.isCaptain && (
                      <span className="ml-2 whitespace-nowrap rounded border border-neutral-400 px-1 text-[10px] font-semibold uppercase tracking-wide">
                        ★ {t.captain}
                      </span>
                    )}
                  </td>
                  <td className="py-1 pr-3 font-mono text-xs break-words">
                    {m.battleTag || '—'}
                  </td>
                  <td className="py-1 pr-3 break-words">{m.discord || '—'}</td>
                  <td className="py-1 break-words">{roleText || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TeamCard({
  team,
  showRegistration,
  t,
}: {
  team: ExportTeam;
  showRegistration: boolean;
  t: Dict;
}) {
  const status = showRegistration
    ? lookup(t.regStatus, team.registrationStatus)
    : null;
  return (
    <section className="team-export-card break-inside-avoid mt-6 border-t border-neutral-300 pt-5 first:mt-0 first:border-t-0 first:pt-0">
      <header className="flex items-center gap-4">
        {team.logoUrl && (
          // Logo décoratif à côté du nom ; next/image exigerait de déclarer
          // chaque domaine de stockage, pour une page qui ne fait qu'imprimer.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={team.logoUrl}
            alt=""
            className="h-14 w-14 flex-shrink-0 rounded-lg border border-neutral-200 object-contain"
          />
        )}
        <div className="min-w-0">
          <h2 className="text-xl font-bold break-words">
            {team.name}
            {team.shortName && (
              <span className="ml-2 text-sm font-semibold text-neutral-600">
                [{team.shortName}]
              </span>
            )}
          </h2>
          {status && (
            <p className="text-sm text-neutral-600">
              {format(t.registration, { status })}
            </p>
          )}
        </div>
      </header>
      <MemberBlock title={t.roster} members={team.members.roster} t={t} />
      <MemberBlock title={t.subs} members={team.members.subs} t={t} />
      <MemberBlock title={t.staff} members={team.members.staff} isStaff t={t} />
    </section>
  );
}

export default function TeamExportSheet({
  payload,
  target,
}: {
  payload: TeamExportPayload;
  target: TeamExportTarget;
}) {
  const t = useAdminT(nsAdminTeamExport);
  const generated = formatGeneratedAt(payload.generatedAt, t.dateLocale);
  const count = payload.teams.length;
  const meta = [
    generated ? format(t.generatedAt, { date: generated }) : null,
    format(count > 1 ? t.teamCount_other : t.teamCount_one, { count }),
    filtersSummary(target, t),
  ].filter(Boolean);

  return (
    <article className="text-neutral-900">
      <header className="mb-6 border-b-2 border-neutral-800 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">
          {teamExportTitle(payload, target, t)}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">{meta.join(' · ')}</p>
      </header>
      <div>
        {payload.teams.map((team) => (
          <TeamCard
            key={team.id}
            team={team}
            showRegistration={payload.tournament !== null}
            t={t}
          />
        ))}
      </div>
    </article>
  );
}
