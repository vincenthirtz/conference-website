// L'inscription en un clic à un événement regroupé : ce que le clic
// enverrait (`features/player/dashboard/eventSignupDraft.ts`), partagé par
// l'encart de l'espace joueuse et le hall de la Library (lot 16).
import { describe, expect, it } from 'vitest';
import {
  eventSignupBody,
  eventSignupDraft,
} from '@/features/player/dashboard/eventSignupDraft';

const VAL = { id: 't-val', name: 'Les Valkyries' };
const ORA = { id: 't-ora', name: 'Les Oracles' };
const META = { display_name: '  Soleil ', battle_tag: 'Soleil#1234' };

describe('eventSignupDraft', () => {
  it('une équipe : elle est envoyée, un clic suffit', () => {
    const d = eventSignupDraft(META, [VAL], null);
    expect(d).toEqual({
      pseudo: 'Soleil',
      tag: 'Soleil#1234',
      team: VAL,
      teamAmbiguous: false,
      oneClick: true,
    });
    expect(eventSignupBody(d)).toEqual({
      displayName: 'Soleil',
      battleTag: 'Soleil#1234',
      originTeamId: 't-val',
    });
  });

  it('plusieurs équipes : l’équipe active, sinon le choix revient à la page', () => {
    expect(eventSignupDraft(META, [VAL, ORA], 't-ora').team).toEqual(ORA);
    const d = eventSignupDraft(META, [VAL, ORA], null);
    expect(d.team).toBeNull();
    expect(d.teamAmbiguous).toBe(true);
    expect(d.oneClick).toBe(false);
    expect(eventSignupBody(d)).toBeNull();
    // Une équipe active hors de la liste ne compte pas.
    expect(eventSignupDraft(META, [VAL, ORA], 't-autre').oneClick).toBe(false);
  });

  it('aucune équipe : seule, le staff la placera', () => {
    const d = eventSignupDraft(META, [], null);
    expect(d.team).toBeNull();
    expect(d.teamAmbiguous).toBe(false);
    expect(eventSignupBody(d)).toEqual({
      displayName: 'Soleil',
      battleTag: 'Soleil#1234',
      originTeamId: null,
    });
  });

  it('BattleTag invalide ou pseudo trop court : pas de clic seul', () => {
    expect(
      eventSignupDraft({ ...META, battle_tag: 'pas un tag' }, [VAL], null)
    ).toMatchObject({ tag: '', oneClick: false });
    expect(
      eventSignupDraft({ ...META, display_name: 'S' }, [VAL], null).oneClick
    ).toBe(false);
    expect(eventSignupDraft(null, [VAL], null)).toMatchObject({
      pseudo: '',
      tag: '',
      oneClick: false,
    });
    expect(
      eventSignupDraft({ display_name: 42, battle_tag: {} }, [], null).oneClick
    ).toBe(false);
  });
});
