// Modale de report : chaque refus serveur a son message. Les deux nouveaux
// codes du contrat avec report-score.ts (MATCH_NOT_STARTED en 409,
// INVALID_SCORE_FOR_FORMAT en 400) ne doivent PAS retomber sur les messages
// génériques de leur statut — « match clôturé » pour un report trop tôt
// enverrait la capitaine chercher le staff pour rien.

import { describe, expect, it } from 'vitest';

import { reportScoreErrorToast } from '@/components/player/ReportScoreModal';
import fr from '@/lib/i18n/locales/fr/playerMatches';

const t = fr.fr;

describe('reportScoreErrorToast', () => {
  it('409 MATCH_NOT_STARTED → trop tôt, pas « clôturé »', () => {
    const r = reportScoreErrorToast(409, 'MATCH_NOT_STARTED', 3, t);
    expect(r.message).toBe(t.errNotStarted);
    expect(r.message).not.toBe(t.errFinalized);
  });

  it('400 INVALID_SCORE_FOR_FORMAT → cite le format quand il est connu', () => {
    const r = reportScoreErrorToast(400, 'INVALID_SCORE_FOR_FORMAT', 3, t);
    expect(r.message).toContain('BO3');
    expect(r.message).not.toBe(t.errInvalidScore);
    expect(
      reportScoreErrorToast(400, 'INVALID_SCORE_FOR_FORMAT', null, t).message
    ).toBe(t.errInvalidForFormatGeneric);
  });

  it('garde les messages existants', () => {
    expect(reportScoreErrorToast(409, 'MATCH_FINALIZED', 3, t).message).toBe(
      t.errFinalized
    );
    expect(reportScoreErrorToast(403, null, 3, t).message).toBe(
      t.errNotCaptain
    );
    expect(reportScoreErrorToast(429, null, 3, t).level).toBe('warning');
    expect(reportScoreErrorToast(400, null, 3, t).message).toBe(
      t.errInvalidScore
    );
    expect(reportScoreErrorToast(500, null, 3, t).message).toBe(t.errGeneric);
  });

  it('409 FINALIZATION_IN_PROGRESS → enregistrement en cours, pas une erreur', () => {
    const r = reportScoreErrorToast(409, 'FINALIZATION_IN_PROGRESS', 3, t);
    expect(r.message).toBe(t.errFinalizationInProgress);
    expect(r.level).toBe('warning');
  });

  it('409 DISPUTE_UNDER_STAFF_REVIEW → une attente, pas un échec', () => {
    const r = reportScoreErrorToast(409, 'DISPUTE_UNDER_STAFF_REVIEW', 3, t);
    expect(r.message).toBe(t.errStaffReview);
    expect(r.level).toBe('warning');
  });

  it('409 sans code connu → repli générique, on ne devine pas « clôturé »', () => {
    expect(reportScoreErrorToast(409, null, 3, t).message).toBe(t.errGeneric);
    expect(reportScoreErrorToast(409, 'SOMETHING_NEW', 3, t).message).toBe(
      t.errGeneric
    );
  });

  it('401 → session expirée, pas un échec générique', () => {
    expect(reportScoreErrorToast(401, null, 3, t).message).toBe(
      t.errSessionExpired
    );
  });
});
