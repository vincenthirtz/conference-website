# Temps réel sur Cloudflare (Durable Objects) à la place de Supabase Realtime

Préparation du 2026-10-29 — rien n'est encore construit. La base et les
comptes restent chez Supabase ; seul le « prévenir les écrans » change.

## Ce qui écoute aujourd'hui

Toutes les écoutes passent par `hooks/useRealtimeChannel.ts`
(`postgres_changes` Supabase), sauf la présence des casters et la Women's
Library.

| Écran | Table écoutée (filtre) | Réaction |
|---|---|---|
| Cloche de la joueuse (`components/Navbar/PlayerBell.tsx`) | `demandes` (équipe) | recharge |
| Messages capitaine (`features/player/messages/hooks/useCaptainMessages.ts`) | `demandes` (équipe) | recharge |
| Alertes de l'admin (`hooks/admin/useAdminAlertsCount.ts`) | `matches` UPDATE (tournoi) | recharge |
| Tableau de bord tournoi (`pages/admin/tournament/[id]/dashboard.tsx`) | `matches` (tournoi) | recharge (anti-rebond) |
| Draft (`hooks/useDraftState.ts`) | `match_drafts` (id), `match_draft_steps` (draft) | recharge |
| Scènes caster (`hooks/useCasterScenes.ts`) | `caster_scenes` | recharge |
| Thème caster (`hooks/useCasterTheme.ts`) | `caster_themes` | recharge |
| Overlay OBS (`pages/overlay/caster/[sceneKey].tsx`) | `caster_scenes` (id) | **applique la ligne reçue** |
| Présence des casters (`hooks/useCasterPresence.ts`) | Presence (pas une table) | liste des connectés |
| Women's Library (`features/player/library/realtime/`) | Broadcast + Presence privés | déplacements, chat — **bêta fermée** |

Volume mesuré (statistiques Postgres, 2026-10-29) : quelques milliers de
modifications au total sur les tables suivies (`matches` ~900,
`caster_presence` ~800, `caster_scenes` ~400, `demandes` ~280, `event_*`
~250). L'application de bureau womenscup-caster, qui écoutait aussi `matches`,
`caster_scenes` et `event_*`, est retirée (dépôt archivé le 2026-10-29).

## Ce qu'on construirait

1. **Un Worker à part, `owwomenscup-realtime`**, sur `realtime.owwomenscup.fr`.
   À part du site : chaque déploiement d'un Worker redémarre ses Durable
   Objects et coupe leurs connexions ; le site se déploie plusieurs fois par
   jour, le temps réel presque jamais.
2. **Un « salon » (Durable Object) par sujet** : `matches:tournoi:<id>`,
   `draft:<id>`, `demandes:equipe:<id>`, `caster:scenes`, `caster:themes`,
   `caster:scene:<id>`, `caster:presence`. Bibliothèque **PartyServer**
   (ex-PartyKit) côté Worker, **PartySocket** côté navigateur (reconnexion
   automatique), API d'hibernation activée (`hibernate: true`) : un salon
   sans message ne coûte rien.
3. **Des messages sans données** : « la table X, ligne Y, a changé ». L'écran
   recharge avec ses propres droits, comme aujourd'hui. Aucune donnée ne
   transite par le salon : les règles d'accès restent dans l'API et la base.
   L'overlay OBS passe au même schéma (recharger sa scène, publique).
4. **Entrée dans un salon privé** (`demandes`, admin) : un ticket court signé
   par l'API (HMAC, un salon, quelques minutes). Salons publics (overlay,
   draft en lecture) : sans ticket.
5. **Détection des changements dans la base**, comme Supabase aujourd'hui :
   un déclencheur Postgres sur chaque table suivie appelle le Worker via
   l'extension `pg_net` (disponible, pas encore activée), en asynchrone,
   signé avec un secret rangé dans Supabase Vault. Toutes les écritures sont
   vues — API, bot, éditeur SQL — sans toucher au code de l'API.
   Migration SQL écrite dans conference-api, appliquée par la propriétaire.
6. **Un interrupteur côté site**, `NEXT_PUBLIC_REALTIME_BACKEND=supabase|cloudflare`,
   lu par `useRealtimeChannel` (même interface pour les écrans) et la
   présence caster : bascule et retour arrière par un simple déploiement.

## Coût

Compris dans Workers Paid (5 $/mois), partagé avec le site : 1 million de
requêtes et 400 000 GB-s de calcul par mois pour les Durable Objects.

- Requêtes : une par connexion d'écran, une par changement notifié, et les
  messages entrants. Ordre de grandeur actuel : quelques milliers à quelques
  dizaines de milliers par mois, soit **moins de 5 %** de l'inclus.
- Calcul : avec l'hibernation, un salon ne compte que pendant qu'il traite un
  message ; même dix salons éveillés une heure par jour font ~135 000 GB-s,
  **un tiers** de l'inclus.
- Seul risque de dépassement : la Women's Library ouverte à beaucoup de
  joueuses (déplacements en continu = salons toujours éveillés). Le
  dépassement se paie par tranche entière : 12,50 $ le million de GB-s,
  0,15 $ le million de requêtes. Elle reste sur Supabase Realtime tant
  qu'elle est en bêta fermée ; à mesurer avant de l'y passer.

## Étapes

1. **Worker et salons** (sans effet) : `owwomenscup-realtime`, routes, tests.
2. **Déclencheurs en double** : la base prévient les salons, mais les écrans
   écoutent toujours Supabase. On compare les deux pendant quelques jours de
   matchs.
3. **Bascule des écrans** par l'interrupteur, un jour calme ; overlay et draft
   testés en conditions de match.
4. **Après deux semaines** : retrait des tables de la publication
   `supabase_realtime`.

Retour arrière avant l'étape 4 : l'interrupteur sur `supabase`.
