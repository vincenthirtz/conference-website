// utils/admin/auditDiff.ts — ce qui a CHANGÉ, pour le journal staff (lot L8,
// docs/PLAN-industrialisation-admin.md).
//
// Le journal disait « équipe mise à jour » ; il doit dire « nom : A → B ».
// `defineAdminRoute` appelle ces fonctions à partir de ce que le handler lui
// passe par `ctx.audit({ before, after })` :
//
//   * avant ET après → `changes` : seulement les champs qui ont bougé ;
//   * après seul (création) → `after` : la photo de ce qui a été créé ;
//   * avant seul (suppression) → `before` : la photo de ce qui a disparu —
//     la seule trace qu'il en restera.
//
// PUR, et prudent : les colonnes techniques sont ignorées, les valeurs
// sensibles (secrets, jetons, mots de passe) ne sont jamais recopiées dans un
// journal que plusieurs personnes lisent.

export type AuditChange = { from: unknown; to: unknown };
export type AuditChanges = Record<string, AuditChange>;
export type AuditRecord = Record<string, unknown>;

/** Colonnes qui bougent à chaque écriture sans rien dire du geste. */
const IGNORED = new Set(['id', 'tenant_id', 'created_at', 'updated_at']);

/** Noms de champs dont la VALEUR ne va jamais au journal. */
const SENSITIVE = /(secret|token|password|passwd|api_?key|private_?key)/i;

export const REDACTED = '[masqué]';

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // null et undefined : « rien » des deux côtés.
  if (a == null && b == null) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

function redact(key: string, value: unknown): unknown {
  return SENSITIVE.test(key) && value != null ? REDACTED : value;
}

/** Champs modifiés entre deux états (clés des deux côtés). */
export function diffRecords(
  before: AuditRecord,
  after: AuditRecord
): AuditChanges {
  const changes: AuditChanges = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of [...keys].sort()) {
    if (IGNORED.has(key)) continue;
    const from = before[key];
    const to = after[key];
    if (sameValue(from, to)) continue;
    changes[key] = {
      from: redact(key, from ?? null),
      to: redact(key, to ?? null),
    };
  }
  return changes;
}

/** Photo d'un état (création / suppression), sans colonnes techniques. */
export function snapshotRecord(record: AuditRecord): AuditRecord {
  const out: AuditRecord = {};
  for (const key of Object.keys(record).sort()) {
    if (IGNORED.has(key)) continue;
    out[key] = redact(key, record[key] ?? null);
  }
  return out;
}

/** Ce que le journal reçoit, selon ce que le handler a fourni. */
export function auditPayloadFromStates(
  before: AuditRecord | null | undefined,
  after: AuditRecord | null | undefined
): { changes?: AuditChanges; before?: AuditRecord; after?: AuditRecord } {
  if (before && after) return { changes: diffRecords(before, after) };
  if (after) return { after: snapshotRecord(after) };
  if (before) return { before: snapshotRecord(before) };
  return {};
}
