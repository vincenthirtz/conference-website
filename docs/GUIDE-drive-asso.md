# Brancher le Drive de l'asso — marche à suivre

*L'écran est livré ([`/admin/documents`](../pages/admin/documents.tsx)). Il
reste trois petites variables à poser, puis à coller la clé privée depuis
l'écran lui-même.*

## État au 2026-09-01 — vérifié en vrai

Les étapes 1 et 2 ci-dessous sont **faites**. Un appel réel à l'API Drive
confirme la chaîne complète :

| | |
|---|---|
| Compte de service | `site-owwomenscup@owwomenscup.iam.gserviceaccount.com` (projet `owwomenscup`) |
| Jeton `drive.readonly` | ✅ obtenu |
| Dossier partagé | ✅ **« Drive Asso »**, `1CRiAwxHRaPD7vqL23x8ANOdQg6MUppLm` |
| Contenu vu par le compte | **0 élément** — le dossier est vide, ou son contenu ne lui est pas partagé |

**Reste l'étape 3** (trois petites variables Netlify) **puis l'étape 3 bis**
(coller la clé depuis l'écran, une fois le site déployé).

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

## 3. Poser les variables (Netlify → Site configuration → Environment variables)

> ⚠️ **La clé privée ne se met PAS dans une variable d'environnement.** Netlify
> exécute ses fonctions en mode compatibilité Lambda, qui plafonne
> l'**ensemble** des variables à **4 Ko** — et ce budget était déjà presque
> plein. La clé (1,7 Ko) fait échouer la création des dix-neuf fonctions cron,
> et le déploiement entier avec. C'est arrivé trois fois le 2026-09-01, une par
> forme essayée.
>
> Elle se colle depuis `/admin/documents`, et part **chiffrée en base**.

Trois variables, ~200 octets en tout :

| Variable | Valeur |
|---|---|
| `GOOGLE_DRIVE_SA_EMAIL` | `site-owwomenscup@owwomenscup.iam.gserviceaccount.com` (champ `client_email` du JSON) |
| `GOOGLE_DRIVE_FOLDER_ID` | `1CRiAwxHRaPD7vqL23x8ANOdQg6MUppLm` |
| `SECRETS_ENC_KEY` | une valeur aléatoire : `openssl rand -base64 32` |

`SECRETS_ENC_KEY` chiffre les secrets stockés en base (table
`integration_secrets`). **Ne jamais la changer** une fois posée : elle
déchiffre ce qu'elle a chiffré, et la modifier rend la clé Drive illisible — il
faudra la recoller.

Si `GOOGLE_DRIVE_SA_KEY` ou `GOOGLE_DRIVE_SA_PRIVATE_KEY` traînent encore :
**les supprimer**.

## 3 bis. Coller la clé privée (une fois le site déployé)

Aller sur `/admin/documents`. Le compte de service étant reconnu mais sa clé
absente, l'écran propose un champ pour la coller — c'est l'état « en attente de
la clé », distinct de « rien n'est configuré ».

```bash
cd ~/Downloads
jq -r .private_key owwomenscup-<id>.json | pbcopy
```

Coller, enregistrer. La valeur est chiffrée avant insertion : ni la base, ni les
journaux, ni l'API ne la revoient en clair — on ne peut que la remplacer.

**`pbcopy` n'affiche rien**, par construction. `pbpaste | wc -c` doit répondre
~1 700.

### Formes réservées au développement local

En local (`.env.local`), le budget Lambda n'existe pas : on peut poser soit
`GOOGLE_DRIVE_SA_EMAIL` + `GOOGLE_DRIVE_SA_PRIVATE_KEY`, soit
`GOOGLE_DRIVE_SA_KEY` (le JSON entier, en clair ou en base64). L'environnement
l'emporte alors sur la base.

## 4. Vérifier

- `/admin/documents` liste le dossier ;
- un clic sur un dossier descend dedans (fil d'Ariane pour remonter) ;
- « Télécharger » sert le fichier **à travers le site** : il fonctionne même
  pour qui n'a pas d'accès Google personnel au dossier (les formats natifs
  Google sont exportés en PDF ou XLSX au passage) ;
- « Ouvrir dans Drive » ouvre le document chez Google, pour le modifier ;
- avec le droit d'écriture, « Déposer un fichier » ajoute la pièce au dossier
  affiché, et « Corbeille » l'en retire (récupérable 30 jours dans Drive) ;
- `/admin/logs` : consultations, téléchargements, dépôts et mises à la
  corbeille y figurent, nommément.

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
