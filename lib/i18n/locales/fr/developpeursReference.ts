// lib/i18n/locales/fr/developpeursReference.ts
//
// Traductions FRANCAISES du namespace `developpeursReference` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('developpeursReference', {
  backToGuide: '← Retour au guide développeur',
  heroBadge: 'Référence générée',
  heroTitle: "Référence de l'API publique",
  heroSubtitle:
    'Générée automatiquement depuis notre spécification OpenAPI — toujours à jour avec les endpoints réellement servis. Importez la spec dans Postman ou votre outil de génération de code.',
  baseUrlLabel: 'Base URL :',
  downloadLabel: 'Télécharger la spec OpenAPI (JSON)',
  tocLabel: 'Sommaire des endpoints',
  endpointsLabel: 'Endpoints',
  schemasLabel: 'Schémas',
  authNone: 'Sans auth',
  authToken: 'Token requis',
  parametersLabel: 'Paramètres',
  requestBodyLabel: 'Corps de la requête',
  responsesLabel: 'Réponses',
  thParam: 'Paramètre',
  thIn: 'Emplacement',
  thType: 'Type',
  thDesc: 'Description',
  thProperty: 'Propriété',
  thStatus: 'Statut',
  thSchema: 'Schéma',
  requiredYes: 'requis',
  inPath: 'chemin',
  inQuery: 'requête',
  generatedNote:
    "Cette page est générée depuis docs/openapi.yaml à chaque déploiement — elle ne peut pas dériver du comportement réel de l'API.",
});
