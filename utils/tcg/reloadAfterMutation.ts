// utils/tcg/reloadAfterMutation.ts
//
// Une mutation du TCG (acheter, ouvrir, recycler, proposer, accepter…) suivie
// d'une relecture de l'état — QUELLE QUE SOIT L'ISSUE. Module pur, testé
// (`tests/unit/tcgReloadAfterMutation.test.ts`).
//
// LA RÈGLE. Toute branche d'échec d'une mutation relit l'état serveur, `catch`
// compris. Un `catch` côté navigateur ne dit PAS que la mutation a échoué : il
// dit que la RÉPONSE n'est pas arrivée. Coupure réseau, onglet en veille,
// timeout d'un proxy — la transaction a très bien pu être validée avant.
//
// POURQUOI UN MODULE ET PAS TROIS `await load()`. Les pages TCG rechargeaient
// dans les branches `!res.ok` et succès, mais pas dans le `catch` : la joueuse
// voyait « erreur » avec un solde PÉRIMÉ, et recliquait « Acheter » — un second
// achat bien réel. Le même oubli existait à l'ouverture de paquet et sur les
// échanges. Une règle recopiée à chaque bouton finit oubliée au suivant ; ici
// la relecture ne dépend plus de la branche par laquelle on sort.
//
// ORDRE : le message d'erreur part AVANT la relecture (qui peut prendre une
// seconde), et une relecture qui échoue à son tour ne remonte pas — chaque
// `load` des pages gère déjà son propre échec (toast, écran d'erreur).

export async function reloadAfterMutation(
  mutate: () => Promise<void>,
  options: {
    /** Relit l'état serveur. Appelée une fois, après la mutation, toujours. */
    reload: () => Promise<unknown>;
    /** La réponse n'est pas arrivée (exception) : prévenir, sans conclure. */
    onError: (err: unknown) => void;
  }
): Promise<void> {
  try {
    await mutate();
  } catch (err) {
    options.onError(err);
  }
  try {
    await options.reload();
  } catch {
    // Cf. l'en-tête : l'échec de relecture a sa propre prise en charge.
  }
}
