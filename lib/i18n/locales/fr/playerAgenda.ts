// lib/i18n/locales/fr/playerAgenda.ts
//
// Traductions FRANCAISES du namespace `playerAgenda` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts`. Toute cle ajoutee ici doit
// l'etre aussi cote anglais : le garde-fou `../parity.ts` casse le typecheck.

import { ns } from '../../ns';

export default ns('playerAgenda', {
  title: 'Mon agenda',
  subtitle: 'Tes échéances des quatre prochaines semaines, toutes équipes.',
  empty: 'Rien de prévu dans les quatre prochaines semaines.',
  loadError: "L'agenda n'a pas pu être chargé.",
  thisWeek: 'Cette semaine',
  nextWeek: 'Semaine prochaine',
  weekOf: 'Semaine du {date}',
  kindMatch: 'Match',
  kindScrim: 'Scrim',
  kindDeadline: 'Échéance',
  checkinAt: 'check-in à {time}',
  seeAll: 'Voir tous mes matchs ↗',

  subscribeTitle: 'Recevoir dans mon calendrier',
  subscribeBody:
    "Abonne ton agenda (Google, Apple, Outlook) : les matchs s'y mettent à jour tout seuls, y compris quand un horaire change.",
  subscribeCta: 'Créer mon lien',
  subscribeCreating: 'Création…',
  subscribeCopy: 'Copier le lien',
  subscribeOpen: 'Ouvrir dans mon agenda ↗',
  subscribeRotate: 'Régénérer',
  subscribeRevoke: 'Révoquer',
  subscribeRevoked: 'Lien révoqué.',
  subscribeCreated: 'Lien créé.',
  subscribeRotated: 'Nouveau lien créé — l’ancien ne fonctionne plus.',
  subscribeError: 'Le lien n’a pas pu être mis à jour.',
  subscribeWarning:
    'Ce lien donne accès à ton agenda sans mot de passe : ne le partage pas. En cas de doute, régénère-le.',
  subscribeSince: 'Créé le {date}',
  subscribeLastUsed: 'Dernier accès le {date}',
  subscribeNeverUsed: 'Jamais utilisé pour l’instant.',
});
