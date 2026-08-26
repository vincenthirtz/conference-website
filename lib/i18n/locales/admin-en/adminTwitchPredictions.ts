// lib/i18n/locales/admin-en/adminTwitchPredictions.ts
//
// Traductions ANGLAISES du namespace admin `adminTwitchPredictions`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTwitchPredictions.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  heading: 'Twitch Predictions',
  loading: 'Chargement de la connexion Twitch…',
  loadError: "Impossible de charger l'état de la connexion Twitch.",
  refresh: 'Rafraîchir',
  connectTitle: 'Connecter la chaîne Twitch',
  connectDescription:
    'Autorise cette régie à lancer des predictions, modérer le chat, gérer les points de chaîne et publier des messages sur ta chaîne Twitch.',
  connectButton: 'Connecter la chaîne',
  connectLoading: 'Redirection vers Twitch…',
  connectError: "Impossible d'obtenir l'URL d'autorisation Twitch.",
  connectedAs: 'Connecté : {login}',
  expiresAt: "Jeton valide jusqu'au {date}",
  disconnect: 'Déconnecter',
  disconnectConfirmTitle: 'Déconnecter la chaîne Twitch ?',
  disconnectConfirmSubtitle:
    "Les predictions ne pourront plus être pilotées tant que la chaîne n'est pas reconnectée.",
  disconnectConfirmLabel: 'Déconnecter',
  disconnecting: 'Déconnexion…',
  disconnectSuccess: 'Chaîne Twitch déconnectée.',
  disconnectError: 'Échec de la déconnexion.',
  predictionsHeading: 'Prediction en cours',
  statusLabel: 'Statut',
  statusActive: 'Ouverte aux paris',
  statusLocked: 'Verrouillée',
  statusResolved: 'Résolue',
  statusCanceled: 'Annulée',
  ariaStatus: 'État de la prediction',
  createHeading: 'Nouvelle prediction',
  titleLabel: 'Titre',
  titlePlaceholder: 'Qui va gagner la manche ?',
  titleCounter: '{count}/45',
  outcomesLabel: 'Issues',
  outcomesHint: 'Entre 2 et 10 issues.',
  outcomePlaceholder: "Nom de l'issue {n}",
  outcomeAriaLabel: 'Issue {n}',
  addOutcome: 'Ajouter une issue',
  removeOutcome: "Retirer l'issue {n}",
  windowLabel: 'Fenêtre de paris',
  windowHint: 'Durée pendant laquelle les spectateurs peuvent parier.',
  window30: '30 secondes',
  window60: '1 minute',
  window90: '1 min 30',
  window120: '2 minutes',
  window300: '5 minutes',
  launch: 'Lancer la prediction',
  launching: 'Lancement…',
  createSuccess: 'Prediction lancée.',
  titleRequired: 'Le titre est obligatoire.',
  outcomesRequired: 'Renseigne au moins deux issues.',
  lock: 'Verrouiller',
  locking: 'Verrouillage…',
  lockSuccess: 'Prediction verrouillée.',
  cancel: 'Annuler la prediction',
  canceling: 'Annulation…',
  cancelConfirmTitle: 'Annuler cette prediction ?',
  cancelConfirmSubtitle: 'Les points misés seront remboursés aux spectateurs.',
  cancelConfirmLabel: 'Annuler la prediction',
  cancelSuccess: 'Prediction annulée.',
  makeWinner: 'Faire gagner',
  resolving: 'Résolution…',
  resolveConfirmTitle: 'Faire gagner « {outcome} » ?',
  resolveConfirmSubtitle:
    'Les points seront distribués aux gagnants. Cette action est irréversible.',
  resolveConfirmLabel: 'Faire gagner',
  resolveSuccess: 'Prediction résolue.',
  winnerBadge: 'Gagnant',
  outcomeUsers: '{count} parieurs',
  outcomeChannelPoints: '{points} points',
  terminalResolved: 'Prediction résolue.',
  terminalCanceled: 'Prediction annulée.',
  newPrediction: 'Nouvelle prediction',
  errorNotConnected:
    "La chaîne Twitch n'est plus connectée. Reconnecte-la pour piloter les predictions.",
  errorMissingScope:
    'Scope manquant. Reconnecte la chaîne pour accorder le scope predictions.',
  errorGeneric: "L'action a échoué.",
  oauthConnected: 'Chaîne Twitch connectée.',
  oauthError: 'La connexion à Twitch a échoué.',
};
