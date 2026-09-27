// lib/i18n/locales/fr/soloSignup.ts
//
// Traductions FRANCAISES du namespace `soloSignup` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/soloSignup.ts` ; toute cle ajoutee ici
// doit l'etre aussi la-bas, sinon le garde-fou de parite casse le typecheck.
//
// Page /tournament/<id>/inscription-solo — l'inscription a un evenement
// « chacune pour soi ». Le ton evite soigneusement le mot « equipe » : la
// representation interne en est une (une equipe d'une joueuse), mais c'est un
// detail d'implementation dont la participante n'a pas a entendre parler.

import { ns } from '../../ns';

export default ns('soloSignup', {
  // --- En-tête -------------------------------------------------------------
  badge: 'Inscription individuelle',
  title: 'Je m’inscris',
  subtitle:
    'Pas besoin d’équipe ni de coéquipières : tu t’inscris seule, sous ton pseudo.',
  backToTournament: 'Retour à la page du tournoi',

  // --- Formulaire ----------------------------------------------------------
  formTitle: 'Ta fiche',
  formHint: 'Trois champs, deux minutes. Tu n’as pas besoin d’un compte.',

  pseudoLabel: 'Pseudo',
  pseudoHelp: 'C’est le nom sous lequel tu apparaîtras dans le classement.',
  pseudoPlaceholder: 'Ton pseudo en jeu',

  battleTagLabel: 'BattleTag',
  battleTagHelp: 'Format Pseudo#1234 — c’est avec ça qu’on t’invite en partie.',
  battleTagPlaceholder: 'Pseudo#1234',

  emailLabel: 'Email',
  emailHelp:
    'Sert à te retrouver et à t’envoyer ton lien de connexion. Jamais affiché publiquement.',
  emailPlaceholder: 'toi@exemple.fr',

  extraTitle: 'Informations complémentaires',
  extraRequiredMark: '(obligatoire)',
  extraSelectPlaceholder: 'Choisir…',

  captchaLabel: 'Anti-robot',
  captchaPlaceholder: 'Ta réponse',

  submit: 'M’inscrire',
  submitting: 'Inscription…',

  // --- Validation client ---------------------------------------------------
  validationPseudo: 'Indique un pseudo d’au moins 2 caractères.',
  validationEmail: 'Indique une adresse email valide.',
  validationBattleTag: 'BattleTag attendu au format Pseudo#1234.',
  validationCaptcha: 'Réponds à la question anti-robot.',
  validationFieldRequired: 'Ce champ est obligatoire.',

  // --- Résultats -----------------------------------------------------------
  successTitle: 'C’est fait, tu es inscrite',
  successBody:
    'Ton inscription à {tournament} est enregistrée. On se retrouve le jour J.',
  successPendingTitle: 'Inscription envoyée',
  successPendingBody:
    'Le staff valide les inscriptions à {tournament} une par une. Tu recevras un message dès que la tienne est confirmée.',
  successEmailSent:
    'Un lien de connexion vient de partir vers {email} : il te donne accès à ton espace joueuse.',
  successAnother: 'Inscrire une autre joueuse',

  // --- Erreurs -------------------------------------------------------------
  errGeneric: 'L’inscription a échoué. Réessaie dans un instant.',
  errRateLimited: 'Trop de tentatives. Réessaie dans quelques minutes.',
  errCaptchaInvalid:
    'Réponse anti-robot incorrecte. Une nouvelle question t’attend.',
  errNameTooShort: 'Ce pseudo est trop court.',
  errNameTooLong: 'Ce pseudo est trop long.',
  errSlugConflict:
    'Ce pseudo est déjà pris sur ce tournoi. Ajoute un chiffre ou une variante.',
  errBattletagRequired: 'Le BattleTag est obligatoire pour s’inscrire.',
  errBattletagInvalid: 'BattleTag attendu au format Pseudo#1234.',
  errFieldErrors: 'Certains champs sont à corriger.',
  errServiceUnavailable: 'Le service est momentanément indisponible.',
  errServerError: 'Une erreur est survenue de notre côté.',

  // --- États de la page ----------------------------------------------------
  closedTitle: 'Les inscriptions ne sont pas ouvertes',
  closedBody:
    'Cet événement n’accepte pas d’inscription pour le moment. Reviens un peu plus tard, ou demande au staff où ça en est.',
  prefilledNotice:
    'Pré-rempli depuis ton profil : vérifie, réponds à la question anti-robot et valide.',
  // --- Mode regroupé en équipes de 5 (pooled_teams) ---------------------------
  poolSubtitle:
    'Inscris-toi seule : dès que 5 joueuses de ton équipe sont inscrites, l’équipe est inscrite. Sans équipe, ou si ton équipe n’est pas au complet, le staff te place dans une équipe avant l’événement.',
  poolLoading: 'Chargement…',
  poolLoginTitle: 'Connecte-toi pour t’inscrire',
  poolLoginBody:
    'Ton compte nous dit dans quelle équipe tu joues : c’est ce qui permet d’inscrire ton équipe dès que vous êtes 5.',
  poolLoginCta: 'Me connecter',
  poolFormTitle: 'Mon inscription',
  poolFormHint:
    'Choisis ton équipe : elle est inscrite dès que {needed} de ses joueuses le sont. Sinon, tu passes en liste d’attente et le staff te place.',
  poolTeamLabel: 'Mon équipe',
  poolNoTeam: 'Je n’ai pas d’équipe',
  poolTeamHelp:
    'Seules les équipes où tu joues apparaissent (pas celles où tu es coach ou manager).',
  poolTeamLockedHelp:
    'Tu es déjà placée dans une équipe inscrite : pour en changer, contacte le staff.',
  poolSubmit: 'M’inscrire',
  poolSave: 'Enregistrer',
  poolCancel: 'Annuler',
  poolEdit: 'Modifier',
  poolWithdraw: 'Me retirer',
  poolErrNotMember: 'Tu ne fais pas partie de cette équipe.',
  poolTeamJustRegistered: 'Vous êtes 5 : ton équipe est inscrite ! 🎉',
  poolPlacedTitle: 'Tu es inscrite',
  poolPlacedBody: 'Tu joues dans l’équipe {team}.',
  poolWaitTeamTitle: 'En attente de ton équipe',
  poolWaitTeamBody:
    '{count} / {needed} joueuses de {team} sont inscrites. L’équipe sera inscrite automatiquement dès que vous serez {needed} : relance tes coéquipières !',
  poolWaitTeamFull:
    'Ton équipe est déjà inscrite avec 5 joueuses : tu restes en liste d’attente, le staff pourra te placer dans une autre équipe.',
  poolWaitSoloTitle: 'Tu es en liste d’attente',
  poolWaitSoloBody:
    'Le staff te placera dans une équipe avant l’événement. Tu seras prévenue.',
  poolRecap: 'Inscrite en tant que {pseudo} ({tag}).',
});
