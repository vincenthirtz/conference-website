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
  countDiscordLeftGuild,
  discordReadinessSummary,
} from '../../utils/teams/rosterReadiness';

const linked = { discord_linked: true, discord_in_guild: true };
const unlinked = { discord_linked: false, discord_in_guild: null };
const unknown = { discord_linked: null, discord_in_guild: null };
/** Compte lié, mais le bot ne la trouve plus sur le serveur. */
const left = { discord_linked: true, discord_in_guild: false };
/** Liée, présence jamais rapportée par le bot. */
const linkedUnchecked = { discord_linked: true, discord_in_guild: null };

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
    ).toEqual({ unlinked: 2, left: 0, known: 4 });
  });

  it('roster entièrement en règle : rien à signaler, mais on le sait', () => {
    expect(discordReadinessSummary([linked, linked])).toEqual({
      unlinked: 0,
      left: 0,
      known: 2,
    });
  });

  it('roster vide', () => {
    expect(discordReadinessSummary([])).toEqual({
      unlinked: 0,
      left: 0,
      known: 0,
    });
  });

  it('les deux manques sont DISJOINTS : personne n’est compté deux fois', () => {
    // `left` exige `discord_linked === true`, donc un non-lié ne peut pas y
    // tomber. La somme est le nombre de personnes non validables.
    const summary = discordReadinessSummary([unlinked, left, left, linked]);
    expect(summary).toEqual({ unlinked: 1, left: 2, known: 4 });
    expect(summary.unlinked + summary.left).toBe(3);
  });
});

describe('countDiscordLeftGuild', () => {
  it('compte les comptes liés dont le bot dit qu’ils ne sont plus là', () => {
    expect(countDiscordLeftGuild([left, left, linked, unlinked])).toBe(2);
  });

  it('un compte lié JAMAIS vérifié n’est pas « parti »', () => {
    // Tant que le bot n'a rien rapporté, `discord_in_guild` vaut null. Le
    // compter comme un départ accuserait quelqu'un sur la foi d'un silence —
    // et enverrait le capitaine réinviter une personne jamais partie.
    expect(countDiscordLeftGuild([linkedUnchecked, linkedUnchecked])).toBe(0);
  });

  it('un compte NON lié n’est pas « parti » non plus — c’est l’autre manque', () => {
    expect(countDiscordLeftGuild([unlinked, unlinked])).toBe(0);
  });
});
