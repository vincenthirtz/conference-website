// scripts/ts-extension-hooks.mjs
// Hook de résolution ESM : autorise les imports relatifs SANS extension
// (`./builder`, `./types`) quand on exécute directement du TypeScript avec le
// type-stripping natif de Node.
//
// WHY:
//   Le code applicatif est résolu par Next/webpack, qui accepte
//   `import x from './builder'`. Node ESM, lui, exige l'extension. Plutôt que
//   d'ajouter `.ts` partout dans le code de prod (ce qui imposerait
//   `allowImportingTsExtensions` à tout le repo), on rattrape l'échec de
//   résolution ici : c'est confiné aux scripts de build.
//
// Enregistré par scripts/register-ts.mjs, utilisé par `npm run maps:render`.

const CANDIDATES = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) throw error;
    for (const suffix of CANDIDATES) {
      try {
        return await nextResolve(specifier + suffix, context);
      } catch {
        // candidat suivant
      }
    }
    throw error;
  }
}
