// Garde-fou de la navigation de l'espace tournoi.
//
// La structure est passée de quatorze onglets de premier niveau (dont huit
// derrière un menu « Plus ») à huit groupes, tous visibles, avec une seconde
// ligne pour les écrans du groupe actif.
//
// Ce que ce test empêche, et qui arriverait sans lui : ajouter un écran sous
// `/admin/tournament/[id]/` sans lui donner de place dans la nav. Il serait
// accessible par URL, invisible dans l'interface, et personne ne s'en
// apercevrait — c'est exactement ce qui a produit les quatorze onglets.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  TOURNAMENT_TAB_GROUPS,
  tournamentTabHref,
} from '../../components/admin/tournament/TournamentTabsNav';
import frNav from '../../lib/i18n/locales/admin-fr/adminTournamentNav';
import enNav from '../../lib/i18n/locales/admin-en/adminTournamentNav';

const PAGES_DIR = path.join(process.cwd(), 'pages/admin/tournament/[id]');

/** Les routes RÉELLES : un fichier de page qui n'est pas un simple shim de redirection. */
function realRoutes(): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(PAGES_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.tsx')) continue;
    const slug = entry.name.replace(/\.tsx$/, '');
    const src = fs.readFileSync(path.join(PAGES_DIR, entry.name), 'utf8');
    // Un shim ne fait que rediriger : il n'a pas de composant à lui.
    const isShim = src.includes('redirect:') && src.split('\n').length < 40;
    if (!isShim) out.push(slug);
  }
  return out.sort();
}

const memberRoutes = TOURNAMENT_TAB_GROUPS.flatMap((g) =>
  g.members.map((m) => m.route)
);

describe('groupes d’onglets du tournoi', () => {
  it('tient en huit groupes — au-delà, on recréerait un menu « Plus »', () => {
    expect(TOURNAMENT_TAB_GROUPS).toHaveLength(8);
  });

  it('n’a ni id ni route en double', () => {
    const ids = TOURNAMENT_TAB_GROUPS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(memberRoutes).size).toBe(memberRoutes.length);
  });

  it('donne une place à CHAQUE écran réel', () => {
    // Le cœur du garde-fou : un écran ajouté sans entrée de nav échoue ici.
    const missing = realRoutes().filter((r) => !memberRoutes.includes(r));
    expect(
      missing,
      `Écrans sans place dans la nav : ${missing.join(', ')}. ` +
        'Ajoute-les à un groupe de TOURNAMENT_TAB_GROUPS.'
    ).toEqual([]);
  });

  it('ne pointe vers aucun écran qui n’existe pas', () => {
    const routes = realRoutes();
    const ghosts = memberRoutes.filter((r) => !routes.includes(r));
    expect(ghosts, `Routes fantômes dans la nav : ${ghosts.join(', ')}`).toEqual(
      []
    );
  });

  it('mène chaque groupe à son premier écran', () => {
    for (const g of TOURNAMENT_TAB_GROUPS) {
      expect(tournamentTabHref('T', g.id)).toBe(
        `/admin/tournament/T/${g.members[0].route}`
      );
    }
  });

  it('retombe sur le tableau de bord pour un groupe inconnu', () => {
    // Défense en profondeur : une valeur `active` obsolète ne doit pas produire
    // un lien cassé, elle doit ramener quelque part de sensé.
    expect(
      tournamentTabHref('T', 'inconnu' as never)
    ).toBe('/admin/tournament/T/dashboard');
  });

  it('a un libellé traduit pour chaque groupe et chaque écran', () => {
    const fr = frNav.fr as Record<string, string>;
    const en = enNav as Record<string, string>;
    for (const g of TOURNAMENT_TAB_GROUPS) {
      expect(fr[g.labelKey], `FR manque ${g.labelKey}`).toBeTruthy();
      expect(en[g.labelKey], `EN manque ${g.labelKey}`).toBeTruthy();
      for (const m of g.members) {
        expect(fr[m.labelKey], `FR manque ${m.labelKey}`).toBeTruthy();
        expect(en[m.labelKey], `EN manque ${m.labelKey}`).toBeTruthy();
      }
    }
  });

  it('ne montre la seconde ligne que là où il y a un choix', () => {
    // Les groupes à un seul écran sont ceux dont la page porte déjà ses propres
    // sous-onglets `?tab=` : une seconde barre y ferait doublon.
    const multi = TOURNAMENT_TAB_GROUPS.filter((g) => g.members.length > 1).map(
      (g) => g.id
    );
    expect(multi.sort()).toEqual(['matches', 'settings', 'tools']);
  });
});
