// utils/teams/teamExportClient — moitié client de l'export des équipes.
//
// Ce qui mérite d'être tenu : les boutons de la liste exportent les filtres
// AFFICHÉS (pas une URL qui en perd un), la page imprimable relit exactement ce
// que le bouton a écrit, et le fichier téléchargé porte le nom annoncé par la
// route — accents compris — sans jamais pouvoir s'échapper du dossier.

import { describe, it, expect } from 'vitest';
import {
  buildTeamExportApiUrl,
  buildTeamPrintPageUrl,
  fallbackTeamExportFilename,
  filenameFromContentDisposition,
  isAutoprintRequested,
  normalizeTeamExportPayload,
  parseTeamExportTarget,
  teamExportParams,
} from '../../utils/teams/teamExportClient';

function query(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url, 'http://x').searchParams);
}

describe('buildTeamExportApiUrl', () => {
  it('porte les filtres courants de la liste', () => {
    const url = buildTeamExportApiUrl(
      {
        filters: {
          search: ' Fnatic ',
          isActive: 'true',
          tournamentId: 'tour-1',
        },
      },
      'csv'
    );
    expect(url.startsWith('/api/admin/teams/export?')).toBe(true);
    expect(query(url)).toEqual({
      search: 'Fnatic',
      isActive: 'true',
      tournamentId: 'tour-1',
      format: 'csv',
    });
  });

  it('omet les filtres vides plutôt que de les envoyer vides', () => {
    const url = buildTeamExportApiUrl(
      { filters: { search: '', isActive: null, tournamentId: '  ' } },
      'json'
    );
    expect(query(url)).toEqual({ format: 'json' });
  });

  it('ignore un isActive qui n’est ni true ni false', () => {
    const url = buildTeamExportApiUrl(
      { filters: { isActive: 'maybe' } },
      'csv'
    );
    expect(query(url)).not.toHaveProperty('isActive');
  });

  it('une équipe : teamId seul, sans les filtres', () => {
    const url = buildTeamExportApiUrl({ teamId: 'abc-123' }, 'json');
    expect(query(url)).toEqual({ teamId: 'abc-123', format: 'json' });
  });

  it('encode les caractères spéciaux de la recherche', () => {
    const url = buildTeamExportApiUrl({ filters: { search: 'A&B #1' } }, 'csv');
    expect(url).toContain('search=A%26B+%231');
    expect(query(url).search).toBe('A&B #1');
  });
});

describe('page imprimable', () => {
  it('le bouton pose autoprint, et la page relit la même cible', () => {
    const target = {
      filters: { search: 'x', isActive: 'false', tournamentId: 't' },
    };
    const url = buildTeamPrintPageUrl(target, { autoprint: true });
    expect(url.startsWith('/admin/teams/print?')).toBe(true);
    const q = query(url);
    expect(isAutoprintRequested(q)).toBe(true);
    expect(parseTeamExportTarget(q)).toEqual(target);
  });

  it('sans filtre ni autoprint : l’URL nue', () => {
    expect(buildTeamPrintPageUrl({ filters: {} })).toBe('/admin/teams/print');
  });

  it('teamId l’emporte sur les filtres', () => {
    expect(parseTeamExportTarget({ teamId: 'abc', search: 'ignored' })).toEqual(
      { teamId: 'abc' }
    );
  });

  it('tolère les valeurs de query en tableau (Next répète les clés)', () => {
    expect(
      parseTeamExportTarget({ search: ['a', 'b'], isActive: 'nope' })
    ).toEqual({
      filters: { search: 'a', isActive: null, tournamentId: null },
    });
    expect(isAutoprintRequested({ autoprint: ['1'] })).toBe(true);
    expect(isAutoprintRequested({ autoprint: 'true' })).toBe(false);
    expect(isAutoprintRequested({})).toBe(false);
  });

  it('teamExportParams sert aussi au lien de retour vers la liste', () => {
    expect(
      teamExportParams({ filters: { tournamentId: 't1' } }).toString()
    ).toBe('tournamentId=t1');
  });
});

describe('filenameFromContentDisposition', () => {
  it('lit filename entre guillemets', () => {
    expect(
      filenameFromContentDisposition(
        'attachment; filename="equipes-2026-09-11.csv"'
      )
    ).toBe('equipes-2026-09-11.csv');
  });

  it('lit filename sans guillemets', () => {
    expect(
      filenameFromContentDisposition('attachment; filename=equipes.csv')
    ).toBe('equipes.csv');
  });

  it('préfère filename* (UTF-8) — c’est lui qui porte les accents', () => {
    expect(
      filenameFromContentDisposition(
        'attachment; filename="equipes-coupe.csv"; filename*=UTF-8\'\'%C3%A9quipes-coupe-f%C3%A9minine.csv'
      )
    ).toBe('équipes-coupe-féminine.csv');
  });

  it('retombe sur filename si filename* est mal encodé', () => {
    expect(
      filenameFromContentDisposition(
        'attachment; filename*=UTF-8\'\'%E0%A4%A; filename="repli.csv"'
      )
    ).toBe('repli.csv');
  });

  it('neutralise les séparateurs de chemin et les noms cachés', () => {
    expect(
      filenameFromContentDisposition('attachment; filename="../../etc/x.csv"')
    ).toBe('_.._etc_x.csv');
    // Entre guillemets, `\` est un caractère d'échappement (RFC 2616
    // quoted-string) : `..\a.csv` se lit `..a.csv`, puis perd ses points.
    expect(
      filenameFromContentDisposition('attachment; filename="..\\a.csv"')
    ).toBe('a.csv');
    // Sans guillemets, l'antislash est un séparateur Windows : neutralisé.
    expect(
      filenameFromContentDisposition('attachment; filename=..\\a.csv')
    ).toBe('_a.csv');
  });

  it('null quand l’en-tête est absent ou sans nom', () => {
    expect(filenameFromContentDisposition(null)).toBeNull();
    expect(filenameFromContentDisposition('')).toBeNull();
    expect(filenameFromContentDisposition('attachment')).toBeNull();
    expect(
      filenameFromContentDisposition('attachment; filename=""')
    ).toBeNull();
  });
});

describe('fallbackTeamExportFilename', () => {
  const now = new Date('2026-09-11T10:00:00Z');

  it('liste : equipes-<date>.csv', () => {
    expect(fallbackTeamExportFilename({ filters: {} }, now)).toBe(
      'equipes-2026-09-11.csv'
    );
  });

  it('une équipe : préfixe de son id', () => {
    expect(
      fallbackTeamExportFilename(
        { teamId: '0f3c9a12-aaaa-bbbb-cccc-000000000000' },
        now
      )
    ).toBe('equipe-0f3c9a12-2026-09-11.csv');
  });
});

describe('normalizeTeamExportPayload', () => {
  it('garde un payload conforme tel quel', () => {
    const payload = {
      generatedAt: '2026-09-11T10:00:00Z',
      tournament: { id: 't', name: 'Coupe' },
      truncated: true,
      teams: [
        {
          id: 'a',
          name: 'Alpha',
          shortName: 'ALP',
          logoUrl: null,
          registrationStatus: 'registered',
          members: { roster: [], subs: [], staff: [] },
        },
      ],
    };
    expect(normalizeTeamExportPayload(payload)).toEqual(payload);
  });

  it('comble un payload partiel au lieu de planter la page', () => {
    const out = normalizeTeamExportPayload({
      teams: [{ id: 'a', name: 'Alpha', members: { roster: null } }, null],
      tournament: { id: 'x' },
    });
    expect(out.generatedAt).toBe('');
    expect(out.tournament).toBeNull();
    expect(out.truncated).toBe(false);
    expect(out.teams).toHaveLength(1);
    expect(out.teams[0].members).toEqual({ roster: [], subs: [], staff: [] });
  });

  it('un non-objet donne un export vide', () => {
    expect(normalizeTeamExportPayload('oops').teams).toEqual([]);
    expect(normalizeTeamExportPayload(null).teams).toEqual([]);
  });
});
