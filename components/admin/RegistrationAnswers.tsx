// components/admin/RegistrationAnswers.tsx
//
// Renders a team's submitted registration answers (`tournament_teams.field_values`)
// against the tournament's field DEFINITIONS (`tournaments.registration_fields`).
// Falls back to a humanized key → value when a definition isn't available.
//
// Shared by the demande detail page and the tournament's registered-teams view.

import type { ReactNode } from 'react';
import { useAdminT } from '@/lib/i18n/useAdminT';
import type { RegistrationField } from '@/utils/registrationFields';

/** Human-readable fallback label when we don't have the field definition. */
function humanizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/** True when at least one field-def key has a non-empty answer. */
export function hasRenderableAnswers(
  fieldValues: Record<string, unknown> | null | undefined,
  fields: RegistrationField[]
): boolean {
  if (!fieldValues || typeof fieldValues !== 'object') return false;
  const definedKeys =
    fields.length > 0 ? fields.map((f) => f.key) : Object.keys(fieldValues);
  return definedKeys.some((key) => {
    const raw = fieldValues[key];
    return !(raw === null || raw === undefined || raw === '');
  });
}

export default function RegistrationAnswers({
  fieldValues,
  fields,
  compact = false,
}: {
  fieldValues: Record<string, unknown>;
  fields: RegistrationField[];
  /** Compact variant (smaller heading) for the registered-teams list. */
  compact?: boolean;
}) {
  const tf = useAdminT('adminRegistrationFields');

  // Preserve field-def order first, then any leftover answer keys.
  const orderedKeys: string[] = [];
  for (const f of fields) {
    if (f.key in fieldValues) orderedKeys.push(f.key);
  }
  for (const k of Object.keys(fieldValues)) {
    if (!orderedKeys.includes(k)) orderedKeys.push(k);
  }

  if (orderedKeys.length === 0) return null;

  const byKey = new Map(fields.map((f) => [f.key, f]));

  return (
    <div className={compact ? 'mt-2' : 'mt-4'}>
      <div className="text-neutral-500 text-xs mb-2">{tf.answersTitle}</div>
      <dl className="space-y-2">
        {orderedKeys.map((key) => {
          const def = byKey.get(key);
          const raw = fieldValues[key];
          const label = def?.label || humanizeKey(key);

          let rendered: ReactNode;
          if (typeof raw === 'boolean') {
            rendered = raw ? tf.answerYes : tf.answerNo;
          } else if (
            typeof raw === 'string' &&
            (def?.type === 'url' || isHttpUrl(raw))
          ) {
            rendered = (
              <a
                href={raw}
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 hover:underline break-all"
              >
                {raw}
              </a>
            );
          } else if (raw === null || raw === undefined || raw === '') {
            rendered = '—';
          } else {
            rendered = String(raw);
          }

          return (
            <div
              key={key}
              className="px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-700"
            >
              <dt className="text-xs text-neutral-500">{label}</dt>
              <dd className="text-sm font-medium mt-0.5 whitespace-pre-line">
                {rendered}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
