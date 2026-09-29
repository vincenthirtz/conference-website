// features/admin/twitch/routes/limits.ts — garde et débits des routes Twitch,
// repris des routes d'origine (par IP et par route).

import type { StaffGuard } from '@/utils/staff';

/** Même seuil que les écritures régie. */
export const TWITCH_GUARD: StaffGuard = { permission: 'manage_broadcast' };

export const PER_MIN_5 = { max: 5, windowMs: 60_000 };
export const PER_MIN_20 = { max: 20, windowMs: 60_000 };
export const PER_MIN_30 = { max: 30, windowMs: 60_000 };
export const PER_MIN_60 = { max: 60, windowMs: 60_000 };
