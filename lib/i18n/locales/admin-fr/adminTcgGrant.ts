// lib/i18n/locales/admin-fr/adminTcgGrant.ts
//
// Traductions FRANCAISES du namespace `adminTcgGrant` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/adminTcgGrant.ts`. Toute cle
// ajoutee ici doit l'etre aussi cote anglais : le garde-fou de compilation
// `../admin-parity.ts` casse le typecheck sinon.
//
// VOCABULAIRE D'UNE CORRECTION, JAMAIS D'UN ACHAT. Cette carte repare un solde
// faux ; la monnaie du TCG se gagne et ne s'achete pas (cf. docs/TCG.md §4).
// Aucun libelle ne dit « prix », « offrir », « boutique » ou « recharger » :
// un ecran staff qui parle de distribuer des pieces finit par servir a ca.
//
// Formes impersonnelles : l'admin melange « tu » et « vous », ce namespace
// n'en impose aucun des deux.

import { adminNs } from '../../ns';

export default adminNs('adminTcgGrant', {
  heading: 'Ajuster un solde',
  subtitle:
    'Corriger le solde de pièces d’une joueuse quand il est faux : gain non crédité, doublon, erreur de saisie. Chaque ajustement est écrit au registre avec son motif et journalisé. Ce n’est pas un moyen de distribuer des pièces — elles se gagnent.',

  // Sélection du compte
  playerLabel: 'Joueuse',
  playerHint:
    'Recherche par pseudo, BattleTag ou email, ou identifiant du compte collé tel quel.',
  searchPlaceholder: 'Pseudo, BattleTag, email ou identifiant',
  resultsLabel: 'Comptes trouvés',
  searching: 'Recherche…',
  searchMinChars: 'Au moins 2 caractères pour lancer la recherche.',
  searchNoResult: 'Aucun compte ne correspond.',
  searchError:
    'La recherche a échoué. L’identifiant du compte peut être collé directement.',
  searchForbidden:
    'La recherche de comptes n’est pas ouverte à ce rôle : coller l’identifiant du compte, visible dans l’adresse de sa fiche.',
  /** Interpole `{id}`. */
  useTypedId: 'Utiliser l’identifiant {id}',
  /** Interpole `{team}`. */
  resultTeam: 'Équipe : {team}',
  /** Interpole `{id}`. */
  selectedId: 'Identifiant : {id}',
  changePlayer: 'Changer',
  /** Interpole `{count}`. Annonce aux lecteurs d'écran. */
  resultsCount: '{count} compte(s) trouvé(s)',

  // Montant
  amountLabel: 'Montant (pièces)',
  /** Interpole `{max}`. */
  amountHint:
    'Positif pour créditer, négatif pour retirer. Entre −{max} et {max}, jamais 0.',
  /** Interpole `{amount}`. */
  amountPreviewCredit: 'Crédit de {amount} pièce(s)',
  /** Interpole `{amount}`. */
  amountPreviewDebit: 'Retrait de {amount} pièce(s)',

  // Motif
  reasonLabel: 'Motif',
  reasonHint:
    'Obligatoire. Lu dans le journal staff : ce qui est corrigé, et pourquoi.',
  reasonPlaceholder:
    'Ex. victoire du 12/09 non créditée (match rejoué après annulation)',
  /** Interpole `{count}` et `{max}`. */
  reasonCounter: '{count} / {max}',

  submit: 'Vérifier et appliquer',
  submitting: 'Application…',

  // Validation locale
  errUserRequired: 'Choisir la joueuse concernée.',
  errUserInvalid: 'Ce n’est pas un identifiant de compte valide.',
  errAmountRequired: 'Indiquer un montant.',
  errAmountNotInteger: 'Le montant doit être un nombre entier de pièces.',
  errAmountZero: 'Un ajustement de 0 pièce ne corrige rien.',
  /** Interpole `{max}`. */
  errAmountTooLarge:
    'Au plus {max} pièces par ajustement, dans un sens comme dans l’autre.',
  errReasonRequired: 'Le motif est obligatoire.',
  /** Interpole `{min}`. */
  errReasonTooShort: 'Motif trop court ({min} caractères minimum).',
  /** Interpole `{max}`. */
  errReasonTooLong: 'Motif trop long ({max} caractères maximum).',

  // Confirmation : elle RÉPÈTE l'intention exacte, pas une formule vague.
  /** Interpole `{amount}`. */
  confirmTitleCredit: 'Créditer {amount} pièce(s) ?',
  /** Interpole `{amount}`. */
  confirmTitleDebit: 'Retirer {amount} pièce(s) ?',
  /** Interpole `{amount}`, `{name}` et `{reason}`. */
  confirmSummaryCredit: '+{amount} pièce(s) à {name}, motif : « {reason} »',
  /** Interpole `{amount}`, `{name}` et `{reason}`. */
  confirmSummaryDebit: '−{amount} pièce(s) à {name}, motif : « {reason} »',
  /** Interpole `{id}`. */
  confirmAccount: 'Compte : {id}',
  confirmLedgerNote:
    'L’ajustement est écrit au registre et journalisé. Il ne s’efface pas : une erreur se corrige par un ajustement inverse.',
  confirmCredit: 'Créditer',
  confirmDebit: 'Retirer',

  // Résultat
  /** Interpole `{name}` et `{balance}`. */
  resultApplied:
    'Ajustement appliqué à {name}. Solde résultant : {balance} pièce(s).',
  /** Interpole `{name}`. Réponse sans solde lisible : on ne l'invente pas. */
  resultAppliedNoBalance: 'Ajustement appliqué à {name}.',
  /** Interpole `{name}` et `{balance}`. */
  resultReplayed:
    'Cet ajustement était déjà enregistré : rien n’a été appliqué deux fois. Solde de {name} : {balance} pièce(s).',
  /** Interpole `{name}`. */
  resultReplayedNoBalance:
    'Cet ajustement était déjà enregistré pour {name} : rien n’a été appliqué deux fois.',
  toastApplied: 'Solde ajusté.',

  // Erreurs de l'endpoint, par `code` stable (cf. tcgGrantForm.ts)
  errInvalidBody:
    'Demande refusée par le serveur : vérifier le montant et le motif.',
  errUserNotFound: 'Ce compte est introuvable dans cet espace.',
  errInsufficientBalance:
    'Retrait impossible : le solde de cette joueuse est inférieur au montant retiré.',
  /** Interpole `{balance}`. Variante quand l'endpoint joint le solde disponible. */
  errInsufficientBalanceWithBalance:
    'Retrait impossible : cette joueuse n’a que {balance} pièce(s).',
  errBalanceChanged:
    'Le solde a bougé pendant le retrait (une dépense simultanée). Rien n’a été appliqué : relancer.',
  errForbidden: 'Ce rôle ne permet pas d’ajuster les soldes.',
  errRateLimited:
    'Trop d’ajustements d’affilée. Patienter une minute avant de relancer.',
  errQueued:
    'Connexion perdue : l’ajustement est en file et partira à la reconnexion. Relancer ce même envoi réutilise sa clé, sans double application.',
  errNetwork:
    'Réseau indisponible. Relancer ce même envoi réutilise sa clé : il ne s’appliquera pas deux fois.',
  errUnknown:
    'Réponse inattendue du serveur. Relancer ce même envoi réutilise sa clé : s’il avait abouti, il ne s’appliquera pas deux fois.',
});
