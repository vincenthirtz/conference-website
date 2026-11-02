// lib/i18n/locales/admin-fr/adminIdentity.ts
//
// Traductions FRANCAISES du namespace `adminIdentity` — SOURCE DE VERITE.
// Page owner « Comptes et connexion » (Better Auth, /admin/connexion).
// Le pendant anglais vit dans `../admin-en/<ns>.ts`.

import { adminNs } from '../../ns';

export default adminNs('adminIdentity', {
  headTitle: 'Admin – Comptes et connexion',
  title: 'Comptes et connexion',
  subtitle:
    "Better Auth : réglages, chiffres et gestes sur les comptes. Réservé à l'owner.",
  loadError: 'Impossible de charger les comptes.',
  unavailable:
    "La base des comptes ne répond pas, ou Better Auth n'est pas la source des comptes : chiffres et gestes indisponibles.",

  overviewTitle: 'État et chiffres',
  statAccounts: 'Comptes',
  statAccountsHint: '{unverified} non vérifié(s) · {banned} suspendu(s)',
  statSessions: 'Sessions actives',
  statSessionsHint: '{people} personne(s) · {aal2} avec second facteur',
  statSignIns: 'Connexions sur 7 jours',
  statSignInsHint: '{day} sur 24 h · {people} personne(s) sur 7 jours',
  statTwoFactor: 'Double authentification',
  statTwoFactorHint: 'comptes protégés',
  statMethods: 'Mot de passe / Discord',
  statMethodsHint: "{discordOnly} compte(s) n'ont que Discord",
  statThrottled: 'Adresses freinées',
  statThrottledHint: 'trop de tentatives de connexion (5 min)',
  staffTitle: 'Staff sans double authentification',
  staffAll: 'Tout le staff actif ({count}) a la double authentification.',
  staffSome:
    '{missing} membre(s) du staff actif sur {count} ne l’ont pas encore :',
  staffNoName: '(sans nom)',
  fixedTitle: 'Fixé dans le code',
  fixedMfa: "Second facteur exigé pour l'administration : {value}",
  yes: 'oui',
  no: 'non',
  fixedToken: 'Jetons de connexion valables {minutes} min',
  fixedCache: 'Session relue au plus toutes les {seconds} s',
  fixedSettings: 'Réglages appliqués partout en moins de {seconds} s',
  fixedAttempts: '{attempts} tentatives de connexion par 5 min et par adresse',

  settingsTitle: 'Réglages',
  settingsMissing:
    'La migration add_auth_settings.sql n’est pas encore appliquée : ces valeurs sont celles par défaut et ne peuvent pas être changées.',
  settingsUpdated: 'Modifiés le {date}',
  signupOpen: 'Inscriptions ouvertes',
  signupOpenHelp:
    'Fermées : plus de nouveau compte, ni par e-mail ni par Discord. Le staff peut toujours créer des comptes.',
  discordSignIn: 'Connexion par Discord',
  discordSignInHelp:
    "Coupée : les {discordOnly} compte(s) qui n'ont que Discord ne pourront plus se connecter.",
  magicLink: 'Lien de connexion par e-mail',
  magicLinkHelp:
    "Coupé pour les visiteurs seulement : Battle.net et l'accès équipe continuent.",
  sessionDays: 'Durée des sessions (jours)',
  sessionDaysHelp:
    'Entre 1 et 90. Pour les nouvelles connexions et les sessions prolongées.',
  save: 'Enregistrer',
  saved: 'Réglage enregistré : appliqué partout en moins d’une minute.',
  saveError: 'Réglage non enregistré : {error}',
  confirmDiscordOffTitle: 'Couper la connexion par Discord ?',
  confirmDiscordOffBody:
    "{discordOnly} compte(s) n'ont que Discord : ils ne pourront plus se connecter tant que ce réglage reste coupé.",
  confirmSignupOffTitle: 'Fermer les inscriptions ?',
  confirmSignupOffBody:
    "Plus personne ne pourra créer de compte, ni par e-mail ni par Discord, jusqu'à leur réouverture.",
  confirmOff: 'Couper',

  accountsTitle: 'Un compte',
  searchLabel: 'Adresse e-mail ou nom affiché',
  searchPlaceholder: '3 caractères au moins',
  search: 'Chercher',
  searching: 'Recherche…',
  noResult: 'Aucun compte trouvé.',
  accountsError: 'Recherche impossible : {error}',
  verified: 'Adresse vérifiée',
  unverified: 'Adresse non vérifiée',
  twoFactorOn: 'Double authentification',
  twoFactorOff: 'Sans double authentification',
  sessions: '{count} session(s) active(s)',
  providers: 'Méthodes : {list}',
  providerNone: 'aucune',
  providerCredential: 'mot de passe',
  providerDiscord: 'Discord',
  lastSignIn: 'Dernière connexion : {date}',
  neverSignedIn: 'Jamais connecté(e)',
  bannedUntil: 'Suspendu(e) jusqu’au {date}',
  actionRevoke: 'Fermer ses sessions',
  actionRemoveTwoFactor: 'Retirer la double authentification',
  actionResend: 'Renvoyer la vérification',
  confirmRevokeTitle: 'Fermer toutes les sessions de {email} ?',
  confirmRevokeBody:
    'La personne devra se reconnecter partout (effet complet sous 5 minutes).',
  confirmRemoveTitle: 'Retirer la double authentification de {email} ?',
  confirmRemoveBody:
    "Ses sessions sont fermées et elle est prévenue par e-mail. Elle se reconnecte par mot de passe ou Discord, puis s'enrôle à nouveau. Seulement après avoir vérifié son identité.",
  confirmResendTitle: "Renvoyer l'e-mail de vérification à {email} ?",
  confirmResendBody: 'Un nouveau lien, valable une heure.',
  confirmAction: 'Confirmer',
  doneRevoke: '{count} session(s) fermée(s).',
  doneRemove: 'Double authentification retirée, sessions fermées.',
  doneRemoveNone:
    "Ce compte n'avait pas de double authentification ; ses sessions sont fermées.",
  doneResend: 'E-mail de vérification envoyé.',
  doneResendFailed: "L'e-mail de vérification n'est pas parti.",
  actionError: 'Échec : {error}',

  dangerTitle: 'Urgence',
  dangerIntro:
    'Si un accès a fuité. Toi aussi seras déconnecté(e) : garde ton code de double authentification sous la main.',
  signOutAllTitle: 'Déconnecter tout le monde',
  signOutAllDescription:
    'Ferme toutes les sessions, la tienne comprise. Les jetons déjà donnés expirent en 5 minutes.',
  signOutAllAction: 'DÉCONNECTER',
  typeToConfirm: 'Tape « {name} » pour confirmer',
  cancel: 'Annuler',
  signOutAllDone: '{count} session(s) fermée(s). Retour à la connexion…',
});
