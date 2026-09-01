# Brancher le Drive de l'asso — marche à suivre

*L'écran est livré ([`/admin/documents`](../pages/admin/documents.tsx)). Il reste
deux variables d'environnement à poser. Rien à installer, rien à migrer.*

## État au 2026-09-01 — vérifié en vrai

Les étapes 1 et 2 ci-dessous sont **faites**. Un appel réel à l'API Drive
confirme la chaîne complète :

| | |
|---|---|
| Compte de service | `site-owwomenscup@owwomenscup.iam.gserviceaccount.com` (projet `owwomenscup`) |
| Jeton `drive.readonly` | ✅ obtenu |
| Dossier partagé | ✅ **« Drive Asso »**, `1CRiAwxHRaPD7vqL23x8ANOdQg6MUppLm` |
| Contenu vu par le compte | **0 élément** — le dossier est vide, ou son contenu ne lui est pas partagé |

**Reste donc uniquement l'étape 3** (les variables Netlify — lire l'encadré,
la forme à utiliser n'est pas celle qu'on croit). Une fois posées et le site
redéployé, `/admin/documents` affichera le dossier.

Le « pourquoi » de chaque choix est dans
[`ETUDE-drive-et-chat.md`](./ETUDE-drive-et-chat.md).

---

## 1. Créer le compte de service (5 min, une fois) — ✅ fait

1. [console.cloud.google.com](https://console.cloud.google.com/) → créer un
   projet (`owwomenscup`, par exemple).
2. **APIs & Services → Library** → activer **Google Drive API**.
3. **APIs & Services → Credentials → Create credentials → Service account**.
   Nom libre (`site-owwomenscup`). Aucun rôle IAM à donner : les droits ne
   viennent pas d'IAM ici, mais du partage Drive à l'étape 2.
4. Sur le compte créé → onglet **Keys → Add key → Create new key → JSON**.
   Le fichier se télécharge. **C'est le seul secret de l'opération.**

Noter l'adresse du compte de service, de la forme
`site-owwomenscup@<projet>.iam.gserviceaccount.com`.

## 2. Partager le dossier avec lui — ✅ fait

Sur le dossier Drive de l'asso → **Partager** → coller l'adresse
`…iam.gserviceaccount.com`. Décocher la notification par email (un compte de
service ne lit pas ses mails).

Le rôle à donner dépend de ce qu'on veut :

| Rôle Drive | Ce que le site peut faire |
|---|---|
| **Lecteur** | Lister et ouvrir. Le bouton « Déposer » répondra 403. |
| **Éditeur** | Lister, ouvrir, **déposer**, mettre à la corbeille. |

Un 403 au dépôt veut presque toujours dire « le dossier est en Lecteur » — la
page le dit en toutes lettres plutôt que de relayer le message de Google.

Le compte de service ne voit **que** ce qu'on lui partage : il n'y a rien à
restreindre en plus.

## 3. Poser les variables (Netlify → Site configuration → Environment variables) — ⬜ à faire

> ⚠️ **Ne PAS poser `GOOGLE_DRIVE_SA_KEY` en production.** Netlify exécute ses
> fonctions en mode compatibilité Lambda, qui plafonne l'**ensemble** des
> variables d'environnement à **4 Ko**. Le JSON complet en base64 pèse 3,1 Ko :
> il fait échouer la création de TOUTES les fonctions, et le déploiement entier
> avec. C'est arrivé le 2026-09-01 — dix-neuf crons refusés d'un coup.

**Forme courte, celle à utiliser en production — trois variables, ~1,75 Ko :**

| Variable | Valeur |
|---|---|
| `GOOGLE_DRIVE_SA_EMAIL` | `site-owwomenscup@owwomenscup.iam.gserviceaccount.com` (champ `client_email` du JSON) |
| `GOOGLE_DRIVE_SA_PRIVATE_KEY` | Le champ `private_key` du JSON, **valeur seule**, du `-----BEGIN` au `-----END` inclus. Les retours à la ligne réels comme échappés (`\n`) fonctionnent. |
| `GOOGLE_DRIVE_FOLDER_ID` | `1CRiAwxHRaPD7vqL23x8ANOdQg6MUppLm` |

Pour extraire les deux premières du fichier téléchargé, sans les recopier à la
main :

```bash
cd ~/Downloads
jq -r .client_email owwomenscup-<id>.json          # → GOOGLE_DRIVE_SA_EMAIL
jq -r .private_key  owwomenscup-<id>.json | pbcopy # → GOOGLE_DRIVE_SA_PRIVATE_KEY
```

**`pbcopy` n'affiche rien**, par construction : il consomme la sortie pour la
mettre dans le presse-papier. Ne rien voir est le succès, pas l'échec.
`pbpaste | wc -c` doit répondre ~1 700.

**Forme longue (`GOOGLE_DRIVE_SA_KEY`)** : le JSON entier, en clair ou en
base64. Réservée au développement local (`.env.local`), où le budget Lambda
n'existe pas et où l'on colle le fichier sans le découper. Si les deux formes
sont posées, la courte l'emporte.

### Si un déploiement échoue sur ce message

```
Your environment variables exceed the 4KB limit imposed by AWS Lambda
```

Retirer `GOOGLE_DRIVE_SA_KEY` et repasser à la forme courte. Le site continue
de servir le déploiement précédent pendant ce temps : rien n'est cassé, c'est
la mise à jour qui ne passe pas.

Puis redéployer (les variables ne sont lues qu'au build de la fonction).

Tant que l'une des deux manque, la page affiche cette marche à suivre au lieu
d'une erreur — la fonctionnalité est éteinte, elle n'est pas en panne.

## 4. Vérifier

- `/admin/documents` liste le dossier ;
- un clic sur un dossier descend dedans (fil d'Ariane pour remonter) ;
- « Ouvrir dans Drive » ouvre le document **chez Google** — le site ne sert
  jamais le contenu d'un fichier ;
- avec le droit d'écriture, « Déposer un fichier » ajoute la pièce au dossier
  affiché, et « Corbeille » l'en retire (récupérable 30 jours dans Drive) ;
- `/admin/logs` : « Consultation des documents de l'asso », « Dépôt d'un
  document de l'asso » et « Document de l'asso mis à la corbeille » y figurent.

---

## Deux points de vigilance

**Le partage du dossier lui-même.** Si le dossier est en « Tous les
utilisateurs disposant du lien », alors le lien *est* l'accès, et le droit
`manage_documents` ne protège que la page — pas les documents. Pour que le
contrôle d'accès du site ait un sens, le dossier doit être partagé
**nominativement** (les membres du bureau + le compte de service), pas par lien
public. À vérifier avant d'y déposer un PV ou une facture.

**L'identifiant du dossier n'est pas versionné.** Il vit en variable
d'environnement et nulle part ailleurs : sur un dossier partagé par lien,
l'identifiant *est* le secret.

---

## Les deux droits

| Droit | Ce qu'il ouvre |
|---|---|
| `read_documents` | Lister le Drive et ouvrir un document. C'est ce droit qui garde la page. |
| `manage_documents` | Déposer un fichier, le mettre à la corbeille. Vérifié à part, à chaque appel. |

Aucun rôle étroit ne les porte : ni casteuse, ni arbitre, ni bénévole.

La séparation est rejouée **un cran plus bas**, là où une erreur de code ne
peut plus la contourner : le chemin de lecture ne détient qu'un jeton Google
`drive.readonly`. Même bugué, même appelé par erreur depuis une route
d'écriture, il ne *peut* pas écrire.

---

## Donner le Drive à quelqu'un sans lui donner le site

Les deux droits s'accordent **à l'unité**, sans changer le rôle :
`/admin/users/manage` → sur la ligne d'un membre du staff, l'icône **cadenas**
→ cocher `Lire les documents de l'asso` et/ou `Déposer des documents`.

La trésorière peut donc être `helper` et déposer les factures ; le reste du
bureau, `helper` aussi, et seulement consulter. Aucun des deux n'est admin.

Trois garde-fous à connaître :

- **On ne peut accorder que ce qu'on détient soi-même.** Un droit se délègue,
  il ne se crée pas — sinon `manage_staff` serait le seul droit qui existe.
- **Les droits accordés ajoutent, ils ne retirent jamais.** Un droit couvert
  par le rôle apparaît coché et verrouillé : pour le retirer, on change le rôle.
- **Chaque modification est journalisée** (`/admin/logs`, « Permissions
  accordées à un membre du staff ») avec ce qui a été ajouté et retiré.
