// pages/developpeurs.tsx
// Portail développeur : documentation statique de l'API publique v1.
// Page de contenu pur — aucune logique serveur, aucun fetch.

import Link from 'next/link';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT, format } from '@/lib/i18n/useT';
import { API_RESOURCES, API_ACTIONS } from '@/utils/apiScopes';

type DevDict = ReturnType<typeof useT<'developpeursPage'>>;

// Base URL affichée dans les exemples : origine réelle du site si connue,
// sinon un placeholder explicite pour l'utilisateur.
const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
  'https://<votre-domaine>';

type Param = {
  name: string;
  kind: 'path' | 'query';
  required?: boolean;
  desc: string;
};

type Endpoint = {
  method: 'GET';
  path: string;
  summary: string;
  params: Param[];
  data: string;
};

type EndpointGroup = {
  id: string;
  title: string;
  intro: string;
  endpoints: Endpoint[];
};

const getGroups = (t: DevDict): EndpointGroup[] => [
  {
    id: 'tournois',
    title: t.groupTournamentsTitle,
    intro: t.groupTournamentsIntro,
    endpoints: [
      {
        method: 'GET',
        path: '/api/public/v1/tournaments',
        summary: t.sumTournamentsList,
        params: [
          {
            name: 'status',
            kind: 'query',
            desc: t.paramStatusTournament,
          },
          {
            name: 'game',
            kind: 'query',
            desc: t.paramGame,
          },
          {
            name: 'limit',
            kind: 'query',
            desc: t.paramLimit,
          },
          {
            name: 'offset',
            kind: 'query',
            desc: t.paramOffset,
          },
        ],
        data: `{
  "data": [
    {
      "id": "uuid",
      "name": "OW Women's Cup 2026",
      "slug": "ow-womens-cup-2026",
      "game": "overwatch",
      "status": "running",
      "start_date": "2026-01-01",
      "end_date": "2026-02-01",
      "format": "single_elimination"
    }
  ],
  "pagination": { "limit": 20, "offset": 0, "count": 42 }
}`,
      },
      {
        method: 'GET',
        path: '/api/public/v1/tournaments/{id}',
        summary: t.sumTournamentDetail,
        params: [
          {
            name: 'id',
            kind: 'path',
            required: true,
            desc: t.paramIdRequired,
          },
        ],
        data: `{
  "data": {
    "id": "uuid",
    "name": "OW Women's Cup 2026",
    "slug": "ow-womens-cup-2026",
    "game": "overwatch",
    "status": "running",
    "start_date": "2026-01-01",
    "end_date": "2026-02-01",
    "format": "single_elimination",
    "stages": [
      { "id": "uuid", "name": "Phase de groupes", "stage_type": "group", "status": "completed" }
    ]
  }
}`,
      },
      {
        method: 'GET',
        path: '/api/public/v1/tournaments/{id}/matches',
        summary: t.sumTournamentMatches,
        params: [
          {
            name: 'id',
            kind: 'path',
            required: true,
            desc: t.paramTournamentIdSlug,
          },
          {
            name: 'stageId',
            kind: 'query',
            desc: t.paramStageId,
          },
          {
            name: 'status',
            kind: 'query',
            desc: t.paramMatchStatus,
          },
        ],
        data: `{
  "data": [
    {
      "id": "uuid",
      "stage_id": "uuid",
      "round_number": 1,
      "bracket_side": "upper",
      "team1_id": "uuid",
      "team1_name": "Team A",
      "team2_id": "uuid",
      "team2_name": "Team B",
      "team1_score": 2,
      "team2_score": 1,
      "winner_team_id": "uuid",
      "status": "finished",
      "scheduled_at": "2026-01-05T18:00:00Z"
    }
  ]
}`,
      },
      {
        method: 'GET',
        path: '/api/public/v1/tournaments/{id}/standings',
        summary: t.sumTournamentStandings,
        params: [
          {
            name: 'id',
            kind: 'path',
            required: true,
            desc: t.paramTournamentIdSlug,
          },
        ],
        data: `{
  "data": [
    {
      "rank": 1,
      "teamId": "uuid",
      "teamName": "Team A",
      "teamSlug": "team-a",
      "logoUrl": "https://.../logo.png",
      "prize": "500 €"
    }
  ]
}`,
      },
    ],
  },
  {
    id: 'matchs',
    title: t.groupMatchesTitle,
    intro: t.groupMatchesIntro,
    endpoints: [
      {
        method: 'GET',
        path: '/api/public/v1/matches/{id}',
        summary: t.sumMatchDetail,
        params: [
          { name: 'id', kind: 'path', required: true, desc: t.paramMatchId },
        ],
        data: `{
  "data": {
    "id": "uuid",
    "stage_id": "uuid",
    "round_number": 1,
    "bracket_side": "upper",
    "team1_id": "uuid",
    "team1_name": "Team A",
    "team2_id": "uuid",
    "team2_name": "Team B",
    "team1_score": 2,
    "team2_score": 1,
    "winner_team_id": "uuid",
    "status": "finished",
    "scheduled_at": "2026-01-05T18:00:00Z",
    "games": [
      { "map_name": "Ilios", "map_order": 1, "team1_score": 2, "team2_score": 1, "winner_team_id": "uuid" }
    ]
  }
}`,
      },
    ],
  },
  {
    id: 'equipes',
    title: t.groupTeamsTitle,
    intro: t.groupTeamsIntro,
    endpoints: [
      {
        method: 'GET',
        path: '/api/public/v1/teams/{id}',
        summary: t.sumTeamDetail,
        params: [
          {
            name: 'id',
            kind: 'path',
            required: true,
            desc: t.paramTeamId,
          },
        ],
        data: `{
  "data": {
    "id": "uuid",
    "name": "Team A",
    "short_name": "TMA",
    "slug": "team-a",
    "logo_url": "https://.../logo.png",
    "roster": [
      { "display_name": "Joueuse", "role": "tank", "is_substitute": false }
    ]
  }
}`,
      },
    ],
  },
  {
    id: 'classement-profils',
    title: t.groupLeaderboardTitle,
    intro: t.groupLeaderboardIntro,
    endpoints: [
      {
        method: 'GET',
        path: '/api/public/v1/leaderboard',
        summary: t.sumLeaderboard,
        params: [
          {
            name: 'limit',
            kind: 'query',
            desc: t.paramLimit,
          },
          {
            name: 'offset',
            kind: 'query',
            desc: t.paramOffset,
          },
        ],
        data: `{
  "data": [
    {
      "userId": "uuid",
      "displayName": "Joueuse",
      "battleTag": "Joueuse#1234",
      "avatarUrl": "https://.../avatar.png",
      "rating": 1650,
      "rd": 80,
      "gamesPlayed": 42,
      "wins": 28,
      "losses": 14,
      "rank": 1
    }
  ],
  "pagination": { "limit": 20, "offset": 0, "count": 120 }
}`,
      },
      {
        method: 'GET',
        path: '/api/public/v1/players/{userId}',
        summary: t.sumPlayerDetail,
        params: [
          {
            name: 'userId',
            kind: 'path',
            required: true,
            desc: t.paramUserId,
          },
        ],
        data: `{
  "data": {
    "player": { "userId": "uuid", "displayName": "Joueuse", "rating": 1650 },
    "history": [ /* évolution du rating */ ],
    "recentMatches": [ /* derniers matchs */ ],
    "h2h": [ /* confrontations directes */ ],
    "achievements": { /* distinctions */ }
  }
}`,
      },
    ],
  },
  {
    id: 'ligues',
    title: t.groupLeaguesTitle,
    intro: t.groupLeaguesIntro,
    endpoints: [
      {
        method: 'GET',
        path: '/api/public/v1/leagues',
        summary: t.sumLeaguesList,
        params: [],
        data: `{
  "data": [
    { "id": "uuid", "name": "Ligue Élite", "slug": "ligue-elite", "status": "running" }
  ]
}`,
      },
      {
        method: 'GET',
        path: '/api/public/v1/leagues/{slug}',
        summary: t.sumLeagueDetail,
        params: [
          {
            name: 'slug',
            kind: 'path',
            required: true,
            desc: t.paramLeagueSlug,
          },
        ],
        data: `{
  "data": {
    "league": { "id": "uuid", "name": "Ligue Élite", "slug": "ligue-elite" },
    "standings": [ /* classement de la ligue */ ],
    "tournaments": [ /* tournois rattachés */ ]
  }
}`,
      },
    ],
  },
];

const getErrorCodes = (t: DevDict): { code: string; desc: string }[] => [
  { code: 'NOT_FOUND', desc: t.errNotFound },
  { code: 'BAD_REQUEST', desc: t.errBadRequest },
  {
    code: 'METHOD_NOT_ALLOWED',
    desc: t.errMethodNotAllowed,
  },
  {
    code: 'RATE_LIMITED',
    desc: t.errRateLimited,
  },
  { code: 'INTERNAL', desc: t.errInternal },
];

// Codes d'erreur propres à la surface d'écriture authentifiée (en plus des
// codes de lecture ci-dessus). Ordonnés par statut HTTP croissant.
const getWriteErrorCodes = (
  t: DevDict
): { http: string; code: string; desc: string }[] => [
  { http: '401', code: 'UNAUTHORIZED', desc: t.errUnauthorized },
  { http: '403', code: 'INSUFFICIENT_SCOPE', desc: t.errInsufficientScope },
  { http: '409', code: 'CONFLICT', desc: t.errConflict },
  { http: '503', code: 'MAINTENANCE_MODE', desc: t.errMaintenanceMode },
];

function anchorId(path: string): string {
  return path
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function CodeBlock({ children, label }: { children: string; label?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/50">
      {label && (
        <div className="border-b border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
          {label}
        </div>
      )}
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-gray-200 sm:text-sm">
        <code>{children}</code>
      </pre>
    </div>
  );
}

const curlExample = `curl -s "${BASE_URL}/api/public/v1/tournaments?status=running&limit=10"`;

const fetchExample = `const res = await fetch(
  "${BASE_URL}/api/public/v1/tournaments?status=running&limit=10"
);
const { data, pagination } = await res.json();
// data       -> TournamentSummary[]
// pagination -> { limit, offset, count }
console.log(data.length, pagination.count);`;

// --- Écriture authentifiée (REST) -----------------------------------------

const writeCurlExample = `curl -X POST "${BASE_URL}/api/public/v1/matches/{id}/result" \\
  -H "Authorization: Bearer pk_live_…" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: report-2026-01-05-42" \\
  -d '{ "team1Score": 2, "team2Score": 1 }'`;

const writeBodyExample = `{ "team1Score": 2, "team2Score": 1 }`;

const writeResponseExample = `{
  "data": {
    "matchId": "uuid",
    "status": "finished",
    "team1Score": 2,
    "team2Score": 1,
    "winnerTeamId": "uuid"
  }
}`;

// --- GraphQL ---------------------------------------------------------------

const graphqlSchemaExample = `type Query {
  tournaments(status: String, game: String, limit: Int = 50, offset: Int = 0): TournamentList!
  tournament(idOrSlug: String!): TournamentDetail   # id OU slug
  match(id: ID!): MatchDetail
  team(idOrSlug: String!): Team
}

type Mutation {
  # scope requis : matches:write
  reportMatchResult(matchId: ID!, team1Score: Int!, team2Score: Int!): MatchResultPayload!
}`;

const graphqlQueryExample = `curl -X POST "${BASE_URL}/api/graphql" \\
  -H "Content-Type: application/json" \\
  -d '{"query":"{ tournaments(status:\\"running\\", limit: 10) { items { id name slug status } count } }"}'`;

const graphqlMutationExample = `curl -X POST "${BASE_URL}/api/graphql" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer pk_live_…" \\
  -d '{"query":"mutation($m:ID!){reportMatchResult(matchId:$m,team1Score:2,team2Score:1){status winnerTeamId}}","variables":{"m":"…"}}'`;

function DevelopersPage() {
  const t = useT('developpeursPage');
  const groups = getGroups(t);
  const errorCodes = getErrorCodes(t);
  const writeErrorCodes = getWriteErrorCodes(t);
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-purple-600/30 blur-3xl" />
          <div className="absolute right-10 top-10 h-[360px] w-[360px] rounded-full bg-pink-500/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-5xl px-6 pt-32 pb-12 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            {t.heroBadge}
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            {t.heroTitle}
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-lg text-gray-200">
            {t.heroSubtitle}
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-5xl space-y-16 px-4 pb-24 sm:px-6">
        {/* Introduction */}
        <section aria-labelledby="intro-heading" className="space-y-6">
          <h2 id="intro-heading" className="text-2xl font-bold text-white">
            {t.overviewTitle}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                title: t.card1Title,
                body: t.card1Body,
              },
              {
                title: t.card2Title,
                body: t.card2Body,
              },
              {
                title: t.card3Title,
                body: t.card3Body,
              },
              {
                title: t.card4Title,
                body: t.card4Body,
              },
              {
                title: t.card5Title,
                body: t.card5Body,
              },
              {
                title: t.card6Title,
                body: t.card6Body,
              },
              {
                title: t.card7Title,
                body: t.card7Body,
              },
              {
                title: t.card8Title,
                body: t.card8Body,
              },
            ].map((card) => (
              <div
                key={card.title}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-5"
              >
                <h3 className="text-base font-semibold text-white">
                  {card.title}
                </h3>
                <p className="mt-2 text-sm text-gray-300">{card.body}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <h3 className="text-base font-semibold text-white">
              {t.baseUrlTitle}
            </h3>
            <p className="mt-2 text-sm text-gray-300">
              {t.baseUrlDescBefore}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-purple-200">
                /api/public/v1
              </code>
              .
            </p>
            <p className="mt-3 break-all font-mono text-sm text-purple-200">
              {BASE_URL}/api/public/v1
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <h3 className="text-base font-semibold text-white">
              {t.errorsTitle}
            </h3>
            <p className="mt-2 text-sm text-gray-300">
              {t.errorsDescBefore}
              <code className="rounded bg-white/10 px-1.5 py-0.5 text-purple-200">
                {'{ error, code }'}
              </code>
              .
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-gray-300">
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      {t.thCode}
                    </th>
                    <th scope="col" className="py-2 font-semibold">
                      {t.thMeaning}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {errorCodes.map((row) => (
                    <tr key={row.code} className="border-b border-white/5">
                      <td className="py-2 pr-4 align-top">
                        <code className="rounded bg-white/10 px-1.5 py-0.5 text-purple-200">
                          {row.code}
                        </code>
                      </td>
                      <td className="py-2 align-top text-gray-300">
                        {row.desc}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Exemple rapide */}
        <section aria-labelledby="quickstart-heading" className="space-y-6">
          <h2 id="quickstart-heading" className="text-2xl font-bold text-white">
            {t.quickstartTitle}
          </h2>
          <p className="max-w-3xl text-sm text-gray-300">
            {t.quickstartDescPart1}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-purple-200">
              data
            </code>
            {t.quickstartDescPart2}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-purple-200">
              pagination
            </code>
            .
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <CodeBlock label="curl">{curlExample}</CodeBlock>
            <CodeBlock label="JavaScript (fetch)">{fetchExample}</CodeBlock>
          </div>
        </section>

        {/* Référence des endpoints */}
        <section aria-labelledby="reference-heading" className="space-y-6">
          <h2 id="reference-heading" className="text-2xl font-bold text-white">
            {t.referenceTitle}
          </h2>

          {/* Sommaire */}
          <nav aria-label={t.tocLabel}>
            <ul className="flex flex-wrap gap-2">
              {[
                ...groups.map((g) => ({ id: g.id, title: g.title })),
                { id: 'ecriture', title: t.writeNavLabel },
                { id: 'graphql', title: t.graphqlNavLabel },
              ].map((g) => (
                <li key={g.id}>
                  <a
                    href={`#${g.id}`}
                    className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-gray-200 transition-colors hover:border-purple-300/50 hover:text-white"
                  >
                    {g.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {groups.map((group) => (
            <div
              key={group.id}
              id={group.id}
              className="scroll-mt-24 space-y-5"
            >
              <div>
                <h3 className="text-xl font-bold text-white">{group.title}</h3>
                <p className="mt-1 max-w-3xl text-sm text-gray-300">
                  {group.intro}
                </p>
              </div>

              {group.endpoints.map((ep) => (
                <article
                  key={ep.path}
                  id={anchorId(ep.path)}
                  className="scroll-mt-24 space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-emerald-500/15 px-2 py-1 text-xs font-bold uppercase tracking-wide text-emerald-300">
                      {ep.method}
                    </span>
                    <code className="break-all font-mono text-sm text-purple-200">
                      {ep.path}
                    </code>
                  </div>
                  <p className="text-sm text-gray-300">{ep.summary}</p>

                  {ep.params.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left text-sm">
                        <caption className="sr-only">
                          {format(t.paramsCaption, { path: ep.path })}
                        </caption>
                        <thead>
                          <tr className="border-b border-white/10 text-gray-300">
                            <th scope="col" className="py-2 pr-4 font-semibold">
                              {t.paramsTh}
                            </th>
                            <th scope="col" className="py-2 pr-4 font-semibold">
                              {t.locationTh}
                            </th>
                            <th scope="col" className="py-2 font-semibold">
                              {t.descriptionTh}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {ep.params.map((p) => (
                            <tr
                              key={p.name}
                              className="border-b border-white/5"
                            >
                              <td className="py-2 pr-4 align-top">
                                <code className="rounded bg-white/10 px-1.5 py-0.5 text-purple-200">
                                  {p.name}
                                </code>
                                {p.required && (
                                  <span className="ml-1 text-xs text-pink-300">
                                    {t.requiredTag}
                                  </span>
                                )}
                              </td>
                              <td className="py-2 pr-4 align-top text-gray-300">
                                {p.kind === 'path'
                                  ? t.pathLocation
                                  : t.queryLocation}
                              </td>
                              <td className="py-2 align-top text-gray-300">
                                {p.desc}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
                      {t.responseLabel}
                    </p>
                    <CodeBlock>{ep.data}</CodeBlock>
                  </div>
                </article>
              ))}
            </div>
          ))}
        </section>

        {/* Écriture authentifiée (REST) */}
        <section
          aria-labelledby="ecriture-heading"
          id="ecriture"
          className="scroll-mt-24 space-y-6"
        >
          <div>
            <h2 id="ecriture-heading" className="text-2xl font-bold text-white">
              {t.writeSectionTitle}
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-gray-300">
              {t.writeSectionIntro}
            </p>
          </div>

          {/* Authentification */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <h3 className="text-base font-semibold text-white">
              {t.writeAuthTitle}
            </h3>
            <p className="mt-2 text-sm text-gray-300">{t.writeAuthBody}</p>
            <p className="mt-3 break-all font-mono text-sm text-purple-200">
              Authorization: Bearer pk_live_…
            </p>
          </div>

          {/* Scopes */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <h3 className="text-base font-semibold text-white">
              {t.writeScopesTitle}
            </h3>
            <p className="mt-2 text-sm text-gray-300">{t.writeScopesIntro}</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-gray-300">
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      {t.writeThResource}
                    </th>
                    <th scope="col" className="py-2 font-semibold">
                      {t.writeThActions}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {API_RESOURCES.map((resource) => (
                    <tr key={resource} className="border-b border-white/5">
                      <td className="py-2 pr-4 align-top">
                        <code className="rounded bg-white/10 px-1.5 py-0.5 text-purple-200">
                          {resource}
                        </code>
                      </td>
                      <td className="py-2 align-top">
                        <div className="flex flex-wrap gap-1.5">
                          {API_ACTIONS.map((action) => (
                            <code
                              key={action}
                              className="rounded bg-white/10 px-1.5 py-0.5 text-purple-200"
                            >
                              {resource}:{action}
                            </code>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Codes d'erreur (écriture) */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <h3 className="text-base font-semibold text-white">
              {t.writeErrorsTitle}
            </h3>
            <p className="mt-2 text-sm text-gray-300">{t.writeErrorsIntro}</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-gray-300">
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      {t.writeThHttp}
                    </th>
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      {t.thCode}
                    </th>
                    <th scope="col" className="py-2 font-semibold">
                      {t.thMeaning}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {writeErrorCodes.map((row) => (
                    <tr key={row.code} className="border-b border-white/5">
                      <td className="py-2 pr-4 align-top text-gray-300">
                        {row.http}
                      </td>
                      <td className="py-2 pr-4 align-top">
                        <code className="rounded bg-white/10 px-1.5 py-0.5 text-purple-200">
                          {row.code}
                        </code>
                      </td>
                      <td className="py-2 align-top text-gray-300">
                        {row.desc}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-gray-400">{t.writeErrorsNote}</p>
          </div>

          {/* Idempotence */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <h3 className="text-base font-semibold text-white">
              {t.writeIdempotencyTitle}
            </h3>
            <p className="mt-2 text-sm text-gray-300">
              {t.writeIdempotencyBody}
            </p>
          </div>

          {/* Endpoint pilote */}
          <article
            id={anchorId('/api/public/v1/matches/{id}/result')}
            className="scroll-mt-24 space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-amber-500/15 px-2 py-1 text-xs font-bold uppercase tracking-wide text-amber-300">
                POST
              </span>
              <code className="break-all font-mono text-sm text-purple-200">
                /api/public/v1/matches/{'{id}'}/result
              </code>
              <span className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 text-xs text-gray-300">
                {t.writeScopeRequiredLabel}:{' '}
                <code className="text-purple-200">matches:write</code>
              </span>
            </div>
            <p className="text-sm text-gray-300">{t.writeEndpointSummary}</p>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
                {t.writeBodyLabel}
              </p>
              <CodeBlock>{writeBodyExample}</CodeBlock>
            </div>

            <CodeBlock label="curl">{writeCurlExample}</CodeBlock>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
                {t.responseLabel}
              </p>
              <CodeBlock>{writeResponseExample}</CodeBlock>
            </div>
          </article>
        </section>

        {/* GraphQL */}
        <section
          aria-labelledby="graphql-heading"
          id="graphql"
          className="scroll-mt-24 space-y-6"
        >
          <div>
            <h2 id="graphql-heading" className="text-2xl font-bold text-white">
              {t.graphqlSectionTitle}
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-gray-300">
              {t.graphqlSectionIntro}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-pink-500/15 px-2 py-1 text-xs font-bold uppercase tracking-wide text-pink-300">
              POST
            </span>
            <code className="break-all font-mono text-sm text-purple-200">
              /api/graphql
            </code>
          </div>

          <p className="max-w-3xl text-sm text-gray-300">
            {t.graphqlDepthNote}
          </p>

          {/* Schéma */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
              {t.graphqlSchemaHeading}
            </p>
            <CodeBlock label={t.graphqlSchemaLabel}>
              {graphqlSchemaExample}
            </CodeBlock>
          </div>

          {/* Exemples */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
              {t.graphqlExamplesHeading}
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              <CodeBlock label={t.graphqlQueryLabel}>
                {graphqlQueryExample}
              </CodeBlock>
              <CodeBlock label={t.graphqlMutationLabel}>
                {graphqlMutationExample}
              </CodeBlock>
            </div>
          </div>

          <p className="text-sm text-gray-300">
            {t.graphqlGraphiqlPrompt}
            {/* API endpoint (GraphiQL, dev-only), not a Next page route → plain anchor. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/api/graphql"
              className="text-purple-300 underline hover:text-purple-200"
            >
              {t.graphqlGraphiqlLink}
            </a>
            {t.graphqlGraphiqlNote}
          </p>
        </section>

        {/* Note de fin */}
        <section
          aria-labelledby="notes-heading"
          className="rounded-2xl border border-white/10 bg-gradient-to-r from-[#140a24] via-[#1c0f33] to-[#2a0d3d] p-6 sm:p-8"
        >
          <h2 id="notes-heading" className="text-xl font-bold text-white">
            {t.notesTitle}
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-gray-200">
            <li className="flex items-start gap-2">
              <span
                className="mt-[6px] h-2 w-2 rounded-full bg-purple-400"
                aria-hidden
              />
              <span>{t.note1}</span>
            </li>
            <li className="flex items-start gap-2">
              <span
                className="mt-[6px] h-2 w-2 rounded-full bg-purple-400"
                aria-hidden
              />
              <span>
                {t.note2Before}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-purple-200">
                  openapi.yaml
                </code>
                .
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span
                className="mt-[6px] h-2 w-2 rounded-full bg-purple-400"
                aria-hidden
              />
              <span>
                {t.note3Before}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-purple-200">
                  v1
                </code>
                {t.note3After}
              </span>
            </li>
          </ul>
          <p className="mt-5 text-sm text-gray-300">
            {t.contactPrompt}
            <Link
              href="/contact"
              className="text-purple-300 underline hover:text-purple-200"
            >
              {t.contactLink}
            </Link>
            .
          </p>
        </section>
      </main>
    </div>
  );
}

const developersSeo: SeoProps = {
  title: {
    fr: 'API publique',
    en: 'Public API',
  },
  description: {
    fr: "Documentation de l'API publique de l'OW Women's Cup : REST en lecture seule (tournois, matchs, équipes, classements, ligues), écriture authentifiée par token scopé et API GraphQL.",
    en: "Documentation for the OW Women's Cup public API: read-only REST (tournaments, matches, teams, standings, leagues), authenticated writes via scoped token and a GraphQL API.",
  },
};

DevelopersPage.seo = developersSeo;

export default DevelopersPage;
