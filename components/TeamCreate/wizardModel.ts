// components/TeamCreate/wizardModel.ts — types et petites fonctions pures du
// wizard public /team/create (lot P11 : découpe de la page, rendu inchangé).

/** Valeur d'une réponse à un champ d'inscription personnalisé. */
export type FieldValue = string | number | boolean;

// Idempotency-Key pour un POST public/anonyme (pas de session Supabase, donc
// useIdempotentMutation/useAdminFetch ne s'appliquent pas ici). On génère une
// clé stable par intention utilisateur : tant qu'une création n'a pas réussi,
// un double-submit / retry réseau renvoie la MÊME clé (dédup côté serveur si
// honorée), et le bouton est verrouillé pendant la soumission.
export function genIdempotencyKey(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type CreateResponse = {
  team: {
    id: string;
    name: string;
    slug?: string | null;
  };
  members?: {
    id: string | null;
    user_id: string;
    role: string;
    captain: boolean;
    battle_tag: string;
  }[];
  tournament?: {
    tournament_name: string;
    stages_count: number;
  };
  // Candidature déposée au lieu d'une inscription immédiate : le roster
  // déclaré suffit, mais les coéquipières n'ont pas encore accepté leur
  // invitation. Le staff valide. Mutuellement exclusif avec `tournament`.
  tournament_application?: {
    tournament_name: string;
    demande_id: string | null;
  };
  info?: string;
  error?: string;
  // Code machine-readable renvoyé par le serveur sur les réponses d'erreur
  // (cf. contrat §1). Le client le mappe vers une chaîne localisée.
  code?: string;
  // Champ(s) mis en cause par une erreur (p.ex. INVALID_URL → 'logo_url').
  fields?: Record<string, string> | string[];
  fieldErrors?: Record<string, string>;
  // Pont magic-link : présent sur la réponse 201 quand le serveur a émis un
  // lien de connexion au capitaine. Le token n'est jamais renvoyé (preuve de
  // possession via l'email) — seule l'adresse masquée est exposée.
  accessEmail?: { sent: boolean; to: string };
};

export type TournamentInfo = {
  id: string;
  name: string;
  game: string | null;
  start_date: string | null;
};

export type MemberForm = {
  id: string;
  email: string;
  role: string;
  battleTag: string;
  specialty: string;
};

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** true si `v` est vide OU une URL http(s) valide. */
export function isValidHttpUrl(v: string): boolean {
  if (!v.trim()) return true;
  try {
    const u = new URL(v.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Initiales (1-2 lettres) pour le logo/avatar de l'aperçu live. */
export function getInitials(source: string): string {
  const s = source.trim();
  if (!s) return '';
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}
