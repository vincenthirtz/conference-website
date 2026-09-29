// features/player/onboarding/service/teamFields.ts — étape 1 : identité de
// l'équipe (nom, description, liens). Pure : aucune lecture de base.

import { sanitizeUrl } from '@/utils/apiHelpers';
import type { CreateTeamInput } from '../schemas';
import { createTeamError } from './context';

export type TeamFields = {
  name: string;
  /** Colonnes de `teams` hors tenant, prêtes à insérer. */
  row: Record<string, unknown>;
};

export function readTeamFields(body: CreateTeamInput): TeamFields {
  const name = (body.name || '').trim();
  if (!name) {
    throw createTeamError(400, 'NAME_REQUIRED', 'Le nom est requis.');
  }
  if (name.length < 2) {
    throw createTeamError(
      400,
      'NAME_TOO_SHORT',
      'Le nom doit faire au moins 2 caractères.'
    );
  }
  if (name.length > 100) {
    throw createTeamError(
      400,
      'NAME_TOO_LONG',
      'Le nom ne peut pas dépasser 100 caractères.'
    );
  }

  const description = body.description?.trim() || null;
  if (description && description.length > 2000) {
    throw createTeamError(
      400,
      'DESCRIPTION_TOO_LONG',
      'La description ne peut pas dépasser 2000 caractères.'
    );
  }

  const urls = {
    logo_url: body.logo_url,
    website: body.website,
    discord: body.discord,
  };
  for (const [field, value] of Object.entries(urls)) {
    if (value?.trim() && !sanitizeUrl(value)) {
      const message = `${field} doit être une URL http(s) valide.`;
      throw createTeamError(400, 'INVALID_URL', message, {
        fields: { [field]: message },
      });
    }
  }

  return {
    name,
    row: {
      name,
      short_name: body.short_name?.trim() || null,
      logo_url: sanitizeUrl(body.logo_url) || null,
      country: body.country?.trim() || null,
      description,
      discord: sanitizeUrl(body.discord) || null,
      website: sanitizeUrl(body.website) || null,
      // Ouverte au recrutement par défaut — posé EXPLICITEMENT (robuste si
      // le défaut DB change, testable sur le payload d'insert).
      is_joinable: true,
    },
  };
}
