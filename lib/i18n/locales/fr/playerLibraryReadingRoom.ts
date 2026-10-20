// lib/i18n/locales/fr/playerLibraryReadingRoom.ts
//
// Traductions FRANÇAISES du namespace `playerLibraryReadingRoom` — SOURCE DE VÉRITÉ.
// Women's Library, lot 8 (la Grande salle de lecture dans le monde) de docs/PLAN-womens-library.md.
// Toute clé ajoutée ici doit l'être aussi côté anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.
//
// SEULEMENT CE QUI EST PROPRE À LA SALLE. Le contenu des rayonnages (numéros,
// guides, signalement, charte), les boutons du guichet et la sortie rapide
// viennent du namespace `safetyPage` (page /securite) : une seule source.
// Ton calme ; aucune promesse que l'association ne tiendrait pas.

import { ns } from '../../ns';

export default ns('playerLibraryReadingRoom', {
  // ── L'arrivée, discrète ─────────────────────────────────────────────────
  welcome: {
    title: 'Tu es entrée discrète',
    body: 'Personne ne te voit, et personne ne sait que tu es là. Toi, tu vois seulement celles qui ont choisi d’être visibles.',
    noTrace:
      'La Library ne compte pas les visites de cette salle et ne garde aucune liste de celles qui y viennent.',
    visible:
      'Si tu choisis « Être visible », les autres voient ton avatar et tes signes. Tu peux redevenir discrète à tout moment.',
    silence:
      'Ici, pas de chat : la salle reste silencieuse, avec seulement quelques emotes douces.',
  },

  // ── Les rayonnages ──────────────────────────────────────────────────────
  shelves: {
    title: 'Les rayonnages',
    intro:
      'Choisis un rayonnage pour le lire ici. Les mêmes contenus sont sur la page Aide et sécurité, ouverte à toutes, sans compte.',
    summaries: {
      helplines: 'Numéros gratuits : {numbers}.',
      guides: 'Réagir en jeu, sur Discord et en stream.',
      report: 'Ce qui se passe quand tu nous signales quelque chose.',
      charter: 'Les règles de la communauté, en cours d’écriture.',
    },
    readOnPage: 'Lire sur la page Aide et sécurité',
    newTab: '(nouvel onglet)',
    close: 'Fermer',
  },

  // ── Le guichet ──────────────────────────────────────────────────────────
  guichet: {
    title: 'Le guichet',
    body: 'Pour signaler un comportement à l’équipe de modération de l’association : ici, ailleurs dans la Library, en jeu, sur Discord ou en stream.',
    noContext: 'Le formulaire ne dit pas que tu viens de cette salle.',
  },
});
