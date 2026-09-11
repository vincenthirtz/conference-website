// La feuille de l'export PDF des équipes (TeamExportSheet).
//
// Ce qui mérite d'être tenu : les trois blocs roster / remplaçantes / staff,
// la marque capitaine en TEXTE (la couleur disparaît à l'impression N&B), le
// statut d'inscription seulement quand l'export porte sur un tournoi, et la
// classe qui empêche de couper une équipe entre deux pages.
//
// Rendu SSR via react-dom/server (pas de jsdom dans ce repo).

import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import TeamExportSheet, {
  formatGeneratedAt,
} from '@/components/admin/teams/TeamExportSheet';
import type {
  ExportMember,
  TeamExportPayload,
  TeamExportTarget,
} from '@/utils/teams/teamExportClient';

function member(over: Partial<ExportMember> = {}): ExportMember {
  return {
    pseudo: 'Mira',
    battleTag: 'Mira#1234',
    discord: 'mira',
    role: 'player',
    specialty: 'support',
    isCaptain: false,
    ...over,
  };
}

function payload(over: Partial<TeamExportPayload> = {}): TeamExportPayload {
  return {
    generatedAt: '2026-09-11T10:00:00Z',
    tournament: null,
    truncated: false,
    teams: [
      {
        id: 'a',
        name: 'Alpha Wolves',
        shortName: 'ALW',
        logoUrl: 'https://cdn.example/alpha.png',
        registrationStatus: 'registered',
        members: {
          roster: [
            member({ pseudo: 'Capi', isCaptain: true, specialty: 'tank' }),
            member(),
          ],
          subs: [member({ pseudo: 'Remy', specialty: null })],
          staff: [
            member({
              pseudo: 'Coach K',
              battleTag: null,
              role: 'coach',
              specialty: null,
            }),
          ],
        },
      },
      {
        id: 'b',
        name: 'Beta',
        shortName: null,
        logoUrl: null,
        registrationStatus: null,
        members: { roster: [], subs: [], staff: [] },
      },
    ],
    ...over,
  };
}

function render(p: TeamExportPayload, target: TeamExportTarget): string {
  return renderToString(createElement(TeamExportSheet, { payload: p, target }));
}

describe('TeamExportSheet', () => {
  it('titre « Toutes les équipes » sans tournoi, et le compte', () => {
    const html = render(payload(), { filters: {} });
    expect(html).toContain('Toutes les équipes');
    expect(html).toContain('2 équipes');
  });

  it('titre du tournoi, et statut d’inscription seulement dans ce cas', () => {
    const withTournament = render(
      payload({ tournament: { id: 't', name: 'Coupe d’hiver' } }),
      { filters: { tournamentId: 't' } }
    );
    expect(withTournament).toContain('Équipes — Coupe d’hiver');
    expect(withTournament).toContain('Inscription : inscrite');

    const withoutTournament = render(payload(), { filters: {} });
    expect(withoutTournament).not.toContain('Inscription');
  });

  it('une équipe : son nom en titre', () => {
    const p = payload();
    const html = render({ ...p, teams: [p.teams[0]] }, { teamId: 'a' });
    expect(html).toMatch(/<h1[^>]*>Alpha Wolves<\/h1>/);
  });

  it('les trois blocs, avec leur effectif', () => {
    const html = render(payload(), { filters: {} });
    expect(html).toMatch(
      /Roster(?:<!-- -->)? <span[^>]*>\((?:<!-- -->)?2(?:<!-- -->)?\)/
    );
    expect(html).toContain('Remplaçantes');
    expect(html).toContain('Staff');
    // Beta n'a personne : le bloc le dit au lieu d'être vide.
    expect(html).toContain('Aucun membre');
  });

  it('marque la capitaine en texte, une seule fois', () => {
    const html = render(payload(), { filters: {} });
    expect(html.match(/★ <!-- -->Capitaine/g)).toHaveLength(1);
  });

  it('poste pour les joueuses, rôle pour le staff — comme le CSV', () => {
    const html = render(payload(), { filters: {} });
    expect(html).toContain('>Tank</td>');
    expect(html).toContain('>Support</td>');
    expect(html).toContain('>coach</td>');
    // Le rôle technique d'une joueuse n'apprend rien sur papier.
    expect(html).not.toContain('>player');
    expect(html).toContain('Mira#1234');
  });

  it('tirets pour les trous (BattleTag du coach, poste non déclaré)', () => {
    const html = render(payload(), { filters: {} });
    expect(html).toContain('font-mono text-xs break-words">—</td>');
    expect(html).toContain('<td class="py-1 break-words">—</td>');
  });

  it('tag et logo de l’équipe', () => {
    const html = render(payload(), { filters: {} });
    expect(html).toContain('[<!-- -->ALW<!-- -->]');
    expect(html).toContain('src="https://cdn.example/alpha.png"');
  });

  it('une équipe n’est jamais coupée entre deux pages', () => {
    const html = render(payload(), { filters: {} });
    expect(html.match(/team-export-card break-inside-avoid/g)).toHaveLength(2);
  });

  it('résume les filtres de la liste', () => {
    const html = render(payload(), {
      filters: { search: 'wolf', isActive: 'true' },
    });
    expect(html).toContain('Filtres : recherche « wolf », actives');
  });

  it('n’affiche aucune donnée personnelle hors contrat', () => {
    const html = render(payload(), { filters: {} });
    expect(html).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
  });
});

describe('formatGeneratedAt', () => {
  it('formate une date ISO, ignore une date illisible', () => {
    expect(formatGeneratedAt('2026-09-11T10:00:00Z', 'fr-FR')).toMatch(
      /11 septembre 2026/
    );
    expect(formatGeneratedAt('', 'fr-FR')).toBeNull();
    expect(formatGeneratedAt('pas une date', 'fr-FR')).toBeNull();
  });
});
