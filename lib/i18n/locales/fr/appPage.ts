// lib/i18n/locales/fr/appPage.ts
//
// Traductions FRANCAISES du namespace `appPage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('appPage', {
  heroBadge: 'Application installable',
  heroTitleGradient: 'Vis le tournoi',
  heroTitleRest: 'sans rater un match',
  heroSubtitle:
    "L'app OW Women's Cup s'installe en un clic sur ton bureau ou ton téléphone. Notifs, raccourcis, compteur sur l'icône, mode hors-ligne — tout ce qu'une app native fait, sans le passage par le store.",
  installedLabel: 'App installée — tu y es déjà',
  installBtn: "Installer l'app",
  howToInstall: 'Comment installer ?',
  seeFeatures: 'Voir les fonctionnalités',
  noPromptHint:
    "Ton navigateur n'a pas (encore) proposé l'install. Utilise le menu de Chrome / Edge → « Installer l'application », ou consulte la FAQ ci-dessous.",
  featuresTitle: "Ce qu'elle change",
  featuresSubtitle: "Pas un wrapper. Vraiment l'app que tu attendais.",
  feature1Title: 'Notifs en temps réel',
  feature1Desc:
    "Match imminent, check-in ouvert, score reporté, scrim acceptée : sois alertée même quand l'onglet est fermé.",
  feature2Title: 'Compteur taskbar',
  feature2Desc:
    "L'icône épinglée affiche un compteur rouge avec ton nombre de notifs non-lues. Plus besoin de checker l'onglet.",
  feature3Title: 'Fonctionne hors ligne',
  feature3Desc:
    'Wifi qui flanche au pire moment ? Tes actions critiques (check-in, score) sont mises en file et envoyées dès le retour de la connexion.',
  feature4Title: "Boutons d'action dans les notifs",
  feature4Desc:
    'Clique "Voir le match" ou "Ouvrir le ticket" directement dans la notification, sans avoir à naviguer.',
  feature5Title: "Raccourcis depuis l'icône",
  feature5Desc:
    "Clic droit sur l'icône épinglée = menu raccourcis : Tournois, Notifications, Espace joueur, Cockpit caster — un clic, t'es au bon endroit.",
  feature6Title: 'Écran qui reste allumé',
  feature6Desc:
    "En cockpit caster pendant un BO3 de 40 min sans frappe clavier ? L'écran ne s'éteint pas tant que tu es sur la page.",
  feature7Title: 'UI sans barre Chrome',
  feature7Desc:
    "Une fois installée, plus de barre d'adresse ni d'onglets : c'est juste l'app, comme un client desktop natif.",
  feature8Title: 'Update sans effort',
  feature8Desc:
    "Quand une nouvelle version arrive, un petit banner te le dit. Tu cliques \"Recharger\" quand ça t'arrange — pas d'app store, pas d'attente.",
  audiencesTitle: 'Selon ce que tu fais',
  audiencesSubtitle:
    "L'app s'adapte à ton rôle. Trois entrées, une seule install.",
  audience1Title: 'Joueuses & capitaines',
  audience1Desc: 'Pilote ton tournoi depuis ton téléphone ou ton bureau.',
  audience1Bullet1: 'Notifs match imminent / check-in ouvert / score reporté',
  audience1Bullet2: 'Invitations scrim et confirmations',
  audience1Bullet3: "Compteur sur l'icône taskbar pour tes actions en attente",
  audience1Bullet4: 'Espace équipe, messagerie inter-capitaines, scrims',
  audience1Cta: 'Mon espace joueuse',
  audience2Title: 'Casters',
  audience2Desc: "Reste concentrée sur ton match, l'app gère le reste.",
  audience2Bullet1: 'Cockpit caster : segments du jour, briefing, hotkeys',
  audience2Bullet2: 'Écran qui reste allumé pendant un BO sans clavier',
  audience2Bullet3: 'Notifs assignations, signaux Director et cues urgents',
  audience2Bullet4: "Raccourci direct vers le cockpit depuis l'icône épinglée",
  audience2Cta: 'Cockpit cast',
  audience3Title: 'Staff & admins',
  audience3Desc: 'Le back-office complet, déclinable en PWA.',
  audience3Bullet1: 'Notifs match, score reporté, disputes, scrim, support',
  audience3Bullet2: "Compteur précis sur l'icône d'actions à traiter",
  audience3Bullet3: "Boutons d'action directement dans les notifs",
  audience3Bullet4: 'Raccourcis Tournois / Notifs / Support / Cockpit',
  audience3Cta: 'Espace admin',
  installTitle: "Comment l'installer ?",
  installStep1Label: 'Windows / macOS',
  installStep1Body:
    "Chrome ou Edge → icône d'install à droite de la barre d'adresse, OU menu ⋮ → \"Installer l'application\".",
  installStep2Label: 'Android',
  installStep2Body:
    "Chrome → menu ⋮ → \"Ajouter à l'écran d'accueil\". L'app apparaît comme une appli normale.",
  installStep3Label: 'iOS / iPadOS',
  installStep3Body:
    'Safari → bouton Partager ↗ → "Sur l\'écran d\'accueil". iOS ≥ 16.4 pour les notifs.',
  installStep4Label: 'Linux',
  installStep4Body:
    'Chrome ou Edge supportent l\'install standalone (menu ⋮ → "Installer"). Firefox : pas encore.',
  installNowBtn: 'Installer maintenant',
  faqTitle: 'Questions fréquentes',
  faqSubtitle: 'Doutes ? Voici ce que les autres ont demandé.',
  faq1Q: 'Sur quels appareils ça marche ?',
  faq1A:
    "Windows 11 (Edge / Chrome), macOS, Linux, Android et iOS ≥ 16.4. Sur iOS, certaines fonctionnalités (badge taskbar, action buttons) sont limitées par Apple — l'essentiel marche partout.",
  faq2Q: 'Comment installer ?',
  faq2A:
    "Depuis cette page ou n'importe quelle page du site : clique sur l'icône d'installation à droite de la barre d'adresse, ou ouvre le menu Chrome / Edge → \"Installer l'application\". Sur Android, \"Ajouter à l'écran d'accueil\". Sur iOS, partager → \"Sur l'écran d'accueil\".",
  faq3Q: 'Pourquoi pas une vraie app sur le Store ?',
  faq3A:
    "Une PWA évite les frais Apple / Google Play, les délais de validation, et te livre les updates en quelques secondes (vs des jours sur les stores). Le code tourne en navigateur — pas de download de 80 Mo, pas d'autorisations système intrusives.",
  faq4Q: 'Et mes données ?',
  faq4A:
    "Aucune. La PWA est exactement le même site, juste épinglé en icône. On stocke ton token de session (auth Supabase) en local pour ne pas devoir te reconnecter à chaque fois, et c'est tout.",
  faq5Q: 'Comment désinstaller ?',
  faq5A:
    "Sur Windows : clic droit sur l'icône taskbar → Désinstaller. Sur macOS : depuis le menu de l'app → Désinstaller. Android : appui long sur l'icône → Désinstaller. Tes données restent sur le site (la PWA n'est qu'un raccourci).",
  faq6Q: 'Je peux activer les notifs sans installer ?',
  faq6A:
    "Oui — depuis ton espace admin / caster / joueur, le banner d'activation des notifications marche aussi en navigateur classique. L'install ajoute juste l'icône taskbar, les raccourcis et le mode hors-ligne.",
});
