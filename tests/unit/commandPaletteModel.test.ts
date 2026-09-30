import { describe, it, expect } from 'vitest';
import {
  buildSections,
  flattenAdminPages,
  matchScore,
  normalize,
  parseQuery,
  wantsServerSearch,
  type PaletteRow,
} from '../../components/admin/commandPaletteModel';
import {
  ADMIN_LINKS,
  filterAdminLinks,
} from '../../components/Navbar/adminLinks';
import type { AdminLink } from '../../types/components';

const row = (
  kind: PaletteRow['kind'],
  title: string,
  subtitle: string | null = null
): PaletteRow => ({
  kind,
  id: `${kind}:${title}`,
  title,
  subtitle,
  href: `/admin/${normalize(title).replace(/ /g, '-')}`,
});

describe('normalize / matchScore', () => {
  it('ignore accents, casse et espaces', () => {
    expect(normalize('  Équipes   Libres ')).toBe('equipes libres');
    expect(matchScore('equipe', 'Équipes')).toBeGreaterThan(0);
  });

  it('exige tous les mots, dans n’importe quel ordre', () => {
    expect(matchScore('libres joueuses', 'Joueuses libres')).toBeGreaterThan(0);
    expect(matchScore('joueuses bannies', 'Joueuses libres')).toBe(0);
  });

  it('début du texte > début de mot > simple inclusion', () => {
    const start = matchScore('tour', 'Tournois');
    const word = matchScore('tour', 'Mes tournois');
    const inside = matchScore('our', 'Tournois');
    expect(start).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(inside);
    expect(inside).toBeGreaterThan(0);
  });
});

describe('parseQuery / wantsServerSearch', () => {
  it('le préfixe > passe en mode commandes, sans serveur', () => {
    expect(parseQuery('> scrims')).toEqual({
      commandsOnly: true,
      text: 'scrims',
    });
    expect(wantsServerSearch('> scrims')).toBe(false);
  });

  it('le serveur attend 2 caractères', () => {
    expect(wantsServerSearch('a')).toBe(false);
    expect(wantsServerSearch('ab')).toBe(true);
  });
});

describe('flattenAdminPages', () => {
  const tree: AdminLink[] = [
    {
      title: 'Compétition',
      ref: '',
      children: [
        { title: 'Tournois', ref: '/admin/tournaments' },
        { title: 'Doublon', ref: '/admin/tournaments' },
        { title: 'Externe', ref: 'https://example.org' },
      ],
    },
    { title: 'Tableau de bord', ref: '/admin' },
  ];

  it('met à plat les pages /admin, chemin en sous-titre, sans doublon', () => {
    const pages = flattenAdminPages(tree);
    expect(pages.map((p) => p.href)).toEqual(['/admin/tournaments', '/admin']);
    expect(pages[0].subtitle).toBe('Compétition');
    expect(pages[0].kind).toBe('page');
  });

  it('ne propose que ce que le menu montre à ce rôle', () => {
    const casterPages = flattenAdminPages(
      filterAdminLinks('caster', ADMIN_LINKS)
    );
    const ownerPages = flattenAdminPages(
      filterAdminLinks('owner', ADMIN_LINKS)
    );
    expect(ownerPages.length).toBeGreaterThan(casterPages.length);
    const ownerHrefs = new Set(ownerPages.map((p) => p.href));
    for (const p of casterPages) expect(ownerHrefs.has(p.href)).toBe(true);
  });
});

describe('buildSections', () => {
  const actions = [
    row('create', 'Créer un tournoi'),
    row('task', 'Ouvrir le tableau de tâches'),
  ];
  const pages = [
    row('page', 'Tournois', 'Compétition'),
    row('page', 'Scrims', 'Compétition'),
  ];
  const hits = [row('team', 'Tournesol Esport')];
  const recent = [row('recent', 'Équipe X')];
  const keys = (q: string) =>
    buildSections({ query: q, actions, pages, hits, recent }).map((s) => s.key);

  it('champ vide : récents puis actions', () => {
    expect(keys('')).toEqual(['recent', 'actions']);
  });

  it('saisie : actions et pages filtrées sur place, puis résultats serveur', () => {
    const sections = buildSections({
      query: 'tourn',
      actions,
      pages,
      hits,
      recent,
    });
    expect(sections.map((s) => s.key)).toEqual(['actions', 'pages', 'results']);
    expect(sections[0].rows.map((r) => r.title)).toEqual(['Créer un tournoi']);
    expect(sections[1].rows.map((r) => r.title)).toEqual(['Tournois']);
  });

  it('une lettre : pages et actions, pas encore le serveur', () => {
    expect(keys('s')).not.toContain('results');
    expect(keys('s')).toContain('pages');
  });

  it('> seul : actions puis tout le menu ; > texte : jamais le serveur', () => {
    expect(keys('>')).toEqual(['actions', 'pages']);
    expect(keys('> scrims')).toEqual(['pages']);
  });
});
