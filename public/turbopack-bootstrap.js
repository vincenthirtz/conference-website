// public/turbopack-bootstrap.js
//
// Next ≥ 16.4 écrit dans chaque page un script INLINE qui amorce la file de
// chargement de Turbopack. Les pages pré-rendues n'ont pas de nonce : notre
// CSP le refuserait et aucun JS ne démarrerait. pages/_document.tsx remplace
// ce script par celui-ci (même origine, permis par 'self') et lui passe les
// mêmes données en attributs. Voir utils/csp/turbopackBootstrap.ts.
//
// Toute modification change l'empreinte du fichier : mettre à jour
// TURBOPACK_BOOTSTRAP_VERSION (le test turbopackBootstrap.test.ts le rappelle).
(function () {
  var script = document.currentScript;
  if (!script) return;
  var name = script.getAttribute('data-global');
  var list = JSON.parse(script.getAttribute('data-params') || '[]');
  var queue = globalThis[name] || (globalThis[name] = []);
  for (var i = 0; i < list.length; i++) queue.push(list[i]);
})();
