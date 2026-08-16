// lib/i18n/locales/admin-fr/adminNotifications.ts
//
// Traductions FRANCAISES du namespace `adminNotifications` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminNotifications', {
  pageTitle: 'Admin – Notifications',
  breadcrumbAdmin: 'Admin',
  breadcrumbNotifications: 'Notifications',
  kicker: 'PWA & Web Push',
  heading: 'Notifications',
  intro:
    "Configure les notifications push reçues sur tes devices admin (PWA installée ou navigateur ouvert). Les préférences sont communes à tous tes devices ; l'abonnement ci-dessous concerne uniquement le device courant.",
  pwaWarning:
    "La PWA n'est pas activée dans cet environnement (NEXT_PUBLIC_ENABLE_PWA ≠ '1'). Les abonnements et tests ne fonctionneront que sur master/prod.",
  deviceStatusHeading: 'État de ce device',
  deviceStatusSubtitle:
    'Permission navigateur et abonnement push sur ce browser spécifique.',
  subscribing: 'Abonnement…',
  subscribe: 'Abonner ce device',
  unsubscribing: 'Désabonnement…',
  unsubscribe: 'Désabonner ce device',
  testSending: 'Envoi en cours…',
  sendTest: 'Envoyer une notification de test',
  deniedHelp:
    "La permission a été refusée. Pour réactiver, va dans les paramètres du site dans ton navigateur (icône cadenas dans la barre d'URL) et autorise les notifications, puis rafraîchis cette page.",
  prefsHeading: "Préférences par type d'événement",
  prefsSubtitle:
    "Décoche pour ne plus recevoir un type d'événement (sur tous tes devices).",
  savingPrefs: 'Enregistrement…',
  savePrefs: 'Enregistrer',
  loadingPrefs: 'Chargement des préférences…',
  toggleAria: 'Notifications {label}',
  statusSubscribed: 'Activées sur ce device',
  statusNoSub: 'Permission accordée — pas encore abonné·e ici',
  statusDefault: 'Non configurées',
  statusDenied: 'Refusées (paramètres navigateur)',
  statusUnsupported: 'Non supporté ({reason})',
  errorLoadPrefs: 'Erreur lors du chargement des préférences.',
  prefsSaved: 'Préférences enregistrées.',
  errorSave: "Erreur lors de l'enregistrement.",
  vapidMissing: 'Clé VAPID publique manquante côté serveur.',
  permissionDenied: 'Permission refusée par le navigateur.',
  permissionNotGranted: 'Permission non accordée.',
  deviceSubscribed: 'Device abonné aux notifications.',
  errorSubscribe: "Erreur lors de l'abonnement.",
  noActiveSub: 'Aucun abonnement actif sur ce device.',
  deviceUnsubscribed: 'Device désabonné.',
  errorUnsubscribe: 'Erreur lors du désabonnement.',
  testFailed: "Échec de l'envoi du test.",
  testResult: 'Test : {parts}.',
  testSent: '{count} envoi(s)',
  testExpired: '{count} expiré(s) purgé(s)',
  testFailedCount: '{count} échec(s)',
  groupMatchesCast: 'Matches & Cast',
  groupMatchesCastDesc: 'Tout ce qui bouge en plateau ou côté cast.',
  groupScrims: 'Scrims',
  groupTournoi: 'Tournoi',
  groupRegistrations: 'Inscriptions & Support',
  groupOthers: 'Autres',
  evtMatchStartingLabel: 'Match imminent',
  evtMatchStartingHint: "Quelques minutes avant le coup d'envoi.",
  evtMatchFinishedLabel: 'Match terminé',
  evtScoreReportedLabel: 'Score reporté',
  evtScoreReportedHint: "Une capitaine vient d'envoyer un score.",
  evtCastAssignedLabel: 'Cast assignée',
  evtCastUnassignedLabel: 'Cast retirée',
  evtScrimInvitationLabel: 'Invitation scrim',
  evtScrimConfirmedLabel: 'Scrim confirmé',
  evtTeamForfeitLabel: 'Forfait équipe',
  evtCheckinOpenedLabel: 'Check-in ouvert',
  evtRegistrationNewLabel: 'Nouvelle inscription',
  evtHelloassoPaymentLabel: 'Paiement HelloAsso',
  evtCaptainSupportLabel: 'Ticket capitaine ouvert',
  evtNewsPublishedLabel: 'News publiée',
  evtStaffRoleChangedLabel: 'Rôle staff modifié',
});
