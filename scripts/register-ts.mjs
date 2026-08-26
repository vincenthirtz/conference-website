// scripts/register-ts.mjs
// Point d'entrée `node --import ./scripts/register-ts.mjs <script.ts>`.
// Branche le hook de résolution qui complète les imports relatifs sans extension.

import { register } from 'node:module';

register('./ts-extension-hooks.mjs', import.meta.url);
