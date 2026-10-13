// tests/unit/playerMatchEvidence.test.ts — la partie UI du dépôt de preuve :
// le message traduit d'un refus (`features/player/matches/disputeView`).
//
// La route `POST /api/player/matches/[matchId]/evidence` est testée dans
// conference-api ; ses cas route→UI attendent dans tests/pending-4e/.

import { describe, it, expect } from 'vitest';
import { evidenceErrorMessage } from '../../features/player/matches/disputeView';
import fr from '../../lib/i18n/locales/fr/playerMatch';

describe('evidenceErrorMessage : un refus → un message traduit', () => {
  const t = fr.fr;
  it('traduit les codes, jamais le texte serveur', () => {
    expect(evidenceErrorMessage(400, 'EVIDENCE_TOO_LARGE', t)).toBe(
      t.evidenceErrTooLarge
    );
    expect(evidenceErrorMessage(400, 'EVIDENCE_NOT_IMAGE', t)).toBe(
      t.evidenceErrType
    );
    expect(evidenceErrorMessage(403, 'REPORT_BOTH_SIDES', t)).toBe(
      t.evidenceErrBothSides
    );
    expect(evidenceErrorMessage(403, 'NOT_REPORTER', t)).toBe(
      t.evidenceErrRight
    );
    expect(evidenceErrorMessage(429, null, t)).toBe(t.evidenceErrRateLimited);
    expect(evidenceErrorMessage(500, 'EVIDENCE_SAVE_FAILED', t)).toBe(
      t.evidenceErrGeneric
    );
  });
});
