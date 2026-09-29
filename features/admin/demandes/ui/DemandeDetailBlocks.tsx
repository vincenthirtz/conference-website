// features/admin/demandes/ui/DemandeDetailBlocks.tsx — les blocs de lecture de
// la fiche d'une demande (pages/admin/demandes/[id].tsx), passés en « Le Ruban »
// et sortis de la page (règle A7 : elle est gelée en taille).
//
// Purement présentationnel : la page charge la demande, garde la note staff,
// le transfert de scrim et la décision ; elle passe ici la demande telle quelle.

import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminDemandeDetail from '@/lib/i18n/locales/admin-fr/adminDemandeDetail';
import type { ChipTone } from '@/features/admin/_shared/ui/Chip';
import { FicheSection, MetaList } from '@/features/admin/_shared/ui/Fiche';
import RegistrationAnswers from '@/components/admin/RegistrationAnswers';
import type { RegistrationField } from '@/utils/registrationFields';

type Dict = typeof nsAdminDemandeDetail.fr;

type DemandeType =
  | 'join_team'
  | 'leave_team'
  | 'captain_request'
  | 'team_registration'
  | 'scrim'
  | 'other';

export type DemandeStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type Demande = {
  id: string;
  type: DemandeType | string;
  status: DemandeStatus;
  comment: string | null;
  staff_note: string | null;
  source: string | null;
  payload: Record<string, any> | null;
  created_at: string;
  updated_at: string | null;
  processed_at: string | null;
  user_id: string | null;
  team_id: string | null;
  tournament_id: string | null;
  user?: {
    id: string;
    email: string | null;
    display_name: string | null;
    battle_tag: string | null;
    discord: string | null;
  } | null;
  team?: {
    id: string;
    name: string;
    short_name: string | null;
    logo_url: string | null;
  } | null;
  tournament?: {
    id: string;
    name: string;
    slug: string | null;
  } | null;
  handled_by?: {
    id: string;
    display_name: string | null;
    role: string | null;
  } | null;
};

export function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function typeLabel(type: string, t: Dict) {
  switch (type) {
    case 'join_team':
    case 'join':
      return t.typeJoin;
    case 'leave_team':
    case 'leave':
      return t.typeLeave;
    case 'captain_request':
      return t.typeCaptainRequest;
    case 'team_registration':
      return t.typeTeamRegistration;
    case 'scrim':
      return t.typeScrim;
    case 'other':
      return t.typeOther;
    default:
      return type;
  }
}

export function statusLabel(status: DemandeStatus, t: Dict) {
  switch (status) {
    case 'pending':
      return t.statusPending;
    case 'approved':
      return t.statusApproved;
    case 'rejected':
      return t.statusRejected;
    case 'cancelled':
      return t.statusCancelled;
    default:
      return status;
  }
}

export function statusChipTone(status: DemandeStatus): ChipTone {
  switch (status) {
    case 'pending':
      return 'warn';
    case 'approved':
      return 'ok';
    case 'rejected':
      return 'err';
    default:
      return 'neutral';
  }
}

export const FIELD_LABEL =
  'text-xs uppercase tracking-wider text-[var(--t3,#a39ba6)]';
export const LINK =
  'text-[var(--or-200,#eec4ff)] hover:text-[var(--t1,#f4edf7)] hover:underline';
const INSET =
  'rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)]';

/** Un couple libellé / valeur des grilles de détail. */
export function Fact({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className={FIELD_LABEL}>{label}</div>
      <div className="font-medium text-[var(--t1,#f4edf7)]">{children}</div>
    </div>
  );
}

/** Message libre laissé par la personne à l'origine de la demande. */
export function DemandeMessage({ comment }: { comment: string }) {
  const t = useAdminT(nsAdminDemandeDetail);
  return (
    <FicheSection title={t.message}>
      <p
        className={`${INSET} whitespace-pre-line p-4 text-sm text-[var(--t1,#f4edf7)]`}
      >
        {comment}
      </p>
    </FicheSection>
  );
}

/** Colonne de droite : utilisatrice, équipe, tournoi. */
export function DemandeActors({ demande }: { demande: Demande }) {
  const t = useAdminT(nsAdminDemandeDetail);
  return (
    <>
      {demande.user && (
        <FicheSection eyebrow title={t.user}>
          <p className="mb-2 font-semibold text-[var(--t1,#f4edf7)]">
            {demande.user.display_name || demande.user.email || demande.user.id}
          </p>
          <MetaList
            items={[
              ...(demande.user.email
                ? [{ label: t.email, value: demande.user.email }]
                : []),
              ...(demande.user.battle_tag
                ? [{ label: t.battleTagLabel, value: demande.user.battle_tag }]
                : []),
              ...(demande.user.discord
                ? [{ label: t.discordLabel, value: demande.user.discord }]
                : []),
            ]}
          />
        </FicheSection>
      )}

      {demande.team && (
        <FicheSection
          eyebrow
          title={demande.type === 'scrim' ? t.teamTarget : t.team}
        >
          <div className="flex items-center gap-3">
            {demande.team.logo_url && (
              <Image
                src={demande.team.logo_url}
                alt={demande.team.name}
                width={48}
                height={48}
                className="h-12 w-12 rounded-[var(--r-ctrl,4px)] border-l-[3px] border-[var(--or,#b467d1)] object-cover"
              />
            )}
            <div>
              <Link
                href={`/admin/teams/${demande.team.id}/edit`}
                className={`font-semibold ${LINK}`}
              >
                {demande.team.name}
              </Link>
              {demande.team.short_name && (
                <div className="text-sm text-[var(--t3,#a39ba6)]">
                  {demande.team.short_name}
                </div>
              )}
            </div>
          </div>
        </FicheSection>
      )}

      {demande.tournament && (
        <FicheSection eyebrow title={t.tournament}>
          <Link
            href={`/admin/tournament/${demande.tournament.id}/edit`}
            className={`font-semibold ${LINK}`}
          >
            {demande.tournament.name}
          </Link>
          {demande.tournament.slug && (
            <div className="mt-1 font-mono text-xs text-[var(--t3,#a39ba6)]">
              {demande.tournament.slug}
            </div>
          )}
        </FicheSection>
      )}
    </>
  );
}

/** Grille de faits d'une demande de scrim (équipes, date, contact externe). */
export function ScrimFacts({ demande }: { demande: Demande }) {
  const t = useAdminT(nsAdminDemandeDetail);
  const payload = demande.payload || {};
  return (
    <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
      {payload.from_team_name && (
        <Fact label={t.requestingTeam}>{payload.from_team_name}</Fact>
      )}
      {(payload.target_team_name || demande.team?.name) && (
        <Fact label={t.teamTarget}>
          {payload.target_team_name || demande.team?.name}
        </Fact>
      )}
      {payload.preferred_date && (
        <Fact label={t.preferredDate}>
          {formatDate(payload.preferred_date)}
        </Fact>
      )}
      {payload.format && <Fact label={t.format}>{payload.format}</Fact>}
      {demande.source === 'public' && (
        <>
          {payload.requester_name && (
            <Fact label={t.contact}>{payload.requester_name}</Fact>
          )}
          {payload.requester_email && (
            <Fact label={t.email}>
              <a
                href={`mailto:${payload.requester_email}`}
                className={`break-all ${LINK}`}
              >
                {payload.requester_email}
              </a>
            </Fact>
          )}
          {payload.requester_discord && (
            <Fact label={t.discord}>
              <span className="break-all">{payload.requester_discord}</span>
            </Fact>
          )}
        </>
      )}
    </div>
  );
}

/** Détail d'une inscription d'équipe à un tournoi. */
export function RegistrationDetails({
  payload,
  tournamentFields,
}: {
  payload: Record<string, any>;
  tournamentFields: RegistrationField[];
}) {
  const t = useAdminT(nsAdminDemandeDetail);
  return (
    <FicheSection title={t.registrationDetails}>
      <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        {payload.team_name && (
          <Fact label={t.teamName}>{payload.team_name}</Fact>
        )}
        {payload.user_email && (
          <Fact label={t.contactEmail}>{payload.user_email}</Fact>
        )}
        {/* Effectif au moment de la candidature. Depuis que `min_players`
            n'interdit plus de candidater (2026-08-27), c'est ICI que la
            règle s'applique : le staff valide en voyant l'écart, au lieu
            qu'un 400 l'ait tranché à sa place — et sans qu'il sache
            qu'une équipe existait. */}
        {typeof payload.roster_players === 'number' && (
          <Fact label={t.rosterAtApply}>
            <span
              className={
                payload.min_players &&
                payload.roster_players < payload.min_players
                  ? 'text-[var(--warn,#f5a524)]'
                  : ''
              }
            >
              {payload.min_players
                ? format(t.rosterVsMin, {
                    count: payload.roster_players,
                    min: payload.min_players,
                  })
                : String(payload.roster_players)}
            </span>
          </Fact>
        )}
        {/* Candidature issue du wizard de création : le roster est alors
            surtout composé d'invitations non encore acceptées. */}
        {payload.auto_from_team_create && (
          <Fact label={t.rosterDeclared}>
            {format(t.rosterConfirmedVsDeclared, {
              confirmed: payload.confirmed_players ?? 0,
              declared: payload.declared_players ?? 0,
            })}
          </Fact>
        )}
      </div>
      {Array.isArray(payload.members) && payload.members.length > 0 && (
        <div className="mt-4">
          <div className={`mb-2 ${FIELD_LABEL}`}>
            {format(t.membersCount, { count: payload.members.length })}
          </div>
          <ul className="space-y-1.5 text-sm">
            {payload.members.map((m, i) => (
              <li key={i} className={`${INSET} px-3 py-2`}>
                <div className="font-medium text-[var(--t1,#f4edf7)]">
                  {m.display_name || m.email}
                </div>
                <div className="flex flex-wrap gap-x-3 text-xs text-[var(--t3,#a39ba6)]">
                  {m.email && <span>{m.email}</span>}
                  {m.battle_tag && (
                    <span>{format(t.memberBt, { tag: m.battle_tag })}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {payload.field_values && typeof payload.field_values === 'object' && (
        <RegistrationAnswers
          fieldValues={payload.field_values as Record<string, unknown>}
          fields={tournamentFields}
        />
      )}
    </FicheSection>
  );
}

/** Détail d'une demande de capitanat. */
export function CaptainRequestDetails({
  payload,
}: {
  payload: Record<string, any>;
}) {
  const t = useAdminT(nsAdminDemandeDetail);
  return (
    <FicheSection title={t.requestDetails}>
      <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        {payload.request_type && (
          <Fact label={t.type}>
            {payload.request_type === 'existing_team'
              ? t.existingTeam
              : t.newTeamToCreate}
          </Fact>
        )}
        {(payload.existing_team_name || payload.team_name) && (
          <Fact label={t.team}>
            {payload.existing_team_name || payload.team_name}
          </Fact>
        )}
      </div>
    </FicheSection>
  );
}

/** Charge utile brute, repliée — filet pour les types sans rendu dédié. */
export function RawPayload({ payload }: { payload: Record<string, any> }) {
  const t = useAdminT(nsAdminDemandeDetail);
  return (
    <details>
      <summary className="cursor-pointer text-xs text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]">
        {t.viewRawPayload}
      </summary>
      <pre
        className={`${INSET} mt-2 overflow-x-auto p-4 text-xs text-[var(--t2,#c7bfca)]`}
      >
        {JSON.stringify(payload, null, 2)}
      </pre>
    </details>
  );
}
