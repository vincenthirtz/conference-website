// Module joueuse `features/player/scrims` — lot P13
// (docs/PLAN-industrialisation-joueur.md). Les routes gardent leur contrat
// (tests d'API existants : apiScrimPlannings, scrimSearches, scrimNegotiation,
// scrimReportIntegrity, teamsDirectoryRecruitment…) ; ce test fige les
// DÉCLARATIONS de garde : qui peut inspecter, qui exige une équipe, et que
// les routes de session de planning restent gardées par la partie
// (resolvePlanningParty) et non par une équipe désignée.

import { describe, it, expect } from 'vitest';
import type { SubjectRouteHandler } from '../../utils/player/defineSubjectRoute';
import { MAX_SEARCH_SLOTS } from '../../utils/teams/scrimSearch';
import { SCRIM_SEARCH_MAX_SLOTS } from '../../features/player/scrims/schemas';
import requests from '../../pages/api/teams/scrim-requests';
import searches from '../../pages/api/teams/scrim-searches';
import plannings from '../../pages/api/teams/scrim-plannings/index';
import planningDetail from '../../pages/api/teams/scrim-plannings/[planningId]/index';
import planningSuggest from '../../pages/api/teams/scrim-plannings/[planningId]/suggest';
import planningAvailability from '../../pages/api/teams/scrim-plannings/[planningId]/availability';
import myScrims from '../../pages/api/player/scrims/index';
import report from '../../pages/api/player/scrims/[scrimId]/report';
import directory from '../../pages/api/player/teams-directory';

const meta = (h: unknown) => (h as SubjectRouteHandler).subjectRoute.methods;
const SCRIMS = { permission: 'manage_scrims' };

describe('module scrims : déclarations de garde', () => {
  it('le plafond de créneaux du schéma client = celui du serveur', () => {
    expect(SCRIM_SEARCH_MAX_SLOTS).toBe(MAX_SEARCH_SLOTS);
  });

  it('demandes : inspection en lecture, écriture sans act-as, manage_scrims', () => {
    const m = meta(requests);
    expect(m.GET).toMatchObject({ subject: 'follow', team: SCRIMS });
    expect(m.POST).toMatchObject({
      subject: 'follow',
      actAs: false,
      team: SCRIMS,
    });
  });

  it('recherche et report : sujet self + manage_scrims', () => {
    for (const m of [
      meta(searches).GET,
      meta(searches).POST,
      meta(searches).DELETE,
      meta(report).POST,
    ]) {
      expect(m).toMatchObject({ subject: 'self', team: SCRIMS });
    }
  });

  it('sessions de planning : aucune équipe désignée (la partie décide)', () => {
    expect(meta(plannings).GET).toMatchObject({
      subject: 'follow',
      team: null,
    });
    for (const m of [
      meta(planningDetail).GET,
      meta(planningSuggest).GET,
      meta(planningAvailability).PUT,
    ]) {
      expect(m).toMatchObject({ subject: 'self', team: null, actAs: false });
      expect(m?.query).toBeDefined();
    }
  });

  it('mes scrims : inspection suivie ; annuaire : self', () => {
    expect(meta(myScrims).GET).toMatchObject({ subject: 'follow', team: null });
    expect(meta(directory).GET).toMatchObject({ subject: 'self', team: null });
  });
});
