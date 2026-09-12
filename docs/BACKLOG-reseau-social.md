# Faire du site un réseau — 10 lots

_Écrit le 2026-09-12, après inventaire complet du code existant._

## Le constat qui commande tout

Les briques sociales sont **déjà construites** : annuaire opt-in cross-tenant
(`player_discovery_profiles`), graphe de suivi (`player_follows`), profil public
riche (rating Glicko-2, badges, palmarès), deux marchés symétriques
(`free_players` ↔ `team_openings`), parcours scrim complet, infrastructure de
notification à trois canaux. Les backlogs R1→R12 et N1→N8 sont marqués livrés.

En production : **38 comptes, 6 Discord liés, 3 BattleTags vérifiés, 0 profil
découvrable, 0 suivi, 0 message, 0 scrim, 0 grille de disponibilités.**

Le problème n'est donc pas l'absence de fonctionnalités, c'est que **les
primitives ne se croisent pas** et que **personne ne les trouve**. Ces dix lots
relient l'existant et amorcent le réseau. Aucun ne suppose que le réseau soit
déjà dense — règle héritée de `BACKLOG-reseau-intelligent.md`.

## Ce qui reste interdit

- **Aucune surface publique ou indexable pour les personnes.** Les équipes sont
  publiques, les joueuses non (`create_player_discovery_profiles.sql`,
  2026-07-13). Opt-in global, invisible par défaut, kill-switch instantané.
- **Pas de chat intégré** (`ETUDE-drive-et-chat.md`) : la messagerie capitaines
  affiche 0 message sur 58 demandes, et 39 % des membres n'ont pas de Discord
  lié. Un cinquième canal texte n'atteindrait personne.
- **Réputation dérivée des données, jamais de note entre pairs** (R10), pas de
  gamification décorative (N8).
- Toute écriture publique : honeypot + captcha + rate-limit + réponse
  non-oracle + porte de sortie autonome.

---

## Lot 1 — Le profil public cesse d'être un cul-de-sac

**Problème.** `pages/player/[userId].tsx` est la seule page que les gens
partagent et visitent. Elle n'a ni bouton Suivre, ni compteur d'abonnés, ni
équipes actuelles, ni moyen de contact — alors que `FollowButton.tsx` et
`player_follows` existent déjà.

**On fait.** Bloc social sous l'en-tête : Suivre (visiteuse connectée +
profil découvrable), nombre d'abonnées, équipes actuelles avec lien. Pour une
visiteuse non connectée : rien de plus qu'aujourd'hui — la page reste indexée,
donc aucune donnée nouvelle n'y apparaît sans login.

**Preuve.** Premier suivi créé depuis un profil, mesurable en base.

---

## Lot 2 — La découverte devient trouvable

**Problème.** Aucun lien vers `/player/discovery` dans la navigation. On n'y
accède que depuis sa propre page profil. D'où les 0 profils découvrables.

**On fait.** Entrée dans la navigation joueuse, invitation contextuelle après
publication d'une fiche `/rejoindre` ou `/recrutement`, et point d'entrée dans
l'espace joueur. Le texte dit ce que l'opt-in implique, et ce qu'il n'implique
pas (pas d'indexation, réversible en un clic).

**Preuve.** Profils découvrables > 0, puis courbe d'activation.

---

## Lot 3 — Le suivi produit quelque chose

**Problème.** Suivre quelqu'un ne notifie personne et n'alimente rien : aucun
event `follow` dans les catalogues.

**On fait.** Event `player.followed` (push opt-out, jamais d'email), et un fil
d'activité **dérivé** pour les personnes qu'on suit : matchs joués, tournoi
rejoint, montée de palier. Pas de posts, pas de likes : le fil se lit sur des
faits déjà en base.

**Preuve.** Une notification reçue, un fil non vide pour qui suit au moins une
joueuse.

---

## Lot 4 — Les deux marchés se regardent

**Problème.** Une joueuse sur `/rejoindre` ne voit pas les équipes qui
recrutent, et réciproquement. Constat C7 : les primitives ne se croisent pas.

**On fait.** Croisement des deux listes sur chaque page, filtré par postes :
« 3 équipes cherchent un support » sur `/rejoindre`, « 5 joueuses cherchent une
équipe » sur `/recrutement`, avec la bonne porte de contact selon le cas.

**Preuve.** Clics croisés d'une page à l'autre, puis mises en relation.

---

## Lot 5 — « Je cherche à jouer ce soir »

**Problème.** Aucune présence. Une joueuse disponible maintenant n'a aucun moyen
de le dire, et le scrim se négocie sur des créneaux à J+7.

**On fait.** Statut éphémère déclaré (quelques heures, expiration automatique),
visible dans la découverte et l'annuaire d'équipes. Pas de « en ligne »
permanent, pas de traçage : un statut qu'on pose et qui s'efface tout seul.

**Preuve.** Statuts posés, et scrims ou parties nés d'un statut.

---

## Lot 6 — Se parler sans construire un chat

**Problème.** Une joueuse sans équipe ne peut parler à personne : la messagerie
est équipe↔équipe et réservée à la gestion. Mais le chat est refusé, à raison.

**On fait.** Une **demande de contact** ponctuelle : la destinataire la reçoit
là où elle est déjà (DM Discord si lié, sinon email), avec le contexte et un
moyen de répondre hors du site. Pas de fil, pas de présence, pas de « en train
d'écrire ». Plafonné, refusable, et coupé par le kill-switch de découverte.

**Preuve.** Taux de réponse aux demandes de contact.

---

## Lot 7 — La fiabilité descend à l'échelle de la personne

**Problème.** La fiabilité anti-ghosting est calculée par équipe. Une joueuse
n'a aucun signal individuel, alors que les données existent (check-in,
présence aux matchs, réponses aux invitations).

**On fait.** Indicateur dérivé, seuil d'échantillon minimum, masqué en dessous —
mêmes règles que R10. Aucune note subjective, aucun classement de personnes.

**Preuve.** Indicateur affiché seulement au-delà du seuil, jamais avant.

---

## Lot 8 — Les commentaires d'actualité sortent de l'anonymat

**Problème.** `news_comments` n'a pas de `user_id` : impossible d'attribuer, de
répondre, de mentionner, ni de signaler un commentaire précis. C'est aussi le
seul contenu communautaire du site.

**On fait.** Commentaire attribué quand on est connectée (pseudo et avatar de la
carte de découverte), anonyme sinon comme aujourd'hui, plus un bouton
« signaler » contextuel qui alimente `support_tickets` via le champ
`reported_target_type` existant.

**Preuve.** Part de commentaires attribués, délai de traitement des
signalements.

---

## Lot 9 — Le parrainage, canal n°1 en esport féminin

**Problème.** Déjà identifié dans `BACKLOG-acquisition-joueuses.md` (lot 4) et
jamais livré. Or une joueuse arrive presque toujours par une autre joueuse.

**On fait.** Lien de parrainage nominatif, carte partageable au format story, et
attribution à l'inscription. Aucune récompense artificielle : la contrepartie
est la visibilité de l'équipe et le fait de jouer ensemble.

**Preuve.** Inscriptions attribuées à un parrainage.

---

## Lot 10 — Mesurer l'entonnoir, et fermer la porte indexée

**Problème.** Deux dettes qui empêchent de juger les neuf autres lots.
D'abord, aucune instrumentation : on ne sait pas où les gens décrochent entre
l'inscription, le Discord lié, le profil découvrable et le premier scrim
(lot 0 du backlog acquisition, jamais livré). Ensuite, `/player/[userId]` est
**indexable et injecté au sitemap** pour toute joueuse notée, sans opt-in —
ce qui contredit la règle « pas de page publique de personne ».

**On fait.** Un tableau d'entonnoir dans l'admin, alimenté par des faits déjà en
base. Et un arbitrage explicite sur le profil : soit il sort du sitemap et passe
en `noindex` sauf opt-in, soit la règle est réécrite pour dire pourquoi le
rating est public. Ma recommandation : sortir du sitemap, garder la page
accessible par lien.

**Preuve.** L'entonnoir affiche des chiffres, et une joueuse non opt-in
n'apparaît plus dans un moteur de recherche.

---

## Ordre d'exécution

1, 2 et 4 d'abord : ce sont des liages de quelques heures qui débloquent
l'amorçage. Puis 10 (mesurer avant d'ajouter), 3 et 5. Enfin 6, 7, 8, 9, qui
créent de la donnée nouvelle et méritent d'être jugés sur les chiffres des
précédents.
