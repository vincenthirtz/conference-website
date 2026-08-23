This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, fork the repository and clone it.

```bash
git clone https://github.com/<username>/conference-website.git
```

Change Directory

```bash
cd conference-website
```

Install Dependencies

```bash
npm install
```

Run the development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.js`. The page auto-updates as you edit the file.

[API routes](https://nextjs.org/docs/api-routes/introduction) can be accessed on [http://localhost:3000/api/hello](http://localhost:3000/api/hello). This endpoint can be edited in `pages/api/hello.js`.

The `pages/api` directory is mapped to `/api/*`. Files in this directory are treated as [API routes](https://nextjs.org/docs/api-routes/introduction) instead of React pages.

## Environment variables

- Copy `example.env.local` to `.env.local` and fill it with your project values.
- Required keys:
  - `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase public anon key.
  - `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (server only, keep it secret).
  - `NEXT_PUBLIC_FORMSPREE_ID`: Formspree form id (e.g. `f/xxxxxxx`).
  - `DISCORD_TEAM_SECRET`: shared token to allow the Discord bot to hit `/api/discord/teams`.
  - Twitch live / OAuth: `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_REDIRECT_URI` (e.g. `http://localhost:3000/api/twitch/oauth-callback`).
  - Analytics (optional, all-or-nothing): `NEXT_PUBLIC_ANALYTICS_PROVIDER` (`plausible` | `umami`), `NEXT_PUBLIC_ANALYTICS_HOST` (https origin of the collector, no trailing slash), `NEXT_PUBLIC_ANALYTICS_SITE_ID` (Plausible `data-domain` / Umami `data-website-id`). Leave them empty to disable analytics entirely — no script is loaded and the CSP stays unchanged. Nothing is collected without explicit consent on the cookie banner's `analytics` category. See [docs/BACKLOG-acquisition-joueuses.md](docs/BACKLOG-acquisition-joueuses.md).
  - Commentaires news : appliquer `database/news_comments.sql` sur votre base (Supabase) pour créer la table `news_comments`.
- Netlify/CI: add the same variables in your build environment. `NEXT_PUBLIC_*` values must exist at build time or `next build` will fail with the Supabase env error.

## AsyncAPI Contributors ✨

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://linktr.ee/thulieblack"><img src="https://avatars.githubusercontent.com/u/66913810?v=4?s=100" width="100px;" alt="V Thulisile Sibanda"/><br /><sub><b>V Thulisile Sibanda</b></sub></a><br /><a href="https://github.com/asyncapi/website/commits?author=thulieblack" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://www.behance.net/muibudeenaisha"><img src="https://avatars.githubusercontent.com/u/105395613?v=4?s=100" width="100px;" alt="AISHAT MUIBUDEEN"/><br /><sub><b>AISHAT MUIBUDEEN</b></sub></a><br /><a href="#design-Mayaleeeee" title="Design">🎨</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!
