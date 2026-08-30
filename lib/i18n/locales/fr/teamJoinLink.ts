// lib/i18n/locales/fr/teamJoinLink.ts
//
// Traductions FRANCAISES du namespace `teamJoinLink` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.
//
// Deux surfaces :
//   - la page publique /rejoindre/[token] (ce que voit la personne recrutee) ;
//   - le bloc « lien d'equipe » de l'espace equipe (cle prefixees `panel*`).

import { ns } from '../../ns';

export default ns('teamJoinLink', {
  // --- page publique -------------------------------------------------------
  pageTitle: 'Rejoindre une équipe',
  eyebrow: 'Invitation',
  heading: 'Rejoindre {team}',
  body: 'Ce lien t’ajoute au roster de {team} en tant que {role}.',
  loading: 'Chargement…',
  pending: 'Un instant…',
  join: 'Rejoindre l’équipe',
  loginRequired: 'Connecte-toi pour rejoindre cette équipe.',
  loginCta: 'Se connecter',
  registerCta: 'Créer un compte',
  battleTagLabel: 'Ton BattleTag',
  battleTagPlaceholder: 'Pseudo#1234',
  battleTagHint: 'Format Blizzard : pseudo, dièse, quatre chiffres.',
  specialtyLabel: 'Ton poste (optionnel)',
  specialtyNone: 'Je ne sais pas encore',
  specialtyTank: 'Tank',
  specialtyDps: 'DPS',
  specialtySupport: 'Support',
  specialtyFlex: 'Flex',
  remainingUses: 'Encore {count} place(s) via ce lien.',
  expiresAt: 'Ce lien expire le {date}.',
  joinedTitle: 'Bienvenue !',
  joinedBody: 'Tu fais désormais partie de {team}.',
  alreadyMemberTitle: 'Tu y es déjà',
  alreadyMemberBody: 'Tu fais déjà partie de {team}.',
  goToTeamSpace: 'Voir mon espace équipe',
  errorTitle: 'Lien indisponible',
  errorNotFound: 'Ce lien est invalide, expiré ou déjà utilisé.',
  errorNetwork: 'Une erreur réseau est survenue. Réessaie.',
  errorAction: 'L’inscription n’a pas pu être effectuée.',
  backHome: 'Retour à l’accueil',
  rolePlayer: 'joueuse',
  roleSubstitute: 'remplaçante',
  roleCoach: 'coach',
  roleManager: 'manager',

  // --- bloc de gestion (espace équipe) -------------------------------------
  panelTitle: 'Lien d’invitation',
  panelIntro:
    'Un lien privé à partager (Discord, vocal…) : qui l’ouvre s’inscrit au roster, sans passer par l’email.',
  panelNone: 'Aucun lien actif pour le moment.',
  panelGenerate: 'Générer un lien',
  panelRegenerate: 'Régénérer',
  panelRevoke: 'Révoquer',
  panelCopy: 'Copier',
  panelCopied: 'Lien copié',
  panelTokenOnce:
    'Copie-le maintenant : par sécurité, il ne sera plus jamais réaffiché.',
  panelActive: 'Lien actif, {role}, expire le {date}.',
  panelUses: '{used} utilisation(s) sur {max}.',
  panelUsesUnlimited: '{used} utilisation(s), sans plafond.',
  panelRoleLabel: 'Rôle attribué',
  panelMaxUsesLabel: 'Nombre d’entrées',
  panelMaxUsesUnlimited: 'Sans limite',
  panelTtlLabel: 'Valable',
  panelTtlDays: '{count} jours',
  panelConfirmRevoke: 'Révoquer ce lien ? Il cessera immédiatement de marcher.',
  panelError: 'Le lien n’a pas pu être mis à jour.',
});
