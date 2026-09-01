# Brancher le Drive de l'asso — marche à suivre

*L'écran est livré ([`/admin/documents`](../pages/admin/documents.tsx)). Il reste
deux variables d'environnement à poser, et un partage à faire côté Google. Rien
à installer, rien à migrer.*

Le « pourquoi » de chaque choix est dans
[`ETUDE-drive-et-chat.md`](./ETUDE-drive-et-chat.md).

---

## 1. Créer le compte de service (5 min, une fois)

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

## 2. Partager le dossier avec lui

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

## 3. Poser les deux variables (Netlify → Site configuration → Environment variables)

| Variable | Valeur |
|---|---|
| `GOOGLE_DRIVE_SA_KEY` | Le contenu du fichier JSON. **En base64 de préférence** : `base64 -i cle.json \| pbcopy`. Le collage direct d'un JSON multi-ligne mange les retours à la ligne de la clé privée, et l'erreur qui en sort est un message OpenSSL incompréhensible. Les deux formes sont acceptées. |
| `GOOGLE_DRIVE_FOLDER_ID` | L'identifiant du dossier : le segment après `/folders/` dans son URL de partage. |

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
