# Comptes et connexion : Better Auth à la place de Supabase Auth

Plan du 2026-10-29, **étude technique faite le même jour** — rien n'est
construit. La base reste chez Supabase ; seul le système de comptes
changerait.

## Verdict de l'étude

**Faisable, sans obstacle technique ; à ne pas lancer maintenant.**

- Aucune économie tant que la base reste chez Supabase : Supabase Auth y est
  compris, et les comptes d'un fournisseur externe sont gratuits jusqu'à
  50 000 par mois (100 000 en Pro) — on en a 30.
- Le risque est le plus élevé de toute la sortie de Supabase : une erreur
  empêche tout le monde de se connecter, staff compris.
- Le seul gain concret avancé — la double authentification — existe déjà :
  écran `components/admin/profile/StaffMfaPanel.tsx` et interrupteur
  `STAFF_MFA_ENFORCED` (conference-api `utils/staffMfa.ts`), mais aucun
  compte ne l'a activée.

À reconsidérer seulement si la sortie de la base elle-même est décidée
(c'est elle qui coûte : Supabase Pro). Les comptes passeraient alors avant
la base, par le chemin décrit plus bas.

## Aujourd'hui (remesuré le 2026-10-29)

- 114 comptes : 89 avec mot de passe (tous en bcrypt), 70 liés à Discord,
  85 identités e-mail ; aucun e-mail non confirmé, aucun compte anonyme ;
  aucune double authentification activée ; 30 connexions sur 30 jours ;
  11 membres du staff. Les 114 portent des métadonnées (`role`, nom…), lues
  84 fois dans le code (58 dans l'API, 26 dans le site).
- Base : **44** clés étrangères vers `auth.users` depuis 34 tables (et non 54
  comme écrit d'abord : ce premier compte incluait les tables internes de
  Supabase) ; 26 des 98 règles d'accès reconnaissent la personne connectée
  (`auth.uid()` / `auth.jwt()`), sur 13 tables dont 6 ne servent plus (retrait
  de l'application de bureau) ; 1 fonction utilise `auth.uid()`, 8 lisent
  `auth.users` (listes et recherches admin, TCG).
- Code : `supabase.auth.*` 73 fois dans le site (33 fichiers), 70 fois dans
  conference-api (46 fichiers), dont 51 appels d'administration
  (`auth.admin.getUserById` ×28, `updateUserById` ×7, `createUser` ×5,
  `generateLink` ×4, `deleteUser` ×4, `listUsers` ×3). Le bot Discord n'y
  touche pas.

## Ce que l'étude a vérifié

1. **Supabase accepte un fournisseur externe** (« Third-Party Auth », Custom
   OIDC) : découverte à `<issuer>/.well-known/openid-configuration`, jetons
   signés par clé asymétrique avec `kid`, émetteur en HTTPS. Le jeton doit
   porter `role: authenticated` (sans lui, la requête passe en `anon`). La
   base, les fichiers et l'autorisation du temps réel le reconnaissent.
   `auth.uid()` lit le `sub` du jeton converti en UUID : en gardant les
   identifiants actuels, les 26 règles d'accès restent telles quelles.
   Supabase relit les clés publiques périodiquement (30 min pour une
   rotation). Supabase Auth ne peut pas être désactivé, il resterait en
   place (inutilisé).
2. **Algorithme** : Supabase vérifie ES256 et RS256 ; EdDSA, le choix par
   défaut du greffon `jwt` de Better Auth, y est « à venir ». → régler
   `jwks.keyPairConfig.alg: 'ES256'`.
3. **Better Auth** (1.7.14 au 2026-10-27) : greffon `jwt` (route `/token`,
   JWKS, `kid` dans l'en-tête, charge utile réglable par `definePayload` —
   on y met `role: 'authenticated'` et `aal` pour la double
   authentification —, `sub` = identifiant du compte, émetteur et audience
   réglables, rotation des clés). Il ne publie pas la découverte OIDC : le
   Worker la sert lui-même (document fixe qui pointe vers le JWKS).
   Discord, mot de passe oublié (envoi par nos soins, via Brevo) et double
   authentification TOTP sont fournis.
4. **Reprise des comptes** : le guide officiel de migration depuis Supabase
   lit `auth.users` et `auth.identities`, **garde les identifiants** et
   recopie les hash bcrypt (vérification bcrypt configurée : personne ne
   change de mot de passe). Il utilise le module natif `bcrypt`, absent des
   Workers → `bcryptjs` (JavaScript pur, ~0,1 s de calcul par connexion,
   dans les limites du forfait). Les sessions ne se transfèrent pas : chacun
   se reconnecte une fois. La double authentification et les règles d'accès
   ne sont pas couvertes par le guide (ici : aucune 2FA à reprendre, règles
   d'accès conservées grâce au point 1).

## Comment on le construirait (si on y va)

1. **Un Worker `owwomenscup-auth` servi sur `owwomenscup.fr/auth/*`** (route
   du Worker sur la zone, comme le site) : même origine que le site, donc
   cookie de session sur owwomenscup.fr, lisible par le rendu serveur des
   pages, sans cookie partagé entre sous-domaines (que la doc de sécurité de
   Better Auth déconseille derrière un relais). Déploiements indépendants du
   site. Comptes dans la base Supabase (schéma dédié) via Hyperdrive, cache
   de Hyperdrive coupé pour les sessions.
   Alternative : l'intégrer à conference-api (Node, base en direct, bcrypt
   natif, déjà servi sur owwomenscup.fr/api/*) — à trancher avec la décision
   sur l'hébergement de l'API (rappel du 2026-11-11).
2. **Reprise** : mêmes UUID, e-mails, hash bcrypt, comptes Discord,
   métadonnées en champs additionnels. Adresse de retour à déclarer dans
   l'application Discord.
3. **Supabase** : fournisseur Custom OIDC (émetteur `https://owwomenscup.fr/auth`) ;
   supabase-js reçoit le jeton par son option `accessToken` (navigateur et
   rendu serveur).
4. **API** : vérification du jeton par le JWKS (au lieu de `auth.getUser`) ;
   les 51 appels d'administration deviennent des lectures et écritures de la
   table des comptes.
5. **Base** (migration conference-api, appliquée par la propriétaire) : les 44
   clés étrangères repointées vers la table des comptes, les 8 fonctions qui
   lisent `auth.users` réécrites.
6. **Bascule** un soir calme derrière un interrupteur ; retour arrière par
   l'interrupteur, les comptes Supabase restant en place deux semaines.

Effort : environ 3 semaines, surtout les ~143 appels, les 84 lectures de
métadonnées et leurs tests.

## En attendant : ce qui protège déjà, sans migration

- **Activer la double authentification du staff** (Supabase Auth, déjà
  construite) : chacun l'active depuis son profil admin, puis
  `STAFF_MFA_ENFORCED` l'exige sur les routes sensibles.
- **Cloudflare Access devant `/admin`**, en option : connexion
  supplémentaire pour le staff, gratuite jusqu'à 50 personnes (on est 11).
  Ne remplace rien ; à étudier à part (le cockpit `/admin/caster` et les
  routes `/api/admin/*` passent par la même origine).
