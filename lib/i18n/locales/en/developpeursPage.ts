// lib/i18n/locales/en/developpeursPage.ts
//
// Traductions ANGLAISES du namespace `developpeursPage`.
//
// La SOURCE DE VERITE est le francais (`../fr/developpeursPage.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  heroBadge: 'Developer portal',
  heroTitle: 'Public API v1',
  heroSubtitle:
    'A public, read-only REST API to consume tournament, match, team, standings and league data. No key, versioned, ready to drop into your overlays, bots and sites.',
  hubCtaTitle: 'Your developer dashboard',
  hubCtaBody:
    'Signed in as staff: find your API access, usage, keys and webhooks all in one place.',
  hubCtaLink: 'My developer dashboard',
  anonCtaTitle: 'Ready to integrate the API?',
  anonCtaBody:
    'Create a self-service developer account: generate your API keys, subscribe to webhooks and track your usage.',
  anonCtaLink: 'Create a developer account',
  overviewTitle: 'Overview',
  card1Title: 'Read-only',
  card1Body:
    'Read routes are plain GETs, no key. Writing, by contrast, requires a scoped token (see below).',
  card2Title: 'No authentication',
  card2Body: 'No API key or token required. Call the endpoints directly.',
  card3Title: 'Open CORS',
  card3Body:
    'Access-Control-Allow-Origin: * header — usable straight from a browser.',
  card4Title: 'Versioned',
  card4Body:
    'Prefixed with /api/public/v1. v1 stays stable; any breaking change ships as v2.',
  card5Title: 'Rate limit',
  card5Body:
    'Around 120 requests per minute per IP address. Beyond that: a RATE_LIMITED error.',
  card6Title: 'Enveloped JSON responses',
  card6Body:
    'The payload always sits under { data: ... }. Lists add a pagination object.',
  baseUrlTitle: 'Base URL',
  baseUrlDescBefore:
    "The API is served from the site's origin. Every route is prefixed with ",
  errorsTitle: 'Error format',
  errorsDescBefore: 'An error returns a suitable HTTP status and a JSON body ',
  thCode: 'code',
  thMeaning: 'Meaning',
  errNotFound: 'Resource not found.',
  errBadRequest: 'Invalid or missing parameters.',
  errMethodNotAllowed: 'HTTP method not allowed (only GET is supported).',
  errRateLimited: 'Request limit exceeded. Try again later.',
  errInternal: 'Internal server error.',
  quickstartTitle: 'Quick example',
  quickstartDescPart1:
    'Fetch the running tournaments. The response exposes the list under ',
  quickstartDescPart2: ' and the pagination metadata under ',
  referenceTitle: 'Endpoint reference',
  referenceGeneratedCta: 'See the full generated reference →',
  tocLabel: 'Endpoint group index',
  groupTournamentsTitle: 'Tournaments',
  groupTournamentsIntro:
    'List, detail and competitive flow of a tournament. The identifier accepts a UUID or a slug.',
  groupMatchesTitle: 'Matches',
  groupMatchesIntro: 'Match detail, including the per-map score (games).',
  groupTeamsTitle: 'Teams',
  groupTeamsIntro:
    'Public team page and its roster. The identifier accepts a UUID or a slug.',
  groupLeaderboardTitle: 'Standings & profiles',
  groupLeaderboardIntro:
    'Player standings (Glicko-2 rating) and individual profile: history, recent matches, head-to-heads and achievements.',
  groupLeaguesTitle: 'Leagues',
  groupLeaguesIntro:
    'List of public leagues and league detail (standings + attached tournaments).',
  sumTournamentsList: 'List of public tournaments.',
  sumTournamentDetail: 'Tournament detail and its stages.',
  sumTournamentMatches: "A tournament's matches.",
  sumTournamentStandings:
    "Final standings of a tournament (empty until it's finalised).",
  sumMatchDetail: 'Match detail and its maps.',
  sumTeamDetail: 'Team detail and its roster.',
  sumLeaderboard: 'Player standings.',
  sumPlayerDetail: 'Detailed player profile.',
  sumLeaguesList: 'List of public leagues.',
  sumLeagueDetail: 'League detail.',
  paramStatusTournament: 'Filter by status (e.g. running, completed).',
  paramGame: 'Filter by game (e.g. overwatch).',
  paramLimit: 'Page size (pagination).',
  paramOffset: 'Starting offset (pagination).',
  paramIdRequired: 'Tournament identifier: UUID or slug.',
  paramTournamentIdSlug: 'Tournament UUID or slug.',
  paramStageId: 'Filter by stage (stage id).',
  paramMatchStatus: 'Filter by match status.',
  paramMatchId: 'Match UUID.',
  paramTeamId: 'Team UUID or slug.',
  paramUserId: 'Player identifier.',
  paramLeagueSlug: 'League slug.',
  paramsTh: 'Parameter',
  locationTh: 'Location',
  descriptionTh: 'Description',
  requiredTag: 'required',
  pathLocation: 'path',
  queryLocation: 'query',
  responseLabel: 'Response',
  paramsCaption: 'Parameters for {path}',
  notesTitle: 'Good to know',
  note1: 'Read-only API.',
  note2Before: 'The reference contract is described in ',
  note3Before: 'Endpoints may evolve ; version ',
  note3After: ' stays stable.',
  contactPrompt: 'A question or a use case ? ',
  contactLink: 'Contact us',
  card7Title: 'Authenticated writes',
  card7Body:
    'A scoped Bearer pk_live_… token unlocks writes: match result reporting, with more to come.',
  card8Title: 'GraphQL',
  card8Body:
    'A single GraphQL endpoint: anonymous queries, mutations on a scoped token.',
  writeNavLabel: 'Writes (REST)',
  writeSectionTitle: 'Authenticated writes (REST)',
  writeSectionIntro:
    'Alongside anonymous reads, a write surface lets third-party organisers automate their operations (result reporting, overlays, integrations). Every request is authenticated with a scoped token.',
  writeAccessTitle: 'Create your API key',
  writeAccessBody:
    'API keys are self-service: an admin of your organisation creates them from the admin area (Settings → API keys). Each key carries its scopes and is shown only once at creation. Public reads stay open to everyone, no key required.',
  writeAccessCta: 'Create an API key',
  writeAuthTitle: 'Authentication',
  writeAuthBody:
    'Every write carries an Authorization: Bearer pk_live_… header. Tokens are issued by an organisation admin from the admin area and shown only once at creation. The target tenant is derived from the token — no extra header is needed.',
  writeScopesTitle: 'Scopes',
  writeScopesIntro:
    'A token carries a list of scopes in resource:action form. Each endpoint declares the scope it requires; a missing scope returns 403 INSUFFICIENT_SCOPE. There is no implication: matches:write does not grant matches:read.',
  writeThResource: 'Resource',
  writeThActions: 'Actions',
  writeErrorsTitle: 'Error codes (writes)',
  writeErrorsIntro:
    'Writes share the { error, code } envelope and add the following codes to the read codes above.',
  writeThHttp: 'HTTP',
  errUnauthorized: 'Token missing, invalid or revoked.',
  errInsufficientScope: 'Valid token, but the required scope is missing.',
  errMaintenanceMode: 'Writes frozen: the site is in maintenance mode.',
  errConflict: 'State conflict (e.g. a match already closed).',
  writeErrorsNote:
    'The read codes (NOT_FOUND, BAD_REQUEST, RATE_LIMITED, INTERNAL…) apply as well.',
  writeIdempotencyTitle: 'Idempotency',
  writeIdempotencyBody:
    'Send an Idempotency-Key header (≤ 200 characters) to make retries safe. A 2xx response is cached for 5 minutes and replayed verbatim (Idempotency-Replay: true header) for the same key and the same body.',
  writeEndpointSummary:
    'Sets the final score of a match (direct authority, no captain consensus). The match moves to the finished status, the bracket is propagated and notifications are sent. Idempotent.',
  writeScopeRequiredLabel: 'Required scope',
  writeBodyLabel: 'Request body',
  graphqlNavLabel: 'GraphQL',
  graphqlSectionTitle: 'GraphQL',
  graphqlSectionIntro:
    'A single POST /api/graphql endpoint serves the GraphQL API. Queries are anonymous, like the read REST API; mutations require a scoped token.',
  graphqlDepthNote:
    'GraphiQL and introspection are available in development only. Query depth is capped at 8 levels.',
  graphqlSchemaHeading: 'Schema (excerpt)',
  graphqlSchemaLabel: 'SDL',
  graphqlExamplesHeading: 'Examples',
  graphqlQueryLabel: 'Query (curl)',
  graphqlMutationLabel: 'Mutation (curl)',
  graphqlGraphiqlPrompt: 'Explore the schema interactively with ',
  graphqlGraphiqlLink: 'GraphiQL',
  graphqlGraphiqlNote: ' (available in development only).',
};
