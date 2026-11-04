// utils/db/d1/now.ts — « maintenant » en SQL pour D1, sans aucune dépendance : les déclencheurs
// du lot 4b (tests/unit/__helpers__/d1Manual.ts, chargé par `npm run db:d1` hors de Vitest) le
// partagent avec la façade (values.ts).

/** « Maintenant », au format de stockage des timestamptz (SQL, évalué par D1). */
export const SQL_NOW = "(strftime('%Y-%m-%dT%H:%M:%f', 'now') || '000+00:00')";
