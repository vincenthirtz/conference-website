# Contribuer

Site et plateforme de tournois de l'OW Women's Cup (Next.js pages router + Supabase, déployé sur Netlify).
Le guide de référence est [CLAUDE.md](CLAUDE.md) : architecture, conventions, commandes. Ce fichier n'en
reprend que le minimum pour proposer un changement.

## Avant de commiter

```bash
npm run typecheck
npm run lint
npm run format:check     # la CI lance `biome ci` : un écart de formatage la fait échouer
npm run test:unit
```

Les tests e2e (`npm run test`) demandent un `.env.local` ; lancer au moins les specs touchées.
Le build est vérifié par la CI, pas besoin de le lancer en local.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/fr/v1.0.0/) avec une portée :
`feat(admin): …`, `fix(api/bot/v1): …`, `docs(contrat-bot): …`. Un `!` signale un changement cassant.
Un commit par sujet ; les messages sont en français.

## Points à ne pas oublier

- **Contrat bot** : toute modification d'une route `/api/bot/v1/*` met à jour
  [docs/BOT_API_CONTRACT.md](docs/BOT_API_CONTRACT.md) dans le même commit, et signale le changement
  correspondant dans le dépôt du bot (`owwc-discord-bot`, point d'entrée `api-client.js`).
- **Base de données** : les migrations vivent dans `database/migrations/`, idempotentes, RLS activée par
  défaut sur les tables sensibles.
- **Dépendances** : en ajouter une est permis quand elle bat clairement du code maison ; le justifier dans
  le message de commit.

## Code de conduite

Les participants s'engagent à respecter le [code de conduite](CODE_OF_CONDUCT.md).
Contact : owwomenscup@gmail.com.
