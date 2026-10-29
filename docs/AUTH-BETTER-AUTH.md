# Comptes et connexion : Better Auth à la place de Supabase Auth

Préparation du 2026-10-29 — rien n'est construit. La base reste chez
Supabase ; seul le système de comptes changerait.

## Aujourd'hui (mesuré le 2026-10-29)

- 114 comptes : 89 avec mot de passe (tous chiffrés en bcrypt), 70 liés à
  Discord, 85 identités e-mail ; aucune double authentification activée ;
  30 connexions sur les 30 derniers jours.
- Base : 54 clés étrangères vers `auth.users` ; 26 des 98 règles d'accès
  (RLS) reconnaissent la personne connectée par `auth.uid()` / `auth.jwt()` ;
  une fonction aussi.
- Code : `supabase.auth.*` appelé 71 fois dans le site (32 fichiers) et 72 fois
  dans conference-api (47 fichiers) ; 29 fichiers du site interrogent la base
  depuis le navigateur sous la session de la joueuse (donc sous les règles
  d'accès).

## L'idée qui rend la chose faisable

Supabase accepte un fournisseur d'identité externe (« Third-Party Auth »,
**Custom OIDC**) : un service OpenID Connect qui publie sa découverte
(`/.well-known/openid-configuration`, `jwks_uri`) et signe ses jetons avec une
clé asymétrique (`kid`). Better Auth sait jouer ce rôle (greffons `jwt` et
fournisseur OIDC). La base continue alors de reconnaître la personne
connectée (`auth.uid()` = `sub` du jeton) : les 26 règles d'accès, le temps
réel privé et les requêtes du navigateur restent tels quels ; supabase-js
reçoit le jeton par son option `accessToken`.

Conditions : `sub` = l'UUID actuel du compte (on garde les mêmes
identifiants) ; les claims exigés par Supabase pour un jeton tiers (`role:
authenticated`, `aud`…) — **à vérifier** à l'étude technique.

## Ce qu'on construirait

1. **Better Auth dans un Worker** (`auth.owwomenscup.fr`), comptes rangés dans
   la base Supabase (schéma dédié, accès par Hyperdrive) : même base, donc les
   54 liens peuvent pointer vers la nouvelle table des comptes.
2. **Reprise des comptes** : mêmes UUID et e-mails, hash bcrypt repris tels
   quels (vérification bcrypt configurée ; personne ne change de mot de
   passe), comptes Discord repris d'`auth.identities`.
3. **Fonctions** : e-mail + mot de passe, Discord, mot de passe oublié (envoi
   par Brevo, comme aujourd'hui), double authentification TOTP — l'occasion
   de l'activer pour le staff —, sessions par cookie sur owwomenscup.fr.
4. **Supabase** : ajout du fournisseur Custom OIDC ; client supabase-js avec
   `accessToken`.
5. **Code** : remplacer les ~143 appels `supabase.auth.*` (site + API) ; mêmes
   pages (`/login`, retours OAuth).
6. **Les 54 clés étrangères** repointées vers la table des comptes Better Auth
   (migration SQL dans conference-api, appliquée par la propriétaire).
7. **Bascule** un soir calme, derrière un interrupteur ; chacune se reconnecte
   une fois (les sessions Supabase ne se transfèrent pas). Retour arrière :
   l'interrupteur, les comptes Supabase étant restés en place.

## Coût

0 $ : Better Auth est libre ; Worker et Hyperdrive tiennent dans les 5 $ de
Workers Paid ; les comptes tiers sont comptés par Supabase comme les autres,
très en dessous du quota.

Mais **aucune économie tant que la base reste chez Supabase** : Supabase Auth
y est compris. Le bénéfice : un pas vers une sortie complète de Supabase (la
base resterait alors le dernier morceau) et des fonctions (double
authentification, passkeys) sous notre contrôle.

## Effort et risques

Estimation : 2 à 4 semaines de travail, surtout les ~143 appels et leurs
tests. Risques : une panne de connexion touche tout le monde ; adresse de
retour à déclarer dans l'application Discord ; e-mails de réinitialisation ;
cohérence des UUID entre les deux systèmes pendant la transition.

## Ordre conseillé

Après la bascule des fichiers (docs/R2-MEDIA.md) et du temps réel
(docs/REALTIME-DO.md), et seulement si la sortie de la base est envisagée :
sinon, garder Supabase Auth, qui ne coûte rien de plus.

## Étapes (si on y va)

1. **Étude technique** : claims exigés par Supabase pour un jeton tiers,
   temps réel privé avec un jeton tiers, vérification bcrypt de Better Auth
   dans un Worker, accès à la base par Hyperdrive.
2. **Worker Better Auth en parallèle** : comptes copiés, essai sur un compte
   de test, sans rien brancher.
3. **Branchement** derrière l'interrupteur, côté site et API.
4. **Bascule**, puis retrait de Supabase Auth après deux semaines.
