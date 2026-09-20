// lib/i18n/locales/fr/tcgShowcase.ts
//
// Traductions FRANCAISES du namespace `tcgShowcase` — SOURCE DE VERITE.
// Toute cle ajoutee ici doit l'etre aussi dans `../en/tcgShowcase.ts`
// (garde-fou de compilation : `locales/parity.ts`).
//
// La VITRINE du TCG : le reglage dans l'espace joueuse
// (`components/tcg/TcgShowcaseEditor.tsx`) et son affichage sur la fiche
// publique (`components/tcg/TcgShowcaseSection.tsx`). Opt-in : les textes
// disent ce qui devient public AVANT qu'on l'active.

import { ns } from '@/lib/i18n/ns';

export default ns('tcgShowcase', {
  // Fiche publique
  publicTitle: 'Vitrine TCG',
  publicIntro: 'Les cartes qu’elle a choisi de montrer.',

  // Espace joueuse
  editorTitle: 'Ma vitrine',
  editorIntro:
    'Choisis jusqu’à {max} cartes de ta collection à montrer sur ta fiche publique. Rien n’est affiché tant que tu n’actives pas la vitrine, et le reste de ta collection reste privé.',
  consentNote:
    'Les photos des joueuses suivent leur consentement : si l’une retire la sienne, ta vitrine montre son avatar à la place.',
  toggleLabel: 'Afficher ma vitrine sur ma fiche publique',
  statusOn: 'Visible sur ta fiche publique.',
  statusOff: 'Désactivée : rien n’est affiché.',
  viewProfile: 'Voir ma fiche publique',
  noProfile:
    'Ta fiche publique apparaîtra dès que tu seras sur un roster ou au classement : ta vitrine s’y affichera alors.',

  chosenTitle: 'Cartes choisies ({count} sur {max})',
  chosenEmpty: 'Aucune carte choisie pour l’instant.',
  remove: 'Retirer {name} de la vitrine',
  unnamed: 'Carte sans nom',
  unavailable_one:
    'Une carte choisie n’est plus dans ta collection : elle n’est plus exposée.',
  unavailable_other:
    '{count} cartes choisies ne sont plus dans ta collection : elles ne sont plus exposées.',

  chooseOpen: 'Choisir les cartes',
  chooseClose: 'Fermer la sélection',
  chooserLegend: 'Sélectionne jusqu’à {max} cartes',
  chooserLimit:
    'Tu as choisi {max} cartes : retire-en une pour en sélectionner une autre.',
  chooserEmpty:
    'Ta collection est vide : ouvre un paquet pour avoir des cartes à montrer.',
  chooserLoading: 'Chargement de ta collection…',
  chooserError: 'Impossible de charger ta collection.',
  kindPlayer: 'Joueuse',
  kindTeam: 'Équipe',
  kindMap: 'Map',
  kindFanart: 'Fan art',
  kindMascot: 'Mascotte',

  save: 'Enregistrer la vitrine',
  saving: 'Enregistrement…',
  saved: 'Vitrine enregistrée.',
  savedOff: 'Vitrine retirée de ta fiche publique.',
  errNotOwned: 'Une des cartes choisies n’est plus dans ta collection.',
  errGeneric: 'Enregistrement impossible. Réessaie dans un instant.',
  loadError: 'Impossible de charger ta vitrine pour le moment.',
  retry: 'Réessayer',
});
