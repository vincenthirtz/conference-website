export const POLE_KEYS = [
  'direction',
  'tournoi',
  'production',
  'communaute',
] as const;

export type PoleKey = (typeof POLE_KEYS)[number];

export const POLE_LABELS: Record<PoleKey, string> = {
  direction: 'Direction & admin',
  tournoi: 'Tournoi & arbitrage',
  production: 'Production & cast',
  communaute: 'Communauté',
};

export function isPoleKey(value: unknown): value is PoleKey {
  return typeof value === 'string' && (POLE_KEYS as readonly string[]).includes(value);
}
