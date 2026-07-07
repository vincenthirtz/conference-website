// utils/registrationFields.ts
//
// Shared contract for the "custom registration fields per tournament" feature.
// Two JSONB columns are involved (see
// database/migrations/add_registration_fields_to_tournaments.sql):
//   - tournaments.registration_fields  -> array of field DEFINITIONS (admin)
//   - tournament_teams.field_values     -> a team's ANSWERS (registration)
//
// Every consumer (admin save, Flow A anonymous create+auto-register, Flow B
// authenticated apply, approval side-effect) validates through the two
// functions exported here so the shape stays consistent end to end.
//
// User-facing error messages are French (rendered by the sign-up / admin forms)
// and intentionally concise.

import { z } from 'zod';
import { sanitizeUrl } from '@/utils/apiHelpers';

export type RegistrationFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'number'
  | 'url';

export type RegistrationField = {
  key: string; // snake_case, unique per tournament, [a-z0-9_]{1,40}
  label: string; // 1..80 chars
  type: RegistrationFieldType;
  required: boolean;
  options?: string[]; // required & non-empty ONLY when type==='select'
  help?: string; // <=200 chars
  maxLength?: number; // text/textarea only, 1..2000
};

export type RegistrationAnswers = Record<string, string | number | boolean>;

/** Field types that accept a `maxLength` cap. */
const TEXT_TYPES = new Set<RegistrationFieldType>(['text', 'textarea']);

const FIELD_TYPES = [
  'text',
  'textarea',
  'select',
  'checkbox',
  'number',
  'url',
] as const;

const MAX_FIELDS = 20;
const MAX_OPTIONS = 30;
const MAX_OPTION_LEN = 60;
const KEY_RE = /^[a-z0-9_]{1,40}$/;

// Base per-field shape. Type-specific rules (select options, maxLength scope)
// and cross-field rules (unique keys, total count) are enforced in
// validateFieldDefinitions so we can emit precise French messages per index.
const singleFieldSchema = z.object({
  key: z
    .string({ message: 'Chaque champ doit avoir une clé.' })
    .regex(KEY_RE, 'clé invalide : snake_case [a-z0-9_], 1 à 40 caractères.'),
  label: z
    .string({ message: 'Chaque champ doit avoir un label.' })
    .trim()
    .min(1, 'le label est requis (1 à 80 caractères).')
    .max(80, 'le label ne peut pas dépasser 80 caractères.'),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().optional().default(false),
  options: z.array(z.string().trim()).optional(),
  help: z
    .string()
    .trim()
    .max(200, "l'aide ne peut pas dépasser 200 caractères.")
    .optional(),
  maxLength: z
    .number()
    .int('maxLength doit être un entier.')
    .min(1, 'maxLength doit être compris entre 1 et 2000.')
    .max(2000, 'maxLength doit être compris entre 1 et 2000.')
    .optional(),
});

/**
 * Validate field DEFINITIONS (admin save). Enforces: unique snake_case keys,
 * valid type, select has >=1 option (& <=30, each 1..60 chars), label/help/
 * maxLength bounds, max 20 fields. Returns a cleaned array (options kept only
 * for select, maxLength only for text/textarea) or a single French error.
 */
export function validateFieldDefinitions(
  input: unknown
): { ok: true; fields: RegistrationField[] } | { ok: false; error: string } {
  if (input === undefined || input === null) {
    return { ok: true, fields: [] };
  }
  if (!Array.isArray(input)) {
    return {
      ok: false,
      error: 'Les champs personnalisés doivent être un tableau.',
    };
  }
  if (input.length > MAX_FIELDS) {
    return {
      ok: false,
      error: `Maximum ${MAX_FIELDS} champs personnalisés par tournoi.`,
    };
  }

  const fields: RegistrationField[] = [];
  const seenKeys = new Set<string>();

  for (let i = 0; i < input.length; i++) {
    const label = `Champ #${i + 1}`;

    // Explicit type pre-check so an invalid/missing type yields a French message
    // rather than zod's default enum error.
    const rawType = (input[i] as { type?: unknown } | null)?.type;
    if (
      typeof rawType !== 'string' ||
      !(FIELD_TYPES as readonly string[]).includes(rawType)
    ) {
      return { ok: false, error: `${label} : type de champ invalide.` };
    }

    const parsed = singleFieldSchema.safeParse(input[i]);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message || 'champ invalide.';
      return { ok: false, error: `${label} : ${msg}` };
    }
    const f = parsed.data;

    if (seenKeys.has(f.key)) {
      return { ok: false, error: `Clé en double : "${f.key}".` };
    }
    seenKeys.add(f.key);

    const cleaned: RegistrationField = {
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
    };

    if (f.type === 'select') {
      const options = (f.options ?? []).filter((o) => o.length > 0);
      if (options.length < 1) {
        return {
          ok: false,
          error: `${label} : un champ « select » doit avoir au moins une option.`,
        };
      }
      if (options.length > MAX_OPTIONS) {
        return {
          ok: false,
          error: `${label} : maximum ${MAX_OPTIONS} options.`,
        };
      }
      if (options.some((o) => o.length > MAX_OPTION_LEN)) {
        return {
          ok: false,
          error: `${label} : chaque option doit faire au plus ${MAX_OPTION_LEN} caractères.`,
        };
      }
      cleaned.options = options;
    }

    // maxLength only applies to text/textarea; silently ignored otherwise.
    if (f.maxLength !== undefined && TEXT_TYPES.has(f.type)) {
      cleaned.maxLength = f.maxLength;
    }

    if (f.help) {
      cleaned.help = f.help;
    }

    fields.push(cleaned);
  }

  return { ok: true, fields };
}

function coerceBoolean(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') {
    const t = val.trim().toLowerCase();
    return (
      t === 'true' || t === '1' || t === 'on' || t === 'yes' || t === 'oui'
    );
  }
  return Boolean(val);
}

/**
 * Validate a team's ANSWERS against the tournament's field defs (registration).
 * Strips keys not in `fields`; returns cleaned, typed values keyed by field key
 * or a per-key French error map.
 */
export function validateRegistrationAnswers(
  fields: RegistrationField[],
  answers: unknown
):
  | { ok: true; values: RegistrationAnswers }
  | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const values: RegistrationAnswers = {};

  const raw: Record<string, unknown> =
    answers && typeof answers === 'object' && !Array.isArray(answers)
      ? (answers as Record<string, unknown>)
      : {};

  for (const field of fields) {
    const val = raw[field.key];
    const isEmpty =
      val === undefined ||
      val === null ||
      (typeof val === 'string' && val.trim() === '');

    if (isEmpty) {
      if (field.required) {
        errors[field.key] = 'Ce champ est requis.';
      }
      continue;
    }

    switch (field.type) {
      case 'text':
      case 'textarea': {
        const s = String(val).trim();
        const max = field.maxLength ?? 2000;
        if (s.length > max) {
          errors[field.key] = `Maximum ${max} caractères.`;
          break;
        }
        values[field.key] = s;
        break;
      }
      case 'number': {
        const n = typeof val === 'number' ? val : Number(String(val).trim());
        if (!Number.isFinite(n)) {
          errors[field.key] = 'Valeur numérique invalide.';
          break;
        }
        values[field.key] = n;
        break;
      }
      case 'url': {
        const u = sanitizeUrl(String(val));
        if (!u) {
          errors[field.key] = 'URL http(s) invalide.';
          break;
        }
        values[field.key] = u;
        break;
      }
      case 'select': {
        const s = String(val).trim();
        if (!(field.options ?? []).includes(s)) {
          errors[field.key] = 'Valeur non autorisée.';
          break;
        }
        values[field.key] = s;
        break;
      }
      case 'checkbox': {
        values[field.key] = coerceBoolean(val);
        break;
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, values };
}
