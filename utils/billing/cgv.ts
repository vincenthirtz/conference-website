// utils/billing/cgv.ts
//
// La version des conditions générales de vente, et rien d'autre.
//
// Pourquoi une version. Accepter des CGV n'a de valeur que si l'on peut dire
// PLUS TARD quel texte a été accepté. Un site dont les CGV évoluent sans
// versionner ne peut rien opposer : le texte en ligne aujourd'hui n'est pas
// celui que le client a lu il y a six mois, et c'est celui-là qui l'engage.
//
// La version est donc enregistrée avec chaque acceptation (table
// `plan_cgv_acceptances`), et affichée en haut de la page /cgv pour que le
// client sache ce qu'il lit.
//
// RÈGLE : toute modification de fond du texte de /cgv incrémente cette date.
// Une correction de faute n'en est pas une ; un changement de prix, de durée,
// de responsabilité ou de rétractation en est une.
//
// UNE SEULE exception, et elle se vérifie avant de s'en servir : tant qu'AUCUNE
// acceptation n'a été enregistrée sur la version courante — ni commande
// (`plan_cgv_acceptances`), ni ouverture d'espace (`tenants.cgv_version`), ni
// demande en attente (`tenant_requests.cgv_version`) — le texte peut être
// amendé sous la même référence : il n'existe alors aucun consentement à
// distinguer d'un autre. Dès la première acceptation, l'exception se ferme.
//
// Elle a servi une fois, le 2026-09-04 : l'article 1 disait que les conditions
// s'appliquaient « à toute commande », alors qu'on venait de les faire accepter
// dès l'ouverture de l'espace. L'article 9 en héritait un défaut plus sérieux —
// il faisait courir les quatorze jours « à compter de la conclusion du
// contrat », ce qui, l'ouverture étant devenue contractuelle, aurait ouvert un
// délai de rétractation sur un service gratuit. Les trois compteurs étaient à
// zéro ; l'amendement s'est fait sous la même date.

/** Version des CGV en vigueur. Format ISO, c'est aussi sa date d'entrée en vigueur. */
export const CGV_VERSION = '2026-09-04';
