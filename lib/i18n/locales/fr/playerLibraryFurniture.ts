// lib/i18n/locales/fr/playerLibraryFurniture.ts
//
// Traductions FRANCAISES du namespace `playerLibraryFurniture` — SOURCE DE
// VERITE. Les meubles de la Women's Library (lot 15 de
// docs/PLAN-womens-library.md) : le nom de chaque action, au survol d'un
// meuble (le moteur n'a pas d'i18n : la vue les lui passe) ; ce que fait la
// joueuse (annoncé aux lecteurs d'écran) et le bouton pour se relever ou
// arrêter, sous la scène.
// Namespace à part : il n'est importé que par la vue de la salle (chargée à
// la demande avec le moteur), il ne pèse pas sur le premier chargement.
// Toute clé ajoutée ici doit l'être aussi côté anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('playerLibraryFurniture', {
  actions: {
    sit: 'S’asseoir',
    lie: 'S’allonger',
    dress: 'Changer de tenue',
    read: 'Lire',
    play: 'Jouer',
    warm: 'Se réchauffer',
    music: 'Écouter de la musique',
    watch: 'Regarder',
    water: 'Arroser',
  },
  status: {
    sit: 'Tu es assise.',
    lie: 'Tu es allongée.',
    dress: 'Tu choisis ta tenue.',
    read: 'Tu lis.',
    play: 'Tu joues.',
    warm: 'Tu te réchauffes.',
    music: 'Tu écoutes de la musique.',
    watch: 'Tu regardes l’écran.',
    water: 'Tu arroses la plante.',
  },
  standUp: 'Se lever',
  stop: 'Arrêter',
});
