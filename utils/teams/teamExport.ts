// utils/teams/teamExport.ts
//
// Logique PURE de l'export des équipes (`GET /api/admin/teams/export`) :
// répartition roster / remplaçantes / encadrement, pseudo affiché, rôle lisible,
// CSV (échappement + neutralisation des formules) et nom de fichier.
//
// Aucune I/O ici : la route lit la base, ce module met en forme. C'est ce qui
// permet de tester l'échappement et l'anti-injection sans Supabase.
//
// Données personnelles : l'export sort de l'admin et finit dans des tableurs
// partagés. Il ne porte donc QUE ce qui sert à identifier une joueuse en jeu et
// sur Discord (pseudo, BattleTag, pseudo Discord) — jamais d'email, de
// téléphone, de nom réel, de date de naissance ni d'identifiant de compte.

import { splitTeamMembers } from './roleKind';

/** Plafond d'équipes par export (au-delà : `truncated: true`). */
export const TEAM_EXPORT_MAX_TEAMS = 500;

export const TEAM_EXPORT_CSV_COLUMNS = [
  'equipe',
  'tag',
  'statut_inscription',
  'categorie',
  'role',
  'pseudo',
  'battletag',
  'discord',
] as const;

export type ExportMember = {
  pseudo: string | null;
  battleTag: string | null;
  discord: string | null;
  /** `team_members.role` (player, coach, manager…). */
  role: string | null;
  /** tank / dps / support / flex. */
  specialty: string | null;
  isCaptain: boolean;
};

export type ExportTeam = {
  id: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  /** `tournament_teams.status` quand l'export est scopé à un tournoi. */
  registrationStatus: string | null;
  members: {
    roster: ExportMember[];
    subs: ExportMember[];
    staff: ExportMember[];
  };
};

export type TeamsExportPayload = {
  generatedAt: string;
  tournament: { id: string; name: string } | null;
  truncated: boolean;
  teams: ExportTeam[];
};

/** Ligne `teams` lue par la route (colonnes strictement nécessaires). */
export type RawExportTeam = {
  id: string;
  name: string | null;
  short_name: string | null;
  logo_url: string | null;
  captain_id: string | null;
};

/** Ligne `team_members` lue par la route. */
export type RawExportMember = {
  user_id: string | null;
  role: string | null;
  specialty: string | null;
  is_substitute: boolean | null;
  battle_tag: string | null;
  display_name: string | null;
};

export type ExportLookups = {
  registrationStatus: string | null;
  /** user_id -> pseudo du compte (métadonnée `display_name`). */
  accountNames: ReadonlyMap<string, string | null>;
  /** user_id -> `user_discord_links.discord_username`. */
  discordByUser: ReadonlyMap<string, string | null>;
};

function clean(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Pseudo affiché : surcharge d'équipe, sinon pseudo du compte, sinon la partie
 * avant `#` du BattleTag, sinon le pseudo Discord.
 */
export function resolveExportPseudo(input: {
  displayName?: string | null;
  accountDisplayName?: string | null;
  battleTag?: string | null;
  discordUsername?: string | null;
}): string | null {
  const direct = clean(input.displayName) ?? clean(input.accountDisplayName);
  if (direct) return direct;
  const tag = clean(input.battleTag);
  if (tag) {
    const name = clean(tag.split('#')[0]);
    if (name) return name;
  }
  return clean(input.discordUsername);
}

const frCollator = new Intl.Collator('fr', {
  sensitivity: 'base',
  numeric: true,
});

/** Tri français (accents ignorés au premier niveau), valeurs vides en dernier. */
export function compareFr(
  a: string | null | undefined,
  b: string | null | undefined
): number {
  const an = clean(a);
  const bn = clean(b);
  if (!an && !bn) return 0;
  if (!an) return 1;
  if (!bn) return -1;
  return frCollator.compare(an, bn);
}

function toExportMember(
  m: RawExportMember,
  captainId: string | null,
  lookups: ExportLookups
): ExportMember {
  const discord = m.user_id
    ? clean(lookups.discordByUser.get(m.user_id) ?? null)
    : null;
  const accountName = m.user_id
    ? (lookups.accountNames.get(m.user_id) ?? null)
    : null;
  return {
    pseudo: resolveExportPseudo({
      displayName: m.display_name,
      accountDisplayName: accountName,
      battleTag: m.battle_tag,
      discordUsername: discord,
    }),
    battleTag: clean(m.battle_tag),
    discord,
    role: clean(m.role),
    specialty: clean(m.specialty),
    isCaptain: Boolean(captainId && m.user_id && captainId === m.user_id),
  };
}

function sortMembers(list: ExportMember[]): ExportMember[] {
  return [...list].sort(
    (a, b) =>
      compareFr(a.pseudo, b.pseudo) || compareFr(a.battleTag, b.battleTag)
  );
}

/** Met en forme une équipe et son effectif (répartition = règle du site). */
export function buildExportTeam(
  team: RawExportTeam,
  members: readonly RawExportMember[],
  lookups: ExportLookups
): ExportTeam {
  const split = splitTeamMembers(members);
  const map = (list: RawExportMember[]) =>
    sortMembers(list.map((m) => toExportMember(m, team.captain_id, lookups)));
  return {
    id: team.id,
    name: clean(team.name) ?? '',
    shortName: clean(team.short_name),
    logoUrl: clean(team.logo_url),
    registrationStatus: lookups.registrationStatus,
    members: {
      roster: map(split.roster),
      subs: map(split.subs),
      staff: map(split.staff),
    },
  };
}

export function sortExportTeams(teams: readonly ExportTeam[]): ExportTeam[] {
  return [...teams].sort((a, b) => compareFr(a.name, b.name));
}

export type ExportCategory = 'roster' | 'sub' | 'staff';

/**
 * Rôle lisible d'une ligne CSV : « capitaine » puis le rôle d'encadrement
 * (staff) ou la spécialité de jeu (roster / remplaçante).
 * Ex. `capitaine, dps` · `coach` · `support`.
 */
export function exportMemberRoleLabel(
  member: ExportMember,
  category: ExportCategory
): string {
  const parts: string[] = [];
  if (member.isCaptain) parts.push('capitaine');
  const detail = category === 'staff' ? member.role : member.specialty;
  if (detail) parts.push(detail);
  return parts.join(', ');
}

/**
 * Cellule CSV sûre pour Excel / LibreOffice / Google Sheets.
 *
 * 1. Anti-injection de formule (CSV injection, OWASP) : une cellule qui
 *    commence par `=`, `+`, `-`, `@`, tabulation ou retour chariot serait
 *    évaluée par le tableur — un nom d'équipe `=HYPERLINK(...)` deviendrait un
 *    lien piégé. On la préfixe d'une apostrophe, qui force le texte.
 * 2. Échappement RFC 4180 (séparateur `;`) : guillemets doublés, cellule
 *    quotée si elle contient `;`, `"` ou un saut de ligne.
 */
export function csvCell(value: string | null | undefined): string {
  let str = value ?? '';
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  if (/[;"\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

/** BOM UTF-8 : sans lui, Excel FR ouvre le fichier en Windows-1252. */
export const CSV_BOM = String.fromCharCode(0xfeff);

/**
 * CSV complet (BOM inclus), une ligne par membre, CRLF. Une équipe sans membre
 * garde une ligne, colonnes membre vides.
 */
export function buildTeamsCsv(teams: readonly ExportTeam[]): string {
  const lines: string[] = [TEAM_EXPORT_CSV_COLUMNS.join(';')];
  for (const team of teams) {
    const base = [team.name, team.shortName, team.registrationStatus];
    const rows: Array<[ExportCategory, ExportMember]> = [
      ...team.members.roster.map(
        (m) => ['roster', m] as [ExportCategory, ExportMember]
      ),
      ...team.members.subs.map(
        (m) => ['sub', m] as [ExportCategory, ExportMember]
      ),
      ...team.members.staff.map(
        (m) => ['staff', m] as [ExportCategory, ExportMember]
      ),
    ];
    if (rows.length === 0) {
      lines.push([...base, '', '', '', '', ''].map(csvCell).join(';'));
      continue;
    }
    for (const [category, m] of rows) {
      lines.push(
        [
          ...base,
          category,
          exportMemberRoleLabel(m, category),
          m.pseudo,
          m.battleTag,
          m.discord,
        ]
          .map(csvCell)
          .join(';')
      );
    }
  }
  return CSV_BOM + lines.join('\r\n') + '\r\n';
}

/** Slug ASCII sûr pour un nom de fichier (accents retirés, 60 car. max). */
export function asciiSlug(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/** `YYYY-MM-DD` dans le fuseau de l'organisation (Europe/Paris). */
export function exportDateStamp(date: Date, timeZone = 'Europe/Paris'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Nom du fichier CSV :
 * - une équipe  → `equipe-<slug équipe>-YYYY-MM-DD.csv`
 * - un tournoi  → `equipes-<slug tournoi>-YYYY-MM-DD.csv`
 * - sinon       → `equipes-toutes-YYYY-MM-DD.csv`
 */
export function teamsExportFilename(opts: {
  date: Date;
  teamName?: string | null;
  tournamentName?: string | null;
  single?: boolean;
}): string {
  const stamp = exportDateStamp(opts.date);
  if (opts.single) {
    return `equipe-${asciiSlug(opts.teamName) || 'sans-nom'}-${stamp}.csv`;
  }
  const scope =
    opts.tournamentName !== undefined && opts.tournamentName !== null
      ? asciiSlug(opts.tournamentName) || 'tournoi'
      : 'toutes';
  return `equipes-${scope}-${stamp}.csv`;
}
