# Pages

## Pages publiques

| Page | Description |
|------|-------------|
| `/` | Accueil : header, tournoi mixte, à propos, news, Twitch live, contact |
| `/actualites` | Liste des articles + patch notes OW |
| `/news/[slug]` | Article individuel |
| `/association` | Présentation de l'association |
| `/partenaires` | Vitrine des partenaires |
| `/partenaires/demande` | Formulaire de demande de partenariat |
| `/contact` | Page de contact |
| `/don` | Page de dons |
| `/rules` | Règlement du tournoi |
| `/lore` | Lore Overwatch |
| `/hero-picker` | Sélecteur de héros interactif |
| `/mentions-legales` | Mentions légales |
| `/plan-du-site` | Plan du site |
| `/register` | Inscription utilisateur |
| `/timeline-2026` | Roadmap saison 2026 |

## Pages tournoi

| Page | Description |
|------|-------------|
| `/tournoi` | Édition courante (2025) |
| `/tournaments` | Liste de tous les tournois |
| `/tournament/[id]` | Détails tournoi (standings, matchs récents) |
| `/tournament/[id]/bracket` | Bracket double-élim |
| `/tournament/[id]/matches` | Tous les matchs |
| `/tournament/[id]/maps` | Stats maps |
| `/tournament/[id]/stats` | Stats équipes |

## Pages équipe / joueur

| Page | Description |
|------|-------------|
| `/team/[slug]` | Profil équipe |
| `/team/[slug]/stats` | Stats équipe |
| `/team/[slug]/maps` | Win rates par map |
| `/team/create` | Créer une équipe |
| `/player` | Dashboard joueur |
| `/player/join-team` | Demande rejoindre une équipe |
| `/player/request-captain` | Demande devenir capitaine |
| `/match/[id]` | Détails match |
| `/match/[id]/games` | Games/rounds du match |

## Pages admin

Toutes protégées par `withStaffPage(minRole)`. Redirection vers `/admin/login` si non authentifié.

- `/admin` — Dashboard
- `/admin/login` / `/admin/logout` / `/admin/forgot-password` / `/admin/reset-password`
- `/admin/tournaments/*` — Gestion tournois, stages, bracket, matchs
- `/admin/teams/*` — Gestion équipes, membres
- `/admin/news/*` — Gestion articles
- `/admin/comments` — Modération commentaires
- `/admin/partners/*` — Gestion partenaires
- `/admin/partnership-requests/*` — Demandes partenariat
- `/admin/adherents/*` — Gestion adhérents
- `/admin/cast-members/*` — Gestion casteurs
- `/admin/announcements/*` — Bannières d'annonces
- `/admin/twitch-channels/*` — Chaînes Twitch
- `/admin/demandes` — Demandes joueurs
- `/admin/site-settings` — Configuration du site
- `/admin/users/manage` — Gestion staff
- `/admin/logs` — Logs d'audit
- `/admin/stats/*` — Statistiques (maps, équipes)
