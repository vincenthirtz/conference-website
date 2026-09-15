// Réponse de /api/public/v1/teams/{id}. Miroir de utils/public/readTeam.ts.

import { z } from 'zod';
import { nullableString } from './common';

export const publicV1TeamMemberSchema = z
  .object({
    display_name: nullableString,
    role: nullableString,
    is_substitute: z.boolean(),
  })
  .meta({ id: 'PublicV1TeamMember' });

export const publicV1TeamSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    short_name: nullableString,
    slug: nullableString,
    logo_url: nullableString,
    roster: z.array(publicV1TeamMemberSchema),
  })
  .meta({ id: 'PublicV1Team' });
