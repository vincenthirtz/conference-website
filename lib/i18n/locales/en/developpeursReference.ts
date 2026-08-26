// lib/i18n/locales/en/developpeursReference.ts
//
// Traductions ANGLAISES du namespace `developpeursReference`.
//
// La SOURCE DE VERITE est le francais (`../fr/developpeursReference.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  backToGuide: '← Back to developer guide',
  heroBadge: 'Generated reference',
  heroTitle: 'Public API reference',
  heroSubtitle:
    'Generated automatically from our OpenAPI specification — always in sync with the endpoints actually served. Import the spec into Postman or your codegen tool.',
  baseUrlLabel: 'Base URL:',
  downloadLabel: 'Download OpenAPI spec (JSON)',
  tocLabel: 'Endpoints table of contents',
  endpointsLabel: 'Endpoints',
  schemasLabel: 'Schemas',
  authNone: 'No auth',
  authToken: 'Token required',
  parametersLabel: 'Parameters',
  requestBodyLabel: 'Request body',
  responsesLabel: 'Responses',
  thParam: 'Parameter',
  thIn: 'Location',
  thType: 'Type',
  thDesc: 'Description',
  thProperty: 'Property',
  thStatus: 'Status',
  thSchema: 'Schema',
  requiredYes: 'required',
  inPath: 'path',
  inQuery: 'query',
  generatedNote:
    "This page is generated from docs/openapi.yaml at each deploy — it cannot drift from the API's real behaviour.",
};
