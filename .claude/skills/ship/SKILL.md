---
name: ship
description: Vérifier (tests unitaires + typecheck + lint), commiter, pousser, puis contrôler CI et déploiement. Usage — /ship [message de commit optionnel]
---

Porte de sortie unique pour expédier un changement. Ne jamais sauter une étape ;
ne jamais pousser avec une porte rouge.

1. **Périmètre.** `git status --short` et `git diff --stat`. Si des fichiers hors
   du sujet ont bougé, les lister et demander avant de continuer. Ne pas
   commiter `CLAUDE.md` si seule la bannière Next.js auto-régénérée a changé.

2. **Vérifier.** `npm run verify` (vitest unit + typecheck + biome, en parallèle,
   ~50 s à chaud). Lire la sortie, pas seulement le code de retour :
   - vitest : repérer la ligne `Tests  N passed` — N doit être > 0 et il ne doit
     y avoir ni `failed` ni `errors` ;
   - typecheck : `0 errors` ;
   - biome : `No fixes applied` / aucun diagnostic `error`.
   Une porte rouge → corriger, relancer. Ne pas pousser.
   Si une migration SQL fait partie du changement : `node
   scripts/refresh-schema-snapshot.mjs` AVANT verify (garde-fou
   `supabaseSelectSchema.test.ts`).

3. **Commiter.** Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`,
   `refactor:`, `!` si cassant), message en français pour tout ce qui est visible
   côté utilisateur. Utiliser le message passé en argument s'il y en a un.
   Terminer par la ligne `Co-Authored-By` en vigueur dans la session.

4. **Pousser.** `git push` sur la branche courante (jamais `--force` sans accord
   explicite). Si on est sur `master`, rappeler que ça déploie la prod.

5. **CI.** `gh run list --branch <branche> --limit 3` puis `gh run watch
   <id> --exit-status` sur le run `ci` déclenché par ce push. Rouge → ouvrir les
   logs (`gh run view <id> --log-failed`), corriger, reprendre à l'étape 2.

6. **Déploiement.**
   - `master` → vérifier la prod : `curl -sI https://owwomenscup.fr` (200), puis
     ouvrir la page concernée par le changement et confirmer qu'il est visible
     (contenu, pas seulement le statut HTTP). Pour `pages/api/*` → attendre que
     `notify-api-sync` ait tourné et vérifier aussi sur
     `https://api.owwomenscup.fr` si la famille de routes y est servie.
   - autre branche → donner l'URL de la deploy preview Netlify
     (`gh pr view --json url` ou le check « netlify/… » du run) et dire que la
     prod n'est pas touchée.

7. **Rapport.** Une ligne par étape : compteurs de tests, sha du commit, état
   CI, URL vérifiée et ce qui a été constaté. Si une étape a été sautée ou a
   échoué, le dire tel quel.
