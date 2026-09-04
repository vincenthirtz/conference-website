// lib/i18n/locales/fr/cgvPage.ts
//
// Traductions FRANCAISES du namespace `cgvPage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.
//
// ATTENTION : ce fichier est un CONTRAT. Chaque clause de durée, de prix, de
// rétractation ou de responsabilité y engage l'association. Toute modification
// de fond doit incrémenter `CGV_VERSION` (utils/billing/cgv.ts) — sans quoi on
// ne peut plus dire quel texte un client a accepté.
//
// Les clauses factuelles (durée, grâce, essai, absence de reconduction) sont
// écrites d'après ce que le code fait réellement, pas d'après un modèle type :
// PLAN_GRACE_DAYS, TRIAL_DAYS, YEARLY_MONTHS_BILLED, applyTenantPlanPayment.

import { ns } from '../../ns';

export default ns('cgvPage', {
  heroBadge: 'Conditions générales de vente',
  heroTitle: 'Conditions générales de vente',
  heroSubtitle:
    "Elles régissent la souscription aux offres d'espace organisateur proposées par l'association Women's Cup. Elles ne concernent ni la participation aux tournois, ni l'usage gratuit du site.",
  versionLabel: 'Version en vigueur',
  versionNote:
    'La version acceptée lors de votre commande est enregistrée avec sa date : c’est elle qui vous engage, même si ce texte évolue ensuite.',
  backToOffers: 'Voir les offres',
  contactUs: 'Nous écrire',

  a1Title: 'Article 1 — Objet et champ d’application',
  a1p1:
    "Les présentes conditions régissent la vente des offres d'espace organisateur (« le Service ») par l'association Women's Cup (« l'Association ») à toute personne morale ou physique qui souscrit (« le Client »).",
  a1p2:
    "Elles s'appliquent à toute commande passée depuis l'espace d'administration du Client. Elles ne s'appliquent ni à la participation aux compétitions organisées par l'Association, ni à la consultation du site, l'une et l'autre gratuites.",
  a1p3:
    'Toute commande implique l’acceptation sans réserve des présentes, exprimée avant le paiement.',

  a2Title: 'Article 2 — Identité du vendeur',
  a2p1:
    "Association Women's Cup, association déclarée régie par la loi du 1er juillet 1901, à but non lucratif.",
  a2rna: 'N° RNA : W691112531',
  a2siren: 'N° SIREN : 109 139 444',
  a2siret: 'N° SIRET (siège) : 10913944400011',
  a2p2:
    "L'adresse du siège social et les coordonnées complètes figurent dans les mentions légales du site.",

  a3Title: 'Article 3 — Caractéristiques essentielles du Service',
  a3p1:
    "Le Service est un contenu numérique fourni en ligne, sans support matériel. Il donne accès à un espace d'organisation de compétitions : gestion des équipes et des inscriptions, calendrier et arbitrage des matchs, et selon l'offre souscrite, bot Discord, marque et domaine propres, classement des joueuses, accès à l'API et régie vidéo.",
  a3p2:
    "Le contenu exact de chaque offre est celui affiché sur la page des offres au jour de la commande, et rappelé dans le récapitulatif présenté avant paiement. Le Client est invité à en prendre connaissance : c'est la description qui l'engage, non le nom de l'offre.",
  a3p3:
    "L'offre Éditeur est établie sur devis et ne se commande pas en ligne.",

  a4Title: 'Article 4 — Interopérabilité et compatibilité',
  a4p1:
    "Le Service s'utilise depuis un navigateur web à jour (Chrome, Firefox, Safari ou Edge), sur ordinateur comme sur mobile. Aucune installation n'est requise. Une connexion internet est nécessaire.",
  a4p2:
    "Les fonctions liées à Discord supposent que le Client dispose d'un serveur Discord et puisse y inviter un bot ; celles liées à la diffusion supposent un compte Twitch et, pour les overlays, un logiciel de régie acceptant une source navigateur (OBS ou équivalent). L'Association ne fournit ni ces comptes ni ces logiciels.",
  a4p3:
    "Les données du Client sont exportables à tout moment depuis l'administration, aux formats JSON et CSV, lisibles par tout tableur ou outil courant.",
  a4p4:
    "Le Service dépend de services tiers (Discord, Twitch, Blizzard, l'hébergeur et la base de données). Une interruption chez l'un d'eux peut affecter tout ou partie des fonctions correspondantes.",

  a5Title: 'Article 5 — Commande',
  a5p1:
    "La commande se déroule en deux temps, conformément à l'article 1127-2 du code civil.",
  a5s1:
    "Le Client choisit son offre et sa périodicité, puis un récapitulatif lui présente l'offre retenue, la périodicité, le prix unitaire et le montant total à payer.",
  a5s2:
    'À ce stade, le Client peut revenir en arrière, modifier son choix et corriger toute erreur.',
  a5s3:
    "Le Client accepte expressément les présentes conditions, puis demande expressément l'exécution immédiate du Service en reconnaissant renoncer à son droit de rétractation (article 9). Ces deux cases sont distinctes et vierges par défaut.",
  a5s4:
    'Le Client confirme sa commande en actionnant le bouton portant la mention « Commander avec obligation de paiement ».',
  a5p2:
    "La commande n'est formée qu'à ce dernier clic. La date, l'heure et la version des conditions acceptées sont enregistrées par l'Association et peuvent être communiquées au Client sur demande.",

  a6Title: 'Article 6 — Prix',
  a6p1:
    'Les prix sont indiqués en euros et sont ceux affichés sur la page des offres au jour de la commande. Le montant qui sera débité est celui affiché au récapitulatif : aucun frais ni supplément n’est ajouté à l’étape de paiement.',
  a6p2:
    "Deux périodicités sont proposées. Au mois, le prix mensuel est dû pour un mois de service. À l'année, dix mois sont facturés pour douze mois de service.",
  a6p3:
    "L'Association peut modifier ses prix à tout moment. Le prix applicable est celui de la commande ; une modification est sans effet sur les périodes déjà payées.",

  a7Title: 'Article 7 — Paiement',
  a7p1:
    "Le paiement s'effectue en ligne, en une fois, via HelloAsso, prestataire de paiement de l'Association. Le Client est redirigé vers HelloAsso pour saisir ses coordonnées bancaires.",
  a7p2:
    "Ces coordonnées ne transitent pas par les serveurs de l'Association et n'y sont jamais conservées.",
  a7p3:
    "L'offre est activée dès réception de la confirmation de paiement, en principe immédiate. En cas d'échec du paiement, aucune commande n'est formée et aucune somme n'est due.",

  a8Title: 'Article 8 — Durée, échéance et absence de reconduction tacite',
  a8p1:
    "Chaque paiement ouvre une période d'un mois ou d'un an selon la périodicité choisie. Un renouvellement anticipé prolonge la période en cours plutôt que de l'écraser.",
  a8p2:
    "Il n'existe ni reconduction tacite, ni prélèvement automatique, ni mandat de prélèvement : chaque période fait l'objet d'une commande distincte et d'un paiement volontaire. Le Client n'a donc rien à résilier — il lui suffit de ne pas renouveler.",
  a8p3:
    "Le Client est prévenu par courriel avant l'échéance, puis le jour de l'échéance.",
  a8p4:
    "À défaut de renouvellement, les capacités de l'offre restent ouvertes pendant sept jours après l'échéance, puis l'espace revient au palier Découverte. Aucune donnée n'est supprimée de ce seul fait.",

  a9Title: 'Article 9 — Droit de rétractation',
  a9p1:
    "Le Client consommateur, ainsi que le professionnel employant cinq salariés au plus et souscrivant en dehors de son activité principale, dispose d'un délai de quatorze jours à compter de la conclusion du contrat pour se rétracter sans avoir à se justifier ni à supporter de frais.",
  a9p2:
    "Le Service étant un contenu numérique fourni sans support matériel et exécuté immédiatement, ce droit s'éteint dès l'exécution complète, à la double condition que le Client ait expressément demandé cette exécution immédiate ET reconnu qu'il perdrait de ce fait son droit de rétractation. C'est l'objet de la seconde case cochée lors de la commande.",
  a9p3:
    "À défaut de ce double consentement, le droit de rétractation subsiste et s'exerce par toute déclaration dénuée d'ambiguïté adressée à l'Association ; le remboursement intervient dans les quatorze jours suivant la réception de la demande.",
  a9p4:
    "En dehors de ces cas, les sommes versées correspondent à une période de service ouverte et ne donnent pas lieu à remboursement au prorata.",

  a10Title: 'Article 10 — Garantie de conformité',
  a10p1:
    "L'Association fournit un Service conforme à sa description et répond des défauts de conformité existant lors de la fourniture, dans les conditions des articles L224-25-12 et suivants du code de la consommation applicables aux contenus et services numériques.",
  a10p2:
    "Le Service étant fourni de façon continue, cette garantie s'applique pendant toute la durée de la période souscrite. En cas de défaut, le Client demande la mise en conformité ; si elle est impossible ou n'intervient pas dans un délai raisonnable, il peut obtenir une réduction du prix ou la résolution du contrat.",
  a10p3:
    'Ces garanties légales s’appliquent indépendamment de toute garantie commerciale et sans frais pour le Client.',

  a11Title: 'Article 11 — Disponibilité et maintenance',
  a11p1:
    "L'Association est tenue d'une obligation de moyens sur la disponibilité du Service. Aucun engagement chiffré de niveau de service n'est souscrit.",
  a11p2:
    "Des interruptions peuvent survenir pour maintenance, mise à jour ou cause extérieure. L'Association s'efforce de les annoncer lorsqu'elles sont programmées.",

  a12Title: 'Article 12 — Obligations du Client',
  a12p1:
    "Le Client est responsable des contenus qu'il publie et des personnes à qui il donne accès à son espace. Il garantit disposer des droits nécessaires sur ces contenus.",
  a12p2:
    "Il s'interdit tout usage illicite, toute atteinte au fonctionnement du Service et toute tentative d'accès à des données qui ne sont pas les siennes.",
  a12p3:
    "En cas de manquement grave, l'Association peut suspendre l'espace après mise en demeure restée sans effet, ou sans délai si la gravité ou l'urgence le justifie.",

  a13Title: 'Article 13 — Propriété intellectuelle et licence',
  a13p1:
    "L'Association concède au Client, pour la durée de son abonnement et pour ses seuls besoins propres, un droit d'utilisation du Service personnel, non exclusif et non cessible. Aucun droit de propriété n'est transféré.",
  a13p2:
    "Le Client conserve l'entière propriété des contenus et des données qu'il dépose. Il concède à l'Association le droit de les héberger, reproduire et afficher dans la seule mesure nécessaire à la fourniture du Service.",
  a13p3:
    'Toute reproduction, décompilation ou revente du Service est interdite hors des exceptions légales.',

  a14Title: 'Article 14 — Données personnelles',
  a14p1:
    "L'Association traite les données personnelles nécessaires à la fourniture du Service et à la facturation. Les finalités, durées de conservation et droits des personnes figurent dans les mentions légales et la politique de confidentialité du site.",
  a14p2:
    "Les sous-traitants intervenant dans l'exécution du contrat sont l'hébergeur du site, le fournisseur de la base de données et de l'authentification, le prestataire d'envoi de courriels et le prestataire de paiement. Ils sont énumérés dans les mentions légales.",
  a14p3:
    "Lorsque le Client dépose dans son espace des données concernant ses propres membres, il en est le responsable de traitement et l'Association agit comme sous-traitant, pour son seul compte et sur ses seules instructions.",

  a15Title: 'Article 15 — Réversibilité',
  a15p1:
    "Le Client peut exporter les données de son espace à tout moment depuis l'administration, sans frais et sans avoir à en faire la demande.",
  a15p2:
    "Après la fin de l'abonnement, l'espace et ses données restent accessibles au palier gratuit. Leur suppression n'intervient qu'à la demande du Client ou selon la politique de conservation annoncée dans les mentions légales.",

  a16Title: 'Article 16 — Responsabilité',
  a16p1:
    "L'Association ne répond que des dommages directs et prévisibles résultant d'un manquement qui lui est imputable. Sa responsabilité est plafonnée aux sommes effectivement versées par le Client au titre des douze mois précédant le fait générateur.",
  a16p2:
    "Ce plafond ne s'applique ni en cas de faute lourde ou dolosive, ni aux dommages corporels, ni dans les cas où la loi l'interdit, notamment au titre des garanties légales.",
  a16p3:
    "L'Association n'est pas responsable de l'indisponibilité des services tiers mentionnés à l'article 4, ni des conséquences d'un usage du Service non conforme aux présentes.",

  a17Title: 'Article 17 — Réclamation et médiation',
  a17p1:
    "Toute réclamation est adressée par courriel à l'Association, qui s'engage à y répondre. Une réponse écrite est apportée dans un délai raisonnable.",
  a17p2:
    "Conformément aux articles L611-1 et suivants du code de la consommation, le Client consommateur peut recourir gratuitement à un médiateur de la consommation en vue de la résolution amiable du litige, après avoir tenté de le résoudre directement auprès de l'Association.",
  a17p3:
    "La plateforme européenne de règlement en ligne des litiges est accessible à l'adresse ec.europa.eu/consumers/odr.",

  a18Title: 'Article 18 — Modification des présentes conditions',
  a18p1:
    "L'Association peut modifier les présentes conditions. La version applicable à une commande est celle acceptée lors de cette commande, dont la référence est enregistrée.",
  a18p2:
    'Une modification est sans effet sur les périodes déjà payées.',

  a19Title: 'Article 19 — Droit applicable et juridiction',
  a19p1:
    'Les présentes conditions sont soumises au droit français.',
  a19p2:
    "À défaut de résolution amiable, le litige relève des juridictions françaises compétentes. Le Client consommateur peut saisir à son choix la juridiction du lieu où il demeurait au moment de la conclusion du contrat.",

  a20Title: 'Article 20 — Langue',
  a20p1:
    "Les présentes conditions sont rédigées en français. Toute traduction est fournie à titre d'information ; seule la version française fait foi.",
});
