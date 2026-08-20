// Lecture de l'état « Discord lié » d'un roster.
//
// Ce qui est en jeu : `discord_linked` est TRI-état — lié, non lié, ou non
// communiqué (`null`, quand l'appelant ne gère pas l'équipe). Traiter `null`
// comme `false` afficherait à une joueuse ordinaire que personne n'a lié son
// Discord : un faux constat, sur une donnée qu'elle n'est pas censée lire.
//
// Cible : utils/teams/rosterReadiness.ts

import { describe, it, expect } from 'vitest';

import {
  hasDiscordLinkInfo,
  countDiscordUnlinked,
  discordReadinessSummary,
} from '../../utils/teams/rosterReadiness';

const linked = { discord_linked: true };
const unlinked = { discord_linked: false };
const unknown = { discord_linked: null };

describe('hasDiscordLinkInfo', () => {
  it('faux sur un roster vide', () => {
    expect(hasDiscordLinkInfo([])).toBe(false);
  });

  it('faux quand toutes les lignes sont non communiquées', () => {
    expect(hasDiscordLinkInfo([unknown, unknown, {}])).toBe(false);
  });

  it('vrai dès UNE ligne connue, même si elle est liée', () => {
    expect(hasDiscordLinkInfo([unknown, linked])).toBe(true);
  });
});

describe('countDiscordUnlinked', () => {
  it('ne compte que les manques CONSTATÉS', () => {
    expect(countDiscordUnlinked([unlinked, unlinked, linked, unknown])).toBe(2);
  });

  it('un état non communiqué n’est pas un manque', () => {
    expect(countDiscordUnlinked([unknown, unknown, {}])).toBe(0);
  });

  it('un champ absent se lit comme non communiqué, pas comme non lié', () => {
    // Le cas d'un consommateur typé plus largement (TeamMemberLite) qui ne
    // porte pas la colonne du tout.
    expect(countDiscordUnlinked([{}, {}])).toBe(0);
  });
});

describe('discordReadinessSummary', () => {
  it('rend « manquants sur connus », pas « manquants sur roster »', () => {
    // 5 membres, 4 états connus dont 2 manquants → « 2 sur 4 ». Compter sur 5
    // laisserait croire qu'on a vérifié une ligne qu'on n'a pas lue.
    expect(
      discordReadinessSummary([unlinked, unlinked, linked, linked, unknown])
    ).toEqual({ unlinked: 2, known: 4 });
  });

  it('roster entièrement en règle : rien à signaler, mais on le sait', () => {
    expect(discordReadinessSummary([linked, linked])).toEqual({
      unlinked: 0,
      known: 2,
    });
  });

  it('roster vide', () => {
    expect(discordReadinessSummary([])).toEqual({ unlinked: 0, known: 0 });
  });
});
