# OW Women's Cup — site et plateforme de tournois

Site public de l'OW Women's Cup (owwomenscup.fr), espace joueuse / capitaine, back-office staff
multi-tenant et API consommée par le bot Discord (`owwc-discord-bot`) et l'app caster.

Next.js (pages router) · Supabase (Postgres + RLS) · TailwindCSS v4 · Biome · Vitest + Playwright ·
déployé sur Netlify (crons inclus).

## Démarrer

```bash
npm install
cp example.env.local .env.local   # puis remplir les valeurs, voir ci-dessous
npm run dev                       # http://localhost:3000
```

Commandes, architecture et conventions : [CLAUDE.md](CLAUDE.md). Pour proposer un changement :
[CONTRIBUTING.md](CONTRIBUTING.md).

## Variables d'environnement

- Copier `example.env.local` en `.env.local` et le remplir.
- Clés requises :
  - `NEXT_PUBLIC_SUPABASE_URL` : URL du projet Supabase.
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` : clé publique anon.
  - `SUPABASE_SERVICE_ROLE_KEY` : clé service role (serveur uniquement, secrète).
  - `DISCORD_TEAM_SECRET` : jeton partagé qui autorise le bot Discord sur `/api/discord/teams`.
  - Twitch live / OAuth : `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_REDIRECT_URI`
    (ex. `http://localhost:3000/api/twitch/oauth-callback`).
  - Mesure d'audience (optionnelle, tout ou rien) : `NEXT_PUBLIC_ANALYTICS_PROVIDER` (`plausible` | `umami`),
    `NEXT_PUBLIC_ANALYTICS_HOST` (origine https du collecteur, sans slash final),
    `NEXT_PUBLIC_ANALYTICS_SITE_ID` (`data-domain` Plausible / `data-website-id` Umami). Vides = aucun
    script chargé et CSP inchangée. Rien n'est collecté sans consentement explicite sur la catégorie
    `analytics` du bandeau cookies. Voir [docs/BACKLOG-acquisition-joueuses.md](docs/BACKLOG-acquisition-joueuses.md).
- Netlify / CI : mêmes variables dans l'environnement de build. Les `NEXT_PUBLIC_*` doivent exister au
  moment du build, sinon `next build` échoue sur l'erreur d'environnement Supabase.

## Documentation

- [docs/BOT_API_CONTRACT.md](docs/BOT_API_CONTRACT.md) — contrat de l'API bot (`/api/bot/v1/*`), source de vérité.
- [docs/PUBLIC_API_CONTRACT.md](docs/PUBLIC_API_CONTRACT.md) et [docs/CASTER_API_CONTRACT.md](docs/CASTER_API_CONTRACT.md) — API publique et API caster.
- [docs/adr/](docs/adr/) — décisions d'architecture (modules par domaine admin / joueur).
- [docs/ONBOARDING.md](docs/ONBOARDING.md) — création d'un tenant en libre-service.
