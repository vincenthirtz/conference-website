// lib/i18n/locales/fr/teamRhythm.ts
//
// Traductions FRANCAISES du namespace `teamRhythm` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('teamRhythm', {
  title: "Rythme d'équipe",
  subtitle:
    "Peins tes créneaux habituels. L'équipe voit où elle est au complet — et peut en faire une annonce de scrim.",
  declaredCount: '{declared} / {total} ont déclaré',
  cellAvailable: '{count} disponible(s)',
  saveCta: 'Enregistrer mes créneaux',
  saving: 'Enregistrement…',
  saved: 'Tes créneaux sont enregistrés.',
  saveError: 'Enregistrement impossible.',
  coreTitle: 'Créneaux à {threshold} joueuses ou plus',
  coreEmpty: "Aucun créneau ne réunit encore l'effectif requis.",
  announceCta: 'Annoncer ces {count} créneaux aux autres équipes',
  announced: 'Annonce publiée : les équipes compatibles sont prévenues.',
  announceError: "Publication de l'annonce impossible.",
  suggestionNeverPlayed:
    "Vous êtes {count} le {slot} — et vous n'y jouez jamais.",
  suggestionRarelyPlayed:
    "Vous êtes {count} le {slot}, et vous n'y avez joué que {played} fois.",
  suggestionWhy:
    "C'est le créneau que votre équipe possède déjà sans rien changer à son organisation.",
  suggestionAnnounceCta: 'Chercher un scrim sur ce créneau',
  suggestionDismiss: 'Masquer cette suggestion',
});
