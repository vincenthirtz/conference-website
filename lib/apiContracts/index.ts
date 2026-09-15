// lib/apiContracts/index.ts
//
// Registre des schémas zod référencés par la spec OpenAPI.
//
// Un fragment de docs/openapi/ écrit, à la place d'un schéma :
//     x-zod: public.freePlayerSignup
// et l'assembleur (utils/openapi/assemble.ts) y met le JSON Schema produit par
// `z.toJSONSchema`. Le handler valide avec LE MÊME schéma : la spec ne peut
// plus annoncer une contrainte que le code n'applique pas, ni l'inverse.
//
// Règles :
//   - les modules de lib/apiContracts n'importent que zod et des modules purs,
//     en chemins relatifs (pas de supabase, pas d'alias `@/`) : l'assembleur
//     tourne aussi dans un script de build ;
//   - `io: 'input'` pour ce que le client ENVOIE (corps, query), `'output'`
//     pour ce que la route RENVOIE ;
//   - conversion stricte : un schéma non représentable (transform, date…) fait
//     échouer l'assemblage plutôt que de produire une spec appauvrie.

import type { z } from 'zod';
import { BOT_API_CONTRACT_SCHEMAS } from './bot';
import { QUERY_CONTRACT_SCHEMAS } from './queries';
import { freePlayerSignupBodySchema } from './public/freePlayers';
import { PUBLIC_V1_RESPONSE_SCHEMAS } from './public/v1';
import {
  matchResultBodySchema,
  matchResultResponseSchema,
} from './public/matchResult';
import { newsletterSubscribeBodySchema } from './public/newsletter';
import { teamOpeningBodySchema } from './public/teamOpenings';
import { predictionBodySchema } from './player/predictions/body';

export type ApiContractEntry = {
  schema: z.ZodType;
  io: 'input' | 'output';
};

export const API_CONTRACT_SCHEMAS: Record<string, ApiContractEntry> = {
  'public.freePlayerSignup': {
    schema: freePlayerSignupBodySchema,
    io: 'input',
  },
  'public.teamOpeningSignup': { schema: teamOpeningBodySchema, io: 'input' },
  'public.newsletterSubscribe': {
    schema: newsletterSubscribeBodySchema,
    io: 'input',
  },
  'public.v1.matchResult': { schema: matchResultBodySchema, io: 'input' },
  'public.v1.matchResult.response': {
    schema: matchResultResponseSchema,
    io: 'output',
  },
  'player.predictions.set': { schema: predictionBodySchema, io: 'input' },
  ...BOT_API_CONTRACT_SCHEMAS,
  ...PUBLIC_V1_RESPONSE_SCHEMAS,
  ...QUERY_CONTRACT_SCHEMAS,
};
