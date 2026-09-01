// utils/documents/driveLimits.ts
//
// Limites partagées client ↔ serveur du dépôt Drive.
//
// Elles vivent ici plutôt que dans `utils/googleDrive.ts` parce que ce
// module-là importe `node:crypto` : l'importer depuis un composant client
// ferait entrer Node dans le bundle du navigateur.

/** 25 Mo — un PV scanné tient dedans, une vidéo non (elle n'a rien à y faire). */
export const DRIVE_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
