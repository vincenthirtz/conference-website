// components/admin/moderation/tcgPhotoQueue.ts
//
// Lecture PURE de `GET /api/admin/tcg/photos` pour `TcgPhotosPanel.tsx`.
//
// POURQUOI REVALIDER CE QUE NOTRE PROPRE API RENVOIE. `displayName` et `email`
// sont un ENRICHISSEMENT : l'endpoint les rend `null` quand la résolution des
// profils échoue, et une version antérieure de la route ne les rendait pas du
// tout. Le panneau doit tenir dans les trois cas — nom connu, nom inconnu,
// champ absent — sans jamais afficher « undefined » ni masquer une photo parce
// que son nom manque : ce qu'une relectrice doit voir d'abord, c'est l'image.
//
// Sans JSX ni hook : testable seul (`tests/unit/adminTcgPhotoQueue.test.ts`).

import { adminUserLabel } from '@/components/admin/tcg/tcgGrantForm';

export type PendingPhoto = {
  userId: string;
  displayName: string | null;
  email: string | null;
  /**
   * Chemin du fichier AFFICHÉ, renvoyé tel quel dans la décision : le serveur
   * refuse (409) de trancher sur une photo remplacée depuis. `null` = la route
   * ne l'a pas fourni, et aucune décision n'est alors possible.
   */
  photoPath: string | null;
  photoUrl: string | null;
  submittedAt: string | null;
  /**
   * `false` : le compte n'a pas de profil joueuse dans l'espace, donc aucune
   * carte — approuver la photo ne l'afficherait nulle part. `null` = inconnu.
   */
  hasPlayerProfile: boolean | null;
};

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Normalise la réponse. Une ligne sans `userId` est écartée : sans lui, ni la
 * décision (PATCH) ni le lien vers la fiche ne sont possibles, et une carte
 * qu'on ne peut pas traiter n'a rien à faire dans une file de traitement.
 */
export function normalizePendingPhotos(raw: unknown): PendingPhoto[] {
  const list =
    raw !== null && typeof raw === 'object'
      ? (raw as { photos?: unknown }).photos
      : undefined;
  if (!Array.isArray(list)) return [];
  const out: PendingPhoto[] = [];
  for (const item of list) {
    if (item === null || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const userId = str(row.userId);
    if (!userId) continue;
    out.push({
      userId,
      displayName: str(row.displayName),
      email: str(row.email),
      photoPath: str(row.photoPath),
      photoUrl: str(row.photoUrl),
      submittedAt: str(row.submittedAt),
      hasPlayerProfile:
        typeof row.hasPlayerProfile === 'boolean' ? row.hasPlayerProfile : null,
    });
  }
  return out;
}

/**
 * Le nom sous lequel la file désigne la déposante : pseudo, puis email, puis
 * identifiant tronqué — la même chaîne de repli que la carte d'ajustement de
 * solde, pour qu'une joueuse ne porte pas deux noms d'un écran à l'autre.
 */
export function photoOwnerLabel(photo: PendingPhoto): string {
  return adminUserLabel({
    id: photo.userId,
    displayName: photo.displayName,
    email: photo.email,
  });
}
