// Unit tests — mémoire d'équipe (N2), cœur pur.
//
// Deux zones de risque :
//
//   - la VALIDATION du lien de VOD. Le champ est libre, saisi par une joueuse,
//     rendu en `<a href>` et cliqué par toute son équipe : un `javascript:`
//     accepté ici devient un XSS. C'est le seul endroit qui garde cette porte.
//   - la détection de la revue VIDE, qui décide entre écrire et supprimer. Si
//     elle se trompe, l'historique se remplit d'entrées marquées « débriefé »
//     sans contenu, et le seul signal utile de la liste devient faux.

import { describe, it, expect } from 'vitest';

import {
  buildEncounterHistory,
  isReviewSubjectType,
  MAX_NOTES_LENGTH,
  MAX_VOD_LENGTH,
  normalizeReviewContent,
  normalizeVodUrl,
  type EncounterInput,
} from '../../utils/teams/teamReviews';

describe('normalizeVodUrl', () => {
  it('accepte une URL http(s) et la canonise', () => {
    const r = normalizeVodUrl('  https://www.twitch.tv/videos/42  ');
    expect(r).toEqual({ ok: true, url: 'https://www.twitch.tv/videos/42' });
  });

  it('traite le vide comme « pas de VOD », pas comme une erreur', () => {
    expect(normalizeVodUrl('')).toEqual({ ok: true, url: null });
    expect(normalizeVodUrl('   ')).toEqual({ ok: true, url: null });
    expect(normalizeVodUrl(null)).toEqual({ ok: true, url: null });
    expect(normalizeVodUrl(undefined)).toEqual({ ok: true, url: null });
  });

  it('refuse un schéma exécutable', () => {
    // Le cas qui compte : ce lien est rendu cliquable pour toute l'équipe.
    for (const hostile of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
    ]) {
      const r = normalizeVodUrl(hostile);
      expect(r.ok, hostile).toBe(false);
    }
  });

  it('refuse ce qui n’est pas une URL complète', () => {
    expect(normalizeVodUrl('twitch.tv/videos/42').ok).toBe(false);
    expect(normalizeVodUrl('/videos/42').ok).toBe(false);
  });

  it('refuse au-delà de la longueur autorisée', () => {
    const long = `https://x.tv/${'a'.repeat(MAX_VOD_LENGTH)}`;
    expect(normalizeVodUrl(long).ok).toBe(false);
  });

  it('refuse un type non textuel', () => {
    expect(normalizeVodUrl(42).ok).toBe(false);
    expect(normalizeVodUrl({}).ok).toBe(false);
  });
});

describe('normalizeReviewContent', () => {
  it('signale une revue vide plutôt que de la fabriquer', () => {
    const r = normalizeReviewContent({ vodUrl: '', notes: '   ' });
    expect(r).toEqual({
      ok: true,
      content: { vodUrl: null, notes: null, objectives: null },
      isEmpty: true,
    });
  });

  // Depuis le lot J5, des OBJECTIFS seuls suffisent à faire exister la revue :
  // ils sont posés avant le match, quand notes et VOD ne peuvent pas exister.
  it('n’est pas vide avec des objectifs seuls', () => {
    const r = normalizeReviewContent({ objectives: 'Tenir le point B' });
    expect(r.ok && r.isEmpty).toBe(false);
    expect(r.ok && r.content.objectives).toBe('Tenir le point B');
  });

  it('n’est pas vide dès qu’un seul des deux champs est rempli', () => {
    const onlyNotes = normalizeReviewContent({ notes: 'On a perdu le point.' });
    const onlyVod = normalizeReviewContent({ vodUrl: 'https://x.tv/1' });
    expect(onlyNotes.ok && onlyNotes.isEmpty).toBe(false);
    expect(onlyVod.ok && onlyVod.isEmpty).toBe(false);
  });

  it('coupe les espaces des notes sans toucher au contenu', () => {
    const r = normalizeReviewContent({ notes: '  deux lignes\n\nici  ' });
    expect(r.ok && r.content.notes).toBe('deux lignes\n\nici');
  });

  it('refuse des notes trop longues', () => {
    const r = normalizeReviewContent({
      notes: 'a'.repeat(MAX_NOTES_LENGTH + 1),
    });
    expect(r.ok).toBe(false);
  });

  it('propage l’erreur de VOD', () => {
    const r = normalizeReviewContent({
      vodUrl: 'javascript:alert(1)',
      notes: 'ok',
    });
    expect(r.ok).toBe(false);
  });
});

describe('isReviewSubjectType', () => {
  it('n’accepte que match et scrim', () => {
    expect(isReviewSubjectType('match')).toBe(true);
    expect(isReviewSubjectType('scrim')).toBe(true);
    expect(isReviewSubjectType('tournament')).toBe(false);
    expect(isReviewSubjectType(null)).toBe(false);
  });
});

describe('buildEncounterHistory', () => {
  const encounter = (
    over: Partial<EncounterInput> & Pick<EncounterInput, 'subjectId'>
  ): EncounterInput => ({
    subjectType: 'match',
    playedAt: null,
    opponentTeamId: null,
    opponentName: null,
    myScore: null,
    opponentScore: null,
    result: null,
    label: null,
    ...over,
  });

  it('mêle matchs et scrims dans un seul ordre chronologique décroissant', () => {
    // Une équipe se souvient d'« un affrontement », pas d'« un match » ou
    // d'« un scrim » : deux listes séparées trahiraient le geste.
    const history = buildEncounterHistory(
      [
        encounter({ subjectId: 'm1', playedAt: '2026-07-01T20:00:00.000Z' }),
        encounter({
          subjectId: 's1',
          subjectType: 'scrim',
          playedAt: '2026-07-15T20:00:00.000Z',
        }),
        encounter({ subjectId: 'm2', playedAt: '2026-07-10T20:00:00.000Z' }),
      ],
      []
    );
    expect(history.map((e) => e.subjectId)).toEqual(['s1', 'm2', 'm1']);
  });

  it('relègue les affrontements sans date sans les exclure', () => {
    const history = buildEncounterHistory(
      [
        encounter({ subjectId: 'undated' }),
        encounter({ subjectId: 'dated', playedAt: '2026-07-01T20:00:00.000Z' }),
      ],
      []
    );
    expect(history.map((e) => e.subjectId)).toEqual(['dated', 'undated']);
  });

  it('accroche la revue au bon sujet, en distinguant les types', () => {
    // Un match et un scrim peuvent partager un id dans un jeu de test ou après
    // une reprise de données : la clé doit porter le type.
    const history = buildEncounterHistory(
      [
        encounter({ subjectId: 'same', subjectType: 'match' }),
        encounter({ subjectId: 'same', subjectType: 'scrim' }),
      ],
      [
        {
          subjectType: 'scrim',
          subjectId: 'same',
          vodUrl: null,
          notes: 'revue du scrim',
          objectives: null,
          updatedAt: '2026-07-20T10:00:00.000Z',
          updatedBy: 'u1',
        },
      ]
    );
    const match = history.find((e) => e.subjectType === 'match');
    const scrim = history.find((e) => e.subjectType === 'scrim');
    expect(match?.review).toBeNull();
    expect(scrim?.review?.notes).toBe('revue du scrim');
  });

  it('laisse la revue à null quand il n’y en a pas', () => {
    const history = buildEncounterHistory([encounter({ subjectId: 'm1' })], []);
    expect(history[0].review).toBeNull();
  });
});
