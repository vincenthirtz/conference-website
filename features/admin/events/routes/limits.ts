// features/admin/events/routes/limits.ts — rate-limits des routes du
// run-of-show, repris à l'identique des routes d'origine (par IP, par minute).

export const PER_MIN_60 = { max: 60, windowMs: 60_000 } as const;
export const PER_MIN_30 = { max: 30, windowMs: 60_000 } as const;
export const PER_MIN_20 = { max: 20, windowMs: 60_000 } as const;

/** Garde commune : même seuil que start/end run (`manage_broadcast`). */
export const EVENTS_GUARD = { permission: 'manage_broadcast' } as const;
