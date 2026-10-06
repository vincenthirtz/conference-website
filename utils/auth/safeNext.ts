// utils/auth/safeNext.ts
//
// Validation d'une cible de redirection `?next=` (anti open-redirect).
//
// On n'accepte qu'un CHEMIN INTERNE : il commence par « / » mais pas par « // »
// (lien protocol-relative vers un domaine externe), et ne contient pas de « \ »
// (les navigateurs normalisent `/\evil.example` en `//evil.example`).
//
// Module PUR : utilisé côté navigateur (pages/login.tsx, pages/register.tsx)
// ET côté serveur (pages/api/auth/register.ts, qui construit l'URL du lien de
// confirmation e-mail). Une seule règle pour les deux bords, sinon le serveur
// finirait par accepter ce que la page refuse.

/** Chemin interne validé, ou `null` si la valeur est absente / suspecte. */
export function safeNext(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return null;
  }
  return raw;
}
