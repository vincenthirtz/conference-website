// Bornes du message du formulaire de contact, partagées entre le schéma
// serveur (utils/validation.ts) et le formulaire (components/Form/Contact.tsx).
// Module volontairement sans dépendance : l'importer côté client n'embarque
// pas zod dans le bundle de la page publique.

export const CONTACT_MESSAGE_MIN_LENGTH = 10;
export const CONTACT_MESSAGE_MAX_LENGTH = 5000;
