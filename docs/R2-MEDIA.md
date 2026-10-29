# Fichiers sur R2 (Cloudflare) à la place de Supabase Storage

Décision du 2026-10-29 : les fichiers (logos, cartes TCG, actualités,
vignettes des réseaux, alertes de stream, règlements, preuves de match)
quittent Supabase Storage pour R2. La base, les comptes et le temps réel
restent chez Supabase. Premier pas, indépendant du reste ; coût 0 $ (offre
gratuite R2 : 10 Go, on en a 44 Mo).

## Ce qui existe

| | Supabase (avant) | R2 (après) |
|---|---|---|
| Fichiers publics | bucket `teams-images` (public) | bucket `owwomenscup-media`, juridiction **UE** |
| Adresse publique | `https://yhfdhpqgmazfxyyklomp.supabase.co/storage/v1/object/public/teams-images/<clé>` | `https://media.owwomenscup.fr/<clé>` |
| Preuves de match | bucket `match-evidence` (privé, vide) | bucket `owwomenscup-evidence` (privé, UE), liens signés |

Les **clés ne changent pas** (`tcg/…`, `social/…`, `team-<uuid>/…`) : passer
d'une adresse à l'autre revient à remplacer le préfixe.

Réglages de `media.owwomenscup.fr` (zone Cloudflare) :

- CORS : lecture (`GET`, `HEAD`) depuis toute origine, comme Supabase.
- En-têtes (règle « Transform » de la zone) : `X-Content-Type-Options:
  nosniff` partout ; hors PDF, `Content-Security-Policy: default-src 'none';
  img-src 'self' data:; style-src 'unsafe-inline'; media-src 'self'; sandbox`.
  Supabase servait ces fichiers depuis son propre domaine ; ici c'est un
  sous-domaine du site, et une partie vient des utilisatrices (SVG nettoyés à
  l'envoi). Le bac à sable empêche un fichier ouvert directement d'exécuter
  quoi que ce soit au nom de owwomenscup.fr. Les PDF (règlements, envoyés par
  le staff) en sont exclus : Chrome ne les affiche pas en bac à sable.
- Cache : sans `Cache-Control` sur l'objet, Cloudflare applique 4 h. Les
  objets copiés à la bascule et ceux envoyés par l'API portent le leur
  (1 h, ou 1 an pour les fichiers à empreinte), comme sur Supabase.

## Ce qu'il faut changer

**API (conference-api)** — tout passe par un seul module, avec un
interrupteur `MEDIA_BACKEND=supabase|r2` pour basculer et revenir :

- envoi / suppression (~12 fichiers) : `pages/api/admin/upload.ts`,
  `admin/stream-alerts.ts`, `admin/tcg/association.ts`,
  `admin/tcg/overlay-theme.ts`, `player/tcg/photo.ts`, `player/tcg/fanart.ts`,
  `teams/[teamId]/upload-image.ts`, `teams/[teamId]/tcg-image.ts`,
  `utils/social/rehostImage.ts`, `utils/tcg/photoPurge.ts`,
  `utils/player/erasePersonalData.ts`, `utils/matches/evidence.ts` (privé,
  liens signés) ;
- adresse publique (`getPublicUrl`, ~10 endroits) : `features/admin/tcg/repository.ts`,
  `utils/tcg/readCardFaces.ts`, `utils/tcg/teamCardImage.ts`,
  `utils/tcg/overlayTheme.ts`, `utils/overlay/alertMedia.ts`,
  `utils/tcg/readHomeTcgShowcase.ts`… ;
- reconnaissance d'une adresse de fichier dans un texte :
  `utils/images/optimizableImage.ts`, `utils/social/rehostImage.ts`,
  `utils/tcg/fanart.ts` — doivent accepter les deux hôtes ;
- client R2 : API S3 de R2 (clé d'accès R2 limitée aux deux buckets, posée
  dans `/etc/conference-api/api.env`).

**Site** — fait le 2026-10-29 : `media.owwomenscup.fr` autorisé pour
l'optimiseur d'images (`next.config.js`) et en `media-src` (`proxy.ts`).
À la bascule : `pages/tcg.tsx` (appel direct à `getPublicUrl`) et
`config/homeChampion.ts` (adresse écrite en dur) ; le reste vient de l'API
par la synchro.

**Base** — liens complets à réécrire (préfixe Supabase → `media.owwomenscup.fr`) :
`social_feed_items.thumbnail_url` (84), `news.image_url` (15),
`teams.logo_url` (7), `site_settings.value` (1), `caster_scenes.data` (1),
`tournaments.rules_url` (1). Les historiques (`staff_logs`, `team_audit_logs`,
`bot_event_outbox`, `admin_idempotency`) gardent les anciennes adresses.
Les chemins seuls (cartes TCG, photos, fan-arts) n'ont pas à bouger.

## Étapes

1. **Préparer R2** (sans effet) — 2026-10-29 : buckets, domaine, CORS,
   en-têtes, site prêt. Copie d'essai des 150 fichiers, relus et comparés
   (MD5) sur `media.owwomenscup.fr`.
2. **API** — **fait le 2026-10-29** : module unique (`utils/storage/mediaStore.ts`,
   `mediaUrl.ts`) + backend R2 derrière `MEDIA_BACKEND`, déployé en
   `supabase` (aucun changement visible ; adresses servies vérifiées
   identiques). L'adresse publique suit `MEDIA_BASE_URL` côté API (lue au
   démarrage) et `NEXT_PUBLIC_MEDIA_BASE_URL` côté site (au build, variable
   de l'environnement GitHub `cloudflare-production`).
3. **Bascule** — **faite le 2026-10-29** :
   - copie finale des 150 fichiers avec leur `Cache-Control` d'origine (1 h,
     ou 1 an pour les 35 à empreinte), relus identiques (MD5, type, cache) ;
   - réglage de zone **Browser Cache TTL = « Respect Existing Headers »**
     (il était à 4 h et remplaçait toute durée plus courte) ;
   - clé R2 « conference-api-media » (Object Read & Write sur les deux
     buckets) dans `/etc/conference-api/api.env`, avec `MEDIA_BACKEND=r2` et
     `MEDIA_BASE_URL=https://media.owwomenscup.fr`, relance bleu/vert sans
     coupure (`conference-api-switch $(cat /opt/conference-api/.tag)`) ;
   - site : variable `NEXT_PUBLIC_MEDIA_BASE_URL` (environnement
     `cloudflare-production`) et redéploiement ;
   - migration `media_urls_to_r2.sql` (conference-api) appliquée par la
     propriétaire : 84 vignettes, 15 actualités, 7 logos, le règlement, un
     réglage et une scène caster ; `updated_at` conservés ;
   - contrôles : plus aucune adresse Supabase sur l'accueil, `/tcg`,
     `/tcg/fan-art`, une équipe et un tournoi ; images en 200 en direct et
     par l'optimiseur ; mentions légales à jour (fichiers chez Cloudflare R2,
     UE).
4. **Avancée par la propriétaire le 2026-10-29** (au lieu du 2026-11-12) :
   suppression des buckets Supabase `teams-images` et `match-evidence` (les
   liens historiques des journaux pointeront alors dans le vide, c'est
   accepté). Ordre retenu : d'abord un **essai d'envoi** depuis l'admin
   (image d'actualité ou logo) — aucun fichier n'avait encore été envoyé
   vers R2 depuis la bascule —, vérifié dans la base et sur
   media.owwomenscup.fr ; ensuite seulement, dans le tableau de bord Supabase
   › Storage : `teams-images` › Empty bucket puis Delete bucket,
   `match-evidence` (vide) › Delete bucket. Après ça, plus de retour arrière
   vers Supabase Storage. Les fichiers n'ont alors qu'une copie, dans R2
   (comme ils n'en avaient qu'une chez Supabase).

## Retour arrière (avant l'étape 4)

1. API : dans `/etc/conference-api/api.env`, `MEDIA_BACKEND=supabase` et
   `MEDIA_BASE_URL=` (vide), puis relance bleu/vert.
2. Site : vider la variable `NEXT_PUBLIC_MEDIA_BASE_URL` et relancer le
   workflow `cloudflare`.
3. Recopier vers Supabase les fichiers envoyés dans R2 depuis la bascule.
4. Migration `media_urls_to_r2_revert.sql` (conference-api) dans l'éditeur
   SQL de Supabase.
