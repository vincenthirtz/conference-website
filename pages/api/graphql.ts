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
//
// Le rate-limit global reste porté par l'infra (nginx / Netlify) ; les
// mutations passent par la même logique métier tenant-scopée que le REST.

import { createYoga } from 'graphql-yoga';
import type { ValidationRule, SelectionSetNode } from 'graphql';
import { GraphQLError, Kind, NoSchemaIntrospectionCustomRule } from 'graphql';
import { publicGraphQLSchema } from '@/utils/graphql/schema';
import {
  buildGraphQLContext,
  type GraphQLContext,
} from '@/utils/graphql/context';

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
const yoga = createYoga<Record<never, never>, GraphQLContext>({
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

export default yoga;
