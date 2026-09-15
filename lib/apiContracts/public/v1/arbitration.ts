// Réponse de /api/public/v1/tournaments/{id}/arbitration. Miroir de
// ArbitrationMetrics (utils/disputes/arbitrationMetrics.ts) et du type de la route.

import { z } from 'zod';
import { nullableString } from './common';

const minutes = (description: string) =>
  z.number().nullable().meta({ description });

export const publicV1ArbitrationMetricsSchema = z
  .object({
    totalDisputes: z.number().int().meta({
      description:
        'Matchs ayant eu un litige (opened_at renseigné OU status=disputed OU résolus).',
    }),
    open: z
      .number()
      .int()
      .meta({ description: 'Litiges non résolus (status=disputed).' }),
    resolved: z
      .number()
      .int()
      .meta({ description: 'Litiges avec un horodatage de résolution.' }),
    avgResolutionMinutes: minutes(
      'Temps moyen de résolution (minutes) sur les résolus ; null si aucun.'
    ),
    medianResolutionMinutes: minutes(
      'Temps médian de résolution (minutes) sur les résolus ; null si aucun.'
    ),
    withinSlaCount: z.number().int().meta({
      description: 'Litiges résolus dans le SLA (durée <= slaMinutes).',
    }),
    slaComplianceRate: z.number().nullable().meta({
      description: 'withinSlaCount / resolved (0..1) ; null si resolved=0.',
    }),
    openBreakdown: z
      .object({
        breached: z.number().int(),
        approaching: z.number().int(),
        fresh: z.number().int(),
      })
      .meta({ description: 'Répartition SLA des litiges OUVERTS.' }),
    slaMinutes: z.number().int().meta({
      description: 'Fenêtre SLA (minutes) du tenant utilisée pour le calcul.',
    }),
  })
  .meta({
    id: 'PublicV1ArbitrationMetrics',
    description:
      "Métriques d'arbitrage AGRÉGÉES et NON NOMINATIVES d'un tournoi. Aucun identifiant (équipe / match / joueuse), aucune raison de litige : que des compteurs, durées et taux.",
  });

export const publicV1TournamentArbitrationSchema = z
  .object({
    tournamentId: z.uuid(),
    tournamentName: z.string(),
    tournamentSlug: nullableString,
    metrics: publicV1ArbitrationMetricsSchema,
  })
  .meta({ id: 'PublicV1TournamentArbitration' });
