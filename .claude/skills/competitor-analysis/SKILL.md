---
name: competitor-analysis
description: Analyse complète d'un site concurrent (plateforme de tournois esport, outil d'organisation, SaaS pour associations ou organisateurs) puis comparaison FACTUELLE avec notre produit (conference-website / Circuit / Women's Cup, bot docker-box) et plans d'action priorisés. Collecte passive des pages publiques (y compris les SPA), sondage du bundle JS, inventaire de notre produit lu dans le code. Use when the user says "/competitor-analysis <url>", « analyse <site> et compare avec notre projet », « benchmark ce concurrent », « que fait X de mieux que nous », « propose des plans face à X ».
---

# Analyse concurrentielle

Produire, pour un site concurrent, un rapport qui tienne devant une décision :
ce qu'il est, ce qu'il fait mieux ou moins bien que nous, et quoi faire.
Chaque affirmation repose sur une preuve — une page rendue, une ligne du
bundle, un fichier de notre code. Rien de mémoire.

Scripts du skill (depuis la racine de `conference-website`) :

| Script | Rôle |
|---|---|
| `scripts/collect.sh <url> <dossier>` | HTML brut, en-têtes, robots, sitemap, bundle JS, signaux techniques et traceurs |
| `node scripts/probe-bundle.mjs <dossier>` | routes, backend, fonctions serveur, intégrations, jeux, indices de fonctionnalités (clés masquées) |
| `node scripts/render.cjs <url> <dossier> [--max=40] [--delay=1500] [chemins…]` | rendu navigateur des pages publiques, texte sans gabarit, captures, hôtes tiers au 1er chargement |
| `scripts/our-product.sh [sortie.md]` | notre barème, nos jeux, notre surface, nos capacités avec preuves, cohérence des prix affichés |
| `templates/rapport.md` | trame du rapport |

Préfixe des chemins : `.claude/skills/competitor-analysis/`.

## Règles non négociables

1. **Passif et public.** Uniquement ce qu'un visiteur anonyme reçoit. Pas de
   compte créé, pas de formulaire soumis, pas de clic « accepter les cookies »,
   pas de page derrière connexion.
2. **Jamais le backend du concurrent.** Une clé « anon » Supabase ou Firebase
   visible dans le bundle ne s'utilise pas, ne se recopie pas dans le rapport,
   et on ne liste pas ses tables en interrogeant l'API. Les noms de tables
   *lus dans le bundle* sont un indice d'architecture, pas un accès.
3. **Politesse.** 40 pages maximum par défaut, une à la fois, pause entre
   chaque (`render.cjs` le fait). Respecter `robots.txt` s'il interdit.
4. **Pas de copie.** Reformuler ; citer brièvement une formulation clé si elle
   compte (prix, promesse). Aucun visuel du concurrent dans nos livrables.
5. **Constat, indice, hypothèse : les distinguer.** Une page rendue est un
   constat. Un compteur de mots-clés dans le bundle est un indice. « Événement
   réservé aux joueuses » déduit d'un nom est une hypothèse, à écrire « non
   confirmé ». Les chiffres affichés par le concurrent sont déclaratifs.
6. **Notre produit se lit dans le code** (`our-product.sh`), puis se confirme
   à la main pour chaque ligne qui pèse dans une recommandation. La mémoire de
   conversation sert de contexte stratégique, jamais de preuve.

## Déroulé

### 0. Préparer

- Dossier de travail HORS du repo : `<scratchpad>/competitor/<domaine>-<AAAA-MM-JJ>/`.
- Si l'utilisateur précise un angle (prix, diffusion, communauté…), l'analyse
  reste complète mais les plans se concentrent sur cet angle.

### 1. Collecter

```bash
S=.claude/skills/competitor-analysis/scripts
D=<scratchpad>/competitor/<domaine>-<date>
$S/collect.sh https://exemple.fr "$D"
cat "$D/stack.txt"
```

Lire `stack.txt` : coquille SPA vide → le contenu n'existe qu'au rendu (et le
SEO du concurrent est faible) ; traceurs listés → vérifier au rendu s'ils
partent avant consentement.

### 2. Sonder le bundle

```bash
node $S/probe-bundle.mjs "$D"
```

Tirer : l'étendue réelle du produit (groupes de routes : overlays, draft,
admin, paiement…), le backend et ses fonctions serveur, les intégrations
(HelloAsso, Stripe, Riot, Discord, Twitch…), les jeux. Les routes non listées
dans le sitemap révèlent souvent les fonctionnalités avancées.

### 3. Rendre les pages

```bash
node $S/render.cjs https://exemple.fr "$D" --max=40
ls "$D/pages"; cat "$D/first-load-requests.txt"
```

Les pages commerciales passent en premier (tarifs, fonctionnalités,
présentation, organisateurs, chiffres). Pour une page de détail atteinte par
un clic (un événement, un tournoi), écrire un court script Playwright ad hoc
sur le même modèle : ouvrir la liste, cliquer, lire `document.body.innerText`.
Page quasi vide → protégée, 404 ou trop lente : le dire, ne pas extrapoler.

`WebFetch` seul ne suffit pas pour une SPA : il ne voit que le titre.

### 4. Compléter (optionnel, si l'enjeu le justifie)

`WebSearch` : mentions légales et structure juridique, presse, levées de
fonds, réseaux sociaux (audience), avis d'organisateurs, partenariats
annoncés. Toujours sourcer.

### 5. Remplir la grille du concurrent

- Proposition de valeur, cible, ton
- Jeux (dominants vs listés)
- Offres : paliers, prix, **périodicité** (normaliser en €/an ET €/mois),
  limites (tournois, équipes), gratuités conditionnelles (associations…)
- Fonctionnalités par domaine : organisation, intégrité, diffusion,
  communauté, argent, plateforme/API
- Acquisition : compteurs, témoignages, démo, partenaires, contenus, SEO
- Technique : stack, SSR/SPA, poids du bundle, performance perçue
- Conformité : traceurs avant consentement, mentions légales, CGU
- Signaux à surveiller : recouvrement avec la Women's Cup / Overwatch,
  événements, partenaires communs

### 6. Inventorier notre produit

```bash
$S/our-product.sh "$D/notre-produit.md"
```

Puis confirmer à la main chaque « — » qui fonde un plan (le script dit « à
confirmer » exprès : une absence se prouve mal par grep). Contexte
stratégique à relire si pertinent : `docs/PLAN-plateforme-tournois.md`,
`docs/BACKLOG-tournois.md`, `docs/BACKLOG-acquisition-joueuses.md`,
`docs/BACKLOG-reseau-*.md`, `utils/billing/planFeatures.ts`,
`pages/organisateurs.tsx`.

La section « Cohérence du discours commercial » repère les montants écrits en
dur dans nos pages publiques : les confronter au barème. Tout écart est un
constat à remonter (règle du repo : les prix se dérivent de
`PLAN_PRICES_EUR`, jamais recopiés).

### 7. Comparer

Tableau dimension par dimension (trame dans `templates/rapport.md`), avec la
preuve de notre côté. Nommer franchement les points où le concurrent nous
devance, et ceux où nous le devançons. Ajouter les **écarts internes**
découverts en chemin.

### 8. Proposer des plans

Pour chaque plan : pourquoi (écart ou opportunité), lots livrables seuls,
briques existantes réutilisées (fichiers), effort S/M/L, garde-fous, mesure du
succès. Prioriser par impact commercial × coût × différenciation ; dire aussi
ce qu'on NE fait PAS.

Garde-fous du projet à appliquer d'office :

- **Jeux d'argent (ANJ)** : pas de lots ni d'argent sur des pronostics ou des
  mécaniques aléatoires ; la monnaie TCG se gagne, ne s'achète pas. Droits
  d'inscription + cashprize : validation juridique (décret 2017 sur les
  compétitions de jeux vidéo) avant tout développement.
- **Vie privée** : la découverte de joueuses reste opt-in, connectée, sans
  annuaire public ni SEO. Organisations et tournois peuvent être publics.
  Aucune mesure d'audience avant consentement.
- **Barème** : prix dérivés de `PLAN_PRICES_EUR` ; le logiciel Womenscup OBS
  et la direction automatique relèvent du palier Éditeur (sur devis).
- **Technique** : pas de dépendance ajoutée sans accord (zero-dependency
  policy) ; pas d'images générées par IA dans nos visuels.
- **Décisions verrouillées** : relire `MEMORY.md` avant de proposer de défaire
  une décision produit (multi-tenant, plans, découverte…).

### 9. Livrer

Réponse en français, dans le terminal :

1. **En bref** (3-4 phrases, recommandation incluse)
2. **Ce qu'est le concurrent** (grille condensée)
3. **Comparaison** (tableau) + écarts internes
4. **Plans** priorisés
5. **Recommandation** + question de suite (détailler un plan en lots ?)
6. **Sources** (URLs consultées, en liens markdown)

Proposer en une ligne de publier le rapport sur une page privée (Artifact) ou
de l'enregistrer dans `docs/concurrence/<domaine>.md` à partir du gabarit —
ne l'écrire dans le repo que si l'utilisateur le demande.

Nettoyer : aucun fichier temporaire dans le repo (scripts ad hoc dans le
scratchpad ou supprimés), `next-env.d.ts` inchangé.

## Pièges connus

- **SPA** : `curl` et `WebFetch` ne voient qu'une coquille. Le rendu est
  obligatoire.
- **Navigateurs Playwright absents** : `render.cjs` se rabat sur un Chromium
  en cache ou sur Google Chrome ; sinon `CHROMIUM_PATH=/chemin/vers/chrome`.
- **Compteurs trompeurs** : « billetterie(174) » dans un bundle peut n'être
  que du texte d'interface ; confirmer au rendu.
- **Nos greps bruités** : un mot trouvé dans un commentaire ou un autre
  domaine (« check-in » dans un écran TCG) n'est pas une preuve — d'où les
  fichiers canoniques de `our-product.sh`.
- **Prix mensuels contre annuels** : toujours normaliser avant de comparer.
- **Nom ≠ nature** : un événement « Rose » n'est pas forcément féminin
  (Octobre Rose). Écrire « non confirmé ».
- **Compteurs animés** : une page de chiffres peut afficher 0 au premier
  rendu ; attendre ou relire une autre page qui les porte.
