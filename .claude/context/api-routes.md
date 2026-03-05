# API Routes

## Routes publiques

| Route | Méthodes | Description |
|-------|----------|-------------|
| `/api/announcements` | GET | Annonces actives |
| `/api/blizzard-news` | GET | Actualités OW2 |
| `/api/blizzard-media` | GET | Médias OW2 (comics, stories) |
| `/api/patch-notes` | GET | Patch notes OW2 |
| `/api/cast-members` | GET | Casteurs/streamers actifs |
| `/api/contact` | POST | Formulaire de contact (rate limited via Supabase) |
| `/api/maps/stats` | GET | Statistiques des maps |
| `/api/matches/[matchId]` | GET | Détails d'un match |
| `/api/matches/[matchId]/games` | GET | Games/rounds d'un match |
| `/api/news` | GET | Articles publiés (pagination, filtres) |
| `/api/news/comments` | GET/POST/DELETE | Commentaires articles |
| `/api/news/rss` | GET | Flux RSS |
| `/api/partners` | GET | Partenaires actifs |
| `/api/partnership-requests` | POST | Soumettre demande partenariat |
| `/api/site-settings` | GET | Paramètres du site |
| `/api/teams` | GET | Liste des équipes |
| `/api/teams/[id]` | GET | Détails équipe |
| `/api/teams/create-with-member` | POST | Créer équipe + capitaine |
| `/api/teams/add-member` | POST | Rejoindre équipe (auth) |
| `/api/teams/search-players` | GET | Rechercher joueurs |
| `/api/team/[id]/stats` | GET | Stats équipe |
| `/api/team/[id]/maps` | GET | Stats maps équipe |
| `/api/tournaments` | GET | Tournois publics |
| `/api/tournament/[id]/maps` | GET | Stats maps tournoi |
| `/api/tournament/[id]/matches` | GET | Matchs tournoi |
| `/api/tournament/[id]/stats` | GET | Stats tournoi |
| `/api/twitch-channels` | GET | Chaînes Twitch partenaires |
| `/api/twitch/live` | GET | Statut live Twitch |
| `/api/demandes/join` | POST | Demande rejoindre équipe |
| `/api/demandes/captain` | POST | Demande capitaine |

## Routes admin (protégées par `withStaffRoute`)

Toutes nécessitent un Bearer token + rôle staff minimum.

| Route | Méthodes | Rôle min | Description |
|-------|----------|----------|-------------|
| `/api/admin/me` | GET/PATCH | caster | Profil staff courant |
| `/api/admin/logs` | GET | admin | Logs d'audit staff |
| `/api/admin/adherents` | GET | manager | Liste adhérents |
| `/api/admin/adherents/[id]` | GET/PATCH | manager | CRUD adhérent |
| `/api/admin/announcements` | GET/POST | manager | Annonces |
| `/api/admin/announcements/[id]` | GET/PATCH/DELETE | manager | CRUD annonce |
| `/api/admin/cast-members` | GET/POST/PATCH/DELETE | manager | Casteurs |
| `/api/admin/comments` | GET/PATCH | manager | Modération commentaires |
| `/api/admin/contact-submissions` | GET | manager | Soumissions contact |
| `/api/admin/demandes` | GET | manager | Demandes joueurs |
| `/api/admin/news` | GET/POST | manager | Articles |
| `/api/admin/news/[id]` | GET/PATCH/DELETE | manager | CRUD article |
| `/api/admin/partners` | GET/POST/PATCH/DELETE | manager | Partenaires |
| `/api/admin/partnership-requests` | GET/PATCH | manager | Demandes partenariat |
| `/api/admin/site-settings` | GET | admin | Paramètres site |
| `/api/admin/site-settings/[key]` | PATCH | admin | Modifier paramètre |
| `/api/admin/teams` | GET | caster | Liste équipes |
| `/api/admin/teams/[teamId]` | GET/PATCH/DELETE | manager | CRUD équipe |
| `/api/admin/teams/[teamId]/members` | GET | caster | Membres équipe |
| `/api/admin/teams/[teamId]/tournaments` | GET/POST/DELETE | manager | Participation tournoi |
| `/api/admin/teams/add-member` | POST | manager | Ajouter membre |
| `/api/admin/tournaments` | GET/POST | manager | Tournois |
| `/api/admin/tournament/[id]` | GET/PATCH | manager | CRUD tournoi |
| `/api/admin/tournament/[id]/matches` | GET | caster | Matchs tournoi |
| `/api/admin/tournament/[id]/stages` | GET/POST | manager | Phases tournoi |
| `/api/admin/tournament/[id]/auto-schedule` | POST | admin | Auto-planification |
| `/api/admin/matches/[matchId]` | GET/PATCH | manager | Score match |
| `/api/admin/stages/[stageId]` | GET/PATCH/DELETE | manager | Phase tournoi |
| `/api/admin/stages/[stageId]/auto-byes` | POST | manager | Générer byes |
| `/api/admin/stages/[stageId]/generate-swiss-round` | POST | manager | Round swiss |
| `/api/admin/users` | GET | admin | Liste users |
| `/api/admin/users/manage` | POST | owner | Gérer rôles |
| `/api/admin/twitch-channels` | GET/POST/PATCH/DELETE | manager | Chaînes Twitch |
