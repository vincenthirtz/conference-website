# Étude — Google Drive de l'asso sur le site, et chat intégré

*Rédigé le 2026-09-01. Deux sujets indépendants, instruits séparément. Les
chiffres viennent de la base de production le jour de la rédaction.*

---

## Verdict en deux lignes

| Sujet | Verdict | Pourquoi |
|---|---|---|
| **Drive de l'asso** | ✅ **Livré le 2026-09-01** — lecture seule, compte de service, droit `manage_documents`. Voir [le guide d'installation](./GUIDE-drive-asso.md). | Comble un vrai trou : aujourd'hui les documents de l'asso n'ont **aucune place** sur le site, et le seul dépôt de PDF existant atterrit dans un bucket **public** nommé `teams-images`. |
| **Chat intégré** | ❌ **À ne pas construire** | La messagerie entre capitaines **existe déjà sur le site** et compte **0 message** en un an. Le problème n'est pas le manque de canal, c'est que **27 des 70 membres d'équipe n'ont aucun Discord lié**. Un quatrième canal ne les atteindra pas davantage. |

---

## Sujet 1 · Brancher le Drive de l'asso

### Le problème réel

Le site n'a **aucun endroit** pour les documents de l'association. Ce qui manque
concrètement, pour une loi 1901 :

- statuts, récépissé de préfecture, PV d'assemblée générale ;
- rapport moral et rapport financier de l'exercice ;
- dossier de partenariat / kit presse envoyé aux sponsors ;
- factures et justificatifs (la page `/admin/billing` gère l'abonnement du site,
  pas la compta de l'asso) ;
- règlement, chartes, modèles de contrat casteuse.

[`pages/association.tsx`](../pages/association.tsx) (1 144 lignes) ne contient
**ni statuts, ni PV, ni rapport** — pour une asso qui démarche des sponsors et
touche des dons via HelloAsso, la transparence documentaire est un signal de
confiance qui manque.

### Ce qui existe déjà — et qui est un problème

[`pages/api/admin/upload.ts`](../pages/api/admin/upload.ts) accepte des PDF
jusqu'à 5 Mo… et les range dans le bucket **`teams-images`**, sous le préfixe
`documents/`, avec une **URL publique** :

```ts
const BUCKET = 'teams-images';   // ligne 37
// les PDFs sont rangés sous le préfixe "documents/"
```

Un PV d'AG ou une facture déposée par ce chemin est **lisible par quiconque
devine l'URL**. Ce n'est pas un incident aujourd'hui (rien de sensible n'y est),
c'est un piège armé. Toute solution documentaire doit commencer par fermer
cette porte, ou au minimum par ne pas s'y appuyer.

### Trois niveaux, du moins cher au plus cher

| | Ce que ça fait | Coût | Droit nécessaire |
|---|---|---|---|
| **A. Le lien** | Un champ URL dans les réglages + une carte « Documents de l'asso » dans `/admin`. Le Drive reste chez Google, on met juste la porte au bon endroit. | ~2 h | Aucun (réglages existants) |
| **B. La liste** *(recommandé)* | L'admin **liste** le contenu d'un dossier Drive : nom, type, taille, date, dernière modif, lien d'ouverture. Rien n'est hébergé, rien n'est copié. Filtrable, cherchable, derrière un droit dédié. | ~2 j | **`manage_documents`** (nouveau) |
| **C. La synchro** | Dépôt depuis le site, archivage automatique (exports adhérents, justificatifs de match, factures HelloAsso), miroir bidirectionnel. | ~1 à 2 semaines + maintenance permanente | `manage_documents` + écriture |

**Recommandation : B.** A ne coûte presque rien mais ne fait presque rien —
c'est un marque-page. C fabrique un deuxième endroit où vit la vérité, donc
fatalement deux versions du même PV : la synchro bidirectionnelle de documents
est un des classiques les plus coûteux à maintenir, pour un bénéfice qui ne se
manifeste qu'à un volume que l'asso n'a pas (7 adhérents en base).

B garde **Google comme seul dépôt** — c'est là que les gens déposent déjà, c'est
là que la corbeille et l'historique de version existent — et n'ajoute au site
que ce qui lui manque : *savoir ce qu'il y a dedans, sans quitter l'admin, et
seulement si on en a le droit*.

### Compte de service, pas OAuth

Le précédent du repo est [`utils/twitchBroadcaster.ts`](../utils/twitchBroadcaster.ts) :
OAuth broadcaster + tokens chiffrés via [`utils/crypto.ts`](../utils/crypto.ts).
**Ne pas le copier ici.**

Un token OAuth Google appartient à **une personne**. Le jour où la trésorière
quitte l'asso, ou révoque l'accès depuis son compte Google, l'intégration meurt
— et personne ne saura pourquoi. Un **compte de service** (service account
Google Cloud) appartient à l'organisation : on partage le dossier Drive avec
son adresse `…@…iam.gserviceaccount.com`, et c'est tout. Pas de refresh token à
faire tourner, pas de consentement à re-donner, pas de dépendance à un humain.

- Portée : `https://www.googleapis.com/auth/drive.readonly`, restreinte au seul
  dossier partagé — un compte de service ne voit *que* ce qu'on lui partage.
- Secret : la clé JSON en variable d'environnement Netlify
  (`GOOGLE_DRIVE_SA_KEY`, `GOOGLE_DRIVE_FOLDER_ID`), jamais en base, jamais
  dans le dépôt.
- Absence de config = fonctionnalité désactivée en silence, sans casser l'admin
  — même posture que `MATCHES_LIVE_CHANNEL_ID` côté bot.

### Le droit à ajouter

Le catalogue de [`utils/staffPermissions.ts`](../utils/staffPermissions.ts) est
une union fermée avec garde-fous : ajouter une entrée est mécaniquement peu
coûteux depuis le lot A2.

**Deux droits, pas un** (décision du 2026-09-01) : consulter les statuts et
déposer une pièce ne sont pas le même geste. La trésorière dépose, le reste du
bureau consulte ; un droit unique obligerait à donner l'écriture à qui ne fait
que lire.

```ts
{ value: 'read_documents',   label: 'Lire les documents de l’asso' }
{ value: 'manage_documents', label: 'Déposer des documents' }
```

La séparation est rejouée **sous** le code applicatif : le chemin de lecture ne
détient qu'un jeton Google `drive.readonly`, le chemin d'écriture un jeton
`drive`. Une erreur dans le code de lecture ne peut pas écrire — Google
refuse.

Attribution : `owner` et `admin` l'ont d'office (l'`admin` a tout sauf
`manage_tenant`). **La question qui compte** est de savoir si un rôle étroit y
a droit — et la réponse est **non par défaut** : ni `caster`, ni `referee`, ni
`helper`. Un PV d'AG nomme des personnes physiques et un rapport financier
donne des montants ; ce sont des données que l'on ouvre à quelqu'un
explicitement, pas par appartenance à un rôle d'exploitation.

Corollaire : ce droit n'a d'intérêt que **détachable du rôle**.

**Correction du 2026-09-01, pendant l'implémentation.** La première version de
cette étude affirmait que le modèle A2 permettait déjà d'accorder une
permission à l'unité. **C'est faux** :
[`staffPermissionsFor()`](../utils/staffPermissions.ts) dérive les permissions
du seul rôle, et la table `staff` n'a aucune colonne de permissions accordées.
En l'état, `manage_documents` va donc à `owner` et `admin` — et `admin` a déjà
tout : le droit **gate correctement la page, mais n'ouvre encore à personne de
nouveau**. « Donner le Drive à la trésorière » oblige toujours à la faire
`admin`, c'est-à-dire à lui donner le site.

C'est un lot à part (colonne `staff.extra_permissions`, résolution dans
`utils/staff.ts`, UI dans `users/manage`), pas un détail de celui-ci. Il reste
en tête de la suite.

### Pièges repérés

1. **CSP.** [`proxy.ts`](../proxy.ts) ligne 63 : `frame-src` est une liste
   fermée (`'self'`, Twitch, YouTube, Cloudflare). Un aperçu Drive en iframe
   exigerait d'y ajouter `https://drive.google.com` — **à ne pas faire pour la
   v1** : la liste vaut par ce qu'elle exclut. Un lien qui ouvre Drive dans un
   onglet rend le même service sans élargir la surface.
2. **Ne pas proxifier les fichiers.** Servir le contenu d'un document à travers
   le site (`/api/admin/documents/[id]/download`) transforme le droit
   `manage_documents` en la seule chose entre un PV d'AG et Internet. Tant que
   la v1 renvoie des liens Drive, c'est Google qui applique le partage — une
   défense de plus, pas une de moins.
3. **Le nom des fichiers fuit autant que leur contenu.** Une liste de documents
   nommés `Sanction-<pseudo>-2026.pdf` est déjà une divulgation. La route de
   listing doit être journalisée (`logStaffAction`) comme n'importe quelle
   lecture sensible.
4. **`teams-images/documents/`.** Indépendamment du Drive : soit ce chemin est
   fermé, soit ce qui y est déposé est traité comme public. Les deux se
   défendent, le statu quo — un dépôt de PDF public dont le nom suggère un
   dossier privé — non.

---

## Sujet 2 · Le chat intégré

### Le fait qui tranche

**Une messagerie entre capitaines existe déjà sur le site.**
[`pages/api/player/messages.ts`](../pages/api/player/messages.ts) + la page
[`pages/player/messages.tsx`](../pages/player/messages.tsx) : conversations
deux à deux entre équipes, identifiant de conversation déterministe, permission
d'équipe `send_captain_messages`, quota anti-spam.

En production, ce jour :

```
demandes type='captain_message'  →  0
```

**Zéro message.** Pas « peu » : aucun. Sur 58 `demandes` enregistrées (37
invitations, 15 candidatures, 4 inscriptions d'équipe, 2 demandes de
capitanat), la fonctionnalité de discussion est la seule à n'avoir jamais
servi.

Ce n'est pas un défaut d'ergonomie à corriger par une meilleure version. C'est
le comportement observé : **les gens se parlent là où elles sont déjà**, et
elles sont sur Discord.

### Ce que Discord couvre déjà, et que le site devrait dupliquer

- un **salon textuel + un vocal par équipe**, provisionnés automatiquement à la
  création de l'équipe (`team.created` → `team-channel-admin.js`) ;
- un **fil par match** dans `#matchs-live`, avec embed de score qui suit
  `pending → ongoing → finished` ([`match-thread.js`](../../docker-box/services/discord-bot/match-thread.js)) ;
- `#all-teams`, salon commun ouvert à tous les rôles d'équipe ;
- un **forum de litige** par dispute, un **système de tickets** à 7 catégories ;
- côté staff, `/admin/team-messages` envoie un message ciblé dans le salon
  Discord de chaque équipe, avec aperçu avant envoi.

Un chat intégré serait le **cinquième** canal texte. Chaque canal
supplémentaire coûte à tout le monde : une place de plus à surveiller pour ne
rien rater, et une hésitation de plus au moment d'écrire.

### Le vrai problème est ailleurs — et il est mesurable

```
membres d'équipe          70
comptes Discord liés      50
membres SANS Discord lié  27   ← 39 %
```

**39 % des membres d'équipe ne sont joignables par aucun des cinq canaux
ci-dessus.** Voilà le trou. Et un chat intégré ne le bouche pas : les 27 qui ne
lient pas leur Discord ne viendront pas non plus consulter un chat sur le site
— pour la même raison, qui est qu'elles ne reviennent pas d'elles-mêmes.

Ce qui les atteint, c'est ce qui **va vers elles** : l'email et la notification
push, tous deux déjà construits (outbox + deux dispatchers, préférences par
canal, désinscription RGPD). Ce qui manque n'est pas un canal de plus, c'est :

1. **rendre visible l'injoignabilité** — la capitaine doit voir « 3 de tes
   joueuses ne recevront pas les convocations », là où elle gère son roster.
   Le tri-état `discord_linked` et `utils/teams/rosterReadiness.ts` existent
   déjà : la matière est là, il manque l'endroit où ça se lit ;
2. **garantir un chemin de secours** — toute communication qui compte
   (convocation, report, sanction) part par email si le Discord manque, au lieu
   de partir dans le vide ;
3. **rendre la liaison Discord désirable au bon moment** — pas un réglage
   enfoui, une étape du parcours d'inscription.

### Si le chat revenait quand même sur la table

Une seule situation le justifierait : **une conversation qui doit laisser une
trace opposable**. Discord est chez Discord, un litige tranché dans un fil peut
être édité ou supprimé, et l'asso n'en garde rien. Un canal *arbitrage* —
messages horodatés, immuables, rattachés au match, versés au dossier de litige
— répondrait à un besoin que Discord ne couvre effectivement pas.

Mais c'est alors un **journal de litige**, pas un chat : pas de présence, pas
de « en train d'écrire », pas de notifications temps réel. Et la brique existe
en partie (preuves de match, `match_evidence`, réconciliation automatique).
À instruire le jour où un litige tourne mal — pas avant.

---

## Ce que je ferais, dans l'ordre

1. **Fermer `teams-images/documents/`** ou assumer qu'il est public. Une heure,
   indépendant du reste, et c'est le seul point de cette étude qui est un
   risque plutôt qu'une idée.
2. **Drive niveau B** : `manage_documents` + compte de service + liste
   read-only + journalisation des consultations. ~2 jours.
3. **Rendre `manage_documents` accordable à l'unité**, sinon le droit ne sert à
   rien (voir plus haut).
4. **Badge d'injoignabilité côté capitaine** — le vrai remplaçant du chat, et
   de loin le moins cher des trois.
5. **Ne rien construire pour le chat.** Rouvrir le sujet uniquement sous
   l'angle « journal de litige opposable », si un litige le rend nécessaire.
