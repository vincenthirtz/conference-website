// Pronostics — règles pures et cohérence avec la migration.
// Target: utils/predictions/rules.ts, database/migrations/match_predictions.sql
//
// CE QUE CES CAS PROTÈGENT.
//   1. LE VERROU : un pronostic ne s'écrit plus une fois le match lancé ou son
//      heure passée. La règle existe deux fois (TS pour l'affichage, SQL pour
//      l'écriture) : le second bloc relit la migration pour qu'elles ne
//      divergent pas en silence.
//   2. UN FORFAIT NE PAIE PERSONNE : sinon une équipe offrirait des pièces à
//      qui a pronostiqué l'adversaire en déclarant forfait.
//   3. UNE PERSONNE EXCLUE OU EN RETARD N'EST NI PAYÉE NI « PERDANTE ».
//   4. LE CHECK DU PORTE-MONNAIE ACCEPTE TOUTES LES SOURCES DU REGISTRE : un
//      CHECK se remplace, et oublier une valeur ferait échouer la migration.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  predictionCutoff,
  predictionOutcome,
  predictionWindow,
  settlePrediction,
  type PredictionMatch,
} from '../../utils/predictions/rules';
import { TCG_EARN_SOURCES } from '../../utils/tcg/earnSources';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const NOW = new Date('2026-09-20T18:00:00.000Z');

function match(over: Partial<PredictionMatch> = {}): PredictionMatch {
  return {
    id: 'cccccccc-0000-4000-8000-000000000003',
    tenant_id: 'dddddddd-0000-4000-8000-000000000004',
    tournament_id: 'eeeeeeee-0000-4000-8000-000000000005',
    scrim_id: null,
    team1_id: A,
    team2_id: B,
    winner_team_id: null,
    forfeit_team_id: null,
    status: 'pending',
    is_bye: false,
    deleted_at: null,
    scheduled_at: '2026-09-20T19:00:00.000Z',
    started_at: null,
    completed_at: null,
    ...over,
  };
}

describe('predictionWindow', () => {
  it('ouvre un match de tournoi à venir', () => {
    expect(predictionWindow(match(), NOW)).toBe('open');
    // Sans heure prévue, le match reste ouvert tant qu'il n'est pas lancé.
    expect(predictionWindow(match({ scheduled_at: null }), NOW)).toBe('open');
  });

  it('verrouille à l’heure prévue, au lancement et hors attente', () => {
    expect(
      predictionWindow(match({ scheduled_at: NOW.toISOString() }), NOW)
    ).toBe('locked');
    expect(
      predictionWindow(match({ started_at: '2026-09-20T17:59:00Z' }), NOW)
    ).toBe('locked');
    for (const status of ['ongoing', 'finished', 'disputed', 'postponed']) {
      expect(predictionWindow(match({ status }), NOW)).toBe('locked');
    }
    // Une date illisible verrouille plutôt que d'ouvrir.
    expect(predictionWindow(match({ scheduled_at: 'n/a' }), NOW)).toBe(
      'locked'
    );
  });

  it('n’ouvre jamais bye, scrim, match supprimé ou équipe inconnue', () => {
    for (const over of [
      { is_bye: true },
      { scrim_id: 'ffffffff-0000-4000-8000-000000000006' },
      { deleted_at: '2026-09-01T00:00:00Z' },
      { team2_id: null },
      { tournament_id: null },
    ]) {
      expect(predictionWindow(match(over), NOW)).toBe('not_predictable');
    }
  });
});

describe('predictionOutcome', () => {
  it('attend une issue définitive', () => {
    for (const status of ['pending', 'ongoing', 'disputed']) {
      expect(predictionOutcome(match({ status }))).toEqual({
        kind: 'pending',
      });
    }
  });

  it('rend le vainqueur d’un match terminé', () => {
    expect(
      predictionOutcome(match({ status: 'finished', winner_team_id: A }))
    ).toEqual({ kind: 'decided', winnerTeamId: A });
  });

  it('annule sur forfait, walkover, annulation ou vainqueur illisible', () => {
    expect(
      predictionOutcome(
        match({ status: 'finished', winner_team_id: A, forfeit_team_id: B })
      ).kind
    ).toBe('void');
    expect(
      predictionOutcome(match({ status: 'walkover', winner_team_id: A })).kind
    ).toBe('void');
    expect(predictionOutcome(match({ status: 'cancelled' })).kind).toBe('void');
    expect(
      predictionOutcome(
        match({
          status: 'finished',
          winner_team_id: 'ffffffff-0000-4000-8000-000000000009',
        })
      ).kind
    ).toBe('void');
  });
});

describe('settlePrediction', () => {
  const decided = { kind: 'decided', winnerTeamId: A } as const;
  const base = {
    updatedAt: '2026-09-20T17:00:00.000Z',
    outcome: decided,
    excluded: false,
    cutoff: Date.parse('2026-09-20T19:00:00.000Z'),
  };

  it('juste → won, faux → lost', () => {
    expect(settlePrediction({ ...base, predictedTeamId: A })).toBe('won');
    expect(settlePrediction({ ...base, predictedTeamId: B })).toBe('lost');
  });

  it('exclue, tardive ou sur issue annulée → void', () => {
    expect(
      settlePrediction({ ...base, predictedTeamId: A, excluded: true })
    ).toBe('void');
    expect(
      settlePrediction({
        ...base,
        predictedTeamId: A,
        updatedAt: '2026-09-20T19:00:00.000Z',
      })
    ).toBe('void');
    expect(
      settlePrediction({
        ...base,
        predictedTeamId: A,
        outcome: { kind: 'void' },
      })
    ).toBe('void');
  });

  it('prend le lancement réel, pas l’heure prévue, comme borne', () => {
    // Un match reprogrammé plus tard rouvre légitimement les pronostics.
    expect(
      predictionCutoff(
        match({
          scheduled_at: '2026-09-01T00:00:00Z',
          started_at: '2026-09-20T19:05:00Z',
          completed_at: '2026-09-20T20:00:00Z',
        })
      )
    ).toBe(Date.parse('2026-09-20T19:05:00Z'));
    expect(predictionCutoff(match())).toBeNull();
  });
});

describe('migration match_predictions.sql', () => {
  const raw = readFileSync(
    path.resolve(__dirname, '../../database/migrations/match_predictions.sql'),
    'utf8'
  );
  const sql = raw.replace(/--.*$/gm, '');
  const flat = sql.replace(/\s+/g, ' ');

  it('verrouille en base sur les mêmes conditions que predictionWindow', () => {
    expect(flat).toContain("v_match.status <> 'pending'");
    expect(flat).toContain('v_match.started_at IS NOT NULL');
    expect(flat).toContain('v_match.scheduled_at <= now()');
    expect(flat).toContain('v_match.scrim_id IS NOT NULL');
    expect(flat).toContain('COALESCE(v_match.is_bye, false)');
    expect(flat).toContain('v_match.deleted_at IS NOT NULL');
    expect(flat).toContain('prediction_team_invalid');
    // Le déclencheur relit le match DANS la transaction d'écriture.
    expect(flat).toMatch(/FOR SHARE/);
    expect(flat).toMatch(
      /BEFORE INSERT OR UPDATE ON public\.match_predictions/
    );
  });

  it('pose `updated_at` lui-même, jamais l’appelant', () => {
    expect(flat).toContain('NEW.updated_at := now()');
  });

  it('un pronostic par personne et par match', () => {
    expect(flat).toContain('UNIQUE (tenant_id, match_id, user_id)');
  });

  it('le CHECK du porte-monnaie liste toutes les sources du registre', () => {
    const check = flat.slice(
      flat.indexOf('ADD CONSTRAINT tcg_wallet_entries_source_kind_check')
    );
    for (const source of TCG_EARN_SOURCES) {
      expect(check).toContain(`'${source.key}'`);
    }
    // Et la valeur hors registre qui existe en base.
    expect(check).toContain("'admin_grant'");
    expect(check).toContain("'card_recycled'");
  });
});
