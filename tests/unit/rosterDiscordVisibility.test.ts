// Qui a le droit de savoir si un COÉQUIPIER a lié son compte Discord.
//
// La tranche équipe (`loadManagedTeamSlice`) alimente à la fois l'écran
// « Gérer mon équipe » et le dashboard, et le MÊME payload part donc à une
// capitaine et à une joueuse ordinaire. Le champ `discord_linked` est une
// information sur le compte d'AUTRUI : on ne la renseigne que pour qui gère
// l'équipe, et on laisse `null` sinon.
//
// `null` n'est pas `false` — c'est tout l'objet du tri-état. Un test qui
// vérifierait seulement « la joueuse ne voit pas true » passerait alors même
// qu'on lui afficherait « personne n'a lié son Discord », ce qui est à la fois
// faux et indiscret. On vérifie donc AUSSI que la table n'est pas lue.
//
// Cibles : utils/teams/managedTeamSlice.ts, utils/teams/rosterReadiness.ts

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  fromCalls,
  resetSupabaseMock,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import { loadManagedTeamSlice } from '../../utils/teams/managedTeamSlice';
import {
  discordReadinessSummary,
  hasDiscordLinkInfo,
} from '../../utils/teams/rosterReadiness';

const TEAM = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CAPTAIN = 'c0000000-0000-4000-8000-000000000001';
const LINKED = 'c0000000-0000-4000-8000-000000000002';
const UNLINKED_A = 'c0000000-0000-4000-8000-000000000003';
const UNLINKED_B = 'c0000000-0000-4000-8000-000000000004';

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  store.teams = [
    {
      id: TEAM,
      slug: 'alpha',
      name: 'Alpha',
      short_name: null,
      logo_url: null,
      country: null,
      description: null,
      captain_id: CAPTAIN,
      is_active: true,
      is_joinable: false,
      open_for_scrim: false,
    },
  ] as any;
  store.team_members = [
    { id: 'm1', team_id: TEAM, user_id: CAPTAIN, role: 'player' },
    { id: 'm2', team_id: TEAM, user_id: LINKED, role: 'player' },
    { id: 'm3', team_id: TEAM, user_id: UNLINKED_A, role: 'player' },
    // L'encadrement compte comme le reste : un coach absent du serveur est
    // aussi invalidable qu'une joueuse.
    { id: 'm4', team_id: TEAM, user_id: UNLINKED_B, role: 'coach' },
  ] as any;
  store.user_discord_links = [
    { auth_user_id: CAPTAIN, discord_user_id: '111' },
    { auth_user_id: LINKED, discord_user_id: '222' },
  ] as any;
});

describe('pour qui GÈRE l’équipe', () => {
  it('renseigne l’état de liaison de chaque membre', async () => {
    const slice = await loadManagedTeamSlice(CAPTAIN, DEFAULT_TENANT_ID);
    expect(slice.isCaptain).toBe(true);

    const byUser = Object.fromEntries(
      slice.members.map((m) => [m.user_id, m.discord_linked])
    );
    expect(byUser[CAPTAIN]).toBe(true);
    expect(byUser[LINKED]).toBe(true);
    expect(byUser[UNLINKED_A]).toBe(false);
    expect(byUser[UNLINKED_B]).toBe(false);
  });

  it('donne le constat « 2 sur 4 » que lit l’écran', async () => {
    const slice = await loadManagedTeamSlice(CAPTAIN, DEFAULT_TENANT_ID);
    expect(hasDiscordLinkInfo(slice.members)).toBe(true);
    expect(discordReadinessSummary(slice.members)).toEqual({
      unlinked: 2,
      known: 4,
    });
  });
});

describe('pour une joueuse ordinaire', () => {
  it('laisse `null` partout — jamais `false`', async () => {
    const slice = await loadManagedTeamSlice(UNLINKED_A, DEFAULT_TENANT_ID);
    // Elle voit bien son équipe et son roster…
    expect(slice.teamId).toBe(TEAM);
    expect(slice.members).toHaveLength(4);
    expect(slice.isCaptain).toBe(false);
    expect(slice.isManager).toBe(false);
    // …mais aucun état de liaison, y compris le sien.
    expect(slice.members.every((m) => m.discord_linked === null)).toBe(true);
  });

  it('ne lit même pas la table des liaisons', async () => {
    fromCalls.length = 0;
    await loadManagedTeamSlice(UNLINKED_A, DEFAULT_TENANT_ID);
    expect(fromCalls).not.toContain('user_discord_links');
  });

  it('l’écran n’affiche alors AUCUN constat', async () => {
    const slice = await loadManagedTeamSlice(UNLINKED_A, DEFAULT_TENANT_ID);
    // C'est la garde qui empêche « 0 membre sur 0 n'a pas lié son Discord ».
    expect(hasDiscordLinkInfo(slice.members)).toBe(false);
    expect(discordReadinessSummary(slice.members)).toEqual({
      unlinked: 0,
      known: 0,
    });
  });
});
