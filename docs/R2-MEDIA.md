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
3. **Bascule** : clé R2 (limitée aux deux buckets) dans
   `/etc/conference-api/api.env` avec `MEDIA_BACKEND=r2` et
   `MEDIA_BASE_URL=https://media.owwomenscup.fr`, relance bleu/vert
   (`conference-api-switch $(cat /opt/conference-api/.tag)`) ; côté site,
   `NEXT_PUBLIC_MEDIA_BASE_URL` puis redéploiement ; copie finale (avec
   `Cache-Control`) ; migration `media_urls_to_r2.sql` (conference-api) ;
   migration SQL des liens ; contrôles (logos, cartes, actualités, alerte
   de stream, preuve de match) ; mentions légales : les fichiers passent de
   Supabase à Cloudflare (`hostingServices`, FR et EN).
4. **Après deux semaines** : suppression des buckets Supabase.

## Retour arrière

Avant l'étape 4 : `MEDIA_BACKEND=supabase` et migration inverse des liens
(remplacement du préfixe dans l'autre sens). Les fichiers envoyés pendant la
période R2 sont à recopier vers Supabase avant.
