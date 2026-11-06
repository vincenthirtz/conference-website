// features/admin/tournaments/rulesGate.ts — « peut-on accepter l'inscription
// de cette équipe ? » du point de vue du règlement à valider, et lecture du
// refus serveur 409 `rules_not_accepted`.
//
// Pur, sans React ni réseau : la fiche demande, la liste des demandes et le
// hub du tournoi s'en servent avec leurs propres données.
//
// La décision qui fait foi est CELLE DU SERVEUR (conference-api refuse toute
// acceptation tant qu'une validation manque). Ici, on ne fait que l'annoncer
// avant le clic — bouton désactivé, raison écrite — et rendre lisible le
// refus s'il arrive quand même (données périmées, autre onglet).

import { format } from '@/lib/i18n/useAdminT';
import type nsAdminTournamentRules from '@/lib/i18n/locales/admin-fr/adminTournamentRules';
import { ApiHttpError } from '@/utils/http/authedRequest';
import type {
  TournamentRulesAdminView,
  TournamentRulesStatusView,
  TournamentRulesTeamStatus,
} from './client';

type T = typeof nsAdminTournamentRules.fr;

/** Une équipe à qui il manque des validations (corps du 409). */
export type RulesMissingTeam = {
  teamId: string;
  name: string;
  missing: number;
};

export type RulesGate =
  | { blocked: false }
  | { blocked: true; reason: 'no_version' }
  | { blocked: true; reason: 'incomplete'; team: TournamentRulesTeamStatus };

/**
 * L'acceptation de `teamId` serait-elle refusée pour le règlement ?
 * Réglage éteint, ou données pas encore lues : non (rien à annoncer — le
 * serveur reste le juge). Équipe absente du décompte : non plus, pour la même
 * raison.
 */
export function rulesGateFor(
  view: TournamentRulesAdminView | undefined,
  status: TournamentRulesStatusView | undefined,
  teamId: string | null | undefined
): RulesGate {
  if (!view?.required) return { blocked: false };
  if (view.versions.length === 0)
    return { blocked: true, reason: 'no_version' };
  if (!status || !teamId) return { blocked: false };
  const team = status.teams.find((x) => x.teamId === teamId);
  if (!team || team.complete) return { blocked: false };
  return { blocked: true, reason: 'incomplete', team };
}

/** Phrase de la raison (bouton désactivé). */
export function rulesGateReason(gate: RulesGate, t: T): string | null {
  if (!gate.blocked) return null;
  if (gate.reason === 'no_version') return t.gateNoVersion;
  return format(t.gateIncomplete, {
    validated: gate.team.validated,
    total: gate.team.total,
  });
}

/** Noms des membres qui n'ont pas validé (sans compte compris). */
export function missingMemberNames(team: TournamentRulesTeamStatus): string[] {
  return team.members.filter((m) => !m.accepted).map((m) => m.name);
}

function asMissing(raw: unknown): RulesMissingTeam | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { teamId?: unknown; name?: unknown; missing?: unknown };
  if (typeof r.teamId !== 'string') return null;
  return {
    teamId: r.teamId,
    name: typeof r.name === 'string' && r.name ? r.name : r.teamId,
    missing: typeof r.missing === 'number' ? r.missing : 0,
  };
}

/**
 * Le refus 409 `rules_not_accepted`, depuis une erreur levée (`adminRequest`)
 * ou un corps JSON déjà lu (`useIdempotentMutation`). `null` si ce n'en est
 * pas un.
 */
export function readRulesNotAccepted(
  errOrBody: unknown
): RulesMissingTeam[] | null {
  const body =
    errOrBody instanceof ApiHttpError ? errOrBody.payload : errOrBody;
  if (!body || typeof body !== 'object') return null;
  const b = body as {
    code?: unknown;
    missing?: unknown;
    details?: { missing?: unknown };
  };
  if (b.code !== 'rules_not_accepted') return null;
  const raw = Array.isArray(b.missing)
    ? b.missing
    : Array.isArray(b.details?.missing)
      ? b.details.missing
      : [];
  return raw.map(asMissing).filter((m): m is RulesMissingTeam => m !== null);
}

/** Message lisible du refus : « Règlement pas encore validé par tout le monde — Alpha : 2 manquantes ». */
export function rulesNotAcceptedMessage(
  missing: RulesMissingTeam[],
  t: T
): string {
  if (missing.length === 0) return t.blockedGeneric;
  const teams = missing
    .map((m) =>
      format(m.missing === 1 ? t.blockedTeam_one : t.blockedTeam_other, {
        team: m.name,
        missing: m.missing,
      })
    )
    .join(' · ');
  return format(t.blockedList, { teams });
}

/** Le message du refus règlement si c'en est un, sinon `null`. */
export function rulesBlockMessage(errOrBody: unknown, t: T): string | null {
  const missing = readRulesNotAccepted(errOrBody);
  return missing ? rulesNotAcceptedMessage(missing, t) : null;
}
