// lib/i18n/locales/fr/registrationDeadline.ts
//
// Traductions FRANCAISES du namespace `registrationDeadline` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('registrationDeadline', {
  title: 'Inscriptions au tournoi 2026',
  deadline: 'Clôture le {date}.',
  countdown_one: 'Plus que {count} jour',
  countdown_other: 'Plus que {count} jours',
  lastDay: "C'est aujourd'hui",
  body: 'Joueuse, capitaine, coach ou manager : pour être validé·e dans un roster, il faut être présent·e des DEUX côtés — sur le serveur Discord et sur le site, avec les deux comptes liés. Être sur un seul des deux ne suffit pas.',
  stepSite: 'Compte sur le site',
  stepSiteDone: 'Fait — tu es connecté·e.',
  stepDiscord: 'Compte Discord lié',
  stepDiscordDone: 'Fait.',
  stepDiscordTodo:
    "Ton compte Discord n'est pas encore lié : sans lui, on ne peut pas te reconnaître sur le serveur.",
  joinReminder:
    'Et vérifie que tu as bien rejoint le serveur Discord du tournoi.',
  ctaLink: 'Lier mon compte Discord',
  ctaJoin: 'Rejoindre le Discord',
  dismiss: 'Masquer ce rappel',
});
