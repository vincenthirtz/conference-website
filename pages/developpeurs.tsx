// pages/developpeurs.tsx
// Portail développeur : documentation statique de l'API publique v1.
// Page de contenu pur — aucune logique serveur, aucun fetch.

import Link from 'next/link';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

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

const groups: EndpointGroup[] = [
  {
    id: 'tournois',
    title: 'Tournois',
    intro:
      "Liste, détail et déroulé compétitif d'un tournoi. L'identifiant accepte l'UUID ou le slug.",
    endpoints: [
      {
        method: 'GET',
        path: '/api/public/v1/tournaments',
        summary: 'Liste des tournois publics.',
        params: [
          {
            name: 'status',
            kind: 'query',
            desc: 'Filtre par statut (ex. running, completed).',
          },
          {
            name: 'game',
            kind: 'query',
            desc: 'Filtre par jeu (ex. overwatch).',
          },
          {
            name: 'limit',
            kind: 'query',
            desc: 'Taille de page (pagination).',
          },
          {
            name: 'offset',
            kind: 'query',
            desc: 'Décalage de départ (pagination).',
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
        summary: 'Détail d’un tournoi et ses phases (stages).',
        params: [
          {
            name: 'id',
            kind: 'path',
            required: true,
            desc: 'Identifiant du tournoi : UUID ou slug.',
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
        summary: 'Matchs d’un tournoi.',
        params: [
          {
            name: 'id',
            kind: 'path',
            required: true,
            desc: 'UUID ou slug du tournoi.',
          },
          {
            name: 'stageId',
            kind: 'query',
            desc: 'Filtre par phase (id de stage).',
          },
          {
            name: 'status',
            kind: 'query',
            desc: 'Filtre par statut de match.',
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
        summary:
          'Classement final d’un tournoi (vide tant qu’il n’est pas finalisé).',
        params: [
          {
            name: 'id',
            kind: 'path',
            required: true,
            desc: 'UUID ou slug du tournoi.',
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
    title: 'Matchs',
    intro: 'Détail d’un match, avec le score par carte (games).',
    endpoints: [
      {
        method: 'GET',
        path: '/api/public/v1/matches/{id}',
        summary: 'Détail d’un match et ses cartes.',
        params: [
          { name: 'id', kind: 'path', required: true, desc: 'UUID du match.' },
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
    title: 'Équipes',
    intro:
      'Fiche publique d’une équipe et son roster. L’identifiant accepte l’UUID ou le slug.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/public/v1/teams/{id}',
        summary: 'Détail d’une équipe et sa composition.',
        params: [
          {
            name: 'id',
            kind: 'path',
            required: true,
            desc: 'UUID ou slug de l’équipe.',
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
    title: 'Classement & profils',
    intro:
      'Classement des joueuses (rating Glicko-2) et profil individuel : historique, matchs récents, confrontations et distinctions.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/public/v1/leaderboard',
        summary: 'Classement des joueuses.',
        params: [
          {
            name: 'limit',
            kind: 'query',
            desc: 'Taille de page (pagination).',
          },
          {
            name: 'offset',
            kind: 'query',
            desc: 'Décalage de départ (pagination).',
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
        summary: 'Profil détaillé d’une joueuse.',
        params: [
          {
            name: 'userId',
            kind: 'path',
            required: true,
            desc: 'Identifiant de la joueuse.',
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
    title: 'Ligues',
    intro:
      'Liste des ligues publiques et détail d’une ligue (classement + tournois rattachés).',
    endpoints: [
      {
        method: 'GET',
        path: '/api/public/v1/leagues',
        summary: 'Liste des ligues publiques.',
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
        summary: 'Détail d’une ligue.',
        params: [
          {
            name: 'slug',
            kind: 'path',
            required: true,
            desc: 'Slug de la ligue.',
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

const errorCodes: { code: string; desc: string }[] = [
  { code: 'NOT_FOUND', desc: 'Ressource introuvable.' },
  { code: 'BAD_REQUEST', desc: 'Paramètres invalides ou manquants.' },
  {
    code: 'METHOD_NOT_ALLOWED',
    desc: 'Méthode HTTP non autorisée (seul GET est supporté).',
  },
  {
    code: 'RATE_LIMITED',
    desc: 'Limite de requêtes dépassée. Réessayez plus tard.',
  },
  { code: 'INTERNAL', desc: 'Erreur interne du serveur.' },
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

function DevelopersPage() {
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
            Portail développeur
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            API publique v1
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-lg text-gray-200">
            Une API REST publique, en lecture seule, pour consommer les données
            de tournois, matchs, équipes, classements et ligues. Sans clé,
            versionnée, prête à intégrer dans vos overlays, bots et sites.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-5xl space-y-16 px-4 pb-24 sm:px-6">
        {/* Introduction */}
        <section aria-labelledby="intro-heading" className="space-y-6">
          <h2 id="intro-heading" className="text-2xl font-bold text-white">
            Vue d&apos;ensemble
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                title: 'Lecture seule',
                body: 'Toutes les routes sont en GET. Aucune écriture, aucune mutation possible.',
              },
              {
                title: 'Sans authentification',
                body: 'Aucune clé d’API ni jeton requis. Appelez directement les endpoints.',
              },
              {
                title: 'CORS ouvert',
                body: 'En-tête Access-Control-Allow-Origin: * — utilisable depuis un navigateur.',
              },
              {
                title: 'Versionnée',
                body: 'Préfixe /api/public/v1. La v1 reste stable ; toute rupture passera par une v2.',
              },
              {
                title: 'Rate-limit',
                body: 'Environ 120 requêtes par minute et par adresse IP. Au-delà : erreur RATE_LIMITED.',
              },
              {
                title: 'Réponses JSON en enveloppe',
                body: 'Le contenu est toujours sous { data: ... }. Les listes ajoutent un objet pagination.',
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
            <h3 className="text-base font-semibold text-white">Base URL</h3>
            <p className="mt-2 text-sm text-gray-300">
              L&apos;API est servie depuis l&apos;origine du site. Toutes les
              routes sont préfixées par{' '}
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
              Format des erreurs
            </h3>
            <p className="mt-2 text-sm text-gray-300">
              Une erreur renvoie un statut HTTP adapté et un corps JSON{' '}
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
                      code
                    </th>
                    <th scope="col" className="py-2 font-semibold">
                      Signification
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
            Exemple rapide
          </h2>
          <p className="max-w-3xl text-sm text-gray-300">
            Récupérer les tournois en cours. La réponse expose la liste sous{' '}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-purple-200">
              data
            </code>{' '}
            et les métadonnées de pagination sous{' '}
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
            Référence des endpoints
          </h2>

          {/* Sommaire */}
          <nav aria-label="Sommaire des groupes d'endpoints">
            <ul className="flex flex-wrap gap-2">
              {groups.map((g) => (
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
                          Paramètres de {ep.path}
                        </caption>
                        <thead>
                          <tr className="border-b border-white/10 text-gray-300">
                            <th scope="col" className="py-2 pr-4 font-semibold">
                              Paramètre
                            </th>
                            <th scope="col" className="py-2 pr-4 font-semibold">
                              Emplacement
                            </th>
                            <th scope="col" className="py-2 font-semibold">
                              Description
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
                                    requis
                                  </span>
                                )}
                              </td>
                              <td className="py-2 pr-4 align-top text-gray-300">
                                {p.kind === 'path' ? 'chemin' : 'requête'}
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
                      Réponse
                    </p>
                    <CodeBlock>{ep.data}</CodeBlock>
                  </div>
                </article>
              ))}
            </div>
          ))}
        </section>

        {/* Note de fin */}
        <section
          aria-labelledby="notes-heading"
          className="rounded-2xl border border-white/10 bg-gradient-to-r from-[#0F1F3A] via-[#1A0F2E] to-[#2C0B2C] p-6 sm:p-8"
        >
          <h2 id="notes-heading" className="text-xl font-bold text-white">
            À noter
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-gray-200">
            <li className="flex items-start gap-2">
              <span
                className="mt-[6px] h-2 w-2 rounded-full bg-purple-400"
                aria-hidden
              />
              <span>API en lecture seule.</span>
            </li>
            <li className="flex items-start gap-2">
              <span
                className="mt-[6px] h-2 w-2 rounded-full bg-purple-400"
                aria-hidden
              />
              <span>
                Le contrat de référence est décrit dans{' '}
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
                Les endpoints sont susceptibles d&apos;évoluer&nbsp;; la version{' '}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-purple-200">
                  v1
                </code>{' '}
                reste stable.
              </span>
            </li>
          </ul>
          <p className="mt-5 text-sm text-gray-300">
            Une question ou un cas d&apos;usage&nbsp;?{' '}
            <Link
              href="/contact"
              className="text-purple-300 underline hover:text-purple-200"
            >
              Contactez-nous
            </Link>
            .
          </p>
        </section>
      </main>
    </div>
  );
}

const developersSeo: SeoProps = {
  title: 'API publique',
  description:
    "Documentation de l'API REST publique v1 de l'OW Women's Cup : tournois, matchs, équipes, classements et ligues. Lecture seule, sans clé, CORS ouvert.",
};

DevelopersPage.seo = developersSeo;

export default DevelopersPage;
