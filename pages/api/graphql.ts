// pages/api/graphql.ts
//
// Endpoint GraphQL de l'API publique (feature "API publique élargie" — Lot 4).
// Servi par graphql-yoga sur le runtime Next pages-router.
//
// - Queries : lecture publique anonyme (posture identique au REST public read).
// - Mutations : token scopé requis (résolu dans le context).
//
// SÉCURITÉ (surface d'attaque nouvelle) :
//   - Depth limit (garde anti-DoS sur les requêtes profondes / cycliques).
//   - GraphiQL + introspection désactivés en production.
//   - bodyParser Next désactivé (yoga lit le body brut lui-même).
//   - Limite de débit par IP (GRAPHQL_RATE_LIMIT), AVANT yoga : ni parsing ni
//     validation ne sont payés pour une requête refusée.
//
// Les mutations passent par la même logique métier tenant-scopée que le REST
// (et gardent en plus leur quota de plan, dans le résolveur).

import type { NextApiRequest, NextApiResponse } from 'next';
import { createYoga } from 'graphql-yoga';
import type { ValidationRule, SelectionSetNode } from 'graphql';
import { GraphQLError, Kind, NoSchemaIntrospectionCustomRule } from 'graphql';
import { publicGraphQLSchema } from '@/utils/graphql/schema';
import {
  buildGraphQLContext,
  type GraphQLContext,
} from '@/utils/graphql/context';
import { applyRateLimit } from '@/utils/rateLimit';

// yoga lit le corps brut → on désactive le bodyParser de Next.
export const config = { api: { bodyParser: false } };

const IS_PROD = process.env.NODE_ENV === 'production';
const MAX_DEPTH = 8;

/**
 * Règle de validation « profondeur maximale » — implémentée inline pour éviter
 * une dépendance de plus. Compte la profondeur d'imbrication des sélections et
 * rejette au-delà de MAX_DEPTH (protège contre les requêtes profondes/cycliques
 * qui explosent le coût — le vecteur DoS classique de GraphQL).
 */
function depthLimitRule(maxDepth: number): ValidationRule {
  return (context) => ({
    OperationDefinition(node) {
      const measure = (
        selectionSet: SelectionSetNode | undefined,
        depth: number
      ): void => {
        if (!selectionSet) return;
        if (depth > maxDepth) {
          context.reportError(
            new GraphQLError(`Query exceeds maximum depth of ${maxDepth}.`, {
              nodes: [node],
            })
          );
          return;
        }
        for (const selection of selectionSet.selections) {
          if (selection.kind === Kind.FIELD) {
            measure(selection.selectionSet, depth + 1);
          } else if (
            selection.kind === Kind.INLINE_FRAGMENT ||
            selection.kind === Kind.FRAGMENT_SPREAD
          ) {
            // Les fragments spreads sont résolus par les règles standards ;
            // on descend dans les inline fragments.
            if ('selectionSet' in selection) {
              measure(
                (selection as { selectionSet?: typeof node.selectionSet })
                  .selectionSet,
                depth
              );
            }
          }
        }
      };
      measure(node.selectionSet, 0);
      return undefined;
    },
  });
}

// Server context vide : le token est résolu côté UserContext (GraphQLContext)
// via le context factory. `Record<never, never>` évite l'index signature que
// `Record<string, unknown>` imposerait au schéma.
export const yoga = createYoga<Record<never, never>, GraphQLContext>({
  schema: publicGraphQLSchema,
  graphqlEndpoint: '/api/graphql',
  graphiql: !IS_PROD,
  context: ({ request }) =>
    buildGraphQLContext(request.headers.get('authorization')),
  plugins: [
    {
      onValidate({
        addValidationRule,
      }: {
        addValidationRule: (rule: ValidationRule) => void;
      }) {
        addValidationRule(depthLimitRule(MAX_DEPTH));
        // En prod : pas d'introspection (réduit la surface de reconnaissance).
        if (IS_PROD) addValidationRule(NoSchemaIntrospectionCustomRule);
      },
    },
  ],
  // graphql-yoga masque les erreurs par défaut (pas de fuite de stack).
});

/**
 * Limite de débit de l'endpoint : 600 requêtes par minute par IP (en mémoire,
 * par instance — même limiteur que le reste du site, robuste aux en-têtes d'IP
 * forgés).
 *
 * POURQUOI CETTE VALEUR. L'endpoint accepte l'anonyme et une profondeur 8 :
 * sans plafond, une boucle suffit à faire tourner les lectures Supabase à plein.
 * Mais son usage légitime, ce sont des overlays (POGTV, régies) qui sondent en
 * continu, souvent PLUSIEURS derrière une même IP (une régie = un poste OBS avec
 * scoreboard, bracket, planning…). Repères :
 *   - un overlay qui sonde toutes les 2 s = 30/min ; 600/min en laisse passer
 *     20 simultanés derrière la même IP, à ce rythme serré ;
 *   - les lectures REST sont à 120/min par IP et PAR endpoint ; une requête
 *     GraphQL agrège ce que le REST répartit sur plusieurs endpoints (tournoi,
 *     matchs, équipe…), d'où 5 fois ce budget sur l'endpoint unique ;
 *   - 10 req/s soutenues restent très loin d'une boucle d'abus (des centaines
 *     par seconde), qui est ce qu'on arrête.
 * Mutations comprises : elles passent par le même endpoint, et gardent en plus
 * leur quota de plan (résolveur), inchangé.
 */
export const GRAPHQL_RATE_LIMIT = { max: 600, windowMs: 60_000 } as const;
const GRAPHQL_RATE_LIMIT_STORE = 'graphql';

/**
 * Applique la limite ; renvoie true si la requête a été refusée (réponse écrite).
 *
 * `applyRateLimit` compte et décide, mais écrit un corps REST
 * (`{ error }`). Un client GraphQL lit `errors[].extensions.code` : on lui
 * passe donc une réponse-témoin qui ne capture que `Retry-After`, et on écrit
 * nous-mêmes le 429 au format GraphQL — même `RATE_LIMITED` et même
 * `retryAfterSec` que le quota de la mutation (utils/graphql/schema.ts), pour
 * qu'un intégrateur n'ait qu'une branche à écrire.
 */
export function rejectIfGraphQLRateLimited(
  req: NextApiRequest,
  res: NextApiResponse
): boolean {
  let retryAfter = String(Math.ceil(GRAPHQL_RATE_LIMIT.windowMs / 1000));
  const probe = {
    setHeader(name: string, value: unknown) {
      if (name.toLowerCase() === 'retry-after') retryAfter = String(value);
      return probe;
    },
    status: () => probe,
    json: () => probe,
  };
  const limited = applyRateLimit(
    req,
    probe as unknown as NextApiResponse,
    GRAPHQL_RATE_LIMIT,
    GRAPHQL_RATE_LIMIT_STORE
  );
  if (!limited) return false;

  res.setHeader('Retry-After', retryAfter);
  res.setHeader('Cache-Control', 'no-store');
  res.status(429).json({
    errors: [
      {
        message: 'API rate limit exceeded.',
        extensions: {
          code: 'RATE_LIMITED',
          retryAfterSec: Number(retryAfter),
          limit: GRAPHQL_RATE_LIMIT.max,
        },
      },
    ],
  });
  return true;
}

export default async function graphqlHandler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (rejectIfGraphQLRateLimited(req, res)) return;
  return yoga(req, res);
}
