# Billetterie d'inscription — note de décision

**État : RIEN N'EST DÉVELOPPÉ, et c'est volontaire.** Le plan « Engagement
spectateurs » (rapport de comparaison du 2026-09-15) posait lui-même le
garde-fou : « droit d'inscription et cash-prize cadrés par le décret de 2017
sur les compétitions de jeux vidéo **avant tout développement** ». Cette note
rassemble ce qu'il faut trancher, pour que la décision soit prise sur pièces et
non au moment de brancher un paiement.

Date : 2026-09-16.

## 1. Ce que la plateforme sait déjà faire

- **Encaisser pour la bonne structure.** Depuis le 2026-09-16, chaque espace
  relie SON compte HelloAsso (`Réglages › Encaissement`,
  `utils/billing/helloassoAccount.ts`). Un droit d'inscription arriverait donc
  chez l'organisation qui tient le tournoi, pas chez nous — c'était le blocage
  numéro un, il est levé.
- **Rattacher un paiement à un objet.** Le rail cagnotte
  (`prize_pool_checkouts` → webhook → `prize_pool_contributions`) fait déjà
  « lien de paiement → notification → écriture idempotente ». Une billetterie
  suivrait le même chemin, avec `tournament_teams` (ou une table d'inscriptions)
  à la place de la cagnotte.
- **Connaître les équipes et leurs capitaines**, donc savoir qui doit payer quoi.

## 2. Ce que le droit français impose

Décret n° 2017-871 du 9 mai 2017, codifié aux articles R. 321-40 à R. 321-50 du
code de la sécurité intérieure. Les points qui changent la conception :

| Obligation | Conséquence produit |
| --- | --- |
| **Déclaration préalable** de la compétition au service des courses et jeux du ministère de l'Intérieur, entre **30 jours et 1 an** avant le début | L'organisateur doit être identifié dans l'outil, et prévenu du délai AVANT d'ouvrir la vente. Un tournoi créé à J-10 ne peut pas prendre de droits d'inscription. |
| **Ratio** : les droits d'inscription ne doivent pas dépasser **100 % du coût total** de la manifestation, gains compris | L'outil doit connaître le coût annoncé et le total encaissé, et alerter quand le ratio approche. Un dépassement constaté après coup se **déclare sous un mois**. |
| **Garantie** exigée au-delà de **10 000 €** de récompenses | À croiser avec la cagnotte : une cagnotte qui gonfle peut faire franchir le seuil sans que personne ne le voie. |
| **Mineures de moins de 12 ans** : participation interdite aux compétitions à récompenses | Le formulaire d'inscription doit porter la question de l'âge, et l'outil doit pouvoir refuser. |
| **Mineures de moins de 16 ans** : **autorisation parentale écrite**, et surplus des récompenses versé à la **Caisse des dépôts** | Un justificatif à collecter et à conserver, et un circuit de récompense qui n'est pas un simple virement. |

Sources : [décret n° 2017-871 (Légifrance)](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000034633551),
[articles R. 321-40 à R. 321-50](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000025503132/LEGISCTA000034696377/),
[guide de l'organisateur, France Esports](https://www.france-esports.org/le-guide-de-lorganisateur-les-aspects-legaux/).

## 3. Les quatre décisions à prendre (association, pas développement)

1. **Qui est l'organisateur au sens du décret ?** Nous, pour la Coupe. Pour un
   espace tiers, c'est lui — et l'outil doit le dire noir sur blanc, sinon la
   déclaration n'est faite par personne.
2. **Ouvre-t-on la billetterie aux espaces tiers, ou d'abord à la Coupe seule ?**
   Une ouverture large multiplie les organisateurs non déclarés utilisant notre
   outil ; commencer par la Coupe permet d'éprouver le circuit.
3. **Que fait-on des remboursements ?** Tournoi annulé, équipe désinscrite,
   erreur de paiement : HelloAsso rembourse à la main. Sans règle écrite, la
   première annulation se règle dans l'urgence.
4. **Accepte-t-on les mineures dans un tournoi payant ?** Si oui, il faut
   l'autorisation parentale et le circuit Caisse des dépôts ; si non, il faut le
   dire au règlement et le contrôler à l'inscription.

## 4. Le plan technique, prêt à exécuter APRÈS validation

Trois lots, dans cet ordre :

1. **Déclarer avant de vendre** (S) : champs « coût total prévu », « récompenses
   prévues », « date de déclaration » sur le tournoi ; la vente ne s'ouvre pas
   sans eux, et l'écran rappelle le délai de 30 jours.
2. **Vendre** (M) : lien de paiement HelloAsso par équipe (compte de l'espace),
   table `tournament_registrations` (statut, montant, payeur, idempotence sur
   `helloasso_payment_id`), webhook réutilisé, reçu par email.
3. **Rendre des comptes** (M) : tableau de bord du ratio droits/coûts avec
   alerte au-delà de 80 %, export pour la déclaration de dépassement, et gel de
   la vente quand le ratio est atteint.

Garde-fous à coder dès le lot 2 : pas de vente sans compte HelloAsso relié
(déjà en place pour la cagnotte), pas de vente sur un tournoi ouvert aux moins
de 12 ans avec récompenses, et journalisation staff de chaque ouverture de
vente.

## 5. Ce que nous faisons en attendant

Rien de payant. Les inscriptions restent gratuites, et la cagnotte solidaire
(argent entrant, sans contrepartie) couvre le besoin de cash-prize sans entrer
dans le périmètre des droits d'inscription.
