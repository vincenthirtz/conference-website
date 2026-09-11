// tests/unit/teamExport.test.ts
//
// Mise en forme pure de l'export des équipes (utils/teams/teamExport.ts) :
// échappement CSV, neutralisation des formules, BOM, équipe vide, capitaine,
// tri français, pseudo, nom de fichier.

import { describe, it, expect } from 'vitest';
import {
  CSV_BOM,
  TEAM_EXPORT_CSV_COLUMNS,
  asciiSlug,
  buildExportTeam,
  buildTeamsCsv,
  csvCell,
  exportMemberRoleLabel,
  resolveExportPseudo,
  sortExportTeams,
  teamsExportFilename,
  type ExportLookups,
  type ExportTeam,
  type RawExportMember,
} from '../../utils/teams/teamExport';

const noLookups: ExportLookups = {
  registrationStatus: null,
  accountNames: new Map(),
  discordByUser: new Map(),
};

function member(over: Partial<RawExportMember>): RawExportMember {
  return {
    user_id: null,
    role: 'player',
    specialty: null,
    is_substitute: false,
    battle_tag: null,
    display_name: null,
    ...over,
  };
}

function emptyTeam(name: string, over: Partial<ExportTeam> = {}): ExportTeam {
  return {
    id: name,
    name,
    shortName: null,
    logoUrl: null,
    registrationStatus: null,
    members: { roster: [], subs: [], staff: [] },
    ...over,
  };
}

/** Lignes du CSV, BOM retiré, sans la ligne vide finale. */
function csvLines(csv: string): string[] {
  return csv.slice(CSV_BOM.length).split('\r\n').slice(0, -1);
}

describe('csvCell', () => {
  it('laisse une valeur simple intacte', () => {
    expect(csvCell('Alpha#1234')).toBe('Alpha#1234');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quote les cellules qui contiennent ; " ou un saut de ligne', () => {
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('dit "hey"')).toBe('"dit ""hey"""');
    expect(csvCell('ligne1\nligne2')).toBe('"ligne1\nligne2"');
    // La virgule n'est pas le séparateur : pas de guillemets.
    expect(csvCell('capitaine, dps')).toBe('capitaine, dps');
  });

  it('neutralise les formules (=, +, -, @, tab, CR)', () => {
    expect(csvCell('=HYPERLINK("http://evil","clic")')).toBe(
      '"\'=HYPERLINK(""http://evil"",""clic"")"'
    );
    expect(csvCell('+33')).toBe("'+33");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('\tcmd')).toBe("'\tcmd");
    expect(csvCell('\rcmd')).toBe('"\'\rcmd"');
  });
});

describe('resolveExportPseudo', () => {
  it('surcharge d’équipe > compte > BattleTag > Discord', () => {
    expect(
      resolveExportPseudo({
        displayName: 'Surcharge',
        accountDisplayName: 'Compte',
        battleTag: 'Tag#1',
        discordUsername: 'dc',
      })
    ).toBe('Surcharge');
    expect(
      resolveExportPseudo({ accountDisplayName: 'Compte', battleTag: 'Tag#1' })
    ).toBe('Compte');
    expect(
      resolveExportPseudo({ displayName: '  ', battleTag: 'Noémie#1234' })
    ).toBe('Noémie');
    expect(resolveExportPseudo({ discordUsername: 'coachy' })).toBe('coachy');
    expect(resolveExportPseudo({})).toBeNull();
  });
});

describe('buildExportTeam', () => {
  it('répartit roster / remplaçantes / encadrement et marque la capitaine', () => {
    const team = buildExportTeam(
      {
        id: 't1',
        name: 'Éclypse',
        short_name: 'ECL',
        logo_url: null,
        captain_id: 'u1',
      },
      [
        member({ user_id: 'u1', battle_tag: 'Zed#1', specialty: 'dps' }),
        member({ user_id: 'u2', battle_tag: 'Ava#2', specialty: 'tank' }),
        member({ user_id: 'u3', is_substitute: true, battle_tag: 'Sub#3' }),
        member({ user_id: 'u4', role: 'coach' }),
      ],
      {
        ...noLookups,
        discordByUser: new Map([['u4', 'coachy']]),
      }
    );

    // Membres triés par pseudo : Ava avant Zed.
    expect(team.members.roster.map((m) => m.pseudo)).toEqual(['Ava', 'Zed']);
    expect(team.members.roster.find((m) => m.pseudo === 'Zed')?.isCaptain).toBe(
      true
    );
    expect(team.members.roster.find((m) => m.pseudo === 'Ava')?.isCaptain).toBe(
      false
    );
    expect(team.members.subs.map((m) => m.pseudo)).toEqual(['Sub']);
    expect(team.members.staff).toEqual([
      {
        pseudo: 'coachy',
        battleTag: null,
        discord: 'coachy',
        role: 'coach',
        specialty: null,
        isCaptain: false,
      },
    ]);
  });

  it('ne sort ni user_id ni email', () => {
    const team = buildExportTeam(
      {
        id: 't',
        name: 'T',
        short_name: null,
        logo_url: null,
        captain_id: 'u1',
      },
      [member({ user_id: 'u1', battle_tag: 'A#1' })],
      noLookups
    );
    const json = JSON.stringify(team);
    expect(json).not.toContain('u1');
    expect(json).not.toMatch(/user_?id|email/i);
  });
});

describe('sortExportTeams', () => {
  it('trie à la française (accents ignorés)', () => {
    const sorted = sortExportTeams([
      emptyTeam('Zénith'),
      emptyTeam('Éclypse'),
      emptyTeam('aurora'),
      emptyTeam('Delta'),
    ]);
    // Un tri binaire rangerait « Éclypse » après « Zénith ».
    expect(sorted.map((t) => t.name)).toEqual([
      'aurora',
      'Delta',
      'Éclypse',
      'Zénith',
    ]);
  });
});

describe('exportMemberRoleLabel', () => {
  const base = {
    pseudo: 'x',
    battleTag: null,
    discord: null,
    role: 'player',
    specialty: 'dps',
    isCaptain: false,
  };
  it('capitaine + spécialité pour le roster', () => {
    expect(exportMemberRoleLabel({ ...base, isCaptain: true }, 'roster')).toBe(
      'capitaine, dps'
    );
    expect(exportMemberRoleLabel(base, 'sub')).toBe('dps');
  });
  it('rôle d’encadrement pour le staff', () => {
    expect(
      exportMemberRoleLabel(
        { ...base, role: 'coach', specialty: null },
        'staff'
      )
    ).toBe('coach');
  });
  it('vide sans capitanat ni spécialité', () => {
    expect(exportMemberRoleLabel({ ...base, specialty: null }, 'roster')).toBe(
      ''
    );
  });
});

describe('buildTeamsCsv', () => {
  it('commence par le BOM, utilise ; et CRLF', () => {
    const csv = buildTeamsCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toBe(`${CSV_BOM}${TEAM_EXPORT_CSV_COLUMNS.join(';')}\r\n`);
    expect(csvLines(csv)[0]).toBe(
      'equipe;tag;statut_inscription;categorie;role;pseudo;battletag;discord'
    );
  });

  it('garde une ligne pour une équipe sans membre', () => {
    const lines = csvLines(
      buildTeamsCsv([emptyTeam('Vide', { shortName: 'VID' })])
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('Vide;VID;;;;;;');
  });

  it('une ligne par membre, roster puis subs puis staff', () => {
    const team = buildExportTeam(
      {
        id: 't1',
        name: 'Éclypse',
        short_name: 'ECL',
        logo_url: null,
        captain_id: 'u1',
      },
      [
        member({ user_id: 'u4', role: 'manager', display_name: 'Mana' }),
        member({ user_id: 'u3', is_substitute: true, battle_tag: 'Sub#3' }),
        member({
          user_id: 'u1',
          battle_tag: 'Alpha#1234',
          specialty: 'dps',
        }),
      ],
      {
        registrationStatus: 'confirmed',
        accountNames: new Map(),
        discordByUser: new Map([['u1', 'alpha_dc']]),
      }
    );
    const lines = csvLines(buildTeamsCsv([team]));
    expect(lines.slice(1)).toEqual([
      'Éclypse;ECL;confirmed;roster;capitaine, dps;Alpha;Alpha#1234;alpha_dc',
      'Éclypse;ECL;confirmed;sub;;Sub;Sub#3;',
      'Éclypse;ECL;confirmed;staff;manager;Mana;;',
    ]);
  });

  it('neutralise un nom d’équipe piégé', () => {
    const lines = csvLines(
      buildTeamsCsv([emptyTeam('=HYPERLINK("http://x")')])
    );
    expect(lines[1].startsWith('"\'=HYPERLINK(""http://x"")"')).toBe(true);
  });
});

describe('noms de fichier', () => {
  const date = new Date('2026-09-11T10:00:00.000Z');

  it('slug ASCII sûr', () => {
    expect(asciiSlug('Coupe d’été 2026 !')).toBe('coupe-d-ete-2026');
    expect(asciiSlug('"../../etc"')).toBe('etc');
    expect(asciiSlug(null)).toBe('');
  });

  it('toutes / tournoi / équipe', () => {
    expect(teamsExportFilename({ date })).toBe('equipes-toutes-2026-09-11.csv');
    expect(
      teamsExportFilename({ date, tournamentName: 'Coupe d’été 2026' })
    ).toBe('equipes-coupe-d-ete-2026-2026-09-11.csv');
    expect(
      teamsExportFilename({ date, single: true, teamName: 'Éclypse' })
    ).toBe('equipe-eclypse-2026-09-11.csv');
    expect(teamsExportFilename({ date, single: true, teamName: '???' })).toBe(
      'equipe-sans-nom-2026-09-11.csv'
    );
  });

  it('date dans le fuseau de Paris', () => {
    // 23h30 UTC le 11 = 01h30 le 12 à Paris (heure d'été).
    expect(
      teamsExportFilename({ date: new Date('2026-09-11T23:30:00.000Z') })
    ).toBe('equipes-toutes-2026-09-12.csv');
  });
});
