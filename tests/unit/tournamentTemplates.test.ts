import { describe, it, expect } from 'vitest';
import {
  STAGE_TYPES,
  TOURNAMENT_TEMPLATES,
} from '../../config/tournament-templates';
import type { TournamentTemplate } from '../../config/tournament-templates';

/**
 * Dérivée de la source, et non recopiée : la copie locale d'origine rendait ce
 * test rouge dès qu'un type de phase légitime était ajouté (cas de `ffa`), ce
 * qui ne signalait rien d'autre que sa propre obsolescence.
 */
const VALID_STAGE_TYPES: readonly string[] = STAGE_TYPES;

describe('TOURNAMENT_TEMPLATES', () => {
  it('contains at least 3 templates', () => {
    expect(TOURNAMENT_TEMPLATES.length).toBeGreaterThanOrEqual(3);
  });

  it('each template has a unique id', () => {
    const ids = TOURNAMENT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(TOURNAMENT_TEMPLATES.map((t) => [t.id, t]))(
    'template "%s" has required fields',
    (_id, template) => {
      const t = template as TournamentTemplate;
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.stages.length).toBeGreaterThan(0);
    }
  );

  it.each(TOURNAMENT_TEMPLATES.map((t) => [t.id, t]))(
    'template "%s" uses only valid stage types',
    (_id, template) => {
      const t = template as TournamentTemplate;
      for (const stage of t.stages) {
        expect(VALID_STAGE_TYPES).toContain(stage.stage_type);
      }
    }
  );

  it.each(TOURNAMENT_TEMPLATES.map((t) => [t.id, t]))(
    'template "%s" stages have non-empty names',
    (_id, template) => {
      const t = template as TournamentTemplate;
      for (const stage of t.stages) {
        expect(stage.name.trim()).toBeTruthy();
      }
    }
  );

  it('includes a bracket-only template', () => {
    const bracketOnly = TOURNAMENT_TEMPLATES.find((t) =>
      t.stages.every((s) => s.stage_type === 'bracket')
    );
    expect(bracketOnly).toBeDefined();
  });

  it('includes a multi-stage template', () => {
    const multiStage = TOURNAMENT_TEMPLATES.find((t) => t.stages.length >= 2);
    expect(multiStage).toBeDefined();
  });
});
