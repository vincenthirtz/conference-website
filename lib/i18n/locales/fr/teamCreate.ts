// lib/i18n/locales/fr/teamCreate.ts
//
// Traductions FRANCAISES du namespace `teamCreate` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('teamCreate', {
  badgePublic: 'Public',
  badgeTeam: 'Équipe',
  title: 'Créer une équipe',
  subtitle:
    'Ajoute les infos principales de ton équipe et, si tu veux, renseigne tout le roster (emails existants ou comptes créés automatiquement) en une seule fois.',
  tournamentEyebrow: 'Inscription au tournoi',
  tournamentRegisteredText:
    'Ton équipe sera automatiquement inscrite au tournoi',
  registrationsEyebrow: 'Inscriptions équipes',
  registrationsDesc:
    'Les jalons et dates clés sont détaillés dans la roadmap. Consulte la timeline 2026 pour anticiper les prochaines étapes.',
  viewTimeline: 'Voir la timeline 2026 ↗',
  firstTimeEyebrow: 'Première fois ?',
  firstTimeDesc:
    'Découvre en images ce que tu peux faire depuis ton espace capitaine : roster, candidatures, scrims, check-in et messagerie.',
  viewGuide: 'Voir le guide capitaine ↗',
  teamInfoEyebrow: 'Informations équipe',
  mainDetailsTitle: 'Détails principaux',
  backHomeArrow: "← Retour à l'accueil",
  backHome: "Retour à l'accueil",
  nameLabel: "Nom de l'équipe",
  namePlaceholder: 'Ex : Phénix',
  shortNameLabel: 'Tag / short name',
  countryLabel: 'Pays / région',
  countryPlaceholder: 'France, Europe…',
  discordLabel: 'Discord / contact (optionnel)',
  logoLabel: 'Logo (URL)',
  websiteLabel: 'Site web (optionnel)',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'Pitch rapide, palmarès, ambitions…',
  rosterEyebrow: 'Roster (optionnel)',
  rosterTitle: 'Ajouter plusieurs joueuses',
  rosterMax: "Jusqu'à 5 personnes",
  emailLabel: 'Email',
  emailPlaceholder: 'joueuse@email.tld',
  roleLabel: 'Rôle',
  battleTagLabel: 'BattleTag',
  battleTagPlaceholder: 'Pseudo#0000',
  battleTagOptionalNote: 'Optionnel hors inscription tournoi.',
  customFieldsEyebrow: 'Inscription',
  customFieldsTitle: 'Informations complémentaires',
  customFieldRequiredMark: '*',
  customFieldSelectPlaceholder: 'Sélectionner…',
  customFieldRequiredError: 'Ce champ est requis.',
  specialtyLabel: 'Spécialité',
  specialtyNone: 'Non précisée',
  specialtyTank: 'Tank',
  specialtyDps: 'DPS',
  specialtySupport: 'Support',
  specialtyFlex: 'Flex',
  captainLabel: 'Capitaine',
  captainDesignatedLabel: 'Capitaine désignée',
  creatorRoleLegend: 'Tu crées cette équipe en tant que',
  creatorRoleCaptain: 'Capitaine',
  creatorRoleCaptainHint:
    "Tu joues dans l'équipe et tu la diriges. Tu es ajoutée tout de suite au roster.",
  creatorRoleManager: 'Manager',
  creatorRoleManagerHint:
    "Tu encadres l'équipe sans y jouer. Tu gères le roster, les scrims et les inscriptions — et tu peux encadrer plusieurs équipes.",
  managerEmailLabel: 'Ton email (manager)',
  managerEmailHint:
    "C'est à cette adresse qu'est envoyé le lien d'accès à ton espace équipe.",
  managerCaptainNote:
    'Désigne la capitaine parmi les joueuses si tu la connais déjà : elle prendra le capitanat en acceptant son invitation. Sinon, tu pourras la désigner plus tard depuis ton espace équipe.',
  removeMember: 'Retirer',
  addMember: 'Ajouter une personne',
  addMemberHint:
    "On recherche l'utilisateur par email ; si aucun compte n'existe, il est créé automatiquement avant d'être ajouté.",
  addStaff: 'Ajouter du staff',
  addStaffHint:
    "Effectif jouant complet. Tu peux quand même déclarer du staff : coach et manager n'occupent pas de place dans le roster.",
  captchaLabel: 'Vérification anti-bot',
  captchaPlaceholder: 'Réponse',
  captchaRefresh: 'Autre question ↻',
  submitting: 'Création...',
  submit: "Créer l'équipe",
  errorBattleTagRequired:
    "BattleTag requis pour chaque membre (format Pseudo#0000) lors d'une inscription à un tournoi.",
  errorBattleTagInvalid:
    'Format BattleTag invalide (attendu : Pseudo#0000). Laisse vide si tu préfères ne pas le renseigner.',
  errorCreateFailed: "Impossible de créer l'équipe",
  toastCreated:
    "Équipe créée ! Les joueuses invitées doivent accepter l'invitation pour rejoindre.",
  errorUnexpected: 'Erreur inattendue',
  resultTitle: 'Résultat',
  resultCreatedFallback: 'Équipe créée',
  resultTeamLabel: 'Équipe :',
  resultIdLabel: 'ID :',
  resultRegistered: 'Inscrite au tournoi « {name} »',
  resultApplied: 'Candidature déposée pour le tournoi « {name} »',
  resultAppliedDesc:
    "Tant que tes coéquipières n'ont pas accepté leur invitation, l'inscription n'est pas automatique : le staff valide la candidature. Tu peux suivre l'avancement depuis ton espace équipe.",
  viewTeamPage: 'Voir la page équipe ↗',
  invitedPlayers: 'Joueuses invitées',
  invitedPlayersHint:
    "Elles doivent accepter l'invitation depuis leur espace joueuse pour rejoindre l'équipe.",
  memberRoleLabel: 'role :',
  memberCaptainLabel: 'capitaine :',
  yes: 'oui',
  no: 'non',
  resultEmpty:
    "Après validation, l'équipe créée et les membres liés (si fournis) s'afficheront ici.",
  note1:
    'Les membres sont recherchés par email dans Supabase auth; un compte est créé si besoin.',
  note2:
    "Les co-équipières reçoivent une invitation : elles rejoignent l'équipe une fois qu'elles l'ont acceptée.",
  note3: 'Sélectionne un capitaine dans la liste si besoin.',
  note4: 'Le slug est généré automatiquement à partir du nom.',
  stepLabel: 'Étape {current} sur {total}',
  stepIdentity: 'Identité',
  stepRoster: 'Roster',
  stepSubmit: 'Tournoi & envoi',
  next: 'Suivant',
  previous: 'Précédent',
  roleOptionPlayer: 'Joueuse',
  roleOptionCoach: 'Coach',
  roleOptionSub: 'Remplaçante',
  roleOptionManager: 'Manager',
  validationNameRequired: "Le nom de l'équipe est requis.",
  validationNameTooShort: 'Le nom doit contenir au moins 2 caractères.',
  validationNameTooLong: 'Le nom ne peut pas dépasser 100 caractères.',
  validationLogoUrl: "L'URL du logo est invalide (http:// ou https://).",
  validationWebsiteUrl: "L'URL du site web est invalide (http:// ou https://).",
  validationDiscordUrl: 'Le lien Discord est invalide (http:// ou https://).',
  validationEmailInvalid: 'Adresse email invalide : {email}',
  validationCaptainRequired: 'Sélectionne une capitaine parmi les membres.',
  validationManagerEmailRequired: 'Renseigne ton email de manager.',
  validationManagerEmailDuplicate:
    "Cet email est déjà celui d'une joueuse du roster : utilise une autre adresse.",
  validationSummary: 'Corrige les points suivants avant de continuer :',
  errRateLimited: 'Trop de tentatives. Réessaie dans quelques minutes.',
  errHoneypot: 'Envoi refusé. Recharge la page et réessaie.',
  errCaptchaInvalid:
    'Réponse anti-bot incorrecte ou expirée. Une nouvelle question a été générée.',
  errNameRequired: "Le nom de l'équipe est requis.",
  errNameTooShort: 'Le nom doit contenir au moins 2 caractères.',
  errNameTooLong: 'Le nom ne peut pas dépasser 100 caractères.',
  errDescriptionTooLong: 'La description ne peut pas dépasser 2000 caractères.',
  errInvalidUrl: 'Une des URL (logo, site web ou Discord) est invalide.',
  errTooManyMembers: 'Une équipe ne peut pas dépasser 5 membres.',
  errCaptainRequired: "Une capitaine est requise pour l'équipe.",
  errMultipleCaptains: 'Une seule capitaine peut être désignée.',
  errManagerEmailInvalid: "L'email du manager est invalide.",
  errManagerDuplicate:
    "L'email du manager ne peut pas être aussi celui d'une joueuse du roster.",
  errBattletagRequired:
    "BattleTag requis pour l'inscription au tournoi (format Pseudo#0000).",
  errBattletagInvalid: 'Format de BattleTag invalide (attendu : Pseudo#0000).',
  errFieldErrors:
    "Certains champs d'inscription sont invalides. Corrige-les ci-dessous.",
  errSlugConflict:
    'Une équipe portant ce nom existe déjà. Choisis un autre nom.',
  errTenantUnknown:
    'Organisation introuvable. Recharge la page ou contacte le staff.',
  errServiceUnavailable:
    'Service temporairement indisponible. Réessaie dans un instant.',
  errServerError: 'Une erreur inattendue est survenue. Réessaie plus tard.',
  partialWarningTitle: 'Inscription au tournoi à finaliser',
  partialWarningDesc:
    "Ton équipe a bien été créée, mais l'inscription au tournoi n'a pas pu être finalisée automatiquement (roster incomplet ou tournoi complet).",
  partialWarningAction:
    "Réessaie depuis ton espace capitaine ou contacte le staff pour finaliser l'inscription.",
  contactStaffCta: 'Contacter le staff',
  accessEmailTitle: 'Accède à ton espace équipe',
  accessEmailSent:
    'Un lien de connexion a été envoyé à {to} pour accéder à ton espace équipe.',
  goToLogin: 'Se connecter',
  previewTitle: 'Aperçu',
  previewLive: 'En direct',
  previewNamePlaceholder: 'Ton équipe',
  previewRosterEmpty:
    "Ajoute des joueuses à l'étape « Roster » pour les voir apparaître ici.",
  successHeading: 'Ton équipe est créée !',
  createAnother: 'Créer une autre équipe',
});
